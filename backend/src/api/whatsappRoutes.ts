import { Router, Request, Response } from 'express';
import { supabase, getSupabase } from '../lib/supabaseClient';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { WorkflowEngine } from '../services/WorkflowEngine';

const router = Router();

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
        // Estrutura básica Evolution API
        if (body.event === 'messages.upsert') {
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

                let phoneNumber = msg.key.remoteJid?.split('@')[0];
                if (phoneNumber && phoneNumber.includes(':')) {
                    phoneNumber = phoneNumber.split(':')[0];
                }
                if (phoneNumber) phoneNumber = phoneNumber.replace(/\D/g, ''); // Somente números
                let content = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
                
                if (!content) {
                    const b64 = msg.message?.base64 || msg.base64 || msg.message?.imageMessage?.base64 || msg.message?.videoMessage?.base64 || msg.message?.audioMessage?.base64 || msg.message?.documentMessage?.base64 || msg.message?.stickerMessage?.base64;
                    if (msg.message?.imageMessage) {
                        content = msg.message.imageMessage.caption || '[Imagem]';
                        if (b64) content += `\n\n[MEDIA_BASE64:data:${msg.message.imageMessage.mimetype || 'image/jpeg'};base64,${b64}]`;
                    } else if (msg.message?.videoMessage) {
                        content = msg.message.videoMessage.caption || '[Vídeo]';
                        if (b64) content += `\n\n[MEDIA_BASE64:data:${msg.message.videoMessage.mimetype || 'video/mp4'};base64,${b64}]`;
                    } else if (msg.message?.audioMessage) {
                        content = '[Áudio]';
                        if (b64) content += `\n\n[MEDIA_BASE64:data:${msg.message.audioMessage.mimetype || 'audio/ogg'};base64,${b64}]`;
                    } else if (msg.message?.documentMessage) {
                        content = msg.message.documentMessage.fileName ? `[Documento] ${msg.message.documentMessage.fileName}` : '[Documento]';
                        if (b64) content += `\n\n[MEDIA_BASE64:data:${msg.message.documentMessage.mimetype || 'application/octet-stream'};base64,${b64}]`;
                    } else if (msg.message?.stickerMessage) {
                        content = '[Sticker]';
                        if (b64) content += `\n\n[MEDIA_BASE64:data:${msg.message.stickerMessage.mimetype || 'image/webp'};base64,${b64}]`;
                    } else if (msg.message?.locationMessage) {
                        content = '[Localização]';
                    } else if (Object.keys(msg.message || {}).length > 0) {
                        content = '[Media]';
                    }
                }
                
                let contactName = msg.pushName;
                if (!contactName) {
                    const instanceName = body.instance || req.body?.instance;
                    const evolutionUrl = process.env.EVOLUTION_API_URL || 'https://evolution.topconsultores.pt';
                    const apikey = process.env.AUTHENTICATION_API_KEY || '';
                    if (instanceName && apikey) {
                        try {
                            const profileRes = await fetch(`${evolutionUrl}/chat/fetchProfile/${instanceName}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'apikey': apikey },
                                body: JSON.stringify({ number: msg.key.remoteJid })
                            });
                            if (profileRes.ok) {
                                const profileData = await profileRes.json();
                                if (profileData.name) contactName = profileData.name;
                                else if (profileData.pushName) contactName = profileData.pushName;
                            }
                        } catch (e) {
                            console.error('Erro ao buscar perfil da Evolution API:', e);
                        }
                    }
                }
                contactName = contactName || phoneNumber;

                if (!phoneNumber || !content) continue;

                // Para já, assumimos um channel_id fixo ou buscamos pelo ID da instância no req.body
                // Vamos simular buscar o channel Evolution
                const { data: channelId } = await supabase.rpc('get_wa_channel_id', { p_provider: 'evolution' });
                if (!channelId) continue;

                await WorkflowEngine.processIncomingMessage({
                    channel_id: channelId,
                    phone_number: phoneNumber,
                    contact_name: contactName,
                    content: content,
                    direction: 'inbound',
                    id: msg.key.id
                });
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
            if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
                const change = body.entry[0].changes[0].value;
                const msg = change.messages[0];
                const contact = change.contacts?.[0];

                let phoneNumber = msg.from;
                if (phoneNumber) phoneNumber = phoneNumber.replace(/\D/g, ''); // Remove +, espaços, etc.
                const content = msg.text?.body || '';
                const contactName = contact?.profile?.name || phoneNumber;

                const { data: channelId } = await supabase.rpc('get_wa_channel_id', { p_provider: 'meta' });

                if (channelId) {
                    await WorkflowEngine.processIncomingMessage({
                        channel_id: channelId,
                        phone_number: phoneNumber,
                        contact_name: contactName,
                        content: content,
                        direction: 'inbound',
                        id: msg.id
                    });
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
router.post('/config/meta', requireAuth, async (req: Request, res: Response) => {
    const { appId, phoneNumberId, accessToken, verifyToken } = req.body;

    if (!appId || !phoneNumberId || !accessToken || !verifyToken) {
        return res.status(400).json({ success: false, error: 'Todos os campos são obrigatórios' });
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
            .single();

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
                credentials: creds
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
        .eq('id', conversation_id);
    
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

router.get('/conversations/:id/audit', requireAuth, async (req: Request, res: Response) => {
    const conversation_id = req.params.id;
    const { data, error } = await getSupabase(req)
        .from('wa_audit_logs')
        .select('*')
        .eq('conversation_id', conversation_id)
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

router.get('/conversations/:id/messages', requireAuth, async (req: Request, res: Response) => {
    const { data, error } = await getSupabase(req)
        .from('wa_messages')
        .select('*')
        .eq('conversation_id', req.params.id)
        .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, messages: data });
});

// ==============================================================
// METATEMPLATES & 24H WINDOW LOGIC
// ==============================================================

// Estado da Instância Evolution
router.get('/evolution/instance/state', requireAuth, async (req: AuthRequest, res: Response) => {
    const empresaId = req.user?.empresa_id;
    if (!empresaId) return res.status(400).json({ error: 'Empresa não encontrada' });
    const instanceName = `SISTEMA_EMP_${empresaId}`;
    const apiUrl = process.env.EVOLUTION_API_URL || 'https://evolution.topconsultores.pt';
    const apiKey = process.env.AUTHENTICATION_API_KEY || '';

    try {
        const stateRes = await fetch(`${apiUrl}/instance/connectionState/${instanceName}`, { headers: { 'apikey': apiKey } });
        if (stateRes.status === 404) return res.json({ success: true, state: 'disconnected' });
        const stateData = await stateRes.json();
        return res.json({ success: true, state: stateData.instance?.state || 'disconnected' });
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
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
        await getSupabase(req).from('wa_channels').update({ status: 'disconnected' }).eq('provider', 'evolution');
        return res.json({ success: true });
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
        let { data: channel, error: channelError } = await userClient.from('wa_channels').select('id').eq('provider', 'evolution').maybeSingle();
        
        if (!channel) {
            const { data, error: insertError } = await userClient.from('wa_channels')
                .insert({ name: 'Evolution API', provider: 'evolution', status: 'connected', credentials: { instanceName } })
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
                } else {
                    // Fallback: Chamar fetchProfile para obter o wuid real
                    try {
                        const profileRes = await fetch(`${apiUrl}/chat/fetchProfile/${instanceName}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                            body: JSON.stringify({ number: remoteJid })
                        });
                        if (profileRes.ok) {
                            const profileData = await profileRes.json();
                            if (profileData.wuid) {
                                realJid = profileData.wuid;
                            }
                        }
                    } catch (e) {
                        console.error(`[sync-chats] Falha ao resolver @lid para ${remoteJid}:`, e);
                    }
                }
            }
            
            // Ignorar grupos (@g.us) e chats sem JID
            if (!realJid || realJid.includes('@g.us')) continue; 
            
            const phoneNumber = realJid.split('@')[0];
            const contactName = chat.pushName || chat.name || chat.verifiedName || phoneNumber;
            
            // Tentar obter a foto de perfil (com timeout curto para não bloquear)
            let contactPicture: string | null = null;
            try {
                const picRes: any = await fetchWithTimeout(`${apiUrl}/chat/fetchProfilePictureUrl/${instanceName}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                    body: JSON.stringify({ number: remoteJid })
                }, 8000);
                if (picRes.ok) {
                    const picData = await picRes.json();
                    if (picData.profilePictureUrl) contactPicture = picData.profilePictureUrl;
                }
            } catch (e) { /* silent fail - foto não é crítica */ }

            // Verifica se a conversa já existe
            const { data: conv } = await getSupabase(req).from('wa_conversations').select('id').eq('phone_number', phoneNumber).single();

            const tsMs = chat.conversationTimestamp ? chat.conversationTimestamp * 1000 : Date.now();
            const lastMsgAt = new Date(tsMs).toISOString();
            let convId = conv?.id;

            if (conv) {
                // Atualizar foto e última mensagem (opcional)
                const updatePayload: any = { updated_at: new Date().toISOString() };
                if (contactPicture) updatePayload.contact_picture = contactPicture;
                await getSupabase(req).from('wa_conversations').update(updatePayload).eq('id', conv.id);
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
        let stateRes = await fetch(`${apiUrl}/instance/connectionState/${instanceName}`, { headers: { 'apikey': apiKey } });

        if (stateRes.status === 404) {
            await fetch(`${apiUrl}/instance/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                body: JSON.stringify({ instanceName: instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: true })
            });
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const connectRes = await fetch(`${apiUrl}/instance/connect/${instanceName}`, { headers: { 'apikey': apiKey } });
        const connectData = await connectRes.json();

        // Ensure Webhook is set
        const publicUrl = process.env.BACKEND_PUBLIC_URL || `https://${req.headers.host}`;
        try {
            await fetch(`${apiUrl}/webhook/set/${instanceName}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                body: JSON.stringify({ webhook: { url: `${publicUrl}/api/whatsapp/webhook/evolution`, enabled: true, byEvents: false, base64: true, events: ["MESSAGES_UPSERT"] } })
            });
        } catch(e) {}

        const userClient = getSupabase(req);
        const { data: channel } = await userClient.from('wa_channels').select('id').eq('provider', 'evolution').maybeSingle();
        if (!channel) {
            await userClient.from('wa_channels').insert({ name: 'Evolution API', provider: 'evolution', status: 'connected', credentials: { instanceName } });
        }

        if (connectData.base64) {
            return res.json({ success: true, qr: connectData.base64, state: 'connecting' });
        } else {
            return res.json({ success: true, state: connectData.instance?.state || 'connected', message: 'Já ligado ou a aguardar' });
        }
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

router.post('/templates/sync', requireAuth, async (req: Request, res: Response) => {
    try {
        const { data: channel } = await getSupabase(req).from('wa_channels').select('*').eq('provider', 'meta').single();
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
        const { data: convData } = await getSupabase(req).from('wa_conversations').select('*').eq('id', conversation_id).single();
        if (!convData) return res.status(404).json({ error: 'Conversa não encontrada' });

        const conv = convData;
        const { WhatsAppChannelManager } = require('../services/WhatsAppChannelManager');
        const sent = await WhatsAppChannelManager.sendTemplateMessage(conv.channel_id, conv.phone_number, template_name, language_code);

        if (sent) {
            // Guardar mensagem na BD
            await getSupabase(req).from('wa_messages').insert({
                conversation_id,
                direction: 'outbound',
                content: `[TEMPLATE ENVIADO]: ${template_name}`,
                status: 'delivered',
                agent_id: req.user!.id
            });
            await getSupabase(req).from('wa_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation_id);
            res.json({ success: true });
        } else {
            res.status(500).json({ error: 'Falha ao enviar o template pela API' });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/templates', requireAuth, async (req: Request, res: Response) => {
    const { data } = await getSupabase(req).from('wa_templates').select('*');
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
    const { data: newMsg } = await getSupabase(req).from('wa_messages').insert({
        conversation_id,
        direction: 'outbound',
        content,
        status: 'sending',
        agent_id: req.user!.id
    }).select().single();

    // 2. Chamar a API externa fisicamente (Evolution ou Meta)
    const { WhatsAppChannelManager } = require('../services/WhatsAppChannelManager');
    const sent = await WhatsAppChannelManager.sendMessage(conv.channel_id, conv.phone_number, content);
    
    if (sent) {
        await getSupabase(req).from('wa_messages').update({ status: 'delivered' }).eq('id', newMsg!.id);
    } else {
        await getSupabase(req).from('wa_messages').update({ status: 'failed' }).eq('id', newMsg!.id);
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
    const { data: newMsg } = await getSupabase(req).from('wa_messages').insert({
        conversation_id,
        direction: 'outbound',
        content: `[MEDIA_BASE64:${mediaBase64}]`,
        status: 'sending',
        agent_id: req.user!.id
    }).select().single();

    // 2. Chamar a API externa fisicamente (Evolution ou Meta)
    const { WhatsAppChannelManager } = require('../services/WhatsAppChannelManager');
    
    // Supondo que você criou ou vai criar sendMediaMessage
    let sent = false;
    try {
        sent = await WhatsAppChannelManager.sendMediaMessage(conv.channel_id, conv.phone_number, mediaBase64, fileName);
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

export default router;
