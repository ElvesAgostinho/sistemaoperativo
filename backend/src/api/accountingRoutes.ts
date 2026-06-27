import { Router } from 'express';
import {
    getPlanosContas, createPlanoConta,
    getDiarios, createDiario,
    getExercicios, createExercicio,
    getLancamentos, createLancamento,
    getBalancete
} from '../controllers/accountingController';

const router = Router();

router.get('/contas', getPlanosContas);
router.post('/contas', createPlanoConta);

router.get('/diarios', getDiarios);
router.post('/diarios', createDiario);

router.get('/exercicios', getExercicios);
router.post('/exercicios', createExercicio);

router.get('/lancamentos', getLancamentos);
router.post('/lancamentos', createLancamento);

router.get('/balancete', getBalancete);

export default router;
