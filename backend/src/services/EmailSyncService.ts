import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import { supabase } from '../lib/supabaseClient';
import { EmailService } from './EmailService';

export class EmailSyncService {
    /**
     * Sincroniza emails da Caixa de Entrada para uma empresa específica
     */
    public static async syncInbox(empresaId: string): Promise<number> {
        try {
            // Obter configurações SMTP (normalmente IMAP usa as mesmas credenciais da Hostinger)
            const config = await (EmailService as any).getSmtpConfig(empresaId, supabase);
            
            if (!config.user || !config.pass) {
                console.log(`[EmailSync] Sem credenciais para empresa ${empresaId}`);
                return 0;
            }

            // Mapear smtp.hostinger.com para imap.hostinger.com (por defeito)
            let imapHost = config.host;
            if (imapHost.includes('smtp.')) {
                imapHost = imapHost.replace('smtp.', 'imap.');
            }

            const imapConfig = {
                imap: {
                    user: config.user,
                    password: config.pass,
                    host: imapHost,
                    port: 993,
                    tls: true,
                    tlsOptions: { rejectUnauthorized: false },
                    authTimeout: 10000
                }
            };

            const connection = await imaps.connect(imapConfig);
            await connection.openBox('INBOX');

            // Continua de onde ficou (UID da última mensagem tratada). Antes procurava só
            // "UNSEEN" e marcava como lida: um email aberto no telemóvel antes da
            // sincronização nunca entrava, e o estado lido/não lido do utilizador era
            // alterado pelo sistema. Sem UID guardado, vai buscar os últimos 3 dias.
            const ultimoUid = await this.lerUltimoUid(empresaId);
            const searchCriteria: any[] = ultimoUid > 0
                ? [['UID', `${ultimoUid + 1}:*`]]
                : [['SINCE', new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()]];

            const fetchOptions = {
                bodies: ['HEADER', 'TEXT', ''],
                markSeen: false
            };

            const messages = await connection.search(searchCriteria, fetchOptions);
            let addedCount = 0;
            let maiorUid = ultimoUid;

            for (const item of messages) {
                try {
                    const uid = Number(item.attributes?.uid || 0);
                    // O IMAP devolve sempre a última mensagem para "N:*" mesmo que N seja maior; ignora-se o que já foi visto.
                    if (ultimoUid > 0 && uid <= ultimoUid) continue;
                    if (uid > maiorUid) maiorUid = uid;
                    const all = item.parts.find((p: any) => p.which === '');
                    if (!all) continue;
                    
                    const parsed = await simpleParser(all.body);
                    
                    const messageId = parsed.messageId || String(item.attributes.uid);
                    
                    // Verificar se já existe (filtrar por empresa para evitar colisões entre tenants)
                    const { data: exists } = await supabase.from('emails')
                        .select('id').eq('message_id', messageId).eq('empresa_id', empresaId).single();
                        
                    if (exists) {
                        // Já estava registado (ex.: sincronizado antes do módulo Documentos existir): ainda assim garante os anexos.
                        await this.capturarAnexosParaDocumentos(empresaId, messageId, parsed.from?.value[0]?.address || '', parsed.subject || '', parsed.attachments || []);
                        continue;
                    }

                    const from = parsed.from?.value[0]?.address || '';
                    const to = Array.isArray(parsed.to) ? parsed.to.map(t => t.text).join(', ') : parsed.to?.text || '';
                    
                    await supabase.from('emails').insert({
                        empresa_id: empresaId,
                        direcao: 'inbox',
                        message_id: messageId,
                        de: from,
                        para: to,
                        assunto: parsed.subject || '(Sem assunto)',
                        corpo_html: parsed.html || '',
                        corpo_texto: parsed.text || '',
                        lido: false,
                        data_envio: parsed.date ? parsed.date.toISOString() : new Date().toISOString()
                    });
                    addedCount++;

                    await this.capturarAnexosParaDocumentos(empresaId, messageId, from, parsed.subject || '', parsed.attachments || []);
                } catch (err) {
                    console.error('[EmailSync] Erro a processar mensagem', err);
                }
            }

            connection.end();
            if (maiorUid > ultimoUid) await this.guardarUltimoUid(empresaId, maiorUid);
            return addedCount;
        } catch (error: any) {
            console.error(`[EmailSync] Erro a sincronizar empresa ${empresaId}:`, error.message);
            return 0;
        }
    }

    private static async lerUltimoUid(empresaId: string): Promise<number> {
        try {
            const { data } = await supabase.from('configuracoes').select('valor').eq('empresa_id', empresaId).eq('chave', 'email_sync_ultimo_uid').maybeSingle();
            return Number(data?.valor || 0) || 0;
        } catch { return 0; }
    }
    private static async guardarUltimoUid(empresaId: string, uid: number) {
        try {
            await supabase.from('configuracoes').delete().eq('empresa_id', empresaId).eq('chave', 'email_sync_ultimo_uid');
            await supabase.from('configuracoes').insert({ empresa_id: empresaId, chave: 'email_sync_ultimo_uid', valor: String(uid) });
        } catch (e: any) { console.error('[EmailSync] Não guardou o último UID:', e.message); }
    }

    /**
     * Porta de entrada automática do módulo de Documentos: cada anexo que chega
     * na caixa de entrada vai para a fila de leitura por IA. Só para empresas
     * com o módulo contratado e com a captura por email ligada. Nunca faz
     * falhar a sincronização do email em si.
     */
    private static async capturarAnexosParaDocumentos(empresaId: string, messageId: string, remetente: string, assunto: string, anexos: any[]) {
        try {
            // Alguns clientes de email marcam PDFs como "inline": o que decide é o conteúdo, não a disposição.
            const uteis = anexos.filter(a => a?.content && a.content.length > 0 && !this.ehAnexoIrrelevante(a));
            if (uteis.length === 0) return;

            const { DocumentosService } = require('./DocumentosService');
            if (!(await DocumentosService.empresaTemModulo(empresaId))) return;
            if (!(await DocumentosService.capturaAtiva(empresaId, 'email'))) return;

            // Se o remetente for um cliente registado, o documento nasce já ligado a ele.
            let ligacao: any = null;
            if (remetente) {
                const { data: cli } = await supabase.from('clientes').select('id, nome').eq('empresa_id', empresaId).ilike('email', remetente).limit(1).maybeSingle();
                if (cli) ligacao = { entidade_tipo: 'cliente', entidade_id: String(cli.id), entidade_nome: cli.nome };
            }

            for (const a of uteis) {
                try {
                    const r = await DocumentosService.receber({
                        empresaId, buffer: a.content, nomeFicheiro: a.filename || this.nomePorTipo(a.contentType), mimeType: a.contentType || 'application/octet-stream',
                        origem: 'email', origemRef: messageId, origemDetalhe: `${remetente}${assunto ? ` — ${assunto}` : ''}`.slice(0, 300)
                    });
                    if (ligacao && !r.duplicado) await supabase.from('documentos').update(ligacao).eq('id', r.id).eq('empresa_id', empresaId);
                } catch (e: any) {
                    console.error('[EmailSync] Anexo não arquivado:', a.filename, e.message);
                }
            }
        } catch (e: any) {
            console.error('[EmailSync] Falha a capturar anexos para Documentos:', e.message);
        }
    }

    private static nomePorTipo(tipo?: string): string {
        const t = String(tipo || '').toLowerCase();
        return t.includes('pdf') ? 'anexo.pdf' : t.includes('png') ? 'anexo.png' : t.includes('jpeg') || t.includes('jpg') ? 'anexo.jpg' : t.includes('word') ? 'anexo.docx' : t.includes('sheet') || t.includes('excel') ? 'anexo.xlsx' : 'anexo';
    }

    // Imagens embutidas na assinatura, ícones e afins: nunca são documentos.
    private static ehAnexoIrrelevante(a: any): boolean {
        const nome = String(a.filename || '').toLowerCase();
        const tipo = String(a.contentType || '').toLowerCase();
        // Só interessa o que a IA consegue ler: PDF, imagens, Word, Excel, texto.
        const legivel = /pdf|image\/|word|officedocument|excel|sheet|csv|text\/plain|markdown/.test(tipo) || /\.(pdf|png|jpe?g|webp|tiff?|docx?|xlsx?|csv|txt|md)$/.test(nome);
        if (!legivel) return true;
        if (a.related || (a.cid && tipo.startsWith('image/'))) return true; // referenciado no HTML (assinatura/logótipo)
        if (tipo.startsWith('image/') && (a.size || a.content?.length || 0) < 25 * 1024) return true;
        if (/\.(ics|vcf|p7s|asc|sig)$/.test(nome) || tipo.includes('calendar') || tipo.includes('pkcs7')) return true;
        return false;
    }

    /**
     * Sincroniza emails de todas as empresas (a correr num Cron Job)
     */
    public static async syncAll() {
        console.log('[EmailSync] A iniciar sincronização global...');
        try {
            // Sincronizar apenas empresas reais (ativas)
            const { data: empresas } = await supabase.from('empresas').select('id').eq('status', 'active');
            if (empresas) {
                for (const emp of empresas) {
                    await this.syncInbox(emp.id);
                }
            }
            console.log(`[EmailSync] Sincronização global concluída. ${empresas?.length || 0} empresas processadas.`);
        } catch (err) {
            console.error('[EmailSync] Erro na sincronização global:', err);
        }
    }
}
