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
                    
                    // Verificar se já existe
                    const { data: exists } = await supabase.from('emails')
                        .select('id').eq('message_id', messageId).single();
                        
                    if (exists) continue;

                    const from = parsed.from?.value[0]?.address || '';
                    const to = Array.isArray(parsed.to) ? parsed.to.map(t => t.text).join(', ') : parsed.to?.text || '';
                    
                    await supabase.from('emails').insert({
                        empresa_id: empresaId === 'mock-empresa-1' ? null : empresaId,
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
     * Sincroniza emails de todas as empresas (a correr num Cron Job)
     */
    public static async syncAll() {
        console.log('[EmailSync] A iniciar sincronização global...');
        try {
            const { data: empresas } = await supabase.from('empresas').select('id');
            if (empresas) {
                for (const emp of empresas) {
                    await this.syncInbox(emp.id);
                }
            }
            // Sincronizar também o superadmin (empresa null) - usa configurações gerais
            await this.syncInbox('mock-empresa-1');
            console.log('[EmailSync] Sincronização global concluída.');
        } catch (err) {
            console.error('[EmailSync] Erro na sincronização global:', err);
        }
    }
}
