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
// O mesmo que o index.ts faz em producao: guardar o corpo EM BRUTO. A
// assinatura da Meta e calculada sobre os bytes exactos que ela enviou, e sem
// isto a verificacao era saltada — o teste passava a dizer que estava tudo bem
// numa aplicacao onde ninguem verificava nada.
app.use(express.json({
    limit: '20mb',
    verify: (req: any, _res: any, buf: Buffer) => { req.rawBody = buf; },
}));
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
    // Quem faz o pedido tem de existir mesmo: as rotas passaram a verificar as
    // permissoes no servidor, e o PermissaoService le o perfil e a licenca da
    // empresa. Sem estas duas linhas o guarda recusa — e bem, porque falha
    // fechado. Este teste nao e sobre permissoes, por isso o utilizador e dono.
    tabela('perfis').push({ id: 'agente-1', nome: 'Elves', role: 'admin', empresa_id: EMPRESA, ativo: true, permissoes: null });
    tabela('configuracoes').push({ id: 'lic-1', empresa_id: EMPRESA, chave: 'modulos_empresa', valor: JSON.stringify(['wa', 'crm', 'auto', 'email']) });
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

    console.log('\n=== Contactos que o WhatsApp manda sem número ("@lid") ===\n');

    // Visto em produção a 22/11/2026 (aqui com dados inventados): um cliente
    // passou a chegar só como "…@lid", com o "nome" trocado pelo código. A
    // mensagem caía numa conversa à parte, escondida — para a empresa, ele
    // não escrevia.
    const soLid = (id: string, conteudo: string) => ({
        key: { id, remoteJid: '11112222333344@lid', fromMe: false },
        pushName: '11112222333344',
        message: { conversation: conteudo },
        messageTimestamp: Math.floor(Date.now() / 1000),
    });

    await test('sem número, vai buscá-lo às outras mensagens do contacto e entra na conversa dele', async () => {
        const { WhatsAppLidService } = require(path.join(__dirname, '..', 'src', 'services', 'WhatsAppLidService'));
        WhatsAppLidService.limparCache();
        historicoDaEvolution = [
            { key: { id: 'antiga', remoteJid: '11112222333344@lid', remoteJidAlt: '244923000222@s.whatsapp.net', fromMe: false } },
        ];
        tabela('wa_conversations').push({ id: 'conv-y', channel_id: CANAL, empresa_id: EMPRESA, phone_number: '244923000222', contact_name: 'Joana Cliente' });
        await webhook(evento(soLid('nova', 'Bom dia, ainda tem?')));
        const m = mensagens().find(x => x.message_id === 'nova');
        assert(m, 'a mensagem devia ter entrado');
        assert(m.conversation_id === 'conv-y', `devia ir para a conversa do número: ${m.conversation_id}`);
        assert(!tabela('wa_conversations').some(c => String(c.phone_number).includes('@lid')), 'não devia nascer uma conversa "@lid"');
        assert(conversa().contact_name === 'Joana Cliente', `o código não substitui o nome: ${conversa().contact_name}`);
    });

    await test('aprende o número com uma mensagem que traz os dois, sem perguntar à Evolution', async () => {
        const { WhatsAppLidService } = require(path.join(__dirname, '..', 'src', 'services', 'WhatsAppLidService'));
        WhatsAppLidService.limparCache();
        await webhook(evento({
            key: { id: 'com-alt', remoteJid: '999@lid', remoteJidAlt: '244911222333@s.whatsapp.net', fromMe: false },
            pushName: 'Ana', message: { conversation: 'Olá' }, messageTimestamp: Math.floor(Date.now() / 1000),
        }));
        historicoDaEvolution = [];   // a Evolution já não ajuda
        await webhook(evento({ key: { id: 'so-lid', remoteJid: '999@lid', fromMe: false }, pushName: '999', message: { conversation: 'Está aí?' }, messageTimestamp: Math.floor(Date.now() / 1000) }));
        const convs = tabela('wa_conversations');
        assert(convs.length === 1 && convs[0].phone_number === '244911222333', `as duas deviam ficar na mesma conversa do número: ${JSON.stringify(convs.map(c => c.phone_number))}`);
    });

    await test('se não houver forma de saber o número, a mensagem entra na mesma (não se perde)', async () => {
        const { WhatsAppLidService } = require(path.join(__dirname, '..', 'src', 'services', 'WhatsAppLidService'));
        WhatsAppLidService.limparCache();
        historicoDaEvolution = [];
        await webhook(evento(soLid('perdida', 'Alguém me responde?')));
        assert(mensagens().some(x => x.message_id === 'perdida'), 'a mensagem tinha de entrar');
        assert(conversa().phone_number === '11112222333344@lid', conversa().phone_number);
    });

    await test('uma mensagem antiga recuperada entra à hora em que foi enviada e não faz o fluxo responder', async () => {
        const { tratarMensagemEvolution } = require(path.join(__dirname, '..', 'src', 'api', 'whatsappRoutes'));
        tabela('automations').push({
            id: 7, empresa_id: EMPRESA, nome: 'Responde a tudo', ativo: true,
            nodes: JSON.stringify([
                { id: 't', type: 'trigger', data: { triggerKind: 'whatsapp_message', matchMode: 'any' } },
                { id: 'r', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'RESPOSTA DO FLUXO' } } },
            ]),
            edges: JSON.stringify([{ id: 'e', source: 't', target: 'r' }]),
        });
        const ontem = Math.floor(Date.now() / 1000) - 86400;
        const ok = await tratarMensagemEvolution(
            { key: { id: 'antiga-1', remoteJid: `${TELEFONE}@s.whatsapp.net`, fromMe: false }, pushName: 'Rui', message: { conversation: 'Ainda tem stock?' }, messageTimestamp: ontem },
            INSTANCIA, { soGuardar: true, aguardar: true });
        assert(ok === true, 'devia ter tratado a mensagem');
        const m = mensagens().find(x => x.message_id === 'antiga-1');
        assert(m && m.content === 'Ainda tem stock?', 'a mensagem devia estar na conversa');
        assert(Math.abs(new Date(m.created_at).getTime() / 1000 - ontem) < 2, `devia ficar à hora original: ${m.created_at}`);
        assert(!enviadas.some((e: any) => JSON.stringify(e).includes('RESPOSTA DO FLUXO')), 'nenhum fluxo devia responder a uma mensagem de ontem');
    });

    await test('…e a mesma mensagem, recuperada logo (até 10 min), faz o fluxo responder', async () => {
        // O contraponto do teste anterior: prova que aqui os fluxos correm
        // mesmo, e que foi o "só guardar" que os calou.
        const { tratarMensagemEvolution } = require(path.join(__dirname, '..', 'src', 'api', 'whatsappRoutes'));
        tabela('automations').push({
            id: 8, empresa_id: EMPRESA, nome: 'Responde a tudo', ativo: true,
            nodes: JSON.stringify([
                { id: 't', type: 'trigger', data: { triggerKind: 'whatsapp_message', matchMode: 'any' } },
                { id: 'r', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'RESPOSTA DO FLUXO' } } },
            ]),
            edges: JSON.stringify([{ id: 'e', source: 't', target: 'r' }]),
        });
        await tratarMensagemEvolution(
            { key: { id: 'recente-1', remoteJid: `${TELEFONE}@s.whatsapp.net`, fromMe: false }, pushName: 'Rui', message: { conversation: 'Olá' }, messageTimestamp: Math.floor(Date.now() / 1000) - 60 },
            INSTANCIA, { soGuardar: false, aguardar: true });
        assert(enviadas.some((e: any) => JSON.stringify(e).includes('RESPOSTA DO FLUXO')), `o fluxo devia ter respondido: ${JSON.stringify(enviadas)}`);
    });

    await test('a caixa de conversas já não esconde os contactos sem número', async () => {
        // A lista de conversas filtrava "…@lid" — e com isso escondia mensagens
        // reais de clientes. (Lido do código: a rota precisa de mais do que este
        // simulador da base de dados tem.)
        const fonte = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'api', 'whatsappRoutes.ts'), 'utf8');
        const rota = fonte.slice(fonte.indexOf("router.get('/conversations',"), fonte.indexOf("router.get('/conversations',") + 900);
        assert(!/not\('phone_number',\s*'like',\s*'%@lid%'\)/.test(rota), 'a lista voltou a esconder as conversas @lid');
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

    console.log('\n=== A Meta a verificar o webhook ===\n');

    await test('aceita o token que a EMPRESA escreveu no painel', async () => {
        // Este era o erro. O painel pedia a cada empresa um token de
        // verificacao e guardava-o no canal dela, mas a rota so comparava com
        // uma variavel de ambiente unica, igual para toda a gente. O token
        // escrito no painel nunca era usado: a Meta recusava a verificacao e
        // ninguem percebia porque, porque o campo estava la, preenchido.
        delete process.env.META_VERIFY_TOKEN;
        tabela('wa_channels').push({
            id: 'chan-meta', empresa_id: EMPRESA, provider: 'meta',
            credentials: { phoneNumberId: '111', accessToken: 'tok', verifyToken: 'o-meu-segredo' },
        });

        const r = await fetchReal(
            `${B}/api/whatsapp/webhook/meta?hub.mode=subscribe&hub.verify_token=o-meu-segredo&hub.challenge=12345`,
        );
        assert(r.status === 200, `devia aceitar, deu ${r.status}`);
        assert((await r.text()) === '12345', 'tem de devolver o desafio da Meta tal e qual');
    });

    await test('recusa um token que nao e de ninguem', async () => {
        const r = await fetchReal(
            `${B}/api/whatsapp/webhook/meta?hub.mode=subscribe&hub.verify_token=adivinhado&hub.challenge=12345`,
        );
        assert(r.status === 403, `devia recusar, deu ${r.status}`);
    });

    await test('recusa sem token nenhum', async () => {
        const r = await fetchReal(`${B}/api/whatsapp/webhook/meta?hub.mode=subscribe&hub.challenge=12345`);
        assert(r.status === 403, `devia recusar, deu ${r.status}`);
    });

    await test('o token do servidor continua a valer, para quem ja o tinha', async () => {
        // Quem ja tinha isto a funcionar pela variavel de ambiente nao pode
        // ficar sem webhook por causa desta mudanca.
        process.env.META_VERIFY_TOKEN = 'o-do-servidor';
        const r = await fetchReal(
            `${B}/api/whatsapp/webhook/meta?hub.mode=subscribe&hub.verify_token=o-do-servidor&hub.challenge=9`,
        );
        assert(r.status === 200, `devia aceitar, deu ${r.status}`);
        delete process.env.META_VERIFY_TOKEN;
    });

    await test('o token de verificacao guarda-se mesmo com o token de acesso recusado', async () => {
        // O no cego. A Meta valida o webhook num passo separado e quase sempre
        // ANTES de tudo o resto estar bom. Com a regra antiga, um token de acesso
        // expirado impedia de guardar o que quer que fosse — e sem nada guardado
        // a verificacao do webhook falhava sempre, com a Meta a queixar-se do URL
        // ou do token quando o problema era outro. Foi exactamente o que o
        // cliente apanhou nas duas pontas ao mesmo tempo.
        db['wa_channels'] = [];
        delete process.env.META_VERIFY_TOKEN;

        const r = await fetchReal(`${B}/api/whatsapp/config/meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phoneNumberId: '1108136615719262',
                wabaId: '993787080042283',
                accessToken: 'um-token-que-expirou',
                verifyToken: 'jairotech',
            }),
        });

        const d: any = await r.json();
        assert(r.status === 400, `o token de acesso e mau, devia dizer que sim: ${r.status}`);
        assert(d.tokenDeVerificacaoGuardado === true, `devia avisar que guardou: ${JSON.stringify(d)}`);

        const canal = tabela('wa_channels')[0];
        assert(!!canal, 'devia ter guardado o canal, mesmo por ligar');
        assert(canal.status === 'pending', `devia ficar por ligar: ${canal.status}`);
        assert(canal.credentials.verifyToken === 'jairotech', JSON.stringify(canal.credentials));

        // E agora a Meta consegue validar o webhook — que era o objectivo.
        const v = await fetchReal(
            `${B}/api/whatsapp/webhook/meta?hub.mode=subscribe&hub.verify_token=jairotech&hub.challenge=abc`,
        );
        assert(v.status === 200, `a Meta devia conseguir validar, deu ${v.status}`);
        assert((await v.text()) === 'abc', 'tem de devolver o desafio');
    });

    await test('o erro que volta ao painel esta em portugues', async () => {
        db['wa_channels'] = [];
        const r = await fetchReal(`${B}/api/whatsapp/config/meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phoneNumberId: '111', accessToken: 'expirado', verifyToken: 'x',
            }),
        });
        const d: any = await r.json();
        const semOriginal = String(d.error || '').split('(a Meta disse:')[0];
        assert(!/the session is invalid/i.test(semOriginal), `nao devia vir em ingles: ${semOriginal}`);
    });

    console.log('\n=== Com dois canais, qual e que vale ===\n');

    const canais = (lista: any[]) => { db['wa_channels'] = lista; };
    const META = { id: 'c-meta', empresa_id: EMPRESA, provider: 'meta', status: 'connected', credentials: { phoneNumberId: '1', accessToken: 'a', wabaId: 'w' } };
    const EVO = { id: 'c-evo', empresa_id: EMPRESA, provider: 'evolution', status: 'connected', credentials: { instanceName: 'INST_1' } };

    const verCanal = async () => {
        const r = await fetchReal(`${B}/api/whatsapp/canal/botoes`);
        return r.json() as any;
    };

    await test('com a Meta E a Evolution ligadas, o editor mostra a lista numerada', async () => {
        // Um fluxo responde em qualquer numero da empresa. Mostrar "botoes"
        // porque a Meta esta ligada era prometer botoes a quem escreve para o
        // numero da Evolution — e esse recebe a lista numerada. Foi assim que o
        // editor enganou: dizia botoes, e o cliente nao via botao nenhum.
        canais([EVO, META]);
        const d = await verCanal();
        assert(d.funcionam === false, 'basta um numero da Evolution para nao haver botoes garantidos');
        assert(d.lista === false, 'nem o menu que abre');
        assert(d.temMeta === true && d.temEvolution === true, `o painel tem de saber dos dois: ${JSON.stringify(d)}`);
    });

    await test('a ordem na base de dados nao decide nada', async () => {
        canais([META, EVO]);
        const d = await verCanal();
        assert(d.funcionam === false && d.temMeta === true && d.temEvolution === true, JSON.stringify(d));
    });

    await test('so com a Meta, ha botoes', async () => {
        canais([META]);
        const d = await verCanal();
        assert(d.provider === 'meta' && d.funcionam === true && d.lista === true, JSON.stringify(d));
    });

    await test('na Evolution, o interruptor antigo gravado nao liga os botoes', async () => {
        // Com ele ligado, a mensagem com botoes ficava em PENDING e o cliente
        // nao recebia nem a pergunta.
        canais([{ ...EVO, credentials: { instanceName: 'INST_1', botoesFiaveis: true } }]);
        const d = await verCanal();
        assert(d.funcionam === false, `nao devia prometer botoes: ${JSON.stringify(d)}`);
    });

    await test('sem Meta, continua a ser a Evolution', async () => {
        canais([EVO]);
        const d = await verCanal();
        assert(d.provider === 'evolution', `devia ver a Evolution, viu ${d.provider}`);
        assert(d.funcionam === false, 'na Evolution os botoes nao chegam');
    });

    await test('um canal Meta por ligar nao rouba o lugar ao que funciona', async () => {
        // Guarda-se um canal 'pending' so para a Meta validar o webhook. Se ele
        // ganhasse a escolha, o painel prometia botoes por um canal cujo token
        // ainda nem serve.
        canais([EVO, { ...META, id: 'c-meta-pend', status: 'pending' }]);
        const d = await verCanal();
        assert(d.provider === 'evolution', `devia ficar na Evolution, viu ${d.provider}`);
    });

    await test('so com o canal por ligar, e esse mesmo — nao se finge que nao ha nada', async () => {
        canais([{ ...META, status: 'pending' }]);
        const d = await verCanal();
        assert(d.success === true, JSON.stringify(d));
        assert(d.provider === 'meta', `devia ver o canal que ha: ${d.provider}`);
    });

    console.log('\n=== Varios clientes, cada um com a sua aplicacao Meta ===\n');

    const assinar = (chave: string, corpo: any) => {
        const crypto = require('crypto');
        return 'sha256=' + crypto.createHmac('sha256', chave).update(JSON.stringify(corpo)).digest('hex');
    };

    const avisoDaMeta = (idDoNumero: string) => ({
        object: 'whatsapp_business_account',
        entry: [{ changes: [{ value: { metadata: { phone_number_id: idDoNumero }, statuses: [] } }] }],
    });

    const mandar = async (corpo: any, assinatura?: string) => fetchReal(`${B}/api/whatsapp/webhook/meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(assinatura ? { 'x-hub-signature-256': assinatura } : {}) },
        body: JSON.stringify(corpo),
    });

    await test('cada cliente e conferido com a chave DA SUA aplicacao', async () => {
        // Era uma chave unica de ambiente. Com varios clientes isso nao serve:
        // ou so passava o dono dessa chave — e as mensagens de todos os outros
        // iam para o lixo em silencio — ou a verificacao era saltada para toda a
        // gente e qualquer um que soubesse o endereco injectava mensagens falsas
        // numa conta que nao era dele.
        delete process.env.META_APP_SECRET;
        db['wa_channels'] = [
            { id: 'c-a', empresa_id: 'empresa-A', provider: 'meta', status: 'connected', credentials: { phoneNumberId: '111', appSecret: 'chave-do-A' } },
            { id: 'c-b', empresa_id: 'empresa-B', provider: 'meta', status: 'connected', credentials: { phoneNumberId: '222', appSecret: 'chave-do-B' } },
        ];

        const corpoA = avisoDaMeta('111');
        const rA = await mandar(corpoA, assinar('chave-do-A', corpoA));
        assert(rA.status === 200, `o cliente A devia passar, deu ${rA.status}`);

        const corpoB = avisoDaMeta('222');
        const rB = await mandar(corpoB, assinar('chave-do-B', corpoB));
        assert(rB.status === 200, `o cliente B devia passar, deu ${rB.status}`);
    });

    await test('a chave de um cliente nao serve para a conta do outro', async () => {
        delete process.env.META_APP_SECRET;
        db['wa_channels'] = [
            { id: 'c-a', empresa_id: 'empresa-A', provider: 'meta', status: 'connected', credentials: { phoneNumberId: '111', appSecret: 'chave-do-A' } },
            { id: 'c-b', empresa_id: 'empresa-B', provider: 'meta', status: 'connected', credentials: { phoneNumberId: '222', appSecret: 'chave-do-B' } },
        ];
        const corpoB = avisoDaMeta('222');
        const r = await mandar(corpoB, assinar('chave-do-A', corpoB));
        assert(r.status === 401, `devia recusar, deu ${r.status}`);
    });

    await test('uma assinatura inventada nao passa', async () => {
        delete process.env.META_APP_SECRET;
        db['wa_channels'] = [
            { id: 'c-a', empresa_id: 'empresa-A', provider: 'meta', status: 'connected', credentials: { phoneNumberId: '111', appSecret: 'chave-do-A' } },
            { id: 'c-b', empresa_id: 'empresa-B', provider: 'meta', status: 'connected', credentials: { phoneNumberId: '222', appSecret: 'chave-do-B' } },
        ];
        const corpo = avisoDaMeta('111');
        const r = await mandar(corpo, 'sha256=0000000000000000000000000000000000000000000000000000000000000000');
        assert(r.status === 401, `devia recusar, deu ${r.status}`);
    });

    await test('sem chave guardada, deixa passar — como antes, mas avisa', async () => {
        // Nem toda a gente a tem configurada ainda. Fechar a porta de repente
        // deixava esses clientes sem receber mensagem nenhuma.
        db['wa_channels'] = [
            { id: 'c-c', empresa_id: 'empresa-C', provider: 'meta', status: 'connected', credentials: { phoneNumberId: '333' } },
        ];
        const corpo = avisoDaMeta('333');
        const r = await mandar(corpo, assinar('seja-o-que-for', corpo));
        assert(r.status === 200, `devia deixar passar, deu ${r.status}`);
    });

    await test('a chave do servidor continua a valer, para quem ja a tinha', async () => {
        process.env.META_APP_SECRET = 'a-do-servidor';
        db['wa_channels'] = [
            { id: 'c-d', empresa_id: 'empresa-D', provider: 'meta', status: 'connected', credentials: { phoneNumberId: '444' } },
        ];
        const corpo = avisoDaMeta('444');
        const r = await mandar(corpo, assinar('a-do-servidor', corpo));
        assert(r.status === 200, `devia passar, deu ${r.status}`);
        delete process.env.META_APP_SECRET;
    });

    await test('dois numeros da MESMA conta Meta podem ser de empresas diferentes', async () => {
        // A pergunta do cliente: ele tem dois numeros na mesma conta da Meta e
        // quer usar o outro noutra conta do sistema. O encaminhamento e pelo id
        // do NUMERO, nao pela conta — por isso funciona.
        delete process.env.META_APP_SECRET;
        db['wa_channels'] = [
            { id: 'c-x', empresa_id: 'empresa-X', provider: 'meta', status: 'connected', credentials: { phoneNumberId: '555', appSecret: 'mesma-app' } },
            { id: 'c-y', empresa_id: 'empresa-Y', provider: 'meta', status: 'connected', credentials: { phoneNumberId: '666', appSecret: 'mesma-app' } },
        ];
        const c1 = avisoDaMeta('555');
        const c2 = avisoDaMeta('666');
        assert((await mandar(c1, assinar('mesma-app', c1))).status === 200, 'o numero 555 devia passar');
        assert((await mandar(c2, assinar('mesma-app', c2))).status === 200, 'o numero 666 devia passar');
    });

    servidor.unref();
    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (falhas.length) console.log('Falhou:\n  - ' + falhas.join('\n  - '));
    process.exit(failed === 0 ? 0 : 1);
})();
