import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getSupabase } from '../lib/supabaseClient';
import { KnowledgeBaseService } from '../services/KnowledgeBaseService';

const router = Router();

const baseDir = path.join(os.homedir(), 'Desktop', 'SISTEMA OPERATIVO', 'Base_Conhecimento');

const getTenantDir = (req: any) => {
    const empresaId = req.user?.empresa_id;
    if (!empresaId) throw new Error('empresa_id não encontrado');
    return path.join(baseDir, String(empresaId));
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        try {
            const tenantDir = getTenantDir(req);
            if (!fs.existsSync(tenantDir)) {
                fs.mkdirSync(tenantDir, { recursive: true });
            }
            cb(null, tenantDir);
        } catch (error: any) {
            cb(error, '');
        }
    },
    filename: (req, file, cb) => {
        // O multer/busboy interpreta o nome do ficheiro como latin1 por definição do
        // multipart/form-data — nomes com acentos (ex: "Currículo") chegam corrompidos
        // ("CurrÃculo") se não forem reconvertidos para utf8 aqui.
        const nomeCorrigido = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, nomeCorrigido);
    }
});
const upload = multer({ storage });

router.get('/', requireAuth, (req, res) => {
    try {
        const tenantDir = getTenantDir(req);
        if (!fs.existsSync(tenantDir)) {
            fs.mkdirSync(tenantDir, { recursive: true });
        }
        const files = fs.readdirSync(tenantDir).filter(f => f.endsWith('.txt') || f.endsWith('.md') || f.endsWith('.pdf'));
        const fileData = files.map(f => {
            const stat = fs.statSync(path.join(tenantDir, f));
            return { name: f, size: stat.size, date: stat.mtime };
        });
        res.json({ success: true, files: fileData });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro enviado' });

    const empresaId = (req as any).user?.empresa_id;
    let message = 'Ficheiro guardado com sucesso!';

    try {
        const supabase = getSupabase(req);
        const { chunks } = await KnowledgeBaseService.indexFile(empresaId, req.file.filename, req.file.path, supabase);
        message = `Ficheiro guardado e indexado (${chunks} trecho(s)) — já disponível para a IA usar nas respostas.`;
    } catch (err: any) {
        console.error('[knowledgeRoutes] Erro ao indexar ficheiro para RAG:', err);
        message = 'Ficheiro guardado, mas a indexação para a IA falhou (' + err.message + '). A IA pode não conseguir usar este documento ainda.';
    }

    res.json({ success: true, message });
});

router.delete('/:filename', requireAuth, async (req, res) => {
    try {
        const tenantDir = getTenantDir(req);
        const filePath = path.join(tenantDir, req.params.filename);

        const empresaId = (req as any).user?.empresa_id;
        const supabase = getSupabase(req);
        await KnowledgeBaseService.deleteFileChunks(empresaId, req.params.filename, supabase).catch(err => {
            console.error('[knowledgeRoutes] Erro ao apagar chunks indexados:', err);
        });

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({ success: true, message: 'Apagado com sucesso' });
        } else {
            res.status(404).json({ error: 'Ficheiro não encontrado' });
        }
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
