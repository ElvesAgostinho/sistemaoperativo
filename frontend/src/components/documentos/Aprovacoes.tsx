import { useState, useEffect, useCallback } from 'react';
import { CheckSquare, Clock, AlertTriangle, FileText, ExternalLink, Bell, X } from 'lucide-react';
import { API, authFetch, COR, fmtDataHora, horasRestantes, btn } from './comum';
import type { Doc } from './comum';
import { AcoesTarefa } from './Aprovacao';
import { BadgeCiclo, IconeConfidencialidade } from './DocumentoDetalhe';

/** Caixa "As minhas aprovações": tudo o que espera pela decisão de quem está autenticado. */
export default function Aprovacoes({ onAbrir, onMudou }: { onAbrir: (d: Doc) => void; onMudou: () => void }) {
    const [tarefas, setTarefas] = useState<any[] | null>(null);
    const [utilizadores, setUtilizadores] = useState<any[]>([]);
    const [erro, setErro] = useState('');

    const carregar = useCallback(async () => {
        const r = await authFetch(`${API}/api/documentos/aprovacoes/minhas`); const d = await r.json();
        if (d.success) setTarefas(d.tarefas); else { setTarefas([]); setErro(d.error || ''); }
    }, []);
    useEffect(() => {
        carregar();
        (async () => { const r = await authFetch(`${API}/api/documentos/entidades/opcoes`); const d = await r.json(); if (d.success) setUtilizadores(d.utilizadores || []); })();
    }, [carregar]);

    const abrir = async (id: string) => {
        const r = await authFetch(`${API}/api/documentos/${id}`); const d = await r.json();
        if (d.success) onAbrir(d.documento); else setErro(d.error || 'Não foi possível abrir o documento.');
    };
    const feito = async () => { await carregar(); onMudou(); };

    const atrasadas = (tarefas || []).filter(t => t.atrasada);
    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px' }}>
            <div style={{ maxWidth: '900px' }}>
                <h2 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 700, color: COR.ink, display: 'flex', alignItems: 'center', gap: '8px' }}><CheckSquare size={18} color={COR.accent} /> As minhas aprovações</h2>
                <p style={{ margin: '0 0 16px', fontSize: '12.5px', color: COR.muted }}>Documentos que esperam pela sua decisão. Pode aprovar aqui mesmo, ou abrir o documento para o ler primeiro.{atrasadas.length > 0 && <strong style={{ color: COR.bad }}> {atrasadas.length} fora de prazo.</strong>}</p>
                {erro && <div style={{ marginBottom: '12px', padding: '8px 12px', background: '#F6DEDE', border: '1px solid #fecaca', borderRadius: '2px', fontSize: '12.5px', color: COR.bad, display: 'flex', justifyContent: 'space-between' }}><span>{erro}</span><X size={14} style={{ cursor: 'pointer' }} onClick={() => setErro('')} /></div>}

                {tarefas === null && <div style={{ color: COR.muted, fontSize: '13px' }}>A carregar...</div>}
                {tarefas && tarefas.length === 0 && (
                    <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '40px', textAlign: 'center' }}>
                        <CheckSquare size={32} color={COR.good} style={{ marginBottom: '8px' }} />
                        <div style={{ fontWeight: 700, color: COR.ink }}>Nada à sua espera.</div>
                        <div style={{ fontSize: '12.5px', color: COR.muted }}>Quando alguém submeter um documento para a sua aprovação, aparece aqui e recebe uma notificação.</div>
                    </div>
                )}
                {(tarefas || []).map(t => (
                    <div key={t.id} style={{ background: 'white', border: `1px solid ${t.atrasada ? COR.bad : COR.border}`, borderRadius: '2px', padding: '14px 16px', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                            <FileText size={20} color={COR.muted} style={{ marginTop: '2px', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    {t.documento?.codigo && <span style={{ fontFamily: 'monospace', fontSize: '12px', color: COR.accent, fontWeight: 700 }}>{t.documento.codigo}</span>}
                                    <span style={{ fontWeight: 700, color: COR.ink, fontSize: '14px' }}>{t.documento?.titulo || '—'}</span>
                                    {t.documento && <IconeConfidencialidade nivel={t.documento.confidencialidade} />}
                                    <BadgeCiclo ciclo="PENDING_APPROVAL" />
                                </div>
                                <div style={{ fontSize: '12px', color: COR.muted, marginTop: '3px' }}>
                                    {t.documento?.tipo || 'Documento'} · {t.documento?.area}{t.documento?.validade ? ` · válido até ${t.documento.validade}` : ''}
                                </div>
                                {t.documento?.resumo && <div style={{ fontSize: '12.5px', color: COR.ink, marginTop: '6px', lineHeight: 1.45 }}>{t.documento.resumo}</div>}
                                <div style={{ fontSize: '12px', color: COR.muted, marginTop: '8px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <span>Etapa <strong style={{ color: COR.ink }}>{t.etapa_nome}</strong> ({t.etapa + 1}/{t.processo?.total_etapas}) · {t.processo?.fluxo_nome}</span>
                                    <span>Submetido por <strong style={{ color: COR.ink }}>{t.processo?.iniciado_por_nome}</strong> · {fmtDataHora(t.processo?.iniciado_em)}</span>
                                    {t.delegado_de_nome && <span>Delegado por <strong style={{ color: COR.ink }}>{t.delegado_de_nome}</strong></span>}
                                    {t.escalada_de_nome && <span style={{ color: COR.warn }}>Escalado de {t.escalada_de_nome} (prazo ultrapassado)</span>}
                                    {t.prazo && <span style={{ color: t.atrasada ? COR.bad : COR.faint, display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: t.atrasada ? 700 : 500 }}>{t.atrasada ? <AlertTriangle size={12} /> : <Clock size={12} />} {horasRestantes(t.prazo)}</span>}
                                </div>
                                {t.processo?.comentario && <div style={{ fontSize: '12.5px', color: COR.muted, marginTop: '6px', fontStyle: 'italic' }}>"{t.processo.comentario}"</div>}
                            </div>
                            <button style={{ ...btn(), padding: '6px 10px', fontSize: '12px', flexShrink: 0 }} onClick={() => abrir(t.documento_id)}><ExternalLink size={12} /> Abrir</button>
                        </div>
                        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: `1px solid ${COR.borderSoft}` }}>
                            <AcoesTarefa tarefa={t} utilizadores={utilizadores} onFeito={feito} setErro={setErro} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Sino de notificações do módulo (cabeçalho). */
export function Notificacoes({ naoLidas, onAbrirDoc, onLidas }: { naoLidas: number; onAbrirDoc: (id: string) => void; onLidas: () => void }) {
    const [aberto, setAberto] = useState(false);
    const [lista, setLista] = useState<any[] | null>(null);

    const carregar = async () => { const r = await authFetch(`${API}/api/documentos/notificacoes/minhas`); const d = await r.json(); if (d.success) setLista(d.lista); };
    const abrir = async () => { setAberto(true); await carregar(); };
    const marcarTodas = async () => { await authFetch(`${API}/api/documentos/notificacoes/lidas`, { method: 'POST', body: JSON.stringify({}) }); await carregar(); onLidas(); };
    const clicar = async (n: any) => {
        if (!n.lida) { await authFetch(`${API}/api/documentos/notificacoes/lidas`, { method: 'POST', body: JSON.stringify({ ids: [n.id] }) }); onLidas(); }
        setAberto(false);
        if (n.documento_id) onAbrirDoc(n.documento_id);
    };
    const corTipo = (tipo: string) => tipo.includes('rejeitado') || tipo === 'tarefa_prazo' ? COR.bad : tipo === 'tarefa_escalada' ? COR.warn : tipo === 'processo_aprovado' ? COR.good : COR.accent;

    return (
        <div style={{ position: 'relative' }}>
            <button onClick={aberto ? () => setAberto(false) : abrir} title="Notificações" style={{ position: 'relative', background: 'none', border: `1px solid ${COR.border}`, borderRadius: '2px', width: '32px', height: '32px', cursor: 'pointer', color: COR.ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={15} />
                {naoLidas > 0 && <span style={{ position: 'absolute', top: '-6px', right: '-6px', minWidth: '16px', height: '16px', borderRadius: '8px', background: COR.bad, color: 'white', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{naoLidas > 99 ? '99+' : naoLidas}</span>}
            </button>
            {aberto && (
                <>
                    <div onClick={() => setAberto(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
                    <div style={{ position: 'absolute', top: '38px', left: 0, width: '360px', maxHeight: '440px', overflowY: 'auto', background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 31 }}>
                        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: `1px solid ${COR.border}` }}>
                            <span style={{ fontWeight: 700, color: COR.ink, fontSize: '13px', flex: 1 }}>Notificações</span>
                            {lista && lista.some(n => !n.lida) && <button style={{ ...btn(), padding: '3px 8px', fontSize: '11px' }} onClick={marcarTodas}>Marcar todas como lidas</button>}
                        </div>
                        {lista === null && <div style={{ padding: '14px', fontSize: '12.5px', color: COR.muted }}>A carregar...</div>}
                        {lista && lista.length === 0 && <div style={{ padding: '20px', fontSize: '12.5px', color: COR.faint, textAlign: 'center' }}>Sem notificações.</div>}
                        {(lista || []).map(n => (
                            <div key={n.id} onClick={() => clicar(n)} style={{ display: 'flex', gap: '10px', padding: '10px 12px', borderBottom: `1px solid ${COR.borderSoft}`, cursor: n.documento_id ? 'pointer' : 'default', background: n.lida ? 'white' : '#F5F9FE' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: corTipo(n.tipo), marginTop: '5px', flexShrink: 0, opacity: n.lida ? 0.35 : 1 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '12.5px', fontWeight: n.lida ? 500 : 700, color: COR.ink }}>{n.titulo}</div>
                                    {n.mensagem && <div style={{ fontSize: '12px', color: COR.muted, marginTop: '2px', lineHeight: 1.4 }}>{n.mensagem}</div>}
                                    <div style={{ fontSize: '11px', color: COR.faint, marginTop: '3px' }}>{fmtDataHora(n.criado_em)}{n.email_enviado ? ' · também por email' : ''}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
