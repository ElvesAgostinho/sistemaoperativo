const MIME_POR_EXTENSAO: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', avi: 'video/x-msvideo',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
    pdf: 'application/pdf', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain', csv: 'text/csv', zip: 'application/zip'
};

export class WhatsAppChannelManager {

    /**
     * O canal de WhatsApp desta empresa, para quem precisa de enviar sem ter um
     * ecrã aberto (fluxos do Autopilot, confirmações de marcação, avisos).
     *
     * A coluna `status` só é acertada quando alguém abre a página do WhatsApp e o
     * servidor vai perguntar à Evolution. Ou seja: o telefone pode estar ligado há
     * dias e a coluna ainda dizer "disconnected" — e era por isso que avisos e
     * confirmações desapareciam em silêncio, de madrugada, sem ninguém perceber.
     * Por isso aqui a regra é: preferir um canal marcado como ligado, mas se não
     * houver nenhum, tentar na mesma pelo canal que existe. Quem decide se dá ou
     * não é a tentativa de envio, não uma coluna desatualizada.
     */
    public static async canalDaEmpresa(supabaseClient: any, empresaId: string | number | null): Promise<any | null> {
        if (!empresaId) return null;   // sem empresa não se escolhe canal nenhum (seria falar pelo número de outro cliente)
        const { data } = await supabaseClient.from('wa_channels')
            .select('id, status, provider').eq('empresa_id', empresaId);
        const canais: any[] = Array.isArray(data) ? data : (data ? [data] : []);
        if (!canais.length) return null;
        return canais.find(c => c.status === 'connected')
            || canais.find(c => !c.status)
            || canais[0];
    }

    /**
     * Envia pelo canal da empresa e, se correr bem, acerta o `status` na base de
     * dados — assim o registo aprende com a realidade em vez de ficar à espera
     * que alguém abra a página.
     */
    public static async enviarPelaEmpresa(supabaseClient: any, empresaId: string | number | null, phone_number: string, content: string) {
        const canal = await this.canalDaEmpresa(supabaseClient, empresaId);
        if (!canal) return { ok: false, erro: 'a empresa não tem nenhum canal de WhatsApp' };
        try {
            const r = await this.sendMessage(supabaseClient, canal.id, phone_number, content);
            if (r === false) return { ok: false, erro: 'o canal não aceitou a mensagem' };
            if (canal.status !== 'connected') {
                await supabaseClient.from('wa_channels').update({ status: 'connected' }).eq('id', canal.id);
            }
            return { ok: true, canalId: canal.id };
        } catch (e: any) {
            return { ok: false, erro: e?.message || String(e) };
        }
    }

    // Um link não traz o mimetype consigo — deduz-se pela extensão do próprio
    // link ou, se este não tiver extensão utilizável, pela do nome do ficheiro.
    private static mimeTypePorExtensao(url: string, fileName?: string): string {
        const extDe = (s: string) => (s.split('?')[0].split('.').pop() || '').toLowerCase();
        return MIME_POR_EXTENSAO[extDe(url)]
            || (fileName ? MIME_POR_EXTENSAO[extDe(fileName)] : undefined)
            || 'application/octet-stream';
    }
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
        
        // Normalizar número (grupos usam o JID completo, ex: 12036xxxxx@g.us —
        // não deve ser tratado como número de telefone)
        let formattedPhone = phone_number;
        if (!formattedPhone.includes('@lid') && !formattedPhone.includes('@g.us')) {
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

    // bodyParams preenche as variáveis {{1}}, {{2}}, ... do componente BODY do
    // template, na ordem em que aparecem — necessário para campanhas
    // personalizadas (ex: "Olá {{1}}, o seu pedido {{2}} está a caminho.").
    public static async sendTemplateMessage(supabaseClient: any, channel_id: string, phone_number: string, template_name: string, language_code: string, bodyParams?: string[]): Promise<string | boolean> {
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

            const template: any = {
                name: template_name,
                language: { code: language_code }
            };
            if (bodyParams && bodyParams.length > 0) {
                template.components = [{
                    type: 'body',
                    parameters: bodyParams.map(p => ({ type: 'text', text: String(p ?? '') }))
                }];
            }

            const payload = {
                messaging_product: 'whatsapp',
                to: formattedPhone,
                type: 'template',
                template
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
                return `ERROR: ${data.error?.message || response.status}`;
            }
            return data.messages?.[0]?.id || true;
        } catch (error: any) {
            console.error('[WhatsAppChannelManager] Erro ao enviar template:', error);
            return `ERROR: ${error.message || String(error)}`;
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

                // Aceita tanto um data URI (data:mime;base64,...) como um link
                // http(s) — a Evolution vai buscar o ficheiro ela própria. Os
                // ficheiros guardados no Supabase Storage chegam aqui como link,
                // e assim não é preciso descarregá-los e recodificá-los por cada
                // destinatário de uma campanha.
                let mimetype: string;
                let base64Str: string;

                if (/^https?:\/\//i.test(base64Data)) {
                    mimetype = WhatsAppChannelManager.mimeTypePorExtensao(base64Data, fileName);
                    base64Str = base64Data;
                } else {
                    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                    if (!matches || matches.length !== 3) {
                        throw new Error('Formato base64 inválido');
                    }
                    mimetype = matches[1];
                    base64Str = matches[2];
                }

                let mediatype = 'document';
                if (mimetype.startsWith('image/')) mediatype = 'image';
                else if (mimetype.startsWith('video/')) mediatype = 'video';
                else if (mimetype.startsWith('audio/')) mediatype = 'audio';

                // Áudio usa o endpoint dedicado /sendWhatsAppAudio, não o genérico
                // /sendMedia — só assim o WhatsApp mostra a bolha nativa de nota de
                // voz (onda sonora, botão redondo). Pelo /sendMedia, o mesmo áudio
                // chega ao destinatário como um anexo de ficheiro qualquer, sem
                // nenhum "ar" de WhatsApp. `encoding: true` deixa a Evolution
                // recodificar o ficheiro para o formato opus/ogg que o WhatsApp
                // exige, independentemente do formato original enviado.
                if (mediatype === 'audio') {
                    const audioEndpoint = `${evolutionUrl}/message/sendWhatsAppAudio/${instanceName}`;
                    const audioPayload = {
                        number: formattedPhone,
                        audio: base64Str,
                        encoding: true,
                        delay: 1200
                    };
                    const audioResponse = await fetch(audioEndpoint, {
                        method: 'POST',
                        headers: { 'apikey': apiK, 'Content-Type': 'application/json' },
                        body: JSON.stringify(audioPayload)
                    });
                    const audioData = await audioResponse.json().catch(() => ({}));
                    if (!audioResponse.ok) {
                        console.error('[Evolution API Audio Error]', JSON.stringify(audioData));
                        return false;
                    }
                    return true;
                }

                const endpoint = `${evolutionUrl}/message/sendMedia/${instanceName}`;

                // Evolution API v2 payload (formato correcto verificado)
                const payload = {
                    number: formattedPhone,
                    options: { delay: 1200, presence: 'composing' },
                    mediaMessage: {
                        mediatype,
                        mimetype,
                        caption: caption || '',
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
                // Para Meta: upload multipart/form-data para /media e depois enviar por URL.
                // A Meta exige o ficheiro em si (não aceita um link nosso), por isso
                // um link tem de ser descarregado primeiro.
                const { phoneNumberId, accessToken } = channel.credentials;
                let mimeType: string;
                let b64Str: string;

                if (/^https?:\/\//i.test(base64Data)) {
                    const ficheiro = await fetch(base64Data);
                    if (!ficheiro.ok) {
                        console.error('[Meta API Media] Não foi possível descarregar o ficheiro:', base64Data);
                        return false;
                    }
                    mimeType = ficheiro.headers.get('content-type') || WhatsAppChannelManager.mimeTypePorExtensao(base64Data, fileName);
                    b64Str = Buffer.from(await ficheiro.arrayBuffer()).toString('base64');
                } else {
                    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                    if (!matches) return false;
                    mimeType = matches[1];
                    b64Str = matches[2];
                }

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
