import { supabase } from '../lib/supabaseClient';
import { LocalAgentSandbox } from './LocalAgentSandbox';
import { ReuniaoService } from './ReuniaoService';

const pesquisarBaseConhecimentoTool = {
    type: "function" as const,
    function: {
        name: "pesquisar_base_conhecimento",
        description: "Faz busca semântica (por significado, não só palavra exata) nos documentos da Base de Conhecimento da empresa (regras, FAQs, políticas). Use esta ferramenta SEMPRE que a pergunta do utilizador puder estar coberta por documentos internos da empresa, antes de responder.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "A pergunta ou tema a pesquisar, em linguagem natural (ex: 'qual o horário de atendimento', 'política de devolução')." }
            },
            required: ["query"]
        }
    }
};

// ============================================================
// Ferramentas de Agendamento — usadas pelo Assistente IA do WhatsApp
// para marcar/consultar/remarcar/cancelar diretamente na conversa,
// sem nunca precisar de enviar um link ao cliente.
// ============================================================
const agendamentoTools = [
    {
        type: "function" as const,
        function: {
            name: "listar_servicos_agendamento",
            description: "Lista os serviços que a empresa oferece para marcação (com duração e preço) e os profissionais disponíveis. Use isto quando o cliente perguntar o que a empresa oferece, ou antes de verificar disponibilidade se não souber o nome exato do serviço.",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "verificar_disponibilidade_agendamento",
            description: "Verifica os horários realmente disponíveis para marcar um serviço num dia específico. Use SEMPRE antes de criar uma marcação, para propor horários reais ao cliente.",
            parameters: {
                type: "object",
                properties: {
                    servico_nome: { type: "string", description: "Nome do serviço (ex: 'Corte de Cabelo'). Use exatamente um nome devolvido por listar_servicos_agendamento." },
                    data: { type: "string", description: "Data no formato YYYY-MM-DD." },
                    profissional_nome: { type: "string", description: "Opcional. Nome do profissional preferido." }
                },
                required: ["servico_nome", "data"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "criar_agendamento_whatsapp",
            description: "Cria a marcação para o cliente com quem está a conversar, num horário que já foi confirmado como disponível com verificar_disponibilidade_agendamento. NUNCA invente um horário — use sempre um que a ferramenta de disponibilidade tenha devolvido.",
            parameters: {
                type: "object",
                properties: {
                    servico_nome: { type: "string", description: "Nome do serviço, exatamente como devolvido por listar_servicos_agendamento." },
                    data: { type: "string", description: "Data no formato YYYY-MM-DD." },
                    hora_inicio: { type: "string", description: "Hora no formato HH:MM, um dos horários confirmados como disponíveis." },
                    profissional_nome: { type: "string", description: "Opcional. Nome do profissional escolhido." },
                    cliente_nome: { type: "string", description: "Nome do cliente para a marcação. Pergunte sempre se ainda não souber." }
                },
                required: ["servico_nome", "data", "hora_inicio", "cliente_nome"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "listar_minhas_marcacoes_agendamento",
            description: "Lista as marcações futuras (ainda não canceladas) do cliente com quem está a conversar. Use antes de remarcar ou cancelar, para saber o ID correto, ou quando o cliente perguntar 'quais são as minhas marcações'.",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "cancelar_agendamento_whatsapp",
            description: "Cancela uma marcação existente do cliente com quem está a conversar. Use listar_minhas_marcacoes_agendamento primeiro para confirmar qual marcação (ID) o cliente quer cancelar.",
            parameters: {
                type: "object",
                properties: {
                    agendamento_id: { type: "integer", description: "O ID da marcação a cancelar, obtido via listar_minhas_marcacoes_agendamento." }
                },
                required: ["agendamento_id"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "remarcar_agendamento_whatsapp",
            description: "Remarca (muda a data/hora de) uma marcação existente do cliente com quem está a conversar, para um novo horário já confirmado como disponível com verificar_disponibilidade_agendamento.",
            parameters: {
                type: "object",
                properties: {
                    agendamento_id: { type: "integer", description: "O ID da marcação a remarcar, obtido via listar_minhas_marcacoes_agendamento." },
                    nova_data: { type: "string", description: "Nova data no formato YYYY-MM-DD." },
                    nova_hora: { type: "string", description: "Nova hora no formato HH:MM, confirmada como disponível." }
                },
                required: ["agendamento_id", "nova_data", "nova_hora"]
            }
        }
    }
];

export const aiTools = [
    {
        type: "function" as const,
        function: {
            name: "consultar_db",
            description: "Executa uma query (SQL-like concept). Atualmente indisponível via AI diretamente. Deve usar módulos estruturados, ou avisar o user que não pode correr SQL arbitrário no Supabase via ChatGPT.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "A query SQL a executar."
                    }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "criar_funcionario_draft",
            description: "Cria um rascunho de um novo funcionário para o utilizador rever e confirmar no chat.",
            parameters: {
                type: "object",
                properties: {
                    nome: { type: "string" },
                    bi: { type: "string" },
                    nif: { type: "string" },
                    cargo: { type: "string" },
                    salario_base: { type: "number" },
                    departamento: { type: "string" }
                },
                required: ["nome", "cargo", "salario_base"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "gerar_recibo_draft",
            description: "Gera um rascunho de recibo salarial para aprovação do utilizador.",
            parameters: {
                type: "object",
                properties: {
                    colaborador_id: { type: "integer" },
                    mes: { type: "integer" },
                    ano: { type: "integer" }
                },
                required: ["colaborador_id", "mes", "ano"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "abrir_app",
            description: "Nível 5: Abre uma aplicação local no computador do utilizador (excel, word, powerbi, primavera).",
            parameters: {
                type: "object",
                properties: {
                    app_name: { type: "string", description: "Nome da aplicação: excel, word, powerbi, etc." }
                },
                required: ["app_name"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "registar_pagamento_crm",
            description: "Gera um rascunho de registo de pagamento de um negócio (CRM) para que o utilizador confirme.",
            parameters: {
                type: "object",
                properties: {
                    negocio_id: { type: "integer", description: "O ID do negócio." },
                    valor: { type: "number", description: "Valor do pagamento." },
                    metodo_pagamento: { type: "string", description: "Método (ex: Transferência Bancária, Numerário, Cheque)." },
                    data_pagamento: { type: "string", description: "Data do pagamento (YYYY-MM-DD)." }
                },
                required: ["negocio_id", "valor"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "gerar_relatorio_excel",
            description: "Gera um relatório de Excel com dados extraídos pelo Agente e abre-o no Microsoft Excel local.",
            parameters: {
                type: "object",
                properties: {
                    nome_ficheiro: { type: "string", description: "O nome do ficheiro, ex: relatorio_vendas.xlsx" },
                    tipo_dados: { type: "string", description: "O tipo de dados, ex: 'salarios', 'funcionarios', 'vendas'" }
                },
                required: ["nome_ficheiro", "tipo_dados"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "mega_fluxo_contratacao",
            description: "Nível 5: Inicia o Mega Fluxo (Cria Base de Dados, Ficheiros, Contrato Word/PDF e Envia Email).",
            parameters: {
                type: "object",
                properties: {
                    nome: { type: "string" },
                    cargo: { type: "string" },
                    salario_base: { type: "number" },
                    departamento: { type: "string" }
                },
                required: ["nome", "cargo", "salario_base"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "listar_ficheiros_pc",
            description: "Lista ficheiros existentes na pasta de documentos da empresa para dizer quantos documentos existem.",
            parameters: {
                type: "object",
                properties: {
                    pasta: { type: "string", description: "Opcional. Pasta a pesquisar." }
                }
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "gerar_relatorio_powerbi",
            description: "Gera um ficheiro de dados para o Power BI e solicita a abertura do mesmo.",
            parameters: {
                type: "object",
                properties: {
                    tipo_dados: { type: "string" },
                    nome_ficheiro: { type: "string" }
                },
                required: ["tipo_dados", "nome_ficheiro"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "ler_ficheiro_pc",
            description: "Lê o conteúdo de um ficheiro de texto ou PDF no PC do utilizador para análise ou resumo. Ficheiros suportados: .txt, .pdf, .md.",
            parameters: {
                type: "object",
                properties: {
                    caminho_ou_nome: { type: "string", description: "Nome do ficheiro ou caminho (ex: 'Fisioterapia.pdf')" }
                },
                required: ["caminho_ou_nome"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "enviar_email",
            description: "Envia um email personalizado para um destinatário usando a conta de email da empresa.",
            parameters: {
                type: "object",
                properties: {
                    para: { type: "string", description: "O endereço de email do destinatário." },
                    assunto: { type: "string", description: "O assunto do email." },
                    corpo: { type: "string", description: "O conteúdo HTML do email." }
                },
                required: ["para", "assunto", "corpo"]
            }
        }
    },
    pesquisarBaseConhecimentoTool,
    {
        type: "function" as const,
        function: {
            name: "gerar_relatorio_word",
            description: "Gera um relatório profissional em Microsoft Word (.docx).",
            parameters: {
                type: "object",
                properties: {
                    titulo: { type: "string", description: "O título do relatório." },
                    conteudo: { type: "string", description: "O conteúdo principal do relatório." },
                    nome_ficheiro: { type: "string", description: "O nome do ficheiro (ex: relatorio.docx)." }
                },
                required: ["titulo", "conteudo", "nome_ficheiro"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "gerar_relatorio_powerpoint",
            description: "Gera uma apresentação em Microsoft PowerPoint (.pptx).",
            parameters: {
                type: "object",
                properties: {
                    titulo: { type: "string", description: "O título da apresentação." },
                    slides: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                titulo: { type: "string" },
                                texto: { type: "string" },
                                prompt_imagem: { type: "string", description: "Opcional. Se o slide precisar de uma imagem ilustrativa, forneça uma descrição detalhada para o DALL-E gerar." }
                            },
                            required: ["titulo", "texto"]
                        }
                    },
                    nome_ficheiro: { type: "string", description: "O nome do ficheiro (ex: apresentacao.pptx)." }
                },
                required: ["titulo", "slides", "nome_ficheiro"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "gerar_imagem",
            description: "Gera uma imagem espetacular através de IA (DALL-E 3) com base numa descrição detalhada.",
            parameters: {
                type: "object",
                properties: {
                    prompt: { type: "string", description: "Descrição visual muito detalhada do que gerar." }
                },
                required: ["prompt"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "enviar_mensagem_whatsapp",
            description: "Prepara o envio de uma mensagem via WhatsApp para um cliente.",
            parameters: {
                type: "object",
                properties: {
                    telefone: { type: "string", description: "Número de telefone do destinatário." },
                    mensagem: { type: "string", description: "O conteúdo da mensagem a enviar." }
                },
                required: ["telefone", "mensagem"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "criar_pasta",
            description: "Cria uma pasta (ou estrutura de subpastas) no sistema de ficheiros da empresa.",
            parameters: {
                type: "object",
                properties: {
                    caminho: { type: "string", description: "Caminho relativo da pasta a criar dentro da pasta da empresa. Ex: 'Clientes/João Silva/Contratos'" }
                },
                required: ["caminho"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "criar_ficheiro",
            description: "Cria um ficheiro de texto (.txt, .md, .csv) no sistema de ficheiros da empresa com conteúdo especificado.",
            parameters: {
                type: "object",
                properties: {
                    caminho: { type: "string", description: "Caminho relativo do ficheiro. Ex: 'Clientes/João Silva/notas.txt'" },
                    conteudo: { type: "string", description: "O conteúdo do ficheiro a criar." }
                },
                required: ["caminho", "conteudo"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "criar_lead_crm",
            description: "Cria um novo lead/cliente no CRM do sistema, inserindo diretamente na tabela Clientes.",
            parameters: {
                type: "object",
                properties: {
                    nome: { type: "string", description: "Nome do cliente ou empresa." },
                    email: { type: "string", description: "Email do contacto." },
                    telefone: { type: "string", description: "Telefone do contacto." },
                    empresa: { type: "string", description: "Nome da empresa." }
                },
                required: ["nome"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "registar_atividade_crm",
            description: "Regista uma atividade no CRM: chamada, reunião, email, nota, tarefa associada a um cliente ou negócio.",
            parameters: {
                type: "object",
                properties: {
                    tipo: { type: "string", description: "Tipo de atividade: 'chamada', 'reuniao', 'email', 'nota', 'tarefa'." },
                    descricao: { type: "string", description: "Descrição da atividade." },
                    cliente_id: { type: "integer", description: "ID do cliente associado (opcional)." },
                    negocio_id: { type: "integer", description: "ID do negócio associado (opcional)." }
                },
                required: ["tipo", "descricao"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "criar_afiliado",
            description: "Cria um novo afiliado/parceiro no módulo de Afiliados. Gera um código de referência automaticamente se não for fornecido.",
            parameters: {
                type: "object",
                properties: {
                    nome: { type: "string", description: "Nome do afiliado." },
                    email: { type: "string", description: "Email do afiliado." },
                    percentagem_comissao: { type: "number", description: "Percentagem de comissão (ex: 10, 15)." }
                },
                required: ["nome", "email"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "agendar_reuniao",
            description: "Agenda uma reunião com link gerado automaticamente (Jitsi) no módulo de Reuniões da empresa.",
            parameters: {
                type: "object",
                properties: {
                    titulo: { type: "string", description: "Título da reunião." },
                    data_hora: { type: "string", description: "Data e hora do evento (formato: YYYY-MM-DD HH:MM)." },
                    emails_convidados: { type: "string", description: "Emails dos convidados separados por vírgula (opcional)." }
                },
                required: ["titulo", "data_hora"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "criar_evento_calendario",
            description: "Agenda um evento genérico (como lembretes, aniversários, feriados) no calendário do sistema.",
            parameters: {
                type: "object",
                properties: {
                    titulo: { type: "string", description: "Título do evento." },
                    data_evento: { type: "string", description: "Data e hora do evento (formato: YYYY-MM-DD HH:MM)." },
                    detalhes: { type: "string", description: "Detalhes ou descrição do evento." }
                },
                required: ["titulo", "data_evento"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "pesquisar_web",
            description: "Pesquisa informação na internet.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "O que pesquisar na web." }
                },
                required: ["query"]
            }
        }
    },
    ...agendamentoTools
];

// Subconjunto seguro de ferramentas exposto ao Assistente IA quando fala
// com um cliente externo pelo WhatsApp — nunca dá acesso a ficheiros,
// base de dados livre, CRM interno, etc.
export const whatsappCustomerTools = [pesquisarBaseConhecimentoTool, ...agendamentoTools];

export interface WhatsAppToolContext {
    telefone: string;
    nomeContato?: string;
}

export async function executeAITool(name: string, args: any, empresaId?: number, whatsappContext?: WhatsAppToolContext) {
    if (name === 'consultar_db') {
        return JSON.stringify({ error: "consultar_db não está ativo para query livre. O agente não deve executar SQL direto." });
    } else if (name === 'criar_funcionario_draft') {
        return JSON.stringify({
            status: "draft_created",
            action_required: "user_confirmation",
            component: "EmployeeDraftCard",
            data: args
        });
    } else if (name === 'gerar_recibo_draft') {
         return JSON.stringify({
            status: "draft_created",
            action_required: "user_confirmation",
            component: "PayslipDraftCard",
            data: args
        });
    } else if (name === 'abrir_app') {
        try {
            LocalAgentSandbox.abrirAplicacao(args.app_name).catch(e => console.error(e));
            return JSON.stringify({ status: "success", message: `A ordem para abrir ${args.app_name} foi enviada ao Sistema Operativo.` });
        } catch (e: any) {
            return JSON.stringify({ error: e.message });
        }
    } else if (name === 'registar_pagamento_crm') {
        return JSON.stringify({
            status: "draft_created",
            action_required: "user_confirmation",
            component: "PaymentDraftCard",
            data: args
        });
    } else if (name === 'mega_fluxo_contratacao') {
        return JSON.stringify({
            status: "draft_created",
            action_required: "user_confirmation",
            component: "MegaContractCard",
            data: args
        });
    } else if (name === 'gerar_relatorio_excel') {
        return JSON.stringify({
            status: "draft_created",
            action_required: "user_confirmation",
            component: "ExcelReportCard",
            data: args
        });
    } else if (name === 'gerar_relatorio_powerbi') {
        return JSON.stringify({
            status: "draft_created",
            action_required: "user_confirmation",
            component: "PowerBIReportCard",
            data: args
        });
    } else if (name === 'gerar_relatorio_word') {
        return JSON.stringify({
            status: "draft_created",
            action_required: "user_confirmation",
            component: "WordReportCard",
            data: args
        });
    } else if (name === 'gerar_relatorio_powerpoint') {
        return JSON.stringify({
            status: "draft_created",
            action_required: "user_confirmation",
            component: "PowerPointCard",
            data: args
        });
    } else if (name === 'gerar_imagem') {
        return JSON.stringify({
            status: "draft_created",
            action_required: "user_confirmation",
            component: "ImageGenerationCard",
            data: args
        });
    } else if (name === 'enviar_mensagem_whatsapp') {
        return JSON.stringify({
            status: "draft_created",
            action_required: "user_confirmation",
            component: "WhatsAppCard",
            data: args
        });
    } else if (name === 'listar_ficheiros_pc') {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        try {
            if (!empresaId) return JSON.stringify({ status: 'error', error: 'empresaId não fornecido.' });
            const baseDir = path.join(process.cwd(), 'Empresa_Arquivos', empresaId.toString());
            let count = 0;
            let files: string[] = [];
            
            if (fs.existsSync(baseDir)) {
                const dFiles = fs.readdirSync(baseDir).filter((f: string) => fs.statSync(path.join(baseDir, f)).isFile());
                count += dFiles.length;
                files.push(...dFiles.slice(0, 5));
            }
            
            return JSON.stringify({
                status: 'success',
                total_ficheiros: count,
                exemplos: files,
                mensagem: `Foram encontrados ${count} ficheiros na pasta de documentos da empresa.`
            });
        } catch (error: any) {
            return JSON.stringify({ status: 'error', error: error.message });
        }
    } else if (name === 'ler_ficheiro_pc') {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        
        try {
            const fileName = args.caminho_ou_nome;
            let targetPath = fileName;
            
            if (!empresaId) return JSON.stringify({ status: 'error', error: 'empresaId não fornecido.' });
            
            if (!path.isAbsolute(fileName)) {
                const customPath = path.join(process.cwd(), 'Empresa_Arquivos', empresaId.toString(), fileName);
                
                if (fs.existsSync(customPath)) targetPath = customPath;
                else return JSON.stringify({ status: 'error', error: `Ficheiro ${fileName} não encontrado.` });
            } else if (!fs.existsSync(targetPath)) {
                return JSON.stringify({ status: 'error', error: `Ficheiro não encontrado no caminho: ${targetPath}` });
            }

            const ext = path.extname(targetPath).toLowerCase();
            let content = '';

            if (ext === '.pdf') {
                const pdfParse = require('pdf-parse');
                const dataBuffer = fs.readFileSync(targetPath);
                const data = await pdfParse(dataBuffer);
                content = data.text;
            } else if (ext === '.xlsx') {
                const xlsx = require('xlsx');
                const workbook = xlsx.readFile(targetPath);
                content = '';
                workbook.SheetNames.forEach((sheetName: string) => {
                    const csv = xlsx.utils.sheet_to_csv(workbook.Sheets[sheetName]);
                    content += `\n--- Planilha: ${sheetName} ---\n${csv}`;
                });
            } else {
                content = fs.readFileSync(targetPath, 'utf8');
            }

            if (content.length > 30000) {
                content = content.substring(0, 30000) + '\n... [Conteúdo Truncado]';
            }

            return JSON.stringify({ status: 'success', filename: path.basename(targetPath), content: content });
        } catch (error: any) {
            return JSON.stringify({ status: 'error', error: error.message });
        }
    } else if (name === 'enviar_email') {
        const { EmailService } = require('./EmailService');
        try {
            const success = await EmailService.enviarEmailPersonalizado(args.para, args.assunto, args.corpo);
            if (success) {
                return JSON.stringify({ status: 'success', message: `Email enviado com sucesso para ${args.para}.` });
            } else {
                return JSON.stringify({ status: 'error', error: `Falha ao enviar email.` });
            }
        } catch (error: any) {
            return JSON.stringify({ status: 'error', error: error.message });
        }
    } else if (name === 'pesquisar_base_conhecimento') {
        try {
            if (!empresaId) return JSON.stringify({ status: 'error', error: 'empresaId não fornecido.' });
            const { KnowledgeBaseService } = require('./KnowledgeBaseService');
            const query = args.query || '';
            const contentResult = await KnowledgeBaseService.searchAsContext(String(empresaId), query, supabase, 5);

            if (!contentResult) return JSON.stringify({ status: 'success', message: 'Nenhuma informação relevante encontrada na Base de Conhecimento.' });
            return JSON.stringify({ status: 'success', data: contentResult });
        } catch (error: any) {
            return JSON.stringify({ status: 'error', error: error.message });
        }
    } else if (name === 'criar_pasta') {
        const path = require('path');
        const fs = require('fs');
        try {
            if (!empresaId) return JSON.stringify({ status: 'error', error: 'empresaId não fornecido.' });
            const BASE_DIR = path.join(process.cwd(), 'Empresa_Arquivos', empresaId.toString());
            const targetPath = path.resolve(BASE_DIR, args.caminho);
            if (!targetPath.startsWith(BASE_DIR)) {
                return JSON.stringify({ status: 'error', error: 'Tentativa de acesso fora da pasta permitida.' });
            }
            if (!fs.existsSync(targetPath)) {
                fs.mkdirSync(targetPath, { recursive: true });
                return JSON.stringify({ status: 'success', message: `Pasta criada com sucesso: ${args.caminho}` });
            }
            return JSON.stringify({ status: 'success', message: `A pasta já existe: ${args.caminho}` });
        } catch (error: any) {
            return JSON.stringify({ status: 'error', error: error.message });
        }
    } else if (name === 'criar_ficheiro') {
        const path = require('path');
        const fs = require('fs');
        try {
            if (!empresaId) return JSON.stringify({ status: 'error', error: 'empresaId não fornecido.' });
            const BASE_DIR = path.join(process.cwd(), 'Empresa_Arquivos', empresaId.toString());
            const targetPath = path.resolve(BASE_DIR, args.caminho);
            if (!targetPath.startsWith(BASE_DIR)) {
                return JSON.stringify({ status: 'error', error: 'Tentativa de acesso fora da pasta permitida.' });
            }
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(targetPath, args.conteudo, 'utf8');
            return JSON.stringify({ status: 'success', message: `Ficheiro criado com sucesso: ${args.caminho}` });
        } catch (error: any) {
            return JSON.stringify({ status: 'error', error: error.message });
        }
    } else if (name === 'criar_lead_crm') {
        const path = require('path');
        const fs = require('fs');
        try {
            const { data: cliente, error: cliError } = await supabase.from('clientes').insert({
                empresa_id: empresaId,
                nome: args.nome,
                email: args.email || null,
                telefone: args.telefone || null,
                empresa: args.empresa || null
            }).select('id').single();
            if (cliError) throw cliError;

            const { data: negocio, error: negError } = await supabase.from('negocios').insert({
                empresa_id: empresaId,
                cliente_id: cliente.id,
                titulo: `Oportunidade - ${args.nome}`,
                valor_estimado: 0,
                fase: 'Nova Lead'
            }).select('id').single();
            if (negError) throw negError;

            if (!empresaId) throw new Error('empresaId não fornecido.');
            const BASE_DIR = path.join(process.cwd(), 'Empresa_Arquivos', empresaId.toString());
            const targetPath = path.join(BASE_DIR, 'Clientes', args.nome.replace(/[^a-z0-9]/gi, '_'));
            if (!fs.existsSync(targetPath)) {
                fs.mkdirSync(targetPath, { recursive: true });
            }

            return JSON.stringify({ 
                status: 'success', 
                message: `Lead "${args.nome}" criada com sucesso! Cliente ID: ${cliente.id}, Negócio ID: ${negocio.id}. Pasta criada em Empresa_Arquivos/${empresaId}/Clientes.`, 
                cliente_id: cliente.id,
                negocio_id: negocio.id
            });
        } catch (error: any) {
            return JSON.stringify({ status: 'error', error: error.message });
        }
    } else if (name === 'registar_atividade_crm') {
        try {
            const detalhes = JSON.stringify({
                tipo: args.tipo,
                descricao: args.descricao,
                cliente_id: args.cliente_id || null,
                negocio_id: args.negocio_id || null,
                data: new Date().toISOString()
            });
            await supabase.from('auditoria_logs').insert({
                empresa_id: empresaId,
                tabela_afetada: 'CRM_Atividades',
                acao: args.tipo.toUpperCase(),
                utilizador: 'Agente IA',
                detalhes: detalhes
            });
            return JSON.stringify({ status: 'success', message: `Atividade CRM "${args.tipo}" registada: ${args.descricao}` });
        } catch (error: any) {
            return JSON.stringify({ status: 'error', error: error.message });
        }
    } else if (name === 'criar_afiliado') {
        try {
            const codigoRef = args.nome.substring(0, 4).toUpperCase() + Math.floor(Math.random() * 10000).toString();
            const percentagem = args.percentagem_comissao || 10;
            
            const { data: afiliado, error } = await supabase.from('afiliados').insert({
                empresa_id: empresaId,
                nome: args.nome,
                email: args.email,
                codigo_referencia: codigoRef,
                percentagem_comissao: percentagem
            }).select('id').single();
            if (error) throw error;
            
            return JSON.stringify({ 
                status: 'success', 
                message: `Afiliado "${args.nome}" criado com sucesso! Código de Referência: ${codigoRef}`, 
                id: afiliado.id, 
                codigo_referencia: codigoRef 
            });
        } catch (error: any) {
            return JSON.stringify({ status: 'error', error: error.message });
        }
    } else if (name === 'agendar_reuniao') {
        try {
            const { id, linkJitsi } = await ReuniaoService.criarReuniaoRegistro({
                empresa_id: empresaId,
                titulo: args.titulo,
                data_hora: args.data_hora,
                emails_convidados: args.emails_convidados || ''
            }, supabase);

            const linkConvite = `${process.env.FRONTEND_PUBLIC_URL || ''}/reuniao/${id}`;
            return JSON.stringify({ status: 'success', message: `Reunião "${args.titulo}" agendada para ${args.data_hora}. Link: ${linkConvite}`, id, link: linkConvite });
        } catch (error: any) {
            return JSON.stringify({ status: 'error', error: error.message });
        }
    } else if (name === 'criar_evento_calendario') {
        try {
            const { data: evento, error } = await supabase.from('eventos_calendario').insert({
                empresa_id: empresaId,
                titulo: args.titulo,
                data_evento: args.data_evento,
                detalhes: args.detalhes || ''
            }).select('id').single();
            if (error) throw error;
            
            return JSON.stringify({ status: 'success', message: `Evento "${args.titulo}" agendado para ${args.data_evento}.`, id: evento.id });
        } catch (error: any) {
            return JSON.stringify({ status: 'error', error: error.message });
        }
    } else if (name === 'pesquisar_web') {
        return JSON.stringify({
            status: 'info',
            message: `Pesquisa web por "${args.query}" — O módulo de navegação web está em modo de conhecimento interno.`
        });
    } else if (name === 'listar_servicos_agendamento') {
        try {
            if (!empresaId) return JSON.stringify({ status: 'error', error: 'empresaId não fornecido.' });
            const { AgendamentoService } = require('./AgendamentoService');
            const info = await AgendamentoService.getInfoPublica(String(empresaId));
            return JSON.stringify({
                status: 'success',
                servicos: info.servicos.map((s: any) => ({ nome: s.nome, duracao_minutos: s.duracao_minutos, preco: s.preco })),
                profissionais: info.profissionais.map((p: any) => p.nome),
            });
        } catch (error: any) {
            return JSON.stringify({ status: 'error', error: error.message });
        }
    } else if (name === 'verificar_disponibilidade_agendamento') {
        try {
            if (!empresaId) return JSON.stringify({ status: 'error', error: 'empresaId não fornecido.' });
            const { AgendamentoService } = require('./AgendamentoService');
            const info = await AgendamentoService.getInfoPublica(String(empresaId));
            const resolvido = resolverServicoEProfissional(info, args.servico_nome, args.profissional_nome);
            if (!resolvido.servico) {
                return JSON.stringify({ status: 'error', error: 'Serviço não encontrado.', servicos_disponiveis: info.servicos.map((s: any) => s.nome) });
            }
            const resultado = await AgendamentoService.getDisponibilidade(String(empresaId), resolvido.servico.id, args.data, resolvido.profissionalId, supabase);
            return JSON.stringify({ status: 'success', servico_nome: resolvido.servico.nome, duracao_minutos: resolvido.servico.duracao_minutos, preco: resolvido.servico.preco, ...resultado });
        } catch (error: any) {
            return JSON.stringify({ status: 'error', error: error.message });
        }
    } else if (name === 'criar_agendamento_whatsapp') {
        try {
            if (!empresaId) return JSON.stringify({ status: 'error', error: 'empresaId não fornecido.' });
            if (!whatsappContext?.telefone) return JSON.stringify({ status: 'error', error: 'Esta ferramenta só pode ser usada numa conversa de WhatsApp.' });
            const { AgendamentoService } = require('./AgendamentoService');
            const info = await AgendamentoService.getInfoPublica(String(empresaId));
            const resolvido = resolverServicoEProfissional(info, args.servico_nome, args.profissional_nome);
            if (!resolvido.servico) {
                return JSON.stringify({ status: 'error', error: 'Serviço não encontrado.', servicos_disponiveis: info.servicos.map((s: any) => s.nome) });
            }
            const id = await AgendamentoService.criarAgendamento(String(empresaId), {
                servico_id: resolvido.servico.id, profissional_id: resolvido.profissionalId,
                cliente_nome: args.cliente_nome, cliente_telefone: whatsappContext.telefone,
                data: args.data, hora_inicio: args.hora_inicio,
            }, 'whatsapp', supabase);
            return JSON.stringify({ status: 'success', message: 'Marcação criada com sucesso.', agendamento_id: id });
        } catch (error: any) {
            return JSON.stringify({ status: 'error', error: error.message });
        }
    } else if (name === 'listar_minhas_marcacoes_agendamento') {
        try {
            if (!empresaId) return JSON.stringify({ status: 'error', error: 'empresaId não fornecido.' });
            if (!whatsappContext?.telefone) return JSON.stringify({ status: 'error', error: 'Esta ferramenta só pode ser usada numa conversa de WhatsApp.' });
            const { AgendamentoService } = require('./AgendamentoService');
            const marcacoes = await AgendamentoService.listarAgendamentosPorTelefone(String(empresaId), whatsappContext.telefone, supabase);
            return JSON.stringify({ status: 'success', marcacoes });
        } catch (error: any) {
            return JSON.stringify({ status: 'error', error: error.message });
        }
    } else if (name === 'cancelar_agendamento_whatsapp') {
        try {
            if (!empresaId) return JSON.stringify({ status: 'error', error: 'empresaId não fornecido.' });
            if (!whatsappContext?.telefone) return JSON.stringify({ status: 'error', error: 'Esta ferramenta só pode ser usada numa conversa de WhatsApp.' });
            const { AgendamentoService } = require('./AgendamentoService');
            await AgendamentoService.cancelarAgendamentoPorTelefone(String(empresaId), whatsappContext.telefone, Number(args.agendamento_id), supabase);
            return JSON.stringify({ status: 'success', message: 'Marcação cancelada com sucesso.' });
        } catch (error: any) {
            return JSON.stringify({ status: 'error', error: error.message });
        }
    } else if (name === 'remarcar_agendamento_whatsapp') {
        try {
            if (!empresaId) return JSON.stringify({ status: 'error', error: 'empresaId não fornecido.' });
            if (!whatsappContext?.telefone) return JSON.stringify({ status: 'error', error: 'Esta ferramenta só pode ser usada numa conversa de WhatsApp.' });
            const { AgendamentoService } = require('./AgendamentoService');
            await AgendamentoService.remarcarAgendamentoPorTelefone(String(empresaId), whatsappContext.telefone, Number(args.agendamento_id), args.nova_data, args.nova_hora, supabase);
            return JSON.stringify({ status: 'success', message: 'Marcação remarcada com sucesso.' });
        } catch (error: any) {
            return JSON.stringify({ status: 'error', error: error.message });
        }
    }
    return JSON.stringify({ error: "Ferramenta desconhecida." });
}

function resolverServicoEProfissional(info: { servicos: any[]; profissionais: any[] }, servicoNome?: string, profissionalNome?: string) {
    const alvo = String(servicoNome || '').toLowerCase().trim();
    const servico = info.servicos.find((s: any) => {
        const nome = s.nome.toLowerCase();
        return nome === alvo || nome.includes(alvo) || alvo.includes(nome);
    });
    let profissionalId: number | undefined;
    if (profissionalNome) {
        const alvoProf = profissionalNome.toLowerCase().trim();
        const prof = info.profissionais.find((p: any) => p.nome.toLowerCase().includes(alvoProf));
        profissionalId = prof?.id;
    }
    return { servico, profissionalId };
}
