import React, { useState } from 'react';
import { Mail, Send, Paperclip, User, Type, AlignLeft, CheckCircle, AlertCircle, Loader } from 'lucide-react';

type SendStatus = 'idle' | 'sending' | 'success' | 'error';

export default function EmailApp() {
    const [para, setPara] = useState('');
    const [assunto, setAssunto] = useState('');
    const [corpo, setCorpo] = useState('');
    const [status, setStatus] = useState<SendStatus>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [sentList, setSentList] = useState<{ para: string; assunto: string; hora: string }[]>([]);

    const handleSend = async () => {
        if (!para.trim() || !assunto.trim() || !corpo.trim()) {
            alert('Por favor preencha todos os campos: Para, Assunto e Mensagem.');
            return;
        }

        setStatus('sending');
        setErrorMsg('');

        try {
            const token = localStorage.getItem('os_auth_token') || '';
            const res = await fetch('http://127.0.0.1:3001/api/email/send', {
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
                setSentList(prev => [{ para, assunto, hora: new Date().toLocaleTimeString() }, ...prev]);
                setPara('');
                setAssunto('');
                setCorpo('');
                setTimeout(() => setStatus('idle'), 3000);
            } else {
                setStatus('error');
                setErrorMsg(data.error || 'Erro ao enviar email.');
            }
        } catch (err) {
            setStatus('error');
            setErrorMsg('Não foi possível conectar ao servidor backend. Verifique se está a funcionar.');
        }
    };

    return (
        <div style={{ height: '100%', display: 'flex', backgroundColor: 'white', overflow: 'hidden' }}>

            {/* Sidebar - Enviados */}
            <div style={{ width: '280px', backgroundColor: 'white', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '20px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px', background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)' }}>
                    <Mail size={22} color="white" />
                    <span style={{ fontWeight: '700', fontSize: '16px', color: 'white' }}>Email</span>
                </div>
                <div style={{ padding: '12px' }}>
                    <div 
                        onClick={() => { setPara(''); setAssunto(''); setCorpo(''); setStatus('idle'); setErrorMsg(''); }}
                        style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: '#eff6ff', color: '#1d4ed8', fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                    >
                        <Send size={14} /> Compor Novo Email
                    </div>
                </div>
                <div style={{ flex: 1, overflow: 'auto' }}>
                    <div style={{ padding: '8px 12px', fontSize: '11px', fontWeight: '700', color: '#94a3b8', letterSpacing: '1px' }}>ENVIADOS RECENTEMENTE</div>
                    {sentList.length === 0 ? (
                        <div style={{ padding: '20px 12px', fontSize: '13px', color: '#94a3b8', textAlign: 'center' }}>
                            Nenhum email enviado ainda.
                        </div>
                    ) : (
                        sentList.map((item, i) => (
                            <div key={i} style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.assunto}</div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>{item.para} • {item.hora}</div>
                            </div>
                        ))
                    )}
                </div>
                <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '12px', color: '#64748b' }}>
                    <div style={{ fontWeight: '600', marginBottom: '4px' }}>Configuração SMTP</div>
                    <div>Configure <code style={{ backgroundColor: '#e2e8f0', padding: '1px 4px', borderRadius: '3px' }}>EMAIL_USER</code> e <code style={{ backgroundColor: '#e2e8f0', padding: '1px 4px', borderRadius: '3px' }}>EMAIL_PASS</code> no ficheiro <code style={{ backgroundColor: '#e2e8f0', padding: '1px 4px', borderRadius: '3px' }}>.env</code> do backend.</div>
                </div>
            </div>

            {/* Área de Composição */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '32px', gap: '0px' }}>
                <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    {/* Header do Compose */}
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: '700' }}>Nova Mensagem</h2>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button style={{ padding: '8px 16px', border: '1px solid #e2e8f0', background: 'white', borderRadius: '8px', cursor: 'pointer', color: '#475569', fontSize: '14px' }}>
                                Guardar Rascunho
                            </button>
                            <button
                                onClick={handleSend}
                                disabled={status === 'sending'}
                                style={{
                                    padding: '8px 20px',
                                    background: status === 'sending' ? '#93c5fd' : 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
                                    color: 'white', border: 'none', borderRadius: '8px',
                                    cursor: status === 'sending' ? 'not-allowed' : 'pointer',
                                    fontWeight: '600', fontSize: '14px',
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    transition: 'opacity 0.2s'
                                }}
                            >
                                {status === 'sending' ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
                                {status === 'sending' ? 'A enviar...' : 'Enviar'}
                            </button>
                        </div>
                    </div>

                    {/* Status Messages */}
                    {status === 'success' && (
                        <div style={{ margin: '12px 24px', padding: '12px 16px', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontWeight: '600', fontSize: '14px' }}>
                            <CheckCircle size={18} /> Email enviado com sucesso!
                        </div>
                    )}
                    {status === 'error' && (
                        <div style={{ margin: '12px 24px', padding: '12px 16px', backgroundColor: '#fff1f2', border: '1px solid #fda4af', borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#be123c', fontSize: '14px' }}>
                            <AlertCircle size={18} style={{ marginTop: '1px', flexShrink: 0 }} /> {errorMsg}
                        </div>
                    )}

                    {/* Campos */}
                    <div style={{ padding: '0 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        {/* Para */}
                        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9', padding: '14px 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '80px', color: '#94a3b8', flexShrink: 0 }}>
                                <User size={16} />
                                <span style={{ fontSize: '14px', fontWeight: '600' }}>Para</span>
                            </div>
                            <input
                                type="email"
                                value={para}
                                onChange={e => setPara(e.target.value)}
                                placeholder="destinatario@email.com"
                                style={{ flex: 1, border: 'none', outline: 'none', fontSize: '15px', color: '#1e293b', background: 'transparent' }}
                            />
                        </div>

                        {/* Assunto */}
                        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9', padding: '14px 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '80px', color: '#94a3b8', flexShrink: 0 }}>
                                <Type size={16} />
                                <span style={{ fontSize: '14px', fontWeight: '600' }}>Assunto</span>
                            </div>
                            <input
                                type="text"
                                value={assunto}
                                onChange={e => setAssunto(e.target.value)}
                                placeholder="Assunto do email..."
                                style={{ flex: 1, border: 'none', outline: 'none', fontSize: '15px', color: '#1e293b', background: 'transparent', fontWeight: '500' }}
                            />
                        </div>

                        {/* Corpo */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 0' }}>
                            <textarea
                                value={corpo}
                                onChange={e => setCorpo(e.target.value)}
                                placeholder="Escreva a sua mensagem aqui..."
                                style={{
                                    flex: 1, border: 'none', outline: 'none', resize: 'none',
                                    fontSize: '15px', color: '#334155', background: 'transparent',
                                    lineHeight: '1.7', fontFamily: 'inherit', minHeight: '300px'
                                }}
                            />
                        </div>
                    </div>

                    {/* Footer */}
                    <div style={{ padding: '12px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <button style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', border: '1px solid #e2e8f0', background: 'white', borderRadius: '6px', cursor: 'pointer', color: '#64748b', fontSize: '13px' }}>
                            <Paperclip size={14} /> Anexar ficheiro
                        </button>
                        <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: 'auto' }}>
                            Enviado via Gmail SMTP configurado no .env
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
