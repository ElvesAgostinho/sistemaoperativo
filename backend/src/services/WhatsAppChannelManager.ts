import { supabase } from '../lib/supabaseClient';

export class WhatsAppChannelManager {
    /**
     * Envia uma mensagem física (texto) usando a API oficial da Meta ou Evolution
     */
    public static async sendMessage(channel_id: string, phone_number: string, content: string): Promise<string | boolean> {
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
        const apikey = process.env.AUTHENTICATION_API_KEY || 'lXNRduSBn1GY3f0me7JQJFkR2VTMfgCNo0TDUmchX6gedO0o9BOPjupThv0cwsKOXUXOfcJ1q7ahphpplBVd5bQDY1CXA69nHYY2n3JpeUpbPHApQb2tWrIuj3xOg5hMJhHED3U045Mj12vKpt81IuS9CLzBlUwUkG6EHY6qUeBa6QXNPNsrjsh9JXeMfyEapuStkhi6Llt8waNE1IRJjsXA6R4ga3gRgVWXFYt3B0giAb5WSZZXWu7lzAFPkBp8';

        if (!evolutionUrl || !apikey || !instanceName) {
            throw new Error('Configuração Evolution incompleta');
        }

        const url = `${evolutionUrl}/message/sendText/${instanceName}`;
        
        let formattedPhone = phone_number;
        if (!formattedPhone.includes('@lid')) {
            formattedPhone = formattedPhone.replace(/\D/g, '');
            if (formattedPhone.length === 9) {
                const defaultCountry = process.env.DEFAULT_COUNTRY_CODE || '244';
                formattedPhone = `${defaultCountry}${formattedPhone}`;
            }
        }

        const payload = {
            number: formattedPhone,
            options: {
                delay: 1200,
                presence: 'composing'
            },
            textMessage: {
                text: content
            },
            text: content // v2 compatibility
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

        if (data.key && data.key.id) {
            return data.key.id;
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

    public static async sendMediaMessage(channel_id: string, phone_number: string, base64Data: string, fileName: string): Promise<boolean> {
        try {
            const { data: channel } = await supabase.from('wa_channels').select('*').eq('id', channel_id).single();
            if (!channel) throw new Error('Canal não encontrado');

            // Formatar número de telefone
            let formattedPhone = phone_number.replace(/\D/g, '');
            if (formattedPhone.length === 9) {
                const defaultCountry = process.env.DEFAULT_COUNTRY_CODE || '244';
                formattedPhone = `${defaultCountry}${formattedPhone}`;
            }

            if (channel.provider === 'evolution') {
                const { apiUrl, apiKey, instanceName } = channel.credentials;
                // Em Evolution API v2 usa-se o endpoint genérico sendMedia
                const evolutionUrl = process.env.EVOLUTION_API_URL || apiUrl || 'https://evolution.topconsultores.pt';
                const apiK = process.env.AUTHENTICATION_API_KEY || apiKey || 'lXNRduSBn1GY3f0me7JQJFkR2VTMfgCNo0TDUmchX6gedO0o9BOPjupThv0cwsKOXUXOfcJ1q7ahphpplBVd5bQDY1CXA69nHYY2n3JpeUpbPHApQb2tWrIuj3xOg5hMJhHED3U045Mj12vKpt81IuS9CLzBlUwUkG6EHY6qUeBa6QXNPNsrjsh9JXeMfyEapuStkhi6Llt8waNE1IRJjsXA6R4ga3gRgVWXFYt3B0giAb5WSZZXWu7lzAFPkBp8';
                
                const endpoint = `${evolutionUrl}/message/sendMedia/${instanceName}`;
                
                // base64Data comes as "data:image/png;base64,iVBORw0K..."
                // Evolution API requires mimetype and base64 without the prefix
                const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (!matches || matches.length !== 3) {
                    throw new Error('Formato base64 inválido');
                }
                const mimetype = matches[1];
                const base64Str = matches[2];

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
                        'apikey': apiK,
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
