export class WhatsAppChannelManager {
    /**
     * Envia uma mensagem física (texto) usando a API oficial da Meta ou Evolution
     */
    public static async sendMessage(supabaseClient: any, channel_id: string, phone_number: string, content: string): Promise<string | boolean> {
        try {
            // Buscar credenciais do canal com cliente autenticado
            const { data: channel, error } = await supabaseClient.from('wa_channels').select('*').eq('id', channel_id).single();
            if (error || !channel) throw new Error(`Canal não encontrado (RLS ou ID inválido): ${error?.message || ''}`);

            if (channel.provider === 'meta') {
                return await this.sendMetaMessage(channel.credentials, phone_number, content);
            } else if (channel.provider === 'evolution') {
                return await this.sendEvolutionMessage(channel.credentials, phone_number, content);
            }

            return false;
        } catch (error: any) {
            console.error('[WhatsAppChannelManager] Erro ao enviar mensagem:', error);
            return `ERROR: ${error.message || String(error)}`;
        }
    }

    private static async sendMetaMessage(credentials: any, phone_number: string, content: string): Promise<string | boolean> {
        const { phoneNumberId, accessToken } = credentials;
        if (!phoneNumberId || !accessToken) throw new Error('Credenciais da Meta incompletas (falta phoneNumberId ou accessToken)');

        const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
        
        let formattedPhone = phone_number.replace(/\D/g, '');
        if (formattedPhone.length === 9) {
            const defaultCountry = process.env.DEFAULT_COUNTRY_CODE || '244';
            formattedPhone = `${defaultCountry}${formattedPhone}`;
        }

        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: formattedPhone,
            type: 'text',
            text: {
                preview_url: false,
                body: content
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
            console.error('[Meta API Error]', data);
            return false;
        }

        if (data.messages && data.messages.length > 0) {
            return data.messages[0].id;
        }

        return true;
    }

    private static async sendEvolutionMessage(credentials: any, phone_number: string, content: string): Promise<string | boolean> {
        const instanceName = credentials.instanceName;
        const evolutionUrl = process.env.EVOLUTION_API_URL || 'https://evolution.topconsultores.pt';
        const apikey = process.env.AUTHENTICATION_API_KEY || '';

        if (!evolutionUrl || !apikey || !instanceName) {
            throw new Error('Configuração Evolution incompleta');
        }

        const url = `${evolutionUrl}/message/sendText/${instanceName}`;
        
        // Normalizar número
        let formattedPhone = phone_number;
        if (!formattedPhone.includes('@lid')) {
            formattedPhone = formattedPhone.replace(/\D/g, '');
            if (formattedPhone.length === 9) {
                const defaultCountry = process.env.DEFAULT_COUNTRY_CODE || '244';
                formattedPhone = `${defaultCountry}${formattedPhone}`;
            }
        }

        // Compatibilidade Evolution v1 (textMessage.text) + v2 (text)
        // Enviamos ambos para garantir funcionamento em qualquer versão
        const payload = {
            number: formattedPhone,
            options: {
                delay: 1200,
                presence: 'composing'
            },
            textMessage: {
                text: content
            },
            text: content
        };

        console.log(`[Evolution sendText] URL: ${url} | Número: ${formattedPhone} | Mensagem: "${content.substring(0, 50)}"`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': apikey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        let data: any = {};
        try { data = await response.json(); } catch { data = {}; }

        if (!response.ok) {
            console.error('[Evolution sendText Error] Status:', response.status, '| Resposta:', JSON.stringify(data));
            return `ERROR: HTTP ${response.status} - ${JSON.stringify(data)}`;
        }

        console.log('[Evolution sendText OK] Resposta:', JSON.stringify(data).substring(0, 200));

        if (data.key?.id) return data.key.id;
        if (data.id) return data.id;
        return true;
    }

    public static async sendTemplateMessage(supabaseClient: any, channel_id: string, phone_number: string, template_name: string, language_code: string): Promise<boolean> {
        try {
            const { data: channel } = await supabaseClient.from('wa_channels').select('*').eq('id', channel_id).single();
            if (!channel || channel.provider !== 'meta') throw new Error('Canal inválido ou não é Meta');

            const { phoneNumberId, accessToken } = channel.credentials;
            const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
            
            let formattedPhone = phone_number.replace(/\D/g, '');
            if (formattedPhone.length === 9) {
                const defaultCountry = process.env.DEFAULT_COUNTRY_CODE || '244';
                formattedPhone = `${defaultCountry}${formattedPhone}`;
            }

            const payload = {
                messaging_product: 'whatsapp',
                to: formattedPhone,
                type: 'template',
                template: {
                    name: template_name,
                    language: {
                        code: language_code
                    }
                }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (!response.ok) {
                console.error('[Meta API Template Error]', data);
                return false;
            }
            return true;
        } catch (error) {
            console.error('[WhatsAppChannelManager] Erro ao enviar template:', error);
            return false;
        }
    }

    public static async sendMediaMessage(supabaseClient: any, channel_id: string, phone_number: string, base64Data: string, fileName: string, caption?: string): Promise<boolean> {
        try {
            const { data: channel } = await supabaseClient.from('wa_channels').select('*').eq('id', channel_id).single();
            if (!channel) throw new Error('Canal não encontrado');

            // Normalizar número
            let formattedPhone = phone_number.replace(/\D/g, '');
            if (formattedPhone.length === 9) {
                const defaultCountry = process.env.DEFAULT_COUNTRY_CODE || '244';
                formattedPhone = `${defaultCountry}${formattedPhone}`;
            }

            if (channel.provider === 'evolution') {
                const instanceName = channel.credentials?.instanceName;
                const evolutionUrl = process.env.EVOLUTION_API_URL || 'https://evolution.topconsultores.pt';
                const apiK = process.env.AUTHENTICATION_API_KEY || '';

                // FIX #6 — Evolution v2: mediaMessage payload correcto
                // Separar o prefixo data:mimetype;base64,... do dado puro
                const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (!matches || matches.length !== 3) {
                    throw new Error('Formato base64 inválido');
                }
                const mimetype = matches[1];
                const base64Str = matches[2];

                let mediatype = 'document';
                if (mimetype.startsWith('image/')) mediatype = 'image';
                else if (mimetype.startsWith('video/')) mediatype = 'video';
                else if (mimetype.startsWith('audio/')) mediatype = 'audio';

                const endpoint = `${evolutionUrl}/message/sendMedia/${instanceName}`;
                
                // Evolution API v2 payload (formato correcto verificado)
                const payload = {
                    number: formattedPhone,
                    options: { delay: 1200, presence: 'composing' },
                    mediaMessage: {
                        mediatype,
                        mimetype,
                        caption: (mediatype !== 'audio' && caption) ? caption : '',
                        fileName,
                        media: base64Str   // base64 puro SEM o prefixo data:...
                    }
                };

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'apikey': apiK, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();
                if (!response.ok) {
                    console.error('[Evolution API Media Error]', JSON.stringify(data));
                    return false;
                }
                return true;

            } else if (channel.provider === 'meta') {
                // Para Meta: upload multipart/form-data para /media e depois enviar por URL
                const { phoneNumberId, accessToken } = channel.credentials;
                const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (!matches) return false;
                const [, mimeType, b64Str] = matches;

                // 1. Upload do ficheiro para a Meta
                const formData = new FormData();
                const byteArray = Uint8Array.from(atob(b64Str), c => c.charCodeAt(0));
                const blob = new Blob([byteArray], { type: mimeType });
                formData.append('file', blob, fileName);
                formData.append('type', mimeType);
                formData.append('messaging_product', 'whatsapp');

                const uploadRes = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/media`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${accessToken}` },
                    body: formData
                });
                const uploadData = await uploadRes.json();
                if (!uploadRes.ok || !uploadData.id) {
                    console.error('[Meta Upload Error]', uploadData);
                    return false;
                }

                // 2. Enviar mensagem com media_id
                let mediaType = 'document';
                if (mimeType.startsWith('image/')) mediaType = 'image';
                else if (mimeType.startsWith('video/')) mediaType = 'video';
                else if (mimeType.startsWith('audio/')) mediaType = 'audio';

                const msgPayload: any = {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: formattedPhone,
                    type: mediaType,
                    [mediaType]: {
                        id: uploadData.id,
                        ...(mediaType !== 'audio' && caption ? { caption } : {})
                    }
                };

                const msgRes = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(msgPayload)
                });
                const msgData = await msgRes.json();
                if (!msgRes.ok) {
                    console.error('[Meta Message Error]', msgData);
                    return false;
                }
                return true;
            }

            return false;
        } catch (error) {
            console.error('[WhatsAppChannelManager] Erro ao enviar mídia:', error);
            return false;
        }
    }
}
