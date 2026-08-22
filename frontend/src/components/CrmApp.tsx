import React, { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronRight, Check, X, Building, DollarSign, Target, TrendingUp, Users, XCircle } from 'lucide-react';
import './CrmApp.css';

interface Cliente {
  id: number;
  nome: string;
  email: string | null;
  telefone: string | null;
  empresa: string | null;
}

interface Negocio {
  id: number;
  cliente_id: number;
  cliente_nome: string;
  cliente_empresa: string;
  titulo: string;
  valor_estimado: number;
  fase: string;
}

const authFetch = (url: string, options: any = {}) => {
  const token = localStorage.getItem('os_auth_token');
  const headers = { ...options.headers, Authorization: `Bearer ${token}` };
  return fetch(url, { ...options, headers });
};

function formatKz(value: number) {
  return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', minimumFractionDigits: 0 }).format(value || 0);
}

const FASES: { key: string; label: string; color: string }[] = [
  { key: 'Nova Lead', label: '1. Novas Leads', color: '#8B9B97' },
  { key: 'Em Negociação', label: '2. Em Negociação', color: '#B7791F' },
  { key: 'Proposta Enviada', label: '3. Proposta Enviada', color: '#2E5C8A' },
  { key: 'Ganho', label: '4. Ganhos', color: '#1F7A45' },
  { key: 'Perdido', label: '5. Perdidos', color: '#B23A3A' },
];

export default function CrmApp() {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'clientes'>('pipeline');

  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [searchCliente, setSearchCliente] = useState('');

  const [showClienteModal, setShowClienteModal] = useState(false);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [showProformaModal, setShowProformaModal] = useState<number | null>(null);
  const [showPagamentoModal, setShowPagamentoModal] = useState<number | null>(null);
  const [pagamentoData, setPagamentoData] = useState({ valor: '', metodo_pagamento: 'Transferência Bancária', data_pagamento: new Date().toISOString().split('T')[0] });

  const [newCliente, setNewCliente] = useState({ nome: '', email: '', telefone: '', empresa: '' });
  const [newLead, setNewLead] = useState({ titulo: '', cliente_id: '', valor_estimado: '' });
  const [proformaItens, setProformaItens] = useState([{ descricao: '', qtd: 1, preco_unitario: 0 }]);
  const [catalogoProforma, setCatalogoProforma] = useState<{ nome: string; preco: string }[]>([]);

  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  const fetchDados = async () => {
    setIsFetching(true);
    try {
      const resC = await authFetch(import.meta.env.VITE_API_URL + '/api/crm/clientes');
      const dataC = await resC.json();
      if (dataC.success) setClientes(dataC.clientes);

      const resN = await authFetch(import.meta.env.VITE_API_URL + '/api/crm/negocios');
      const dataN = await resN.json();
      if (dataN.success) setNegocios(dataN.negocios);
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchDados();
  }, []);

  useEffect(() => {
    if (showProformaModal === null) return;
    (async () => {
      try {
        const res = await authFetch(import.meta.env.VITE_API_URL + '/api/settings/empresa');
        const data = await res.json();
        if (data.success && data.config?.PROFORMA_CATALOGO) {
          const parsed = JSON.parse(data.config.PROFORMA_CATALOGO);
          if (Array.isArray(parsed)) setCatalogoProforma(parsed);
        }
      } catch { /* catálogo é opcional — falha silenciosamente */ }
    })();
  }, [showProformaModal]);

  const addItemDoCatalogo = (item: { nome: string; preco: string }) => {
    setProformaItens(prev => {
      const semLinhaVazia = prev.filter(i => i.descricao.trim() !== '');
      return [...semLinhaVazia, { descricao: item.nome, qtd: 1, preco_unitario: Number(item.preco) || 0 }];
    });
  };

  const handleSaveCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authFetch(import.meta.env.VITE_API_URL + '/api/crm/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCliente)
      });
      const data = await res.json();
      if (data.success) {
        setShowClienteModal(false);
        setNewCliente({ nome: '', email: '', telefone: '', empresa: '' });
        fetchDados();
      } else alert(data.error);
    } catch (err) {
      alert("Erro ao gravar cliente");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authFetch(import.meta.env.VITE_API_URL + '/api/crm/negocios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: newLead.titulo,
          cliente_id: Number(newLead.cliente_id),
          valor_estimado: Number(newLead.valor_estimado)
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowLeadModal(false);
        setNewLead({ titulo: '', cliente_id: '', valor_estimado: '' });
        fetchDados();
      } else alert(data.error);
    } catch (err) {
      alert("Erro ao gravar lead");
    } finally {
      setLoading(false);
    }
  };

  const deleteCliente = async (id: number) => {
    if (!window.confirm("Atenção: Ao apagar o cliente, apagará também todos os negócios e leads associados. Deseja continuar?")) return;
    try {
      await authFetch(`${import.meta.env.VITE_API_URL}/api/crm/clientes/${id}`, { method: 'DELETE' });
      fetchDados();
    } catch (err) {
      alert("Erro ao apagar cliente.");
    }
  };

  const deleteNegocio = async (id: number) => {
    if (!window.confirm("Tem a certeza que deseja apagar este negócio? Esta ação é irreversível.")) return;
    try {
      await authFetch(`${import.meta.env.VITE_API_URL}/api/crm/negocios/${id}`, { method: 'DELETE' });
      fetchDados();
    } catch (err) {
      alert("Erro ao apagar negócio.");
    }
  };

  const moveFase = async (negocio_id: number, nova_fase: string) => {
    try {
      await authFetch(`${import.meta.env.VITE_API_URL}/api/crm/negocios/${negocio_id}/fase`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fase: nova_fase })
      });
      fetchDados();
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerateProforma = async () => {
    if (!showProformaModal) return;
    setLoading(true);
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/api/crm/negocios/${showProformaModal}/proforma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: proformaItens })
      });
      const data = await res.json();
      if (data.success) {
        window.open(import.meta.env.VITE_API_URL + data.pdf_path, '_blank');
        setShowProformaModal(null);
        setProformaItens([{ descricao: '', qtd: 1, preco_unitario: 0 }]);
        fetchDados();
      } else alert(data.error);
    } catch (err) {
      alert("Erro");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPagamentoModal) return;
    setLoading(true);
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/api/crm/negocios/${showPagamentoModal}/pagamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pagamentoData)
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setShowPagamentoModal(null);
        setPagamentoData({ valor: '', metodo_pagamento: 'Transferência Bancária', data_pagamento: new Date().toISOString().split('T')[0] });
        fetchDados();
      } else alert(data.error);
    } catch (err) {
      alert("Erro ao registar pagamento");
    } finally {
      setLoading(false);
    }
  };

  const pipelineAtivo = negocios.filter(n => n.fase !== 'Ganho' && n.fase !== 'Perdido').reduce((acc, n) => acc + (n.valor_estimado || 0), 0);
  const totalGanho = negocios.filter(n => n.fase === 'Ganho').reduce((acc, n) => acc + (n.valor_estimado || 0), 0);
  const negociosPerdidos = negocios.filter(n => n.fase === 'Perdido').length;

  const renderColumn = (fase: string, label: string, color: string) => {
    const list = negocios.filter(n => n.fase === fase);
    return (
      <div className="crm-kanban-col" key={fase}>
        <div className="crm-kanban-col-head">
          <div className="crm-kanban-col-title">
            <span className="crm-kanban-dot" style={{ backgroundColor: color }} />
            {label}
          </div>
          <span className="crm-kanban-count">{list.length}</span>
        </div>

        {list.map(negocio => (
          <div key={negocio.id} className="crm-deal-card">
            <button className="crm-deal-delete" onClick={() => deleteNegocio(negocio.id)} title="Apagar Negócio">
              <Trash2 size={14} />
            </button>
            <div className="crm-deal-title">{negocio.titulo}</div>
            <div className="crm-deal-client">
              <Building size={12} /> {negocio.cliente_empresa || negocio.cliente_nome}
            </div>

            {negocio.valor_estimado > 0 && (
              <div className="crm-deal-value">{formatKz(negocio.valor_estimado)}</div>
            )}

            <div className="crm-deal-actions">
              {fase === 'Nova Lead' && (
                <button className="crm-btn crm-btn-sm" style={{ flex: 1 }} onClick={() => moveFase(negocio.id, 'Em Negociação')}>Negociar <ChevronRight size={12} /></button>
              )}
              {fase === 'Em Negociação' && (
                <>
                  <button className="crm-btn crm-btn-sm crm-btn-primary" style={{ flex: 1 }} onClick={() => setShowProformaModal(negocio.id)}>Gerar Proforma</button>
                  <button className="crm-btn crm-btn-sm" onClick={() => moveFase(negocio.id, 'Proposta Enviada')}><ChevronRight size={12} /></button>
                </>
              )}
              {fase === 'Proposta Enviada' && (
                <>
                  <button className="crm-btn crm-btn-sm crm-btn-ghost-good" style={{ flex: 1 }} onClick={() => moveFase(negocio.id, 'Ganho')}><Check size={12} /> Ganho</button>
                  <button className="crm-btn crm-btn-sm crm-btn-ghost-bad" style={{ flex: 1 }} onClick={() => moveFase(negocio.id, 'Perdido')}><X size={12} /> Perdido</button>
                </>
              )}
              {fase === 'Ganho' && (
                <button
                  className="crm-btn crm-btn-sm crm-btn-good"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setShowPagamentoModal(negocio.id);
                    setPagamentoData({ ...pagamentoData, valor: negocio.valor_estimado.toString() });
                  }}
                >
                  <DollarSign size={12} /> Registar Pagamento
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="crm-modern">
      <div className="crm-header">
        <h1>{activeTab === 'pipeline' ? 'Funil de Vendas' : 'Diretório de Clientes'}</h1>
        <div className="crm-pillnav">
          <button className={activeTab === 'pipeline' ? 'active' : ''} onClick={() => setActiveTab('pipeline')}>Funil de Vendas</button>
          <button className={activeTab === 'clientes' ? 'active' : ''} onClick={() => setActiveTab('clientes')}>Clientes</button>
        </div>
      </div>

      <div className="crm-body">

        {activeTab === 'pipeline' && (
          <>
            <div className="crm-kpi-grid">
              <div className="crm-kpi-card">
                <div className="crm-kpi-icon"><Target size={16} /></div>
                <div className="crm-kpi-value">{formatKz(pipelineAtivo)}</div>
                <div className="crm-kpi-label">Pipeline Ativo</div>
              </div>
              <div className="crm-kpi-card">
                <div className="crm-kpi-icon"><TrendingUp size={16} /></div>
                <div className="crm-kpi-value">{formatKz(totalGanho)}</div>
                <div className="crm-kpi-label">Receita Ganha</div>
              </div>
              <div className="crm-kpi-card">
                <div className="crm-kpi-icon"><Users size={16} /></div>
                <div className="crm-kpi-value">{clientes.length}</div>
                <div className="crm-kpi-label">Total de Clientes</div>
              </div>
              <div className="crm-kpi-card">
                <div className="crm-kpi-icon"><XCircle size={16} /></div>
                <div className="crm-kpi-value">{negociosPerdidos}</div>
                <div className="crm-kpi-label">Negócios Perdidos</div>
              </div>
            </div>

            <div className="crm-toolbar">
              <button className="crm-btn crm-btn-primary" onClick={() => setShowLeadModal(true)}>
                <Plus size={16} /> Novo Negócio (Lead)
              </button>
            </div>

            <div className="crm-kanban">
              {FASES.map(f => renderColumn(f.key, f.label, f.color))}
            </div>
          </>
        )}

        {activeTab === 'clientes' && (
          <>
            <div className="crm-toolbar">
              <button className="crm-btn crm-btn-primary" onClick={() => setShowClienteModal(true)}>
                <Plus size={16} /> Novo Cliente
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '12.5px', color: 'var(--crm-ink-muted)' }}>Total: {clientes.length} clientes</span>
                <input
                  type="text"
                  placeholder="Pesquisar cliente por nome, email ou telefone..."
                  value={searchCliente}
                  onChange={e => setSearchCliente(e.target.value)}
                  className="crm-search"
                />
              </div>
            </div>

            <div className="crm-table-card">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Empresa</th>
                    <th>Telefone</th>
                    <th>Email</th>
                    <th style={{ width: '60px', textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes
                    .filter(c => c.nome.toLowerCase().includes(searchCliente.toLowerCase()) ||
                      (c.email && c.email.toLowerCase().includes(searchCliente.toLowerCase())) ||
                      (c.telefone && c.telefone.includes(searchCliente)) ||
                      (c.empresa && c.empresa.toLowerCase().includes(searchCliente.toLowerCase())))
                    .map(c => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.nome}</td>
                        <td>{c.empresa || '-'}</td>
                        <td>{c.telefone || '-'}</td>
                        <td>{c.email || '-'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={() => deleteCliente(c.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-bad-fg)' }}
                            title="Apagar Cliente"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  {isFetching && (
                    <tr><td colSpan={5} className="crm-empty-row">A carregar dados...</td></tr>
                  )}
                  {!isFetching && clientes.length === 0 && (
                    <tr><td colSpan={5} className="crm-empty-row">Nenhum cliente registado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {showClienteModal && (
          <div className="crm-modal-overlay">
            <div className="crm-modal-card" style={{ width: '420px' }}>
              <h3>Registar Novo Cliente</h3>
              <form onSubmit={handleSaveCliente}>
                <div className="crm-field">
                  <label>Nome / Pessoa de Contacto *</label>
                  <input required type="text" value={newCliente.nome} onChange={e => setNewCliente({ ...newCliente, nome: e.target.value })} />
                </div>
                <div className="crm-field">
                  <label>Empresa</label>
                  <input type="text" value={newCliente.empresa} onChange={e => setNewCliente({ ...newCliente, empresa: e.target.value })} />
                </div>
                <div className="crm-field">
                  <label>Telefone</label>
                  <input type="text" value={newCliente.telefone} onChange={e => setNewCliente({ ...newCliente, telefone: e.target.value })} />
                </div>
                <div className="crm-field">
                  <label>Email</label>
                  <input type="email" value={newCliente.email} onChange={e => setNewCliente({ ...newCliente, email: e.target.value })} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                  <button type="button" className="crm-btn" onClick={() => setShowClienteModal(false)}>Cancelar</button>
                  <button type="submit" className="crm-btn crm-btn-primary" disabled={loading}>{loading ? 'A Gravar...' : 'Gravar'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showLeadModal && (
          <div className="crm-modal-overlay">
            <div className="crm-modal-card" style={{ width: '420px' }}>
              <h3>Nova Lead (Negócio)</h3>
              <form onSubmit={handleSaveLead}>
                <div className="crm-field">
                  <label>O que o cliente quer comprar? (Título) *</label>
                  <input required type="text" placeholder="Ex: Website Institucional" value={newLead.titulo} onChange={e => setNewLead({ ...newLead, titulo: e.target.value })} />
                </div>
                <div className="crm-field">
                  <label>Cliente associado *</label>
                  <select required value={newLead.cliente_id} onChange={e => setNewLead({ ...newLead, cliente_id: e.target.value })}>
                    <option value="">Selecione o Cliente...</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome} {c.empresa ? `(${c.empresa})` : ''}</option>)}
                  </select>
                </div>
                <div className="crm-field">
                  <label>Valor Estimado (AOA, Opcional)</label>
                  <input type="number" value={newLead.valor_estimado} onChange={e => setNewLead({ ...newLead, valor_estimado: e.target.value })} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                  <button type="button" className="crm-btn" onClick={() => setShowLeadModal(false)}>Cancelar</button>
                  <button type="submit" className="crm-btn crm-btn-primary" disabled={loading}>{loading ? 'A Gravar...' : 'Gravar'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showProformaModal && (
          <div className="crm-modal-overlay">
            <div className="crm-modal-card" style={{ width: '620px' }}>
              <h3>Gerar Proposta Comercial / Proforma</h3>
              <p style={{ fontSize: '13px', color: 'var(--crm-ink-muted)', marginBottom: '16px' }}>Adicione os itens e valores. O sistema irá gerar um PDF profissional para enviar ao cliente.</p>

              {catalogoProforma.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--crm-ink-faint)', marginBottom: '8px' }}>
                    Do seu catálogo — clique para adicionar
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {catalogoProforma.map((item, i) => (
                      <button key={i} type="button" onClick={() => addItemDoCatalogo(item)}
                        className="crm-btn crm-btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {item.nome} <span style={{ opacity: 0.6 }}>· {formatKz(Number(item.preco) || 0)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ background: 'var(--crm-canvas)', border: '1px solid var(--crm-border-soft)', padding: '14px', borderRadius: '10px', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 2fr', gap: '12px', fontWeight: 700, fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--crm-ink-faint)', marginBottom: '10px' }}>
                  <div>Descrição do Produto/Serviço</div>
                  <div>Qtd</div>
                  <div>Preço Unitário (AOA)</div>
                </div>

                {proformaItens.map((item, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 2fr', gap: '12px', marginBottom: '8px' }}>
                    <input type="text" value={item.descricao} onChange={e => {
                      const newItens = [...proformaItens];
                      newItens[index].descricao = e.target.value;
                      setProformaItens(newItens);
                    }} placeholder="Serviço..." style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--crm-border)', background: 'var(--crm-surface)', fontSize: '13px' }} />
                    <input type="number" min="1" value={item.qtd} onChange={e => {
                      const newItens = [...proformaItens];
                      newItens[index].qtd = Number(e.target.value);
                      setProformaItens(newItens);
                    }} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--crm-border)', background: 'var(--crm-surface)', fontSize: '13px' }} />
                    <input type="number" step="1000" value={item.preco_unitario} onChange={e => {
                      const newItens = [...proformaItens];
                      newItens[index].preco_unitario = Number(e.target.value);
                      setProformaItens(newItens);
                    }} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--crm-border)', background: 'var(--crm-surface)', fontSize: '13px' }} />
                  </div>
                ))}

                <button type="button" className="crm-btn crm-btn-sm" style={{ marginTop: '6px' }} onClick={() => setProformaItens([...proformaItens, { descricao: '', qtd: 1, preco_unitario: 0 }])}>
                  + Adicionar Linha
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="crm-btn" onClick={() => setShowProformaModal(null)}>Cancelar</button>
                <button type="button" className="crm-btn crm-btn-primary" onClick={handleGenerateProforma} disabled={loading}>{loading ? 'A Gerar PDF...' : 'Criar PDF Proforma'}</button>
              </div>
            </div>
          </div>
        )}

        {showPagamentoModal && (
          <div className="crm-modal-overlay">
            <div className="crm-modal-card" style={{ width: '420px' }}>
              <h3>Registar Pagamento & Contabilidade</h3>
              <p style={{ fontSize: '13px', color: 'var(--crm-ink-muted)', marginBottom: '16px' }}>Ao registar o pagamento, será criado automaticamente um <b>Lançamento Contabilístico</b> no Diário de Tesouraria.</p>

              <form onSubmit={handleRegisterPayment}>
                <div className="crm-field">
                  <label>Valor Pago (AOA) *</label>
                  <input required type="number" step="0.01" value={pagamentoData.valor} onChange={e => setPagamentoData({ ...pagamentoData, valor: e.target.value })} />
                </div>
                <div className="crm-field">
                  <label>Data de Pagamento *</label>
                  <input required type="date" value={pagamentoData.data_pagamento} onChange={e => setPagamentoData({ ...pagamentoData, data_pagamento: e.target.value })} />
                </div>
                <div className="crm-field">
                  <label>Método de Pagamento</label>
                  <select value={pagamentoData.metodo_pagamento} onChange={e => setPagamentoData({ ...pagamentoData, metodo_pagamento: e.target.value })}>
                    <option value="Transferência Bancária">Transferência Bancária</option>
                    <option value="Numerário">Numerário / Multicaixa</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                  <button type="button" className="crm-btn" onClick={() => setShowPagamentoModal(null)}>Cancelar</button>
                  <button type="submit" className="crm-btn crm-btn-good" disabled={loading}>{loading ? 'A Gravar...' : 'Confirmar Recebimento'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
