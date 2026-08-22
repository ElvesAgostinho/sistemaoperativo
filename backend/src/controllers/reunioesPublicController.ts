import { Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient';
import { DailyService } from '../services/DailyService';

const MAX_FRAGMENTO_LENGTH = 5000;

/**
 * Dados mínimos de uma reunião para a página pública de convidados — nunca expõe
 * emails_convidados, transcricao_raw, resumo_ia, etc. Não devolve nenhum URL de
 * sala aqui — a sala Daily é privada, o link só é mintado (com token) depois de o
 * convidado indicar o nome, ver entrarReuniaoPublica.
 */
export const getReuniaoPublica = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const { data: reuniao, error } = await supabase
            .from('reunioes')
            .select('id, titulo, data_hora, estado')
            .eq('id', id)
            .single();

        if (error || !reuniao) {
            return res.status(404).json({ success: false, error: 'Reunião não encontrada.' });
        }

        res.json({
            success: true,
            reuniao: {
                titulo: reuniao.titulo,
                data_hora: reuniao.data_hora,
                estado: reuniao.estado
            }
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Chamado depois de o convidado escrever o nome no ecrã de entrada — minta um
 * token de convidado (is_owner: false) na sala Daily da reunião, embutindo esse
 * nome. Sem autenticação por design, mesmo modelo de confiança que já existia
 * para participante_nome nos fragmentos de transcrição.
 */
export const entrarReuniaoPublica = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const { nome } = req.body;
        if (!nome || typeof nome !== 'string' || !nome.trim()) {
            return res.status(400).json({ success: false, error: 'nome é obrigatório.' });
        }

        const { data: reuniao, error } = await supabase
            .from('reunioes')
            .select('id, link_jitsi, daily_room_name, estado')
            .eq('id', id)
            .single();
        if (error || !reuniao) {
            return res.status(404).json({ success: false, error: 'Reunião não encontrada.' });
        }
        if (reuniao.estado === 'Concluida') {
            return res.status(400).json({ success: false, error: 'Esta reunião já terminou.' });
        }
        if (!reuniao.daily_room_name) {
            return res.status(400).json({ success: false, error: 'Esta reunião não tem sala de videochamada associada.' });
        }

        const token = await DailyService.criarTokenReuniao({
            roomName: reuniao.daily_room_name,
            nomeParticipante: nome.trim().slice(0, 200),
            isOwner: false
        });

        res.json({ success: true, daily_url: `${reuniao.link_jitsi}?t=${token}` });
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
