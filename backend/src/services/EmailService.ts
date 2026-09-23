import nodemailer from 'nodemailer';
import { supabase } from '../lib/supabaseClient'; // Usamos o client admin para ler configs

export class EmailService {
    /**
     * Lê as configurações SMTP da base de dados.
     * Fallback para variáveis de ambiente (compatibilidade retroativa).
     */
    private static async getSmtpConfig(empresaId?: number | string, userClient?: any): Promise<{ user: string; pass: string; host: string; port: number; secure: boolean; nome: string }> {
        try {
            let cfg: Record<string, string> = {};
            
            // Ler configurações SMTP da BD, filtradas por empresa_id
            {
                const client = userClient || supabase;
                let query = client.from('configuracoes').select('chave, valor').like('chave', 'smtp_%');
                if (empresaId) {
                    query = query.eq('empresa_id', empresaId);
                } else {
                    query = query.is('empresa_id', null);
                }
                
                const { data: rows, error } = await query;
                if (error) throw error;
                (rows || []).forEach((r: any) => { cfg[r.chave] = r.valor; });
            }

            return {
                host:   cfg['smtp_host']   || 'smtp.gmail.com',
                port:   parseInt(cfg['smtp_port'] || '587'),
                secure: (cfg['smtp_secure'] || 'false') === 'true',
                user:   cfg['smtp_user']   || process.env.EMAIL_USER || '',
                pass:   cfg['smtp_pass']   || process.env.EMAIL_PASS || '',
                nome:   cfg['smtp_nome']   || cfg['smtp_user'] || 'BusinessOS',
            };
        } catch {
            return {
                host: 'smtp.gmail.com', port: 587, secure: false,
                user: process.env.EMAIL_USER || '',
                pass: process.env.EMAIL_PASS || '',
                nome: 'BusinessOS',
            };
        }
    }

    private static async createTransporter(empresaId?: string | number, userClient?: any) {
        const { host, port, secure, user, pass } = await this.getSmtpConfig(empresaId, userClient);
        return nodemailer.createTransport({ 
            host, 
            port, 
            secure, 
            auth: { user, pass },
            tls: { rejectUnauthorized: false }
        });
    }

    public static async isConfigured(empresaId?: string | number, userClient?: any): Promise<boolean> {
        const { user, pass } = await this.getSmtpConfig(empresaId, userClient);
        return !!(user && pass);
    }

    public static async testarConexao(empresaId?: number | string, userClient?: any): Promise<{ ok: boolean; erro?: string; debug?: any }> {
        const configOK = await this.isConfigured(empresaId as any, userClient);
        if (!configOK) {
            return { ok: false, erro: 'Credenciais SMTP não configuradas. Configure em Definições > Email.' };
        }
        const cfg = await this.getSmtpConfig(empresaId as any, userClient);
        try {
            const transporter = nodemailer.createTransport({
                host: cfg.host,
                port: cfg.port,
                secure: cfg.secure,
                auth: { user: cfg.user, pass: cfg.pass },
                tls: { rejectUnauthorized: false } // Para lidar com potenciais problemas de certificados
            });
            await transporter.verify();
            return { ok: true };
        } catch (err: any) {
            const safeCfg = { ...cfg, pass: '***' };
            console.error('[EmailService] SMTP Test Error:', err, 'Config:', safeCfg);
            return { ok: false, erro: err.message, debug: { error: err.toString(), config: safeCfg } };
        }
    }

    public static async enviarEmailPersonalizado(
        para: string, assunto: string, corpo: string,
        empresaId?: string | number, userClient?: any,
        // Uma campanha manda milhares de emails: guardar cada um na caixa de
        // "Enviados" enchia-a de copias da mesma mensagem. Por isso o registo e
        // opcional — a campanha tem a sua propria lista de destinatarios.
        opcoes?: { cc?: string; bcc?: string; anexos?: any[]; anexosGuardados?: any[]; registarNaCaixa?: boolean; campanhaId?: string }
    ): Promise<boolean> {
        if (!para || para.trim() === '') return false;

        const configOK = await this.isConfigured(empresaId, userClient);
        if (!configOK) {
            console.error('[EmailService] SMTP nao configurado.');
            return false;
        }

        const { user, nome } = await this.getSmtpConfig(empresaId, userClient);
        try {
            const transporter = await this.createTransporter(empresaId, userClient);
            const info = await transporter.sendMail({
                from: `"${nome}" <${user}>`,
                to: para,
                cc: opcoes?.cc || undefined,
                bcc: opcoes?.bcc || undefined,
                subject: assunto,
                html: corpo,
                text: corpo.replace(/<[^>]+>/g, ''),
                attachments: opcoes?.anexos?.length ? opcoes.anexos : undefined
            });
            console.log(`[EmailService] Email enviado para ${para}: ${info.messageId}`);

            if (opcoes?.registarNaCaixa !== false) {
                try {
                    const client = userClient || supabase;
                    await client.from('emails').insert({
                        empresa_id: empresaId || null,
                        direcao: 'sent',
                        message_id: info.messageId,
                        de: `"${nome}" <${user}>`,
                        para: para,
                        cc: opcoes?.cc || null,
                        bcc: opcoes?.bcc || null,
                        assunto: assunto,
                        corpo_html: corpo,
                        corpo_texto: corpo.replace(/<[^>]+>/g, ''),
                        anexos: opcoes?.anexosGuardados || [],
                        campanha_id: opcoes?.campanhaId || null,
                        lido: true,
                        data_envio: new Date().toISOString()
                    });
                } catch(e) {
                    console.error('[EmailService] Falha ao guardar na BD', e);
                }
            }

            return true;
        } catch (error) {
            console.error(`[EmailService] Erro ao enviar email para ${para}:`, error);
            return false;
        }
    }

    /**
     * Envia com anexos que ja estao guardados no Storage (links). E o caminho das
     * campanhas e do "Compor" com ficheiros: o ficheiro e carregado uma vez e
     * depois so se passa o link, em vez de arrastar o conteudo a cada envio.
     */
    /**
     * Cache do conteudo dos anexos enquanto uma campanha esta a correr. Sem isto,
     * uma campanha com um PDF de 5 MB para 2000 pessoas descarregava o mesmo
     * ficheiro 2000 vezes do Storage.
     */
    private static readonly cacheAnexos = new Map<string, { buffer: Buffer; ate: number }>();

    private static async conteudoDoAnexo(caminho: string): Promise<Buffer> {
        const agora = Date.now();
        const guardado = this.cacheAnexos.get(caminho);
        if (guardado && guardado.ate > agora) return guardado.buffer;

        const { MediaUploadService } = require('./MediaUploadService');
        const buffer = await MediaUploadService.descarregarDocumento(caminho);
        this.cacheAnexos.set(caminho, { buffer, ate: agora + 10 * 60 * 1000 });
        // Limpeza simples: o que ja passou do prazo sai, para a memoria nao crescer
        // indefinidamente num servidor que nunca reinicia.
        for (const [k, v] of this.cacheAnexos) if (v.ate <= agora) this.cacheAnexos.delete(k);
        return buffer;
    }

    public static async enviarComAnexosDeLinks(
        para: string, assunto: string, corpoHtml: string,
        anexos: { nome: string; caminho?: string; url?: string; tipo?: string }[],
        empresaId?: string | number,
        opcoes?: { cc?: string; bcc?: string; registarNaCaixa?: boolean; campanhaId?: string; userClient?: any }
    ): Promise<{ ok: boolean; erro?: string }> {
        const anexosNodemailer: any[] = [];
        for (const a of (anexos || [])) {
            if (!a?.nome) continue;
            try {
                // Guardados no bucket privado: o conteudo e buscado aqui, porque um
                // link assinado expirava a meio de uma campanha demorada.
                if (a.caminho) anexosNodemailer.push({ filename: a.nome, content: await this.conteudoDoAnexo(a.caminho), contentType: a.tipo || undefined });
                else if (a.url) anexosNodemailer.push({ filename: a.nome, path: a.url, contentType: a.tipo || undefined });
            } catch (e: any) {
                console.error(`[EmailService] Nao foi possivel ler o anexo "${a.nome}":`, e?.message || e);
                return { ok: false, erro: `nao foi possivel ler o anexo "${a.nome}"` };
            }
        }
        const ok = await this.enviarEmailPersonalizado(para, assunto, corpoHtml, empresaId, opcoes?.userClient, {
            cc: opcoes?.cc, bcc: opcoes?.bcc,
            anexos: anexosNodemailer,
            anexosGuardados: anexos,
            registarNaCaixa: opcoes?.registarNaCaixa,
            campanhaId: opcoes?.campanhaId
        });
        return ok ? { ok: true } : { ok: false, erro: 'o servidor de correio nao aceitou a mensagem' };
    }

    /** Envia um email com anexos em memória (usado pelo módulo de Documentos). */
    public static async enviarComAnexos(para: string, assunto: string, corpoHtml: string, anexos: { filename: string; content: Buffer; contentType?: string }[], empresaId?: string | number): Promise<{ ok: boolean; erro?: string }> {
        if (!para || !para.trim()) return { ok: false, erro: 'Indique o destinatário.' };
        if (!(await this.isConfigured(empresaId))) return { ok: false, erro: 'O email da empresa ainda não está configurado (Email → Definições).' };
        const { user, nome } = await this.getSmtpConfig(empresaId);
        try {
            const transporter = await this.createTransporter(empresaId);
            const info = await transporter.sendMail({ from: `"${nome}" <${user}>`, to: para, subject: assunto, html: corpoHtml, text: corpoHtml.replace(/<[^>]+>/g, ''), attachments: anexos });
            try {
                await supabase.from('emails').insert({
                    empresa_id: empresaId || null, direcao: 'sent', message_id: info.messageId, de: `"${nome}" <${user}>`, para, assunto,
                    corpo_html: corpoHtml + `<p style="color:#888;font-size:12px">Anexos: ${anexos.map(a => a.filename).join(', ')}</p>`, corpo_texto: corpoHtml.replace(/<[^>]+>/g, ''), lido: true, data_envio: new Date().toISOString()
                });
            } catch (e) { console.error('[EmailService] Falha ao guardar na BD', e); }
            return { ok: true };
        } catch (error: any) {
            console.error(`[EmailService] Erro ao enviar email com anexos para ${para}:`, error);
            return { ok: false, erro: error.message };
        }
    }

    public static async enviarRecibo(emailDestino: string, nomeFuncionario: string, mesAno: string, pdfPath: string, empresaId?: string | number, userClient?: any): Promise<boolean> {
        const configOK = await this.isConfigured(empresaId, userClient);
        if (!configOK) return false;
        
        const { user, nome } = await this.getSmtpConfig(empresaId, userClient);
        try {
            const transporter = await this.createTransporter(empresaId, userClient);
            await transporter.sendMail({
                from: `"${nome} RH" <${user}>`,
                to: emailDestino,
                subject: `Recibo de Vencimento - ${mesAno}`,
                html: `<div style="font-family:Arial,sans-serif"><h2>Olá ${nomeFuncionario},</h2><p>Segue em anexo o recibo de vencimento de <strong>${mesAno}</strong>.</p></div>`,
                attachments: [{ filename: `Recibo_${mesAno.replace('/', '_')}.pdf`, path: pdfPath }]
            });
            return true;
        } catch (error) {
            console.error(`[EmailService] Erro recibo para ${emailDestino}:`, error);
            return false;
        }
    }

    public static async notificarCandidatoAprovado(emailDestino: string, nomeCandidato: string, requisitosVaga: string, empresaId?: string | number, userClient?: any): Promise<boolean> {
        if (!emailDestino) return false;
        
        const configOK = await this.isConfigured(empresaId, userClient);
        if (!configOK) return false;
        
        const { user, nome } = await this.getSmtpConfig(empresaId, userClient);
        try {
            const transporter = await this.createTransporter(empresaId, userClient);
            await transporter.sendMail({
                from: `"${nome} Recrutamento" <${user}>`,
                to: emailDestino,
                subject: `Parabéns! Avançou para a próxima fase do Recrutamento`,
                html: `<div style="font-family:Arial,sans-serif"><h2>Olá ${nomeCandidato},</h2><p>O seu perfil foi selecionado para a vaga: <em>${requisitosVaga}</em>.</p><p>Em breve entraremos em contacto.</p></div>`
            });
            return true;
        } catch (error) {
            console.error(`[EmailService] Erro recrutamento para ${emailDestino}:`, error);
            return false;
        }
    }

    public static async enviarEmailBoasVindas(emailDestino: string, nomeFuncionario: string, empresaId?: string | number, userClient?: any): Promise<boolean> {
        return this.enviarEmailPersonalizado(
            emailDestino,
            `Bem-vindo(a), ${nomeFuncionario}!`,
            `<p>Olá <strong>${nomeFuncionario}</strong>, seja bem-vindo(a) à equipa!</p>`,
            empresaId,
            userClient
        );
    }
}
