import React, { useState, useEffect } from 'react';
import { UploadCloud, FileText, BarChart3, TrendingUp, Users, DollarSign, Target, Sparkles, X, ChevronRight, Activity, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

export default function DataApp() {
  const [stats, setStats] = useState<any>(null);
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('os_auth_token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const statsRes = await fetch(import.meta.env.VITE_API_URL + '/api/data/stats', { headers });
      const statsData = await statsRes.json();
      if (statsData.success) {
        setStats(statsData.stats);
      }

      const insightsRes = await fetch(import.meta.env.VITE_API_URL + '/api/data/insights', { headers });
      const insightsData = await insightsRes.json();
      if (insightsData.success) {
        setInsights(insightsData.insights);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    const token = localStorage.getItem('os_auth_token');
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(import.meta.env.VITE_API_URL + '/api/data/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setFile(null);
        fetchData(); // Refresh insights
        alert('Análise concluída com sucesso!');
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao enviar ficheiro.');
    }
    setUploading(false);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'linear-gradient(135deg, #f6f8fa 0%, #e9ecef 100%)' }}>
        <Loader2 className="animate-spin" size={48} color="#4f46e5" />
      </div>
    );
  }

  const PIE_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6'];

  const cardStyle = (index: number) => ({
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    padding: '28px',
    borderRadius: '24px',
    border: '1px solid rgba(255, 255, 255, 0.5)',
    boxShadow: hoveredCard === index ? '0 20px 40px -10px rgba(0,0,0,0.1)' : '0 10px 30px -10px rgba(0,0,0,0.05)',
    transform: hoveredCard === index ? 'translateY(-5px)' : 'translateY(0)',
    transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    position: 'relative' as 'relative',
    overflow: 'hidden' as 'hidden',
  });

  const iconWrapperStyle = (gradient: string) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48px',
    height: '48px',
    borderRadius: '16px',
    background: gradient,
    boxShadow: '0 8px 16px -4px rgba(0,0,0,0.1)',
    marginBottom: '20px'
  });

  return (
    <div style={{ 
      padding: '40px', 
      background: 'linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%)', 
      height: '100%', 
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      color: '#1e293b',
      boxSizing: 'border-box',
      width: '100%',
      overflowY: 'auto'
    }}>
      
      {/* Gradients moved to inside BarChart to ensure compatibility */}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px' }}>
        <div>
          <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0', letterSpacing: '-1px' }}>
            Performance <span style={{ background: '-webkit-linear-gradient(45deg, #6366f1, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>do Negócio</span>
          </h1>
          <p style={{ color: '#64748b', margin: 0, fontSize: '16px', fontWeight: 400 }}>Visão detalhada e inteligente da sua operação comercial e humana.</p>
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '30px', marginBottom: '40px' }}>
          
          <div style={cardStyle(0)} onMouseEnter={() => setHoveredCard(0)} onMouseLeave={() => setHoveredCard(null)}>
            <div style={iconWrapperStyle('linear-gradient(135deg, #3b82f6 0%, #2dd4bf 100%)')}>
              <TrendingUp size={24} color="white" />
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '32px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>
              {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(stats.crm.won_value || 0)}
            </h3>
            <p style={{ margin: 0, fontSize: '14px', color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px' }}>Receita Ganha (CRM)</p>
          </div>

          <div style={cardStyle(1)} onMouseEnter={() => setHoveredCard(1)} onMouseLeave={() => setHoveredCard(null)}>
            <div style={iconWrapperStyle('linear-gradient(135deg, #10b981 0%, #34d399 100%)')}>
              <Target size={24} color="white" />
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '32px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>
              {stats.crm.active_leads}
            </h3>
            <p style={{ margin: 0, fontSize: '14px', color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px' }}>Leads em Aberto</p>
          </div>

          <div style={cardStyle(2)} onMouseEnter={() => setHoveredCard(2)} onMouseLeave={() => setHoveredCard(null)}>
            <div style={iconWrapperStyle('linear-gradient(135deg, #6366f1 0%, #a855f7 100%)')}>
              <Users size={24} color="white" />
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '32px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>
              {stats.hr.active_employees}
            </h3>
            <p style={{ margin: 0, fontSize: '14px', color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px' }}>Colaboradores Ativos</p>
          </div>

          <div style={cardStyle(3)} onMouseEnter={() => setHoveredCard(3)} onMouseLeave={() => setHoveredCard(null)}>
            <div style={iconWrapperStyle('linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)')}>
              <DollarSign size={24} color="white" />
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '32px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>
              {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(stats.hr.monthly_payroll || 0)}
            </h3>
            <p style={{ margin: 0, fontSize: '14px', color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px' }}>Custo Salarial Mensal</p>
          </div>

        </div>
      )}

      {/* Charts Section */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', marginBottom: '40px' }}>
        
        {/* Main Chart: CRM Funnel */}
        <div style={{ flex: '2 1 450px', minWidth: 0, backgroundColor: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(12px)', padding: '32px', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.5)', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.05)' }}>
          <h4 style={{ margin: '0 0 32px 0', fontSize: '18px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', background: '#eef2ff', borderRadius: '10px' }}>
              <BarChart3 size={20} color="#4f46e5" />
            </div>
            Funil de Vendas (CRM)
          </h4>
          <div style={{ height: '350px', width: '100%' }}>
            {stats && stats.crm.funnel.length > 0 ? (
              <ResponsiveContainer width="99%" height={350}>
                <BarChart data={stats.crm.funnel} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                  <defs>
                    <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.2}/>
                    </linearGradient>
                    <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.2}/>
                    </linearGradient>
                    <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ec4899" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#ec4899" stopOpacity={0.2}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 13, fontWeight: 500 }} dy={15} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 13, fontWeight: 500 }} dx={-10} />
                  <RechartsTooltip cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', padding: '16px' }} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={60}>
                    {stats.crm.funnel.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={`url(#color${['Uv', 'Pv', 'Amt'][index % 3]})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '15px', fontWeight: 500 }}>
                Sem dados de funil suficientes.
              </div>
            )}
          </div>
        </div>

        {/* Secondary Chart: HR Departments */}
        <div style={{ flex: '1 1 300px', minWidth: 0, backgroundColor: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(12px)', padding: '32px', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.5)', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.05)' }}>
          <h4 style={{ margin: '0 0 32px 0', fontSize: '18px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', background: '#ecfdf5', borderRadius: '10px' }}>
              <Activity size={20} color="#059669" />
            </div>
            Distribuição por Departamento
          </h4>
          <div style={{ height: '350px', width: '100%' }}>
            {stats && stats.hr.departments.length > 0 ? (
              <ResponsiveContainer width="99%" height={350}>
                <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 30 }}>
                  <Pie
                    data={stats.hr.departments}
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                    cornerRadius={8}
                  >
                    {stats.hr.departments.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', padding: '16px' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '13px', fontWeight: 500, color: '#475569' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
               <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '15px', fontWeight: 500 }}>
                Sem colaboradores registados.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* AI File Analysis Section */}
      <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(12px)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.5)', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <div style={{ padding: '32px', borderBottom: '1px solid rgba(226, 232, 240, 0.5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(248,250,252,0.5) 100%)' }}>
          <div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '22px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ padding: '10px', background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)', borderRadius: '12px', boxShadow: '0 4px 12px rgba(236, 72, 153, 0.3)' }}>
                <Sparkles size={24} color="white" />
              </div>
              Inteligência Artificial & Insights
            </h2>
            <p style={{ margin: 0, fontSize: '15px', color: '#64748b' }}>Importe ficheiros Excel/CSV para a nossa IA analisar tendências e sugerir melhorias.</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <input 
              type="file" 
              accept=".csv, .xlsx, .xls" 
              id="data-upload" 
              style={{ display: 'none' }} 
              onChange={handleFileChange}
            />
            {file && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', backgroundColor: 'white', borderRadius: '30px', fontSize: '14px', color: '#334155', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                <FileText size={16} color="#6366f1" />
                <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{file.name}</span>
                <div 
                  onClick={() => setFile(null)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#f1f5f9', cursor: 'pointer', transition: 'background 0.2s' }}
                >
                  <X size={14} color="#64748b" />
                </div>
              </div>
            )}
            <label 
              htmlFor={file ? '' : "data-upload"} 
              onClick={file ? handleUpload : undefined}
              style={{ 
                padding: '12px 24px', 
                background: file ? 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' : 'white', 
                color: file ? 'white' : '#475569', 
                border: file ? 'none' : '1px solid #cbd5e1', 
                borderRadius: '30px', 
                cursor: uploading ? 'wait' : 'pointer', 
                fontSize: '15px', 
                fontWeight: 600, 
                display: 'flex', 
                alignItems: 'center', 
                gap: '10px',
                boxShadow: file ? '0 10px 20px -5px rgba(99, 102, 241, 0.4)' : '0 2px 5px rgba(0,0,0,0.02)',
                transition: 'all 0.3s ease',
                transform: uploading ? 'scale(0.98)' : 'scale(1)'
              }}
            >
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} color={file ? 'white' : '#6366f1'} />}
              {uploading ? 'A Analisar Ficheiro...' : file ? 'Processar com IA' : 'Carregar Dados'}
            </label>
          </div>
        </div>

        <div style={{ padding: '32px' }}>
          {insights.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto' }}>
                <FileText size={32} color="#94a3b8" />
              </div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: '#334155' }}>Sem análises recentes</h3>
              <p style={{ margin: 0, fontSize: '15px', color: '#64748b', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto', lineHeight: '1.6' }}>
                Carregue relatórios financeiros, folhas de vendas ou logs de CRM para a IA sugerir otimizações de negócio.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {insights.map((item, i) => (
                <div key={i} style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9', transition: 'transform 0.2s', cursor: 'default' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ padding: '10px', backgroundColor: '#f5f3ff', borderRadius: '10px' }}>
                        <FileText size={20} color="#8b5cf6" />
                      </div>
                      <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '16px' }}>{item.filename}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#f8fafc', borderRadius: '20px', fontSize: '13px', fontWeight: 500, color: '#64748b' }}>
                      <Activity size={14} />
                      {new Date(item.criado_em).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 300px' }}>
                      <h5 style={{ margin: '0 0 12px 0', fontSize: '13px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '1px' }}>Resumo Executivo</h5>
                      <p style={{ margin: 0, fontSize: '15px', color: '#334155', lineHeight: '1.7' }}>
                        {item.insights?.resumo || 'Sem resumo disponível.'}
                      </p>
                    </div>
                    <div style={{ flex: '1 1 350px', backgroundColor: '#f8fafc', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                      <h5 style={{ margin: '0 0 16px 0', fontSize: '13px', textTransform: 'uppercase', color: '#0f172a', fontWeight: 700, letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={16} color="#059669" /> Principais Descobertas
                      </h5>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {item.insights?.insights?.map((insight: string, idx: number) => (
                          <li key={idx} style={{ fontSize: '14px', color: '#334155', display: 'flex', alignItems: 'flex-start', gap: '10px', lineHeight: '1.5', fontWeight: 500 }}>
                            <div style={{ padding: '2px', background: '#e0f2fe', borderRadius: '50%', marginTop: '2px' }}>
                              <ChevronRight size={14} color="#0284c7" />
                            </div>
                            <span>{insight}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {item.insights?.recomendacao && (
                    <div style={{ marginTop: '24px', padding: '20px', background: 'linear-gradient(to right, #f0fdf4, #ffffff)', borderLeft: '4px solid #10b981', borderRadius: '8px', boxShadow: '0 2px 10px rgba(16, 185, 129, 0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <Target size={16} color="#059669" />
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ação Recomendada</span>
                      </div>
                      <span style={{ fontSize: '15px', color: '#064e3b', lineHeight: '1.6', fontWeight: 500 }}>{item.insights.recomendacao}</span>
                    </div>
                  )}

                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
    </div>
  );
}
