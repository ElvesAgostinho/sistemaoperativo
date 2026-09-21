import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, X, GitBranch } from 'lucide-react';
import { API, authFetch, COR, btn, input, label } from './comum';
import type { TipoDoc } from './comum';

interface Etapa { nome: string; aprovadores: string[]; modo: 'qualquer' | 'todos'; prazo_horas: number | '' | null; escalar_para: string | '' | null }

const etapaVazia = (): Etapa => ({ nome: '', aprovadores: [], modo: 'qualquer', prazo_horas: '', escalar_para: '' });

/** Editor de fluxos de aprovação (Definições). */
export default function DocumentosFluxos({ tipos }: { tipos: TipoDoc[] }) {
    const [fluxos, setFluxos] = useState<any[]>([]);
    const [utilizadores, setUtilizadores] = useState<any[]>([]);
    const [edit, setEdit] = useState<any>(null);
    const [erro, setErro] = useState('');
    const [aGuardar, setAGuardar] = useState(false);

    const carregar = useCallback(async () => {
        const [r1, r2] = await Promise.all([authFetch(`${API}/api/documentos/fluxos`), authFetch(`${API}/api/documentos/entidades/opcoes`)]);
        const d1 = await r1.json(); const d2 = await r2.json();
        if (d1.success) setFluxos(d1.fluxos); if (d2.success) setUtilizadores(d2.utilizadores || []);
    }, []);
    useEffect(() => { carregar(); }, [carregar]);

    const nomeDe = (id: string) => utilizadores.find(u => u.id === id)?.nome || utilizadores.find(u => u.id === id)?.email || '—';
    const novo = () => setEdit({ nome: '', descricao: '', tipo_id: '', ativar_ao_aprovar: true, ativo: true, etapas: [etapaVazia()] });
    const setEtapa = (i: number, alt: Partial<Etapa>) => setEdit({ ...edit, etapas: edit.etapas.map((e: Etapa, j: number) => j === i ? { ...e, ...alt } : e) });
    const mover = (i: number, dir: -1 | 1) => { const c = [...edit.etapas]; const j = i + dir; if (j < 0 || j >= c.length) return; [c[i], c[j]] = [c[j], c[i]]; setEdit({ ...edit, etapas: c }); };
    const alternarAprovador = (i: number, id: string) => {
        const e: Etapa = edit.etapas[i];
        setEtapa(i, { aprovadores: e.aprovadores.includes(id) ? e.aprovadores.filter(a => a !== id) : [...e.aprovadores, id] });
    };

    const guardar = async () => {
        setErro(''); setAGuardar(true);
        const payload = { ...edit, tipo_id: edit.tipo_id || null, etapas: edit.etapas.map((e: Etapa) => ({ ...e, prazo_horas: e.prazo_horas === '' ? null : e.prazo_horas, escalar_para: e.escalar_para || null })) };
        const res = await authFetch(`${API}/api/documentos/fluxos${edit.id ? '/' + edit.id : ''}`, { method: edit.id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
        const d = await res.json();
        setAGuardar(false);
        if (!res.ok || !d.success) { setErro(d.error || 'Não foi possível guardar.'); return; }
        setEdit(null); carregar();
    };
    const apagar = async (f: any) => {
        if (!confirm(`Apagar o fluxo "${f.nome}"? Os processos já feitos mantêm o histórico.`)) return;
        const res = await authFetch(`${API}/api/documentos/fluxos/${f.id}`, { method: 'DELETE' }); const d = await res.json();
        if (!res.ok || !d.success) { alert('Erro: ' + (d.error || 'não foi possível apagar.')); return; }
        carregar();
    };
    const alternarAtivo = async (f: any) => {
        const res = await authFetch(`${API}/api/documentos/fluxos/${f.id}`, { method: 'PUT', body: JSON.stringify({ ativo: !f.ativo }) });
        const d = await res.json();
        if (!res.ok || !d.success) { alert('Erro: ' + (d.error || 'não foi possível alterar.')); return; }
        carregar();
    };

    return (
        <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ fontWeight: 700, color: COR.ink, flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}><GitBranch size={15} color={COR.accent} /> Fluxos de aprovação</div>
                <button style={btn(true)} onClick={novo}><Plus size={13} /> Novo fluxo</button>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: COR.muted, lineHeight: 1.5 }}>
                Um fluxo é uma sequência de etapas. Em cada etapa escolhe quem aprova, se basta um ou têm de ser todos, o prazo, e para quem escalar se o prazo passar. Quem submete um documento escolhe o fluxo; os aprovadores recebem a tarefa em "As minhas aprovações" e por email.
            </p>

            {edit && (
                <div style={{ border: `1px solid ${COR.accent}`, borderRadius: '2px', padding: '14px', marginBottom: '14px', background: COR.canvas }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 2fr 1.2fr', gap: '10px', marginBottom: '12px' }}>
                        <div><label style={label}>Nome</label><input value={edit.nome} onChange={e => setEdit({ ...edit, nome: e.target.value })} placeholder="Ex.: Contratos acima de 1M Kz" style={input} /></div>
                        <div><label style={label}>Descrição (opcional)</label><input value={edit.descricao || ''} onChange={e => setEdit({ ...edit, descricao: e.target.value })} placeholder="Quando usar este fluxo" style={input} /></div>
                        <div><label style={label}>Sugerido para o tipo</label><select value={edit.tipo_id || ''} onChange={e => setEdit({ ...edit, tipo_id: e.target.value })} style={input}><option value="">— qualquer —</option>{tipos.filter(t => t.ativo).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></div>
                    </div>
                    <label style={{ fontSize: '12.5px', color: COR.ink, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                        <input type="checkbox" checked={!!edit.ativar_ao_aprovar} onChange={e => setEdit({ ...edit, ativar_ao_aprovar: e.target.checked })} /> Ao terminar aprovado, o documento fica logo em vigor (Ativo). Desmarque se quiser pô-lo em vigor à mão depois.
                    </label>

                    <label style={label}>Etapas (por ordem)</label>
                    {edit.etapas.map((e: Etapa, i: number) => (
                        <div key={i} style={{ border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '10px', marginBottom: '8px', background: 'white' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '24px 1.6fr 1fr 90px 1.4fr auto', gap: '8px', alignItems: 'end' }}>
                                <div style={{ fontWeight: 700, color: COR.accent, fontSize: '13px', paddingBottom: '9px' }}>{i + 1}.</div>
                                <div><label style={label}>Etapa</label><input value={e.nome} onChange={ev => setEtapa(i, { nome: ev.target.value })} placeholder="Ex.: Direção Financeira" style={input} /></div>
                                <div><label style={label}>Decisão</label><select value={e.modo} onChange={ev => setEtapa(i, { modo: ev.target.value as any })} style={input}><option value="qualquer">Basta um aprovar</option><option value="todos">Todos têm de aprovar</option></select></div>
                                <div><label style={label}>Prazo (h)</label><input type="number" min={1} max={2160} value={e.prazo_horas ?? ''} onChange={ev => setEtapa(i, { prazo_horas: ev.target.value === '' ? '' : Number(ev.target.value) })} placeholder="—" style={input} /></div>
                                <div><label style={label}>Se passar o prazo, escalar para</label><select value={e.escalar_para || ''} disabled={!e.prazo_horas} onChange={ev => setEtapa(i, { escalar_para: ev.target.value })} style={input}><option value="">— só avisar —</option>{utilizadores.map(u => <option key={u.id} value={u.id}>{u.nome || u.email}</option>)}</select></div>
                                <div style={{ display: 'flex', gap: '2px', paddingBottom: '1px' }}>
                                    <button style={{ ...btn(), padding: '6px' }} onClick={() => mover(i, -1)} title="Subir"><ArrowUp size={12} /></button>
                                    <button style={{ ...btn(), padding: '6px' }} onClick={() => mover(i, 1)} title="Descer"><ArrowDown size={12} /></button>
                                    <button style={{ ...btn(false, true), padding: '6px' }} disabled={edit.etapas.length === 1} onClick={() => setEdit({ ...edit, etapas: edit.etapas.filter((_: any, j: number) => j !== i) })}><Trash2 size={12} /></button>
                                </div>
                            </div>
                            <div style={{ marginTop: '8px' }}>
                                <label style={label}>Aprovadores {e.aprovadores.length > 0 && <span style={{ color: COR.accent }}>({e.aprovadores.length})</span>}</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {utilizadores.map(u => {
                                        const sel = e.aprovadores.includes(u.id);
                                        return <button key={u.id} onClick={() => alternarAprovador(i, u.id)} style={{ ...btn(sel), padding: '4px 10px', fontSize: '12px' }}>{u.nome || u.email}</button>;
                                    })}
                                    {utilizadores.length === 0 && <span style={{ fontSize: '12px', color: COR.faint }}>Sem utilizadores na empresa.</span>}
                                </div>
                            </div>
                        </div>
                    ))}
                    <button style={{ ...btn(), padding: '5px 10px' }} onClick={() => setEdit({ ...edit, etapas: [...edit.etapas, etapaVazia()] })}><Plus size={12} /> Etapa</button>

                    {erro && <div style={{ color: COR.bad, fontSize: '12.5px', marginTop: '10px' }}>{erro}</div>}
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                        <button style={btn()} onClick={() => { setEdit(null); setErro(''); }}><X size={13} /> Cancelar</button>
                        <button style={btn(true)} disabled={aGuardar} onClick={guardar}>{aGuardar ? 'A guardar...' : 'Guardar fluxo'}</button>
                    </div>
                </div>
            )}

            {fluxos.length === 0 && !edit && <div style={{ fontSize: '12.5px', color: COR.faint, padding: '8px 0' }}>Ainda não há fluxos. Crie o primeiro — por exemplo "Contratos: Chefia → Direção".</div>}
            {fluxos.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderTop: `1px solid ${COR.borderSoft}`, opacity: f.ativo ? 1 : 0.5 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: COR.ink, fontSize: '13px' }}>{f.nome} {f.tipo_id && <span style={{ fontWeight: 500, color: COR.faint, fontSize: '11.5px' }}>· sugerido para {tipos.find(t => t.id === f.tipo_id)?.nome || 'tipo'}</span>}{!f.ativo && <span style={{ fontWeight: 500, color: COR.faint, fontSize: '11.5px' }}> · desativado</span>}</div>
                        <div style={{ fontSize: '12px', color: COR.muted, marginTop: '2px', display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                            {(f.etapas || []).map((e: any, i: number) => (
                                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    {i > 0 && <span style={{ color: COR.faint }}>→</span>}
                                    <span style={{ background: COR.canvas, border: `1px solid ${COR.borderSoft}`, borderRadius: '2px', padding: '2px 7px' }} title={`${e.modo === 'todos' ? 'todos aprovam' : 'basta um'}${e.prazo_horas ? ` · ${e.prazo_horas} h` : ''}${e.escalar_para ? ` · escala para ${nomeDe(e.escalar_para)}` : ''}`}>
                                        <strong>{e.nome}</strong>: {(e.aprovadores || []).map(nomeDe).join(', ')}
                                    </span>
                                </span>
                            ))}
                        </div>
                    </div>
                    <button style={{ ...btn(), padding: '4px 8px' }} onClick={() => setEdit({ ...f, tipo_id: f.tipo_id || '', etapas: (f.etapas || []).map((e: any) => ({ ...e, prazo_horas: e.prazo_horas ?? '', escalar_para: e.escalar_para || '' })) })}>Editar</button>
                    <button style={{ ...btn(), padding: '4px 8px' }} onClick={() => alternarAtivo(f)}>{f.ativo ? 'Desativar' : 'Ativar'}</button>
                    <button style={{ ...btn(false, true), padding: '4px 8px' }} title="Apagar fluxo" onClick={() => apagar(f)}><Trash2 size={12} /></button>
                </div>
            ))}
        </div>
    );
}
