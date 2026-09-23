import { useState, useEffect, useMemo } from 'react';
import { X, Search, Send, PenLine, AlertTriangle, Image as ImageIcon, Video, FileText, Link2, Phone, Loader2, LayoutTemplate } from 'lucide-react';

const API = import.meta.env.VITE_API_URL;
const authFetch = (url: string, options: any = {}) => {
  const token = localStorage.getItem('os_auth_token');
  const headers: any = { ...options.headers, Authorization: `Bearer ${token}` };
  if (options.body) headers['Content-Type'] = 'application/json';
  return fetch(url, { ...options, headers });
};
const COR = { accent: '#0E5A6B', ink: '#1D2D3E', muted: '#5B738B', faint: '#8996A3', border: '#D5D7DA', canvas: '#F5F6F7', good: '#107E3E', warn: '#DF6E0C', bad: '#BB0000' };

const ROTULO_ESTADO: Record<string, { t: string; c: string; f: string }> = {
  APPROVED: { t: 'Aprovado', c: COR.good, f: '#DCEEE2' },
  PENDING: { t: 'À espera da Meta', c: COR.warn, f: '#FCEFDD' },
  REJECTED: { t: 'Recusado', c: COR.bad, f: '#F6DEDE' },
  PAUSED: { t: 'Pausado', c: COR.warn, f: '#FCEFDD' },
  LOCAL: { t: 'Pronto a usar', c: COR.accent, f: '#E1EEF0' }
};

const partes = (componentes: any[]) => {
  const c = Array.isArray(componentes) ? componentes : [];
  const achar = (t: string) => c.find(x => String(x.type).toUpperCase() === t);
  return {
    header: achar('HEADER'), body: achar('BODY')?.text || '',
    footer: achar('FOOTER')?.text || '', buttons: achar('BUTTONS')?.buttons || [],
    exemplos: achar('BODY')?.example?.body_text?.[0] || []
  };
};
const contarVariaveis = (texto: string) => new Set([...String(texto || '').matchAll(/{{\s*(\d+)\s*}}/g)].map(m => m[1])).size;
const substituir = (texto: string, valores: string[]) => String(texto || '').replace(/{{\s*(\d+)\s*}}/g, (_, n) => valores[Number(n) - 1] || `{{${n}}}`);

/**
 * Escolher um template ao enviar uma mensagem: lista os modelos criados, deixa
 * preencher as variáveis, mostra como vai ficar e envia — ou põe o texto no
 * campo de escrita para a pessoa editar antes de enviar.
 */
export default function SeletorTemplate({ conversaId, canalProvider, nomeContacto, telefone, onFechar, onEnviado, onInserirTexto }: {
  conversaId: string;
  canalProvider?: string;
  nomeContacto?: string;
  telefone?: string;
  onFechar: () => void;
  onEnviado: () => void;
  onInserirTexto: (texto: string) => void;
}) {
  const [lista, setLista] = useState<any[] | null>(null);
  const [procura, setProcura] = useState('');
  const [sel, setSel] = useState<any>(null);
  const [valores, setValores] = useState<string[]>([]);
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState('');

  const oficial = canalProvider === 'meta';

  useEffect(() => {
    (async () => {
      const r = await authFetch(`${API}/api/whatsapp/templates`);
      const d = await r.json();
      setLista(d.success ? d.templates : []);
    })();
  }, []);

  const p = useMemo(() => (sel ? partes(sel.components) : null), [sel]);
  const nVars = p ? contarVariaveis(p.body) : 0;

  const escolher = (t: any) => {
    setSel(t); setErro('');
    const pp = partes(t.components);
    const n = contarVariaveis(pp.body);
    // Inteligente: a 1ª variável costuma ser o nome de quem recebe.
    const iniciais = Array.from({ length: n }, (_, i) => (i === 0 && nomeContacto && nomeContacto !== telefone ? nomeContacto : ''));
    setValores(iniciais);
  };

  const textoFinal = p ? [
    p.header?.format === 'TEXT' && p.header.text ? `*${substituir(p.header.text, valores)}*` : '',
    substituir(p.body, valores),
    p.footer ? `_${p.footer}_` : '',
    p.buttons.length ? p.buttons.map((b: any, i: number) =>
      b.type === 'URL' ? `🔗 ${b.text}: ${b.url}` : b.type === 'PHONE_NUMBER' ? `📞 ${b.text}: ${b.phone_number}` : `${i + 1} - ${b.text}`).join('\n') : ''
  ].filter(Boolean).join('\n\n') : '';

  const podeEnviar = !!sel && (!oficial || sel.status === 'APPROVED') && valores.slice(0, nVars).every(v => String(v || '').trim());

  const enviar = async () => {
    setAEnviar(true); setErro('');
    const r = await authFetch(`${API}/api/whatsapp/templates/send`, {
      method: 'POST',
      body: JSON.stringify({ conversation_id: conversaId, template_id: sel.id, params: valores.slice(0, nVars) })
    });
    const d = await r.json();
    setAEnviar(false);
    if (!r.ok || !d.success) { setErro(d.error || 'Não foi possível enviar.'); return; }
    onEnviado(); onFechar();
  };

  const filtrados = (lista || []).filter(t =>
    !procura.trim() || t.name.toLowerCase().includes(procura.toLowerCase()) || String(partes(t.components).body).toLowerCase().includes(procura.toLowerCase()));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,59,71,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onFechar}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', width: '860px', maxWidth: '95vw', maxHeight: '86vh', borderRadius: '2px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 18px', borderBottom: `1px solid ${COR.border}` }}>
          <LayoutTemplate size={17} color={COR.accent} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: COR.ink, fontSize: '14px' }}>Usar um template</div>
            <div style={{ fontSize: '11.5px', color: COR.muted }}>
              {oficial ? 'Número oficial (Meta): só templates aprovados podem ser enviados.' : 'Número ligado por QR: o template é enviado como mensagem normal, com o mesmo conteúdo.'}
            </div>
          </div>
          <X size={18} style={{ cursor: 'pointer', color: COR.muted }} onClick={onFechar} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', flex: 1, minHeight: 0 }}>
          {/* lista */}
          <div style={{ borderRight: `1px solid ${COR.border}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '10px', borderBottom: `1px solid ${COR.border}`, position: 'relative' }}>
              <Search size={14} color={COR.faint} style={{ position: 'absolute', left: '20px', top: '20px' }} />
              <input value={procura} onChange={e => setProcura(e.target.value)} placeholder="Procurar template…"
                style={{ width: '100%', padding: '8px 10px 8px 32px', border: `1px solid ${COR.border}`, borderRadius: '2px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {lista === null && <div style={{ padding: '14px', fontSize: '12.5px', color: COR.muted }}>A carregar…</div>}
              {lista && filtrados.length === 0 && (
                <div style={{ padding: '18px', fontSize: '12.5px', color: COR.muted, lineHeight: 1.5 }}>
                  Nenhum template. Crie um em <b>WhatsApp → Templates</b> e ele aparece aqui.
                </div>
              )}
              {filtrados.map(t => {
                const e = ROTULO_ESTADO[t.status] || ROTULO_ESTADO.LOCAL;
                const bloqueado = oficial && t.status !== 'APPROVED';
                return (
                  <div key={t.id} onClick={() => escolher(t)} style={{
                    padding: '10px 12px', borderBottom: '1px solid #EEF1F2', cursor: 'pointer',
                    background: sel?.id === t.id ? '#E1EEF0' : 'white', opacity: bloqueado ? 0.6 : 1
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '12.5px', fontWeight: 700, color: COR.ink, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: e.c, background: e.f, padding: '1px 6px', borderRadius: '2px', whiteSpace: 'nowrap' }}>{e.t}</span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: COR.muted, marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{partes(t.components).body}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* detalhe */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {!sel && <div style={{ padding: '24px', color: COR.muted, fontSize: '13px' }}>Escolha um template à esquerda para o preencher e ver como fica.</div>}
            {sel && p && (
              <>
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'grid', gridTemplateColumns: '1fr 280px', gap: '18px' }}>
                  <div>
                    {oficial && sel.status !== 'APPROVED' && (
                      <div style={{ display: 'flex', gap: '8px', padding: '10px', background: '#FCEFDD', border: '1px solid #DF6E0C', borderRadius: '2px', fontSize: '12.5px', color: '#8A4B0B', marginBottom: '12px' }}>
                        <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                        <span>Este template está <b>{(ROTULO_ESTADO[sel.status] || ROTULO_ESTADO.LOCAL).t.toLowerCase()}</b> na Meta. Num número oficial, só os aprovados podem ser enviados.{sel.motivo_rejeicao ? ` Motivo: ${sel.motivo_rejeicao}` : ''}</span>
                      </div>
                    )}

                    {nVars === 0 && <div style={{ fontSize: '12.5px', color: COR.muted }}>Este template não tem variáveis — é enviado tal como está.</div>}
                    {nVars > 0 && (
                      <>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: COR.muted, textTransform: 'uppercase', marginBottom: '6px' }}>Preencher</div>
                        {Array.from({ length: nVars }, (_, i) => (
                          <div key={i} style={{ marginBottom: '8px' }}>
                            <label style={{ fontSize: '11.5px', color: COR.muted }}>
                              {`{{${i + 1}}}`}{p.exemplos[i] ? ` — ex: ${p.exemplos[i]}` : ''}
                            </label>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <input value={valores[i] || ''} onChange={e => { const v = [...valores]; v[i] = e.target.value; setValores(v); }}
                                placeholder={p.exemplos[i] || `valor de {{${i + 1}}}`}
                                style={{ flex: 1, padding: '8px 10px', border: `1px solid ${COR.border}`, borderRadius: '2px', fontSize: '13px' }} />
                              {nomeContacto && <button title="Usar o nome do contacto" onClick={() => { const v = [...valores]; v[i] = nomeContacto; setValores(v); }}
                                style={{ padding: '0 9px', border: `1px solid ${COR.border}`, background: 'white', borderRadius: '2px', cursor: 'pointer', fontSize: '11.5px', color: COR.accent }}>nome</button>}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                    {erro && <div style={{ color: COR.bad, fontSize: '12.5px', marginTop: '8px' }}>{erro}</div>}
                  </div>

                  {/* pré-visualização */}
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: COR.muted, textTransform: 'uppercase', marginBottom: '6px' }}>Como fica</div>
                    <div style={{ background: '#E5DDD5', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ background: 'white', borderRadius: '8px', padding: '8px 9px', boxShadow: '0 1px 1px rgba(0,0,0,0.12)' }}>
                        {p.header?.format === 'TEXT' && p.header.text && <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>{substituir(p.header.text, valores)}</div>}
                        {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(String(p.header?.format)) && (
                          <div style={{ background: '#CFD8DC', borderRadius: '5px', height: '86px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#546E7A', marginBottom: '6px', gap: '6px', fontSize: '12px' }}>
                            {p.header.format === 'IMAGE' ? <ImageIcon size={18} /> : p.header.format === 'VIDEO' ? <Video size={18} /> : <FileText size={18} />}
                            {p.header.format === 'IMAGE' ? 'Imagem' : p.header.format === 'VIDEO' ? 'Vídeo' : 'Documento'}
                          </div>
                        )}
                        <div style={{ fontSize: '13px', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{substituir(p.body, valores)}</div>
                        {p.footer && <div style={{ fontSize: '11px', color: '#8696a0', marginTop: '5px' }}>{p.footer}</div>}
                      </div>
                      {p.buttons.map((b: any, i: number) => (
                        <div key={i} style={{ background: 'white', borderRadius: '8px', padding: '7px', textAlign: 'center', color: COR.accent, fontSize: '13px', marginTop: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                          {b.type === 'URL' ? <Link2 size={12} /> : b.type === 'PHONE_NUMBER' ? <Phone size={12} /> : null}{b.text}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderTop: `1px solid ${COR.border}`, alignItems: 'center' }}>
                  <span style={{ fontSize: '11.5px', color: COR.muted, flex: 1 }}>
                    {oficial
                      ? 'No número oficial o template é enviado como template da Meta (com botões a sério).'
                      : 'Pode enviar já, ou pôr o texto no campo de escrita para mudar alguma coisa antes.'}
                  </span>
                  {!oficial && (
                    <button onClick={() => { onInserirTexto(textoFinal); onFechar(); }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', border: `1px solid ${COR.border}`, background: 'white', borderRadius: '2px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 600, color: COR.ink }}>
                      <PenLine size={13} /> Escrever por cima
                    </button>
                  )}
                  <button onClick={enviar} disabled={!podeEnviar || aEnviar}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', border: 'none', background: podeEnviar ? COR.accent : COR.border, color: 'white', borderRadius: '2px', cursor: podeEnviar ? 'pointer' : 'not-allowed', fontSize: '12.5px', fontWeight: 600 }}>
                    {aEnviar ? <Loader2 size={13} /> : <Send size={13} />} Enviar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
