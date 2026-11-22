/**
 * Testes de Produtos e Vendas (Financeiro).
 *
 * O que aqui se segura: a compra sobe o stock e entra nas despesas com a
 * fatura; a venda desce o stock, entra nas receitas e tem comprovativo; vender
 * sem stock avisa mas não impede; anular devolve tudo; e o comprovativo diz
 * que NÃO é uma fatura.
 *
 * Uso: npx ts-node scripts/testProdutosVendas.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import path from 'path';

// ---------- base de dados em memória ----------
const db: Record<string, any[]> = {};
const ids: Record<string, number> = {};
const tabela = (t: string) => (db[t] = db[t] || []);
let falharProximoInsertVendas = 0;   // para simular duas vendas a disputar o mesmo número

function mockFrom(t: string) {
    const filtros: ((r: any) => boolean)[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: any = null;
    let ordem: { col: string; asc: boolean }[] = [];
    let limite: number | null = null;
    const self: any = {};
    self.select = () => self;
    self.eq = (c: string, v: any) => { filtros.push(r => String(r[c]) === String(v)); return self; };
    self.in = (c: string, vs: any[]) => { filtros.push(r => vs.map(String).includes(String(r[c]))); return self; };
    self.order = (c: string, o?: any) => { ordem.push({ col: c, asc: o?.ascending !== false }); return self; };
    self.limit = (n: number) => { limite = n; return self; };
    self.insert = (p: any) => { op = 'insert'; payload = p; return self; };
    self.update = (p: any) => { op = 'update'; payload = p; return self; };
    self.delete = () => { op = 'delete'; return self; };

    const correr = (): { data: any; error: any } => {
        const rows = tabela(t);
        if (op === 'insert') {
            const novos = (Array.isArray(payload) ? payload : [payload]).map(p => ({ ...p }));
            if (t === 'vendas') {
                if (falharProximoInsertVendas > 0) { falharProximoInsertVendas--; return { data: null, error: { code: '23505', message: 'duplicate key' } }; }
                for (const n of novos) if (rows.some(r => r.empresa_id === n.empresa_id && r.numero === n.numero)) {
                    return { data: null, error: { code: '23505', message: 'duplicate key' } };
                }
            }
            // Os valores por omissão da base de dados.
            if (t === 'produtos') for (const n of novos) if (n.ativo === undefined) n.ativo = true;
            for (const n of novos) { ids[t] = (ids[t] || 0) + 1; n.id = ids[t]; rows.push(n); }
            return { data: novos, error: null };
        }
        let alvo = rows.filter(r => filtros.every(f => f(r)));
        if (op === 'update') { alvo.forEach(r => Object.assign(r, payload)); return { data: alvo.map(r => ({ id: r.id })), error: null }; }
        if (op === 'delete') { db[t] = rows.filter(r => !alvo.includes(r)); return { data: alvo.map(r => ({ id: r.id })), error: null }; }
        for (const o of [...ordem].reverse()) alvo = [...alvo].sort((a, b) => (a[o.col] > b[o.col] ? 1 : a[o.col] < b[o.col] ? -1 : 0) * (o.asc ? 1 : -1));
        if (limite !== null) alvo = alvo.slice(0, limite);
        return { data: alvo.map(r => ({ ...r })), error: null };
    };
    self.single = () => { const r = correr(); return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }); };
    self.maybeSingle = self.single;
    self.then = (res: any, rej: any) => Promise.resolve(correr()).then(res, rej);
    return self;
}

const mockSupabase: any = {
    from: mockFrom,
    rpc: async (nome: string, args: any) => {
        if (nome !== 'ajustar_stock_produto') return { data: null, error: { message: 'função desconhecida' } };
        const p = tabela('produtos').find(r => String(r.id) === String(args.p_produto_id));
        if (!p) return { data: null, error: null };
        p.stock = Number(p.stock) + Number(args.p_delta);
        return { data: p.stock, error: null };
    },
};
const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });
const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);

// O armazenamento (Supabase Storage) não sai daqui.
const { MediaUploadService } = require(path.join(__dirname, '..', 'src', 'services', 'MediaUploadService'));
const guardados: Record<string, Buffer> = {};
MediaUploadService.upload = async (_b: Buffer, nome: string, mime: string, pasta: string, emp: string) => ({ url: `https://storage/whatsapp-media/${pasta}/${emp}/${nome}`, tipo: 'imagem', nome });
MediaUploadService.guardarDocumento = async (b: Buffer, emp: string, nome: string) => { const c = `${emp}/${Object.keys(guardados).length}_${nome}`; guardados[c] = b; return c; };
MediaUploadService.descarregarDocumento = async (c: string) => { if (!guardados[c]) throw new Error('não existe'); return guardados[c]; };
MediaUploadService.assinarDocumento = async (c: string) => `https://storage/assinado/${c}`;
MediaUploadService.apagar = async () => true;

const { WhatsAppChannelManager } = require(path.join(__dirname, '..', 'src', 'services', 'WhatsAppChannelManager'));
const enviados: any[] = [];
WhatsAppChannelManager.sendMediaMessage = async (_s: any, canal: string, tel: string, dados: string, nome: string, legenda: string) => {
    enviados.push({ canal, tel, dados, nome, legenda }); return true;
};

const { ProdutosService: P, numero } = require(path.join(__dirname, '..', 'src', 'services', 'ProdutosService'));
const EMP = 'emp-1';
const req: any = { user: { empresa_id: EMP } };
const outraEmpresa: any = { user: { empresa_id: 'emp-2' } };
const fatura = { buffer: Buffer.from('%PDF-fatura'), originalname: 'fatura fornecedor.pdf', mimetype: 'application/pdf' };

let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    for (const t of Object.keys(ids)) delete ids[t];
    for (const k of Object.keys(guardados)) delete guardados[k];
    enviados.length = 0; falharProximoInsertVendas = 0;
    const antesErr = console.error; console.error = () => { };
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
    finally { console.error = antesErr; }
}
const produto = (id: number) => tabela('produtos').find(p => p.id === id);
const transacoes = () => tabela('financeiro_transacoes');

(async () => {
    console.log('\n=== Cadastrar e comprar ===\n');

    await test('cadastrar com stock inicial regista a compra, o stock e a despesa com a fatura', async () => {
        const id = await P.criar(req, { nome: 'Sabonete', preco_venda: '500', quantidade_inicial: '10', custo_unitario: '300', fornecedor: 'Grossista X' }, undefined, fatura);
        assert(produto(id).stock === 10, `stock devia ser 10: ${produto(id).stock}`);
        const c = tabela('produtos_compras')[0];
        assert(c && c.total === 3000 && c.fatura_path, `compra errada: ${JSON.stringify(c)}`);
        const t = transacoes()[0];
        assert(t.tipo === 'saida' && t.categoria === 'Compra de mercadoria' && t.valor === 3000, JSON.stringify(t));
        assert(t.anexo_path === `documentos:${c.fatura_path}`, `a fatura devia ir anexada à despesa: ${t.anexo_path}`);
        assert(c.transacao_id === t.id, 'a compra devia ficar ligada à despesa');
    });

    await test('stock que já se tinha pode entrar sem contar como despesa', async () => {
        const id = await P.criar(req, { nome: 'Velas', preco_venda: 200, quantidade_inicial: 5, custo_unitario: 100, registar_despesa: 'false' });
        assert(produto(id).stock === 5, 'o stock entra na mesma');
        assert(transacoes().length === 0, 'não devia haver despesa');
    });

    await test('uma nova compra soma ao stock e atualiza o custo', async () => {
        const id = await P.criar(req, { nome: 'Arroz', preco_venda: 1500, quantidade_inicial: 4, custo_unitario: 1000 });
        const r = await P.registarCompra(req, id, { quantidade: '6', custo_unitario: '1.100,00' });
        assert(produto(id).stock === 10, `stock devia ser 10: ${produto(id).stock}`);
        assert(produto(id).preco_custo === 1100, `custo devia ser 1100: ${produto(id).preco_custo}`);
        assert(r.total === 6600, `total devia ser 6600: ${r.total}`);
    });

    await test('não se compra zero, nem produto de outra empresa', async () => {
        const id = await P.criar(req, { nome: 'Óleo', preco_venda: 900 });
        let msg = '';
        try { await P.registarCompra(req, id, { quantidade: 0, custo_unitario: 5 }); } catch (e: any) { msg = e.message; }
        assert(/maior que zero/.test(msg), msg);
        msg = '';
        try { await P.registarCompra(outraEmpresa, id, { quantidade: 1, custo_unitario: 5 }); } catch (e: any) { msg = e.message; }
        assert(/não encontrado/.test(msg), `outra empresa não pode comprar este produto: ${msg}`);
    });

    console.log('\n=== Vender ===\n');

    await test('uma venda com vários produtos desce o stock e entra nas receitas', async () => {
        const a = await P.criar(req, { nome: 'Sabonete', preco_venda: 500, quantidade_inicial: 10, custo_unitario: 300 });
        const b = await P.criar(req, { nome: 'Pasta de dentes', preco_venda: 800, quantidade_inicial: 5, custo_unitario: 500 });
        const r = await P.registarVenda(req, { itens: [{ produto_id: a, quantidade: 3 }, { produto_id: b, quantidade: 2 }], cliente_nome: 'Maria', forma_pagamento: 'Numerário' });
        assert(produto(a).stock === 7 && produto(b).stock === 3, `stock errado: ${produto(a).stock} / ${produto(b).stock}`);
        assert(r.total === 3100 && r.numero === 1, JSON.stringify(r));
        assert(r.avisos.length === 0, 'havia stock, não devia avisar');
        const t = transacoes().find(x => x.tipo === 'entrada');
        assert(t && t.categoria === 'Vendas' && t.valor === 3100, `receita errada: ${JSON.stringify(t)}`);
        assert(tabela('vendas_itens').length === 2, 'deviam ficar duas linhas');
    });

    await test('o preço pode mudar na venda (desconto) e fica o que se cobrou', async () => {
        const a = await P.criar(req, { nome: 'Sabonete', preco_venda: 500, quantidade_inicial: 10, custo_unitario: 300 });
        const r = await P.registarVenda(req, { itens: [{ produto_id: a, quantidade: 2, preco_unitario: '450' }] });
        assert(r.total === 900, `devia cobrar 900: ${r.total}`);
    });

    await test('sem stock suficiente AVISA, mas a venda fica feita', async () => {
        const a = await P.criar(req, { nome: 'Chinelos', preco_venda: 2000, quantidade_inicial: 1, custo_unitario: 1200 });
        const r = await P.registarVenda(req, { itens: [{ produto_id: a, quantidade: 3 }] });
        assert(r.avisos.length === 1 && /Chinelos/.test(r.avisos[0]), `devia avisar: ${JSON.stringify(r.avisos)}`);
        assert(produto(a).stock === -2, `o stock fica negativo: ${produto(a).stock}`);
        assert(tabela('vendas').length === 1, 'a venda tinha de ficar registada');
    });

    await test('o mesmo produto em duas linhas conta junto para o aviso', async () => {
        const a = await P.criar(req, { nome: 'Pão', preco_venda: 100, quantidade_inicial: 3, custo_unitario: 50 });
        const r = await P.registarVenda(req, { itens: [{ produto_id: a, quantidade: 2 }, { produto_id: a, quantidade: 2 }] });
        assert(r.avisos.length === 1, `4 de 3 devia avisar: ${JSON.stringify(r.avisos)}`);
        assert(produto(a).stock === -1, `stock: ${produto(a).stock}`);
    });

    await test('os comprovativos seguem a numeração 1, 2, 3 — e duas vendas ao mesmo tempo não repetem', async () => {
        const a = await P.criar(req, { nome: 'Sumo', preco_venda: 300, quantidade_inicial: 50, custo_unitario: 150 });
        const r1 = await P.registarVenda(req, { itens: [{ produto_id: a, quantidade: 1 }] });
        falharProximoInsertVendas = 1;   // outra venda apanhou o número 2 mesmo antes
        const r2 = await P.registarVenda(req, { itens: [{ produto_id: a, quantidade: 1 }] });
        assert(r1.numero === 1 && r2.numero === 2, `${r1.numero}, ${r2.numero}`);
    });

    await test('não há venda sem produtos nem com quantidade zero', async () => {
        let msg = '';
        try { await P.registarVenda(req, { itens: [] }); } catch (e: any) { msg = e.message; }
        assert(/pelo menos um produto/.test(msg), msg);
        const a = await P.criar(req, { nome: 'X', preco_venda: 1 });
        msg = '';
        try { await P.registarVenda(req, { itens: [{ produto_id: a, quantidade: 0 }] }); } catch (e: any) { msg = e.message; }
        assert(/maior que zero/.test(msg), msg);
    });

    console.log('\n=== Comprovativo ===\n');

    await test('a venda gera e guarda o comprovativo em PDF', async () => {
        const a = await P.criar(req, { nome: 'Sabonete', preco_venda: 500, quantidade_inicial: 10, custo_unitario: 300 });
        const r = await P.registarVenda(req, { itens: [{ produto_id: a, quantidade: 1 }] });
        const v = tabela('vendas').find(x => x.id === r.id);
        assert(v.pdf_path && guardados[v.pdf_path], 'o PDF devia ficar guardado');
        assert(guardados[v.pdf_path].subarray(0, 4).toString() === '%PDF', 'não é um PDF');
    });

    await test('o comprovativo diz que NÃO é uma fatura', async () => {
        const a = await P.criar(req, { nome: 'Sabonete', preco_venda: 500, quantidade_inicial: 10, custo_unitario: 300 });
        const r = await P.registarVenda(req, { itens: [{ produto_id: a, quantidade: 2 }], cliente_nome: 'João' });
        // O texto apanha-se ao ser escrito: o pdf-parse desta instalação não lê
        // nenhum PDF do pdfkit (nem a proforma, que já existia).
        const PDFDocument = require('pdfkit');
        const escritos: string[] = [];
        const original = PDFDocument.prototype.text;
        PDFDocument.prototype.text = function (t: any, ...resto: any[]) { escritos.push(String(t)); return original.call(this, t, ...resto); };
        const v = tabela('vendas').find(x => x.id === r.id);
        v.pdf_path = null;   // obriga a gerar outra vez, agora com o texto a ser apanhado
        try { await P.pdfDaVenda(req, r.id); } finally { PDFDocument.prototype.text = original; }
        const text = escritos.join(' | ');
        assert(/NÃO É UMA FATURA/.test(text), `o aviso devia estar no PDF: ${text.slice(0, 300)}`);
        assert(/COMPROVATIVO DE VENDA/.test(text) && /0001/.test(text) && /João/.test(text) && /Sabonete/.test(text), text.slice(0, 400));
    });

    await test('o comprovativo vai por WhatsApp pelo número da Evolution', async () => {
        db['wa_channels'] = [
            { id: 'meta-1', empresa_id: EMP, provider: 'meta', status: 'connected' },
            { id: 'evo-1', empresa_id: EMP, provider: 'evolution', status: 'connected' },
        ];
        const a = await P.criar(req, { nome: 'Sabonete', preco_venda: 500, quantidade_inicial: 10, custo_unitario: 300 });
        const r = await P.registarVenda(req, { itens: [{ produto_id: a, quantidade: 1 }] });
        await P.enviarWhatsApp(req, r.id, '923 000 000');
        const e = enviados[0];
        assert(e.canal === 'evo-1', `devia ir pela Evolution: ${e.canal}`);
        assert(e.tel === '923000000' && /^data:application\/pdf;base64,/.test(e.dados), JSON.stringify({ tel: e.tel, d: e.dados.slice(0, 40) }));
        assert(/não é uma fatura/i.test(e.legenda), e.legenda);
        assert(tabela('vendas').find(x => x.id === r.id).cliente_telefone === '923000000', 'o número do cliente fica guardado');
    });

    await test('sem WhatsApp ligado, diz porquê', async () => {
        const a = await P.criar(req, { nome: 'Sabonete', preco_venda: 500, quantidade_inicial: 10, custo_unitario: 300 });
        const r = await P.registarVenda(req, { itens: [{ produto_id: a, quantidade: 1 }] });
        let msg = '';
        try { await P.enviarWhatsApp(req, r.id, '923000000'); } catch (e: any) { msg = e.message; }
        assert(/nenhum WhatsApp ligado/.test(msg), msg);
    });

    console.log('\n=== Anular e totais ===\n');

    await test('anular devolve o stock e tira a receita, e não se anula duas vezes', async () => {
        const a = await P.criar(req, { nome: 'Sabonete', preco_venda: 500, quantidade_inicial: 10, custo_unitario: 300 });
        const r = await P.registarVenda(req, { itens: [{ produto_id: a, quantidade: 4 }] });
        await P.anularVenda(req, r.id);
        await P.anularVenda(req, r.id);
        assert(produto(a).stock === 10, `o stock devia voltar a 10 (uma vez só): ${produto(a).stock}`);
        assert(!transacoes().some(t => t.tipo === 'entrada'), 'a receita devia sair');
        assert(tabela('vendas').find(x => x.id === r.id).estado === 'Anulada', 'a venda fica, marcada como anulada');
    });

    await test('os totais por produto: gasto, vendido e lucro (sem as anuladas)', async () => {
        const a = await P.criar(req, { nome: 'Sabonete', preco_venda: 500, quantidade_inicial: 10, custo_unitario: 300 });
        await P.registarVenda(req, { itens: [{ produto_id: a, quantidade: 4 }] });
        const anulada = await P.registarVenda(req, { itens: [{ produto_id: a, quantidade: 2 }] });
        await P.anularVenda(req, anulada.id);
        const [p] = await P.listar(req);
        assert(p.total_gasto_compras === 3000, `gasto: ${p.total_gasto_compras}`);
        assert(p.total_vendido === 2000 && p.quantidade_vendida === 4, `vendido: ${p.total_vendido} / ${p.quantidade_vendida}`);
        assert(p.lucro === 800, `lucro devia ser 2000 - 4×300 = 800: ${p.lucro}`);
        assert(p.valor_em_stock === 1800, `valor em stock devia ser 6 × 300: ${p.valor_em_stock}`);
    });

    await test('apagar tira da lista mas não das vendas', async () => {
        const a = await P.criar(req, { nome: 'Sabonete', preco_venda: 500, quantidade_inicial: 10, custo_unitario: 300 });
        await P.registarVenda(req, { itens: [{ produto_id: a, quantidade: 1 }] });
        await P.apagar(req, a);
        assert((await P.listar(req)).length === 0, 'não devia aparecer na lista');
        assert(tabela('vendas_itens').length === 1, 'a venda fica');
    });

    await test('o acerto de stock (perdas, contagem) faz-se no editar', async () => {
        const a = await P.criar(req, { nome: 'Ovos', preco_venda: 100, quantidade_inicial: 30, custo_unitario: 60 });
        await P.atualizar(req, a, { stock: '27', preco_venda: '120' });
        assert(produto(a).stock === 27 && produto(a).preco_venda === 120, JSON.stringify(produto(a)));
    });

    console.log('\n=== Segurança e números ===\n');

    await test('um link de ficheiro só sai para a própria empresa', async () => {
        let msg = '';
        try { await P.linkFicheiro(req, 'documentos:emp-2/123_fatura.pdf'); } catch (e: any) { msg = e.message; }
        assert(/não encontrado/.test(msg), `não devia dar o ficheiro de outra empresa: ${msg}`);
        assert(/assinado\/emp-1\//.test(await P.linkFicheiro(req, 'documentos:emp-1/1_f.pdf')), 'o da própria empresa sai');
    });

    await test('os números leem-se como se escrevem em Angola', async () => {
        assert(numero('1.500,50') === 1500.5, String(numero('1.500,50')));
        assert(numero('1500') === 1500 && numero('2,5') === 2.5 && numero('1 200') === 1200, 'formatos simples');
        assert(Number.isNaN(numero('')) && Number.isNaN(numero('abc')), 'vazio e lixo não são zero');
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (failed) { console.log('Falharam:\n - ' + falhas.join('\n - ')); process.exit(1); }
    process.exit(0);
})();
