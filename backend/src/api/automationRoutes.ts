import { Router } from 'express';
import { getAutomations, createAutomation, processWebhook, deleteAutomation, generateAutomation, toggleAutomation, updateAutomation } from '../controllers/automationController';

import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', '..', '..', 'Media_Workflows');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// Gestão de Workflows
router.get('/', getAutomations);
router.post('/', createAutomation);
router.delete('/:id', deleteAutomation);
router.put('/:id/toggle', toggleAutomation);
router.put('/:id', updateAutomation); // Nova Rota

// Upload Multimédia
router.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro enviado' });
    const fullPath = path.join('C:\\Users\\DELL\\Desktop\\SISTEMA OPERATIVO\\Media_Workflows', req.file.filename);
    res.json({ success: true, filePath: fullPath });
});

// Construtor IA
router.post('/generate', generateAutomation);

// Webhook Listener Genérico
router.post('/webhook/:source', processWebhook);

export default router;
