import { supabase } from '../lib/supabaseClient';

export class WhatsAppChannelManager {
    /**
     * Envia uma mensagem física (texto) usando a API oficial da Meta ou Evolution
     */
    public static async sendMessage(channel_id: string, phone_number: string, content: string): Promise<boolean> {
        try {
            // Buscar credenciais do canal
            const { data: channel } = await supabase.from('wa_channels').select('*').eq('id', channel_id).single();
            if (!channel) throw new Error('Canal não encontrado');

            if (channel.provider === 'meta') {
                return await this.sendMetaMessage(channel.credentials, phone_number, content);
            } else if (channel.provider === 'evolution') {
                return await this.sendEvolutionMessage(channel.credentials, phone_number, content);
            }

            return false;
        } catch (error) {
            console.error('[WhatsAppChannelManager] Erro ao enviar mensagem:', error);
            return false;
        }
    }

    private static async sendMetaMessage(credentials: any, phone_number: string, content: string): Promise<boolean> {
        const { phoneNumberId, accessToken } = credentials;
        if (!phoneNumberId || !accessToken) throw new Error('Credenciais da Meta incompletas (falta phoneNumberId ou accessToken)');

        const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
        
        let formattedPhone = phone_number.replace(/\D/g, '');
        if (formattedPhone.length === 9) {
            formattedPhone = `351${formattedPhone}`;
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

        return true;
    }

    private static async sendEvolutionMessage(credentials: any, phone_number: string, content: string): Promise<boolean> {
        const instanceName = credentials.instanceName;
        const evolutionUrl = process.env.EVOLUTION_API_URL;
        const apikey = process.env.AUTHENTICATION_API_KEY;

        if (!evolutionUrl || !apikey || !instanceName) {
            throw new Error('Configuração Evolution incompleta');
        }

        const url = `${evolutionUrl}/message/sendText/${instanceName}`;
        
        let formattedPhone = phone_number.replace(/\D/g, '');
        if (formattedPhone.length === 9) {
            formattedPhone = `351${formattedPhone}`;
        }

        const payload = {
            number: formattedPhone,
            options: {
                delay: 1200,
                presence: 'composing'
            },
            text: content
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': apikey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
            console.error('[Evolution API Error]', data);
            return false;
        }

        return true;
    }

    public static async sendTemplateMessage(channel_id: string, phone_number: string, template_name: string, language_code: string): Promise<boolean> {
        try {
            const { data: channel } = await supabase.from('wa_channels').select('*').eq('id', channel_id).single();
            if (!channel || channel.provider !== 'meta') throw new Error('Canal inválido ou não é Meta');

            const { phoneNumberId, accessToken } = channel.credentials;
            const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
            
            let formattedPhone = phone_number.replace(/\D/g, '');
            if (formattedPhone.length === 9) {
                formattedPhone = `351${formattedPhone}`;
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

    public static async sendMediaMessage(channel_id: string, phone_number: string, base64Data: string, fileName: string): Promise<boolean> {
        try {
            const { data: channel } = await supabase.from('wa_channels').select('*').eq('id', channel_id).single();
            if (!channel) throw new Error('Canal não encontrado');

            // Formatar número de telefone
            let formattedPhone = phone_number.replace(/\D/g, '');
            if (formattedPhone.length === 9) {
                formattedPhone = `351${formattedPhone}`;
            }

            if (channel.provider === 'evolution') {
                const { apiUrl, apiKey, instanceName } = channel.credentials;
                const endpoint = `${apiUrl}/message/sendMediaBase64/${instanceName}`;
                
                // base64Data comes as "data:image/png;base64,iVBORw0K..."
                // Evolution API requires mimetype and base64 without the prefix
                const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (!matches || matches.length !== 3) {
                    throw new Error('Formato base64 inválido');
                }
                const mimetype = matches[1];
                const base64Str = matches[2];

                // Mapear mimetype para mediatype suportado pela Evolution API (image, video, audio, document)
                let mediaType = 'document';
                if (mimetype.startsWith('image/')) mediaType = 'image';
                if (mimetype.startsWith('video/')) mediaType = 'video';
                if (mimetype.startsWith('audio/')) mediaType = 'audio';

                const payload = {
                    number: formattedPhone,
                    options: {
                        delay: 1200,
                        presence: 'composing'
                    },
                    mediaMessage: {
                        mediatype: mediaType,
                        fileName: fileName,
                        media: base64Str
                    }
                };

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'apikey': apiKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();
                if (!response.ok) {
                    console.error('[Evolution API Media Error]', data);
                    return false;
                }
                return true;

            } else if (channel.provider === 'meta') {
                // Para Meta API, o ideal seria fazer upload para o endpoint /media com form-data
                // e usar o ID retornado. Pela complexidade do multipart/form-data em Node puro com fetch,
                // vamos levantar um erro claro se for Meta por enquanto, 
                // a menos que alojemos o ficheiro num Storage e enviemos a URL.
                console.error('[Meta API] Envio de mídia direta por Base64 ainda não suportado nativamente. Requer Storage URL ou Multipart form-data.');
                return false;
            }

            return false;
        } catch (error) {
            console.error('[WhatsAppChannelManager] Erro ao enviar mídia:', error);
            return false;
        }
    }
}
