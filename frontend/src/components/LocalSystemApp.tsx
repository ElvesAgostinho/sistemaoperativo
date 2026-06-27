import { useEffect, useState } from 'react';

interface AppItem {
  id: string;
  name: string;
  icon: string;
}

interface DocItem {
  name: string;
  path: string;
  type: string;
}

export default function LocalSystemApp() {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [analyzingFile, setAnalyzingFile] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  // New states for Search Filter
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchData();
    
    // Auto-refresh a cada 3 segundos para mostrar documentos gerados pela IA em tempo real
    const interval = setInterval(() => {
      // Usamos uma versão silenciosa do fetch para não piscar o "loading" a toda a hora
      fetch('http://127.0.0.1:3001/api/system/documents')
        .then(res => res.json())
        .then(docsData => {
          if (docsData.documents) setDocs(docsData.documents);
        })
        .catch(() => {});
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [appsRes, docsRes] = await Promise.all([
        fetch('http://127.0.0.1:3001/api/system/apps'),
        fetch('http://127.0.0.1:3001/api/system/documents')
      ]);
      
      if (!appsRes.ok || !docsRes.ok) {
        throw new Error('Servidor local não respondeu corretamente.');
      }

      const appsData = await appsRes.json();
      const docsData = await docsRes.json();
      
      if (appsData.apps) setApps(appsData.apps);
      if (docsData.documents) setDocs(docsData.documents);
    } catch (err) {
      console.error('Failed to load local system data', err);
      setErrorMsg('Não foi possível ligar ao servidor local. Certifique-se de que o backend está a correr.');
    } finally {
      setLoading(false);
    }
  };

  const launchApp = async (appId: string) => {
    try {
      const response = await fetch('http://127.0.0.1:3001/api/system/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId })
      });
      if (!response.ok) {
        alert('Erro ao tentar abrir a aplicação. Verifique se está instalada.');
      }
    } catch (err) {
      console.error('Failed to launch app', err);
      alert('Erro de comunicação. O servidor local pode estar em baixo.');
    }
  };

  const [customApp, setCustomApp] = useState('');

  const launchCustomApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customApp.trim()) return;
    
    try {
      await fetch('http://127.0.0.1:3001/api/system/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customCommand: customApp })
      });
      setCustomApp('');
    } catch (err) {
      console.error('Failed to launch custom app', err);
    }
  };

  const openDocument = async (filePath: string) => {
    try {
      await fetch('http://127.0.0.1:3001/api/system/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customCommand: filePath })
      });
    } catch (err) {
      console.error('Failed to open document', err);
    }
  };

  const analyzeDocument = async (filename: string, filepath: string) => {
    setAnalyzingFile(filename);
    setAnalysisResult(null);
    try {
      const response = await fetch('http://127.0.0.1:3001/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: `Faz um resumo detalhado e extrai os pontos chave do ficheiro: ${filepath}` })
      });
      const data = await response.json();
      setAnalysisResult(data.response || 'A IA não devolveu resposta.');
    } catch (err) {
      console.error('Failed to analyze document', err);
      setAnalysisResult('Erro ao contactar o servidor IA. Verifica se o backend está a correr.');
    } finally {
      setAnalyzingFile(null);
    }
  };

  // Filtrar Documentos
  const filteredDocs = docs.filter(doc => doc.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Odoo Control Panel (Submenu) */}
      <div className="odoo-control-panel">
        <div className="odoo-breadcrumb">
          Meu Computador / <span style={{ fontWeight: 600, marginLeft: '8px' }}>Gestão de Ficheiros e Apps</span>
        </div>
        <div className="odoo-control-actions" style={{ display: 'flex', gap: '10px' }}>
          <input 
            type="text" 
            placeholder="Pesquisar..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="odoo-input"
            style={{ padding: '6px 12px', fontSize: '13px' }}
          />
          <button className="odoo-btn" onClick={fetchData}>Atualizar Sistema</button>
        </div>
      </div>

      <div className="odoo-content-area">
        <div className="odoo-form-sheet">
          
          {loading ? (
            <div style={{ padding: '30px' }}>A carregar ficheiros e apps locais...</div>
          ) : errorMsg ? (
            <div style={{ padding: '30px', color: 'var(--odoo-text-dark)' }}>
              <h2 style={{ color: 'var(--odoo-danger)', marginBottom: '10px' }}>Erro de Conexão</h2>
              <p style={{ marginBottom: '20px' }}>{errorMsg}</p>
              <button onClick={fetchData} className="odoo-btn odoo-btn-primary">Tentar Novamente</button>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: '28px', color: 'var(--odoo-text-dark)', margin: '0 0 24px 0', fontWeight: 500 }}>
                Sistema Operativo Local
              </h1>

              {/* Launcher Form */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ color: 'var(--odoo-teal)', fontSize: '16px', borderBottom: '1px solid var(--odoo-border)', paddingBottom: '8px', marginBottom: '16px' }}>Executar Aplicação Manualmente</h3>
                <form onSubmit={launchCustomApp} style={{ display: 'flex', gap: '10px' }}>
                  <div className="odoo-form-group" style={{ flex: 1, margin: 0 }}>
                    <input 
                      type="text" 
                      value={customApp}
                      onChange={(e) => setCustomApp(e.target.value)}
                      placeholder="Ex: chrome, calc, notepad"
                      className="odoo-input"
                    />
                  </div>
                  <button type="submit" className="odoo-btn odoo-btn-primary">Executar Comando</button>
                </form>
              </div>

              {/* Apps List */}
              <div style={{ marginBottom: '40px' }}>
                <h3 style={{ color: 'var(--odoo-teal)', fontSize: '16px', borderBottom: '1px solid var(--odoo-border)', paddingBottom: '8px', marginBottom: '16px' }}>Aplicações Detetadas</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '20px' }}>
                  {apps.map(app => (
                    <div 
                      key={app.id} 
                      onClick={() => launchApp(app.id)}
                      style={{ 
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        cursor: 'pointer',
                        padding: '16px',
                        border: '1px solid var(--odoo-border)',
                        borderRadius: '8px',
                        backgroundColor: '#fafafa',
                        transition: 'border-color 0.2s'
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--odoo-purple)' }}
                      onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--odoo-border)' }}
                    >
                      <div style={{ width: '48px', height: '48px', marginBottom: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        {app.icon.startsWith('/') ? (
                          <img src={app.icon} alt={app.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        ) : (
                          <span style={{ fontSize: '2.5rem' }}>{app.icon}</span>
                        )}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--odoo-text-dark)', fontWeight: 500 }}>{app.name}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Documents List */}
              <div>
                <h3 style={{ color: 'var(--odoo-teal)', fontSize: '16px', borderBottom: '1px solid var(--odoo-border)', paddingBottom: '8px', marginBottom: '16px' }}>Ficheiros Recentes (Todo o Computador)</h3>
                
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--odoo-border)', textAlign: 'left', color: 'var(--odoo-text-muted)' }}>
                      <th style={{ padding: '8px 4px', width: '40px' }}></th>
                      <th style={{ padding: '8px 4px' }}>Nome do Ficheiro</th>
                      <th style={{ padding: '8px 4px', textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocs.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ padding: '16px 4px', textAlign: 'center', color: 'var(--odoo-text-muted)' }}>Nenhum ficheiro detetado para a pesquisa atual.</td>
                      </tr>
                    ) : (
                      filteredDocs.map((doc, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--odoo-border)' }}>
                          <td style={{ padding: '12px 4px', fontSize: '18px' }}>
                            {doc.type === 'folder' ? '📁' : doc.type === '.pdf' ? '📕' : doc.type === '.xlsx' ? '📗' : doc.type === '.docx' ? '📘' : doc.type === '.pptx' ? '📙' : '📄'}
                          </td>
                          <td style={{ padding: '12px 4px', color: 'var(--odoo-text-dark)' }}>
                            <div style={{ fontWeight: 500 }}>{doc.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--odoo-text-muted)', marginTop: '4px', wordBreak: 'break-all' }}>{doc.path}</div>
                          </td>
                          <td style={{ padding: '12px 4px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button className="odoo-btn" onClick={() => openDocument(doc.path)} style={{ padding: '6px 12px', fontSize: '12px', backgroundColor: 'var(--odoo-teal)', color: 'white', marginRight: '8px', border: 'none', borderRadius: '4px' }}>Abrir</button>
                            <button className="odoo-btn" onClick={() => analyzeDocument(doc.name, doc.path)} disabled={analyzingFile === doc.name} style={{ padding: '6px 12px', fontSize: '12px', backgroundColor: '#f0f4f8', color: 'var(--odoo-text-dark)', border: '1px solid var(--odoo-border)', borderRadius: '4px', cursor: analyzingFile === doc.name ? 'wait' : 'pointer' }}>
                              {analyzingFile === doc.name ? 'A Analisar...' : 'Analisar'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Analysis Modal */}
              {analysisResult && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                  <div style={{ background: '#fff', borderRadius: '8px', width: '600px', maxWidth: '90%', maxHeight: '80%', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                    <div style={{ padding: '16px', borderBottom: '1px solid var(--odoo-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--odoo-teal)', color: 'white', borderRadius: '8px 8px 0 0' }}>
                      <h3 style={{ margin: 0, fontSize: '16px' }}>Resumo Inteligente (IA)</h3>
                      <button onClick={() => setAnalysisResult(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>✕</button>
                    </div>
                    <div style={{ padding: '24px', overflowY: 'auto', fontSize: '14px', lineHeight: '1.6', color: 'var(--odoo-text-dark)', whiteSpace: 'pre-wrap' }}>
                      {analysisResult}
                    </div>
                    <div style={{ padding: '16px', borderTop: '1px solid var(--odoo-border)', textAlign: 'right' }}>
                      <button onClick={() => setAnalysisResult(null)} style={{ padding: '8px 16px', backgroundColor: 'var(--odoo-teal)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Fechar</button>
                    </div>
                  </div>
                </div>
              )}

            </>
          )}
        </div>
      </div>
    </div>
  );
}
