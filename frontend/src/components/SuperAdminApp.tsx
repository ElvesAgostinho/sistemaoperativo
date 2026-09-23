import React, { useState, useEffect } from 'react';
import { Shield, Building, Users, CheckCircle, XCircle, Clock, Loader2, AlertCircle, Settings, Save, X, Trash2 } from 'lucide-react';

interface Empresa {
  id: string;
  nome: string;
  status: 'pending' | 'active' | 'suspended';
  criado_em: string;
  limite_usuarios: number | null;
}

interface Utilizador {
  id: string;
  email: string;
  nome: string;
  role: string;
  ativo: boolean;
  criado_em: string;
  empresas?: { nome: string };
}

const SuperAdminApp = () => {
  const [activeTab, setActiveTab] = useState<'empresas' | 'users'>('empresas');
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  // Empresas repetidas (mesmo nome) que ficaram sem utilizador nenhum.
  const [vazias, setVazias] = useState<Set<string>>(new Set());
  const [aApagar, setAApagar] = useState<string | null>(null);
  const [users, setUsers] = useState<Utilizador[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal de Licenciamento
  const [showModal, setShowModal] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [empresaModulos, setEmpresaModulos] = useState<string[]>([]);
  const [empresaLimite, setEmpresaLimite] = useState<string>('');
  const [savingModulos, setSavingModulos] = useState(false);

  const AVAILABLE_MODULES = [
    { id: 'hr', name: 'RH & Triagem' },
    { id: 'crm', name: 'Vendas CRM' },
    { id: 'auto', name: 'Autopilot' },
    { id: 'wa', name: 'WhatsApp Omnichannel' },
    { id: 'data', name: 'Relatórios' },
    { id: 'chat', name: 'Assistente IA' },
    { id: 'kb', name: 'Conhecimento IA' },
    { id: 'email', name: 'Caixa de Email' },
    { id: 'reunioes', name: 'Reuniões Inteligentes' },
    { id: 'afiliados', name: 'Parcerias' },
    { id: 'contabilidade', name: 'Financeiro' },
    { id: 'agendamento', name: 'Agendamento' },
    { id: 'documentos', name: 'Documentos e Informação' },
  ];

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('os_auth_token');
      if (activeTab === 'empresas') {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/superadmin/empresas`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setEmpresas(data.empresas || []);
        try {
          const rv = await fetch(`${import.meta.env.VITE_API_URL}/api/superadmin/empresas/duplicadas`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const dv = await rv.json();
          if (dv.success) setVazias(new Set((dv.vazias || []).map((e: any) => String(e.id))));
        } catch { /* sem esta informação o painel funciona à mesma */ }
      } else {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/superadmin/users`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setUsers(data.users || []);
      }
    } catch (err: any) {
      setError(err.message || 'Erro inesperado.');
    } finally {
      setLoading(false);
    }
  };

  const apagarEmpresaVazia = async (empresa: Empresa) => {
    const confirmado = window.confirm(
      `Apagar "${empresa.nome}"?\n\n` +
      `Esta é uma empresa repetida do registo: não tem nenhum utilizador nem dados. ` +
      `Se tiver alguma coisa lá dentro, o servidor recusa e nada é apagado.`
    );
    if (!confirmado) return;
    setAApagar(empresa.id);
    try {
      const token = localStorage.getItem('os_auth_token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/superadmin/empresas/${empresa.id}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || 'Não foi possível apagar.');
      setEmpresas(prev => prev.filter(e => e.id !== empresa.id));
    } catch (err: any) {
      alert(err.message || 'Erro inesperado ao apagar.');
    } finally {
      setAApagar(null);
    }
  };

  const updateEmpresaStatus = async (id: string, status: string) => {
    try {
      const token = localStorage.getItem('os_auth_token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/superadmin/empresas/${id}/status`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error);

      setEmpresas(prev => prev.map(emp => emp.id === id ? { ...emp, status: status as any } : emp));
    } catch (err: any) {
      alert(err.message || 'Erro inesperado ao atualizar status.');
    }
  };

  const openModulosModal = async (empresa: Empresa) => {
    setEditingEmpresa(empresa);
    setShowModal(true);
    setEmpresaModulos([]); // clear while loading
    setEmpresaLimite(empresa.limite_usuarios === null || empresa.limite_usuarios === undefined ? '' : String(empresa.limite_usuarios));
    try {
      const token = localStorage.getItem('os_auth_token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/superadmin/empresas/${empresa.id}/modulos`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setEmpresaModulos(data.modulos || []);
      }
    } catch(e) {
      console.error("Erro ao carregar módulos", e);
    }
  };

  const saveModulos = async () => {
    if (!editingEmpresa) return;

    const limiteTrimmed = empresaLimite.trim();
    if (limiteTrimmed !== '' && (!/^\d+$/.test(limiteTrimmed))) {
      alert('O limite de utilizadores tem de ser um número inteiro (ou vazio, para ilimitado).');
      return;
    }
    const limiteParaEnviar = limiteTrimmed === '' ? null : parseInt(limiteTrimmed, 10);

    setSavingModulos(true);
    try {
      const token = localStorage.getItem('os_auth_token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/superadmin/empresas/${editingEmpresa.id}/modulos`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ modulos: empresaModulos })
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error);

      const resLimite = await fetch(`${import.meta.env.VITE_API_URL}/api/superadmin/empresas/${editingEmpresa.id}/limite`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ limite_usuarios: limiteParaEnviar })
      });
      const dataLimite = await resLimite.json();
      if (!resLimite.ok || dataLimite.success === false) throw new Error(dataLimite.error);

      setEmpresas(prev => prev.map(emp => emp.id === editingEmpresa.id ? { ...emp, limite_usuarios: limiteParaEnviar } : emp));
      setShowModal(false);
      alert('Licenciamento atualizado com sucesso!');
    } catch (err: any) {
      alert(err.message || 'Erro inesperado ao salvar licenciamento.');
    } finally {
      setSavingModulos(false);
    }
  };

  const toggleModulo = (modId: string) => {
    if (empresaModulos.includes(modId)) {
      setEmpresaModulos(empresaModulos.filter(m => m !== modId));
    } else {
      setEmpresaModulos([...empresaModulos, modId]);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', width: '100%', fontFamily: 'Roboto, sans-serif', flex: 1, minHeight: 0, overflowY: 'auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Shield size={32} color="#0E5A6B" />
        <h1 style={{ margin: 0, color: '#1D2D3E', fontSize: '24px' }}>Gestão Global SaaS</h1>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', borderBottom: '1px solid #D5D7DA' }}>
        <button
          onClick={() => setActiveTab('empresas')}
          style={{
            padding: '12px 24px', background: 'none', border: 'none', borderBottom: activeTab === 'empresas' ? '3px solid #0E5A6B' : '3px solid transparent',
            color: activeTab === 'empresas' ? '#0E5A6B' : '#5B738B', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <Building size={18} /> Empresas
        </button>
        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '12px 24px', background: 'none', border: 'none', borderBottom: activeTab === 'users' ? '3px solid #0E5A6B' : '3px solid transparent',
            color: activeTab === 'users' ? '#0E5A6B' : '#5B738B', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <Users size={18} /> Utilizadores Globais
        </button>
      </div>

      {error && (
        <div style={{ padding: '16px', backgroundColor: '#F6DEDE', color: '#BB0000', borderRadius: '2px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={20} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader2 className="animate-spin" size={32} color="#0E5A6B" /></div>
      ) : activeTab === 'empresas' ? (
        <div style={{ background: 'white', borderRadius: '2px', border: '1px solid #D5D7DA', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: '#F5F6F7', color: '#5B738B', fontSize: '13px', textTransform: 'uppercase' }}>
              <tr>
                <th style={{ padding: '16px 24px', borderBottom: '1px solid #D5D7DA' }}>Empresa</th>
                <th style={{ padding: '16px 24px', borderBottom: '1px solid #D5D7DA' }}>Data de Registo</th>
                <th style={{ padding: '16px 24px', borderBottom: '1px solid #D5D7DA' }}>Estado</th>
                <th style={{ padding: '16px 24px', borderBottom: '1px solid #D5D7DA' }}>Limite de Utilizadores</th>
                <th style={{ padding: '16px 24px', borderBottom: '1px solid #D5D7DA', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map(empresa => (
                <tr key={empresa.id} style={{ borderBottom: '1px solid #E7E9EB' }}>
                  <td style={{ padding: '16px 24px', fontWeight: 500, color: '#1D2D3E' }}>
                    {empresa.nome}
                    {vazias.has(String(empresa.id)) && (
                      <span title="Repetida do registo: não tem utilizadores nem dados"
                        style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '2px', fontSize: '11px', fontWeight: 700, backgroundColor: '#FCEFDD', color: '#8A4B0B' }}>
                        REPETIDA · SEM UTILIZADORES
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '16px 24px', color: '#5B738B' }}>{new Date(empresa.criado_em).toLocaleDateString()}</td>
                  <td style={{ padding: '16px 24px' }}>
                    <span style={{ 
                      padding: '4px 12px', borderRadius: '2px', fontSize: '12px', fontWeight: 600,
                      backgroundColor: empresa.status === 'active' ? '#DCEEE2' : empresa.status === 'pending' ? '#FCEFDD' : '#F6DEDE',
                      color: empresa.status === 'active' ? '#107E3E' : empresa.status === 'pending' ? '#8A4B0B' : '#BB0000'
                    }}>
                      {empresa.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '16px 24px', color: empresa.limite_usuarios === null || empresa.limite_usuarios === undefined ? '#8996A3' : '#1D2D3E', fontWeight: 500 }}>
                    {empresa.limite_usuarios === null || empresa.limite_usuarios === undefined ? 'Ilimitado' : `${empresa.limite_usuarios} utilizador${empresa.limite_usuarios === 1 ? '' : 'es'}`}
                  </td>
                  <td style={{ padding: '16px 24px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button onClick={() => openModulosModal(empresa)} style={{ padding: '6px 12px', backgroundColor: '#1D2D3E', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }} title="Gerir Licenciamento">
                      <Settings size={14} /> Módulos
                    </button>
                    {empresa.status !== 'active' && (
                      <button onClick={() => updateEmpresaStatus(empresa.id, 'active')} style={{ padding: '6px 12px', backgroundColor: '#107E3E', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle size={14} /> Aprovar
                      </button>
                    )}
                    {empresa.status !== 'suspended' && (
                      <button onClick={() => updateEmpresaStatus(empresa.id, 'suspended')} style={{ padding: '6px 12px', backgroundColor: '#BB0000', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <XCircle size={14} /> Suspender
                      </button>
                    )}
                    {vazias.has(String(empresa.id)) && (
                      <button
                        onClick={() => apagarEmpresaVazia(empresa)}
                        disabled={aApagar === empresa.id}
                        title="Apagar esta empresa repetida (só funciona se estiver mesmo vazia)"
                        style={{ padding: '6px 12px', backgroundColor: 'white', color: '#BB0000', border: '1px solid #BB0000', borderRadius: '2px', cursor: aApagar === empresa.id ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Trash2 size={14} /> {aApagar === empresa.id ? 'A apagar...' : 'Apagar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {empresas.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#8996A3' }}>Nenhuma empresa registada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '2px', border: '1px solid #D5D7DA', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: '#F5F6F7', color: '#5B738B', fontSize: '13px', textTransform: 'uppercase' }}>
              <tr>
                <th style={{ padding: '16px 24px', borderBottom: '1px solid #D5D7DA' }}>Utilizador</th>
                <th style={{ padding: '16px 24px', borderBottom: '1px solid #D5D7DA' }}>Email</th>
                <th style={{ padding: '16px 24px', borderBottom: '1px solid #D5D7DA' }}>Empresa</th>
                <th style={{ padding: '16px 24px', borderBottom: '1px solid #D5D7DA' }}>Função</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} style={{ borderBottom: '1px solid #E7E9EB' }}>
                  <td style={{ padding: '16px 24px', fontWeight: 500, color: '#1D2D3E' }}>{user.nome}</td>
                  <td style={{ padding: '16px 24px', color: '#5B738B' }}>{user.email}</td>
                  <td style={{ padding: '16px 24px', color: '#5B738B' }}>{user.empresas?.nome || '-'}</td>
                  <td style={{ padding: '16px 24px' }}>
                     <span style={{ padding: '4px 8px', borderRadius: '2px', backgroundColor: '#E7E9EB', color: '#5B738B', fontSize: '12px', fontWeight: 600 }}>
                        {user.role}
                     </span>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#8996A3' }}>Nenhum utilizador encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Módulos (Licenciamento SaaS) */}
      {showModal && editingEmpresa && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', borderRadius: '2px', width: '500px', maxWidth: '90%', boxShadow: '0 2px 10px rgba(29,45,62,0.2)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #D5D7DA', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F5F6F7', borderTopLeftRadius: '2px', borderTopRightRadius: '2px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', color: '#1D2D3E', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={20} color="#0E5A6B" /> 
                Licenciamento: {editingEmpresa.nome}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B738B' }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              <div style={{ marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid #D5D7DA' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1D2D3E', marginBottom: '6px' }}>
                  Limite de Utilizadores (lugares do plano)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={empresaLimite}
                  onChange={e => setEmpresaLimite(e.target.value)}
                  placeholder="Ilimitado"
                  style={{ width: '160px', padding: '8px 12px', borderRadius: '2px', border: '1px solid #D5D7DA', fontSize: '14px', outline: 'none' }}
                />
                <p style={{ margin: '8px 0 0 0', color: '#5B738B', fontSize: '12.5px' }}>
                  Número máximo de utilizadores ativos que esta empresa pode ter. Deixe em branco para não limitar. Ao atingir o limite, os administradores da empresa deixam de conseguir aprovar ou reativar novos utilizadores.
                </p>
              </div>

              <p style={{ margin: '0 0 16px 0', color: '#5B738B', fontSize: '14px' }}>
                Selecione os módulos que esta empresa contratou. Os utilizadores desta empresa apenas terão acesso às ferramentas selecionadas abaixo.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {AVAILABLE_MODULES.map(mod => (
                  <label key={mod.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', border: '1px solid #D5D7DA', borderRadius: '2px', cursor: 'pointer', background: empresaModulos.includes(mod.id) ? '#DCEEE2' : 'white', transition: 'all 0.2s' }}>
                    <input 
                      type="checkbox" 
                      checked={empresaModulos.includes(mod.id)}
                      onChange={() => toggleModulo(mod.id)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#107E3E' }}
                    />
                    <span style={{ fontWeight: 500, color: empresaModulos.includes(mod.id) ? '#107E3E' : '#1D2D3E' }}>
                      {mod.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #D5D7DA', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#F5F6F7', borderBottomLeftRadius: '2px', borderBottomRightRadius: '2px' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '10px 16px', background: 'white', border: '1px solid #D5D7DA', color: '#5B738B', borderRadius: '2px', fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={saveModulos} disabled={savingModulos} style={{ padding: '10px 16px', background: '#107E3E', border: 'none', color: 'white', borderRadius: '2px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {savingModulos ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Guardar Alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminApp;
