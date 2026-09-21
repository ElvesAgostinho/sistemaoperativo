import { useState, useEffect, useCallback } from 'react';
import { ClipboardCheck, Plus, Trash2, X, CheckCircle2, AlertTriangle, Clock, MinusCircle, ChevronLeft, Lock } from 'lucide-react';
import { API, authFetch, COR, ROTULO_ENTIDADE, ROTULO_CICLO, fmtData, btn, input, label } from './comum';
import type { TipoDoc } from './comum';

/**
 * Checklists de processo: "que documentos tem de ter um fornecedor / um
 * colaborador / um cliente". Vista para todos (panorama + detalhe por
 * entidade) e editor para administradores.
 */
export default function Checklists({ tipos, ehAdmin, onAbrirDoc }: { tipos: TipoDoc[]; ehAdmin: boolean; onAbrirDoc: (id: string) => void }) {
    const [lista, setLista] = useState<any[] | null>(null);
    const [sel, setSel] = useState<any | null>(null);
    const [panorama, setPanorama] = useState<any[] | null>(null);
    const [entidade, setEntidade] = useState<any | null>(null);
    const [estado, setEstado] = useState<any | null>(null);
    const [edit, setEdit] = useState<any>(null);
    const [erro, setErro] = useState('');
    const [aGuardar, setAGuardar] = useState(false);

    const carregar = useCallback(async () => { const r = await authFetch(`${API}/api/documentos/checklists`); const d = await r.json(); setLista(d.success ? d.checklists : []); }, []);
    useEffect(() => { carregar(); }, [carregar]);

    const abrirChecklist = async (c: any) => {
        setSel(c); setEntidade(null); setEstado(null); setPanorama(null);
        const r = await authFetch(`${API}/api/documentos/checklists/${c.id}/panorama`); const d = await r.json();
        setPanorama(d.success ? d.entidades : []);
    };
    const abrirEntidade = async (e: any) => {
        setEntidade(e); setEstado(null);
        const r = await authFetch(`${API}/api/documentos/checklists/${sel.id}/estado/${encodeURIComponent(e.id)}`); const d = await r.json();
        if (d.success) setEstado(d); else setErro(d.error || '');
    };

    const novo = () => setEdit({ nome: '', entidade_tipo: 'cliente', itens: [{ tipo_id: '', obrigatorio: true, nota: '' }], ativo: true });
    const setItem = (i: number, alt: any) => setEdit({ ...edit, itens: edit.itens.map((it: any, j: number) => j === i ? { ...it, ...alt } : it) });
    const guardar = async () => {
        setErro(''); setAGuardar(true);
        const payload = { ...edit, itens: edit.itens.filter((it: any) => it.tipo_id).map((it: any) => ({ ...it, tipo_id: Number(it.tipo_id) })) };
        const res = await authFetch(`${API}/api/documentos/checklists${edit.id ? '/' + edit.id : ''}`, { method: edit.id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
        const d = await res.json();
        setAGuardar(false);
        if (!res.ok || !d.success) { setErro(d.error || 'Não foi possível guardar.'); return; }
        setEdit(null); await carregar(); if (sel && edit.id === sel.id) setSel(null);
    };
    const apagar = async (c: any) => {
        if (!confirm(`Apagar a checklist "${c.nome}"? Os documentos não são afetados.`)) return;
        const res = await authFetch(`${API}/api/documentos/checklists/${c.id}`, { method: 'DELETE' }); const d = await res.json();
        if (!res.ok || !d.success) { setErro(d.error || 'Não foi possível apagar.'); return; }
        if (sel?.id === c.id) setSel(null); carregar();
    };

    const IconeSituacao = ({ s }: { s: string }) => s === 'ok' ? <CheckCircle2 size={15} color={COR.good} /> : s === 'caducado' ? <AlertTriangle size={15} color={COR.bad} /> : s === 'pendente' ? <Clock size={15} color={COR.warn} /> : <MinusCircle size={15} color={COR.bad} />;
    const rotuloSituacao: Record<string, string> = { ok: 'Em ordem', caducado: 'Caducado', pendente: 'Existe mas não está em vigor', em_falta: 'Em falta' };

    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px' }}>
            <div style={{ maxWidth: '980px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: COR.ink, display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}><ClipboardCheck size={18} color={COR.accent} /> Checklists de processo</h2>
                    {ehAdmin && !edit && <button style={btn(true)} onClick={novo}><Plus size={13} /> Nova checklist</button>}
                </div>
                <p style={{ margin: '0 0 16px', fontSize: '12.5px', color: COR.muted, lineHeight: 1.5 }}>Defina que documentos cada cliente, colaborador, ativo ou negócio tem de ter (ex.: dossier de fornecedor, admissão de colaborador). O sistema mostra quem está em ordem e o que falta a cada um, contando só documentos em vigor e dentro da validade.</p>
                {erro && <div style={{ marginBottom: '12px', padding: '8px 12px', background: '#F6DEDE', border: '1px solid #fecaca', borderRadius: '2px', fontSize: '12.5px', color: COR.bad, display: 'flex', justifyContent: 'space-between' }}><span>{erro}</span><X size={14} style={{ cursor: 'pointer' }} onClick={() => setErro('')} /></div>}

                {edit && (
                    <div style={{ background: 'white', border: `1px solid ${COR.accent}`, borderRadius: '2px', padding: '14px', marginBottom: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '12px' }}>
                            <div><label style={label}>Nome</label><input value={edit.nome} onChange={e => setEdit({ ...edit, nome: e.target.value })} placeholder="Ex.: Dossier de fornecedor" style={input} /></div>
                            <div><label style={label}>Aplica-se a</label><select value={edit.entidade_tipo} onChange={e => setEdit({ ...edit, entidade_tipo: e.target.value })} style={input}>{Object.entries(ROTULO_ENTIDADE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                        </div>
                        <label style={label}>Documentos exigidos</label>
                        {edit.itens.map((it: any, i: number) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 100px 2fr auto', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                                <select value={it.tipo_id} onChange={e => setItem(i, { tipo_id: e.target.value })} style={input}><option value="">Tipo de documento…</option>{tipos.filter(t => t.ativo).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select>
                                <label style={{ fontSize: '12px', color: COR.muted, display: 'flex', alignItems: 'center', gap: '4px' }}><input type="checkbox" checked={it.obrigatorio !== false} onChange={e => setItem(i, { obrigatorio: e.target.checked })} /> obrigatório</label>
                                <input value={it.nota || ''} onChange={e => setItem(i, { nota: e.target.value })} placeholder="Nota (opcional): ex. válido há menos de 3 meses" style={input} />
                                <button style={{ ...btn(false, true), padding: '6px' }} onClick={() => setEdit({ ...edit, itens: edit.itens.filter((_: any, j: number) => j !== i) })}><Trash2 size={12} /></button>
                            </div>
                        ))}
                        <button style={{ ...btn(), padding: '5px 10px', marginTop: '4px' }} onClick={() => setEdit({ ...edit, itens: [...edit.itens, { tipo_id: '', obrigatorio: true, nota: '' }] })}><Plus size={12} /> Documento</button>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                            <button style={btn()} onClick={() => { setEdit(null); setErro(''); }}><X size={13} /> Cancelar</button>
                            <button style={btn(true)} disabled={aGuardar} onClick={guardar}>{aGuardar ? 'A guardar...' : 'Guardar checklist'}</button>
                        </div>
                    </div>
                )}

                {lista === null && <div style={{ color: COR.muted, fontSize: '13px' }}>A carregar...</div>}
                {lista && lista.length === 0 && !edit && (
                    <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '32px', textAlign: 'center', color: COR.muted, fontSize: '13px' }}>
                        Ainda não há checklists.{ehAdmin ? ' Crie a primeira — por exemplo "Dossier de fornecedor": Alvará + Certidão + Contrato.' : ' Peça a um administrador para as criar.'}
                    </div>
                )}

                {lista && lista.length > 0 && !sel && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                        {lista.map(c => (
                            <div key={c.id} style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '14px', opacity: c.ativo ? 1 : 0.55 }}>
                                <div onClick={() => abrirChecklist(c)} style={{ cursor: 'pointer' }}>
                                    <div style={{ fontWeight: 700, color: COR.ink, fontSize: '14px' }}>{c.nome}</div>
                                    <div style={{ fontSize: '12px', color: COR.muted, marginTop: '2px' }}>Por {ROTULO_ENTIDADE[c.entidade_tipo]?.toLowerCase()} · {c.itens.length} documento{c.itens.length === 1 ? '' : 's'}{!c.ativo && ' · desativada'}</div>
                                    <div style={{ fontSize: '12px', color: COR.faint, marginTop: '6px' }}>{c.itens.map((it: any) => tipos.find(t => t.id === it.tipo_id)?.nome || '?').join(' · ')}</div>
                                </div>
                                {ehAdmin && (
                                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                                        <button style={{ ...btn(), padding: '4px 8px', fontSize: '11.5px' }} onClick={() => setEdit({ ...c, itens: c.itens.map((it: any) => ({ ...it, tipo_id: String(it.tipo_id) })) })}>Editar</button>
                                        <button style={{ ...btn(false, true), padding: '4px 8px', fontSize: '11.5px' }} onClick={() => apagar(c)}><Trash2 size={11} /></button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {sel && (
                    <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderBottom: `1px solid ${COR.border}` }}>
                            <button style={{ ...btn(), padding: '5px 8px' }} onClick={() => entidade ? (setEntidade(null), setEstado(null)) : setSel(null)}><ChevronLeft size={13} /> {entidade ? sel.nome : 'Checklists'}</button>
                            <div style={{ fontWeight: 700, color: COR.ink, fontSize: '14px' }}>{entidade ? entidade.nome : sel.nome}</div>
                            <span style={{ fontSize: '12px', color: COR.faint }}>{entidade ? '' : `por ${ROTULO_ENTIDADE[sel.entidade_tipo]?.toLowerCase()}`}</span>
                        </div>

                        {!entidade && (
                            panorama === null ? <div style={{ padding: '16px', color: COR.muted, fontSize: '13px' }}>A calcular...</div>
                            : panorama.length === 0 ? <div style={{ padding: '24px', color: COR.faint, fontSize: '13px', textAlign: 'center' }}>Não há {ROTULO_ENTIDADE[sel.entidade_tipo]?.toLowerCase()}s registados na empresa.</div>
                            : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead><tr style={{ background: COR.canvas }}>{['', ROTULO_ENTIDADE[sel.entidade_tipo], 'Obrigatórios', 'Em falta'].map((h, i) => <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10.5px', fontWeight: 700, color: COR.faint, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {panorama.map(e => (
                                        <tr key={e.id} onClick={() => abrirEntidade(e)} style={{ borderTop: `1px solid ${COR.borderSoft}`, cursor: 'pointer' }}>
                                            <td style={{ padding: '8px 12px', width: '24px' }}>{e.completa ? <CheckCircle2 size={15} color={COR.good} /> : <AlertTriangle size={15} color={COR.bad} />}</td>
                                            <td style={{ padding: '8px 12px', fontWeight: 600, color: COR.ink }}>{e.nome}</td>
                                            <td style={{ padding: '8px 12px', color: COR.muted }}>{e.obrigatorios}</td>
                                            <td style={{ padding: '8px 12px', color: e.em_falta ? COR.bad : COR.good, fontWeight: 700 }}>{e.em_falta === 0 ? 'Em ordem' : e.em_falta}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {entidade && (
                            estado === null ? <div style={{ padding: '16px', color: COR.muted, fontSize: '13px' }}>A verificar...</div>
                            : <div style={{ padding: '6px 14px 14px' }}>
                                <div style={{ fontSize: '12.5px', color: estado.completa ? COR.good : COR.bad, fontWeight: 700, margin: '8px 0 10px' }}>{estado.completa ? 'Dossier completo.' : `Faltam ${estado.em_falta} documento${estado.em_falta === 1 ? '' : 's'} obrigatório${estado.em_falta === 1 ? '' : 's'}.`}</div>
                                {estado.itens.map((it: any) => (
                                    <div key={it.tipo_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderTop: `1px solid ${COR.borderSoft}` }}>
                                        <IconeSituacao s={it.situacao} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, color: COR.ink, fontSize: '13px' }}>{it.tipo_nome}{!it.obrigatorio && <span style={{ fontWeight: 500, color: COR.faint, fontSize: '11.5px' }}> · opcional</span>}</div>
                                            <div style={{ fontSize: '12px', color: COR.muted }}>{rotuloSituacao[it.situacao]}{it.nota ? ` · ${it.nota}` : ''}</div>
                                        </div>
                                        {it.documento && (it.documento.sem_acesso
                                            ? <span style={{ fontSize: '11.5px', color: COR.faint, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Lock size={11} /> existe, sem acesso</span>
                                            : <button style={{ ...btn(), padding: '4px 9px', fontSize: '11.5px' }} onClick={() => onAbrirDoc(it.documento.id)}>{it.documento.codigo || 'Abrir'} · {ROTULO_CICLO[it.documento.ciclo] || it.documento.ciclo}{it.documento.validade ? ` · ${fmtData(it.documento.validade)}` : ''}</button>)}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
