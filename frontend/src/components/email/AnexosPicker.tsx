import { useRef, useState } from 'react';
import { Paperclip, X, Loader, FileText, Image as ImagemIcon } from 'lucide-react';

const API = import.meta.env.VITE_API_URL;

export interface Anexo {
  nome: string;
  /** Onde o ficheiro esta guardado (bucket privado). Nao e um link publico. */
  caminho: string;
  tipo?: string;
  tamanho?: number;
}

/** 25 MB é o que o Gmail e a maioria dos servidores de correio aceitam. */
const LIMITE = 25 * 1024 * 1024;

const legivel = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Anexar ficheiros a um email, como no Gmail: botão, arrastar para cima, e uma
 * lista com o tamanho de cada um e um X para tirar.
 *
 * O ficheiro é carregado assim que é escolhido (não à hora de enviar): assim a
 * pessoa vê logo se passou, e numa campanha o mesmo ficheiro não volta a subir
 * para cada destinatário.
 */
export default function AnexosPicker({ anexos, onChange }: { anexos: Anexo[]; onChange: (a: Anexo[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [aCarregar, setACarregar] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [aArrastar, setAArrastar] = useState(false);

  const carregar = async (ficheiros: FileList | File[]) => {
    setErro('');
    const lista = Array.from(ficheiros);
    for (const f of lista) {
      if (f.size > LIMITE) {
        setErro(`"${f.name}" tem ${legivel(f.size)} — o máximo que o email aceita são 25 MB.`);
        continue;
      }
      setACarregar(p => [...p, f.name]);
      try {
        const fd = new FormData();
        fd.append('file', f);
        const token = localStorage.getItem('os_auth_token') || '';
        const r = await fetch(`${API}/api/email/anexos`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
        const d = await r.json();
        if (d.success) onChange([...anexos, d.anexo]);
        else setErro(d.error || `Não foi possível anexar "${f.name}".`);
      } catch {
        setErro(`Não foi possível anexar "${f.name}".`);
      } finally {
        setACarregar(p => p.filter(n => n !== f.name));
      }
    }
    if (input.current) input.current.value = '';
  };

  const total = anexos.reduce((s, a) => s + (a.tamanho || 0), 0);

  return (
    <div
      onDragOver={e => { e.preventDefault(); if (!aArrastar) setAArrastar(true); }}
      onDragLeave={() => setAArrastar(false)}
      onDrop={e => { e.preventDefault(); setAArrastar(false); if (e.dataTransfer.files?.length) carregar(e.dataTransfer.files); }}
      style={{
        border: `1px dashed ${aArrastar ? '#0E5A6B' : '#D5D7DA'}`,
        background: aArrastar ? '#E1EEF0' : 'transparent',
        borderRadius: '2px', padding: '12px', transition: 'background 0.15s'
      }}
    >
      <input ref={input} type="file" multiple style={{ display: 'none' }} onChange={e => e.target.files && carregar(e.target.files)} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => input.current?.click()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', border: '1px solid #D5D7DA', background: 'white', borderRadius: '2px', cursor: 'pointer', fontSize: '13px', color: '#1D2D3E' }}>
          <Paperclip size={14} /> Anexar ficheiro
        </button>
        <span style={{ fontSize: '12px', color: '#8996A3' }}>
          ou arraste para aqui{total > 0 ? ` · ${legivel(total)} no total` : ''}
        </span>
      </div>

      {(anexos.length > 0 || aCarregar.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
          {anexos.map((a, i) => (
            <div key={a.caminho + i} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: '#F5F6F7', border: '1px solid #E7E9EB', borderRadius: '2px', maxWidth: '100%' }}>
              {a.tipo?.startsWith('image/') ? <ImagemIcon size={14} color="#0E5A6B" /> : <FileText size={14} color="#5B738B" />}
              <span style={{ fontSize: '12.5px', color: '#1D2D3E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>{a.nome}</span>
              {!!a.tamanho && <span style={{ fontSize: '11px', color: '#8996A3' }}>{legivel(a.tamanho)}</span>}
              <button type="button" onClick={() => onChange(anexos.filter((_, j) => j !== i))} title="Tirar este anexo"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8996A3', display: 'flex', padding: 0 }}>
                <X size={13} />
              </button>
            </div>
          ))}
          {aCarregar.map(n => (
            <div key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: '#F5F6F7', border: '1px solid #E7E9EB', borderRadius: '2px' }}>
              <Loader size={13} className="spin" color="#0E5A6B" />
              <span style={{ fontSize: '12.5px', color: '#5B738B' }}>{n}</span>
            </div>
          ))}
        </div>
      )}

      {erro && <div style={{ marginTop: '8px', fontSize: '12.5px', color: '#BB0000' }}>{erro}</div>}
    </div>
  );
}
