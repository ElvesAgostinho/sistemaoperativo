import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { supabase } from '../lib/supabaseClient';
import { JitsiService } from '../services/JitsiService';

const MAX_FRAGMENTO_LENGTH = 5000;

/**
 * Dados mínimos de uma reunião para a página pública de convidados — nunca expõe
 * emails_convidados, transcricao_raw, resumo_ia, etc. Não devolve nenhum URL de
 * sala aqui — a sala Jitsi é privada (exige JWT), o link só é mintado (com token)
 * depois de o convidado indicar o nome, ver entrarReuniaoPublica.
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
 * token de convidado (moderator: false) na sala Jitsi da reunião, embutindo esse
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
            .select('id, link_jitsi, jitsi_room_name, estado')
            .eq('id', id)
            .single();
        if (error || !reuniao) {
            return res.status(404).json({ success: false, error: 'Reunião não encontrada.' });
        }
        if (reuniao.estado === 'Concluida') {
            return res.status(400).json({ success: false, error: 'Esta reunião já terminou.' });
        }
        if (!reuniao.jitsi_room_name) {
            return res.status(400).json({ success: false, error: 'Esta reunião não tem sala de videochamada associada.' });
        }

        const token = JitsiService.criarTokenReuniao({
            roomName: reuniao.jitsi_room_name,
            nomeParticipante: nome.trim().slice(0, 200),
            isOwner: false
        });

        res.json({ success: true, daily_url: `${reuniao.link_jitsi}?jwt=${token}` });
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

// NÃO fica dentro de /tmp (essa pasta é servida publicamente por express.static
// em index.ts) — áudio de reunião é sensível, não deve ficar acessível a quem
// adivinhar o nome do ficheiro.
const gravacaoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', '..', 'gravacoes_reunioes');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${req.params.id}_${Date.now()}.webm`)
});
const uploadGravacao = multer({ storage: gravacaoStorage, limits: { fileSize: 100 * 1024 * 1024 } });

/**
 * Recebe o áudio gravado no navegador de UM participante (o seu próprio
 * microfone, via MediaRecorder — ver MeetingRoom.tsx) no fim da chamada. Mesmo
 * modelo de confiança sem autenticação de adicionarFragmentoTranscricao acima:
 * protegido só pelo UUID aleatório da reunião.
 */
export const receberGravacao = [uploadGravacao.single('audio'), async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const { participante_nome, participante_tipo } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Ficheiro de áudio em falta.' });
        }

        const { data: reuniao, error: reuniaoErr } = await supabase
            .from('reunioes')
            .select('id, empresa_id')
            .eq('id', id)
            .single();
        if (reuniaoErr || !reuniao) {
            fs.unlink(req.file.path, () => {});
            return res.status(404).json({ success: false, error: 'Reunião não encontrada.' });
        }

        const { error } = await supabase.from('reunioes_gravacoes').insert({
            empresa_id: reuniao.empresa_id,
            reuniao_id: id,
            participante_nome: String(participante_nome || 'Participante').slice(0, 200),
            participante_tipo: participante_tipo === 'host' ? 'host' : 'convidado',
            ficheiro_path: req.file.path
        });
        if (error) throw error;

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
}];
