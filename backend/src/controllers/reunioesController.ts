import { Request, Response } from 'express';
import { getSupabase } from '../lib/supabaseClient';
import { EmailService } from '../services/EmailService';
import { ReuniaoService } from '../services/ReuniaoService';
import { PdfService } from '../services/PdfService';
import OpenAI from 'openai';

export const listarReunioes = async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase(req);
        const { data: reunioes, error } = await supabase.from('reunioes').select('*').order('data_hora', { ascending: false });
        if (error) throw error;
        res.json({ success: true, reunioes });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const detalhesReuniao = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const supabase = getSupabase(req);
        const { data: reuniao, error: rErr } = await supabase.from('reunioes').select('*').eq('id', id).single();
        if (rErr || !reuniao) return res.status(404).json({ error: 'Reunião não encontrada' });
        
        const { data: tarefas, error: tErr } = await supabase.from('reunioes_tarefas').select('*').eq('reuniao_id', id);
        
        res.json({ success: true, reuniao, tarefas: tarefas || [] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const criarReuniao = async (req: Request, res: Response) => {
    try {
        const { titulo, data_hora, emails_convidados } = req.body;
        if (!titulo || !data_hora) {
            return res.status(400).json({ success: false, error: 'Título e data são obrigatórios' });
        }

        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { id: novaReuniaoId, linkJitsi } = await ReuniaoService.criarReuniaoRegistro(
            { empresa_id, titulo, data_hora, emails_convidados }, supabase
        );

        if (!process.env.FRONTEND_PUBLIC_URL) {
            console.warn('[reunioesController] FRONTEND_PUBLIC_URL não definida — os links de convite enviados por email vão ficar quebrados.');
        }
        const linkConvite = `${process.env.FRONTEND_PUBLIC_URL || ''}/reuniao/${novaReuniaoId}`;

        if (emails_convidados) {
            const listaEmails = emails_convidados.split(',').map((e: string) => e.trim()).filter((e: string) => e);
            for (const email of listaEmails) {
                const assunto = `Convite para Reunião: ${titulo}`;
                const corpo = `<div style="font-family:Arial,sans-serif">
                    <h2>Olá!</h2>
                    <p>Foi convidado(a) para a reunião <strong>${titulo}</strong>.</p>
                    <p><strong>Data/Hora:</strong> ${new Date(data_hora).toLocaleString('pt-PT')}</p>
                    <p><strong>Link da Reunião:</strong> <a href="${linkConvite}">${linkConvite}</a></p>
                    <br/>
                    <p>Atentamente,<br/>A sua equipa do BusinessOS</p>
                </div>`;

                await EmailService.enviarEmailPersonalizado(email, assunto, corpo, empresa_id, supabase).catch(e => {
                    console.error(`Falha ao enviar email para ${email}`, e);
                });
            }
        }

        res.json({ success: true, id: novaReuniaoId, link_jitsi: linkJitsi, link_convite: linkConvite });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const processarTranscricao = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const supabase = getSupabase(req);

        // A transcrição é reconstruída a partir dos fragmentos guardados por TODOS os
        // participantes (host + convidados, ver reunioesPublicController), não apenas
        // do que o criador da reunião capturou localmente.
        const { data: fragmentos } = await supabase
            .from('reunioes_transcricoes')
            .select('participante_nome, fragmento, criado_em')
            .eq('reuniao_id', id)
            .order('criado_em', { ascending: true });

        const transcricaoFragmentos = (fragmentos || [])
            .map(f => `[${f.participante_nome}]: ${f.fragmento}`)
            .join('\n')
            .trim();
        const transcricao = transcricaoFragmentos || 'Reunião sem transcrição disponível (nenhum áudio foi captado).';

        await supabase.from('reunioes').update({ transcricao_raw: transcricao, estado: 'Concluida' }).eq('id', id);

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY não configurada');
        }

        const openai = new OpenAI({ apiKey });

        const systemPrompt = `
Você é o Agente IA de Reuniões do BusinessOS.
Recebeu a transcrição (obtida via microfone/browser) de uma reunião em vídeo.
A sua tarefa é:
1. Fazer um resumo executivo bem estruturado.
2. Identificar os "pontos_altos" (sucessos, boas notícias).
3. Identificar os "pontos_baixos" (desafios, problemas, alertas).
4. Extrair as "recomendacoes" ou sugestões que foram explicitamente mencionadas ou debatidas pelas pessoas durante a reunião (não invente conselhos, reporte apenas o que foi aconselhado na reunião).
5. Extrair todas as tarefas mencionadas, com responsavel (se não houver, escreva 'Não definido') e prazo (se não houver, 'Sem prazo').

Responda EXATAMENTE neste formato JSON:
{
  "resumo": "Resumo executivo...",
  "pontos_altos": ["Ponto 1", "Ponto 2"],
  "pontos_baixos": ["Ponto 1"],
  "recomendacoes": ["Rec 1", "Rec 2"],
  "tarefas": [
    { "descricao": "Fazer X", "responsavel": "João", "prazo": "Amanhã" }
  ]
}
`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Transcrição da reunião:\n\n${transcricao}` }
            ],
            response_format: { type: "json_object" }
        });

        const outputMsg = response.choices[0].message?.content;
        if (!outputMsg) throw new Error("A IA não retornou um resumo válido.");

        const jsonOut = JSON.parse(outputMsg);

        await supabase.from('reunioes').update({
            resumo_ia: jsonOut.resumo,
            pontos_altos: JSON.stringify(jsonOut.pontos_altos || []),
            pontos_baixos: JSON.stringify(jsonOut.pontos_baixos || []),
            recomendacoes: JSON.stringify(jsonOut.recomendacoes || [])
        }).eq('id', id);

        const tarefasArr = jsonOut.tarefas || [];
        for (const t of tarefasArr) {
            await supabase.from('reunioes_tarefas').insert({
                reuniao_id: id,
                descricao: t.descricao,
                responsavel: t.responsavel || 'Não definido',
                prazo: t.prazo || 'Sem prazo'
            });
        }

        res.json({ 
            success: true, 
            resumo: jsonOut.resumo, 
            pontos_altos: jsonOut.pontos_altos, 
            pontos_baixos: jsonOut.pontos_baixos, 
            recomendacoes: jsonOut.recomendacoes, 
            tarefas: tarefasArr 
        });
    } catch (error: any) {
        console.error('Erro ao processar transcrição:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const apagarReuniao = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        let query = supabase.from('reunioes').delete().eq('id', id);
        if (empresa_id) query = query.eq('empresa_id', empresa_id);
        const { error } = await query;
        if (error) throw error;

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const gerarAtaPdf = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const { data: reuniao, error: rErr } = await supabase.from('reunioes').select('*').eq('id', id).single();
        if (rErr || !reuniao) return res.status(404).json({ error: 'Reunião não encontrada' });

        const { data: tarefas } = await supabase.from('reunioes_tarefas').select('descricao, responsavel, prazo').eq('reuniao_id', id);

        const parseJsonArray = (v: any): string[] => {
            if (Array.isArray(v)) return v;
            if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
            return [];
        };

        const filePath = await PdfService.gerarAtaPdf({
            id: reuniao.id,
            titulo: reuniao.titulo,
            data_hora: reuniao.data_hora,
            resumo_ia: reuniao.resumo_ia,
            pontos_altos: parseJsonArray(reuniao.pontos_altos),
            pontos_baixos: parseJsonArray(reuniao.pontos_baixos),
            recomendacoes: parseJsonArray(reuniao.recomendacoes),
        }, tarefas || [], empresa_id);

        // Serve pelo mesmo caminho estático "/tmp" já usado por Proforma/Recibos —
        // o frontend faz window.open(pdf_path) sem precisar de repetir o token de
        // autenticação no pedido do próprio ficheiro.
        const fileName = filePath.split(/[\\/]/).pop();
        res.json({ success: true, pdf_path: '/tmp/' + fileName });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const adicionarTarefa = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const { descricao, responsavel, prazo } = req.body;

        if (!descricao) {
            return res.status(400).json({ success: false, error: 'A descrição da tarefa é obrigatória.' });
        }

        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { data: novaTarefa, error } = await supabase.from('reunioes_tarefas').insert({
            empresa_id, reuniao_id: id, descricao, responsavel, prazo
        }).select('*').single();
        if (error) throw error;
        
        res.json({ success: true, tarefa: novaTarefa });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};
