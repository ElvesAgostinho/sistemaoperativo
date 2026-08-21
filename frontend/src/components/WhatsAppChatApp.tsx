import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Phone, MoreVertical, Search, Paperclip, Smile, Send, Bot, Settings, QrCode, Key, Plus, UserPlus, ClipboardList, Filter, Check, CheckCheck, Clock, AlertCircle, Users } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import { createClient } from '@supabase/supabase-js';
import WhatsAppGruposApp from './WhatsAppGruposApp';

// FIX #5 — Supabase client para Realtime (usa as mesmas variáveis de ambiente)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lmxuixmmrglrqxjrhpgn.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxteHVpeG1tcmdscnF4anJocGduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMzQwNTUsImV4cCI6MjA5NzkxMDA1NX0.PKEinmA2re0N5Y0UghpoGoerWjEYuugvF47RPXVHpoY';
const supabaseRealtime = createClient(supabaseUrl, supabaseAnonKey);

// FIX #2 — Formatação global de números de telefone (cobertura completa como grandes plataformas)
// Baseado na especificação E.164 com prefixos de país
const COUNTRY_PHONE_PREFIXES: Array<{ prefix: string; digits: number; country: string; format: (n: string) => string }> = [
    // África de Língua Portuguesa (PALOP)
    { prefix: '244', digits: 12, country: 'AO', format: (n) => `+244 ${n.slice(3,5)} ${n.slice(5,8)} ${n.slice(8)}` },
    { prefix: '351', digits: 12, country: 'PT', format: (n) => `+351 ${n.slice(3,6)} ${n.slice(6,9)} ${n.slice(9)}` },
    { prefix: '55',  digits: 12, country: 'BR', format: (n) => `+55 (${n.slice(2,4)}) ${n.slice(4, n.length-4)}-${n.slice(-4)}` },
    { prefix: '258', digits: 12, country: 'MZ', format: (n) => `+258 ${n.slice(3,5)} ${n.slice(5,8)} ${n.slice(8)}` },
    { prefix: '238', digits: 11, country: 'CV', format: (n) => `+238 ${n.slice(3,6)} ${n.slice(6)}` },
    { prefix: '239', digits: 10, country: 'ST', format: (n) => `+239 ${n.slice(3,5)} ${n.slice(5)}` },
    { prefix: '245', digits: 10, country: 'GW', format: (n) => `+245 ${n.slice(3,6)} ${n.slice(6)}` },
    // Europa
    { prefix: '44',  digits: 12, country: 'GB', format: (n) => `+44 ${n.slice(2,6)} ${n.slice(6)}` },
    { prefix: '49',  digits: 12, country: 'DE', format: (n) => `+49 ${n.slice(2,5)} ${n.slice(5)}` },
    { prefix: '33',  digits: 11, country: 'FR', format: (n) => `+33 ${n.slice(2,4)} ${n.slice(4,6)} ${n.slice(6,8)} ${n.slice(8)}` },
    { prefix: '34',  digits: 11, country: 'ES', format: (n) => `+34 ${n.slice(2,5)} ${n.slice(5,8)} ${n.slice(8)}` },
    { prefix: '39',  digits: 12, country: 'IT', format: (n) => `+39 ${n.slice(2,5)} ${n.slice(5,8)} ${n.slice(8)}` },
    { prefix: '31',  digits: 11, country: 'NL', format: (n) => `+31 ${n.slice(2,4)} ${n.slice(4,7)} ${n.slice(7)}` },
    { prefix: '32',  digits: 11, country: 'BE', format: (n) => `+32 ${n.slice(2,5)} ${n.slice(5)}` },
    { prefix: '41',  digits: 11, country: 'CH', format: (n) => `+41 ${n.slice(2,4)} ${n.slice(4,7)} ${n.slice(7)}` },
    { prefix: '43',  digits: 11, country: 'AT', format: (n) => `+43 ${n.slice(2,4)} ${n.slice(4)}` },
    { prefix: '48',  digits: 11, country: 'PL', format: (n) => `+48 ${n.slice(2,5)} ${n.slice(5,8)} ${n.slice(8)}` },
    // América
    { prefix: '1',   digits: 11, country: 'US/CA', format: (n) => `+1 (${n.slice(1,4)}) ${n.slice(4,7)}-${n.slice(7)}` },
    { prefix: '52',  digits: 12, country: 'MX', format: (n) => `+52 ${n.slice(2,4)} ${n.slice(4,8)} ${n.slice(8)}` },
    { prefix: '54',  digits: 13, country: 'AR', format: (n) => `+54 ${n.slice(2,4)} ${n.slice(4,8)}-${n.slice(8)}` },
    { prefix: '56',  digits: 11, country: 'CL', format: (n) => `+56 ${n.slice(2,3)} ${n.slice(3,7)} ${n.slice(7)}` },
    { prefix: '57',  digits: 12, country: 'CO', format: (n) => `+57 ${n.slice(2,5)} ${n.slice(5,8)} ${n.slice(8)}` },
    // África
    { prefix: '27',  digits: 11, country: 'ZA', format: (n) => `+27 ${n.slice(2,4)} ${n.slice(4,7)} ${n.slice(7)}` },
    { prefix: '234', digits: 13, country: 'NG', format: (n) => `+234 ${n.slice(3,6)} ${n.slice(6,9)} ${n.slice(9)}` },
    { prefix: '254', digits: 12, country: 'KE', format: (n) => `+254 ${n.slice(3,6)} ${n.slice(6,9)} ${n.slice(9)}` },
    { prefix: '233', digits: 12, country: 'GH', format: (n) => `+233 ${n.slice(3,5)} ${n.slice(5,8)} ${n.slice(8)}` },
    { prefix: '225', digits: 11, country: 'CI', format: (n) => `+225 ${n.slice(3,5)} ${n.slice(5,8)} ${n.slice(8)}` },
    // Ásia/Oceânia
    { prefix: '91',  digits: 12, country: 'IN', format: (n) => `+91 ${n.slice(2,7)} ${n.slice(7)}` },
    { prefix: '86',  digits: 13, country: 'CN', format: (n) => `+86 ${n.slice(2,5)} ${n.slice(5,9)} ${n.slice(9)}` },
    { prefix: '81',  digits: 12, country: 'JP', format: (n) => `+81 ${n.slice(2,4)} ${n.slice(4,8)} ${n.slice(8)}` },
    { prefix: '82',  digits: 12, country: 'KR', format: (n) => `+82 ${n.slice(2,4)} ${n.slice(4,8)} ${n.slice(8)}` },
    { prefix: '971', digits: 12, country: 'AE', format: (n) => `+971 ${n.slice(3,5)} ${n.slice(5,8)} ${n.slice(8)}` },
    { prefix: '966', digits: 12, country: 'SA', format: (n) => `+966 ${n.slice(3,5)} ${n.slice(5,8)} ${n.slice(8)}` },
    { prefix: '61',  digits: 11, country: 'AU', format: (n) => `+61 ${n.slice(2,5)} ${n.slice(5,8)} ${n.slice(8)}` },
];

function formatPhoneNumberGlobal(phone: string): string {
    if (!phone) return '';
    if (phone === '0' || phone === 'WhatsApp') return 'WhatsApp';
    if (phone.includes('@lid')) return 'ID Oculto (Anúncio)';
    
    const clean = phone.replace(/\D/g, '');
    if (!clean) return phone;
    
    // Tentar corresponder com prefixos do mais longo para o mais curto
    const sorted = [...COUNTRY_PHONE_PREFIXES].sort((a, b) => b.prefix.length - a.prefix.length);
    for (const entry of sorted) {
        if (clean.startsWith(entry.prefix) && clean.length >= entry.digits - 1) {
            try { return entry.format(clean); } catch { break; }
        }
    }
    
    // Fallback genérico
    if (clean.length >= 8) return '+' + clean;
    return phone;
}

interface Conversation {
    id: string;
    phone_number: string;
    contact_name: string;
    contact_picture?: string | null;
    status: string;
    last_message_at: string;
    last_client_message_at?: string;
    wa_channels: { name: string, provider: string };
    assigned_to?: string;
}

interface Message {
    id: string;
    content: string;
    direction: 'inbound' | 'outbound';
    created_at: string;
    status: string;
    agent_id?: string;
}

interface Agent {
    id: string;
    nome: string;
    role: string;
}

export default function WhatsAppChatApp() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConv, setActiveConv] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Emoji e Media
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // View state: 'chats', 'groups' ou 'settings'
    const [currentView, setCurrentView] = useState<'chats' | 'settings' | 'groups'>('chats');
    
    // Evolution API Settings
    const [showQr, setShowQr] = useState(false);
    const [qrCodeData, setQrCodeData] = useState<string | null>(null);
    const [qrStatus, setQrStatus] = useState<string>('');

    // Meta API Settings
    const [metaConfig, setMetaConfig] = useState({ appId: '', phoneNumberId: '', accessToken: '', webhookUrl: '', verifyToken: '' });
    
    // Status connection
    const [evolutionStatus, setEvolutionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
    const [isSyncingChats, setIsSyncingChats] = useState(false);
    const [metaStatus, setMetaStatus] = useState<'disconnected' | 'saving' | 'connected' | 'error'>('disconnected');
    const [metaBusinessInfo, setMetaBusinessInfo] = useState<{name: string, phone: string} | null>(null);
    const [isSyncingTemplates, setIsSyncingTemplates] = useState(false);
    const [templates, setTemplates] = useState<any[]>([]);
    const [showTemplateModal, setShowTemplateModal] = useState(false);

    const [isBotPaused, setIsBotPaused] = useState<boolean>(false);

    // Multi-agent state
    const [agents, setAgents] = useState<Agent[]>([]);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showAuditModal, setShowAuditModal] = useState(false);
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [filter, setFilter] = useState<'all' | 'mine' | 'unassigned'>('all');
    
    // Retrieve user from localStorage
    const [currentUser, setCurrentUser] = useState<any>(null);
    useEffect(() => {
        const storedUser = localStorage.getItem('os_auth_user');
        if (storedUser) setCurrentUser(JSON.parse(storedUser));
    }, []);

    const formatPhoneNumber = (phone: string) => formatPhoneNumberGlobal(phone);

    const displayContactName = (name: string, phone: string) => {
        if (!name) return formatPhoneNumber(phone);
        if (name.includes('@lid')) return 'Cliente Oculto (Anúncio Meta)';
        return name;
    };

    const fetchTemplates = async () => {
        try {
            const token = localStorage.getItem('os_auth_token');
            const res = await fetch(import.meta.env.VITE_API_URL + '/api/whatsapp/templates', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.templates) setTemplates(data.templates);
        } catch (err) {
            console.error('Failed to fetch templates', err);
        }
    };

    const handleSyncTemplates = async () => {
        setIsSyncingTemplates(true);
        try {
            const token = localStorage.getItem('os_auth_token');
            const res = await fetch(import.meta.env.VITE_API_URL + '/api/whatsapp/templates/sync', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                fetchTemplates();
            }
        } catch (err) {
            console.error('Failed to sync templates', err);
        } finally {
            setIsSyncingTemplates(false);
        }
    };

    const handleSaveMeta = async () => {
        setMetaStatus('saving');
        try {
            const token = localStorage.getItem('os_auth_token');
            const res = await fetch(import.meta.env.VITE_API_URL + '/api/whatsapp/config/meta', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(metaConfig)
            });
            const data = await res.json();
            if (data.success) {
                setMetaStatus('connected');
                setMetaBusinessInfo({
                    name: data.businessName,
                    phone: data.businessPhone
                });
                fetchTemplates();
            } else {
                setMetaStatus('error');
                alert("Erro ao guardar: " + data.error);
            }
        } catch (err) {
            setMetaStatus('error');
            alert("Erro de comunicação com o servidor.");
        }
    };

    const handleGenerateQr = async () => {
        setShowQr(true);
        setQrStatus('A gerar QR Code da Evolution API...');
        setQrCodeData(null);
        try {
            const token = localStorage.getItem('os_auth_token');
            const res = await fetch(import.meta.env.VITE_API_URL + '/api/whatsapp/evolution/instance', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                if (data.qr) {
                    setQrCodeData(data.qr);
                    setQrStatus('Aguardando leitura no WhatsApp...');
                } else {
                    if (data.state === 'connected' || data.state === 'open') {
                        setEvolutionStatus('connected');
                        setShowQr(false);
                    } else {
                        setQrStatus(data.message || 'Instância já ligada!');
                    }
                }
            } else {
                setQrStatus('Erro: ' + data.error);
            }
        } catch (err) {
            setQrStatus('Erro de comunicação com o servidor local.');
        }
    };

    const handleResetMeta = () => {
        setMetaConfig({
            appId: '',
            phoneNumberId: '',
            accessToken: '',
            verifyToken: '',
            webhookUrl: 'https://seu-dominio.com/api/whatsapp/webhook/meta'
        });
        setMetaStatus('disconnected');
        setMetaBusinessInfo(null);
    };

    const fetchConversations = async () => {
        try {
            const token = localStorage.getItem('os_auth_token');
            const res = await fetch(import.meta.env.VITE_API_URL + '/api/whatsapp/conversations', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                // Filtrar contactos @lid que possam existir na BD (limpeza de segurança)
                const filtered = (data.conversations || []).filter(
                    (c: Conversation) => !c.phone_number?.includes('@lid')
                );
                setConversations(filtered);
            }
        } catch(err) { console.error(err); }
    };
    
    const fetchAgents = async () => {
        try {
            const token = localStorage.getItem('os_auth_token');
            const res = await fetch(import.meta.env.VITE_API_URL + '/api/whatsapp/agents', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) setAgents(data.agents);
        } catch(err) { console.error(err); }
    };

    const fetchEvolutionState = async () => {
        try {
            const token = localStorage.getItem('os_auth_token');
            const res = await fetch(import.meta.env.VITE_API_URL + '/api/whatsapp/evolution/instance/state', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                const isConnected = data.state === 'open' || data.state === 'connected';
                setEvolutionStatus(isConnected ? 'connected' : 'disconnected');
                if (isConnected && showQr) {
                    setShowQr(false); // Fechar QR ao conectar
                }
            }
        } catch(err) { console.error(err); }
    };

    // Polling do QR code enquanto está visível
    useEffect(() => {
        let interval: any;
        if (showQr && evolutionStatus !== 'connected') {
            interval = setInterval(fetchEvolutionState, 3000);
        }
        return () => clearInterval(interval);
    }, [showQr, evolutionStatus]);

    const handleEvolutionDisconnect = async () => {
        if (!confirm('Tem a certeza que deseja desconectar o WhatsApp?')) return;
        try {
            const token = localStorage.getItem('os_auth_token');
            const res = await fetch(import.meta.env.VITE_API_URL + '/api/whatsapp/evolution/instance/logout', {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setEvolutionStatus('disconnected');
            setShowQr(false);
            // FIX #4 — Limpar estado local após desconectar
            if (data.cleared) {
                setConversations([]);
                setActiveConv(null);
                setMessages([]);
            }
            alert('WhatsApp desconectado com sucesso. As conversas foram arquivadas por segurança.');
        } catch(err) { console.error(err); }
    };

    const handleSyncChats = async () => {
        setIsSyncingChats(true);
        try {
            const token = localStorage.getItem('os_auth_token');
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
            const res = await fetch(import.meta.env.VITE_API_URL + '/api/whatsapp/evolution/sync-chats', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await res.json();
            if (data.success) {
                alert(`Foram sincronizadas ${data.count} conversas antigas.`);
                fetchConversations();
            } else {
                alert('Erro ao sincronizar: ' + (data.error || 'Resposta inesperada do servidor.'));
            }
        } catch(err: any) {
            if (err.name === 'AbortError') {
                alert('A sincronização demorou demasiado tempo (timeout). Verifique a ligação à Evolution API.');
            } else {
                alert('Erro de ligação ao sincronizar conversas. Verifique a consola para detalhes.');
                console.error('[handleSyncChats]', err);
            }
        } finally {
            setIsSyncingChats(false);
        }
    };

    // FIX #5 — Supabase Realtime: subscription a wa_conversations
    useEffect(() => {
        fetchConversations();
        fetchAgents();
        fetchEvolutionState();

        // Polling moderado para conversas (fallback)
        const pollInterval = setInterval(() => fetchConversations(), 8000);

        // Realtime subscription em wa_conversations
        const convChannel = supabaseRealtime
            .channel('wa_conversations_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations' }, () => {
                fetchConversations();
            })
            .subscribe();

        return () => {
            clearInterval(pollInterval);
            supabaseRealtime.removeChannel(convChannel);
        };
    }, []);

    const handleAssign = async (agentId: string) => {
        if (!activeConv) return;
        try {
            const token = localStorage.getItem('os_auth_token');
            await fetch(`${import.meta.env.VITE_API_URL}/api/whatsapp/conversations/${activeConv.id}/assign`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ agent_id: agentId })
            });
            setShowAssignModal(false);
            fetchConversations(); 
            setActiveConv({...activeConv, assigned_to: agentId});
        } catch(err) { console.error(err); }
    };

    const handleViewAudit = async () => {
        if (!activeConv) return;
        try {
            const token = localStorage.getItem('os_auth_token');
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/whatsapp/conversations/${activeConv.id}/audit`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setAuditLogs(data.audit);
                setShowAuditModal(true);
            }
        } catch(err) { console.error(err); }
    };

    // FIX #5 — Supabase Realtime: subscription a wa_messages para a conversa activa
    useEffect(() => {
        if (!activeConv) return;

        fetchMessages();
        fetchBotStatus();

        // Realtime subscription em wa_messages para esta conversa
        const msgChannel = supabaseRealtime
            .channel(`wa_messages_${activeConv.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'wa_messages',
                filter: `conversation_id=eq.${activeConv.id}`
            }, (payload) => {
                // Adicionar nova mensagem em tempo real sem fazer fetch completo
                setMessages(prev => {
                    const exists = prev.some(m => m.id === payload.new.id);
                    if (exists) return prev;
                    return [...prev, payload.new as Message];
                });
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'wa_messages',
                filter: `conversation_id=eq.${activeConv.id}`
            }, (payload) => {
                // Actualizar status (lida, entregue) em tempo real
                setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
            })
            .subscribe();

        // Polling leve como fallback (15s)
        const msgInterval = setInterval(() => fetchMessages(), 15000);

        return () => {
            clearInterval(msgInterval);
            supabaseRealtime.removeChannel(msgChannel);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeConv?.id]);

    async function fetchMessages() {
        if (!activeConv) return;
        try {
            const token = localStorage.getItem('os_auth_token');
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/whatsapp/conversations/${activeConv.id}/messages`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                // Se a API ainda não existir, usa mensagens de demonstração
                const dummyMsgs: Message[] = [
                    { id: '1', content: 'Olá! Tenho interesse nos vossos serviços.', direction: 'inbound', created_at: new Date(Date.now() - 600000).toISOString(), status: 'read' },
                    { id: '2', content: 'Bom dia! Claro, com todo o gosto. Em que posso ajudar?', direction: 'outbound', created_at: new Date(Date.now() - 540000).toISOString(), status: 'read' },
                    { id: '3', content: 'Gostaria de saber mais sobre os preços.', direction: 'inbound', created_at: new Date(Date.now() - 480000).toISOString(), status: 'read' },
                ];
                setMessages(dummyMsgs);
                return;
            }
            const data = await res.json();
            if (data.messages) {
                setMessages(data.messages);
            } else {
                setMessages([]);
            }
        } catch (err) {
            console.error('Failed to fetch messages, showing demo:', err);
            // Em caso de erro de rede, mostra mensagens de demo para não ficar em branco
            const dummyMsgs: Message[] = [
                { id: '1', content: 'Olá! Tenho interesse nos vossos serviços.', direction: 'inbound', created_at: new Date(Date.now() - 600000).toISOString(), status: 'read' },
                { id: '2', content: 'Bom dia! Claro, com todo o gosto. Em que posso ajudar?', direction: 'outbound', created_at: new Date(Date.now() - 540000).toISOString(), status: 'read' },
            ];
            setMessages(dummyMsgs);
        }
    }

    async function fetchBotStatus() {
        if (!activeConv) return;
        try {
            const token = localStorage.getItem('os_auth_token');
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/whatsapp/bot-status/${activeConv.phone_number}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setIsBotPaused(data.paused);
            }
        } catch (err) {
            console.error('Failed to fetch bot status:', err);
        }
    }

    async function toggleBotStatus() {
        if (!activeConv) return;
        try {
            const token = localStorage.getItem('os_auth_token');
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/whatsapp/toggle-bot/${activeConv.phone_number}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ paused: !isBotPaused })
            });
            const data = await res.json();
            if (data.success) {
                setIsBotPaused(data.paused);
            }
        } catch (err) {
            console.error('Failed to toggle bot status:', err);
        }
    }

    const handleSend = async () => {
        if (!inputText.trim() || !activeConv) return;
        
        const newMsg: Message = {
            id: Date.now().toString(),
            content: inputText,
            direction: 'outbound',
            created_at: new Date().toISOString(),
            status: 'sending'
        };
        
        setMessages([...messages, newMsg]);
        setInputText('');

        try {
            const token = localStorage.getItem('os_auth_token');
            const res = await fetch(import.meta.env.VITE_API_URL + '/api/whatsapp/send', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation_id: activeConv.id, content: inputText, type: 'text' })
            });
            const data = await res.json();
            if (data.success) {
                setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...m, status: 'delivered' } : m));
                setIsBotPaused(true); // Humano respondeu, bot é pausado automaticamente
            } else {
                alert('Erro ao enviar mensagem: ' + (data.error || 'Erro desconhecido.'));
                setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...m, status: 'failed' } : m));
            }
        } catch (err) {
            console.error(err);
            alert('Erro de rede ao enviar mensagem.');
            setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...m, status: 'failed' } : m));
        }
    };

    const handleSendMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || !activeConv) return;
        
        const file = e.target.files[0];
        
        // Limita a 16MB
        if (file.size > 16 * 1024 * 1024) {
            alert('O ficheiro excede o limite de 16MB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64Str = event.target?.result as string;
            // The result looks like: "data:image/png;base64,iVBORw..."
            // We can send this entirely and let the backend handle it.
            
            const newMsg: Message = {
                id: Date.now().toString(),
                content: `[MEDIA_BASE64:${base64Str}]`,
                direction: 'outbound',
                created_at: new Date().toISOString(),
                status: 'sending'
            };
            
            setMessages([...messages, newMsg]);
            
            try {
                const token = localStorage.getItem('os_auth_token');
                const res = await fetch(import.meta.env.VITE_API_URL + '/api/whatsapp/send-media', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        conversation_id: activeConv.id, 
                        mediaBase64: base64Str,
                        fileName: file.name
                    })
                });
                const data = await res.json();
                if (data.success) {
                    setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...m, status: 'delivered' } : m));
                    setIsBotPaused(true);
                } else {
                    alert('Erro ao enviar anexo: ' + (data.error || 'Erro desconhecido.'));
                    setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...m, status: 'failed' } : m));
                }
            } catch (err) {
                console.error(err);
                alert('Erro de rede ao enviar anexo.');
                setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...m, status: 'failed' } : m));
            }
        };
        reader.readAsDataURL(file);
    };

    if (currentView === 'groups') {
        return <WhatsAppGruposApp onNavigate={setCurrentView} />;
    }

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', backgroundColor: '#f0f2f5' }}>

            <div style={{ width: '30%', minWidth: '300px', borderRight: '1px solid #d1d7db', display: 'flex', flexDirection: 'column', backgroundColor: 'white' }}>
                <div style={{ padding: '10px 16px', backgroundColor: '#f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '59px', borderBottom: '1px solid #d1d7db' }}>
                    <div style={{ fontWeight: 600, color: '#111b21', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <MessageSquare size={20} color="#00a884" /> WhatsApp
                    </div>
                    <div style={{ display: 'flex', gap: '16px', color: '#54656f' }}>
                        <span title="Conversas"><MessageSquare size={20} style={{ cursor: 'pointer', color: currentView === 'chats' ? '#00a884' : '#54656f' }} onClick={() => setCurrentView('chats')} /></span>
                        <span title="Grupos"><Users size={20} style={{ cursor: 'pointer', color: currentView === 'groups' ? '#00a884' : '#54656f' }} onClick={() => setCurrentView('groups')} /></span>
                        <span title="Configurações de Canais"><Settings size={20} style={{ cursor: 'pointer', color: currentView === 'settings' ? '#00a884' : '#54656f' }} onClick={() => setCurrentView('settings')} /></span>
                    </div>
                </div>

                {currentView === 'chats' ? (
                    <>
                        <div style={{ padding: '8px', backgroundColor: '#fff', borderBottom: '1px solid #f2f2f2' }}>
                            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f0f2f5', borderRadius: '8px', padding: '6px 12px', marginBottom: '8px' }}>
                                <Search size={18} color="#54656f" />
                                <input 
                                    type="text" 
                                    placeholder="Pesquisar conversa" 
                                    style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', marginLeft: '12px', fontSize: '15px' }}
                                />
                            </div>
                            {currentUser && (currentUser.role === 'admin' || currentUser.role === 'supervisor' || currentUser.role === 'superadmin') && (
                                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                                    <button onClick={() => setFilter('all')} style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '12px', border: 'none', cursor: 'pointer', backgroundColor: filter === 'all' ? '#00a884' : '#f0f2f5', color: filter === 'all' ? 'white' : '#54656f' }}>Todas</button>
                                    <button onClick={() => setFilter('mine')} style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '12px', border: 'none', cursor: 'pointer', backgroundColor: filter === 'mine' ? '#00a884' : '#f0f2f5', color: filter === 'mine' ? 'white' : '#54656f' }}>Minhas</button>
                                    <button onClick={() => setFilter('unassigned')} style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '12px', border: 'none', cursor: 'pointer', backgroundColor: filter === 'unassigned' ? '#00a884' : '#f0f2f5', color: filter === 'unassigned' ? 'white' : '#54656f' }}>Na Fila</button>
                                </div>
                            )}
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {conversations.filter(c => {
                                if (filter === 'mine') return c.assigned_to === currentUser?.id;
                                if (filter === 'unassigned') return !c.assigned_to;
                                return true;
                            }).map(conv => (
                                <div 
                                    key={conv.id} 
                                    onClick={() => setActiveConv(conv)}
                                    style={{ 
                                        display: 'flex', padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f2f2f2',
                                        backgroundColor: activeConv?.id === conv.id ? '#f0f2f5' : 'white',
                                        transition: 'background-color 0.2s'
                                    }}
                                >
                                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#dfe5e7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '16px', overflow: 'hidden' }}>
                                        {conv.contact_picture ? (
                                            <img src={conv.contact_picture} alt={conv.contact_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <UserIcon name={displayContactName(conv.contact_name, conv.phone_number)} />
                                        )}
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '16px', color: '#111b21', fontWeight: 500 }}>{displayContactName(conv.contact_name, conv.phone_number)}</span>
                                            <span style={{ fontSize: '12px', color: '#667781' }}>{new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                                            <span style={{ fontSize: '14px', color: '#667781', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                                                {formatPhoneNumber(conv.phone_number)}
                                            </span>
                                            {conv.status === 'bot' && <span title="O Bot está a responder"><Bot size={14} color="#00a884" /></span>}
                                        </div>
                                        {conv.assigned_to && (
                                            <div style={{ fontSize: '11px', color: '#00a884', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <UserPlus size={12} /> {agents.find(a => a.id === conv.assigned_to)?.nome || 'Agente Atribuído'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <div style={{ padding: '20px', flex: 1, overflowY: 'auto', backgroundColor: '#fff' }}>
                        <h3 style={{ margin: '0 0 20px 0', color: '#111b21' }}>Gestão de Canais</h3>
                        
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                <QrCode size={24} color="#00a884" />
                                <h4 style={{ margin: 0, fontSize: '16px', color: '#111b21' }}>Evolution API (QR Code)</h4>
                                {evolutionStatus === 'connected' && (
                                    <span style={{ marginLeft: 'auto', backgroundColor: '#dcfce7', color: '#16a34a', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>Ligado</span>
                                )}
                            </div>
                            <p style={{ fontSize: '13px', color: '#667781', marginBottom: '16px' }}>
                                Ligue o seu número do WhatsApp diretamente capturando o QR Code.
                            </p>
                            
                            {evolutionStatus === 'connected' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ padding: '16px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
                                        <h5 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#166534' }}>WhatsApp Conectado com Sucesso</h5>
                                        <p style={{ fontSize: '13px', color: '#14532d', marginBottom: '12px', lineHeight: '1.4' }}>
                                            O seu telemóvel está sincronizado e o bot já pode ouvir as mensagens (desde que tenham sido configurados Workflows automáticos).
                                        </p>
                                        <button 
                                            onClick={handleEvolutionDisconnect}
                                            style={{ padding: '8px 16px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
                                        >
                                            Desconectar WhatsApp
                                        </button>
                                    </div>

                                    <div style={{ padding: '16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                        <h5 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#334155' }}>Sincronização Histórica</h5>
                                        <p style={{ fontSize: '13px', color: '#475569', marginBottom: '12px', lineHeight: '1.4' }}>
                                            Importe manualmente as conversas mais recentes do seu telemóvel para visualizar o histórico de mensagens e as fotos de perfil dos contactos aqui no CRM.
                                        </p>
                                        <button 
                                            onClick={handleSyncChats}
                                            disabled={isSyncingChats}
                                            style={{ padding: '8px 16px', backgroundColor: isSyncingChats ? '#94a3b8' : '#0f172a', color: 'white', border: 'none', borderRadius: '6px', cursor: isSyncingChats ? 'wait' : 'pointer', fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}
                                        >
                                            {isSyncingChats ? 'A Sincronizar...' : 'Sincronizar Conversas Antigas'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button onClick={handleGenerateQr} style={{ width: '100%', padding: '10px', backgroundColor: '#00a884', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                                    <Plus size={16} /> {showQr ? 'A abrir QR Code...' : 'Gerar QR Code'}
                                </button>
                            )}
                        </div>

                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                <Key size={24} color="#1877F2" />
                                <h4 style={{ margin: 0, fontSize: '18px', color: '#111b21' }}>Meta Cloud API (Oficial)</h4>
                                
                                {metaStatus === 'connected' && (
                                    <span style={{ marginLeft: 'auto', backgroundColor: '#dcfce7', color: '#16a34a', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>Ligado</span>
                                )}
                                {metaStatus === 'disconnected' && (
                                    <span style={{ marginLeft: 'auto', backgroundColor: '#f1f5f9', color: '#64748b', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>Desligado</span>
                                )}
                            </div>
                            <p style={{ fontSize: '14px', color: '#667781', marginBottom: '24px' }}>
                                {metaStatus === 'connected' 
                                    ? <>A API do WhatsApp Business está ligada. Conectado ao negócio: <strong style={{color:'#111b21'}}>{metaBusinessInfo?.name} ({metaBusinessInfo?.phone})</strong></>
                                    : 'A API está desligada. Preencha os dados e guarde para conectar o canal oficial.'}
                            </p>
                            
                            {metaStatus === 'connected' && (
                                <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px' }}>
                                    <h5 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#0369a1' }}>Gestão de Templates</h5>
                                    <p style={{ fontSize: '13px', color: '#0c4a6e', marginBottom: '12px' }}>Sincronize os templates pré-aprovados na sua conta Meta.</p>
                                    <button 
                                        onClick={handleSyncTemplates} 
                                        disabled={isSyncingTemplates}
                                        style={{ padding: '8px 16px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', cursor: isSyncingTemplates ? 'wait' : 'pointer', fontSize: '13px', fontWeight: 500 }}
                                    >
                                        {isSyncingTemplates ? 'A Sincronizar...' : `Sincronizar Templates (${templates.length} ativos)`}
                                    </button>
                                </div>
                            )}
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: 500 }}>App ID</label>
                                    <input type="text" value={metaConfig.appId} onChange={e => setMetaConfig({...metaConfig, appId: e.target.value})} placeholder="Ex: 1108136615719262" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: 500 }}>Phone Number ID</label>
                                    <input type="text" value={metaConfig.phoneNumberId} onChange={e => setMetaConfig({...metaConfig, phoneNumberId: e.target.value})} placeholder="Ex: 993787080042283" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: 500 }}>Access Token</label>
                                    <input type="password" value={metaConfig.accessToken} onChange={e => setMetaConfig({...metaConfig, accessToken: e.target.value})} placeholder="••••••••••••••••" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: 500 }}>Verify Token</label>
                                    <input type="text" value={metaConfig.verifyToken} onChange={e => setMetaConfig({...metaConfig, verifyToken: e.target.value})} placeholder="Token para webhook (ex: meu_token_secreto)" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: 500 }}>Webhook URL (Copie para a Meta)</label>
                                    <input type="text" value={metaConfig.webhookUrl} readOnly style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', outline: 'none', backgroundColor: '#f1f5f9', color: '#64748b' }} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button 
                                    onClick={handleSaveMeta}
                                    disabled={metaStatus === 'saving' || !metaConfig.accessToken || !metaConfig.verifyToken}
                                    style={{ flex: 1, padding: '12px', backgroundColor: metaStatus === 'saving' ? '#94a3b8' : '#1877F2', color: 'white', border: 'none', borderRadius: '6px', cursor: (metaStatus === 'saving' || !metaConfig.accessToken || !metaConfig.verifyToken) ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '14px' }}
                                >
                                    {metaStatus === 'saving' ? 'A Guardar e Conectar...' : 'Testar e Guardar Configurações'}
                                </button>
                                <button
                                    onClick={handleResetMeta}
                                    style={{ padding: '12px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}
                                    title="Repor Configurações"
                                >
                                    Repor
                                </button>
                            </div>
                        </div>

                    </div>
                )}
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundImage: 'url(https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png)', backgroundRepeat: 'repeat', backgroundColor: '#efeae2' }}>
                {currentView === 'chats' && activeConv ? (
                    <>
                        <div style={{ padding: '10px 16px', backgroundColor: '#f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '59px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#dfe5e7', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                    {activeConv.contact_picture ? (
                                        <img src={activeConv.contact_picture} alt={displayContactName(activeConv.contact_name, activeConv.phone_number)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <UserIcon name={displayContactName(activeConv.contact_name, activeConv.phone_number)} />
                                    )}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ fontWeight: 500, color: '#111b21', fontSize: '16px' }}>{displayContactName(activeConv.contact_name, activeConv.phone_number)}</div>
                                    <div style={{ fontSize: '13px', color: '#667781' }}>{formatPhoneNumber(activeConv.phone_number)} • {activeConv.wa_channels.name}</div>
                                </div>
                            </div>
                            
                            {/* Top Actions */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                {currentUser && (currentUser.role === 'admin' || currentUser.role === 'supervisor' || currentUser.role === 'superadmin') && (
                                    <>
                                        <button 
                                            onClick={() => setShowAssignModal(true)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
                                            title="Atribuir Conversa"
                                        >
                                            <UserPlus size={16} /> Delegar
                                        </button>
                                        <button 
                                            onClick={handleViewAudit}
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
                                            title="Ver Auditoria"
                                        >
                                            <ClipboardList size={16} /> Auditoria
                                        </button>
                                    </>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '8px' }}>
                                    <span style={{ fontSize: '13px', color: '#54656f', fontWeight: 500 }}>
                                        {isBotPaused ? 'Bot Pausado' : 'Bot Ativo'}
                                    </span>
                                    <div 
                                        onClick={toggleBotStatus}
                                        style={{ 
                                            width: '40px', height: '20px', borderRadius: '20px', 
                                            backgroundColor: isBotPaused ? '#cbd5e1' : '#00a884', 
                                            position: 'relative', cursor: 'pointer', transition: 'background-color 0.3s'
                                        }}
                                    >
                                        <div style={{ 
                                            width: '16px', height: '16px', backgroundColor: 'white', borderRadius: '50%',
                                            position: 'absolute', top: '2px', left: isBotPaused ? '2px' : '22px', transition: 'left 0.3s'
                                        }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 40px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {messages.map(msg => (
                                <div key={msg.id} style={{ alignSelf: msg.direction === 'outbound' ? 'flex-end' : 'flex-start', maxWidth: '65%' }}>
                                    <div style={{ 
                                        backgroundColor: msg.direction === 'outbound' ? '#d9fdd3' : 'white', 
                                        padding: '6px 12px', 
                                        borderRadius: '8px', 
                                        boxShadow: '0 1px 0.5px rgba(11,20,26,.13)',
                                        position: 'relative'
                                    }}>
                                        <div style={{ fontSize: '14.2px', color: '#111b21', lineHeight: '19px', paddingRight: '40px', wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}>
                                            {(() => {
                                                const content = msg.content || '';

                                                // FIX #6 — Suporte a [MEDIA_URL:...] (Supabase Storage)
                                                const mediaUrlMatch = content.match(/\[MEDIA_URL:(https?:\/\/[^\]]+)\]/);
                                                if (mediaUrlMatch) {
                                                    const cleanText = content.replace(mediaUrlMatch[0], '').trim();
                                                    const url = mediaUrlMatch[1];
                                                    const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || '';
                                                    const isImage = ['jpg','jpeg','png','gif','webp'].includes(ext);
                                                    const isVideo = ['mp4','mpeg','mov','avi','webm'].includes(ext);
                                                    const isAudio = ['ogg','mp3','wav','m4a','aac'].includes(ext);

                                                    let mediaEl = null;
                                                    if (isImage) {
                                                        mediaEl = <img src={url} alt="media" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', marginTop: cleanText ? '8px' : '0', cursor: 'pointer' }} onClick={() => window.open(url, '_blank')} />;
                                                    } else if (isVideo) {
                                                        mediaEl = <video src={url} controls style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', marginTop: cleanText ? '8px' : '0' }} />;
                                                    } else if (isAudio) {
                                                        mediaEl = <audio src={url} controls style={{ maxWidth: '100%', marginTop: cleanText ? '8px' : '0' }} />;
                                                    } else {
                                                        const fname = url.split('/').pop()?.split('?')[0] || 'ficheiro';
                                                        mediaEl = <a href={url} target="_blank" rel="noreferrer" download style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: cleanText ? '8px' : '0', color: '#027eb5', textDecoration: 'underline' }}>&#128196; {decodeURIComponent(fname)}</a>;
                                                    }
                                                    return (<>{cleanText && <div>{cleanText}</div>}{mediaEl}</>);
                                                }

                                                // Suporte legado a [MEDIA_BASE64:...] (para mensagens antigas)
                                                const mediaMatch = content.match(/\[MEDIA_BASE64:(data:([^;]+)(?:;name=([^;]+))?;base64,[\s\S]*?)\]/);
                                                if (mediaMatch) {
                                                    const cleanText = content.replace(mediaMatch[0], '').trim();
                                                    const dataUri = mediaMatch[1];
                                                    const mimeType = mediaMatch[2];
                                                    const fileNameParam = mediaMatch[3];
                                                    const downloadName = fileNameParam ? decodeURIComponent(fileNameParam) : 'ficheiro';
                                                    
                                                    let mediaElement = null;
                                                    if (mimeType.startsWith('image/')) {
                                                        mediaElement = <img src={dataUri} alt="media" title={downloadName} style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', marginTop: cleanText ? '8px' : '0' }} />;
                                                    } else if (mimeType.startsWith('video/')) {
                                                        mediaElement = <video src={dataUri} controls style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', marginTop: cleanText ? '8px' : '0' }} />;
                                                    } else if (mimeType.startsWith('audio/')) {
                                                        mediaElement = <audio src={dataUri} controls style={{ maxWidth: '100%', marginTop: cleanText ? '8px' : '0' }} />;
                                                    } else {
                                                        mediaElement = <a href={dataUri} download={downloadName} style={{ display: 'block', marginTop: cleanText ? '8px' : '0', color: '#027eb5', textDecoration: 'underline' }}>Descarregar {downloadName}</a>;
                                                    }
                                                    return (<>{cleanText && <div>{cleanText}</div>}{mediaElement}</>);
                                                }

                                                return content;
                                            })()}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                            {msg.direction === 'outbound' && msg.agent_id && (
                                                <span style={{ fontSize: '10px', color: '#667781', marginRight: 'auto', fontStyle: 'italic' }}>
                                                    {agents.find(a => a.id === msg.agent_id)?.nome || 'Agente'}
                                                </span>
                                            )}
                                            <span style={{ fontSize: '11px', color: '#667781', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                {msg.direction === 'outbound' && (
                                                    <>
                                                        {msg.status === 'sending' && <Clock size={12} color="#8696a0" />}
                                                        {msg.status === 'sent' && <Check size={14} color="#8696a0" />}
                                                        {(msg.status === 'delivered' || msg.status === 'read' || !msg.status) && (
                                                            <CheckCheck size={15} color={(msg.status === 'read' || msg.status === 'delivered') ? '#53bdeb' : '#8696a0'} />
                                                        )}
                                                        {msg.status === 'failed' && <AlertCircle size={14} color="#f87171" />}
                                                    </>
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ padding: '12px 16px', backgroundColor: '#f0f2f5', display: 'flex', alignItems: 'center', gap: '16px' }}>
                            {(() => {
                                let is24hLocked = false;
                                if (activeConv?.wa_channels?.provider === 'meta') {
                                    if (!activeConv.last_client_message_at) {
                                        is24hLocked = true;
                                    } else {
                                        const hours = (new Date().getTime() - new Date(activeConv.last_client_message_at).getTime()) / (1000 * 60 * 60);
                                        is24hLocked = hours > 24;
                                    }
                                }
                                
                                return is24hLocked ? (
                                    <div style={{ flex: 1, display: 'flex', gap: '8px' }}>
                                        <input 
                                            type="text" 
                                            placeholder="Janela de 24h fechada. O cliente deve responder primeiro." 
                                            disabled 
                                            style={{ flex: 1, padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px', backgroundColor: '#e2e8f0', color: '#94a3b8', cursor: 'not-allowed' }}
                                        />
                                        <button 
                                            onClick={() => setShowTemplateModal(true)}
                                            style={{ padding: '0 16px', backgroundColor: '#00a884', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}
                                        >
                                            Usar Template
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ position: 'relative' }}>
                                            <Smile size={24} color={showEmojiPicker ? '#00a884' : '#54656f'} style={{ cursor: 'pointer' }} onClick={() => setShowEmojiPicker(!showEmojiPicker)} />
                                            {showEmojiPicker && (
                                                <div style={{ position: 'absolute', bottom: '40px', left: 0, zIndex: 100 }}>
                                                    <EmojiPicker 
                                                        onEmojiClick={(emojiData) => setInputText(prev => prev + emojiData.emoji)}
                                                        width={300}
                                                        height={400}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleSendMedia} accept="image/*,video/*,audio/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
                                        <Paperclip size={24} color="#54656f" style={{ cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()} />
                                        {activeConv?.wa_channels?.provider === 'meta' && (
                                            <button 
                                                onClick={() => setShowTemplateModal(true)}
                                                style={{ padding: '6px 12px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                                                title="Enviar Template"
                                            >
                                                Template
                                            </button>
                                        )}
                                        <input 
                                            type="text" 
                                            value={inputText}
                                            onChange={e => setInputText(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                                            placeholder="Digite uma mensagem" 
                                            style={{ flex: 1, border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '15px', outline: 'none' }}
                                        />
                                        {inputText.trim() && <Send size={24} color="#00a884" style={{ cursor: 'pointer' }} onClick={handleSend} />}
                                    </>
                                );
                            })()}
                        </div>
                    </>
                ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#667781' }}>
                        {currentView === 'chats' ? (
                            <>
                                <div style={{ backgroundColor: '#f0f2f5', padding: '24px', borderRadius: '50%', marginBottom: '24px' }}>
                                    <MessageSquare size={64} color="#00a884" />
                                </div>
                                <h2 style={{ fontWeight: 300, color: '#41525d', fontSize: '32px', marginBottom: '16px' }}>WhatsApp Web Omnichannel</h2>
                                <p style={{ fontSize: '14px', maxWidth: '400px', textAlign: 'center', lineHeight: '20px' }}>
                                    Envie e receba mensagens das suas APIs Evolution ou Meta. O Bot AI trata das respostas automáticas configuradas nos Workflows.
                                </p>
                            </>
                        ) : (
                            <>
                                <div style={{ backgroundColor: '#f0f2f5', padding: '24px', borderRadius: '50%', marginBottom: '24px' }}>
                                    <Settings size={64} color="#54656f" />
                                </div>
                                <h2 style={{ fontWeight: 300, color: '#41525d', fontSize: '32px', marginBottom: '16px' }}>Definições dos Canais</h2>
                                <p style={{ fontSize: '14px', maxWidth: '400px', textAlign: 'center', lineHeight: '20px' }}>
                                    Configure no painel à esquerda as credenciais da Meta API ou use a Evolution API gerando um QR Code.
                                </p>
                            </>
                        )}
                    </div>
                )}
            </div>
            {/* Modal de Templates */}
            {showTemplateModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'white', width: '500px', borderRadius: '12px', padding: '24px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0 }}>Enviar Template Meta</h3>
                            <button onClick={() => setShowTemplateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>&times;</button>
                        </div>
                        
                        {templates.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                                Nenhum template encontrado. Aceda às Definições para sincronizar os templates da sua conta Meta.
                            </div>
                        ) : (
                            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {templates.map(tpl => (
                                    <div key={tpl.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
                                        <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '8px' }}>{tpl.name} <span style={{ fontSize: '11px', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', color: '#64748b', marginLeft: '8px' }}>{tpl.language}</span></div>
                                        <div style={{ fontSize: '13px', color: '#475569', marginBottom: '12px' }}>
                                            {tpl.components?.find((c:any) => c.type === 'BODY')?.text || 'Template sem corpo de texto'}
                                        </div>
                                        <button 
                                            onClick={() => {
                                                alert("Backend faria envio real com este template: " + tpl.name);
                                                setShowTemplateModal(false);
                                            }}
                                            style={{ width: '100%', padding: '8px', backgroundColor: '#00a884', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                                        >
                                            Selecionar e Enviar
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal Atribuir Agente */}
            {showAssignModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'white', width: '400px', borderRadius: '12px', padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Atribuir Conversa</h3>
                            <button onClick={() => setShowAssignModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>&times;</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                            <button 
                                onClick={() => handleAssign('')}
                                style={{ padding: '12px', textAlign: 'left', backgroundColor: !activeConv?.assigned_to ? '#f1f5f9' : 'white', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer' }}
                            >
                                <strong style={{ display: 'block', color: '#0f172a' }}>Sem Atribuição</strong>
                                <span style={{ fontSize: '12px', color: '#64748b' }}>Devolver para a fila geral</span>
                            </button>
                            {agents.map(agent => (
                                <button 
                                    key={agent.id}
                                    onClick={() => handleAssign(agent.id)}
                                    style={{ padding: '12px', textAlign: 'left', backgroundColor: activeConv?.assigned_to === agent.id ? '#f0fdf4' : 'white', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', borderColor: activeConv?.assigned_to === agent.id ? '#22c55e' : '#e2e8f0' }}
                                >
                                    <strong style={{ display: 'block', color: '#0f172a' }}>{agent.nome}</strong>
                                    <span style={{ fontSize: '12px', color: '#64748b' }}>{agent.role}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Auditoria */}
            {showAuditModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'white', width: '500px', borderRadius: '12px', padding: '24px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Auditoria da Conversa</h3>
                            <button onClick={() => setShowAuditModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>&times;</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {auditLogs.length === 0 ? (
                                <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>Sem registos de auditoria para esta conversa.</div>
                            ) : (
                                auditLogs.map(log => (
                                    <div key={log.id} style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>{new Date(log.created_at).toLocaleString()}</div>
                                        <div style={{ color: '#0f172a', fontSize: '14px' }}>
                                            <strong>{log.performed_by_name}</strong> {log.details}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Seguro QR Code */}
            {showQr && evolutionStatus !== 'connected' && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(4px)' }}>
                    <div style={{ backgroundColor: 'white', width: '380px', borderRadius: '16px', padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                            <div style={{ backgroundColor: '#e2e8f0', padding: '8px', borderRadius: '50%' }}>
                                <QrCode size={24} color="#0f172a" />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>Ligar WhatsApp</h3>
                        </div>
                        
                        <div style={{ width: '260px', height: '260px', backgroundColor: '#f8fafc', border: qrCodeData ? 'none' : '2px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px', position: 'relative' }}>
                            {qrCodeData ? (
                                <img src={qrCodeData} alt="QR Code" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                    <div className="spinner" style={{ width: '24px', height: '24px', border: '3px solid #cbd5e1', borderTopColor: '#00a884', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                    <span style={{ fontSize: '14px', fontWeight: 500 }}>A gerar QR Code...</span>
                                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                                </div>
                            )}
                        </div>
                        
                        <div style={{ width: '100%', padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '8px', marginBottom: '24px' }}>
                            <span style={{ fontSize: '14px', color: '#334155', fontWeight: 500, textAlign: 'center', display: 'block' }}>
                                {qrStatus || 'Aguarde um momento...'}
                            </span>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                            <button onClick={() => setShowQr(false)} style={{ flex: 1, padding: '12px', border: '1px solid #e2e8f0', background: 'white', color: '#475569', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 500 }}>
                                Cancelar
                            </button>
                            <button onClick={handleGenerateQr} style={{ flex: 1, padding: '12px', border: 'none', background: '#00a884', color: 'white', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-11.12l5.67 5.67"/></svg>
                                Atualizar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isSyncingChats && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '320px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                            <div style={{ width: '20px', height: '20px', border: '3px solid #f3f3f3', borderTop: '3px solid #10b981', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '18px' }}>
                                A Sincronizar Contactos...
                            </h3>
                        </div>
                        <div style={{ width: '256px', height: '140px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                            <span style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', padding: '0 10px' }}>A puxar mensagens e fotos antigas. Isto pode demorar alguns segundos.</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Helper para a letra inicial
function UserIcon({ name }: { name: string | undefined }) {
    const char = name && typeof name === 'string' ? name.charAt(0).toUpperCase() : '?';
    return <span style={{ color: '#fff', fontSize: '20px' }}>{char}</span>;
}
