import { Router, Request, Response } from 'express';
import { supabase, getSupabase } from '../lib/supabaseClient';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { AutomationEngine } from '../services/AutomationEngine';
import { WhatsAppGroupService } from '../services/WhatsAppGroupService';

const router = Router();

// ============================================================
// HELPER: Upload de mídia para Supabase Storage
// ============================================================
async function uploadMediaToStorage(base64Data: string, fileName: string, mimeType: string): Promise<string | null> {
    try {
        const base64Str = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
        const buffer = Buffer.from(base64Str, 'base64');
        const safeFileName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = `messages/${safeFileName}`;
        
        const { error } = await supabase.storage
            .from('whatsapp-media')
            .upload(filePath, buffer, { contentType: mimeType, upsert: false });
        
        if (error) {
            console.error('[Storage] Erro ao fazer upload:', error.message);
            return null;
        }
        
        const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath);
        return urlData?.publicUrl || null;
    } catch (e: any) {
        console.error('[Storage] Erro inesperado no upload:', e.message);
        return null;
    }
}

// HELPER: Download de mídia da Evolution API
async function downloadMediaFromEvolution(instanceName: string, msg: any): Promise<{ base64: string, mimeType: string } | null> {
    const evolutionUrl = process.env.EVOLUTION_API_URL || 'https://evolution.topconsultores.pt';
    const apikey = process.env.AUTHENTICATION_API_KEY || '';
    try {
        const res = await fetch(`${evolutionUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apikey },
            body: JSON.stringify({ message: msg, convertToMp4: false })
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.base64) {
            return { base64: data.base64, mimeType: data.mimetype || 'application/octet-stream' };
        }
        return null;
    } catch {
        return null;
    }
}

// ==============================================================
// WEBHOOKS DE RECEPÇÃO DE MENSAGENS (Públicos)
// ==============================================================

/**
 * Webhook para Evolution API
 * Evolution envia os eventos em POST para esta rota
 */
router.post('/webhook/evolution', async (req: Request, res: Response) => {
    try {
        const body = req.body;
        console.log('[Webhook Evolution] Recebido payload:', JSON.stringify(body, null, 2));
        
        // --- ATUALIZAÇÃO DE STATUS (LIDO, ENTREGUE, etc) ---
        if (body.event === 'messages.update' || body.event === 'MESSAGES_UPDATE') {
            let msgs: any[] = [];
            if (Array.isArray(body.data)) msgs = body.data;
            else if (body.data) msgs = [body.data];

            for (const msg of msgs) {
                if (!msg.key?.id) continue;
                let newStatus = 'delivered'; // fallback
                if (msg.update?.status === 3 || msg.update?.status === 'READ') newStatus = 'read';
                else if (msg.update?.status === 2 || msg.update?.status === 'DELIVERY_ACK') newStatus = 'delivered';
                else if (msg.update?.status === 1 || msg.update?.status === 'SERVER_ACK') newStatus = 'sent';

                // Usamos o Supabase service role ou normal client se houver
                await supabase.from('wa_messages').update({ status: newStatus }).eq('message_id', msg.key.id);
            }
            return res.status(200).send('OK');
        }

        // --- MENSAGENS RECEBIDAS (UPSERT) ---
        if (body.event === 'messages.upsert' || body.event === 'MESSAGES_UPSERT') {
            let msgs: any[] = [];
            if (Array.isArray(body.data)) msgs = body.data;
            else if (body.data?.messages) msgs = body.data.messages;
            else if (body.data?.key) msgs = [body.data];
            else if (body.data?.message && body.data?.message?.key) msgs = [body.data.message];
            else if (body.data) msgs = [body.data];
            
            for (const msg of msgs) {
                // Ignorar mensagens enviadas por nós mesmos
                if (!msg?.key) continue;
                if (msg.key.fromMe) continue;

                if (msg.key.remoteJid?.includes('@g.us')) {
                    try {
                        const groupContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
                        if (groupContent.trim()) {
                            const instanceNameForGroup = body.instance || req.body?.instance;
                            const { data: groupChannel } = await supabase.from('wa_channels').select('id')
                                .eq('provider', 'evolution').filter('credentials->>instanceName', 'eq', instanceNameForGroup).maybeSingle();
                            if (groupChannel?.id) {
                                WhatsAppGroupService.handleIncomingMessage({
                                    channelId: groupChannel.id,
                                    groupJid: msg.key.remoteJid,
                                    senderJid: msg.key.participant || msg.participant || msg.key.remoteJid,
                                    senderName: msg.pushName || '',
                                    content: groupContent,
                                    messageId: msg.key.id,
                                }).catch(err => console.error('[Webhook Evolution] Erro no processamento de mensagem de grupo:', err));
                            }
                        }
                    } catch (e) {
                        console.error('[Webhook Evolution] Erro ao processar mensagem de grupo:', e);
                    }
                    continue;
                }

                // FIX #1 — Extrair número limpo (sem @lid, sem @s.whatsapp.net)
                let realJid = msg.key.remoteJidAlt || msg.key.remoteJid;
                let phoneNumber = realJid || '';
                if (!phoneNumber.includes('@lid')) {
                    phoneNumber = phoneNumber.split('@')[0];
                    if (phoneNumber.includes(':')) phoneNumber = phoneNumber.split(':')[0];
                    phoneNumber = phoneNumber.replace(/\D/g, '');
                }

                // FIX #6 — Processar conteúdo de mídia com download se necessário
                let content = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
                let mediaUrl: string | null = null;
                let mediaType: string | null = null;
                let mediaFilename: string | null = null;
                const instanceName = body.instance || req.body?.instance;
                
                if (!content) {
                    // Tentar ler base64 inline primeiro (quando Evolution envia directamente)
                    const b64 = msg.message?.base64 || msg.base64 ||
                        msg.message?.imageMessage?.base64 ||
                        msg.message?.videoMessage?.base64 ||
                        msg.message?.audioMessage?.base64 ||
                        msg.message?.documentMessage?.base64 ||
                        msg.message?.stickerMessage?.base64;

                    // Nota: a legenda (caption) real do WhatsApp e o marcador interno
                    // [MEDIA_URL:...] nunca se misturam com o placeholder ([Imagem],
                    // [Áudio], etc.) — esse placeholder só aparece sozinho quando o
                    // download/upload da mídia falha de facto (ex: erro a decifrar
                    // um áudio na Evolution API), para o frontend saber mostrar um
                    // estado "mídia indisponível" em vez de texto em bruto.
                    if (msg.message?.imageMessage) {
                        const mime = msg.message.imageMessage.mimetype || 'image/jpeg';
                        const fname = 'imagem.jpg';
                        const caption = msg.message.imageMessage.caption || '';
                        mediaType = 'image';
                        mediaFilename = fname;
                        if (b64) {
                            mediaUrl = await uploadMediaToStorage(b64, fname, mime);
                        } else if (instanceName) {
                            const dl = await downloadMediaFromEvolution(instanceName, msg.key);
                            if (dl) mediaUrl = await uploadMediaToStorage(dl.base64, fname, dl.mimeType);
                        }
                        content = mediaUrl ? [caption, `[MEDIA_URL:${mediaUrl}]`].filter(Boolean).join('\n') : (caption || '[Imagem]');
                    } else if (msg.message?.videoMessage) {
                        const mime = msg.message.videoMessage.mimetype || 'video/mp4';
                        const fname = `video_${Date.now()}.mp4`;
                        const caption = msg.message.videoMessage.caption || '';
                        mediaType = 'video';
                        mediaFilename = fname;
                        if (b64) {
                            mediaUrl = await uploadMediaToStorage(b64, fname, mime);
                        } else if (instanceName) {
                            const dl = await downloadMediaFromEvolution(instanceName, msg);
                            if (dl) mediaUrl = await uploadMediaToStorage(dl.base64, fname, dl.mimeType);
                        }
                        content = mediaUrl ? [caption, `[MEDIA_URL:${mediaUrl}]`].filter(Boolean).join('\n') : (caption || '[Vídeo]');
                    } else if (msg.message?.audioMessage) {
                        const mime = msg.message.audioMessage.mimetype || 'audio/ogg';
                        const fname = `audio_${Date.now()}.ogg`;
                        mediaType = 'audio';
                        mediaFilename = fname;
                        if (b64) {
                            mediaUrl = await uploadMediaToStorage(b64, fname, mime);
                        } else if (instanceName) {
                            const dl = await downloadMediaFromEvolution(instanceName, msg);
                            if (dl) mediaUrl = await uploadMediaToStorage(dl.base64, fname, dl.mimeType);
                        }
                        content = mediaUrl ? `[MEDIA_URL:${mediaUrl}]` : '[Áudio]';
                    } else if (msg.message?.documentMessage) {
                        const originalName = msg.message.documentMessage.fileName || 'ficheiro';
                        const mime = msg.message.documentMessage.mimetype || 'application/octet-stream';
                        const caption = msg.message.documentMessage.caption || '';
                        mediaType = 'document';
                        mediaFilename = originalName;
                        if (b64) {
                            mediaUrl = await uploadMediaToStorage(b64, originalName, mime);
                        } else if (instanceName) {
                            const dl = await downloadMediaFromEvolution(instanceName, msg);
                            if (dl) mediaUrl = await uploadMediaToStorage(dl.base64, originalName, dl.mimeType);
                        }
                        content = mediaUrl ? [caption, `[MEDIA_URL:${mediaUrl}]`].filter(Boolean).join('\n') : `[Documento] ${originalName}`;
                    } else if (msg.message?.stickerMessage) {
                        mediaType = 'image';
                        if (b64) mediaUrl = await uploadMediaToStorage(b64, 'sticker.webp', 'image/webp');
                        content = mediaUrl ? `[MEDIA_URL:${mediaUrl}]` : '[Sticker]';
                    } else if (msg.message?.locationMessage) {
                        content = '[Localização]';
                    } else if (Object.keys(msg.message || {}).length > 0) {
                        content = '[Media]';
                    }
                }
                
                // FIX #1 — Usar número limpo (phoneNumber) para buscar perfil, não o JID raw
                let contactName = msg.pushName || body.data?.pushName || msg.message?.pushName || '';
                if (!contactName && phoneNumber && !phoneNumber.includes('@lid')) {
                    const evolutionUrl = process.env.EVOLUTION_API_URL || 'https://evolution.topconsultores.pt';
                    const apikey = process.env.AUTHENTICATION_API_KEY || '';
                    if (instanceName && apikey) {
                        try {
                            const profileRes = await fetch(`${evolutionUrl}/chat/fetchProfile/${instanceName}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'apikey': apikey },
                                body: JSON.stringify({ number: phoneNumber }) // USA NÚMERO LIMPO, não o JID
                            });
                            if (profileRes.ok) {
                                const profileData = await profileRes.json();
                                contactName = profileData.name || profileData.pushName || '';
                            }
                        } catch (e) {
                            console.error('Erro ao buscar perfil da Evolution API:', e);
                        }
                    }
                }
                contactName = contactName || phoneNumber;

                // Foto de perfil — os links da CDN do WhatsApp expiram ao fim de algum
                // tempo, por isso vamos buscar de novo a cada mensagem recebida (não só
                // na sincronização manual), para a foto se manter atualizada nas
                // conversas que continuam ativas.
                let contactPicture: string | null = null;
                if (phoneNumber && !phoneNumber.includes('@lid')) {
                    const evolutionUrl = process.env.EVOLUTION_API_URL || 'https://evolution.topconsultores.pt';
                    const apikey = process.env.AUTHENTICATION_API_KEY || '';
                    if (instanceName && apikey) {
                        try {
                            const picRes = await fetch(`${evolutionUrl}/chat/fetchProfilePictureUrl/${instanceName}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'apikey': apikey },
                                body: JSON.stringify({ number: phoneNumber })
                            });
                            if (picRes.ok) {
                                const picData = await picRes.json();
                                if (picData.profilePictureUrl) contactPicture = picData.profilePictureUrl;
                            }
                        } catch (e) { /* silent fail — não bloqueia a mensagem por causa da foto */ }
                    }
                }

                if (!phoneNumber || !content) continue;

                // Buscar canal evolution correto usando instanceName
                const { data: channelData, error: rpcErr } = await supabase
                    .from('wa_channels')
                    .select('id')
                    .eq('provider', 'evolution')
                    .filter('credentials->>instanceName', 'eq', instanceName)
                    .maybeSingle();
                const channelId = channelData?.id;
                
                if (!channelId) {
                    console.error('[Webhook Evolution] Canal não encontrado:', rpcErr);
                    continue;
                }

                // Não aguardamos aqui: se a automação tiver um nó "Aguardar", esperar por
                // ela deixaria o webhook pendente e o Evolution/Meta poderiam reenviar o
                // evento por timeout. O processamento continua em background.
                AutomationEngine.processIncomingWhatsAppMessage({
                    channel_id: channelId,
                    phone_number: phoneNumber,
                    contact_name: contactName,
                    contact_picture: contactPicture,
                    content: content,
                    direction: 'inbound',
                    id: msg.key.id
                }).catch(err => console.error('[Webhook Evolution] Erro no processamento assíncrono do Automation Engine:', err));
            }
        }
        res.status(200).send('OK');
    } catch (err) {
        console.error('Erro no webhook Evolution:', err);
        res.status(500).send('Error');
    }
});

/**
 * Webhook para Meta Cloud API (WhatsApp Oficial)
 * A Meta usa GET para validar o webhook e POST para enviar mensagens
 */
router.get('/webhook/meta', (req: Request, res: Response) => {
    const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'businessos_token';
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

router.post('/webhook/meta', async (req: Request, res: Response) => {
    try {
        const signature = req.headers['x-hub-signature-256'] as string;
        const appSecret = process.env.META_APP_SECRET;

        // Validar signature se a App Secret estiver configurada
        if (signature && appSecret) {
            const crypto = require('crypto');
            const expectedSignature = 'sha256=' + crypto.createHmac('sha256', appSecret).update((req as any).rawBody).digest('hex');
            if (signature !== expectedSignature) {
                return res.status(401).send('Signature mismatch');
            }
        }

        const body = req.body;
        if (body.object) {
            const change = body.entry?.[0]?.changes?.[0]?.value;

            // Atualizações de estado (enviado/entregue/lido/falhado) — necessárias
            // para as métricas de campanhas e para os "vistos" nas conversas.
            // A Meta nunca envia isto junto com "messages" no mesmo evento.
            if (change?.statuses?.length) {
                for (const st of change.statuses) {
                    if (!st.id) continue;
                    const novoEstado = st.status === 'read' ? 'read' : st.status === 'delivered' ? 'delivered' : st.status === 'failed' ? 'failed' : st.status === 'sent' ? 'sent' : null;
                    if (!novoEstado) continue;
                    await supabase.from('wa_messages').update({ status: novoEstado }).eq('message_id', st.id);
                    // Espelhar no destinatário da campanha, se esta mensagem pertencer a uma.
                    await supabase.from('campanha_destinatarios').update({
                        estado: novoEstado === 'failed' ? 'Falhou' : novoEstado === 'read' ? 'Lida' : novoEstado === 'delivered' ? 'Entregue' : 'Enviada',
                        erro: st.errors?.[0]?.title || null,
                        atualizado_em: new Date().toISOString()
                    }).eq('message_id', st.id);
                }
                return res.status(200).send('EVENT_RECEIVED');
            }

            if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
                const msg = change.messages[0];
                const contact = change.contacts?.[0];

                let phoneNumber = msg.from;
                if (phoneNumber) phoneNumber = phoneNumber.replace(/\D/g, ''); // Remove +, espaços, etc.
                const content = msg.text?.body || '';
                const contactName = contact?.profile?.name || phoneNumber;

                const phoneNumberId = change.metadata?.phone_number_id;
                const { data: channelData } = await supabase.from('wa_channels')
                    .select('id')
                    .eq('provider', 'meta')
                    .filter('credentials->>phoneNumberId', 'eq', phoneNumberId)
                    .maybeSingle();
                const channelId = channelData?.id;

                if (channelId) {
                    // Fire-and-forget — ver nota equivalente no webhook Evolution acima.
                    AutomationEngine.processIncomingWhatsAppMessage({
                        channel_id: channelId,
                        phone_number: phoneNumber,
                        contact_name: contactName,
                        content: content,
                        direction: 'inbound',
                        id: msg.id
                    }).catch(err => console.error('[Webhook Meta] Erro no processamento assíncrono do Automation Engine:', err));
                }
            }
            res.status(200).send('EVENT_RECEIVED');
        } else {
            res.sendStatus(404);
        }
    } catch (err) {
        console.error('Erro no webhook Meta:', err);
        res.status(500).send('Error');
    }
});

// ==============================================================
// ROTAS PRIVADAS (Requer Login) - Para o Frontend Omnichannel
// ==============================================================

// Rota para gravar as configurações da Meta
router.post('/config/meta', requireAuth, async (req: AuthRequest, res: Response) => {
    const { appId, phoneNumberId, accessToken, verifyToken } = req.body;
    const empresaId = req.user?.empresa_id;

    if (!appId || !phoneNumberId || !accessToken || !verifyToken) {
        return res.status(400).json({ success: false, error: 'Todos os campos são obrigatórios' });
    }
    if (!empresaId) {
        return res.status(400).json({ success: false, error: 'Empresa não encontrada' });
    }

    try {
        // 1. Testar credenciais junto da API da Meta para obter o nome do negócio
        const metaRes = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}?fields=verified_name,display_phone_number`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!metaRes.ok) {
            const errorData = await metaRes.json();
            return res.status(400).json({ success: false, error: `Credenciais inválidas: ${errorData.error?.message || 'Erro de autenticação com a Meta'}` });
        }

        const businessData = await metaRes.json();
        const businessName = businessData.verified_name || 'Negócio Verificado';
        const businessPhone = businessData.display_phone_number || phoneNumberId;

        // 2. Se for válido, guardar no Supabase
        const { data: existingChannel } = await getSupabase(req)
            .from('wa_channels')
            .select('id')
            .eq('provider', 'meta')
            .eq('empresa_id', empresaId)
            .maybeSingle();

        const creds = { appId, phoneNumberId, accessToken, verifyToken };

        if (existingChannel) {
            await getSupabase(req).from('wa_channels').update({
                credentials: creds,
                status: 'connected',
                updated_at: new Date().toISOString()
            }).eq('id', existingChannel.id);
        } else {
            await getSupabase(req).from('wa_channels').insert({
                name: businessName,
                provider: 'meta',
                status: 'connected',
                credentials: creds,
                empresa_id: empresaId
            });
        }

        res.json({ 
            success: true, 
            message: 'Credenciais guardadas com sucesso.',
            businessName,
            businessPhone
        });
    } catch (err: any) {
        console.error('Erro a guardar config Meta:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/conversations', requireAuth, async (req: AuthRequest, res: Response) => {
    let query = getSupabase(req)
        .from('wa_conversations')
        .select('*, wa_channels(name, provider)')
        .eq('empresa_id', req.user!.empresa_id)
        .neq('status', 'archived')
        .not('phone_number', 'like', '%@lid%')
        .order('last_message_at', { ascending: false });

    if (req.user && req.user.role !== 'admin' && req.user.role !== 'supervisor' && req.user.role !== 'superadmin') {
        query = query.or(`assigned_to.eq.${req.user.id},assigned_to.is.null`);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, conversations: data });
});

router.get('/agents', requireAuth, async (req: AuthRequest, res: Response) => {
    const { data, error } = await getSupabase(req)
        .from('perfis')
        .select('id, nome, role')
        .eq('empresa_id', req.user!.empresa_id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, agents: data });
});

router.put('/conversations/:id/assign', requireAuth, async (req: AuthRequest, res: Response) => {
    const { agent_id } = req.body;
    const conversation_id = req.params.id;

    if (req.user!.role !== 'admin' && req.user!.role !== 'supervisor' && req.user!.role !== 'superadmin') {
        return res.status(403).json({ error: 'Apenas supervisores ou admins podem atribuir conversas.' });
    }

    const { error: updateError } = await getSupabase(req)
        .from('wa_conversations')
        .update({ assigned_to: agent_id || null })
        .eq('id', conversation_id)
        .eq('empresa_id', req.user!.empresa_id);

    if (updateError) return res.status(500).json({ error: updateError.message });

    await getSupabase(req).from('wa_audit_logs').insert({
        conversation_id,
        action: agent_id ? 'assigned' : 'unassigned',
        performed_by: req.user!.id,
        target_user: agent_id || null,
        details: agent_id ? 'Conversa atribuída a agente.' : 'Conversa devolvida para a fila global.'
    });

    res.json({ success: true });
});

router.get('/conversations/:id/audit', requireAuth, async (req: AuthRequest, res: Response) => {
    const conversation_id = req.params.id;
    const { data, error } = await getSupabase(req)
        .from('wa_audit_logs')
        .select('*')
        .eq('conversation_id', conversation_id)
        .eq('empresa_id', req.user!.empresa_id)
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    
    const { data: perfis } = await getSupabase(req).from('perfis').select('id, nome');
    const perfisMap = (perfis || []).reduce((acc: any, p: any) => ({ ...acc, [p.id]: p.nome }), {});
    
    const auditWithNames = (data || []).map(log => ({
        ...log,
        performed_by_name: perfisMap[log.performed_by] || 'Sistema',
        target_user_name: log.target_user ? (perfisMap[log.target_user] || 'Desconhecido') : null
    }));

    res.json({ success: true, audit: auditWithNames });
});

router.get('/conversations/:id/messages', requireAuth, async (req: AuthRequest, res: Response) => {
    const { data, error } = await getSupabase(req)
        .from('wa_messages')
        .select('*')
        .eq('conversation_id', req.params.id)
        .eq('empresa_id', req.user!.empresa_id)
        .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, messages: data });
});

// ==============================================================
// METATEMPLATES & 24H WINDOW LOGIC
// ==============================================================

// Estado da Instância Evolution — sincroniza status na BD
router.get('/evolution/instance/state', requireAuth, async (req: AuthRequest, res: Response) => {
    const empresaId = req.user?.empresa_id;
    if (!empresaId) return res.status(400).json({ error: 'Empresa não encontrada' });
    const instanceName = `SISTEMA_EMP_${empresaId}`;
    const apiUrl = process.env.EVOLUTION_API_URL || 'https://evolution.topconsultores.pt';
    const apiKey = process.env.AUTHENTICATION_API_KEY || '';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const stateRes = await fetch(`${apiUrl}/instance/connectionState/${instanceName}`, { 
            headers: { 'apikey': apiKey },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (stateRes.status === 404) {
            // Instância não existe — garantir que BD reflecte isso
            await getSupabase(req).from('wa_channels').update({ status: 'disconnected' }).eq('provider', 'evolution').eq('empresa_id', empresaId);
            return res.json({ success: true, state: 'disconnected', message: 'Instância não encontrada' });
        }

        const stateData = await stateRes.json();
        const evolutionState = stateData.instance?.state || 'unknown';
        const isConnected = evolutionState === 'open' || evolutionState === 'connected';

        // SINCRONIZAR STATUS NA BD — crucial para que sendMessage funcione após reconexão
        const newStatus = isConnected ? 'connected' : 'disconnected';
        await getSupabase(req).from('wa_channels').update({ status: newStatus }).eq('provider', 'evolution').eq('empresa_id', empresaId);

        // Se acabou de reconectar, desarquivar as conversas
        if (isConnected) {
            await getSupabase(req).from('wa_conversations')
                .update({ status: 'open' })
                .eq('status', 'archived')
                .eq('empresa_id', empresaId);
        }

        return res.json({ success: true, state: evolutionState });
    } catch (err: any) {
        return res.status(500).json({ error: err.name === 'AbortError' ? 'Timeout ao contactar Evolution API' : err.message });
    }
});

// Desconectar / Fazer Logout da Evolution API
router.delete('/evolution/instance/logout', requireAuth, async (req: AuthRequest, res: Response) => {
    const empresaId = req.user?.empresa_id;
    if (!empresaId) return res.status(400).json({ error: 'Empresa não encontrada' });
    const instanceName = `SISTEMA_EMP_${empresaId}`;
    const apiUrl = process.env.EVOLUTION_API_URL || 'https://evolution.topconsultores.pt';
    const apiKey = process.env.AUTHENTICATION_API_KEY || '';

    try {
        await fetch(`${apiUrl}/instance/logout/${instanceName}`, { method: 'DELETE', headers: { 'apikey': apiKey } });
        const userClient = getSupabase(req);
        const { data: channel } = await userClient.from('wa_channels').select('id').eq('provider', 'evolution').eq('empresa_id', empresaId).maybeSingle();
        if (channel) {
            // FIX #4 — Arquivar todas as conversas do canal ao desconectar
            await userClient.from('wa_conversations').update({ status: 'archived' }).eq('channel_id', channel.id);
        }
        await userClient.from('wa_channels').update({ status: 'disconnected' }).eq('provider', 'evolution').eq('empresa_id', empresaId);
        // Retornar cleared:true para o frontend limpar o estado local
        return res.json({ success: true, cleared: true });
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
});

// DIAGNÓSTICO: Ver resposta raw da Evolution API
router.get('/evolution/debug-chats', requireAuth, async (req: AuthRequest, res: Response) => {
    const empresaId = req.user?.empresa_id;
    if (!empresaId) return res.status(400).json({ error: 'Empresa não encontrada' });
    const instanceName = `SISTEMA_EMP_${empresaId}`;
    const apiUrl = process.env.EVOLUTION_API_URL || 'https://evolution.topconsultores.pt';
    const apiKey = process.env.AUTHENTICATION_API_KEY || '';

    const results: any = { instanceName, apiUrl, endpoints: {} };

    // Testar findChats com POST
    try {
        const r1 = await globalThis.fetch(`${apiUrl}/chat/findChats/${instanceName}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            body: JSON.stringify({ page: 1, count: 20 })
        });
        results.endpoints.findChats_POST = { status: r1.status, body: await r1.json() };
    } catch(e: any) { results.endpoints.findChats_POST = { error: e.message }; }

    // Testar findChats com GET
    try {
        const r2 = await globalThis.fetch(`${apiUrl}/chat/findChats/${instanceName}`, {
            method: 'GET', headers: { 'apikey': apiKey }
        });
        results.endpoints.findChats_GET = { status: r2.status, body: await r2.json() };
    } catch(e: any) { results.endpoints.findChats_GET = { error: e.message }; }

    // Testar fetchAllGroups (apenas para ver estrutura)
    try {
        const r3 = await globalThis.fetch(`${apiUrl}/group/fetchAllGroups/${instanceName}?getParticipants=false`, {
            method: 'GET', headers: { 'apikey': apiKey }
        });
        results.endpoints.fetchAllGroups = { status: r3.status, isArray: true, count: (await r3.json())?.length };
    } catch(e: any) { results.endpoints.fetchAllGroups = { error: e.message }; }

    // Testar connectionState
    try {
        const r4 = await globalThis.fetch(`${apiUrl}/instance/connectionState/${instanceName}`, {
            headers: { 'apikey': apiKey }
        });
        results.endpoints.connectionState = { status: r4.status, body: await r4.json() };
    } catch(e: any) { results.endpoints.connectionState = { error: e.message }; }

    return res.json(results);
});

// Sincronizar Conversas Antigas Evolution
router.post('/evolution/sync-chats', requireAuth, async (req: AuthRequest, res: Response) => {
    const empresaId = req.user?.empresa_id;
    if (!empresaId) return res.status(400).json({ error: 'Empresa não encontrada' });
    const instanceName = `SISTEMA_EMP_${empresaId}`;
    const apiUrl = process.env.EVOLUTION_API_URL || 'https://evolution.topconsultores.pt';
    const apiKey = process.env.AUTHENTICATION_API_KEY || '';

    console.log(`[sync-chats] Iniciando sincronização para instância: ${instanceName}`);

    // Helper: fetch com timeout (usa globalThis.fetch para evitar conflito com Express Response)
    const fetchWithTimeout = (url: string, options: RequestInit, timeoutMs = 15000) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        return globalThis.fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
    };

    try {
        const userClient = getSupabase(req);
        // 1. Obter ou Criar o Canal Evolution
        let { data: channel, error: channelError } = await userClient.from('wa_channels').select('id').eq('provider', 'evolution').eq('empresa_id', empresaId).maybeSingle();

        if (!channel) {
            const { data, error: insertError } = await userClient.from('wa_channels')
                .insert({ name: 'Evolution API', provider: 'evolution', status: 'connected', credentials: { instanceName }, empresa_id: empresaId })
                .select('id').single();
            if (insertError) throw new Error('Erro ao criar canal: ' + insertError.message);
            channel = data;
        }
        
        if (!channel) {
            throw new Error('Falha catastrófica: Canal Evolution não encontrado nem criado.');
        }

        // 2. Fetch Chats from Evolution (com timeout de 20s)
        console.log(`[sync-chats] A buscar chats em ${apiUrl}/chat/findChats/${instanceName}`);
        let chatsRes: any;
        try {
            chatsRes = await fetchWithTimeout(`${apiUrl}/chat/findChats/${instanceName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                body: JSON.stringify({ page: 1, count: 50 })
            }, 20000);
        } catch (fetchErr: any) {
            const msg = fetchErr.name === 'AbortError'
                ? 'Timeout ao contactar a Evolution API (findChats). Verifique se a instância está online.'
                : `Erro de rede ao contactar Evolution API: ${fetchErr.message}`;
            console.error('[sync-chats]', msg);
            return res.status(502).json({ error: msg });
        }

        if (!chatsRes.ok) {
            const errText = await chatsRes.text();
            console.error(`[sync-chats] findChats retornou status ${chatsRes.status}:`, errText);
            throw new Error(`Falha ao buscar chats (HTTP ${chatsRes.status}): ${errText}`);
        }

        const chatsData = await chatsRes.json();
        console.log('[sync-chats] Resposta findChats recebida, tipo:', typeof chatsData, Array.isArray(chatsData) ? `array[${chatsData.length}]` : 'objeto');
        
        let syncCount = 0;
        
        // Obter domínios do request para Webhook local se aplicável
        const publicUrl = process.env.BACKEND_PUBLIC_URL || `https://${req.headers.host}`;

        // Definir Webhook na Evolution para receber novas mensagens
        try {
            await fetchWithTimeout(`${apiUrl}/webhook/set/${instanceName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                body: JSON.stringify({
                    webhook: {
                        url: `${publicUrl}/api/whatsapp/webhook/evolution`,
                        enabled: true,
                        byEvents: false,
                        base64: true,
                        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE"]
                    }
                })
            }, 10000);
            console.log('[sync-chats] Webhook configurado em:', `${publicUrl}/api/whatsapp/webhook/evolution`);
        } catch(e) { console.error("[sync-chats] Erro a definir webhook:", e); }

        const chats: any[] = chatsData.records || chatsData.chats || (Array.isArray(chatsData) ? chatsData : []);
        console.log(`[sync-chats] Total de chats encontrados: ${chats.length}`);

        for (const chat of chats) {
            const remoteJid = chat.remoteJid || chat.id;
            
            // Tentar descobrir o número real caso seja um @lid
            let realJid = remoteJid;
            if (remoteJid?.includes('@lid')) {
                if (chat.lastMessage?.key?.remoteJidAlt) {
                    realJid = chat.lastMessage.key.remoteJidAlt;
                }
            }
            
            // Ignorar grupos (@g.us) E contactos @lid que não foram resolvidos
            if (!realJid || realJid.includes('@g.us')) continue;
            if (realJid.includes('@lid')) {
                console.log(`[sync-chats] Ignorar contacto @lid sem resolução: ${realJid}`);
                continue;
            }
            
            let phoneNumber = realJid.split('@')[0].replace(/\D/g, '');
            if (!phoneNumber || phoneNumber.length < 8) continue; // Número inválido
            
            let contactName = chat.pushName || chat.name || chat.verifiedName || '';

            // Se não houver nome, tentar buscar o perfil usando o NÚMERO LIMPO
            if (!contactName && phoneNumber) {
                try {
                    const profileRes: any = await fetchWithTimeout(`${apiUrl}/chat/fetchProfile/${instanceName}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                        body: JSON.stringify({ number: phoneNumber }) // Número limpo, não o JID
                    }, 2000);
                    if (profileRes.ok) {
                        const profileData = await profileRes.json();
                        contactName = profileData.name || profileData.pushName || '';
                    }
                } catch (e) { /* silent fail */ }
            }

            if (!contactName) contactName = phoneNumber;
            
            // FOTOS DE PERFIL - tentar logo do objecto para evitar chamadas de rede extra
            let contactPicture: string | null = chat.profilePicUrl || chat.picture || null;
            if (!contactPicture) {
                try {
                    const picRes: any = await fetchWithTimeout(`${apiUrl}/chat/fetchProfilePictureUrl/${instanceName}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                        body: JSON.stringify({ number: phoneNumber }) // Número limpo
                    }, 2000);
                    if (picRes.ok) {
                        const picData = await picRes.json();
                        if (picData.profilePictureUrl) contactPicture = picData.profilePictureUrl;
                    }
                } catch (e) { /* silent fail */ }
            }

            // FIX #3 — Verifica se a conversa já existe (usar maybeSingle para evitar erro, filtrar por channel_id E phone_number)
            const { data: conv } = await getSupabase(req).from('wa_conversations')
                .select('id')
                .eq('channel_id', channel!.id)
                .eq('phone_number', phoneNumber)
                .maybeSingle();

            const tsMs = chat.conversationTimestamp ? chat.conversationTimestamp * 1000 : Date.now();
            const lastMsgAt = new Date(tsMs).toISOString();
            let convId = conv?.id;

            if (conv) {
                // Atualizar foto e última mensagem (opcional)
                const updatePayload: any = { updated_at: new Date().toISOString() };
                if (contactPicture) updatePayload.contact_picture = contactPicture;
                if (contactName && contactName !== phoneNumber) updatePayload.contact_name = contactName;
                await getSupabase(req).from('wa_conversations').update(updatePayload).eq('id', conv.id);

                // Garantir que o cliente existe no CRM
                const { data: checkCliente } = await getSupabase(req).from('clientes').select('id').eq('telefone', phoneNumber).maybeSingle();
                if (!checkCliente) {
                    await getSupabase(req).from('clientes').insert({
                        nome: contactName || phoneNumber,
                        telefone: phoneNumber,
                        empresa_id: empresaId
                    });
                }
            } else {
                // Inserir Nova Conversa
                const { data: newConv, error: insertErr } = await getSupabase(req).from('wa_conversations').insert({
                    channel_id: channel!.id,
                    phone_number: phoneNumber,
                    contact_name: contactName,
                    contact_picture: contactPicture,
                    status: 'open',
                    last_message_at: lastMsgAt
                }).select('id').single();
                
                if (newConv) convId = newConv.id;

                // Garantir que o cliente existe no CRM
                const { data: checkCliente } = await getSupabase(req).from('clientes').select('id').eq('telefone', phoneNumber).maybeSingle();
                if (!checkCliente) {
                    await getSupabase(req).from('clientes').insert({
                        nome: contactName || phoneNumber,
                        telefone: phoneNumber,
                        empresa_id: empresaId
                    });
                }
                
                if (insertErr) {
                    console.error(`[sync-chats] Erro ao inserir conversa ${phoneNumber}:`, insertErr.message);
                } else {
                    convId = newConv?.id;
                    syncCount++;
                }
            }

            // Sync last message se existir e não estivermos a duplicar
            if (convId && chat.lastMessage && chat.lastMessage.message) {
                const msgContent = chat.lastMessage.message.conversation || chat.lastMessage.message.extendedTextMessage?.text || "[Mensagem Multimédia/Outro]";
                const isFromMe = chat.lastMessage.key?.fromMe || false;
                const msgDirection = isFromMe ? 'outbound' : 'inbound';
                const msgTimestamp = chat.lastMessage.messageTimestamp ? new Date(chat.lastMessage.messageTimestamp * 1000).toISOString() : lastMsgAt;
                const msgId = chat.lastMessage.key?.id;
                
                if (msgId) {
                     const { data: existingMsg } = await getSupabase(req).from('wa_messages').select('id').eq('message_id', msgId).single();
                     if (!existingMsg) {
                          await getSupabase(req).from('wa_messages').insert({
                              conversation_id: convId,
                              message_id: msgId,
                              content: msgContent,
                              direction: msgDirection,
                              status: isFromMe ? 'sent' : 'received',
                              created_at: msgTimestamp,
                              message_type: 'text'
                          });
                     }
                }
            }
        }
        console.log(`[sync-chats] Sincronização concluída. Novas conversas: ${syncCount}`);
        res.json({ success: true, count: syncCount });
    } catch (err: any) {
        console.error('[sync-chats] Erro geral:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/evolution/instance', requireAuth, async (req: AuthRequest, res: Response) => {
    console.log('[DEBUG] /evolution/instance req.user:', req.user);
    const empresaId = req.user?.empresa_id;
    if (!empresaId) return res.status(400).json({ error: 'Empresa não encontrada' });

    const instanceName = `SISTEMA_EMP_${empresaId}`;
    const apiUrl = process.env.EVOLUTION_API_URL || 'https://evolution.topconsultores.pt';
    const apiKey = process.env.AUTHENTICATION_API_KEY || '';

    if (!apiKey) return res.status(500).json({ error: 'AUTHENTICATION_API_KEY não configurada no servidor' });

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout
        
        let connectData: any = {};
        let finalQrBase64: string | undefined;

        let createRes = await fetch(`${apiUrl}/instance/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            body: JSON.stringify({ instanceName: instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: true }),
            signal: controller.signal
        });

        if (createRes.status === 403) {
            // A instância já existe. Fazemos logout para forçar a geração de um novo QR Code.
            try {
                await fetch(`${apiUrl}/instance/logout/${instanceName}`, { method: 'DELETE', headers: { 'apikey': apiKey }, signal: controller.signal });
                await new Promise(resolve => setTimeout(resolve, 1500));
            } catch(e) {}
            
            let connectRes = await fetch(`${apiUrl}/instance/connect/${instanceName}`, { 
                headers: { 'apikey': apiKey },
                signal: controller.signal
            });
            if (!connectRes.ok) {
                const connectErr = await connectRes.text();
                clearTimeout(timeoutId);
                return res.status(400).json({ error: `Erro ao conectar instância: ${connectErr}` });
            }
            connectData = await connectRes.json();

            // Polling: se a API não retornar logo o QR Code, tenta buscar a cada 2 segs (max 5 vezes)
            let attempts = 0;
            while (!connectData.base64 && !connectData.qrcode?.base64 && connectData.instance?.state !== 'open' && attempts < 5) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                connectRes = await fetch(`${apiUrl}/instance/connect/${instanceName}`, { 
                    headers: { 'apikey': apiKey },
                    signal: controller.signal
                });
                if (connectRes.ok) {
                    connectData = await connectRes.json();
                }
                attempts++;
            }
        } else if (!createRes.ok) {
            // Se falhou por outro motivo (ex: erro interno da Evolution)
            const createErr = await createRes.text();
            clearTimeout(timeoutId);
            return res.status(400).json({ error: `Erro ao criar instância: ${createErr}` });
        } else {
            connectData = await createRes.json();
            // Na v2, a API de create já devolve o QR code se 'qrcode: true' no payload
            if (connectData.qrcode?.base64) {
                finalQrBase64 = connectData.qrcode.base64;
            } else if (!connectData.base64 && connectData.instance?.state !== 'open') {
                let connectRes = await fetch(`${apiUrl}/instance/connect/${instanceName}`, { 
                    headers: { 'apikey': apiKey },
                    signal: controller.signal
                });
                if (connectRes.ok) connectData = await connectRes.json();
                
                let attempts = 0;
                while (!connectData.base64 && !connectData.qrcode?.base64 && connectData.instance?.state !== 'open' && attempts < 5) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    connectRes = await fetch(`${apiUrl}/instance/connect/${instanceName}`, { 
                        headers: { 'apikey': apiKey },
                        signal: controller.signal
                    });
                    if (connectRes.ok) connectData = await connectRes.json();
                    attempts++;
                }
            }
        }
        
        clearTimeout(timeoutId);
        finalQrBase64 = finalQrBase64 || connectData.base64 || connectData.qrcode?.base64;

        // Ensure Webhook is set
        const publicUrl = process.env.BACKEND_PUBLIC_URL || `https://${req.headers.host}`;
        try {
            await fetch(`${apiUrl}/webhook/set/${instanceName}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                body: JSON.stringify({ webhook: { url: `${publicUrl}/api/whatsapp/webhook/evolution`, enabled: true, byEvents: false, base64: true, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE"] } })
            });
        } catch(e) {}

        const userClient = getSupabase(req);
        const { data: channel } = await userClient.from('wa_channels').select('id').eq('provider', 'evolution').eq('empresa_id', empresaId).maybeSingle();
        if (!channel) {
            await userClient.from('wa_channels').insert({ name: 'Evolution API', provider: 'evolution', status: 'connected', credentials: { instanceName }, empresa_id: empresaId });
        }

        if (finalQrBase64) {
            return res.json({ success: true, qr: finalQrBase64, state: 'connecting' });
        } else {
            return res.json({ success: true, state: connectData.instance?.state || 'connected', message: 'Já ligado ou a aguardar' });
        }
    } catch (err: any) {
        return res.status(500).json({ error: err.name === 'AbortError' ? 'Timeout ao contactar Evolution API' : err.message });
    }
});

router.post('/templates/sync', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { data: channel } = await getSupabase(req).from('wa_channels').select('*').eq('provider', 'meta').eq('empresa_id', req.user!.empresa_id).single();
        if (!channel) return res.status(404).json({ error: 'Canal Meta não encontrado' });

        const { phoneNumberId, accessToken } = channel.credentials as any;

        // Para obter os templates, precisamos do WABA_ID. 
        // 1. Obter WABA ID a partir do Phone Number ID
        const phoneRes = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}?fields=whatsapp_business_api_data`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const phoneData = await phoneRes.json();
        const wabaId = phoneData.whatsapp_business_api_data?.link?.id;

        if (!wabaId) return res.status(400).json({ error: 'Não foi possível encontrar o WABA ID associado a este número.' });

        // 2. Buscar templates
        const tplRes = await fetch(`https://graph.facebook.com/v20.0/${wabaId}/message_templates?limit=1000`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const tplData = await tplRes.json();

        if (tplData.error) return res.status(400).json({ error: tplData.error.message });

        // Filtrar apenas templates aprovados
        const approvedTemplates = tplData.data.filter((t: any) => t.status === 'APPROVED');

        // Limpar antigos deste canal
        await getSupabase(req).from('wa_templates').delete().eq('channel_id', channel.id);

        // Inserir os novos
        const inserts = approvedTemplates.map((t: any) => ({
            channel_id: channel.id,
            name: t.name,
            language: t.language,
            category: t.category,
            status: t.status,
            components: t.components
        }));

        if (inserts.length > 0) {
            await getSupabase(req).from('wa_templates').insert(inserts);
        }

        res.json({ success: true, count: inserts.length });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/templates/send', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { conversation_id, template_name, language_code } = req.body;
        const { data: convData } = await getSupabase(req).from('wa_conversations').select('*').eq('id', conversation_id).eq('empresa_id', req.user!.empresa_id).single();
        if (!convData) return res.status(404).json({ error: 'Conversa não encontrada' });

        const conv = convData;
        const { WhatsAppChannelManager } = require('../services/WhatsAppChannelManager');
        const sent = await WhatsAppChannelManager.sendTemplateMessage(getSupabase(req), conv.channel_id, conv.phone_number, template_name, language_code);
        const enviouComSucesso = sent === true || (typeof sent === 'string' && !sent.startsWith('ERROR:'));

        if (enviouComSucesso) {
            // Guardar mensagem na BD
            await getSupabase(req).from('wa_messages').insert({
                conversation_id,
                direction: 'outbound',
                content: `[TEMPLATE ENVIADO]: ${template_name}`,
                status: 'delivered',
                message_id: typeof sent === 'string' ? sent : null,
                agent_id: req.user!.id
            });
            await getSupabase(req).from('wa_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation_id);
            res.json({ success: true });
        } else {
            res.status(500).json({ error: typeof sent === 'string' ? sent.replace(/^ERROR: /, '') : 'Falha ao enviar o template pela API' });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/templates', requireAuth, async (req: AuthRequest, res: Response) => {
    const { data } = await getSupabase(req).from('wa_templates').select('*').eq('empresa_id', req.user!.empresa_id);
    res.json({ success: true, templates: data });
});

// Rota para o Operador Humano (RH) responder manualmente
router.post('/send', requireAuth, async (req: AuthRequest, res: Response) => {
    const { conversation_id, content, type = 'text', templateData } = req.body;
    
    // Buscar detalhes da conversa com o channel
    const { data: conv } = await getSupabase(req)
        .from('wa_conversations')
        .select('*, wa_channels(provider)')
        .eq('id', conversation_id)
        .eq('empresa_id', req.user!.empresa_id)
        .single();

    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

    // VERIFICAÇÃO 24 HORAS Apenas para META
    if (type !== 'template' && conv.wa_channels?.provider === 'meta') {
        if (!conv.last_client_message_at) {
            return res.status(403).json({ error: 'A janela de 24 horas está fechada. O cliente nunca enviou uma mensagem.' });
        }
        const hoursSinceLastClientMessage = (new Date().getTime() - new Date(conv.last_client_message_at).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastClientMessage > 24) {
            return res.status(403).json({ error: 'A janela de 24 horas expirou. Deve utilizar um Template da Meta para iniciar a conversa.' });
        }
    }

    // 1. Guardar na BD local
    const tempMessageId = 'out_' + Date.now() + Math.floor(Math.random() * 1000);
    const { data: newMsg, error: insertErr } = await getSupabase(req).from('wa_messages').insert({
        conversation_id,
        message_id: tempMessageId,
        direction: 'outbound',
        content,
        status: 'sending',
        agent_id: req.user!.id
    }).select().single();

    if (insertErr || !newMsg) {
        console.error('Erro ao inserir mensagem:', insertErr);
        return res.status(500).json({ error: 'Falha ao guardar mensagem na base de dados.' });
    }

    // 2. Chamar a API externa fisicamente (Evolution ou Meta)
    const { WhatsAppChannelManager } = require('../services/WhatsAppChannelManager');
    const sent = await WhatsAppChannelManager.sendMessage(getSupabase(req), conv.channel_id, conv.phone_number, content);
    
    if (sent && typeof sent === 'string' && !sent.startsWith('ERROR:')) {
        const updateData: any = { status: 'delivered', message_id: sent };
        await getSupabase(req).from('wa_messages').update(updateData).eq('id', newMsg!.id);
    } else if (sent === true) {
        await getSupabase(req).from('wa_messages').update({ status: 'delivered' }).eq('id', newMsg!.id);
    } else {
        const errorMsg = typeof sent === 'string' && sent.startsWith('ERROR:') ? sent : 'failed';
        await getSupabase(req).from('wa_messages').update({ status: 'failed', content: errorMsg }).eq('id', newMsg!.id);
    }
    
    await getSupabase(req).from('wa_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation_id);

    try {
        if (req.body.pause_bot) {
            await getSupabase(req).from('clientes').update({ bot_paused: true }).eq('telefone', conv.phone_number);
        }
    } catch(err) {
        console.error("Erro ao pausar bot localmente", err);
    }

    res.json({ success: true, message: newMsg });
});

// Rota para envio de Mídia (Base64)
router.post('/send-media', requireAuth, async (req: AuthRequest, res: Response) => {
    const { conversation_id, mediaBase64, fileName } = req.body;
    
    const { data: conv } = await getSupabase(req)
        .from('wa_conversations')
        .select('*, wa_channels(provider)')
        .eq('id', conversation_id)
        .eq('empresa_id', req.user!.empresa_id)
        .single();

    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

    // VERIFICAÇÃO 24 HORAS Apenas para META
    if (conv.wa_channels?.provider === 'meta') {
        if (!conv.last_client_message_at) {
            return res.status(403).json({ error: 'A janela de 24 horas está fechada.' });
        }
        const hoursSinceLastClientMessage = (new Date().getTime() - new Date(conv.last_client_message_at).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastClientMessage > 24) {
            return res.status(403).json({ error: 'A janela de 24 horas expirou.' });
        }
    }

    // 1. Guardar na BD local com o placeholder
    const tempMessageId = 'out_media_' + Date.now() + Math.floor(Math.random() * 1000);
    const { data: newMsg, error: insertErr } = await getSupabase(req).from('wa_messages').insert({
        conversation_id,
        message_id: tempMessageId,
        direction: 'outbound',
        content: `[MEDIA_BASE64:${mediaBase64}]`,
        status: 'sending',
        agent_id: req.user!.id
    }).select().single();

    if (insertErr || !newMsg) {
        console.error('Erro ao inserir mensagem de mídia:', insertErr);
        return res.status(500).json({ error: 'Falha ao guardar mensagem de mídia na base de dados.' });
    }

    // 2. Chamar a API externa fisicamente (Evolution ou Meta)
    const { WhatsAppChannelManager } = require('../services/WhatsAppChannelManager');
    
    // Supondo que você criou ou vai criar sendMediaMessage
    let sent = false;
    try {
        sent = await WhatsAppChannelManager.sendMediaMessage(getSupabase(req), conv.channel_id, conv.phone_number, mediaBase64, fileName);
    } catch(err) {
        console.error("Erro ao enviar mídia via API", err);
    }
    
    if (sent) {
        await getSupabase(req).from('wa_messages').update({ status: 'delivered' }).eq('id', newMsg!.id);
    } else {
        await getSupabase(req).from('wa_messages').update({ status: 'failed' }).eq('id', newMsg!.id);
    }
    
    await getSupabase(req).from('wa_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation_id);

    try {
        await getSupabase(req).from('clientes').update({ bot_paused: true }).eq('telefone', conv.phone_number);
    } catch(err) {
        console.error("Erro ao pausar bot localmente", err);
    }

    res.json({ success: true, message: newMsg });
});

// Rota para alternar o estado de bot_paused de um cliente
router.put('/toggle-bot/:telefone', requireAuth, async (req: Request, res: Response) => {
    const telefone = req.params.telefone;
    const { paused } = req.body;
    try {
        await getSupabase(req).from('clientes').update({ bot_paused: !!paused }).eq('telefone', telefone);
        res.json({ success: true, paused: !!paused });
    } catch(err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Rota para consultar o estado atual do bot de um cliente
router.get('/bot-status/:telefone', requireAuth, async (req: Request, res: Response) => {
    const telefone = req.params.telefone;
    try {
        const { data: client } = await getSupabase(req).from('clientes').select('bot_paused').eq('telefone', telefone).single();
        res.json({ success: true, paused: client ? client.bot_paused === true : false });
    } catch(err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ==============================================================
// GRUPOS DE WHATSAPP — resumo automático (IA) e resposta automática
// a comentários de clientes em grupos de vendas.
// ==============================================================

// Descobrir grupos existentes na instância Evolution da empresa, e
// cruzar com os que já estão registados (para mostrar o estado atual).
router.get('/grupos/descobrir', requireAuth, async (req: AuthRequest, res: Response) => {
    const empresaId = req.user?.empresa_id;
    if (!empresaId) return res.status(400).json({ error: 'Empresa não encontrada' });
    const instanceName = `SISTEMA_EMP_${empresaId}`;
    const apiUrl = process.env.EVOLUTION_API_URL || 'https://evolution.topconsultores.pt';
    const apiKey = process.env.AUTHENTICATION_API_KEY || '';

    try {
        const { data: channel } = await getSupabase(req).from('wa_channels').select('id')
            .eq('provider', 'evolution').eq('empresa_id', empresaId).maybeSingle();
        if (!channel) return res.status(400).json({ error: 'Nenhum canal Evolution ligado. Ligue o WhatsApp primeiro.' });

        const evoRes = await fetch(`${apiUrl}/group/fetchAllGroups/${instanceName}?getParticipants=false`, {
            headers: { 'apikey': apiKey }
        });
        if (!evoRes.ok) return res.status(502).json({ error: 'Não foi possível obter os grupos da Evolution API.' });
        const evoGroups: any[] = await evoRes.json();

        const { data: registados } = await getSupabase(req).from('wa_grupos').select('*').eq('channel_id', channel.id);
        const registadosPorJid = new Map((registados || []).map((g: any) => [g.group_jid, g]));

        const grupos = (evoGroups || []).map((g: any) => {
            const registro = registadosPorJid.get(g.id);
            return {
                group_jid: g.id,
                nome: g.subject || g.id,
                membros: g.size || 0,
                registado: !!registro,
                config: registro || null,
            };
        });

        res.json({ success: true, channel_id: channel.id, grupos });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/grupos', requireAuth, async (req: AuthRequest, res: Response) => {
    const empresaId = req.user?.empresa_id;
    if (!empresaId) return res.status(400).json({ error: 'Empresa não encontrada' });
    const { channel_id, group_jid, nome } = req.body;
    if (!channel_id || !group_jid || !nome) return res.status(400).json({ error: 'Dados em falta.' });

    try {
        const { data, error } = await getSupabase(req).from('wa_grupos').insert({
            empresa_id: empresaId, channel_id, group_jid, nome, monitorizar: true,
        }).select('*').single();
        if (error) throw error;
        res.json({ success: true, grupo: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/grupos', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { data: grupos, error } = await getSupabase(req).from('wa_grupos').select('*').order('criado_em', { ascending: false });
        if (error) throw error;

        const comStats = await Promise.all((grupos || []).map(async (g: any) => {
            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
            const { count } = await getSupabase(req).from('wa_grupo_mensagens').select('*', { count: 'exact', head: true })
                .eq('grupo_id', g.id).gte('criado_em', hoje.toISOString());
            const { data: ultima } = await getSupabase(req).from('wa_grupo_mensagens').select('criado_em')
                .eq('grupo_id', g.id).order('criado_em', { ascending: false }).limit(1).maybeSingle();
            return { ...g, mensagens_hoje: count || 0, ultima_mensagem_em: ultima?.criado_em || null };
        }));

        res.json({ success: true, grupos: comStats });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/grupos/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { contexto_negocio, monitorizar, resposta_automatica_ativa, cooldown_min, respostas_max_hora, nome } = req.body;
        const updates: any = {};
        if (contexto_negocio !== undefined) updates.contexto_negocio = contexto_negocio;
        if (monitorizar !== undefined) updates.monitorizar = monitorizar;
        if (resposta_automatica_ativa !== undefined) updates.resposta_automatica_ativa = resposta_automatica_ativa;
        if (cooldown_min !== undefined) updates.cooldown_min = cooldown_min;
        if (respostas_max_hora !== undefined) updates.respostas_max_hora = respostas_max_hora;
        if (nome !== undefined) updates.nome = nome;

        const { data, error } = await getSupabase(req).from('wa_grupos').update(updates).eq('id', req.params.id).select('*').single();
        if (error) throw error;
        res.json({ success: true, grupo: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/grupos/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { error } = await getSupabase(req).from('wa_grupos').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/grupos/:id/mensagens', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 100, 300);
        const { data, error } = await getSupabase(req).from('wa_grupo_mensagens').select('*')
            .eq('grupo_id', req.params.id).order('criado_em', { ascending: false }).limit(limit);
        if (error) throw error;
        res.json({ success: true, mensagens: (data || []).reverse() });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/grupos/:id/resumos', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { data, error } = await getSupabase(req).from('wa_grupo_resumos').select('*')
            .eq('grupo_id', req.params.id).order('criado_em', { ascending: false }).limit(30);
        if (error) throw error;
        res.json({ success: true, resumos: data || [] });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/grupos/:id/resumir', requireAuth, async (req: AuthRequest, res: Response) => {
    const empresaId = req.user?.empresa_id;
    if (!empresaId) return res.status(400).json({ error: 'Empresa não encontrada' });
    try {
        const { data: grupo } = await getSupabase(req).from('wa_grupos').select('id, empresa_id').eq('id', req.params.id).maybeSingle();
        if (!grupo) return res.status(404).json({ error: 'Grupo não encontrado.' });

        const horas = Number(req.body?.horas) || 24;
        const resumo = await WhatsAppGroupService.gerarResumo(grupo.empresa_id, grupo.id, horas, getSupabase(req));
        res.json({ success: true, resumo });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
