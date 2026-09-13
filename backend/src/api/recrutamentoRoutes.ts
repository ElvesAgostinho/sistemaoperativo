import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import { getSupabase } from '../lib/supabaseClient';
import { RecrutamentoService } from '../services/RecrutamentoService';
import { ReuniaoService } from '../services/ReuniaoService';
import { EmailService } from '../services/EmailService';

const router = Router();

// Ficheiro temporário só até ser lido e enviado para o Supabase Storage — não
// fica em disco local (que não sobrevive a um redeploy do container).
const upload = multer({ dest: 'tmp/', limits: { fileSize: 10 * 1024 * 1024 } });

const ETAPAS = ['Novo', 'Triagem', 'Entrevista', 'Oferta', 'Contratado', 'Rejeitado'];

// === VAGAS ===

router.get('/vagas', async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { data: vagas, error } = await supabase
            .from('vagas')
            .select('*, candidaturas(count)')
            .eq('empresa_id', empresa_id)
            .order('criado_em', { ascending: false });
        if (error) throw error;
        const comContagem = (vagas || []).map((v: any) => ({
            ...v,
            total_candidaturas: v.candidaturas?.[0]?.count || 0,
            candidaturas: undefined,
            linkPublico: `${process.env.FRONTEND_PUBLIC_URL || ''}/carreiras/${empresa_id}/vaga/${v.id}`
        }));
        res.json({ success: true, vagas: comContagem });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/vagas', async (req: Request, res: Response) => {
    try {
        const { titulo, departamento, tipo, localizacao, descricao, criterios, salario_min, salario_max, numero_vagas } = req.body;
        if (!titulo || !criterios) return res.status(400).json({ error: 'Título e critérios são obrigatórios.' });

        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { data: info, error } = await supabase.from('vagas').insert({
            empresa_id, titulo, departamento: departamento || null, tipo: tipo || 'Tempo Inteiro',
            localizacao: localizacao || null, descricao: descricao || null, criterios,
            salario_min: salario_min || null, salario_max: salario_max || null,
            numero_vagas: numero_vagas || 1, estado: 'Aberta'
        }).select('id').single();
        if (error) throw error;

        const linkPublico = `${process.env.FRONTEND_PUBLIC_URL || ''}/carreiras/${empresa_id}/vaga/${info.id}`;
        res.json({ success: true, id: info.id, linkPublico });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/vagas/:id', async (req: Request, res: Response) => {
    try {
        const { titulo, departamento, tipo, localizacao, descricao, criterios, salario_min, salario_max, numero_vagas } = req.body;
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { error } = await supabase.from('vagas').update({
            titulo, departamento: departamento || null, tipo, localizacao: localizacao || null,
            descricao: descricao || null, criterios, salario_min: salario_min || null,
            salario_max: salario_max || null, numero_vagas: numero_vagas || 1,
            atualizado_em: new Date().toISOString()
        }).eq('id', req.params.id).eq('empresa_id', empresa_id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/vagas/:id/estado', async (req: Request, res: Response) => {
    try {
        const { estado } = req.body;
        if (!['Aberta', 'Pausada', 'Fechada'].includes(estado)) return res.status(400).json({ error: 'Estado inválido.' });
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { error } = await supabase.from('vagas').update({ estado, atualizado_em: new Date().toISOString() }).eq('id', req.params.id).eq('empresa_id', empresa_id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// === CANDIDATURAS ===

router.get('/candidaturas', async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        let query = supabase.from('candidaturas').select('*, vagas(titulo)').eq('empresa_id', empresa_id);
        if (req.query.vaga_id) query = query.eq('vaga_id', req.query.vaga_id);
        if (req.query.etapa) query = query.eq('etapa', req.query.etapa);
        const { data, error } = await query.order('criado_em', { ascending: false });
        if (error) throw error;
        const candidaturas = data.map((c: any) => ({ ...c, vaga_titulo: c.vagas?.titulo }));
        res.json({ success: true, candidaturas });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoint principal para Triagem Inteligente (upload manual pelo RH)
router.post('/upload', upload.single('cv'), async (req: Request, res: Response) => {
    try {
        const { nome, email, telefone, vaga_id, linkedin_url } = req.body;
        const file = req.file;

        if (!file || !vaga_id) {
            return res.status(400).json({ error: 'Ficheiro CV e Vaga são obrigatórios.' });
        }

        const empresa_id = (req as any).user?.empresa_id;
        const supabase = getSupabase(req);
        const { data: vaga, error: vErr } = await supabase.from('vagas').select('titulo, criterios').eq('id', vaga_id).eq('empresa_id', empresa_id).single();
        if (vErr || !vaga) return res.status(404).json({ error: 'Vaga não encontrada.' });

        const buffer = fs.readFileSync(file.path);
        const pdfData = await pdfParse(buffer);
        const cvText = pdfData.text;

        const [parecer, cvUrl] = await Promise.all([
            RecrutamentoService.avaliarCandidato(cvText, vaga.titulo, vaga.criterios),
            RecrutamentoService.uploadCvParaStorage(buffer, file.originalname, file.mimetype, empresa_id)
        ]);
        fs.unlink(file.path, () => {});

        const { data: info, error: insErr } = await supabase.from('candidaturas').insert({
            empresa_id, vaga_id, nome, email: email || null, telefone: telefone || null, linkedin_url: linkedin_url || null,
            cv_url: cvUrl, cv_texto: cvText.substring(0, 5000),
            ai_score: parecer.score, ai_parecer: JSON.stringify(parecer),
            etapa: 'Triagem', origem: 'Upload Manual'
        }).select('id').single();

        if (insErr) throw insErr;
        res.json({ success: true, id: info.id, analise: parecer });
    } catch (error: any) {
        console.error('Erro na triagem:', error);
        res.status(500).json({ error: 'Erro ao processar a candidatura: ' + error.message });
    }
});

// Avançar/mover a candidatura no pipeline. Ao entrar em "Oferta" ou "Rejeitado",
// gera e envia automaticamente uma mensagem de feedback por email (a mesma que
// antes era gerada por um endpoint /decisao à parte).
router.put('/candidaturas/:id/etapa', async (req: Request, res: Response) => {
    try {
        const { etapa, motivo_rejeicao } = req.body;
        if (!ETAPAS.includes(etapa)) return res.status(400).json({ error: 'Etapa inválida.' });

        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { data: c, error: cErr } = await supabase.from('candidaturas').select('*, vagas(titulo)').eq('id', req.params.id).eq('empresa_id', empresa_id).single();
        if (cErr || !c) return res.status(404).json({ error: 'Candidatura não encontrada.' });

        await supabase.from('candidaturas').update({
            etapa, motivo_rejeicao: etapa === 'Rejeitado' ? (motivo_rejeicao || null) : null,
            atualizado_em: new Date().toISOString()
        }).eq('id', req.params.id);

        let feedbackGerado: string | null = null;
        if (etapa === 'Oferta' || etapa === 'Rejeitado') {
            let parecer;
            try { parecer = JSON.parse(c.ai_parecer || '{}'); } catch { parecer = undefined; }
            feedbackGerado = await RecrutamentoService.gerarMensagemDecisao(etapa, c.nome, c.vagas?.titulo || '', parecer);

            if (c.email) {
                await EmailService.enviarEmailPersonalizado(
                    c.email,
                    etapa === 'Oferta' ? `Boas notícias sobre a sua candidatura — ${c.vagas?.titulo}` : `Resultado da sua candidatura — ${c.vagas?.titulo}`,
                    feedbackGerado.replace(/\n/g, '<br>'),
                    empresa_id
                );
            }
            // Canal adicional (bónus) se já existir uma conversa de WhatsApp com este candidato.
            if (c.telefone) {
                try {
                    // Tem de ser uma conversa desta empresa — sem o filtro por
                    // empresa_id, um número de telefone que coincidisse com uma
                    // conversa de OUTRA empresa recebia esta mensagem de feedback
                    // de recrutamento por engano.
                    const { data: conv } = await supabase.from('wa_conversations').select('id').eq('phone_number', c.telefone).eq('empresa_id', empresa_id).single();
                    if (conv) {
                        await supabase.from('wa_messages').insert({ conversation_id: conv.id, direction: 'outbound', content: feedbackGerado, status: 'sending' });
                        await supabase.from('wa_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id);
                    }
                } catch { /* candidato pode não ter conversa de WhatsApp — não bloqueia */ }
            }
        }

        res.json({ success: true, feedbackGerado });
    } catch (error: any) {
        console.error('Erro ao avançar etapa:', error);
        res.status(500).json({ error: error.message });
    }
});

// Agenda uma entrevista REAL (reunião com sala Jitsi), em vez de a IA inventar
// uma entrevista imaginária no texto de feedback como acontecia antes.
router.post('/candidaturas/:id/agendar-entrevista', async (req: Request, res: Response) => {
    try {
        const { data_hora } = req.body;
        if (!data_hora) return res.status(400).json({ error: 'Data e hora são obrigatórias.' });

        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { data: c, error: cErr } = await supabase.from('candidaturas').select('*, vagas(titulo)').eq('id', req.params.id).eq('empresa_id', empresa_id).single();
        if (cErr || !c) return res.status(404).json({ error: 'Candidatura não encontrada.' });

        const { id: reuniaoId, linkJitsi } = await ReuniaoService.criarReuniaoRegistro({
            empresa_id, titulo: `Entrevista — ${c.vagas?.titulo || 'Vaga'} — ${c.nome}`,
            data_hora, emails_convidados: c.email || ''
        }, supabase);

        await supabase.from('candidaturas').update({ etapa: 'Entrevista', reuniao_id: reuniaoId, atualizado_em: new Date().toISOString() }).eq('id', req.params.id);

        if (c.email) {
            await EmailService.enviarEmailPersonalizado(
                c.email,
                `Entrevista marcada — ${c.vagas?.titulo || ''}`,
                `Olá ${c.nome},<br><br>A sua entrevista para a vaga de <strong>${c.vagas?.titulo || ''}</strong> foi marcada para <strong>${new Date(data_hora).toLocaleString('pt-PT')}</strong>.<br><br>Link da videochamada: <a href="${linkJitsi}">${linkJitsi}</a><br><br>Até breve!`,
                empresa_id
            );
        }

        res.json({ success: true, reuniaoId, linkJitsi });
    } catch (error: any) {
        console.error('Erro ao agendar entrevista:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/candidaturas/:id/notas', async (req: Request, res: Response) => {
    try {
        const { nota } = req.body;
        if (!nota || !String(nota).trim()) return res.status(400).json({ error: 'Nota vazia.' });

        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { data: c, error: cErr } = await supabase.from('candidaturas').select('notas').eq('id', req.params.id).eq('empresa_id', empresa_id).single();
        if (cErr || !c) return res.status(404).json({ error: 'Candidatura não encontrada.' });

        const linha = `[${new Date().toLocaleString('pt-PT')}] ${String(nota).trim()}`;
        const notasAtualizadas = c.notas ? `${c.notas}\n${linha}` : linha;

        const { error } = await supabase.from('candidaturas').update({ notas: notasAtualizadas, atualizado_em: new Date().toISOString() }).eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, notas: notasAtualizadas });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
