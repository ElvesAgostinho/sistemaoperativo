/**
 * Testes do catálogo de etiquetas.
 *
 * O problema que isto resolve: as etiquetas eram texto livre em cada sítio.
 * "VIP" e "vip" ficavam como duas etiquetas diferentes, e a lista que aparecia
 * era só "tudo o que já foi escrito nalgum cliente". Estes testes seguram as
 * regras que impedem isso de voltar.
 *
 * Uso: npx ts-node scripts/testEtiquetas.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import path from 'path';

// ---------- base de dados em memória ----------
const db: Record<string, any[]> = {};
const tabela = (t: string) => (db[t] = db[t] || []);
let seq = 1;

const bate = (row: any, f: any[]) => f.every(x => {
    const v = row[x.col];
    if (x.op === 'eq') return String(v) === String(x.val);
    if (x.op === 'in') return x.val.map(String).includes(String(v));
    return true;
});

function mockFrom(t: string) {
    const filtros: any[] = [];
    let op = 'select'; let payload: any = null; let contar = false;
    const self: any = {}; const ret = () => self;
    self.select = (_c?: string, o?: any) => { if (o?.count) contar = true; return self; };
    self.order = ret; self.limit = ret; self.not = ret; self.or = ret; self.is = ret;
    self.insert = (p: any) => { op = 'insert'; payload = p; return self; };
    self.update = (p: any) => { op = 'update'; payload = p; return self; };
    self.delete = () => { op = 'delete'; return self; };
    self.eq = (col: string, val: any) => { filtros.push({ col, val, op: 'eq' }); return self; };
    self.in = (col: string, val: any[]) => { filtros.push({ col, val, op: 'in' }); return self; };

    const correr = () => {
        const linhas = tabela(t);
        if (op === 'insert') {
            const novos = (Array.isArray(payload) ? payload : [payload]).map(p => ({ id: p.id ?? `id-${seq++}`, ...p }));
            // O índice único (empresa_id, lower(nome)) da migração, replicado aqui.
            if (t === 'etiquetas') {
                for (const n of novos) {
                    if (linhas.some(l => l.empresa_id === n.empresa_id && String(l.nome).toLowerCase() === String(n.nome).toLowerCase())) {
                        return { data: null, error: { code: '23505', message: 'duplicate key' } };
                    }
                }
            }
            linhas.push(...novos);
            return { data: Array.isArray(payload) ? novos : novos[0], error: null };
        }
        if (op === 'update') { const alvo = linhas.filter(l => bate(l, filtros)); alvo.forEach(l => Object.assign(l, payload)); return { data: alvo.map(l => JSON.parse(JSON.stringify(l))), error: null }; }
        if (op === 'delete') { const fora = linhas.filter(l => bate(l, filtros)); db[t] = linhas.filter(l => !bate(l, filtros)); return { data: fora, error: null }; }
        const achados = linhas.filter(l => bate(l, filtros)).map(l => JSON.parse(JSON.stringify(l)));
        return contar ? { data: null, error: null, count: achados.length } : { data: achados, error: null };
    };
    const um = () => { const r = correr(); const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data; return { data: d, error: r.error || (d ? null : { code: 'PGRST116' }) }; };
    self.single = () => Promise.resolve(um());
    self.maybeSingle = () => Promise.resolve({ ...um(), error: null });
    self.then = (res: any, rej: any) => Promise.resolve(correr()).then(res, rej);
    self.catch = (rej: any) => Promise.resolve(correr()).catch(rej);
    return self;
}

const mockSupabase: any = { from: mockFrom, rpc: () => Promise.resolve({ data: [], error: null }) };
const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });
const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);

const { EtiquetaService } = require(path.join(__dirname, '..', 'src', 'services', 'EtiquetaService'));

const EMPRESA = 'empresa-1';
const OUTRA = 'empresa-2';
let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };

async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    seq = 1;
    tabela('clientes').push(
        { id: 1, empresa_id: EMPRESA, nome: 'Ana', tags: ['cliente'] },
        { id: 2, empresa_id: EMPRESA, nome: 'Carlos', tags: [] },
        { id: 9, empresa_id: OUTRA, nome: 'De outra empresa', tags: ['cliente'] }
    );
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}

const tagsDe = (id: number) => tabela('clientes').find(c => c.id === id)!.tags as string[];

(async () => {
    console.log('\n=== A lista da empresa ===\n');

    await test('criar uma etiqueta e vê-la na lista, com cor', async () => {
        const e = await EtiquetaService.criar(EMPRESA, 'VIP');
        assert(!!e.id && e.nome === 'VIP', `criada mal: ${JSON.stringify(e)}`);
        assert(/^#[0-9a-f]{6}$/i.test(e.cor), `devia ter uma cor: ${e.cor}`);
        const lista = await EtiquetaService.listar(EMPRESA);
        assert(lista.length === 1 && lista[0].nome === 'VIP', `lista errada: ${JSON.stringify(lista)}`);
    });

    await test('"VIP" e "vip" são a mesma etiqueta', async () => {
        // Era daqui que vinha o problema: duas etiquetas para a mesma coisa.
        const a = await EtiquetaService.criar(EMPRESA, 'VIP');
        const b = await EtiquetaService.criar(EMPRESA, '  vip ');
        assert(a.id === b.id, 'devia devolver a que já existe, não criar outra');
        assert((await EtiquetaService.listar(EMPRESA)).length === 1, 'só pode haver uma');
    });

    await test('o nome é limpo e não pode ser vazio nem enorme', async () => {
        const e = await EtiquetaService.criar(EMPRESA, '   interessado  ');
        assert(e.nome === 'interessado', `devia tirar os espaços: "${e.nome}"`);
        let erro = '';
        try { await EtiquetaService.criar(EMPRESA, '   '); } catch (x: any) { erro = x.message; }
        assert(/nome/i.test(erro), `devia recusar vazio: ${erro}`);
        erro = '';
        try { await EtiquetaService.criar(EMPRESA, 'x'.repeat(41)); } catch (x: any) { erro = x.message; }
        assert(/comprido/i.test(erro), `devia recusar nome enorme: ${erro}`);
    });

    await test('as etiquetas de uma empresa não aparecem na outra', async () => {
        await EtiquetaService.criar(EMPRESA, 'VIP');
        await EtiquetaService.criar(OUTRA, 'Fornecedor');
        const minhas = await EtiquetaService.listar(EMPRESA);
        assert(minhas.length === 1 && minhas[0].nome === 'VIP', `vazamento entre empresas: ${JSON.stringify(minhas)}`);
    });

    console.log('\n=== Pôr e tirar num contacto ===\n');

    await test('põe uma etiqueta e ela entra na lista da empresa', async () => {
        // Se um fluxo inventa uma etiqueta, ela tem de aparecer em Definições.
        const tags = await EtiquetaService.aplicarNoContacto(EMPRESA, 2, { adicionar: ['comprou'] });
        assert(tags.includes('comprou'), `devia ficar com a etiqueta: ${JSON.stringify(tags)}`);
        const lista = await EtiquetaService.listar(EMPRESA);
        assert(lista.some((e: any) => e.nome === 'comprou'), 'a etiqueta nova devia entrar no catálogo');
    });

    await test('tira a etiqueta a quem já comprou', async () => {
        await EtiquetaService.aplicarNoContacto(EMPRESA, 1, { adicionar: ['comprou'] });
        assert(tagsDe(1).includes('comprou'), 'devia ter a etiqueta antes');
        const tags = await EtiquetaService.aplicarNoContacto(EMPRESA, 1, { remover: ['comprou'] });
        assert(!tags.includes('comprou'), `devia sair: ${JSON.stringify(tags)}`);
        assert(tags.includes('cliente'), 'não pode levar as outras à frente');
    });

    await test('tirar não se engana por causa das maiúsculas', async () => {
        await EtiquetaService.criar(EMPRESA, 'Comprou');
        await EtiquetaService.aplicarNoContacto(EMPRESA, 1, { adicionar: ['Comprou'] });
        const tags = await EtiquetaService.aplicarNoContacto(EMPRESA, 1, { remover: ['comprou'] });
        assert(!tags.some((t: string) => /comprou/i.test(t)), `devia sair mesmo escrito de outra maneira: ${JSON.stringify(tags)}`);
    });

    await test('pôr e tirar ao mesmo tempo', async () => {
        await EtiquetaService.aplicarNoContacto(EMPRESA, 1, { adicionar: ['interessado'] });
        const tags = await EtiquetaService.aplicarNoContacto(EMPRESA, 1, { adicionar: ['comprou'], remover: ['interessado'] });
        assert(tags.includes('comprou') && !tags.includes('interessado'), `resultado errado: ${JSON.stringify(tags)}`);
    });

    await test('a mesma etiqueta duas vezes não fica duas vezes', async () => {
        await EtiquetaService.aplicarNoContacto(EMPRESA, 2, { adicionar: ['vip'] });
        const tags = await EtiquetaService.aplicarNoContacto(EMPRESA, 2, { adicionar: ['VIP'] });
        assert(tags.filter((t: string) => /vip/i.test(t)).length === 1, `ficou repetida: ${JSON.stringify(tags)}`);
    });

    await test('o contacto passa a usar o nome como a empresa o escreve', async () => {
        // O contacto tinha "vip"; a empresa chama-lhe "VIP". Fica "VIP".
        tabela('clientes').find(c => c.id === 2)!.tags = ['vip'];
        await EtiquetaService.criar(EMPRESA, 'VIP');
        const tags = await EtiquetaService.aplicarNoContacto(EMPRESA, 2, { adicionar: ['cliente'] });
        assert(tags.includes('VIP') && !tags.includes('vip'), `devia normalizar: ${JSON.stringify(tags)}`);
    });

    await test('não mexe num contacto de outra empresa', async () => {
        let erro = '';
        try { await EtiquetaService.aplicarNoContacto(EMPRESA, 9, { adicionar: ['vip'] }); } catch (x: any) { erro = x.message; }
        assert(/não encontrado|nao encontrado/i.test(erro), `devia recusar: ${erro}`);
        assert(!tagsDe(9).includes('vip'), 'o contacto da outra empresa não podia ser tocado');
    });

    console.log('\n=== Apagar ===\n');

    await test('apagar tira a etiqueta dos contactos que a tinham', async () => {
        // Deixá-la pendurada nos contactos era voltar ao texto livre.
        const e = await EtiquetaService.criar(EMPRESA, 'cliente');
        const r = await EtiquetaService.apagar(EMPRESA, e.id, { tirarDosContactos: true });
        assert(r.contactosAfetados === 1, `devia mexer em 1 contacto, mexeu em ${r.contactosAfetados}`);
        assert(!tagsDe(1).includes('cliente'), `devia sair do contacto: ${JSON.stringify(tagsDe(1))}`);
        assert((await EtiquetaService.listar(EMPRESA)).length === 0, 'devia sair da lista');
    });

    await test('dá para apagar da lista e deixar nos contactos, se for pedido', async () => {
        const e = await EtiquetaService.criar(EMPRESA, 'cliente');
        await EtiquetaService.apagar(EMPRESA, e.id, { tirarDosContactos: false });
        assert(tagsDe(1).includes('cliente'), 'devia ficar no contacto');
        assert((await EtiquetaService.listar(EMPRESA)).length === 0, 'devia sair da lista');
    });

    await test('não apaga a etiqueta de outra empresa', async () => {
        const daOutra = await EtiquetaService.criar(OUTRA, 'Fornecedor');
        let erro = '';
        try { await EtiquetaService.apagar(EMPRESA, daOutra.id, { tirarDosContactos: true }); } catch (x: any) { erro = x.message; }
        assert(/não encontrada|nao encontrada/i.test(erro), `devia recusar: ${erro}`);
        assert((await EtiquetaService.listar(OUTRA)).length === 1, 'a etiqueta da outra empresa tinha de ficar');
    });

    await test('a lista diz quantos contactos têm cada etiqueta', async () => {
        await EtiquetaService.criar(EMPRESA, 'cliente');
        await EtiquetaService.aplicarNoContacto(EMPRESA, 2, { adicionar: ['cliente'] });
        const contas = await EtiquetaService.contagens(EMPRESA);
        assert(contas['cliente'] === 2, `deviam ser 2, são ${contas['cliente']}`);
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (falhas.length) console.log('Falhou:\n  - ' + falhas.join('\n  - '));
    process.exit(failed === 0 ? 0 : 1);
})();
