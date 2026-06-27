import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Edit, ChevronRight, Check, X, Phone, Mail, FileText, User, Building, Settings, DollarSign } from 'lucide-react';

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

export default function CrmApp() {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'clientes'>('pipeline');
  
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [searchCliente, setSearchCliente] = useState('');

  // Modals state
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [showProformaModal, setShowProformaModal] = useState<number | null>(null);
  const [showPagamentoModal, setShowPagamentoModal] = useState<number | null>(null);
  const [pagamentoData, setPagamentoData] = useState({ valor: '', metodo_pagamento: 'Transferência Bancária', data_pagamento: new Date().toISOString().split('T')[0] });

  // Forms state
  const [newCliente, setNewCliente] = useState({ nome: '', email: '', telefone: '', empresa: '' });
  const [newLead, setNewLead] = useState({ titulo: '', cliente_id: '', valor_estimado: '' });
  const [proformaItens, setProformaItens] = useState([{ descricao: '', qtd: 1, preco_unitario: 0 }]);

  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  const fetchDados = async () => {
    setIsFetching(true);
    try {
      const resC = await fetch('http://127.0.0.1:3001/api/crm/clientes');
      const dataC = await resC.json();
      if (dataC.success) setClientes(dataC.clientes);

      const resN = await fetch('http://127.0.0.1:3001/api/crm/negocios');
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

  const handleSaveCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('http://127.0.0.1:3001/api/crm/clientes', {
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
      const res = await fetch('http://127.0.0.1:3001/api/crm/negocios', {
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
      await fetch(`http://127.0.0.1:3001/api/crm/clientes/${id}`, { method: 'DELETE' });
      fetchDados();
    } catch (err) {
      alert("Erro ao apagar cliente.");
    }
  };

  const deleteNegocio = async (id: number) => {
    if (!window.confirm("Tem a certeza que deseja apagar este negócio? Esta ação é irreversível.")) return;
    try {
      await fetch(`http://127.0.0.1:3001/api/crm/negocios/${id}`, { method: 'DELETE' });
      fetchDados();
    } catch (err) {
      alert("Erro ao apagar negócio.");
    }
  };

  const moveFase = async (negocio_id: number, nova_fase: string) => {
    try {
      await fetch(`http://127.0.0.1:3001/api/crm/negocios/${negocio_id}/fase`, {
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
      const res = await fetch(`http://127.0.0.1:3001/api/crm/negocios/${showProformaModal}/proforma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: proformaItens })
      });
      const data = await res.json();
      if (data.success) {
        window.open('http://127.0.0.1:3001' + data.pdf_path, '_blank');
        setShowProformaModal(null);
        setProformaItens([{ descricao: '', qtd: 1, preco_unitario: 0 }]);
        fetchDados(); // O valor estimado vai ser atualizado pela backend com base na proforma
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
      const res = await fetch(`http://127.0.0.1:3001/api/crm/negocios/${showPagamentoModal}/pagamento`, {
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

  // Helper for Kanban
  const renderColumn = (fase: string, label: string, color: string) => {
    const list = negocios.filter(n => n.fase === fase);
    return (
      <div style={{ flex: 1, minWidth: '280px', backgroundColor: '#f0f2f5', borderRadius: '4px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${color}`, paddingBottom: '8px' }}>
          <strong style={{ color: '#4a4a4a', fontSize: '14px' }}>{label}</strong>
          <span style={{ backgroundColor: '#e2e8f0', color: '#64748b', fontSize: '12px', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>{list.length}</span>
        </div>
        
        {list.map(negocio => (
          <div key={negocio.id} style={{ backgroundColor: 'white', padding: '12px', borderRadius: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: `3px solid ${color}`, position: 'relative' }}>
            <button 
              onClick={() => deleteNegocio(negocio.id)}
              style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', opacity: 0.5 }}
              onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
              onMouseOut={(e) => e.currentTarget.style.opacity = '0.5'}
              title="Apagar Negócio"
            >
              <Trash2 size={14} />
            </button>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1a1a1a', marginBottom: '4px', paddingRight: '20px' }}>{negocio.titulo}</div>
            <div style={{ fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
              <Building size={12} /> {negocio.cliente_empresa || negocio.cliente_nome}
            </div>
            
            {negocio.valor_estimado > 0 && (
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#16a34a', marginBottom: '12px' }}>
                {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(negocio.valor_estimado)}
              </div>
            )}
            
            {/* Action buttons based on fase */}
            <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', flexWrap: 'wrap' }}>
              {fase === 'Nova Lead' && (
                <button className="odoo-btn" style={{ padding: '4px 8px', fontSize: '11px', flex: 1 }} onClick={() => moveFase(negocio.id, 'Em Negociação')}>Negociar <ChevronRight size={12} /></button>
              )}
              {fase === 'Em Negociação' && (
                <>
                  <button className="odoo-btn" style={{ padding: '4px 8px', fontSize: '11px', flex: 1, backgroundColor: '#0078D4', color: 'white' }} onClick={() => setShowProformaModal(negocio.id)}>Gerar Proforma</button>
                  <button className="odoo-btn" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => moveFase(negocio.id, 'Proposta Enviada')}><ChevronRight size={12} /></button>
                </>
              )}
              {fase === 'Proposta Enviada' && (
                <>
                  <button className="odoo-btn" style={{ padding: '4px 8px', fontSize: '11px', flex: 1, color: '#16a34a' }} onClick={() => moveFase(negocio.id, 'Ganho')}><Check size={12} /> Ganho</button>
                  <button className="odoo-btn" style={{ padding: '4px 8px', fontSize: '11px', flex: 1, color: '#dc2626' }} onClick={() => moveFase(negocio.id, 'Perdido')}><X size={12} /> Perdido</button>
                </>
              )}
              {fase === 'Ganho' && (
                <button 
                  className="odoo-btn" 
                  style={{ padding: '4px 8px', fontSize: '11px', flex: 1, backgroundColor: '#10b981', color: 'white' }} 
                  onClick={() => {
                    setShowPagamentoModal(negocio.id);
                    setPagamentoData({...pagamentoData, valor: negocio.valor_estimado.toString()});
                  }}
                >
                  <DollarSign size={12} style={{ marginRight: 4 }}/> Registar Pagamento
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-Nav for CRM */}
      <div className="odoo-topnav" style={{ backgroundColor: '#fff', borderBottom: '1px solid var(--odoo-border)', padding: '10px 16px' }}>
        <div 
          className={`odoo-nav-link ${activeTab === 'pipeline' ? 'active' : ''}`} 
          onClick={() => setActiveTab('pipeline')}
          style={{ color: activeTab === 'pipeline' ? '#0f172a' : '#64748b', background: activeTab === 'pipeline' ? '#f1f5f9' : 'transparent', fontWeight: '600' }}
        >
          Funil de Vendas
        </div>
        <div 
          className={`odoo-nav-link ${activeTab === 'clientes' ? 'active' : ''}`} 
          onClick={() => setActiveTab('clientes')}
          style={{ color: activeTab === 'clientes' ? '#0f172a' : '#64748b', background: activeTab === 'clientes' ? '#f1f5f9' : 'transparent', fontWeight: '600' }}
        >
          Clientes
        </div>
      </div>

      {/* Control Panel */}
      <div className="odoo-control-panel">
        <div className="odoo-control-panel-top">
          <h1 className="odoo-title" style={{ color: '#0f172a' }}>{activeTab === 'pipeline' ? 'Funil de Vendas' : 'Diretório de Clientes'}</h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            {activeTab === 'pipeline' && (
               <button className="odoo-btn odoo-btn-primary" onClick={() => setShowLeadModal(true)}>
                 <Plus size={16} style={{ marginRight: '4px' }} /> NOVO NEGÓCIO (LEAD)
               </button>
            )}
            {activeTab === 'clientes' && (
               <button className="odoo-btn odoo-btn-primary" onClick={() => setShowClienteModal(true)}>
                 <Plus size={16} style={{ marginRight: '4px' }} /> NOVO CLIENTE
               </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="odoo-content-area" style={{ backgroundColor: activeTab === 'pipeline' ? '#e2e8f0' : 'white' }}>
        
        {/* TAB PIPELINE */}
        {activeTab === 'pipeline' && (
          <div style={{ display: 'flex', gap: '16px', padding: '16px', overflowX: 'auto', height: '100%', alignItems: 'flex-start' }}>
            {renderColumn('Nova Lead', '1. NOVAS LEADS', '#94a3b8')}
            {renderColumn('Em Negociação', '2. EM NEGOCIAÇÃO', '#eab308')}
            {renderColumn('Proposta Enviada', '3. PROPOSTA ENVIADA', '#3b82f6')}
            {renderColumn('Ganho', '4. GANHOS', '#22c55e')}
            {renderColumn('Perdido', '5. PERDIDOS', '#ef4444')}
          </div>
        )}

        {/* TAB CLIENTES */}
        {activeTab === 'clientes' && (
          <div style={{ padding: '16px', width: '100%' }}>
             <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <input 
                 type="text" 
                 placeholder="Pesquisar cliente por nome, email ou telefone..." 
                 value={searchCliente}
                 onChange={e => setSearchCliente(e.target.value)}
                 className="odoo-input"
                 style={{ maxWidth: '400px', backgroundColor: '#f8fafc', padding: '10px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
               />
               <span style={{ fontSize: '13px', color: '#64748b' }}>Total: {clientes.length} clientes</span>
             </div>
             
             <div style={{ overflowX: 'auto' }}>
               <table className="odoo-table" style={{ margin: '0' }}>
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
                       <td style={{ fontWeight: 'bold' }}>{c.nome}</td>
                       <td>{c.empresa || '-'}</td>
                       <td>{c.telefone || '-'}</td>
                       <td>{c.email || '-'}</td>
                       <td style={{ textAlign: 'center' }}>
                         <button 
                           onClick={() => deleteCliente(c.id)}
                           style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                           title="Apagar Cliente"
                         >
                           <Trash2 size={16} />
                         </button>
                       </td>
                     </tr>
                   ))}
                   {isFetching && (
                     <tr>
                       <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>A carregar dados...</td>
                     </tr>
                   )}
                   {!isFetching && clientes.length === 0 && (
                     <tr>
                       <td colSpan={5} style={{ textAlign: 'center', padding: '24px' }}>Nenhum cliente registado.</td>
                     </tr>
                   )}
                 </tbody>
               </table>
             </div>
          </div>
        )}

        {/* MODAL NOVO CLIENTE */}
        {showClienteModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '400px', padding: '24px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--odoo-border)', paddingBottom: '12px' }}>Registar Novo Cliente</h3>
              <form onSubmit={handleSaveCliente}>
                <div className="odoo-form-group">
                  <label className="odoo-label">Nome / Pessoa de Contacto *</label>
                  <input required type="text" className="odoo-input" value={newCliente.nome} onChange={e => setNewCliente({...newCliente, nome: e.target.value})} />
                </div>
                <div className="odoo-form-group">
                  <label className="odoo-label">Empresa</label>
                  <input type="text" className="odoo-input" value={newCliente.empresa} onChange={e => setNewCliente({...newCliente, empresa: e.target.value})} />
                </div>
                <div className="odoo-form-group">
                  <label className="odoo-label">Telefone</label>
                  <input type="text" className="odoo-input" value={newCliente.telefone} onChange={e => setNewCliente({...newCliente, telefone: e.target.value})} />
                </div>
                <div className="odoo-form-group" style={{ marginBottom: '24px' }}>
                  <label className="odoo-label">Email</label>
                  <input type="email" className="odoo-input" value={newCliente.email} onChange={e => setNewCliente({...newCliente, email: e.target.value})} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button type="button" className="odoo-btn" onClick={() => setShowClienteModal(false)}>Cancelar</button>
                  <button type="submit" className="odoo-btn odoo-btn-primary" disabled={loading}>{loading ? 'A Gravar...' : 'Gravar'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL NOVO NEGOCIO */}
        {showLeadModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '400px', padding: '24px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--odoo-border)', paddingBottom: '12px' }}>Nova Lead (Negócio)</h3>
              <form onSubmit={handleSaveLead}>
                <div className="odoo-form-group">
                  <label className="odoo-label">O que o cliente quer comprar? (Título) *</label>
                  <input required type="text" className="odoo-input" placeholder="Ex: Website Institucional" value={newLead.titulo} onChange={e => setNewLead({...newLead, titulo: e.target.value})} />
                </div>
                <div className="odoo-form-group">
                  <label className="odoo-label">Cliente associado *</label>
                  <select required className="odoo-input" value={newLead.cliente_id} onChange={e => setNewLead({...newLead, cliente_id: e.target.value})}>
                    <option value="">Selecione o Cliente...</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome} {c.empresa ? `(${c.empresa})` : ''}</option>)}
                  </select>
                </div>
                <div className="odoo-form-group" style={{ marginBottom: '24px' }}>
                  <label className="odoo-label">Valor Estimado (AOA, Opcional)</label>
                  <input type="number" className="odoo-input" value={newLead.valor_estimado} onChange={e => setNewLead({...newLead, valor_estimado: e.target.value})} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button type="button" className="odoo-btn" onClick={() => setShowLeadModal(false)}>Cancelar</button>
                  <button type="submit" className="odoo-btn odoo-btn-primary" disabled={loading}>{loading ? 'A Gravar...' : 'Gravar'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL GERAR PROFORMA */}
        {showProformaModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '600px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--odoo-border)', paddingBottom: '12px' }}>Gerar Proposta Comercial / Proforma</h3>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>Adicione os itens e valores. O sistema irá gerar um PDF profissional para enviar ao cliente.</p>
              
              <div style={{ backgroundColor: '#f9fafb', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 2fr', gap: '12px', fontWeight: 'bold', fontSize: '12px', marginBottom: '8px' }}>
                  <div>Descrição do Produto/Serviço</div>
                  <div>Qtd</div>
                  <div>Preço Unitário (AOA)</div>
                </div>
                
                {proformaItens.map((item, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 2fr', gap: '12px', marginBottom: '8px' }}>
                    <input type="text" className="odoo-input" value={item.descricao} onChange={e => {
                      const newItens = [...proformaItens];
                      newItens[index].descricao = e.target.value;
                      setProformaItens(newItens);
                    }} placeholder="Serviço..." />
                    <input type="number" min="1" className="odoo-input" value={item.qtd} onChange={e => {
                      const newItens = [...proformaItens];
                      newItens[index].qtd = Number(e.target.value);
                      setProformaItens(newItens);
                    }} />
                    <input type="number" step="1000" className="odoo-input" value={item.preco_unitario} onChange={e => {
                      const newItens = [...proformaItens];
                      newItens[index].preco_unitario = Number(e.target.value);
                      setProformaItens(newItens);
                    }} />
                  </div>
                ))}

                <button type="button" className="odoo-btn" style={{ marginTop: '8px', fontSize: '12px' }} onClick={() => setProformaItens([...proformaItens, { descricao: '', qtd: 1, preco_unitario: 0 }])}>
                  + Adicionar Linha
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="odoo-btn" onClick={() => setShowProformaModal(null)}>Cancelar</button>
                <button type="button" className="odoo-btn odoo-btn-primary" onClick={handleGenerateProforma} disabled={loading}>{loading ? 'A Gerar PDF...' : 'Criar PDF Proforma'}</button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL REGISTAR PAGAMENTO */}
        {showPagamentoModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '400px', padding: '24px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--odoo-border)', paddingBottom: '12px' }}>Registar Pagamento & Contabilidade</h3>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>Ao registar o pagamento, será criado automaticamente um <b>Lançamento Contabilístico</b> no Diário de Tesouraria.</p>
              
              <form onSubmit={handleRegisterPayment}>
                <div className="odoo-form-group">
                  <label className="odoo-label">Valor Pago (AOA) *</label>
                  <input required type="number" step="0.01" className="odoo-input" value={pagamentoData.valor} onChange={e => setPagamentoData({...pagamentoData, valor: e.target.value})} />
                </div>
                
                <div className="odoo-form-group">
                  <label className="odoo-label">Data de Pagamento *</label>
                  <input required type="date" className="odoo-input" value={pagamentoData.data_pagamento} onChange={e => setPagamentoData({...pagamentoData, data_pagamento: e.target.value})} />
                </div>
                
                <div className="odoo-form-group" style={{ marginBottom: '24px' }}>
                  <label className="odoo-label">Método de Pagamento</label>
                  <select className="odoo-input" value={pagamentoData.metodo_pagamento} onChange={e => setPagamentoData({...pagamentoData, metodo_pagamento: e.target.value})}>
                    <option value="Transferência Bancária">Transferência Bancária</option>
                    <option value="Numerário">Numerário / Multicaixa</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button type="button" className="odoo-btn" onClick={() => setShowPagamentoModal(null)}>Cancelar</button>
                  <button type="submit" className="odoo-btn odoo-btn-primary" style={{ backgroundColor: '#10b981', borderColor: '#10b981' }} disabled={loading}>{loading ? 'A Gravar...' : 'Confirmar Recebimento'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
