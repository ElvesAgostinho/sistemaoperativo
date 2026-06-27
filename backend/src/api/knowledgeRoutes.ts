import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';

const router = Router();

const baseDir = path.join(os.homedir(), 'Desktop', 'SISTEMA OPERATIVO', 'Base_Conhecimento');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }
        cb(null, baseDir);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); // Mantém o nome original para ser mais legível pela IA
    }
});
const upload = multer({ storage });

router.get('/', (req, res) => {
    try {
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }
        const files = fs.readdirSync(baseDir).filter(f => f.endsWith('.txt') || f.endsWith('.md') || f.endsWith('.pdf'));
        const fileData = files.map(f => {
            const stat = fs.statSync(path.join(baseDir, f));
            return { name: f, size: stat.size, date: stat.mtime };
        });
        res.json({ success: true, files: fileData });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro enviado' });
    res.json({ success: true, message: 'Ficheiro guardado com sucesso!' });
});

router.delete('/:filename', (req, res) => {
    try {
        const filePath = path.join(baseDir, req.params.filename);
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

router.post('/email/send', async (req, res) => {
    const { para, assunto, corpo } = req.body;
    if (!para || !assunto || !corpo) {
        return res.status(400).json({ success: false, error: 'Campos para, assunto e corpo são obrigatórios.' });
    }
    try {
        const { EmailService } = require('../services/EmailService');
        const ok = await EmailService.enviarEmailPersonalizado(para, assunto, corpo);
        if (ok) {
            res.json({ success: true, message: `Email enviado para ${para}` });
        } else {
            res.status(500).json({ success: false, error: 'Falha ao enviar. Verifique as credenciais SMTP em Definições > Email.' });
        }
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/email/test', async (req, res) => {
    try {
        const { EmailService } = require('../services/EmailService');
        const result = await EmailService.testarConexao();
        res.json(result);
    } catch (err: any) {
        res.json({ ok: false, erro: err.message });
    }
});

export default router;
