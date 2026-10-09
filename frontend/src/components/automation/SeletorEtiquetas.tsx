import { useState, useEffect } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL;

interface Etiqueta { id: string; nome: string; cor: string; contactos?: number }

/**
 * Escolher etiquetas de uma lista, em vez de as escrever à mão.
 *
 * Escrever à mão era o problema de origem: um "vip" aqui e um "VIP" ali ficavam
 * como duas etiquetas diferentes, e um erro de escrita criava uma terceira sem
 * ninguém dar por isso. Aqui escolhe-se das que existem — e, quando faz falta
 * uma nova, cria-se ali mesmo sem ter de ir às Definições.
 */
export default function SeletorEtiquetas({
  valor, aoMudar, aRemover = false
}: { valor: string; aoMudar: (v: string) => void; aRemover?: boolean }) {
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [novaAberta, setNovaAberta] = useState(false);
  const [nova, setNova] = useState('');
  const [aCriar, setACriar] = useState(false);
  const [erro, setErro] = useState('');

  const escolhidas = String(valor || '').split(',').map(t => t.trim()).filter(Boolean);
  const mesma = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  const carregar = async () => {
    try {
      const token = localStorage.getItem('os_auth_token') || '';
      const r = await fetch(`${API}/api/etiquetas`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.success) setEtiquetas(d.etiquetas || []);
    } catch { /* sem lista, ainda dá para escrever à mão */ }
    setACarregar(false);
  };
  useEffect(() => { carregar(); }, []);

  const alternar = (nome: string) => {
    const ja = escolhidas.some(t => mesma(t, nome));
    const novas = ja ? escolhidas.filter(t => !mesma(t, nome)) : [...escolhidas, nome];
    aoMudar(novas.join(', '));
  };

  const criar = async () => {
    const limpo = nova.trim();
    if (!limpo || aCriar) return;
    setACriar(true); setErro('');
    try {
      const token = localStorage.getItem('os_auth_token') || '';
      const r = await fetch(`${API}/api/etiquetas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nome: limpo })
      });
      const d = await r.json();
      if (!d.success) { setErro(d.error || 'Não foi possível criar.'); return; }
      await carregar();
      if (!escolhidas.some(t => mesma(t, d.etiqueta.nome))) {
        aoMudar([...escolhidas, d.etiqueta.nome].join(', '));
      }
      setNova(''); setNovaAberta(false);
    } finally {
      setACriar(false);
    }
  };

  const rotulo = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', margin: '14px 0 6px' } as const;

  return (
    <>
      <label style={rotulo}>{aRemover ? 'Etiquetas a tirar' : 'Etiquetas a pôr'}</label>

      {aCarregar ? (
        <div style={{ fontSize: '12px', color: '#94a3b8' }}>A carregar as etiquetas...</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {etiquetas.map(et => {
            const ativa = escolhidas.some(t => mesma(t, et.nome));
            return (
              <button key={et.id} type="button" onClick={() => alternar(et.nome)}
                title={ativa ? 'Clique para tirar da lista' : 'Clique para juntar'}
                style={{
                  padding: '4px 11px', borderRadius: '2px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  background: ativa ? et.cor : 'white',
                  color: ativa ? 'white' : '#475569',
                  border: `1px solid ${ativa ? et.cor : '#cbd5e1'}`
                }}>
                {et.nome}
              </button>
            );
          })}

          {/* Etiquetas escritas antes de existir a lista — não se perdem. */}
          {escolhidas.filter(t => !etiquetas.some(e => mesma(e.nome, t))).map(t => (
            <button key={t} type="button" onClick={() => alternar(t)} title="Esta etiqueta ainda não está na lista da empresa"
              style={{ padding: '4px 11px', borderRadius: '2px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', background: '#fef3c7', color: '#8A4B0B', border: '1px dashed #d6a93b', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              {t} <X size={11} />
            </button>
          ))}

          {!novaAberta && (
            <button type="button" onClick={() => setNovaAberta(true)}
              style={{ padding: '4px 11px', borderRadius: '2px', fontSize: '12px', cursor: 'pointer', background: 'white', color: '#0E5A6B', border: '1px dashed #0E5A6B', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Plus size={12} /> Nova
            </button>
          )}
        </div>
      )}

      {novaAberta && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          <input
            autoFocus value={nova} maxLength={40} onChange={e => setNova(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); criar(); } if (e.key === 'Escape') { setNovaAberta(false); setNova(''); } }}
            placeholder="nome da etiqueta"
            style={{ flex: 1, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '2px', fontSize: '12.5px', outline: 'none' }}
          />
          <button type="button" onClick={criar} disabled={!nova.trim() || aCriar}
            style={{ padding: '6px 12px', background: '#0E5A6B', color: 'white', border: 'none', borderRadius: '2px', fontSize: '12.5px', fontWeight: 600, cursor: nova.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '5px' }}>
            {aCriar ? <Loader2 size={12} className="spin" /> : <Plus size={12} />} Criar
          </button>
          <button type="button" onClick={() => { setNovaAberta(false); setNova(''); }}
            style={{ padding: '6px 10px', background: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '2px', fontSize: '12.5px', cursor: 'pointer' }}>
            Cancelar
          </button>
        </div>
      )}

      {erro && <div style={{ fontSize: '11.5px', color: '#BB0000', marginTop: '6px' }}>{erro}</div>}

      <div style={{ marginTop: '10px', fontSize: '11px', color: '#666', lineHeight: 1.6 }}>
        {aRemover
          ? 'Tira estas etiquetas ao contacto da conversa. Serve para marcar que já saiu de um estado — por exemplo tirar "interessado" a quem comprou.'
          : 'Põe estas etiquetas no contacto da conversa. Uma etiqueta criada aqui passa a estar disponível em todo o sistema.'}
        {' '}As etiquetas geram-se em <b>Definições → Etiquetas</b>.
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </>
  );
}
