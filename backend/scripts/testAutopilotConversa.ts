/**
 * Testes de CONVERSA do Autopilot: o que acontece quando o cliente responde.
 *
 * O testAutomationNodes.ts testa cada nó isolado. Este testa o comportamento
 * que o cliente vê numa conversa real de WhatsApp com várias mensagens:
 *  - a saudação não se repete a cada mensagem (o fluxo retoma onde ficou);
 *  - o menu espera pela resposta seguinte em vez de consumir a mensagem que
 *    disparou o fluxo;
 *  - o mesmo evento entregue duas vezes pelo Evolution só responde uma vez;
 *  - a condição escolhe o ramo SIM quando é verdadeira (incluindo variável
 *    escrita sem chavetas, maiúsculas e acentos).
 *
 * Usa uma base de dados em memória (o estado tem de sobreviver entre mensagens).
 *
 * Uso: npx ts-node scripts/testAutopilotConversa.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import path from 'path';

// ============================================================
// Base de dados em memória
// ============================================================
type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
let seq = 1;

const tabela = (t: string) => (db[t] = db[t] || []);
const bate = (row: Row, filtros: any[]) => filtros.every(f => {
    const v = row[f.col];
    switch (f.op) {
        case 'eq': return String(v) === String(f.val);
        case 'neq': return String(v) !== String(f.val);
        case 'in': return f.val.map(String).includes(String(v));
        case 'is': return f.val === null ? (v === null || v === undefined) : v === f.val;
        case 'ilike': return String(v || '').toLowerCase().includes(String(f.val).replace(/%/g, '').toLowerCase());
        case 'gt': return new Date(v) > new Date(f.val);
        case 'lt': return new Date(v) < new Date(f.val);
        case 'json': return String((row[f.col] || {})[f.sub]) === String(f.val);
        default: return true;
    }
});

function mockFrom(t: string) {
    const filtros: any[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
    let payload: any = null;
    const self: any = {};
    const ret = () => self;

    self.select = ret; self.order = ret; self.limit = ret; self.not = ret; self.gte = ret; self.lte = ret;
    self.insert = (p: any) => { op = 'insert'; payload = p; return self; };
    self.update = (p: any) => { op = 'update'; payload = p; return self; };
    self.upsert = (p: any) => { op = 'upsert'; payload = p; return self; };
    self.delete = () => { op = 'delete'; return self; };
    self.eq = (col: string, val: any) => { filtros.push({ col, val, op: 'eq' }); return self; };
    self.neq = (col: string, val: any) => { filtros.push({ col, val, op: 'neq' }); return self; };
    self.in = (col: string, val: any[]) => { filtros.push({ col, val, op: 'in' }); return self; };
    self.is = (col: string, val: any) => { filtros.push({ col, val, op: 'is' }); return self; };
    self.ilike = (col: string, val: any) => { filtros.push({ col, val, op: 'ilike' }); return self; };
    self.gt = (col: string, val: any) => { filtros.push({ col, val, op: 'gt' }); return self; };
    self.lt = (col: string, val: any) => { filtros.push({ col, val, op: 'lt' }); return self; };
    self.or = ret;
    self.filter = (col: string, _op: string, val: any) => { const [c, sub] = col.split('->>'); filtros.push({ col: c, sub, val, op: 'json' }); return self; };

    const correr = () => {
        const linhas = tabela(t);
        if (op === 'insert' || op === 'upsert') {
            const novos = (Array.isArray(payload) ? payload : [payload]).map(p => ({ id: p.id ?? `id-${seq++}`, ...p }));
            for (const n of novos) {
                if (op === 'upsert' || t === 'wa_eventos_processados') {
                    const chave = n.chave ?? n.id;
                    if (linhas.some(l => (l.chave ?? l.id) === chave)) {
                        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
                    }
                }
                linhas.push(n);
            }
            return { data: Array.isArray(payload) ? novos : novos[0], error: null };
        }
        if (op === 'update') { const alvo = linhas.filter(l => bate(l, filtros)); alvo.forEach(l => Object.assign(l, payload)); return { data: alvo, error: null }; }
        if (op === 'delete') { const fica = linhas.filter(l => !bate(l, filtros)); const fora = linhas.filter(l => bate(l, filtros)); db[t] = fica; return { data: fora, error: null }; }
        // Cópias, como o Supabase real devolve — se devolvêssemos as linhas por
        // referência, um update posterior "mudava" dados já lidos e o teste mentia.
        const achados = linhas.filter(l => bate(l, filtros)).map(l => JSON.parse(JSON.stringify(l)));
        return { data: achados, error: null };
    };
    const um = () => { const r = correr(); const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data; return { data: d, error: r.error || (d ? null : { code: 'PGRST116' }) }; };

    self.single = () => Promise.resolve(um());
    self.maybeSingle = () => Promise.resolve({ ...um(), error: null });
    self.then = (res: any, rej: any) => Promise.resolve(correr()).then(res, rej);
    self.catch = (rej: any) => Promise.resolve(correr()).catch(rej);
    return self;
}

const mockSupabase: any = { from: mockFrom, rpc: () => Promise.resolve({ data: [], error: null }) };
const fake = (exportsObj: any, p: string): NodeModule => ({ id: p, filename: p, loaded: true, exports: exportsObj, children: [], paths: [], parent: null } as any);

const enviadas: any[] = [];
const mockWa = {
    sendMessage: async (_s: any, channelId: string, phone: string, content: string) => { enviadas.push({ channelId, phone, content }); return 'mid'; },
    sendMediaMessage: async () => true
};
class MockOpenAI {
    embeddings = { create: async () => ({ data: [{ embedding: new Array(1536).fill(0.001) }] }) };
    chat = { completions: { create: async () => ({ choices: [{ message: { content: 'resposta IA' } }] }) } };
}

const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);
const waPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'WhatsAppChannelManager'));
require.cache[waPath] = fake({ WhatsAppChannelManager: mockWa }, waPath);
const emailPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'EmailService'));
require.cache[emailPath] = fake({ EmailService: { enviarEmailPersonalizado: async () => true } }, emailPath);
const openaiPath = require.resolve('openai');
require.cache[openaiPath] = fake(MockOpenAI, openaiPath);

const { AutomationEngine } = require(path.join(__dirname, '..', 'src', 'services', 'AutomationEngine'));
const Engine: any = AutomationEngine;

// ============================================================
// Cenário: o fluxo da imagem do cliente
//   gatilho (qualquer mensagem) → saudação → menu (4 opções) → resposta por opção
// ============================================================
const CANAL = 'chan-1';
const EMPRESA = 7;

function fluxoMenu() {
    return {
        id: 1, nome: 'Residencial — menu', ativo: true, empresa_id: EMPRESA,
        nodes: [
            { id: 't1', type: 'trigger', data: { triggerKind: 'whatsapp_message', matchMode: 'any' } },
            { id: 'saudacao', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Olá! 1-Preços 2-Refeições 3-Condições 4-Reservar' } } },
            { id: 'menu', type: 'menu', data: { variable: '{{mensagem}}', options: [
                { id: 'o1', label: 'Preços', matchValue: '1' }, { id: 'o2', label: 'Refeições', matchValue: '2' },
                { id: 'o3', label: 'Condições', matchValue: '3' }, { id: 'o4', label: 'Reservar', matchValue: '4' }
            ] } },
            { id: 'r1', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Preços: 50.000 Kz' } } },
            { id: 'r2', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Refeições incluídas' } } },
            { id: 'r3', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Condições: ...' } } },
            { id: 'r4', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Vamos reservar' } } }
        ],
        edges: [
            { id: 'e0', source: 't1', target: 'saudacao' },
            { id: 'e1', source: 'saudacao', target: 'menu' },
            { id: 'e2', source: 'menu', target: 'r1', sourceHandle: 'o1' },
            { id: 'e3', source: 'menu', target: 'r2', sourceHandle: 'o2' },
            { id: 'e4', source: 'menu', target: 'r3', sourceHandle: 'o3' },
            { id: 'e5', source: 'menu', target: 'r4', sourceHandle: 'o4' }
        ]
    };
}

function fluxoCondicao(variavel: string, valor: string) {
    return {
        id: 2, nome: 'Condição', ativo: true, empresa_id: EMPRESA,
        nodes: [
            { id: 't1', type: 'trigger', data: { triggerKind: 'whatsapp_message', matchMode: 'any' } },
            { id: 'c1', type: 'condition', data: { variable: variavel, operator: '==', value: valor } },
            { id: 'sim', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'RAMO-SIM' } } },
            { id: 'nao', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'RAMO-NAO' } } }
        ],
        edges: [
            { id: 'e0', source: 't1', target: 'c1' },
            { id: 'e1', source: 'c1', target: 'sim', sourceHandle: 'yes' },
            { id: 'e2', source: 'c1', target: 'nao', sourceHandle: 'no' }
        ]
    };
}

let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    enviadas.length = 0; seq = 1;
    tabela('wa_channels').push({ id: CANAL, empresa_id: EMPRESA, provider: 'evolution' });
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}
const receber = (content: string, id = `m-${Date.now()}-${Math.random()}`) =>
    Engine.processIncomingWhatsAppMessage({ channel_id: CANAL, phone_number: '244900000001', contact_name: 'Cliente', content, direction: 'inbound', id });

(async () => {
    console.log('\n=== Conversa: menu e repetição de mensagens ===\n');

    await test('a saudação é enviada uma só vez; o menu espera pela resposta seguinte', async () => {
        tabela('automations').push(fluxoMenu());
        await receber('Olá');
        assert(enviadas.length === 1, `1ª mensagem devia enviar só a saudação, enviou ${enviadas.length}: ${enviadas.map(e => e.content).join(' | ')}`);
        enviadas.length = 0;
        await receber('1');
        const saudacoes = enviadas.filter(e => e.content.startsWith('Olá!')).length;
        assert(saudacoes === 0, `a saudação repetiu-se ao responder "1" (${saudacoes}x): ${enviadas.map(e => e.content).join(' | ')}`);
        assert(enviadas.some(e => e.content === 'Preços: 50.000 Kz'), `devia ter respondido a opção 1, enviou: ${enviadas.map(e => e.content).join(' | ')}`);
        assert(enviadas.length === 1, `devia ter enviado só a resposta da opção, enviou ${enviadas.length}`);
    });

    await test('opção inválida re-pergunta sem repetir o fluxo todo', async () => {
        tabela('automations').push(fluxoMenu());
        await receber('Olá');
        enviadas.length = 0;
        await receber('9');
        assert(!enviadas.some(e => e.content.startsWith('Olá!')), 'não devia repetir a saudação');
        enviadas.length = 0;
        await receber('2');
        assert(enviadas.some(e => e.content === 'Refeições incluídas'), `depois de errar, "2" devia funcionar: ${enviadas.map(e => e.content).join(' | ')}`);
    });

    await test('o mesmo evento entregue duas vezes só responde uma vez', async () => {
        tabela('automations').push(fluxoMenu());
        await receber('Olá', 'ID-REPETIDO');
        await receber('Olá', 'ID-REPETIDO');
        assert(enviadas.length === 1, `duplicado: enviou ${enviadas.length} mensagens (${enviadas.map(e => e.content).join(' | ')})`);
    });

    console.log('\n=== Condição ===\n');

    await test('condição verdadeira segue o ramo SIM', async () => {
        tabela('automations').push(fluxoCondicao('{{mensagem}}', 'sim'));
        await receber('sim');
        assert(enviadas[0]?.content === 'RAMO-SIM', `seguiu o ramo errado: ${enviadas.map(e => e.content).join(' | ')}`);
    });

    await test('variável escrita sem chavetas (mensagem) também funciona', async () => {
        tabela('automations').push(fluxoCondicao('mensagem', 'sim'));
        await receber('sim');
        assert(enviadas[0]?.content === 'RAMO-SIM', `sem chavetas foi para o ramo errado: ${enviadas.map(e => e.content).join(' | ')}`);
    });

    await test('maiúsculas, acentos e espaços não estragam a comparação', async () => {
        tabela('automations').push(fluxoCondicao('{{mensagem}}', 'nao'));
        await receber(' Não ');
        assert(enviadas[0]?.content === 'RAMO-SIM', `"Não" devia igualar "nao": ${enviadas.map(e => e.content).join(' | ')}`);
    });

    await test('condição falsa segue o ramo NÃO', async () => {
        tabela('automations').push(fluxoCondicao('{{mensagem}}', 'sim'));
        await receber('talvez');
        assert(enviadas[0]?.content === 'RAMO-NAO', `devia seguir NÃO: ${enviadas.map(e => e.content).join(' | ')}`);
    });

    console.log(`\n=== Aguardar resposta e caducidade ===\n`);

    await test('"Aguardar resposta" faz a pergunta, espera, e a resposta fica disponível', async () => {
        tabela('automations').push({
            id: 3, nome: 'Pergunta o nome', ativo: true, empresa_id: EMPRESA,
            nodes: [
                { id: 't1', type: 'trigger', data: { triggerKind: 'whatsapp_message', matchMode: 'any' } },
                { id: 'w1', type: 'action', data: { actionType: 'WAIT_REPLY', config: { mensagem: 'Como se chama?', guardarEm: 'nome_cliente' } } },
                { id: 'r1', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Muito prazer, {{nome_cliente}}!' } } }
            ],
            edges: [{ id: 'e0', source: 't1', target: 'w1' }, { id: 'e1', source: 'w1', target: 'r1' }]
        });
        await receber('Olá');
        assert(enviadas.length === 1 && enviadas[0].content === 'Como se chama?', `devia ter perguntado: ${enviadas.map(e => e.content).join(' | ')}`);
        enviadas.length = 0;
        await receber('Ana Paula');
        assert(enviadas.length === 1 && enviadas[0].content === 'Muito prazer, Ana Paula!', `devia usar a resposta: ${enviadas.map(e => e.content).join(' | ')}`);
    });

    await test('estado caducado faz a conversa recomeçar do início', async () => {
        tabela('automations').push(fluxoMenu());
        await receber('Olá');
        enviadas.length = 0;
        tabela('wa_conversations')[0].fluxo_ate = new Date(Date.now() - 60000).toISOString();
        await receber('1');
        assert(enviadas.some(e => e.content.startsWith('Olá!')), 'depois de caducar, devia recomeçar com a saudação');
    });

    await test('fluxo desativado a meio: o estado é limpo e a conversa segue o caminho normal', async () => {
        tabela('automations').push(fluxoMenu());
        await receber('Olá');
        enviadas.length = 0;
        tabela('automations')[0].ativo = false;
        await receber('1');
        // Com o fluxo desligado, o estado pendente é descartado e a mensagem segue o
        // caminho normal (assistente de IA, se estiver ligado) — nunca fica sem resposta.
        assert(!enviadas.some(e => e.content.startsWith('Olá!')), 'não devia repetir a saudação de um fluxo desligado');
        assert(!tabela('wa_conversations')[0].fluxo_node_id, 'o estado pendente devia ter sido limpo');
    });

    console.log(`\n=== Menus encadeados (submenu e voltar ao menu) ===\n`);

    // Menu principal → opção 1 abre o submenu de preços → opção 2 do submenu volta
    // ao menu principal. É o cenário que o cliente descreveu.
    function fluxoMenusEncadeados() {
        return {
            id: 4, nome: 'Menus encadeados', ativo: true, empresa_id: EMPRESA,
            nodes: [
                { id: 't1', type: 'trigger', data: { triggerKind: 'whatsapp_message', matchMode: 'any' } },
                { id: 'saudacao', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Bem-vindo à Residencial!' } } },
                { id: 'principal', type: 'menu', data: {
                    pergunta: 'MENU: 1 - Preços | 2 - Reservar',
                    options: [{ id: 'p1', label: 'Preços', matchValue: '1' }, { id: 'p2', label: 'Reservar', matchValue: '2' }]
                } },
                { id: 'sub', type: 'menu', data: {
                    pergunta: 'PREÇOS: 1 - Quarto simples | 2 - Voltar',
                    options: [{ id: 's1', label: 'Simples', matchValue: '1' }, { id: 's2', label: 'Voltar', matchValue: '2' }]
                } },
                { id: 'preco_simples', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Quarto simples: 45.000 Kz' } } },
                { id: 'voltar', type: 'action', data: { actionType: 'GOTO_MENU', config: { menuNodeId: 'principal' } } },
                { id: 'reservar', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Vamos reservar!' } } }
            ],
            edges: [
                { id: 'e0', source: 't1', target: 'saudacao' },
                { id: 'e1', source: 'saudacao', target: 'principal' },
                { id: 'e2', source: 'principal', target: 'sub', sourceHandle: 'p1' },
                { id: 'e3', source: 'principal', target: 'reservar', sourceHandle: 'p2' },
                { id: 'e4', source: 'sub', target: 'preco_simples', sourceHandle: 's1' },
                { id: 'e5', source: 'sub', target: 'voltar', sourceHandle: 's2' },
                { id: 'e6', source: 'preco_simples', target: 'voltar' }
            ]
        };
    }

    await test('o menu faz a sua própria pergunta e espera', async () => {
        tabela('automations').push(fluxoMenusEncadeados());
        await receber('Olá');
        assert(enviadas.length === 2, `esperava saudação + pergunta do menu, veio ${enviadas.length}: ${enviadas.map(e => e.content).join(' | ')}`);
        assert(enviadas[1].content.startsWith('MENU:'), `a segunda devia ser a pergunta do menu: ${enviadas[1].content}`);
    });

    await test('opção 1 abre o submenu; opção 2 do submenu volta ao menu principal', async () => {
        tabela('automations').push(fluxoMenusEncadeados());
        await receber('Olá');
        enviadas.length = 0;

        await receber('1');
        assert(enviadas.length === 1 && enviadas[0].content.startsWith('PREÇOS:'), `devia abrir o submenu: ${enviadas.map(e => e.content).join(' | ')}`);
        enviadas.length = 0;

        await receber('2');   // "Voltar" dentro do submenu
        assert(enviadas.length === 1 && enviadas[0].content.startsWith('MENU:'), `devia voltar ao menu principal: ${enviadas.map(e => e.content).join(' | ')}`);
        assert(!enviadas.some(e => e.content.startsWith('Bem-vindo')), 'não devia repetir a saudação ao voltar');
        enviadas.length = 0;

        await receber('2');   // agora "Reservar" no menu principal
        assert(enviadas.some(e => e.content === 'Vamos reservar!'), `devia reservar: ${enviadas.map(e => e.content).join(' | ')}`);
    });

    await test('depois de uma resposta do submenu, volta ao menu principal e aceita nova escolha', async () => {
        tabela('automations').push(fluxoMenusEncadeados());
        await receber('Olá');
        await receber('1');
        enviadas.length = 0;
        await receber('1');   // quarto simples → responde e volta ao menu
        assert(enviadas.some(e => e.content === 'Quarto simples: 45.000 Kz'), `devia dar o preço: ${enviadas.map(e => e.content).join(' | ')}`);
        assert(enviadas.some(e => e.content.startsWith('MENU:')), 'depois do preço devia voltar ao menu principal');
        enviadas.length = 0;
        await receber('2');
        assert(enviadas.some(e => e.content === 'Vamos reservar!'), `o menu principal devia continuar a funcionar: ${enviadas.map(e => e.content).join(' | ')}`);
    });

    await test('resposta inválida num menu com pergunta própria repete essa pergunta', async () => {
        tabela('automations').push(fluxoMenusEncadeados());
        await receber('Olá');
        enviadas.length = 0;
        await receber('xpto');
        assert(enviadas.length === 1 && /não percebi/i.test(enviadas[0].content) && enviadas[0].content.includes('MENU:'),
            `devia repetir a pergunta do menu: ${enviadas.map(e => e.content).join(' | ')}`);
    });

    console.log(`\n=== Simulador (execução a seco) ===\n`);

    await test('simulação percorre o fluxo sem enviar nada para fora', async () => {
        const fluxo = fluxoMenusEncadeados();
        const r1 = await Engine.simular(fluxo, 'Olá', null);
        assert(enviadas.length === 0, 'a simulação não pode enviar mensagens reais');
        assert(r1.mensagens.map((m: any) => m.texto).some((t: string) => t.startsWith('Bem-vindo')), `devia mostrar a saudação: ${JSON.stringify(r1.mensagens)}`);
        assert(r1.mensagens.some((m: any) => m.texto.startsWith('MENU:')), 'devia mostrar a pergunta do menu');
        assert(r1.pendente?.nodeId === 'principal', `devia ficar à espera no menu principal: ${JSON.stringify(r1.pendente)}`);
        assert(r1.passos[0].tipo === 'trigger' && r1.passos.some((p: any) => p.titulo.includes('à espera')), `passos inesperados: ${JSON.stringify(r1.passos)}`);

        const r2 = await Engine.simular(fluxo, '1', r1.pendente);
        assert(r2.mensagens.some((m: any) => m.texto.startsWith('PREÇOS:')), `opção 1 devia abrir o submenu: ${JSON.stringify(r2.mensagens)}`);
        assert(r2.passos.some((p: any) => p.titulo.includes('opção "Preços"')), `devia registar a opção escolhida: ${JSON.stringify(r2.passos)}`);

        const r3 = await Engine.simular(fluxo, '2', r2.pendente);
        assert(r3.passos.some((p: any) => p.titulo === 'Voltar ao menu'), 'devia registar o "Voltar ao menu"');
        assert(r3.mensagens.some((m: any) => m.texto.startsWith('MENU:')), 'devia voltar a mostrar o menu principal');
        assert(enviadas.length === 0, 'continua sem enviar nada real');
    });

    await test('simulação avisa quando o gatilho não reage à mensagem', async () => {
        const fluxo = fluxoCondicao('{{mensagem}}', 'sim');
        (fluxo.nodes[0] as any).data = { triggerKind: 'whatsapp_message', matchMode: 'keyword', matchValue: 'orçamento' };
        const r = await Engine.simular(fluxo, 'bom dia', null);
        assert(r.terminou && r.passos[0].titulo.includes('não reage'), `devia explicar que o gatilho não reage: ${JSON.stringify(r.passos)}`);
        assert(r.mensagens.length === 0, 'não devia haver respostas');
    });

    await test('simulação mostra o resultado da condição e o ramo seguido', async () => {
        const fluxo = fluxoCondicao('{{mensagem}}', 'sim');
        const r = await Engine.simular(fluxo, 'SIM', null);
        const cond = r.passos.find((p: any) => p.tipo === 'condition');
        assert(!!cond && cond.titulo === 'Condição: SIM', `devia registar a condição verdadeira: ${JSON.stringify(r.passos)}`);
        assert(r.mensagens.some((m: any) => m.texto === 'RAMO-SIM'), 'devia seguir o ramo SIM');
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (failed) { falhas.forEach(f => console.log('  - ' + f)); process.exit(1); }
    process.exit(0);
})();
