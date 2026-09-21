import { useState, useEffect, useCallback } from 'react';
import { ListTodo, Plus, Check, Clock, AlertTriangle, X, CalendarOff, Trash2, FileText, ExternalLink } from 'lucide-react';
import { API, authFetch, COR, fmtData, btn, input, label, usuarioAtual } from './comum';

const PRIO: Record<string, { c: string; t: string }> = { alta: { c: COR.bad, t: 'Alta' }, normal: { c: COR.muted, t: 'Normal' }, baixa: { c: COR.faint, t: 'Baixa' } };

/** Lista de tarefas (as minhas, ou de um documento) com criação e conclusão. */
export function Tarefas({ documentoId, utilizadores, onAbrirDoc, compacto, titulo }: { documentoId?: string; utilizadores: any[]; onAbrirDoc?: (id: string) => void; compacto?: boolean; titulo?: string }) {
    const [lista, setLista] = useState<any[] | null>(null);
    const [nova, setNova] = useState<any>(null);
    const [erro, setErro] = useState('');
    const [mostrarFeitas, setMostrarFeitas] = useState(false);
    const eu = usuarioAtual();

    const carregar = useCallback(async () => {
        const p = new URLSearchParams(); if (documentoId) p.set('documento_id', documentoId); if (mostrarFeitas) p.set('todas', '1');
        const r = await authFetch(`${API}/api/documentos/equipa/tarefas?${p}`); const d = await r.json();
        setLista(d.success ? d.tarefas : []);
    }, [documentoId, mostrarFeitas]);
    useEffect(() => { carregar(); }, [carregar]);

    const criar = async () => {
        setErro('');
        const r = await authFetch(`${API}/api/documentos/equipa/tarefas`, { method: 'POST', body: JSON.stringify({ ...nova, documento_id: documentoId || null }) }); const d = await r.json();
        if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível criar.'); return; }
        setNova(null); carregar();
    };
    const mudar = async (t: any, alt: any) => {
        const r = await authFetch(`${API}/api/documentos/equipa/tarefas/${t.id}`, { method: 'PUT', body: JSON.stringify(alt) }); const d = await r.json();
        if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível alterar.'); return; }
        carregar();
    };
    const concluir = (t: any) => { const nota = prompt('Nota de conclusão (opcional):') ?? null; if (nota === null) return; mudar(t, { estado: 'concluida', nota_conclusao: nota }); };

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <ListTodo size={15} color={COR.accent} /><span style={{ fontWeight: 700, fontSize: '13px', color: COR.ink, flex: 1 }}>{titulo || 'Tarefas'}{lista ? ` (${lista.filter(t => ['aberta', 'em_curso'].includes(t.estado)).length})` : ''}</span>
                <label style={{ fontSize: '11.5px', color: COR.muted, display: 'flex', gap: '4px', alignItems: 'center' }}><input type="checkbox" checked={mostrarFeitas} onChange={e => setMostrarFeitas(e.target.checked)} /> ver concluídas</label>
                <button style={{ ...btn(), padding: '4px 9px', fontSize: '11.5px' }} onClick={() => setNova({ titulo: '', descricao: '', responsavel_id: eu.id, prazo: '', prioridade: 'normal' })}><Plus size={12} /> Tarefa</button>
            </div>
            {erro && <div style={{ color: COR.bad, fontSize: '12.5px', marginBottom: '6px' }}>{erro}</div>}
            {nova && (
                <div style={{ border: `1px solid ${COR.accent}`, borderRadius: '2px', padding: '10px', marginBottom: '8px', background: COR.canvas }}>
                    <label style={label}>O que há para fazer</label><input value={nova.titulo} onChange={e => setNova({ ...nova, titulo: e.target.value })} placeholder="Ex.: pedir a renovação do alvará" style={input} />
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px', marginTop: '8px' }}>
                        <div><label style={label}>Responsável</label><select value={nova.responsavel_id} onChange={e => setNova({ ...nova, responsavel_id: e.target.value })} style={input}>{utilizadores.map(u => <option key={u.id} value={u.id}>{u.nome || u.email}</option>)}</select></div>
                        <div><label style={label}>Prazo</label><input type="date" value={nova.prazo} onChange={e => setNova({ ...nova, prazo: e.target.value })} style={input} /></div>
                        <div><label style={label}>Prioridade</label><select value={nova.prioridade} onChange={e => setNova({ ...nova, prioridade: e.target.value })} style={input}><option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option></select></div>
                    </div>
                    <label style={{ ...label, marginTop: '8px' }}>Detalhes (opcional)</label><textarea value={nova.descricao} onChange={e => setNova({ ...nova, descricao: e.target.value })} rows={2} style={{ ...input, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '8px' }}><button style={btn()} onClick={() => setNova(null)}>Cancelar</button><button style={btn(true)} disabled={!nova.titulo.trim()} onClick={criar}>Criar tarefa</button></div>
                </div>
            )}
            {lista === null && <div style={{ fontSize: '12.5px', color: COR.muted }}>A carregar...</div>}
            {lista && lista.length === 0 && <div style={{ fontSize: '12.5px', color: COR.faint, padding: '6px 0' }}>{documentoId ? 'Sem tarefas neste documento.' : 'Sem tarefas por fazer.'}</div>}
            {(lista || []).map(t => {
                const feita = t.estado === 'concluida' || t.estado === 'cancelada';
                return (
                    <div key={t.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: compacto ? '7px 0' : '9px 0', borderTop: `1px solid ${COR.borderSoft}`, opacity: feita ? 0.55 : 1 }}>
                        <button title={feita ? t.estado : 'Concluir'} disabled={feita} onClick={() => concluir(t)} style={{ width: '20px', height: '20px', borderRadius: '2px', border: `1px solid ${feita ? COR.good : COR.border}`, background: feita ? COR.good : 'white', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: feita ? 'default' : 'pointer', flexShrink: 0, marginTop: '1px' }}>{feita && <Check size={13} />}</button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: COR.ink, textDecoration: feita ? 'line-through' : 'none' }}>{t.titulo}</div>
                            <div style={{ fontSize: '11.5px', color: COR.muted, display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                                <span style={{ color: PRIO[t.prioridade]?.c, fontWeight: 700 }}>{PRIO[t.prioridade]?.t}</span>
                                {t.prazo && <span style={{ color: t.atrasada ? COR.bad : COR.muted, fontWeight: t.atrasada ? 700 : 500, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>{t.atrasada ? <AlertTriangle size={11} /> : <Clock size={11} />} {fmtData(t.prazo)}</span>}
                                <span>{t.responsavel_nome}</span>
                                {t.origem !== 'manual' && <span style={{ color: COR.faint }}>· automática ({t.origem})</span>}
                                {t.criado_por_nome && t.origem === 'manual' && <span style={{ color: COR.faint }}>· por {t.criado_por_nome}</span>}
                                {t.estado === 'em_curso' && <span style={{ color: COR.accent }}>· em curso</span>}
                            </div>
                            {t.descricao && <div style={{ fontSize: '12px', color: COR.muted, marginTop: '3px' }}>{t.descricao}</div>}
                            {t.nota_conclusao && <div style={{ fontSize: '12px', color: COR.muted, marginTop: '3px', fontStyle: 'italic' }}>"{t.nota_conclusao}"</div>}
                            {!documentoId && t.documento && <div style={{ marginTop: '4px' }}><button style={{ ...btn(), padding: '3px 8px', fontSize: '11px' }} onClick={() => onAbrirDoc && onAbrirDoc(t.documento.id)}><FileText size={11} /> {t.documento.codigo || 'Documento'} · {t.documento.titulo} <ExternalLink size={10} /></button></div>}
                        </div>
                        {!feita && (
                            <div style={{ display: 'flex', gap: '4px' }}>
                                {t.estado === 'aberta' && <button style={{ ...btn(), padding: '3px 7px', fontSize: '11px' }} onClick={() => mudar(t, { estado: 'em_curso' })}>Começar</button>}
                                <select value={t.responsavel_id} onChange={e => mudar(t, { responsavel_id: e.target.value })} title="Passar a outra pessoa" style={{ ...input, width: 'auto', padding: '3px 6px', fontSize: '11px' }}>{utilizadores.map(u => <option key={u.id} value={u.id}>{u.nome || u.email}</option>)}</select>
                                <button style={{ ...btn(false, true), padding: '3px 6px' }} title="Cancelar tarefa" onClick={() => { if (confirm('Cancelar esta tarefa?')) mudar(t, { estado: 'cancelada' }); }}><X size={11} /></button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/** As minhas ausências (com substituto) — quem está de férias regista aqui. */
export function Ausencias({ utilizadores, todas }: { utilizadores: any[]; todas?: boolean }) {
    const [lista, setLista] = useState<any[]>([]);
    const [f, setF] = useState<any>(null);
    const [erro, setErro] = useState('');
    const eu = usuarioAtual();
    const nome = (id: string) => utilizadores.find(u => u.id === id)?.nome || utilizadores.find(u => u.id === id)?.email || '—';
    const carregar = useCallback(async () => { const r = await authFetch(`${API}/api/documentos/equipa/ausencias`); const d = await r.json(); setLista(d.success ? d.ausencias : []); }, []);
    useEffect(() => { carregar(); }, [carregar]);
    const guardar = async () => {
        setErro('');
        const r = await authFetch(`${API}/api/documentos/equipa/ausencias`, { method: 'POST', body: JSON.stringify(f) }); const d = await r.json();
        if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível registar.'); return; }
        setF(null); carregar();
    };
    const apagar = async (a: any) => { await authFetch(`${API}/api/documentos/equipa/ausencias/${a.id}`, { method: 'DELETE' }); carregar(); };
    const hoje = new Date().toISOString().slice(0, 10);
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <CalendarOff size={15} color={COR.accent} /><span style={{ fontWeight: 700, fontSize: '13px', color: COR.ink, flex: 1 }}>{todas ? 'Ausências da equipa' : 'As minhas ausências'}</span>
                <button style={{ ...btn(), padding: '4px 9px', fontSize: '11.5px' }} onClick={() => setF({ user_id: eu.id, substituto_id: '', inicio: hoje, fim: hoje, motivo: '' })}><Plus size={12} /> Registar</button>
            </div>
            <div style={{ fontSize: '12px', color: COR.muted, marginBottom: '8px', lineHeight: 1.45 }}>Durante a ausência, aprovações e tarefas dirigidas a esta pessoa passam automaticamente para o substituto (fica registado de quem vieram). Assinaturas não se transferem.</div>
            {erro && <div style={{ color: COR.bad, fontSize: '12.5px', marginBottom: '6px' }}>{erro}</div>}
            {f && (
                <div style={{ border: `1px solid ${COR.accent}`, borderRadius: '2px', padding: '10px', marginBottom: '8px', background: COR.canvas }}>
                    <div style={{ display: 'grid', gridTemplateColumns: todas ? '1fr 1fr 1fr 1fr' : '2fr 1fr 1fr', gap: '8px' }}>
                        {todas && <div><label style={label}>Quem</label><select value={f.user_id} onChange={e => setF({ ...f, user_id: e.target.value })} style={input}>{utilizadores.map(u => <option key={u.id} value={u.id}>{u.nome || u.email}</option>)}</select></div>}
                        <div><label style={label}>Substituto</label><select value={f.substituto_id} onChange={e => setF({ ...f, substituto_id: e.target.value })} style={input}><option value="">Escolha…</option>{utilizadores.filter(u => u.id !== f.user_id).map(u => <option key={u.id} value={u.id}>{u.nome || u.email}</option>)}</select></div>
                        <div><label style={label}>De</label><input type="date" value={f.inicio} onChange={e => setF({ ...f, inicio: e.target.value })} style={input} /></div>
                        <div><label style={label}>Até</label><input type="date" value={f.fim} onChange={e => setF({ ...f, fim: e.target.value })} style={input} /></div>
                    </div>
                    <label style={{ ...label, marginTop: '8px' }}>Motivo (opcional)</label><input value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })} placeholder="férias, formação…" style={input} />
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '8px' }}><button style={btn()} onClick={() => setF(null)}>Cancelar</button><button style={btn(true)} disabled={!f.substituto_id} onClick={guardar}>Registar</button></div>
                </div>
            )}
            {lista.length === 0 && <div style={{ fontSize: '12.5px', color: COR.faint }}>Sem ausências registadas.</div>}
            {lista.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', padding: '7px 0', borderTop: `1px solid ${COR.borderSoft}`, opacity: a.fim < hoje ? 0.5 : 1 }}>
                    <span style={{ flex: 1 }}><strong style={{ color: COR.ink }}>{nome(a.user_id)}</strong> ausente {fmtData(a.inicio)} → {fmtData(a.fim)} · substitui: <strong style={{ color: COR.ink }}>{nome(a.substituto_id)}</strong>{a.motivo ? ` · ${a.motivo}` : ''}{a.inicio <= hoje && a.fim >= hoje ? <span style={{ color: COR.warn, fontWeight: 700 }}> · ativa</span> : ''}</span>
                    <button style={{ ...btn(false, true), padding: '3px 7px' }} onClick={() => apagar(a)}><Trash2 size={11} /></button>
                </div>
            ))}
        </div>
    );
}
