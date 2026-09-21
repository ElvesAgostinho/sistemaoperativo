import { useState, useEffect, useCallback } from 'react';
import { PenLine, Link2, Copy, Ban, MapPin, QrCode, Printer, Check, X, Clock, Maximize2 } from 'lucide-react';
import { API, authFetch, COR, fmtDataHora, fmtData, btn, input, label, usuarioAtual } from './comum';
import type { Doc } from './comum';

// ============================================================
// ASSINATURAS (separador)
// ============================================================
export function Assinaturas({ doc, utilizadores, podeEditar, onMudou, setErro }: { doc: Doc; utilizadores: any[]; podeEditar: boolean; onMudou: () => void; setErro: (s: string) => void }) {
    const [dados, setDados] = useState<any>(null);
    const [sel, setSel] = useState<string[]>([]);
    const [aEnviar, setAEnviar] = useState(false);
    const [motivo, setMotivo] = useState('');
    const [aRecusar, setARecusar] = useState<number | null>(null);
    const eu = usuarioAtual();

    const carregar = useCallback(async () => { const r = await authFetch(`${API}/api/documentos/${doc.id}/assinaturas`); const d = await r.json(); if (d.success) setDados(d); else setErro(d.error || ''); }, [doc.id, setErro]);
    useEffect(() => { carregar(); }, [carregar]);

    const pedir = async () => {
        setAEnviar(true); setErro('');
        const r = await authFetch(`${API}/api/documentos/${doc.id}/assinaturas`, { method: 'POST', body: JSON.stringify({ fornecedor: 'interna', signatarios: sel.map(id => ({ user_id: id })) }) }); const d = await r.json();
        setAEnviar(false);
        if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível pedir.'); return; }
        setSel([]); await carregar(); onMudou();
    };
    const responder = async (id: number, decisao: 'assinar' | 'recusar') => {
        setErro('');
        const r = await authFetch(`${API}/api/documentos/assinaturas/${id}/responder`, { method: 'POST', body: JSON.stringify({ decisao, motivo }) }); const d = await r.json();
        if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível responder.'); return; }
        setARecusar(null); setMotivo(''); await carregar(); onMudou();
    };
    const cancelar = async () => {
        const m = prompt('Motivo do cancelamento do pedido de assinatura:'); if (!m) return;
        const r = await authFetch(`${API}/api/documentos/${doc.id}/assinaturas/cancelar`, { method: 'POST', body: JSON.stringify({ motivo: m }) }); const d = await r.json();
        if (!r.ok || !d.success) { setErro(d.error || ''); return; }
        await carregar(); onMudou();
    };

    if (!dados) return <div style={{ padding: '16px', color: COR.muted, fontSize: '13px' }}>A carregar...</div>;
    const pendentes = dados.assinaturas.filter((a: any) => a.estado === 'pendente');
    const cor: Record<string, string> = { pendente: COR.accent, assinada: COR.good, recusada: COR.bad, cancelada: COR.faint };
    const rot: Record<string, string> = { pendente: 'Pendente', assinada: 'Assinada', recusada: 'Recusada', cancelada: 'Cancelada' };
    const adaptador = dados.adaptadores.find((a: any) => a.id === 'interna');
    const externo = dados.adaptadores.find((a: any) => a.id === 'externa');

    return (
        <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {dados.podePedir && podeEditar && pendentes.length === 0 && (
                <div style={{ border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '12px' }}>
                    <div style={{ fontWeight: 700, color: COR.ink, fontSize: '13px', marginBottom: '4px' }}>Pedir assinatura</div>
                    <div style={{ fontSize: '12px', color: COR.muted, marginBottom: '8px', lineHeight: 1.45 }}>{adaptador?.nota}</div>
                    <label style={label}>Signatários (utilizadores do sistema)</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                        {utilizadores.map(u => <button key={u.id} onClick={() => setSel(sel.includes(u.id) ? sel.filter(x => x !== u.id) : [...sel, u.id])} style={{ ...btn(sel.includes(u.id)), padding: '4px 10px', fontSize: '12px' }}>{u.nome || u.email}</button>)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11.5px', color: COR.faint }}>{externo?.disponivel ? 'Fornecedor certificado disponível.' : 'Assinatura qualificada externa: não configurada.'}</span>
                        <button style={btn(true)} disabled={aEnviar || sel.length === 0} onClick={pedir}><PenLine size={13} /> {aEnviar ? 'A pedir...' : 'Pedir assinatura'}</button>
                    </div>
                </div>
            )}
            {!dados.podePedir && pendentes.length === 0 && podeEditar && <div style={{ fontSize: '12.5px', color: COR.muted }}>Só se pedem assinaturas a documentos <strong>Ativos</strong> ou <strong>Aprovados</strong>.</div>}

            {pendentes.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12.5px', color: COR.accent, fontWeight: 700, flex: 1 }}>À espera de {pendentes.length} assinatura{pendentes.length === 1 ? '' : 's'} (versão {pendentes[0].versao})</span>
                    {podeEditar && <button style={{ ...btn(), padding: '5px 9px', fontSize: '11.5px' }} onClick={cancelar}><Ban size={12} /> Cancelar pedido</button>}
                </div>
            )}

            {dados.assinaturas.length === 0 && <div style={{ fontSize: '12.5px', color: COR.faint }}>Este documento nunca teve pedidos de assinatura.</div>}
            {dados.assinaturas.map((a: any) => (
                <div key={a.id} style={{ border: `1px solid ${COR.borderSoft}`, borderRadius: '2px', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px' }}>
                        <PenLine size={13} color={cor[a.estado]} />
                        <span style={{ fontWeight: 700, color: COR.ink, flex: 1 }}>{a.signatario_nome}</span>
                        <span style={{ fontSize: '10.5px', fontWeight: 700, color: cor[a.estado], background: COR.canvas, padding: '2px 7px', borderRadius: '2px' }}>{rot[a.estado]}</span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: COR.faint, marginTop: '3px' }}>v{a.versao} · {a.fornecedor === 'interna' ? 'confirmação no sistema' : 'fornecedor externo'} · pedido {fmtDataHora(a.pedido_em)}{a.concluido_em ? ` · ${rot[a.estado].toLowerCase()} ${fmtDataHora(a.concluido_em)}` : ''}</div>
                    {a.estado === 'assinada' && a.evidencia && <div style={{ fontSize: '11px', color: COR.muted, marginTop: '3px', fontFamily: 'monospace', wordBreak: 'break-all' }}>IP {a.evidencia.ip || '—'} · sha256 {String(a.evidencia.hash || a.hash_documento).slice(0, 16)}…</div>}
                    {a.motivo && <div style={{ fontSize: '12px', color: COR.muted, marginTop: '3px', fontStyle: 'italic' }}>"{a.motivo}"</div>}
                    {a.estado === 'pendente' && a.signatario_user_id === eu.id && (
                        <div style={{ marginTop: '8px' }}>
                            {aRecusar === a.id
                                ? <div><label style={label}>Motivo da recusa</label><textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} style={{ ...input, resize: 'vertical' }} />
                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '6px' }}><button style={{ ...btn(), padding: '5px 9px' }} onClick={() => setARecusar(null)}>Cancelar</button><button style={{ ...btn(), padding: '5px 9px', background: COR.bad, color: 'white', border: 'none' }} disabled={!motivo.trim()} onClick={() => responder(a.id, 'recusar')}>Confirmar recusa</button></div></div>
                                : <div style={{ display: 'flex', gap: '6px' }}>
                                    <button style={{ ...btn(), padding: '6px 10px', background: COR.good, color: 'white', border: 'none' }} onClick={() => { if (confirm('Confirma que leu e aceita esta versão do documento? Fica registado o seu nome, data, IP e o hash do ficheiro.')) responder(a.id, 'assinar'); }}><Check size={13} /> Assinar</button>
                                    <button style={{ ...btn(), padding: '6px 10px', color: COR.bad, borderColor: '#fecaca' }} onClick={() => setARecusar(a.id)}><X size={13} /> Recusar</button>
                                </div>}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

// ============================================================
// PARTILHA POR LINK (painel dentro do documento)
// ============================================================
export function Partilha({ doc, setErro, onFechar }: { doc: Doc; setErro: (s: string) => void; onFechar: () => void }) {
    const [lista, setLista] = useState<any[] | null>(null);
    const [f, setF] = useState({ horas: '72', destinatario: '', max_acessos: '', senha: '' });
    const [novo, setNovo] = useState<string | null>(null);
    const [aCriar, setACriar] = useState(false);
    const carregar = useCallback(async () => { const r = await authFetch(`${API}/api/documentos/${doc.id}/partilhas`); const d = await r.json(); setLista(d.success ? d.partilhas : []); }, [doc.id]);
    useEffect(() => { carregar(); }, [carregar]);
    const criar = async () => {
        setACriar(true); setErro('');
        const r = await authFetch(`${API}/api/documentos/${doc.id}/partilhas`, { method: 'POST', body: JSON.stringify({ horas: Number(f.horas), destinatario: f.destinatario, max_acessos: f.max_acessos ? Number(f.max_acessos) : null, senha: f.senha || undefined }) }); const d = await r.json();
        setACriar(false);
        if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível criar o link.'); return; }
        setNovo(d.url); carregar();
    };
    const revogar = async (id: number) => { await authFetch(`${API}/api/documentos/${doc.id}/partilhas/${id}`, { method: 'DELETE' }); carregar(); };
    const copiar = (t: string) => { navigator.clipboard?.writeText(t).catch(() => {}); };
    return (
        <div style={{ margin: '10px 16px 0', padding: '12px', border: `1px solid ${COR.accent}`, borderRadius: '2px', background: COR.canvas }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><Link2 size={14} color={COR.accent} /><span style={{ fontWeight: 700, fontSize: '13px', color: COR.ink, flex: 1 }}>Partilhar por link temporário</span><X size={14} style={{ cursor: 'pointer' }} onClick={onFechar} /></div>
            {doc.confidencialidade === 'Restrito' ? <div style={{ fontSize: '12.5px', color: COR.bad }}>Documentos Restritos não se partilham por link.</div> : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div><label style={label}>Válido durante</label><select value={f.horas} onChange={e => setF({ ...f, horas: e.target.value })} style={input}><option value="1">1 hora</option><option value="24">1 dia</option><option value="72">3 dias</option><option value="168">7 dias</option><option value="720">30 dias</option></select></div>
                        <div><label style={label}>Máx. de acessos (opcional)</label><input type="number" min={1} value={f.max_acessos} onChange={e => setF({ ...f, max_acessos: e.target.value })} placeholder="sem limite" style={input} /></div>
                        <div><label style={label}>Para quem (informativo)</label><input value={f.destinatario} onChange={e => setF({ ...f, destinatario: e.target.value })} placeholder="ex.: auditor@exemplo.ao" style={input} /></div>
                        <div><label style={label}>Senha (opcional)</label><input value={f.senha} onChange={e => setF({ ...f, senha: e.target.value })} placeholder="quem abre tem de a saber" style={input} /></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}><button style={btn(true)} disabled={aCriar} onClick={criar}><Link2 size={13} /> {aCriar ? 'A criar...' : 'Criar link'}</button></div>
                    {novo && <div style={{ marginTop: '8px', padding: '8px 10px', background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', fontSize: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}><span style={{ flex: 1, wordBreak: 'break-all', fontFamily: 'monospace' }}>{novo}</span><button style={{ ...btn(), padding: '4px 8px' }} onClick={() => copiar(novo)}><Copy size={12} /> Copiar</button></div>}
                </>
            )}
            {lista && lista.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                    <label style={label}>Links deste documento</label>
                    {lista.map(p => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '6px 0', borderTop: `1px solid ${COR.borderSoft}`, opacity: p.ativa ? 1 : 0.55 }}>
                            <span style={{ flex: 1, minWidth: 0 }}><span style={{ fontWeight: 600, color: COR.ink }}>{p.destinatario || 'link'}</span> · expira {fmtDataHora(p.expira_em)} · {p.acessos}{p.max_acessos ? `/${p.max_acessos}` : ''} acesso{p.acessos === 1 ? '' : 's'}{p.com_senha ? ' · com senha' : ''}{p.revogado ? ' · revogado' : !p.ativa ? ' · expirado' : ''}</span>
                            {p.ativa && <button style={{ ...btn(), padding: '3px 7px', fontSize: '11px' }} onClick={() => copiar(p.url)}><Copy size={11} /></button>}
                            {p.ativa && <button style={{ ...btn(false, true), padding: '3px 7px', fontSize: '11px' }} onClick={() => revogar(p.id)} title="Revogar"><Ban size={11} /></button>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ============================================================
// ARQUIVO FÍSICO + RETENÇÃO (secção do separador Dados)
// ============================================================
const CAMPOS_FISICO = [['edificio', 'Edifício'], ['sala', 'Sala'], ['armario', 'Armário'], ['prateleira', 'Prateleira'], ['caixa', 'Caixa'], ['pasta', 'Pasta']] as const;

export function ArquivoFisico({ doc, podeEditar, podeGerir, onMudou, setErro }: { doc: Doc; podeEditar: boolean; podeGerir: boolean; onMudou: () => void; setErro: (s: string) => void }) {
    const [l, setL] = useState<any>(doc.localizacao_fisica || {});
    const [codigo, setCodigo] = useState(doc.codigo_fisico || '');
    const [emprestado, setEmprestado] = useState(doc.emprestado_a || '');
    const [aGuardar, setAGuardar] = useState(false);
    const [aberto, setAberto] = useState(!!doc.localizacao_fisica);
    useEffect(() => { setL(doc.localizacao_fisica || {}); setCodigo(doc.codigo_fisico || ''); setEmprestado(doc.emprestado_a || ''); }, [doc.id, doc.localizacao_fisica, doc.codigo_fisico, doc.emprestado_a]);

    const guardar = async () => {
        setAGuardar(true); setErro('');
        const r = await authFetch(`${API}/api/documentos/${doc.id}/fisico`, { method: 'PUT', body: JSON.stringify({ localizacao_fisica: l, codigo_fisico: codigo, emprestado_a: emprestado }) }); const d = await r.json();
        setAGuardar(false);
        if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível guardar.'); return; }
        onMudou();
    };
    const etiqueta = async () => {
        const r = await authFetch(`${API}/api/documentos/${doc.id}/etiqueta`); const d = await r.json();
        if (!d.success) { setErro(d.error || ''); return; }
        const w = window.open('', '_blank', 'width=420,height=360'); if (!w) return;
        w.document.write(`<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><title>Etiqueta ${d.codigo}</title><style>body{font-family:Roboto,Arial,sans-serif;margin:0;padding:16px;display:flex;gap:16px;align-items:center}@media print{button{display:none}}.t{font-size:13px;color:#1D2D3E}.c{font-family:monospace;font-size:16px;font-weight:700;color:#0E5A6B}.l{font-size:11px;color:#5B738B;margin-top:4px}</style></head><body>${d.svg}<div><div class="c">${d.codigo}</div><div class="t">${d.titulo.replace(/</g, '&lt;')}</div><div class="l">${d.localizacao || 'Sem localização'}</div><div class="l">Leia o QR para abrir no BusinessOS</div><br><button onclick="print()">Imprimir</button></div></body></html>`);
        w.document.close();
    };
    const decidirRetencao = async (decisao: 'manter' | 'eliminar') => {
        const motivo = prompt(decisao === 'manter' ? 'Motivo para manter em arquivo por mais um período:' : 'Motivo da eliminação:'); if (!motivo) return;
        const r = await authFetch(`${API}/api/documentos/${doc.id}/retencao`, { method: 'POST', body: JSON.stringify({ decisao, motivo }) }); const d = await r.json();
        if (!r.ok || !d.success) { setErro(d.error || ''); return; }
        onMudou();
    };

    return (
        <div style={{ border: `1px solid ${COR.borderSoft}`, borderRadius: '2px', padding: '10px 12px' }}>
            {doc.ciclo === 'RETENTION_PENDING' && (
                <div style={{ marginBottom: '10px', padding: '10px', background: '#FCEFDD', border: '1px solid #DF6E0C', borderRadius: '2px', fontSize: '12.5px', color: '#8A4B0B' }}>
                    <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}><Clock size={13} /> Prazo de retenção atingido{doc.retencao_ate ? ` (${fmtData(doc.retencao_ate)})` : ''}</div>
                    <div style={{ marginTop: '3px' }}>Decida: manter em arquivo por mais um período, ou eliminar (fica recuperável durante o período de segurança).</div>
                    {podeGerir && <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}><button style={{ ...btn(true), padding: '5px 10px' }} onClick={() => decidirRetencao('manter')}>Manter em arquivo</button><button style={{ ...btn(false, true), padding: '5px 10px' }} onClick={() => decidirRetencao('eliminar')}>Eliminar</button></div>}
                </div>
            )}
            {doc.retencao_ate && doc.ciclo !== 'RETENTION_PENDING' && <div style={{ fontSize: '11.5px', color: COR.faint, marginBottom: '8px' }}>Guardar até {fmtData(doc.retencao_ate)} (política do tipo){doc.retencao_decisao ? ` · última decisão: ${doc.retencao_decisao}` : ''}</div>}

            <div onClick={() => setAberto(!aberto)} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <MapPin size={13} color={COR.accent} /><span style={{ fontWeight: 700, fontSize: '12.5px', color: COR.ink, flex: 1 }}>Arquivo físico {doc.localizacao_fisica ? <span style={{ fontWeight: 500, color: COR.muted }}>· {CAMPOS_FISICO.filter(([k]) => doc.localizacao_fisica?.[k]).map(([k, r]) => `${r} ${doc.localizacao_fisica![k]}`).join(' · ')}</span> : <span style={{ fontWeight: 500, color: COR.faint }}>· sem localização</span>}</span>
                {doc.emprestado_a && <span style={{ fontSize: '11px', color: COR.warn, fontWeight: 700 }}>emprestado a {doc.emprestado_a}</span>}
                <button style={{ ...btn(), padding: '3px 8px', fontSize: '11px' }} onClick={e => { e.stopPropagation(); etiqueta(); }} title="Etiqueta com QR para o papel"><QrCode size={11} /> Etiqueta</button>
            </div>
            {aberto && (
                <div style={{ marginTop: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                        {CAMPOS_FISICO.map(([k, r]) => <div key={k}><label style={{ ...label, fontSize: '10px' }}>{r}</label><input value={l[k] || ''} disabled={!podeEditar} onChange={e => setL({ ...l, [k]: e.target.value })} style={{ ...input, padding: '6px 8px', fontSize: '12px' }} /></div>)}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px' }}>
                        <div><label style={{ ...label, fontSize: '10px' }}>Código na etiqueta</label><input value={codigo} disabled={!podeEditar} onChange={e => setCodigo(e.target.value)} placeholder={doc.codigo || 'por omissão o código do documento'} style={{ ...input, padding: '6px 8px', fontSize: '12px' }} /></div>
                        <div><label style={{ ...label, fontSize: '10px' }}>Emprestado a (quem tem o papel)</label><input value={emprestado} disabled={!podeEditar} onChange={e => setEmprestado(e.target.value)} placeholder="vazio = está no arquivo" style={{ ...input, padding: '6px 8px', fontSize: '12px' }} /></div>
                    </div>
                    <div><label style={{ ...label, fontSize: '10px', marginTop: '6px' }}>Notas</label><input value={l.notas || ''} disabled={!podeEditar} onChange={e => setL({ ...l, notas: e.target.value })} style={{ ...input, padding: '6px 8px', fontSize: '12px' }} /></div>
                    {podeEditar && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}><button style={{ ...btn(true), padding: '5px 10px' }} disabled={aGuardar} onClick={guardar}><Printer size={12} /> {aGuardar ? 'A guardar...' : 'Guardar localização'}</button></div>}
                </div>
            )}
        </div>
    );
}

// ============================================================
// VISUALIZADOR EM ECRÃ INTEIRO
// ============================================================
export function Visualizador({ doc, onFechar }: { doc: Doc; onFechar: () => void }) {
    const ehPdf = (doc.mime_type || '').includes('pdf'); const ehImg = (doc.mime_type || '').startsWith('image/');
    return (
        <div onClick={onFechar} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,59,71,0.85)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', color: 'white', fontSize: '13px' }} onClick={e => e.stopPropagation()}>
                <Maximize2 size={15} /><span style={{ fontWeight: 700 }}>{doc.codigo ? doc.codigo + ' · ' : ''}{doc.titulo}</span><span style={{ opacity: 0.7 }}>{doc.nome_ficheiro}</span>
                <span style={{ flex: 1 }} />
                {doc.url && <a href={doc.url} target="_blank" rel="noreferrer" style={{ color: 'white', fontSize: '12.5px' }}>Abrir noutro separador</a>}
                <X size={20} style={{ cursor: 'pointer' }} onClick={onFechar} />
            </div>
            <div style={{ flex: 1, minHeight: 0, margin: '0 16px 16px', background: 'white', borderRadius: '2px', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                {ehPdf && doc.url && <iframe title="pdf" src={doc.url} style={{ width: '100%', height: '100%', border: 'none' }} />}
                {ehImg && doc.url && <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}><img src={doc.url} alt={doc.titulo} style={{ maxWidth: '100%' }} /></div>}
                {!ehPdf && !ehImg && <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '13.5px', padding: '24px', color: COR.ink, lineHeight: 1.55 }}>{doc.texto || 'Sem pré-visualização para este formato. Descarregue o ficheiro.'}</pre>}
            </div>
        </div>
    );
}
