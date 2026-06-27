import { Router } from 'express';
import { getClientes, createCliente, deleteCliente, getNegocios, createNegocio, updateFaseNegocio, generateProforma, deleteNegocio, registerPayment } from '../controllers/crmController';

const router = Router();

// Clientes
router.get('/clientes', getClientes);
router.post('/clientes', createCliente);
router.delete('/clientes/:id', deleteCliente);

// Negócios (Pipeline)
router.get('/negocios', getNegocios);
router.post('/negocios', createNegocio);
router.put('/negocios/:id/fase', updateFaseNegocio);
router.delete('/negocios/:id', deleteNegocio);

// Proformas & Pagamentos
router.post('/negocios/:id/proforma', generateProforma);
router.post('/negocios/:id/pagamento', registerPayment);

export default router;
