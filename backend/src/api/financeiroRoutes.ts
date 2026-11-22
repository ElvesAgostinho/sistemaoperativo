import { Router } from 'express';
import multer from 'multer';
import { FinanceiroService } from '../services/FinanceiroService';
import { ProdutosService } from '../services/ProdutosService';

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

// ============================================================
// PRODUTOS E VENDAS
//
// Os ficheiros (foto do produto, fatura da compra) ficam em memória e vão
// para a Supabase: a pasta tmp/ do servidor apaga-se a cada publicação.
// ============================================================
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const ficheirosProduto = uploadMem.fields([{ name: 'foto', maxCount: 1 }, { name: 'fatura', maxCount: 1 }]);

const ficheiro = (req: any, campo: string) => (req.files?.[campo]?.[0]) || undefined;
const fotoValida = (f: any) => {
    if (f && !String(f.mimetype || '').startsWith('image/')) throw new Error('A foto do produto tem de ser uma imagem.');
    return f;
};
const erro = (res: any, err: any) => {
    const msg = err?.message || 'Erro inesperado.';
    // A tabela ainda não existe: a migração não foi corrida.
    // O Postgres diz "relation ... does not exist"; a API da Supabase diz
    // "Could not find the table 'public.produtos' in the schema cache".
    if (/relation .*(produtos|vendas).* does not exist|could not find the (table|function) .*(produtos|vendas|ajustar_stock)|ajustar_stock_produto/i.test(msg)) {
        return res.status(503).json({ success: false, error: 'O módulo de Produtos ainda não está ativo nesta instalação (falta correr a migração migration_produtos_vendas.sql).' });
    }
    res.status(400).json({ success: false, error: msg });
};

router.get('/produtos', async (req, res) => {
    try { res.json({ success: true, produtos: await ProdutosService.listar(req) }); } catch (err) { erro(res, err); }
});

router.post('/produtos', ficheirosProduto, async (req, res) => {
    try {
        const id = await ProdutosService.criar(req, req.body, fotoValida(ficheiro(req, 'foto')), ficheiro(req, 'fatura'));
        res.json({ success: true, id });
    } catch (err) { erro(res, err); }
});

router.put('/produtos/:id', ficheirosProduto, async (req, res) => {
    try {
        await ProdutosService.atualizar(req, Number(req.params.id), req.body, fotoValida(ficheiro(req, 'foto')));
        res.json({ success: true });
    } catch (err) { erro(res, err); }
});

router.delete('/produtos/:id', async (req, res) => {
    try { await ProdutosService.apagar(req, Number(req.params.id)); res.json({ success: true }); } catch (err) { erro(res, err); }
});

router.get('/produtos/:id/compras', async (req, res) => {
    try { res.json({ success: true, compras: await ProdutosService.listarCompras(req, Number(req.params.id)) }); } catch (err) { erro(res, err); }
});

router.post('/produtos/:id/compras', ficheirosProduto, async (req, res) => {
    try {
        const r = await ProdutosService.registarCompra(req, Number(req.params.id), req.body, ficheiro(req, 'fatura'));
        res.json({ success: true, ...r });
    } catch (err) { erro(res, err); }
});

router.get('/vendas', async (req, res) => {
    try { res.json({ success: true, vendas: await ProdutosService.listarVendas(req) }); } catch (err) { erro(res, err); }
});

router.post('/vendas', async (req, res) => {
    try { res.json({ success: true, ...(await ProdutosService.registarVenda(req, req.body)) }); } catch (err) { erro(res, err); }
});

router.get('/vendas/:id/pdf', async (req, res) => {
    try { res.json({ success: true, url: await ProdutosService.linkPdf(req, Number(req.params.id)) }); } catch (err) { erro(res, err); }
});

router.post('/vendas/:id/anular', async (req, res) => {
    try { await ProdutosService.anularVenda(req, Number(req.params.id)); res.json({ success: true }); } catch (err) { erro(res, err); }
});

router.post('/vendas/:id/whatsapp', async (req, res) => {
    try { await ProdutosService.enviarWhatsApp(req, Number(req.params.id), req.body?.telefone); res.json({ success: true }); } catch (err) { erro(res, err); }
});

/** Link temporário para um anexo guardado no bucket privado (faturas de compra). */
router.get('/ficheiro', async (req, res) => {
    try { res.json({ success: true, url: await ProdutosService.linkFicheiro(req, String(req.query.caminho || '')) }); } catch (err) { erro(res, err); }
});

export default router;
