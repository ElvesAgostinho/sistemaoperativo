import { supabase } from '../lib/supabaseClient'; // Service role client
import { aiTools, whatsappCustomerTools, pesquisarBaseConhecimentoTool, executeAITool, WhatsAppToolContext } from './AIToolsService';
import { AIGatewayService } from './AIGatewayService';

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

        // Busca na Base de Conhecimento ANTES de falar com o modelo, em vez de
        // esperar que ele se lembre de chamar a ferramenta. O modelo só decidia
        // pesquisar quando "achava" que devia — e quando não pesquisava,
        // respondia de cabeça, que é exatamente o que não pode acontecer num
        // atendimento ao cliente.
        let contextoKB = '';
        if (isWhatsAppCustomer && empresaId) {
            try {
                const { KnowledgeBaseService } = require('./KnowledgeBaseService');
                // A pergunta atual junto com a anterior do cliente: sem isto, um
                // "e quanto custa?" sozinho não tem nada que se procure.
                const { data: ultimas } = await supabase.from('mensagens_ia')
                    .select('content, role').eq('conversa_id', currentConversaId).eq('role', 'user')
                    .order('id', { ascending: false }).limit(3);
                const anteriores = (ultimas || []).map((m: any) => m.content).filter((c: string) => c !== prompt).slice(0, 1);
                const consulta = [...anteriores.reverse(), prompt].join(' ');
                contextoKB = await KnowledgeBaseService.searchAsContext(String(empresaId), consulta, supabase);
            } catch (e: any) {
                console.error('[Assistente] Falha na busca à Base de Conhecimento:', e.message);
            }
        }

        const whatsappSystemPrompt = `Tu és quem atende os clientes desta empresa no WhatsApp. Estás a falar com ${whatsappContext?.nomeContato || 'um cliente'}.

=== A REGRA QUE MANDA EM TODAS AS OUTRAS ===
Só podes afirmar aquilo que estiver escrito nos EXCERTOS abaixo${hasAgendamento ? ' ou que venha das ferramentas de agendamento' : ''}.
O que sabes do mundo não conta aqui: preços, horários, moradas, prazos, condições, formas de pagamento — nada disso pode sair de ti, só do que está escrito.
Se a resposta não estiver nos excertos, não a inventes nem a adivinhes. Diz com naturalidade que vais confirmar com um colega e que respondes já de seguida.
Nunca digas ao cliente que consultaste "documentos", "base de conhecimento", "excertos" ou "sistema" — ele não quer saber de onde veio a informação.

=== O QUE A BASE DE CONHECIMENTO DIZ SOBRE ESTA PERGUNTA ===
${contextoKB || '(Nada. Não há informação sobre este assunto — não respondas de cabeça: diz que vais confirmar e encaminha para um humano.)'}

=== SE PRECISARES DE PROCURAR OUTRA COISA ===
Se, a meio da conversa, o cliente mudar de assunto e os excertos acima já não servirem, usa 'pesquisar_base_conhecimento' para procurares o novo tema antes de responderes.
${hasAgendamento ? `
=== AGENDAMENTOS ===
1. Se não souberes o serviço exato que o cliente quer, usa 'listar_servicos_agendamento' para veres as opções.
2. Usa SEMPRE 'verificar_disponibilidade_agendamento' antes de propor ou confirmar qualquer horário — nunca inventes horários.
3. Confirma com o cliente o serviço, dia, hora e o nome dele antes de chamar 'criar_agendamento_whatsapp'.
4. Para cancelar ou remarcar, usa primeiro 'listar_minhas_marcacoes_agendamento' para saberes o ID certo, e confirma com o cliente antes de agir.
5. NUNCA envies um link — todo o processo de marcação acontece aqui na conversa.` : ''}

=== COMO FALAS ===
- Português de Angola, como uma pessoa real a atender: simpático, curto, direto. Nada de linguagem de formulário.
- Uma ideia por mensagem. Isto é WhatsApp, não é um relatório.
- Se os excertos responderem só a parte da pergunta, responde a essa parte e diz que confirmas o resto.
- Não tens acesso a ficheiros, CRM nem ferramentas administrativas.`;

        const messages: any[] = [
            {
                role: 'system',
                content: isWhatsAppCustomer ? whatsappSystemPrompt : `Tu és o Assistente Operacional Empresarial da empresa (Nível 5 - BusinessOS).
                O teu objetivo NÃO é apenas responder perguntas. O teu objetivo é EXECUTAR trabalho real dentro da empresa, de forma segura, profissional e eficiente.

                === MÓDULOS DISPONÍVEIS ===
                CRM, WhatsApp, Email, Gestão Documental, Sistema de Ficheiros, Microsoft Excel, Microsoft Word, Power BI, Calendário, Reuniões, RH & Recrutamento, Financeiro & Contabilidade, Afiliados & Parcerias, Agendamento, Relatórios, Base de Conhecimento, Automações, Navegação Web.

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
                Podes: Agendar reuniões (usa 'agendar_reuniao', gera sala de videochamada e ata automática por IA), agendar eventos genéricos (usa 'criar_evento_calendario'), e consultar reuniões passadas/futuras com 'consultar_dados_empresa'.

                === RH ===
                Podes: Criar rascunhos de novos funcionários e de recibos de vencimento para o utilizador confirmar ('criar_funcionario_draft', 'gerar_recibo_draft'), e consultar colaboradores, departamentos, ausências e recibos já emitidos com 'consultar_dados_empresa'.

                === FINANCEIRO & CONTABILIDADE ===
                Podes: Consultar o plano de contas, diários e lançamentos contabilísticos com 'consultar_dados_empresa', e gerar um rascunho de registo de pagamento de um negócio do CRM com 'registar_pagamento_crm'.

                === AFILIADOS & PARCERIAS ===
                Podes: Criar um novo afiliado/parceiro com 'criar_afiliado' (gera código de referência automaticamente), e consultar a lista de afiliados existentes com 'consultar_dados_empresa'.

                === ASSISTENTE DE PC ===
                Podes executar ações no computador: Abrir programas, etc.

                === AUTOPILOT ===
                Quando receberes tarefas complexas, divide em etapas e usa as ferramentas.

                === DADOS REAIS DA EMPRESA ===
                Tens acesso de leitura a todos os módulos através da ferramenta 'consultar_dados_empresa' (RH, CRM, Reuniões, Calendário, Afiliados, Contabilidade, alertas). Nunca inventes números, nomes ou factos sobre a empresa.

                O utilizador atual tem a permissão de: ${userRole}.

                === REGRA PRINCIPAL ===
                Sempre que o utilizador perguntar por dados concretos (quantos, quais, lista de, saldo, estado de, etc), usa SEMPRE 'consultar_dados_empresa' primeiro para ver os dados reais antes de responder.
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

        // 4. Chamar a IA — OpenClaw primeiro (mais barato), OpenAI como reserva automática
        let result = await AIGatewayService.chamarComFallback({ messages, tools: toolsForThisChat });

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

            result = await AIGatewayService.chamarComFallback({ messages: updatedMessages, tools: toolsForThisChat });

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
