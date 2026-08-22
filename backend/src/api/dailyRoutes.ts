import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { supabase } from '../lib/supabaseClient';
import { DailyService } from '../services/DailyService';
import { ReuniaoService } from '../services/ReuniaoService';

const router = Router();

/**
 * Webhook da Daily.co — ao contrário do padrão usado no webhook da Meta
 * (whatsappRoutes.ts, que só valida a assinatura SE o segredo estiver
 * configurado), este falha fechado: sem DAILY_WEBHOOK_SECRET configurado ou com
 * assinatura inválida, nunca processa o evento.
 */
router.post('/webhook', async (req: Request, res: Response) => {
    const signature = req.headers['x-webhook-signature'] as string;
    const timestamp = req.headers['x-webhook-timestamp'] as string;
    const rawBody = (req as any).rawBody as Buffer;

    if (!process.env.DAILY_WEBHOOK_SECRET) {
        console.error('[Daily webhook] DAILY_WEBHOOK_SECRET não configurado — a recusar webhook.');
        return res.status(500).send('Webhook not configured');
    }
    if (!signature || !timestamp || !rawBody || !DailyService.verificarAssinaturaWebhook(rawBody, timestamp, signature)) {
        console.error('[Daily webhook] Assinatura inválida ou em falta — a recusar webhook.');
        return res.status(401).send('Invalid signature');
    }

    // Responde já — o processamento (download + Whisper) pode demorar mais do
    // que o timeout de entrega da Daily, mesma lógica já usada nos webhooks do
    // WhatsApp (Evolution/Meta) neste ficheiro-irmão whatsappRoutes.ts.
    res.status(200).send('OK');

    try {
        const { type, payload } = req.body || {};
        switch (type) {
            case 'recording.ready-to-download':
                await handleRecordingReady(payload);
                break;
            case 'participant.joined':
                await handleParticipantJoined(payload);
                break;
            case 'participant.left':
                await handleParticipantLeft(payload);
                break;
            default:
                // Outros eventos (meeting.started, meeting.ended, etc.) — sem ação por agora.
                break;
        }
    } catch (err) {
        console.error('[Daily webhook] Erro no processamento assíncrono:', err);
    }
});

// NOTA: nomes exatos dos campos dentro de `payload` (room_name, recording_id,
// nome do participante) ainda não confirmados contra um payload real — só os
// nomes dos eventos e o esquema de assinatura foram confirmados via
// documentação. Ajustar os acessos abaixo assim que houver um teste real.
async function handleRecordingReady(payload: any) {
    const roomName = payload?.room_name;
    const recordingId = payload?.recording_id;
    if (!roomName || !recordingId) {
        console.error('[Daily webhook] recording.ready-to-download sem room_name/recording_id:', JSON.stringify(payload));
        return;
    }

    const { data: reuniao } = await supabase.from('reunioes').select('id, empresa_id').eq('daily_room_name', roomName).maybeSingle();
    if (!reuniao) {
        console.error(`[Daily webhook] Nenhuma reunião encontrada para a sala ${roomName}`);
        return;
    }

    await supabase.from('reunioes').update({ gravacao_estado: 'a_gravar', daily_recording_id: recordingId }).eq('id', reuniao.id);

    try {
        const downloadLink = await DailyService.obterLinkGravacao(recordingId);

        const tmpDir = path.join(__dirname, '..', '..', 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const filePath = path.join(tmpDir, `gravacao_${reuniao.id}.mp4`);

        const res = await fetch(downloadLink);
        if (!res.ok || !res.body) throw new Error(`Falha ao descarregar gravação: HTTP ${res.status}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(filePath, buffer);

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY não configurada — não é possível transcrever a gravação.');
        const openai = new OpenAI({ apiKey });

        const transcricao = await openai.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: 'whisper-1',
            language: 'pt'
        });

        fs.unlink(filePath, () => {});

        await supabase.from('reunioes').update({
            transcricao_raw: transcricao.text,
            gravacao_url: downloadLink,
            gravacao_estado: 'pronta',
            estado: 'Concluida'
        }).eq('id', reuniao.id);

        await ReuniaoService.gerarResumoIA(transcricao.text, reuniao.id, supabase);
        console.log(`[Daily webhook] Gravação e ata processadas para a reunião ${reuniao.id}`);
    } catch (err: any) {
        console.error(`[Daily webhook] Falha ao processar gravação da reunião ${reuniao.id}:`, err);
        await supabase.from('reunioes').update({ gravacao_estado: 'falhou' }).eq('id', reuniao.id);
    }
}

async function handleParticipantJoined(payload: any) {
    const roomName = payload?.room_name;
    if (!roomName) return;
    const { data: reuniao } = await supabase.from('reunioes').select('id, empresa_id').eq('daily_room_name', roomName).maybeSingle();
    if (!reuniao) return;

    await supabase.from('reunioes_participantes').insert({
        empresa_id: reuniao.empresa_id,
        reuniao_id: reuniao.id,
        nome: payload?.user_name || 'Participante',
        tipo: payload?.owner ? 'host' : 'convidado',
        daily_session_id: payload?.session_id || null,
        entrou_em: new Date().toISOString()
    });
}

async function handleParticipantLeft(payload: any) {
    const sessionId = payload?.session_id;
    if (!sessionId) return;
    await supabase.from('reunioes_participantes')
        .update({ saiu_em: new Date().toISOString() })
        .eq('daily_session_id', sessionId)
        .is('saiu_em', null);
}

export default router;
