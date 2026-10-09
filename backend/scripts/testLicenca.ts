/**
 * Testes da licença dos módulos.
 *
 * O cliente dizia que desligava o Financeiro, o CRM e o RH no painel e eles
 * continuavam a aparecer. A base de dados estava certa: o que estava errado era
 * a leitura — falhava para o lado aberto. Três sítios liam a mesma configuração,
 * cada um com a sua lista por omissão (uma de 11 módulos, outra de 3), e sempre
 * que a leitura corria mal caíam na lista cheia.
 *
 * Numa verificação de licença isso é ao contrário do que deve ser: na dúvida
 * dá-se menos, não mais. É isso que estes testes seguram.
 *
 * Uso: npx ts-node scripts/testLicenca.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import path from 'path';

// ---------- base de dados em memória ----------
const db: Record<string, any[]> = {};
const tabela = (t: string) => (db[t] = db[t] || []);
let seq = 100;

/** Quando isto estiver preenchido, a leitura devolve erro — como se a base falhasse. */
let erroDeLeitura: any = null;

const bate = (row: any, f: any[]) => f.every(x => String(row[x.col]) === String(x.val));

function mockFrom(t: string) {
    const filtros: any[] = [];
    let op = 'select'; let payload: any = null;
    const self: any = {}; const ret = () => self;
    self.select = ret; self.order = ret; self.limit = ret;
    self.insert = (p: any) => { op = 'insert'; payload = p; return self; };
    self.update = (p: any) => { op = 'update'; payload = p; return self; };
    self.eq = (col: string, val: any) => { filtros.push({ col, val }); return self; };

    const correr = () => {
        if (erroDeLeitura) return { data: null, error: erroDeLeitura };
        const linhas = tabela(t);
        if (op === 'insert') {
            const novos = (Array.isArray(payload) ? payload : [payload]).map(p => ({ id: p.id ?? seq++, ...p }));
            linhas.push(...novos);
            return { data: novos, error: null };
        }
        if (op === 'update') { const alvo = linhas.filter(l => bate(l, filtros)); alvo.forEach(l => Object.assign(l, payload)); return { data: alvo, error: null }; }
        return { data: linhas.filter(l => bate(l, filtros)).map(l => JSON.parse(JSON.stringify(l))), error: null };
    };
    const um = () => { const r = correr(); const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data; return { data: d, error: r.error || (d ? null : { code: 'PGRST116' }) }; };
    self.single = () => Promise.resolve(um());
    self.maybeSingle = () => Promise.resolve({ data: um().data, error: erroDeLeitura });
    self.then = (res: any, rej: any) => Promise.resolve(correr()).then(res, rej);
    return self;
}

const mockSupabase: any = { from: mockFrom };
const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });
const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);

const { LicencaService } = require(path.join(__dirname, '..', 'src', 'services', 'LicencaService'));

const EMPRESA = 'empresa-1';
let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };

/** Define a licença da empresa como o painel do superadmin a grava. */
const licenciar = (empresaId: string, modulos: any) =>
    tabela('configuracoes').push({ id: seq++, empresa_id: empresaId, chave: 'modulos_empresa', valor: JSON.stringify(modulos) });

async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    erroDeLeitura = null; seq = 100;
    // O silêncio dos erros esperados não interessa a quem lê a saída dos testes.
    const antes = console.error; console.error = () => { };
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
    finally { console.error = antes; }
}

(async () => {
    console.log('\n=== O que a licença diz ===\n');

    await test('lê exatamente a lista que o superadmin gravou', async () => {
        licenciar(EMPRESA, ['crm', 'wa', 'email']);
        const m = await LicencaService.modulosDaEmpresa(EMPRESA);
        assert(m.join(',') === 'crm,wa,email', `devia ser crm,wa,email — veio ${m.join(',')}`);
    });

    await test('o que não está na licença fica de fora', async () => {
        // O caso que o cliente relatou: Financeiro, CRM e RH apareciam sempre.
        licenciar(EMPRESA, ['crm', 'auto', 'wa', 'email', 'documentos']);
        for (const fora of ['hr', 'contabilidade', 'afiliados', 'reunioes']) {
            assert(!(await LicencaService.temModulo(EMPRESA, fora)), `${fora} não está licenciado e não pode passar`);
        }
        assert(await LicencaService.temModulo(EMPRESA, 'crm'), 'crm está licenciado e tem de passar');
    });

    await test('uma lista vazia é uma escolha, não um engano', async () => {
        // Deixar a empresa só com o essencial tem de ser possível. "Corrigir"
        // para a lista cheia era dar tudo a quem não comprou nada.
        licenciar(EMPRESA, []);
        const m = await LicencaService.modulosDaEmpresa(EMPRESA);
        assert(m.length === 0, `devia vir vazia, veio ${JSON.stringify(m)}`);
        assert(!(await LicencaService.temModulo(EMPRESA, 'crm')), 'nem o crm passa numa licença vazia');
    });

    console.log('\n=== Quando a leitura corre mal ===\n');

    await test('erro na base de dados dá menos acesso, nunca mais', async () => {
        licenciar(EMPRESA, ['crm', 'wa', 'email', 'hr', 'contabilidade']);
        erroDeLeitura = { message: 'conexão perdida' };
        const m = await LicencaService.modulosDaEmpresa(EMPRESA);
        assert(m.length <= LicencaService.PADRAO.length, `falhou para o lado aberto: ${JSON.stringify(m)}`);
        assert(!m.includes('hr') && !m.includes('contabilidade'), 'um erro de leitura não pode valer módulos a mais');
    });

    await test('valor estragado na configuração não vira licença cheia', async () => {
        tabela('configuracoes').push({ id: 1, empresa_id: EMPRESA, chave: 'modulos_empresa', valor: 'isto não é json' });
        const m = await LicencaService.modulosDaEmpresa(EMPRESA);
        assert(m.join(',') === LicencaService.PADRAO.join(','), `devia cair no padrão, veio ${JSON.stringify(m)}`);
    });

    await test('valor que não é uma lista também não vira licença cheia', async () => {
        tabela('configuracoes').push({ id: 1, empresa_id: EMPRESA, chave: 'modulos_empresa', valor: JSON.stringify({ crm: true }) });
        const m = await LicencaService.modulosDaEmpresa(EMPRESA);
        assert(m.join(',') === LicencaService.PADRAO.join(','), `devia cair no padrão, veio ${JSON.stringify(m)}`);
    });

    await test('lixo no meio da lista é deitado fora, o resto vale', async () => {
        tabela('configuracoes').push({ id: 1, empresa_id: EMPRESA, chave: 'modulos_empresa', valor: JSON.stringify(['crm', null, 7, 'wa']) });
        const m = await LicencaService.modulosDaEmpresa(EMPRESA);
        assert(m.join(',') === 'crm,wa', `devia ser crm,wa — veio ${JSON.stringify(m)}`);
    });

    console.log('\n=== Empresas sem licença definida ===\n');

    await test('empresa nova recebe o padrão, não tudo', async () => {
        const m = await LicencaService.modulosDaEmpresa('empresa-sem-linha');
        assert(m.join(',') === LicencaService.PADRAO.join(','), `devia ser o padrão, veio ${JSON.stringify(m)}`);
        assert(m.length < LicencaService.TODOS.length, 'o padrão não pode ser a lista toda');
    });

    await test('sem empresa nenhuma, o padrão', async () => {
        for (const vazio of [null, undefined, '']) {
            const m = await LicencaService.modulosDaEmpresa(vazio as any);
            assert(m.join(',') === LicencaService.PADRAO.join(','), `devia ser o padrão para ${JSON.stringify(vazio)}`);
        }
    });

    await test('a lista devolvida é uma cópia — ninguém estraga o padrão', async () => {
        const m = await LicencaService.modulosDaEmpresa('empresa-sem-linha');
        m.push('contabilidade');
        const outra = await LicencaService.modulosDaEmpresa('outra-sem-linha');
        assert(!outra.includes('contabilidade'), 'o padrão foi alterado por quem recebeu a lista');
    });

    console.log('\n=== A licença é de cada empresa ===\n');

    await test('a licença de uma empresa não serve a outra', async () => {
        licenciar(EMPRESA, ['crm', 'wa', 'hr', 'contabilidade']);
        licenciar('empresa-2', ['crm']);
        const a = await LicencaService.modulosDaEmpresa(EMPRESA);
        const b = await LicencaService.modulosDaEmpresa('empresa-2');
        assert(a.includes('hr'), 'a empresa-1 comprou o hr');
        assert(!b.includes('hr'), 'a empresa-2 não comprou o hr e não o pode ver');
    });

    console.log('\n=== Os módulos que não se licenciam ===\n');

    await test('home e definições passam sempre, mesmo sem licença', async () => {
        // Sem estes, uma empresa com a licença por definir não conseguia sequer
        // entrar para pedir ajuda.
        licenciar(EMPRESA, []);
        for (const m of LicencaService.SEMPRE) {
            assert(await LicencaService.temModulo(EMPRESA, m), `${m} tem de passar sempre`);
        }
    });

    await test('o padrão só dá o básico', async () => {
        const proibidos = ['hr', 'contabilidade', 'afiliados', 'kb', 'data', 'documentos', 'agendamento'];
        for (const p of proibidos) {
            assert(!LicencaService.PADRAO.includes(p), `${p} não pode vir de borla no padrão`);
        }
    });

    await test('tudo o que o padrão dá existe mesmo', async () => {
        for (const m of LicencaService.PADRAO) {
            assert(LicencaService.TODOS.includes(m), `${m} está no padrão mas não existe na lista de módulos`);
        }
    });

    await test('os módulos novos estão na lista do painel', async () => {
        // Se faltarem aqui, o superadmin não os consegue ligar nem desligar.
        for (const m of ['agendamento', 'documentos', 'contabilidade', 'afiliados']) {
            assert(LicencaService.TODOS.includes(m), `${m} falta na lista do painel`);
        }
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (falhas.length) console.log('Falhou:\n  - ' + falhas.join('\n  - '));
    process.exit(failed === 0 ? 0 : 1);
})();
