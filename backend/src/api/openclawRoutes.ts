import { Router } from 'express';

const router = Router();

// As rotas antigas do OpenClaw foram descontinuadas,
// visto que o frontend usa a Evolution API para o QR Code
// e o backend usa WebSockets (OpenClawService) para falar com a IA.

export default router;
