import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { supabase } from '../lib/supabaseClient';

const MAX_FRAGMENTO_LENGTH = 5000;

/**
 * Dados mínimos de uma reunião para a página pública de convidados — nunca expõe
 * emails_convidados, transcricao_raw, resumo_ia, etc. O link da sala só é
 * devolvido depois de o convidado indicar o nome, ver entrarReuniaoPublica —
 * assim o nome fica sempre associado à gravação/fragmentos dessa pessoa.
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
 * Chamado depois de o convidado escrever o nome no ecrã de entrada. Jitsi
 * público (meet.jit.si) não precisa de nenhum token — devolve o link da sala
 * diretamente. Sem autenticação por design, mesmo modelo de confiança que já
 * existia para participante_nome nos fragmentos de transcrição.
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
            .select('id, link_jitsi, estado')
            .eq('id', id)
            .single();
        if (error || !reuniao) {
            return res.status(404).json({ success: false, error: 'Reunião não encontrada.' });
        }
        if (reuniao.estado === 'Concluida') {
            return res.status(400).json({ success: false, error: 'Esta reunião já terminou.' });
        }
        if (!reuniao.link_jitsi) {
            return res.status(400).json({ success: false, error: 'Esta reunião não tem sala de videochamada associada.' });
        }

        res.json({ success: true, daily_url: reuniao.link_jitsi });
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

// Cada PARTE da gravação (4 minutos, ver gravadorSegmentado.ts no frontend)
// chega aqui assim que fica pronta. Fica no bucket privado da Supabase e não no
// disco do servidor: o disco apaga-se a cada publicação, e uma reunião de uma
// hora pode atravessar uma.
const uploadGravacao = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

const TIPOS_GRAVACAO = ['host', 'convidado', 'sala'];

/**
 * Recebe uma parte do áudio de UM participante — o microfone dele, ou (do
 * anfitrião) o som da chamada inteira, "sala". Sem autenticação, como os
 * fragmentos de transcrição acima: protegido pelo UUID aleatório da reunião.
 *
 * `inicio_em` é a hora real (ms) a que a parte começou: é por ela que as falas
 * de várias pessoas ficam pela ordem certa na ata. Vai no nome do ficheiro.
 */
export const receberGravacao = [uploadGravacao.single('audio'), async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const { participante_nome, participante_tipo } = req.body;

        if (!req.file || !req.file.buffer?.length) {
            return res.status(400).json({ success: false, error: 'Ficheiro de áudio em falta.' });
        }

        const { data: reuniao, error: reuniaoErr } = await supabase
            .from('reunioes')
            .select('id, empresa_id')
            .eq('id', id)
            .single();
        if (reuniaoErr || !reuniao) {
            return res.status(404).json({ success: false, error: 'Reunião não encontrada.' });
        }

        const tipo = TIPOS_GRAVACAO.includes(participante_tipo) ? participante_tipo : 'convidado';
        // A hora de início, se for credível (até um dia para trás); senão, agora.
        const pedida = Number(req.body?.inicio_em);
        const inicio = Number.isFinite(pedida) && pedida > Date.now() - 86400000 && pedida <= Date.now() + 60000 ? Math.round(pedida) : Date.now();
        // A extensão diz à transcrição o formato: o iPhone grava em MP4, não WebM.
        const mime = String(req.file.mimetype || '');
        const ext = /mp4|m4a|aac/.test(mime) ? 'mp4' : /ogg/.test(mime) ? 'ogg' : 'webm';
        const nome = `reuniao_${id}_${inicio}_${tipo}.${ext}`;

        let ficheiro_path: string;
        try {
            const { MediaUploadService } = require('../services/MediaUploadService');
            ficheiro_path = 'storage:' + await MediaUploadService.guardarDocumento(req.file.buffer, String(reuniao.empresa_id), nome, req.file.mimetype || 'audio/webm');
        } catch (e: any) {
            // Sem a Supabase, fica no disco — melhor do que perder a parte.
            console.error('[Reuniões] Parte guardada no disco (Supabase falhou):', e?.message);
            const dir = path.join(__dirname, '..', '..', 'gravacoes_reunioes');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            ficheiro_path = path.join(dir, nome);
            fs.writeFileSync(ficheiro_path, req.file.buffer);
        }

        const { error } = await supabase.from('reunioes_gravacoes').insert({
            empresa_id: reuniao.empresa_id,
            reuniao_id: id,
            participante_nome: String(participante_nome || 'Participante').slice(0, 200),
            participante_tipo: tipo,
            ficheiro_path,
        });
        if (error) throw error;

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
}];
