import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Send, Users, UserCheck, AlertTriangle } from 'lucide-react';
import { API, authFetch, COR, AREAS, fmtDataHora, btn, input, label } from './comum';
import type { Doc, TipoDoc } from './comum';
import { Tarefas, Ausencias } from './Trabalho';

// ============================================================
// CONVERSA DO DOCUMENTO: comentários com @menções + tarefas
// ============================================================
export function Conversa({ doc, utilizadores, setErro }: { doc: Doc; utilizadores: any[]; setErro: (s: string) => void }) {
    const [comentarios, setComentarios] = useState<any[] | null>(null);
    const [texto, setTexto] = useState('');
    const [sugestoes, setSugestoes] = useState<any[]>([]);
    const [mencoes, setMencoes] = useState<string[]>([]);
    const [aEnviar, setAEnviar] = useState(false);

    const carregar = useCallback(async () => { const r = await authFetch(`${API}/api/documentos/${doc.id}/comentarios`); const d = await r.json(); setComentarios(d.success ? d.comentarios : []); }, [doc.id]);
    useEffect(() => { carregar(); }, [carregar]);

    // "@" abre sugestões; escolher insere @Nome e guarda o id
    const aoEscrever = (v: string) => {
        setTexto(v);
        const m = v.match(/@([^\s@]{0,30})$/);
        setSugestoes(m ? utilizadores.filter(u => (u.nome || u.email || '').toLowerCase().includes(m[1].toLowerCase())).slice(0, 6) : []);
    };
    const mencionar = (u: any) => { setTexto(texto.replace(/@([^\s@]{0,30})$/, `@${(u.nome || u.email).split(' ')[0]} `)); setMencoes(Array.from(new Set([...mencoes, u.id]))); setSugestoes([]); };
    const enviar = async () => {
        setAEnviar(true); setErro('');
        const r = await authFetch(`${API}/api/documentos/${doc.id}/comentarios`, { method: 'POST', body: JSON.stringify({ texto, mencoes }) }); const d = await r.json();
        setAEnviar(false);
        if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível comentar.'); return; }
        setTexto(''); setMencoes([]); carregar();
    };
    const nome = (id: string) => utilizadores.find(u => u.id === id)?.nome || '—';

    return (
        <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Tarefas documentoId={doc.id} utilizadores={utilizadores} compacto titulo="Tarefas deste documento" />
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}><MessageSquare size={15} color={COR.accent} /><span style={{ fontWeight: 700, fontSize: '13px', color: COR.ink }}>Comentários{comentarios ? ` (${comentarios.length})` : ''}</span></div>
                {comentarios === null && <div style={{ fontSize: '12.5px', color: COR.muted }}>A carregar...</div>}
                {comentarios && comentarios.length === 0 && <div style={{ fontSize: '12.5px', color: COR.faint }}>Ainda ninguém comentou. Use @ para chamar alguém — recebe notificação.</div>}
                {(comentarios || []).map(c => (
                    <div key={c.id} style={{ padding: '8px 0', borderTop: `1px solid ${COR.borderSoft}` }}>
                        <div style={{ fontSize: '12px', color: COR.muted }}><strong style={{ color: COR.ink }}>{c.user_nome || nome(c.user_id)}</strong> · {fmtDataHora(c.criado_em)}{c.mencoes?.length ? ` · mencionou ${c.mencoes.map(nome).join(', ')}` : ''}</div>
                        <div style={{ fontSize: '13px', color: COR.ink, marginTop: '3px', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{c.texto}</div>
                    </div>
                ))}
                <div style={{ position: 'relative', marginTop: '8px' }}>
                    <textarea value={texto} onChange={e => aoEscrever(e.target.value)} rows={2} placeholder="Escreva um comentário… (@nome para mencionar)" style={{ ...input, resize: 'vertical' }} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviar(); }} />
                    {sugestoes.length > 0 && (
                        <div style={{ position: 'absolute', left: 0, bottom: '100%', background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 5, minWidth: '220px' }}>
                            {sugestoes.map(u => <div key={u.id} onClick={() => mencionar(u)} style={{ padding: '6px 10px', fontSize: '12.5px', cursor: 'pointer', color: COR.ink }}>@{u.nome || u.email}</div>)}
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}><button style={btn(true)} disabled={aEnviar || !texto.trim()} onClick={enviar}><Send size={13} /> Comentar</button></div>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// DEFINIÇÕES: responsáveis por área/tipo + carga por pessoa + ausências
// ============================================================
export function EquipaDefinicoes({ tipos, utilizadores }: { tipos: TipoDoc[]; utilizadores: any[] }) {
    const [regras, setRegras] = useState<any[]>([]);
    const [carga, setCarga] = useState<any[] | null>(null);
    const [erro, setErro] = useState('');
    const nome = (id: string) => utilizadores.find(u => u.id === id)?.nome || utilizadores.find(u => u.id === id)?.email || '—';
    const carregar = useCallback(async () => {
        const [r1, r2] = await Promise.all([authFetch(`${API}/api/documentos/equipa/responsaveis`), authFetch(`${API}/api/documentos/equipa/carga`)]);
        const d1 = await r1.json(); const d2 = await r2.json();
        if (d1.success) setRegras(d1.regras); if (d2.success) setCarga(d2.pessoas);
    }, []);
    useEffect(() => { carregar(); }, [carregar]);
    const definir = async (chave: { area?: string; tipo_id?: number }, user_id: string) => {
        setErro('');
        if (!user_id) { const r = regras.find(x => chave.tipo_id ? x.tipo_id === chave.tipo_id : (x.area === chave.area && !x.tipo_id)); if (r) await authFetch(`${API}/api/documentos/equipa/responsaveis/${r.id}`, { method: 'DELETE' }); carregar(); return; }
        const r = await authFetch(`${API}/api/documentos/equipa/responsaveis`, { method: 'PUT', body: JSON.stringify({ ...chave, user_id }) }); const d = await r.json();
        if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível guardar.'); return; }
        carregar();
    };
    const respArea = (a: string) => regras.find(r => r.area === a && !r.tipo_id)?.user_id || '';
    const respTipo = (id: number) => regras.find(r => r.tipo_id === id)?.user_id || '';
    const naoPendentes = utilizadores.filter(u => u.role !== 'pending');

    return (
        <>
            <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '16px', marginBottom: '16px' }}>
                <div style={{ fontWeight: 700, color: COR.ink, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}><UserCheck size={15} color={COR.accent} /> Quem é responsável por quê</div>
                <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: COR.muted, lineHeight: 1.5 }}>Cada documento que entra fica atribuído automaticamente ao responsável da sua <strong>área</strong> — ou do seu <strong>tipo</strong>, que tem prioridade (ex.: "RH é do Carlos, mas Contratos de trabalho são da Ana"). O responsável é avisado, vê o documento em "Por rever → só os meus", recebe as tarefas de renovação e é quem decide na retenção. Se estiver ausente, vai para o substituto.</p>
                {erro && <div style={{ color: COR.bad, fontSize: '12.5px', marginBottom: '8px' }}>{erro}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={label}>Por área</label>
                        {AREAS.map(a => (
                            <div key={a} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '12.5px' }}>
                                <span style={{ flex: 1, color: COR.ink }}>{a}</span>
                                <select value={respArea(a)} onChange={e => definir({ area: a }, e.target.value)} style={{ ...input, width: '200px', padding: '5px 8px', fontSize: '12px' }}><option value="">— ninguém —</option>{naoPendentes.map(u => <option key={u.id} value={u.id}>{u.nome || u.email}</option>)}</select>
                            </div>
                        ))}
                    </div>
                    <div>
                        <label style={label}>Por tipo (tem prioridade sobre a área)</label>
                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            {tipos.filter(t => t.ativo).map(t => (
                                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '12.5px' }}>
                                    <span style={{ flex: 1, color: COR.ink }}>{t.nome} <span style={{ color: COR.faint }}>({t.area_padrao})</span></span>
                                    <select value={respTipo(t.id)} onChange={e => definir({ tipo_id: t.id }, e.target.value)} style={{ ...input, width: '200px', padding: '5px 8px', fontSize: '12px' }}><option value="">— herda da área —</option>{naoPendentes.map(u => <option key={u.id} value={u.id}>{u.nome || u.email}</option>)}</select>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '16px', marginBottom: '16px' }}>
                <div style={{ fontWeight: 700, color: COR.ink, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}><Users size={15} color={COR.accent} /> Carga de trabalho por pessoa</div>
                <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: COR.muted }}>O que cada um tem pendente neste momento. Use para redistribuir (as tarefas passam-se na própria tarefa; aprovações delegam-se na caixa de cada um; ausências abaixo).</p>
                {carga === null ? <div style={{ fontSize: '12.5px', color: COR.muted }}>A calcular...</div> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                        <thead><tr style={{ background: COR.canvas }}>{['Pessoa', 'Documentos', 'Por rever', 'Aprovações', 'Assinaturas', 'Tarefas', 'Atrasos', ''].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10.5px', fontWeight: 700, color: COR.faint, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                        <tbody>
                            {carga.map(p => (
                                <tr key={p.id} style={{ borderTop: `1px solid ${COR.borderSoft}` }}>
                                    <td style={{ padding: '8px 10px' }}><div style={{ fontWeight: 600, color: COR.ink }}>{p.nome}</div><div style={{ fontSize: '11px', color: COR.faint }}>{p.role}</div></td>
                                    <td style={{ padding: '8px 10px' }}>{p.documentos}</td>
                                    <td style={{ padding: '8px 10px', color: p.porRever ? COR.warn : COR.muted, fontWeight: p.porRever ? 700 : 500 }}>{p.porRever}</td>
                                    <td style={{ padding: '8px 10px' }}>{p.aprovacoes}</td>
                                    <td style={{ padding: '8px 10px' }}>{p.assinaturas}</td>
                                    <td style={{ padding: '8px 10px' }}>{p.tarefas}</td>
                                    <td style={{ padding: '8px 10px', color: p.atrasos ? COR.bad : COR.good, fontWeight: 700 }}>{p.atrasos ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={12} /> {p.atrasos}</span> : '0'}</td>
                                    <td style={{ padding: '8px 10px', fontSize: '11.5px', color: COR.warn }}>{p.ausente ? `ausente até ${p.ausente.ate} → ${nome(p.ausente.substituto_id)}` : ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '16px', marginBottom: '16px' }}>
                <Ausencias utilizadores={utilizadores} todas />
            </div>
        </>
    );
}

