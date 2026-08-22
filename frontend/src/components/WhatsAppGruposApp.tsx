import { useState, useEffect, useCallback } from 'react';
import {
    Users, MessageSquare, Settings, Plus, RefreshCw, Sparkles, TrendingUp,
    AlertTriangle, Send, X, Bot, ChevronRight, Megaphone
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL;
const authFetch = (url: string, options: any = {}) => {
    const token = localStorage.getItem('os_auth_token');
    return fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
};

interface Grupo {
    id: string; channel_id: string; group_jid: string; nome: string;
    contexto_negocio: string | null; monitorizar: boolean; resposta_automatica_ativa: boolean;
    cooldown_min: number; respostas_max_hora: number;
    mensagens_hoje?: number; ultima_mensagem_em?: string | null;
}

export default function WhatsAppGruposApp({ onNavigate }: { onNavigate: (v: 'chats' | 'settings' | 'groups' | 'campaigns') => void }) {
    const [grupos, setGrupos] = useState<Grupo[]>([]);
    const [loading, setLoading] = useState(true);
    const [ativo, setAtivo] = useState<Grupo | null>(null);
    const [showDescobrir, setShowDescobrir] = useState(false);
    const [tab, setTab] = useState<'resumo' | 'mensagens' | 'config'>('resumo');

    const fetchGrupos = useCallback(async () => {
        const res = await authFetch(`${API}/api/whatsapp/grupos`);
        const data = await res.json();
        if (data.success) {
            setGrupos(data.grupos || []);
            if (ativo) {
                const atualizado = (data.grupos || []).find((g: Grupo) => g.id === ativo.id);
                if (atualizado) setAtivo(atualizado);
            }
        }
        setLoading(false);
    }, [ativo?.id]);

    useEffect(() => { fetchGrupos(); }, []);

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', backgroundColor: '#f0f2f5' }}>
            <div style={{ width: '30%', minWidth: '300px', borderRight: '1px solid #d1d7db', display: 'flex', flexDirection: 'column', backgroundColor: 'white' }}>
                <div style={{ padding: '10px 16px', backgroundColor: '#f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '59px', borderBottom: '1px solid #d1d7db' }}>
                    <div style={{ fontWeight: 600, color: '#111b21', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={20} color="#00a884" /> Grupos
                    </div>
                    <div style={{ display: 'flex', gap: '16px', color: '#54656f' }}>
                        <span title="Conversas"><MessageSquare size={20} style={{ cursor: 'pointer' }} onClick={() => onNavigate('chats')} /></span>
                        <span title="Grupos"><Users size={20} style={{ cursor: 'pointer', color: '#00a884' }} onClick={() => onNavigate('groups')} /></span>
                        <span title="Campanhas"><Megaphone size={20} style={{ cursor: 'pointer' }} onClick={() => onNavigate('campaigns')} /></span>
                        <span title="Configurações de Canais"><Settings size={20} style={{ cursor: 'pointer' }} onClick={() => onNavigate('settings')} /></span>
                    </div>
                </div>

                <div style={{ padding: '10px', borderBottom: '1px solid #f2f2f2' }}>
                    <button onClick={() => setShowDescobrir(true)} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: 'none', background: '#00a884', color: 'white', fontWeight: 600, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <Plus size={15} /> Adicionar Grupo
                    </button>
                    <p style={{ fontSize: '11.5px', color: '#667781', margin: '8px 2px 0', lineHeight: 1.5 }}>
                        Só grupos que adicionar aqui têm as mensagens guardadas e resumidas.
                    </p>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading && <div style={{ padding: '20px', color: '#667781', fontSize: '13px' }}>A carregar...</div>}
                    {!loading && grupos.length === 0 && (
                        <div style={{ padding: '20px', color: '#667781', fontSize: '13px', textAlign: 'center' }}>
                            Nenhum grupo adicionado ainda.
                        </div>
                    )}
                    {grupos.map(g => (
                        <div key={g.id} onClick={() => { setAtivo(g); setTab('resumo'); }}
                            style={{ display: 'flex', padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f2f2f2', backgroundColor: ativo?.id === g.id ? '#f0f2f5' : 'white', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#dfe5e7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Users size={20} color="#54656f" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '14.5px', color: '#111b21', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.nome}</span>
                                    {g.resposta_automatica_ativa && <Bot size={14} color="#00a884" title="Resposta automática ativa" />}
                                </div>
                                <div style={{ fontSize: '12px', color: '#667781', marginTop: '2px' }}>
                                    {g.mensagens_hoje || 0} mensagens hoje {!g.monitorizar && '· pausado'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {!ativo ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#667781' }}>
                        <div style={{ backgroundColor: '#f0f2f5', padding: '24px', borderRadius: '50%', marginBottom: '24px' }}>
                            <Users size={64} color="#00a884" />
                        </div>
                        <h2 style={{ fontWeight: 300, color: '#41525d', fontSize: '28px', marginBottom: '16px' }}>Grupos de WhatsApp</h2>
                        <p style={{ fontSize: '14px', maxWidth: '440px', textAlign: 'center', lineHeight: '20px' }}>
                            Resuma automaticamente a atividade dos seus grupos de vendas e deixe a IA responder
                            a perguntas de clientes sobre preços e disponibilidade — sem perder nenhuma oportunidade.
                        </p>
                    </div>
                ) : (
                    <GrupoDetail grupo={ativo} tab={tab} setTab={setTab} onUpdated={fetchGrupos} />
                )}
            </div>

            {showDescobrir && (
                <DescobrirGruposModal onClose={() => setShowDescobrir(false)} onAdded={() => { setShowDescobrir(false); fetchGrupos(); }} />
            )}
        </div>
    );
}

function GrupoDetail({ grupo, tab, setTab, onUpdated }: { grupo: Grupo; tab: 'resumo' | 'mensagens' | 'config'; setTab: (t: 'resumo' | 'mensagens' | 'config') => void; onUpdated: () => void }) {
    return (
        <>
            <div style={{ padding: '12px 20px', backgroundColor: '#f0f2f5', borderBottom: '1px solid #d1d7db', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ fontWeight: 600, color: '#111b21', fontSize: '15px' }}>{grupo.nome}</div>
                    <div style={{ fontSize: '12px', color: '#667781' }}>{grupo.mensagens_hoje || 0} mensagens hoje</div>
                </div>
                <div style={{ display: 'flex', gap: '4px', backgroundColor: 'white', borderRadius: '8px', padding: '3px', border: '1px solid #d1d7db' }}>
                    {[
                        { k: 'resumo', label: 'Resumo IA', icon: Sparkles },
                        { k: 'mensagens', label: 'Mensagens', icon: MessageSquare },
                        { k: 'config', label: 'Configuração', icon: Settings },
                    ].map(({ k, label, icon: Icon }) => (
                        <button key={k} onClick={() => setTab(k as any)} style={{
                            display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                            fontSize: '12.5px', fontWeight: 600, background: tab === k ? '#00a884' : 'transparent', color: tab === k ? 'white' : '#54656f'
                        }}>
                            <Icon size={14} /> {label}
                        </button>
                    ))}
                </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#f7f8fa' }}>
                {tab === 'resumo' && <ResumoTab grupo={grupo} />}
                {tab === 'mensagens' && <MensagensTab grupo={grupo} />}
                {tab === 'config' && <ConfigTab grupo={grupo} onUpdated={onUpdated} />}
            </div>
        </>
    );
}

function ResumoTab({ grupo }: { grupo: Grupo }) {
    const [resumos, setResumos] = useState<any[]>([]);
    const [gerando, setGerando] = useState(false);
    const [horas, setHoras] = useState(24);

    const fetchResumos = useCallback(async () => {
        const res = await authFetch(`${API}/api/whatsapp/grupos/${grupo.id}/resumos`);
        const data = await res.json();
        if (data.success) setResumos(data.resumos || []);
    }, [grupo.id]);

    useEffect(() => { fetchResumos(); }, [fetchResumos]);

    const gerar = async () => {
        setGerando(true);
        try {
            const res = await authFetch(`${API}/api/whatsapp/grupos/${grupo.id}/resumir`, { method: 'POST', body: JSON.stringify({ horas }) });
            const data = await res.json();
            if (data.success) fetchResumos();
            else alert(data.error);
        } finally {
            setGerando(false);
        }
    };

    return (
        <div style={{ padding: '20px', maxWidth: '720px', margin: '0 auto' }}>
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <select value={horas} onChange={e => setHoras(Number(e.target.value))} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d7db', fontSize: '13px' }}>
                    <option value={24}>Últimas 24 horas</option>
                    <option value={72}>Últimos 3 dias</option>
                    <option value={168}>Última semana</option>
                </select>
                <button onClick={gerar} disabled={gerando} style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', background: '#00a884', color: 'white', fontWeight: 600, fontSize: '13px', cursor: gerando ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {gerando ? <RefreshCw size={14} className="spin" /> : <Sparkles size={14} />} {gerando ? 'A gerar...' : 'Gerar Resumo Agora'}
                </button>
            </div>
            <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { 100% { transform: rotate(360deg); } }`}</style>

            {resumos.length === 0 && (
                <div style={{ textAlign: 'center', color: '#667781', padding: '40px 20px', fontSize: '13.5px' }}>
                    Ainda sem resumos. Clique em "Gerar Resumo Agora" para a IA analisar a conversa do grupo.
                </div>
            )}

            {resumos.map((r: any) => (
                <div key={r.id} style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '11.5px', color: '#94a3b8', marginBottom: '8px' }}>{new Date(r.criado_em).toLocaleString('pt-PT')} · {r.total_mensagens} mensagens analisadas</div>
                    <p style={{ fontSize: '14px', color: '#1e293b', lineHeight: 1.6, margin: '0 0 14px' }}>{r.resumo}</p>

                    {(r.leads || []).length > 0 && (
                        <div style={{ marginBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#059669', marginBottom: '6px' }}>
                                <TrendingUp size={13} /> OPORTUNIDADES DE VENDA ({r.leads.length})
                            </div>
                            {r.leads.map((l: any, i: number) => (
                                <div key={i} style={{ fontSize: '13px', padding: '7px 10px', background: '#ecfdf5', borderRadius: '7px', marginBottom: '5px' }}>
                                    <strong>{l.nome}</strong> — {l.pergunta} <span style={{ color: '#059669', fontSize: '11px', fontWeight: 600 }}>({l.tipo})</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {(r.reclamacoes || []).length > 0 && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#dc2626', marginBottom: '6px' }}>
                                <AlertTriangle size={13} /> RECLAMAÇÕES ({r.reclamacoes.length})
                            </div>
                            {r.reclamacoes.map((c: any, i: number) => (
                                <div key={i} style={{ fontSize: '13px', padding: '7px 10px', background: '#fef2f2', borderRadius: '7px', marginBottom: '5px' }}>
                                    <strong>{c.nome}</strong> — {c.assunto}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

function MensagensTab({ grupo }: { grupo: Grupo }) {
    const [mensagens, setMensagens] = useState<any[]>([]);

    const fetchMensagens = useCallback(async () => {
        const res = await authFetch(`${API}/api/whatsapp/grupos/${grupo.id}/mensagens`);
        const data = await res.json();
        if (data.success) setMensagens(data.mensagens || []);
    }, [grupo.id]);

    useEffect(() => {
        fetchMensagens();
        const interval = setInterval(fetchMensagens, 15000);
        return () => clearInterval(interval);
    }, [fetchMensagens]);

    return (
        <div style={{ padding: '20px', maxWidth: '720px', margin: '0 auto' }}>
            {mensagens.length === 0 && <div style={{ textAlign: 'center', color: '#667781', padding: '40px 20px', fontSize: '13.5px' }}>Sem mensagens guardadas ainda.</div>}
            {mensagens.map((m: any) => (
                <div key={m.id} style={{ display: 'flex', marginBottom: '10px', justifyContent: m.direction === 'outbound' ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '75%', padding: '9px 13px', borderRadius: '10px', background: m.direction === 'outbound' ? '#d9fdd3' : 'white', border: m.direction === 'outbound' ? 'none' : '1px solid #e2e8f0' }}>
                        {m.direction === 'outbound' ? (
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#00a884', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}><Bot size={11} /> Assistente IA</div>
                        ) : (
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f766e', marginBottom: '3px' }}>{m.remetente_nome}</div>
                        )}
                        <div style={{ fontSize: '13.5px', color: '#1e293b', whiteSpace: 'pre-wrap' }}>{m.conteudo}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'right', marginTop: '3px' }}>{new Date(m.criado_em).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function ConfigTab({ grupo, onUpdated }: { grupo: Grupo; onUpdated: () => void }) {
    const [contexto, setContexto] = useState(grupo.contexto_negocio || '');
    const [monitorizar, setMonitorizar] = useState(grupo.monitorizar);
    const [respostaAtiva, setRespostaAtiva] = useState(grupo.resposta_automatica_ativa);
    const [cooldown, setCooldown] = useState(grupo.cooldown_min);
    const [maxHora, setMaxHora] = useState(grupo.respostas_max_hora);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setContexto(grupo.contexto_negocio || '');
        setMonitorizar(grupo.monitorizar);
        setRespostaAtiva(grupo.resposta_automatica_ativa);
        setCooldown(grupo.cooldown_min);
        setMaxHora(grupo.respostas_max_hora);
    }, [grupo.id]);

    const salvar = async () => {
        setSaving(true);
        try {
            const res = await authFetch(`${API}/api/whatsapp/grupos/${grupo.id}`, {
                method: 'PUT', body: JSON.stringify({ contexto_negocio: contexto, monitorizar, resposta_automatica_ativa: respostaAtiva, cooldown_min: cooldown, respostas_max_hora: maxHora })
            });
            const data = await res.json();
            if (data.success) onUpdated(); else alert(data.error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ padding: '20px', maxWidth: '620px', margin: '0 auto' }}>
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', marginBottom: '16px' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: '14px' }}>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#111b21' }}>Monitorizar este grupo</div>
                        <div style={{ fontSize: '12px', color: '#667781' }}>Guarda as mensagens para permitir resumos.</div>
                    </div>
                    <input type="checkbox" checked={monitorizar} onChange={e => setMonitorizar(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#00a884' }} />
                </label>

                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#111b21' }}>Resposta automática por IA</div>
                        <div style={{ fontSize: '12px', color: '#667781' }}>Responde no grupo a perguntas de preço/disponibilidade dos clientes.</div>
                    </div>
                    <input type="checkbox" checked={respostaAtiva} onChange={e => setRespostaAtiva(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#00a884' }} />
                </label>
            </div>

            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', marginBottom: '16px' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', color: '#111b21', marginBottom: '6px' }}>Informação do negócio (catálogo, preços, condições)</label>
                <p style={{ fontSize: '12px', color: '#667781', margin: '0 0 10px' }}>
                    A IA usa este texto para responder às perguntas do grupo. Cole aqui a lista de produtos, preços,
                    formas de pagamento e entrega.
                </p>
                <textarea value={contexto} onChange={e => setContexto(e.target.value)} rows={8}
                    placeholder={'Ex:\nVestido Modelo A — 8.000 Kz\nConsulta (1h) — 15.000 Kz\nAberto de Seg a Sáb, 9h-18h\nPagamento: Multicaixa Express ou numerário'}
                    style={{ width: '100%', padding: '11px', borderRadius: '9px', border: '1px solid #d1d7db', fontSize: '13.5px', fontFamily: 'inherit', resize: 'vertical' }} />
            </div>

            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '12.5px', color: '#111b21', marginBottom: '6px' }}>Intervalo entre respostas à mesma pessoa (min)</label>
                    <input type="number" min={1} value={cooldown} onChange={e => setCooldown(Number(e.target.value))} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #d1d7db', fontSize: '13px' }} />
                </div>
                <div>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '12.5px', color: '#111b21', marginBottom: '6px' }}>Máximo de respostas por hora</label>
                    <input type="number" min={1} value={maxHora} onChange={e => setMaxHora(Number(e.target.value))} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #d1d7db', fontSize: '13px' }} />
                </div>
            </div>

            <button onClick={salvar} disabled={saving} style={{ width: '100%', padding: '11px', borderRadius: '9px', border: 'none', background: '#00a884', color: 'white', fontWeight: 700, fontSize: '14px', cursor: saving ? 'wait' : 'pointer' }}>
                {saving ? 'A guardar...' : 'Guardar Configuração'}
            </button>
        </div>
    );
}

function DescobrirGruposModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
    const [grupos, setGrupos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState('');
    const [adicionando, setAdicionando] = useState<string | null>(null);
    const [channelId, setChannelId] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const res = await authFetch(`${API}/api/whatsapp/grupos/descobrir`);
                const data = await res.json();
                if (data.success) { setGrupos(data.grupos || []); setChannelId(data.channel_id); }
                else setErro(data.error || 'Não foi possível obter os grupos.');
            } catch { setErro('Erro de conexão ao servidor.'); }
            setLoading(false);
        })();
    }, []);

    const adicionar = async (g: any) => {
        setAdicionando(g.group_jid);
        try {
            const res = await authFetch(`${API}/api/whatsapp/grupos`, { method: 'POST', body: JSON.stringify({ channel_id: channelId, group_jid: g.group_jid, nome: g.nome }) });
            const data = await res.json();
            if (data.success) onAdded(); else alert(data.error);
        } finally {
            setAdicionando(null);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ background: 'white', borderRadius: '14px', padding: '22px', width: '460px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', color: '#111b21' }}>Adicionar Grupo</h3>
                    <X size={18} style={{ cursor: 'pointer', color: '#667781' }} onClick={onClose} />
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading && <div style={{ color: '#667781', fontSize: '13px', padding: '10px 0' }}>A procurar grupos na sua conta WhatsApp...</div>}
                    {erro && <div style={{ color: '#dc2626', fontSize: '13px', padding: '10px 0' }}>{erro}</div>}
                    {!loading && !erro && grupos.length === 0 && <div style={{ color: '#667781', fontSize: '13px', padding: '10px 0' }}>Nenhum grupo encontrado nesta conta WhatsApp.</div>}
                    {grupos.map((g: any) => (
                        <div key={g.group_jid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #f2f2f2' }}>
                            <div>
                                <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#111b21' }}>{g.nome}</div>
                                <div style={{ fontSize: '11.5px', color: '#667781' }}>{g.membros} membros</div>
                            </div>
                            {g.registado ? (
                                <span style={{ fontSize: '11.5px', color: '#059669', fontWeight: 600 }}>Já adicionado</span>
                            ) : (
                                <button onClick={() => adicionar(g)} disabled={adicionando === g.group_jid}
                                    style={{ padding: '6px 12px', borderRadius: '7px', border: 'none', background: '#00a884', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {adicionando === g.group_jid ? '...' : <><Plus size={13} /> Adicionar</>}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
