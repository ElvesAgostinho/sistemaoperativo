import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import OpenAI from 'openai';
import { getSupabase } from '../lib/supabaseClient';

const router = Router();

// Configurar Upload de Currículos
const uploadDir = path.join(__dirname, '..', '..', '..', 'Curriculos');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
    }
});
const upload = multer({ storage });

// OpenAI Setup
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// === VAGAS ===

router.get('/vagas', async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase(req);
        const { data: vagas, error } = await supabase.from('vagas').select('*').order('criado_em', { ascending: false });
        if (error) throw error;
        res.json({ success: true, vagas });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/vagas', async (req: Request, res: Response) => {
    try {
        const { titulo, criterios } = req.body;
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        const { data: info, error } = await supabase.from('vagas').insert({
            empresa_id, titulo, criterios, estado: 'Aberta'
        }).select('id').single();
        if (error) throw error;
        res.json({ success: true, id: info.id });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// === CANDIDATURAS ===

router.get('/candidaturas', async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase(req);
        const { data, error } = await supabase.from('candidaturas').select('*, vagas(titulo)').order('criado_em', { ascending: false });
        if (error) throw error;
        const candidaturas = data.map((c: any) => ({ ...c, vaga_titulo: c.vagas?.titulo }));
        res.json({ success: true, candidaturas });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoint principal para Triagem Inteligente
router.post('/upload', upload.single('cv'), async (req: Request, res: Response) => {
    try {
        const { nome, email, telefone, vaga_id } = req.body;
        const file = req.file;
        
        if (!file || !vaga_id) {
            return res.status(400).json({ error: 'Ficheiro CV e Vaga são obrigatórios.' });
        }

        // 1. Extrair Texto do PDF
        const dataBuffer = fs.readFileSync(file.path);
        const pdfData = await pdfParse(dataBuffer);
        const cvText = pdfData.text;

        // 2. Obter Critérios da Vaga
        const supabase = getSupabase(req);
        const { data: vaga, error: vErr } = await supabase.from('vagas').select('titulo, criterios').eq('id', vaga_id).single();
        if (vErr || !vaga) return res.status(404).json({ error: 'Vaga não encontrada.' });

        // 3. Avaliação IA
        const systemPrompt = `
        És um sistema de Triagem de RH altamente minucioso. 
        Vais receber o CV de um candidato e os critérios definidos para a Vaga de "${vaga.titulo}".
        Avalia o CV puramente com base nestes critérios.
        Retorna UM JSON ESTRITAMENTE com a seguinte estrutura:
        {
            "score": [0 a 100],
            "pontos_fortes": ["ponto 1", "ponto 2"],
            "pontos_fracos": ["falta X", "não menciona Y"]
        }
        `;

        const userPrompt = `
        CRITÉRIOS DA VAGA:
        ${vaga.criterios}

        TEXTO EXTRAÍDO DO CV:
        ${cvText}
        `;

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.3
        });

        const aiResultRaw = response.choices[0]?.message?.content || '{}';
        const aiResult = JSON.parse(aiResultRaw);

        // 4. Gravar na BD
        const empresa_id = (req as any).user?.empresa_id;
        const { data: info, error: insErr } = await supabase.from('candidaturas').insert({
            empresa_id,
            vaga_id,
            nome,
            email,
            telefone,
            cv_path: file.path,
            cv_texto: cvText.substring(0, 5000),
            ai_score: aiResult.score || 0,
            ai_parecer: JSON.stringify(aiResult),
            estado: 'Pendente'
        }).select('id').single();
        
        if (insErr) throw insErr;
        res.json({ success: true, id: info.id, analise: aiResult });

    } catch (error: any) {
        console.error('Erro na triagem:', error);
        res.status(500).json({ error: 'Erro ao processar a candidatura: ' + error.message });
    }
});

// Decisão e Envio de Feedback Dinâmico
router.post('/:id/decisao', async (req: Request, res: Response) => {
    try {
        const { estado } = req.body; // 'Aprovado' ou 'Rejeitado'
        const candidaturaId = req.params.id;

        const supabase = getSupabase(req);
        const { data: c, error: cErr } = await supabase.from('candidaturas').select('*, vagas(titulo, criterios)').eq('id', candidaturaId).single();
        if (cErr || !c) return res.status(404).json({ error: 'Candidatura não encontrada.' });
        
        const candidatura = {
            ...c,
            vaga_titulo: c.vagas?.titulo,
            criterios: c.vagas?.criterios
        };

        // 1. Atualizar Estado
        await supabase.from('candidaturas').update({ estado }).eq('id', candidaturaId);

        // 2. Gerar Mensagem Empática com IA
        const systemPrompt = `
        És um(a) Diretor(a) de Recursos Humanos a redigir uma mensagem de WhatsApp/Email para dar feedback a um candidato.
        Tons: Empático, profissional, acolhedor.
        A decisão foi: ${estado.toUpperCase()}.
        A Vaga era para: ${candidatura.vaga_titulo}.
        O nome do candidato é: ${candidatura.nome}.
        A avaliação da IA detetou isto (usa se quiseres fundamentar a rejeição levemente): ${candidatura.ai_parecer}
        
        Gera APENAS o texto da mensagem final. Não uses variáveis por preencher.
        Se for APROVADO: marca uma entrevista imaginária brevemente.
        Se for REJEITADO: sê muito educado, agradece, diz que não encaixa perfeitamente e deseja sucesso.
        `;

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: systemPrompt }],
            temperature: 0.6
        });

        const feedbackMsg = response.choices[0]?.message?.content || 'Feedback gerado com sucesso.';

        // (No futuro ligar ao disparador de WhatsApp/Email)
        console.log(`[SIMULAÇÃO DE ENVIO] Para: ${candidatura.telefone || candidatura.email}\nMensagem:\n${feedbackMsg}`);

        // Integração direta com o motor WhatsApp (Autopilot)
        if (candidatura.telefone) {
            try {
                // Tentar encontrar uma conversa existente
                const { data: conv } = await getSupabase(req).from('wa_conversations').select('id').eq('phone_number', candidatura.telefone).single();
                if (conv) {
                    await getSupabase(req).from('wa_messages').insert({
                        conversation_id: conv.id,
                        direction: 'outbound',
                        content: feedbackMsg,
                        status: 'sending' // Será processado pelo WhatsAppChannelManager
                    });
                    // Simular entrega imediata para MVP
                    await getSupabase(req).from('wa_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id);
                }
            } catch(err) {
                console.error("Aviso: Falha ao enviar WhatsApp de recrutamento. O cliente pode não existir no sistema de chat.", err);
            }
        }

        res.json({ success: true, feedbackGerado: feedbackMsg });
    } catch (error: any) {
        console.error('Erro na decisão:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
