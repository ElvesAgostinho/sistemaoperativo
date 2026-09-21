import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, X } from 'lucide-react';
import { API, authFetch, AREAS, COR, btn, input, label } from './comum';
import type { TipoDoc } from './comum';

const TIPOS_CAMPO = [
    { v: 'texto', l: 'Texto' }, { v: 'numero', l: 'Número' }, { v: 'moeda', l: 'Moeda (Kz)' },
    { v: 'data', l: 'Data' }, { v: 'boolean', l: 'Sim / Não' }, { v: 'selecao', l: 'Seleção' }
];

export default function DocumentosTipos() {
    const [tipos, setTipos] = useState<TipoDoc[]>([]);
    const [edit, setEdit] = useState<any>(null);
    const [erro, setErro] = useState('');
    const [aGuardar, setAGuardar] = useState(false);

    const carregar = useCallback(async () => { const r = await authFetch(`${API}/api/documentos/tipos`); const d = await r.json(); if (d.success) setTipos(d.tipos); }, []);
    useEffect(() => { carregar(); }, [carregar]);

    const novo = () => setEdit({ nome: '', prefixo: '', area_padrao: 'Outros', confidencialidade_padrao: 'Normal', tem_validade: false, campos: [], ativo: true });

    const guardar = async () => {
        setErro(''); setAGuardar(true);
        const res = await authFetch(`${API}/api/documentos/tipos${edit.id ? '/' + edit.id : ''}`, { method: edit.id ? 'PUT' : 'POST', body: JSON.stringify(edit) });
        const d = await res.json();
        setAGuardar(false);
        if (!res.ok || !d.success) { setErro(d.error || 'Não foi possível guardar.'); return; }
        setEdit(null); carregar();
    };

    const alternarAtivo = async (t: TipoDoc) => {
        const res = await authFetch(`${API}/api/documentos/tipos/${t.id}`, { method: 'PUT', body: JSON.stringify({ ativo: !t.ativo }) });
        const d = await res.json();
        if (!res.ok || !d.success) { alert('Erro: ' + (d.error || 'não foi possível alterar.')); return; }
        carregar();
    };

    const setCampo = (i: number, alt: any) => setEdit({ ...edit, campos: edit.campos.map((c: any, j: number) => j === i ? { ...c, ...alt } : c) });
    const mover = (i: number, dir: -1 | 1) => {
        const c = [...edit.campos]; const j = i + dir; if (j < 0 || j >= c.length) return;
        [c[i], c[j]] = [c[j], c[i]]; setEdit({ ...edit, campos: c });
    };
    const chaveDe = (rotulo: string) => rotulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

    return (
        <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ fontWeight: 700, color: COR.ink, flex: 1 }}>Tipos de documento</div>
                <button style={btn(true)} onClick={novo}><Plus size={13} /> Novo tipo</button>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: COR.muted, lineHeight: 1.5 }}>
                Cada tipo tem o seu prefixo de código (CTR-2026-00012), a área e a confidencialidade por omissão, e os campos próprios que a IA tenta preencher ao ler o documento.
            </p>

            {edit && (
                <div style={{ border: `1px solid ${COR.accent}`, borderRadius: '2px', padding: '14px', marginBottom: '14px', background: COR.canvas }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 90px 1.4fr 1.2fr 110px', gap: '10px', marginBottom: '12px' }}>
                        <div><label style={label}>Nome</label><input value={edit.nome} onChange={e => setEdit({ ...edit, nome: e.target.value })} style={input} /></div>
                        <div><label style={label}>Prefixo</label><input value={edit.prefixo} maxLength={6} onChange={e => setEdit({ ...edit, prefixo: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} placeholder="CTR" style={input} /></div>
                        <div><label style={label}>Área por omissão</label><select value={edit.area_padrao} onChange={e => setEdit({ ...edit, area_padrao: e.target.value })} style={input}>{AREAS.map(a => <option key={a}>{a}</option>)}</select></div>
                        <div><label style={label}>Confidencialidade</label><select value={edit.confidencialidade_padrao} onChange={e => setEdit({ ...edit, confidencialidade_padrao: e.target.value })} style={input}><option>Normal</option><option>Confidencial</option><option>Restrito</option></select></div>
                        <div><label style={label}>Tem validade</label><select value={edit.tem_validade ? 'sim' : 'nao'} onChange={e => setEdit({ ...edit, tem_validade: e.target.value === 'sim' })} style={input}><option value="nao">Não</option><option value="sim">Sim</option></select></div>
                    </div>

                    <label style={label}>Campos do tipo</label>
                    {edit.campos.length === 0 && <div style={{ fontSize: '12.5px', color: COR.faint, marginBottom: '8px' }}>Sem campos — só os dados comuns (título, datas, validade, entidade).</div>}
                    {edit.campos.map((c: any, i: number) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 1fr 1.6fr 80px auto', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                            <input value={c.rotulo} onChange={e => setCampo(i, { rotulo: e.target.value, chave: c.chaveManual ? c.chave : chaveDe(e.target.value) })} placeholder="Rótulo (ex: Fornecedor)" style={input} />
                            <input value={c.chave} onChange={e => setCampo(i, { chave: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''), chaveManual: true })} placeholder="chave" title="Identificador interno (letras, números, _)" style={{ ...input, fontFamily: 'monospace', fontSize: '12px' }} />
                            <select value={c.tipo} onChange={e => setCampo(i, { tipo: e.target.value })} style={input}>{TIPOS_CAMPO.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
                            {c.tipo === 'selecao'
                                ? <input value={(c.opcoes || []).join(', ')} onChange={e => setCampo(i, { opcoes: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} placeholder="Opções separadas por vírgula" style={input} />
                                : <span style={{ fontSize: '11.5px', color: COR.faint }}>—</span>}
                            <label style={{ fontSize: '11.5px', color: COR.muted, display: 'flex', alignItems: 'center', gap: '4px' }}><input type="checkbox" checked={!!c.obrigatorio} onChange={e => setCampo(i, { obrigatorio: e.target.checked })} /> obrig.</label>
                            <div style={{ display: 'flex', gap: '2px' }}>
                                <button style={{ ...btn(), padding: '4px' }} onClick={() => mover(i, -1)} title="Subir"><ArrowUp size={12} /></button>
                                <button style={{ ...btn(), padding: '4px' }} onClick={() => mover(i, 1)} title="Descer"><ArrowDown size={12} /></button>
                                <button style={{ ...btn(false, true), padding: '4px' }} onClick={() => setEdit({ ...edit, campos: edit.campos.filter((_: any, j: number) => j !== i) })}><Trash2 size={12} /></button>
                            </div>
                        </div>
                    ))}
                    <button style={{ ...btn(), padding: '5px 10px', marginTop: '4px' }} onClick={() => setEdit({ ...edit, campos: [...edit.campos, { chave: '', rotulo: '', tipo: 'texto', obrigatorio: false }] })}><Plus size={12} /> Campo</button>

                    {erro && <div style={{ color: COR.bad, fontSize: '12.5px', marginTop: '10px' }}>{erro}</div>}
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                        <button style={btn()} onClick={() => { setEdit(null); setErro(''); }}><X size={13} /> Cancelar</button>
                        <button style={btn(true)} disabled={aGuardar} onClick={guardar}>{aGuardar ? 'A guardar...' : 'Guardar tipo'}</button>
                    </div>
                </div>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead><tr style={{ background: COR.canvas }}>{['Tipo', 'Prefixo', 'Área', 'Confid.', 'Validade', 'Campos', 'Estado', ''].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10.5px', fontWeight: 700, color: COR.faint, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                <tbody>
                    {tipos.map(t => (
                        <tr key={t.id} style={{ borderTop: `1px solid ${COR.borderSoft}`, opacity: t.ativo ? 1 : 0.5 }}>
                            <td style={{ padding: '8px 10px', fontWeight: 600, color: COR.ink }}>{t.nome}</td>
                            <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: COR.accent }}>{t.prefixo}</td>
                            <td style={{ padding: '8px 10px' }}>{t.area_padrao}</td>
                            <td style={{ padding: '8px 10px' }}>{t.confidencialidade_padrao}</td>
                            <td style={{ padding: '8px 10px' }}>{t.tem_validade ? 'Sim' : '—'}</td>
                            <td style={{ padding: '8px 10px', color: COR.muted }}>{t.campos.length === 0 ? '—' : t.campos.map(c => c.rotulo).join(', ')}</td>
                            <td style={{ padding: '8px 10px' }}>{t.ativo ? 'Ativo' : 'Desativado'}</td>
                            <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                                <button style={{ ...btn(), padding: '4px 8px', marginRight: '4px' }} onClick={() => setEdit({ ...t, campos: t.campos.map(c => ({ ...c, chaveManual: true })) })}>Editar</button>
                                <button style={{ ...btn(), padding: '4px 8px' }} onClick={() => alternarAtivo(t)}>{t.ativo ? 'Desativar' : 'Ativar'}</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
