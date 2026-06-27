import { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle, Zap, Mic, MicOff, Volume2, VolumeX, DollarSign } from 'lucide-react';

export default function ChatApp() {
  const [messages, setMessages] = useState<{role: 'user'|'ai'|'system', content: string | React.ReactNode}[]>([
    { role: 'ai', content: 'Olá! Sou o seu Assistente Empresarial. Tenho acesso a toda a base de dados (colaboradores, recibos, crm, etc) e posso executar ações por si. Como posso ajudar hoje?' }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversaId, setConversaId] = useState<number | null>(null);
  
  // Dashboard state
  const [alerts, setAlerts] = useState<{tipo: string, mensagem: string}[]>([
      { tipo: 'ferias', mensagem: '2 pedidos de férias pendentes para aprovação.' },
      { tipo: 'salarios', mensagem: 'O custo salarial subiu 12% face ao mês anterior.' }
  ]);

  // Voice state
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Speech Recognition setup (Web Speech API)
  const initSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Reconhecimento de voz não é suportado neste navegador. Recomendamos o uso do Google Chrome.");
      return null;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-PT';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputMessage(transcript);
      // Auto submit after recognizing
      handleSendMessageWithText(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Erro no reconhecimento de voz:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    return recognition;
  };

  const toggleListen = () => {
    if (isListening) {
      setIsListening(false);
      // Not straightforward to stop easily without keeping the instance, but it stops on its own mostly
    } else {
      const recognition = initSpeechRecognition();
      if (recognition) {
        setIsListening(true);
        recognition.start();
      }
    }
  };

  const speakText = (text: string) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    
    // Remove markdown symbols for better reading
    const cleanText = text.replace(/\*\*/g, '').replace(/_/g, '').replace(/#/g, '');
    
    window.speechSynthesis.cancel(); // Stop any current speech
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'pt-PT';
    
    // Try to find a good Portuguese voice
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(v => v.lang.includes('pt-PT') || v.lang.includes('pt-BR'));
    if (ptVoice) {
      utterance.voice = ptVoice;
    }
    
    window.speechSynthesis.speak(utterance);
  };

  const handleExecuteAction = async (actionType: string, payload: any) => {
    setLoading(true);
    try {
        const response = await fetch(import.meta.env.VITE_API_URL + '/api/ai/execute-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action_type: actionType, payload, conversaId })
        });
        const data = await response.json();
        
        // Remove o card antigo e adiciona a confirmação
        setMessages(prev => {
            const newMessages = prev.filter(m => typeof m.content === 'string'); // quick hack to remove the ReactNode (Card)
            return [...newMessages, { role: 'ai', content: data.response }];
        });
        
        // Update alerts if needed (simulated fetch)
        setAlerts(prev => [{tipo: 'success', mensagem: 'Ação executada com sucesso.'}, ...prev]);
        
    } catch (error) {
        console.error(error);
    } finally {
        setLoading(false);
    }
  };

  const renderSupervisionCard = (uiData: any) => {
      if (uiData.component === 'EmployeeDraftCard') {
          return (
              <div style={{ background: '#fff', border: '1px solid var(--odoo-border)', borderRadius: '8px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e67e22', marginBottom: '12px', fontWeight: 'bold' }}>
                      <ShieldAlert size={18} />
                      Ação Requer Aprovação
                  </div>
                  <p style={{ fontSize: '13px', marginBottom: '12px' }}>Por favor, verifique os dados antes de inserir no sistema:</p>
                  <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '4px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div><strong>Nome:</strong> {uiData.data.nome}</div>
                      <div><strong>Cargo:</strong> {uiData.data.cargo}</div>
                      <div><strong>Departamento:</strong> {uiData.data.departamento || '-'}</div>
                      <div><strong>Salário Base:</strong> {uiData.data.salario_base} Kz</div>
                      <div><strong>BI:</strong> {uiData.data.bi || '-'}</div>
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <button 
                          onClick={() => handleExecuteAction('criar_funcionario_draft', uiData.data)}
                          style={{ background: 'var(--odoo-teal)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckCircle size={16} /> Confirmar e Guardar
                      </button>
                  </div>
              </div>
          );
      } else if (uiData.component === 'PaymentDraftCard') {
          return (
              <div style={{ background: '#fff', border: '1px solid #10b981', borderRadius: '8px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', marginBottom: '12px', fontWeight: 'bold' }}>
                      <DollarSign size={18} />
                      Registar Pagamento & Contabilidade
                  </div>
                  <p style={{ fontSize: '13px', marginBottom: '12px' }}>Por favor, confirme o recebimento do pagamento. Será gerado um <strong>recibo</strong> e um <strong>lançamento contabilístico duplo</strong> (Diário de Tesouraria).</p>
                  <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '4px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div><strong>Negócio ID:</strong> #{uiData.data.negocio_id}</div>
                      <div><strong>Valor a Registar:</strong> {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(uiData.data.valor)}</div>
                      <div><strong>Método:</strong> {uiData.data.metodo_pagamento || 'Transferência Bancária'}</div>
                      <div><strong>Data:</strong> {uiData.data.data_pagamento || new Date().toISOString().split('T')[0]}</div>
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <button 
                          onClick={() => handleExecuteAction('registar_pagamento_crm', uiData.data)}
                          style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckCircle size={16} /> Confirmar Recebimento
                      </button>
                  </div>
              </div>
          );
      } else if (uiData.component === 'MegaContractCard') {
          return (
              <div style={{ background: '#fff', border: '1px solid #8e44ad', borderRadius: '8px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8e44ad', marginBottom: '12px', fontWeight: 'bold' }}>
                      <Zap size={18} />
                      Mega Fluxo de Agente Operacional
                  </div>
                  <p style={{ fontSize: '13px', marginBottom: '12px' }}>A aprovar este fluxo, o Agente vai executar as seguintes ações locais e remotas:</p>
                  <ul style={{ fontSize: '13px', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px', color: '#333' }}>
                      <li>Registrar <strong>{uiData.data.nome}</strong> ({uiData.data.cargo}) na BD</li>
                      <li>Criar pasta de funcionário local no disco rígido</li>
                      <li>Gerar Contrato (Microsoft Word .docx)</li>
                      <li>Exportar Contrato (.pdf)</li>
                      <li>Enviar Email de Boas-Vindas</li>
                      <li>Agendar Onboarding no Calendário</li>
                  </ul>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <button 
                          onClick={() => handleExecuteAction('mega_fluxo_contratacao', uiData.data)}
                          style={{ background: '#8e44ad', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                          <Zap size={16} /> Aprovar e Executar Mega Fluxo
                      </button>
                  </div>
              </div>
          );
      } else if (uiData.component === 'ExcelReportCard') {
          return (
              <div style={{ background: '#fff', border: '1px solid #27ae60', borderRadius: '8px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#27ae60', marginBottom: '12px', fontWeight: 'bold' }}>
                      <CheckCircle size={18} />
                      Gerar Relatório Excel
                  </div>
                  <p style={{ fontSize: '13px', marginBottom: '12px' }}>O Agente extraiu os dados solicitados. Deseja criar e abrir o ficheiro <strong>{uiData.data.nome_ficheiro}</strong> no Microsoft Excel?</p>
                  <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '4px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div><strong>Tipo de Relatório:</strong> {uiData.data.tipo_dados}</div>
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <button 
                          onClick={() => handleExecuteAction('gerar_relatorio_excel', uiData.data)}
                          style={{ background: '#27ae60', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                          <CheckCircle size={16} /> Gerar e Abrir Excel
                      </button>
                  </div>
              </div>
          );
      } else if (uiData.component === 'PowerBIReportCard') {
          return (
              <div style={{ background: '#fff', border: '1px solid #f39c12', borderRadius: '8px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f39c12', marginBottom: '12px', fontWeight: 'bold' }}>
                      <CheckCircle size={18} />
                      Gerar Relatório Power BI
                  </div>
                  <p style={{ fontSize: '13px', marginBottom: '12px' }}>O Agente extraiu os dados solicitados. Deseja criar o Dataset e abrir o ficheiro <strong>{uiData.data.nome_ficheiro}</strong> no Power BI Desktop?</p>
                  <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '4px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div><strong>Modelo de Dados:</strong> {uiData.data.tipo_dados}</div>
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <button 
                          onClick={() => handleExecuteAction('gerar_relatorio_powerbi', uiData.data)}
                          style={{ background: '#f39c12', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                          <CheckCircle size={16} /> Gerar e Abrir Power BI
                      </button>
                  </div>
              </div>
          );
      } else if (uiData.component === 'WordReportCard') {
          return (
              <div style={{ background: '#fff', border: '1px solid #2980b9', borderRadius: '8px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2980b9', marginBottom: '12px', fontWeight: 'bold' }}>
                      <CheckCircle size={18} />
                      Gerar Relatório Word
                  </div>
                  <p style={{ fontSize: '13px', marginBottom: '12px' }}>Deseja criar e abrir o ficheiro <strong>{uiData.data.nome_ficheiro}</strong> no Microsoft Word?</p>
                  <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '4px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div><strong>Título:</strong> {uiData.data.titulo}</div>
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <button 
                          onClick={() => handleExecuteAction('gerar_relatorio_word', uiData.data)}
                          style={{ background: '#2980b9', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                          <CheckCircle size={16} /> Gerar e Abrir Word
                      </button>
                  </div>
              </div>
          );
      } else if (uiData.component === 'PowerPointCard') {
          return (
              <div style={{ background: '#fff', border: '1px solid #d35400', borderRadius: '8px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#d35400', marginBottom: '12px', fontWeight: 'bold' }}>
                      <CheckCircle size={18} />
                      Gerar Apresentação PowerPoint
                  </div>
                  <p style={{ fontSize: '13px', marginBottom: '12px' }}>Deseja criar e abrir o ficheiro <strong>{uiData.data.nome_ficheiro}</strong> no Microsoft PowerPoint?</p>
                  <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '4px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div><strong>Título:</strong> {uiData.data.titulo}</div>
                      <div><strong>Nº de Slides:</strong> {uiData.data.slides?.length || 0}</div>
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <button 
                          onClick={() => handleExecuteAction('gerar_relatorio_powerpoint', uiData.data)}
                          style={{ background: '#d35400', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                          <CheckCircle size={16} /> Gerar e Abrir PowerPoint
                      </button>
                  </div>
              </div>
          );
      } else if (uiData.component === 'ImageGenerationCard') {
          return (
              <div style={{ background: '#fff', border: '1px solid #8e44ad', borderRadius: '8px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8e44ad', marginBottom: '12px', fontWeight: 'bold' }}>
                      <CheckCircle size={18} />
                      Gerar Imagem (DALL-E)
                  </div>
                  <p style={{ fontSize: '13px', marginBottom: '12px' }}>Deseja utilizar os créditos OpenAI para gerar esta imagem?</p>
                  <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '4px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px', fontStyle: 'italic' }}>
                      "{uiData.data.prompt}"
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <button 
                          onClick={() => handleExecuteAction('gerar_imagem', uiData.data)}
                          style={{ background: '#8e44ad', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                          <CheckCircle size={16} /> Gerar Imagem
                      </button>
                  </div>
              </div>
          );
      } else if (uiData.component === 'WhatsAppCard') {
          return (
              <div style={{ background: '#fff', border: '1px solid #25D366', borderRadius: '8px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#25D366', marginBottom: '12px', fontWeight: 'bold' }}>
                      <CheckCircle size={18} />
                      Aprovar Envio de WhatsApp
                  </div>
                  <p style={{ fontSize: '13px', marginBottom: '12px' }}>Confirma o envio da mensagem abaixo para o número <strong>{uiData.data.telefone}</strong>?</p>
                  <div style={{ background: '#e1f5fe', padding: '12px', borderRadius: '4px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {uiData.data.mensagem}
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <button 
                          onClick={() => handleExecuteAction('enviar_mensagem_whatsapp', uiData.data)}
                          style={{ background: '#25D366', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                          <CheckCircle size={16} /> Enviar Mensagem
                      </button>
                  </div>
              </div>
          );
      }
      return <div>Ação desconhecida.</div>;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessageWithText(inputMessage);
  };

  const handleSendMessageWithText = async (text: string) => {
    if (!text.trim()) return;

    const userMessage = text;
    setInputMessage('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch(import.meta.env.VITE_API_URL + '/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMessage, conversaId })
      });
      
      const data = await response.json();
      
      if (!data.success) {
         setMessages(prev => [...prev, { role: 'ai', content: data.error || 'Ocorreu um erro no processamento.' }]);
         return;
      }
      
      setConversaId(data.conversaId);
      fetchConversations(); // Recarrega histórico
      
      setMessages(prev => [...prev, { role: 'ai', content: data.response }]);
      speakText(data.response);
      
      if (data.supervision_ui) {
         setMessages(prev => [...prev, { role: 'system', content: renderSupervisionCard(data.supervision_ui) }]);
      }
      
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', content: 'Erro de comunicação com o servidor.' }]);
    } finally {
      setLoading(false);
    }
  };

  const [conversations, setConversations] = useState<{id: number, titulo: string, data_criacao: string}[]>([]);

  useEffect(() => {
      fetchConversations();
  }, []);

  const fetchConversations = async () => {
      try {
          const res = await fetch(import.meta.env.VITE_API_URL + '/api/ai/conversas');
          const data = await res.json();
          if (data.success) {
              setConversations(data.conversas);
          }
      } catch (err) {
          console.error('Erro ao buscar histórico:', err);
      }
  };

  const handleLoadConversation = async (id: number) => {
      setLoading(true);
      try {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/ai/conversas/${id}/mensagens`);
          const data = await res.json();
          if (data.success && data.mensagens.length > 0) {
              setConversaId(id);
              setMessages([
                  { role: 'ai', content: 'Olá! Sou o seu Assistente Empresarial. Tenho acesso a toda a base de dados (colaboradores, recibos, crm, etc) e posso executar ações por si. Como posso ajudar hoje?' },
                  ...data.mensagens
              ]);
          }
      } catch (err) {
          console.error(err);
      } finally {
          setLoading(false);
      }
  };

  const handleNewConversation = () => {
      setConversaId(null);
      setMessages([
        { role: 'ai', content: 'Olá! Sou o seu Assistente Empresarial. Tenho acesso a toda a base de dados (colaboradores, recibos, crm, etc) e posso executar ações por si. Como posso ajudar hoje?' }
      ]);
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: '#f9fafb' }}>
      
      {/* Dashboard Lateral do Assistente */}
      <div style={{ width: '300px', borderRight: '1px solid var(--odoo-border)', background: '#fff', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--odoo-text-dark)' }}>
             <Zap size={24} color="var(--odoo-teal)" />
             <h3 style={{ margin: 0, fontSize: '16px' }}>Assistente Dashboard</h3>
         </div>
         <p style={{ fontSize: '13px', color: 'var(--odoo-text-muted)' }}>Métricas e alertas detetados no seu ERP.</p>
         
         <div style={{ display: 'flex', gap: '8px' }}>
           <button onClick={handleNewConversation} className="odoo-btn" style={{ flex: 1, background: 'var(--odoo-teal)', color: '#fff', border: 'none', padding: '10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>+ Nova Conversa</button>
           <button 
             onClick={() => setVoiceEnabled(!voiceEnabled)} 
             className="odoo-btn" 
             style={{ width: '40px', background: voiceEnabled ? '#10b981' : '#e2e8f0', color: voiceEnabled ? '#fff' : '#64748b', border: 'none', padding: '10px', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
             title={voiceEnabled ? 'Desativar Voz da IA' : 'Ativar Voz da IA'}
           >
             {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
           </button>
         </div>

         <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
             <h4 style={{ margin: '12px 0 4px', fontSize: '12px', textTransform: 'uppercase', color: 'var(--odoo-text-muted)', letterSpacing: '0.5px' }}>Histórico</h4>
             {conversations.map(conv => (
                 <div 
                    key={conv.id} 
                    onClick={() => handleLoadConversation(conv.id)}
                    style={{ 
                        padding: '10px', 
                        background: conversaId === conv.id ? '#f1f3f5' : '#fff', 
                        border: '1px solid var(--odoo-border)', 
                        borderRadius: '4px', 
                        fontSize: '13px', 
                        color: 'var(--odoo-text-dark)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}
                 >
                     {conv.titulo}
                 </div>
             ))}
         </div>
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{ 
                display: 'flex', 
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' 
              }}>
                <div style={{ 
                  maxWidth: '80%', 
                  padding: msg.role === 'system' ? '0' : '12px 16px', 
                  borderRadius: '8px',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  background: msg.role === 'user' ? 'var(--odoo-teal)' : (msg.role === 'system' ? 'transparent' : '#f1f3f5'),
                  color: msg.role === 'user' ? '#fff' : 'var(--odoo-text-dark)',
                  boxShadow: msg.role === 'user' ? '0 2px 4px rgba(1, 126, 132, 0.2)' : 'none',
                }}>
                  {typeof msg.content === 'string' ? (
                     msg.content.includes('![') ? (
                        msg.content.split('\n').map((line, i) => {
                           if (line.trim().startsWith('![')) {
                              const match = line.match(/\((.*?)\)/);
                              if (match && match[1]) {
                                 return <img key={i} src={match[1]} alt="Imagem Gerada" style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '8px', border: '1px solid #e0e0e0' }} />;
                              }
                           }
                           // Bold styling naive replacement
                           const parts = line.split(/(\*\*.*?\*\*)/g);
                           return <div key={i} style={{ minHeight: line ? 'auto' : '8px' }}>
                               {parts.map((part, j) => 
                                   part.startsWith('**') && part.endsWith('**') 
                                       ? <strong key={j}>{part.slice(2, -2)}</strong> 
                                       : part
                               )}
                           </div>;
                        })
                     ) : (
                        msg.content.split('\n').map((line, i) => {
                           const parts = line.split(/(\*\*.*?\*\*)/g);
                           return <div key={i} style={{ minHeight: line ? 'auto' : '8px' }}>
                               {parts.map((part, j) => 
                                   part.startsWith('**') && part.endsWith('**') 
                                       ? <strong key={j}>{part.slice(2, -2)}</strong> 
                                       : part
                               )}
                           </div>;
                        })
                     )
                  ) : (
                     msg.content
                  )}
                </div>
              </div>
            ))}
            
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ fontSize: '13px', color: 'var(--odoo-text-muted)', fontStyle: 'italic' }}>
                  A processar...
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--odoo-border)', background: '#fff' }}>
            <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input 
                type="text" 
                placeholder="Ex: Contrata o candidato Pedro Silva para Comercial com salário de 250000 Kz"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                disabled={loading}
                style={{ 
                  flex: 1, 
                  border: '1px solid var(--odoo-border)', 
                  background: '#f8f9fa', 
                  padding: '12px 16px', 
                  borderRadius: '24px',
                  fontSize: '14px',
                  outline: 'none',
                  color: 'var(--odoo-text-dark)',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--odoo-teal)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--odoo-border)'}
              />
                <button 
                  type="button" 
                  onClick={toggleListen}
                  style={{ 
                    background: isListening ? '#ef4444' : '#f8f9fa', 
                    border: '1px solid ' + (isListening ? '#ef4444' : 'var(--odoo-border)'), 
                    cursor: 'pointer', 
                    color: isListening ? '#fff' : 'var(--odoo-text-muted)',
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    boxShadow: isListening ? '0 0 0 4px rgba(239, 68, 68, 0.2)' : 'none'
                  }}
                  title={isListening ? 'A ouvir...' : 'Falar por Voz'}
                >
                  {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
              <button type="submit" disabled={!inputMessage.trim() || loading} style={{ 
                background: inputMessage.trim() && !loading ? 'var(--odoo-teal)' : '#e9ecef', 
                border: 'none', 
                cursor: inputMessage.trim() && !loading ? 'pointer' : 'default', 
                color: inputMessage.trim() && !loading ? '#fff' : '#adb5bd',
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              </button>
            </form>
          </div>
      </div>
    </div>
  );
}
