import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UploadCloud, FileText, BarChart3, TrendingUp, Users, DollarSign, Target, Sparkles, X, ChevronRight, PieChart as PieChartIcon, Loader2, RefreshCw, Download, Building2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import './DataApp.css';

const REFRESH_INTERVAL_MS = 30000;
const PALETTE = ['#017E84', '#44607A', '#B7791F', '#5C7A5C', '#8B9B97', '#B23A3A'];

const authFetch = (url: string, options: any = {}) => {
  const token = localStorage.getItem('os_auth_token');
  const headers = { ...options.headers, Authorization: `Bearer ${token}` };
  return fetch(url, { ...options, headers });
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(value || 0);
}

export default function DataApp() {
  const [stats, setStats] = useState<any>(null);
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const statsRes = await authFetch(import.meta.env.VITE_API_URL + '/api/data/stats');
      const statsData = await statsRes.json();
      if (statsData.success) setStats(statsData.stats);

      const insightsRes = await authFetch(import.meta.env.VITE_API_URL + '/api/data/insights');
      const insightsData = await insightsRes.json();
      if (insightsData.success) setInsights(insightsData.insights);

      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(() => fetchData(true), REFRESH_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await authFetch(import.meta.env.VITE_API_URL + '/api/data/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        setFile(null);
        fetchData();
        alert('Análise concluída com sucesso!');
      } else {
        alert(data.error || 'Erro ao analisar ficheiro.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao enviar ficheiro.');
    }
    setUploading(false);
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const res = await authFetch(import.meta.env.VITE_API_URL + '/api/data/report/pdf');
      const data = await res.json();
      if (data.success) {
        window.open(import.meta.env.VITE_API_URL + data.pdf_path, '_blank');
      } else {
        alert('Erro ao gerar PDF: ' + (data.details || data.error));
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar PDF do relatório.');
    }
    setDownloadingPdf(false);
  };

  if (loading) {
    return (
      <div className="reports-modern" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="animate-spin" size={32} color="#017E84" />
      </div>
    );
  }

  const kpis = stats ? [
    { icon: <TrendingUp size={17} />, label: 'Receita Ganha (CRM)', value: formatCurrency(stats.crm.won_value) },
    { icon: <Target size={17} />, label: 'Pipeline Ativo (CRM)', value: formatCurrency(stats.crm.active_value) },
    { icon: <Users size={17} />, label: 'Total de Clientes', value: String(stats.crm.total_clients) },
    { icon: <BarChart3 size={17} />, label: 'Leads em Aberto', value: String(stats.crm.active_leads) },
    { icon: <Building2 size={17} />, label: 'Colaboradores Ativos', value: String(stats.hr.active_employees) },
    { icon: <DollarSign size={17} />, label: 'Custo Salarial Mensal', value: formatCurrency(stats.hr.monthly_payroll) },
  ] : [];

  return (
    <div className="reports-modern">

      <div className="rp-header">
        <div>
          <h1>Relatórios</h1>
          <p>Visão consolidada de CRM e Recursos Humanos. Atualização automática a cada 30 segundos.</p>
        </div>
        <div className="rp-header-actions">
          <div className="rp-live">
            <span className="rp-live-dot" />
            {lastUpdated ? `Atualizado às ${lastUpdated.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'A atualizar...'}
          </div>
          <button className="rp-btn" onClick={() => fetchData()} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Atualizar
          </button>
          <button className="rp-btn rp-btn-primary" onClick={handleDownloadPdf} disabled={downloadingPdf}>
            <Download size={14} /> {downloadingPdf ? 'A gerar PDF...' : 'Baixar PDF'}
          </button>
        </div>
      </div>

      {stats && (
        <div className="rp-kpi-grid">
          {kpis.map((k, i) => (
            <div className="rp-kpi-card" key={i}>
              <div className="rp-kpi-icon">{k.icon}</div>
              <div className="rp-kpi-value">{k.value}</div>
              <div className="rp-kpi-label">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="rp-charts-row">
        <div className="rp-panel">
          <div className="rp-panel-title">
            <span className="rp-panel-icon"><BarChart3 size={15} /></span>
            Funil de Vendas (CRM)
          </div>
          <div style={{ height: '320px', width: '100%' }}>
            {stats && stats.crm.funnel.length > 0 ? (
              <ResponsiveContainer width="99%" height={320}>
                <BarChart data={stats.crm.funnel} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF2F1" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#5B6B67', fontSize: 12, fontFamily: 'IBM Plex Sans' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#5B6B67', fontSize: 12, fontFamily: 'IBM Plex Mono' }} dx={-6} />
                  <RechartsTooltip
                    cursor={{ fill: '#F5F8F7' }}
                    contentStyle={{ borderRadius: '10px', border: '1px solid #E2E8E6', boxShadow: '0 6px 20px rgba(22,33,31,0.1)', fontFamily: 'IBM Plex Sans', fontSize: '13px' }}
                  />
                  <Bar dataKey="value" name="Negócios" fill="#017E84" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="rp-empty-chart">Sem negócios registados ainda.</div>
            )}
          </div>
        </div>

        <div className="rp-panel">
          <div className="rp-panel-title">
            <span className="rp-panel-icon"><PieChartIcon size={15} /></span>
            Colaboradores por Departamento
          </div>
          <div style={{ height: '320px', width: '100%' }}>
            {stats && stats.hr.departments.length > 0 ? (
              <ResponsiveContainer width="99%" height={320}>
                <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 20 }}>
                  <Pie data={stats.hr.departments} innerRadius={62} outerRadius={92} paddingAngle={4} dataKey="value" stroke="none">
                    {stats.hr.departments.map((_entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '10px', border: '1px solid #E2E8E6', boxShadow: '0 6px 20px rgba(22,33,31,0.1)', fontFamily: 'IBM Plex Sans', fontSize: '13px' }} />
                  <Legend verticalAlign="bottom" height={32} iconType="circle" wrapperStyle={{ fontSize: '12px', fontFamily: 'IBM Plex Sans', color: '#5B6B67' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="rp-empty-chart">Sem colaboradores registados.</div>
            )}
          </div>
        </div>
      </div>

      <div className="rp-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
          <div className="rp-panel-title" style={{ marginBottom: 0 }}>
            <span className="rp-panel-icon"><Sparkles size={15} /></span>
            Análise de Ficheiros com IA
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="file" accept=".csv, .xlsx, .xls" id="data-upload" style={{ display: 'none' }} onChange={handleFileChange} />
            {file && (
              <div className="rp-upload-chip">
                <FileText size={14} color="#017E84" />
                <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                <button onClick={() => setFile(null)} title="Remover"><X size={14} /></button>
              </div>
            )}
            {file ? (
              <button className="rp-btn rp-btn-primary" onClick={handleUpload} disabled={uploading}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {uploading ? 'A analisar...' : 'Processar com IA'}
              </button>
            ) : (
              <label htmlFor="data-upload" className="rp-btn" style={{ cursor: 'pointer' }}>
                <UploadCloud size={14} /> Carregar Ficheiro
              </label>
            )}
          </div>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--rp-ink-muted)' }}>
          Importe relatórios financeiros, folhas de vendas ou exportações de CRM em Excel/CSV para a IA identificar tendências e sugerir ações.
        </p>

        {insights.length === 0 ? (
          <div className="rp-empty-state">
            <div className="rp-empty-state-icon"><FileText size={24} /></div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--rp-ink)', marginBottom: '6px' }}>Sem análises recentes</h3>
            <p style={{ margin: 0, fontSize: '13.5px', maxWidth: '380px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
              Carregue um ficheiro acima para começar.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {insights.map((item, i) => (
              <div className="rp-insight-card" key={i}>
                <div className="rp-insight-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FileText size={17} color="#017E84" />
                    <span style={{ fontWeight: 700, fontSize: '14.5px' }}>{item.filename}</span>
                  </div>
                  <div className="rp-insight-date">
                    {new Date(item.criado_em).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <div className="rp-insight-box" style={{ background: 'transparent', border: 'none', padding: 0 }}>
                    <div className="rp-insight-label">Resumo Executivo</div>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.7, color: 'var(--rp-ink)' }}>
                      {item.insights?.resumo || 'Sem resumo disponível.'}
                    </p>
                  </div>
                  <div className="rp-insight-box">
                    <div className="rp-insight-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={13} /> Principais Descobertas
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {item.insights?.insights?.map((insight: string, idx: number) => (
                        <li key={idx} style={{ fontSize: '13.5px', display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: 1.5 }}>
                          <ChevronRight size={14} color="#017E84" style={{ flexShrink: 0, marginTop: '2px' }} />
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {item.insights?.recomendacao && (
                  <div className="rp-insight-action">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px', fontWeight: 700, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <Target size={13} /> Ação Recomendada
                    </div>
                    {item.insights.recomendacao}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
