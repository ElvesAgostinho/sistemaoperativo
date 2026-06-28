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
}
