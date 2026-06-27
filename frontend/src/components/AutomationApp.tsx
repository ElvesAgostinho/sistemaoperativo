import React, { useState, useEffect } from 'react';
import { Zap, Play, CheckCircle, Database, MessageCircle, GitCommit, Plus, ArrowRight, Bot, X, Loader2, GitBranch, FileText, Image, Send, Trash2 } from 'lucide-react';

interface Automation {
  id: number;
  nome: string;
  trigger_type: string;
  steps: any[];
  ativo: boolean;
}

export default function AutomationApp() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [selectedAuto, setSelectedAuto] = useState<Automation | null>(null);
  
  // Modal de Criação IA
  const [showModal, setShowModal] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const fetchAutomations = async () => {
    try {
      const res = await fetch(import.meta.env.VITE_API_URL + '/api/automation');
      const data = await res.json();
      if (data.success) {
        setAutomations(data.automations);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchAutomations();
  }, []);

  const renderIcon = (type: string) => {
    if (type.includes('WEBHOOK')) return <Zap size={24} color="#f59e0b" />;
    if (type.includes('CREATE')) return <Database size={24} color="#3b82f6" />;
    if (type.includes('LOG')) return <MessageCircle size={24} color="#64748b" />;
    if (type.includes('IF_CONDITION')) return <GitBranch size={24} color="#8b5cf6" />;
    if (type.includes('SEND_DOCUMENT')) return <FileText size={24} color="#ef4444" />;
    if (type.includes('SEND_IMAGE')) return <Image size={24} color="#10b981" />;
    if (type.includes('SEND_VIDEO')) return <Play size={24} color="#ef4444" />;
    if (type.includes('SEND_AUDIO')) return <MessageCircle size={24} color="#10b981" />;
    if (type.includes('SEND_EMAIL')) return <Send size={24} color="#3b82f6" />;
    if (type.includes('REPLY_MESSAGE')) return <Send size={24} color="#0ea5e9" />;
    if (type.includes('API_REQUIRED')) return <Zap size={24} color="#f43f5e" />;
    return <GitCommit size={24} color="#6366f1" />;
  };

  const seedExemplo = async () => {
    try {
      await fetch(import.meta.env.VITE_API_URL + '/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: 'WhatsApp para Funil de Vendas (CRM)',
          trigger_type: 'WEBHOOK_WHATSAPP',
          steps: [
            { type: 'CREATE_CLIENT', config: { nome: '{{nome_whatsapp}}', telefone: '{{telefone}}' } },
            { type: 'CREATE_LEAD', config: { titulo: '{{mensagem}}' } }
          ]
        })
      });
      fetchAutomations();
    } catch (err) {
      alert("Erro");
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    
    try {
      const res = await fetch(import.meta.env.VITE_API_URL + '/api/automation/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Erro na geração da automação');
      }

      const { nome, trigger_type, steps } = data.workflow;

      await fetch(import.meta.env.VITE_API_URL + '/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, trigger_type, steps })
      });
      
      await fetchAutomations();
      setShowModal(false);
      setPrompt('');
    } catch (err) {
      console.error('Erro ao gerar automação', err);
      alert('Erro ao conectar ao motor de automação.');
    } finally {
      setIsGenerating(false);
    }
  };

    const deleteAutomation = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation(); // Prevents selecting the automation when clicking delete
    if (!window.confirm("Tem a certeza que deseja eliminar esta automação de forma permanente?")) return;
    
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/automation/${id}`, { method: 'DELETE' });
      if (selectedAuto?.id === id) setSelectedAuto(null);
      fetchAutomations();
    } catch (err) {
      console.error(err);
      alert("Erro ao eliminar automação.");
    }
  };

  const toggleAutomation = async (e: React.MouseEvent, id: number, currentAtivo: boolean) => {
    e.stopPropagation();
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/automation/${id}/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: !currentAtivo })
      });
      fetchAutomations();
      if (selectedAuto?.id === id) {
        setSelectedAuto({ ...selectedAuto, ativo: !currentAtivo });
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao alternar automação.");
    }
  };

  const handleStepConfigChange = (stepIndex: number, field: string, value: string) => {
    if (!selectedAuto) return;
    const newSteps = [...selectedAuto.steps];
    newSteps[stepIndex] = {
      ...newSteps[stepIndex],
      config: { ...newSteps[stepIndex].config, [field]: value }
    };
    setSelectedAuto({ ...selectedAuto, steps: newSteps });
  };

  const [isUploading, setIsUploading] = useState(false);
  const handleFileUpload = async (stepIndex: number, file: File) => {
    if (!selectedAuto || !file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(import.meta.env.VITE_API_URL + '/api/automation/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        handleStepConfigChange(stepIndex, 'ficheiro', data.filePath);
      }
    } catch(err) {
      alert("Erro no upload do ficheiro");
    } finally {
      setIsUploading(false);
    }
  };

  const [isSaving, setIsSaving] = useState(false);
  const saveChanges = async () => {
    if (!selectedAuto) return;
    setIsSaving(true);
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/automation/${selectedAuto.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps: selectedAuto.steps })
      });
      fetchAutomations();
      alert("Alterações guardadas com sucesso!");
    } catch(err) {
      alert("Erro ao guardar as alterações.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', backgroundColor: '#f9fafb', position: 'relative' }}>
      
      {/* Sidebar - Lista de Automações */}
      <div style={{ width: '300px', backgroundColor: 'white', borderRight: '1px solid var(--odoo-border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--odoo-border)' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={20} color="#0078D4" /> Autopilot
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#666' }}>Motor Inteligente de Workflows</p>
        </div>
        
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
          {automations.map(auto => (
            <div 
              key={auto.id} 
              style={{ 
                padding: '12px', 
                backgroundColor: selectedAuto?.id === auto.id ? '#f0f9ff' : 'white', 
                border: selectedAuto?.id === auto.id ? '1px solid #0078D4' : '1px solid var(--odoo-border)', 
                borderRadius: '6px', 
                marginBottom: '8px', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.2s'
              }}
              onClick={() => setSelectedAuto(auto)}
            >
              <div 
                onClick={(e) => toggleAutomation(e, auto.id, auto.ativo)}
                style={{ 
                  backgroundColor: auto.ativo ? '#dcfce7' : '#f1f5f9', 
                  padding: '8px', 
                  borderRadius: '50%',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                  border: auto.ativo ? '1px solid #bbf7d0' : '1px solid #cbd5e1'
                }}
                title={auto.ativo ? "Desativar Automação" : "Ativar Automação"}
              >
                <Zap size={16} color={auto.ativo ? "#16a34a" : "#94a3b8"} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1a1a1a' }}>{auto.nome}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>{auto.steps.length} ações encadeadas</div>
              </div>
              <button 
                onClick={(e) => deleteAutomation(e, auto.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#ef4444', opacity: 0.7 }}
                onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                onMouseOut={(e) => e.currentTarget.style.opacity = '0.7'}
                title="Eliminar Automação"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}

          {automations.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: '#666', fontSize: '13px' }}>
              Nenhuma automação encontrada.<br/><br/>
              <button className="odoo-btn" onClick={seedExemplo}>Gerar Exemplo Mágico</button>
            </div>
          )}
        </div>
        <div style={{ padding: '16px', borderTop: '1px solid var(--odoo-border)' }}>
          <button 
            className="odoo-btn odoo-btn-primary" 
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => setShowModal(true)}
          >
            <Plus size={16} /> NOVA AUTOMAÇÃO
          </button>
        </div>
      </div>

      {/* Main Area - Visualizador da Arvore */}
      <div style={{ flex: 1, padding: '40px', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {selectedAuto ? (
          <div style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            
            {/* Titulo e Botão Guardar */}
            <div style={{ textAlign: 'center', marginBottom: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h2 style={{ fontSize: '24px', margin: '0 0 8px 0', color: '#1a1a1a' }}>{selectedAuto.nome}</h2>
              <span style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #bbf7d0', marginBottom: '16px' }}>
                STATUS: ATIVO
              </span>
              <button 
                onClick={saveChanges}
                disabled={isSaving}
                style={{ padding: '8px 24px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: isSaving ? 'wait' : 'pointer' }}
              >
                {isSaving ? 'A Guardar...' : 'Guardar Alterações'}
              </button>
            </div>

            {/* Trigger Block */}
            <div style={{ width: '100%', backgroundColor: 'white', border: '2px solid #f59e0b', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
              <div style={{ backgroundColor: '#fef3c7', padding: '12px', borderRadius: '8px' }}>
                <Zap size={24} color="#d97706" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#d97706', letterSpacing: '1px' }}>GATILHO (TRIGGER)</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1a1a1a' }}>{selectedAuto.trigger_type}</div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>Aguarda por um POST para <code style={{backgroundColor:'#f1f5f9', padding:'2px 4px', borderRadius:'4px'}}>/webhook/{selectedAuto.trigger_type.split('_')[1]?.toLowerCase()}</code></div>
              </div>
            </div>

            {/* Connector */}
            <div style={{ height: '40px', width: '2px', backgroundColor: '#cbd5e1' }}></div>
            <div style={{ backgroundColor: '#cbd5e1', color: 'white', borderRadius: '50%', padding: '4px', marginBottom: '-12px', zIndex: 1 }}>
              <ArrowRight size={16} style={{ transform: 'rotate(90deg)' }} />
            </div>

            {/* Steps (Ações) */}
            {selectedAuto.steps.map((step, index) => (
              <React.Fragment key={index}>
                {index > 0 && (
                  <>
                    <div style={{ height: '40px', width: '2px', backgroundColor: '#cbd5e1' }}></div>
                    <div style={{ backgroundColor: '#cbd5e1', color: 'white', borderRadius: '50%', padding: '4px', marginBottom: '-12px', zIndex: 1 }}>
                      <ArrowRight size={16} style={{ transform: 'rotate(90deg)' }} />
                    </div>
                  </>
                )}
                
                <div style={{ width: '100%', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ backgroundColor: '#f0f9ff', padding: '12px', borderRadius: '8px' }}>
                    {renderIcon(step.type)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: step.type === 'API_REQUIRED' ? '#f43f5e' : (step.type === 'JUMP_TO_WORKFLOW' ? '#8b5cf6' : '#0078D4'), letterSpacing: '1px' }}>
                      {step.type === 'API_REQUIRED' ? 'AÇÃO PENDENTE (CONFIGURAR API)' : `AÇÃO ${index + 1}`}
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1a1a1a' }}>{step.type}</div>
                    
                    {step.type === 'API_REQUIRED' ? (
                      <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#fff1f2', borderRadius: '4px', border: '1px solid #fecdd3' }}>
                        <div style={{ fontSize: '13px', color: '#be123c', marginBottom: '8px', fontWeight: 500 }}>
                          Este passo necessita de integração externa com: {step.config?.service || 'Serviço Externo'}
                        </div>
                        {Array.isArray(step.config?.fields) && step.config.fields.map((field: string) => (
                          <div key={field} style={{ marginBottom: '8px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#9f1239', marginBottom: '4px' }}>{field}</label>
                            <input 
                              type="text" 
                              value={step.config[field] || ''}
                              onChange={(e) => handleStepConfigChange(index, field, e.target.value)}
                              placeholder={`Insira o valor para ${field}`}
                              style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #fda4af', fontSize: '12px' }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : step.type === 'JUMP_TO_WORKFLOW' ? (
                      <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#f3e8ff', borderRadius: '4px', border: '1px solid #d8b4fe' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#6b21a8', marginBottom: '4px' }}>Workflow Alvo:</label>
                        <select 
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #c084fc', fontSize: '13px' }}
                          value={step.config?.target_workflow_nome || ''}
                          onChange={(e) => handleStepConfigChange(index, 'target_workflow_nome', e.target.value)}
                        >
                          <option value="">Selecione um workflow...</option>
                          {automations.filter(a => a.id !== selectedAuto.id).map(a => (
                            <option key={a.id} value={a.nome}>{a.nome}</option>
                          ))}
                        </select>
                      </div>
                    ) : ['SEND_IMAGE', 'SEND_VIDEO', 'SEND_AUDIO', 'SEND_DOCUMENT'].includes(step.type) ? (
                      <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '4px', border: '1px solid #86efac' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#166534', marginBottom: '8px' }}>Ficheiro Multimédia (Caminho ou Upload):</label>
                        <input 
                          type="text" 
                          value={step.config?.ficheiro || step.config?.imagem || step.config?.video || ''}
                          onChange={(e) => handleStepConfigChange(index, 'ficheiro', e.target.value)}
                          placeholder="C:\Caminho\para\ficheiro..."
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #bbf7d0', fontSize: '12px', marginBottom: '8px' }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <input type="file" onChange={(e) => e.target.files && handleFileUpload(index, e.target.files[0])} style={{ fontSize: '11px' }} />
                           {isUploading && <span style={{ fontSize: '11px', color: '#16a34a' }}>A enviar...</span>}
                        </div>
                      </div>
                    ) : step.type === 'SEND_EMAIL' ? (
                      <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#f0fdfa', borderRadius: '4px', border: '1px solid #5eead4', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#0f766e', marginBottom: '4px' }}>Destinatário (Para):</label>
                          <input 
                            type="text" 
                            value={step.config?.para || step.config?.to || ''}
                            onChange={(e) => handleStepConfigChange(index, 'para', e.target.value)}
                            placeholder="ex: {{email}} ou joao@empresa.com"
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #99f6e4', fontSize: '12px' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#0f766e', marginBottom: '4px' }}>Assunto:</label>
                          <input 
                            type="text" 
                            value={step.config?.assunto || step.config?.subject || ''}
                            onChange={(e) => handleStepConfigChange(index, 'assunto', e.target.value)}
                            placeholder="Assunto do Email"
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #99f6e4', fontSize: '12px' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#0f766e', marginBottom: '4px' }}>Corpo do Email (HTML/Texto):</label>
                          <textarea 
                            value={step.config?.corpo || step.config?.mensagem || step.config?.body || ''}
                            onChange={(e) => handleStepConfigChange(index, 'corpo', e.target.value)}
                            placeholder="Olá {{nome}}, seja bem-vindo..."
                            rows={4}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #99f6e4', fontSize: '12px', resize: 'vertical' }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f8fafc', borderRadius: '4px', fontSize: '12px', color: '#475569', border: '1px solid #e2e8f0' }}>
                        <pre style={{ margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                          {JSON.stringify(step.config, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            ))}

            {/* End Node */}
            <div style={{ height: '30px', width: '2px', backgroundColor: '#cbd5e1', marginTop: '10px' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '12px', fontWeight: 'bold' }}>
              <CheckCircle size={16} /> FIM DO FLUXO
            </div>

          </div>
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
            <Zap size={64} style={{ marginBottom: '16px', opacity: 0.5 }} />
            <h3 style={{ margin: 0, color: '#64748b' }}>Selecione um Workflow</h3>
            <p style={{ fontSize: '14px' }}>Veja a árvore de execução visual à direita.</p>
          </div>
        )}

      </div>

      {/* Modal Construtor IA */}
      {showModal && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'white', padding: '32px', borderRadius: '12px', width: '500px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bot color="#0078D4" /> Construtor IA de Workflows
              </h2>
              <X style={{ cursor: 'pointer', color: '#64748b' }} onClick={() => setShowModal(false)} />
            </div>
            
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px', lineHeight: '1.5' }}>
              Descreva o que quer que aconteça em linguagem natural. A Inteligência Artificial vai desenhar o gatilho e os passos exatos por si.
            </p>

            <textarea 
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Ex: Quando um cliente enviar 'preço' no WhatsApp, envia-lhe o PDF da tabela de preços e cria uma lead no CRM..."
              style={{ width: '100%', height: '120px', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', resize: 'none', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button 
                className="odoo-btn" 
                onClick={() => setShowModal(false)}
                disabled={isGenerating}
              >
                Cancelar
              </button>
              <button 
                className="odoo-btn odoo-btn-primary" 
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
              >
                {isGenerating ? <><Loader2 className="animate-spin" size={16} /> Construindo...</> : <><Zap size={16} /> Gerar Mágica</>}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
