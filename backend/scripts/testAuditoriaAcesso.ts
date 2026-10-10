/**
 * Testes de quem consegue mesmo chegar à auditoria, pela API.
 *
 * O pedido do cliente foi claro: "só deve aparecer para o dono e nunca o
 * funcionário sem permissão". Esconder o botão no ecrã não responde a isso —
 * quem soubesse o endereço lia os registos na mesma, e era assim que estava.
 *
 * Estes testes batem à porta a sério, com um servidor HTTP e o middleware
 * verdadeiro. Se alguém voltar a tirar o guarda da rota, isto cai.
 *
 * Uso: npx ts-node scripts/testAuditoriaAcesso.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import path from 'path';
import express from 'express';

// ---------- base de dados em memória ----------
const db: Record<string, any[]> = {};
const tabela = (t: string) => (db[t] = db[t] || []);
let seq = 100;

const bate = (row: any, f: any[]) => f.every(x => {
    const v = row[x.col];
    switch (x.op) {
        case 'eq': return String(v) === String(x.val);
        case 'neq': return String(v) !== String(x.val);
        case 'in': return x.val.map(String).includes(String(v));
        default: return true;
    }
});

function mockFrom(t: string) {
    const filtros: any[] = [];
    let op = 'select'; let payload: any = null;
    const self: any = {}; const ret = () => self;
    self.select = ret; self.order = ret; self.limit = ret; self.not = ret; self.or = ret; self.is = ret;
    self.insert = (p: any) => { op = 'insert'; payload = p; return self; };
    self.update = (p: any) => { op = 'update'; payload = p; return self; };
    for (const o of ['eq', 'neq', 'in'] as const) {
        self[o] = (col: string, val: any) => { filtros.push({ col, val, op: o }); return self; };
    }
    const correr = () => {
        const linhas = tabela(t);
        if (op === 'insert') {
            const novos = (Array.isArray(payload) ? payload : [payload]).map(p => ({
                id: p.id ?? `r-${seq++}`, created_at: new Date().toISOString(), ...p,
            }));
            linhas.push(...novos);
            return { data: novos, error: null };
        }
        if (op === 'update') {
            const alvo = linhas.filter(l => bate(l, filtros));
            alvo.forEach(l => Object.assign(l, payload));
            return { data: alvo, error: null };
        }
        return { data: linhas.filter(l => bate(l, filtros)).map(l => JSON.parse(JSON.stringify(l))), error: null };
    };
    const um = () => { const r = correr(); const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data; return { data: d, error: r.error }; };
    self.single = () => Promise.resolve(um());
    self.maybeSingle = () => Promise.resolve(um());
    self.then = (res: any, rej: any) => Promise.resolve(correr()).then(res, rej);
    return self;
}

const mockSupabase: any = { from: mockFrom, rpc: () => Promise.resolve({ data: [], error: null }) };
const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });
const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);

const EMPRESA = 'empresa-1';
const CONV = 'conv-1';

// Quem está a bater à porta. Muda de teste para teste; o middleware das
// permissões é o REAL, que é o que aqui se quer provar.
let quemEntra = 'dono';

const authMwPath = require.resolve(path.join(__dirname, '..', 'src', 'middleware', 'authMiddleware'));
require.cache[authMwPath] = fake({
    requireAuth: (req: any, _s: any, n: any) => { req.user = { id: quemEntra, empresa_id: EMPRESA }; n(); },
    AuthRequest: {},
}, authMwPath);

const whatsappRoutes = require(path.join(__dirname, '..', 'src', 'api', 'whatsappRoutes')).default;
const { PermissaoService } = require(path.join(__dirname, '..', 'src', 'services', 'PermissaoService'));
const { AuditoriaService } = require(path.join(__dirname, '..', 'src', 'services', 'AuditoriaService'));

const app = express();
app.use(express.json());
app.use('/api/whatsapp', whatsappRoutes);
const servidor = app.listen(0);
const porta = () => (servidor.address() as any).port;

const pedir = async (metodo: string, caminho: string, corpo?: any) => {
    const r = await fetch(`http://127.0.0.1:${porta()}${caminho}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: corpo ? JSON.stringify(corpo) : undefined,
    });
    return { estado: r.status, corpo: await r.json().catch(() => ({})) };
};

let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };

async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    quemEntra = 'dono'; seq = 100;

    tabela('configuracoes').push({ id: 'lic', empresa_id: EMPRESA, chave: 'modulos_empresa', valor: JSON.stringify(['wa', 'crm', 'auto']) });
    tabela('perfis').push(
        { id: 'dono', nome: 'Elves', role: 'admin', empresa_id: EMPRESA, ativo: true, permissoes: null },
        { id: 'alexandre', nome: 'Alexandre', role: 'agente', empresa_id: EMPRESA, ativo: true, permissoes: null },
        { id: 'supervisora', nome: 'Rainha', role: 'sales_manager', empresa_id: EMPRESA, ativo: true, permissoes: null },
    );
    tabela('wa_conversations').push({ id: CONV, empresa_id: EMPRESA, channel_id: 'chan-1', phone_number: '244928053925', contact_name: 'Cliente' });
    tabela('clientes').push({ id: 1, empresa_id: EMPRESA, nome: 'Cliente', telefone: '244928053925', tags: [], custom_fields: {} });

    const antes = console.error; const antesWarn = console.warn; const antesLog = console.log;
    console.error = () => { }; console.warn = () => { }; console.log = () => { };
    try { await fn(); console.log = antesLog; antesLog(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log = antesLog; antesLog(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
    finally { console.error = antes; console.warn = antesWarn; console.log = antesLog; }
}

(async () => {
    console.log('\n=== Quem chega à auditoria ===\n');

    await test('o dono abre a auditoria', async () => {
        await AuditoriaService.registar({
            empresaId: EMPRESA, quemId: 'dono', accao: 'bot_pausado',
            conversationId: CONV, detalhes: 'desligou o bot.',
        });
        quemEntra = 'dono';
        const r = await pedir('GET', `/api/whatsapp/conversations/${CONV}/audit`);
        assert(r.estado === 200, `devia deixar entrar, deu ${r.estado}`);
        assert(r.corpo.audit.length === 1, `devia ver 1 registo, viu ${r.corpo.audit?.length}`);
    });

    await test('um agente leva com a porta fechada', async () => {
        // O caso exacto que o cliente levantou: o funcionario nao pode ver isto.
        quemEntra = 'alexandre';
        const r = await pedir('GET', `/api/whatsapp/conversations/${CONV}/audit`);
        assert(r.estado === 403, `devia recusar com 403, deu ${r.estado}`);
        assert(!r.corpo.audit, 'nao pode devolver registos nenhuns');
    });

    await test('a recusa explica-se, nao e um erro seco', async () => {
        quemEntra = 'alexandre';
        const r = await pedir('GET', `/api/whatsapp/conversations/${CONV}/audit`);
        assert(/permiss/i.test(r.corpo.error || ''), `devia explicar: ${r.corpo.error}`);
        assert(/administrador/i.test(r.corpo.error || ''), 'devia dizer a quem pedir');
    });

    await test('o dono pode dar a auditoria a um agente de confianca', async () => {
        await PermissaoService.guardar('alexandre', ['wa'], ['wa.responder', 'wa.auditoria']);
        quemEntra = 'alexandre';
        const r = await pedir('GET', `/api/whatsapp/conversations/${CONV}/audit`);
        assert(r.estado === 200, `depois de dada devia entrar, deu ${r.estado}: ${r.corpo.error}`);
    });

    await test('e pode voltar a tirar-lha', async () => {
        await PermissaoService.guardar('alexandre', ['wa'], ['wa.responder', 'wa.auditoria']);
        quemEntra = 'alexandre';
        assert((await pedir('GET', `/api/whatsapp/conversations/${CONV}/audit`)).estado === 200, 'primeiro entrava');

        await PermissaoService.guardar('alexandre', ['wa'], ['wa.responder']);
        const r = await pedir('GET', `/api/whatsapp/conversations/${CONV}/audit`);
        assert(r.estado === 403, `devia voltar a recusar, deu ${r.estado}`);
    });

    await test('uma conta desativada perde o acesso na hora', async () => {
        await PermissaoService.guardar('alexandre', ['wa'], ['wa.responder', 'wa.auditoria']);
        tabela('perfis').find(p => p.id === 'alexandre')!.ativo = false;
        quemEntra = 'alexandre';
        const r = await pedir('GET', `/api/whatsapp/conversations/${CONV}/audit`);
        assert(r.estado === 403, `uma conta desativada nao entra, deu ${r.estado}`);
    });

    await test('a vista da empresa toda tem o mesmo guarda', async () => {
        quemEntra = 'alexandre';
        const r = await pedir('GET', '/api/whatsapp/auditoria');
        assert(r.estado === 403, `devia recusar, deu ${r.estado}`);
    });

    console.log('\n=== Delegar conversas ===\n');

    await test('um agente nao delega conversas', async () => {
        quemEntra = 'alexandre';
        const r = await pedir('PUT', `/api/whatsapp/conversations/${CONV}/assign`, { agent_id: 'alexandre' });
        assert(r.estado === 403, `devia recusar, deu ${r.estado}`);
    });

    await test('uma supervisora delega, e fica registado', async () => {
        quemEntra = 'supervisora';
        const r = await pedir('PUT', `/api/whatsapp/conversations/${CONV}/assign`, { agent_id: 'alexandre' });
        assert(r.estado === 200, `devia deixar, deu ${r.estado}: ${r.corpo.error}`);

        const registos = tabela('wa_audit_logs');
        assert(registos.length === 1, `devia ficar 1 registo, ficaram ${registos.length}`);
        assert(registos[0].empresa_id === EMPRESA, 'o registo tem de levar a empresa');
        assert(registos[0].performed_by === 'supervisora', 'tem de dizer quem delegou');
        assert(registos[0].target_user === 'alexandre', 'tem de dizer a quem');
    });

    console.log('\n=== Pausar o bot ===\n');

    await test('um agente nao desliga o bot de um cliente', async () => {
        quemEntra = 'alexandre';
        const r = await pedir('PUT', '/api/whatsapp/toggle-bot/244928053925', { paused: true });
        assert(r.estado === 403, `devia recusar, deu ${r.estado}`);
    });

    await test('o dono desliga, e fica registado com a conversa certa', async () => {
        quemEntra = 'dono';
        const r = await pedir('PUT', '/api/whatsapp/toggle-bot/244928053925', { paused: true });
        assert(r.estado === 200, `devia deixar, deu ${r.estado}: ${r.corpo.error}`);

        const log = tabela('wa_audit_logs')[0];
        assert(!!log, 'devia ficar registado');
        assert(log.action === 'bot_pausado', `accao errada: ${log.action}`);
        assert(log.conversation_id === CONV, `devia ligar-se a conversa: ${log.conversation_id}`);
        assert(log.empresa_id === EMPRESA, 'tem de levar a empresa');
    });

    await test('o registo do bot aparece mesmo na auditoria da conversa', async () => {
        // O fecho do circulo: desligar o bot e, logo a seguir, ver isso no ecra
        // que ate aqui estava sempre vazio.
        quemEntra = 'dono';
        await pedir('PUT', '/api/whatsapp/toggle-bot/244928053925', { paused: true });
        const r = await pedir('GET', `/api/whatsapp/conversations/${CONV}/audit`);
        assert(r.estado === 200, `devia abrir, deu ${r.estado}`);
        assert(r.corpo.audit.length === 1, `devia mostrar o que acabou de acontecer, mostrou ${r.corpo.audit.length}`);
        assert(r.corpo.audit[0].performed_by_name === 'Elves', `devia dizer quem: ${r.corpo.audit[0].performed_by_name}`);
        assert(/autom/i.test(r.corpo.audit[0].details), `devia explicar o que foi feito: ${r.corpo.audit[0].details}`);
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (falhas.length) console.log('Falhou:\n  - ' + falhas.join('\n  - '));
    servidor.close();
    process.exit(failed === 0 ? 0 : 1);
})();
