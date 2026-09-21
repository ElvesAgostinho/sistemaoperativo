import { useState, useEffect, useCallback, useRef } from 'react';
import {
    FolderOpen, Search, Upload, Inbox, ShieldAlert, Wrench, Settings, FileText, FileImage, FileSpreadsheet,
    Mail, MessageSquare, Cpu, User, Briefcase, Users, ChevronRight, X, Check, Trash2, RefreshCw, Download,
    AlertTriangle, Clock, CheckCircle2, Plus, Sparkles, Loader2
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL;
const authFetch = (url: string, options: any = {}) => {
    const token = localStorage.getItem('os_auth_token');
    const headers: any = { ...options.headers, Authorization: `Bearer ${token}` };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    return fetch(url, { ...options, headers });
};

const AREAS = ['Legal & Licenças', 'Financeiro', 'RH', 'Clientes', 'Fornecedores', 'Operações', 'Qualidade & Segurança', 'Outros'];
const TIPOS = ['Fatura', 'Recibo', 'Proforma', 'Contrato', 'Licença', 'Certificado', 'Alvará', 'Identificação', 'Declaração', 'Relatório', 'Ata', 'Manual', 'Ficha Técnica', 'Ficha de Segurança', 'Guia de Remessa', 'Documento Alfandegário', 'Apólice', 'Comprovativo', 'Correspondência', 'Outro'];

const COR = { accent: '#0854A0', ink: '#1D2D3E', muted: '#5B738B', faint: '#8996A3', border: '#D5D7DA', borderSoft: '#E7E9EB', canvas: '#F5F6F7', good: '#107E3E', warn: '#DF6E0C', bad: '#BB0000' };

type Vista = 'todos' | 'area' | 'por_rever' | 'conformidade' | 'ativos' | 'definicoes' | 'pesquisa';

interface Doc {
    id: string; titulo: string; nome_ficheiro: string; url: string; mime_type: string; tamanho: number;
    area: string; tipo: string | null; resumo: string | null; campos: Record<string, any>; data_documento: string | null; validade: string | null;
    entidade_tipo: string | null; entidade_id: string | null; entidade_nome: string | null;
    origem: string; origem_detalhe: string | null; estado: string; confianca: number | null; erro: string | null; criado_em: string; texto?: string;
}

// ============================================================
// Helpers de apresentação
// ============================================================
function IconeDoc({ doc, size = 18 }: { doc: Doc; size?: number }) {
    const m = doc.mime_type || '';
    if (m.startsWith('image/')) return <FileImage size={size} color={COR.muted} />;
    if (m.includes('sheet') || m.includes('excel') || /\.(xlsx|xls|csv)$/i.test(doc.nome_ficheiro)) return <FileSpreadsheet size={size} color={COR.muted} />;
    return <FileText size={size} color={COR.muted} />;
}

function IconeOrigem({ origem }: { origem: string }) {
    const p = { size: 12, color: COR.faint };
    if (origem === 'email') return <Mail {...p} />;
    if (origem === 'whatsapp') return <MessageSquare {...p} />;
    if (origem === 'sistema') return <Cpu {...p} />;
    return <Upload {...p} />;
}

function IconeEntidade({ tipo }: { tipo: string | null }) {
    const p = { size: 12, color: COR.faint };
    if (tipo === 'colaborador') return <User {...p} />;
    if (tipo === 'ativo') return <Wrench {...p} />;
    if (tipo === 'cliente' || tipo === 'negocio') return <Briefcase {...p} />;
    return <Users {...p} />;
}

function diasAte(data: string | null): number | null {
    if (!data) return null;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return Math.round((new Date(data + 'T00:00:00').getTime() - hoje.getTime()) / 86400000);
}

function BadgeValidade({ validade }: { validade: string | null }) {
    const d = diasAte(validade);
    if (d === null) return null;
    const cfg = d < 0 ? { c: COR.bad, bg: '#F6DEDE', t: `Caducou há ${-d} dia${-d === 1 ? '' : 's'}` }
        : d <= 30 ? { c: COR.warn, bg: '#FCEFDD', t: d === 0 ? 'Caduca hoje' : `Caduca em ${d} dia${d === 1 ? '' : 's'}` }
        : { c: COR.good, bg: '#DCEEE2', t: `Válido até ${fmtData(validade)}` };
    return <span style={{ fontSize: '10.5px', fontWeight: 700, color: cfg.c, background: cfg.bg, padding: '2px 7px', borderRadius: '2px', whiteSpace: 'nowrap' }}>{cfg.t}</span>;
}

const fmtData = (d: string | null) => d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-PT') : '—';
const fmtTam = (n: number) => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

const btn = (primario = false, perigo = false): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '2px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
    border: primario ? 'none' : `1px solid ${perigo ? '#fecaca' : COR.border}`, background: primario ? COR.accent : 'white', color: primario ? 'white' : perigo ? COR.bad : COR.ink
});
const input: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: '2px', border: `1px solid ${COR.border}`, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' };
const label: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 700, color: COR.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' };

// ============================================================
// APP
// ============================================================
export default function DocumentosApp() {
    const [vista, setVista] = useState<Vista>('todos');
    const [areaSel, setAreaSel] = useState<string | null>(null);
    const [resumo, setResumo] = useState<any>(null);
    const [docs, setDocs] = useState<Doc[]>([]);
    const [loading, setLoading] = useState(true);
    const [docAberto, setDocAberto] = useState<Doc | null>(null);
    const [filtroTexto, setFiltroTexto] = useState('');
    const [erroModulo, setErroModulo] = useState('');
    const [aEnviar, setAEnviar] = useState<{ total: number; feitos: number } | null>(null);
    const [avisoUpload, setAvisoUpload] = useState('');
    const [arrastar, setArrastar] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const user = (() => { try { return JSON.parse(localStorage.getItem('os_auth_user') || '{}'); } catch { return {}; } })();
    const ehAdmin = ['admin', 'superadmin'].includes(user?.role);

    const fetchResumo = useCallback(async () => {
        const res = await authFetch(`${API}/api/documentos/resumo`);
        const data = await res.json();
        if (res.status === 403) { setErroModulo(data.error || 'Módulo não disponível.'); return; }
        if (data.success) setResumo(data);
    }, []);

    const fetchDocs = useCallback(async () => {
        const params = new URLSearchParams();
        if (vista === 'area' && areaSel) params.set('area', areaSel);
        if (vista === 'por_rever') params.set('estado', 'por_rever');
        if (filtroTexto.trim()) params.set('texto', filtroTexto.trim());
        const res = await authFetch(`${API}/api/documentos?${params}`);
        const data = await res.json();
        if (data.success) setDocs(data.documentos || []);
        setLoading(false);
    }, [vista, areaSel, filtroTexto]);

    useEffect(() => { fetchResumo(); }, [fetchResumo]);
    useEffect(() => { if (['todos', 'area', 'por_rever'].includes(vista)) { setLoading(true); fetchDocs(); } }, [vista, areaSel, fetchDocs]);

    // Enquanto houver documentos a serem lidos pela IA, atualiza sozinho.
    useEffect(() => {
        if (!resumo || (resumo.aProcessar || 0) === 0) return;
        const t = setInterval(() => { fetchResumo(); fetchDocs(); }, 6000);
        return () => clearInterval(t);
    }, [resumo?.aProcessar, fetchResumo, fetchDocs]);

    const enviarFicheiros = async (ficheiros: File[]) => {
        if (ficheiros.length === 0) return;
        setAvisoUpload('');
        setAEnviar({ total: ficheiros.length, feitos: 0 });
        const duplicados: string[] = [], erros: string[] = [];
        for (let i = 0; i < ficheiros.length; i += 10) {
            const lote = ficheiros.slice(i, i + 10);
            const form = new FormData();
            lote.forEach(f => form.append('files', f));
            try {
                const res = await authFetch(`${API}/api/documentos/upload`, { method: 'POST', body: form });
                const data = await res.json();
                if (!res.ok || !data.success) { erros.push(`${lote.length} ficheiro(s): ${data.error || 'falha'}`); }
                else for (const r of data.resultados) { if (r.duplicado) duplicados.push(r.nome); if (r.erro) erros.push(`${r.nome}: ${r.erro}`); }
            } catch { erros.push(`${lote.length} ficheiro(s): erro de comunicação`); }
            setAEnviar({ total: ficheiros.length, feitos: Math.min(ficheiros.length, i + 10) });
        }
        setAEnviar(null);
        const partes = [];
        if (duplicados.length) partes.push(`${duplicados.length} já existia${duplicados.length === 1 ? '' : 'm'} no arquivo (ignorado${duplicados.length === 1 ? '' : 's'})`);
        if (erros.length) partes.push(erros.join(' · '));
        setAvisoUpload(partes.join(' · '));
        fetchResumo(); fetchDocs();
    };

    const onDrop = (e: React.DragEvent) => { e.preventDefault(); setArrastar(false); enviarFicheiros(Array.from(e.dataTransfer.files)); };

    const atualizarDoc = async (id: string, alteracoes: Partial<Doc>) => {
        const res = await authFetch(`${API}/api/documentos/${id}`, { method: 'PUT', body: JSON.stringify(alteracoes) });
        const data = await res.json();
        if (!res.ok || !data.success) { alert('Erro: ' + (data.error || 'não foi possível guardar.')); return false; }
        fetchResumo(); fetchDocs();
        return true;
    };

    const apagarDoc = async (id: string) => {
        if (!window.confirm('Apagar este documento definitivamente? O ficheiro também é removido.')) return;
        const res = await authFetch(`${API}/api/documentos/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok || !data.success) { alert('Erro: ' + (data.error || 'não foi possível apagar.')); return; }
        setDocAberto(null); fetchResumo(); fetchDocs();
    };

    const reprocessar = async (id: string) => {
        const res = await authFetch(`${API}/api/documentos/${id}/reprocessar`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok || !data.success) { alert('Erro: ' + (data.error || 'não foi possível reprocessar.')); return; }
        setDocAberto(null); fetchResumo(); fetchDocs();
    };

    if (erroModulo) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COR.canvas }}>
                <div style={{ maxWidth: '460px', textAlign: 'center', color: COR.muted, fontSize: '14px', lineHeight: 1.6 }}>
                    <FolderOpen size={48} color={COR.border} style={{ marginBottom: '14px' }} />
                    <div style={{ fontWeight: 700, color: COR.ink, fontSize: '17px', marginBottom: '8px' }}>Documentos</div>
                    {erroModulo}
                </div>
            </div>
        );
    }

    const navItem = (ativo: boolean, onClick: () => void, icone: any, texto: string, badge?: number, badgeCor?: string) => (
        <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 12px', borderRadius: '2px', cursor: 'pointer', fontSize: '13px', fontWeight: ativo ? 700 : 500, color: ativo ? COR.accent : COR.ink, background: ativo ? '#E4EDF7' : 'transparent' }}>
            {icone}
            <span style={{ flex: 1 }}>{texto}</span>
            {badge !== undefined && badge > 0 && <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'white', background: badgeCor || COR.muted, padding: '1px 7px', borderRadius: '9px' }}>{badge}</span>}
        </div>
    );

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', background: COR.canvas, minHeight: 0 }}
            onDragOver={e => { e.preventDefault(); if (!arrastar) setArrastar(true); }} onDragLeave={() => setArrastar(false)} onDrop={onDrop}>

            {/* ---------- NAV ---------- */}
            <div style={{ width: '250px', minWidth: '250px', background: 'white', borderRight: `1px solid ${COR.border}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${COR.border}`, display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: COR.ink, height: '59px', boxSizing: 'border-box' }}>
                    <FolderOpen size={20} color={COR.accent} /> Documentos
                </div>
                <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
                    {navItem(vista === 'todos', () => { setVista('todos'); setAreaSel(null); }, <FolderOpen size={15} />, 'Todos os documentos')}
                    {navItem(vista === 'pesquisa', () => setVista('pesquisa'), <Sparkles size={15} />, 'Perguntar ao arquivo')}
                    {navItem(vista === 'por_rever', () => setVista('por_rever'), <Inbox size={15} />, 'Por rever', resumo?.porRever, COR.warn)}
                    {navItem(vista === 'conformidade', () => setVista('conformidade'), <ShieldAlert size={15} />, 'Conformidade', (resumo?.vencidos || 0) + (resumo?.aVencer || 0), resumo?.vencidos > 0 ? COR.bad : COR.warn)}
                    {navItem(vista === 'ativos', () => setVista('ativos'), <Wrench size={15} />, 'Ativos')}

                    <div style={{ ...label, margin: '14px 12px 6px' }}>Áreas</div>
                    {AREAS.filter(a => !resumo?.areasPermitidas || resumo.areasPermitidas.includes(a)).map(a => {
                        const n = resumo?.areas?.find((x: any) => x.nome === a)?.total || 0;
                        return navItem(vista === 'area' && areaSel === a, () => { setVista('area'); setAreaSel(a); }, <ChevronRight size={13} color={COR.faint} />, a, n, COR.faint);
                    })}
                </div>
                {ehAdmin && (
                    <div style={{ padding: '10px', borderTop: `1px solid ${COR.borderSoft}` }}>
                        {navItem(vista === 'definicoes', () => setVista('definicoes'), <Settings size={15} />, 'Definições')}
                    </div>
                )}
            </div>

            {/* ---------- CONTEÚDO ---------- */}
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {arrastar && (
                    <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(8,84,160,0.08)', border: `3px dashed ${COR.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, color: COR.accent, pointerEvents: 'none' }}>
                        Largue os ficheiros para arquivar
                    </div>
                )}

                {(resumo?.aProcessar > 0 || aEnviar) && (
                    <div style={{ margin: '12px 20px 0', padding: '10px 14px', background: '#E4EDF7', border: `1px solid ${COR.accent}`, borderRadius: '2px', fontSize: '12.5px', color: COR.accent, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Loader2 size={14} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                        {aEnviar ? `A enviar ${aEnviar.feitos}/${aEnviar.total} ficheiros...` : `${resumo.aProcessar} documento${resumo.aProcessar === 1 ? '' : 's'} a ser${resumo.aProcessar === 1 ? '' : 'em'} lido${resumo.aProcessar === 1 ? '' : 's'} pela IA — o arquivo atualiza-se sozinho.`}
                    </div>
                )}
                {avisoUpload && (
                    <div style={{ margin: '12px 20px 0', padding: '10px 14px', background: '#FCEFDD', border: '1px solid #DF6E0C', borderRadius: '2px', fontSize: '12.5px', color: '#92400e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{avisoUpload}</span><X size={14} style={{ cursor: 'pointer' }} onClick={() => setAvisoUpload('')} />
                    </div>
                )}
                {resumo?.comErro > 0 && vista !== 'todos' && null}

                {(vista === 'todos' || vista === 'area' || vista === 'por_rever') && (
                    <ListaDocs vista={vista} areaSel={areaSel} docs={docs} loading={loading} filtroTexto={filtroTexto} setFiltroTexto={setFiltroTexto}
                        onAbrir={setDocAberto} onUpload={() => fileRef.current?.click()} onAtualizar={atualizarDoc} comErro={resumo?.comErro || 0} />
                )}
                {vista === 'pesquisa' && <Pesquisa onAbrir={setDocAberto} />}
                {vista === 'conformidade' && <Conformidade onAbrir={setDocAberto} />}
                {vista === 'ativos' && <Ativos onAbrirDoc={setDocAberto} />}
                {vista === 'definicoes' && ehAdmin && <Definicoes />}

                <input ref={fileRef} type="file" multiple style={{ display: 'none' }} accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.xlsx,.xls,.docx"
                    onChange={e => { enviarFicheiros(Array.from(e.target.files || [])); e.target.value = ''; }} />
            </div>

            {docAberto && (
                <DetalheDoc doc={docAberto} onFechar={() => setDocAberto(null)} onGuardar={async (alt) => { const ok = await atualizarDoc(docAberto.id, alt); if (ok) setDocAberto({ ...docAberto, ...alt } as Doc); return ok; }}
                    onApagar={() => apagarDoc(docAberto.id)} onReprocessar={() => reprocessar(docAberto.id)} />
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// ============================================================
// LISTA
// ============================================================
function ListaDocs({ vista, areaSel, docs, loading, filtroTexto, setFiltroTexto, onAbrir, onUpload, onAtualizar, comErro }: any) {
    const titulo = vista === 'por_rever' ? 'Por rever' : vista === 'area' ? areaSel : 'Todos os documentos';
    const [rascunho, setRascunho] = useState(filtroTexto);
    useEffect(() => { const t = setTimeout(() => setFiltroTexto(rascunho), 350); return () => clearTimeout(t); }, [rascunho, setFiltroTexto]);

    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: COR.ink, flex: 1, minWidth: '160px' }}>{titulo}</h2>
                <div style={{ position: 'relative', width: '280px' }}>
                    <Search size={14} color={COR.faint} style={{ position: 'absolute', left: '10px', top: '11px' }} />
                    <input value={rascunho} onChange={e => setRascunho(e.target.value)} placeholder="Filtrar por título, entidade..." style={{ ...input, paddingLeft: '32px' }} />
                </div>
                <button onClick={onUpload} style={btn(true)}><Upload size={14} /> Carregar</button>
            </div>

            {vista === 'por_rever' && (
                <p style={{ margin: '0 20px 12px', fontSize: '12.5px', color: COR.muted, lineHeight: 1.5 }}>
                    A IA não teve confiança suficiente para arquivar estes sozinha, ou não os reconheceu como documentos da empresa. Confirme a sugestão, corrija, ou descarte.
                </p>
            )}
            {comErro > 0 && vista === 'todos' && (
                <p style={{ margin: '0 20px 12px', fontSize: '12.5px', color: COR.bad }}>{comErro} documento(s) falharam a leitura — aparecem marcados na lista; abra-os para tentar de novo.</p>
            )}

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px 20px' }}>
                {loading && <div style={{ color: COR.muted, fontSize: '13px', padding: '20px 0' }}>A carregar...</div>}
                {!loading && docs.length === 0 && (
                    <div style={{ border: `2px dashed ${COR.border}`, borderRadius: '2px', padding: '48px 20px', textAlign: 'center', color: COR.muted, fontSize: '13.5px', lineHeight: 1.6, cursor: 'pointer' }} onClick={onUpload}>
                        <Upload size={32} color={COR.border} style={{ marginBottom: '10px' }} />
                        <div style={{ fontWeight: 700, color: COR.ink }}>{vista === 'por_rever' ? 'Nada por rever.' : 'Ainda não há documentos aqui.'}</div>
                        {vista !== 'por_rever' && <div>Arraste ficheiros para esta janela ou clique para carregar. A IA lê, classifica e arruma por si.</div>}
                    </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px' }}>
                    {docs.map((d: Doc) => <CartaoDoc key={d.id} doc={d} porRever={vista === 'por_rever'} onAbrir={() => onAbrir(d)} onAtualizar={onAtualizar} />)}
                </div>
            </div>
        </div>
    );
}

function CartaoDoc({ doc, porRever, onAbrir, onAtualizar }: { doc: Doc; porRever: boolean; onAbrir: () => void; onAtualizar: (id: string, a: any) => Promise<boolean> }) {
    const emErro = doc.estado === 'erro';
    const aProcessar = doc.estado === 'a_processar';
    return (
        <div onClick={onAbrir} style={{ background: 'white', border: `1px solid ${emErro ? '#fecaca' : COR.border}`, borderRadius: '2px', padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px', opacity: aProcessar ? 0.7 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ marginTop: '1px' }}><IconeDoc doc={doc} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: COR.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.titulo}</div>
                    <div style={{ fontSize: '11.5px', color: COR.faint, display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                        <span>{doc.tipo || '—'}</span><span>·</span><span>{doc.area}</span>
                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}><IconeOrigem origem={doc.origem} /></span>
                    </div>
                </div>
            </div>
            {aProcessar && <div style={{ fontSize: '12px', color: COR.accent, display: 'flex', alignItems: 'center', gap: '6px' }}><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> A ser lido pela IA...</div>}
            {emErro && <div style={{ fontSize: '12px', color: COR.bad }}>Falhou a leitura: {doc.erro}</div>}
            {doc.resumo && !aProcessar && <div style={{ fontSize: '12.5px', color: COR.muted, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{doc.resumo}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                {doc.entidade_nome && <span style={{ fontSize: '11.5px', color: COR.muted, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><IconeEntidade tipo={doc.entidade_tipo} /> {doc.entidade_nome}{!doc.entidade_id && <span style={{ color: COR.faint }}> (não ligado)</span>}</span>}
                <span style={{ marginLeft: 'auto' }}><BadgeValidade validade={doc.validade} /></span>
            </div>
            {porRever && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '4px', paddingTop: '8px', borderTop: `1px solid ${COR.borderSoft}` }} onClick={e => e.stopPropagation()}>
                    <span style={{ fontSize: '11px', color: COR.faint, alignSelf: 'center', marginRight: 'auto' }}>confiança {Math.round((doc.confianca || 0) * 100)}%</span>
                    <button style={{ ...btn(true), padding: '5px 10px' }} onClick={() => onAtualizar(doc.id, { estado: 'arquivado' })}><Check size={12} /> Arquivar assim</button>
                    <button style={{ ...btn(false), padding: '5px 10px' }} onClick={onAbrir}>Corrigir</button>
                    <button style={{ ...btn(false, true), padding: '5px 8px' }} onClick={() => onAtualizar(doc.id, { estado: 'descartado' })} title="Descartar"><Trash2 size={12} /></button>
                </div>
            )}
        </div>
    );
}

// ============================================================
// DETALHE
// ============================================================
function DetalheDoc({ doc, onFechar, onGuardar, onApagar, onReprocessar }: { doc: Doc; onFechar: () => void; onGuardar: (a: Partial<Doc>) => Promise<boolean>; onApagar: () => void; onReprocessar: () => void }) {
    const [f, setF] = useState<any>({ titulo: doc.titulo, area: doc.area, tipo: doc.tipo || '', resumo: doc.resumo || '', data_documento: doc.data_documento || '', validade: doc.validade || '', entidade_tipo: doc.entidade_tipo || '', entidade_id: doc.entidade_id || '', entidade_nome: doc.entidade_nome || '' });
    const [opcoes, setOpcoes] = useState<any>(null);
    const [aGuardar, setAGuardar] = useState(false);
    const [completo, setCompleto] = useState<Doc | null>(null);

    useEffect(() => {
        (async () => {
            const r = await authFetch(`${API}/api/documentos/entidades/opcoes`); const d = await r.json(); if (d.success) setOpcoes(d);
            const r2 = await authFetch(`${API}/api/documentos/${doc.id}`); const d2 = await r2.json(); if (d2.success) setCompleto(d2.documento);
        })();
    }, [doc.id]);

    const listaEntidades = f.entidade_tipo === 'cliente' ? opcoes?.clientes : f.entidade_tipo === 'colaborador' ? opcoes?.colaboradores : f.entidade_tipo === 'ativo' ? opcoes?.ativos : null;
    const alterado = JSON.stringify(f) !== JSON.stringify({ titulo: doc.titulo, area: doc.area, tipo: doc.tipo || '', resumo: doc.resumo || '', data_documento: doc.data_documento || '', validade: doc.validade || '', entidade_tipo: doc.entidade_tipo || '', entidade_id: doc.entidade_id || '', entidade_nome: doc.entidade_nome || '' });

    const guardar = async (extra: any = {}) => {
        setAGuardar(true);
        const payload: any = { ...f, ...extra };
        if (!payload.entidade_tipo) { payload.entidade_tipo = null; payload.entidade_id = null; }
        await onGuardar(payload);
        setAGuardar(false);
    };

    const ehPdf = (doc.mime_type || '').includes('pdf');
    const ehImg = (doc.mime_type || '').startsWith('image/');
    const campos = Object.entries(completo?.campos || doc.campos || {}).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object');

    return (
        <div style={{ width: '520px', minWidth: '520px', background: 'white', borderLeft: `1px solid ${COR.border}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${COR.border}`, display: 'flex', alignItems: 'center', gap: '10px', height: '59px', boxSizing: 'border-box' }}>
                <IconeDoc doc={doc} size={20} />
                <div style={{ flex: 1, minWidth: 0, fontSize: '13px', color: COR.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.nome_ficheiro} · {fmtTam(doc.tamanho || 0)}</div>
                <a href={doc.url} target="_blank" rel="noreferrer" title="Abrir / descarregar" style={{ color: COR.accent }}><Download size={17} /></a>
                <X size={18} style={{ cursor: 'pointer', color: COR.muted }} onClick={onFechar} />
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                <div style={{ height: '230px', background: COR.canvas, borderBottom: `1px solid ${COR.borderSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {ehPdf ? <iframe src={doc.url} title="pré-visualização" style={{ width: '100%', height: '100%', border: 'none' }} />
                        : ehImg ? <img src={doc.url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        : <div style={{ color: COR.faint, fontSize: '13px' }}>Sem pré-visualização para este formato.</div>}
                </div>

                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {doc.estado === 'erro' && (
                        <div style={{ background: '#F6DEDE', border: '1px solid #fecaca', borderRadius: '2px', padding: '10px 12px', fontSize: '12.5px', color: COR.bad }}>
                            A leitura falhou: {doc.erro}
                            <div style={{ marginTop: '8px' }}><button style={btn()} onClick={onReprocessar}><RefreshCw size={13} /> Tentar de novo</button></div>
                        </div>
                    )}
                    {doc.estado === 'por_rever' && (
                        <div style={{ background: '#FCEFDD', border: '1px solid #DF6E0C', borderRadius: '2px', padding: '10px 12px', fontSize: '12.5px', color: '#92400e' }}>
                            Por rever — a IA sugeriu o que está abaixo com {Math.round((doc.confianca || 0) * 100)}% de confiança. Confirme ou corrija e arquive.
                        </div>
                    )}

                    <div><label style={label}>Título</label><input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} style={input} /></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div><label style={label}>Área</label>
                            <select value={f.area} onChange={e => setF({ ...f, area: e.target.value })} style={input}>{AREAS.map(a => <option key={a}>{a}</option>)}</select></div>
                        <div><label style={label}>Tipo</label>
                            <select value={TIPOS.includes(f.tipo) ? f.tipo : (f.tipo ? '__outro' : '')} onChange={e => setF({ ...f, tipo: e.target.value === '__outro' ? f.tipo : e.target.value })} style={input}>
                                <option value="">—</option>{TIPOS.map(t => <option key={t}>{t}</option>)}{f.tipo && !TIPOS.includes(f.tipo) && <option value="__outro">{f.tipo}</option>}
                            </select></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div><label style={label}>Data do documento</label><input type="date" value={f.data_documento} onChange={e => setF({ ...f, data_documento: e.target.value })} style={input} /></div>
                        <div><label style={label}>Validade (caduca em)</label><input type="date" value={f.validade} onChange={e => setF({ ...f, validade: e.target.value })} style={input} /></div>
                    </div>
                    <div>
                        <label style={label}>Pertence a</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px' }}>
                            <select value={f.entidade_tipo} onChange={e => setF({ ...f, entidade_tipo: e.target.value, entidade_id: '' })} style={input}>
                                <option value="">Ninguém</option><option value="cliente">Cliente</option><option value="colaborador">Colaborador</option><option value="ativo">Ativo</option>
                            </select>
                            {listaEntidades ? (
                                <select value={f.entidade_id} onChange={e => { const o = listaEntidades.find((x: any) => String(x.id) === e.target.value); setF({ ...f, entidade_id: e.target.value, entidade_nome: o?.nome || f.entidade_nome }); }} style={input}>
                                    <option value="">Escolher...</option>{listaEntidades.map((o: any) => <option key={o.id} value={String(o.id)}>{o.nome}</option>)}
                                </select>
                            ) : <input value={f.entidade_nome} onChange={e => setF({ ...f, entidade_nome: e.target.value })} placeholder="Nome (ex: fornecedor)" style={input} />}
                        </div>
                        {f.entidade_nome && !f.entidade_id && f.entidade_tipo && <div style={{ fontSize: '11.5px', color: COR.faint, marginTop: '5px' }}>A IA sugeriu "{f.entidade_nome}" mas não encontrou registo com esse nome.</div>}
                    </div>
                    <div><label style={label}>Resumo</label><textarea value={f.resumo} onChange={e => setF({ ...f, resumo: e.target.value })} rows={2} style={{ ...input, resize: 'vertical' }} /></div>

                    {campos.length > 0 && (
                        <div>
                            <label style={label}>Dados extraídos</label>
                            <div style={{ border: `1px solid ${COR.borderSoft}`, borderRadius: '2px', fontSize: '12.5px' }}>
                                {campos.map(([k, v]) => (
                                    <div key={k} style={{ display: 'flex', padding: '6px 10px', borderBottom: `1px solid ${COR.borderSoft}` }}>
                                        <span style={{ width: '130px', color: COR.faint, textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                                        <span style={{ color: COR.ink, flex: 1, wordBreak: 'break-word' }}>{String(v)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div style={{ fontSize: '11.5px', color: COR.faint, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><IconeOrigem origem={doc.origem} /> Entrou por {({ manual: 'upload manual', email: 'email', whatsapp: 'WhatsApp', sistema: 'geração do sistema' } as any)[doc.origem]}{doc.origem_detalhe ? ` — ${doc.origem_detalhe}` : ''}</span>
                        <span>Arquivado em {new Date(doc.criado_em).toLocaleString('pt-PT')}</span>
                    </div>
                </div>
            </div>

            <div style={{ padding: '12px 16px', borderTop: `1px solid ${COR.border}`, display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button style={btn(false, true)} onClick={onApagar} title="Apagar definitivamente"><Trash2 size={13} /></button>
                {doc.estado !== 'descartado' && <button style={btn()} onClick={() => guardar({ estado: 'descartado' })}>Descartar</button>}
                <span style={{ flex: 1 }} />
                {doc.estado === 'por_rever' || doc.estado === 'descartado'
                    ? <button style={btn(true)} disabled={aGuardar} onClick={() => guardar({ estado: 'arquivado' })}><Check size={13} /> {alterado ? 'Guardar e arquivar' : 'Arquivar'}</button>
                    : <button style={btn(true)} disabled={aGuardar || !alterado} onClick={() => guardar()}>{aGuardar ? 'A guardar...' : 'Guardar'}</button>}
            </div>
        </div>
    );
}

// ============================================================
// PESQUISA EM LINGUAGEM NATURAL
// ============================================================
function Pesquisa({ onAbrir }: { onAbrir: (d: Doc) => void }) {
    const [pergunta, setPergunta] = useState('');
    const [aPesquisar, setAPesquisar] = useState(false);
    const [resultado, setResultado] = useState<{ resposta: string | null; documentos: any[] } | null>(null);
    const [erro, setErro] = useState('');

    const pesquisar = async () => {
        if (!pergunta.trim()) return;
        setAPesquisar(true); setErro(''); setResultado(null);
        try {
            const res = await authFetch(`${API}/api/documentos/pesquisar`, { method: 'POST', body: JSON.stringify({ pergunta }) });
            const data = await res.json();
            if (!res.ok || !data.success) setErro(data.error || 'Falha na pesquisa.'); else setResultado(data);
        } catch { setErro('Erro de comunicação.'); }
        setAPesquisar(false);
    };

    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px' }}>
            <div style={{ maxWidth: '760px' }}>
                <h2 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 700, color: COR.ink }}>Perguntar ao arquivo</h2>
                <p style={{ margin: '0 0 16px', fontSize: '13px', color: COR.muted, lineHeight: 1.5 }}>Pergunte como perguntaria a uma pessoa. A resposta vem só dos documentos arquivados, com a indicação de onde saiu.</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input value={pergunta} onChange={e => setPergunta(e.target.value)} onKeyDown={e => e.key === 'Enter' && pesquisar()} placeholder='Ex: "quando caduca o alvará?", "última fatura da Unitel", "que contratos temos com a Sonangol"' style={{ ...input, padding: '11px 13px', fontSize: '14px' }} />
                    <button onClick={pesquisar} disabled={aPesquisar} style={{ ...btn(true), padding: '0 18px', flexShrink: 0 }}>{aPesquisar ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={15} />} Perguntar</button>
                </div>
                {erro && <p style={{ color: COR.bad, fontSize: '13px' }}>{erro}</p>}

                {resultado && (
                    <div style={{ marginTop: '20px' }}>
                        {resultado.documentos.length === 0 ? (
                            <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '16px', fontSize: '13.5px', color: COR.muted }}>
                                Não encontrei nada no arquivo sobre isso. Se o documento existe, pode ainda não ter sido carregado — ou estar numa área a que não tem acesso.
                            </div>
                        ) : (
                            <>
                                {resultado.resposta && (
                                    <div style={{ background: '#E4EDF7', border: `1px solid ${COR.accent}`, borderRadius: '2px', padding: '14px 16px', fontSize: '14px', color: COR.ink, lineHeight: 1.6, display: 'flex', gap: '10px' }}>
                                        <Sparkles size={16} color={COR.accent} style={{ flexShrink: 0, marginTop: '3px' }} /><div>{resultado.resposta}</div>
                                    </div>
                                )}
                                <div style={{ ...label, margin: '18px 0 8px' }}>Documentos encontrados</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {resultado.documentos.map((d: any) => (
                                        <div key={d.id} onClick={() => onAbrir(d)} style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '12px 14px', cursor: 'pointer' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <FileText size={15} color={COR.muted} />
                                                <span style={{ fontWeight: 700, fontSize: '13.5px', color: COR.ink, flex: 1 }}>{d.titulo}</span>
                                                <span style={{ fontSize: '11px', color: COR.faint }}>{Math.round(d.relevancia * 100)}% relevante</span>
                                            </div>
                                            <div style={{ fontSize: '12px', color: COR.faint, marginTop: '3px' }}>{d.tipo} · {d.area}{d.entidade_nome ? ` · ${d.entidade_nome}` : ''}{d.validade ? ` · válido até ${fmtData(d.validade)}` : ''}</div>
                                            {d.excertos?.[0] && <div style={{ fontSize: '12.5px', color: COR.muted, marginTop: '6px', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{d.excertos[0]}</div>}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================
// CONFORMIDADE
// ============================================================
function Conformidade({ onAbrir }: { onAbrir: (d: Doc) => void }) {
    const [dados, setDados] = useState<any>(null);
    useEffect(() => { (async () => { const r = await authFetch(`${API}/api/documentos/conformidade`); const d = await r.json(); if (d.success) setDados(d); })(); }, []);

    const coluna = (titulo: string, cor: string, Icone: any, itens: any[], vazio: string) => (
        <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderTop: `3px solid ${cor}`, borderRadius: '2px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${COR.borderSoft}`, display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13.5px', color: COR.ink }}>
                <Icone size={16} color={cor} /> {titulo} <span style={{ marginLeft: 'auto', fontSize: '20px', color: cor }}>{itens.length}</span>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                {itens.length === 0 && <div style={{ padding: '18px 14px', fontSize: '12.5px', color: COR.faint }}>{vazio}</div>}
                {itens.map((d: any) => (
                    <div key={d.id} onClick={() => onAbrir(d)} style={{ padding: '10px 14px', borderBottom: `1px solid ${COR.borderSoft}`, cursor: 'pointer' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: COR.ink }}>{d.titulo}</div>
                        <div style={{ fontSize: '11.5px', color: COR.faint, marginTop: '2px' }}>{d.area}{d.entidade_nome ? ` · ${d.entidade_nome}` : ''}</div>
                        <div style={{ fontSize: '12px', color: cor, fontWeight: 700, marginTop: '4px' }}>
                            {d.dias < 0 ? `Caducou há ${-d.dias} dia${-d.dias === 1 ? '' : 's'}` : d.dias === 0 ? 'Caduca hoje' : `Caduca em ${d.dias} dia${d.dias === 1 ? '' : 's'}`} · {fmtData(d.validade)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '20px' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 700, color: COR.ink }}>Conformidade</h2>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: COR.muted }}>Tudo o que tem prazo — licenças, alvarás, certificados, contratos, apólices, identificação. A validade é lida pela IA no arquivo; corrija-a no documento se estiver errada.</p>
            {!dados ? <div style={{ color: COR.muted, fontSize: '13px' }}>A carregar...</div> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', flex: 1, minHeight: 0 }}>
                    {coluna('Caducados', COR.bad, AlertTriangle, dados.vencidos, 'Nada caducado.')}
                    {coluna(`A caducar em ${dados.diasAviso} dias`, COR.warn, Clock, dados.aVencer, 'Nada a caducar em breve.')}
                    {coluna('Em dia', COR.good, CheckCircle2, dados.emDia, 'Nenhum documento com validade futura.')}
                </div>
            )}
        </div>
    );
}

// ============================================================
// ATIVOS
// ============================================================
function Ativos({ onAbrirDoc }: { onAbrirDoc: (d: Doc) => void }) {
    const [ativos, setAtivos] = useState<any[]>([]);
    const [form, setForm] = useState<any>(null);
    const [sel, setSel] = useState<any>(null);
    const [docsDoAtivo, setDocsDoAtivo] = useState<Doc[]>([]);

    const carregar = useCallback(async () => { const r = await authFetch(`${API}/api/documentos/ativos/lista`); const d = await r.json(); if (d.success) setAtivos(d.ativos); }, []);
    useEffect(() => { carregar(); }, [carregar]);
    useEffect(() => {
        if (!sel) return;
        (async () => { const r = await authFetch(`${API}/api/documentos?entidade_tipo=ativo&entidade_id=${sel.id}`); const d = await r.json(); if (d.success) setDocsDoAtivo(d.documentos); })();
    }, [sel]);

    const guardar = async () => {
        if (!form.nome?.trim()) { alert('O nome é obrigatório.'); return; }
        const res = await authFetch(`${API}/api/documentos/ativos${form.id ? '/' + form.id : ''}`, { method: form.id ? 'PUT' : 'POST', body: JSON.stringify(form) });
        const data = await res.json();
        if (!res.ok || !data.success) { alert('Erro: ' + (data.error || 'não foi possível guardar.')); return; }
        setForm(null); carregar();
    };
    const apagar = async (a: any) => {
        if (!window.confirm(`Apagar o ativo "${a.nome}"? Os documentos ficam no arquivo, só perdem a ligação.`)) return;
        const res = await authFetch(`${API}/api/documentos/ativos/${a.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok || !data.success) { alert('Erro: ' + (data.error || 'não foi possível apagar.')); return; }
        if (sel?.id === a.id) setSel(null);
        carregar();
    };

    const campo = (k: string, l: string, tipo: 'text' | 'select' = 'text', ops?: string[]) => (
        <div><label style={label}>{l}</label>
            {tipo === 'select' ? <select value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} style={input}>{ops!.map(o => <option key={o}>{o}</option>)}</select>
                : <input value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} style={input} />}
        </div>
    );

    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: COR.ink, flex: 1 }}>Ativos</h2>
                    <button style={btn(true)} onClick={() => setForm({ categoria: 'Equipamento', estado: 'Ativo' })}><Plus size={14} /> Novo ativo</button>
                </div>
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: COR.muted }}>Máquinas, viaturas, equipamento, instalações. Cada um tem o seu dossiê: manuais, manutenções, certificados, inspeções, apólices.</p>

                {form && (
                    <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '16px', marginBottom: '14px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                        {campo('nome', 'Nome')}{campo('categoria', 'Categoria', 'select', ['Equipamento', 'Máquina', 'Viatura', 'Informática', 'Instalação', 'Mobiliário', 'Outro'])}{campo('estado', 'Estado', 'select', ['Ativo', 'Em manutenção', 'Desativado'])}
                        {campo('marca', 'Marca')}{campo('modelo', 'Modelo')}{campo('numero_serie', 'Nº de série / matrícula')}
                        {campo('localizacao', 'Localização')}
                        <div style={{ gridColumn: 'span 2' }}><label style={label}>Notas</label><input value={form.notas || ''} onChange={e => setForm({ ...form, notas: e.target.value })} style={input} /></div>
                        <div style={{ gridColumn: 'span 3', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button style={btn()} onClick={() => setForm(null)}>Cancelar</button><button style={btn(true)} onClick={guardar}>Guardar</button>
                        </div>
                    </div>
                )}

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead><tr style={{ background: COR.canvas }}>{['Nome', 'Categoria', 'Marca / modelo', 'Localização', 'Estado', 'Documentos', ''].map(h => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10.5px', fontWeight: 700, color: COR.faint, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                        <tbody>
                            {ativos.length === 0 && <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: COR.faint }}>Ainda não há ativos registados.</td></tr>}
                            {ativos.map(a => (
                                <tr key={a.id} onClick={() => setSel(a)} style={{ borderTop: `1px solid ${COR.borderSoft}`, cursor: 'pointer', background: sel?.id === a.id ? '#E4EDF7' : 'white' }}>
                                    <td style={{ padding: '10px 12px', fontWeight: 600, color: COR.ink }}>{a.nome}</td>
                                    <td style={{ padding: '10px 12px' }}>{a.categoria}</td>
                                    <td style={{ padding: '10px 12px' }}>{[a.marca, a.modelo].filter(Boolean).join(' ') || '—'}</td>
                                    <td style={{ padding: '10px 12px' }}>{a.localizacao || '—'}</td>
                                    <td style={{ padding: '10px 12px' }}><span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '2px', color: a.estado === 'Ativo' ? COR.good : a.estado === 'Desativado' ? COR.faint : COR.warn, background: a.estado === 'Ativo' ? '#DCEEE2' : a.estado === 'Desativado' ? COR.borderSoft : '#FCEFDD' }}>{a.estado}</span></td>
                                    <td style={{ padding: '10px 12px' }}>{a.docs}{a.vencidos > 0 && <span style={{ color: COR.bad, fontWeight: 700 }}> · {a.vencidos} caducado{a.vencidos === 1 ? '' : 's'}</span>}</td>
                                    <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                                        <button style={{ ...btn(), padding: '4px 8px', marginRight: '4px' }} onClick={() => setForm({ ...a })}>Editar</button>
                                        <button style={{ ...btn(false, true), padding: '4px 8px' }} onClick={() => apagar(a)}><Trash2 size={12} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {sel && (
                <div style={{ width: '340px', minWidth: '340px', background: 'white', borderLeft: `1px solid ${COR.border}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div style={{ padding: '14px 16px', borderBottom: `1px solid ${COR.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Wrench size={16} color={COR.accent} /><span style={{ fontWeight: 700, color: COR.ink, flex: 1 }}>{sel.nome}</span><X size={16} style={{ cursor: 'pointer', color: COR.muted }} onClick={() => setSel(null)} />
                    </div>
                    <div style={{ padding: '12px 16px', fontSize: '12.5px', color: COR.muted, borderBottom: `1px solid ${COR.borderSoft}` }}>
                        {[sel.categoria, sel.marca, sel.modelo].filter(Boolean).join(' · ')}{sel.numero_serie ? ` · nº ${sel.numero_serie}` : ''}{sel.localizacao ? ` · ${sel.localizacao}` : ''}
                    </div>
                    <div style={{ ...label, margin: '12px 16px 6px' }}>Dossiê ({docsDoAtivo.length})</div>
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 10px 10px' }}>
                        {docsDoAtivo.length === 0 && <div style={{ padding: '10px 6px', fontSize: '12.5px', color: COR.faint }}>Sem documentos ligados. Ao carregar um manual, certificado ou fatura deste ativo, a IA liga-o aqui — ou ligue-o à mão no documento.</div>}
                        {docsDoAtivo.map(d => (
                            <div key={d.id} onClick={() => onAbrirDoc(d)} style={{ padding: '9px 8px', borderRadius: '2px', cursor: 'pointer', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <IconeDoc doc={d} size={15} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: COR.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.titulo}</div>
                                    <div style={{ fontSize: '11.5px', color: COR.faint }}>{d.tipo} · {fmtData(d.data_documento || d.criado_em.slice(0, 10))}</div>
                                    <BadgeValidade validade={d.validade} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================
// DEFINIÇÕES (admin)
// ============================================================
function Definicoes() {
    const [est, setEst] = useState<any>(null);
    const [aGuardar, setAGuardar] = useState<string | null>(null);
    const carregar = useCallback(async () => { const r = await authFetch(`${API}/api/documentos/definicoes/estado`); const d = await r.json(); if (d.success) setEst(d); }, []);
    useEffect(() => { carregar(); }, [carregar]);

    const captura = async (canal: 'email' | 'whatsapp', valor: boolean) => {
        setAGuardar(canal);
        const res = await authFetch(`${API}/api/documentos/definicoes/captura`, { method: 'PUT', body: JSON.stringify({ [canal]: valor }) });
        const data = await res.json();
        if (!res.ok || !data.success) alert('Erro: ' + (data.error || 'não foi possível guardar.')); else carregar();
        setAGuardar(null);
    };

    const permissoesDe = (userId: string) => (est?.permissoes || []).filter((p: any) => p.user_id === userId).map((p: any) => p.area);
    const alternarArea = async (userId: string, area: string) => {
        const atuais = permissoesDe(userId);
        const novas = atuais.includes(area) ? atuais.filter((a: string) => a !== area) : [...atuais, area];
        setAGuardar(userId);
        const res = await authFetch(`${API}/api/documentos/definicoes/permissoes/${userId}`, { method: 'PUT', body: JSON.stringify({ areas: novas }) });
        const data = await res.json();
        if (!res.ok || !data.success) alert('Erro: ' + (data.error || 'não foi possível guardar.')); else carregar();
        setAGuardar(null);
    };
    const limpar = async (userId: string) => {
        setAGuardar(userId);
        await authFetch(`${API}/api/documentos/definicoes/permissoes/${userId}`, { method: 'PUT', body: JSON.stringify({ areas: [] }) });
        carregar(); setAGuardar(null);
    };

    if (!est) return <div style={{ padding: '20px', color: COR.muted, fontSize: '13px' }}>A carregar...</div>;

    const Toggle = ({ ligado, onClick, aGuardarEste }: any) => (
        <div onClick={aGuardarEste ? undefined : onClick} style={{ width: '40px', height: '20px', borderRadius: '2px', background: ligado ? COR.accent : COR.border, position: 'relative', cursor: 'pointer', flexShrink: 0, opacity: aGuardarEste ? 0.5 : 1 }}>
            <div style={{ width: '16px', height: '16px', background: 'white', borderRadius: '50%', position: 'absolute', top: '2px', left: ligado ? '22px' : '2px', transition: 'left 0.2s' }} />
        </div>
    );

    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px' }}>
            <div style={{ maxWidth: '860px' }}>
                <h2 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 700, color: COR.ink }}>Definições dos Documentos</h2>

                <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ fontWeight: 700, color: COR.ink, marginBottom: '12px' }}>Portas de entrada automáticas</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 0', borderBottom: `1px solid ${COR.borderSoft}` }}>
                        <Mail size={18} color={COR.muted} />
                        <div style={{ flex: 1 }}><div style={{ fontSize: '13.5px', fontWeight: 600, color: COR.ink }}>Anexos de email</div><div style={{ fontSize: '12.5px', color: COR.muted }}>Todo o anexo que chegar à caixa de entrada da empresa (Email → Definições) é lido e arquivado automaticamente. Reencaminhe um email para lá e fica feito.</div></div>
                        <Toggle ligado={est.capturaEmail} aGuardarEste={aGuardar === 'email'} onClick={() => captura('email', !est.capturaEmail)} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 0' }}>
                        <MessageSquare size={18} color={COR.muted} />
                        <div style={{ flex: 1 }}><div style={{ fontSize: '13.5px', fontWeight: 600, color: COR.ink }}>Fotos e ficheiros pelo WhatsApp</div><div style={{ fontSize: '12.5px', color: COR.muted }}>Uma foto de um papel ou um PDF enviado para o WhatsApp da empresa vai para o arquivo. Desligado por omissão — nem toda a empresa quer que as conversas de clientes alimentem o arquivo.</div></div>
                        <Toggle ligado={est.capturaWhatsapp} aGuardarEste={aGuardar === 'whatsapp'} onClick={() => captura('whatsapp', !est.capturaWhatsapp)} />
                    </div>
                </div>

                <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '16px' }}>
                    <div style={{ fontWeight: 700, color: COR.ink, marginBottom: '4px' }}>Quem vê o quê</div>
                    <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: COR.muted, lineHeight: 1.5 }}>Administradores veem tudo. Para os restantes, sem nenhuma área marcada veem tudo; com áreas marcadas, veem só essas. Ex.: marque só "RH" para quem trata de pessoal, e os contratos e recibos deixam de aparecer a quem está nas vendas.</p>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ borderCollapse: 'collapse', fontSize: '12.5px', minWidth: '100%' }}>
                            <thead><tr>
                                <th style={{ textAlign: 'left', padding: '8px', fontSize: '10.5px', color: COR.faint, textTransform: 'uppercase' }}>Utilizador</th>
                                {est.areas.map((a: string) => <th key={a} style={{ padding: '8px 6px', fontSize: '10px', color: COR.faint, textTransform: 'uppercase', writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}>{a}</th>)}
                                <th />
                            </tr></thead>
                            <tbody>
                                {est.utilizadores.filter((u: any) => !['admin', 'superadmin'].includes(u.role)).map((u: any) => {
                                    const p = permissoesDe(u.id);
                                    return (
                                        <tr key={u.id} style={{ borderTop: `1px solid ${COR.borderSoft}`, opacity: aGuardar === u.id ? 0.5 : 1 }}>
                                            <td style={{ padding: '8px' }}><div style={{ fontWeight: 600, color: COR.ink }}>{u.nome}</div><div style={{ fontSize: '11px', color: COR.faint }}>{u.role}{p.length === 0 ? ' · vê tudo' : ` · ${p.length} área${p.length === 1 ? '' : 's'}`}</div></td>
                                            {est.areas.map((a: string) => (
                                                <td key={a} style={{ textAlign: 'center', padding: '8px 6px' }}>
                                                    <input type="checkbox" checked={p.includes(a)} onChange={() => alternarArea(u.id, a)} disabled={aGuardar === u.id} />
                                                </td>
                                            ))}
                                            <td style={{ padding: '8px' }}>{p.length > 0 && <button style={{ ...btn(), padding: '3px 8px', fontSize: '11px' }} onClick={() => limpar(u.id)}>Ver tudo</button>}</td>
                                        </tr>
                                    );
                                })}
                                {est.utilizadores.filter((u: any) => !['admin', 'superadmin'].includes(u.role)).length === 0 && (
                                    <tr><td colSpan={est.areas.length + 2} style={{ padding: '16px 8px', color: COR.faint }}>Só há administradores nesta empresa — todos veem tudo.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
