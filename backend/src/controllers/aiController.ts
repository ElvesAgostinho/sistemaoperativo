import { Request, Response } from 'express';
import { EnterpriseAssistantService } from '../services/EnterpriseAssistantService';
import { supabase } from '../lib/supabaseClient';

export const chat = async (req: Request, res: Response) => {
  try {
    const { prompt, conversaId } = req.body;
    // req.user might be populated by requireAuth, but right now aiRoutes are unprotected or hitting direct.
    // If unprotected, we fallback to a default admin role for the MVP.
    const userRole = (req as any).user?.role || 'admin';
    const userId = (req as any).user?.id || 'sys_admin';
    const empresaId = (req as any).user?.empresa_id;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const result = await EnterpriseAssistantService.chat(userId, userRole, prompt, conversaId, empresaId);

    return res.json({
      success: true,
      response: result.response,
      conversaId: result.conversaId,
      supervision_ui: result.supervision_ui
    });

  } catch (error: any) {
    console.error('Error communicating with Enterprise Assistant:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to process AI request.',
      details: error.message 
    });
  }
};

export const executeAction = async (req: Request, res: Response) => {
  try {
    const { action_type, payload, conversaId } = req.body;
    const empresaId = (req as any).user?.empresa_id || null;

    if (action_type === 'criar_funcionario_draft') {
       const { data: info, error } = await supabase.from('colaboradores').insert({
           empresa_id: empresaId,
           nome: payload.nome || 'Funcionário Fictício',
           bi: payload.bi || `BI-${Math.floor(Math.random()*1000000)}`,
           nif: payload.nif || `NIF-${Math.floor(Math.random()*1000000)}`,
           cargo: payload.cargo || 'Indefinido',
           salario_base: payload.salario_base || 0,
           departamento: payload.departamento || 'Geral',
           estado: 'Ativo'
       }).select('id').single();

       if (error) throw error;
       
       const userMsg = "Confirmei e guardei o funcionário no sistema.";
       const aiMsg = `Perfeito! O funcionário **${payload.nome}** foi criado com sucesso com o ID #${info.id}.`;
       
       if (conversaId) {
          await supabase.from('mensagens_ia').insert([
            { conversa_id: conversaId, role: 'user', content: userMsg },
            { conversa_id: conversaId, role: 'ai', content: aiMsg }
          ]);
       }

       // Add Alert to Dashboard
       await supabase.from('alertas_assistente').insert({
           empresa_id: empresaId,
           tipo: 'novo_funcionario',
           mensagem: `Novo colaborador registado: ${payload.nome} (${payload.cargo})`
       });

       return res.json({ success: true, response: aiMsg });
    } else if (action_type === 'registar_pagamento_crm') {
       const CrmService = require('../services/CrmService').default;
       try {
           const recibo_id = await CrmService.registerPayment(
               Number(payload.negocio_id),
               Number(payload.valor),
               payload.metodo_pagamento || 'Transferência Bancária',
               payload.data_pagamento || new Date().toISOString().split('T')[0],
               empresaId
           );
           
           const userMsg = "Confirmei o pagamento da fatura.";
           const aiMsg = `Pagamento de **${payload.valor} Kz** registado com sucesso (Recibo #${recibo_id}). O lançamento contabilístico duplo (Débito: Conta 43.1 / Crédito: Conta 61) foi criado automaticamente no diário de Tesouraria.`;
           
           if (conversaId) {
              await supabase.from('mensagens_ia').insert([
                { conversa_id: conversaId, role: 'user', content: userMsg },
                { conversa_id: conversaId, role: 'ai', content: aiMsg }
              ]);
           }

           await supabase.from('alertas_assistente').insert({
               empresa_id: empresaId,
               tipo: 'pagamento_registado',
               mensagem: `Pagamento de ${payload.valor} Kz registado via Assistente.`
           });

           return res.json({ success: true, response: aiMsg });
       } catch (error: any) {
           return res.status(500).json({ success: false, error: 'Erro ao registar pagamento.', details: error.message });
       }
    } else if (action_type === 'mega_fluxo_contratacao') {
       const { LocalAgentSandbox } = require('../services/LocalAgentSandbox');
       const { OfficeIntegration } = require('../services/OfficeIntegration');
       const { EmailService } = require('../services/EmailService');

       // 1. DB
       const { data: info, error } = await supabase.from('colaboradores').insert({
           empresa_id: empresaId,
           nome: payload.nome,
           cargo: payload.cargo,
           salario_base: payload.salario_base,
           departamento: payload.departamento,
           estado: 'Ativo'
       }).select('id').single();
       if (error) throw error;
       
       // 2. Ficheiros
       const folderName = payload.nome.replace(/[^a-z0-9]/gi, '_').toLowerCase();
       LocalAgentSandbox.criarPasta(folderName);
       
       // 3. Office
       const docxPath = await OfficeIntegration.gerarContratoWord(payload, folderName);
       const pdfPath = await OfficeIntegration.gerarPdfDeWord(payload, folderName);
       
       // 4. Email
       const mockEmail = folderName + "@businessos.com";
       const { getSupabase } = require('../lib/supabaseClient');
       const userClient = getSupabase(req);
       await EmailService.enviarEmailBoasVindas(mockEmail, payload.nome, empresaId, userClient);
       
       // 5. Calendario
       const daquiA3Dias = new Date();
       daquiA3Dias.setDate(daquiA3Dias.getDate() + 3);
       
       await supabase.from('eventos_calendario').insert({
           empresa_id: empresaId,
           titulo: `Onboarding de ${payload.nome}`,
           data_evento: daquiA3Dias.toISOString(),
           detalhes: `Preparar equipamento para o cargo de ${payload.cargo}`
       });
       
       // 6. Alerta & Chat
       await supabase.from('alertas_assistente').insert({
           empresa_id: empresaId,
           tipo: 'novo_funcionario_mega',
           mensagem: `Mega Fluxo: ${payload.nome} (${payload.cargo}) criado, docx/pdf gerados e onboarding agendado.`
       });

       const userMsg = "Confirmei o Mega Fluxo de Contratação.";
       const aiMsg = `Mega Fluxo Executado com sucesso!\n- Funcionário #${info.id} registado.\n- Pasta criada.\n- Contrato Word e PDF guardados no disco.\n- E-mail de Boas-Vindas simulado para ${mockEmail}.\n- Onboarding agendado na DB.`;

       if (conversaId) {
          await supabase.from('mensagens_ia').insert([
            { conversa_id: conversaId, role: 'user', content: userMsg },
            { conversa_id: conversaId, role: 'ai', content: aiMsg }
          ]);
       }

       return res.json({ success: true, response: aiMsg });
    } else if (action_type === 'gerar_relatorio_excel') {
       const { ExcelService } = require('../services/ExcelService');
       
       let reportData: any[] = [];
       if (payload.tipo_dados === 'salarios') {
           const { data } = await supabase.from('colaboradores').select('id, nome, cargo, salario_base, departamento').eq('empresa_id', empresaId);
           reportData = data || [];
       } else if (payload.tipo_dados === 'funcionarios') {
           const { data } = await supabase.from('colaboradores').select('id, nome, bi, nif, cargo, departamento, data_admissao, estado').eq('empresa_id', empresaId);
           reportData = data || [];
       } else {
           const { data } = await supabase.from('colaboradores').select('*').eq('empresa_id', empresaId).limit(100);
           reportData = data || [];
       }

       const filename = payload.nome_ficheiro || `relatorio_${payload.tipo_dados}_${Date.now()}.xlsx`;
       const filePath = await ExcelService.generateReport(filename, reportData);
       
       // Trigger opening it
       ExcelService.openExcelFile(filePath);

       const aiMsg = `Relatório **${filename}** gerado com sucesso com ${reportData.length} registos e aberto no seu ecrã!`;
       
       if (conversaId) {
          await supabase.from('mensagens_ia').insert([
            { conversa_id: conversaId, role: 'user', content: "Gera o relatório Excel." },
            { conversa_id: conversaId, role: 'ai', content: aiMsg }
          ]);
       }

       return res.json({ success: true, response: aiMsg });
    } else if (action_type === 'gerar_relatorio_powerbi') {
        const { ExcelService } = require('../services/ExcelService');
        
        let reportData: any[] = [];
        if (payload.tipo_dados === 'salarios') {
            const { data } = await supabase.from('colaboradores').select('id, nome, cargo, salario_base, departamento').eq('empresa_id', empresaId);
            reportData = data || [];
        } else if (payload.tipo_dados === 'funcionarios') {
            const { data } = await supabase.from('colaboradores').select('id, nome, bi, nif, cargo, departamento, data_admissao, estado').eq('empresa_id', empresaId);
            reportData = data || [];
        } else {
            const { data } = await supabase.from('colaboradores').select('*').eq('empresa_id', empresaId);
            reportData = data || [];
        }

        let filename = payload.nome_ficheiro || `dataset_${payload.tipo_dados}_${Date.now()}.xlsx`;
        if (filename.endsWith('.pbix') || filename.endsWith('.pbix.xlsx')) {
            filename = filename.replace('.pbix.xlsx', '.xlsx').replace('.pbix', '.xlsx');
        }
        if (!filename.endsWith('.xlsx')) filename += '.xlsx';
        
        // Geramos via ExcelService para ser formatado e compatível
        const filePath = await ExcelService.generateReport(filename, reportData);

        const open = require('open');
        const { exec } = require('child_process');
        const path = require('path');
        
        // Tenta abrir o Power BI Desktop (funciona se estiver no PATH), se falhar abre a pasta
        exec(`start PBIDesktop`, (error: any) => {
            if (error) {
                // Se falhar o start normal, tenta abrir a pasta com o ficheiro selecionado!
                exec(`explorer /select,"${filePath}"`);
            }
        });

        const aiMsg = `Dataset para Power BI gerado com sucesso com ${reportData.length} registos! \n\n**Atenção:** O formato nativo do Power BI (.pbix) é fechado pela Microsoft, por isso criei um **Dataset Excel** \`${filename}\` estruturado e limpo, pronto a ser importado!\n\n(Tentei abrir o Power BI vazio para si. Agora basta ir a "Obter Dados" -> "Excel" e selecionar este ficheiro).`;
        
        if (conversaId) {
           await supabase.from('mensagens_ia').insert([
             { conversa_id: conversaId, role: 'user', content: "Gera o dataset para Power BI." },
             { conversa_id: conversaId, role: 'ai', content: aiMsg }
           ]);
        }

        return res.json({ success: true, response: aiMsg });
    } else if (action_type === 'gerar_relatorio_word') {
        const { OfficeIntegration } = require('../services/OfficeIntegration');
        const filename = payload.nome_ficheiro || `relatorio_${Date.now()}.docx`;
        const filePath = await OfficeIntegration.gerarRelatorioWordGenerico(payload.titulo, payload.conteudo, filename);
        
        const { LocalAgentSandbox } = require('../services/LocalAgentSandbox');
        LocalAgentSandbox.abrirAplicacao(filePath).catch((e: any) => console.error(e));

        const aiMsg = `Relatório Word **${filename}** gerado com sucesso e aberto no seu ecrã!`;
        if (conversaId) {
            await supabase.from('mensagens_ia').insert([
              { conversa_id: conversaId, role: 'user', content: "Gera o relatório Word." },
              { conversa_id: conversaId, role: 'ai', content: aiMsg }
            ]);
        }
        return res.json({ success: true, response: aiMsg });
    } else if (action_type === 'gerar_relatorio_powerpoint') {
        const { OfficeIntegration } = require('../services/OfficeIntegration');
        const filename = payload.nome_ficheiro || `apresentacao_${Date.now()}.pptx`;
        const filePath = await OfficeIntegration.gerarApresentacaoPowerPoint(payload.titulo, payload.slides, filename);
        
        const { LocalAgentSandbox } = require('../services/LocalAgentSandbox');
        LocalAgentSandbox.abrirAplicacao(filePath).catch((e: any) => console.error(e));

        const aiMsg = `Apresentação PowerPoint **${filename}** gerada com sucesso e aberta no seu ecrã!`;
        if (conversaId) {
            await supabase.from('mensagens_ia').insert([
              { conversa_id: conversaId, role: 'user', content: "Gera a apresentação PowerPoint." },
              { conversa_id: conversaId, role: 'ai', content: aiMsg }
            ]);
        }
        return res.json({ success: true, response: aiMsg });
    } else if (action_type === 'gerar_imagem') {
        const OpenAI = require('openai').default;
        const key = process.env.OPENAI_API_KEY;
        if (!key) throw new Error('OPENAI_API_KEY não configurada.');
        const client = new OpenAI({ apiKey: key });

        const response = await client.images.generate({
            model: "dall-e-3",
            prompt: payload.prompt,
            n: 1,
            size: "1024x1024",
        });

        const imageUrl = response.data[0].url;
        const aiMsg = `![Imagem Gerada](${imageUrl})\n\nAqui está a imagem gerada com base no seu pedido: "${payload.prompt}"`;
        
        if (conversaId) {
            await supabase.from('mensagens_ia').insert([
              { conversa_id: conversaId, role: 'user', content: "Gera uma imagem: " + payload.prompt },
              { conversa_id: conversaId, role: 'ai', content: aiMsg }
            ]);
        }
        return res.json({ success: true, response: aiMsg });
    } else if (action_type === 'enviar_mensagem_whatsapp') {
        const clientPhone = payload.telefone;
        const { supabase } = require('../lib/supabaseClient');
        
        let { data: conv } = await supabase.from('wa_conversations').select('id').eq('client_phone', clientPhone).single();
        if (!conv) {
            const { data: channel } = await supabase.from('wa_channels').select('id').limit(1).single();
            if (channel) {
                const { data: newConv } = await supabase.from('wa_conversations').insert({
                    channel_id: channel.id,
                    client_phone: clientPhone,
                    client_name: 'Cliente (IA)'
                }).select('id').single();
                conv = newConv;
            }
        }
        
        if (conv) {
            await supabase.from('wa_messages').insert({
                conversation_id: conv.id,
                direction: 'outbound',
                content: payload.mensagem,
                status: 'delivered'
            });
        }

        const aiMsg = `Mensagem enviada com sucesso para **${payload.telefone}** no WhatsApp!`;
        if (conversaId) {
            await supabase.from('mensagens_ia').insert([
              { conversa_id: conversaId, role: 'user', content: `Envia WhatsApp para ${payload.telefone}.` },
              { conversa_id: conversaId, role: 'ai', content: aiMsg }
            ]);
        }
        return res.json({ success: true, response: aiMsg });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error: any) {
    console.error('Action execution error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getConversations = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id || 'sys_admin';
        const { data: conversas, error } = await supabase.from('conversas_ia')
            .select('id, titulo, criado_em')
            .eq('utilizador_id', userId)
            .order('id', { ascending: false })
            .limit(50);
            
        if (error) throw error;
        
        const mapped = (conversas || []).map(c => ({ ...c, data_criacao: c.criado_em }));
        res.json({ success: true, conversas: mapped });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export const getConversationMessages = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { data: mensagens, error } = await supabase.from('mensagens_ia')
            .select('role, content, criado_em')
            .eq('conversa_id', id)
            .in('role', ['user', 'ai'])
            .not('content', 'is', null)
            .neq('content', '')
            .order('id', { ascending: true });
            
        if (error) throw error;
        
        const mapped = (mensagens || []).map(m => ({ ...m, data_criacao: m.criado_em }));
        res.json({ success: true, mensagens: mapped });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
}
