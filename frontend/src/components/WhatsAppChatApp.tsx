import React, { useState, useEffect } from 'react';
import { MessageSquare, Phone, MoreVertical, Search, Paperclip, Smile, Send, Bot, Settings, QrCode, Key, Plus, UserPlus, ClipboardList, Filter } from 'lucide-react';

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
    
    // View state: 'chats' ou 'settings'
    const [currentView, setCurrentView] = useState<'chats' | 'settings'>('chats');
    
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
                setConversations(data.conversations);
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
            await fetch(import.meta.env.VITE_API_URL + '/api/whatsapp/evolution/instance/logout', {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setEvolutionStatus('disconnected');
            setShowQr(false);
            alert('WhatsApp desconectado com sucesso.');
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

    useEffect(() => {
        fetchConversations();
        fetchAgents();
        fetchEvolutionState();
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

    useEffect(() => {
        if (activeConv) {
            fetchMessages();
            fetchBotStatus();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeConv?.id]);

    const fetchMessages = async () => {
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
    };

    const fetchBotStatus = async () => {
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
    };

    const toggleBotStatus = async () => {
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
    };

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
            }
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', backgroundColor: '#f0f2f5' }}>
            
            <div style={{ width: '30%', minWidth: '300px', borderRight: '1px solid #d1d7db', display: 'flex', flexDirection: 'column', backgroundColor: 'white' }}>
                <div style={{ padding: '10px 16px', backgroundColor: '#f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '59px', borderBottom: '1px solid #d1d7db' }}>
                    <div style={{ fontWeight: 600, color: '#111b21', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <MessageSquare size={20} color="#00a884" /> WhatsApp
                    </div>
                    <div style={{ display: 'flex', gap: '16px', color: '#54656f' }}>
                        <span title="Conversas"><MessageSquare size={20} style={{ cursor: 'pointer', color: currentView === 'chats' ? '#00a884' : '#54656f' }} onClick={() => setCurrentView('chats')} /></span>
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
                                            <UserIcon name={conv.contact_name} />
                                        )}
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '16px', color: '#111b21', fontWeight: 500 }}>{conv.contact_name}</span>
                                            <span style={{ fontSize: '12px', color: '#667781' }}>{new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                                            <span style={{ fontSize: '14px', color: '#667781', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                                                {conv.phone_number}
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
                                <>
                                    {showQr ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px' }}>
                                            <div style={{ width: '220px', height: '220px', backgroundColor: '#fff', border: qrCodeData ? 'none' : '2px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', borderRadius: '8px', overflow: 'hidden' }}>
                                                {qrCodeData ? (
                                                    <img src={qrCodeData} alt="QR Code" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                                ) : (
                                                    <span>[A Carregar...]</span>
                                                )}
                                            </div>
                                            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500, textAlign: 'center' }}>{qrStatus}</span>
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                                <button onClick={handleGenerateQr} style={{ padding: '6px 12px', border: '1px solid #00a884', background: '#00a884', color: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-11.12l5.67 5.67"/></svg>
                                                    Atualizar QR Code
                                                </button>
                                                <button onClick={() => setShowQr(false)} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', background: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Fechar / Cancelar</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button onClick={handleGenerateQr} style={{ width: '100%', padding: '10px', backgroundColor: '#00a884', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                                            <Plus size={16} /> Gerar QR Code
                                        </button>
                                    )}
                                </>
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
                                        <img src={activeConv.contact_picture} alt={activeConv.contact_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <UserIcon name={activeConv.contact_name} />
                                    )}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 500, color: '#111b21', fontSize: '16px' }}>{activeConv.contact_name}</div>
                                    <div style={{ fontSize: '13px', color: '#667781' }}>{activeConv.phone_number} • {activeConv.wa_channels.name}</div>
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
                                        <div style={{ fontSize: '14.2px', color: '#111b21', lineHeight: '19px', paddingRight: '40px', wordWrap: 'break-word' }}>
                                            {msg.content}
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
                                                    <svg viewBox="0 0 16 11" width="16" height="11">
                                                        <path fill={msg.status === 'read' ? '#53bdeb' : '#8696a0'} d="M11.832 0l-5.694 6.136L3.921 3.521 2.378 5.21l3.761 4.053L13.374 1.68z"></path>
                                                    </svg>
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
                                        <Smile size={24} color="#54656f" style={{ cursor: 'pointer' }} />
                                        <Paperclip size={24} color="#54656f" style={{ cursor: 'pointer' }} />
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
        </div>
    );
}

// Helper para a letra inicial
function UserIcon({ name }: { name: string | undefined }) {
    const char = name && typeof name === 'string' ? name.charAt(0).toUpperCase() : '?';
    return <span style={{ color: '#fff', fontSize: '20px' }}>{char}</span>;
}
