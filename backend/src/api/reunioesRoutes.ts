import express from 'express';
import { listarReunioes, detalhesReuniao, criarReuniao, processarTranscricao, adicionarTarefa, apagarReuniao, gerarAtaPdf } from '../controllers/reunioesController';

const router = express.Router();

router.get('/', listarReunioes);
router.post('/', criarReuniao);
router.get('/:id', detalhesReuniao);
router.delete('/:id', apagarReuniao);
router.post('/:id/process-transcript', processarTranscricao);
router.post('/:id/tarefas', adicionarTarefa);
router.get('/:id/ata-pdf', gerarAtaPdf);

export default router;
