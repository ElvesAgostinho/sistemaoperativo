/**
 * Testes do webhook do WhatsApp: os dois lados da conversa.
 *
 * O inbox mostrava só metade do diálogo — o que os outros escreviam. Tudo o que
 * o dono enviava (texto, áudios, fotos), do telemóvel ou da app, era deitado
 * fora à chegada. Estes testes seguram as duas pontas: as nossas mensagens
 * entram e aparecem do lado certo, e nunca disparam fluxos nem aparecem a dobrar.
 *
 * Uso: npx ts-node scripts/testWebhookWhatsApp.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import path from 'path';
import express from 'express';

// ============================================================
// Base de dados em memória
// ============================================================
const db: Record<string, any[]> = {};
const tabela = (t: string) => (db[t] = db[t] || []);
let seq = 1;

const bate = (row: any, f: any[]) => f.every(x => {
    const v = x.col.includes('->>') ? (row[x.col.split('->>')[0]] || {})[x.col.split('->>')[1]] : row[x.col];
    if (x.op === 'eq') return String(v) === String(x.val);
    if (x.op === 'in') return x.val.map(String).includes(String(v));
    return true;
});

function mockFrom(t: string) {
    const filtros: any[] = [];
    let op = 'select'; let payload: any = null;
    const self: any = {}; const ret = () => self;
    self.select = ret; self.order = ret; self.limit = ret; self.not = ret; self.or = ret; self.is = ret; self.gte = ret; self.lte = ret;
    self.insert = (p: any) => { op = 'insert'; payload = p; return self; };
    self.update = (p: any) => { op = 'update'; payload = p; return self; };
    self.delete = () => { op = 'delete'; return self; };
    self.eq = (col: string, val: any) => { filtros.push({ col, val, op: 'eq' }); return self; };
    self.in = (col: string, val: any[]) => { filtros.push({ col, val, op: 'in' }); return self; };
    self.filter = (col: string, _o: string, val: any) => { filtros.push({ col, val, op: 'eq' }); return self; };

    const correr = () => {
        const linhas = tabela(t);
        if (op === 'insert') {
            const novos = (Array.isArray(payload) ? payload : [payload]).map(p => ({ id: p.id ?? `id-${seq++}`, ...p }));
            for (const n of novos) {
                // O índice único de eventos processados, replicado aqui.
                if (t === 'wa_eventos_processados' && linhas.some(l => l.chave === n.chave)) {
                    return { data: null, error: { code: '23505', message: 'duplicate key' } };
                }
                linhas.push(n);
            }
            return { data: Array.isArray(payload) ? novos : novos[0], error: null };
        }
        if (op === 'update') { const alvo = linhas.filter(l => bate(l, filtros)); alvo.forEach(l => Object.assign(l, payload)); return { data: alvo, error: null }; }
        if (op === 'delete') { db[t] = linhas.filter(l => !bate(l, filtros)); return { data: [], error: null }; }
        return { data: linhas.filter(l => bate(l, filtros)).map(l => JSON.parse(JSON.stringify(l))), error: null };
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
    storage: {
        from: () => ({
            upload: async () => ({ error: null }),
            getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://storage.exemplo/${caminho}` } })
        })
    }
};
const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });

const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);

const enviadas: string[] = [];
const waPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'WhatsAppChannelManager'));
const { WhatsAppChannelManager: WaReal } = require(waPath);
WaReal.sendMessage = async (_s: any, _c: string, _p: string, m: string) => { enviadas.push(m); return 'mid'; };
WaReal.sendMediaMessage = async () => true;

const emailPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'EmailService'));
require.cache[emailPath] = fake({ EmailService: { enviarEmailPersonalizado: async () => true, isConfigured: async () => true } }, emailPath);

class MockOpenAI {
    embeddings = { create: async () => ({ data: [{ embedding: new Array(1536).fill(0.001) }] }) };
    chat = { completions: { create: async () => ({ choices: [{ message: { content: 'ia' } }] }) } };
}
require.cache[require.resolve('openai')] = fake(MockOpenAI, require.resolve('openai'));

// A Evolution é substituída: devolve sempre um áudio decifrado.
const fetchReal = globalThis.fetch;
let historicoDaEvolution: any[] = [];
(globalThis as any).fetch = async (url: any, opts: any) => {
    const u = String(url);
    if (u.includes('/chat/getBase64FromMediaMessage/')) {
        return { ok: true, status: 200, json: async () => ({ base64: 'ZmFrZQ==', mimetype: 'audio/ogg' }) } as any;
    }
    if (u.includes('/chat/findMessages/')) {
        return { ok: true, status: 200, json: async () => ({ messages: { records: historicoDaEvolution } }) } as any;
    }
    if (u.includes('/chat/fetchProfile') || u.includes('/chat/fetchProfilePictureUrl')) {
        return { ok: true, status: 200, json: async () => ({}) } as any;
    }
    return fetchReal(url, opts);
};

process.env.AUTHENTICATION_API_KEY = '';   // webhook sem token obrigatório, para o teste
const authMwPath = require.resolve(path.join(__dirname, '..', 'src', 'middleware', 'authMiddleware'));
require.cache[authMwPath] = fake({
    requireAuth: (req: any, _s: any, n: any) => { req.user = { id: 'agente-1', empresa_id: EMPRESA }; n(); },
    AuthRequest: {}
}, authMwPath);

const EMPRESA = 'empresa-1';
const CANAL = 'chan-1';
const INSTANCIA = `SISTEMA_EMP_${EMPRESA}`;
const TELEFONE = '244923000111';

const whatsappRoutes = require(path.join(__dirname, '..', 'src', 'api', 'whatsappRoutes')).default;

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use('/api/whatsapp', whatsappRoutes);
const servidor = app.listen(0);
const PORTA = (servidor.address() as any).port;
const B = `http://127.0.0.1:${PORTA}`;

const webhook = async (corpo: any) => {
    const r = await fetchReal(`${B}/api/whatsapp/webhook/evolution`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo)
    });
    await new Promise(res => setTimeout(res, 120));   // o motor corre em segundo plano
    return r.status;
};

const evento = (msg: any) => ({ event: 'messages.upsert', instance: INSTANCIA, data: msg });

const texto = (id: string, fromMe: boolean, conteudo: string, pushName = 'Maria Cliente') => ({
    key: { id, remoteJid: `${TELEFONE}@s.whatsapp.net`, fromMe },
    pushName,
    message: { conversation: conteudo },
    messageTimestamp: Math.floor(Date.now() / 1000)
});

const audio = (id: string, fromMe: boolean) => ({
    key: { id, remoteJid: `${TELEFONE}@s.whatsapp.net`, fromMe },
    pushName: 'Maria Cliente',
    message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', ptt: true, seconds: 7 } },
    messageTimestamp: Math.floor(Date.now() / 1000)
});

let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };

async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    enviadas.length = 0; seq = 1; historicoDaEvolution = [];
    tabela('wa_channels').push({ id: CANAL, empresa_id: EMPRESA, provider: 'evolution', status: 'connected', credentials: { instanceName: INSTANCIA } });
    // O Assistente IA responde por omissao a tudo o que entra, e essa resposta
    // tambem fica gravada. Aqui esta desligado para se contar so o que o webhook
    // grava — senao cada mensagem recebida aparecia como duas.
    tabela('configuracoes').push({ id: 'cfg-1', empresa_id: EMPRESA, chave: 'ia_whatsapp_ativa', valor: 'false' });
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}

const mensagens = () => tabela('wa_messages');
const conversa = () => tabela('wa_conversations')[0];

(async () => {
    console.log('\n=== Os dois lados da conversa ===\n');

    await test('a mensagem de quem escreve para nós entra como recebida', async () => {
        await webhook(evento(texto('m1', false, 'Boa tarde, tem quartos?')));
        assert(mensagens().length === 1, `devia gravar 1 mensagem, gravou ${mensagens().length}`);
        assert(mensagens()[0].direction === 'inbound', `direção errada: ${mensagens()[0].direction}`);
        assert(mensagens()[0].content === 'Boa tarde, tem quartos?', `conteúdo errado: ${mensagens()[0].content}`);
    });

    await test('a mensagem que NÓS escrevemos também entra, do lado certo', async () => {
        // Era isto que faltava: o inbox mostrava só um lado do diálogo.
        await webhook(evento(texto('m2', true, 'Temos sim, para que dia?', 'Residencial Paraíso')));
        assert(mensagens().length === 1, `a nossa mensagem devia ser gravada, gravou ${mensagens().length}`);
        assert(mensagens()[0].direction === 'outbound', `devia ser "outbound", é "${mensagens()[0].direction}"`);
        assert(mensagens()[0].content === 'Temos sim, para que dia?', `conteúdo errado: ${mensagens()[0].content}`);
    });

    await test('a conversa fica com as duas mensagens, por ordem', async () => {
        await webhook(evento(texto('m1', false, 'Boa tarde')));
        await webhook(evento(texto('m2', true, 'Boa tarde! Em que posso ajudar?', 'Residencial Paraíso')));
        assert(mensagens().length === 2, `deviam ser 2 mensagens, são ${mensagens().length}`);
        assert(mensagens().map(m => m.direction).join(',') === 'inbound,outbound', `ordem/direções erradas: ${mensagens().map(m => m.direction).join(',')}`);
        assert(tabela('wa_conversations').length === 1, 'as duas pertencem à mesma conversa');
    });

    await test('o nosso nome não rouba o nome do contacto', async () => {
        // O pushName de uma mensagem nossa é o NOSSO nome. Usá-lo renomeava a
        // conversa do cliente com o nome da empresa.
        await webhook(evento(texto('m1', false, 'Olá', 'Maria Cliente')));
        await webhook(evento(texto('m2', true, 'Olá Maria', 'Residencial Paraíso')));
        assert(conversa().contact_name === 'Maria Cliente', `a conversa ficou com o nome errado: ${conversa().contact_name}`);
    });

    console.log('\n=== Áudios ===\n');

    await test('o áudio que recebemos fica pronto a ouvir', async () => {
        await webhook(evento(audio('a1', false)));
        assert(mensagens().length === 1, 'devia gravar o áudio');
        assert(/\[MEDIA_URL:https?:\/\//.test(mensagens()[0].content), `devia guardar o link do áudio: ${mensagens()[0].content}`);
        assert(mensagens()[0].content !== '[Áudio]', 'não devia ficar só o texto de reserva');
    });

    await test('o áudio que NÓS gravamos também aparece', async () => {
        await webhook(evento(audio('a2', true)));
        assert(mensagens().length === 1, `devia gravar o nosso áudio, gravou ${mensagens().length}`);
        assert(mensagens()[0].direction === 'outbound', `devia ser "outbound": ${mensagens()[0].direction}`);
        assert(/\[MEDIA_URL:/.test(mensagens()[0].content), `devia trazer o link: ${mensagens()[0].content}`);
    });

    console.log('\n=== Sem repetições e sem ciclos ===\n');

    await test('a mensagem enviada pela app não aparece duas vezes', async () => {
        // A app grava ao enviar; o WhatsApp devolve a mesma mensagem pelo webhook.
        tabela('wa_conversations').push({ id: 'conv-1', channel_id: CANAL, empresa_id: EMPRESA, phone_number: TELEFONE, contact_name: 'Maria Cliente' });
        tabela('wa_messages').push({ id: 'x1', conversation_id: 'conv-1', message_id: 'enviada-pela-app', direction: 'outbound', content: 'Já lhe respondo' });
        await webhook(evento(texto('enviada-pela-app', true, 'Já lhe respondo', 'Residencial Paraíso')));
        assert(mensagens().length === 1, `devia continuar com 1, tem ${mensagens().length}`);
    });

    await test('a nossa própria mensagem não faz o fluxo responder', async () => {
        tabela('automations').push({
            id: 1, nome: 'Responder a tudo', ativo: true, empresa_id: EMPRESA,
            nodes: [
                { id: 't1', type: 'trigger', data: { triggerKind: 'whatsapp_message', matchMode: 'any' } },
                { id: 'r1', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'resposta automática' } } }
            ],
            edges: [{ id: 'e1', source: 't1', target: 'r1' }]
        });
        await webhook(evento(texto('m2', true, 'Boa tarde!', 'Residencial Paraíso')));
        assert(enviadas.length === 0, `o fluxo não podia responder à nossa própria mensagem: ${enviadas.join(' | ')}`);
        // E continua a responder a quem escreve para nós:
        await webhook(evento(texto('m1', false, 'Boa tarde')));
        assert(enviadas.length === 1, `devia responder a quem escreve: ${enviadas.length} respostas`);
    });

    await test('o mesmo evento entregue duas vezes só grava uma', async () => {
        await webhook(evento(texto('repetida', true, 'Olá', 'Residencial Paraíso')));
        await webhook(evento(texto('repetida', true, 'Olá', 'Residencial Paraíso')));
        assert(mensagens().length === 1, `devia gravar 1, gravou ${mensagens().length}`);
    });

    console.log('\n=== Trazer o histórico que falta ===\n');

    await test('importa as mensagens antigas, dos dois lados', async () => {
        tabela('wa_conversations').push({ id: 'conv-1', channel_id: CANAL, empresa_id: EMPRESA, phone_number: TELEFONE, contact_name: 'Maria Cliente' });
        historicoDaEvolution = [
            texto('h1', false, 'E tu tens?'),
            texto('h2', true, 'Tens razão. Nesse momento...'),
            audio('h3', true)
        ];
        const r = await fetchReal(`${B}/api/whatsapp/evolution/sync-mensagens`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversation_id: 'conv-1' })
        });
        const d: any = await r.json();
        assert(d.success && d.importadas === 3, `deviam entrar 3, entraram ${d.importadas}: ${JSON.stringify(d)}`);
        const direcoes = mensagens().map(m => m.direction).join(',');
        assert(direcoes === 'inbound,outbound,outbound', `direções erradas: ${direcoes}`);
        assert(/\[MEDIA_URL:/.test(mensagens()[2].content), `o áudio antigo devia vir com link: ${mensagens()[2].content}`);
    });

    await test('importar outra vez não duplica nada', async () => {
        tabela('wa_conversations').push({ id: 'conv-1', channel_id: CANAL, empresa_id: EMPRESA, phone_number: TELEFONE, contact_name: 'Maria Cliente' });
        historicoDaEvolution = [texto('h1', false, 'Olá'), texto('h2', true, 'Olá!')];
        const pedir = () => fetchReal(`${B}/api/whatsapp/evolution/sync-mensagens`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversation_id: 'conv-1' })
        }).then(r => r.json() as any);
        const a = await pedir();
        const b = await pedir();
        assert(a.importadas === 2, `à primeira deviam entrar 2, entraram ${a.importadas}`);
        assert(b.importadas === 0, `à segunda não devia entrar nada, entraram ${b.importadas}`);
        assert(mensagens().length === 2, `deviam ficar 2 mensagens, ficaram ${mensagens().length}`);
    });

    await test('não traz o histórico de uma conversa de outra empresa', async () => {
        tabela('wa_conversations').push({ id: 'conv-outra', channel_id: 'chan-outra', empresa_id: 'empresa-2', phone_number: '244999999999' });
        const r = await fetchReal(`${B}/api/whatsapp/evolution/sync-mensagens`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversation_id: 'conv-outra' })
        });
        assert(r.status === 404, `devia recusar, deu ${r.status}`);
    });

    servidor.unref();
    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (falhas.length) console.log('Falhou:\n  - ' + falhas.join('\n  - '));
    process.exit(failed === 0 ? 0 : 1);
})();
