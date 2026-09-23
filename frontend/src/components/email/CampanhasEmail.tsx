import { useState, useEffect, useCallback } from 'react';
import {
  Megaphone, Plus, Play, Pause, Trash2, X, Users, Loader, CheckCircle2,
  AlertCircle, Paperclip, ArrowLeft, Ban
} from 'lucide-react';
import AnexosPicker, { type Anexo } from './AnexosPicker';

const API = import.meta.env.VITE_API_URL;
const authFetch = (url: string, options: any = {}) => {
  const token = localStorage.getItem('os_auth_token') || '';
  return fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
};

interface Campanha {
  id: string;
  nome: string;
  assunto: string;
  corpo_html: string;
  estado: 'Rascunho' | 'Agendada' | 'Em_Execucao' | 'Pausada' | 'Concluida' | 'Cancelada';
  publico_tipo: string;
  anexos?: Anexo[];
  velocidade_por_minuto: number;
  criado_em: string;
  metricas?: { total: number; enviados: number; falhados: number; pendentes: number };
}

const CORES_ESTADO: Record<string, { fundo: string; texto: string; rotulo: string }> = {
  Rascunho: { fundo: '#E7E9EB', texto: '#5B738B', rotulo: 'Por enviar' },
  Agendada: { fundo: '#FCEFDD', texto: '#8A4B0B', rotulo: 'Agendada' },
  Em_Execucao: { fundo: '#E1EEF0', texto: '#0E5A6B', rotulo: 'A enviar' },
  Pausada: { fundo: '#FCEFDD', texto: '#8A4B0B', rotulo: 'Em pausa' },
  Concluida: { fundo: '#DCEEE2', texto: '#107E3E', rotulo: 'Concluída' },
  Cancelada: { fundo: '#F6DEDE', texto: '#BB0000', rotulo: 'Cancelada' }
};

export default function CampanhasEmail() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [aCriar, setACriar] = useState(false);
  const [detalhe, setDetalhe] = useState<Campanha | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/api/email/campanhas`);
      const d = await r.json();
      if (d.success) setCampanhas(d.campanhas || []);
    } catch { /* a lista fica como está */ }
    setACarregar(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Enquanto houver uma campanha a enviar, o progresso vai-se atualizando sozinho.
  useEffect(() => {
    if (!campanhas.some(c => c.estado === 'Em_Execucao')) return;
    const t = setInterval(carregar, 8000);
    return () => clearInterval(t);
  }, [campanhas, carregar]);

  const accao = async (c: Campanha, nome: 'iniciar' | 'pausar' | 'cancelar') => {
    if (nome === 'cancelar' && !window.confirm(`Cancelar "${c.nome}"?\n\nQuem ainda não recebeu deixa de receber. Quem já recebeu não é afetado.`)) return;
    const r = await authFetch(`${API}/api/email/campanhas/${c.id}/${nome}`, { method: 'POST' });
    const d = await r.json();
    if (!d.success) alert(d.error || 'Não foi possível.');
    carregar();
  };

  const apagar = async (c: Campanha) => {
    if (!window.confirm(`Apagar "${c.nome}"? O histórico desta campanha desaparece.`)) return;
    const r = await authFetch(`${API}/api/email/campanhas/${c.id}`, { method: 'DELETE' });
    const d = await r.json();
    if (!d.success) { alert(d.error || 'Não foi possível apagar.'); return; }
    carregar();
  };

  if (aCriar) return <NovaCampanha onFechar={() => setACriar(false)} onCriada={() => { setACriar(false); carregar(); }} />;
  if (detalhe) return <DetalheCampanha campanha={detalhe} onVoltar={() => { setDetalhe(null); carregar(); }} />;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: '20px', color: '#1D2D3E' }}>Campanhas de email</h2>
          <p style={{ margin: 0, fontSize: '13.5px', color: '#5B738B', lineHeight: 1.6, maxWidth: '640px' }}>
            Uma mensagem, muitos destinatários — cada um recebe a sua, com o nome dele. O envio vai
            aos poucos de propósito: disparar tudo de uma vez faz o servidor de correio fechar a porta
            e o seu domínio ganhar fama de spam.
          </p>
        </div>
        <button onClick={() => setACriar(true)}
          style={{ padding: '10px 16px', background: '#0E5A6B', color: 'white', border: 'none', borderRadius: '2px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
          <Plus size={16} /> Nova campanha
        </button>
      </div>

      {aCarregar && <div style={{ color: '#5B738B', fontSize: '14px' }}>A carregar...</div>}

      {!aCarregar && campanhas.length === 0 && (
        <div style={{ background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px', padding: '48px 24px', textAlign: 'center' }}>
          <Megaphone size={36} color="#8996A3" />
          <div style={{ fontWeight: 700, color: '#1D2D3E', margin: '12px 0 4px' }}>Ainda não há campanhas</div>
          <div style={{ fontSize: '13.5px', color: '#5B738B' }}>Crie a primeira: escolha quem recebe, escreva a mensagem e envie.</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {campanhas.map(c => {
          const m = c.metricas || { total: 0, enviados: 0, falhados: 0, pendentes: 0 };
          const feito = m.total ? Math.round(((m.enviados + m.falhados) / m.total) * 100) : 0;
          const cor = CORES_ESTADO[c.estado] || CORES_ESTADO.Rascunho;
          return (
            <div key={c.id} style={{ background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px', padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                <div style={{ minWidth: 0, flex: 1, cursor: 'pointer' }} onClick={() => setDetalhe(c)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 700, color: '#1D2D3E', fontSize: '15px' }}>{c.nome}</span>
                    <span style={{ padding: '2px 10px', borderRadius: '2px', fontSize: '11px', fontWeight: 700, background: cor.fundo, color: cor.texto }}>{cor.rotulo}</span>
                    {!!c.anexos?.length && (
                      <span style={{ fontSize: '11.5px', color: '#5B738B', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Paperclip size={12} /> {c.anexos.length}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '13px', color: '#5B738B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.assunto}</div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  {['Rascunho', 'Pausada', 'Agendada'].includes(c.estado) && (
                    <button onClick={() => accao(c, 'iniciar')} title="Começar a enviar"
                      style={{ padding: '6px 12px', background: '#107E3E', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                      <Play size={14} /> Enviar
                    </button>
                  )}
                  {c.estado === 'Em_Execucao' && (
                    <button onClick={() => accao(c, 'pausar')} title="Parar por agora"
                      style={{ padding: '6px 12px', background: 'white', color: '#8A4B0B', border: '1px solid #8A4B0B', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                      <Pause size={14} /> Pausar
                    </button>
                  )}
                  {['Em_Execucao', 'Pausada', 'Agendada'].includes(c.estado) && (
                    <button onClick={() => accao(c, 'cancelar')} title="Cancelar de vez"
                      style={{ padding: '6px 10px', background: 'white', color: '#BB0000', border: '1px solid #D5D7DA', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontSize: '13px' }}>
                      <Ban size={14} />
                    </button>
                  )}
                  {c.estado !== 'Em_Execucao' && (
                    <button onClick={() => apagar(c)} title="Apagar"
                      style={{ padding: '6px 10px', background: 'white', color: '#8996A3', border: '1px solid #D5D7DA', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div style={{ marginTop: '12px' }}>
                <div style={{ height: '6px', background: '#E7E9EB', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${feito}%`, background: c.estado === 'Cancelada' ? '#BB0000' : '#0E5A6B', transition: 'width 0.4s' }} />
                </div>
                <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '12px', color: '#5B738B' }}>
                  <span><b style={{ color: '#1D2D3E' }}>{m.total}</b> destinatários</span>
                  <span style={{ color: '#107E3E' }}>{m.enviados} enviados</span>
                  {m.falhados > 0 && <span style={{ color: '#BB0000' }}>{m.falhados} falharam</span>}
                  {m.pendentes > 0 && <span>{m.pendentes} por enviar</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Criar
// ============================================================
function NovaCampanha({ onFechar, onCriada }: { onFechar: () => void; onCriada: () => void }) {
  const [nome, setNome] = useState('');
  const [assunto, setAssunto] = useState('');
  const [corpo, setCorpo] = useState('');
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [publicoTipo, setPublicoTipo] = useState<'todos' | 'tags' | 'lista'>('todos');
  const [tags, setTags] = useState<string[]>([]);
  const [tagsDisponiveis, setTagsDisponiveis] = useState<string[]>([]);
  const [lista, setLista] = useState('');
  const [velocidade, setVelocidade] = useState(30);
  const [previa, setPrevia] = useState<{ total: number; amostra: string[] } | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await authFetch(`${API}/api/campanhas/tags-disponiveis`);
        const d = await r.json();
        if (d.success) setTagsDisponiveis(d.tags || []);
      } catch { /* sem etiquetas o resto funciona */ }
    })();
  }, []);

  // Quantas pessoas é que isto apanha — mostrado antes de criar, para ninguém
  // descobrir só depois que mandou para a lista errada.
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const r = await authFetch(`${API}/api/email/campanhas/previsualizar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publico_tipo: publicoTipo, publico_tags: tags, lista })
        });
        const d = await r.json();
        setPrevia(d.success ? { total: d.total, amostra: d.amostra || [] } : null);
      } catch { setPrevia(null); }
    }, 400);
    return () => clearTimeout(t);
  }, [publicoTipo, tags, lista]);

  const criar = async () => {
    setAGuardar(true); setErro('');
    const r = await authFetch(`${API}/api/email/campanhas`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome, assunto, corpo_html: corpo, anexos,
        publico_tipo: publicoTipo, publico_tags: tags, lista,
        velocidade_por_minuto: velocidade
      })
    });
    const d = await r.json();
    setAGuardar(false);
    if (!d.success) { setErro(d.error || 'Não foi possível criar a campanha.'); return; }
    onCriada();
  };

  const rotulo = { display: 'block', fontSize: '13px', fontWeight: 600, color: '#1D2D3E', marginBottom: '6px' } as const;
  const campo = { width: '100%', padding: '10px 12px', border: '1px solid #D5D7DA', borderRadius: '2px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
      <button onClick={onFechar} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#5B738B', cursor: 'pointer', fontSize: '13px', padding: 0, marginBottom: '14px' }}>
        <ArrowLeft size={15} /> Voltar às campanhas
      </button>
      <h2 style={{ margin: '0 0 20px', fontSize: '20px', color: '#1D2D3E' }}>Nova campanha</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '24px', alignItems: 'start' }}>
        <div style={{ background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label style={rotulo}>Nome da campanha <span style={{ fontWeight: 400, color: '#8996A3' }}>(só você vê)</span></label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Promoção de setembro" style={campo} />
          </div>
          <div>
            <label style={rotulo}>Assunto do email</label>
            <input value={assunto} onChange={e => setAssunto(e.target.value)} placeholder="Olá {{nome}}, temos novidades" style={campo} />
          </div>
          <div>
            <label style={rotulo}>Mensagem</label>
            <textarea value={corpo} onChange={e => setCorpo(e.target.value)} rows={10}
              placeholder={'Bom dia {{nome}},\n\nEscreva aqui a sua mensagem.\n\nCom os melhores cumprimentos,\nA equipa'}
              style={{ ...campo, resize: 'vertical', lineHeight: 1.6 }} />
            <div style={{ fontSize: '12px', color: '#5B738B', marginTop: '6px', lineHeight: 1.6 }}>
              Escreva <code>{'{{nome}}'}</code>, <code>{'{{empresa}}'}</code> ou <code>{'{{email}}'}</code> e cada pessoa
              recebe com os dados dela. Quem não tiver esse dado preenchido recebe o espaço vazio, não as chavetas.
            </div>
          </div>
          <div>
            <label style={rotulo}>Anexos</label>
            <AnexosPicker anexos={anexos} onChange={setAnexos} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px', padding: '18px' }}>
            <label style={rotulo}>Quem recebe</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
              {([
                ['todos', 'Todos os contactos com email'],
                ['tags', 'Só os que têm certas etiquetas'],
                ['lista', 'Uma lista que eu colo aqui']
              ] as const).map(([valor, texto]) => (
                <label key={valor} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', color: '#1D2D3E', cursor: 'pointer' }}>
                  <input type="radio" checked={publicoTipo === valor} onChange={() => setPublicoTipo(valor)} />
                  {texto}
                </label>
              ))}
            </div>

            {publicoTipo === 'tags' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {tagsDisponiveis.length === 0 && <span style={{ fontSize: '12.5px', color: '#8996A3' }}>Ainda não há etiquetas nos contactos.</span>}
                {tagsDisponiveis.map(t => (
                  <button key={t} onClick={() => setTags(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])}
                    style={{ padding: '4px 10px', borderRadius: '2px', fontSize: '12px', cursor: 'pointer', border: '1px solid #D5D7DA', background: tags.includes(t) ? '#0E5A6B' : 'white', color: tags.includes(t) ? 'white' : '#5B738B' }}>
                    {t}
                  </button>
                ))}
              </div>
            )}

            {publicoTipo === 'lista' && (
              <textarea value={lista} onChange={e => setLista(e.target.value)} rows={5}
                placeholder={'ana@exemplo.ao\ncarlos@exemplo.ao'}
                style={{ ...campo, resize: 'vertical', fontSize: '13px' }} />
            )}

            <div style={{ marginTop: '14px', padding: '12px', background: '#F5F6F7', borderRadius: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#1D2D3E', fontSize: '14px' }}>
                <Users size={15} /> {previa ? `${previa.total} pessoas` : '...'}
              </div>
              {!!previa?.amostra.length && (
                <div style={{ fontSize: '11.5px', color: '#5B738B', marginTop: '4px', wordBreak: 'break-all', lineHeight: 1.5 }}>
                  {previa.amostra.join(', ')}{previa.total > previa.amostra.length ? '…' : ''}
                </div>
              )}
              {previa?.total === 0 && (
                <div style={{ fontSize: '12px', color: '#BB0000', marginTop: '4px' }}>
                  Ninguém — verifique se os seus contactos têm email preenchido.
                </div>
              )}
            </div>
          </div>

          <div style={{ background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px', padding: '18px' }}>
            <label style={rotulo}>Ritmo de envio</label>
            <input type="range" min={5} max={60} step={5} value={velocidade} onChange={e => setVelocidade(Number(e.target.value))} style={{ width: '100%' }} />
            <div style={{ fontSize: '13px', color: '#1D2D3E', fontWeight: 600 }}>{velocidade} emails por minuto</div>
            <div style={{ fontSize: '11.5px', color: '#5B738B', marginTop: '6px', lineHeight: 1.55 }}>
              Devagar chega a mais caixas de entrada. Acima de 60 por minuto os servidores começam a recusar,
              por isso esse é o limite.
              {previa?.total ? ` A esta velocidade, ${previa.total} pessoas levam cerca de ${Math.max(1, Math.ceil(previa.total / velocidade))} minuto(s).` : ''}
            </div>
          </div>

          {erro && (
            <div style={{ padding: '12px', background: '#F6DEDE', color: '#BB0000', borderRadius: '2px', fontSize: '13px', display: 'flex', gap: '8px' }}>
              <AlertCircle size={16} /> {erro}
            </div>
          )}

          <button onClick={criar} disabled={aGuardar}
            style={{ padding: '12px', background: '#0E5A6B', color: 'white', border: 'none', borderRadius: '2px', fontWeight: 700, cursor: aGuardar ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {aGuardar ? <Loader size={16} className="spin" /> : <CheckCircle2 size={16} />} Criar campanha
          </button>
          <div style={{ fontSize: '11.5px', color: '#5B738B', textAlign: 'center', lineHeight: 1.5 }}>
            A campanha fica guardada por enviar. Só sai quando carregar em <b>Enviar</b> na lista.
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Detalhe: quem recebeu, quem falhou e porquê
// ============================================================
function DetalheCampanha({ campanha, onVoltar }: { campanha: Campanha; onVoltar: () => void }) {
  const [destinatarios, setDestinatarios] = useState<any[]>([]);
  const [filtro, setFiltro] = useState<'todos' | 'Enviado' | 'Falhou' | 'Pendente'>('todos');

  useEffect(() => {
    (async () => {
      const r = await authFetch(`${API}/api/email/campanhas/${campanha.id}/destinatarios`);
      const d = await r.json();
      if (d.success) setDestinatarios(d.destinatarios || []);
    })();
  }, [campanha.id]);

  const visiveis = filtro === 'todos' ? destinatarios : destinatarios.filter(d => d.estado === filtro);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
      <button onClick={onVoltar} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#5B738B', cursor: 'pointer', fontSize: '13px', padding: 0, marginBottom: '14px' }}>
        <ArrowLeft size={15} /> Voltar às campanhas
      </button>
      <h2 style={{ margin: '0 0 4px', fontSize: '20px', color: '#1D2D3E' }}>{campanha.nome}</h2>
      <div style={{ fontSize: '13.5px', color: '#5B738B', marginBottom: '18px' }}>{campanha.assunto}</div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {(['todos', 'Enviado', 'Falhou', 'Pendente'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            style={{ padding: '6px 12px', borderRadius: '2px', fontSize: '13px', cursor: 'pointer', border: '1px solid #D5D7DA', background: filtro === f ? '#0E5A6B' : 'white', color: filtro === f ? 'white' : '#5B738B' }}>
            {f === 'todos' ? 'Todos' : f === 'Enviado' ? 'Entregues' : f === 'Falhou' ? 'Falharam' : 'Por enviar'}
            {' '}({f === 'todos' ? destinatarios.length : destinatarios.filter(d => d.estado === f).length})
          </button>
        ))}
      </div>

      <div style={{ background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px', overflow: 'hidden' }}>
        {visiveis.length === 0 && <div style={{ padding: '24px', color: '#8996A3', fontSize: '13.5px', textAlign: 'center' }}>Nada para mostrar aqui.</div>}
        {visiveis.map((d, i) => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderTop: i ? '1px solid #F0F1F2' : 'none' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13.5px', color: '#1D2D3E', fontWeight: 600 }}>{d.nome || d.email}</div>
              {d.nome && <div style={{ fontSize: '12px', color: '#8996A3' }}>{d.email}</div>}
              {d.erro && <div style={{ fontSize: '12px', color: '#BB0000', marginTop: '2px' }}>{d.erro}</div>}
            </div>
            <span style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 10px', borderRadius: '2px', whiteSpace: 'nowrap',
              background: d.estado === 'Enviado' ? '#DCEEE2' : d.estado === 'Falhou' ? '#F6DEDE' : '#E7E9EB',
              color: d.estado === 'Enviado' ? '#107E3E' : d.estado === 'Falhou' ? '#BB0000' : '#5B738B' }}>
              {d.estado === 'Enviado' ? 'Entregue' : d.estado === 'Falhou' ? 'Falhou' : 'Por enviar'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
