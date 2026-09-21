import { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, Upload, ExternalLink, Loader2, FolderOpen } from 'lucide-react';
import { API, authFetch, COR, ROTULO_CICLO, COR_CICLO, fmtData, btn } from './comum';
import { irPara } from '../../lib/navegacao';

/**
 * Lista os documentos do arquivo ligados a um registo de outro módulo
 * (cliente, colaborador, ativo, negócio) e permite carregar mais, já ligados.
 * Se a empresa não tiver o módulo Documentos, não mostra nada.
 */
export default function DocumentosLigados({ entidadeTipo, entidadeId, nome, compacto }: { entidadeTipo: 'cliente' | 'colaborador' | 'ativo' | 'negocio'; entidadeId: string | number; nome?: string; compacto?: boolean }) {
    const [docs, setDocs] = useState<any[] | null>(null);
    const [semModulo, setSemModulo] = useState(false);
    const [aEnviar, setAEnviar] = useState(false);
    const [aviso, setAviso] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const carregar = useCallback(async () => {
        try {
            const r = await authFetch(`${API}/api/documentos?entidade_tipo=${entidadeTipo}&entidade_id=${encodeURIComponent(String(entidadeId))}`);
            if (r.status === 403) { setSemModulo(true); return; }
            const d = await r.json(); setDocs(d.success ? d.documentos : []);
        } catch { setDocs([]); }
    }, [entidadeTipo, entidadeId]);
    useEffect(() => { carregar(); }, [carregar]);

    const enviar = async (files: File[]) => {
        if (files.length === 0) return;
        setAEnviar(true); setAviso('');
        const form = new FormData();
        files.forEach(f => form.append('files', f));
        form.append('entidade_tipo', entidadeTipo); form.append('entidade_id', String(entidadeId));
        const r = await authFetch(`${API}/api/documentos/upload`, { method: 'POST', body: form }); const d = await r.json();
        setAEnviar(false);
        if (!r.ok || !d.success) { setAviso(d.error || 'Não foi possível carregar.'); return; }
        setAviso(`${files.length} ficheiro${files.length === 1 ? '' : 's'} a ser lido${files.length === 1 ? '' : 's'} pela IA — aparece aqui em instantes.`);
        setTimeout(carregar, 6000); setTimeout(carregar, 20000);
        carregar();
    };

    if (semModulo) return null;
    return (
        <div style={{ border: `1px solid ${COR.border}`, borderRadius: '2px', background: 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: compacto ? '8px 10px' : '10px 14px', borderBottom: `1px solid ${COR.borderSoft}` }}>
                <FolderOpen size={15} color={COR.accent} />
                <span style={{ fontWeight: 700, fontSize: '13px', color: COR.ink, flex: 1 }}>Documentos{nome ? ` de ${nome}` : ''}{docs ? ` (${docs.length})` : ''}</span>
                <button style={{ ...btn(), padding: '4px 9px', fontSize: '11.5px' }} disabled={aEnviar} onClick={() => fileRef.current?.click()}>{aEnviar ? <Loader2 size={12} /> : <Upload size={12} />} Carregar</button>
                <button style={{ ...btn(), padding: '4px 9px', fontSize: '11.5px' }} onClick={() => irPara('documentos', { entidade_tipo: entidadeTipo, entidade_id: String(entidadeId), entidade_nome: nome || '' })} title="Abrir no módulo Documentos"><ExternalLink size={12} /> Arquivo</button>
                <input ref={fileRef} type="file" multiple style={{ display: 'none' }} accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff,.txt,.md,.csv,.xlsx,.xls,.docx" onChange={e => { enviar(Array.from(e.target.files || [])); e.target.value = ''; }} />
            </div>
            {aviso && <div style={{ padding: '6px 14px', fontSize: '12px', color: COR.accent, background: '#F5F9FE' }}>{aviso}</div>}
            {docs === null && <div style={{ padding: '10px 14px', fontSize: '12.5px', color: COR.muted }}>A carregar...</div>}
            {docs && docs.length === 0 && <div style={{ padding: '12px 14px', fontSize: '12.5px', color: COR.faint }}>Ainda não há documentos ligados. Carregue aqui (contrato, BI, alvará...) e a IA lê e arquiva.</div>}
            {(docs || []).slice(0, compacto ? 6 : 50).map(d => {
                const c = COR_CICLO[d.ciclo] || COR_CICLO.DRAFT;
                return (
                    <div key={d.id} onClick={() => irPara('documentos', { doc: d.id })} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: compacto ? '7px 10px' : '9px 14px', borderBottom: `1px solid ${COR.borderSoft}`, cursor: 'pointer' }}>
                        <FileText size={15} color={COR.muted} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12.5px', fontWeight: 600, color: COR.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.codigo && <span style={{ fontFamily: 'monospace', color: COR.accent, marginRight: '6px' }}>{d.codigo}</span>}{d.titulo}</div>
                            <div style={{ fontSize: '11.5px', color: COR.faint }}>{d.tipo || 'Documento'}{d.validade ? ` · válido até ${fmtData(d.validade)}` : ''}{d.estado === 'a_processar' ? ' · a ser lido pela IA' : d.estado === 'por_rever' ? ' · por rever' : ''}</div>
                        </div>
                        <span style={{ fontSize: '10.5px', fontWeight: 700, color: c.c, background: c.bg, padding: '2px 7px', borderRadius: '2px' }}>{ROTULO_CICLO[d.ciclo] || d.ciclo}</span>
                    </div>
                );
            })}
        </div>
    );
}
