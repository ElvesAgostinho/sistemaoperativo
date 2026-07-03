import React, { useState, useEffect } from 'react';
import { Mail, Send, Inbox, User, Type, AlertCircle, Loader, RefreshCw, Trash2, MailOpen, Mail as MailIcon } from 'lucide-react';

type SendStatus = 'idle' | 'sending' | 'success' | 'error';
type ViewMode = 'inbox' | 'sent' | 'compose' | 'read';

interface Email {
    id: string;
    direcao: 'inbox' | 'sent';
    de: string;
    para: string;
    assunto: string;
    corpo_html: string;
    corpo_texto: string;
    lido: boolean;
    data_envio: string;
}

export default function EmailApp() {
    const [view, setView] = useState<ViewMode>('inbox');
    const [emails, setEmails] = useState<Email[]>([]);
    const [activeEmail, setActiveEmail] = useState<Email | null>(null);
    const [loadingEmails, setLoadingEmails] = useState(false);

    // Form states
    const [para, setPara] = useState('');
    const [assunto, setAssunto] = useState('');
    const [corpo, setCorpo] = useState('');
    const [status, setStatus] = useState<SendStatus>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    const loadEmails = async () => {
        setLoadingEmails(true);
        try {
            const token = localStorage.getItem('os_auth_token') || '';
            const res = await fetch(import.meta.env.VITE_API_URL + '/api/email', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setEmails(data.emails);
            }
        } catch (e) {
            console.error('Falha ao carregar emails:', e);
        } finally {
            setLoadingEmails(false);
        }
    };

    const handleSync = async () => {
        setLoadingEmails(true);
        try {
            const token = localStorage.getItem('os_auth_token') || '';
            await fetch(import.meta.env.VITE_API_URL + '/api/email/sync', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            await loadEmails();
        } catch (e) {
            console.error('Falha ao sincronizar emails:', e);
            setLoadingEmails(false);
        }
    };

    useEffect(() => {
        loadEmails();
    }, []);

    const markAsRead = async (email: Email) => {
        if (!email.lido && email.direcao === 'inbox') {
            try {
                const token = localStorage.getItem('os_auth_token') || '';
                await fetch(import.meta.env.VITE_API_URL + `/api/email/${email.id}/read`, { 
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                setEmails(emails.map(e => e.id === email.id ? { ...e, lido: true } : e));
            } catch (e) {}
        }
    };

    const deleteEmail = async (id: string) => {
        if (window.confirm('Tem a certeza que deseja apagar este email?')) {
            try {
                const token = localStorage.getItem('os_auth_token') || '';
                await fetch(import.meta.env.VITE_API_URL + `/api/email/${id}`, { 
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                setEmails(emails.filter(e => e.id !== id));
                if (activeEmail?.id === id) {
                    setView('inbox');
                    setActiveEmail(null);
                }
            } catch (e) {}
        }
    };

    const handleSend = async () => {
        if (!para.trim() || !assunto.trim() || !corpo.trim()) {
            alert('Preencha todos os campos.');
            return;
        }

        setStatus('sending');
        setErrorMsg('');

        try {
            const token = localStorage.getItem('os_auth_token') || '';
            const res = await fetch(import.meta.env.VITE_API_URL + '/api/email/send', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ para, assunto, corpo })
            });
            const data = await res.json();
            
            if (data.success) {
                setStatus('success');
                setPara(''); setAssunto(''); setCorpo('');
                loadEmails();
                setTimeout(() => setStatus('idle'), 3000);
            } else {
                setStatus('error');
                setErrorMsg(data.error || 'Erro ao enviar email.');
            }
        } catch (err) {
            setStatus('error');
            setErrorMsg('Erro de ligação ao servidor.');
        }
    };

    const filteredEmails = emails.filter(e => view === 'inbox' ? e.direcao === 'inbox' : e.direcao === 'sent');
    const unreadCount = emails.filter(e => e.direcao === 'inbox' && !e.lido).length;

    return (
        <div style={{ height: '100%', display: 'flex', backgroundColor: '#f8fafc', overflow: 'hidden' }}>
            {/* Sidebar */}
            <div style={{ width: '250px', backgroundColor: 'white', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '20px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px', background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)' }}>
                    <Mail size={22} color="white" />
                    <span style={{ fontWeight: '700', fontSize: '16px', color: 'white' }}>Email</span>
                </div>
                
                <div style={{ padding: '16px 12px' }}>
                    <button 
                        onClick={() => { setView('compose'); setStatus('idle'); }}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', backgroundColor: '#3b82f6', color: 'white', border: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}
                    >
                        <Send size={16} /> Compor
                    </button>
                </div>

                <div style={{ flex: 1, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div 
                        onClick={() => setView('inbox')}
                        style={{ padding: '10px 12px', borderRadius: '6px', backgroundColor: view === 'inbox' ? '#eff6ff' : 'transparent', color: view === 'inbox' ? '#1d4ed8' : '#475569', fontWeight: view === 'inbox' ? '600' : '500', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Inbox size={16} /> Caixa de Entrada</div>
                        {unreadCount > 0 && <span style={{ background: '#3b82f6', color: 'white', fontSize: '11px', padding: '2px 6px', borderRadius: '10px' }}>{unreadCount}</span>}
                    </div>
                    <div 
                        onClick={() => setView('sent')}
                        style={{ padding: '10px 12px', borderRadius: '6px', backgroundColor: view === 'sent' ? '#eff6ff' : 'transparent', color: view === 'sent' ? '#1d4ed8' : '#475569', fontWeight: view === 'sent' ? '600' : '500', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                    >
                        <Send size={16} /> Enviados
                    </div>
                </div>
            </div>

            {/* Main Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {(view === 'inbox' || view === 'sent') && (
                    <>
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white' }}>
                            <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>{view === 'inbox' ? 'Caixa de Entrada' : 'Enviados'}</h2>
                            <button onClick={handleSync} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                                <RefreshCw size={18} className={loadingEmails ? 'spin' : ''} />
                            </button>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
                            {loadingEmails && filteredEmails.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}><Loader size={24} className="spin" /></div>
                            ) : filteredEmails.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>Nenhum email encontrado.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {filteredEmails.map(e => (
                                        <div 
                                            key={e.id}
                                            onClick={() => { setActiveEmail(e); setView('read'); markAsRead(e); }}
                                            style={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', borderLeft: !e.lido && view === 'inbox' ? '3px solid #3b82f6' : '1px solid #e2e8f0', opacity: e.lido ? 0.7 : 1 }}
                                        >
                                            <div style={{ color: e.lido ? '#94a3b8' : '#3b82f6' }}>
                                                {e.lido ? <MailOpen size={18} /> : <MailIcon size={18} />}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <span style={{ fontWeight: e.lido ? '500' : '700', color: '#1e293b', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{view === 'inbox' ? e.de : e.para}</span>
                                                    <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>{new Date(e.data_envio).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                                <div style={{ fontWeight: e.lido ? '400' : '600', color: '#334155', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.assunto}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {view === 'read' && activeEmail && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'white' }}>
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button onClick={() => setView(activeEmail.direcao)} style={{ background: 'transparent', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', color: '#475569', fontSize: '13px' }}>Voltar</button>
                            <button onClick={() => deleteEmail(activeEmail.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={18} /></button>
                        </div>
                        <div style={{ padding: '24px', borderBottom: '1px solid #e2e8f0' }}>
                            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', color: '#0f172a' }}>{activeEmail.assunto}</h2>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#475569' }}>
                                <div><strong>De:</strong> {activeEmail.de}</div>
                                <div>{new Date(activeEmail.data_envio).toLocaleString('pt-PT')}</div>
                            </div>
                            <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}><strong>Para:</strong> {activeEmail.para}</div>
                        </div>
                        <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
                            {activeEmail.corpo_html ? (
                                <div dangerouslySetInnerHTML={{ __html: activeEmail.corpo_html }} />
                            ) : (
                                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '14px', color: '#334155' }}>{activeEmail.corpo_texto}</pre>
                            )}
                        </div>
                    </div>
                )}

                {view === 'compose' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '32px' }}>
                        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flex: 1 }}>
                            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '700' }}>Nova Mensagem</h2>
                                <button onClick={handleSend} disabled={status === 'sending'} style={{ padding: '8px 20px', background: status === 'sending' ? '#93c5fd' : '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: status === 'sending' ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {status === 'sending' ? <Loader size={16} className="spin" /> : <Send size={16} />} Enviar
                                </button>
                            </div>
                            
                            {status === 'success' && <div style={{ margin: '12px 24px', padding: '12px', backgroundColor: '#f0fdf4', color: '#16a34a', borderRadius: '8px', fontSize: '14px' }}>Email enviado com sucesso!</div>}
                            {status === 'error' && <div style={{ margin: '12px 24px', padding: '12px', backgroundColor: '#fff1f2', color: '#be123c', borderRadius: '8px', fontSize: '14px', display: 'flex', gap: '8px' }}><AlertCircle size={18}/> {errorMsg}</div>}

                            <div style={{ padding: '0 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9', padding: '14px 0' }}>
                                    <div style={{ width: '80px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px' }}><User size={16} /><span style={{fontSize:'14px', fontWeight:'600'}}>Para</span></div>
                                    <input type="email" value={para} onChange={e => setPara(e.target.value)} placeholder="email@exemplo.com" style={{ flex: 1, border: 'none', outline: 'none', fontSize: '15px' }} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9', padding: '14px 0' }}>
                                    <div style={{ width: '80px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px' }}><Type size={16} /><span style={{fontSize:'14px', fontWeight:'600'}}>Assunto</span></div>
                                    <input type="text" value={assunto} onChange={e => setAssunto(e.target.value)} placeholder="Assunto do email" style={{ flex: 1, border: 'none', outline: 'none', fontSize: '15px' }} />
                                </div>
                                <div style={{ flex: 1, padding: '16px 0', display: 'flex' }}>
                                    <textarea value={corpo} onChange={e => setCorpo(e.target.value)} placeholder="Escreva aqui..." style={{ flex: 1, border: 'none', outline: 'none', resize: 'none', fontSize: '15px', lineHeight: '1.7', fontFamily: 'inherit' }} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
