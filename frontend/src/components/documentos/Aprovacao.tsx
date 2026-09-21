import { useState, useEffect, useCallback } from 'react';
import { Send, Check, X, UserPlus, Ban, ChevronDown, ChevronRight, Clock, AlertTriangle } from 'lucide-react';
import { API, authFetch, COR, ROTULO_CICLO, ROTULO_TAREFA, COR_TAREFA, fmtDataHora, horasRestantes, btn, input, label, usuarioAtual } from './comum';
import type { Doc } from './comum';

export function BadgeTarefa({ estado }: { estado: string }) {
    const c = COR_TAREFA[estado] || COR_TAREFA.pendente;
    return <span style={{ fontSize: '10.5px', fontWeight: 700, color: c.c, background: c.bg, padding: '2px 7px', borderRadius: '2px', whiteSpace: 'nowrap' }}>{ROTULO_TAREFA[estado] || estado}</span>;
}

/**
 * Botões de decisão de uma tarefa (usados no separador do documento e na
 * caixa "As minhas aprovações"). Rejeitar e delegar pedem um texto.
 */
export function AcoesTarefa({ tarefa, utilizadores, onFeito, setErro, compacto }: { tarefa: any; utilizadores: any[]; onFeito: () => void; setErro: (s: string) => void; compacto?: boolean }) {
    const [modo, setModo] = useState<'' | 'rejeitar' | 'delegar'>('');
    const [texto, setTexto] = useState('');
    const [para, setPara] = useState('');
    const [aEnviar, setAEnviar] = useState(false);
    const eu = usuarioAtual().id;

    const chamar = async (url: string, body: any) => {
        setAEnviar(true); setErro('');
        const r = await authFetch(url, { method: 'POST', body: JSON.stringify(body) }); const d = await r.json();
        setAEnviar(false);
        if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível concluir.'); return false; }
        setModo(''); setTexto(''); setPara(''); onFeito(); return true;
    };
    const aprovar = () => chamar(`${API}/api/documentos/aprovacoes/${tarefa.id}/decidir`, { decisao: 'aprovar', comentario: texto });
    const rejeitar = () => chamar(`${API}/api/documentos/aprovacoes/${tarefa.id}/decidir`, { decisao: 'rejeitar', comentario: texto });
    const delegar = () => chamar(`${API}/api/documentos/aprovacoes/${tarefa.id}/delegar`, { para, comentario: texto });

    const pequeno = { ...btn(), padding: compacto ? '5px 9px' : '7px 12px', fontSize: '12px' };
    if (modo === '') return (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button style={{ ...pequeno, background: COR.good, color: 'white', border: 'none' }} disabled={aEnviar} onClick={aprovar}><Check size={13} /> Aprovar</button>
            <button style={{ ...pequeno, color: COR.bad, borderColor: '#fecaca' }} disabled={aEnviar} onClick={() => setModo('rejeitar')}><X size={13} /> Rejeitar</button>
            <button style={pequeno} disabled={aEnviar} onClick={() => setModo('delegar')}><UserPlus size={13} /> Delegar</button>
        </div>
    );
    return (
        <div style={{ border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '10px', background: COR.canvas }}>
            {modo === 'delegar' && (
                <div style={{ marginBottom: '8px' }}>
                    <label style={label}>Delegar a</label>
                    <select value={para} onChange={e => setPara(e.target.value)} style={input}>
                        <option value="">Escolha…</option>
                        {utilizadores.filter(u => u.id !== eu).map(u => <option key={u.id} value={u.id}>{u.nome || u.email}</option>)}
                    </select>
                </div>
            )}
            <label style={label}>{modo === 'rejeitar' ? 'Motivo da rejeição (obrigatório)' : 'Nota para quem recebe (opcional)'}</label>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} style={{ ...input, resize: 'vertical' }} placeholder={modo === 'rejeitar' ? 'Ex.: falta o anexo com o orçamento' : ''} />
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button style={pequeno} onClick={() => { setModo(''); setTexto(''); }}>Cancelar</button>
                {modo === 'rejeitar'
                    ? <button style={{ ...pequeno, background: COR.bad, color: 'white', border: 'none' }} disabled={aEnviar || !texto.trim()} onClick={rejeitar}>Confirmar rejeição</button>
                    : <button style={{ ...pequeno, background: COR.accent, color: 'white', border: 'none' }} disabled={aEnviar || !para} onClick={delegar}>Delegar</button>}
            </div>
        </div>
    );
}

/** Separador "Aprovação" do documento: submeter, acompanhar e decidir. */
export default function Aprovacao({ doc, utilizadores, podeEditar, onMudou, setErro }: { doc: Doc; utilizadores: any[]; podeEditar: boolean; onMudou: () => void; setErro: (s: string) => void }) {
    const [dados, setDados] = useState<any>(null);
    const [fluxoId, setFluxoId] = useState('');
    const [comentario, setComentario] = useState('');
    const [aSubmeter, setASubmeter] = useState(false);
    const [abertos, setAbertos] = useState<Record<number, boolean>>({});
    const eu = usuarioAtual();

    const carregar = useCallback(async () => {
        const r = await authFetch(`${API}/api/documentos/${doc.id}/processos`); const d = await r.json();
        if (d.success) {
            setDados(d);
            if (!fluxoId) { const sugerido = d.fluxos.find((f: any) => f.tipo_id && f.tipo_id === doc.tipo_id) || d.fluxos[0]; if (sugerido) setFluxoId(String(sugerido.id)); }
        } else setErro(d.error || 'Não foi possível carregar as aprovações.');
    }, [doc.id, doc.tipo_id]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { carregar(); }, [carregar]);

    const submeter = async () => {
        setASubmeter(true); setErro('');
        const r = await authFetch(`${API}/api/documentos/${doc.id}/processos`, { method: 'POST', body: JSON.stringify({ fluxo_id: Number(fluxoId), comentario }) }); const d = await r.json();
        setASubmeter(false);
        if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível submeter.'); return; }
        setComentario(''); await carregar(); onMudou();
    };
    const cancelar = async (processoId: number) => {
        const motivo = prompt('Motivo do cancelamento:'); if (!motivo) return;
        const r = await authFetch(`${API}/api/documentos/${doc.id}/processos/${processoId}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo }) }); const d = await r.json();
        if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível cancelar.'); return; }
        await carregar(); onMudou();
    };

    if (!dados) return <div style={{ padding: '16px', color: COR.muted, fontSize: '13px' }}>A carregar...</div>;
    const emCurso = dados.processos.find((p: any) => p.estado === 'em_curso');
    const anteriores = dados.processos.filter((p: any) => p.estado !== 'em_curso');
    const ehAdmin = ['admin', 'superadmin'].includes(eu.role || '');

    return (
        <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Submeter */}
            {dados.podeSubmeter && podeEditar && (
                <div style={{ border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '12px' }}>
                    <div style={{ fontWeight: 700, color: COR.ink, fontSize: '13px', marginBottom: '8px' }}>Submeter para aprovação</div>
                    {dados.fluxos.length === 0
                        ? <div style={{ fontSize: '12.5px', color: COR.muted }}>Ainda não há fluxos de aprovação nesta empresa. Um administrador cria-os em <strong>Definições → Fluxos de aprovação</strong>.</div>
                        : <>
                            <label style={label}>Fluxo</label>
                            <select value={fluxoId} onChange={e => setFluxoId(e.target.value)} style={input}>
                                {dados.fluxos.map((f: any) => <option key={f.id} value={f.id}>{f.nome} · {f.etapas} etapa{f.etapas === 1 ? '' : 's'}</option>)}
                            </select>
                            {(() => { const f = dados.fluxos.find((x: any) => String(x.id) === fluxoId); return f?.descricao ? <div style={{ fontSize: '12px', color: COR.muted, marginTop: '4px' }}>{f.descricao}</div> : null; })()}
                            <label style={{ ...label, marginTop: '10px' }}>Nota para os aprovadores (opcional)</label>
                            <textarea value={comentario} onChange={e => setComentario(e.target.value)} rows={2} style={{ ...input, resize: 'vertical' }} />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                                <button style={btn(true)} disabled={aSubmeter || !fluxoId} onClick={submeter}><Send size={13} /> {aSubmeter ? 'A submeter...' : 'Submeter'}</button>
                            </div>
                        </>}
                </div>
            )}
            {!dados.podeSubmeter && !emCurso && podeEditar && (
                <div style={{ fontSize: '12.5px', color: COR.muted }}>Um documento em "{ROTULO_CICLO[doc.ciclo] || doc.ciclo}" não pode ser submetido — confirme-o ou mude o estado primeiro (separador Dados).</div>
            )}

            {/* Em curso */}
            {emCurso && (
                <Processo processo={emCurso} utilizadores={utilizadores} euId={eu.id} onFeito={async () => { await carregar(); onMudou(); }} setErro={setErro}
                    podeCancelar={ehAdmin || emCurso.iniciado_por === eu.id || doc.nivel_acesso === 'gerir'} onCancelar={() => cancelar(emCurso.id)} aberto />
            )}

            {/* Anteriores */}
            {anteriores.length > 0 && (
                <div>
                    <div style={{ ...label, marginBottom: '6px' }}>Processos anteriores</div>
                    {anteriores.map((p: any) => (
                        <div key={p.id} style={{ marginBottom: '6px' }}>
                            <div onClick={() => setAbertos({ ...abertos, [p.id]: !abertos[p.id] })} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px 10px', border: `1px solid ${COR.borderSoft}`, borderRadius: '2px', fontSize: '12.5px' }}>
                                {abertos[p.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                <span style={{ fontWeight: 600, color: COR.ink, flex: 1 }}>{p.fluxo_nome}</span>
                                <BadgeProcesso estado={p.estado} />
                                <span style={{ color: COR.faint, fontSize: '11.5px' }}>{fmtDataHora(p.concluido_em || p.iniciado_em)}</span>
                            </div>
                            {abertos[p.id] && <div style={{ padding: '6px 0 0 10px' }}><Processo processo={p} utilizadores={utilizadores} euId={eu.id} onFeito={carregar} setErro={setErro} podeCancelar={false} onCancelar={() => {}} /></div>}
                        </div>
                    ))}
                </div>
            )}
            {!emCurso && anteriores.length === 0 && !dados.podeSubmeter && <div style={{ fontSize: '12.5px', color: COR.faint }}>Este documento nunca passou por um fluxo de aprovação.</div>}
        </div>
    );
}

export function BadgeProcesso({ estado }: { estado: string }) {
    const m: Record<string, { c: string; bg: string; t: string }> = {
        em_curso: { c: COR.accent, bg: '#E4EDF7', t: 'Em curso' }, aprovado: { c: COR.good, bg: '#DCEEE2', t: 'Aprovado' },
        rejeitado: { c: COR.bad, bg: '#F6DEDE', t: 'Rejeitado' }, cancelado: { c: COR.faint, bg: COR.borderSoft, t: 'Cancelado' }
    };
    const c = m[estado] || m.em_curso;
    return <span style={{ fontSize: '10.5px', fontWeight: 700, color: c.c, background: c.bg, padding: '2px 7px', borderRadius: '2px' }}>{c.t}</span>;
}

/** Linha do tempo de um processo: etapas, aprovadores e tarefas. */
function Processo({ processo: p, utilizadores, euId, onFeito, setErro, podeCancelar, onCancelar, aberto }: any) {
    return (
        <div style={{ border: `1px solid ${aberto ? COR.accent : COR.borderSoft}`, borderRadius: '2px', padding: '12px' }}>
            {aberto && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: COR.ink, fontSize: '13px' }}>{p.fluxo_nome} <BadgeProcesso estado={p.estado} /></div>
                        <div style={{ fontSize: '11.5px', color: COR.faint }}>Submetido por {p.iniciado_por_nome} · {fmtDataHora(p.iniciado_em)} · v{p.versao_documento}</div>
                        {p.comentario && <div style={{ fontSize: '12px', color: COR.muted, marginTop: '3px', fontStyle: 'italic' }}>"{p.comentario}"</div>}
                    </div>
                    {podeCancelar && <button style={{ ...btn(), padding: '5px 9px', fontSize: '11.5px' }} onClick={onCancelar} title="Cancelar o processo e repor o estado anterior"><Ban size={12} /> Cancelar</button>}
                </div>
            )}
            {p.etapas.map((e: any, i: number) => {
                const tarefas = p.tarefas.filter((t: any) => t.etapa === i);
                const situacao = p.estado === 'em_curso' ? (i < p.etapa_atual ? 'feita' : i === p.etapa_atual ? 'atual' : 'futura') : (tarefas.length ? 'feita' : 'futura');
                const cor = situacao === 'atual' ? COR.accent : situacao === 'feita' ? COR.good : COR.border;
                return (
                    <div key={i} style={{ display: 'flex', gap: '10px', paddingBottom: i < p.etapas.length - 1 ? '10px' : 0 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: situacao === 'futura' ? 'white' : cor, border: `2px solid ${cor}`, color: 'white', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{situacao === 'feita' ? <Check size={11} /> : i + 1}</div>
                            {i < p.etapas.length - 1 && <div style={{ width: '2px', flex: 1, background: situacao === 'feita' ? COR.good : COR.border, marginTop: '2px' }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12.5px', fontWeight: 700, color: situacao === 'futura' ? COR.faint : COR.ink }}>{e.nome} <span style={{ fontWeight: 500, color: COR.faint, fontSize: '11px' }}>· {e.modo === 'todos' ? 'todos aprovam' : 'basta um'}{e.prazo_horas ? ` · ${e.prazo_horas} h` : ''}</span></div>
                            {situacao === 'futura' && <div style={{ fontSize: '11.5px', color: COR.faint }}>{(e.aprovadores_nomes || []).join(', ')}</div>}
                            {tarefas.map((t: any) => (
                                <div key={t.id} style={{ marginTop: '5px', fontSize: '12px', color: COR.muted }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <span style={{ color: COR.ink, fontWeight: 600 }}>{t.aprovador_nome}</span>
                                        {t.delegado_de_nome && <span style={{ fontSize: '11px' }}>(delegado por {t.delegado_de_nome})</span>}
                                        {t.escalada_de_nome && <span style={{ fontSize: '11px' }}>(escalado de {t.escalada_de_nome})</span>}
                                        <BadgeTarefa estado={t.estado} />
                                        {t.estado === 'pendente' && t.prazo && <span style={{ fontSize: '11px', color: new Date(t.prazo) < new Date() ? COR.bad : COR.faint, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>{new Date(t.prazo) < new Date() ? <AlertTriangle size={11} /> : <Clock size={11} />}{horasRestantes(t.prazo)}</span>}
                                        {t.decidido_em && t.estado !== 'pendente' && <span style={{ fontSize: '11px', color: COR.faint }}>{fmtDataHora(t.decidido_em)}</span>}
                                    </div>
                                    {t.comentario && <div style={{ fontStyle: 'italic', marginTop: '2px' }}>"{t.comentario}"</div>}
                                    {t.estado === 'pendente' && t.aprovador_id === euId && p.estado === 'em_curso' && (
                                        <div style={{ marginTop: '6px' }}><AcoesTarefa tarefa={t} utilizadores={utilizadores} onFeito={onFeito} setErro={setErro} compacto /></div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
