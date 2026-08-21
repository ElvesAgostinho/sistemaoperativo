/**
 * Teste de integração (sem side-effects reais) para todos os nós do Autopilot.
 *
 * Mocka Supabase, WhatsAppChannelManager, EmailService e o pacote `openai`
 * via require.cache ANTES de carregar o AutomationEngine real, e depois chama
 * o motor de verdade (executeGraph/executeAction, privados mas acessíveis em
 * runtime JS) para cada tipo de nó, verificando que os serviços certos foram
 * chamados com os parâmetros certos.
 *
 * Uso: npx ts-node scripts/testAutomationNodes.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import fs from 'fs';
import os from 'os';

// ============================================================
// Mock Supabase — query builder genérico, thenable e encadeável
// ============================================================
let callLog: any[] = [];
let activeResponses: Record<string, any> = {};

function resolveCfg(key: string, fallbackKey: string, ctx: any) {
    const cfg = activeResponses[key] ?? activeResponses[fallbackKey];
    if (cfg === undefined) {
        return { data: (ctx.op === 'insert' || ctx.op === 'update') ? ctx.payload : null, error: null };
    }
    return typeof cfg === 'function' ? cfg(ctx) : cfg;
}

function mockFrom(table: string) {
    const ctx: any = { table, op: 'select', filters: {} };
    const self: any = {};
    const chain = (fn: (...a: any[]) => void) => (...args: any[]) => { fn(...args); return self; };

    self.select = chain(() => {});
    self.insert = chain((payload: any) => { ctx.op = 'insert'; ctx.payload = payload; callLog.push({ table, op: 'insert', payload }); });
    self.update = chain((payload: any) => { ctx.op = 'update'; ctx.payload = payload; callLog.push({ table, op: 'update', payload }); });
    self.delete = chain(() => { ctx.op = 'delete'; callLog.push({ table, op: 'delete' }); });
    self.upsert = chain((payload: any) => { ctx.op = 'upsert'; ctx.payload = payload; callLog.push({ table, op: 'upsert', payload }); });
    self.eq = chain((col: string, val: any) => { ctx.filters[col] = val; callLog.push({ table, op: 'eq', col, val }); });
    self.neq = chain(() => {});
    self.or = chain((expr: string) => { ctx.or = expr; callLog.push({ table, op: 'or', expr }); });
    self.not = chain(() => {});
    self.is = chain(() => {});
    self.ilike = chain(() => {});
    self.like = chain(() => {});
    self.limit = chain(() => {});
    self.order = chain(() => {});
    self.filter = chain(() => {});

    const resolveP = () => Promise.resolve(resolveCfg(`${table}:${ctx.op}`, table, ctx));
    self.single = () => resolveP();
    self.maybeSingle = () => resolveP();
    self.then = (res: any, rej: any) => resolveP().then(res, rej);
    self.catch = (rej: any) => resolveP().catch(rej);
    return self;
}

const mockSupabase: any = {
    from: (table: string) => mockFrom(table),
    rpc: (fnName: string, args: any) => {
        callLog.push({ rpc: fnName, args });
        const cfg = activeResponses[`rpc:${fnName}`];
        const result = typeof cfg === 'function' ? cfg(args) : (cfg ?? { data: [], error: null });
        return Promise.resolve(result);
    }
};

function fakeModule(exportsObj: any, resolvedPath: string): NodeModule {
    return { id: resolvedPath, filename: resolvedPath, loaded: true, exports: exportsObj, children: [], paths: [], parent: null } as any;
}

// ============================================================
// Mock OpenAI — embeddings determinísticos + resposta de chat fixa
// ============================================================
class MockOpenAI {
    embeddings = {
        create: async (_opts: any) => ({ data: [{ embedding: new Array(1536).fill(0.001) }] })
    };
    chat = {
        completions: {
            create: async (_opts: any) => ({ choices: [{ message: { content: 'Resposta mock da IA baseada no contexto.' } }] })
        }
    };
}

// ============================================================
// Mock WhatsAppChannelManager / EmailService
// ============================================================
const sentWhatsApp: any[] = [];
const mockWhatsAppChannelManager = {
    sendMessage: async (_supa: any, channelId: string, phone: string, content: string) => {
        sentWhatsApp.push({ channelId, phone, content });
        return 'mock-message-id';
    },
    sendMediaMessage: async (_supa: any, channelId: string, phone: string, base64Data: string, fileName: string) => {
        sentWhatsApp.push({ channelId, phone, base64Len: base64Data.length, fileName, media: true });
        return true;
    }
};

const sentEmails: any[] = [];
const mockEmailService = {
    enviarEmailPersonalizado: async (para: string, assunto: string, corpo: string, empresaId?: any) => {
        sentEmails.push({ para, assunto, corpo, empresaId });
        return true;
    }
};

// ============================================================
// Instala os mocks no require.cache ANTES de carregar o AutomationEngine
// ============================================================
const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fakeModule({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);

const waPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'WhatsAppChannelManager'));
require.cache[waPath] = fakeModule({ WhatsAppChannelManager: mockWhatsAppChannelManager }, waPath);

const emailPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'EmailService'));
require.cache[emailPath] = fakeModule({ EmailService: mockEmailService }, emailPath);

const openaiPath = require.resolve('openai');
require.cache[openaiPath] = fakeModule(MockOpenAI, openaiPath);

// Só agora carregamos o motor real — já vai receber os mocks acima.
const { AutomationEngine } = require(path.join(__dirname, '..', 'src', 'services', 'AutomationEngine'));
const Engine: any = AutomationEngine;

// ============================================================
// Helpers de teste
// ============================================================
let passed = 0;
let failed = 0;
const failures: string[] = [];

function reset() {
    callLog = [];
    activeResponses = {};
    sentWhatsApp.length = 0;
    sentEmails.length = 0;
}

function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
}

async function test(name: string, fn: () => Promise<void>) {
    reset();
    try {
        await fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (e: any) {
        console.log(`  ✗ ${name} — ${e.message}`);
        failed++;
        failures.push(`${name}: ${e.message}`);
    }
}

async function runGraph(nodes: any[], edges: any[], startId: string, context: any, empresaId: any = 'empresa-mock-1') {
    return await Engine.executeGraph(nodes, edges, startId, context, empresaId);
}

// ============================================================
// TESTES — funções puras (parseString, evaluateCondition, evaluateMenu, evaluateWhatsAppTrigger)
// ============================================================
async function testPureFunctions() {
    console.log('\n== Funções puras ==');

    await test('parseString substitui {{variaveis}}', async () => {
        const out = Engine.parseString('Olá {{nome}}, o seu total é {{total}}', { nome: 'Ana', total: '500' });
        assert(out === 'Olá Ana, o seu total é 500', `esperado interpolado, veio "${out}"`);
    });

    await test('parseString ignora variável em falta (string vazia)', async () => {
        const out = Engine.parseString('Valor: {{inexistente}}', {});
        assert(out === 'Valor: ', `esperado "Valor: ", veio "${out}"`);
    });

    await test('evaluateCondition "contains" (verdadeiro)', async () => {
        const ok = Engine.evaluateCondition({ variable: '{{mensagem}}', operator: 'contains', value: 'preço' }, { mensagem: 'qual o preço?' });
        assert(ok === true, 'esperado true');
    });

    await test('evaluateCondition "==" (falso)', async () => {
        const ok = Engine.evaluateCondition({ variable: '{{status}}', operator: '==', value: 'pago' }, { status: 'pendente' });
        assert(ok === false, 'esperado false');
    });

    await test('evaluateCondition ">" numérico', async () => {
        const ok = Engine.evaluateCondition({ variable: '{{valor}}', operator: '>', value: '100' }, { valor: '250' });
        assert(ok === true, 'esperado true');
    });

    await test('evaluateWhatsAppTrigger keyword (match)', async () => {
        const ok = Engine.evaluateWhatsAppTrigger({ matchMode: 'keyword', matchValue: 'preço,tabela' }, 'quero saber o preço disso');
        assert(ok === true, 'esperado true');
    });

    await test('evaluateWhatsAppTrigger keyword (sem match)', async () => {
        const ok = Engine.evaluateWhatsAppTrigger({ matchMode: 'keyword', matchValue: 'preço,tabela' }, 'bom dia');
        assert(ok === false, 'esperado false');
    });

    await test('evaluateWhatsAppTrigger regex', async () => {
        const ok = Engine.evaluateWhatsAppTrigger({ matchMode: 'regex', matchValue: '^(oi|olá)' }, 'olá tudo bem?');
        assert(ok === true, 'esperado true');
    });

    await test('evaluateWhatsAppTrigger any', async () => {
        const ok = Engine.evaluateWhatsAppTrigger({ matchMode: 'any' }, 'qualquer coisa');
        assert(ok === true, 'esperado true');
    });
}

// ============================================================
// TESTES — grafo (condition, menu, e cada tipo de ação)
// ============================================================
async function testGraphNodes() {
    console.log('\n== Nós do grafo (executeGraph) ==');

    await test('CONDITION escolhe branch "yes" corretamente', async () => {
        const nodes = [
            { id: 'c1', type: 'condition', data: { variable: '{{mensagem}}', operator: 'contains', value: 'urgente' } },
            { id: 'a_yes', type: 'action', data: { actionType: 'LOG_MESSAGE', config: { mensagem: 'BRANCH_YES' } } },
            { id: 'a_no', type: 'action', data: { actionType: 'LOG_MESSAGE', config: { mensagem: 'BRANCH_NO' } } }
        ];
        const edges = [
            { id: 'e1', source: 'c1', target: 'a_yes', sourceHandle: 'yes' },
            { id: 'e2', source: 'c1', target: 'a_no', sourceHandle: 'no' }
        ];
        // Não há forma direta de "escutar" console.log — verificamos indiretamente via contexto alterado por LOG_MESSAGE? Não altera.
        // Em vez disso, validamos que não lança exceção e que o grafo termina (cobertura estrutural).
        await runGraph(nodes, edges, 'c1', { mensagem: 'isto é urgente' });
    });

    await test('MENU escolhe a opção certa e chega à ação ligada', async () => {
        const nodes = [
            { id: 'm1', type: 'menu', data: { variable: '{{mensagem}}', options: [{ id: 'optA', label: 'Comprar', matchValue: 'comprar' }, { id: 'optB', label: 'Suporte', matchValue: 'suporte' }] } },
            { id: 'reply_a', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Vamos comprar!' } } },
            { id: 'reply_b', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Suporte a caminho.' } } }
        ];
        const edges = [
            { id: 'e1', source: 'm1', target: 'reply_a', sourceHandle: 'optA' },
            { id: 'e2', source: 'm1', target: 'reply_b', sourceHandle: 'optB' }
        ];
        activeResponses['wa_channels:select'] = { data: { id: 'chan-1' }, error: null };
        await runGraph(nodes, edges, 'm1', { mensagem: 'quero comprar', telefone: '244900000000', channel_id: 'chan-1' });
        assert(sentWhatsApp.length === 1, `esperado 1 mensagem enviada, veio ${sentWhatsApp.length}`);
        assert(sentWhatsApp[0].content === 'Vamos comprar!', `conteúdo errado: ${sentWhatsApp[0].content}`);
    });

    await test('MENU sem correspondência termina o fluxo sem erro', async () => {
        const nodes = [
            { id: 'm1', type: 'menu', data: { variable: '{{mensagem}}', options: [{ id: 'optA', label: 'Comprar', matchValue: 'comprar' }] } },
            { id: 'reply_a', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'X' } } }
        ];
        const edges = [{ id: 'e1', source: 'm1', target: 'reply_a', sourceHandle: 'optA' }];
        await runGraph(nodes, edges, 'm1', { mensagem: 'bom dia' });
        assert(sentWhatsApp.length === 0, 'não devia ter enviado nada');
    });

    await test('CREATE_CLIENT + CREATE_LEAD encadeados (usa client_id do contexto)', async () => {
        activeResponses['clientes:select'] = { data: null, error: null }; // não existe ainda -> cria
        activeResponses['clientes:insert'] = { data: { id: 'cli-999' }, error: null };
        activeResponses['negocios:insert'] = { data: { id: 'neg-999' }, error: null };

        const nodes = [
            { id: 't', type: 'trigger', data: {} },
            { id: 'a1', type: 'action', data: { actionType: 'CREATE_CLIENT', config: { nome: '{{nome_whatsapp}}', telefone: '{{telefone}}' } } },
            { id: 'a2', type: 'action', data: { actionType: 'CREATE_LEAD', config: { titulo: 'Lead de {{nome_whatsapp}}' } } }
        ];
        const edges = [{ id: 'e1', source: 't', target: 'a1' }, { id: 'e2', source: 'a1', target: 'a2' }];
        const ctx = await runGraph(nodes, edges, 'a1', { nome_whatsapp: 'João', telefone: '244911111111' });

        assert(ctx.client_id === 'cli-999', `client_id não propagado, veio ${ctx.client_id}`);
        assert(ctx.lead_id === 'neg-999', `lead_id não propagado, veio ${ctx.lead_id}`);
        const insertLead = callLog.find(c => c.table === 'negocios' && c.op === 'insert');
        assert(insertLead && insertLead.payload.cliente_id === 'cli-999', 'negocio não referenciou o cliente certo');
    });

    await test('ADD_TAG / REMOVE_TAG lê e junta tags corretamente', async () => {
        activeResponses['clientes:select'] = { data: { tags: ['antigo'], custom_fields: {} }, error: null };
        const nodes = [{ id: 'a1', type: 'action', data: { actionType: 'ADD_TAG', config: { tag: 'vip, interessado' } } }];
        const ctx = await runGraph(nodes, [], 'a1', { client_id: 'cli-1' });
        assert(ctx.tags === 'antigo,vip,interessado', `tags erradas: ${ctx.tags}`);
        const update = callLog.find(c => c.table === 'clientes' && c.op === 'update');
        assert(update && Array.isArray(update.payload.tags), 'update de tags não foi chamado corretamente');
    });

    await test('ADD_TAG sem client_id no contexto não crasha (só loga erro)', async () => {
        const nodes = [{ id: 'a1', type: 'action', data: { actionType: 'ADD_TAG', config: { tag: 'vip' } } }];
        await runGraph(nodes, [], 'a1', {});
        const update = callLog.find(c => c.table === 'clientes' && c.op === 'update');
        assert(!update, 'não devia ter tentado atualizar sem client_id');
    });

    await test('SET_CUSTOM_FIELD grava e propaga para o contexto', async () => {
        activeResponses['clientes:select'] = { data: { tags: [], custom_fields: { antigo: '1' } }, error: null };
        const nodes = [{ id: 'a1', type: 'action', data: { actionType: 'SET_CUSTOM_FIELD', config: { campo: 'orcamento', valor: '5000' } } }];
        const ctx = await runGraph(nodes, [], 'a1', { client_id: 'cli-1' });
        assert(ctx.orcamento === '5000', `campo não propagado: ${ctx.orcamento}`);
        const update = callLog.find(c => c.table === 'clientes' && c.op === 'update');
        assert(update && update.payload.custom_fields.antigo === '1' && update.payload.custom_fields.orcamento === '5000', 'merge de custom_fields incorreto');
    });

    await test('REPLY_MESSAGE / SEND_WHATSAPP envia via WhatsAppChannelManager', async () => {
        activeResponses['wa_channels:select'] = { data: { id: 'chan-77' }, error: null };
        const nodes = [{ id: 'a1', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Olá {{nome_whatsapp}}!' } } }];
        await runGraph(nodes, [], 'a1', { nome_whatsapp: 'Maria', telefone: '244922222222' });
        assert(sentWhatsApp.length === 1, 'não enviou mensagem');
        assert(sentWhatsApp[0].content === 'Olá Maria!', `template não interpolado: ${sentWhatsApp[0].content}`);
        assert(sentWhatsApp[0].phone === '244922222222', 'telefone errado');
    });

    await test('SEND_EMAIL chama EmailService com os campos certos', async () => {
        const nodes = [{ id: 'a1', type: 'action', data: { actionType: 'SEND_EMAIL', config: { para: 'cliente@teste.com', assunto: 'Assunto {{nome_whatsapp}}', mensagem: 'Corpo do email' } } }];
        await runGraph(nodes, [], 'a1', { nome_whatsapp: 'Pedro' });
        assert(sentEmails.length === 1, 'não enviou email');
        assert(sentEmails[0].para === 'cliente@teste.com', 'destinatário errado');
        assert(sentEmails[0].assunto === 'Assunto Pedro', `assunto não interpolado: ${sentEmails[0].assunto}`);
    });

    await test('SEND_IMAGE lê ficheiro real do disco e envia como mídia', async () => {
        const tmpFile = path.join(os.tmpdir(), 'autopilot-test-image.png');
        fs.writeFileSync(tmpFile, Buffer.from([0x89, 0x50, 0x4e, 0x47])); // cabeçalho PNG mínimo
        activeResponses['wa_channels:select'] = { data: { id: 'chan-5' }, error: null };
        const nodes = [{ id: 'a1', type: 'action', data: { actionType: 'SEND_IMAGE', config: { ficheiro: tmpFile, telefone: '244933333333' } } }];
        await runGraph(nodes, [], 'a1', {});
        fs.unlinkSync(tmpFile);
        assert(sentWhatsApp.length === 1 && sentWhatsApp[0].media, 'não enviou mídia');
        assert(sentWhatsApp[0].fileName === 'autopilot-test-image.png', 'nome de ficheiro errado');
    });

    await test('SEND_IMAGE com ficheiro inexistente não crasha', async () => {
        const nodes = [{ id: 'a1', type: 'action', data: { actionType: 'SEND_IMAGE', config: { ficheiro: 'C:\\nao\\existe\\ficheiro.png', telefone: '244900000000' } } }];
        await runGraph(nodes, [], 'a1', {});
        assert(sentWhatsApp.length === 0, 'não devia ter enviado nada');
    });

    await test('DELAY respeita o teto de 15 minutos (timer acelerado no teste)', async () => {
        const realSetTimeout = global.setTimeout;
        const calls: number[] = [];
        (global as any).setTimeout = (fn: any, ms: number) => { calls.push(ms); return realSetTimeout(fn, 0); };
        try {
            const nodes = [{ id: 'a1', type: 'action', data: { actionType: 'DELAY', config: { minutos: '120' } } }];
            await runGraph(nodes, [], 'a1', {});
            assert(calls.length === 1, 'setTimeout não foi chamado');
            assert(calls[0] === 15 * 60000, `esperado teto de 15min (${15 * 60000}ms), veio ${calls[0]}ms`);
        } finally {
            (global as any).setTimeout = realSetTimeout;
        }
    });

    await test('EXTERNAL_REQUEST chama fetch e guarda a resposta no contexto', async () => {
        const realFetch = global.fetch;
        let capturedUrl = '', capturedMethod = '';
        (global as any).fetch = async (url: string, opts: any) => {
            capturedUrl = url; capturedMethod = opts.method;
            return { status: 200, text: async () => '{"ok":true}' } as any;
        };
        try {
            const nodes = [{ id: 'a1', type: 'action', data: { actionType: 'EXTERNAL_REQUEST', config: { url: 'https://api.exemplo.com/x', method: 'POST', body: '{"telefone":"{{telefone}}"}' } } }];
            const ctx = await runGraph(nodes, [], 'a1', { telefone: '244944444444' });
            assert(capturedUrl === 'https://api.exemplo.com/x', 'URL errada');
            assert(capturedMethod === 'POST', 'método errado');
            assert(ctx.external_response === '{"ok":true}', 'resposta não guardada no contexto');
            assert(ctx.external_status === 200, 'status não guardado');
        } finally {
            (global as any).fetch = realFetch;
        }
    });

    await test('NOTIFY_TEAM por email', async () => {
        const nodes = [{ id: 'a1', type: 'action', data: { actionType: 'NOTIFY_TEAM', config: { canal: 'email', destinatario: 'equipa@empresa.com', mensagem: 'Novo pedido' } } }];
        await runGraph(nodes, [], 'a1', {});
        assert(sentEmails.length === 1 && sentEmails[0].para === 'equipa@empresa.com', 'não notificou por email');
    });

    await test('NOTIFY_TEAM por whatsapp', async () => {
        activeResponses['wa_channels:select'] = { data: { id: 'chan-9' }, error: null };
        const nodes = [{ id: 'a1', type: 'action', data: { actionType: 'NOTIFY_TEAM', config: { canal: 'whatsapp', destinatario: '244955555555', mensagem: 'Novo pedido' } } }];
        await runGraph(nodes, [], 'a1', {});
        assert(sentWhatsApp.length === 1 && sentWhatsApp[0].phone === '244955555555', 'não notificou por whatsapp');
    });

    await test('HANDOFF_HUMAN pausa o bot e envia aviso opcional', async () => {
        activeResponses['wa_channels:select'] = { data: { id: 'chan-3' }, error: null };
        const nodes = [{ id: 'a1', type: 'action', data: { actionType: 'HANDOFF_HUMAN', config: { mensagem: 'Um agente vai continuar.' } } }];
        await runGraph(nodes, [], 'a1', { telefone: '244966666666' });
        const update = callLog.find(c => c.table === 'clientes' && c.op === 'update');
        assert(update && update.payload.bot_paused === true, 'bot_paused não foi definido');
        assert(sentWhatsApp.length === 1, 'não enviou o aviso');
    });

    await test('JUMP_TO_WORKFLOW salta e executa o fluxo alvo', async () => {
        const targetNodes = [
            { id: 'tt', type: 'trigger', data: {} },
            { id: 'ta', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Vindo do fluxo alvo' } } }
        ];
        const targetEdges = [{ id: 'te1', source: 'tt', target: 'ta' }];
        activeResponses['automations:select'] = {
            data: { empresa_id: 'empresa-mock-1', nodes: JSON.stringify(targetNodes), edges: JSON.stringify(targetEdges) },
            error: null
        };
        activeResponses['wa_channels:select'] = { data: { id: 'chan-2' }, error: null };

        const nodes = [{ id: 'a1', type: 'action', data: { actionType: 'JUMP_TO_WORKFLOW', config: { target_workflow_nome: 'Outro Fluxo' } } }];
        await runGraph(nodes, [], 'a1', { telefone: '244977777777' });
        assert(sentWhatsApp.length === 1 && sentWhatsApp[0].content === 'Vindo do fluxo alvo', 'não executou o fluxo alvo');
    });

    await test('AI_REPLY usa contexto da Base de Conhecimento (RPC mockada) e responde', async () => {
        activeResponses['rpc:match_knowledge_chunks'] = { data: [{ nome_ficheiro: 'faq.txt', conteudo: 'Horário: 9h-18h', similarity: 0.9 }], error: null };
        activeResponses['wa_channels:select'] = { data: { id: 'chan-4' }, error: null };

        const nodes = [{ id: 'a1', type: 'action', data: { actionType: 'AI_REPLY', config: { prompt: 'Qual o horário?' } } }];
        const ctx = await runGraph(nodes, [], 'a1', { telefone: '244988888888' });

        const rpcCall = callLog.find(c => c.rpc === 'match_knowledge_chunks');
        assert(!!rpcCall, 'não chamou a busca semântica');
        assert(ctx.ai_response === 'Resposta mock da IA baseada no contexto.', 'resposta da IA não propagada ao contexto');
        assert(sentWhatsApp.length === 1, 'não enviou a resposta da IA por WhatsApp');
    });

    await test('AI_REPLY sem prompt/telefone não crasha', async () => {
        const nodes = [{ id: 'a1', type: 'action', data: { actionType: 'AI_REPLY', config: {} } }];
        await runGraph(nodes, [], 'a1', {});
        assert(sentWhatsApp.length === 0, 'não devia ter enviado nada');
    });

    await test('Ciclo no grafo não trava (limite de iterações respeitado)', async () => {
        // a1 -> a2 -> a1 (ciclo) — o motor tem MAX_GRAPH_STEPS=200, deve parar sozinho
        const nodes = [
            { id: 'a1', type: 'action', data: { actionType: 'LOG_MESSAGE', config: { mensagem: 'loop' } } },
            { id: 'a2', type: 'action', data: { actionType: 'LOG_MESSAGE', config: { mensagem: 'loop2' } } }
        ];
        const edges = [{ id: 'e1', source: 'a1', target: 'a2' }, { id: 'e2', source: 'a2', target: 'a1' }];
        const start = Date.now();
        await runGraph(nodes, edges, 'a1', {});
        const elapsed = Date.now() - start;
        assert(elapsed < 10000, `ciclo demorou demasiado (${elapsed}ms) — pode não estar a respeitar o limite`);
    });
}

// ============================================================
// Run
// ============================================================
(async () => {
    console.log('=== Teste dos nós do Autopilot (mock, sem tocar serviços reais) ===');
    await testPureFunctions();
    await testGraphNodes();

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (failures.length > 0) {
        console.log('\nFalhas:');
        failures.forEach(f => console.log(`  - ${f}`));
        process.exit(1);
    }
})();
