import { useState, useEffect } from 'react';
import ChatApp from './components/ChatApp';
import HrApp from './components/HrApp';
import CrmApp from './components/CrmApp';
import LocalSystemApp from './components/LocalSystemApp';
import AutomationApp from './components/AutomationApp';
import AuthScreen from './components/AuthScreen';
import LandingPage from './components/LandingPage';
import WhatsAppChatApp from './components/WhatsAppChatApp';
import KnowledgeBaseApp from './components/KnowledgeBaseApp';
import EmailApp from './components/EmailApp';
import SettingsApp from './components/SettingsApp';
import SuperAdminApp from './components/SuperAdminApp';
import ReunioesApp from './components/ReunioesApp';
import DataApp from './components/DataApp';
import AfiliadosApp from './components/AfiliadosApp';
import ContabilidadeApp from './components/ContabilidadeApp';
import PortalAfiliado from './components/PortalAfiliado';
import { LayoutGrid, Users, Briefcase, PieChart, Bot, Monitor, Zap, LogOut, MessageSquare, BookOpen, Mail, Settings, Clock, Globe, Video, Share2, Calculator } from 'lucide-react';

const IS_AFFILIATE_PORTAL = window.location.pathname === '/portal-afiliado';

const ROLE_PERMISSIONS: Record<string, string[]> = {
  superadmin: ['home', 'superadmin', 'hr', 'crm', 'data', 'chat', 'pc', 'auto', 'wa', 'kb', 'email', 'settings', 'reunioes', 'afiliados', 'contabilidade'],
  admin: ['home', 'hr', 'crm', 'data', 'chat', 'pc', 'auto', 'wa', 'kb', 'email', 'settings', 'reunioes', 'afiliados', 'contabilidade'],
  hr_manager: ['home', 'hr', 'chat', 'kb', 'email', 'reunioes'],
  rh_user: ['home', 'hr', 'chat', 'kb', 'reunioes'],
  sales_manager: ['home', 'crm', 'wa', 'email', 'data', 'chat', 'kb', 'reunioes', 'afiliados'],
  agente: ['home', 'wa', 'chat', 'kb', 'email', 'reunioes'],
  pending: [] // Bloqueado
};

function App() {
  const [activeModule, setActiveModule] = useState<'home' | 'hr' | 'crm' | 'data' | 'chat' | 'pc' | 'auto' | 'wa' | 'kb' | 'email' | 'settings' | 'superadmin' | 'reunioes' | 'afiliados' | 'contabilidade'>('home');
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [showLanding, setShowLanding] = useState<boolean>(true);
  const [meetingIdFromUrl, setMeetingIdFromUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Intercetador Global de fetch para lidar com 401 Token Expirado
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401) {
        try {
          const clone = response.clone();
          const data = await clone.json();
          if (data.error === 'Token inválido ou expirado.') {
            window.dispatchEvent(new Event('auth-expired'));
          }
        } catch(e) {}
      }
      return response;
    };

    const handleExpired = () => {
      alert("A sua sessão expirou por motivos de segurança. Por favor, faça login novamente.");
      handleLogout();
    };
    window.addEventListener('auth-expired', handleExpired);

    // Verificar sessão existente
    const storedToken = localStorage.getItem('os_auth_token');
    const storedUser = localStorage.getItem('os_auth_user');
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }

    // Verificar query param de meeting e afiliados
    const params = new URLSearchParams(window.location.search);
    const mId = params.get('meetingId');
    if (mId) {
      setMeetingIdFromUrl(mId);
    }

    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('os_affiliate_ref', ref.toUpperCase());
      localStorage.setItem('os_affiliate_date', new Date().toISOString());
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    return () => {
      window.fetch = originalFetch;
      window.removeEventListener('auth-expired', handleExpired);
    };
  }, []);

  useEffect(() => {
    if (user && token && meetingIdFromUrl) {
      setActiveModule('reunioes');
      setShowLanding(false);
    }
  }, [user, token, meetingIdFromUrl]);

  const handleLogin = (userData: any, authToken: string) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('os_auth_token', authToken);
    localStorage.setItem('os_auth_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setShowLanding(true);
    localStorage.removeItem('os_auth_token');
    localStorage.removeItem('os_auth_user');
  };

  if (IS_AFFILIATE_PORTAL) {
    return <PortalAfiliado />;
  }

  if (!user || !token) {
    if (showLanding) {
      return <LandingPage onGoToApp={() => setShowLanding(false)} />;
    }
    return <AuthScreen onLogin={handleLogin} onBack={() => setShowLanding(true)} />;
  }

  const navigateTo = (module: 'home' | 'hr' | 'crm' | 'data' | 'chat' | 'pc' | 'auto' | 'wa' | 'kb' | 'email' | 'settings' | 'superadmin' | 'reunioes' | 'afiliados' | 'contabilidade') => {
    if (hasAccess(module)) {
      setActiveModule(module);
    }
  };

  const hasAccess = (module: string) => {
    if (!user || !user.role) return false;
    
    // Core modules that are always available
    if (['home', 'settings'].includes(module)) return true;

    // Superadmin panel is only for superadmins
    if (module === 'superadmin') return user.role === 'superadmin';

    // Enterprise Licensing Check (Applies to all companies, even the superadmin's company if configured)
    let companyModules = user.modulos_contratados || ['hr', 'crm', 'reunioes', 'auto', 'wa', 'kb', 'email', 'data', 'chat', 'pc', 'afiliados', 'contabilidade'];
    
    // Força a inclusão do novo módulo para sessões cacheadas
    if (!companyModules.includes('afiliados')) {
      companyModules = [...companyModules, 'afiliados'];
    }
    if (!companyModules.includes('contabilidade')) {
      companyModules = [...companyModules, 'contabilidade'];
    }

    if (!companyModules.includes(module)) return false;

    // After licensing check, superadmin has access to everything permitted by licensing
    if (user.role === 'superadmin') return true;
    
    const perms = ROLE_PERMISSIONS[user.role] || [];
    return perms.includes(module);
  };

  if (user.role === 'pending') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
        <Clock size={48} color="#64748b" style={{ marginBottom: '16px' }} />
        <h2 style={{ color: '#0f172a', marginBottom: '8px' }}>Conta a aguardar aprovação</h2>
        <p style={{ color: '#475569', textAlign: 'center', maxWidth: '400px', lineHeight: 1.5, marginBottom: '24px' }}>
          O seu registo foi efetuado com sucesso. A sua conta está pendente de aprovação por um administrador do sistema. Receberá acesso às ferramentas assim que for atribuída a sua função.
        </p>
        <button 
          onClick={handleLogout}
          style={{ padding: '10px 20px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
        >
          Sair
        </button>
      </div>
    );
  }

  return (
    <div className="odoo-layout">
      {/* Odoo Topbar */}
      <div className="odoo-topbar">
        <div className="odoo-app-switcher" onClick={() => navigateTo('home')} title="Aplicações">
          <LayoutGrid color="white" size={20} />
        </div>
        
        {activeModule !== 'home' && (
          <div className="odoo-topbar-brand">
            {activeModule === 'hr' && 'Recursos Humanos'}
            {activeModule === 'crm' && 'CRM'}
            {activeModule === 'data' && 'Relatórios'}
            {activeModule === 'chat' && 'Assistente IA'}
            {activeModule === 'pc' && 'Meu Computador'}
            {activeModule === 'auto' && 'Autopilot (Workflows)'}
            {activeModule === 'wa' && 'WhatsApp Omnichannel'}
            {activeModule === 'kb' && 'Base de Conhecimento'}
            {activeModule === 'email' && 'Email'}
            {activeModule === 'settings' && 'Definições'}
            {activeModule === 'superadmin' && 'Painel Global SaaS'}
            {activeModule === 'reunioes' && 'Reuniões Inteligentes'}
            {activeModule === 'afiliados' && 'Programa de Afiliados'}
            {activeModule === 'contabilidade' && 'Contabilidade ERP'}
          </div>
        )}

        {activeModule === 'hr' && (
          <div className="odoo-topnav">
            <div className="odoo-nav-link" onClick={() => {
              navigateTo('hr');
              window.dispatchEvent(new CustomEvent('hr-tab-change', { detail: 'salarios' }));
            }}>Processamento</div>
            <div className="odoo-nav-link" onClick={() => {
              window.dispatchEvent(new CustomEvent('hr-tab-change', { detail: 'colaboradores' }));
            }}>Colaboradores</div>
            <div className="odoo-nav-link" onClick={() => {
              window.dispatchEvent(new CustomEvent('hr-tab-change', { detail: 'recrutamento' }));
            }}>Recrutamento IA</div>
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
          {hasAccess('chat') && (
            <div className="odoo-nav-link" onClick={() => navigateTo('chat')}>
              Copilot IA
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingLeft: '16px', borderLeft: '1px solid rgba(255,255,255,0.15)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: '1.3' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'white' }}>{user?.nome || 'Utilizador'}</span>
              <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.85)' }}>
                {user?.role?.toUpperCase()}
              </span>
            </div>
            
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'white' }}>
                {user?.nome ? user.nome.charAt(0).toUpperCase() : 'U'}
              </span>
            </div>

            <button 
              onClick={handleLogout}
              style={{ background: 'transparent', border: 'none', color: 'rgba(255, 255, 255, 0.9)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '6px', borderRadius: '6px', marginLeft: '4px', transition: 'all 0.2s' }}
              title="Sair"
              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'; e.currentTarget.style.color = 'white'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)'; }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Odoo Dashboard (Home) */}
      {activeModule === 'home' && (
        <div className="odoo-dashboard">
          <div className="odoo-apps-grid">
            
            {hasAccess('hr') && (
              <div className="odoo-app-icon-container" onClick={() => navigateTo('hr')}>
                <div className="odoo-app-icon" style={{ background: 'linear-gradient(135deg, #714B67 0%, #a26591 100%)' }}>
                  <Users size={40} color="white" strokeWidth={1.5} />
                </div>
                <div className="odoo-app-name">RH & Triagem</div>
              </div>
            )}

            {hasAccess('crm') && (
              <div className="odoo-app-icon-container" onClick={() => navigateTo('crm')}>
                <div className="odoo-app-icon" style={{ background: 'linear-gradient(135deg, #017E84 0%, #03b6bd 100%)' }}>
                  <Briefcase size={40} color="white" strokeWidth={1.5} />
                </div>
                <div className="odoo-app-name">Vendas CRM</div>
              </div>
            )}

            {hasAccess('contabilidade') && (
              <div className="odoo-app-icon-container" onClick={() => navigateTo('contabilidade')}>
                <div className="odoo-app-icon" style={{ background: 'linear-gradient(135deg, #374151 0%, #111827 100%)' }}>
                  <Calculator size={40} color="white" strokeWidth={1.5} />
                </div>
                <div className="odoo-app-name">Contabilidade</div>
              </div>
            )}

            {hasAccess('auto') && (
              <div className="odoo-app-icon-container" onClick={() => navigateTo('auto')}>
                <div className="odoo-app-icon" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)' }}>
                  <Zap size={40} color="white" strokeWidth={1.5} />
                </div>
                <div className="odoo-app-name">Autopilot</div>
              </div>
            )}

            {hasAccess('wa') && (
              <div className="odoo-app-icon-container" onClick={() => navigateTo('wa')}>
                <div className="odoo-app-icon" style={{ background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)' }}>
                  <MessageSquare size={40} color="white" strokeWidth={1.5} />
                </div>
                <div className="odoo-app-name">WhatsApp</div>
              </div>
            )}

            {hasAccess('data') && (
              <div className="odoo-app-icon-container" onClick={() => navigateTo('data')}>
                <div className="odoo-app-icon" style={{ background: 'linear-gradient(135deg, #E67E22 0%, #f39c12 100%)' }}>
                  <PieChart size={40} color="white" strokeWidth={1.5} />
                </div>
                <div className="odoo-app-name">Relatórios</div>
              </div>
            )}

            {hasAccess('afiliados') && (
              <div className="odoo-app-icon-container" onClick={() => navigateTo('afiliados')}>
                <div className="odoo-app-icon" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
                  <Share2 size={40} color="white" strokeWidth={1.5} />
                </div>
                <div className="odoo-app-name">Parcerias</div>
              </div>
            )}

            {hasAccess('chat') && (
              <div className="odoo-app-icon-container" onClick={() => navigateTo('chat')}>
                <div className="odoo-app-icon" style={{ background: 'linear-gradient(135deg, #2C3E50 0%, #34495e 100%)' }}>
                  <Bot size={40} color="white" strokeWidth={1.5} />
                </div>
                <div className="odoo-app-name">Assistente IA</div>
              </div>
            )}

            {hasAccess('pc') && (
              <div className="odoo-app-icon-container" onClick={() => navigateTo('pc')}>
                <div className="odoo-app-icon" style={{ background: 'linear-gradient(135deg, #7f8c8d 0%, #95a5a6 100%)' }}>
                  <Monitor size={40} color="white" strokeWidth={1.5} />
                </div>
                <div className="odoo-app-name">Meu PC</div>
              </div>
            )}

            {hasAccess('kb') && (
              <div className="odoo-app-icon-container" onClick={() => navigateTo('kb')}>
                <div className="odoo-app-icon" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}>
                  <BookOpen size={40} color="white" strokeWidth={1.5} />
                </div>
                <div className="odoo-app-name">Conhecimento IA</div>
              </div>
            )}

            {hasAccess('email') && (
              <div className="odoo-app-icon-container" onClick={() => navigateTo('email')}>
                <div className="odoo-app-icon" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e40af 100%)' }}>
                  <Mail size={40} color="white" strokeWidth={1.5} />
                </div>
                <div className="odoo-app-name">Email</div>
              </div>
            )}

            {hasAccess('settings') && (
              <div className="odoo-app-icon-container" onClick={() => navigateTo('settings')}>
                <div className="odoo-app-icon" style={{ background: 'linear-gradient(135deg, #334155 0%, #64748b 100%)' }}>
                  <Settings size={40} color="white" strokeWidth={1.5} />
                </div>
                <div className="odoo-app-name">Definições</div>
              </div>
            )}

            {hasAccess('superadmin') && (
              <div className="odoo-app-icon-container" onClick={() => navigateTo('superadmin')}>
                <div className="odoo-app-icon" style={{ background: 'linear-gradient(135deg, #111827 0%, #374151 100%)', border: '2px solid #fbbf24' }}>
                  <Globe size={40} color="#fbbf24" strokeWidth={1.5} />
                </div>
                <div className="odoo-app-name" style={{ fontWeight: 'bold' }}>SaaS Global</div>
              </div>
            )}

            {hasAccess('reunioes') && (
              <div className="odoo-app-icon-container" onClick={() => navigateTo('reunioes')}>
                <div className="odoo-app-icon" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}>
                  <Video size={40} color="white" strokeWidth={1.5} />
                </div>
                <div className="odoo-app-name" style={{ fontWeight: 'bold' }}>Reuniões IA</div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Main Content Areas */}
      {activeModule !== 'home' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {activeModule === 'hr' && <HrApp />}
          {activeModule === 'pc' && <LocalSystemApp />}
          {activeModule === 'crm' && <CrmApp />}
          {activeModule === 'auto' && <AutomationApp />}
          {activeModule === 'wa' && <WhatsAppChatApp />}
          {activeModule === 'kb' && <KnowledgeBaseApp />}
          {activeModule === 'email' && <EmailApp />}
          {activeModule === 'settings' && <SettingsApp />}
          {activeModule === 'superadmin' && <SuperAdminApp />}
          {activeModule === 'reunioes' && <ReunioesApp initialMeetingId={meetingIdFromUrl} />}
          {activeModule === 'data' && <DataApp />}
          {activeModule === 'afiliados' && <AfiliadosApp />}
          {activeModule === 'contabilidade' && <ContabilidadeApp />}

          {activeModule === 'chat' && (
             <div className="odoo-content-area" style={{ padding: 0 }}>
                <div style={{ width: '100%', height: '100%', maxWidth: '800px', margin: '0 auto', borderLeft: '1px solid var(--odoo-border)', borderRight: '1px solid var(--odoo-border)' }}>
                  <ChatApp />
                </div>
             </div>
          )}
        </div>
      )}

    </div>
  );
}

export default App;
