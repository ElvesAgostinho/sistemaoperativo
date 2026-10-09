import { useState, useEffect, useCallback } from 'react';
import { Tag, Plus, Trash2, Check, X, Pencil, Loader2, AlertCircle } from 'lucide-react';

const API = import.meta.env.VITE_API_URL;
const authFetch = (url: string, options: any = {}) => {
  const token = localStorage.getItem('os_auth_token') || '';
  return fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
};

export interface Etiqueta {
  id: string;
  nome: string;
  cor: string;
  descricao?: string | null;
  contactos?: number;
}

const PALETA = ['#0E5A6B', '#107E3E', '#C9992E', '#BB0000', '#6d28d9', '#0369a1', '#be123c', '#8A4B0B'];

/**
 * A lista de etiquetas da empresa.
 *
 * Antes não existia: cada sítio escrevia texto livre, e "VIP" e "vip" ficavam
 * como duas etiquetas diferentes sem ninguém dar por isso. Aqui a lista é uma
 * só, e é esta que aparece no chat, no CRM e nos blocos do Autopilot.
 */
export default function GestaoEtiquetas() {
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(PALETA[0]);
  const [aCriar, setACriar] = useState(false);
  const [aEditar, setAEditar] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState('');
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/api/etiquetas`);
      const d = await r.json();
      if (d.success) setEtiquetas(d.etiquetas || []);
      else setErro(d.error || 'Não foi possível carregar as etiquetas.');
    } catch {
      setErro('Não foi possível falar com o servidor.');
    }
    setACarregar(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || aCriar) return;
    setACriar(true); setErro('');
    try {
      const r = await authFetch(`${API}/api/etiquetas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, cor })
      });
      const d = await r.json();
      if (!d.success) { setErro(d.error || 'Não foi possível criar.'); return; }
      setNome('');
      setCor(PALETA[(etiquetas.length + 1) % PALETA.length]);
      await carregar();
    } finally {
      setACriar(false);
    }
  };

  const guardarNome = async (et: Etiqueta) => {
    const novo = nomeEditado.trim();
    setAEditar(null);
    if (!novo || novo === et.nome) return;
    const r = await authFetch(`${API}/api/etiquetas/${et.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: novo })
    });
    const d = await r.json();
    if (!d.success) setErro(d.error || 'Não foi possível mudar o nome.');
    await carregar();
  };

  const mudarCor = async (et: Etiqueta, novaCor: string) => {
    setEtiquetas(p => p.map(x => x.id === et.id ? { ...x, cor: novaCor } : x));
    await authFetch(`${API}/api/etiquetas/${et.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cor: novaCor })
    });
  };

  const apagar = async (et: Etiqueta) => {
    const quantos = et.contactos || 0;
    const aviso = quantos > 0
      ? `Apagar "${et.nome}"?\n\n${quantos} contacto(s) têm esta etiqueta — vai ser retirada de todos eles.`
      : `Apagar "${et.nome}"?`;
    if (!window.confirm(aviso)) return;
    const r = await authFetch(`${API}/api/etiquetas/${et.id}`, { method: 'DELETE' });
    const d = await r.json();
    if (!d.success) { setErro(d.error || 'Não foi possível apagar.'); return; }
    await carregar();
  };

  return (
    <div style={{ maxWidth: '760px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1D2D3E', margin: '0 0 8px' }}>Etiquetas</h1>
      <p style={{ color: '#5B738B', fontSize: '14px', margin: '0 0 28px', lineHeight: 1.7 }}>
        As etiquetas marcam em que ponto está cada contacto — <b>interessado</b>, <b>comprou</b>, <b>devedor</b>.
        São estas que aparecem no chat do WhatsApp, no CRM, nas campanhas e nos blocos do Autopilot,
        por isso vale a pena serem poucas e bem escolhidas.
      </p>

      <form onSubmit={criar} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1D2D3E', marginBottom: '6px' }}>Nova etiqueta</label>
          <input
            value={nome} onChange={e => setNome(e.target.value)} maxLength={40}
            placeholder="ex: interessado"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #D5D7DA', borderRadius: '2px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1D2D3E', marginBottom: '6px' }}>Cor</label>
          <div style={{ display: 'flex', gap: '5px' }}>
            {PALETA.map(c => (
              <button key={c} type="button" onClick={() => setCor(c)} title={c}
                style={{ width: '26px', height: '26px', borderRadius: '2px', background: c, cursor: 'pointer', border: cor === c ? '2px solid #1D2D3E' : '1px solid #D5D7DA' }} />
            ))}
          </div>
        </div>
        <button type="submit" disabled={!nome.trim() || aCriar}
          style={{ padding: '10px 16px', background: nome.trim() ? '#0E5A6B' : '#B8C2CC', color: 'white', border: 'none', borderRadius: '2px', fontWeight: 600, cursor: nome.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '7px' }}>
          {aCriar ? <Loader2 size={16} className="spin" /> : <Plus size={16} />} Criar
        </button>
      </form>

      {erro && (
        <div style={{ display: 'flex', gap: '8px', padding: '12px', background: '#F6DEDE', color: '#BB0000', borderRadius: '2px', fontSize: '13px', marginBottom: '16px' }}>
          <AlertCircle size={16} /> {erro}
        </div>
      )}

      {aCarregar ? (
        <div style={{ color: '#5B738B', fontSize: '14px' }}>A carregar...</div>
      ) : etiquetas.length === 0 ? (
        <div style={{ background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px', padding: '40px 24px', textAlign: 'center' }}>
          <Tag size={32} color="#8996A3" />
          <div style={{ fontWeight: 700, color: '#1D2D3E', margin: '10px 0 4px' }}>Ainda não há etiquetas</div>
          <div style={{ fontSize: '13.5px', color: '#5B738B' }}>Crie a primeira acima. Pode criar mais tarde a partir do chat, sem voltar aqui.</div>
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px' }}>
          {etiquetas.map((et, i) => (
            <div key={et.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderTop: i ? '1px solid #F0F1F2' : 'none' }}>
              <div style={{ display: 'flex', gap: '3px' }}>
                {PALETA.map(c => (
                  <button key={c} type="button" onClick={() => mudarCor(et, c)} title="Mudar a cor"
                    style={{ width: '14px', height: '14px', borderRadius: '2px', background: c, cursor: 'pointer', border: et.cor === c ? '2px solid #1D2D3E' : '1px solid transparent' }} />
                ))}
              </div>

              {aEditar === et.id ? (
                <form onSubmit={e => { e.preventDefault(); guardarNome(et); }} style={{ flex: 1, display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input autoFocus value={nomeEditado} maxLength={40} onChange={e => setNomeEditado(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') setAEditar(null); }}
                    style={{ flex: 1, padding: '6px 10px', border: '1px solid #0E5A6B', borderRadius: '2px', fontSize: '14px' }} />
                  <button type="submit" title="Guardar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#107E3E', display: 'flex' }}><Check size={17} /></button>
                  <button type="button" onClick={() => setAEditar(null)} title="Cancelar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8996A3', display: 'flex' }}><X size={17} /></button>
                </form>
              ) : (
                <>
                  <span style={{ padding: '4px 12px', borderRadius: '2px', background: et.cor, color: 'white', fontSize: '13px', fontWeight: 600 }}>{et.nome}</span>
                  <span style={{ flex: 1, fontSize: '12.5px', color: '#8996A3' }}>
                    {et.contactos ? `${et.contactos} contacto${et.contactos === 1 ? '' : 's'}` : 'ainda sem contactos'}
                  </span>
                  <button onClick={() => { setAEditar(et.id); setNomeEditado(et.nome); }} title="Mudar o nome"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B738B', display: 'flex' }}>
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => apagar(et)} title="Apagar"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8996A3', display: 'flex' }}>
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: '12.5px', color: '#8996A3', marginTop: '14px', lineHeight: 1.6 }}>
        Mudar o nome de uma etiqueta muda-a também em todos os contactos que a têm.
        Apagar uma etiqueta retira-a desses contactos — não fica pendurada à espera.
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
