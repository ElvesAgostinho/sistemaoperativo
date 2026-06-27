import React, { useState, useEffect } from 'react';
import { Settings, Mail, Key, CheckCircle, AlertCircle, Loader, Save, Wifi, Users, UserCheck, Shield, FileText, Building } from 'lucide-react';

type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

interface SmtpConfig {
    smtp_nome: string;
    smtp_user: string;
    smtp_pass: string;
    smtp_host: string;
    smtp_port: string;
    smtp_secure: string;
}

export default function SettingsApp() {
    const [smtp, setSmtp] = useState<SmtpConfig>({
        smtp_nome: '',
        smtp_user: '',
        smtp_pass: '',
        smtp_host: 'smtp.gmail.com',
        smtp_port: '587',
        smtp_secure: 'false',
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [testStatus, setTestStatus] = useState<TestStatus>('idle');
    const [testMsg, setTestMsg] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [activeTab, setActiveTab] = useState<'email' | 'empresa' | 'openai' | 'equipa' | 'seguranca' | 'documentos'>('email');

    // Segurança
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordSaving, setPasswordSaving] = useState(false);

    // Empresa state
    const [empresaConfig, setEmpresaConfig] = useState({
        COMPANY_NAME: '',
        COMPANY_NIF: '',
        COMPANY_EMAIL: '',
        COMPANY_PHONE: '',
        COMPANY_ADDRESS: ''
    });

    // Documentos (Logo)
    const [logoBase64, setLogoBase64] = useState('');
    const [logoPosition, setLogoPosition] = useState('top-left');
    // Equipa state
    const [users, setUsers] = useState<any[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const currentUser = JSON.parse(localStorage.getItem('os_auth_user') || '{}');

    // Carrega configuracoes actuais
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const token = localStorage.getItem('os_auth_token');
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/settings`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.success && data.configuracoes) {
                    setSmtp(p => ({
                        ...p,
                        smtp_nome: data.configuracoes.smtp_nome || '',
                        smtp_user: data.configuracoes.smtp_user || '',
                        smtp_pass: data.configuracoes.smtp_pass || '',
                        smtp_host: data.configuracoes.smtp_host || 'smtp.gmail.com',
                        smtp_port: data.configuracoes.smtp_port || '587',
                        smtp_secure: data.configuracoes.smtp_secure || 'false'
                    }));
                }
            } catch (err) {
                console.error('Erro ao carregar configuracoes:', err);
            }
        };
        loadSettings();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        try {
            const token = localStorage.getItem('os_auth_token');
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/settings`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(smtp)
            });
            const data = await res.json();
            if (data.success) {
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            } else {
                setTestStatus('error');
                setTestMsg(data.error || 'Erro ao guardar configurações');
            }
        } catch (err) {
            console.error(err);
            setTestStatus('error');
            setTestMsg('Erro de rede ao guardar configurações.');
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTestStatus('testing');
        setTestMsg('');
        try {
            const token = localStorage.getItem('os_auth_token');
            const res = await fetch(import.meta.env.VITE_API_URL + '/api/knowledge/email/test', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.ok) {
                setTestStatus('ok');
                setTestMsg('Conexão SMTP estabelecida com sucesso! O email está pronto para enviar.');
            } else {
                setTestStatus('error');
                setTestMsg(data.erro || 'Falha na conexão SMTP.');
            }
        } catch {
            setTestStatus('error');
            setTestMsg('Não foi possível contactar o servidor.');
        }
    };

    const fetchUsers = async () => {
        if (currentUser?.role !== 'admin' && currentUser?.role !== 'superadmin') return;
        setLoadingUsers(true);
        try {
            const token = localStorage.getItem('os_auth_token');
            const res = await fetch(import.meta.env.VITE_API_URL + '/api/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setUsers(data.users);
            }
        } catch (err) {
            console.error('Erro ao carregar equipa', err);
        } finally {
            setLoadingUsers(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'equipa') {
            fetchUsers();
        }
    }, [activeTab]);

    const handleChangeRole = async (id: string, newRole: string) => {
        try {
            const token = localStorage.getItem('os_auth_token');
            await fetch(`${import.meta.env.VITE_API_URL}/api/users/${id}/role`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole })
            });
            fetchUsers(); // Refresh
        } catch (err) {
            console.error(err);
        }
    };

    const handleChangeStatus = async (id: string, ativo: boolean) => {
        try {
            const token = localStorage.getItem('os_auth_token');
            await fetch(`${import.meta.env.VITE_API_URL}/api/users/${id}/status`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ativo })
            });
            fetchUsers(); // Refresh
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div style={{ height: '100%', display: 'flex', backgroundColor: '#f8fafc', overflow: 'hidden' }}>

            {/* Sidebar */}
            <div style={{ width: '220px', backgroundColor: 'white', borderRight: '1px solid #e2e8f0', padding: '24px 0' }}>
                <div style={{ padding: '0 16px 16px', borderBottom: '1px solid #e2e8f0', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', color: '#0f172a', fontSize: '16px' }}>
                        <Settings size={20} color="#1e40af" /> Definições
                    </div>
                </div>
                {[
                    { id: 'empresa', label: 'Dados da Empresa', icon: <Building size={16} /> },
                    { id: 'email', label: 'Email & SMTP', icon: <Mail size={16} /> },
                    { id: 'openai', label: 'OpenAI / IA', icon: <Key size={16} /> },
                    { id: 'documentos', label: 'Personalização de Documentos', icon: <FileText size={16} /> },
                    { id: 'seguranca', label: 'Segurança', icon: <Shield size={16} /> },
                    ...((currentUser?.role === 'admin' || currentUser?.role === 'superadmin') ? [{ id: 'equipa', label: 'Gestão de Equipa', icon: <Users size={16} /> }] : []),
                ].map(item => (
                    <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id as any)}
                        style={{
                            width: '100%', padding: '10px 16px', border: 'none', background: activeTab === item.id ? '#eff6ff' : 'none',
                            textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                            color: activeTab === item.id ? '#1d4ed8' : '#475569', fontWeight: activeTab === item.id ? '600' : '400',
                            fontSize: '14px', borderLeft: activeTab === item.id ? '3px solid #1d4ed8' : '3px solid transparent',
                        }}
                    >
                        {item.icon} {item.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>

                {activeTab === 'email' && (
                    <div style={{ maxWidth: '680px' }}>
                        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>Configurações de Email</h1>
                        <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 32px 0' }}>
                            Configure o servidor SMTP para envio de emails. Cada cliente tem as suas próprias credenciais guardadas de forma segura na base de dados.
                        </p>

                        {/* Card Principal */}
                        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '24px' }}>
                            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(135deg, #eff6ff, #f8fafc)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '700', color: '#1e293b', fontSize: '16px' }}>
                                    <Mail size={20} color="#1e40af" /> Servidor SMTP
                                </div>
                                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Para Gmail: use smtp.gmail.com com porta 587 e uma App Password (não a password normal).</p>
                            </div>

                            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Nome do Remetente</label>
                                        <input
                                            value={smtp.smtp_nome}
                                            onChange={e => setSmtp(p => ({ ...p, smtp_nome: e.target.value }))}
                                            placeholder="ex: Empresa ABC"
                                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Email (Utilizador SMTP)</label>
                                        <input
                                            type="email"
                                            value={smtp.smtp_user}
                                            onChange={e => setSmtp(p => ({ ...p, smtp_user: e.target.value }))}
                                            placeholder="geral@minhaempresa.com"
                                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Password / App Password</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={showPass ? 'text' : 'password'}
                                            value={smtp.smtp_pass}
                                            onChange={e => setSmtp(p => ({ ...p, smtp_pass: e.target.value }))}
                                            placeholder="Para Gmail: crie uma App Password nas definições Google"
                                            style={{ width: '100%', padding: '10px 44px 10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                                        />
                                        <button
                                            onClick={() => setShowPass(!showPass)}
                                            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '12px' }}
                                        >
                                            {showPass ? 'Ocultar' : 'Mostrar'}
                                        </button>
                                    </div>
                                    <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                                        💡 No Gmail, vai a <strong>Conta Google → Segurança → Verificação em 2 passos → Palavras-passe de apps</strong>
                                    </p>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Servidor SMTP (Host)</label>
                                        <input
                                            value={smtp.smtp_host}
                                            onChange={e => setSmtp(p => ({ ...p, smtp_host: e.target.value }))}
                                            placeholder="smtp.gmail.com"
                                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Porta</label>
                                        <input
                                            value={smtp.smtp_port}
                                            onChange={e => setSmtp(p => ({ ...p, smtp_port: e.target.value }))}
                                            placeholder="587"
                                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>SSL/TLS</label>
                                        <select
                                            value={smtp.smtp_secure}
                                            onChange={e => setSmtp(p => ({ ...p, smtp_secure: e.target.value }))}
                                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                                        >
                                            <option value="false">STARTTLS (587)</option>
                                            <option value="true">SSL (465)</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Presets */}
                                <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '10px' }}>Pré-definições Rápidas:</div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {[
                                            { label: 'Gmail', host: 'smtp.gmail.com', port: '587', secure: 'false' },
                                            { label: 'Outlook/Hotmail', host: 'smtp.office365.com', port: '587', secure: 'false' },
                                            { label: 'Yahoo', host: 'smtp.mail.yahoo.com', port: '587', secure: 'false' },
                                            { label: 'Hostinger', host: 'smtp.hostinger.com', port: '587', secure: 'false' },
                                        ].map(preset => (
                                            <button
                                                key={preset.label}
                                                onClick={() => setSmtp(p => ({ ...p, smtp_host: preset.host, smtp_port: preset.port, smtp_secure: preset.secure }))}
                                                style={{ padding: '6px 14px', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white', cursor: 'pointer', fontSize: '13px', color: '#334155', fontWeight: '500' }}
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Status de Teste */}
                        {testStatus === 'ok' && (
                            <div style={{ padding: '14px 18px', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px', color: '#16a34a', marginBottom: '16px' }}>
                                <CheckCircle size={18} /> {testMsg}
                            </div>
                        )}
                        {testStatus === 'error' && (
                            <div style={{ padding: '14px 18px', backgroundColor: '#fff1f2', border: '1px solid #fda4af', borderRadius: '10px', display: 'flex', alignItems: 'flex-start', gap: '10px', color: '#be123c', marginBottom: '16px', fontSize: '14px' }}>
                                <AlertCircle size={18} style={{ marginTop: '1px', flexShrink: 0 }} /> {testMsg}
                            </div>
                        )}

                        {/* Botões */}
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={handleTest}
                                disabled={testStatus === 'testing'}
                                style={{ padding: '10px 20px', border: '1px solid #e2e8f0', background: 'white', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                {testStatus === 'testing' ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Wifi size={16} />}
                                Testar Ligação
                            </button>

                            <button
                                onClick={handleSave}
                                disabled={saving}
                                style={{ padding: '10px 24px', background: saving ? '#93c5fd' : 'linear-gradient(135deg, #1e40af, #3b82f6)', color: 'white', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                {saving ? <Loader size={16} /> : (saved ? <CheckCircle size={16} /> : <Save size={16} />)}
                                {saved ? 'Guardado!' : (saving ? 'A guardar...' : 'Guardar Configurações')}
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'empresa' && (
                    <div style={{ maxWidth: '680px' }}>
                        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>Dados da Empresa</h1>
                        <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 32px 0' }}>
                            Estes dados serão apresentados nos documentos oficiais: Recibos de Vencimento, Declarações e Proformas Comerciais.
                        </p>

                        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Nome da Empresa / Razão Social</label>
                                <input
                                    value={empresaConfig.COMPANY_NAME}
                                    onChange={e => setEmpresaConfig(p => ({ ...p, COMPANY_NAME: e.target.value }))}
                                    placeholder="Nome da sua Empresa, Lda."
                                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>NIF</label>
                                    <input
                                        value={empresaConfig.COMPANY_NIF}
                                        onChange={e => setEmpresaConfig(p => ({ ...p, COMPANY_NIF: e.target.value }))}
                                        placeholder="Ex: 5000000000"
                                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Telefone / Contacto</label>
                                    <input
                                        value={empresaConfig.COMPANY_PHONE}
                                        onChange={e => setEmpresaConfig(p => ({ ...p, COMPANY_PHONE: e.target.value }))}
                                        placeholder="Ex: +244 922 000 000"
                                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Email Institucional</label>
                                <input
                                    type="email"
                                    value={empresaConfig.COMPANY_EMAIL}
                                    onChange={e => setEmpresaConfig(p => ({ ...p, COMPANY_EMAIL: e.target.value }))}
                                    placeholder="geral@empresa.com"
                                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Endereço Completo</label>
                                <textarea
                                    value={empresaConfig.COMPANY_ADDRESS}
                                    onChange={e => setEmpresaConfig(p => ({ ...p, COMPANY_ADDRESS: e.target.value }))}
                                    placeholder="Ex: Av. Principal, Luanda, Angola"
                                    rows={3}
                                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="odoo-btn odoo-btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', fontSize: '14px' }}
                        >
                            {saving ? <Loader className="spin" size={16} /> : <Save size={16} />}
                            {saving ? 'A Guardar...' : 'Guardar Dados da Empresa'}
                        </button>
                    </div>
                )}

                {activeTab === 'openai' && (
                    <div style={{ maxWidth: '680px' }}>
                        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>Configurações de IA</h1>
                        <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 32px 0' }}>
                            A chave OpenAI está configurada no ficheiro <code style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>.env</code> do backend como <code style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>OPENAI_API_KEY</code>. Esta configuração é global para o sistema.
                        </p>
                        <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '10px', padding: '20px 24px' }}>
                            <div style={{ fontWeight: '700', color: '#92400e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><Key size={16} /> Nota de Segurança</div>
                            <p style={{ margin: 0, fontSize: '14px', color: '#78350f', lineHeight: '1.6' }}>
                                Para um SaaS multi-cliente, a OpenAI API Key deve ser centralizada numa conta própria, e o custo de tokens debitado ao cliente via modelo de subscrição. Não partilhes a tua API key com os clientes finais.
                            </p>
                        </div>
                    </div>
                )}

                {activeTab === 'equipa' && (currentUser?.role === 'admin' || currentUser?.role === 'superadmin') && (
                    <div style={{ maxWidth: '900px' }}>
                        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '18px', margin: 0, color: '#1e293b' }}>Gestão de Acessos</h2>
                            {currentUser?.codigo_convite && (
                               <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                  <span style={{ fontSize: '13px', color: '#64748b' }}>Convite da Empresa:</span>
                                  <strong style={{ color: '#0f172a', letterSpacing: '1px' }}>{currentUser.codigo_convite}</strong>
                                  <button 
                                    onClick={() => {
                                       navigator.clipboard.writeText(`${window.location.origin}/?code=${currentUser.codigo_convite}`);
                                       alert('Link de convite copiado!');
                                    }}
                                    style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', marginLeft: '8px' }}>
                                    Copiar Link
                                  </button>
                               </div>
                            )}
                        </div>

                        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Shield size={24} color="#1e40af" /> Gestão de Equipa e Permissões
                        </h1>
                        <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 32px 0' }}>
                            Aprove novos registos, defina perfis de acesso (RBAC) e bloqueie utilizadores inativos.
                        </p>

                        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            {loadingUsers ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}><Loader size={24} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'left' }}>
                                    <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <tr>
                                            <th style={{ padding: '12px 24px', color: '#475569', fontWeight: 600 }}>Utilizador</th>
                                            <th style={{ padding: '12px 24px', color: '#475569', fontWeight: 600 }}>Perfil (Role)</th>
                                            <th style={{ padding: '12px 24px', color: '#475569', fontWeight: 600 }}>Acesso</th>
                                            <th style={{ padding: '12px 24px', color: '#475569', fontWeight: 600 }}>Último Acesso</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map(u => (
                                            <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '16px 24px' }}>
                                                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{u.nome}</div>
                                                </td>
                                                <td style={{ padding: '16px 24px' }}>
                                                    <select 
                                                        value={u.role} 
                                                        onChange={(e) => handleChangeRole(u.id, e.target.value)}
                                                        style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: u.role === 'pending' ? '#fef2f2' : '#f8fafc', color: u.role === 'pending' ? '#ef4444' : '#0f172a', fontWeight: u.role === 'pending' ? 600 : 400, outline: 'none' }}
                                                    >
                                                        <option value="pending">Pendente (Bloqueado)</option>
                                                        <option value="agente">Agente (Operacional)</option>
                                                        <option value="sales_manager">Gestor de Vendas / Supervisor</option>
                                                        <option value="hr_manager">Gestor de RH</option>
                                                        <option value="admin">Administrador (Acesso Total)</option>
                                                    </select>
                                                </td>
                                                <td style={{ padding: '16px 24px' }}>
                                                    <button 
                                                        onClick={() => handleChangeStatus(u.id, !u.ativo)}
                                                        style={{ padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: u.ativo ? '#dcfce7' : '#fee2e2', color: u.ativo ? '#16a34a' : '#ef4444' }}
                                                    >
                                                        {u.ativo ? 'Ativo' : 'Desativado'}
                                                    </button>
                                                </td>
                                                <td style={{ padding: '16px 24px', color: '#64748b', fontSize: '13px' }}>
                                                    {u.ultimo_acesso ? new Date(u.ultimo_acesso).toLocaleString() : 'Nunca'}
                                                </td>
                                            </tr>
                                        ))}
                                        {users.length === 0 && (
                                            <tr>
                                                <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Nenhum utilizador encontrado.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'documentos' && (
                    <div style={{ maxWidth: '680px' }}>
                        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>Personalização de Documentos</h1>
                        <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 32px 0' }}>Faça upload do logótipo da sua empresa para que apareça automaticamente nos PDFs (Recibos de Vencimento e Declarações).</p>
                        
                        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Logótipo da Empresa (PNG ou JPG)</label>
                                <input 
                                    type="file" 
                                    accept="image/png, image/jpeg" 
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onloadend = () => setLogoBase64(reader.result as string);
                                            reader.readAsDataURL(file);
                                        }
                                    }}
                                    style={{ width: '100%', padding: '10px 12px', border: '1px dashed #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
                                />
                                {logoBase64 && (
                                    <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'inline-block' }}>
                                        <img src={logoBase64} alt="Preview Logo" style={{ maxHeight: '80px', maxWidth: '200px', objectFit: 'contain' }} />
                                        <button onClick={() => setLogoBase64('')} style={{ display: 'block', marginTop: '8px', fontSize: '12px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remover Logótipo</button>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Posição do Logótipo nos PDFs</label>
                                <select 
                                    value={logoPosition}
                                    onChange={e => setLogoPosition(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                                >
                                    <option value="top-left">Canto Superior Esquerdo</option>
                                    <option value="top-right">Canto Superior Direito</option>
                                    <option value="top-center">Centro (Cabeçalho)</option>
                                    <option value="watermark">Marca de Água (Centro, Fundo Transparente)</option>
                                </select>
                            </div>

                            <button
                                onClick={handleSave}
                                disabled={saving}
                                style={{ width: 'fit-content', padding: '10px 24px', backgroundColor: '#1d4ed8', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                {saving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
                                {saving ? 'A Guardar...' : 'Guardar Logótipo'}
                            </button>
                            {saved && <span style={{ color: '#16a34a', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={14} /> Guardado!</span>}
                        </div>
                    </div>
                )}

                {activeTab === 'seguranca' && (
                    <div style={{ maxWidth: '680px' }}>
                        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>Segurança</h1>
                        <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 32px 0' }}>Altere a password de acesso à sua conta.</p>
                        
                        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Nova Password</label>
                                <input 
                                    type="password" 
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="No mínimo 6 caracteres"
                                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Confirmar Password</label>
                                <input 
                                    type="password" 
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="Repita a password"
                                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                                />
                            </div>

                            <button
                                onClick={async () => {
                                    if(newPassword !== confirmPassword) { alert('As passwords não coincidem!'); return; }
                                    if(newPassword.length < 6) { alert('Password deve ter pelo menos 6 caracteres'); return; }
                                    setPasswordSaving(true);
                                    try {
                                        const token = localStorage.getItem('os_auth_token');
                                        const res = await fetch(import.meta.env.VITE_API_URL + '/api/auth/update-password', {
                                            method: 'PUT',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Authorization': `Bearer ${token}`
                                            },
                                            body: JSON.stringify({ password: newPassword })
                                        });
                                        const data = await res.json();
                                        if (!data.success) throw new Error(data.error);
                                        
                                        alert('Password atualizada com sucesso!');
                                        setNewPassword('');
                                        setConfirmPassword('');
                                    } catch (err: any) {
                                        alert('Erro ao atualizar password: ' + err.message);
                                    } finally {
                                        setPasswordSaving(false);
                                    }
                                }}
                                disabled={passwordSaving}
                                style={{ width: 'fit-content', padding: '10px 24px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: passwordSaving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                {passwordSaving ? <Loader size={16} className="animate-spin" /> : <Shield size={16} />}
                                {passwordSaving ? 'A Atualizar...' : 'Atualizar Password'}
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
