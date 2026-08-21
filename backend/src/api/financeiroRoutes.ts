import { Router } from 'express';
import multer from 'multer';
import { FinanceiroService } from '../services/FinanceiroService';

const router = Router();
const upload = multer({ dest: 'tmp/' });

router.get('/transacoes', async (req, res) => {
    try {
        const { tipo, categoria, estado, mes, ano } = req.query;
        const transacoes = await FinanceiroService.listarTransacoes(req, {
            tipo: tipo as string,
            categoria: categoria as string,
            estado: estado as string,
            mes: mes ? Number(mes) : undefined,
            ano: ano ? Number(ano) : undefined
        });
        res.json({ success: true, transacoes });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/transacoes', upload.single('anexo'), async (req, res) => {
    try {
        const id = await FinanceiroService.criarTransacao(req, req.body, req.file);
        res.json({ success: true, id });
    } catch (err: any) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.put('/transacoes/:id/pagar', async (req, res) => {
    try {
        await FinanceiroService.marcarPago(req, Number(req.params.id));
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/transacoes/:id', async (req, res) => {
    try {
        await FinanceiroService.apagarTransacao(req, Number(req.params.id));
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/resumo', async (req, res) => {
    try {
        const resumo = await FinanceiroService.getResumo(req);
        res.json({ success: true, ...resumo });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/salarios/:mes/:ano', async (req, res) => {
    try {
        const dados = await FinanceiroService.getSalarios(req, Number(req.params.mes), Number(req.params.ano));
        res.json({ success: true, ...dados });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
