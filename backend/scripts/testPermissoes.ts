/**
 * Testes das permissões por funcionário.
 *
 * Até agora quem podia o quê estava escrito à mão no ecrã (ROLE_PERMISSIONS no
 * App.tsx), preso a cinco papéis fixos, e o servidor não verificava nada. O
 * ecrã escondia o botão do RH a um agente, mas quem soubesse o endereço
 * chamava a API na mesma — esconder não é proteger.
 *
 * O que aqui se segura: a licença da empresa é o tecto, o dono pode dar menos
 * mas nunca mais, uma leitura que corre mal dá menos acesso e não mais, e
 * ninguém se desarma a si próprio.
 *
 * Uso: npx ts-node scripts/testPermissoes.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import path from 'path';

// ---------- base de dados em memória ----------
const db: Record<string, any[]> = {};
const tabela = (t: string) => (db[t] = db[t] || []);
let seq = 100;
let erroDeLeitura: Record<string, any> = {};
/** Colunas que a base ainda nao tem (migracao por correr). */
let colunasEmFalta: string[] = [];

const bate = (row: any, f: any[]) => f.every(x => {
    const v = row[x.col];
    switch (x.op) {
        case 'eq': return String(v) === String(x.val);
        case 'in': return x.val.map(String).includes(String(v));
        default: return true;
    }
});

function mockFrom(t: string) {
    const filtros: any[] = [];
    let op = 'select'; let payload: any = null;
    const self: any = {}; const ret = () => self;
    let colunasPedidas: string[] = [];
    self.select = (c?: string) => { colunasPedidas = String(c || '').split(',').map(x => x.trim()); return self; };
    self.order = ret; self.limit = ret; self.neq = ret;
    self.insert = (p: any) => { op = 'insert'; payload = p; return self; };
    self.update = (p: any) => { op = 'update'; payload = p; return self; };
    for (const o of ['eq', 'in'] as const) {
        self[o] = (col: string, val: any) => { filtros.push({ col, val, op: o }); return self; };
    }
    const correr = () => {
        if (erroDeLeitura[t]) return { data: null, error: erroDeLeitura[t] };
        // A base de dados recusa a consulta inteira quando uma das colunas nao
        // existe. E isso que acontece se o codigo subir antes da migracao.
        if (colunasEmFalta.length && colunasPedidas.some(c => colunasEmFalta.includes(c))) {
            return { data: null, error: { code: '42703', message: `column perfis.${colunasEmFalta[0]} does not exist` } };
        }
        const linhas = tabela(t);
        if (op === 'insert') {
            const novos = (Array.isArray(payload) ? payload : [payload]).map(p => ({ id: p.id ?? `r-${seq++}`, ...p }));
            linhas.push(...novos);
            return { data: novos, error: null };
        }
        if (op === 'update') {
            const alvo = linhas.filter(l => bate(l, filtros));
            alvo.forEach(l => Object.assign(l, payload));
            return { data: alvo.map(l => JSON.parse(JSON.stringify(l))), error: null };
        }
        return { data: linhas.filter(l => bate(l, filtros)).map(l => JSON.parse(JSON.stringify(l))), error: null };
    };
    const um = () => { const r = correr(); const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data; return { data: d, error: r.error }; };
    self.single = () => Promise.resolve(um());
    self.maybeSingle = () => Promise.resolve(um());
    self.then = (res: any, rej: any) => Promise.resolve(correr()).then(res, rej);
    return self;
}

const mockSupabase: any = { from: mockFrom };
const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });
const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);

const { PermissaoService } = require(path.join(__dirname, '..', 'src', 'services', 'PermissaoService'));
const { LicencaService } = require(path.join(__dirname, '..', 'src', 'services', 'LicencaService'));

const EMPRESA = 'empresa-1';
let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const licenciar = (modulos: string[], empresa = EMPRESA) =>
    tabela('configuracoes').push({ id: seq++, empresa_id: empresa, chave: 'modulos_empresa', valor: JSON.stringify(modulos) });

const pessoa = (id: string, role: string, extra: any = {}) =>
    tabela('perfis').push({ id, nome: id, role, empresa_id: EMPRESA, ativo: true, permissoes: null, ...extra });

async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    erroDeLeitura = {}; colunasEmFalta = []; seq = 100;
    const antes = console.error; console.error = () => { };
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
    finally { console.error = antes; }
}

(async () => {
    console.log('\n=== O que cada papel dá por omissão ===\n');

    await test('um agente atende clientes e mais nada', async () => {
        // O caso do Alexandre, que o cliente deu como exemplo.
        licenciar(['wa', 'crm', 'hr', 'auto', 'contabilidade', 'email']);
        pessoa('ana', 'agente');
        const p = await PermissaoService.efectivas('ana');
        assert(p.modulos.includes('wa'), 'tem de abrir o WhatsApp');
        assert(!p.modulos.includes('hr'), 'não pode abrir o RH');
        assert(!p.modulos.includes('contabilidade'), 'não pode abrir o Financeiro');
        assert(!p.modulos.includes('crm'), 'não pode abrir o CRM');
        assert(p.accoes.includes('wa.responder'), 'tem de poder responder');
        assert(!p.accoes.includes('wa.auditoria'), 'um agente não vê a auditoria');
        assert(!p.accoes.includes('wa.delegar'), 'um agente não delega conversas');
    });

    await test('o administrador abre tudo o que a empresa comprou', async () => {
        licenciar(['wa', 'crm', 'email']);
        pessoa('dono', 'admin');
        const p = await PermissaoService.efectivas('dono');
        for (const m of ['wa', 'crm', 'email']) assert(p.modulos.includes(m), `devia abrir ${m}`);
        assert(p.accoes.includes('wa.auditoria'), 'o dono vê a auditoria');
        assert(p.accoes.includes('equipa.gerir'), 'o dono gere a equipa');
    });

    await test('uma conta pendente não abre nada', async () => {
        licenciar(['wa', 'crm']);
        pessoa('novo', 'pending');
        const p = await PermissaoService.efectivas('novo');
        assert(!p.modulos.includes('wa'), 'uma conta por aprovar não entra');
        assert(p.accoes.length === 0, 'nem tem acções');
    });

    console.log('\n=== A licença da empresa é o tecto ===\n');

    await test('nem o administrador abre o que a empresa não comprou', async () => {
        licenciar(['wa', 'crm']);   // sem RH, sem Financeiro
        pessoa('dono', 'admin');
        const p = await PermissaoService.efectivas('dono');
        assert(!p.modulos.includes('hr'), 'o RH não está licenciado');
        assert(!p.modulos.includes('contabilidade'), 'o Financeiro não está licenciado');
    });

    await test('o dono não consegue dar mais do que comprou', async () => {
        licenciar(['wa']);
        pessoa('ana', 'agente');
        await PermissaoService.guardar('ana', ['wa', 'hr', 'contabilidade'], ['wa.responder']);
        const p = await PermissaoService.efectivas('ana');
        assert(p.modulos.includes('wa'), 'o WhatsApp está licenciado');
        assert(!p.modulos.includes('hr'), 'o RH não está licenciado — não se dá');
        assert(!p.modulos.includes('contabilidade'), 'o Financeiro não está licenciado — não se dá');
    });

    console.log('\n=== O dono afina pessoa a pessoa ===\n');

    await test('dar a auditoria a um agente de confiança', async () => {
        licenciar(['wa', 'crm']);
        pessoa('ana', 'agente');
        assert(!(await PermissaoService.pode('ana', 'wa.auditoria')), 'por omissão não vê');

        await PermissaoService.guardar('ana', ['wa'], ['wa.responder', 'wa.auditoria']);
        assert(await PermissaoService.pode('ana', 'wa.auditoria'), 'depois de dada, vê');
    });

    await test('tirar o CRM a um gestor de vendas', async () => {
        licenciar(['wa', 'crm', 'email']);
        pessoa('carlos', 'sales_manager');
        assert((await PermissaoService.efectivas('carlos')).modulos.includes('crm'), 'por omissão tem o CRM');

        await PermissaoService.guardar('carlos', ['wa', 'email'], ['wa.responder']);
        const p = await PermissaoService.efectivas('carlos');
        assert(!p.modulos.includes('crm'), 'o dono tirou-lhe o CRM');
        assert(p.modulos.includes('wa'), 'mas continua a atender');
    });

    await test('uma acção de um módulo fechado não vale nada', async () => {
        // Deixar "ver auditoria" ligada a quem não abre o WhatsApp só confundia
        // quem estava a configurar.
        licenciar(['wa', 'crm']);
        pessoa('ana', 'agente');
        await PermissaoService.guardar('ana', ['crm'], ['wa.auditoria', 'wa.responder']);
        const p = await PermissaoService.efectivas('ana');
        assert(!p.accoes.includes('wa.auditoria'), 'sem o módulo, a acção cai');
        assert(!p.accoes.includes('wa.responder'), 'sem o módulo, a acção cai');
    });

    await test('repor devolve a pessoa ao normal do perfil', async () => {
        licenciar(['wa', 'crm', 'email']);
        pessoa('ana', 'agente');
        await PermissaoService.guardar('ana', [], []);
        assert((await PermissaoService.efectivas('ana')).modulos.filter((m: string) => m === 'wa').length === 0, 'ficou sem nada');

        await PermissaoService.repor('ana');
        const p = await PermissaoService.efectivas('ana');
        assert(p.modulos.includes('wa'), 'voltou ao normal de um agente');
        assert(!p.proprias, 'deixou de ter permissões próprias');
    });

    await test('uma lista vazia é uma escolha, não um engano', async () => {
        licenciar(['wa', 'crm']);
        pessoa('ana', 'agente');
        await PermissaoService.guardar('ana', [], []);
        const p = await PermissaoService.efectivas('ana');
        assert(!p.modulos.includes('wa'), 'tirar tudo tem de ser possível');
        assert(p.proprias, 'conta como escolha do dono, não como ausência');
    });

    await test('as definições e o início nunca se tiram', async () => {
        // Sem estes, quem ficasse sem permissões não conseguia sequer entrar
        // para pedir ajuda.
        licenciar(['wa']);
        pessoa('ana', 'agente');
        await PermissaoService.guardar('ana', [], []);
        const p = await PermissaoService.efectivas('ana');
        for (const m of PermissaoService.MODULOS_SEMPRE) {
            assert(p.modulos.includes(m), `${m} tem de ficar sempre`);
        }
    });

    console.log('\n=== Quando as coisas correm mal ===\n');

    await test('erro a ler o perfil dá menos acesso, nunca mais', async () => {
        licenciar(['wa', 'crm', 'hr']);
        pessoa('dono', 'admin');
        erroDeLeitura['perfis'] = { message: 'conexão perdida' };
        const p = await PermissaoService.efectivas('dono');
        assert(p.accoes.length === 0, `falhou para o lado aberto: ${JSON.stringify(p.accoes)}`);
        assert(!p.modulos.includes('wa'), 'um erro de leitura não pode valer módulos');
    });

    await test('sem a migracao corrida, ninguem fica trancado fora', async () => {
        // O codigo sobe antes de a migracao correr — sao dois passos separados,
        // e um deles e a mao. Se a coluna `permissoes` em falta fizesse a
        // leitura toda falhar, o servico falhava fechado e o DONO ficava sem
        // acesso ao proprio sistema. Vale o que o perfil da, como antes desta
        // funcionalidade existir.
        colunasEmFalta = ['permissoes'];
        licenciar(['wa', 'crm', 'email']);
        pessoa('dono', 'admin');
        pessoa('ana', 'agente');

        const d = await PermissaoService.efectivas('dono');
        assert(d.modulos.includes('wa') && d.modulos.includes('crm'), `o dono ficou trancado fora: ${JSON.stringify(d.modulos)}`);
        assert(d.accoes.includes('wa.auditoria'), 'o dono continua a ver a auditoria');

        const a = await PermissaoService.efectivas('ana');
        assert(a.modulos.includes('wa'), 'o agente continua a atender');
        assert(!a.accoes.includes('wa.auditoria'), 'e continua sem ver a auditoria — nao se ganha acesso por falta de migracao');
    });

    await test('um utilizador que não existe não tem permissões', async () => {
        licenciar(['wa']);
        const p = await PermissaoService.efectivas('fantasma');
        assert(p.accoes.length === 0 && !p.modulos.includes('wa'), 'não existe, não pode');
    });

    await test('uma conta desativada perde tudo, seja qual for o papel', async () => {
        licenciar(['wa', 'crm', 'hr']);
        pessoa('dono', 'admin', { ativo: false });
        const p = await PermissaoService.efectivas('dono');
        assert(p.modulos.length === 0 && p.accoes.length === 0, `devia ficar sem nada: ${JSON.stringify(p)}`);
    });

    await test('permissões gravadas com lixo caem no normal do perfil', async () => {
        licenciar(['wa', 'crm']);
        pessoa('ana', 'agente', { permissoes: 'isto não é json' });
        const p = await PermissaoService.efectivas('ana');
        assert(p.modulos.includes('wa'), 'cai no que o papel dá');
        assert(!p.proprias, 'lixo não conta como escolha do dono');
    });

    await test('permissões gravadas como lista também caem no normal', async () => {
        licenciar(['wa', 'crm']);
        pessoa('ana', 'agente', { permissoes: ['wa'] });
        const p = await PermissaoService.efectivas('ana');
        assert(p.modulos.includes('wa') && !p.proprias, 'cai no que o papel dá');
    });

    await test('guardar limpa módulos e acções que não existem', async () => {
        licenciar(['wa', 'crm']);
        pessoa('ana', 'agente');
        const g = await PermissaoService.guardar('ana', ['wa', 'inventado'], ['wa.responder', 'nao.existe']);
        assert(!g.modulos.includes('inventado'), 'módulo inventado não se grava');
        assert(!g.accoes.includes('nao.existe'), 'acção inventada não se grava');
    });

    console.log('\n=== Coerência do catálogo ===\n');

    await test('toda a acção pertence a um módulo que existe', async () => {
        for (const a of PermissaoService.ACCOES) {
            if (!a.modulo) continue;
            assert(LicencaService.TODOS.includes(a.modulo), `"${a.chave}" aponta para o módulo "${a.modulo}", que não existe`);
        }
    });

    await test('toda a acção tem nome e explicação', async () => {
        // Quem está a configurar tem de perceber o que está a dar sem adivinhar.
        for (const a of PermissaoService.ACCOES) {
            assert(!!a.nome && a.nome.length > 3, `"${a.chave}" sem nome`);
            assert(!!a.descricao && a.descricao.length > 15, `"${a.chave}" sem explicação`);
        }
    });

    await test('os papéis só dão acções que existem', async () => {
        const chaves = PermissaoService.ACCOES.map((a: any) => a.chave);
        for (const papel of ['agente', 'sales_manager', 'hr_manager', 'rh_user', 'pending']) {
            for (const a of PermissaoService.omissaoDoPapel(papel).accoes) {
                assert(chaves.includes(a), `o papel "${papel}" dá "${a}", que não existe`);
            }
        }
    });

    await test('os papéis só dão módulos que existem', async () => {
        for (const papel of ['agente', 'sales_manager', 'hr_manager', 'rh_user']) {
            for (const m of PermissaoService.omissaoDoPapel(papel).modulos) {
                assert(LicencaService.TODOS.includes(m), `o papel "${papel}" dá "${m}", que não existe`);
            }
        }
    });

    await test('só o administrador manda em tudo', async () => {
        assert(PermissaoService.mandaEmTudo('admin'), 'o admin manda');
        assert(PermissaoService.mandaEmTudo('superadmin'), 'o superadmin manda');
        for (const papel of ['agente', 'sales_manager', 'hr_manager', 'rh_user', 'pending']) {
            assert(!PermissaoService.mandaEmTudo(papel), `"${papel}" não pode mandar em tudo`);
        }
    });

    await test('gerir a equipa não vem de borla a ninguém', async () => {
        licenciar(LicencaService.TODOS);
        for (const papel of ['agente', 'sales_manager', 'hr_manager', 'rh_user']) {
            pessoa('x-' + papel, papel);
            const p = await PermissaoService.efectivas('x-' + papel);
            assert(!p.accoes.includes('equipa.gerir'), `"${papel}" não pode gerir a equipa por omissão`);
        }
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (falhas.length) console.log('Falhou:\n  - ' + falhas.join('\n  - '));
    process.exit(failed === 0 ? 0 : 1);
})();
