import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import documentRoutes from './api/documentRoutes';
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
import financeiroRoutes from './api/financeiroRoutes';
import agendamentoRoutes from './api/agendamentoRoutes';
import campanhasRoutes from './api/campanhasRoutes';
import emailRoutes from './api/emailRoutes';
import publicRoutes from './api/publicRoutes';
import { EmailSyncService } from './services/EmailSyncService';
import { CampaignService } from './services/CampaignService';
import documentosRoutes from './api/documentosRoutes';
import { DocumentosService } from './services/DocumentosService';
import { requireAuth } from './middleware/authMiddleware';
import path from 'path';

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
// Documentos gerados (recibos de vencimento, declarações, propostas, atas)
// ficam aqui. Não dá para exigir sessão (requireAuth) nesta pasta porque o
// frontend abre estes ficheiros com window.open() direto, sem cabeçalho de
// autenticação — faria com que ninguém, nem os utilizadores legítimos,
// conseguisse abrir o botão "Descarregar". Em vez disso, cada nome de
// ficheiro passou a incluir um componente aleatório imprevisível (ver
// PdfService.ts) — antes eram nomes adivinháveis (ex: nome do funcionário +
// mês, para um recibo de salário), o que permitia a qualquer pessoa na
// internet descarregar documentos de qualquer empresa só por adivinhar o
// nome.
app.use('/tmp', express.static(path.join(__dirname, '..', 'tmp')));

import authRoutes from './api/authRoutes';
import agentWebhookRoutes from './api/agentWebhookRoutes';

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', requireAuth, documentRoutes);
app.use('/api/ai', requireAuth, aiRoutes);
app.use('/api/hr', requireAuth, hrRoutes);
app.use('/api/crm', requireAuth, crmRoutes);
app.use('/api/data', requireAuth, dataRoutes);
app.use('/api/automation', requireAuth, automationRoutes);
app.use('/api/whatsapp', whatsappRoutes); // WhatsApp internal routes handle auth per endpoint
app.use('/api/agent', agentWebhookRoutes); // VPS 2 -> VPS 1
app.use('/api/knowledge', requireAuth, knowledgeRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/users', requireAuth, userRoutes);
app.use('/api/superadmin', requireAuth, superadminRoutes);
app.use('/api/reunioes', requireAuth, reunioesRoutes);
app.use('/api/afiliados', requireAuth, afiliadosRoutes);
app.use('/api/recrutamento', requireAuth, recrutamentoRoutes);
app.use('/api/accounting', requireAuth, accountingRoutes);
app.use('/api/financeiro', requireAuth, financeiroRoutes);
app.use('/api/agendamento', requireAuth, agendamentoRoutes);
app.use('/api/campanhas', requireAuth, campanhasRoutes);
app.use('/api/email', requireAuth, emailRoutes);
app.use('/api/documentos', documentosRoutes); // valida sessao e licenca do modulo internamente
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
  
  // Iniciar sincronização de emails (a cada 3 minutos)
  setInterval(() => {
    EmailSyncService.syncAll().catch(console.error);
  }, 3 * 60 * 1000);

  // Processar fila de campanhas de WhatsApp (a cada 20 segundos) — envia em
  // lotes pequenos para respeitar a velocidade configurada por campanha,
  // em vez de disparar tudo de uma vez.
  setInterval(() => {
    CampaignService.processarFila().catch(console.error);
  }, 20 * 1000);

  // Documentos que ficaram a meio (ex: o servidor reiniciou durante a leitura
  // por IA) retomam sozinhos; o intervalo apanha tambem os que entram por
  // email fora de um pedido HTTP.
  DocumentosService.processarFila().catch(console.error);
  setInterval(() => {
    DocumentosService.processarFila().catch(console.error);
  }, 30 * 1000);

  // Documentos ativos cuja validade passou caducam sozinhos (ciclo -> EXPIRED).
  const { DocumentosGovernoService } = require('./services/DocumentosGovernoService');
  DocumentosGovernoService.caducarVencidos().catch(console.error);
  setInterval(() => {
    DocumentosGovernoService.caducarVencidos().catch(console.error);
  }, 60 * 60 * 1000);

  // Aprovações com prazo ultrapassado: escala ou avisa (a cada 10 minutos).
  const { DocumentosFluxoService } = require('./services/DocumentosFluxoService');
  setInterval(() => {
    DocumentosFluxoService.escalarAtrasadas().catch(console.error);
  }, 10 * 60 * 1000);
});
