import OpenAI from 'openai';
import { supabase } from '../lib/supabaseClient'; // Service role client
import { aiTools, executeAITool } from './AIToolsService';

export class EnterpriseAssistantService {
    static async chat(userId: string, userRole: string, prompt: string, conversaId?: number, empresaId?: number) {
        let currentConversaId = conversaId;

        // 1. Setup DB conversation if not exists
        if (!currentConversaId) {
            const { data, error } = await supabase.from('conversas_ia').insert({
                empresa_id: empresaId || null,
                utilizador_id: userId,
                titulo: prompt.substring(0, 30)
            }).select('id').single();
            if (error) throw error;
            currentConversaId = data.id;
        }

        // 2. Gravar mensagem do user
        await supabase.from('mensagens_ia').insert({
            conversa_id: currentConversaId,
            role: 'user',
            content: prompt
        });

        // 3. Buscar histórico
        const { data: historyRows } = await supabase.from('mensagens_ia')
            .select('role, content, name, tool_call_id, tool_calls')
            .eq('conversa_id', currentConversaId)
            .order('id', { ascending: true });

        const messages: any[] = [
            { 
                role: 'system', 
                content: `Tu és o Assistente Operacional Empresarial da empresa (Nível 5 - BusinessOS).
                O teu objetivo NÃO é apenas responder perguntas. O teu objetivo é EXECUTAR trabalho real dentro da empresa, de forma segura, profissional e eficiente.

                === MÓDULOS DISPONÍVEIS ===
                CRM, WhatsApp, Email, Gestão Documental, Sistema de Ficheiros, Microsoft Excel, Microsoft Word, Power BI, Calendário, Reuniões, RH & Recrutamento, Relatórios, Base de Conhecimento, Automações, Navegação Web.

                === PRINCÍPIOS ===
                - Age como um colaborador sénior da empresa.
                - Executa tarefas sempre que possível.
                - Faz perguntas apenas quando faltar informação essencial.
                - Mantém toda a informação organizada.
                - Cria estruturas de pastas quando necessário.
                - Guarda documentos nos locais adequados.
                - Registra todas as ações importantes no CRM.
                - Gera relatórios automaticamente.
                - Sugere melhorias de produtividade.
                - Nunca elimines ficheiros sem confirmação explícita.

                === GESTÃO DE FICHEIROS ===
                Podes: Criar pastas, criar subpastas, criar ficheiros, renomear ficheiros, organizar documentos, mover documentos, copiar documentos, arquivar documentos, procurar documentos.

                === MICROSOFT EXCEL E WORD E POWERBI ===
                Usa a ferramentas adequadas.

                === CRM ===
                Podes: Criar leads, atualizar leads, criar oportunidades, criar tarefas, registar chamadas, registar reuniões, registar emails.
                Usa as ferramentas 'criar_lead_crm' e 'registar_atividade_crm' para escrever no CRM.

                === WHATSAPP ===
                Podes: Enviar mensagens, responder clientes, criar follow-ups, registar conversas no CRM, criar oportunidades automaticamente.
                Usa a ferramenta 'enviar_mensagem_whatsapp'.

                === EMAIL ===
                Podes: Ler emails, responder emails, organizar emails, criar pastas, criar regras automáticas.
                Usa a ferramenta 'enviar_email'.

                === REUNIÕES & CALENDÁRIO ===
                Podes: Agendar reuniões, criar convites, gerar atas, resumir reuniões, extrair tarefas.
                Usa a ferramenta 'criar_evento_calendario' para agendar eventos.

                === ASSISTENTE DE PC ===
                Podes executar ações no computador: Abrir programas, etc.

                === AUTOPILOT ===
                Quando receberes tarefas complexas, divide em etapas e usa as ferramentas.

                === BASE DE DADOS ===
                Tens acesso via Supabase (se usares consultar_db para tabelas: colaboradores, departamentos, contratos, ausencias, recibos_vencimento, clientes, negocios, eventos_calendario, alertas_assistente, automations, planos_contas, diarios, lancamentos, linhas_lancamento, tesouraria_recibos_crm).
                
                O utilizador atual tem a permissão de: ${userRole}.

                === REGRA PRINCIPAL ===
                Sempre que o utilizador perguntar por dados, GERA LOGO UMA QUERY (consultar_db) para ver os dados reais antes de responder.
                Responde sempre em Português de Angola de forma direta, profissional e orientada à ação.` 
            }
        ];

        for (const row of (historyRows || [])) {
            let msgRole = row.role;
            if (msgRole === 'ai') msgRole = 'assistant';
            const msg: any = { role: msgRole, content: row.content };
            if (row.name) msg.name = row.name;
            if (row.tool_call_id) msg.tool_call_id = row.tool_call_id;
            if (row.tool_calls) {
                try {
                    msg.tool_calls = typeof row.tool_calls === 'string' ? JSON.parse(row.tool_calls) : row.tool_calls;
                } catch(e) {}
            }
            messages.push(msg);
        }

        // 4. Chamar OpenClaw (VPS)
        // Redirecionamos o SDK da OpenAI para o OpenClaw, usando o baseURL e apiKey da VPS
        const vpsUrl = process.env.OPENCLAW_VPS_URL || 'http://187.124.218.242';
        const ip = vpsUrl.replace(/^https?:\/\//, '').split(':')[0];
        
        const client = new OpenAI({ 
            baseURL: `http://${ip}:18789/v1`,
            apiKey: 'admin123'
        });

        let result = await client.chat.completions.create({
            model: 'openclaw/default',
            messages,
            tools: aiTools
        });

        let choice = result.choices[0];

        // === LOOP MULTI-TOOL (AUTOPILOT) — até 5 rondas de tool calling ===
        let toolRound = 0;
        const MAX_TOOL_ROUNDS = 5;

        while (choice.message.tool_calls && choice.message.tool_calls.length > 0 && toolRound < MAX_TOOL_ROUNDS) {
            toolRound++;

            // Guarda a intenção de usar tools
            await supabase.from('mensagens_ia').insert({
                conversa_id: currentConversaId,
                role: 'ai',
                content: choice.message.content || '',
                tool_calls: JSON.stringify(choice.message.tool_calls)
            });

            let requiresSupervision = null;

            for (const toolCall of choice.message.tool_calls) {
                const tc = toolCall as any;
                const args = JSON.parse(tc.function.arguments);
                const toolResponse = await executeAITool(tc.function.name, args, empresaId);
                
                // Grava a resposta da tool
                await supabase.from('mensagens_ia').insert({
                    conversa_id: currentConversaId,
                    role: 'tool',
                    content: toolResponse,
                    tool_call_id: tc.id,
                    name: tc.function.name
                });

                try {
                    const parsed = JSON.parse(toolResponse);
                    if (parsed.action_required === 'user_confirmation') {
                        requiresSupervision = parsed;
                    }
                } catch(e) {}
            }

            // Se a ação requer supervisão (ex: draft de funcionário), pára e devolve UI estruturada
            if (requiresSupervision) {
                return {
                    response: "Gerei o documento. Por favor verifique e confirme a ação.",
                    conversaId: currentConversaId,
                    supervision_ui: requiresSupervision
                };
            }

            // Recarregar histórico e chamar OpenAI de novo (pode querer usar mais tools)
            const { data: historyRowsUpdated } = await supabase.from('mensagens_ia')
                .select('role, content, name, tool_call_id, tool_calls')
                .eq('conversa_id', currentConversaId)
                .order('id', { ascending: true });

            const updatedMessages: any[] = messages.slice(0, 1); // system prompt
            for (const row of (historyRowsUpdated || [])) {
                let msgRole = row.role;
                if (msgRole === 'ai') msgRole = 'assistant';
                const msg: any = { role: msgRole, content: row.content };
                if (row.name) msg.name = row.name;
                if (row.tool_call_id) msg.tool_call_id = row.tool_call_id;
                if (row.tool_calls) {
                    try { msg.tool_calls = typeof row.tool_calls === 'string' ? JSON.parse(row.tool_calls) : row.tool_calls; } catch(e) {}
                }
                updatedMessages.push(msg);
            }

            result = await client.chat.completions.create({
                model: 'openclaw/default',
                messages: updatedMessages,
                tools: aiTools
            });

            choice = result.choices[0];
        }

        // Fim do loop — guardar resposta final
        if (choice.message.content) {
            await supabase.from('mensagens_ia').insert({
                conversa_id: currentConversaId,
                role: 'ai',
                content: choice.message.content || ''
            });
        }

        return {
            response: choice.message.content,
            conversaId: currentConversaId
        };
    }
}
