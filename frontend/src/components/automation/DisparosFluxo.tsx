import { useState, useEffect, useCallback } from 'react';
import {
  Send, Play, Pause, Trash2, Users, Loader2, AlertCircle,
  ArrowLeft, Ban, Zap, CheckCircle2
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL;
const authFetch = (url: string, options: any = {}) => {
  const token = localStorage.getItem('os_auth_token') || '';
  return fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
};

interface Disparo {
  id: string; nome: string; automation_id: number; estado: string;
  velocidade_por_minuto: number; criado_em: string;
  metricas?: { total: number; enviados: number; falhados: number; pendentes: number; ignorados: number };
}

const CORES: Record<string, { fundo: string; texto: string; rotulo: string }> = {
  Rascunho: { fundo: '#E7E9EB', texto: '#5B738B', rotulo: 'Por começar' },
  Em_Execucao: { fundo: '#E1EEF0', texto: '#0E5A6B', rotulo: 'A correr' },
  Pausado: { fundo: '#FCEFDD', texto: '#8A4B0B', rotulo: 'Em pausa' },
  Concluido: { fundo: '#DCEEE2', texto: '#107E3E', rotulo: 'Concluído' },
  Cancelado: { fundo: '#F6DEDE', texto: '#BB0000', rotulo: 'Cancelado' }
};

/**
 * Pôr um fluxo a correr para muita gente de uma vez.
 *
 * Até agora um fluxo só arrancava quando o cliente escrevia. Quem nunca
 * respondia nunca mais era contactado, e não havia forma de fazer seguimento a
 * um grupo — "todos os que ficaram em interessado e não voltaram a falar".
 */
export default function DisparosFluxo({ onFechar }: { onFechar: () => void }) {
  const [disparos, setDisparos] = useState<Disparo[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [aCriar, setACriar] = useState(false);
  const [detalhe, setDetalhe] = useState<Disparo | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/api/automation/disparos`);
      const d = await r.json();
      if (d.success) setDisparos(d.disparos || []);
    } catch { /* fica como está */ }
    setACarregar(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!disparos.some(d => d.estado === 'Em_Execucao')) return;
    const t = setInterval(carregar, 8000);
    return () => clearInterval(t);
  }, [disparos, carregar]);

  const accao = async (d: Disparo, nome: 'iniciar' | 'pausar' | 'cancelar') => {
    if (nome === 'cancelar' && !window.confirm(`Cancelar "${d.nome}"?\n\nQuem ainda não recebeu deixa de receber. Quem já recebeu não é afetado.`)) return;
    const r = await authFetch(`${API}/api/automation/disparos/${d.id}/${nome}`, { method: 'POST' });
    const j = await r.json();
    if (!j.success) alert(j.error || 'Não foi possível.');
    carregar();
  };

  const apagar = async (d: Disparo) => {
    if (!window.confirm(`Apagar "${d.nome}"? O histórico deste disparo desaparece.`)) return;
    const r = await authFetch(`${API}/api/automation/disparos/${d.id}`, { method: 'DELETE' });
    const j = await r.json();
    if (!j.success) { alert(j.error || 'Não foi possível apagar.'); return; }
    carregar();
  };

  if (aCriar) return <NovoDisparo onVoltar={() => setACriar(false)} onCriado={() => { setACriar(false); carregar(); }} />;
  if (detalhe) return <DetalheDisparo disparo={detalhe} onVoltar={() => { setDetalhe(null); carregar(); }} />;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, background: '#F5F6F7', overflowY: 'auto', padding: '26px 32px' }}>
      <button onClick={onFechar} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#5B738B', cursor: 'pointer', fontSize: '13px', padding: 0, marginBottom: '14px' }}>
        <ArrowLeft size={15} /> Voltar ao construtor
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: '20px', color: '#1D2D3E' }}>Disparar um fluxo</h2>
          <p style={{ margin: 0, fontSize: '13.5px', color: '#5B738B', lineHeight: 1.6, maxWidth: '640px' }}>
            Pôr um fluxo a correr para um grupo de contactos, sem esperar que escrevam.
            É assim que se faz seguimento a quem ficou a meio. O envio vai aos poucos
            de propósito: um número a disparar centenas de mensagens seguidas é banido pelo WhatsApp.
          </p>
        </div>
        <button onClick={() => setACriar(true)}
          style={{ padding: '10px 16px', background: '#0E5A6B', color: 'white', border: 'none', borderRadius: '2px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
          <Send size={16} /> Novo disparo
        </button>
      </div>

      {aCarregar && <div style={{ color: '#5B738B', fontSize: '14px' }}>A carregar...</div>}

      {!aCarregar && disparos.length === 0 && (
        <div style={{ background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px', padding: '48px 24px', textAlign: 'center' }}>
          <Zap size={34} color="#8996A3" />
          <div style={{ fontWeight: 700, color: '#1D2D3E', margin: '12px 0 4px' }}>Ainda não há disparos</div>
          <div style={{ fontSize: '13.5px', color: '#5B738B' }}>Escolha um fluxo, escolha quem recebe, e põe-se a correr.</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {disparos.map(d => {
          const m = d.metricas || { total: 0, enviados: 0, falhados: 0, pendentes: 0, ignorados: 0 };
          const feito = m.total ? Math.round(((m.enviados + m.falhados + m.ignorados) / m.total) * 100) : 0;
          const cor = CORES[d.estado] || CORES.Rascunho;
          return (
            <div key={d.id} style={{ background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px', padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                <div style={{ minWidth: 0, flex: 1, cursor: 'pointer' }} onClick={() => setDetalhe(d)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: 700, color: '#1D2D3E', fontSize: '15px' }}>{d.nome}</span>
                    <span style={{ padding: '2px 10px', borderRadius: '2px', fontSize: '11px', fontWeight: 700, background: cor.fundo, color: cor.texto }}>{cor.rotulo}</span>
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#5B738B', marginTop: '3px' }}>
                    {d.velocidade_por_minuto} pessoas por minuto
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  {['Rascunho', 'Pausado'].includes(d.estado) && (
                    <button onClick={() => accao(d, 'iniciar')}
                      style={{ padding: '6px 12px', background: '#107E3E', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                      <Play size={14} /> {d.estado === 'Pausado' ? 'Retomar' : 'Começar'}
                    </button>
                  )}
                  {d.estado === 'Em_Execucao' && (
                    <button onClick={() => accao(d, 'pausar')}
                      style={{ padding: '6px 12px', background: 'white', color: '#8A4B0B', border: '1px solid #8A4B0B', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                      <Pause size={14} /> Pausar
                    </button>
                  )}
                  {['Em_Execucao', 'Pausado'].includes(d.estado) && (
                    <button onClick={() => accao(d, 'cancelar')} title="Cancelar de vez"
                      style={{ padding: '6px 10px', background: 'white', color: '#BB0000', border: '1px solid #D5D7DA', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <Ban size={14} />
                    </button>
                  )}
                  {d.estado !== 'Em_Execucao' && (
                    <button onClick={() => apagar(d)} title="Apagar"
                      style={{ padding: '6px 10px', background: 'white', color: '#8996A3', border: '1px solid #D5D7DA', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div style={{ marginTop: '12px' }}>
                <div style={{ height: '6px', background: '#E7E9EB', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${feito}%`, background: d.estado === 'Cancelado' ? '#BB0000' : '#0E5A6B', transition: 'width 0.4s' }} />
                </div>
                <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '12px', color: '#5B738B', flexWrap: 'wrap' }}>
                  <span><b style={{ color: '#1D2D3E' }}>{m.total}</b> contactos</span>
                  <span style={{ color: '#107E3E' }}>{m.enviados} feitos</span>
                  {m.falhados > 0 && <span style={{ color: '#BB0000' }}>{m.falhados} falharam</span>}
                  {m.ignorados > 0 && <span style={{ color: '#8A4B0B' }}>{m.ignorados} ignorados</span>}
                  {m.pendentes > 0 && <span>{m.pendentes} por fazer</span>}
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
function NovoDisparo({ onVoltar, onCriado }: { onVoltar: () => void; onCriado: () => void }) {
  const [fluxos, setFluxos] = useState<any[]>([]);
  const [fluxoId, setFluxoId] = useState<number | ''>('');
  const [nome, setNome] = useState('');
  const [publicoTipo, setPublicoTipo] = useState<'tags' | 'todos'>('tags');
  const [tags, setTags] = useState<string[]>([]);
  const [etiquetas, setEtiquetas] = useState<any[]>([]);
  const [velocidade, setVelocidade] = useState(6);
  const [previa, setPrevia] = useState<{ total: number; amostra: string[] } | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    (async () => {
      const [rF, rE] = await Promise.all([
        authFetch(`${API}/api/automation`),
        authFetch(`${API}/api/etiquetas`)
      ]);
      const dF = await rF.json();
      const dE = await rE.json();
      if (dF.success) setFluxos((dF.automations || []).filter((a: any) => a.ativo));
      if (dE.success) setEtiquetas(dE.etiquetas || []);
    })();
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await authFetch(`${API}/api/automation/disparos/previsualizar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publico_tipo: publicoTipo, publico_tags: tags })
      });
      const d = await r.json();
      setPrevia(d.success ? { total: d.total, amostra: d.amostra || [] } : null);
    }, 350);
    return () => clearTimeout(t);
  }, [publicoTipo, tags]);

  const criar = async () => {
    setAGuardar(true); setErro('');
    const r = await authFetch(`${API}/api/automation/disparos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        automation_id: fluxoId, nome, publico_tipo: publicoTipo,
        publico_tags: tags, velocidade_por_minuto: velocidade
      })
    });
    const d = await r.json();
    setAGuardar(false);
    if (!d.success) { setErro(d.error || 'Não foi possível criar.'); return; }
    onCriado();
  };

  const rotulo = { display: 'block', fontSize: '13px', fontWeight: 600, color: '#1D2D3E', marginBottom: '6px' } as const;
  const campo = { width: '100%', padding: '10px 12px', border: '1px solid #D5D7DA', borderRadius: '2px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, background: '#F5F6F7', overflowY: 'auto', padding: '26px 32px' }}>
      <button onClick={onVoltar} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#5B738B', cursor: 'pointer', fontSize: '13px', padding: 0, marginBottom: '14px' }}>
        <ArrowLeft size={15} /> Voltar aos disparos
      </button>
      <h2 style={{ margin: '0 0 20px', fontSize: '20px', color: '#1D2D3E' }}>Novo disparo</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '24px', alignItems: 'start' }}>
        <div style={{ background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label style={rotulo}>Que fluxo vai correr</label>
            <select value={fluxoId} onChange={e => setFluxoId(Number(e.target.value) || '')} style={campo}>
              <option value="">— escolher —</option>
              {fluxos.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
            <div style={{ fontSize: '12px', color: '#5B738B', marginTop: '6px', lineHeight: 1.55 }}>
              Só aparecem os fluxos ligados. O fluxo corre do princípio, como se o cliente
              tivesse acabado de escrever — por isso convém começar por um bloco que diga algo.
            </div>
          </div>
          <div>
            <label style={rotulo}>Nome do disparo <span style={{ fontWeight: 400, color: '#8996A3' }}>(só você vê)</span></label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Seguimento dos interessados de setembro" style={campo} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px', padding: '18px' }}>
            <label style={rotulo}>Quem recebe</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
              {([['tags', 'Os que têm certas etiquetas'], ['todos', 'Todos os contactos']] as const).map(([v, t]) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', color: '#1D2D3E', cursor: 'pointer' }}>
                  <input type="radio" checked={publicoTipo === v} onChange={() => setPublicoTipo(v)} /> {t}
                </label>
              ))}
            </div>

            {publicoTipo === 'tags' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {etiquetas.length === 0 && <span style={{ fontSize: '12.5px', color: '#8996A3' }}>Ainda não há etiquetas. Crie em Definições → Etiquetas.</span>}
                {etiquetas.map(e => (
                  <button key={e.id} onClick={() => setTags(p => p.includes(e.nome) ? p.filter(x => x !== e.nome) : [...p, e.nome])}
                    style={{ padding: '4px 11px', borderRadius: '2px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: `1px solid ${tags.includes(e.nome) ? e.cor : '#D5D7DA'}`, background: tags.includes(e.nome) ? e.cor : 'white', color: tags.includes(e.nome) ? 'white' : '#5B738B' }}>
                    {e.nome}
                  </button>
                ))}
              </div>
            )}

            <div style={{ marginTop: '14px', padding: '12px', background: '#F5F6F7', borderRadius: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#1D2D3E', fontSize: '14px' }}>
                <Users size={15} /> {previa ? `${previa.total} pessoas` : '...'}
              </div>
              {!!previa?.amostra.length && (
                <div style={{ fontSize: '11.5px', color: '#5B738B', marginTop: '4px', lineHeight: 1.5 }}>
                  {previa.amostra.join(', ')}{previa.total > previa.amostra.length ? '…' : ''}
                </div>
              )}
            </div>
          </div>

          <div style={{ background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px', padding: '18px' }}>
            <label style={rotulo}>Ritmo</label>
            <input type="range" min={1} max={12} value={velocidade} onChange={e => setVelocidade(Number(e.target.value))} style={{ width: '100%' }} />
            <div style={{ fontSize: '13px', color: '#1D2D3E', fontWeight: 600 }}>{velocidade} pessoas por minuto</div>
            <div style={{ fontSize: '11.5px', color: '#5B738B', marginTop: '6px', lineHeight: 1.55 }}>
              Devagar é mais seguro. Acima de 12 por minuto um número pessoal arrisca ser banido,
              por isso esse é o limite.
              {previa?.total ? ` A este ritmo, ${previa.total} pessoas levam cerca de ${Math.max(1, Math.ceil(previa.total / velocidade))} minuto(s).` : ''}
            </div>
          </div>

          {erro && (
            <div style={{ display: 'flex', gap: '8px', padding: '12px', background: '#F6DEDE', color: '#BB0000', borderRadius: '2px', fontSize: '13px', lineHeight: 1.5 }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} /> {erro}
            </div>
          )}

          <button onClick={criar} disabled={!fluxoId || aGuardar || !previa?.total}
            style={{ padding: '12px', background: fluxoId && previa?.total ? '#0E5A6B' : '#B8C2CC', color: 'white', border: 'none', borderRadius: '2px', fontWeight: 700, cursor: fluxoId && previa?.total ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {aGuardar ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />} Criar disparo
          </button>
          <div style={{ fontSize: '11.5px', color: '#5B738B', textAlign: 'center', lineHeight: 1.5 }}>
            Fica por começar. Só sai quando carregar em <b>Começar</b> na lista.
          </div>
        </div>
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ============================================================
function DetalheDisparo({ disparo, onVoltar }: { disparo: Disparo; onVoltar: () => void }) {
  const [linhas, setLinhas] = useState<any[]>([]);
  const [filtro, setFiltro] = useState<'todos' | 'Enviado' | 'Falhou' | 'Pendente' | 'Ignorado'>('todos');

  useEffect(() => {
    (async () => {
      const r = await authFetch(`${API}/api/automation/disparos/${disparo.id}/destinatarios`);
      const d = await r.json();
      if (d.success) setLinhas(d.destinatarios || []);
    })();
  }, [disparo.id]);

  const visiveis = filtro === 'todos' ? linhas : linhas.filter(l => l.estado === filtro);
  const nomeEstado: Record<string, string> = { Enviado: 'Feito', Falhou: 'Falhou', Pendente: 'Por fazer', Ignorado: 'Ignorado' };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, background: '#F5F6F7', overflowY: 'auto', padding: '26px 32px' }}>
      <button onClick={onVoltar} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#5B738B', cursor: 'pointer', fontSize: '13px', padding: 0, marginBottom: '14px' }}>
        <ArrowLeft size={15} /> Voltar aos disparos
      </button>
      <h2 style={{ margin: '0 0 16px', fontSize: '20px', color: '#1D2D3E' }}>{disparo.nome}</h2>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {(['todos', 'Enviado', 'Falhou', 'Ignorado', 'Pendente'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            style={{ padding: '6px 12px', borderRadius: '2px', fontSize: '13px', cursor: 'pointer', border: '1px solid #D5D7DA', background: filtro === f ? '#0E5A6B' : 'white', color: filtro === f ? 'white' : '#5B738B' }}>
            {f === 'todos' ? 'Todos' : nomeEstado[f]} ({f === 'todos' ? linhas.length : linhas.filter(l => l.estado === f).length})
          </button>
        ))}
      </div>

      <div style={{ background: 'white', border: '1px solid #D5D7DA', borderRadius: '2px' }}>
        {visiveis.length === 0 && <div style={{ padding: '22px', color: '#8996A3', fontSize: '13.5px', textAlign: 'center' }}>Nada para mostrar aqui.</div>}
        {visiveis.map((l, i) => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderTop: i ? '1px solid #F0F1F2' : 'none' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13.5px', color: '#1D2D3E', fontWeight: 600 }}>{l.nome || l.telefone}</div>
              {l.nome && <div style={{ fontSize: '12px', color: '#8996A3' }}>{l.telefone}</div>}
              {l.erro && <div style={{ fontSize: '12px', color: l.estado === 'Ignorado' ? '#8A4B0B' : '#BB0000', marginTop: '2px' }}>{l.erro}</div>}
            </div>
            <span style={{
              fontSize: '11.5px', fontWeight: 700, padding: '3px 10px', borderRadius: '2px', whiteSpace: 'nowrap',
              background: l.estado === 'Enviado' ? '#DCEEE2' : l.estado === 'Falhou' ? '#F6DEDE' : l.estado === 'Ignorado' ? '#FCEFDD' : '#E7E9EB',
              color: l.estado === 'Enviado' ? '#107E3E' : l.estado === 'Falhou' ? '#BB0000' : l.estado === 'Ignorado' ? '#8A4B0B' : '#5B738B'
            }}>
              {nomeEstado[l.estado] || l.estado}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
