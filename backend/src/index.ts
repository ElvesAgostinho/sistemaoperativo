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

import authRoutes from './api/authRoutes';
import openclawRoutes from './api/openclawRoutes';
import agentWebhookRoutes from './api/agentWebhookRoutes';

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/openclaw', openclawRoutes); // Frontend -> VPS 1 -> VPS 2
app.use('/api/agent', agentWebhookRoutes); // VPS 2 -> VPS 1
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/reunioes', reunioesRoutes);
app.use('/api/afiliados', afiliadosRoutes);
app.use('/api/recrutamento', recrutamentoRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/email', emailRoutes);

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
