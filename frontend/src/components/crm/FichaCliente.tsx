import { useState, useEffect, useCallback } from 'react';
import {
  X, Check, Loader2, Phone, Mail, Building2, StickyNote,
  MessageSquare, Briefcase, Plus, AlertCircle
} from 'lucide-react';
import { irPara } from '../../lib/navegacao';

const API = import.meta.env.VITE_API_URL;
const authFetch = (url: string, options: any = {}) => {
  const token = localStorage.getItem('os_auth_token') || '';
  return fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
};

interface Etiqueta { id: string; nome: string; cor: string }

const CORES_FASE: Record<string, string> = {
  'Nova Lead': '#8B9B97', 'Em Negociação': '#B7791F', 'Proposta Enviada': '#2E5C8A',
  'Ganho': '#1F7A45', 'Perdido': '#B23A3A'
};

const dataCurta = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const kwanza = (v: any) =>
  v ? Number(v).toLocaleString('pt-PT', { maximumFractionDigits: 0 }) + ' Kz' : '';

/**
 * A ficha de um cliente, aberta a partir da lista do CRM.
 *
 * A lista mostrava quatro colunas e mais nada: para ver o que se sabia de
 * alguém, ou preencher o email que faltava, não havia por onde. Aqui corrige-se
 * tudo num sítio, incluindo as etiquetas, e salta-se para a conversa de WhatsApp.
 */
export default function FichaCliente({
  clienteId, onFechar, onGuardado
}: { clienteId: number; onFechar: () => void; onGuardado?: () => void }) {
  const [ficha, setFicha] = useState<any>(null);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [form, setForm] = useState({ nome: '', email: '', telefone: '', empresa: '', notas: '' });
  const [aCarregar, setACarregar] = useState(true);
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState('');
  const [guardado, setGuardado] = useState(false);
  const [novaAberta, setNovaAberta] = useState(false);
  const [nova, setNova] = useState('');

  const carregar = useCallback(async () => {
    setACarregar(true); setErro('');
    try {
      const [rF, rE] = await Promise.all([
        authFetch(`${API}/api/crm/clientes/${clienteId}`),
        authFetch(`${API}/api/etiquetas`)
      ]);
      const dF = await rF.json();
      const dE = await rE.json();
      if (dF.success) {
        setFicha(dF);
        setForm({
          nome: dF.cliente.nome || '',
          email: dF.cliente.email || '',
          telefone: dF.cliente.telefone || '',
          empresa: dF.cliente.empresa || '',
          notas: dF.cliente.custom_fields?.notas || ''
        });
      } else setErro(dF.error || 'Não foi possível abrir a ficha.');
      if (dE.success) setEtiquetas(dE.etiquetas || []);
    } catch {
      setErro('Não foi possível falar com o servidor.');
    }
    setACarregar(false);
  }, [clienteId]);

  useEffect(() => { carregar(); }, [carregar]);

  const guardar = async () => {
    setAGuardar(true); setErro(''); setGuardado(false);
    try {
      const r = await authFetch(`${API}/api/crm/clientes/${clienteId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
      });
      const d = await r.json();
      if (!d.success) { setErro(d.error || 'Não foi possível guardar.'); return; }
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
      onGuardado?.();
      await carregar();
    } finally {
      setAGuardar(false);
    }
  };

  const mesma = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const postas: string[] = ficha?.cliente?.tags || [];

  const alternar = async (nome: string) => {
    const ja = postas.some(t => mesma(t, nome));
    const r = await authFetch(`${API}/api/etiquetas/contacto/${clienteId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ja ? { remover: [nome] } : { adicionar: [nome] })
    });
    const d = await r.json();
    if (!d.success) { setErro(d.error || 'Não foi possível mudar a etiqueta.'); return; }
    setFicha((f: any) => ({ ...f, cliente: { ...f.cliente, tags: d.tags } }));
    onGuardado?.();
  };

  const criarEtiqueta = async () => {
    const limpo = nova.trim();
    if (!limpo) return;
    const r = await authFetch(`${API}/api/etiquetas`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: limpo })
    });
    const d = await r.json();
    if (!d.success) { setErro(d.error || 'Não foi possível criar.'); return; }
    setNova(''); setNovaAberta(false);
    const rE = await authFetch(`${API}/api/etiquetas`);
    const dE = await rE.json();
    if (dE.success) setEtiquetas(dE.etiquetas || []);
    await alternar(d.etiqueta.nome);
  };

  const campo: React.CSSProperties = {
    width: '100%', padding: '9px 11px', border: '1px solid var(--crm-border, #D5D7DA)',
    borderRadius: '2px', fontSize: '13.5px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit'
  };
  const rotulo: React.CSSProperties = { display: 'block', fontSize: '12px', color: '#5B738B', marginBottom: '5px', fontWeight: 600 };
  const seccao: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: '#8996A3', letterSpacing: '0.5px', margin: '24px 0 10px' };

  // Campos ainda por preencher — ditos à cabeça, para se saber o que falta.
  const emFalta = [
    !form.email && 'email',
    !form.empresa && 'empresa',
    !form.telefone && 'telefone'
  ].filter(Boolean) as string[];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px'
    }} onClick={onFechar}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '560px', maxHeight: '90vh', background: 'white',
          borderRadius: '2px', display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}
      >
        <div style={{
          padding: '0 10px 0 20px', height: '58px', flexShrink: 0, background: '#F5F6F7',
          borderBottom: '1px solid #D5D7DA', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px'
        }}>
          <span style={{ fontWeight: 700, color: '#1D2D3E', fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {aCarregar ? 'A carregar...' : form.nome || 'Ficha do cliente'}
          </span>
          <button onClick={onFechar} title="Fechar"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', flexShrink: 0, background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px', cursor: 'pointer', color: '#5B738B' }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', wordBreak: 'break-word' }}>
          {erro && (
            <div style={{ display: 'flex', gap: '8px', padding: '11px', background: '#F6DEDE', color: '#BB0000', borderRadius: '2px', fontSize: '13px', marginBottom: '16px' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} /> {erro}
            </div>
          )}

          {emFalta.length > 0 && !aCarregar && (
            <div style={{ padding: '11px 13px', background: '#FCEFDD', color: '#8A4B0B', borderRadius: '2px', fontSize: '12.5px', marginBottom: '18px', lineHeight: 1.55 }}>
              Falta preencher: <b>{emFalta.join(', ')}</b>. Sem email este cliente fica de fora das campanhas.
            </div>
          )}

          {!aCarregar && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={rotulo}>Nome</label>
                  <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} style={campo} />
                </div>
                <div>
                  <label style={rotulo}><Mail size={11} style={{ verticalAlign: '-1px' }} /> Email</label>
                  <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="nome@empresa.ao"
                    style={{ ...campo, borderColor: form.email ? '#D5D7DA' : '#d6a93b' }} />
                </div>
                <div>
                  <label style={rotulo}><Phone size={11} style={{ verticalAlign: '-1px' }} /> Telefone</label>
                  <input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })}
                    placeholder="244923000000" style={campo} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={rotulo}><Building2 size={11} style={{ verticalAlign: '-1px' }} /> Empresa</label>
                  <input value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })} style={campo} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={rotulo}><StickyNote size={11} style={{ verticalAlign: '-1px' }} /> Notas</label>
                  <textarea value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} rows={3}
                    placeholder="O que convém lembrar sobre este cliente"
                    style={{ ...campo, resize: 'vertical', lineHeight: 1.55 }} />
                </div>
              </div>

              <div style={seccao}>ETIQUETAS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {etiquetas.map(et => {
                  const ativa = postas.some(t => mesma(t, et.nome));
                  return (
                    <button key={et.id} onClick={() => alternar(et.nome)}
                      title={ativa ? 'Clique para tirar' : 'Clique para pôr'}
                      style={{
                        padding: '4px 11px', borderRadius: '2px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                        background: ativa ? et.cor : 'white', color: ativa ? 'white' : '#5B738B',
                        border: `1px solid ${ativa ? et.cor : '#D5D7DA'}`
                      }}>
                      {et.nome}
                    </button>
                  );
                })}
                {postas.filter(t => !etiquetas.some(e => mesma(e.nome, t))).map(t => (
                  <span key={t} style={{ padding: '4px 11px', borderRadius: '2px', fontSize: '12px', fontWeight: 600, background: '#fef3c7', color: '#8A4B0B', border: '1px dashed #d6a93b' }}>{t}</span>
                ))}
                {!novaAberta && (
                  <button onClick={() => setNovaAberta(true)}
                    style={{ padding: '4px 11px', borderRadius: '2px', fontSize: '12px', cursor: 'pointer', background: 'white', color: '#0E5A6B', border: '1px dashed #0E5A6B', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <Plus size={12} /> Nova
                  </button>
                )}
              </div>
              {novaAberta && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <input autoFocus value={nova} maxLength={40} onChange={e => setNova(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') criarEtiqueta(); if (e.key === 'Escape') { setNovaAberta(false); setNova(''); } }}
                    placeholder="nome da etiqueta" style={{ ...campo, padding: '6px 9px', fontSize: '12.5px' }} />
                  <button onClick={criarEtiqueta} disabled={!nova.trim()}
                    style={{ padding: '6px 12px', background: '#0E5A6B', color: 'white', border: 'none', borderRadius: '2px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>
                    Criar
                  </button>
                </div>
              )}

              {!!ficha?.negocios?.length && (
                <>
                  <div style={seccao}>NEGÓCIOS</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {ficha.negocios.map((n: any) => (
                      <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #E7E9EB', borderRadius: '2px', padding: '9px 12px' }}>
                        <span style={{ flex: 1, fontSize: '13px', color: '#1D2D3E', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {n.titulo || 'Negócio sem título'}
                        </span>
                        {!!n.valor && <span style={{ fontSize: '12.5px', color: '#5B738B', whiteSpace: 'nowrap' }}>{kwanza(n.valor)}</span>}
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '2px', color: 'white', background: CORES_FASE[n.fase] || '#8996A3', whiteSpace: 'nowrap' }}>
                          {n.fase}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div style={seccao}>HISTÓRICO</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px', color: '#5B738B' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <Briefcase size={13} color="#8996A3" /> Cliente desde {dataCurta(ficha?.cliente?.criado_em)}
                </div>
                {ficha?.conversa ? (
                  <button onClick={() => irPara('wa', { conversa: ficha.conversa.id })}
                    style={{ display: 'flex', alignItems: 'center', gap: '9px', background: 'none', border: 'none', color: '#0E5A6B', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                    <MessageSquare size={13} /> Abrir a conversa de WhatsApp
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                    <MessageSquare size={13} color="#8996A3" /> Ainda não há conversa de WhatsApp
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid #D5D7DA', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <button onClick={guardar} disabled={aGuardar || aCarregar}
            style={{ padding: '10px 18px', background: '#0E5A6B', color: 'white', border: 'none', borderRadius: '2px', fontWeight: 600, fontSize: '13.5px', cursor: aGuardar ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '7px' }}>
            {aGuardar ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Guardar
          </button>
          <button onClick={onFechar}
            style={{ padding: '10px 16px', background: 'white', color: '#5B738B', border: '1px solid #D5D7DA', borderRadius: '2px', fontSize: '13.5px', cursor: 'pointer' }}>
            Fechar
          </button>
          {guardado && <span style={{ fontSize: '13px', color: '#107E3E', fontWeight: 600 }}>Guardado.</span>}
        </div>
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
