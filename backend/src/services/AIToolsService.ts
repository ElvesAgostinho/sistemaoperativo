import { supabase } from '../lib/supabaseClient';
import { LocalAgentSandbox } from './LocalAgentSandbox';

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
            description: "Lista ficheiros existentes no módulo Meu PC (diretório local de documentos ou desktop do utilizador) para dizer quantos documentos existem.",
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
    {
        type: "function" as const,
        function: {
            name: "pesquisar_base_conhecimento",
            description: "Pesquisa por uma palavra-chave ou lê todos os ficheiros da Base de Conhecimento da empresa (regras, FAQs, políticas). Use esta ferramenta para obter contexto antes de responder a perguntas sobre a empresa.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Palavra-chave a pesquisar. Deixe vazio para ler os primeiros 3 documentos." }
                }
            }
        }
    },
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
    }
];

export async function executeAITool(name: string, args: any, empresaId?: number) {
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
            const desktopPath = path.join(os.homedir(), 'Desktop');
            const documentsPath = path.join(os.homedir(), 'Documents');
            let count = 0;
            let files: string[] = [];
            
            if (fs.existsSync(desktopPath)) {
                const dFiles = fs.readdirSync(desktopPath).filter((f: string) => fs.statSync(path.join(desktopPath, f)).isFile());
                count += dFiles.length;
                files.push(...dFiles.slice(0, 5));
            }
            if (fs.existsSync(documentsPath)) {
                const docFiles = fs.readdirSync(documentsPath).filter((f: string) => fs.statSync(path.join(documentsPath, f)).isFile());
                count += docFiles.length;
                files.push(...docFiles.slice(0, 5));
            }
            
            return JSON.stringify({
                status: 'success',
                total_ficheiros: count,
                exemplos: files,
                mensagem: `O módulo Meu PC detetou ${count} ficheiros locais.`
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
            
            if (!path.isAbsolute(fileName)) {
                const desktopPath = path.join(os.homedir(), 'Desktop', fileName);
                const docsPath = path.join(os.homedir(), 'Documents', fileName);
                const downloadsPath = path.join(os.homedir(), 'Downloads', fileName);
                const customPath = path.join(os.homedir(), 'Desktop', 'SISTEMA OPERATIVO', fileName);
                
                if (fs.existsSync(customPath)) targetPath = customPath;
                else if (fs.existsSync(desktopPath)) targetPath = desktopPath;
                else if (fs.existsSync(docsPath)) targetPath = docsPath;
                else if (fs.existsSync(downloadsPath)) targetPath = downloadsPath;
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
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        try {
            const baseDir = path.join(os.homedir(), 'Desktop', 'SISTEMA OPERATIVO', 'Base_Conhecimento');
            if (!fs.existsSync(baseDir)) {
                return JSON.stringify({ status: 'error', error: 'Pasta Base_Conhecimento não encontrada.' });
            }
            
            const files = fs.readdirSync(baseDir).filter((f: string) => f.endsWith('.txt') || f.endsWith('.md') || f.endsWith('.pdf'));
            let contentResult = '';
            
            for (const file of files.slice(0, 5)) {
                const targetPath = path.join(baseDir, file);
                const ext = path.extname(file).toLowerCase();
                if (ext === '.txt' || ext === '.md') {
                    const content = fs.readFileSync(targetPath, 'utf8');
                    if (!args.query || content.toLowerCase().includes(args.query.toLowerCase())) {
                        contentResult += `\n--- Ficheiro: ${file} ---\n${content.substring(0, 5000)}\n`;
                    }
                } else if (ext === '.pdf') {
                    const pdfParse = require('pdf-parse');
                    const data = await pdfParse(fs.readFileSync(targetPath));
                    if (!args.query || data.text.toLowerCase().includes(args.query.toLowerCase())) {
                        contentResult += `\n--- Ficheiro: ${file} ---\n${data.text.substring(0, 5000)}\n`;
                    }
                }
            }
            
            if (!contentResult) return JSON.stringify({ status: 'success', message: 'Nenhuma informação relevante encontrada.' });
            return JSON.stringify({ status: 'success', data: contentResult });
        } catch (error: any) {
            return JSON.stringify({ status: 'error', error: error.message });
        }
    } else if (name === 'criar_pasta') {
        const path = require('path');
        const fs = require('fs');
        try {
            const BASE_DIR = path.join('C:', 'Users', 'DELL', 'Desktop', 'SISTEMA OPERATIVO', 'Empresa_Arquivos');
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
            const BASE_DIR = path.join('C:', 'Users', 'DELL', 'Desktop', 'SISTEMA OPERATIVO', 'Empresa_Arquivos');
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

            const BASE_DIR = path.join('C:', 'Users', 'DELL', 'Desktop', 'SISTEMA OPERATIVO', 'Empresa_Arquivos');
            const targetPath = path.join(BASE_DIR, 'Clientes', args.nome.replace(/[^a-z0-9]/gi, '_'));
            if (!fs.existsSync(targetPath)) {
                fs.mkdirSync(targetPath, { recursive: true });
            }

            return JSON.stringify({ 
                status: 'success', 
                message: `Lead "${args.nome}" criada com sucesso! Cliente ID: ${cliente.id}, Negócio ID: ${negocio.id}. Pasta criada em Empresa_Arquivos/Clientes.`, 
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
            const roomName = `BusinessOS_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const linkJitsi = `https://meet.jit.si/${roomName}`;

            const { data: reuniao, error } = await supabase.from('reunioes').insert({
                empresa_id: empresaId,
                titulo: args.titulo,
                data_hora: args.data_hora,
                link_jitsi: linkJitsi,
                emails_convidados: args.emails_convidados || ''
            }).select('id').single();
            if (error) throw error;
            
            return JSON.stringify({ status: 'success', message: `Reunião "${args.titulo}" agendada para ${args.data_hora}. Link: ${linkJitsi}`, id: reuniao.id, link: linkJitsi });
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
    }
    return JSON.stringify({ error: "Ferramenta desconhecida." });
}
