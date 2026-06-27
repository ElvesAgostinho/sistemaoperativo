import { Router } from 'express';
import multer from 'multer';
import { uploadDocument, searchDocuments } from '../controllers/documentController';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Upload a new document (PDF, TXT, etc.)
router.post('/upload', upload.single('file'), uploadDocument);

// Search inside documents using local LLM
router.post('/search', searchDocuments);

export default router;
