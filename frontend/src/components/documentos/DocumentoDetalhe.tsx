import { useState, useEffect, useRef } from 'react';
import { X, Download, Check, Trash2, RefreshCw, FileText, FileImage, FileSpreadsheet, Upload, History, Users, Lock, Shield, RotateCcw, Loader2, Mail, MessageSquare, Cpu, CheckSquare, Send, ExternalLink, Star, Link2, PenLine, Maximize2 } from 'lucide-react';
import { API, authFetch, AREAS, COR, ROTULO_CICLO, COR_CICLO, fmtData, fmtDataHora, fmtTam, btn, input, label, ROTULO_ACAO } from './comum';
import type { Doc, TipoDoc } from './comum';
import Aprovacao from './Aprovacao';
import { irPara } from '../../lib/navegacao';
import { Assinaturas, Partilha, ArquivoFisico, Visualizador } from './Arquivo';

function IconeDoc({ doc, size = 18 }: { doc: Doc; size?: number }) {
    const m = doc.mime_type || '';
    if (m.startsWith('image/')) return <FileImage size={size} color={COR.muted} />;
    if (m.includes('sheet') || m.includes('excel') || /\.(xlsx|xls|csv)$/i.test(doc.nome_ficheiro)) return <FileSpreadsheet size={size} color={COR.muted} />;
    return <FileText size={size} color={COR.muted} />;
}

export function BadgeCiclo({ ciclo }: { ciclo: string }) {
    const c = COR_CICLO[ciclo] || COR_CICLO.DRAFT;
    return <span style={{ fontSize: '10.5px', fontWeight: 700, color: c.c, background: c.bg, padding: '2px 8px', borderRadius: '2px', whiteSpace: 'nowrap' }}>{ROTULO_CICLO[ciclo] || ciclo}</span>;
}

export function IconeConfidencialidade({ nivel }: { nivel: string }) {
    if (nivel === 'Restrito') return <span title="Restrito: só com acesso explícito"><Lock size={12} color={COR.bad} /></span>;
    if (nivel === 'Confidencial') return <span title="Confidencial"><Shield size={12} color={COR.warn} /></span>;
    return null;
}

interface Props {
    doc: Doc; tipos: TipoDoc[]; pastas: any[];
    onFechar: () => void; onMudou: () => void;
}

export default function DocumentoDetalhe({ doc: docInicial, tipos, pastas, onFechar, onMudou }: Props) {
    const [doc, setDoc] = useState<Doc>(docInicial);
    const [transicoes, setTransicoes] = useState<any[]>([]);
    const [aba, setAba] = useState<'dados' | 'aprovacao' | 'assinaturas' | 'versoes' | 'historico' | 'acesso'>(docInicial.ciclo === 'PENDING_APPROVAL' ? 'aprovacao' : docInicial.ciclo === 'PENDING_SIGNATURE' ? 'assinaturas' : 'dados');
    const [partilhar, setPartilhar] = useState(false);
    const [ecraInteiro, setEcraInteiro] = useState(false);
    const favorito = async () => { const r = await authFetch(`${API}/api/documentos/${doc.id}/favorito`, { method: 'POST' }); const d = await r.json(); if (d.success) { setDoc({ ...doc, favorito: d.favorito }); onMudou(); } };
    const [f, setF] = useState<any>({});
    const [opcoes, setOpcoes] = useState<any>(null);
    const [aGuardar, setAGuardar] = useState(false);
    const [erro, setErro] = useState('');
    const [envio, setEnvio] = useState<{ para: string; assunto: string; mensagem: string } | null>(null);
    const [aEnviarEmail, setAEnviarEmail] = useState(false);

    const enviarEmail = async () => {
        if (!envio) return;
        setAEnviarEmail(true); setErro('');
        const r = await authFetch(`${API}/api/documentos/${doc.id}/enviar-email`, { method: 'POST', body: JSON.stringify(envio) }); const d = await r.json();
        setAEnviarEmail(false);
        if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível enviar.'); return; }
        setEnvio(null); recarregar();
    };

    const recarregar = async () => {
        const r = await authFetch(`${API}/api/documentos/${docInicial.id}`); const d = await r.json();
        if (d.success) { setDoc(d.documento); setTransicoes(d.transicoes || []); }
        else setErro(d.error || 'Não foi possível abrir o documento.');
    };
    useEffect(() => { recarregar(); (async () => { const r = await authFetch(`${API}/api/documentos/entidades/opcoes`); const d = await r.json(); if (d.success) setOpcoes(d); })(); }, [docInicial.id]);

    useEffect(() => {
        setF({
            titulo: doc.titulo, descricao: doc.descricao || '', area: doc.area, tipo_id: doc.tipo_id || '', resumo: doc.resumo || '',
            data_documento: doc.data_documento || '', validade: doc.validade || '', entidade_tipo: doc.entidade_tipo || '', entidade_id: doc.entidade_id || '', entidade_nome: doc.entidade_nome || '',
            confidencialidade: doc.confidencialidade || 'Normal', responsavel_id: doc.responsavel_id || '', pasta_id: doc.pasta_id || '', metadados: { ...(doc.metadados || {}) }
        });
    }, [doc]);

    const tipoSel: TipoDoc | undefined = tipos.find(t => t.id === Number(f.tipo_id));
    const podeGerir = doc.nivel_acesso === 'gerir';
    const podeEditar = podeGerir || doc.nivel_acesso === 'editar';
    const listaEntidades = f.entidade_tipo === 'cliente' ? opcoes?.clientes : f.entidade_tipo === 'colaborador' ? opcoes?.colaboradores : f.entidade_tipo === 'ativo' ? opcoes?.ativos : null;

    const guardar = async (extra: any = {}) => {
        setAGuardar(true); setErro('');
        const payload: any = { ...f, ...extra };
        if (!payload.entidade_tipo) { payload.entidade_tipo = null; payload.entidade_id = null; }
        if (!podeGerir) { delete payload.confidencialidade; delete payload.responsavel_id; }
        const res = await authFetch(`${API}/api/documentos/${doc.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        const data = await res.json();
        setAGuardar(false);
        if (!res.ok || !data.success) { setErro(data.error || 'Não foi possível guardar.'); return; }
        await recarregar(); onMudou();
    };

    const transitar = async (para: string, exigeMotivo: boolean) => {
        let motivo: string | null = null;
        if (exigeMotivo) { motivo = window.prompt(`Motivo para "${ROTULO_CICLO[para]}":`); if (motivo === null) return; }
        const res = await authFetch(`${API}/api/documentos/${doc.id}/transicao`, { method: 'POST', body: JSON.stringify({ para, motivo }) });
        const data = await res.json();
        if (!res.ok || !data.success) { setErro(data.error || 'Transição recusada.'); return; }
        await recarregar(); onMudou();
    };

    const descarregar = async () => {
        const res = await authFetch(`${API}/api/documentos/${doc.id}/descarregar`); const data = await res.json();
        if (!res.ok || !data.success) { setErro(data.error || 'Sem permissão para descarregar.'); return; }
        window.open(data.url, '_blank');
    };

    const apagarDefinitivo = async () => {
        if (!window.confirm('Apagar DEFINITIVAMENTE este documento e todas as versões? Não há recuperação.')) return;
        const res = await authFetch(`${API}/api/documentos/${doc.id}`, { method: 'DELETE' }); const data = await res.json();
        if (!res.ok || !data.success) { setErro(data.error || 'Não foi possível apagar.'); return; }
        onMudou(); onFechar();
    };

    const reprocessar = async () => {
        const res = await authFetch(`${API}/api/documentos/${doc.id}/reprocessar`, { method: 'POST' }); const data = await res.json();
        if (!res.ok || !data.success) { setErro(data.error || 'Não foi possível reprocessar.'); return; }
        onMudou(); onFechar();
    };

    const ehPdf = (doc.mime_type || '').includes('pdf');
    const ehImg = (doc.mime_type || '').startsWith('image/');
    const camposIA = Object.entries(doc.campos || {}).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object');
    const abaBtn = (id: typeof aba, Icone: any, texto: string) => (
        <button onClick={() => setAba(id)} style={{ flex: 1, padding: '9px 4px', border: 'none', borderBottom: aba === id ? `2px solid ${COR.accent}` : '2px solid transparent', background: 'transparent', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: aba === id ? COR.accent : COR.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
            <Icone size={13} /> {texto}
        </button>
    );

    return (
        <div style={{ width: '560px', minWidth: '560px', background: 'white', borderLeft: `1px solid ${COR.border}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${COR.border}`, display: 'flex', alignItems: 'center', gap: '10px', height: '59px', boxSizing: 'border-box' }}>
                <IconeDoc doc={doc} size={20} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: COR.ink, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontFamily: 'monospace', color: COR.accent }}>{doc.codigo || '—'}</span>
                        <BadgeCiclo ciclo={doc.ciclo} />
                        <IconeConfidencialidade nivel={doc.confidencialidade} />
                        <span style={{ fontSize: '11px', color: COR.faint, fontWeight: 500 }}>v{doc.versao_atual}</span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: COR.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.nome_ficheiro} · {fmtTam(doc.tamanho || 0)}</div>
                </div>
                <button onClick={favorito} title={doc.favorito ? 'Tirar dos favoritos' : 'Marcar como favorito'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: doc.favorito ? '#DF6E0C' : COR.faint }}><Star size={16} fill={doc.favorito ? '#DF6E0C' : 'none'} /></button>
                <button onClick={() => setEcraInteiro(true)} title="Ver em ecrã inteiro" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COR.accent }}><Maximize2 size={15} /></button>
                {podeEditar && <button onClick={() => setPartilhar(!partilhar)} title="Partilhar por link temporário" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COR.accent }}><Link2 size={16} /></button>}
                <button onClick={() => setEnvio(envio ? null : { para: '', assunto: `${doc.codigo ? doc.codigo + ' — ' : ''}${doc.titulo}`, mensagem: '' })} title="Enviar por email (fica registado)" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COR.accent }}><Send size={16} /></button>
                <button onClick={descarregar} title="Descarregar (fica registado)" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COR.accent }}><Download size={17} /></button>
                <X size={18} style={{ cursor: 'pointer', color: COR.muted }} onClick={onFechar} />
            </div>

            <div style={{ display: 'flex', borderBottom: `1px solid ${COR.border}`, background: COR.canvas }}>
                {abaBtn('dados', FileText, 'Dados')}{abaBtn('aprovacao', CheckSquare, 'Aprovação')}{abaBtn('assinaturas', PenLine, 'Assinaturas')}{abaBtn('versoes', History, 'Versões')}{abaBtn('historico', RefreshCw, 'Histórico')}
                {podeGerir && abaBtn('acesso', Users, 'Acesso')}
            </div>

            {erro && <div style={{ margin: '10px 16px 0', padding: '8px 12px', background: '#F6DEDE', border: '1px solid #fecaca', borderRadius: '2px', fontSize: '12.5px', color: COR.bad, display: 'flex', justifyContent: 'space-between' }}><span>{erro}</span><X size={14} style={{ cursor: 'pointer' }} onClick={() => setErro('')} /></div>}
            {partilhar && <Partilha doc={doc} setErro={setErro} onFechar={() => setPartilhar(false)} />}
            {ecraInteiro && <Visualizador doc={doc} onFechar={() => setEcraInteiro(false)} />}
            {envio && (
                <div style={{ margin: '10px 16px 0', padding: '12px', border: `1px solid ${COR.accent}`, borderRadius: '2px', background: COR.canvas }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: COR.ink, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={14} /> Enviar por email (pelo email da empresa)</div>
                    <label style={label}>Para</label><input value={envio.para} onChange={e => setEnvio({ ...envio, para: e.target.value })} placeholder="nome@empresa.ao" style={input} />
                    <label style={{ ...label, marginTop: '8px' }}>Assunto</label><input value={envio.assunto} onChange={e => setEnvio({ ...envio, assunto: e.target.value })} style={input} />
                    <label style={{ ...label, marginTop: '8px' }}>Mensagem (opcional)</label><textarea value={envio.mensagem} onChange={e => setEnvio({ ...envio, mensagem: e.target.value })} rows={2} style={{ ...input, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
                        <button style={btn()} onClick={() => setEnvio(null)}>Cancelar</button>
                        <button style={btn(true)} disabled={aEnviarEmail || !envio.para.trim()} onClick={enviarEmail}><Send size={13} /> {aEnviarEmail ? 'A enviar...' : 'Enviar'}</button>
                    </div>
                </div>
            )}

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {aba === 'dados' && (
                    <>
                        <div style={{ height: '210px', background: COR.canvas, borderBottom: `1px solid ${COR.borderSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {doc.url && ehPdf ? <iframe src={doc.url} title="pré-visualização" style={{ width: '100%', height: '100%', border: 'none' }} />
                                : doc.url && ehImg ? <img src={doc.url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                : doc.texto ? <pre style={{ margin: 0, padding: '12px 16px', width: '100%', height: '100%', boxSizing: 'border-box', overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '12px', color: COR.muted, lineHeight: 1.5, textAlign: 'left' }}>{doc.texto.slice(0, 4000)}</pre>
                                : <div style={{ color: COR.faint, fontSize: '13px' }}>Sem pré-visualização para este formato.</div>}
                        </div>

                        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {doc.estado === 'erro' && (
                                <div style={{ background: '#F6DEDE', border: '1px solid #fecaca', borderRadius: '2px', padding: '10px 12px', fontSize: '12.5px', color: COR.bad }}>
                                    A leitura falhou: {doc.erro}<div style={{ marginTop: '8px' }}><button style={btn()} onClick={reprocessar}><RefreshCw size={13} /> Tentar de novo</button></div>
                                </div>
                            )}
                            {doc.estado === 'por_rever' && (
                                <div style={{ background: '#FCEFDD', border: '1px solid #DF6E0C', borderRadius: '2px', padding: '10px 12px', fontSize: '12.5px', color: '#92400e' }}>
                                    Por rever — a IA sugeriu o que está abaixo com {Math.round((doc.confianca || 0) * 100)}% de confiança. Confirme ou corrija e arquive.
                                </div>
                            )}

                            {/* Ciclo de vida */}
                            <div>
                                <label style={label}>Estado do documento</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                                    <BadgeCiclo ciclo={doc.ciclo} />
                                    <span style={{ fontSize: '12px', color: COR.faint, marginRight: '4px' }}>→</span>
                                    {transicoes.length === 0 && <span style={{ fontSize: '12px', color: COR.faint }}>sem transições manuais</span>}
                                    {transicoes.map(t => (
                                        <button key={t.para} disabled={!t.disponivel || !podeEditar} title={t.disponivel ? (t.exigeMotivo ? 'Vai pedir um motivo' : '') : t.motivo}
                                            onClick={() => transitar(t.para, t.exigeMotivo)}
                                            style={{ ...btn(false, t.para === 'DELETED'), padding: '4px 10px', fontSize: '11.5px', opacity: t.disponivel && podeEditar ? 1 : 0.45, cursor: t.disponivel && podeEditar ? 'pointer' : 'not-allowed' }}>
                                            {t.rotulo}{!t.disponivel && ' *'}
                                        </button>
                                    ))}
                                </div>
                                {transicoes.some(t => !t.disponivel) && <div style={{ fontSize: '11px', color: COR.faint, marginTop: '5px' }}>* passa a estar disponível com as assinaturas eletrónicas / retenção (fase seguinte).</div>}
                                {doc.ciclo === 'PENDING_APPROVAL' && <div style={{ fontSize: '11.5px', color: COR.accent, marginTop: '5px' }}>Em aprovação — acompanhe e decida no separador "Aprovação".</div>}
                            </div>

                            <div><label style={label}>Título</label><input value={f.titulo || ''} disabled={!podeEditar} onChange={e => setF({ ...f, titulo: e.target.value })} style={input} /></div>
                            <div><label style={label}>Descrição</label><input value={f.descricao || ''} disabled={!podeEditar} onChange={e => setF({ ...f, descricao: e.target.value })} placeholder="Opcional" style={input} /></div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div><label style={label}>Tipo</label>
                                    <select value={f.tipo_id || ''} disabled={!podeEditar} onChange={e => { const t = tipos.find(x => x.id === Number(e.target.value)); setF({ ...f, tipo_id: e.target.value, area: t?.area_padrao || f.area }); }} style={input}>
                                        <option value="">—</option>{tipos.filter(t => t.ativo || t.id === doc.tipo_id).map(t => <option key={t.id} value={t.id}>{t.nome} ({t.prefixo})</option>)}
                                    </select></div>
                                <div><label style={label}>Área</label>
                                    <select value={f.area || 'Outros'} disabled={!podeEditar} onChange={e => setF({ ...f, area: e.target.value })} style={input}>{AREAS.map(a => <option key={a}>{a}</option>)}</select></div>
                            </div>

                            {/* Metadados do tipo */}
                            {tipoSel && tipoSel.campos.length > 0 && (
                                <div style={{ border: `1px solid ${COR.borderSoft}`, borderRadius: '2px', padding: '12px', background: COR.canvas }}>
                                    <label style={label}>Dados de {tipoSel.nome}</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        {tipoSel.campos.map(c => {
                                            const v = f.metadados?.[c.chave] ?? '';
                                            const set = (val: any) => setF({ ...f, metadados: { ...f.metadados, [c.chave]: val } });
                                            return (
                                                <div key={c.chave} style={c.tipo === 'texto' && c.chave.length > 12 ? { gridColumn: 'span 2' } : {}}>
                                                    <label style={{ ...label, fontSize: '10.5px' }}>{c.rotulo}{c.obrigatorio ? ' *' : ''}</label>
                                                    {c.tipo === 'boolean' ? <select value={v === true || v === 'true' ? 'true' : v === false || v === 'false' ? 'false' : ''} disabled={!podeEditar} onChange={e => set(e.target.value === '' ? null : e.target.value === 'true')} style={input}><option value="">—</option><option value="true">Sim</option><option value="false">Não</option></select>
                                                        : c.tipo === 'selecao' ? <select value={v} disabled={!podeEditar} onChange={e => set(e.target.value)} style={input}><option value="">—</option>{(c.opcoes || []).map(o => <option key={o}>{o}</option>)}</select>
                                                        : c.tipo === 'data' ? <input type="date" value={v} disabled={!podeEditar} onChange={e => set(e.target.value)} style={input} />
                                                        : <input value={v} disabled={!podeEditar} onChange={e => set(e.target.value)} placeholder={c.tipo === 'moeda' ? 'Kz' : ''} style={input} />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div><label style={label}>Data do documento</label><input type="date" value={f.data_documento || ''} disabled={!podeEditar} onChange={e => setF({ ...f, data_documento: e.target.value })} style={input} /></div>
                                <div><label style={label}>Validade (caduca em)</label><input type="date" value={f.validade || ''} disabled={!podeEditar} onChange={e => setF({ ...f, validade: e.target.value })} style={input} /></div>
                            </div>

                            <div>
                                <label style={label}>Pertence a</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px' }}>
                                    <select value={f.entidade_tipo || ''} disabled={!podeEditar} onChange={e => setF({ ...f, entidade_tipo: e.target.value, entidade_id: '' })} style={input}>
                                        <option value="">Ninguém</option><option value="cliente">Cliente</option><option value="colaborador">Colaborador</option><option value="ativo">Ativo</option>
                                    </select>
                                    {listaEntidades ? (
                                        <select value={f.entidade_id || ''} disabled={!podeEditar} onChange={e => { const o = listaEntidades.find((x: any) => String(x.id) === e.target.value); setF({ ...f, entidade_id: e.target.value, entidade_nome: o?.nome || f.entidade_nome }); }} style={input}>
                                            <option value="">Escolher...</option>{listaEntidades.map((o: any) => <option key={o.id} value={String(o.id)}>{o.nome}</option>)}
                                        </select>
                                    ) : <input value={f.entidade_nome || ''} disabled={!podeEditar} onChange={e => setF({ ...f, entidade_nome: e.target.value })} placeholder="Nome (ex: fornecedor)" style={input} />}
                                </div>
                                {f.entidade_nome && !f.entidade_id && f.entidade_tipo && <div style={{ fontSize: '11.5px', color: COR.faint, marginTop: '5px' }}>A IA sugeriu "{f.entidade_nome}" mas não encontrou registo com esse nome.</div>}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div><label style={label}>Pasta</label>
                                    <select value={f.pasta_id || ''} disabled={!podeEditar} onChange={e => setF({ ...f, pasta_id: e.target.value })} style={input}>
                                        <option value="">Sem pasta</option>{pastas.map((p: any) => <option key={p.id} value={p.id}>{p.caminho || p.nome}</option>)}
                                    </select></div>
                                <div><label style={label}>Confidencialidade</label>
                                    <select value={f.confidencialidade || 'Normal'} disabled={!podeGerir} title={podeGerir ? '' : 'Só quem gere o documento'} onChange={e => setF({ ...f, confidencialidade: e.target.value })} style={input}>
                                        <option>Normal</option><option>Confidencial</option><option>Restrito</option>
                                    </select></div>
                            </div>
                            {podeGerir && (
                                <div><label style={label}>Responsável</label>
                                    <select value={f.responsavel_id || ''} onChange={e => setF({ ...f, responsavel_id: e.target.value })} style={input}>
                                        <option value="">—</option>{(opcoes?.utilizadores || []).map((u: any) => <option key={u.id} value={u.id}>{u.nome} ({u.role})</option>)}
                                    </select></div>
                            )}

                            <div><label style={label}>Resumo</label><textarea value={f.resumo || ''} disabled={!podeEditar} onChange={e => setF({ ...f, resumo: e.target.value })} rows={2} style={{ ...input, resize: 'vertical' }} /></div>

                            {camposIA.length > 0 && (
                                <div>
                                    <label style={label}>Tudo o que a IA leu</label>
                                    <div style={{ border: `1px solid ${COR.borderSoft}`, borderRadius: '2px', fontSize: '12.5px' }}>
                                        {camposIA.map(([k, v]) => (
                                            <div key={k} style={{ display: 'flex', padding: '6px 10px', borderBottom: `1px solid ${COR.borderSoft}` }}>
                                                <span style={{ width: '130px', color: COR.faint, textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                                                <span style={{ color: COR.ink, flex: 1, wordBreak: 'break-word' }}>{String(v)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <ArquivoFisico doc={doc} podeEditar={podeEditar} podeGerir={podeGerir} onMudou={async () => { await recarregar(); onMudou(); }} setErro={setErro} />

                            <div style={{ fontSize: '11.5px', color: COR.faint, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                    {doc.origem === 'email' ? <Mail size={12} /> : doc.origem === 'whatsapp' ? <MessageSquare size={12} /> : doc.origem === 'sistema' ? <Cpu size={12} /> : <Upload size={12} />}
                                    Entrou por {({ manual: 'upload manual', email: 'email', whatsapp: 'WhatsApp', sistema: 'geração do sistema' } as any)[doc.origem]}{doc.origem_detalhe ? ` — ${doc.origem_detalhe}` : ''}
                                    {doc.origem === 'email' && doc.origem_ref && <button onClick={() => irPara('email', { message_id: doc.origem_ref! })} style={{ ...btn(), padding: '2px 7px', fontSize: '11px', marginLeft: '4px' }}><ExternalLink size={11} /> Ver email</button>}
                                </span>
                                {doc.entidade_tipo && doc.entidade_id && ['cliente', 'colaborador'].includes(doc.entidade_tipo) && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                        Ligado a {doc.entidade_nome}
                                        <button onClick={() => irPara(doc.entidade_tipo === 'cliente' ? 'crm' : 'hr')} style={{ ...btn(), padding: '2px 7px', fontSize: '11px', marginLeft: '4px' }}><ExternalLink size={11} /> Abrir {doc.entidade_tipo === 'cliente' ? 'CRM' : 'RH'}</button>
                                    </span>
                                )}
                                <span>Arquivado em {fmtDataHora(doc.criado_em)} · o seu acesso: <strong>{doc.nivel_acesso}</strong></span>
                            </div>
                        </div>
                    </>
                )}

                {aba === 'assinaturas' && <Assinaturas doc={doc} utilizadores={opcoes?.utilizadores || []} podeEditar={podeEditar} onMudou={async () => { await recarregar(); onMudou(); }} setErro={setErro} />}
                {aba === 'aprovacao' && <Aprovacao doc={doc} utilizadores={opcoes?.utilizadores || []} podeEditar={podeEditar} onMudou={async () => { await recarregar(); onMudou(); }} setErro={setErro} />}
                {aba === 'versoes' && <Versoes doc={doc} podeEditar={podeEditar} onMudou={async () => { await recarregar(); onMudou(); }} setErro={setErro} />}
                {aba === 'historico' && <Historico docId={doc.id} />}
                {aba === 'acesso' && podeGerir && <Acesso doc={doc} utilizadores={opcoes?.utilizadores || []} setErro={setErro} />}
            </div>

            {aba === 'dados' && (
                <div style={{ padding: '12px 16px', borderTop: `1px solid ${COR.border}`, display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {podeGerir && (doc.ciclo === 'DELETED' || ['por_rever', 'erro', 'descartado'].includes(doc.estado)) && (
                        <button style={btn(false, true)} onClick={apagarDefinitivo} title="Apagar definitivamente"><Trash2 size={13} /></button>
                    )}
                    {podeEditar && doc.estado !== 'descartado' && doc.estado === 'por_rever' && <button style={btn()} onClick={() => guardar({ estado: 'descartado' })}>Descartar</button>}
                    <span style={{ flex: 1 }} />
                    {podeEditar && (doc.estado === 'por_rever' || doc.estado === 'descartado'
                        ? <button style={btn(true)} disabled={aGuardar} onClick={() => guardar({ estado: 'arquivado' })}><Check size={13} /> Guardar e arquivar</button>
                        : <button style={btn(true)} disabled={aGuardar} onClick={() => guardar()}>{aGuardar ? 'A guardar...' : 'Guardar'}</button>)}
                </div>
            )}
        </div>
    );
}

// ============================================================
function Versoes({ doc, podeEditar, onMudou, setErro }: { doc: Doc; podeEditar: boolean; onMudou: () => void; setErro: (s: string) => void }) {
    const [versoes, setVersoes] = useState<any[]>([]);
    const [comentario, setComentario] = useState('');
    const [aEnviar, setAEnviar] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const carregar = async () => { const r = await authFetch(`${API}/api/documentos/${doc.id}/versoes`); const d = await r.json(); if (d.success) setVersoes(d.versoes); };
    useEffect(() => { carregar(); }, [doc.id, doc.versao_atual]);

    const enviar = async (file: File) => {
        setAEnviar(true); setErro('');
        const form = new FormData(); form.append('file', file); form.append('comentario', comentario);
        const res = await authFetch(`${API}/api/documentos/${doc.id}/versoes`, { method: 'POST', body: form }); const d = await res.json();
        setAEnviar(false);
        if (!res.ok || !d.success) { setErro(d.error || 'Falha ao carregar a versão.'); return; }
        setComentario(''); await carregar(); onMudou();
    };
    const restaurar = async (n: number) => {
        if (!window.confirm(`Restaurar a versão ${n}? Cria-se uma versão nova com esse conteúdo; nada se apaga.`)) return;
        const res = await authFetch(`${API}/api/documentos/${doc.id}/versoes/${n}/restaurar`, { method: 'POST' }); const d = await res.json();
        if (!res.ok || !d.success) { setErro(d.error || 'Falha ao restaurar.'); return; }
        await carregar(); onMudou();
    };

    return (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {podeEditar && (
                <div style={{ border: `1px dashed ${COR.border}`, borderRadius: '2px', padding: '12px', background: COR.canvas }}>
                    <label style={label}>Nova versão</label>
                    <input value={comentario} onChange={e => setComentario(e.target.value)} placeholder="O que mudou? (ex: contrato renovado até 2028)" style={{ ...input, marginBottom: '8px' }} />
                    <button style={btn(true)} disabled={aEnviar} onClick={() => fileRef.current?.click()}>{aEnviar ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={13} />} Escolher ficheiro e carregar</button>
                    <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = ''; }} />
                    <div style={{ fontSize: '11.5px', color: COR.faint, marginTop: '8px' }}>A versão nova passa a ser a atual e é lida de novo pela IA. As anteriores ficam sempre disponíveis.</div>
                </div>
            )}
            {versoes.map(v => (
                <div key={v.id} style={{ border: `1px solid ${v.numero === doc.versao_atual ? COR.accent : COR.borderSoft}`, borderRadius: '2px', padding: '10px 12px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '2px', background: v.numero === doc.versao_atual ? COR.accent : COR.borderSoft, color: v.numero === doc.versao_atual ? 'white' : COR.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', flexShrink: 0 }}>v{v.numero}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: COR.ink }}>{v.comentario || 'Sem comentário'}{v.numero === doc.versao_atual && <span style={{ fontSize: '10.5px', color: COR.accent, marginLeft: '8px' }}>ATUAL</span>}</div>
                        <div style={{ fontSize: '11.5px', color: COR.faint }}>{v.nome_ficheiro} · {fmtTam(v.tamanho || 0)} · {fmtDataHora(v.criado_em)}{v.restaurada_de ? ` · restaurada da v${v.restaurada_de}` : ''}</div>
                    </div>
                    {v.url && <a href={v.url} target="_blank" rel="noreferrer" title="Abrir esta versão" style={{ color: COR.accent }}><Download size={15} /></a>}
                    {podeEditar && v.numero !== doc.versao_atual && <button style={{ ...btn(), padding: '4px 8px' }} title="Restaurar" onClick={() => restaurar(v.numero)}><RotateCcw size={13} /></button>}
                </div>
            ))}
        </div>
    );
}

// ============================================================
function Historico({ docId }: { docId: string }) {
    const [eventos, setEventos] = useState<any[] | null>(null);
    useEffect(() => { (async () => { const r = await authFetch(`${API}/api/documentos/${docId}/historico`); const d = await r.json(); setEventos(d.success ? d.eventos : []); })(); }, [docId]);
    if (!eventos) return <div style={{ padding: '16px', color: COR.muted, fontSize: '13px' }}>A carregar...</div>;
    return (
        <div style={{ padding: '8px 16px 16px' }}>
            <div style={{ fontSize: '11.5px', color: COR.faint, margin: '8px 0 10px' }}>Registo imutável: nem administradores conseguem alterar ou apagar estas entradas.</div>
            {eventos.length === 0 && <div style={{ color: COR.faint, fontSize: '13px' }}>Sem eventos.</div>}
            {eventos.map(e => (
                <div key={e.id} style={{ display: 'flex', gap: '10px', padding: '8px 0', borderBottom: `1px solid ${COR.borderSoft}` }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: e.resultado === 'ok' ? COR.accent : COR.bad, marginTop: '5px', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', color: COR.ink }}><strong>{ROTULO_ACAO[e.acao] || e.acao}</strong>{e.user_nome ? ` · ${e.user_nome}` : e.user_id ? '' : ' · sistema'}</div>
                        <div style={{ fontSize: '11.5px', color: COR.faint }}>{fmtDataHora(e.criado_em)}{e.ip ? ` · ${e.ip}` : ''}</div>
                        {e.detalhes && Object.keys(e.detalhes).length > 0 && (
                            <div style={{ fontSize: '11.5px', color: COR.muted, marginTop: '2px', wordBreak: 'break-word' }}>
                                {Object.entries(e.detalhes).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ')}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ============================================================
function Acesso({ doc, utilizadores, setErro }: { doc: Doc; utilizadores: any[]; setErro: (s: string) => void }) {
    const [acessos, setAcessos] = useState<any[]>([]);
    const [novo, setNovo] = useState({ user_id: '', nivel: 'ver', expira_em: '' });
    const carregar = async () => { const r = await authFetch(`${API}/api/documentos/${doc.id}/acessos`); const d = await r.json(); if (d.success) setAcessos(d.acessos); };
    useEffect(() => { carregar(); }, [doc.id]);

    const conceder = async () => {
        if (!novo.user_id) { setErro('Escolha o utilizador.'); return; }
        const res = await authFetch(`${API}/api/documentos/${doc.id}/acessos/${novo.user_id}`, { method: 'PUT', body: JSON.stringify({ nivel: novo.nivel, expira_em: novo.expira_em ? new Date(novo.expira_em).toISOString() : null }) });
        const d = await res.json();
        if (!res.ok || !d.success) { setErro(d.error || 'Falha ao conceder acesso.'); return; }
        setNovo({ user_id: '', nivel: 'ver', expira_em: '' }); carregar();
    };
    const revogar = async (userId: string) => {
        const res = await authFetch(`${API}/api/documentos/${doc.id}/acessos/${userId}`, { method: 'DELETE' }); const d = await res.json();
        if (!res.ok || !d.success) { setErro(d.error || 'Falha ao revogar.'); return; }
        carregar();
    };

    return (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '12.5px', color: COR.muted, lineHeight: 1.5 }}>
                Documento <strong>{doc.confidencialidade}</strong>. {doc.confidencialidade === 'Normal' ? 'Quem tem a área vê-o; os acessos abaixo dão mais do que isso (editar, gerir).' : 'Só administradores, o responsável e quem estiver nesta lista o conseguem abrir.'}
            </div>
            <div style={{ border: `1px solid ${COR.borderSoft}`, borderRadius: '2px', padding: '12px', background: COR.canvas, display: 'grid', gridTemplateColumns: '1fr 110px 140px auto', gap: '8px', alignItems: 'end' }}>
                <div><label style={label}>Utilizador</label><select value={novo.user_id} onChange={e => setNovo({ ...novo, user_id: e.target.value })} style={input}><option value="">Escolher...</option>{utilizadores.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
                <div><label style={label}>Nível</label><select value={novo.nivel} onChange={e => setNovo({ ...novo, nivel: e.target.value })} style={input}><option value="ver">Ver</option><option value="editar">Editar</option><option value="gerir">Gerir</option></select></div>
                <div><label style={label}>Expira</label><input type="date" value={novo.expira_em} onChange={e => setNovo({ ...novo, expira_em: e.target.value })} style={input} /></div>
                <button style={btn(true)} onClick={conceder}>Dar acesso</button>
            </div>
            {acessos.length === 0 && <div style={{ fontSize: '13px', color: COR.faint }}>Sem acessos específicos.</div>}
            {acessos.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: `1px solid ${COR.borderSoft}` }}>
                    <div style={{ flex: 1 }}><div style={{ fontSize: '13px', fontWeight: 600, color: COR.ink }}>{a.nome}</div><div style={{ fontSize: '11.5px', color: COR.faint }}>{a.email}</div></div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: COR.accent, background: '#E1EEF0', padding: '2px 8px', borderRadius: '2px', textTransform: 'uppercase' }}>{a.nivel}</span>
                    <span style={{ fontSize: '11.5px', color: a.expira_em && new Date(a.expira_em) < new Date() ? COR.bad : COR.faint, width: '90px' }}>{a.expira_em ? `até ${fmtData(a.expira_em.slice(0, 10))}` : 'sem prazo'}</span>
                    <button style={{ ...btn(false, true), padding: '4px 8px' }} onClick={() => revogar(a.user_id)}><Trash2 size={12} /></button>
                </div>
            ))}
        </div>
    );
}
