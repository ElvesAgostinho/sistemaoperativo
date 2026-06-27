import { Router } from 'express';
import { getLocalApps, launchApp, getLocalDocuments } from '../controllers/systemController';

const router = Router();

router.get('/apps', getLocalApps);
router.post('/launch', launchApp);
router.get('/documents', getLocalDocuments);

export default router;
