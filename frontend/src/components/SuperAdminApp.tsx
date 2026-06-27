import React, { useState, useEffect } from 'react';
import { Shield, Building, Users, CheckCircle, XCircle, Clock, Loader2, AlertCircle, Settings, Save, X } from 'lucide-react';

interface Empresa {
  id: string;
  nome: string;
  status: 'pending' | 'active' | 'suspended';
  criado_em: string;
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
  const [users, setUsers] = useState<Utilizador[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal de Licenciamento
  const [showModal, setShowModal] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [empresaModulos, setEmpresaModulos] = useState<string[]>([]);
  const [savingModulos, setSavingModulos] = useState(false);

  const AVAILABLE_MODULES = [
    { id: 'hr', name: 'RH & Triagem' },
    { id: 'crm', name: 'Vendas CRM' },
    { id: 'auto', name: 'Autopilot' },
    { id: 'wa', name: 'WhatsApp Omnichannel' },
    { id: 'data', name: 'Relatórios' },
    { id: 'chat', name: 'Assistente IA' },
    { id: 'pc', name: 'Meu PC (Desktop)' },
    { id: 'kb', name: 'Conhecimento IA' },
    { id: 'email', name: 'Caixa de Email' },
    { id: 'reunioes', name: 'Reuniões Inteligentes' },
  ];

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      // Mock for MVP design phase
      await new Promise(resolve => setTimeout(resolve, 800));
      
      if (activeTab === 'empresas') {
        const stored = localStorage.getItem('mock_empresas');
        if (stored) {
          setEmpresas(JSON.parse(stored));
        } else {
          const initial = [
            { id: '1', nome: 'TOP IA (Sua Empresa)', status: 'active', criado_em: new Date().toISOString() },
            { id: '2', nome: 'TopConsultores', status: 'pending', criado_em: new Date().toISOString() }
          ];
          setEmpresas(initial);
          localStorage.setItem('mock_empresas', JSON.stringify(initial));
        }
      } else {
        setUsers([
          { id: '1', email: 'geral@topia.solutions', nome: 'Administrador TOP IA', role: 'superadmin', ativo: true, criado_em: new Date().toISOString(), empresas: { nome: 'TOP IA' } },
          { id: '2', email: 'elvessacapuri57@gmail.com', nome: 'Elves Sacapuri', role: 'admin', ativo: true, criado_em: new Date().toISOString(), empresas: { nome: 'TopConsultores' } }
        ]);
      }
    } catch (err: any) {
      setError('Erro inesperado.');
    } finally {
      setLoading(false);
    }
  };

  const updateEmpresaStatus = async (id: string, status: string) => {
    try {
      // Mock for MVP
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Atualizar lista localmente
      setEmpresas(prev => {
        const updated = prev.map(emp => emp.id === id ? { ...emp, status: status as any } : emp);
        localStorage.setItem('mock_empresas', JSON.stringify(updated));
        return updated;
      });
    } catch (err: any) {
      alert('Erro inesperado.');
    }
  };

  const openModulosModal = async (empresa: Empresa) => {
    setEditingEmpresa(empresa);
    setShowModal(true);
    setEmpresaModulos([]); // clear while loading
    try {
      const token = localStorage.getItem('os_auth_token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/superadmin/empresas/${empresa.id}/modulos`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setEmpresaModulos(data.modulos);
      }
    } catch(e) {
      console.error("Erro ao carregar módulos", e);
    }
  };

  const saveModulos = async () => {
    if (!editingEmpresa) return;
    setSavingModulos(true);
    try {
      // Mock for MVP
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setShowModal(false);
      alert('Licenciamento atualizado com sucesso!');
    } catch (err: any) {
      alert('Erro inesperado.');
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
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', width: '100%', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Shield size={32} color="#fbbf24" />
        <h1 style={{ margin: 0, color: '#ffffff', fontSize: '24px' }}>Gestão Global SaaS</h1>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', borderBottom: '1px solid #e2e8f0' }}>
        <button
          onClick={() => setActiveTab('empresas')}
          style={{
            padding: '12px 24px', background: 'none', border: 'none', borderBottom: activeTab === 'empresas' ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeTab === 'empresas' ? '#3b82f6' : '#64748b', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <Building size={18} /> Empresas
        </button>
        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '12px 24px', background: 'none', border: 'none', borderBottom: activeTab === 'users' ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeTab === 'users' ? '#3b82f6' : '#64748b', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <Users size={18} /> Utilizadores Globais
        </button>
      </div>

      {error && (
        <div style={{ padding: '16px', backgroundColor: '#fef2f2', color: '#ef4444', borderRadius: '8px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={20} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader2 className="animate-spin" size={32} color="#3b82f6" /></div>
      ) : activeTab === 'empresas' ? (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: '#f8fafc', color: '#475569', fontSize: '13px', textTransform: 'uppercase' }}>
              <tr>
                <th style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0' }}>Empresa</th>
                <th style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0' }}>Data de Registo</th>
                <th style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0' }}>Estado</th>
                <th style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map(empresa => (
                <tr key={empresa.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '16px 24px', fontWeight: 500, color: '#1e293b' }}>{empresa.nome}</td>
                  <td style={{ padding: '16px 24px', color: '#64748b' }}>{new Date(empresa.criado_em).toLocaleDateString()}</td>
                  <td style={{ padding: '16px 24px' }}>
                    <span style={{ 
                      padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                      backgroundColor: empresa.status === 'active' ? '#dcfce7' : empresa.status === 'pending' ? '#fef3c7' : '#fee2e2',
                      color: empresa.status === 'active' ? '#166534' : empresa.status === 'pending' ? '#92400e' : '#991b1b'
                    }}>
                      {empresa.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '16px 24px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button onClick={() => openModulosModal(empresa)} style={{ padding: '6px 12px', backgroundColor: '#334155', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }} title="Gerir Licenciamento">
                      <Settings size={14} /> Módulos
                    </button>
                    {empresa.status !== 'active' && (
                      <button onClick={() => updateEmpresaStatus(empresa.id, 'active')} style={{ padding: '6px 12px', backgroundColor: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle size={14} /> Aprovar
                      </button>
                    )}
                    {empresa.status !== 'suspended' && (
                      <button onClick={() => updateEmpresaStatus(empresa.id, 'suspended')} style={{ padding: '6px 12px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <XCircle size={14} /> Suspender
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {empresas.length === 0 && (
                <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>Nenhuma empresa registada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: '#f8fafc', color: '#475569', fontSize: '13px', textTransform: 'uppercase' }}>
              <tr>
                <th style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0' }}>Utilizador</th>
                <th style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0' }}>Email</th>
                <th style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0' }}>Empresa</th>
                <th style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0' }}>Função</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '16px 24px', fontWeight: 500, color: '#1e293b' }}>{user.nome}</td>
                  <td style={{ padding: '16px 24px', color: '#64748b' }}>{user.email}</td>
                  <td style={{ padding: '16px 24px', color: '#64748b' }}>{user.empresas?.nome || '-'}</td>
                  <td style={{ padding: '16px 24px' }}>
                     <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: '#f1f5f9', color: '#475569', fontSize: '12px', fontWeight: 600 }}>
                        {user.role}
                     </span>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>Nenhum utilizador encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Módulos (Licenciamento SaaS) */}
      {showModal && editingEmpresa && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '500px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={20} color="#3b82f6" /> 
                Licenciamento: {editingEmpresa.nome}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              <p style={{ margin: '0 0 16px 0', color: '#475569', fontSize: '14px' }}>
                Selecione os módulos que esta empresa contratou. Os utilizadores desta empresa apenas terão acesso às ferramentas selecionadas abaixo.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {AVAILABLE_MODULES.map(mod => (
                  <label key={mod.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', background: empresaModulos.includes(mod.id) ? '#f0fdf4' : 'white', transition: 'all 0.2s' }}>
                    <input 
                      type="checkbox" 
                      checked={empresaModulos.includes(mod.id)}
                      onChange={() => toggleModulo(mod.id)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#22c55e' }}
                    />
                    <span style={{ fontWeight: 500, color: empresaModulos.includes(mod.id) ? '#166534' : '#334155' }}>
                      {mod.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#f8fafc', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '10px 16px', background: 'white', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={saveModulos} disabled={savingModulos} style={{ padding: '10px 16px', background: '#22c55e', border: 'none', color: 'white', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
