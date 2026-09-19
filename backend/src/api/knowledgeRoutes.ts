import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import multer from 'multer';
import path from 'path';
import { getSupabase, supabase } from '../lib/supabaseClient';
import { KnowledgeBaseService } from '../services/KnowledgeBaseService';
import { MediaUploadService } from '../services/MediaUploadService';

const router = Router();

// Em memória: o ficheiro vai para o Supabase Storage e o texto é indexado a
// partir do próprio buffer. Antes era gravado numa pasta do servidor
// (~/Desktop/SISTEMA OPERATIVO/Base_Conhecimento) — um caminho da máquina de
// desenvolvimento que, no container, era recriado vazio a cada redeploy: os
// ficheiros desapareciam e ficavam trechos indexados sem ficheiro à vista.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// O multer/busboy lê o nome como latin1 por definição do multipart/form-data —
// nomes com acentos ("Currículo") chegam corrompidos ("CurrÃculo") sem isto.
// path.basename() descarta qualquer caminho embutido ("../outra_empresa/x.pdf").
const nomeSeguroDoUpload = (file: Express.Multer.File) =>
    path.basename(Buffer.from(file.originalname, 'latin1').toString('utf8'));

router.get('/', requireAuth, async (req, res) => {
    try {
        const empresaId = (req as any).user?.empresa_id;
        if (!empresaId) return res.status(400).json({ error: 'Empresa não encontrada.' });

        // A lista mostra o que está INDEXADO, porque é isso que a IA consegue
        // mesmo usar para responder — não o que por acaso esteja num disco.
        const indexados = await KnowledgeBaseService.listarIndexados(empresaId, getSupabase(req));
        const { data: objetos } = await supabase.storage.from('whatsapp-media').list(`conhecimento/${empresaId}`, { limit: 500 });
        const porNome = new Map((objetos || []).map((o: any) => [o.name, o]));

        const files = indexados.map(f => {
            const obj: any = porNome.get(f.nome);
            return {
                name: f.nome,
                chunks: f.chunks,
                size: obj?.metadata?.size ?? null,
                date: obj?.created_at ?? null,
                // Indexado mas sem ficheiro guardado: veio de antes desta mudança.
                // A IA continua a usá-lo (os trechos existem), só não há original
                // para descarregar.
                semOriginal: !obj
            };
        });
        res.json({ success: true, files });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro enviado' });

    const empresaId = (req as any).user?.empresa_id;
    if (!empresaId) return res.status(400).json({ error: 'Empresa não encontrada.' });
    const nomeFicheiro = nomeSeguroDoUpload(req.file);

    try {
        // Indexar primeiro: se o ficheiro não servir (formato não suportado,
        // PDF só com imagens), não vale a pena guardá-lo — a IA não o usaria.
        const supabase = getSupabase(req);
        const { chunks } = await KnowledgeBaseService.indexBuffer(empresaId, nomeFicheiro, req.file.buffer, supabase);

        if (chunks === 0) {
            return res.status(400).json({
                error: 'Não foi possível extrair texto deste ficheiro. Se for um PDF digitalizado (imagem), converta-o para texto primeiro.'
            });
        }

        await MediaUploadService.upload(req.file.buffer, nomeFicheiro, req.file.mimetype, 'conhecimento', empresaId, { nomeFixo: true });

        res.json({ success: true, message: `Ficheiro indexado em ${chunks} trecho(s) — a IA já o pode usar nas respostas.` });
    } catch (err: any) {
        console.error('[knowledgeRoutes] Erro ao indexar ficheiro:', err);
        res.status(500).json({ error: 'Falha ao processar o ficheiro: ' + err.message });
    }
});

router.delete('/:filename', requireAuth, async (req, res) => {
    try {
        const empresaId = (req as any).user?.empresa_id;
        if (!empresaId) return res.status(400).json({ error: 'Empresa não encontrada.' });
        const filenameSeguro = path.basename(req.params.filename);

        // Apagar = deixar de estar disponível para a IA. É isso que conta, e é
        // por isso que o sucesso depende dos trechos, não do ficheiro guardado.
        const supabaseUser = getSupabase(req);
        const antes = await KnowledgeBaseService.listarIndexados(empresaId, supabaseUser);
        if (!antes.some(f => f.nome === filenameSeguro)) {
            return res.status(404).json({ error: 'Ficheiro não encontrado.' });
        }

        await KnowledgeBaseService.deleteFileChunks(empresaId, filenameSeguro, supabaseUser);
        await supabase.storage.from('whatsapp-media')
            .remove([`conhecimento/${empresaId}/${filenameSeguro.replace(/[^a-zA-Z0-9._-]/g, '_')}`])
            .catch(() => { /* o original pode não existir; o que importa é já não ser usado */ });

        res.json({ success: true, message: 'Apagado — a IA deixa de usar este documento.' });
    } catch(err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/email/send', requireAuth, async (req, res) => {
    const { para, assunto, corpo } = req.body;
    const empresaId = (req as any).user?.empresa_id;
    if (!para || !assunto || !corpo) {
        return res.status(400).json({ success: false, error: 'Campos para, assunto e corpo são obrigatórios.' });
    }
    try {
        const { EmailService } = require('../services/EmailService');
        const ok = await EmailService.enviarEmailPersonalizado(para, assunto, corpo, empresaId);
        if (ok) {
            res.json({ success: true, message: `Email enviado para ${para}` });
        } else {
            res.status(500).json({ success: false, error: 'Falha ao enviar. Verifique as credenciais SMTP em Definições > Email.' });
        }
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/email/test', requireAuth, async (req, res) => {
    try {
        const empresaId = (req as any).user?.empresa_id;
        const { getSupabase } = require('../lib/supabaseClient');
        const userClient = getSupabase(req);
        const { EmailService } = require('../services/EmailService');
        const result = await EmailService.testarConexao(empresaId, userClient);
        res.json(result);
    } catch (err: any) {
        res.json({ ok: false, erro: err.message });
    }
});

export default router;
