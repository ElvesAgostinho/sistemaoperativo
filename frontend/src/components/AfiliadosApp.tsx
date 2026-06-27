import React, { useState, useEffect } from 'react';
import { Users, CheckCircle, TrendingUp, AlertCircle } from 'lucide-react';

export default function AfiliadosApp() {
  const [afiliados, setAfiliados] = useState<any[]>([]);
  const [comissoes, setComissoes] = useState<any[]>([]);
  const [materiais, setMateriais] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'afiliados' | 'comissoes' | 'materiais'>('dashboard');

  const [novoAfiliado, setNovoAfiliado] = useState({
    nome: '', email: '', nif: '', iban: '', codigo_referencia: '', percentagem_comissao: 10, tipo_comissao: 'Vitalicia', senha: ''
  });

  const [novoMaterial, setNovoMaterial] = useState({
    titulo: '', tipo: 'imagem', url: '', descricao: ''
  });

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('os_auth_token');
      const afRes = await fetch('http://127.0.0.1:3001/api/afiliados', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (afRes.ok) {
        const afData = await afRes.json();
        setAfiliados(afData.afiliados || []);
      }

      const comRes = await fetch('http://127.0.0.1:3001/api/afiliados/comissoes', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (comRes.ok) {
        const comData = await comRes.json();
        setComissoes(comData.comissoes || []);
      }

      const matRes = await fetch('http://127.0.0.1:3001/api/afiliados/materiais');
      if (matRes.ok) {
        const matData = await matRes.json();
        setMateriais(matData.materiais || []);
      }
    } catch (error) {
      console.error('Erro a carregar dados de afiliados', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateAfiliado = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('os_auth_token');
      const res = await fetch('http://127.0.0.1:3001/api/afiliados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(novoAfiliado)
      });
      if (res.ok) {
        alert('Afiliado criado com sucesso! Envie o link /portal-afiliado e a senha para o parceiro.');
        setNovoAfiliado({ nome: '', email: '', nif: '', iban: '', codigo_referencia: '', percentagem_comissao: 10, tipo_comissao: 'Vitalicia', senha: '' });
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao criar afiliado');
      }
    } catch (error) {
      alert('Erro de ligação ao servidor');
    }
  };

  const handleCreateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('os_auth_token');
      const res = await fetch('http://127.0.0.1:3001/api/afiliados/materiais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(novoMaterial)
      });
      if (res.ok) {
        setNovoMaterial({ titulo: '', tipo: 'imagem', url: '', descricao: '' });
        fetchData();
      } else {
        alert('Erro ao criar material');
      }
    } catch (error) {
      alert('Erro de ligação');
    }
  };

  const apagarMaterial = async (id: number) => {
    if (!window.confirm('Apagar este material?')) return;
    try {
      const token = localStorage.getItem('os_auth_token');
      const res = await fetch(`http://127.0.0.1:3001/api/afiliados/materiais/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchData();
    } catch (error) {
      console.error(error);
    }
  };

  const aprovarComissao = async (id: number) => {
    if (!window.confirm('Tem a certeza que deseja aprovar esta comissão?')) return;
    try {
      const token = localStorage.getItem('os_auth_token');
      const res = await fetch(`http://127.0.0.1:3001/api/afiliados/comissoes/${id}/aprovar`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchData();
    } catch (error) {
      console.error(error);
    }
  };

  const pagarComissao = async (id: number) => {
    if (!window.confirm('Confirma que já efetuou a transferência bancária para o afiliado?')) return;
    try {
      const token = localStorage.getItem('os_auth_token');
      const res = await fetch(`http://127.0.0.1:3001/api/afiliados/comissoes/${id}/pagar`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchData();
    } catch (error) {
      console.error(error);
    }
  };

  const totalPago = comissoes.filter(c => c.estado === 'Paga' || c.estado === 'Processada').reduce((acc, curr) => acc + curr.valor_comissao, 0);
  const totalPendente = comissoes.filter(c => c.estado === 'Pendente' || c.estado === 'Aprovada').reduce((acc, curr) => acc + curr.valor_comissao, 0);
  const totalVendasOrigem = comissoes.reduce((acc, curr) => acc + curr.valor_base, 0);

  return (
    <div style={{ padding: '24px', backgroundColor: '#f8fafc', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>Programa de Afiliados e Parcerias</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => setActiveTab('dashboard')}
            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 500, backgroundColor: activeTab === 'dashboard' ? '#10b981' : '#e2e8f0', color: activeTab === 'dashboard' ? 'white' : '#475569' }}
          >Dashboard</button>
          <button 
            onClick={() => setActiveTab('afiliados')}
            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 500, backgroundColor: activeTab === 'afiliados' ? '#10b981' : '#e2e8f0', color: activeTab === 'afiliados' ? 'white' : '#475569' }}
          >Gestão de Afiliados</button>
          <button 
            onClick={() => setActiveTab('comissoes')}
            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 500, backgroundColor: activeTab === 'comissoes' ? '#10b981' : '#e2e8f0', color: activeTab === 'comissoes' ? 'white' : '#475569' }}
          >Aprovações & Pagamentos</button>
          <button 
            onClick={() => setActiveTab('materiais')}
            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 500, backgroundColor: activeTab === 'materiais' ? '#10b981' : '#e2e8f0', color: activeTab === 'materiais' ? 'white' : '#475569' }}
          >Materiais de Marketing</button>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
          
          <div 
            style={{ position: 'relative', overflow: 'hidden', backgroundColor: 'white', padding: '28px', borderRadius: '20px', border: '1px solid rgba(226,232,240,0.8)', boxShadow: '0 10px 30px -5px rgba(16,185,129,0.08), 0 4px 6px -4px rgba(16,185,129,0.04)', transition: 'all 0.3s ease', cursor: 'default' }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 20px 40px -5px rgba(16,185,129,0.12)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 10px 30px -5px rgba(16,185,129,0.08), 0 4px 6px -4px rgba(16,185,129,0.04)'; }}
          >
            <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, rgba(255,255,255,0) 70%)' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
              <div style={{ padding: '12px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderRadius: '12px', color: 'white', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}><TrendingUp size={24} strokeWidth={2} /></div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Receita Total</h3>
            </div>
            <p style={{ fontSize: '36px', fontWeight: '800', margin: 0, color: '#0f172a', letterSpacing: '-1px' }}>
              {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', minimumFractionDigits: 0 }).format(totalVendasOrigem)}
            </p>
          </div>

          <div 
            style={{ position: 'relative', overflow: 'hidden', backgroundColor: 'white', padding: '28px', borderRadius: '20px', border: '1px solid rgba(226,232,240,0.8)', boxShadow: '0 10px 30px -5px rgba(59,130,246,0.08), 0 4px 6px -4px rgba(59,130,246,0.04)', transition: 'all 0.3s ease', cursor: 'default' }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 20px 40px -5px rgba(59,130,246,0.12)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 10px 30px -5px rgba(59,130,246,0.08), 0 4px 6px -4px rgba(59,130,246,0.04)'; }}
          >
            <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(255,255,255,0) 70%)' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
              <div style={{ padding: '12px', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', borderRadius: '12px', color: 'white', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}><CheckCircle size={24} strokeWidth={2} /></div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Comissões Pagas</h3>
            </div>
            <p style={{ fontSize: '36px', fontWeight: '800', margin: 0, color: '#0f172a', letterSpacing: '-1px' }}>
              {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', minimumFractionDigits: 0 }).format(totalPago)}
            </p>
          </div>

          <div 
            style={{ position: 'relative', overflow: 'hidden', backgroundColor: 'white', padding: '28px', borderRadius: '20px', border: '1px solid rgba(226,232,240,0.8)', boxShadow: '0 10px 30px -5px rgba(239,68,68,0.08), 0 4px 6px -4px rgba(239,68,68,0.04)', transition: 'all 0.3s ease', cursor: 'default' }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 20px 40px -5px rgba(239,68,68,0.12)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 10px 30px -5px rgba(239,68,68,0.08), 0 4px 6px -4px rgba(239,68,68,0.04)'; }}
          >
            <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(239,68,68,0.15) 0%, rgba(255,255,255,0) 70%)' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
              <div style={{ padding: '12px', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', borderRadius: '12px', color: 'white', boxShadow: '0 4px 12px rgba(239,68,68,0.3)' }}><AlertCircle size={24} strokeWidth={2} /></div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Passivo Pendente</h3>
            </div>
            <p style={{ fontSize: '36px', fontWeight: '800', margin: 0, color: '#0f172a', letterSpacing: '-1px' }}>
              {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', minimumFractionDigits: 0 }).format(totalPendente)}
            </p>
          </div>

          <div 
            style={{ position: 'relative', overflow: 'hidden', backgroundColor: 'white', padding: '28px', borderRadius: '20px', border: '1px solid rgba(226,232,240,0.8)', boxShadow: '0 10px 30px -5px rgba(139,92,246,0.08), 0 4px 6px -4px rgba(139,92,246,0.04)', transition: 'all 0.3s ease', cursor: 'default' }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 20px 40px -5px rgba(139,92,246,0.12)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 10px 30px -5px rgba(139,92,246,0.08), 0 4px 6px -4px rgba(139,92,246,0.04)'; }}
          >
            <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, rgba(255,255,255,0) 70%)' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
              <div style={{ padding: '12px', background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', borderRadius: '12px', color: 'white', boxShadow: '0 4px 12px rgba(139,92,246,0.3)' }}><Users size={24} strokeWidth={2} /></div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Afiliados Ativos</h3>
            </div>
            <p style={{ fontSize: '36px', fontWeight: '800', margin: 0, color: '#0f172a', letterSpacing: '-1px' }}>
              {afiliados.length}
            </p>
          </div>

        </div>
      )}

      {activeTab === 'afiliados' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#0f172a' }}>Adicionar Novo Parceiro</h3>
            <form onSubmit={handleCreateAfiliado} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>Nome</label>
                <input required type="text" value={novoAfiliado.nome} onChange={e => setNovoAfiliado({...novoAfiliado, nome: e.target.value})} style={{ boxSizing: 'border-box', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>Email</label>
                  <input required type="email" value={novoAfiliado.email} onChange={e => setNovoAfiliado({...novoAfiliado, email: e.target.value})} style={{ boxSizing: 'border-box', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>Palavra-passe (Login)</label>
                  <input required type="text" placeholder="Ex: 123456" value={novoAfiliado.senha} onChange={e => setNovoAfiliado({...novoAfiliado, senha: e.target.value})} style={{ boxSizing: 'border-box', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>NIF</label>
                  <input type="text" value={novoAfiliado.nif} onChange={e => setNovoAfiliado({...novoAfiliado, nif: e.target.value})} style={{ boxSizing: 'border-box', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>Código (Ex: VIP10)</label>
                  <input required type="text" value={novoAfiliado.codigo_referencia} onChange={e => setNovoAfiliado({...novoAfiliado, codigo_referencia: e.target.value.toUpperCase()})} style={{ boxSizing: 'border-box', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', textTransform: 'uppercase' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>IBAN para Pagamentos</label>
                <input type="text" value={novoAfiliado.iban} onChange={e => setNovoAfiliado({...novoAfiliado, iban: e.target.value})} style={{ boxSizing: 'border-box', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>% Comissão</label>
                  <input required type="number" min="1" max="100" value={novoAfiliado.percentagem_comissao} onChange={e => setNovoAfiliado({...novoAfiliado, percentagem_comissao: Number(e.target.value)})} style={{ boxSizing: 'border-box', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>Modelo Comissão</label>
                  <select value={novoAfiliado.tipo_comissao} onChange={e => setNovoAfiliado({...novoAfiliado, tipo_comissao: e.target.value})} style={{ boxSizing: 'border-box', width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                    <option value="Vitalicia">Vitalícia (Todas as Vendas)</option>
                    <option value="Unica">Apenas na 1ª Venda</option>
                  </select>
                </div>
              </div>
              <button type="submit" style={{ width: '100%', padding: '12px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', marginTop: '10px' }}>Criar Afiliado</button>
              
              <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '8px', fontSize: '13px', color: '#475569' }}>
                <strong>Como o afiliado entra?</strong><br/>
                Após criar a conta, envie-lhe o link <code>{window.location.origin}/portal-afiliado</code>, juntamente com o seu Email e Palavra-passe configurados acima.
              </div>
            </form>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <tr>
                  <th style={{ padding: '16px', color: '#475569', fontWeight: 600, fontSize: '14px' }}>Afiliado</th>
                  <th style={{ padding: '16px', color: '#475569', fontWeight: 600, fontSize: '14px' }}>Código</th>
                  <th style={{ padding: '16px', color: '#475569', fontWeight: 600, fontSize: '14px' }}>Comissão</th>
                  <th style={{ padding: '16px', color: '#475569', fontWeight: 600, fontSize: '14px' }}>Total Gerado</th>
                </tr>
              </thead>
              <tbody>
                {afiliados.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontWeight: 500, color: '#0f172a' }}>{a.nome}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{a.email}</div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <span style={{ display: 'inline-block', padding: '4px 8px', backgroundColor: '#f1f5f9', borderRadius: '4px', border: '1px dashed #cbd5e1', fontWeight: 600, color: '#334155' }}>
                        {a.codigo_referencia}
                      </span>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontWeight: 600, color: '#10b981' }}>{a.percentagem_comissao}%</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{a.tipo_comissao}</div>
                    </td>
                    <td style={{ padding: '16px', fontWeight: 500, color: '#0f172a' }}>
                      {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(a.total_gerado)}
                    </td>
                  </tr>
                ))}
                {afiliados.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Nenhum afiliado registado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'comissoes' && (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <tr>
                <th style={{ padding: '16px', color: '#475569', fontWeight: 600, fontSize: '14px' }}>Afiliado & Cliente</th>
                <th style={{ padding: '16px', color: '#475569', fontWeight: 600, fontSize: '14px' }}>Negócio (CRM)</th>
                <th style={{ padding: '16px', color: '#475569', fontWeight: 600, fontSize: '14px' }}>Comissão</th>
                <th style={{ padding: '16px', color: '#475569', fontWeight: 600, fontSize: '14px' }}>Estado</th>
                <th style={{ padding: '16px', color: '#475569', fontWeight: 600, fontSize: '14px' }}>Ações de Tesouraria</th>
              </tr>
            </thead>
            <tbody>
              {comissoes.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '16px' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{c.afiliado_nome}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Indicou: {c.cliente_nome || 'Desconhecido'}</div>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ fontWeight: 500, color: '#334155' }}>{c.negocio_titulo}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Base: {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(c.valor_base)}</div>
                  </td>
                  <td style={{ padding: '16px', fontWeight: 'bold', color: '#10b981', fontSize: '16px' }}>
                    {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(c.valor_comissao)}
                  </td>
                  <td style={{ padding: '16px' }}>
                    {c.estado === 'Pendente' && <span style={{ padding: '4px 8px', backgroundColor: '#fef3c7', color: '#d97706', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>Pendente Validação</span>}
                    {c.estado === 'Aprovada' && <span style={{ padding: '4px 8px', backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>Aprovada (Por Pagar)</span>}
                    {c.estado === 'Paga' && <span style={{ padding: '4px 8px', backgroundColor: '#dcfce3', color: '#15803d', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>Paga (Manual)</span>}
                    {c.estado === 'Processada' && <span style={{ padding: '4px 8px', backgroundColor: '#f3e8ff', color: '#7e22ce', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>Paga Via Salário RH</span>}
                  </td>
                  <td style={{ padding: '16px' }}>
                    {c.estado === 'Pendente' && (
                      <button onClick={() => aprovarComissao(c.id)} style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 500, fontSize: '12px' }}>Aprovar Comissão</button>
                    )}
                    {c.estado === 'Aprovada' && c.colaborador_id == null && (
                      <button onClick={() => pagarComissao(c.id)} style={{ padding: '6px 12px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 500, fontSize: '12px' }}>Marcar Transferência Bancária</button>
                    )}
                    {c.estado === 'Aprovada' && c.colaborador_id != null && (
                      <span style={{ fontSize: '12px', color: '#64748b' }}>Aguardando Proc. Salarial</span>
                    )}
                  </td>
                </tr>
              ))}
              {comissoes.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Nenhuma comissão registada ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'materiais' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
          
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', alignSelf: 'start' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#0f172a' }}>Adicionar Material</h3>
            <form onSubmit={handleCreateMaterial} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>Título</label>
                <input required type="text" value={novoMaterial.titulo} onChange={e => setNovoMaterial({...novoMaterial, titulo: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>Tipo</label>
                <select value={novoMaterial.tipo} onChange={e => setNovoMaterial({...novoMaterial, tipo: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <option value="imagem">Imagem (Banner)</option>
                  <option value="video">Vídeo</option>
                  <option value="link">Link / Texto (Copy)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>URL / Link para Download</label>
                <input required type="text" placeholder="https://..." value={novoMaterial.url} onChange={e => setNovoMaterial({...novoMaterial, url: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#475569', marginBottom: '6px' }}>Descrição (Opcional)</label>
                <textarea rows={3} value={novoMaterial.descricao} onChange={e => setNovoMaterial({...novoMaterial, descricao: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', resize: 'vertical' }} />
              </div>
              <button type="submit" style={{ width: '100%', padding: '12px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', marginTop: '10px' }}>
                Disponibilizar Material
              </button>
            </form>
          </div>

          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#0f172a' }}>Materiais Disponíveis no Portal</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {materiais.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '40px 0' }}>Sem materiais de marketing adicionados.</div>
              ) : (
                materiais.map((m: any) => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ padding: '2px 8px', backgroundColor: '#e2e8f0', color: '#475569', borderRadius: '4px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                          {m.tipo}
                        </span>
                        <h4 style={{ margin: 0, color: '#0f172a', fontSize: '15px' }}>{m.titulo}</h4>
                      </div>
                      <p style={{ margin: '0 0 8px 0', color: '#64748b', fontSize: '13px' }}>{m.descricao}</p>
                      <a href={m.url} target="_blank" rel="noreferrer" style={{ fontSize: '13px', color: '#3b82f6', textDecoration: 'none' }}>Testar Link / Pré-visualizar</a>
                    </div>
                    <button onClick={() => apagarMaterial(m.id)} style={{ padding: '8px 12px', backgroundColor: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>
                      Apagar
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
