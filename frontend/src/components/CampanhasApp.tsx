import { useState, useEffect, useCallback } from 'react';
import {
    Megaphone, Plus, X, ChevronLeft, ChevronRight, Check, Play, Pause, Ban, Trash2,
    Users, MessageSquare, Send, CheckCheck, Eye, AlertTriangle, Settings, MessagesSquare
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL;
const authFetch = (url: string, options: any = {}) => {
    const token = localStorage.getItem('os_auth_token');
    return fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
};

const ESTADO_INFO: Record<string, { label: string; color: string; bg: string }> = {
    Rascunho: { label: 'Rascunho', color: '#5B738B', bg: '#E7E9EB' },
    Agendada: { label: 'Agendada', color: '#0854A0', bg: '#E4EDF7' },
    Em_Execucao: { label: 'Em Execução', color: '#107E3E', bg: '#DCEEE2' },
    Pausada: { label: 'Pausada', color: '#92400e', bg: '#fef3c7' },
    Concluida: { label: 'Concluída', color: '#107E3E', bg: '#DCEEE2' },
    Cancelada: { label: 'Cancelada', color: '#BB0000', bg: '#F6DEDE' },
    Com_Erro: { label: 'Com Erro', color: '#BB0000', bg: '#F6DEDE' },
};

function extrairVariaveis(components: any[]): number {
    const body = (components || []).find((c: any) => c.type === 'BODY');
    if (!body?.text) return 0;
    const matches = body.text.match(/\{\{\d+\}\}/g);
    return matches ? new Set(matches).size : 0;
}

function textoPreview(components: any[]): string {
    const body = (components || []).find((c: any) => c.type === 'BODY');
    return body?.text || '';
}

export default function CampanhasApp({ onNavigate }: { onNavigate: (v: 'chats' | 'settings' | 'groups' | 'campaigns') => void }) {
    const [campanhas, setCampanhas] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showWizard, setShowWizard] = useState(false);
    const [ativa, setAtiva] = useState<any>(null);

    const fetchCampanhas = useCallback(async () => {
        const res = await authFetch(`${API}/api/campanhas`);
        const data = await res.json();
        if (data.success) setCampanhas(data.campanhas || []);
        setLoading(false);
    }, []);

    useEffect(() => { fetchCampanhas(); }, [fetchCampanhas]);

    useEffect(() => {
        const interval = setInterval(fetchCampanhas, 15000);
        return () => clearInterval(interval);
    }, [fetchCampanhas]);

    const acao = async (id: string, endpoint: string) => {
        const res = await authFetch(`${API}/api/campanhas/${id}/${endpoint}`, { method: 'POST' });
        const data = await res.json();
        if (data.success) fetchCampanhas(); else alert(data.error);
    };

    const eliminar = async (id: string) => {
        if (!window.confirm('Eliminar esta campanha e todos os seus registos de envio?')) return;
        const res = await authFetch(`${API}/api/campanhas/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) fetchCampanhas(); else alert(data.error);
    };

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', backgroundColor: '#F5F6F7' }}>
            <div style={{ width: '30%', minWidth: '320px', borderRight: '1px solid #D5D7DA', display: 'flex', flexDirection: 'column', backgroundColor: 'white' }}>
                <div style={{ padding: '10px 16px', backgroundColor: '#F5F6F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '59px', borderBottom: '1px solid #D5D7DA' }}>
                    <div style={{ fontWeight: 600, color: '#1D2D3E', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Megaphone size={20} color="#0854A0" /> Campanhas
                    </div>
                    <div style={{ display: 'flex', gap: '16px', color: '#54656f' }}>
                        <span title="Conversas"><MessagesSquare size={20} style={{ cursor: 'pointer' }} onClick={() => onNavigate('chats')} /></span>
                        <span title="Grupos"><Users size={20} style={{ cursor: 'pointer' }} onClick={() => onNavigate('groups')} /></span>
                        <span title="Campanhas"><Megaphone size={20} style={{ cursor: 'pointer', color: '#0854A0' }} onClick={() => onNavigate('campaigns')} /></span>
                        <span title="Configurações de Canais"><Settings size={20} style={{ cursor: 'pointer' }} onClick={() => onNavigate('settings')} /></span>
                    </div>
                </div>

                <div style={{ padding: '10px', borderBottom: '1px solid #f2f2f2' }}>
                    <button onClick={() => { setAtiva(null); setShowWizard(true); }} style={{ width: '100%', padding: '9px', borderRadius: '2px', border: 'none', background: '#0854A0', color: 'white', fontWeight: 600, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <Plus size={15} /> Nova Campanha
                    </button>
                    <p style={{ fontSize: '11.5px', color: '#5B738B', margin: '8px 2px 0', lineHeight: 1.5 }}>
                        Envio em massa com templates oficiais aprovados pela Meta — respeita as regras de envio fora da janela de 24h.
                    </p>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading && <div style={{ padding: '20px', color: '#5B738B', fontSize: '13px' }}>A carregar...</div>}
                    {!loading && campanhas.length === 0 && (
                        <div style={{ padding: '20px', color: '#5B738B', fontSize: '13px', textAlign: 'center' }}>Nenhuma campanha ainda.</div>
                    )}
                    {campanhas.map(c => {
                        const info = ESTADO_INFO[c.estado] || ESTADO_INFO.Rascunho;
                        return (
                            <div key={c.id} onClick={() => { setShowWizard(false); setAtiva(c); }}
                                style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f2f2f2', backgroundColor: ativa?.id === c.id ? '#F5F6F7' : 'white' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#1D2D3E' }}>{c.nome}</span>
                                    <span style={{ fontSize: '10.5px', fontWeight: 700, color: info.color, background: info.bg, padding: '3px 8px', borderRadius: '2px' }}>{info.label}</span>
                                </div>
                                <div style={{ fontSize: '12px', color: '#5B738B', marginTop: '4px' }}>
                                    {c.metricas?.total || 0} destinatários · {c.metricas?.entregue + c.metricas?.lida || 0} entregues
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {showWizard ? (
                    <NovaCampanhaWizard onClose={() => setShowWizard(false)} onCreated={() => { setShowWizard(false); fetchCampanhas(); }} />
                ) : ativa ? (
                    <CampanhaDetail campanha={ativa} onAcao={acao} onEliminar={eliminar} onVoltar={() => setAtiva(null)} onRefresh={fetchCampanhas} />
                ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#5B738B' }}>
                        <div style={{ backgroundColor: '#F5F6F7', padding: '24px', borderRadius: '50%', marginBottom: '24px' }}>
                            <Megaphone size={64} color="#0854A0" />
                        </div>
                        <h2 style={{ fontWeight: 300, color: '#41525d', fontSize: '28px', marginBottom: '16px' }}>Campanhas de WhatsApp</h2>
                        <p style={{ fontSize: '14px', maxWidth: '440px', textAlign: 'center', lineHeight: '20px' }}>
                            Envie mensagens em massa com templates oficiais aprovados pela Meta, com variáveis
                            personalizadas por contacto, agendamento e acompanhamento de entrega em tempo real.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================
// DETALHE DA CAMPANHA
// ============================================================
function CampanhaDetail({ campanha, onAcao, onEliminar, onVoltar, onRefresh }: { campanha: any; onAcao: (id: string, endpoint: string) => void; onEliminar: (id: string) => void; onVoltar: () => void; onRefresh: () => void }) {
    const [destinatarios, setDestinatarios] = useState<any[]>([]);
    const [detalhe, setDetalhe] = useState<any>(campanha);

    const fetchDetalhe = useCallback(async () => {
        const res = await authFetch(`${API}/api/campanhas/${campanha.id}`);
        const data = await res.json();
        if (data.success) setDetalhe(data.campanha);
        const res2 = await authFetch(`${API}/api/campanhas/${campanha.id}/destinatarios`);
        const data2 = await res2.json();
        if (data2.success) setDestinatarios(data2.destinatarios || []);
    }, [campanha.id]);

    useEffect(() => { fetchDetalhe(); }, [fetchDetalhe]);
    useEffect(() => {
        const interval = setInterval(fetchDetalhe, 10000);
        return () => clearInterval(interval);
    }, [fetchDetalhe]);

    const info = ESTADO_INFO[detalhe.estado] || ESTADO_INFO.Rascunho;
    const m = detalhe.metricas || {};

    return (
        <>
            <div style={{ padding: '12px 20px', backgroundColor: '#F5F6F7', borderBottom: '1px solid #D5D7DA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button onClick={onVoltar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#54656f' }}><ChevronLeft size={20} /></button>
                    <div>
                        <div style={{ fontWeight: 600, color: '#1D2D3E', fontSize: '15px' }}>{detalhe.nome}</div>
                        <div style={{ fontSize: '12px', color: '#5B738B' }}>{detalhe.template_name} · <span style={{ color: info.color, fontWeight: 700 }}>{info.label}</span></div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {['Rascunho', 'Pausada'].includes(detalhe.estado) && (
                        <button onClick={() => onAcao(campanha.id, 'iniciar')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '2px', border: 'none', background: '#0854A0', color: 'white', fontWeight: 600, fontSize: '12.5px', cursor: 'pointer' }}><Play size={14} /> {detalhe.estado === 'Pausada' ? 'Retomar' : 'Iniciar'}</button>
                    )}
                    {['Agendada', 'Em_Execucao'].includes(detalhe.estado) && (
                        <button onClick={() => onAcao(campanha.id, 'pausar')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '2px', border: '1px solid #D5D7DA', background: 'white', color: '#92400e', fontWeight: 600, fontSize: '12.5px', cursor: 'pointer' }}><Pause size={14} /> Pausar</button>
                    )}
                    {!['Concluida', 'Cancelada'].includes(detalhe.estado) && (
                        <button onClick={() => onAcao(campanha.id, 'cancelar')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '2px', border: '1px solid #fecaca', background: 'white', color: '#BB0000', fontWeight: 600, fontSize: '12.5px', cursor: 'pointer' }}><Ban size={14} /> Cancelar</button>
                    )}
                    <button onClick={() => onEliminar(campanha.id)} title="Eliminar" style={{ padding: '8px', borderRadius: '2px', border: '1px solid #D5D7DA', background: 'white', color: '#BB0000', cursor: 'pointer' }}><Trash2 size={14} /></button>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', backgroundColor: '#f7f8fa' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '18px' }}>
                    {[
                        { label: 'Total', valor: m.total, icon: Users, cor: '#1D2D3E' },
                        { label: 'Enviadas', valor: m.enviada, icon: Send, cor: '#0854A0' },
                        { label: 'Entregues', valor: m.entregue, icon: CheckCheck, cor: '#107E3E' },
                        { label: 'Lidas', valor: m.lida, icon: Eye, cor: '#107E3E' },
                        { label: 'Respondidas', valor: m.respondida, icon: MessageSquare, cor: '#0854A0' },
                        { label: 'Falharam', valor: m.falhou, icon: AlertTriangle, cor: '#BB0000' },
                    ].map(k => (
                        <div key={k.label} style={{ background: 'white', borderRadius: '2px', border: '1px solid #D5D7DA', padding: '14px' }}>
                            <k.icon size={16} color={k.cor} />
                            <div style={{ fontSize: '22px', fontWeight: 700, color: '#1D2D3E', marginTop: '6px' }}>{k.valor ?? 0}</div>
                            <div style={{ fontSize: '11px', color: '#8996A3', fontWeight: 600, textTransform: 'uppercase' }}>{k.label}</div>
                        </div>
                    ))}
                </div>

                <div style={{ background: 'white', borderRadius: '2px', border: '1px solid #D5D7DA', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ background: '#F5F6F7' }}>
                                <th style={thStyle}>Contacto</th><th style={thStyle}>Telefone</th><th style={thStyle}>Estado</th><th style={thStyle}>Erro</th>
                            </tr>
                        </thead>
                        <tbody>
                            {destinatarios.length === 0 && <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#8996A3' }}>Sem destinatários carregados.</td></tr>}
                            {destinatarios.map((d: any) => (
                                <tr key={d.id} style={{ borderTop: '1px solid #E7E9EB' }}>
                                    <td style={tdStyle}>{d.nome || '—'}</td>
                                    <td style={tdStyle}>{d.telefone}</td>
                                    <td style={tdStyle}><EstadoDestBadge estado={d.estado} /></td>
                                    <td style={{ ...tdStyle, color: '#BB0000', fontSize: '12px' }}>{d.erro || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

const thStyle: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: '10.5px', fontWeight: 700, color: '#8996A3', textTransform: 'uppercase' };
const tdStyle: React.CSSProperties = { padding: '10px 14px' };

const DEST_BADGE: Record<string, { color: string; bg: string }> = {
    Pendente: { color: '#5B738B', bg: '#E7E9EB' },
    Enviada: { color: '#0854A0', bg: '#E4EDF7' },
    Entregue: { color: '#107E3E', bg: '#DCEEE2' },
    Lida: { color: '#107E3E', bg: '#DCEEE2' },
    Falhou: { color: '#BB0000', bg: '#F6DEDE' },
    Respondida: { color: '#0854A0', bg: '#E4EDF7' },
};

function EstadoDestBadge({ estado }: { estado: string }) {
    const c = DEST_BADGE[estado] || DEST_BADGE.Pendente;
    return <span style={{ fontSize: '11px', fontWeight: 700, color: c.color, background: c.bg, padding: '3px 9px', borderRadius: '2px' }}>{estado}</span>;
}

// ============================================================
// ASSISTENTE DE NOVA CAMPANHA (wizard em 6 passos)
// ============================================================
function NovaCampanhaWizard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [passo, setPasso] = useState(1);
    const [nome, setNome] = useState('');
    const [descricao, setDescricao] = useState('');

    const [templates, setTemplates] = useState<any[]>([]);
    const [templateSel, setTemplateSel] = useState<any>(null);

    const [publicoTipo, setPublicoTipo] = useState<'todos' | 'tags'>('todos');
    const [tagsDisponiveis, setTagsDisponiveis] = useState<string[]>([]);
    const [tagsSel, setTagsSel] = useState<string[]>([]);
    const [previewPublico, setPreviewPublico] = useState<{ total: number; amostra: any[] } | null>(null);

    const [variaveis, setVariaveis] = useState<Record<string, { tipo: 'campo' | 'fixo'; campo?: string; valor?: string }>>({});

    const [enviarAgora, setEnviarAgora] = useState(true);
    const [dataAgendada, setDataAgendada] = useState('');
    const [velocidade, setVelocidade] = useState(20);

    const [criando, setCriando] = useState(false);
    const [erro, setErro] = useState('');

    useEffect(() => {
        (async () => {
            const r1 = await authFetch(`${API}/api/whatsapp/templates`);
            const d1 = await r1.json();
            if (d1.success) setTemplates((d1.templates || []).filter((t: any) => t.status === 'APPROVED'));
            const r2 = await authFetch(`${API}/api/campanhas/tags-disponiveis`);
            const d2 = await r2.json();
            if (d2.success) setTagsDisponiveis(d2.tags || []);
        })();
    }, []);

    useEffect(() => {
        (async () => {
            const res = await authFetch(`${API}/api/campanhas/publico/preview`, {
                method: 'POST', body: JSON.stringify({ publico_tipo: publicoTipo, publico_tags: tagsSel })
            });
            const data = await res.json();
            if (data.success) setPreviewPublico({ total: data.total, amostra: data.amostra });
        })();
    }, [publicoTipo, tagsSel]);

    const numVariaveis = templateSel ? extrairVariaveis(templateSel.components) : 0;

    const podeAvancar = () => {
        if (passo === 1) return nome.trim().length > 0;
        if (passo === 2) return !!templateSel;
        if (passo === 3) return (previewPublico?.total || 0) > 0;
        if (passo === 5) return enviarAgora || !!dataAgendada;
        return true;
    };

    const criar = async () => {
        setCriando(true);
        setErro('');
        try {
            const res = await authFetch(`${API}/api/campanhas`, {
                method: 'POST',
                body: JSON.stringify({
                    channel_id: templateSel.channel_id,
                    nome, descricao,
                    template_name: templateSel.name, template_language: templateSel.language,
                    template_preview: textoPreview(templateSel.components),
                    publico_tipo: publicoTipo, publico_tags: tagsSel,
                    variaveis,
                    agendada_para: enviarAgora ? null : new Date(dataAgendada).toISOString(),
                    iniciar_imediatamente: enviarAgora,
                    velocidade_por_minuto: velocidade,
                })
            });
            const data = await res.json();
            if (data.success) onCreated(); else setErro(data.error || 'Erro ao criar campanha.');
        } catch {
            setErro('Erro de comunicação com o servidor.');
        } finally {
            setCriando(false);
        }
    };

    const PASSOS = ['Nome', 'Modelo', 'Público', 'Variáveis', 'Agendamento', 'Confirmação'];

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#f7f8fa' }}>
            <div style={{ padding: '14px 24px', backgroundColor: 'white', borderBottom: '1px solid #D5D7DA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                    {PASSOS.map((p, i) => (
                        <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: passo === i + 1 ? 1 : 0.4 }}>
                            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: passo > i + 1 ? '#0854A0' : passo === i + 1 ? '#1D2D3E' : '#D5D7DA', color: 'white', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {passo > i + 1 ? <Check size={12} /> : i + 1}
                            </div>
                            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#1D2D3E' }}>{p}</span>
                        </div>
                    ))}
                </div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B738B' }}><X size={20} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '28px', display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: '100%', maxWidth: '620px' }}>
                    {passo === 1 && (
                        <div>
                            <h3 style={hStyle}>Nome da campanha</h3>
                            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Promoção de Fim de Ano" style={inputStyle} />
                            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição (opcional)" rows={3} style={{ ...inputStyle, marginTop: '12px', resize: 'vertical' }} />
                        </div>
                    )}

                    {passo === 2 && (
                        <div>
                            <h3 style={hStyle}>Escolha o modelo aprovado pela Meta</h3>
                            {templates.length === 0 && <p style={{ color: '#8996A3', fontSize: '13px' }}>Nenhum modelo aprovado encontrado. Sincronize os modelos em WhatsApp → Configurações de Canais.</p>}
                            {templates.map((t: any) => (
                                <div key={t.id} onClick={() => setTemplateSel(t)}
                                    style={{ padding: '14px', borderRadius: '2px', border: `1.5px solid ${templateSel?.id === t.id ? '#0854A0' : '#D5D7DA'}`, background: templateSel?.id === t.id ? '#DCEEE2' : 'white', marginBottom: '10px', cursor: 'pointer' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <strong style={{ fontSize: '13.5px' }}>{t.name}</strong>
                                        <span style={{ fontSize: '11px', color: '#5B738B' }}>{t.language} · {t.category}</span>
                                    </div>
                                    <p style={{ fontSize: '12.5px', color: '#5B738B', marginTop: '6px', whiteSpace: 'pre-wrap' }}>{textoPreview(t.components)}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {passo === 3 && (
                        <div>
                            <h3 style={hStyle}>Público-alvo</h3>
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                                <button onClick={() => setPublicoTipo('todos')} style={pillStyle(publicoTipo === 'todos')}>Todos os contactos</button>
                                <button onClick={() => setPublicoTipo('tags')} style={pillStyle(publicoTipo === 'tags')}>Por etiquetas (tags)</button>
                            </div>
                            {publicoTipo === 'tags' && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                                    {tagsDisponiveis.length === 0 && <span style={{ fontSize: '12.5px', color: '#8996A3' }}>Nenhuma tag encontrada nos seus contactos.</span>}
                                    {tagsDisponiveis.map(tag => (
                                        <button key={tag} onClick={() => setTagsSel(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                                            style={pillStyle(tagsSel.includes(tag))}>{tag}</button>
                                    ))}
                                </div>
                            )}
                            <div style={{ background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px', padding: '14px' }}>
                                <strong style={{ fontSize: '20px', color: '#1D2D3E' }}>{previewPublico?.total ?? '...'}</strong> <span style={{ fontSize: '13px', color: '#5B738B' }}>contacto(s) vão receber esta campanha</span>
                                {(previewPublico?.amostra?.length || 0) > 0 && (
                                    <p style={{ fontSize: '12px', color: '#8996A3', marginTop: '8px' }}>Ex: {previewPublico!.amostra.map(a => a.nome || a.telefone).join(', ')}{previewPublico!.total > 5 ? '...' : ''}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {passo === 4 && (
                        <div>
                            <h3 style={hStyle}>Variáveis do modelo</h3>
                            {numVariaveis === 0 && <p style={{ color: '#8996A3', fontSize: '13px' }}>Este modelo não tem variáveis — a mensagem é enviada igual para todos.</p>}
                            {Array.from({ length: numVariaveis }, (_, i) => String(i + 1)).map(pos => (
                                <div key={pos} style={{ marginBottom: '14px', padding: '12px', border: '1px solid #D5D7DA', borderRadius: '2px', background: 'white' }}>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#1D2D3E' }}>Variável {'{{'}{pos}{'}}'}</label>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                        <select value={variaveis[pos]?.tipo || 'campo'} onChange={e => setVariaveis(v => ({ ...v, [pos]: { ...v[pos], tipo: e.target.value as any } }))} style={{ ...inputStyle, width: '140px' }}>
                                            <option value="campo">Campo do contacto</option>
                                            <option value="fixo">Texto fixo</option>
                                        </select>
                                        {(variaveis[pos]?.tipo || 'campo') === 'campo' ? (
                                            <select value={variaveis[pos]?.campo || 'nome'} onChange={e => setVariaveis(v => ({ ...v, [pos]: { ...v[pos], tipo: 'campo', campo: e.target.value } }))} style={inputStyle}>
                                                <option value="nome">Nome</option>
                                                <option value="empresa">Empresa</option>
                                                <option value="telefone">Telefone</option>
                                            </select>
                                        ) : (
                                            <input value={variaveis[pos]?.valor || ''} onChange={e => setVariaveis(v => ({ ...v, [pos]: { ...v[pos], tipo: 'fixo', valor: e.target.value } }))} placeholder="Texto igual para todos" style={inputStyle} />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {passo === 5 && (
                        <div>
                            <h3 style={hStyle}>Agendamento</h3>
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                                <button onClick={() => setEnviarAgora(true)} style={pillStyle(enviarAgora)}>Enviar imediatamente</button>
                                <button onClick={() => setEnviarAgora(false)} style={pillStyle(!enviarAgora)}>Agendar</button>
                            </div>
                            {!enviarAgora && (
                                <input type="datetime-local" value={dataAgendada} onChange={e => setDataAgendada(e.target.value)} style={inputStyle} />
                            )}
                            <div style={{ marginTop: '16px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 700, color: '#1D2D3E' }}>Velocidade de envio (mensagens por minuto)</label>
                                <input type="number" min={1} max={200} value={velocidade} onChange={e => setVelocidade(Number(e.target.value))} style={{ ...inputStyle, marginTop: '8px', width: '140px' }} />
                            </div>
                        </div>
                    )}

                    {passo === 6 && (
                        <div>
                            <h3 style={hStyle}>Confirmação</h3>
                            <div style={{ background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px' }}>
                                <div><strong>Campanha:</strong> {nome}</div>
                                <div><strong>Modelo:</strong> {templateSel?.name} ({templateSel?.language})</div>
                                <div><strong>Público:</strong> {previewPublico?.total || 0} contacto(s)</div>
                                <div><strong>Variáveis:</strong> {numVariaveis === 0 ? 'nenhuma' : `${numVariaveis} preenchida(s)`}</div>
                                <div><strong>Envio:</strong> {enviarAgora ? 'Imediato' : `Agendado para ${dataAgendada ? new Date(dataAgendada).toLocaleString('pt-PT') : '—'}`}</div>
                                <div><strong>Velocidade:</strong> {velocidade} msg/min</div>
                            </div>
                            {erro && <p style={{ color: '#BB0000', fontSize: '13px', marginTop: '12px' }}>{erro}</p>}
                        </div>
                    )}
                </div>
            </div>

            <div style={{ padding: '16px 28px', backgroundColor: 'white', borderTop: '1px solid #D5D7DA', display: 'flex', justifyContent: 'space-between' }}>
                <button onClick={() => passo === 1 ? onClose() : setPasso(p => p - 1)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', borderRadius: '2px', border: '1px solid #D5D7DA', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                    <ChevronLeft size={15} /> {passo === 1 ? 'Cancelar' : 'Voltar'}
                </button>
                {passo < 6 ? (
                    <button onClick={() => setPasso(p => p + 1)} disabled={!podeAvancar()} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', borderRadius: '2px', border: 'none', background: podeAvancar() ? '#0854A0' : '#D5D7DA', color: 'white', cursor: podeAvancar() ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 600 }}>
                        Continuar <ChevronRight size={15} />
                    </button>
                ) : (
                    <button onClick={criar} disabled={criando} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', borderRadius: '2px', border: 'none', background: '#0854A0', color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                        {criando ? 'A criar...' : (enviarAgora ? 'Criar e Enviar' : 'Criar e Agendar')}
                    </button>
                )}
            </div>
        </div>
    );
}

const hStyle: React.CSSProperties = { fontSize: '17px', fontWeight: 700, color: '#1D2D3E', marginBottom: '16px' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: '2px', border: '1px solid #D5D7DA', fontSize: '13.5px', fontFamily: 'inherit' };
const pillStyle = (ativo: boolean): React.CSSProperties => ({
    padding: '8px 14px', borderRadius: '2px', border: `1.5px solid ${ativo ? '#0854A0' : '#D5D7DA'}`,
    background: ativo ? '#0854A0' : 'white', color: ativo ? 'white' : '#1D2D3E', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer'
});
