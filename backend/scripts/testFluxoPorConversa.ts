/**
 * Testes da escolha do fluxo conversa a conversa.
 *
 * Antes o sistema decidia sozinho, igual para toda a gente: entre os fluxos
 * ligados ganhava o do gatilho mais específico. Quem atende não tinha como
 * dizer "este cliente é para ser atendido por aquele fluxo" — e o mesmo fluxo
 * não serve para todos.
 *
 * O teste que importa é o último desta primeira secção: dois clientes a escrever
 * a mesma coisa, atendidos por fluxos diferentes.
 *
 * Uso: npx ts-node scripts/testFluxoPorConversa.ts   (a partir de backend/)
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
    if (x.op === 'eq') return String(v) === String(x.val);
    if (x.op === 'in') return x.val.map(String).includes(String(v));
    return true;
});

function mockFrom(t: string) {
    const filtros: any[] = [];
    let op = 'select'; let payload: any = null; let contar = false;
    const self: any = {}; const ret = () => self;
    self.select = (_c?: string, o?: any) => { if (o?.count) contar = true; return self; };
    self.order = ret; self.limit = ret; self.not = ret; self.or = ret; self.is = ret; self.filter = ret;
    self.insert = (p: any) => { op = 'insert'; payload = p; return self; };
    self.update = (p: any) => { op = 'update'; payload = p; return self; };
    self.delete = () => { op = 'delete'; return self; };
    self.eq = (col: string, val: any) => { filtros.push({ col, val, op: 'eq' }); return self; };
    self.in = (col: string, val: any[]) => { filtros.push({ col, val, op: 'in' }); return self; };

    const correr = () => {
        const linhas = tabela(t);
        if (op === 'insert') {
            const novos = (Array.isArray(payload) ? payload : [payload]).map(p => ({ id: p.id ?? seq++, ...p }));
            for (const n of novos) {
                if (t === 'wa_eventos_processados' && linhas.some(l => l.chave === n.chave)) {
                    return { data: null, error: { code: '23505', message: 'duplicate key' } };
                }
                linhas.push(n);
            }
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

const mockSupabase: any = {
    from: mockFrom,
    rpc: () => Promise.resolve({ data: [], error: null }),
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'x' } }) }) }
};
const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });

const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);

const enviadas: { phone: string; content: string }[] = [];
const waPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'WhatsAppChannelManager'));
const { WhatsAppChannelManager: WaReal } = require(waPath);
WaReal.sendMessage = async (_s: any, _c: string, phone: string, content: string) => { enviadas.push({ phone, content }); return 'mid'; };
WaReal.sendMediaMessage = async () => true;

const emailPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'EmailService'));
require.cache[emailPath] = fake({ EmailService: { enviarEmailPersonalizado: async () => true, isConfigured: async () => true } }, emailPath);
class MockOpenAI {
    embeddings = { create: async () => ({ data: [{ embedding: new Array(1536).fill(0.001) }] }) };
    chat = { completions: { create: async () => ({ choices: [{ message: { content: 'ia' } }] }) } };
}
require.cache[require.resolve('openai')] = fake(MockOpenAI, require.resolve('openai'));

const EMPRESA = 'empresa-1';
const OUTRA = 'empresa-2';
const CANAL = 'chan-1';

const authMwPath = require.resolve(path.join(__dirname, '..', 'src', 'middleware', 'authMiddleware'));
require.cache[authMwPath] = fake({
    requireAuth: (req: any, _s: any, n: any) => { req.user = { id: 'agente-1', empresa_id: EMPRESA }; n(); },
    AuthRequest: {}
}, authMwPath);

const { AutomationEngine } = require(path.join(__dirname, '..', 'src', 'services', 'AutomationEngine'));
const whatsappRoutes = require(path.join(__dirname, '..', 'src', 'api', 'whatsappRoutes')).default;

const app = express();
app.use(express.json());
app.use('/api/whatsapp', whatsappRoutes);
const servidor = app.listen(0);
const PORTA = (servidor.address() as any).port;
const B = `http://127.0.0.1:${PORTA}`;

const chamar = async (metodo: string, rota: string, corpo?: any) => {
    const r = await fetch(B + rota, {
        method: metodo, headers: { 'Content-Type': 'application/json' },
        body: corpo ? JSON.stringify(corpo) : undefined
    });
    return [r.status, await r.json().catch(() => ({}))] as [number, any];
};

/** Um fluxo que responde sempre a mesma frase, para se saber qual atendeu. */
const fluxoQueDiz = (id: number, nome: string, frase: string, ativo = true) => ({
    id, nome, ativo, empresa_id: EMPRESA,
    nodes: [
        { id: 't1', type: 'trigger', data: { triggerKind: 'whatsapp_message', matchMode: 'any' } },
        { id: 'r1', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: frase } } }
    ],
    edges: [{ id: 'e1', source: 't1', target: 'r1' }]
});

const receber = async (telefone: string, conteudo: string) => {
    await AutomationEngine.processIncomingWhatsAppMessage({
        channel_id: CANAL, phone_number: telefone, contact_name: 'Cliente',
        content: conteudo, direction: 'inbound', id: `m-${seq++}-${Date.now()}`
    });
    await new Promise(r => setTimeout(r, 60));
};

let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };

async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    enviadas.length = 0; seq = 100;
    tabela('wa_channels').push({ id: CANAL, empresa_id: EMPRESA, provider: 'evolution', status: 'connected', credentials: { instanceName: 'inst' } });
    // O Assistente IA responde por omissao a tudo — desligado para se medir so os fluxos.
    tabela('configuracoes').push({ id: 'cfg', empresa_id: EMPRESA, chave: 'ia_whatsapp_ativa', valor: 'false' });
    tabela('wa_conversations').push(
        { id: 'conv-a', empresa_id: EMPRESA, channel_id: CANAL, phone_number: '244900000001', contact_name: 'Cliente A' },
        { id: 'conv-b', empresa_id: EMPRESA, channel_id: CANAL, phone_number: '244900000002', contact_name: 'Cliente B' },
        { id: 'conv-outra', empresa_id: OUTRA, channel_id: 'chan-2', phone_number: '244900000009' }
    );
    tabela('clientes').push(
        { id: 1, empresa_id: EMPRESA, nome: 'Cliente A', telefone: '244900000001', tags: [], custom_fields: {} },
        { id: 2, empresa_id: EMPRESA, nome: 'Cliente B', telefone: '244900000002', tags: [], custom_fields: {} }
    );
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}

const conv = (id: string) => tabela('wa_conversations').find(c => c.id === id)!;
const ditas = () => enviadas.map(e => e.content).join(' | ');

(async () => {
    console.log('\n=== Escolher quem atende cada cliente ===\n');

    await test('sem escolha, o sistema decide como sempre', async () => {
        tabela('automations').push(fluxoQueDiz(1, 'Atendimento geral', 'GERAL'));
        await receber('244900000001', 'Olá');
        assert(ditas().includes('GERAL'), `devia responder o fluxo único: ${ditas()}`);
    });

    await test('escolhido um fluxo, é esse que atende — e não o que o sistema escolheria', async () => {
        tabela('automations').push(fluxoQueDiz(1, 'Atendimento geral', 'GERAL'), fluxoQueDiz(2, 'Cobranças', 'COBRANCAS'));
        const [s, d] = await chamar('PUT', '/api/whatsapp/conversations/conv-a/fluxo', { automation_id: 2 });
        assert(s === 200 && d.success, `devia escolher: ${JSON.stringify(d)}`);
        await receber('244900000001', 'Olá');
        assert(ditas().includes('COBRANCAS'), `devia atender o escolhido: ${ditas()}`);
        assert(!ditas().includes('GERAL'), `o outro não podia responder: ${ditas()}`);
    });

    await test('dois clientes, dois fluxos diferentes, ao mesmo tempo', async () => {
        // É este o ponto todo: o mesmo fluxo não serve para todos.
        tabela('automations').push(fluxoQueDiz(1, 'Vendas', 'VENDAS'), fluxoQueDiz(2, 'Cobranças', 'COBRANCAS'));
        await chamar('PUT', '/api/whatsapp/conversations/conv-a/fluxo', { automation_id: 1 });
        await chamar('PUT', '/api/whatsapp/conversations/conv-b/fluxo', { automation_id: 2 });

        await receber('244900000001', 'Olá');
        await receber('244900000002', 'Olá');

        const paraA = enviadas.filter(e => e.phone === '244900000001').map(e => e.content).join();
        const paraB = enviadas.filter(e => e.phone === '244900000002').map(e => e.content).join();
        assert(paraA.includes('VENDAS') && !paraA.includes('COBRANCAS'), `A devia ouvir VENDAS: ${paraA}`);
        assert(paraB.includes('COBRANCAS') && !paraB.includes('VENDAS'), `B devia ouvir COBRANCAS: ${paraB}`);
    });

    await test('largar a escolha devolve a conversa ao sistema', async () => {
        tabela('automations').push(fluxoQueDiz(1, 'Geral', 'GERAL'), fluxoQueDiz(2, 'Cobranças', 'COBRANCAS'));
        await chamar('PUT', '/api/whatsapp/conversations/conv-a/fluxo', { automation_id: 2 });
        await chamar('PUT', '/api/whatsapp/conversations/conv-a/fluxo', { automation_id: null });
        assert(conv('conv-a').automation_escolhida_id === null, 'devia largar a escolha');
        await receber('244900000001', 'Olá');
        assert(ditas().includes('GERAL'), `devia voltar ao automático: ${ditas()}`);
    });

    console.log('\n=== Quando a escolha deixa de valer ===\n');

    await test('um fluxo desligado não deixa a conversa muda', async () => {
        // Sem isto, desligar um fluxo no Autopilot calava todos os clientes que
        // o tivessem escolhido, sem ninguém perceber porquê.
        tabela('automations').push(fluxoQueDiz(1, 'Geral', 'GERAL'), fluxoQueDiz(2, 'Cobranças', 'COBRANCAS'));
        await chamar('PUT', '/api/whatsapp/conversations/conv-a/fluxo', { automation_id: 2 });
        tabela('automations').find(a => a.id === 2)!.ativo = false;
        await receber('244900000001', 'Olá');
        assert(ditas().includes('GERAL'), `devia cair no automático: ${ditas()}`);
    });

    await test('um fluxo apagado também não a deixa muda', async () => {
        tabela('automations').push(fluxoQueDiz(1, 'Geral', 'GERAL'), fluxoQueDiz(2, 'Cobranças', 'COBRANCAS'));
        await chamar('PUT', '/api/whatsapp/conversations/conv-a/fluxo', { automation_id: 2 });
        db['automations'] = tabela('automations').filter(a => a.id !== 2);
        await receber('244900000001', 'Olá');
        assert(ditas().includes('GERAL'), `devia cair no automático: ${ditas()}`);
    });

    await test('não deixa escolher um fluxo desligado, e diz porquê', async () => {
        tabela('automations').push(fluxoQueDiz(2, 'Cobranças', 'COBRANCAS', false));
        const [s, d] = await chamar('PUT', '/api/whatsapp/conversations/conv-a/fluxo', { automation_id: 2 });
        assert(s === 400 && /desligado/i.test(d.error || ''), `devia explicar: ${s} ${JSON.stringify(d)}`);
    });

    await test('não escolhe um fluxo de outra empresa', async () => {
        tabela('automations').push({ ...fluxoQueDiz(3, 'Da outra', 'OUTRA'), empresa_id: OUTRA });
        const [s] = await chamar('PUT', '/api/whatsapp/conversations/conv-a/fluxo', { automation_id: 3 });
        assert(s === 404, `devia recusar, deu ${s}`);
    });

    await test('não mexe numa conversa de outra empresa', async () => {
        tabela('automations').push(fluxoQueDiz(1, 'Geral', 'GERAL'));
        const [s] = await chamar('PUT', '/api/whatsapp/conversations/conv-outra/fluxo', { automation_id: 1 });
        assert(s === 404, `devia recusar, deu ${s}`);
    });

    console.log('\n=== Começar agora, sem o cliente escrever ===\n');

    await test('o fluxo arranca e envia sem ter chegado mensagem nenhuma', async () => {
        // Era o que faltava para seguimento: quem nunca respondia nunca mais era
        // contactado, porque um fluxo só arrancava com uma mensagem a entrar.
        tabela('automations').push(fluxoQueDiz(1, 'Seguimento', 'ESTAMOS A LEMBRAR'));
        const [s, d] = await chamar('POST', '/api/whatsapp/conversations/conv-a/fluxo/iniciar', { automation_id: 1 });
        assert(s === 200 && d.success, `devia começar: ${JSON.stringify(d)}`);
        assert(ditas().includes('ESTAMOS A LEMBRAR'), `devia ter enviado: ${ditas()}`);
        assert(enviadas[0].phone === '244900000001', `devia ir para o cliente certo: ${enviadas[0].phone}`);
    });

    await test('quem começa à mão fica a atender a conversa', async () => {
        tabela('automations').push(fluxoQueDiz(1, 'Seguimento', 'SEGUIMENTO'));
        await chamar('POST', '/api/whatsapp/conversations/conv-a/fluxo/iniciar', { automation_id: 1 });
        assert(String(conv('conv-a').automation_escolhida_id) === '1', `devia ficar escolhido: ${conv('conv-a').automation_escolhida_id}`);
    });

    await test('avisa antes de atropelar um bot que alguém pausou', async () => {
        tabela('automations').push(fluxoQueDiz(1, 'Seguimento', 'SEGUIMENTO'));
        tabela('clientes').find(c => c.id === 1)!.bot_paused = true;
        const [s, d] = await chamar('POST', '/api/whatsapp/conversations/conv-a/fluxo/iniciar', { automation_id: 1 });
        assert(s === 409 && d.precisaConfirmar, `devia pedir confirmação: ${s} ${JSON.stringify(d)}`);
        assert(enviadas.length === 0, 'não podia ter enviado nada');

        const [s2] = await chamar('POST', '/api/whatsapp/conversations/conv-a/fluxo/iniciar', { automation_id: 1, forcar: true });
        assert(s2 === 200 && ditas().includes('SEGUIMENTO'), `confirmado, devia enviar: ${ditas()}`);
    });

    await test('começar um fluxo limpa o que estava a meio do anterior', async () => {
        // Senão a primeira resposta do cliente ia para o fluxo antigo, que já
        // ninguém está a seguir.
        tabela('automations').push(fluxoQueDiz(1, 'Novo', 'NOVO'));
        Object.assign(conv('conv-a'), { fluxo_node_id: 'menu-antigo', fluxo_automation_id: 9, fluxo_tentativas: 2 });
        await chamar('POST', '/api/whatsapp/conversations/conv-a/fluxo/iniciar', { automation_id: 1 });
        assert(!conv('conv-a').fluxo_node_id, `devia limpar o estado antigo: ${conv('conv-a').fluxo_node_id}`);
    });

    await test('não começa um fluxo numa conversa de outra empresa', async () => {
        tabela('automations').push(fluxoQueDiz(1, 'Geral', 'GERAL'));
        const [s] = await chamar('POST', '/api/whatsapp/conversations/conv-outra/fluxo/iniciar', { automation_id: 1 });
        assert(s === 404, `devia recusar, deu ${s}`);
        assert(enviadas.length === 0, 'não podia enviar nada');
    });

    console.log('\n=== A lista que o chat mostra ===\n');

    await test('lista os fluxos da empresa, com o estado de cada um', async () => {
        tabela('automations').push(fluxoQueDiz(1, 'Vendas', 'V'), fluxoQueDiz(2, 'Cobranças', 'C', false));
        tabela('automations').push({ ...fluxoQueDiz(3, 'Da outra', 'O'), empresa_id: OUTRA });
        const [s, d] = await chamar('GET', '/api/whatsapp/conversations/conv-a/fluxo');
        assert(s === 200 && d.success, `devia listar: ${JSON.stringify(d)}`);
        assert(d.fluxos.length === 2, `só os desta empresa (2), vieram ${d.fluxos.length}`);
        assert(d.fluxos.find((f: any) => f.nome === 'Cobranças').ativo === false, 'devia dizer que está desligado');
        assert(d.fluxos.every((f: any) => f.reageAMensagens), 'estes reagem a mensagens');
    });

    servidor.unref();
    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (falhas.length) console.log('Falhou:\n  - ' + falhas.join('\n  - '));
    process.exit(failed === 0 ? 0 : 1);
})();
