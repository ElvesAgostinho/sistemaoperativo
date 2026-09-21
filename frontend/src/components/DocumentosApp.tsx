import { useState, useEffect, useCallback, useRef } from 'react';
import {
    FolderOpen, Folder, FolderPlus, Search, Upload, Inbox, ShieldAlert, Wrench, Settings, FileText, FileImage, FileSpreadsheet, ArrowLeft,
    Mail, MessageSquare, Cpu, User, Briefcase, Users, ChevronRight, ChevronDown, X, Check, Trash2, AlertTriangle, Clock, CheckCircle2, Plus, Sparkles, Loader2, ScrollText, Pencil, CheckSquare, ClipboardCheck, RefreshCw, LayoutDashboard, Star, History, Archive, MapPin, PenLine
} from 'lucide-react';
import { API, authFetch, AREAS, COR, diasAte, fmtData, fmtDataHora, btn, input, label, ROTULO_ACAO } from './documentos/comum';
import type { Doc, TipoDoc } from './documentos/comum';
import DocumentoDetalhe, { BadgeCiclo, IconeConfidencialidade } from './documentos/DocumentoDetalhe';
import DocumentosTipos from './documentos/DocumentosTipos';
import DocumentosFluxos from './documentos/DocumentosFluxos';
import Aprovacoes, { Notificacoes } from './documentos/Aprovacoes';
import Checklists from './documentos/Checklists';
import { consumirAlvo } from '../lib/navegacao';
import Painel from './documentos/Painel';

type Vista = 'todos' | 'area' | 'pasta' | 'por_rever' | 'conformidade' | 'ativos' | 'definicoes' | 'pesquisa' | 'auditoria' | 'aprovacoes' | 'checklists' | 'entidade' | 'painel' | 'favoritos' | 'recentes' | 'retencao' | 'fisico';
const VISTAS_LISTA: Vista[] = ['todos', 'area', 'pasta', 'por_rever', 'entidade', 'favoritos', 'recentes', 'retencao', 'fisico'];

function IconeDoc({ doc, size = 18 }: { doc: Doc; size?: number }) {
    const m = doc.mime_type || '';
    if (m.startsWith('image/')) return <FileImage size={size} color={COR.muted} />;
    if (m.includes('sheet') || m.includes('excel') || /\.(xlsx|xls|csv)$/i.test(doc.nome_ficheiro)) return <FileSpreadsheet size={size} color={COR.muted} />;
    return <FileText size={size} color={COR.muted} />;
}
function IconeOrigem({ origem }: { origem: string }) {
    const p = { size: 12, color: COR.faint };
    if (origem === 'email') return <Mail {...p} />; if (origem === 'whatsapp') return <MessageSquare {...p} />; if (origem === 'sistema') return <Cpu {...p} />;
    return <Upload {...p} />;
}
function IconeEntidade({ tipo }: { tipo: string | null }) {
    const p = { size: 12, color: COR.faint };
    if (tipo === 'colaborador') return <User {...p} />; if (tipo === 'ativo') return <Wrench {...p} />;
    if (tipo === 'cliente' || tipo === 'negocio') return <Briefcase {...p} />;
    return <Users {...p} />;
}
function BadgeValidade({ validade }: { validade: string | null }) {
    const d = diasAte(validade);
    if (d === null) return null;
    const cfg = d < 0 ? { c: COR.bad, bg: '#F6DEDE', t: `Caducou há ${-d} dia${-d === 1 ? '' : 's'}` }
        : d <= 30 ? { c: COR.warn, bg: '#FCEFDD', t: d === 0 ? 'Caduca hoje' : `Caduca em ${d} dia${d === 1 ? '' : 's'}` }
        : { c: COR.good, bg: '#DCEEE2', t: `Válido até ${fmtData(validade)}` };
    return <span style={{ fontSize: '10.5px', fontWeight: 700, color: cfg.c, background: cfg.bg, padding: '2px 7px', borderRadius: '2px', whiteSpace: 'nowrap' }}>{cfg.t}</span>;
}

// Caminho legível de cada pasta ("RH / Contratos / 2026") para seletores.
function comCaminhos(pastas: any[]): any[] {
    const porId = new Map(pastas.map(p => [p.id, p]));
    const caminho = (p: any): string => { const pai = p.parent_id ? porId.get(p.parent_id) : null; return pai ? `${caminho(pai)} / ${p.nome}` : p.nome; };
    return pastas.map(p => ({ ...p, caminho: caminho(p) })).sort((a, b) => a.caminho.localeCompare(b.caminho));
}

// ============================================================
export default function DocumentosApp({ onVoltar }: { onVoltar?: () => void }) {
    const [vista, setVista] = useState<Vista>('todos');
    const [areaSel, setAreaSel] = useState<string | null>(null);
    const [pastaSel, setPastaSel] = useState<any | null>(null);
    const [entidadeSel, setEntidadeSel] = useState<{ tipo: string; id: string; nome: string } | null>(null);
    const [resumo, setResumo] = useState<any>(null);
    const [tipos, setTipos] = useState<TipoDoc[]>([]);
    const [pastas, setPastas] = useState<any[]>([]);
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

    const abrirPorId = useCallback(async (id: string) => {
        const r = await authFetch(`${API}/api/documentos/${id}`); const d = await r.json();
        if (d.success) setDocAberto(d.documento); else setAvisoUpload(d.error || 'Não foi possível abrir o documento.');
    }, []);

    const fetchResumo = useCallback(async () => {
        const res = await authFetch(`${API}/api/documentos/resumo`); const data = await res.json();
        if (res.status === 403) { setErroModulo(data.error || 'Módulo não disponível.'); return; }
        if (data.success) setResumo(data);
    }, []);
    const fetchTiposEPastas = useCallback(async () => {
        const [r1, r2] = await Promise.all([authFetch(`${API}/api/documentos/tipos`), authFetch(`${API}/api/documentos/pastas`)]);
        const d1 = await r1.json(); const d2 = await r2.json();
        if (d1.success) setTipos(d1.tipos); if (d2.success) setPastas(comCaminhos(d2.pastas));
    }, []);
    const fetchDocs = useCallback(async () => {
        const params = new URLSearchParams();
        if (vista === 'area' && areaSel) params.set('area', areaSel);
        if (vista === 'pasta') params.set('pasta_id', pastaSel ? String(pastaSel.id) : 'raiz');
        if (vista === 'por_rever') params.set('estado', 'por_rever');
        if (vista === 'entidade' && entidadeSel) { params.set('entidade_tipo', entidadeSel.tipo); params.set('entidade_id', entidadeSel.id); }
        if (['favoritos', 'recentes', 'retencao', 'fisico'].includes(vista)) params.set('lista', vista);
        if (vista === 'retencao') params.set('ciclo', 'RETENTION_PENDING');
        if (filtroTexto.trim()) params.set('texto', filtroTexto.trim());
        const res = await authFetch(`${API}/api/documentos?${params}`); const data = await res.json();
        if (data.success) setDocs(data.documentos || []);
        setLoading(false);
    }, [vista, areaSel, pastaSel, entidadeSel, filtroTexto]);

    useEffect(() => { fetchResumo(); fetchTiposEPastas(); }, [fetchResumo, fetchTiposEPastas]);
    useEffect(() => { const t = setInterval(fetchResumo, 60000); return () => clearInterval(t); }, [fetchResumo]);
    useEffect(() => { fetchResumo(); if (VISTAS_LISTA.includes(vista)) { setLoading(true); setDocs([]); fetchDocs(); } }, [vista, areaSel, pastaSel, entidadeSel, fetchDocs, fetchResumo]);
    // Chegámos aqui vindos de outro módulo (ficha de cliente, email, notificação)?
    useEffect(() => {
        const alvo = consumirAlvo('documentos');
        if (!alvo) return;
        if (alvo.doc) abrirPorId(alvo.doc);
        else if (alvo.entidade_tipo && alvo.entidade_id) { setEntidadeSel({ tipo: alvo.entidade_tipo, id: alvo.entidade_id, nome: alvo.entidade_nome || '' }); setVista('entidade'); }
        else if (alvo.vista) setVista(alvo.vista as Vista);
    }, [abrirPorId]);
    useEffect(() => {
        if (!resumo || (resumo.aProcessar || 0) === 0) return;
        const t = setInterval(() => { fetchResumo(); fetchDocs(); }, 6000);
        return () => clearInterval(t);
    }, [resumo?.aProcessar, fetchResumo, fetchDocs]);

    const tudoMudou = () => { fetchResumo(); fetchDocs(); fetchTiposEPastas(); };

    const enviarFicheiros = async (ficheiros: File[]) => {
        if (ficheiros.length === 0) return;
        setAvisoUpload(''); setAEnviar({ total: ficheiros.length, feitos: 0 });
        const duplicados: string[] = [], erros: string[] = [];
        for (let i = 0; i < ficheiros.length; i += 10) {
            const lote = ficheiros.slice(i, i + 10);
            const form = new FormData(); lote.forEach(f => form.append('files', f));
            if (vista === 'pasta' && pastaSel) form.append('pasta_id', String(pastaSel.id));
            try {
                const res = await authFetch(`${API}/api/documentos/upload`, { method: 'POST', body: form }); const data = await res.json();
                if (!res.ok || !data.success) erros.push(`${lote.length} ficheiro(s): ${data.error || 'falha'}`);
                else for (const r of data.resultados) { if (r.duplicado) duplicados.push(r.nome); if (r.erro) erros.push(`${r.nome}: ${r.erro}`); }
            } catch { erros.push(`${lote.length} ficheiro(s): erro de comunicação`); }
            setAEnviar({ total: ficheiros.length, feitos: Math.min(ficheiros.length, i + 10) });
        }
        setAEnviar(null);
        const partes = [];
        if (duplicados.length) partes.push(`${duplicados.length} já existia${duplicados.length === 1 ? '' : 'm'} no arquivo (ignorado${duplicados.length === 1 ? '' : 's'})`);
        if (erros.length) partes.push(erros.join(' · '));
        setAvisoUpload(partes.join(' · '));
        // O documento entra sempre pela caixa "Por rever": leva o utilizador para lá para o ver a ser lido e confirmar.
        if (['todos', 'area', 'entidade'].includes(vista)) setVista('por_rever');
        fetchResumo(); fetchDocs();
    };
    const onDrop = (e: React.DragEvent) => { e.preventDefault(); setArrastar(false); enviarFicheiros(Array.from(e.dataTransfer.files)); };

    // Criar pasta/subpasta a partir da vista da pasta (o mesmo que o "+" da árvore).
    const criarSubpasta = async (mae: any | null) => {
        const nome = window.prompt(mae ? `Nome da nova subpasta dentro de "${mae.nome}":` : 'Nome da nova pasta:'); if (!nome?.trim()) return;
        const res = await authFetch(`${API}/api/documentos/pastas`, { method: 'POST', body: JSON.stringify({ nome: nome.trim(), parent_id: mae ? mae.id : null }) }); const d = await res.json();
        if (!res.ok || !d.success) { alert('Erro: ' + (d.error || 'não foi possível criar.')); return; }
        await fetchTiposEPastas();
    };

    const atualizarDoc = async (id: string, alteracoes: Partial<Doc>) => {
        const res = await authFetch(`${API}/api/documentos/${id}`, { method: 'PUT', body: JSON.stringify(alteracoes) }); const data = await res.json();
        if (!res.ok || !data.success) { alert('Erro: ' + (data.error || 'não foi possível guardar.')); return false; }
        fetchResumo(); fetchDocs(); return true;
    };

    if (erroModulo) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COR.canvas }}>
                <div style={{ maxWidth: '460px', textAlign: 'center', color: COR.muted, fontSize: '14px', lineHeight: 1.6 }}>
                    <FolderOpen size={48} color={COR.border} style={{ marginBottom: '14px' }} />
                    <div style={{ fontWeight: 700, color: COR.ink, fontSize: '17px', marginBottom: '8px' }}>Documentos</div>{erroModulo}
                </div>
            </div>
        );
    }

    const navItem = (ativo: boolean, onClick: () => void, icone: any, texto: string, badge?: number, badgeCor?: string, chave?: string) => (
        <div key={chave} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '6px 10px', borderRadius: '2px', cursor: 'pointer', fontSize: '12.5px', fontWeight: ativo ? 700 : 500, color: ativo ? COR.accent : COR.ink, background: ativo ? '#E1EEF0' : 'transparent' }}>
            {icone}<span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{texto}</span>
            {badge !== undefined && badge > 0 && <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'white', background: badgeCor || COR.muted, padding: '1px 7px', borderRadius: '9px' }}>{badge}</span>}
        </div>
    );

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', background: COR.canvas, minHeight: 0 }}
            onDragOver={e => { e.preventDefault(); if (!arrastar) setArrastar(true); }} onDragLeave={() => setArrastar(false)} onDrop={onDrop}>

            {/* ---------- NAV ---------- */}
            <div style={{ width: '250px', minWidth: '250px', background: 'white', borderRight: `1px solid ${COR.border}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ padding: '0 10px', borderBottom: `1px solid ${COR.border}`, display: 'flex', alignItems: 'center', gap: '8px', height: '52px', boxSizing: 'border-box' }}>
                    {onVoltar && (
                        <button onClick={onVoltar} title="Voltar ao menu principal"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 10px', borderRadius: '2px', border: `1px solid ${COR.border}`, background: 'white', color: COR.ink, fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>
                            <ArrowLeft size={14} /> Voltar
                        </button>
                    )}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: COR.ink, fontSize: '14px', marginLeft: 'auto' }}><FolderOpen size={17} color={COR.accent} /> Documentos</span>
                    <Notificacoes naoLidas={resumo?.notificacoesNaoLidas || 0} onAbrirDoc={abrirPorId} onLidas={fetchResumo} />
                </div>
                <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '1px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
                    {navItem(vista === 'painel', () => setVista('painel'), <LayoutDashboard size={15} />, 'Painel')}
                    {navItem(vista === 'todos', () => { setVista('todos'); setAreaSel(null); }, <FolderOpen size={15} />, 'Todos os documentos')}
                    {navItem(vista === 'pesquisa', () => setVista('pesquisa'), <Sparkles size={15} />, 'Perguntar ao arquivo')}
                    {navItem(vista === 'aprovacoes', () => setVista('aprovacoes'), <CheckSquare size={15} />, 'As minhas aprovações', resumo?.tarefasPendentes, COR.accent)}
                    {navItem(vista === 'por_rever', () => setVista('por_rever'), <Inbox size={15} />, 'Por rever', resumo?.porRever, COR.warn)}
                    {navItem(vista === 'conformidade', () => setVista('conformidade'), <ShieldAlert size={15} />, 'Conformidade', (resumo?.vencidos || 0) + (resumo?.aVencer || 0), resumo?.vencidos > 0 ? COR.bad : COR.warn)}
                    {navItem(vista === 'checklists', () => setVista('checklists'), <ClipboardCheck size={15} />, 'Checklists')}
                    {navItem(vista === 'ativos', () => setVista('ativos'), <Wrench size={15} />, 'Ativos')}

                    <div style={{ ...label, margin: '10px 10px 4px' }}>Os meus</div>
                    {navItem(vista === 'favoritos', () => setVista('favoritos'), <Star size={15} />, 'Favoritos')}
                    {navItem(vista === 'recentes', () => setVista('recentes'), <History size={15} />, 'Recentes')}

                    <div style={{ ...label, margin: '10px 10px 4px' }}>Arquivo</div>
                    {navItem(vista === 'fisico', () => setVista('fisico'), <MapPin size={15} />, 'Arquivo físico')}
                    {navItem(vista === 'retencao', () => setVista('retencao'), <Archive size={15} />, 'Em retenção', resumo?.emRetencao, COR.warn)}

                    <div style={{ ...label, margin: '10px 10px 4px' }}>Áreas</div>
                    {AREAS.filter(a => !resumo?.areasPermitidas || resumo.areasPermitidas.includes(a)).map(a => {
                        const n = resumo?.areas?.find((x: any) => x.nome === a)?.total || 0;
                        return navItem(vista === 'area' && areaSel === a, () => { setVista('area'); setAreaSel(a); }, <ChevronRight size={13} color={COR.faint} />, a, n, COR.faint, a);
                    })}

                    <ArvorePastas pastas={pastas} ativa={vista === 'pasta' ? pastaSel : undefined} onEscolher={p => { setVista('pasta'); setPastaSel(p); }} onMudou={fetchTiposEPastas} />
                </div>
                {ehAdmin && (
                    <div style={{ padding: '10px', borderTop: `1px solid ${COR.borderSoft}` }}>
                        {navItem(vista === 'auditoria', () => setVista('auditoria'), <ScrollText size={15} />, 'Auditoria')}
                        {navItem(vista === 'definicoes', () => setVista('definicoes'), <Settings size={15} />, 'Definições')}
                    </div>
                )}
            </div>

            {/* ---------- CONTEÚDO ---------- */}
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {arrastar && (
                    <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(14,90,107,0.08)', border: `3px dashed ${COR.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, color: COR.accent, pointerEvents: 'none' }}>
                        Largue os ficheiros para arquivar{vista === 'pasta' && pastaSel ? ` em "${pastaSel.nome}"` : ''}
                    </div>
                )}
                {(resumo?.aProcessar > 0 || aEnviar) && (
                    <div style={{ margin: '12px 20px 0', padding: '10px 14px', background: '#E1EEF0', border: `1px solid ${COR.accent}`, borderRadius: '2px', fontSize: '12.5px', color: COR.accent, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        {aEnviar ? `A enviar ${aEnviar.feitos}/${aEnviar.total} ficheiros...` : `${resumo.aProcessar} documento${resumo.aProcessar === 1 ? '' : 's'} a ser${resumo.aProcessar === 1 ? '' : 'em'} lido${resumo.aProcessar === 1 ? '' : 's'} pela IA — o arquivo atualiza-se sozinho.`}
                    </div>
                )}
                {avisoUpload && (
                    <div style={{ margin: '12px 20px 0', padding: '10px 14px', background: '#FCEFDD', border: '1px solid #DF6E0C', borderRadius: '2px', fontSize: '12.5px', color: '#92400e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{avisoUpload}</span><X size={14} style={{ cursor: 'pointer' }} onClick={() => setAvisoUpload('')} />
                    </div>
                )}

                {vista === 'painel' && <Painel irPara={v => setVista(v as Vista)} />}
                {VISTAS_LISTA.includes(vista) && (
                    <ListaDocs vista={vista} areaSel={areaSel} pastaSel={pastaSel} entidadeSel={entidadeSel} pastas={pastas} docs={docs} loading={loading} filtroTexto={filtroTexto} setFiltroTexto={setFiltroTexto}
                        onAbrir={setDocAberto} onUpload={() => fileRef.current?.click()} onAtualizar={atualizarDoc} comErro={resumo?.comErro || 0}
                        onAbrirPasta={(p: any) => { setVista('pasta'); setPastaSel(p); }} onNovaSubpasta={() => criarSubpasta(pastaSel)} />
                )}
                {vista === 'pesquisa' && <Pesquisa onAbrir={setDocAberto} />}
                {vista === 'conformidade' && <Conformidade onAbrir={setDocAberto} />}
                {vista === 'ativos' && <Ativos onAbrirDoc={setDocAberto} />}
                {vista === 'aprovacoes' && <Aprovacoes onAbrir={setDocAberto} onMudou={tudoMudou} />}
                {vista === 'checklists' && <Checklists tipos={tipos} ehAdmin={ehAdmin} onAbrirDoc={abrirPorId} />}
                {vista === 'auditoria' && ehAdmin && <Auditoria />}
                {vista === 'definicoes' && ehAdmin && <Definicoes tipos={tipos} />}

                <input ref={fileRef} type="file" multiple style={{ display: 'none' }} accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff,.txt,.md,.csv,.xlsx,.xls,.docx"
                    onChange={e => { enviarFicheiros(Array.from(e.target.files || [])); e.target.value = ''; }} />
            </div>

            {docAberto && <DocumentoDetalhe key={docAberto.id} doc={docAberto} tipos={tipos} pastas={pastas} onFechar={() => setDocAberto(null)} onMudou={tudoMudou} />}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// ============================================================
// ÁRVORE DE PASTAS
// ============================================================
function ArvorePastas({ pastas, ativa, onEscolher, onMudou }: { pastas: any[]; ativa: any; onEscolher: (p: any | null) => void; onMudou: () => void }) {
    const [abertas, setAbertas] = useState<Set<number>>(new Set());
    const [aCriarEm, setACriarEm] = useState<number | null | 'raiz'>(null);
    const [nome, setNome] = useState('');

    // A pasta ativa e as suas mães ficam sempre abertas.
    useEffect(() => {
        if (!ativa?.id) return;
        const porId = new Map(pastas.map(p => [p.id, p]));
        setAbertas(s => { const n = new Set(s); let p = porId.get(ativa.id); while (p) { n.add(p.id); p = p.parent_id ? porId.get(p.parent_id) : undefined; } return n; });
    }, [ativa?.id, pastas]);

    const filhos = (parentId: number | null) => pastas.filter(p => (p.parent_id || null) === parentId).sort((a, b) => a.nome.localeCompare(b.nome));
    const alternar = (id: number) => setAbertas(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const criar = async () => {
        if (!nome.trim()) { setACriarEm(null); return; }
        const res = await authFetch(`${API}/api/documentos/pastas`, { method: 'POST', body: JSON.stringify({ nome: nome.trim(), parent_id: aCriarEm === 'raiz' ? null : aCriarEm }) });
        const d = await res.json();
        if (!res.ok || !d.success) { alert('Erro: ' + (d.error || 'não foi possível criar.')); return; }
        if (aCriarEm !== 'raiz' && aCriarEm !== null) setAbertas(s => new Set(s).add(aCriarEm));
        setNome(''); setACriarEm(null); onMudou();
    };
    const renomear = async (p: any) => {
        const novo = window.prompt('Novo nome da pasta:', p.nome); if (!novo || novo.trim() === p.nome) return;
        const res = await authFetch(`${API}/api/documentos/pastas/${p.id}`, { method: 'PUT', body: JSON.stringify({ nome: novo.trim() }) }); const d = await res.json();
        if (!res.ok || !d.success) { alert('Erro: ' + (d.error || 'não foi possível renomear.')); return; }
        onMudou();
    };
    const apagar = async (p: any) => {
        if (!window.confirm(`Apagar a pasta "${p.nome}"? Os documentos e subpastas sobem para a pasta-mãe; nada se perde.`)) return;
        const res = await authFetch(`${API}/api/documentos/pastas/${p.id}`, { method: 'DELETE' }); const d = await res.json();
        if (!res.ok || !d.success) { alert('Erro: ' + (d.error || 'não foi possível apagar.')); return; }
        if (ativa?.id === p.id) onEscolher(null);
        onMudou();
    };

    const renderNo = (p: any, nivel: number): any => {
        const sub = filhos(p.id); const aberta = abertas.has(p.id); const ehAtiva = ativa?.id === p.id;
        return (
            <div key={p.id}>
                <div className="pasta-linha" title={`${p.nome} — clique no + para criar uma subpasta`} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 8px 5px ' + (8 + nivel * 14) + 'px', borderRadius: '2px', cursor: 'pointer', fontSize: '12.5px', fontWeight: ehAtiva ? 700 : 500, color: ehAtiva ? COR.accent : COR.ink, background: ehAtiva ? '#E1EEF0' : 'transparent' }}>
                    <span onClick={() => alternar(p.id)} style={{ width: '14px', display: 'inline-flex', color: COR.faint }}>
                        {sub.length > 0 ? (aberta ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
                    </span>
                    <Folder size={13} color={ehAtiva ? COR.accent : COR.faint} onClick={() => onEscolher(p)} />
                    <span onClick={() => onEscolher(p)} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
                    {p.documentos > 0 && <span style={{ fontSize: '10.5px', color: COR.faint }}>{p.documentos}</span>}
                    <span className="pasta-acoes" style={{ display: 'inline-flex', gap: '3px' }}>
                        <FolderPlus size={13} color={COR.accent} onClick={e => { e.stopPropagation(); setACriarEm(p.id); setNome(''); setAbertas(s => new Set(s).add(p.id)); }} />
                        <Pencil size={12} color={COR.faint} onClick={e => { e.stopPropagation(); renomear(p); }} />
                        <Trash2 size={12} color={COR.faint} onClick={e => { e.stopPropagation(); apagar(p); }} />
                    </span>
                </div>
                {aCriarEm === p.id && <FormNova nivel={nivel + 1} nome={nome} setNome={setNome} onOk={criar} onCancelar={() => setACriarEm(null)} />}
                {aberta && sub.map(s2 => renderNo(s2, nivel + 1))}
            </div>
        );
    };

    return (
        <div>
            <div style={{ ...label, margin: '14px 12px 6px', display: 'flex', alignItems: 'center' }}>
                <span style={{ flex: 1 }}>Pastas</span>
                <span title="Nova pasta" onClick={() => { setACriarEm('raiz'); setNome(''); }} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px', color: COR.accent, textTransform: 'none', letterSpacing: 0, fontSize: '11px' }}><FolderPlus size={13} /> Nova</span>
            </div>
            <div onClick={() => onEscolher(null)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', borderRadius: '2px', cursor: 'pointer', fontSize: '12.5px', fontWeight: ativa === null ? 700 : 500, color: ativa === null ? COR.accent : COR.ink, background: ativa === null ? '#E1EEF0' : 'transparent' }}>
                <Folder size={13} color={COR.faint} /> Sem pasta
            </div>
            {aCriarEm === 'raiz' && <FormNova nivel={0} nome={nome} setNome={setNome} onOk={criar} onCancelar={() => setACriarEm(null)} />}
            {filhos(null).map(p => renderNo(p, 0))}
            {pastas.length === 0 && aCriarEm !== 'raiz' && <div style={{ fontSize: '11.5px', color: COR.faint, padding: '2px 8px 6px' }}>Crie pastas e subpastas (ex.: RH → Contratos → 2026). O "+" ao lado de cada pasta cria uma subpasta.</div>}
            <style>{`.pasta-linha .pasta-acoes { opacity: 0.35; } .pasta-linha:hover .pasta-acoes { opacity: 1; } .pasta-acoes svg { cursor: pointer; }`}</style>
        </div>
    );
}
function FormNova({ nivel, nome, setNome, onOk, onCancelar }: any) {
    return (
        <div style={{ display: 'flex', gap: '4px', padding: '4px 8px 4px ' + (8 + nivel * 14) + 'px' }}>
            <input autoFocus value={nome} onChange={e => setNome(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onCancelar(); }} placeholder="Nome da pasta" style={{ ...input, padding: '5px 8px', fontSize: '12px' }} />
            <button style={{ ...btn(true), padding: '4px 8px' }} onClick={onOk}><Check size={12} /></button>
        </div>
    );
}

// ============================================================
// LISTA
// ============================================================
function ListaDocs({ vista, areaSel, pastaSel, entidadeSel, pastas, docs, loading, filtroTexto, setFiltroTexto, onAbrir, onUpload, onAtualizar, comErro, onAbrirPasta, onNovaSubpasta }: any) {
    const titulo = vista === 'por_rever' ? 'Por rever' : vista === 'area' ? areaSel : vista === 'pasta' ? (pastaSel ? pastaSel.caminho || pastaSel.nome : 'Sem pasta') : vista === 'entidade' ? `Documentos de ${entidadeSel?.nome || 'registo'}`
        : vista === 'favoritos' ? 'Favoritos' : vista === 'recentes' ? 'Consultados recentemente' : vista === 'retencao' ? 'Em retenção' : vista === 'fisico' ? 'Arquivo físico' : 'Todos os documentos';
    const [rascunho, setRascunho] = useState(filtroTexto);
    useEffect(() => { const t = setTimeout(() => setFiltroTexto(rascunho), 350); return () => clearTimeout(t); }, [rascunho, setFiltroTexto]);
    const subpastas = vista === 'pasta' ? pastas.filter((p: any) => (p.parent_id || null) === (pastaSel?.id || null)) : [];

    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: COR.ink, flex: 1, minWidth: '160px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {vista === 'pasta' && <Folder size={18} color={COR.accent} />}{titulo}
                </h2>
                <div style={{ position: 'relative', width: '280px' }}>
                    <Search size={14} color={COR.faint} style={{ position: 'absolute', left: '10px', top: '11px' }} />
                    <input value={rascunho} onChange={e => setRascunho(e.target.value)} placeholder="Título, código, entidade..." style={{ ...input, paddingLeft: '32px' }} />
                </div>
                <button onClick={onUpload} style={btn(true)}><Upload size={14} /> Carregar{vista === 'pasta' && pastaSel ? ' aqui' : ''}</button>
            </div>

            {vista === 'por_rever' && <p style={{ margin: '0 20px 12px', fontSize: '12.5px', color: COR.muted, lineHeight: 1.5 }}>Caixa de entrada do arquivo: tudo o que chega passa por aqui. A IA lê o documento e propõe tipo, área, entidade e dados; confirme com "Arquivar assim", corrija, ou descarte. Só depois de confirmado é que o documento fica em vigor na sua área.</p>}
            {comErro > 0 && vista === 'todos' && <p style={{ margin: '0 20px 12px', fontSize: '12.5px', color: COR.bad }}>{comErro} documento(s) falharam a leitura — abra-os para tentar de novo.</p>}
            {vista === 'retencao' && <p style={{ margin: '0 20px 12px', fontSize: '12.5px', color: COR.muted, lineHeight: 1.5 }}>Documentos cujo prazo de guarda (política do tipo) venceu. Abra cada um e decida: manter em arquivo por mais um período, ou eliminar.</p>}
            {vista === 'fisico' && <p style={{ margin: '0 20px 12px', fontSize: '12.5px', color: COR.muted, lineHeight: 1.5 }}>Documentos com localização no arquivo em papel. Em cada documento pode imprimir a etiqueta com QR — ao ler o código, o documento abre aqui.</p>}

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px 20px' }}>
                {vista === 'pasta' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
                        {subpastas.map((p: any) => <button key={p.id} onClick={() => onAbrirPasta(p)} style={{ fontSize: '12px', color: COR.ink, background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}><Folder size={12} color={COR.accent} /> {p.nome} <span style={{ color: COR.faint }}>{p.documentos}</span></button>)}
                        <button onClick={onNovaSubpasta} style={{ fontSize: '12px', color: COR.accent, background: 'transparent', border: `1px dashed ${COR.accent}`, borderRadius: '2px', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}><FolderPlus size={12} /> Nova subpasta{pastaSel ? ` em "${pastaSel.nome}"` : ''}</button>
                    </div>
                )}
                {loading && <div style={{ color: COR.muted, fontSize: '13px', padding: '20px 0' }}>A carregar...</div>}
                {!loading && docs.length === 0 && (
                    <div style={{ border: `2px dashed ${COR.border}`, borderRadius: '2px', padding: '48px 20px', textAlign: 'center', color: COR.muted, fontSize: '13.5px', lineHeight: 1.6, cursor: 'pointer' }} onClick={onUpload}>
                        <Upload size={32} color={COR.border} style={{ marginBottom: '10px' }} />
                        <div style={{ fontWeight: 700, color: COR.ink }}>{vista === 'por_rever' ? 'Caixa de entrada vazia — nada por rever.' : 'Ainda não há documentos aqui.'}</div>
                        {vista !== 'por_rever' && <div>Arraste ficheiros para esta janela ou clique para carregar. A IA lê, classifica e arruma por si.</div>}
                    </div>
                )}
                {/* Enquanto carrega não se mostram os cartões da vista anterior — apareciam e desapareciam. */}
                {!loading && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '10px' }}>
                    {docs.map((d: Doc) => <CartaoDoc key={d.id} doc={d} porRever={vista === 'por_rever'} onAbrir={() => onAbrir(d)} onAtualizar={onAtualizar} />)}
                </div>}
            </div>
        </div>
    );
}

function CartaoDoc({ doc, porRever, onAbrir, onAtualizar }: { doc: Doc; porRever: boolean; onAbrir: () => void; onAtualizar: (id: string, a: any) => Promise<boolean> }) {
    const emErro = doc.estado === 'erro'; const aProcessar = doc.estado === 'a_processar';
    return (
        <div onClick={onAbrir} style={{ background: 'white', border: `1px solid ${emErro ? '#fecaca' : COR.border}`, borderRadius: '2px', padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px', opacity: aProcessar ? 0.7 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ marginTop: '1px' }}><IconeDoc doc={doc} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: COR.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.titulo}</div>
                    <div style={{ fontSize: '11.5px', color: COR.faint, display: 'flex', gap: '6px', alignItems: 'center', marginTop: '3px', flexWrap: 'wrap' }}>
                        {doc.codigo && <span style={{ fontFamily: 'monospace', color: COR.accent, fontWeight: 700 }}>{doc.codigo}</span>}
                        <span>{doc.tipo || '—'}</span><span>·</span><span>{doc.area}</span>
                        <IconeConfidencialidade nivel={doc.confidencialidade} />
                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>{!aProcessar && !porRever && <BadgeCiclo ciclo={doc.ciclo} />}<IconeOrigem origem={doc.origem} /></span>
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
            {porRever && emErro && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '4px', paddingTop: '8px', borderTop: `1px solid ${COR.borderSoft}` }} onClick={e => e.stopPropagation()}>
                    <button style={{ ...btn(true), padding: '5px 10px', marginLeft: 'auto' }} onClick={async () => { await authFetch(`${API}/api/documentos/${doc.id}/reprocessar`, { method: 'POST' }); onAtualizar(doc.id, {}); }}><RefreshCw size={12} /> Tentar ler de novo</button>
                    <button style={{ ...btn(false, true), padding: '5px 8px' }} onClick={() => onAtualizar(doc.id, { estado: 'descartado' })} title="Descartar"><Trash2 size={12} /></button>
                </div>
            )}
            {porRever && doc.estado === 'por_rever' && (
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
// PESQUISA
// ============================================================
function Pesquisa({ onAbrir }: { onAbrir: (d: Doc) => void }) {
    const [pergunta, setPergunta] = useState(''); const [aPesquisar, setAPesquisar] = useState(false);
    const [resultado, setResultado] = useState<{ resposta: string | null; documentos: any[] } | null>(null); const [erro, setErro] = useState('');
    const pesquisar = async () => {
        if (!pergunta.trim()) return;
        setAPesquisar(true); setErro(''); setResultado(null);
        try { const res = await authFetch(`${API}/api/documentos/pesquisar`, { method: 'POST', body: JSON.stringify({ pergunta }) }); const data = await res.json(); if (!res.ok || !data.success) setErro(data.error || 'Falha na pesquisa.'); else setResultado(data); }
        catch { setErro('Erro de comunicação.'); }
        setAPesquisar(false);
    };
    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px' }}>
            <div style={{ maxWidth: '760px' }}>
                <h2 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 700, color: COR.ink }}>Perguntar ao arquivo</h2>
                <p style={{ margin: '0 0 16px', fontSize: '13px', color: COR.muted, lineHeight: 1.5 }}>Pergunte como perguntaria a uma pessoa. A resposta vem só dos documentos que pode ver, com a indicação de onde saiu.</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input value={pergunta} onChange={e => setPergunta(e.target.value)} onKeyDown={e => e.key === 'Enter' && pesquisar()} placeholder='Ex: "quando caduca o alvará?", "última fatura da Unitel", "que contratos temos com a Sonangol"' style={{ ...input, padding: '11px 13px', fontSize: '14px' }} />
                    <button onClick={pesquisar} disabled={aPesquisar} style={{ ...btn(true), padding: '0 18px', flexShrink: 0 }}>{aPesquisar ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={15} />} Perguntar</button>
                </div>
                {erro && <p style={{ color: COR.bad, fontSize: '13px' }}>{erro}</p>}
                {resultado && (
                    <div style={{ marginTop: '20px' }}>
                        {resultado.documentos.length === 0 ? (
                            <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '16px', fontSize: '13.5px', color: COR.muted }}>Não encontrei nada no arquivo sobre isso. Se o documento existe, pode ainda não ter sido carregado — ou estar numa área ou nível de confidencialidade a que não tem acesso.</div>
                        ) : (
                            <>
                                {resultado.resposta && <div style={{ background: '#E1EEF0', border: `1px solid ${COR.accent}`, borderRadius: '2px', padding: '14px 16px', fontSize: '14px', color: COR.ink, lineHeight: 1.6, display: 'flex', gap: '10px' }}><Sparkles size={16} color={COR.accent} style={{ flexShrink: 0, marginTop: '3px' }} /><div>{resultado.resposta}</div></div>}
                                <div style={{ ...label, margin: '18px 0 8px' }}>Documentos encontrados</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {resultado.documentos.map((d: any) => (
                                        <div key={d.id} onClick={() => onAbrir(d)} style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '12px 14px', cursor: 'pointer' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={15} color={COR.muted} />{d.codigo && <span style={{ fontFamily: 'monospace', fontSize: '12px', color: COR.accent, fontWeight: 700 }}>{d.codigo}</span>}<span style={{ fontWeight: 700, fontSize: '13.5px', color: COR.ink, flex: 1 }}>{d.titulo}</span><span style={{ fontSize: '11px', color: COR.faint }}>{Math.round(d.relevancia * 100)}% relevante</span></div>
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
            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${COR.borderSoft}`, display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13.5px', color: COR.ink }}><Icone size={16} color={cor} /> {titulo} <span style={{ marginLeft: 'auto', fontSize: '20px', color: cor }}>{itens.length}</span></div>
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                {itens.length === 0 && <div style={{ padding: '18px 14px', fontSize: '12.5px', color: COR.faint }}>{vazio}</div>}
                {itens.map((d: any) => (
                    <div key={d.id} onClick={() => onAbrir(d)} style={{ padding: '10px 14px', borderBottom: `1px solid ${COR.borderSoft}`, cursor: 'pointer' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: COR.ink }}>{d.codigo && <span style={{ fontFamily: 'monospace', color: COR.accent, marginRight: '6px' }}>{d.codigo}</span>}{d.titulo}</div>
                        <div style={{ fontSize: '11.5px', color: COR.faint, marginTop: '2px' }}>{d.area}{d.entidade_nome ? ` · ${d.entidade_nome}` : ''}</div>
                        <div style={{ fontSize: '12px', color: cor, fontWeight: 700, marginTop: '4px' }}>{d.dias < 0 ? `Caducou há ${-d.dias} dia${-d.dias === 1 ? '' : 's'}` : d.dias === 0 ? 'Caduca hoje' : `Caduca em ${d.dias} dia${d.dias === 1 ? '' : 's'}`} · {fmtData(d.validade)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '20px' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 700, color: COR.ink }}>Conformidade</h2>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: COR.muted }}>Tudo o que tem prazo — licenças, alvarás, certificados, contratos, apólices, identificação. A validade é lida pela IA; corrija-a no documento se estiver errada. O que caduca passa sozinho para "Caducado".</p>
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
    const [ativos, setAtivos] = useState<any[]>([]); const [form, setForm] = useState<any>(null); const [sel, setSel] = useState<any>(null); const [docsDoAtivo, setDocsDoAtivo] = useState<Doc[]>([]);
    const carregar = useCallback(async () => { const r = await authFetch(`${API}/api/documentos/ativos/lista`); const d = await r.json(); if (d.success) setAtivos(d.ativos); }, []);
    useEffect(() => { carregar(); }, [carregar]);
    useEffect(() => { if (!sel) return; (async () => { const r = await authFetch(`${API}/api/documentos?entidade_tipo=ativo&entidade_id=${sel.id}`); const d = await r.json(); if (d.success) setDocsDoAtivo(d.documentos); })(); }, [sel]);
    const guardar = async () => {
        if (!form.nome?.trim()) { alert('O nome é obrigatório.'); return; }
        const res = await authFetch(`${API}/api/documentos/ativos${form.id ? '/' + form.id : ''}`, { method: form.id ? 'PUT' : 'POST', body: JSON.stringify(form) }); const data = await res.json();
        if (!res.ok || !data.success) { alert('Erro: ' + (data.error || 'não foi possível guardar.')); return; }
        setForm(null); carregar();
    };
    const apagar = async (a: any) => {
        if (!window.confirm(`Apagar o ativo "${a.nome}"? Os documentos ficam no arquivo, só perdem a ligação.`)) return;
        const res = await authFetch(`${API}/api/documentos/ativos/${a.id}`, { method: 'DELETE' }); const data = await res.json();
        if (!res.ok || !data.success) { alert('Erro: ' + (data.error || 'não foi possível apagar.')); return; }
        if (sel?.id === a.id) setSel(null); carregar();
    };
    const campo = (k: string, l: string, tipo: 'text' | 'select' = 'text', ops?: string[]) => (
        <div><label style={label}>{l}</label>{tipo === 'select' ? <select value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} style={input}>{ops!.map(o => <option key={o}>{o}</option>)}</select> : <input value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} style={input} />}</div>
    );
    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}><h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: COR.ink, flex: 1 }}>Ativos</h2><button style={btn(true)} onClick={() => setForm({ categoria: 'Equipamento', estado: 'Ativo' })}><Plus size={14} /> Novo ativo</button></div>
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: COR.muted }}>Máquinas, viaturas, equipamento, instalações. Cada um tem o seu dossiê: manuais, manutenções, certificados, inspeções, apólices.</p>
                {form && (
                    <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '16px', marginBottom: '14px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                        {campo('nome', 'Nome')}{campo('categoria', 'Categoria', 'select', ['Equipamento', 'Máquina', 'Viatura', 'Informática', 'Instalação', 'Mobiliário', 'Outro'])}{campo('estado', 'Estado', 'select', ['Ativo', 'Em manutenção', 'Desativado'])}
                        {campo('marca', 'Marca')}{campo('modelo', 'Modelo')}{campo('numero_serie', 'Nº de série / matrícula')}{campo('localizacao', 'Localização')}
                        <div style={{ gridColumn: 'span 2' }}><label style={label}>Notas</label><input value={form.notas || ''} onChange={e => setForm({ ...form, notas: e.target.value })} style={input} /></div>
                        <div style={{ gridColumn: 'span 3', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}><button style={btn()} onClick={() => setForm(null)}>Cancelar</button><button style={btn(true)} onClick={guardar}>Guardar</button></div>
                    </div>
                )}
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead><tr style={{ background: COR.canvas }}>{['Nome', 'Categoria', 'Marca / modelo', 'Localização', 'Estado', 'Documentos', ''].map(h => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10.5px', fontWeight: 700, color: COR.faint, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                        <tbody>
                            {ativos.length === 0 && <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: COR.faint }}>Ainda não há ativos registados.</td></tr>}
                            {ativos.map(a => (
                                <tr key={a.id} onClick={() => setSel(a)} style={{ borderTop: `1px solid ${COR.borderSoft}`, cursor: 'pointer', background: sel?.id === a.id ? '#E1EEF0' : 'white' }}>
                                    <td style={{ padding: '10px 12px', fontWeight: 600, color: COR.ink }}>{a.nome}</td><td style={{ padding: '10px 12px' }}>{a.categoria}</td>
                                    <td style={{ padding: '10px 12px' }}>{[a.marca, a.modelo].filter(Boolean).join(' ') || '—'}</td><td style={{ padding: '10px 12px' }}>{a.localizacao || '—'}</td>
                                    <td style={{ padding: '10px 12px' }}><span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '2px', color: a.estado === 'Ativo' ? COR.good : a.estado === 'Desativado' ? COR.faint : COR.warn, background: a.estado === 'Ativo' ? '#DCEEE2' : a.estado === 'Desativado' ? COR.borderSoft : '#FCEFDD' }}>{a.estado}</span></td>
                                    <td style={{ padding: '10px 12px' }}>{a.docs}{a.vencidos > 0 && <span style={{ color: COR.bad, fontWeight: 700 }}> · {a.vencidos} caducado{a.vencidos === 1 ? '' : 's'}</span>}</td>
                                    <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}><button style={{ ...btn(), padding: '4px 8px', marginRight: '4px' }} onClick={() => setForm({ ...a })}>Editar</button><button style={{ ...btn(false, true), padding: '4px 8px' }} onClick={() => apagar(a)}><Trash2 size={12} /></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {sel && (
                <div style={{ width: '340px', minWidth: '340px', background: 'white', borderLeft: `1px solid ${COR.border}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div style={{ padding: '14px 16px', borderBottom: `1px solid ${COR.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}><Wrench size={16} color={COR.accent} /><span style={{ fontWeight: 700, color: COR.ink, flex: 1 }}>{sel.nome}</span><X size={16} style={{ cursor: 'pointer', color: COR.muted }} onClick={() => setSel(null)} /></div>
                    <div style={{ padding: '12px 16px', fontSize: '12.5px', color: COR.muted, borderBottom: `1px solid ${COR.borderSoft}` }}>{[sel.categoria, sel.marca, sel.modelo].filter(Boolean).join(' · ')}{sel.numero_serie ? ` · nº ${sel.numero_serie}` : ''}{sel.localizacao ? ` · ${sel.localizacao}` : ''}</div>
                    <div style={{ ...label, margin: '12px 16px 6px' }}>Dossiê ({docsDoAtivo.length})</div>
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 10px 10px' }}>
                        {docsDoAtivo.length === 0 && <div style={{ padding: '10px 6px', fontSize: '12.5px', color: COR.faint }}>Sem documentos ligados. Ao carregar um manual, certificado ou fatura deste ativo, a IA liga-o aqui — ou ligue-o à mão no documento.</div>}
                        {docsDoAtivo.map(d => (
                            <div key={d.id} onClick={() => onAbrirDoc(d)} style={{ padding: '9px 8px', borderRadius: '2px', cursor: 'pointer', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <IconeDoc doc={d} size={15} />
                                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: '13px', fontWeight: 600, color: COR.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.titulo}</div><div style={{ fontSize: '11.5px', color: COR.faint }}>{d.tipo} · {fmtData(d.data_documento || d.criado_em.slice(0, 10))}</div><BadgeValidade validade={d.validade} /></div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================
// AUDITORIA GLOBAL (admin)
// ============================================================
function Auditoria() {
    const [eventos, setEventos] = useState<any[] | null>(null); const [filtro, setFiltro] = useState('');
    useEffect(() => { (async () => { const r = await authFetch(`${API}/api/documentos/auditoria/global`); const d = await r.json(); setEventos(d.success ? d.eventos : []); })(); }, []);
    const lista = (eventos || []).filter(e => !filtro || `${e.acao} ${e.user_nome || ''} ${e.documento_titulo || ''} ${JSON.stringify(e.detalhes || {})}`.toLowerCase().includes(filtro.toLowerCase()));
    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: COR.ink, flex: 1 }}>Auditoria</h2>
                <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar por ação, utilizador, documento..." style={{ ...input, width: '320px' }} />
            </div>
            <p style={{ margin: '0 0 14px', fontSize: '13px', color: COR.muted }}>Quem fez o quê, quando e de onde. Registo imutável — nem administradores conseguem alterar ou apagar. Últimos 300 eventos.</p>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px' }}>
                {!eventos && <div style={{ padding: '16px', color: COR.muted, fontSize: '13px' }}>A carregar...</div>}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <thead><tr style={{ background: COR.canvas, position: 'sticky', top: 0 }}>{['Quando', 'Quem', 'Ação', 'Documento', 'Detalhes', 'IP'].map(h => <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: '10.5px', fontWeight: 700, color: COR.faint, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                    <tbody>
                        {lista.map(e => (
                            <tr key={e.id} style={{ borderTop: `1px solid ${COR.borderSoft}`, background: e.resultado !== 'ok' ? '#FFF7F7' : 'white' }}>
                                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: COR.muted }}>{fmtDataHora(e.criado_em)}</td>
                                <td style={{ padding: '8px 12px' }}>{e.user_nome || (e.user_id ? '—' : 'sistema')}</td>
                                <td style={{ padding: '8px 12px', fontWeight: 600, color: e.resultado === 'ok' ? COR.ink : COR.bad }}>{ROTULO_ACAO[e.acao] || e.acao}</td>
                                <td style={{ padding: '8px 12px', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.documento_titulo || '—'}</td>
                                <td style={{ padding: '8px 12px', color: COR.muted, maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{Object.entries(e.detalhes || {}).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')}</td>
                                <td style={{ padding: '8px 12px', color: COR.faint, fontFamily: 'monospace', fontSize: '11px' }}>{e.ip || ''}</td>
                            </tr>
                        ))}
                        {eventos && lista.length === 0 && <tr><td colSpan={6} style={{ padding: '20px', color: COR.faint, textAlign: 'center' }}>Sem eventos.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ============================================================
// DEFINIÇÕES (admin)
// ============================================================
function Definicoes({ tipos }: { tipos: TipoDoc[] }) {
    const [est, setEst] = useState<any>(null); const [aGuardar, setAGuardar] = useState<string | null>(null);
    const carregar = useCallback(async () => { const r = await authFetch(`${API}/api/documentos/definicoes/estado`); const d = await r.json(); if (d.success) setEst(d); }, []);
    useEffect(() => { carregar(); }, [carregar]);
    const captura = async (canal: 'email' | 'whatsapp' | 'arquivo_automatico', valor: boolean) => {
        setAGuardar(canal);
        const res = await authFetch(`${API}/api/documentos/definicoes/captura`, { method: 'PUT', body: JSON.stringify({ [canal]: valor }) }); const data = await res.json();
        if (!res.ok || !data.success) alert('Erro: ' + (data.error || 'não foi possível guardar.')); else carregar();
        setAGuardar(null);
    };
    const permissoesDe = (userId: string) => (est?.permissoes || []).filter((p: any) => p.user_id === userId).map((p: any) => p.area);
    const alternarArea = async (userId: string, area: string) => {
        const atuais = permissoesDe(userId); const novas = atuais.includes(area) ? atuais.filter((a: string) => a !== area) : [...atuais, area];
        setAGuardar(userId);
        const res = await authFetch(`${API}/api/documentos/definicoes/permissoes/${userId}`, { method: 'PUT', body: JSON.stringify({ areas: novas }) }); const data = await res.json();
        if (!res.ok || !data.success) alert('Erro: ' + (data.error || 'não foi possível guardar.')); else carregar();
        setAGuardar(null);
    };
    const limpar = async (userId: string) => { setAGuardar(userId); await authFetch(`${API}/api/documentos/definicoes/permissoes/${userId}`, { method: 'PUT', body: JSON.stringify({ areas: [] }) }); carregar(); setAGuardar(null); };
    if (!est) return <div style={{ padding: '20px', color: COR.muted, fontSize: '13px' }}>A carregar...</div>;
    const Toggle = ({ ligado, onClick, aGuardarEste }: any) => (
        <div onClick={aGuardarEste ? undefined : onClick} style={{ width: '40px', height: '20px', borderRadius: '2px', background: ligado ? COR.accent : COR.border, position: 'relative', cursor: 'pointer', flexShrink: 0, opacity: aGuardarEste ? 0.5 : 1 }}><div style={{ width: '16px', height: '16px', background: 'white', borderRadius: '50%', position: 'absolute', top: '2px', left: ligado ? '22px' : '2px', transition: 'left 0.2s' }} /></div>
    );
    const naoAdmins = est.utilizadores.filter((u: any) => !['admin', 'superadmin'].includes(u.role));
    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px' }}>
            <div style={{ maxWidth: '980px' }}>
                <h2 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 700, color: COR.ink }}>Definições dos Documentos</h2>
                <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ fontWeight: 700, color: COR.ink, marginBottom: '12px' }}>Portas de entrada automáticas</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 0', borderBottom: `1px solid ${COR.borderSoft}` }}><Mail size={18} color={COR.muted} /><div style={{ flex: 1 }}><div style={{ fontSize: '13.5px', fontWeight: 600, color: COR.ink }}>Anexos de email</div><div style={{ fontSize: '12.5px', color: COR.muted }}>Todo o anexo que chegar à caixa de entrada da empresa (Email → Definições) é lido e arquivado automaticamente. Reencaminhe um email para lá e fica feito.</div></div><Toggle ligado={est.capturaEmail} aGuardarEste={aGuardar === 'email'} onClick={() => captura('email', !est.capturaEmail)} /></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 0' }}><MessageSquare size={18} color={COR.muted} /><div style={{ flex: 1 }}><div style={{ fontSize: '13.5px', fontWeight: 600, color: COR.ink }}>Fotos e ficheiros pelo WhatsApp</div><div style={{ fontSize: '12.5px', color: COR.muted }}>Uma foto de um papel ou um PDF enviado para o WhatsApp da empresa vai para o arquivo. Desligado por omissão.</div></div><Toggle ligado={est.capturaWhatsapp} aGuardarEste={aGuardar === 'whatsapp'} onClick={() => captura('whatsapp', !est.capturaWhatsapp)} /></div>
                </div>

                <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ fontWeight: 700, color: COR.ink, marginBottom: '12px' }}>Validação humana</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 0' }}><Sparkles size={18} color={COR.muted} /><div style={{ flex: 1 }}><div style={{ fontSize: '13.5px', fontWeight: 600, color: COR.ink }}>Arquivar automaticamente quando a IA tem confiança</div><div style={{ fontSize: '12.5px', color: COR.muted }}>Desligado (recomendado): todos os documentos entram por "Por rever" e uma pessoa confirma a proposta da IA antes de ficarem em vigor. Ligado: o que a IA lê com confiança alta (≥ 70%) é arquivado sozinho; só os duvidosos ficam por rever.</div></div><Toggle ligado={!!est.arquivoAutomatico} aGuardarEste={aGuardar === 'arquivo_automatico'} onClick={() => captura('arquivo_automatico', !est.arquivoAutomatico)} /></div>
                </div>

                <DocumentosTipos />

                <DocumentosFluxos tipos={tipos} />

                <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '16px' }}>
                    <div style={{ fontWeight: 700, color: COR.ink, marginBottom: '4px' }}>Quem vê que áreas</div>
                    <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: COR.muted, lineHeight: 1.5 }}>Administradores veem tudo. Para os restantes, sem nenhuma área marcada veem todas; com áreas marcadas, veem só essas. Documentos <strong>Confidenciais</strong> e <strong>Restritos</strong> exigem ainda acesso explícito, dado no próprio documento (separador "Acesso").</p>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ borderCollapse: 'collapse', fontSize: '12.5px', minWidth: '100%' }}>
                            <thead><tr><th style={{ textAlign: 'left', padding: '8px', fontSize: '10.5px', color: COR.faint, textTransform: 'uppercase' }}>Utilizador</th>{est.areas.map((a: string) => <th key={a} style={{ padding: '8px 6px', fontSize: '10px', color: COR.faint, textTransform: 'uppercase', writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}>{a}</th>)}<th /></tr></thead>
                            <tbody>
                                {naoAdmins.map((u: any) => { const p = permissoesDe(u.id); return (
                                    <tr key={u.id} style={{ borderTop: `1px solid ${COR.borderSoft}`, opacity: aGuardar === u.id ? 0.5 : 1 }}>
                                        <td style={{ padding: '8px' }}><div style={{ fontWeight: 600, color: COR.ink }}>{u.nome}</div><div style={{ fontSize: '11px', color: COR.faint }}>{u.role}{p.length === 0 ? ' · vê todas' : ` · ${p.length} área${p.length === 1 ? '' : 's'}`}</div></td>
                                        {est.areas.map((a: string) => <td key={a} style={{ textAlign: 'center', padding: '8px 6px' }}><input type="checkbox" checked={p.includes(a)} onChange={() => alternarArea(u.id, a)} disabled={aGuardar === u.id} /></td>)}
                                        <td style={{ padding: '8px' }}>{p.length > 0 && <button style={{ ...btn(), padding: '3px 8px', fontSize: '11px' }} onClick={() => limpar(u.id)}>Ver todas</button>}</td>
                                    </tr>); })}
                                {naoAdmins.length === 0 && <tr><td colSpan={est.areas.length + 2} style={{ padding: '16px 8px', color: COR.faint }}>Só há administradores nesta empresa — todos veem tudo.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
