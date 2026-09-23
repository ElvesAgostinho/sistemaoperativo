import { Router } from 'express';
import { getAutomations, createAutomation, processWebhook, deleteAutomation, toggleAutomation, updateAutomation, simulateAutomation } from '../controllers/automationController';

import multer from 'multer';
import { MediaUploadService } from '../services/MediaUploadService';

const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Gestão de Workflows
router.get('/', getAutomations);
router.post('/', createAutomation);
router.delete('/:id', deleteAutomation);
router.put('/:id/toggle', toggleAutomation);
router.put('/:id', updateAutomation); // Nova Rota
router.post('/:id/simular', simulateAutomation);

// Upload Multimédia — vai para o Supabase Storage e o nó guarda o link.
// (Antes era gravado num caminho de Windows fixo no código, que não existe
// no servidor Linux de produção: os nós de imagem/áudio/vídeo falhavam
// sempre com "ficheiro não encontrado".)
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro enviado' });
        const empresaId = (req as any).user?.empresa_id;
        const resultado = await MediaUploadService.upload(
            req.file.buffer, req.file.originalname, req.file.mimetype, 'workflows', empresaId
        );
        res.json({ success: true, filePath: resultado.url, tipo: resultado.tipo });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Webhook Listener Genérico
router.post('/webhook/:source', processWebhook);

export default router;
