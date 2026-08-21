import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Wallet, TrendingUp, TrendingDown, AlertCircle, Paperclip, X,
  CheckCircle2, FileText, Users, Settings, BarChart3, Receipt, Loader2
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import './FinanceiroApp.css';

const authFetch = (url: string, options: any = {}) => {
  const token = localStorage.getItem('os_auth_token');
  const headers = { ...options.headers, Authorization: `Bearer ${token}` };
  return fetch(url, { ...options, headers });
};

const API = import.meta.env.VITE_API_URL;

function formatKz(value: number) {
  return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(value || 0);
}

const CATEGORIAS: Record<'entrada' | 'saida', string[]> = {
  entrada: ['Vendas', 'Serviços Prestados', 'Outras Receitas'],
  saida: ['Salários', 'Fornecedores', 'Renda', 'Impostos', 'Marketing', 'Equipamento', 'Água / Luz / Internet', 'Outras Despesas'],
};

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function FinanceiroApp() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transacoes' | 'salarios' | 'avancado'>('dashboard');

  return (
    <div className="fin-modern">
      <div className="fin-header">
        <div>
          <h1>Financeiro</h1>
          <p>Controle simples das entradas, saídas, faturas e salários da empresa.</p>
        </div>
        <div className="fin-pillnav">
          <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>Visão Geral</button>
          <button className={activeTab === 'transacoes' ? 'active' : ''} onClick={() => setActiveTab('transacoes')}>Transações</button>
          <button className={activeTab === 'salarios' ? 'active' : ''} onClick={() => setActiveTab('salarios')}>Salários</button>
          <button className={activeTab === 'avancado' ? 'active' : ''} onClick={() => setActiveTab('avancado')}>Avançado</button>
        </div>
      </div>

      <div className="fin-body">
        {activeTab === 'dashboard' && <DashboardTab onIrParaTransacoes={() => setActiveTab('transacoes')} />}
        {activeTab === 'transacoes' && <TransacoesTab />}
        {activeTab === 'salarios' && <SalariosTab />}
        {activeTab === 'avancado' && <AvancadoTab />}
      </div>
    </div>
  );
}

// ============================================================
// VISÃO GERAL
// ============================================================
function DashboardTab({ onIrParaTransacoes }: { onIrParaTransacoes: () => void }) {
  const [resumo, setResumo] = useState<any>(null);
  const [recentes, setRecentes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const resR = await authFetch(`${API}/api/financeiro/resumo`);
        const dataR = await resR.json();
        if (dataR.success) setResumo(dataR);

        const resT = await authFetch(`${API}/api/financeiro/transacoes`);
        const dataT = await resT.json();
        if (dataT.success) setRecentes((dataT.transacoes || []).slice(0, 6));
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Loader2 className="animate-spin" size={28} color="#017E84" /></div>;
  }

  return (
    <>
      <div className="fin-kpi-grid">
        <div className="fin-kpi-card">
          <div className="fin-kpi-icon"><Wallet size={16} /></div>
          <div className="fin-kpi-value">{formatKz(resumo?.saldo || 0)}</div>
          <div className="fin-kpi-label">Saldo Atual</div>
        </div>
        <div className="fin-kpi-card">
          <div className="fin-kpi-icon good"><TrendingUp size={16} /></div>
          <div className="fin-kpi-value">{formatKz(resumo?.entradasMes || 0)}</div>
          <div className="fin-kpi-label">Entradas do Mês</div>
        </div>
        <div className="fin-kpi-card">
          <div className="fin-kpi-icon bad"><TrendingDown size={16} /></div>
          <div className="fin-kpi-value">{formatKz(resumo?.saidasMes || 0)}</div>
          <div className="fin-kpi-label">Saídas do Mês</div>
        </div>
        <div className="fin-kpi-card">
          <div className="fin-kpi-icon warn"><AlertCircle size={16} /></div>
          <div className="fin-kpi-value">{resumo?.pendentesCount || 0}</div>
          <div className="fin-kpi-label">Faturas Pendentes</div>
        </div>
      </div>

      <div className="fin-panel">
        <div className="fin-panel-title"><span className="fin-panel-icon"><BarChart3 size={15} /></span> Fluxo de Caixa (últimos 6 meses)</div>
        <div style={{ height: '300px' }}>
          {resumo?.fluxo?.length > 0 ? (
            <ResponsiveContainer width="99%" height={300}>
              <BarChart data={resumo.fluxo} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF2F1" />
                <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#5B6B67', fontSize: 12, fontFamily: 'IBM Plex Sans' }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#5B6B67', fontSize: 11, fontFamily: 'IBM Plex Mono' }} dx={-6} />
                <RechartsTooltip contentStyle={{ borderRadius: '10px', border: '1px solid #E2E8E6', fontFamily: 'IBM Plex Sans', fontSize: '13px' }} formatter={(v: any) => formatKz(Number(v))} />
                <Legend wrapperStyle={{ fontSize: '12px', fontFamily: 'IBM Plex Sans' }} />
                <Bar dataKey="entradas" name="Entradas" fill="#017E84" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Bar dataKey="saidas" name="Saídas" fill="#B23A3A" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fin-ink-faint)' }}>
              Ainda sem movimentos registados.
            </div>
          )}
        </div>
      </div>

      <div className="fin-panel" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div className="fin-panel-title" style={{ marginBottom: 0 }}><span className="fin-panel-icon"><Receipt size={15} /></span> Últimas Transações</div>
          <button className="fin-btn fin-btn-sm" onClick={onIrParaTransacoes}>Ver todas</button>
        </div>
        {recentes.length === 0 ? (
          <div className="fin-empty-state" style={{ padding: '24px' }}>Ainda não há transações registadas.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {recentes.map((t: any) => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px', borderBottom: '1px solid var(--fin-border-soft)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{t.descricao || t.categoria}</div>
                  <div style={{ fontSize: '12px', color: 'var(--fin-ink-muted)' }}>{t.categoria} · {new Date(t.data).toLocaleDateString('pt-PT')}</div>
                </div>
                <div className={`fin-num ${t.tipo}`}>{t.tipo === 'entrada' ? '+' : '−'} {formatKz(t.valor)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================
// TRANSAÇÕES
// ============================================================
function TransacoesTab() {
  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    tipo: 'entrada' as 'entrada' | 'saida',
    categoria: CATEGORIAS.entrada[0],
    descricao: '',
    valor: '',
    data: new Date().toISOString().split('T')[0],
    estado: 'Pago' as 'Pago' | 'Pendente',
    data_vencimento: '',
    forma_pagamento: 'Transferência Bancária',
  });
  const [anexo, setAnexo] = useState<File | null>(null);

  const fetchTransacoes = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filtroTipo ? `?tipo=${filtroTipo}` : '';
      const res = await authFetch(`${API}/api/financeiro/transacoes${qs}`);
      const data = await res.json();
      if (data.success) setTransacoes(data.transacoes || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [filtroTipo]);

  useEffect(() => { fetchTransacoes(); }, [fetchTransacoes]);

  const resetForm = () => {
    setForm({ tipo: 'entrada', categoria: CATEGORIAS.entrada[0], descricao: '', valor: '', data: new Date().toISOString().split('T')[0], estado: 'Pago', data_vencimento: '', forma_pagamento: 'Transferência Bancária' });
    setAnexo(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== '' && v !== undefined) fd.append(k, String(v)); });
      if (anexo) fd.append('anexo', anexo);

      const res = await authFetch(`${API}/api/financeiro/transacoes`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        resetForm();
        fetchTransacoes();
      } else {
        alert(data.error || 'Erro ao gravar transação.');
      }
    } catch (err) {
      alert('Erro de comunicação com o servidor.');
    }
    setSaving(false);
  };

  const marcarPago = async (id: number) => {
    try {
      const res = await authFetch(`${API}/api/financeiro/transacoes/${id}/pagar`, { method: 'PUT' });
      const data = await res.json();
      if (data.success) fetchTransacoes(); else alert(data.error);
    } catch (e) { alert('Erro ao marcar como pago.'); }
  };

  const apagar = async (id: number) => {
    if (!window.confirm('Apagar esta transação? Esta ação não pode ser desfeita.')) return;
    try {
      const res = await authFetch(`${API}/api/financeiro/transacoes/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) fetchTransacoes(); else alert(data.error);
    } catch (e) { alert('Erro ao apagar transação.'); }
  };

  return (
    <>
      <div className="fin-toolbar">
        <button className="fin-btn fin-btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Nova Transação</button>
        <div className="fin-filters">
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
            <option value="">Todas</option>
            <option value="entrada">Só Entradas</option>
            <option value="saida">Só Saídas</option>
          </select>
        </div>
      </div>

      <div className="fin-table-card">
        <table>
          <thead>
            <tr>
              <th>Data</th><th>Categoria</th><th>Descrição</th><th>Anexo</th><th>Estado</th>
              <th style={{ textAlign: 'right' }}>Valor</th><th style={{ textAlign: 'center' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="fin-empty-row">A carregar...</td></tr>}
            {!loading && transacoes.length === 0 && <tr><td colSpan={7} className="fin-empty-row">Nenhuma transação registada. Clique em "Nova Transação" para começar.</td></tr>}
            {!loading && transacoes.map((t: any) => (
              <tr key={t.id}>
                <td>{new Date(t.data).toLocaleDateString('pt-PT')}</td>
                <td><span className="fin-tag">{t.categoria}</span></td>
                <td>{t.descricao || '—'}</td>
                <td>
                  {t.anexo_path ? (
                    <a className="fin-attach-link" href={`${API}${t.anexo_path}`} target="_blank" rel="noreferrer"><Paperclip size={12} /> Ver</a>
                  ) : '—'}
                </td>
                <td>
                  {t.estado === 'Pago' ? <span className="fin-badge fin-badge-good">Pago</span> : <span className="fin-badge fin-badge-warn">Pendente</span>}
                </td>
                <td style={{ textAlign: 'right' }}><span className={`fin-num ${t.tipo}`}>{t.tipo === 'entrada' ? '+' : '−'} {formatKz(t.valor)}</span></td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                    {t.estado === 'Pendente' && (
                      <button onClick={() => marcarPago(t.id)} title="Marcar como pago" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fin-good-fg)' }}><CheckCircle2 size={16} /></button>
                    )}
                    <button onClick={() => apagar(t.id)} title="Apagar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fin-bad-fg)' }}><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fin-modal-overlay">
          <div className="fin-modal-card" style={{ width: '460px' }}>
            <h3>Nova Transação</h3>
            <form onSubmit={handleSave}>
              <div className="fin-field">
                <label>Tipo</label>
                <div className="fin-toggle-group">
                  <button type="button" className={form.tipo === 'entrada' ? 'active entrada' : ''} onClick={() => setForm({ ...form, tipo: 'entrada', categoria: CATEGORIAS.entrada[0] })}>Entrada (Recebi)</button>
                  <button type="button" className={form.tipo === 'saida' ? 'active saida' : ''} onClick={() => setForm({ ...form, tipo: 'saida', categoria: CATEGORIAS.saida[0] })}>Saída (Paguei)</button>
                </div>
              </div>
              <div className="fin-field-row">
                <div className="fin-field">
                  <label>Categoria</label>
                  <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
                    {CATEGORIAS[form.tipo].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="fin-field">
                  <label>Valor (Kz) *</label>
                  <input required type="number" min="1" step="1" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} />
                </div>
              </div>
              <div className="fin-field">
                <label>Descrição</label>
                <input type="text" placeholder="Ex: Fatura do fornecedor X" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} />
              </div>
              <div className="fin-field-row">
                <div className="fin-field">
                  <label>Data</label>
                  <input required type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
                </div>
                <div className="fin-field">
                  <label>Forma de Pagamento</label>
                  <select value={form.forma_pagamento} onChange={e => setForm({ ...form, forma_pagamento: e.target.value })}>
                    <option>Transferência Bancária</option>
                    <option>Numerário / Multicaixa</option>
                    <option>Cheque</option>
                  </select>
                </div>
              </div>
              <div className="fin-field">
                <label>Estado</label>
                <div className="fin-toggle-group">
                  <button type="button" className={form.estado === 'Pago' ? 'active entrada' : ''} onClick={() => setForm({ ...form, estado: 'Pago' })}>Já foi pago</button>
                  <button type="button" className={form.estado === 'Pendente' ? 'active saida' : ''} onClick={() => setForm({ ...form, estado: 'Pendente' })}>Ainda por pagar</button>
                </div>
              </div>
              {form.estado === 'Pendente' && (
                <div className="fin-field">
                  <label>Data de Vencimento</label>
                  <input type="date" value={form.data_vencimento} onChange={e => setForm({ ...form, data_vencimento: e.target.value })} />
                </div>
              )}
              <div className="fin-field">
                <label>Anexar Fatura / Recibo (opcional)</label>
                <input type="file" accept="image/*,.pdf" onChange={e => setAnexo(e.target.files?.[0] || null)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button type="button" className="fin-btn" onClick={() => { setShowModal(false); resetForm(); }}>Cancelar</button>
                <button type="submit" className="fin-btn fin-btn-primary" disabled={saving}>{saving ? 'A Gravar...' : 'Gravar Transação'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// SALÁRIOS (dados reais lidos do RH)
// ============================================================
function SalariosTab() {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [dados, setDados] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/api/financeiro/salarios/${mes}/${ano}`);
      const data = await res.json();
      if (data.success) setDados(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [mes, ano]);

  useEffect(() => { carregar(); }, [carregar]);

  const verRecibo = async (reciboId: number) => {
    try {
      const res = await authFetch(`${API}/api/hr/recibo/${reciboId}/pdf`);
      const data = await res.json();
      if (data.success) window.open(`${API}${data.pdf_path}`, '_blank');
      else alert('Erro ao gerar recibo.');
    } catch (e) { alert('Erro ao gerar recibo.'); }
  };

  return (
    <>
      <div className="fin-toolbar">
        <div className="fin-filters">
          <select value={mes} onChange={e => setMes(Number(e.target.value))}>
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={ano} onChange={e => setAno(Number(e.target.value))}>
            {[hoje.getFullYear() - 1, hoje.getFullYear(), hoje.getFullYear() + 1].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Loader2 className="animate-spin" size={28} color="#017E84" /></div>
      ) : !dados?.processado ? (
        <div className="fin-panel">
          <div className="fin-empty-state">
            <div className="fin-empty-state-icon"><Users size={22} /></div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--fin-ink)', marginBottom: '6px' }}>{MESES[mes - 1]} de {ano} ainda não foi processado</h3>
            <p style={{ margin: 0, fontSize: '13.5px', maxWidth: '380px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
              Vá a <b>Recursos Humanos → Processamento</b> e clique em "Processar Salários" para este mês. Assim que estiver pronto, o custo salarial aparece aqui automaticamente.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="fin-kpi-grid">
            <div className="fin-kpi-card">
              <div className="fin-kpi-icon"><Wallet size={16} /></div>
              <div className="fin-kpi-value">{formatKz(dados.total)}</div>
              <div className="fin-kpi-label">Custo Salarial do Mês</div>
            </div>
            <div className="fin-kpi-card">
              <div className="fin-kpi-icon"><Users size={16} /></div>
              <div className="fin-kpi-value">{dados.recibos?.length || 0}</div>
              <div className="fin-kpi-label">Colaboradores Pagos</div>
            </div>
            <div className="fin-kpi-card">
              <div className="fin-kpi-icon" style={dados.estado === 'Fechado' ? { background: 'var(--fin-good-bg)', color: 'var(--fin-good-fg)' } : undefined}><CheckCircle2 size={16} /></div>
              <div className="fin-kpi-value" style={{ fontFamily: 'var(--fin-font-body)', fontSize: '15px' }}>{dados.estado === 'Fechado' ? 'Fechado' : 'Rascunho'}</div>
              <div className="fin-kpi-label">Estado do Processamento</div>
            </div>
          </div>

          <div className="fin-table-card">
            <table>
              <thead>
                <tr><th>Colaborador</th><th style={{ textAlign: 'right' }}>Salário Base</th><th style={{ textAlign: 'right' }}>Líquido a Receber</th><th style={{ textAlign: 'center' }}>Recibo</th></tr>
              </thead>
              <tbody>
                {(dados.recibos || []).map((r: any) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.nome}</td>
                    <td style={{ textAlign: 'right' }} className="fin-num">{formatKz(r.salario_base)}</td>
                    <td style={{ textAlign: 'right' }} className="fin-num entrada">{formatKz(r.total_liquido)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="fin-btn fin-btn-sm" onClick={() => verRecibo(r.id)}><FileText size={12} /> PDF</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

// ============================================================
// AVANÇADO (Contabilista) — partidas dobradas, mantido para quem precisar
// ============================================================
function AvancadoTab() {
  const [subTab, setSubTab] = useState<'contas' | 'diarios' | 'lancamentos' | 'balancete'>('contas');
  const [contas, setContas] = useState<any[]>([]);
  const [diarios, setDiarios] = useState<any[]>([]);
  const [exercicios, setExercicios] = useState<any[]>([]);
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [balancete, setBalancete] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const carregarDadosBase = async () => {
    setLoading(true);
    try {
      const resC = await authFetch(`${API}/api/accounting/contas`);
      const dataC = await resC.json();
      if (dataC.success) setContas(dataC.contas);

      const resD = await authFetch(`${API}/api/accounting/diarios`);
      const dataD = await resD.json();
      if (dataD.success) setDiarios(dataD.diarios);

      const resE = await authFetch(`${API}/api/accounting/exercicios`);
      const dataE = await resE.json();
      if (dataE.success) {
        setExercicios(dataE.exercicios);
        if (dataE.exercicios.length > 0) {
          carregarLancamentos(dataE.exercicios[0].id);
          carregarBalancete(dataE.exercicios[0].id);
        }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const carregarLancamentos = async (ex_id: number) => {
    try {
      const res = await authFetch(`${API}/api/accounting/lancamentos?exercicio_id=${ex_id}`);
      const data = await res.json();
      if (data.success) setLancamentos(data.lancamentos);
    } catch (e) { }
  };

  const carregarBalancete = async (ex_id: number) => {
    try {
      const res = await authFetch(`${API}/api/accounting/balancete?exercicio_id=${ex_id}`);
      const data = await res.json();
      if (data.success) setBalancete(data.balancete);
    } catch (e) { }
  };

  useEffect(() => { carregarDadosBase(); }, []);

  return (
    <div>
      <div className="fin-advanced-note">
        <Settings size={16} /> Esta área usa contabilidade formal por partidas dobradas. Destina-se a quem tem um contabilista a apoiar a empresa — para o dia a dia, use as abas "Visão Geral" e "Transações".
      </div>

      <div className="fin-subnav">
        <button className={subTab === 'contas' ? 'active' : ''} onClick={() => setSubTab('contas')}>Plano de Contas</button>
        <button className={subTab === 'diarios' ? 'active' : ''} onClick={() => setSubTab('diarios')}>Diários e Exercícios</button>
        <button className={subTab === 'lancamentos' ? 'active' : ''} onClick={() => setSubTab('lancamentos')}>Lançamentos</button>
        <button className={subTab === 'balancete' ? 'active' : ''} onClick={() => setSubTab('balancete')}>Balancete</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Loader2 className="animate-spin" size={28} color="#017E84" /></div>
      ) : (
        <>
          {subTab === 'contas' && <AvPlanosDeContas contas={contas} refresh={carregarDadosBase} />}
          {subTab === 'diarios' && <AvDiariosExercicios diarios={diarios} exercicios={exercicios} refresh={carregarDadosBase} />}
          {subTab === 'lancamentos' && <AvLancamentos lancamentos={lancamentos} diarios={diarios} exercicios={exercicios} contas={contas} refresh={() => exercicios.length > 0 && carregarLancamentos(exercicios[0].id)} />}
          {subTab === 'balancete' && <AvBalancete balancete={balancete} />}
        </>
      )}
    </div>
  );
}

function AvPlanosDeContas({ contas, refresh }: { contas: any[]; refresh: () => void }) {
  const [open, setOpen] = useState(false);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    const data = { conta: e.target.conta.value, descricao: e.target.descricao.value, tipo: e.target.tipo.value, natureza: e.target.natureza.value };
    await authFetch(`${API}/api/accounting/contas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setOpen(false);
    refresh();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
        <h3 style={{ fontSize: '15px' }}>Plano de Contas</h3>
        <button className="fin-btn fin-btn-sm fin-btn-primary" onClick={() => setOpen(true)}><Plus size={14} /> Nova Conta</button>
      </div>

      {open && (
        <div className="fin-panel">
          <form onSubmit={handleSubmit} className="fin-field-row">
            <div className="fin-field"><label>Nº Conta</label><input name="conta" required placeholder="Ex: 11.1" /></div>
            <div className="fin-field"><label>Descrição</label><input name="descricao" required placeholder="Caixa Central" /></div>
            <div className="fin-field"><label>Tipo</label>
              <select name="tipo"><option>Activo</option><option>Passivo</option><option>Capital</option><option>Proveito</option><option>Custo</option></select>
            </div>
            <div className="fin-field"><label>Natureza</label><select name="natureza"><option>Devedora</option><option>Credora</option></select></div>
            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="fin-btn" onClick={() => setOpen(false)}>Cancelar</button>
              <button type="submit" className="fin-btn fin-btn-primary">Guardar Conta</button>
            </div>
          </form>
        </div>
      )}

      <div className="fin-table-card">
        <table>
          <thead><tr><th>Conta</th><th>Descrição</th><th>Tipo</th><th>Natureza</th></tr></thead>
          <tbody>
            {contas.length === 0 && <tr><td colSpan={4} className="fin-empty-row">Sem contas registadas.</td></tr>}
            {contas.map(c => (
              <tr key={c.id}><td style={{ fontWeight: 600 }}>{c.conta}</td><td>{c.descricao}</td><td>{c.tipo}</td><td>{c.natureza}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AvDiariosExercicios({ diarios, exercicios, refresh }: { diarios: any[]; exercicios: any[]; refresh: () => void }) {
  const handleExercicio = async (e: any) => {
    e.preventDefault();
    await authFetch(`${API}/api/accounting/exercicios`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ano: e.target.ano.value }) });
    refresh();
  };
  const handleDiario = async (e: any) => {
    e.preventDefault();
    await authFetch(`${API}/api/accounting/diarios`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: e.target.codigo.value, descricao: e.target.descricao.value }) });
    refresh();
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
      <div className="fin-panel">
        <h3 style={{ fontSize: '15px', marginBottom: '14px' }}>Exercícios Fiscais</h3>
        <form onSubmit={handleExercicio} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <input name="ano" type="number" required placeholder="Ano (ex: 2026)" style={{ flex: 1, padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--fin-border)' }} />
          <button type="submit" className="fin-btn fin-btn-primary">Abrir Ano</button>
        </form>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {exercicios.map(ex => (
            <div key={ex.id} style={{ padding: '12px', background: 'var(--fin-canvas)', border: '1px solid var(--fin-border-soft)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700 }}>Ano Fiscal {ex.ano}</span>
              <span className="fin-badge fin-badge-good">{ex.estado}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="fin-panel">
        <h3 style={{ fontSize: '15px', marginBottom: '14px' }}>Diários de Lançamento</h3>
        <form onSubmit={handleDiario} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <input name="codigo" required placeholder="Cód" style={{ width: '70px', padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--fin-border)' }} />
          <input name="descricao" required placeholder="Descrição (ex: Vendas)" style={{ flex: 1, padding: '9px 12px', borderRadius: '9px', border: '1px solid var(--fin-border)' }} />
          <button type="submit" className="fin-btn fin-btn-primary">Criar</button>
        </form>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {diarios.map(d => (
            <div key={d.id} style={{ padding: '12px', background: 'var(--fin-canvas)', border: '1px solid var(--fin-border-soft)', borderRadius: '10px' }}>
              <strong>{d.codigo}</strong> — {d.descricao}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AvLancamentos({ lancamentos, diarios, exercicios, contas, refresh }: { lancamentos: any[]; diarios: any[]; exercicios: any[]; contas: any[]; refresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [linhas, setLinhas] = useState<any[]>([{ conta_id: '', debito: 0, credito: 0 }, { conta_id: '', debito: 0, credito: 0 }]);

  const totalDebito = linhas.reduce((acc, l) => acc + Number(l.debito || 0), 0);
  const totalCredito = linhas.reduce((acc, l) => acc + Number(l.credito || 0), 0);
  const isBalanced = totalDebito === totalCredito && totalDebito > 0;

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!isBalanced) return alert('Partida dobrada inválida. Débitos e Créditos devem ser iguais.');
    const data = {
      diario_id: e.target.diario_id.value, exercicio_id: e.target.exercicio_id.value,
      data_lancamento: e.target.data_lancamento.value, descricao: e.target.descricao.value,
      documento_referencia: e.target.documento_referencia.value, linhas
    };
    const res = await authFetch(`${API}/api/accounting/lancamentos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await res.json();
    if (result.success) {
      setOpen(false); refresh();
      setLinhas([{ conta_id: '', debito: 0, credito: 0 }, { conta_id: '', debito: 0, credito: 0 }]);
    } else alert('Erro: ' + result.error);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
        <h3 style={{ fontSize: '15px' }}>Lançamentos Contabilísticos</h3>
        <button className="fin-btn fin-btn-sm fin-btn-primary" onClick={() => setOpen(true)}><Plus size={14} /> Novo Lançamento</button>
      </div>

      {open && (
        <div className="fin-panel">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '18px' }}>
              <div className="fin-field" style={{ marginBottom: 0 }}><label>Exercício</label><select name="exercicio_id" required>{exercicios.map(ex => <option key={ex.id} value={ex.id}>{ex.ano}</option>)}</select></div>
              <div className="fin-field" style={{ marginBottom: 0 }}><label>Diário</label><select name="diario_id" required>{diarios.map(d => <option key={d.id} value={d.id}>{d.codigo} - {d.descricao}</option>)}</select></div>
              <div className="fin-field" style={{ marginBottom: 0 }}><label>Data</label><input name="data_lancamento" type="date" required defaultValue={new Date().toISOString().split('T')[0]} /></div>
              <div className="fin-field" style={{ marginBottom: 0 }}><label>Documento</label><input name="documento_referencia" placeholder="Fatura Nº 123" /></div>
              <div className="fin-field" style={{ gridColumn: 'span 4', marginBottom: 0 }}><label>Descrição</label><input name="descricao" required placeholder="Venda de Mercadorias..." /></div>
            </div>

            <div style={{ background: 'var(--fin-canvas)', padding: '14px', borderRadius: '10px', border: '1px solid var(--fin-border-soft)' }}>
              {linhas.map((l, index) => (
                <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <select value={l.conta_id} required style={{ flex: 1, padding: '9px', borderRadius: '9px', border: '1px solid var(--fin-border)' }}
                    onChange={e => { const n = [...linhas]; n[index].conta_id = e.target.value; setLinhas(n); }}>
                    <option value="">Selecione a Conta...</option>
                    {contas.map(c => <option key={c.id} value={c.id}>{c.conta} - {c.descricao}</option>)}
                  </select>
                  <input type="number" placeholder="Débito" value={l.debito || ''} style={{ width: '130px', padding: '9px', borderRadius: '9px', border: '1px solid var(--fin-border)' }}
                    onChange={e => { const n = [...linhas]; n[index].debito = Number(e.target.value); setLinhas(n); }} />
                  <input type="number" placeholder="Crédito" value={l.credito || ''} style={{ width: '130px', padding: '9px', borderRadius: '9px', border: '1px solid var(--fin-border)' }}
                    onChange={e => { const n = [...linhas]; n[index].credito = Number(e.target.value); setLinhas(n); }} />
                </div>
              ))}
              <button type="button" className="fin-btn" style={{ width: '100%' }} onClick={() => setLinhas([...linhas, { conta_id: '', debito: 0, credito: 0 }])}>+ Adicionar Linha</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '18px' }}>
              <div style={{ fontSize: '13px', color: totalDebito === totalCredito ? 'var(--fin-ink-muted)' : 'var(--fin-bad-fg)' }}>
                Débitos: <strong>{totalDebito}</strong> &nbsp; Créditos: <strong>{totalCredito}</strong>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="fin-btn" onClick={() => setOpen(false)}>Cancelar</button>
                <button type="submit" className="fin-btn fin-btn-primary" disabled={!isBalanced}>Gravar Lançamento</button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {lancamentos.length === 0 && <div className="fin-empty-state">Sem lançamentos efetuados.</div>}
        {lancamentos.map(lanc => (
          <div key={lanc.id} className="fin-table-card">
            <div style={{ padding: '12px 16px', background: 'var(--fin-canvas)', borderBottom: '1px solid var(--fin-border)' }}>
              <strong>LAN Nº {lanc.id} — {lanc.descricao}</strong>
              <div style={{ fontSize: '12px', color: 'var(--fin-ink-muted)', marginTop: '2px' }}>Diário {lanc.diario_codigo} · Data: {lanc.data_lancamento} · Doc: {lanc.documento_referencia || 'N/A'}</div>
            </div>
            <table>
              <tbody>
                {lanc.linhas?.map((linha: any) => (
                  <tr key={linha.id}>
                    <td>{linha.conta} - {linha.conta_descricao}</td>
                    <td style={{ textAlign: 'right' }}>{linha.debito > 0 ? linha.debito : ''}</td>
                    <td style={{ textAlign: 'right' }}>{linha.credito > 0 ? linha.credito : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function AvBalancete({ balancete }: { balancete: any[] }) {
  let totalD = 0, totalC = 0, totalS = 0;
  balancete.forEach(b => { totalD += b.total_debito; totalC += b.total_credito; totalS += b.saldo; });

  return (
    <div>
      <h3 style={{ fontSize: '15px', marginBottom: '18px' }}>Balancete de Verificação</h3>
      <div className="fin-table-card">
        <table>
          <thead><tr><th>Conta</th><th>Descrição</th><th style={{ textAlign: 'right' }}>Débito</th><th style={{ textAlign: 'right' }}>Crédito</th><th style={{ textAlign: 'right' }}>Saldo</th></tr></thead>
          <tbody>
            {balancete.length === 0 && <tr><td colSpan={5} className="fin-empty-row">Sem movimentos neste exercício.</td></tr>}
            {balancete.map((b, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{b.conta}</td><td>{b.descricao}</td>
                <td style={{ textAlign: 'right' }} className="fin-num">{formatKz(b.total_debito)}</td>
                <td style={{ textAlign: 'right' }} className="fin-num">{formatKz(b.total_credito)}</td>
                <td style={{ textAlign: 'right' }} className={`fin-num ${b.saldo > 0 ? 'entrada' : b.saldo < 0 ? 'saida' : ''}`}>{formatKz(b.saldo)}</td>
              </tr>
            ))}
            {balancete.length > 0 && (
              <tr style={{ background: 'var(--fin-canvas)', fontWeight: 700 }}>
                <td colSpan={2} style={{ textAlign: 'right' }}>TOTAIS:</td>
                <td style={{ textAlign: 'right' }} className="fin-num">{formatKz(totalD)}</td>
                <td style={{ textAlign: 'right' }} className="fin-num">{formatKz(totalC)}</td>
                <td style={{ textAlign: 'right' }} className="fin-num">{formatKz(totalS)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
