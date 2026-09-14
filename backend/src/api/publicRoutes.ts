import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import { supabase } from '../lib/supabaseClient';
import { getReuniaoPublica, adicionarFragmentoTranscricao, entrarReuniaoPublica, receberGravacao } from '../controllers/reunioesPublicController';
import { AgendamentoService } from '../services/AgendamentoService';
import { RecrutamentoService } from '../services/RecrutamentoService';

const router = Router();
const uploadCv = multer({ dest: 'tmp/', limits: { fileSize: 10 * 1024 * 1024 } });

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getLogoEmpresa(empresa_id: string): Promise<string | null> {
    const { data } = await supabase.from('configuracoes').select('valor').eq('empresa_id', empresa_id).eq('chave', 'COMPANY_LOGO_BASE64').maybeSingle();
    return data?.valor || null;
}

// ---------- Agendamento: página pública de marcação do cliente ----------
router.get('/agendamento/:empresa_id/info', async (req: Request, res: Response) => {
    try {
        const info = await AgendamentoService.getInfoPublica(req.params.empresa_id);
        res.json({ success: true, ...info });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/agendamento/:empresa_id/disponibilidade', async (req: Request, res: Response) => {
    try {
        const { servico_id, data, profissional_id } = req.query;
        const resultado = await AgendamentoService.getDisponibilidade(
            req.params.empresa_id, Number(servico_id), String(data), profissional_id ? Number(profissional_id) : undefined
        );
        res.json({ success: true, ...resultado });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/agendamento/:empresa_id/marcar', async (req: Request, res: Response) => {
    try {
        const id = await AgendamentoService.criarAgendamento(req.params.empresa_id, req.body, 'cliente');
        res.json({ success: true, id });
    } catch (err: any) { res.status(400).json({ success: false, error: err.message }); }
});

// Rotas públicas: página de reunião para convidados externos (sem sessão logada)
router.get('/reuniao/:id', getReuniaoPublica);
router.post('/reuniao/:id/entrar', entrarReuniaoPublica);
router.post('/reuniao/:id/fragmento', adicionarFragmentoTranscricao);
router.post('/reuniao/:id/gravacao', ...receberGravacao);

// Rota pública: Obter todas as vagas abertas de uma empresa específica
router.get('/vagas/:empresa_id', async (req: Request, res: Response) => {
    try {
        const { empresa_id } = req.params;
        if (!UUID_REGEX.test(empresa_id)) {
            return res.status(400).json({ success: false, error: 'Empresa inválida.' });
        }
        const { data, error } = await supabase
            .from('vagas')
            .select('*')
            .eq('empresa_id', empresa_id)
            .eq('estado', 'Aberta')
            .order('criado_em', { ascending: false });

        if (error) throw error;

        const [{ data: empresa }, logoBase64] = await Promise.all([
            supabase.from('empresas').select('nome').eq('id', empresa_id).single(),
            getLogoEmpresa(empresa_id)
        ]);

        res.json({ success: true, vagas: data, empresaNome: empresa?.nome, logoBase64 });
    } catch (err: any) {
        console.error('Erro ao listar vagas públicas:', err.message);
        res.status(500).json({ success: false, error: 'Não foi possível carregar as vagas.' });
    }
});

// Rota pública: Obter detalhes de uma vaga específica
router.get('/vaga/:vaga_id', async (req: Request, res: Response) => {
    try {
        const { vaga_id } = req.params;
        if (!UUID_REGEX.test(vaga_id)) {
            return res.status(404).json({ success: false, error: 'Vaga não encontrada.' });
        }
        const { data, error } = await supabase
            .from('vagas')
            .select('*, empresas(nome)')
            .eq('id', vaga_id)
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ success: false, error: 'Vaga não encontrada.' });
        }
        const logoBase64 = data?.empresa_id ? await getLogoEmpresa(data.empresa_id) : null;
        res.json({ success: true, vaga: data, logoBase64 });
    } catch (err: any) {
        console.error('Erro ao obter vaga pública:', err.message);
        res.status(500).json({ success: false, error: 'Não foi possível carregar a vaga.' });
    }
});

// Rota pública: Submeter uma candidatura — recebe o CV a sério (multipart) e
// avalia-o com o mesmo motor de IA usado no upload interno do RH (nunca mais
// um score Math.random()).
router.post('/candidatar', uploadCv.single('cv'), async (req: Request, res: Response) => {
    try {
        const { vaga_id, empresa_id, nome, email, telefone, linkedin_url } = req.body;
        const file = req.file;

        if (!vaga_id || !empresa_id || !nome || !email || !file) {
            return res.status(400).json({ error: 'Dados obrigatórios em falta (incluindo o currículo).' });
        }

        const { data: vaga, error: vErr } = await supabase.from('vagas').select('titulo, criterios, empresa_id').eq('id', vaga_id).single();
        if (vErr || !vaga || String(vaga.empresa_id) !== String(empresa_id)) {
            return res.status(404).json({ error: 'Vaga não encontrada.' });
        }

        const buffer = fs.readFileSync(file.path);
        const pdfData = await pdfParse(buffer).catch(() => ({ text: '' }));
        const cvText = pdfData.text || '';

        const [parecer, cvUrl] = await Promise.all([
            RecrutamentoService.avaliarCandidato(cvText, vaga.titulo, vaga.criterios),
            RecrutamentoService.uploadCvParaStorage(buffer, file.originalname, file.mimetype, empresa_id)
        ]);
        fs.unlink(file.path, () => {});

        const { data, error } = await supabase
            .from('candidaturas')
            .insert({
                vaga_id, empresa_id, nome, email, telefone: telefone || null, linkedin_url: linkedin_url || null,
                cv_url: cvUrl, cv_texto: cvText.substring(0, 5000),
                ai_score: parecer.score, ai_parecer: JSON.stringify(parecer),
                etapa: 'Triagem', origem: 'Portal Público'
            })
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, candidatura: data, message: 'Candidatura enviada com sucesso!' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
