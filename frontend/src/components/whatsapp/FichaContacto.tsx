import { useState, useEffect, useCallback } from 'react';
import {
  X, Mail, Phone, Building2, Tag, Plus, Check, Pencil, Loader2,
  MessageSquare, Briefcase, ExternalLink, StickyNote
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

/**
 * A ficha de quem está do outro lado da conversa.
 *
 * Quem escreve para o WhatsApp da empresa é um lead. Até agora o chat mostrava
 * um nome e um número e mais nada — não havia por onde lhe pegar sem ir ao CRM
 * e procurá-lo à mão. Aqui trabalha-se o lead sem sair da conversa: corrigir os
 * dados, pôr e tirar etiquetas, ver em que ponto está o negócio.
 */
export default function FichaContacto({
  conversaId, onFechar, onNomeMudado
}: { conversaId: string; onFechar: () => void; onNomeMudado?: (nome: string) => void }) {
  const [ficha, setFicha] = useState<any>(null);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [aEditar, setAEditar] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);
  const [form, setForm] = useState({ nome: '', email: '', empresa: '', notas: '' });
  const [novaEtiqueta, setNovaEtiqueta] = useState('');
  const [novaAberta, setNovaAberta] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setACarregar(true);
    try {
      const [rF, rE] = await Promise.all([
        authFetch(`${API}/api/whatsapp/conversations/${conversaId}/contacto`),
        authFetch(`${API}/api/etiquetas`)
      ]);
      const dF = await rF.json();
      const dE = await rE.json();
      if (dF.success) {
        setFicha(dF);
        setForm({
          nome: dF.cliente?.nome || dF.conversa?.contact_name || '',
          email: dF.cliente?.email || '',
          empresa: dF.cliente?.empresa || '',
          notas: dF.cliente?.custom_fields?.notas || ''
        });
      } else setErro(dF.error || 'Não foi possível carregar a ficha.');
      if (dE.success) setEtiquetas(dE.etiquetas || []);
    } catch {
      setErro('Não foi possível falar com o servidor.');
    }
    setACarregar(false);
  }, [conversaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const guardar = async () => {
    setAGuardar(true); setErro('');
    try {
      const r = await authFetch(`${API}/api/whatsapp/conversations/${conversaId}/contacto`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
      });
      const d = await r.json();
      if (!d.success) { setErro(d.error || 'Não foi possível guardar.'); return; }
      setAEditar(false);
      onNomeMudado?.(d.cliente?.nome || form.nome);
      await carregar();
    } finally {
      setAGuardar(false);
    }
  };

  const mesma = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const postas: string[] = ficha?.cliente?.tags || [];

  const alternarEtiqueta = async (nome: string) => {
    if (!ficha?.cliente?.id) {
      // Um lead que nunca entrou no CRM ganha ficha ao ser guardado; sem isso não
      // há onde pendurar a etiqueta.
      setErro('Guarde primeiro os dados do contacto para lhe poder pôr etiquetas.');
      setAEditar(true);
      return;
    }
    const ja = postas.some(t => mesma(t, nome));
    setFicha((f: any) => ({
      ...f,
      cliente: { ...f.cliente, tags: ja ? postas.filter(t => !mesma(t, nome)) : [...postas, nome] }
    }));
    const r = await authFetch(`${API}/api/etiquetas/contacto/${ficha.cliente.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ja ? { remover: [nome] } : { adicionar: [nome] })
    });
    const d = await r.json();
    if (!d.success) { setErro(d.error || 'Não foi possível mudar a etiqueta.'); await carregar(); return; }
    setFicha((f: any) => ({ ...f, cliente: { ...f.cliente, tags: d.tags } }));
  };

  const criarEtiqueta = async () => {
    const limpo = novaEtiqueta.trim();
    if (!limpo) return;
    const r = await authFetch(`${API}/api/etiquetas`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: limpo })
    });
    const d = await r.json();
    if (!d.success) { setErro(d.error || 'Não foi possível criar.'); return; }
    setNovaEtiqueta(''); setNovaAberta(false);
    const rE = await authFetch(`${API}/api/etiquetas`);
    const dE = await rE.json();
    if (dE.success) setEtiquetas(dE.etiquetas || []);
    await alternarEtiqueta(d.etiqueta.nome);
  };

  const campo: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid #D5D7DA', borderRadius: '2px',
    fontSize: '13.5px', outline: 'none', boxSizing: 'border-box'
  };
  const seccao: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: '#8996A3', letterSpacing: '0.5px', margin: '22px 0 10px' };

  return (
    <div style={{ width: '330px', minWidth: '330px', borderLeft: '1px solid #D5D7DA', background: 'white', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #D5D7DA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, color: '#1D2D3E', fontSize: '15px' }}>Ficha do contacto</span>
        <button onClick={onFechar} title="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B738B', display: 'flex' }}>
          <X size={18} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 16px' }}>
        {aCarregar ? (
          <div style={{ color: '#5B738B', fontSize: '13.5px' }}>A carregar...</div>
        ) : (
          <>
            {erro && (
              <div style={{ padding: '10px', background: '#F6DEDE', color: '#BB0000', borderRadius: '2px', fontSize: '12.5px', marginBottom: '14px', lineHeight: 1.5 }}>
                {erro}
              </div>
            )}

            {/* ---------- Identificação ---------- */}
            {aEditar ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#5B738B', display: 'block', marginBottom: '4px' }}>Nome</label>
                  <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} style={campo} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#5B738B', display: 'block', marginBottom: '4px' }}>Email</label>
                  <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="nome@empresa.ao" style={campo} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#5B738B', display: 'block', marginBottom: '4px' }}>Empresa</label>
                  <input value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })} style={campo} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#5B738B', display: 'block', marginBottom: '4px' }}>Notas</label>
                  <textarea value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} rows={3}
                    placeholder="O que convém lembrar sobre este cliente"
                    style={{ ...campo, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={guardar} disabled={aGuardar}
                    style={{ flex: 1, padding: '9px', background: '#0E5A6B', color: 'white', border: 'none', borderRadius: '2px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    {aGuardar ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Guardar
                  </button>
                  <button onClick={() => { setAEditar(false); setErro(''); }}
                    style={{ padding: '9px 14px', background: 'white', color: '#5B738B', border: '1px solid #D5D7DA', borderRadius: '2px', fontSize: '13px', cursor: 'pointer' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#1D2D3E', fontSize: '16px', wordBreak: 'break-word' }}>
                      {ficha?.cliente?.nome || ficha?.conversa?.contact_name || 'Sem nome'}
                    </div>
                    {!ficha?.cliente && (
                      <div style={{ fontSize: '12px', color: '#8A4B0B', background: '#FCEFDD', padding: '3px 8px', borderRadius: '2px', display: 'inline-block', marginTop: '6px' }}>
                        Ainda não está no CRM
                      </div>
                    )}
                  </div>
                  <button onClick={() => setAEditar(true)} title="Editar os dados"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B738B', display: 'flex', flexShrink: 0 }}>
                    <Pencil size={15} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '14px', fontSize: '13px', color: '#1D2D3E' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Phone size={14} color="#8996A3" /> {ficha?.conversa?.phone_number || '—'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: ficha?.cliente?.email ? '#1D2D3E' : '#8996A3' }}>
                    <Mail size={14} color="#8996A3" /> {ficha?.cliente?.email || 'sem email'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: ficha?.cliente?.empresa ? '#1D2D3E' : '#8996A3' }}>
                    <Building2 size={14} color="#8996A3" /> {ficha?.cliente?.empresa || 'sem empresa'}
                  </div>
                </div>

                {ficha?.cliente?.custom_fields?.notas && (
                  <div style={{ marginTop: '14px', background: '#F5F6F7', borderRadius: '2px', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#8996A3', marginBottom: '5px' }}>
                      <StickyNote size={12} /> NOTAS
                    </div>
                    <div style={{ fontSize: '13px', color: '#1D2D3E', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {ficha.cliente.custom_fields.notas}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ---------- Etiquetas ---------- */}
            <div style={seccao}>ETIQUETAS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {etiquetas.map(et => {
                const ativa = postas.some(t => mesma(t, et.nome));
                return (
                  <button key={et.id} onClick={() => alternarEtiqueta(et.nome)}
                    title={ativa ? 'Clique para tirar a este contacto' : 'Clique para pôr neste contacto'}
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
                <span key={t} style={{ padding: '4px 11px', borderRadius: '2px', fontSize: '12px', fontWeight: 600, background: '#fef3c7', color: '#8A4B0B', border: '1px dashed #d6a93b' }}>
                  {t}
                </span>
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
                <input autoFocus value={novaEtiqueta} maxLength={40} onChange={e => setNovaEtiqueta(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') criarEtiqueta(); if (e.key === 'Escape') { setNovaAberta(false); setNovaEtiqueta(''); } }}
                  placeholder="nome da etiqueta" style={{ ...campo, padding: '6px 9px', fontSize: '12.5px' }} />
                <button onClick={criarEtiqueta} disabled={!novaEtiqueta.trim()}
                  style={{ padding: '6px 11px', background: '#0E5A6B', color: 'white', border: 'none', borderRadius: '2px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>
                  Criar
                </button>
              </div>
            )}

            {etiquetas.length === 0 && !novaAberta && (
              <div style={{ fontSize: '12px', color: '#8996A3', marginTop: '8px', lineHeight: 1.5 }}>
                Ainda não há etiquetas. Crie aqui, ou em Definições → Etiquetas.
              </div>
            )}

            {/* ---------- Negócio ---------- */}
            {ficha?.negocio && (
              <>
                <div style={seccao}>NEGÓCIO</div>
                <div style={{ border: '1px solid #D5D7DA', borderRadius: '2px', padding: '11px 12px' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#1D2D3E', marginBottom: '6px' }}>
                    {ficha.negocio.titulo || 'Negócio sem título'}
                  </div>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '2px', color: 'white', background: CORES_FASE[ficha.negocio.fase] || '#8996A3' }}>
                    {ficha.negocio.fase}
                  </span>
                  <button onClick={() => irPara('crm', {})}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', color: '#0E5A6B', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', padding: '10px 0 0' }}>
                    Abrir no CRM <ExternalLink size={12} />
                  </button>
                </div>
              </>
            )}

            {/* ---------- Histórico ---------- */}
            <div style={seccao}>NESTA CONVERSA</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '12.5px', color: '#5B738B' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageSquare size={13} color="#8996A3" /> {ficha?.totalMensagens || 0} mensagem(ns)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Briefcase size={13} color="#8996A3" /> Cliente desde {dataCurta(ficha?.cliente?.criado_em || ficha?.conversa?.created_at)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tag size={13} color="#8996A3" /> Última mensagem dele: {dataCurta(ficha?.conversa?.last_client_message_at)}
              </div>
            </div>
          </>
        )}
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
