import { useState, useEffect } from 'react';
import { FileText, Download, Lock, ShieldCheck } from 'lucide-react';

const API = import.meta.env.VITE_API_URL;
const COR = { accent: '#0E5A6B', ink: '#1D2D3E', muted: '#5B738B', border: '#D5D7DA', canvas: '#F5F6F7', bad: '#BB0000' };

/** Página pública de um link de partilha temporária (/partilha/:token). */
export default function PartilhaDocumento() {
    const token = window.location.pathname.split('/partilha/')[1]?.split('/')[0] || '';
    const [estado, setEstado] = useState<'a_abrir' | 'senha' | 'ok' | 'erro'>('a_abrir');
    const [senha, setSenha] = useState('');
    const [erro, setErro] = useState('');
    const [dados, setDados] = useState<any>(null);

    const abrir = async (comSenha?: string) => {
        setEstado('a_abrir'); setErro('');
        try {
            const r = await fetch(`${API}/api/public/documentos/partilha/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senha: comSenha || undefined }) });
            const d = await r.json();
            if (d.success) { setDados(d); setEstado('ok'); return; }
            if (d.precisaSenha) { setEstado('senha'); if (comSenha) setErro(d.error || 'Senha incorreta.'); return; }
            setErro(d.error || 'Este link não está disponível.'); setEstado('erro');
        } catch { setErro('Não foi possível contactar o servidor.'); setEstado('erro'); }
    };
    useEffect(() => { abrir(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fmtTam = (n: number) => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
    const ehPdf = (dados?.documento?.mime_type || '').includes('pdf'); const ehImg = (dados?.documento?.mime_type || '').startsWith('image/');

    return (
        <div style={{ minHeight: '100vh', background: COR.canvas, fontFamily: 'Roboto, Arial, sans-serif', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: '#0A3B47', color: 'white', padding: '12px 20px', fontWeight: 700, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldCheck size={18} /> BusinessOS · Documento partilhado</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px' }}>
                <div style={{ width: '100%', maxWidth: '900px', background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '20px', boxSizing: 'border-box' }}>
                    {estado === 'a_abrir' && <div style={{ color: COR.muted, fontSize: '14px' }}>A abrir...</div>}
                    {estado === 'erro' && <div style={{ color: COR.bad, fontSize: '14px' }}>{erro}</div>}
                    {estado === 'senha' && (
                        <div style={{ maxWidth: '360px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: COR.ink, marginBottom: '8px' }}><Lock size={16} /> Este link está protegido por senha</div>
                            <input type="password" value={senha} onChange={e => setSenha(e.target.value)} onKeyDown={e => e.key === 'Enter' && abrir(senha)} placeholder="Senha" style={{ width: '100%', padding: '10px 12px', border: `1px solid ${COR.border}`, borderRadius: '2px', fontSize: '14px', boxSizing: 'border-box' }} />
                            {erro && <div style={{ color: COR.bad, fontSize: '12.5px', marginTop: '6px' }}>{erro}</div>}
                            <button onClick={() => abrir(senha)} style={{ marginTop: '10px', padding: '10px 16px', background: COR.accent, color: 'white', border: 'none', borderRadius: '2px', fontWeight: 600, cursor: 'pointer' }}>Abrir</button>
                        </div>
                    )}
                    {estado === 'ok' && dados && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                                <FileText size={26} color={COR.accent} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, color: COR.ink, fontSize: '17px' }}>{dados.documento.codigo ? <span style={{ fontFamily: 'monospace', color: COR.accent, marginRight: '8px' }}>{dados.documento.codigo}</span> : null}{dados.documento.titulo}</div>
                                    <div style={{ fontSize: '12.5px', color: COR.muted }}>{dados.documento.tipo || 'Documento'} · {dados.documento.nome_ficheiro} · {fmtTam(dados.documento.tamanho || 0)}</div>
                                </div>
                                <a href={dados.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 14px', background: COR.accent, color: 'white', borderRadius: '2px', textDecoration: 'none', fontWeight: 600, fontSize: '13px' }}><Download size={15} /> Descarregar</a>
                            </div>
                            <div style={{ fontSize: '11.5px', color: COR.muted, marginBottom: '10px' }}>O link de descarregamento é válido durante 5 minutos; recarregue a página para obter outro. Cada acesso fica registado.</div>
                            {ehPdf && <iframe title="documento" src={dados.url} style={{ width: '100%', height: '75vh', border: `1px solid ${COR.border}` }} />}
                            {ehImg && <img src={dados.url} alt={dados.documento.titulo} style={{ maxWidth: '100%', border: `1px solid ${COR.border}` }} />}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
