import { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle, Zap, Mic, MicOff, Volume2, VolumeX, DollarSign } from 'lucide-react';
import BarraConversas from './chat/BarraConversas';

const authHeaders = () => {
  const token = localStorage.getItem('os_auth_token');
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
};

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
            headers: authHeaders(),
            body: JSON.stringify({ action_type: actionType, payload, conversaId })
        });
        const data = await response.json();

        // Sem verificar isto, uma ação que falhasse no servidor (criar
        // funcionário, registar pagamento, enviar mensagem, etc.) aparecia
        // sempre como "Ação executada com sucesso." — a pessoa confiava que
        // algo real e importante tinha acontecido quando podia não ter.
        if (!response.ok || !data.success) {
            setMessages(prev => {
                const newMessages = prev.filter(m => typeof m.content === 'string');
                return [...newMessages, { role: 'ai', content: data.response || 'Erro ao executar a ação.' }];
            });
            setAlerts(prev => [{ tipo: 'error', mensagem: 'Erro ao executar ação: ' + (data.error || 'erro desconhecido no servidor.') }, ...prev]);
            return;
        }

        // Remove o card antigo e adiciona a confirmação
        setMessages(prev => {
            const newMessages = prev.filter(m => typeof m.content === 'string'); // quick hack to remove the ReactNode (Card)
            return [...newMessages, { role: 'ai', content: data.response }];
        });

        setAlerts(prev => [{tipo: 'success', mensagem: 'Ação executada com sucesso.'}, ...prev]);

    } catch (error) {
        console.error(error);
        setAlerts(prev => [{ tipo: 'error', mensagem: 'Erro de rede ao executar a ação.' }, ...prev]);
    } finally {
        setLoading(false);
    }
  };

  const renderSupervisionCard = (uiData: any) => {
      if (uiData.component === 'EmployeeDraftCard') {
          return (
              <div style={{ background: '#fff', border: '1px solid var(--odoo-border)', borderRadius: '2px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8A4B0B', marginBottom: '12px', fontWeight: 'bold' }}>
                      <ShieldAlert size={18} />
                      Ação Requer Aprovação
                  </div>
                  <p style={{ fontSize: '13px', marginBottom: '12px' }}>Por favor, verifique os dados antes de inserir no sistema:</p>
                  <div style={{ background: '#F5F6F7', padding: '12px', borderRadius: '2px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div><strong>Nome:</strong> {uiData.data.nome}</div>
                      <div><strong>Cargo:</strong> {uiData.data.cargo}</div>
                      <div><strong>Departamento:</strong> {uiData.data.departamento || '-'}</div>
                      <div><strong>Salário Base:</strong> {uiData.data.salario_base} Kz</div>
                      <div><strong>BI:</strong> {uiData.data.bi || '-'}</div>
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <button 
                          onClick={() => handleExecuteAction('criar_funcionario_draft', uiData.data)}
                          style={{ background: 'var(--odoo-teal)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckCircle size={16} /> Confirmar e Guardar
                      </button>
                  </div>
              </div>
          );
      } else if (uiData.component === 'PaymentDraftCard') {
          return (
              <div style={{ background: '#fff', border: '1px solid #107E3E', borderRadius: '2px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#107E3E', marginBottom: '12px', fontWeight: 'bold' }}>
                      <DollarSign size={18} />
                      Registar Pagamento & Contabilidade
                  </div>
                  <p style={{ fontSize: '13px', marginBottom: '12px' }}>Por favor, confirme o recebimento do pagamento. Será gerado um <strong>recibo</strong> e um <strong>lançamento contabilístico duplo</strong> (Diário de Tesouraria).</p>
                  <div style={{ background: '#F5F6F7', padding: '12px', borderRadius: '2px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div><strong>Negócio ID:</strong> #{uiData.data.negocio_id}</div>
                      <div><strong>Valor a Registar:</strong> {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(uiData.data.valor)}</div>
                      <div><strong>Método:</strong> {uiData.data.metodo_pagamento || 'Transferência Bancária'}</div>
                      <div><strong>Data:</strong> {uiData.data.data_pagamento || new Date().toISOString().split('T')[0]}</div>
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <button 
                          onClick={() => handleExecuteAction('registar_pagamento_crm', uiData.data)}
                          style={{ background: '#107E3E', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckCircle size={16} /> Confirmar Recebimento
                      </button>
                  </div>
              </div>
          );
      } else if (uiData.component === 'MegaContractCard') {
          return (
              <div style={{ background: '#fff', border: '1px solid #5E4B8B', borderRadius: '2px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#5E4B8B', marginBottom: '12px', fontWeight: 'bold' }}>
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
                          style={{ background: '#5E4B8B', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                          <Zap size={16} /> Aprovar e Executar Mega Fluxo
                      </button>
                  </div>
              </div>
          );
      } else if (uiData.component === 'ExcelReportCard') {
          return (
              <div style={{ background: '#fff', border: '1px solid #107E3E', borderRadius: '2px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#107E3E', marginBottom: '12px', fontWeight: 'bold' }}>
                      <CheckCircle size={18} />
                      Gerar Relatório Excel
                  </div>
                  <p style={{ fontSize: '13px', marginBottom: '12px' }}>O Agente extraiu os dados solicitados. Deseja criar e abrir o ficheiro <strong>{uiData.data.nome_ficheiro}</strong> no Microsoft Excel?</p>
                  <div style={{ background: '#F5F6F7', padding: '12px', borderRadius: '2px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div><strong>Tipo de Relatório:</strong> {uiData.data.tipo_dados}</div>
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <button 
                          onClick={() => handleExecuteAction('gerar_relatorio_excel', uiData.data)}
                          style={{ background: '#107E3E', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                          <CheckCircle size={16} /> Gerar e Abrir Excel
                      </button>
                  </div>
              </div>
          );
      } else if (uiData.component === 'PowerBIReportCard') {
          return (
              <div style={{ background: '#fff', border: '1px solid #8A4B0B', borderRadius: '2px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8A4B0B', marginBottom: '12px', fontWeight: 'bold' }}>
                      <CheckCircle size={18} />
                      Gerar Relatório Power BI
                  </div>
                  <p style={{ fontSize: '13px', marginBottom: '12px' }}>O Agente extraiu os dados solicitados. Deseja criar o Dataset e abrir o ficheiro <strong>{uiData.data.nome_ficheiro}</strong> no Power BI Desktop?</p>
                  <div style={{ background: '#F5F6F7', padding: '12px', borderRadius: '2px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div><strong>Modelo de Dados:</strong> {uiData.data.tipo_dados}</div>
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <button 
                          onClick={() => handleExecuteAction('gerar_relatorio_powerbi', uiData.data)}
                          style={{ background: '#8A4B0B', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                          <CheckCircle size={16} /> Gerar e Abrir Power BI
                      </button>
                  </div>
              </div>
          );
      } else if (uiData.component === 'WordReportCard') {
          return (
              <div style={{ background: '#fff', border: '1px solid #0E5A6B', borderRadius: '2px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0E5A6B', marginBottom: '12px', fontWeight: 'bold' }}>
                      <CheckCircle size={18} />
                      Gerar Relatório Word
                  </div>
                  <p style={{ fontSize: '13px', marginBottom: '12px' }}>Deseja criar e abrir o ficheiro <strong>{uiData.data.nome_ficheiro}</strong> no Microsoft Word?</p>
                  <div style={{ background: '#F5F6F7', padding: '12px', borderRadius: '2px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div><strong>Título:</strong> {uiData.data.titulo}</div>
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <button 
                          onClick={() => handleExecuteAction('gerar_relatorio_word', uiData.data)}
                          style={{ background: '#0E5A6B', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                          <CheckCircle size={16} /> Gerar e Abrir Word
                      </button>
                  </div>
              </div>
          );
      } else if (uiData.component === 'PowerPointCard') {
          return (
              <div style={{ background: '#fff', border: '1px solid #8A4B0B', borderRadius: '2px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8A4B0B', marginBottom: '12px', fontWeight: 'bold' }}>
                      <CheckCircle size={18} />
                      Gerar Apresentação PowerPoint
                  </div>
                  <p style={{ fontSize: '13px', marginBottom: '12px' }}>Deseja criar e abrir o ficheiro <strong>{uiData.data.nome_ficheiro}</strong> no Microsoft PowerPoint?</p>
                  <div style={{ background: '#F5F6F7', padding: '12px', borderRadius: '2px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div><strong>Título:</strong> {uiData.data.titulo}</div>
                      <div><strong>Nº de Slides:</strong> {uiData.data.slides?.length || 0}</div>
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <button 
                          onClick={() => handleExecuteAction('gerar_relatorio_powerpoint', uiData.data)}
                          style={{ background: '#8A4B0B', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                          <CheckCircle size={16} /> Gerar e Abrir PowerPoint
                      </button>
                  </div>
              </div>
          );
      } else if (uiData.component === 'ImageGenerationCard') {
          return (
              <div style={{ background: '#fff', border: '1px solid #5E4B8B', borderRadius: '2px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#5E4B8B', marginBottom: '12px', fontWeight: 'bold' }}>
                      <CheckCircle size={18} />
                      Gerar Imagem (DALL-E)
                  </div>
                  <p style={{ fontSize: '13px', marginBottom: '12px' }}>Deseja utilizar os créditos OpenAI para gerar esta imagem?</p>
                  <div style={{ background: '#F5F6F7', padding: '12px', borderRadius: '2px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px', fontStyle: 'italic' }}>
                      "{uiData.data.prompt}"
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <button 
                          onClick={() => handleExecuteAction('gerar_imagem', uiData.data)}
                          style={{ background: '#5E4B8B', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                          <CheckCircle size={16} /> Gerar Imagem
                      </button>
                  </div>
              </div>
          );
      } else if (uiData.component === 'WhatsAppCard') {
          return (
              <div style={{ background: '#fff', border: '1px solid #25D366', borderRadius: '2px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#25D366', marginBottom: '12px', fontWeight: 'bold' }}>
                      <CheckCircle size={18} />
                      Aprovar Envio de WhatsApp
                  </div>
                  <p style={{ fontSize: '13px', marginBottom: '12px' }}>Confirma o envio da mensagem abaixo para o número <strong>{uiData.data.telefone}</strong>?</p>
                  <div style={{ background: '#E1EEF0', padding: '12px', borderRadius: '2px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {uiData.data.mensagem}
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                      <button 
                          onClick={() => handleExecuteAction('enviar_mensagem_whatsapp', uiData.data)}
                          style={{ background: '#25D366', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
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
        headers: authHeaders(),
        body: JSON.stringify({ prompt: userMessage, conversaId })
      });
      
      const data = await response.json();
      
      if (!data.success) {
         const detalhe = data.details ? ` (${data.details})` : '';
         setMessages(prev => [...prev, { role: 'ai', content: (data.error || 'Ocorreu um erro no processamento.') + detalhe }]);
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
          const res = await fetch(import.meta.env.VITE_API_URL + '/api/ai/conversas', { headers: authHeaders() });
          const data = await res.json();
          if (data.success) {
              setConversations(data.conversas || []);
          }
      } catch (err) {
          console.error('Erro ao buscar histórico:', err);
      }
  };

  const handleLoadConversation = async (id: number) => {
      setLoading(true);
      try {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/ai/conversas/${id}/mensagens`, { headers: authHeaders() });
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
    <div style={{ display: 'flex', height: '100%', background: '#F5F6F7' }}>
      
      {/* A coluna das conversas. Era uma pilha de caixas com borda, todas
          iguais, com os titulos a sair fora de uma coluna de 300px. */}
      <BarraConversas
        conversas={conversations}
        actual={conversaId}
        aoAbrir={handleLoadConversation}
        aoComecar={handleNewConversation}
        vozLigada={voiceEnabled}
        aoAlternarVoz={() => setVoiceEnabled(!voiceEnabled)}
      />

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' }}>
          {/* Uma coluna com largura de leitura, centrada. A conversa ocupava a
              largura toda do ecra e, num monitor grande, as linhas ficavam tao
              compridas que se perdia a linha a meio da frase. */}
          <div className="ia-area" style={{ flex: 1, overflowY: 'auto', padding: '28px 24px 8px' }}>
           <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
              }}>
                <div className={'ia-msg ia-msg-' + msg.role}
                     style={{ maxWidth: msg.role === 'user' ? '78%' : '100%' }}>
                  {typeof msg.content === 'string' ? (
                     msg.content.includes('![') ? (
                        msg.content.split('\n').map((line, i) => {
                           if (line.trim().startsWith('![')) {
                              const match = line.match(/\((.*?)\)/);
                              if (match && match[1]) {
                                 return <img key={i} src={match[1]} alt="Imagem Gerada" style={{ maxWidth: '100%', borderRadius: '2px', marginTop: '8px', border: '1px solid #e0e0e0' }} />;
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
                <div className="ia-pensar" aria-label="A pensar">
                  <span /><span /><span />
                </div>
              </div>
            )}
           </div>
          </div>

          {/* Input Area */}
          <div style={{ padding: '14px 24px 20px', background: '#fff' }}>
            <form onSubmit={handleSendMessage} className="ia-escrever-barra">
              <input 
                type="text" 
                placeholder="Ex: Contrata o candidato Pedro Silva para Comercial com salário de 250000 Kz"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                disabled={loading}
                style={{ 
                  flex: 1, 
                  border: '1px solid var(--odoo-border)', 
                  background: '#F5F6F7', 
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
                    background: isListening ? '#BB0000' : '#F5F6F7', 
                    border: '1px solid ' + (isListening ? '#BB0000' : 'var(--odoo-border)'), 
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
                background: inputMessage.trim() && !loading ? 'var(--odoo-teal)' : '#D5D7DA', 
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

      <style>{`
        /* ---------- A conversa com o assistente ----------
           O desenho segue o que se usa nestes assistentes, porque e o que as
           pessoas ja sabem ler: o que ELAS escrevem fica num balao a direita, o
           que o assistente responde fica como texto corrido, sem caixa. Meter o
           assistente tambem num balao faz a resposta parecer uma mensagem curta
           de telemovel quando, na verdade, e para ser lida com atencao. */

        .ia-msg {
          font-size: 15px;
          line-height: 1.65;
          color: #1D2D3E;
        }

        .ia-msg-user {
          padding: 11px 16px;
          border-radius: 18px;
          background: #E1EEF0;
          color: #0E3F4A;
        }

        .ia-msg-assistant {
          padding: 2px 0;
        }

        /* As mensagens do sistema sao avisos, nao conversa. */
        .ia-msg-system {
          padding: 0;
          font-size: 13px;
          color: #5B738B;
        }

        .ia-msg strong { font-weight: 700; }
        .ia-msg img { border-radius: 10px; }

        .ia-area::-webkit-scrollbar { width: 7px; }
        .ia-area::-webkit-scrollbar-thumb { background: #D4D4D4; border-radius: 4px; }
        .ia-area::-webkit-scrollbar-track { background: transparent; }

        /* ---------- "A pensar" ----------
           Dizia "A processar..." em italico. Tres pontos a pulsar dizem o mesmo
           sem ocupar uma linha de texto que depois e substituida pela resposta. */
        .ia-pensar { display: flex; gap: 5px; align-items: center; padding: 10px 2px; }
        .ia-pensar span {
          width: 7px; height: 7px; border-radius: 50%; background: #B9C3CB;
          animation: ia-pulsar 1.2s ease-in-out infinite;
        }
        .ia-pensar span:nth-child(2) { animation-delay: .18s; }
        .ia-pensar span:nth-child(3) { animation-delay: .36s; }
        @keyframes ia-pulsar {
          0%, 60%, 100% { opacity: .35; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }

        /* ---------- Escrever ---------- */
        .ia-escrever-barra {
          display: flex; gap: 8px; align-items: center;
          max-width: 760px; margin: 0 auto;
          background: #F5F6F7;
          border: 1px solid #E0E2E4;
          border-radius: 26px;
          padding: 5px 7px 5px 6px;
          transition: border-color .15s ease, background .15s ease;
        }
        .ia-escrever-barra:focus-within { border-color: #0E5A6B; background: #fff; }
        /* A caixa de texto ja esta dentro da barra: a borda e o fundo dela
           desenhavam uma segunda caixa dentro da primeira. */
        .ia-escrever-barra input[type="text"] {
          border: none !important;
          background: transparent !important;
          outline: none;
        }

        @media (prefers-reduced-motion: reduce) {
          .ia-pensar span { animation: none; opacity: .6; }
          .ia-escrever-barra { transition: none; }
        }
      `}</style>

    </div>
  );
}
