import express from 'express';
import { listarReunioes, detalhesReuniao, criarReuniao, processarTranscricao, adicionarTarefa } from '../controllers/reunioesController';

const router = express.Router();

router.get('/', listarReunioes);
router.post('/', criarReuniao);
router.get('/:id', detalhesReuniao);
router.post('/:id/process-transcript', processarTranscricao);
router.post('/:id/tarefas', adicionarTarefa);

export default router;
