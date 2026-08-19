import { Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient';

const MAX_FRAGMENTO_LENGTH = 5000;

/**
 * Dados mínimos de uma reunião para a página pública de convidados — nunca expõe
 * emails_convidados, transcricao_raw, resumo_ia, etc.
 */
export const getReuniaoPublica = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const { data: reuniao, error } = await supabase
            .from('reunioes')
            .select('id, titulo, data_hora, link_jitsi, estado')
            .eq('id', id)
            .single();

        if (error || !reuniao) {
            return res.status(404).json({ success: false, error: 'Reunião não encontrada.' });
        }

        const room = (reuniao.link_jitsi || '').split('/').pop() || '';

        res.json({
            success: true,
            reuniao: {
                titulo: reuniao.titulo,
                room,
                data_hora: reuniao.data_hora,
                estado: reuniao.estado
            }
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Recebe um fragmento de transcrição do navegador de UM participante (host ou
 * convidado). Sem autenticação por design — só quem conhece o id (uuid aleatório)
 * da reunião consegue publicar fragmentos para ela.
 */
export const adicionarFragmentoTranscricao = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const { participante_nome, participante_tipo, fragmento } = req.body;

        if (!participante_nome || typeof participante_nome !== 'string' || !participante_nome.trim()) {
            return res.status(400).json({ success: false, error: 'participante_nome é obrigatório.' });
        }
        if (!fragmento || typeof fragmento !== 'string' || !fragmento.trim()) {
            return res.status(400).json({ success: false, error: 'fragmento é obrigatório.' });
        }

        const { data: reuniao, error: reuniaoErr } = await supabase
            .from('reunioes')
            .select('id, empresa_id')
            .eq('id', id)
            .single();
        if (reuniaoErr || !reuniao) {
            return res.status(404).json({ success: false, error: 'Reunião não encontrada.' });
        }

        const { error } = await supabase.from('reunioes_transcricoes').insert({
            empresa_id: reuniao.empresa_id,
            reuniao_id: id,
            participante_nome: String(participante_nome).slice(0, 200),
            participante_tipo: participante_tipo === 'host' ? 'host' : 'convidado',
            fragmento: String(fragmento).slice(0, MAX_FRAGMENTO_LENGTH)
        });
        if (error) throw error;

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};
