import nodemailer from 'nodemailer';
import { supabase } from '../lib/supabaseClient'; // Usamos o client admin para ler configs

export class EmailService {
    /**
     * Lê as configurações SMTP da base de dados.
     * Fallback para variáveis de ambiente (compatibilidade retroativa).
     */
    private static async getSmtpConfig(empresaId?: number): Promise<{ user: string; pass: string; host: string; port: number; secure: boolean; nome: string }> {
        try {
            let query = supabase.from('configuracoes_sistema').select('chave, valor').like('chave', 'smtp_%');
            if (empresaId) {
                query = query.eq('empresa_id', empresaId);
            } else {
                query = query.is('empresa_id', null);
            }
            
            const { data: rows, error } = await query;
            if (error) throw error;
            
            const cfg: Record<string, string> = {};
            (rows || []).forEach(r => { cfg[r.chave] = r.valor; });

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

    private static async createTransporter(empresaId?: number) {
        const { host, port, secure, user, pass } = await this.getSmtpConfig(empresaId);
        return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
    }

    public static async isConfigured(empresaId?: number): Promise<boolean> {
        const { user, pass } = await this.getSmtpConfig(empresaId);
        return !!(user && pass);
    }

    public static async testarConexao(empresaId?: number): Promise<{ ok: boolean; erro?: string }> {
        const configOK = await this.isConfigured(empresaId);
        if (!configOK) {
            return { ok: false, erro: 'Credenciais SMTP não configuradas. Configure em Definições > Email.' };
        }
        try {
            const transporter = await this.createTransporter(empresaId);
            await transporter.verify();
            return { ok: true };
        } catch (err: any) {
            return { ok: false, erro: err.message };
        }
    }

    public static async enviarEmailPersonalizado(para: string, assunto: string, corpo: string, empresaId?: number): Promise<boolean> {
        if (!para || para.trim() === '') return false;
        
        const configOK = await this.isConfigured(empresaId);
        if (!configOK) {
            console.error('[EmailService] SMTP não configurado.');
            return false;
        }
        
        const { user, nome } = await this.getSmtpConfig(empresaId);
        try {
            const transporter = await this.createTransporter(empresaId);
            const info = await transporter.sendMail({
                from: `"${nome}" <${user}>`,
                to: para,
                subject: assunto,
                html: corpo,
                text: corpo.replace(/<[^>]+>/g, '')
            });
            console.log(`[EmailService] Email enviado para ${para}: ${info.messageId}`);
            return true;
        } catch (error) {
            console.error(`[EmailService] Erro ao enviar email para ${para}:`, error);
            return false;
        }
    }

    public static async enviarRecibo(emailDestino: string, nomeFuncionario: string, mesAno: string, pdfPath: string, empresaId?: number): Promise<boolean> {
        const configOK = await this.isConfigured(empresaId);
        if (!configOK) return false;
        
        const { user, nome } = await this.getSmtpConfig(empresaId);
        try {
            const transporter = await this.createTransporter(empresaId);
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

    public static async notificarCandidatoAprovado(emailDestino: string, nomeCandidato: string, requisitosVaga: string, empresaId?: number): Promise<boolean> {
        if (!emailDestino) return false;
        
        const configOK = await this.isConfigured(empresaId);
        if (!configOK) return false;
        
        const { user, nome } = await this.getSmtpConfig(empresaId);
        try {
            const transporter = await this.createTransporter(empresaId);
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

    public static async enviarEmailBoasVindas(emailDestino: string, nomeFuncionario: string, empresaId?: number): Promise<boolean> {
        return this.enviarEmailPersonalizado(
            emailDestino,
            `Bem-vindo(a), ${nomeFuncionario}!`,
            `<p>Olá <strong>${nomeFuncionario}</strong>, seja bem-vindo(a) à equipa!</p>`,
            empresaId
        );
    }
}
