import axios from 'axios';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'gemma:2b';

export interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

export const generateCompletion = async (prompt: string, system?: string, model: string = DEFAULT_MODEL): Promise<string> => {
  try {
    const res = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model,
      prompt,
      system,
      stream: false
    });
    return res.data.response;
  } catch (error: any) {
    console.error('Error connecting to local Ollama instance:', error?.response?.data || error.message);
    
    // Fallback Mock for MVP demonstration if model is missing
    const p = prompt.toLowerCase();
    if (p.includes('excel') || p.includes('tabela')) {
      return `\`\`\`json\n{"action": "CREATE_EXCEL", "filename": "Relatorio_Mock.xlsx", "sheetName": "Dados", "data": [["Produto", "Qtd"], ["Computador", 5], ["Teclado", 15]]}\n\`\`\``;
    } else if (p.includes('powerpoint') || p.includes('apresentação')) {
      return `\`\`\`json\n{"action": "CREATE_POWERPOINT", "filename": "Pitch_Vendas.pptx", "slides": [{"title": "Inovação", "content": ["Crescimento", "Agilidade"]}]}\n\`\`\``;
    } else if (p.includes('power bi') || p.includes('relatório')) {
      return `\`\`\`json\n{"action": "CREATE_POWERBI", "filename": "Vendas_Mock.csv", "headers": ["Mês", "Vendas"], "rows": [["Jan", 5000], ["Fev", 7000]]}\n\`\`\``;
    } else if (p.includes('email') || p.includes('e-mail')) {
      return `\`\`\`json\n{"action": "SEND_EMAIL", "to": "cliente@teste.com", "subject": "Reunião de Alinhamento", "body": "Olá, podemos reunir amanhã?"}\n\`\`\``;
    } else if (p.includes('mensagem') || p.includes('whatsapp')) {
      return `\`\`\`json\n{"action": "SEND_MESSAGE", "phone": "123456789", "text": "Olá! Isto é um teste do BusinessOS."}\n\`\`\``;
    }

    return "Erro: O modelo de IA local não está instalado. Por favor, execute `ollama run gemma:2b` no terminal para ativar o cérebro do sistema.";
  }
};
