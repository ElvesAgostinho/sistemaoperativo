import { generateCompletion } from './ollama';
import { createExcelFile } from '../utils/excelTool';
import { createPowerPointFile } from '../utils/powerPointTool';
import { createPowerBIDataset } from '../utils/powerBITool';
import { exec } from 'child_process';

const AGENT_SYSTEM_PROMPT = `
És um assistente empresarial autónomo (BusinessOS Agent).
O teu objetivo é analisar o pedido do utilizador e decidir se deves executar uma AÇÃO no computador local ou apenas RESPONDER em texto.

Ações suportadas (Deves responder EXCLUSIVAMENTE num bloco JSON com a ação correspondente):

1. Criar Excel / Tabela:
\`\`\`json
{ "action": "CREATE_EXCEL", "filename": "nome", "sheetName": "nome", "data": [["Col1", "Col2"], ["Dado1", "Dado2"]] }
\`\`\`

2. Criar Apresentação PowerPoint:
\`\`\`json
{ "action": "CREATE_POWERPOINT", "filename": "Apresentacao_Vendas", "slides": [ { "title": "Slide 1", "content": ["Ponto 1", "Ponto 2"] } ] }
\`\`\`

3. Criar Relatório Power BI (Gera Dataset):
\`\`\`json
{ "action": "CREATE_POWERBI", "filename": "Dados_Vendas", "headers": ["Mês", "Valor"], "rows": [["Jan", 100], ["Fev", 200]] }
\`\`\`

4. Enviar Email:
\`\`\`json
{ "action": "SEND_EMAIL", "to": "email@destino.com", "subject": "Assunto", "body": "Mensagem..." }
\`\`\`

5. Enviar Mensagem (WhatsApp):
\`\`\`json
{ "action": "SEND_MESSAGE", "phone": "123456789", "text": "Olá!" }
\`\`\`

Se NÃO precisares de executar uma ação, responde normalmente com texto útil.
Nunca mistures JSON de ação com conversa normal. Se fores fazer uma ação, devolve SÓ o bloco JSON.
`;

export const processAgentRequest = async (userPrompt: string): Promise<{ text?: string; actionResult?: string }> => {
  // 1. Ask Ollama what to do
  const response = await generateCompletion(userPrompt, AGENT_SYSTEM_PROMPT);
  
  // 2. Try to parse JSON from the response (in case it wrapped it in backticks or just returned JSON)
  try {
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```/g, '').trim();
    }

    // Attempt parse
    if (jsonStr.startsWith('{') && jsonStr.endsWith('}')) {
      const parsed = JSON.parse(jsonStr);
      
      switch(parsed.action) {
        case 'CREATE_EXCEL':
          const excelPath = await createExcelFile(
            parsed.filename || 'Tabela_Gerada.xlsx',
            parsed.sheetName || 'Dados',
            parsed.data || [['Sem Dados', 'Disponiveis']]
          );
          return { actionResult: `✅ Tabela criada com sucesso e guardada em: ${excelPath}. O Excel foi aberto automaticamente.` };

        case 'CREATE_POWERPOINT':
          const pptPath = await createPowerPointFile(
            parsed.filename || 'Apresentacao_Gerada.pptx',
            parsed.slides || [{ title: 'Título', content: ['Sem conteúdo'] }]
          );
          return { actionResult: `✅ Apresentação criada com sucesso em: ${pptPath}. O PowerPoint foi aberto.` };

        case 'CREATE_POWERBI':
          const pbPath = await createPowerBIDataset(
            parsed.filename || 'Dados_Gerados.csv',
            parsed.headers || ['Coluna 1'],
            parsed.rows || [['Sem Dados']]
          );
          return { actionResult: `✅ Dataset do Power BI gerado em: ${pbPath}. O Power BI foi iniciado. Importa o ficheiro para começar.` };

        case 'SEND_EMAIL':
          const mailToUrl = `mailto:${parsed.to}?subject=${encodeURIComponent(parsed.subject)}&body=${encodeURIComponent(parsed.body)}`;
          exec(`start "" "${mailToUrl}"`);
          return { actionResult: `✅ O cliente de Email foi aberto com a mensagem pronta para enviar ao destinatário.` };

        case 'SEND_MESSAGE':
          const whatsappUrl = `whatsapp://send?phone=${parsed.phone}&text=${encodeURIComponent(parsed.text)}`;
          exec(`start "" "${whatsappUrl}"`, (err) => {
            if (err) {
              // fallback to web
              exec(`start "" "https://web.whatsapp.com/send?phone=${parsed.phone}&text=${encodeURIComponent(parsed.text)}"`);
            }
          });
          return { actionResult: `✅ O WhatsApp foi aberto com a mensagem preenchida e pronta a enviar.` };
      }
    }
  } catch (e) {
    // Not valid JSON, which means the model just responded with normal text.
    // Fall back to normal text response.
  }

  // If no action was executed or parsing failed, treat it as normal text.
  return { text: response };
};
