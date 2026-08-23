import { Router } from 'express';

const router = Router();

// Router vazio, mantido só para não quebrar a montagem em index.ts. O
// OpenClaw foi removido do VPS (ver AIGatewayService.ts) — as respostas de
// IA passam agora por um gateway compatível com a API da OpenAI (LiteLLM),
// chamado diretamente por HTTP, sem nenhuma rota própria neste backend.

export default router;
