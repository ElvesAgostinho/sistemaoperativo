import React, { useState, useEffect } from 'react';
import { Mail, Send, Inbox, User, Type, AlertCircle, Loader, RefreshCw, Trash2, MailOpen, Mail as MailIcon, FolderOpen, FileText } from 'lucide-react';
import { irPara, consumirAlvo } from '../lib/navegacao';

type SendStatus = 'idle' | 'sending' | 'success' | 'error';
type ViewMode = 'inbox' | 'sent' | 'compose' | 'read';

interface Email {
    id: string;
    message_id?: string;
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
                const res = await fetch(import.meta.env.VITE_API_URL + `/api/email/${email.id}/read`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) { console.error('Falha ao marcar email como lido:', res.status); return; }
                setEmails(emails.map(e => e.id === email.id ? { ...e, lido: true } : e));
            } catch (e) { console.error('Erro de rede ao marcar email como lido:', e); }
        }
    };

    const deleteEmail = async (id: string) => {
        if (window.confirm('Tem a certeza que deseja apagar este email?')) {
            try {
                const token = localStorage.getItem('os_auth_token') || '';
                const res = await fetch(import.meta.env.VITE_API_URL + `/api/email/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) {
                    alert('Erro ao apagar o email. Tente novamente.');
                    return;
                }
                setEmails(emails.filter(e => e.id !== id));
                if (activeEmail?.id === id) {
                    setView('inbox');
                    setActiveEmail(null);
                }
            } catch (e) { alert('Erro de rede ao apagar o email.'); }
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

    // Viemos do módulo Documentos ("ver email de origem"): abrir essa mensagem assim que a lista chegar.
    useEffect(() => {
        const alvo = consumirAlvo('email');
        if (!alvo?.message_id) return;
        const tentar = (lista: Email[]) => { const e = lista.find(x => x.message_id === alvo.message_id); if (e) { setActiveEmail(e); setView('read'); return true; } return false; };
        if (!tentar(emails)) {
            const t = setInterval(() => { setEmails(atual => { if (tentar(atual)) clearInterval(t); return atual; }); }, 800);
            setTimeout(() => clearInterval(t), 15000);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const filteredEmails = emails.filter(e => view === 'inbox' ? e.direcao === 'inbox' : e.direcao === 'sent');
    const unreadCount = emails.filter(e => e.direcao === 'inbox' && !e.lido).length;

    return (
        <div style={{ height: '100%', display: 'flex', backgroundColor: '#F5F6F7', overflow: 'hidden' }}>
            {/* Sidebar */}
            <div style={{ width: '250px', backgroundColor: 'white', borderRight: '1px solid #D5D7DA', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '20px 16px', borderBottom: '1px solid #D5D7DA', display: 'flex', alignItems: 'center', gap: '10px', background: 'linear-gradient(135deg, #0854A0 0%, #0854A0 100%)' }}>
                    <Mail size={22} color="white" />
                    <span style={{ fontWeight: '700', fontSize: '16px', color: 'white' }}>Email</span>
                </div>
                
                <div style={{ padding: '16px 12px' }}>
                    <button 
                        onClick={() => { setView('compose'); setStatus('idle'); }}
                        style={{ width: '100%', padding: '10px', borderRadius: '2px', backgroundColor: '#0854A0', color: 'white', border: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}
                    >
                        <Send size={16} /> Compor
                    </button>
                </div>

                <div style={{ flex: 1, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div 
                        onClick={() => setView('inbox')}
                        style={{ padding: '10px 12px', borderRadius: '2px', backgroundColor: view === 'inbox' ? '#E4EDF7' : 'transparent', color: view === 'inbox' ? '#0854A0' : '#5B738B', fontWeight: view === 'inbox' ? '600' : '500', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Inbox size={16} /> Caixa de Entrada</div>
                        {unreadCount > 0 && <span style={{ background: '#0854A0', color: 'white', fontSize: '11px', padding: '2px 6px', borderRadius: '2px' }}>{unreadCount}</span>}
                    </div>
                    <div 
                        onClick={() => setView('sent')}
                        style={{ padding: '10px 12px', borderRadius: '2px', backgroundColor: view === 'sent' ? '#E4EDF7' : 'transparent', color: view === 'sent' ? '#0854A0' : '#5B738B', fontWeight: view === 'sent' ? '600' : '500', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                    >
                        <Send size={16} /> Enviados
                    </div>
                </div>
            </div>

            {/* Main Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {(view === 'inbox' || view === 'sent') && (
                    <>
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid #D5D7DA', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white' }}>
                            <h2 style={{ margin: 0, fontSize: '18px', color: '#1D2D3E' }}>{view === 'inbox' ? 'Caixa de Entrada' : 'Enviados'}</h2>
                            <button onClick={handleSync} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#5B738B' }}>
                                <RefreshCw size={18} className={loadingEmails ? 'spin' : ''} />
                            </button>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
                            {loadingEmails && filteredEmails.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#5B738B', padding: '40px' }}><Loader size={24} className="spin" /></div>
                            ) : filteredEmails.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#5B738B', padding: '40px' }}>Nenhum email encontrado.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {filteredEmails.map(e => (
                                        <div 
                                            key={e.id}
                                            onClick={() => { setActiveEmail(e); setView('read'); markAsRead(e); }}
                                            style={{ backgroundColor: 'white', border: '1px solid #D5D7DA', borderRadius: '2px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', borderLeft: !e.lido && view === 'inbox' ? '3px solid #0854A0' : '1px solid #D5D7DA', opacity: e.lido ? 0.7 : 1 }}
                                        >
                                            <div style={{ color: e.lido ? '#8996A3' : '#0854A0' }}>
                                                {e.lido ? <MailOpen size={18} /> : <MailIcon size={18} />}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <span style={{ fontWeight: e.lido ? '500' : '700', color: '#1D2D3E', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{view === 'inbox' ? e.de : e.para}</span>
                                                    <span style={{ fontSize: '12px', color: '#5B738B', flexShrink: 0 }}>{new Date(e.data_envio).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                                <div style={{ fontWeight: e.lido ? '400' : '600', color: '#1D2D3E', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.assunto}</div>
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
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid #D5D7DA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button onClick={() => setView(activeEmail.direcao)} style={{ background: 'transparent', border: '1px solid #D5D7DA', padding: '6px 12px', borderRadius: '2px', cursor: 'pointer', color: '#5B738B', fontSize: '13px' }}>Voltar</button>
                            <button onClick={() => deleteEmail(activeEmail.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#BB0000' }}><Trash2 size={18} /></button>
                        </div>
                        <div style={{ padding: '24px', borderBottom: '1px solid #D5D7DA' }}>
                            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', color: '#1D2D3E' }}>{activeEmail.assunto}</h2>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#5B738B' }}>
                                <div><strong>De:</strong> {activeEmail.de}</div>
                                <div>{new Date(activeEmail.data_envio).toLocaleString('pt-PT')}</div>
                            </div>
                            <div style={{ fontSize: '13px', color: '#5B738B', marginTop: '4px' }}><strong>Para:</strong> {activeEmail.para}</div>
                            {activeEmail.message_id && <DocumentosDoEmail messageId={activeEmail.message_id} />}
                        </div>
                        <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
                            {activeEmail.corpo_html ? (
                                <div dangerouslySetInnerHTML={{ __html: activeEmail.corpo_html }} />
                            ) : (
                                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '14px', color: '#1D2D3E' }}>{activeEmail.corpo_texto}</pre>
                            )}
                        </div>
                    </div>
                )}

                {view === 'compose' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '32px' }}>
                        <div style={{ backgroundColor: 'white', borderRadius: '2px', border: '1px solid #D5D7DA', display: 'flex', flexDirection: 'column', flex: 1 }}>
                            <div style={{ padding: '16px 24px', borderBottom: '1px solid #E7E9EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2 style={{ margin: 0, fontSize: '18px', color: '#1D2D3E', fontWeight: '700' }}>Nova Mensagem</h2>
                                <button onClick={handleSend} disabled={status === 'sending'} style={{ padding: '8px 20px', background: status === 'sending' ? '#93c5fd' : '#0854A0', color: 'white', border: 'none', borderRadius: '2px', cursor: status === 'sending' ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {status === 'sending' ? <Loader size={16} className="spin" /> : <Send size={16} />} Enviar
                                </button>
                            </div>
                            
                            {status === 'success' && <div style={{ margin: '12px 24px', padding: '12px', backgroundColor: '#DCEEE2', color: '#107E3E', borderRadius: '2px', fontSize: '14px' }}>Email enviado com sucesso!</div>}
                            {status === 'error' && <div style={{ margin: '12px 24px', padding: '12px', backgroundColor: '#F6DEDE', color: '#BB0000', borderRadius: '2px', fontSize: '14px', display: 'flex', gap: '8px' }}><AlertCircle size={18}/> {errorMsg}</div>}

                            <div style={{ padding: '0 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #E7E9EB', padding: '14px 0' }}>
                                    <div style={{ width: '80px', color: '#8996A3', display: 'flex', alignItems: 'center', gap: '8px' }}><User size={16} /><span style={{fontSize:'14px', fontWeight:'600'}}>Para</span></div>
                                    <input type="email" value={para} onChange={e => setPara(e.target.value)} placeholder="email@exemplo.com" style={{ flex: 1, border: 'none', outline: 'none', fontSize: '15px' }} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #E7E9EB', padding: '14px 0' }}>
                                    <div style={{ width: '80px', color: '#8996A3', display: 'flex', alignItems: 'center', gap: '8px' }}><Type size={16} /><span style={{fontSize:'14px', fontWeight:'600'}}>Assunto</span></div>
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


/** Anexos deste email que o módulo Documentos já leu e arquivou (se a empresa tiver o módulo). */
function DocumentosDoEmail({ messageId }: { messageId: string }) {
    const [docs, setDocs] = useState<any[] | null>(null);
    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const token = localStorage.getItem('os_auth_token') || '';
                const r = await fetch(`${import.meta.env.VITE_API_URL}/api/documentos?origem_ref=${encodeURIComponent(messageId)}`, { headers: { Authorization: `Bearer ${token}` } });
                if (!r.ok) { if (vivo) setDocs([]); return; }
                const d = await r.json(); if (vivo) setDocs(d.success ? d.documentos : []);
            } catch { if (vivo) setDocs([]); }
        })();
        return () => { vivo = false; };
    }, [messageId]);
    if (!docs || docs.length === 0) return null;
    return (
        <div style={{ marginTop: '12px', padding: '10px 12px', background: '#F5F6F7', border: '1px solid #D5D7DA', borderRadius: '2px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#1D2D3E', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}><FolderOpen size={14} /> Anexos arquivados em Documentos</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {docs.map(d => (
                    <button key={d.id} onClick={() => irPara('documentos', { doc: d.id })} title={d.resumo || d.titulo}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '2px', border: '1px solid #D5D7DA', background: 'white', cursor: 'pointer', fontSize: '12px', color: '#1D2D3E' }}>
                        <FileText size={13} />{d.codigo && <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{d.codigo}</span>}<span>{d.titulo}</span>
                        {d.estado === 'a_processar' && <span style={{ color: '#5B738B' }}>· a ser lido</span>}{d.estado === 'por_rever' && <span style={{ color: '#DF6E0C' }}>· por rever</span>}
                    </button>
                ))}
            </div>
        </div>
    );
}
