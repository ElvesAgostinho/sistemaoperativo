import { Request, Response } from 'express';
import { getSupabase } from '../lib/supabaseClient';
import { EmailService } from '../services/EmailService';
import { ReuniaoService } from '../services/ReuniaoService';
import { PdfService } from '../services/PdfService';
import { DailyService } from '../services/DailyService';

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

        // Só minta um token de acesso à sala (anfitrião) se a reunião ainda não
        // terminou — a sala Daily é privada, não há URL cru que funcione sozinho.
        let daily_url: string | null = null;
        if (reuniao.estado !== 'Concluida' && reuniao.daily_room_name) {
            try {
                const nomeAnfitriao = (req as any).user?.email?.split('@')[0] || 'Anfitrião';
                const token = await DailyService.criarTokenReuniao({ roomName: reuniao.daily_room_name, nomeParticipante: nomeAnfitriao, isOwner: true });
                daily_url = `${reuniao.link_jitsi}?t=${token}`;
            } catch (e) {
                console.error('[reunioesController] Falha ao mintar token da Daily:', e);
            }
        }

        res.json({ success: true, reuniao: { ...reuniao, daily_url }, tarefas: tarefas || [] });
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

        // Atalho manual/imediato: usa os fragmentos de legendas ao vivo captados
        // pelo browser (ver reunioesPublicController). Quando a gravação real da
        // Daily ficar pronta, o webhook (dailyRoutes.ts) chama ReuniaoService
        // .gerarResumoIA outra vez com a transcrição do Whisper, que é mais fiável
        // e substitui este resultado — este botão só evita esperar por isso.
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

        const resultado = await ReuniaoService.gerarResumoIA(transcricao, id, supabase);

        res.json({ success: true, ...resultado });
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
