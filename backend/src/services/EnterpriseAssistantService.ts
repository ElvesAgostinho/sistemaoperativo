import OpenAI from 'openai';
import { supabase } from '../lib/supabaseClient'; // Service role client
import { aiTools, whatsappCustomerTools, pesquisarBaseConhecimentoTool, executeAITool, WhatsAppToolContext } from './AIToolsService';

const WHATSAPP_CUSTOMER_ROLE = 'cliente (WhatsApp)';

async function empresaTemAgendamentoLicenciado(empresaId?: number): Promise<boolean> {
    if (!empresaId) return false;
    try {
        const { data: row } = await supabase.from('configuracoes')
            .select('valor').eq('empresa_id', empresaId).eq('chave', 'modulos_empresa').maybeSingle();
        if (!row?.valor) return false;
        const modulos = JSON.parse(row.valor);
        return Array.isArray(modulos) && modulos.includes('agendamento');
    } catch {
        return false;
    }
}

export class EnterpriseAssistantService {
    static async chat(userId: string, userRole: string, prompt: string, conversaId?: number, empresaId?: number, whatsappContext?: WhatsAppToolContext) {
        let currentConversaId = conversaId;
        const isWhatsAppCustomer = userRole === WHATSAPP_CUSTOMER_ROLE;
        // O Agendamento é um módulo pago à parte — só disponibilizamos as
        // ferramentas de marcação ao Assistente IA do WhatsApp se a empresa
        // tiver mesmo esse módulo licenciado (evita dar de graça a quem não
        // contratou, mesmo que já tenha o WhatsApp ligado).
        const hasAgendamento = isWhatsAppCustomer && await empresaTemAgendamentoLicenciado(empresaId);
        const toolsForThisChat = isWhatsAppCustomer
            ? (hasAgendamento ? whatsappCustomerTools : [pesquisarBaseConhecimentoTool])
            : aiTools;

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
            empresa_id: empresaId || null,
            role: 'user',
            content: prompt
        });

        // 3. Buscar histórico
        let historyQuery = supabase.from('mensagens_ia')
            .select('role, content, name, tool_call_id, tool_calls')
            .eq('conversa_id', currentConversaId);
        
        if (empresaId) {
            historyQuery = historyQuery.eq('empresa_id', empresaId);
        }
        
        const { data: historyRows } = await historyQuery.order('id', { ascending: true });

        const whatsappSystemPrompt = `Tu és o assistente de atendimento ao cliente da empresa, a falar diretamente pelo WhatsApp com ${whatsappContext?.nomeContato || 'um cliente'}.

=== O QUE PODES FAZER ===
- Responder a perguntas sobre a empresa usando 'pesquisar_base_conhecimento' (horários, políticas, preços, etc.).
${hasAgendamento ? `- Marcar, consultar, remarcar e cancelar agendamentos diretamente na conversa, usando as ferramentas de agendamento.

=== COMO MARCAR UMA MARCAÇÃO ===
1. Se não souberes o serviço exato que o cliente quer, usa 'listar_servicos_agendamento' para veres as opções.
2. Usa SEMPRE 'verificar_disponibilidade_agendamento' antes de propor ou confirmar qualquer horário — nunca inventes horários.
3. Confirma com o cliente o serviço, dia, hora e o nome dele antes de chamar 'criar_agendamento_whatsapp'.
4. Para cancelar ou remarcar, usa primeiro 'listar_minhas_marcacoes_agendamento' para saberes o ID certo, e confirma com o cliente antes de agir.
5. NUNCA envies um link — todo o processo de marcação acontece aqui na conversa.` : ''}

=== REGRAS ===
- Não tens acesso a ficheiros, base de dados livre, CRM interno ou outras ferramentas administrativas — usa apenas as ferramentas disponíveis acima.
- Se a pergunta não estiver coberta pela Base de Conhecimento${hasAgendamento ? ' nem for sobre agendamento' : ''}, diz que vais encaminhar para um humano em vez de inventar.
- Responde sempre em Português de Angola, de forma simpática, curta e direta — isto é uma conversa de WhatsApp, não um relatório.`;

        const messages: any[] = [
            {
                role: 'system',
                content: isWhatsAppCustomer ? whatsappSystemPrompt : `Tu és o Assistente Operacional Empresarial da empresa (Nível 5 - BusinessOS).
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
                Sempre que a pergunta puder estar coberta por documentos internos da empresa (políticas, FAQs, horários, preços, procedimentos, regras), usa SEMPRE a ferramenta 'pesquisar_base_conhecimento' ANTES de responder, mesmo que já pareças saber a resposta — a base de conhecimento tem prioridade sobre o teu conhecimento geral. Se a busca não devolver nada relevante, diz isso ao utilizador em vez de inventar.
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

        // 4. Chamar a OpenAI diretamente (o OpenClaw/VPS deixou de estar disponível)
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        let result = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            tools: toolsForThisChat
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
                empresa_id: empresaId || null,
                role: 'ai',
                content: choice.message.content || '',
                tool_calls: JSON.stringify(choice.message.tool_calls)
            });

            let requiresSupervision = null;

            for (const toolCall of choice.message.tool_calls) {
                const tc = toolCall as any;
                const args = JSON.parse(tc.function.arguments);
                const toolResponse = await executeAITool(tc.function.name, args, empresaId, whatsappContext);
                
                // Grava a resposta da tool
                await supabase.from('mensagens_ia').insert({
                    conversa_id: currentConversaId,
                    empresa_id: empresaId || null,
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
            let updatedHistoryQuery = supabase.from('mensagens_ia')
                .select('role, content, name, tool_call_id, tool_calls')
                .eq('conversa_id', currentConversaId);
            
            if (empresaId) {
                updatedHistoryQuery = updatedHistoryQuery.eq('empresa_id', empresaId);
            }
            
            const { data: historyRowsUpdated } = await updatedHistoryQuery.order('id', { ascending: true });

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
                model: 'gpt-4o-mini',
                messages: updatedMessages,
                tools: toolsForThisChat
            });

            choice = result.choices[0];
        }

        // Fim do loop — guardar resposta final
        if (choice.message.content) {
            await supabase.from('mensagens_ia').insert({
                conversa_id: currentConversaId,
                empresa_id: empresaId || null,
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
