import { Router } from 'express';
import { chat, executeAction, getConversations, getConversationMessages } from '../controllers/aiController';

const router = Router();

router.post('/chat', chat);
router.post('/execute-action', executeAction);
router.get('/conversas', getConversations);
router.get('/conversas/:id/mensagens', getConversationMessages);

export default router;
