import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import documentRoutes from './api/documentRoutes';
import systemRoutes from './api/systemRoutes';
import aiRoutes from './api/aiRoutes';
import hrRoutes from './api/hrRoutes';
import crmRoutes from './api/crmRoutes';
import dataRoutes from './api/dataRoutes';
import automationRoutes from './api/automationRoutes';
import whatsappRoutes from './api/whatsappRoutes';
import knowledgeRoutes from './api/knowledgeRoutes';
import settingsRoutes from './api/settingsRoutes';
import userRoutes from './api/userRoutes';
import superadminRoutes from './api/superadminRoutes';
import reunioesRoutes from './api/reunioesRoutes';
import afiliadosRoutes from './api/afiliadosRoutes';
import recrutamentoRoutes from './api/recrutamentoRoutes';
import accountingRoutes from './api/accountingRoutes';
import emailRoutes from './api/emailRoutes';
import publicRoutes from './api/publicRoutes';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json({ 
    limit: '50mb',
    verify: (req: any, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
import path from 'path';
app.use('/tmp', express.static(path.join(__dirname, '..', 'tmp')));

import { requireAuth } from './middleware/authMiddleware';

import authRoutes from './api/authRoutes';
import openclawRoutes from './api/openclawRoutes';
import agentWebhookRoutes from './api/agentWebhookRoutes';

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', requireAuth, documentRoutes);
app.use('/api/system', requireAuth, systemRoutes);
app.use('/api/ai', requireAuth, aiRoutes);
app.use('/api/hr', requireAuth, hrRoutes);
app.use('/api/crm', requireAuth, crmRoutes);
app.use('/api/data', requireAuth, dataRoutes);
app.use('/api/automation', requireAuth, automationRoutes);
app.use('/api/whatsapp', whatsappRoutes); // WhatsApp internal routes handle auth per endpoint
app.use('/api/openclaw', openclawRoutes); // Frontend -> VPS 1 -> VPS 2
app.use('/api/agent', agentWebhookRoutes); // VPS 2 -> VPS 1
app.use('/api/knowledge', requireAuth, knowledgeRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/users', requireAuth, userRoutes);
app.use('/api/superadmin', requireAuth, superadminRoutes);
app.use('/api/reunioes', requireAuth, reunioesRoutes);
app.use('/api/afiliados', requireAuth, afiliadosRoutes);
app.use('/api/recrutamento', requireAuth, recrutamentoRoutes);
app.use('/api/accounting', requireAuth, accountingRoutes);
app.use('/api/email', requireAuth, emailRoutes);
app.use('/api/public', publicRoutes);

// Basic health check route
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'BusinessOS API' });
});

// Root route
app.get('/', (req, res) => {
  res.send('BusinessOS API Backend is running successfully!');
});

// Start server
app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
