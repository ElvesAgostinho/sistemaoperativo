import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, LayoutGrid, Scissors, Users, Clock, Link as LinkIcon, Plus, Trash2, Check, X,
  RotateCcw, Bell, Settings as SettingsIcon, Copy, CalendarClock, CheckCircle2
} from 'lucide-react';
import './AgendamentoApp.css';

const API = import.meta.env.VITE_API_URL;
const authFetch = (url: string, options: any = {}) => {
  const token = localStorage.getItem('os_auth_token');
  return fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
};

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const ESTADO_BADGE: Record<string, { cls: string; label: string }> = {
  Agendado: { cls: 'ag-badge-info', label: 'Agendado' },
  Confirmado: { cls: 'ag-badge-good', label: 'Confirmado' },
  Cancelado: { cls: 'ag-badge-bad', label: 'Cancelado' },
  Concluido: { cls: 'ag-badge-good', label: 'Concluído' },
  Nao_Compareceu: { cls: 'ag-badge-warn', label: 'Não Compareceu' },
};

export default function AgendamentoApp() {
  const [view, setView] = useState<'dashboard' | 'marcacoes' | 'servicos' | 'profissionais' | 'horarios' | 'link'>('dashboard');
  const empresaId = (() => {
    try { return JSON.parse(localStorage.getItem('os_auth_user') || '{}')?.empresa_id; } catch { return null; }
  })();

  return (
    <div className="ag-shell">
      <div className="ag-header">
        <div className="ag-header-title"><CalendarClock size={20} color="#C9992E" /> Agendamento</div>
        <div className="ag-header-actions">
          <div className="ag-header-icon-btn"><Bell size={16} /></div>
          <div className="ag-header-icon-btn"><SettingsIcon size={16} /></div>
        </div>
      </div>

      <div className="ag-body">
        <div className="ag-sidebar">
          <div className="ag-sidebar-group">
            <button className={`ag-sidebar-link${view === 'dashboard' ? ' active' : ''}`} onClick={() => setView('dashboard')}><LayoutGrid size={16} /> Dashboard</button>
            <button className={`ag-sidebar-link${view === 'marcacoes' ? ' active' : ''}`} onClick={() => setView('marcacoes')}><Calendar size={16} /> Marcações</button>
          </div>
          <div>
            <div className="ag-sidebar-group-label">Gestão</div>
            <div className="ag-sidebar-group">
              <button className={`ag-sidebar-link${view === 'servicos' ? ' active' : ''}`} onClick={() => setView('servicos')}><Scissors size={16} /> Serviços</button>
              <button className={`ag-sidebar-link${view === 'profissionais' ? ' active' : ''}`} onClick={() => setView('profissionais')}><Users size={16} /> Profissionais</button>
            </div>
          </div>
          <div>
            <div className="ag-sidebar-group-label">Configurações</div>
            <div className="ag-sidebar-group">
              <button className={`ag-sidebar-link${view === 'horarios' ? ' active' : ''}`} onClick={() => setView('horarios')}><Clock size={16} /> Horário</button>
              <button className={`ag-sidebar-link${view === 'link' ? ' active' : ''}`} onClick={() => setView('link')}><LinkIcon size={16} /> Link de Marcação</button>
            </div>
          </div>
        </div>

        <div className="ag-content">
          {view === 'dashboard' && <DashboardView onIrParaMarcacoes={() => setView('marcacoes')} />}
          {view === 'marcacoes' && <MarcacoesView />}
          {view === 'servicos' && <ServicosView />}
          {view === 'profissionais' && <ProfissionaisView />}
          {view === 'horarios' && <HorariosView />}
          {view === 'link' && <LinkView empresaId={empresaId} />}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function DashboardView({ onIrParaMarcacoes }: { onIrParaMarcacoes: () => void }) {
  const [resumo, setResumo] = useState<any>(null);
  const [proximas, setProximas] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const r1 = await authFetch(`${API}/api/agendamento/resumo`);
      const d1 = await r1.json();
      if (d1.success) setResumo(d1);

      const hoje = new Date().toISOString().slice(0, 10);
      const r2 = await authFetch(`${API}/api/agendamento/marcacoes?data_inicio=${hoje}`);
      const d2 = await r2.json();
      if (d2.success) setProximas((d2.agendamentos || []).filter((a: any) => a.estado !== 'Cancelado').slice(0, 6));
    })();
  }, []);

  return (
    <>
      <div className="ag-content-head">
        <div><h2>Visão Geral</h2><p>O que está a acontecer no seu negócio agora.</p></div>
      </div>

      <div className="ag-kpi-grid">
        <div className="ag-kpi-card">
          <div className="ag-kpi-top"><div className="ag-kpi-icon"><Calendar size={17} /></div></div>
          <div className="ag-kpi-value">{resumo?.marcacoesHoje ?? '—'}</div>
          <div className="ag-kpi-label">Marcações Hoje</div>
        </div>
        <div className="ag-kpi-card">
          <div className="ag-kpi-top"><div className="ag-kpi-icon"><CheckCircle2 size={17} /></div></div>
          <div className="ag-kpi-value">{resumo?.confirmadasHoje ?? '—'}</div>
          <div className="ag-kpi-label">Confirmadas Hoje</div>
        </div>
        <div className="ag-kpi-top" style={{ display: 'none' }} />
        <div className="ag-kpi-card">
          <div className="ag-kpi-top"><div className="ag-kpi-icon"><CalendarClock size={17} /></div></div>
          <div className="ag-kpi-value">{resumo?.proximos7dias ?? '—'}</div>
          <div className="ag-kpi-label">Próximos 7 Dias</div>
        </div>
        <div className="ag-kpi-card">
          <div className="ag-kpi-top"><div className="ag-kpi-icon"><Scissors size={17} /></div></div>
          <div className="ag-kpi-value">{resumo?.servicosAtivos ?? '—'}</div>
          <div className="ag-kpi-label">Serviços Ativos</div>
        </div>
      </div>

      <div className="ag-panel" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div className="ag-panel-title" style={{ marginBottom: 0 }}><Calendar size={16} color="#C9992E" /> Próximas Marcações</div>
          <button className="ag-btn ag-btn-sm" onClick={onIrParaMarcacoes}>Ver todas</button>
        </div>
        {proximas.length === 0 ? (
          <div className="ag-empty-state" style={{ padding: '24px' }}>Sem marcações a caminho.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {proximas.map((a: any) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px', borderBottom: '1px solid var(--ag-border)' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13.5px' }}>{a.cliente_nome} <span style={{ color: 'var(--ag-ink-muted)', fontWeight: 500 }}>· {a.servico_nome}</span></div>
                  <div style={{ fontSize: '12px', color: 'var(--ag-ink-muted)' }}>{new Date(a.data).toLocaleDateString('pt-PT')} às {a.hora_inicio.slice(0, 5)}{a.profissional_nome ? ` · ${a.profissional_nome}` : ''}</div>
                </div>
                <span className={`ag-badge ${ESTADO_BADGE[a.estado]?.cls || 'ag-badge-info'}`}>{ESTADO_BADGE[a.estado]?.label || a.estado}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================
// MARCAÇÕES
// ============================================================
function MarcacoesView() {
  const [marcacoes, setMarcacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNovo, setShowNovo] = useState(false);
  const [remarcarAlvo, setRemarcarAlvo] = useState<any>(null);

  const fetchMarcacoes = useCallback(async () => {
    setLoading(true);
    const res = await authFetch(`${API}/api/agendamento/marcacoes`);
    const data = await res.json();
    if (data.success) setMarcacoes(data.agendamentos || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchMarcacoes(); }, [fetchMarcacoes]);

  const cancelar = async (id: number) => {
    if (!window.confirm('Cancelar esta marcação? O cliente será notificado.')) return;
    const res = await authFetch(`${API}/api/agendamento/marcacoes/${id}/cancelar`, { method: 'PUT' });
    const data = await res.json();
    if (data.success) fetchMarcacoes(); else alert(data.error);
  };
  const confirmar = async (id: number) => {
    const res = await authFetch(`${API}/api/agendamento/marcacoes/${id}/estado`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: 'Confirmado' }) });
    const data = await res.json();
    if (data.success) fetchMarcacoes(); else alert(data.error);
  };
  const eliminar = async (id: number) => {
    if (!window.confirm('Eliminar esta marcação definitivamente?')) return;
    const res = await authFetch(`${API}/api/agendamento/marcacoes/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) fetchMarcacoes(); else alert(data.error);
  };

  return (
    <>
      <div className="ag-content-head">
        <div><h2>Marcações</h2><p>Todas as marcações, passadas e futuras.</p></div>
        <button className="ag-btn ag-btn-primary" onClick={() => setShowNovo(true)}><Plus size={16} /> Nova Marcação</button>
      </div>

      <div className="ag-table-card">
        <table>
          <thead>
            <tr><th>Cliente</th><th>Serviço</th><th>Data / Hora</th><th>Profissional</th><th>Estado</th><th style={{ textAlign: 'center' }}>Ações</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="ag-empty-row">A carregar...</td></tr>}
            {!loading && marcacoes.length === 0 && <tr><td colSpan={6} className="ag-empty-row">Nenhuma marcação ainda. Clique em "Nova Marcação" para começar.</td></tr>}
            {!loading && marcacoes.map((a: any) => (
              <tr key={a.id}>
                <td><div style={{ fontWeight: 700 }}>{a.cliente_nome}</div><div style={{ fontSize: '12px', color: 'var(--ag-ink-muted)' }}>{a.cliente_telefone}</div></td>
                <td>{a.servico_nome}</td>
                <td>{new Date(a.data).toLocaleDateString('pt-PT')} · {a.hora_inicio.slice(0, 5)}</td>
                <td>{a.profissional_nome || '—'}</td>
                <td><span className={`ag-badge ${ESTADO_BADGE[a.estado]?.cls || 'ag-badge-info'}`}>{ESTADO_BADGE[a.estado]?.label || a.estado}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                    {a.estado === 'Agendado' && (
                      <button onClick={() => confirmar(a.id)} title="Confirmar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ag-good-fg)' }}><Check size={16} /></button>
                    )}
                    {a.estado !== 'Cancelado' && (
                      <>
                        <button onClick={() => setRemarcarAlvo(a)} title="Remarcar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ag-gold-hover)' }}><RotateCcw size={15} /></button>
                        <button onClick={() => cancelar(a.id)} title="Cancelar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ag-warn-fg)' }}><X size={16} /></button>
                      </>
                    )}
                    <button onClick={() => eliminar(a.id)} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ag-bad-fg)' }}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNovo && <NovaMarcacaoModal onClose={() => setShowNovo(false)} onCreated={() => { setShowNovo(false); fetchMarcacoes(); }} />}
      {remarcarAlvo && <RemarcarModal marcacao={remarcarAlvo} onClose={() => setRemarcarAlvo(null)} onSaved={() => { setRemarcarAlvo(null); fetchMarcacoes(); }} />}
    </>
  );
}

function NovaMarcacaoModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [servicos, setServicos] = useState<any[]>([]);
  const [profissionais, setProfissionais] = useState<any[]>([]);
  const [servicoId, setServicoId] = useState('');
  const [profissionalId, setProfissionalId] = useState('');
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<string[]>([]);
  const [hora, setHora] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const r1 = await authFetch(`${API}/api/agendamento/servicos`);
      const d1 = await r1.json();
      if (d1.success) { setServicos(d1.servicos); if (d1.servicos[0]) setServicoId(String(d1.servicos[0].id)); }
      const r2 = await authFetch(`${API}/api/agendamento/profissionais`);
      const d2 = await r2.json();
      if (d2.success) setProfissionais(d2.profissionais);
    })();
  }, []);

  useEffect(() => {
    if (!servicoId || !data) return;
    (async () => {
      setHora('');
      const qs = new URLSearchParams({ servico_id: servicoId, data, ...(profissionalId ? { profissional_id: profissionalId } : {}) });
      const res = await authFetch(`${API}/api/agendamento/disponibilidade?${qs}`);
      const d = await res.json();
      if (d.success) setSlots(d.horarios || []);
    })();
  }, [servicoId, data, profissionalId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hora) return alert('Escolha um horário disponível.');
    setSaving(true);
    const res = await authFetch(`${API}/api/agendamento/marcacoes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ servico_id: Number(servicoId), profissional_id: profissionalId ? Number(profissionalId) : undefined, cliente_nome: nome, cliente_telefone: telefone, data, hora_inicio: hora })
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) onCreated(); else alert(d.error);
  };

  return (
    <div className="ag-modal-overlay">
      <div className="ag-modal-card">
        <h3>Nova Marcação</h3>
        <form onSubmit={handleSave}>
          <div className="ag-field"><label>Cliente</label><input required value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do cliente" /></div>
          <div className="ag-field"><label>Telefone (WhatsApp)</label><input required value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="9XX XXX XXX" /></div>
          <div className="ag-field-row">
            <div className="ag-field"><label>Serviço</label>
              <select value={servicoId} onChange={e => setServicoId(e.target.value)}>
                {servicos.map(s => <option key={s.id} value={s.id}>{s.nome} ({s.duracao_minutos}min)</option>)}
              </select>
            </div>
            <div className="ag-field"><label>Profissional</label>
              <select value={profissionalId} onChange={e => setProfissionalId(e.target.value)}>
                <option value="">Qualquer um</option>
                {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="ag-field"><label>Data</label><input required type="date" value={data} onChange={e => setData(e.target.value)} /></div>
          <div className="ag-field">
            <label>Horário disponível</label>
            {slots.length === 0 ? (
              <div style={{ fontSize: '12.5px', color: 'var(--ag-ink-muted)', padding: '10px 0' }}>Sem horários livres neste dia.</div>
            ) : (
              <div className="ag-slot-grid">
                {slots.map(s => (
                  <button type="button" key={s} className={`ag-slot-btn${hora === s ? ' selected' : ''}`} onClick={() => setHora(s)}>{s}</button>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
            <button type="button" className="ag-btn" onClick={onClose}>Cancelar</button>
            <button type="submit" className="ag-btn ag-btn-primary" disabled={saving || !hora}>{saving ? 'A Gravar...' : 'Marcar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RemarcarModal({ marcacao, onClose, onSaved }: { marcacao: any; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState(marcacao.data);
  const [slots, setSlots] = useState<string[]>([]);
  const [hora, setHora] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setHora('');
      const qs = new URLSearchParams({ servico_id: String(marcacao.servico_id), data, ...(marcacao.profissional_id ? { profissional_id: String(marcacao.profissional_id) } : {}) });
      const res = await authFetch(`${API}/api/agendamento/disponibilidade?${qs}`);
      const d = await res.json();
      if (d.success) setSlots(d.horarios || []);
    })();
  }, [data]);

  const handleSave = async () => {
    if (!hora) return alert('Escolha um novo horário disponível.');
    setSaving(true);
    const res = await authFetch(`${API}/api/agendamento/marcacoes/${marcacao.id}/remarcar`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data, hora_inicio: hora })
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) onSaved(); else alert(d.error);
  };

  return (
    <div className="ag-modal-overlay">
      <div className="ag-modal-card">
        <h3>Remarcar — {marcacao.cliente_nome}</h3>
        <p style={{ fontSize: '13px', color: 'var(--ag-ink-muted)', marginTop: '-8px', marginBottom: '16px' }}>
          Escolha um novo dia — o sistema mostra automaticamente só os horários livres.
        </p>
        <div className="ag-field"><label>Nova Data</label><input type="date" value={data} onChange={e => setData(e.target.value)} /></div>
        <div className="ag-field">
          <label>Novo Horário</label>
          {slots.length === 0 ? (
            <div style={{ fontSize: '12.5px', color: 'var(--ag-ink-muted)', padding: '10px 0' }}>Sem horários livres neste dia.</div>
          ) : (
            <div className="ag-slot-grid">
              {slots.map(s => (
                <button type="button" key={s} className={`ag-slot-btn${hora === s ? ' selected' : ''}`} onClick={() => setHora(s)}>{s}</button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
          <button type="button" className="ag-btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="ag-btn ag-btn-primary" disabled={saving || !hora} onClick={handleSave}>{saving ? 'A Gravar...' : 'Remarcar'}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SERVIÇOS
// ============================================================
function ServicosView() {
  const [servicos, setServicos] = useState<any[]>([]);
  const [showNovo, setShowNovo] = useState(false);
  const [nome, setNome] = useState('');
  const [duracao, setDuracao] = useState('30');
  const [preco, setPreco] = useState('');

  const fetchServicos = useCallback(async () => {
    const res = await authFetch(`${API}/api/agendamento/servicos`);
    const data = await res.json();
    if (data.success) setServicos(data.servicos || []);
  }, []);
  useEffect(() => { fetchServicos(); }, [fetchServicos]);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await authFetch(`${API}/api/agendamento/servicos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, duracao_minutos: Number(duracao), preco: preco ? Number(preco) : null }) });
    const d = await res.json();
    if (d.success) { setShowNovo(false); setNome(''); setDuracao('30'); setPreco(''); fetchServicos(); } else alert(d.error);
  };
  const apagar = async (id: number) => {
    if (!window.confirm('Desativar este serviço?')) return;
    await authFetch(`${API}/api/agendamento/servicos/${id}`, { method: 'DELETE' });
    fetchServicos();
  };

  return (
    <>
      <div className="ag-content-head">
        <div><h2>Serviços</h2><p>O que os seus clientes podem marcar.</p></div>
        <button className="ag-btn ag-btn-primary" onClick={() => setShowNovo(true)}><Plus size={16} /> Novo Serviço</button>
      </div>
      <div className="ag-table-card">
        <table>
          <thead><tr><th>Serviço</th><th>Duração</th><th>Preço</th><th style={{ textAlign: 'center' }}>Ações</th></tr></thead>
          <tbody>
            {servicos.length === 0 && <tr><td colSpan={4} className="ag-empty-row">Nenhum serviço configurado.</td></tr>}
            {servicos.map(s => (
              <tr key={s.id}>
                <td><span className="ag-dot" style={{ background: s.cor }} />{s.nome}</td>
                <td>{s.duracao_minutos} min</td>
                <td>{s.preco ? `${Number(s.preco).toLocaleString('pt-AO')} Kz` : '—'}</td>
                <td style={{ textAlign: 'center' }}><button onClick={() => apagar(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ag-bad-fg)' }}><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showNovo && (
        <div className="ag-modal-overlay">
          <div className="ag-modal-card">
            <h3>Novo Serviço</h3>
            <form onSubmit={criar}>
              <div className="ag-field"><label>Nome</label><input required value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Consulta, Corte de Cabelo, Reunião..." /></div>
              <div className="ag-field-row">
                <div className="ag-field"><label>Duração (min)</label><input required type="number" min="5" step="5" value={duracao} onChange={e => setDuracao(e.target.value)} /></div>
                <div className="ag-field"><label>Preço (Kz, opcional)</label><input type="number" value={preco} onChange={e => setPreco(e.target.value)} /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="ag-btn" onClick={() => setShowNovo(false)}>Cancelar</button>
                <button type="submit" className="ag-btn ag-btn-primary">Gravar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// PROFISSIONAIS
// ============================================================
function ProfissionaisView() {
  const [lista, setLista] = useState<any[]>([]);
  const [nome, setNome] = useState('');

  const fetchLista = useCallback(async () => {
    const res = await authFetch(`${API}/api/agendamento/profissionais`);
    const data = await res.json();
    if (data.success) setLista(data.profissionais || []);
  }, []);
  useEffect(() => { fetchLista(); }, [fetchLista]);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    await authFetch(`${API}/api/agendamento/profissionais`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }) });
    setNome(''); fetchLista();
  };
  const apagar = async (id: number) => {
    if (!window.confirm('Desativar este profissional?')) return;
    await authFetch(`${API}/api/agendamento/profissionais/${id}`, { method: 'DELETE' });
    fetchLista();
  };

  return (
    <>
      <div className="ag-content-head"><div><h2>Profissionais</h2><p>Quem atende as marcações (opcional).</p></div></div>
      <div className="ag-panel">
        <form onSubmit={criar} style={{ display: 'flex', gap: '10px' }}>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do profissional" style={{ flex: 1, padding: '10px 12px', borderRadius: '9px', border: '1px solid var(--ag-border)', fontFamily: 'var(--ag-font-body)' }} />
          <button type="submit" className="ag-btn ag-btn-primary"><Plus size={15} /> Adicionar</button>
        </form>
      </div>
      <div className="ag-table-card">
        <table>
          <thead><tr><th>Nome</th><th style={{ textAlign: 'center' }}>Ações</th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={2} className="ag-empty-row">Nenhum profissional adicionado — as marcações ficam sem atribuição específica.</td></tr>}
            {lista.map(p => (
              <tr key={p.id}><td style={{ fontWeight: 600 }}>{p.nome}</td><td style={{ textAlign: 'center' }}><button onClick={() => apagar(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ag-bad-fg)' }}><Trash2 size={15} /></button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ============================================================
// HORÁRIOS
// ============================================================
function HorariosView() {
  const [horarios, setHorarios] = useState<Record<number, any>>({});

  const fetchHorarios = useCallback(async () => {
    const res = await authFetch(`${API}/api/agendamento/horarios`);
    const data = await res.json();
    if (data.success) {
      const map: Record<number, any> = {};
      DIAS.forEach((_, i) => { map[i] = { dia_semana: i, hora_inicio: '09:00', hora_fim: '18:00', ativo: i !== 0 }; });
      (data.horarios || []).forEach((h: any) => { map[h.dia_semana] = { ...h, hora_inicio: h.hora_inicio.slice(0, 5), hora_fim: h.hora_fim.slice(0, 5) }; });
      setHorarios(map);
    }
  }, []);
  useEffect(() => { fetchHorarios(); }, [fetchHorarios]);

  const salvar = async (dia: number) => {
    const h = horarios[dia];
    const res = await authFetch(`${API}/api/agendamento/horarios`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(h) });
    const d = await res.json();
    if (!d.success) alert(d.error);
  };

  return (
    <>
      <div className="ag-content-head"><div><h2>Horário de Funcionamento</h2><p>Define quando os clientes podem marcar. Guarda automaticamente ao alterar.</p></div></div>
      <div className="ag-panel">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {DIAS.map((nome, i) => {
            const h = horarios[i];
            if (!h) return null;
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr auto', gap: '12px', alignItems: 'center', padding: '10px 4px', borderBottom: i < 6 ? '1px solid var(--ag-border)' : 'none' }}>
                <span style={{ fontWeight: 700, fontSize: '13.5px' }}>{nome}</span>
                <input type="time" value={h.hora_inicio} disabled={!h.ativo} onChange={e => setHorarios({ ...horarios, [i]: { ...h, hora_inicio: e.target.value } })} onBlur={() => salvar(i)} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--ag-border)' }} />
                <input type="time" value={h.hora_fim} disabled={!h.ativo} onChange={e => setHorarios({ ...horarios, [i]: { ...h, hora_fim: e.target.value } })} onBlur={() => salvar(i)} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--ag-border)' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={h.ativo} onChange={e => { const novo = { ...h, ativo: e.target.checked }; setHorarios({ ...horarios, [i]: novo }); setTimeout(() => salvar(i), 0); }} /> Aberto
                </label>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ============================================================
// LINK DE MARCAÇÃO
// ============================================================
function LinkView({ empresaId }: { empresaId: string | null }) {
  const [copiado, setCopiado] = useState(false);
  const link = empresaId ? `${window.location.origin}/agendar/${empresaId}` : '';

  return (
    <>
      <div className="ag-content-head"><div><h2>Link de Marcação</h2><p>Um extra opcional — a marcação automática já funciona sem link, diretamente pelo WhatsApp.</p></div></div>

      <div className="ag-panel" style={{ background: 'var(--ag-gold-soft)', borderColor: 'var(--ag-gold)' }}>
        <div className="ag-panel-title" style={{ marginBottom: '8px' }}>Como a marcação automática funciona hoje</div>
        <p style={{ fontSize: '13px', color: 'var(--ag-ink)', lineHeight: 1.7, margin: 0 }}>
          Quando um cliente escreve para o seu número de WhatsApp a pedir para marcar, o Assistente IA conduz a
          conversa sozinho — mostra os serviços, verifica os horários realmente livres, confirma o nome e cria a
          marcação ali mesmo no chat. O mesmo cliente também pode pedir para ver, remarcar ou cancelar as suas
          marcações, sempre pela conversa. Não é enviado nenhum link a ninguém neste processo.
          <br /><br />
          Além disso, você (dono) pode sempre criar, cancelar ou remarcar marcações manualmente em "Marcações".
        </p>
      </div>

      <div className="ag-panel">
        <div className="ag-panel-title" style={{ marginBottom: '8px' }}>Link opcional para partilhar</div>
        {!empresaId ? (
          <div className="ag-empty-state"><div className="ag-empty-state-icon"><LinkIcon size={20} /></div>Não foi possível determinar a sua empresa.</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input readOnly value={link} style={{ flex: 1, padding: '11px 14px', borderRadius: '10px', border: '1px solid var(--ag-border)', background: 'var(--ag-canvas)', fontFamily: 'var(--ag-font-mono)', fontSize: '13px' }} />
              <button className="ag-btn ag-btn-primary" onClick={() => { navigator.clipboard.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}>
                <Copy size={15} /> {copiado ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--ag-ink-muted)', marginTop: '16px', lineHeight: 1.6 }}>
              Só é preciso se quiser publicar um link direto (ex: na bio do Instagram ou num site). O WhatsApp
              não depende disto.
            </p>
          </>
        )}
      </div>
    </>
  );
}
