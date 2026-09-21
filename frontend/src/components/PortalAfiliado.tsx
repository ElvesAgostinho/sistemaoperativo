import React, { useState, useEffect } from 'react';
import { DollarSign, Link as LinkIcon, Download, Users, TrendingUp, LogOut, Copy, CheckCircle } from 'lucide-react';

export default function PortalAfiliado() {
  const [afiliado, setAfiliado] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  
  const [stats, setStats] = useState<any>(null);
  const [recentes, setRecentes] = useState<any[]>([]);
  const [materiais, setMateriais] = useState<any[]>([]);
  
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('os_afiliado_user');
    if (saved) {
      setAfiliado(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    if (afiliado) {
      fetchData();
    }
  }, [afiliado]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('os_afiliado_token');
      const headers = { 'Authorization': `Bearer ${token}` };

      const statsRes = await fetch(`${import.meta.env.VITE_API_URL}/api/afiliados/${afiliado.id}/portal-stats`, { headers });
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
        setRecentes(data.recentes);
      } else if (statsRes.status === 401) {
        handleLogout();
        return;
      }

      const matRes = await fetch(`${import.meta.env.VITE_API_URL}/api/afiliados/portal/materiais`, { headers });
      if (matRes.ok) {
        const matData = await matRes.json();
        setMateriais(matData.materiais);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(import.meta.env.VITE_API_URL + '/api/afiliados/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha })
      });
      if (res.ok) {
        const data = await res.json();
        setAfiliado(data.afiliado);
        localStorage.setItem('os_afiliado_user', JSON.stringify(data.afiliado));
        localStorage.setItem('os_afiliado_token', data.token);
      } else {
        const data = await res.json();
        setError(data.error || 'Erro ao iniciar sessão.');
      }
    } catch (e) {
      setError('Erro de ligação ao servidor.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('os_afiliado_user');
    localStorage.removeItem('os_afiliado_token');
    setAfiliado(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!afiliado) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F6F7', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '2px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px' }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <div style={{ display: 'inline-flex', padding: '12px', backgroundColor: '#107E3E', borderRadius: '2px', marginBottom: '16px' }}>
              <TrendingUp color="white" size={32} />
            </div>
            <h2 style={{ margin: 0, color: '#1D2D3E', fontSize: '24px' }}>Portal do Afiliado</h2>
            <p style={{ margin: '8px 0 0 0', color: '#5B738B' }}>Aceda à sua área de parceiro</p>
          </div>
          
          {error && <div style={{ padding: '12px', backgroundColor: '#F6DEDE', color: '#BB0000', borderRadius: '2px', marginBottom: '20px', fontSize: '14px', textAlign: 'center' }}>{error}</div>}
          
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#5B738B', marginBottom: '8px' }}>Email</label>
              <input required type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '2px', border: '1px solid #D5D7DA', outline: 'none', transition: 'border 0.2s' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#5B738B', marginBottom: '8px' }}>Palavra-Passe</label>
              <input required type="password" value={senha} onChange={e => setSenha(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '2px', border: '1px solid #D5D7DA', outline: 'none' }} />
            </div>
            <button type="submit" style={{ width: '100%', padding: '14px', backgroundColor: '#107E3E', color: 'white', border: 'none', borderRadius: '2px', fontWeight: 600, fontSize: '16px', cursor: 'pointer', marginTop: '10px' }}>
              Entrar
            </button>
          </form>
        </div>
      </div>
    );
  }

  const linkWeb = `${window.location.origin}/?ref=${afiliado.codigo_referencia}`;
  const linkWa = `https://wa.me/244900000000?text=Olá, quero saber mais sobre o sistema. (Ref: ${afiliado.codigo_referencia})`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#F5F6F7', fontFamily: 'Inter, sans-serif' }}>
      {/* HEADER */}
      <header style={{ backgroundColor: 'white', borderBottom: '1px solid #D5D7DA', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ padding: '8px', backgroundColor: '#107E3E', borderRadius: '2px' }}><TrendingUp color="white" size={20} /></div>
          <h1 style={{ margin: 0, fontSize: '20px', color: '#1D2D3E' }}>Portal do Parceiro</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span style={{ fontWeight: 500, color: '#5B738B' }}>Olá, {afiliado.nome}</span>
          <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', backgroundColor: '#E7E9EB', color: '#5B738B', border: 'none', borderRadius: '2px', cursor: 'pointer', fontWeight: 500 }}>
            <LogOut size={16} /> Sair
          </button>
        </div>
      </header>

      <main style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        
        {/* STATS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '2px', border: '1px solid #D5D7DA', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ padding: '10px', backgroundColor: '#DCEEE2', borderRadius: '2px', color: '#107E3E' }}><DollarSign size={24} /></div>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#5B738B' }}>Ganhos Aprovados</h3>
            </div>
            <p style={{ fontSize: '32px', fontWeight: 'bold', margin: 0, color: '#1D2D3E' }}>
              {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(stats?.ganhos_aprovados || 0)}
            </p>
          </div>
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '2px', border: '1px solid #D5D7DA', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ padding: '10px', backgroundColor: '#FCEFDD', borderRadius: '2px', color: '#8A4B0B' }}><TrendingUp size={24} /></div>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#5B738B' }}>Ganhos Pendentes</h3>
            </div>
            <p style={{ fontSize: '32px', fontWeight: 'bold', margin: 0, color: '#1D2D3E' }}>
              {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(stats?.ganhos_pendentes || 0)}
            </p>
          </div>
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '2px', border: '1px solid #D5D7DA', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ padding: '10px', backgroundColor: '#E1EEF0', borderRadius: '2px', color: '#0E5A6B' }}><Users size={24} /></div>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#5B738B' }}>Leads Gerados (Negócios)</h3>
            </div>
            <p style={{ fontSize: '32px', fontWeight: 'bold', margin: 0, color: '#1D2D3E' }}>
              {stats?.leads_gerados || 0}
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          {/* LINKS DE RASTREIO */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '2px', border: '1px solid #D5D7DA' }}>
              <h2 style={{ fontSize: '18px', margin: '0 0 16px 0', color: '#1D2D3E', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LinkIcon size={20} /> Os Seus Links de Afiliado
              </h2>
              <p style={{ fontSize: '14px', color: '#5B738B', marginBottom: '24px' }}>
                Partilhe os links abaixo para garantir que as suas vendas são rastreadas de forma automática.
              </p>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#5B738B', marginBottom: '8px' }}>Link para Redes Sociais / Web</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input readOnly value={linkWeb} style={{ flex: 1, padding: '10px', borderRadius: '2px', border: '1px solid #D5D7DA', backgroundColor: '#F5F6F7', color: '#1D2D3E' }} />
                  <button onClick={() => copyToClipboard(linkWeb)} style={{ padding: '10px 16px', backgroundColor: '#0E5A6B', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {copied ? <CheckCircle size={16}/> : <Copy size={16}/>}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#5B738B', marginBottom: '8px' }}>Link para WhatsApp Direto</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input readOnly value={linkWa} style={{ flex: 1, padding: '10px', borderRadius: '2px', border: '1px solid #D5D7DA', backgroundColor: '#F5F6F7', color: '#1D2D3E' }} />
                  <button onClick={() => copyToClipboard(linkWa)} style={{ padding: '10px 16px', backgroundColor: '#25D366', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {copied ? <CheckCircle size={16}/> : <Copy size={16}/>}
                  </button>
                </div>
              </div>
            </div>

            {/* MATERIAIS DE MARKETING */}
            <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '2px', border: '1px solid #D5D7DA' }}>
              <h2 style={{ fontSize: '18px', margin: '0 0 16px 0', color: '#1D2D3E', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Download size={20} /> Materiais de Marketing
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {materiais.length === 0 ? (
                  <p style={{ color: '#5B738B', fontSize: '14px' }}>Nenhum material disponível de momento.</p>
                ) : (
                  materiais.map(m => (
                    <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: '#F5F6F7', borderRadius: '2px', border: '1px solid #D5D7DA' }}>
                      <div>
                        <h4 style={{ margin: '0 0 4px 0', color: '#1D2D3E', fontSize: '15px' }}>{m.titulo}</h4>
                        <p style={{ margin: 0, color: '#5B738B', fontSize: '13px' }}>{m.descricao}</p>
                      </div>
                      <a href={m.url} target="_blank" rel="noreferrer" style={{ padding: '8px 16px', backgroundColor: '#D5D7DA', color: '#1D2D3E', borderRadius: '2px', textDecoration: 'none', fontWeight: 500, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Download size={14} /> Download
                      </a>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* ULTIMAS COMISSOES */}
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '2px', border: '1px solid #D5D7DA' }}>
            <h2 style={{ fontSize: '18px', margin: '0 0 20px 0', color: '#1D2D3E' }}>Histórico Recente</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {recentes.length === 0 ? (
                <p style={{ color: '#5B738B', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>Ainda não gerou comissões. Partilhe o seu link!</p>
              ) : (
                recentes.map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid #E7E9EB' }}>
                    <div>
                      <div style={{ fontWeight: 500, color: '#1D2D3E', fontSize: '14px', marginBottom: '4px' }}>{c.negocio_titulo || 'Novo Lead/Venda'}</div>
                      <div style={{ fontSize: '12px', color: '#5B738B' }}>{new Date(c.criado_em).toLocaleDateString('pt-PT')}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, color: '#107E3E', fontSize: '15px', marginBottom: '4px' }}>
                        {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(c.valor_comissao)}
                      </div>
                      {c.estado === 'Pendente' && <span style={{ padding: '2px 8px', backgroundColor: '#FCEFDD', color: '#8A4B0B', borderRadius: '2px', fontSize: '11px', fontWeight: 600 }}>Pendente</span>}
                      {c.estado === 'Aprovada' && <span style={{ padding: '2px 8px', backgroundColor: '#E1EEF0', color: '#0E5A6B', borderRadius: '2px', fontSize: '11px', fontWeight: 600 }}>Aprovada</span>}
                      {(c.estado === 'Paga' || c.estado === 'Processada') && <span style={{ padding: '2px 8px', backgroundColor: '#DCEEE2', color: '#107E3E', borderRadius: '2px', fontSize: '11px', fontWeight: 600 }}>Paga</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
