import { useState, useEffect, useCallback } from 'react';
import {
  LayoutTemplate, Plus, Trash2, RefreshCw, X, Check, Clock, AlertTriangle, Image as ImageIcon,
  Video, FileText, Type, Link2, Phone, MessageSquare, Loader2, Copy
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL;
const authFetch = (url: string, options: any = {}) => {
  const token = localStorage.getItem('os_auth_token');
  const headers: any = { ...options.headers, Authorization: `Bearer ${token}` };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  return fetch(url, { ...options, headers });
};

const COR = { accent: '#0E5A6B', ink: '#1D2D3E', muted: '#5B738B', faint: '#8996A3', border: '#D5D7DA', borderSoft: '#E7E9EB', canvas: '#F5F6F7', good: '#107E3E', warn: '#DF6E0C', bad: '#BB0000' };
const btn = (primario = false, perigo = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '2px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
  border: primario ? 'none' : `1px solid ${perigo ? '#fecaca' : COR.border}`, background: primario ? COR.accent : 'white', color: primario ? 'white' : perigo ? COR.bad : COR.ink
});
const input: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: '2px', border: `1px solid ${COR.border}`, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' };
const label: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 700, color: COR.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px', marginTop: '12px' };

const ESTADOS: Record<string, { cor: string; fundo: string; texto: string; ajuda: string }> = {
  APPROVED: { cor: COR.good, fundo: '#DCEEE2', texto: 'Aprovado', ajuda: 'Pode ser enviado.' },
  PENDING: { cor: COR.warn, fundo: '#FCEFDD', texto: 'À espera da Meta', ajuda: 'A Meta está a rever. Costuma demorar de minutos a algumas horas.' },
  REJECTED: { cor: COR.bad, fundo: '#F6DEDE', texto: 'Recusado pela Meta', ajuda: 'Corrija o conteúdo e crie de novo.' },
  LOCAL: { cor: COR.muted, fundo: COR.borderSoft, texto: 'Só neste sistema', ajuda: 'O número está ligado por QR (API não oficial): o modelo é enviado como mensagem normal.' },
  PAUSED: { cor: COR.warn, fundo: '#FCEFDD', texto: 'Pausado', ajuda: 'A Meta pausou o template por baixa qualidade.' }
};

const MODELOS_PRONTOS = [
  {
    nome: 'Boas-vindas', dados: {
      name: 'boas_vindas', category: 'UTILITY', header: { format: 'TEXT', text: 'Bem-vindo!' },
      body: 'Olá {{1}}, obrigado por falar connosco. Em que podemos ajudar hoje?',
      footer: 'Equipa de atendimento', exemplos: ['Ana'],
      buttons: [{ type: 'QUICK_REPLY', text: 'Ver preços' }, { type: 'QUICK_REPLY', text: 'Falar com alguém' }]
    }
  },
  {
    nome: 'Confirmação de reserva', dados: {
      name: 'confirmacao_reserva', category: 'UTILITY', header: { format: 'TEXT', text: 'Reserva confirmada' },
      body: 'Olá {{1}}, a sua reserva para {{2}} está confirmada. Qualquer dúvida, é só responder a esta mensagem.',
      footer: 'Obrigado pela preferência', exemplos: ['Carlos', '12 de outubro'],
      buttons: [{ type: 'QUICK_REPLY', text: 'Alterar' }, { type: 'QUICK_REPLY', text: 'Cancelar' }]
    }
  },
  {
    nome: 'Promoção com imagem', dados: {
      name: 'promocao_mensal', category: 'MARKETING', header: { format: 'IMAGE', exemplo: '' },
      body: 'Olá {{1}}! Este mês temos {{2}} de desconto. Fale connosco para aproveitar.',
      footer: 'Responda PARAR para não receber mais', exemplos: ['Ana', '20%'],
      buttons: [{ type: 'URL', text: 'Ver catálogo', url: 'https://' }]
    }
  },
  {
    nome: 'Cobrança / lembrete', dados: {
      name: 'lembrete_pagamento', category: 'UTILITY', header: { format: 'NONE' },
      body: 'Olá {{1}}, lembramos que a fatura {{2}} vence a {{3}}. Se já pagou, ignore esta mensagem.',
      footer: 'Departamento financeiro', exemplos: ['Ana', '2026/118', '30/10'],
      buttons: [{ type: 'PHONE_NUMBER', text: 'Ligar', phone_number: '+244923000000' }]
    }
  }
];

const vazio = () => ({
  name: '', language: 'pt_PT', category: 'MARKETING',
  header: { format: 'NONE', text: '', exemplo: '' },
  body: '', footer: '', buttons: [] as any[], exemplos: [] as string[]
});

/** Quantas variáveis {{n}} o corpo usa. */
const nVariaveis = (texto: string) => new Set([...String(texto || '').matchAll(/{{\s*(\d+)\s*}}/g)].map(m => m[1])).size;

export default function TemplatesApp() {
  const [lista, setLista] = useState<any[] | null>(null);
  const [canal, setCanal] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [aGuardar, setAGuardar] = useState(false);
  const [aSincronizar, setASincronizar] = useState(false);

  const carregar = useCallback(async () => {
    const r = await authFetch(`${API}/api/whatsapp/templates`);
    const d = await r.json();
    if (d.success) { setLista(d.templates); setCanal(d.canal); } else { setLista([]); setErro(d.error || ''); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const sincronizar = async () => {
    setASincronizar(true); setErro(''); setAviso('');
    const r = await authFetch(`${API}/api/whatsapp/templates/sync`, { method: 'POST' });
    const d = await r.json();
    setASincronizar(false);
    if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível sincronizar.'); return; }
    setAviso(`${d.count} template(s) trazidos da Meta.`);
    carregar();
  };

  const guardar = async () => {
    setAGuardar(true); setErro(''); setAviso('');
    const r = await authFetch(`${API}/api/whatsapp/templates`, { method: 'POST', body: JSON.stringify(edit) });
    const d = await r.json();
    setAGuardar(false);
    if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível guardar.'); return; }
    if (d.aviso) setAviso(d.aviso);
    setEdit(null); carregar();
  };

  const apagar = async (t: any) => {
    if (!confirm(`Apagar o template "${t.name}"?${t.origem === 'meta' ? ' Também é apagado na Meta.' : ''}`)) return;
    const r = await authFetch(`${API}/api/whatsapp/templates/${t.id}`, { method: 'DELETE' });
    const d = await r.json();
    if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível apagar.'); return; }
    carregar();
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px', background: COR.canvas }}>
      <div style={{ maxWidth: edit ? '1180px' : '900px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: COR.ink, display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <LayoutTemplate size={18} color={COR.accent} /> Templates de mensagem
          </h2>
          {canal?.provider === 'meta' && (
            <button style={btn()} disabled={aSincronizar} onClick={sincronizar}>
              {aSincronizar ? <Loader2 size={13} /> : <RefreshCw size={13} />} Sincronizar com a Meta
            </button>
          )}
          {!edit && <button style={btn(true)} onClick={() => setEdit(vazio())}><Plus size={13} /> Novo template</button>}
        </div>
        <p style={{ margin: '0 0 16px', fontSize: '12.5px', color: COR.muted, lineHeight: 1.5 }}>
          Modelos de mensagem com cabeçalho, corpo com variáveis, rodapé e botões — a estrutura da Meta.
          {canal?.provider === 'meta'
            ? ' Ao guardar, o template é submetido à Meta e só pode ser enviado depois de aprovado (a decisão é da Meta, não nossa).'
            : ' Este número está ligado por QR (API não oficial), onde a Meta não tem templates: o modelo fica guardado aqui e é enviado como mensagem normal, com o mesmo conteúdo.'}
        </p>

        {erro && <div style={{ marginBottom: '12px', padding: '9px 12px', background: '#F6DEDE', border: '1px solid #fecaca', borderRadius: '2px', fontSize: '12.5px', color: COR.bad, display: 'flex', justifyContent: 'space-between' }}><span>{erro}</span><X size={14} style={{ cursor: 'pointer' }} onClick={() => setErro('')} /></div>}
        {aviso && <div style={{ marginBottom: '12px', padding: '9px 12px', background: '#E1EEF0', border: `1px solid ${COR.accent}`, borderRadius: '2px', fontSize: '12.5px', color: COR.accent, display: 'flex', justifyContent: 'space-between' }}><span>{aviso}</span><X size={14} style={{ cursor: 'pointer' }} onClick={() => setAviso('')} /></div>}

        {edit
          ? <Editor edit={edit} setEdit={setEdit} onGuardar={guardar} onCancelar={() => { setEdit(null); setErro(''); }} aGuardar={aGuardar} canal={canal} />
          : <Lista lista={lista} onNovo={(d: any) => setEdit({ ...vazio(), ...d })} onApagar={apagar} />}
      </div>
    </div>
  );
}

// ============================================================
// LISTA
// ============================================================
function Lista({ lista, onNovo, onApagar }: any) {
  if (lista === null) return <div style={{ color: COR.muted, fontSize: '13px' }}>A carregar...</div>;
  return (
    <>
      {lista.length === 0 && (
        <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '28px', textAlign: 'center', marginBottom: '16px' }}>
          <LayoutTemplate size={30} color={COR.border} style={{ marginBottom: '8px' }} />
          <div style={{ fontWeight: 700, color: COR.ink }}>Ainda não há templates.</div>
          <div style={{ fontSize: '12.5px', color: COR.muted }}>Comece por um modelo pronto aqui em baixo, ou crie um de raiz.</div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
        {lista.map((t: any) => {
          const e = ESTADOS[t.status] || ESTADOS.LOCAL;
          return (
            <div key={t.id} style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: COR.ink, fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: e.cor, background: e.fundo, padding: '2px 7px', borderRadius: '2px', whiteSpace: 'nowrap' }}>{e.texto}</span>
              </div>
              <div style={{ fontSize: '11.5px', color: COR.faint, marginTop: '2px' }}>{t.language} · {t.category}</div>
              {t.motivo_rejeicao && <div style={{ fontSize: '11.5px', color: COR.bad, marginTop: '4px' }}>Motivo: {t.motivo_rejeicao}</div>}
              <div style={{ marginTop: '10px' }}><Balao texto={t.previsualizacao || ''} compacto /></div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                <button style={{ ...btn(), padding: '4px 9px', fontSize: '11.5px' }} onClick={() => navigator.clipboard?.writeText(t.name)}><Copy size={11} /> Copiar nome</button>
                <span style={{ flex: 1 }} />
                <button style={{ ...btn(false, true), padding: '4px 8px' }} onClick={() => onApagar(t)}><Trash2 size={12} /></button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '20px' }}>
        <div style={{ ...label, marginTop: 0 }}>Começar a partir de um modelo pronto</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {MODELOS_PRONTOS.map(m => (
            <button key={m.nome} onClick={() => onNovo(m.dados)} style={{ ...btn(), padding: '8px 12px' }}>{m.nome}</button>
          ))}
        </div>
      </div>
    </>
  );
}

// ============================================================
// EDITOR + PRÉ-VISUALIZAÇÃO
// ============================================================
function Editor({ edit, setEdit, onGuardar, onCancelar, aGuardar, canal }: any) {
  const set = (patch: any) => setEdit({ ...edit, ...patch });
  const setHeader = (patch: any) => setEdit({ ...edit, header: { ...edit.header, ...patch } });
  const n = nVariaveis(edit.body);
  const tiposCabecalho: { v: string; l: string; icone: any }[] = [
    { v: 'NONE', l: 'Sem cabeçalho', icone: <X size={13} /> },
    { v: 'TEXT', l: 'Texto', icone: <Type size={13} /> },
    { v: 'IMAGE', l: 'Imagem', icone: <ImageIcon size={13} /> },
    { v: 'VIDEO', l: 'Vídeo', icone: <Video size={13} /> },
    { v: 'DOCUMENT', l: 'Documento', icone: <FileText size={13} /> }
  ];
  const botoes = edit.buttons || [];
  const tipoBotoes = botoes.length > 0 ? (botoes[0].type === 'QUICK_REPLY' ? 'rapidos' : 'acao') : null;
  const addBotao = (type: string) => set({ buttons: [...botoes, type === 'QUICK_REPLY' ? { type, text: '' } : type === 'URL' ? { type, text: '', url: 'https://' } : { type, text: '', phone_number: '' }] });
  const setBotao = (i: number, patch: any) => set({ buttons: botoes.map((b: any, j: number) => j === i ? { ...b, ...patch } : b) });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: '20px', alignItems: 'start' }}>
      <div style={{ background: 'white', border: `1px solid ${COR.border}`, borderRadius: '2px', padding: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px' }}>
          <div>
            <label style={{ ...label, marginTop: 0 }}>Nome (só minúsculas e _)</label>
            <input style={input} value={edit.name} onChange={e => set({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_ ]/g, '').replace(/\s+/g, '_') })} placeholder="promocao_natal" />
          </div>
          <div>
            <label style={{ ...label, marginTop: 0 }}>Idioma</label>
            <select style={input} value={edit.language} onChange={e => set({ language: e.target.value })}>
              <option value="pt_PT">Português (PT)</option>
              <option value="pt_BR">Português (BR)</option>
              <option value="en_US">Inglês</option>
              <option value="fr">Francês</option>
              <option value="es">Espanhol</option>
            </select>
          </div>
          <div>
            <label style={{ ...label, marginTop: 0 }}>Categoria</label>
            <select style={input} value={edit.category} onChange={e => set({ category: e.target.value })}>
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Serviço / transação</option>
              <option value="AUTHENTICATION">Autenticação</option>
            </select>
          </div>
        </div>

        <label style={label}>Cabeçalho</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {tiposCabecalho.map(t => (
            <button key={t.v} onClick={() => setHeader({ format: t.v })} style={{ ...btn(edit.header?.format === t.v), padding: '6px 10px', fontSize: '12px' }}>{t.icone} {t.l}</button>
          ))}
        </div>
        {edit.header?.format === 'TEXT' && (
          <>
            <input style={{ ...input, marginTop: '8px' }} maxLength={60} value={edit.header.text || ''} onChange={e => setHeader({ text: e.target.value })} placeholder="Ex: Promoção de Natal (máx. 60)" />
            {/{{\s*\d+\s*}}/.test(edit.header.text || '') && (
              <input style={{ ...input, marginTop: '6px' }} value={edit.header.exemplo || ''} onChange={e => setHeader({ exemplo: e.target.value })} placeholder="Exemplo para a variável do cabeçalho" />
            )}
          </>
        )}
        {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(edit.header?.format) && (
          <input style={{ ...input, marginTop: '8px' }} value={edit.header.exemplo || ''} onChange={e => setHeader({ exemplo: e.target.value })} placeholder="Link do ficheiro de exemplo (https://…)" />
        )}

        <label style={label}>Mensagem</label>
        <textarea style={{ ...input, minHeight: '120px', resize: 'vertical' }} maxLength={1024} value={edit.body} onChange={e => set({ body: e.target.value })}
          placeholder={'Olá {{1}}, a sua reserva para {{2}} está confirmada.'} />
        <div style={{ fontSize: '11.5px', color: COR.muted, marginTop: '4px', lineHeight: 1.5 }}>
          Use <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code>… para o que muda em cada envio (nome, data, valor). Não pode começar nem terminar com uma variável. {edit.body.length}/1024
        </div>
        {n > 0 && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ ...label, marginTop: 0 }}>Exemplos (a Meta exige um por variável)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '6px' }}>
              {Array.from({ length: n }, (_, i) => (
                <input key={i} style={input} value={edit.exemplos?.[i] || ''} placeholder={`exemplo de {{${i + 1}}}`}
                  onChange={e => { const ex = [...(edit.exemplos || [])]; ex[i] = e.target.value; set({ exemplos: ex }); }} />
              ))}
            </div>
          </div>
        )}

        <label style={label}>Rodapé (opcional)</label>
        <input style={input} maxLength={60} value={edit.footer || ''} onChange={e => set({ footer: e.target.value })} placeholder="Ex: Responda PARAR para não receber mais" />

        <label style={label}>Botões (opcional)</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button style={{ ...btn(), padding: '6px 10px', fontSize: '12px' }} disabled={tipoBotoes === 'acao' || botoes.length >= 3} onClick={() => addBotao('QUICK_REPLY')}><MessageSquare size={12} /> Resposta rápida</button>
          <button style={{ ...btn(), padding: '6px 10px', fontSize: '12px' }} disabled={tipoBotoes === 'rapidos' || botoes.filter((b: any) => b.type !== 'QUICK_REPLY').length >= 2} onClick={() => addBotao('URL')}><Link2 size={12} /> Link</button>
          <button style={{ ...btn(), padding: '6px 10px', fontSize: '12px' }} disabled={tipoBotoes === 'rapidos' || botoes.filter((b: any) => b.type !== 'QUICK_REPLY').length >= 2} onClick={() => addBotao('PHONE_NUMBER')}><Phone size={12} /> Telefone</button>
        </div>
        <div style={{ fontSize: '11.5px', color: COR.faint, marginTop: '4px' }}>Até 3 respostas rápidas, ou até 2 de ação (link/telefone). A Meta não deixa misturar os dois tipos.</div>
        {botoes.map((b: any, i: number) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: b.type === 'QUICK_REPLY' ? '1fr auto' : '1fr 1.4fr auto', gap: '6px', marginTop: '6px', alignItems: 'center' }}>
            <input style={input} maxLength={25} value={b.text} onChange={e => setBotao(i, { text: e.target.value })} placeholder="Texto do botão" />
            {b.type === 'URL' && <input style={input} value={b.url || ''} onChange={e => setBotao(i, { url: e.target.value })} placeholder="https://…" />}
            {b.type === 'PHONE_NUMBER' && <input style={input} value={b.phone_number || ''} onChange={e => setBotao(i, { phone_number: e.target.value })} placeholder="+244 923 000 000" />}
            <button style={{ ...btn(false, true), padding: '6px 8px' }} onClick={() => set({ buttons: botoes.filter((_: any, j: number) => j !== i) })}><Trash2 size={12} /></button>
          </div>
        ))}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px', borderTop: `1px solid ${COR.borderSoft}`, paddingTop: '14px' }}>
          <button style={btn()} onClick={onCancelar}>Cancelar</button>
          <button style={btn(true)} disabled={aGuardar} onClick={onGuardar}>
            {aGuardar ? <Loader2 size={13} /> : <Check size={13} />} {canal?.provider === 'meta' ? 'Guardar e enviar à Meta' : 'Guardar template'}
          </button>
        </div>
      </div>

      <div style={{ position: 'sticky', top: '20px' }}>
        <div style={{ ...label, marginTop: 0 }}>Pré-visualização</div>
        <Previsualizacao t={edit} />
        <div style={{ fontSize: '11.5px', color: COR.muted, marginTop: '10px', lineHeight: 1.5 }}>
          {canal?.provider === 'meta'
            ? <><Clock size={11} style={{ verticalAlign: '-1px' }} /> Depois de guardar fica "à espera da Meta". Só quando a Meta aprovar é que pode ser enviado.</>
            : <><AlertTriangle size={11} style={{ verticalAlign: '-1px' }} /> Neste número (QR) os botões vão como opções numeradas, porque a API não oficial não suporta botões da Meta.</>}
        </div>
      </div>
    </div>
  );
}

/** O balão verde do WhatsApp, com cabeçalho, corpo, rodapé e botões. */
function Previsualizacao({ t }: { t: any }) {
  const exemplo = (s: string) => String(s || '').replace(/{{\s*(\d+)\s*}}/g, (_, i) => (t.exemplos?.[Number(i) - 1] || `{{${i}}}`));
  const botoes = t.buttons || [];
  return (
    <div style={{ background: '#E5DDD5', borderRadius: '8px', padding: '14px', minHeight: '180px' }}>
      <div style={{ background: 'white', borderRadius: '8px', padding: '8px 9px', boxShadow: '0 1px 1px rgba(0,0,0,0.12)', maxWidth: '260px' }}>
        {t.header?.format === 'TEXT' && t.header.text && <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#111', marginBottom: '4px' }}>{exemplo(t.header.text)}</div>}
        {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(t.header?.format) && (
          <div style={{ background: '#CFD8DC', borderRadius: '5px', height: '104px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#546E7A', marginBottom: '6px', gap: '6px', fontSize: '12px' }}>
            {t.header.format === 'IMAGE' ? <ImageIcon size={20} /> : t.header.format === 'VIDEO' ? <Video size={20} /> : <FileText size={20} />}
            {t.header.format === 'IMAGE' ? 'Imagem' : t.header.format === 'VIDEO' ? 'Vídeo' : 'Documento'}
          </div>
        )}
        <div style={{ fontSize: '13.5px', color: '#111', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{exemplo(t.body) || <span style={{ color: '#9aa0a6' }}>A sua mensagem aparece aqui…</span>}</div>
        {t.footer && <div style={{ fontSize: '11.5px', color: '#8696a0', marginTop: '5px' }}>{t.footer}</div>}
        <div style={{ fontSize: '10.5px', color: '#8696a0', textAlign: 'right', marginTop: '3px' }}>
          {new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      {botoes.length > 0 && (
        <div style={{ maxWidth: '260px', marginTop: '3px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {botoes.map((b: any, i: number) => (
            <div key={i} style={{ background: 'white', borderRadius: '8px', padding: '9px', textAlign: 'center', color: '#0E5A6B', fontSize: '13.5px', fontWeight: 500, boxShadow: '0 1px 1px rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              {b.type === 'URL' ? <Link2 size={13} /> : b.type === 'PHONE_NUMBER' ? <Phone size={13} /> : null}
              {b.text || 'Botão'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Balao({ texto, compacto }: { texto: string; compacto?: boolean }) {
  return (
    <div style={{ background: '#E5DDD5', borderRadius: '6px', padding: '8px' }}>
      <div style={{ background: 'white', borderRadius: '6px', padding: '7px 8px', fontSize: '12px', color: '#111', whiteSpace: 'pre-wrap', lineHeight: 1.4, maxHeight: compacto ? '110px' : undefined, overflow: 'hidden' }}>
        {texto || '(sem conteúdo)'}
      </div>
    </div>
  );
}
