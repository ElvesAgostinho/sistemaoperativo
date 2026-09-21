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

            // Procurar emails dos últimos 3 dias
            const delay = 3 * 24 * 3600 * 1000;
            const yesterday = new Date(Date.now() - delay);
            const searchCriteria = ['UNSEEN', ['SINCE', yesterday.toISOString()]];
            
            const fetchOptions = {
                bodies: ['HEADER', 'TEXT', ''],
                markSeen: true
            };

            const messages = await connection.search(searchCriteria, fetchOptions);
            let addedCount = 0;

            for (const item of messages) {
                try {
                    const all = item.parts.find((p: any) => p.which === '');
                    if (!all) continue;
                    
                    const parsed = await simpleParser(all.body);
                    
                    const messageId = parsed.messageId || String(item.attributes.uid);
                    
                    // Verificar se já existe (filtrar por empresa para evitar colisões entre tenants)
                    const { data: exists } = await supabase.from('emails')
                        .select('id').eq('message_id', messageId).eq('empresa_id', empresaId).single();
                        
                    if (exists) continue;

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
            return addedCount;
        } catch (error: any) {
            console.error(`[EmailSync] Erro a sincronizar empresa ${empresaId}:`, error.message);
            return 0;
        }
    }

    /**
     * Porta de entrada automática do módulo de Documentos: cada anexo que chega
     * na caixa de entrada vai para a fila de leitura por IA. Só para empresas
     * com o módulo contratado e com a captura por email ligada. Nunca faz
     * falhar a sincronização do email em si.
     */
    private static async capturarAnexosParaDocumentos(empresaId: string, messageId: string, remetente: string, assunto: string, anexos: any[]) {
        try {
            const uteis = anexos.filter(a => a?.content && a.content.length > 0 && a.contentDisposition !== 'inline' && !this.ehAnexoIrrelevante(a));
            if (uteis.length === 0) return;

            const { DocumentosService } = require('./DocumentosService');
            if (!(await DocumentosService.empresaTemModulo(empresaId))) return;
            if (!(await DocumentosService.capturaAtiva(empresaId, 'email'))) return;

            for (const a of uteis) {
                await DocumentosService.receber({
                    empresaId, buffer: a.content, nomeFicheiro: a.filename || 'anexo', mimeType: a.contentType || 'application/octet-stream',
                    origem: 'email', origemRef: messageId, origemDetalhe: `${remetente}${assunto ? ` — ${assunto}` : ''}`.slice(0, 300)
                }).catch((e: any) => console.error('[EmailSync] Anexo não arquivado:', a.filename, e.message));
            }
        } catch (e: any) {
            console.error('[EmailSync] Falha a capturar anexos para Documentos:', e.message);
        }
    }

    // Imagens embutidas na assinatura, ícones e afins: nunca são documentos.
    private static ehAnexoIrrelevante(a: any): boolean {
        const nome = String(a.filename || '').toLowerCase();
        const tipo = String(a.contentType || '').toLowerCase();
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
