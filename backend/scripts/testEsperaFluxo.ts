/**
 * Testes das pausas longas dos fluxos.
 *
 * O bloco "Aguardar (pausa)" era um temporizador em memória limitado a 15
 * minutos. Bastava uma publicação de código a meio da espera para o resto do
 * fluxo nunca acontecer — e ninguém dava por isso, porque não havia erro
 * nenhum, simplesmente não saía mais nada. Era por isso que não se podiam
 * escolher horas nem dias: não seria verdade.
 *
 * O que aqui se segura: uma pausa longa fica guardada em vez de bloquear, o
 * fluxo continua no bloco certo, ninguém recebe a sequência duas vezes, e quem
 * responde durante a pausa não leva com a mensagem seguinte dias depois.
 *
 * Uso: npx ts-node scripts/testEsperaFluxo.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import path from 'path';

// ---------- base de dados em memória ----------
const db: Record<string, any[]> = {};
const tabela = (t: string) => (db[t] = db[t] || []);
let seq = 100;

/** Tabelas que fingem não existir — para o caso da migração por correr. */
let tabelasEmFalta: string[] = [];

const bate = (row: any, f: any[]) => f.every(x => {
    const v = row[x.col];
    switch (x.op) {
        case 'eq': return String(v) === String(x.val);
        case 'lte': return new Date(v).getTime() <= new Date(x.val).getTime();
        case 'in': return x.val.map(String).includes(String(v));
        default: return true;
    }
});

function mockFrom(t: string) {
    const filtros: any[] = [];
    let op = 'select'; let payload: any = null; let limite = Infinity;
    const self: any = {}; const ret = () => self;
    self.select = ret; self.order = ret; self.not = ret; self.or = ret; self.is = ret; self.ilike = ret; self.overlaps = ret; self.neq = ret;
    self.limit = (n: number) => { limite = n; return self; };
    self.insert = (p: any) => { op = 'insert'; payload = p; return self; };
    self.update = (p: any) => { op = 'update'; payload = p; return self; };
    self.delete = () => { op = 'delete'; return self; };
    for (const o of ['eq', 'lte', 'in'] as const) {
        self[o] = (col: string, val: any) => { filtros.push({ col, val, op: o }); return self; };
    }
    const correr = () => {
        if (tabelasEmFalta.includes(t)) {
            return { data: null, error: { code: '42P01', message: `relation "public.${t}" does not exist` } };
        }
        const linhas = tabela(t);
        if (op === 'insert') {
            const novos = (Array.isArray(payload) ? payload : [payload]).map(p => ({ id: p.id ?? `row-${seq++}`, ...p }));
            linhas.push(...novos);
            return { data: Array.isArray(payload) ? novos : novos[0], error: null };
        }
        if (op === 'update') {
            const alvo = linhas.filter(l => bate(l, filtros));
            alvo.forEach(l => Object.assign(l, payload));
            return { data: alvo.map(l => JSON.parse(JSON.stringify(l))), error: null };
        }
        if (op === 'delete') { db[t] = linhas.filter(l => !bate(l, filtros)); return { data: [], error: null }; }
        const achados = linhas.filter(l => bate(l, filtros)).slice(0, limite).map(l => JSON.parse(JSON.stringify(l)));
        return { data: achados, error: null };
    };
    const um = () => { const r = correr(); const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data; return { data: d, error: r.error || (d ? null : { code: 'PGRST116' }) }; };
    self.single = () => Promise.resolve(um());
    self.maybeSingle = () => Promise.resolve({ data: um().data, error: correr().error });
    self.then = (res: any, rej: any) => Promise.resolve(correr()).then(res, rej);
    self.catch = (rej: any) => Promise.resolve(correr()).catch(rej);
    return self;
}

const mockSupabase: any = { from: mockFrom, rpc: () => Promise.resolve({ data: [], error: null }) };
const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });
const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);

// O motor é o real — é o comportamento dele que está em causa. Só o envio para
// o WhatsApp é que não sai daqui.
const { WhatsAppChannelManager } = require(path.join(__dirname, '..', 'src', 'services', 'WhatsAppChannelManager'));
const enviadas: { telefone: string; texto: string }[] = [];
WhatsAppChannelManager.sendMessage = async (_s: any, _c: string, telefone: string, texto: string) => {
    enviadas.push({ telefone, texto });
    return `msg-${enviadas.length}`;
};
WhatsAppChannelManager.sendMediaMessage = async () => true;

const { AutomationEngine } = require(path.join(__dirname, '..', 'src', 'services', 'AutomationEngine'));
const { EsperaFluxoService } = require(path.join(__dirname, '..', 'src', 'services', 'EsperaFluxoService'));

const EMPRESA = 'empresa-1';
const CONV = 'conv-1';
let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
const esperas = () => tabela('fluxo_esperas');
const aEspera = () => esperas().filter(e => e.estado === 'A_espera');

/** Um fluxo de três mensagens com uma pausa configurável pelo meio. */
const fluxoCom = (config: any, id = 1) => ({
    id, nome: 'Sequência', ativo: true, empresa_id: EMPRESA,
    nodes: [
        { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { triggerKind: 'whatsapp_message', matchMode: 'any' } },
        { id: 'a1', type: 'action', position: { x: 0, y: 100 }, data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Primeira' } } },
        { id: 'p1', type: 'action', position: { x: 0, y: 200 }, data: { actionType: 'DELAY', config } },
        { id: 'a2', type: 'action', position: { x: 0, y: 300 }, data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Segunda' } } },
        { id: 'a3', type: 'action', position: { x: 0, y: 400 }, data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Terceira' } } }
    ],
    edges: [
        { id: 'e1', source: 't1', target: 'a1' }, { id: 'e2', source: 'a1', target: 'p1' },
        { id: 'e3', source: 'p1', target: 'a2' }, { id: 'e4', source: 'a2', target: 'a3' }
    ]
});

const MSG = {
    id: 'wamid-1', channel_id: 'chan-1', phone_number: '244928053925', contact_name: 'Elves',
    content: 'olá', direction: 'inbound' as const, type: 'text' as const, timestamp: new Date().toISOString()
};

/** Corre o fluxo como se tivesse chegado uma mensagem. */
const correrFluxo = async (fluxo: any) => {
    tabela('automations').push(JSON.parse(JSON.stringify(fluxo)));
    await AutomationEngine.correrFluxoNaConversa(fluxo, CONV, MSG, EMPRESA, {}, { mensagemDisponivel: false });
};

async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    enviadas.length = 0; tabelasEmFalta = []; seq = 100;
    tabela('wa_channels').push({ id: 'chan-1', empresa_id: EMPRESA, status: 'connected', instance_name: 'inst-1' });
    tabela('wa_conversations').push({ id: CONV, empresa_id: EMPRESA, channel_id: 'chan-1', phone_number: MSG.phone_number, contact_name: 'Elves' });
    tabela('clientes').push({ id: 1, empresa_id: EMPRESA, nome: 'Elves', telefone: MSG.phone_number, tags: [], custom_fields: {} });
    const antes = console.log; const antesErr = console.error; const antesWarn = console.warn;
    console.log = () => { }; console.error = () => { }; console.warn = () => { };
    try { await fn(); console.log = antes; antes(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log = antes; antes(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
    finally { console.log = antes; console.error = antesErr; console.warn = antesWarn; }
}

(async () => {
    console.log('\n=== Ler a duração em qualquer unidade ===\n');

    await test('horas, minutos e dias dão os segundos certos', async () => {
        const casos: [any, number][] = [
            [{ duracao: 3, unidade: 'horas' }, 10800],
            [{ duracao: 30, unidade: 'minutos' }, 1800],
            [{ duracao: 2, unidade: 'dias' }, 172800],
            [{ duracao: 45, unidade: 'segundos' }, 45],
            [{ duracao: 1.5, unidade: 'horas' }, 5400]
        ];
        for (const [cfg, esperado] of casos) {
            const r = AutomationEngine.segundosDaPausa(cfg);
            assert(r === esperado, `${JSON.stringify(cfg)} devia dar ${esperado}s, deu ${r}s`);
        }
    });

    await test('os fluxos antigos continuam a abrir bem', async () => {
        // Há fluxos gravados com `segundos` e outros com `minutos`. Mudar a
        // forma de guardar não pode mudar o que eles já fazem.
        assert(AutomationEngine.segundosDaPausa({ segundos: 90 }) === 90, 'segundos soltos');
        assert(AutomationEngine.segundosDaPausa({ segundos: '45' }) === 45, 'segundos em texto');
        assert(AutomationEngine.segundosDaPausa({ minutos: 5 }) === 300, 'minutos soltos');
        assert(AutomationEngine.segundosDaPausa({ minutes: 2 }) === 120, 'minutes à inglesa');
        assert(AutomationEngine.segundosDaPausa({}) === 60, 'sem nada, um minuto');
    });

    await test('valores impossíveis não viram esperas eternas', async () => {
        for (const cfg of [{ duracao: -5, unidade: 'horas' }, { segundos: -10 }, { duracao: 'abc', unidade: 'dias' }]) {
            const r = AutomationEngine.segundosDaPausa(cfg);
            assert(r >= 0 && r < 86400 * 400, `${JSON.stringify(cfg)} deu ${r}s`);
        }
    });

    await test('o tempo é escrito como uma pessoa o diria', async () => {
        const casos: [number, string][] = [[10800, '3 horas'], [1800, '30 minutos'], [172800, '2 dias'], [45, '45 segundos'], [3600, '1 hora'], [60, '1 minuto'], [86400, '1 dia']];
        for (const [seg, texto] of casos) {
            const r = AutomationEngine.pausaPorExtenso(seg);
            assert(r === texto, `${seg}s devia ler-se "${texto}", leu-se "${r}"`);
        }
    });

    console.log('\n=== Pausas curtas: continuam em memória ===\n');

    await test('uma pausa de segundos corre de uma vez, sem guardar nada', async () => {
        await correrFluxo(fluxoCom({ duracao: 1, unidade: 'segundos' }));
        assert(enviadas.length === 3, `deviam sair as 3 mensagens, saíram ${enviadas.length}`);
        assert(esperas().length === 0, 'uma pausa de 1 segundo não tem de ficar guardada');
    });

    console.log('\n=== Pausas longas: ficam guardadas ===\n');

    await test('uma pausa de horas não bloqueia — fica guardada', async () => {
        const antes = Date.now();
        await correrFluxo(fluxoCom({ duracao: 3, unidade: 'horas' }));
        const demorou = Date.now() - antes;
        assert(demorou < 5000, `devia voltar logo, demorou ${demorou}ms`);
        assert(enviadas.length === 1, `só a primeira mensagem devia sair, saíram ${enviadas.length}`);
        assert(aEspera().length === 1, `devia ficar 1 espera guardada, ficaram ${aEspera().length}`);
    });

    await test('guarda o bloco seguinte, não o da pausa', async () => {
        // Guardar o próprio bloco da pausa punha o fluxo a esperar outra vez
        // três horas, e outra, e outra.
        await correrFluxo(fluxoCom({ duracao: 1, unidade: 'dias' }));
        const e = aEspera()[0];
        assert(e.node_id === 'a2', `devia continuar em a2, está em ${e.node_id}`);
    });

    await test('a hora de continuar é a certa', async () => {
        await correrFluxo(fluxoCom({ duracao: 2, unidade: 'horas' }));
        const e = aEspera()[0];
        const faltam = (new Date(e.retomar_em).getTime() - Date.now()) / 1000;
        assert(Math.abs(faltam - 7200) < 60, `deviam faltar ~7200s, faltam ${Math.round(faltam)}s`);
    });

    await test('guarda a empresa, a conversa e o fluxo', async () => {
        await correrFluxo(fluxoCom({ duracao: 4, unidade: 'horas' }));
        const e = aEspera()[0];
        assert(e.empresa_id === EMPRESA, `empresa errada: ${e.empresa_id}`);
        assert(e.conversation_id === CONV, `conversa errada: ${e.conversation_id}`);
        assert(String(e.automation_id) === '1', `fluxo errado: ${e.automation_id}`);
    });

    await test('o que o fluxo já sabia não se perde na pausa', async () => {
        // Sem o contexto, a mensagem seguinte chegava sem o nome do cliente e
        // sem as respostas que ele já tinha dado.
        await correrFluxo(fluxoCom({ duracao: 5, unidade: 'horas' }));
        const e = aEspera()[0];
        assert(e.contexto && typeof e.contexto === 'object', 'o contexto tem de ficar guardado');
        assert(String(e.contexto.conversation_id || '') === CONV, `o contexto perdeu a conversa: ${JSON.stringify(e.contexto).slice(0, 200)}`);
    });

    console.log('\n=== Retomar à hora certa ===\n');

    await test('o fluxo continua onde ficou quando chega a hora', async () => {
        await correrFluxo(fluxoCom({ duracao: 3, unidade: 'horas' }));
        assert(enviadas.length === 1, 'só a primeira, para já');

        // Chegou a hora.
        esperas()[0].retomar_em = new Date(Date.now() - 1000).toISOString();
        await EsperaFluxoService.processarFila();

        const textos = enviadas.map(e => e.texto);
        assert(enviadas.length === 3, `deviam sair as 3, saíram ${enviadas.length}: ${textos.join(' | ')}`);
        assert(textos[1] === 'Segunda' && textos[2] === 'Terceira', `ordem errada: ${textos.join(' | ')}`);
    });

    await test('não repete a parte que já tinha sido enviada', async () => {
        await correrFluxo(fluxoCom({ duracao: 3, unidade: 'horas' }));
        esperas()[0].retomar_em = new Date(Date.now() - 1000).toISOString();
        await EsperaFluxoService.processarFila();
        assert(enviadas.filter(e => e.texto === 'Primeira').length === 1, 'a primeira mensagem foi enviada duas vezes');
    });

    await test('antes da hora não acontece nada', async () => {
        await correrFluxo(fluxoCom({ duracao: 3, unidade: 'horas' }));
        await EsperaFluxoService.processarFila();
        assert(enviadas.length === 1, `ainda não é hora, não devia sair nada: ${enviadas.map(e => e.texto).join(', ')}`);
        assert(aEspera().length === 1, 'a espera tem de continuar de pé');
    });

    await test('uma espera só é retomada uma vez', async () => {
        // O processador corre a cada 20 segundos. Se dois ciclos apanhassem a
        // mesma espera, o cliente recebia a sequência em duplicado.
        await correrFluxo(fluxoCom({ duracao: 3, unidade: 'horas' }));
        esperas()[0].retomar_em = new Date(Date.now() - 1000).toISOString();
        await EsperaFluxoService.processarFila();
        await EsperaFluxoService.processarFila();
        await EsperaFluxoService.processarFila();
        assert(enviadas.filter(e => e.texto === 'Segunda').length === 1, `"Segunda" saiu ${enviadas.filter(e => e.texto === 'Segunda').length} vezes`);
        assert(esperas()[0].estado === 'Retomado', `devia ficar Retomado, ficou ${esperas()[0].estado}`);
    });

    await test('o estado muda antes de correr, não depois', async () => {
        // Marcar só no fim significava que um reinício a meio fazia a conversa
        // ser retomada outra vez do princípio da pausa.
        await correrFluxo(fluxoCom({ duracao: 3, unidade: 'horas' }));
        esperas()[0].retomar_em = new Date(Date.now() - 1000).toISOString();
        let estadoEnquantoCorria = '';
        const original = WhatsAppChannelManager.sendMessage;
        WhatsAppChannelManager.sendMessage = async (sb: any, c: string, tel: string, txt: string) => {
            estadoEnquantoCorria = estadoEnquantoCorria || esperas()[0].estado;
            return original(sb, c, tel, txt);
        };
        try { await EsperaFluxoService.processarFila(); }
        finally { WhatsAppChannelManager.sendMessage = original; }
        assert(estadoEnquantoCorria === 'Retomado', `a meio da execução o estado era ${estadoEnquantoCorria}`);
    });

    console.log('\n=== Quando o cliente responde durante a pausa ===\n');

    await test('a pausa é cancelada e a sequência antiga não chega', async () => {
        // Chegar dois dias depois com a mensagem seguinte de uma sequência que o
        // cliente já abandonou é a forma de ganhar um número bloqueado.
        await correrFluxo(fluxoCom({ duracao: 2, unidade: 'dias' }));
        assert(aEspera().length === 1, 'a pausa devia estar de pé');

        await EsperaFluxoService.cancelarDaConversa(CONV, 'O cliente respondeu durante a pausa');
        assert(aEspera().length === 0, 'a pausa devia ter sido cancelada');

        esperas()[0].retomar_em = new Date(Date.now() - 1000).toISOString();
        await EsperaFluxoService.processarFila();
        assert(enviadas.length === 1, `nada mais devia sair, saiu: ${enviadas.map(e => e.texto).join(', ')}`);
    });

    await test('cancelar diz porquê, para se poder explicar depois', async () => {
        await correrFluxo(fluxoCom({ duracao: 2, unidade: 'dias' }));
        await EsperaFluxoService.cancelarDaConversa(CONV, 'O cliente respondeu durante a pausa');
        assert(/respondeu/i.test(esperas()[0].erro || ''), `devia guardar o motivo: ${esperas()[0].erro}`);
    });

    await test('cancelar uma conversa não toca nas outras', async () => {
        await correrFluxo(fluxoCom({ duracao: 2, unidade: 'dias' }));
        tabela('wa_conversations').push({ id: 'conv-2', empresa_id: EMPRESA, channel_id: 'chan-1', phone_number: '244900000002', contact_name: 'Ana' });
        await AutomationEngine.correrFluxoNaConversa(
            fluxoCom({ duracao: 2, unidade: 'dias' }), 'conv-2',
            { ...MSG, id: 'wamid-2', phone_number: '244900000002' }, EMPRESA, {}, { mensagemDisponivel: false }
        );
        assert(aEspera().length === 2, `deviam estar 2 pausas de pé, estão ${aEspera().length}`);

        await EsperaFluxoService.cancelarDaConversa(CONV, 'respondeu');
        const restantes = aEspera();
        assert(restantes.length === 1 && restantes[0].conversation_id === 'conv-2', 'cancelou a pausa da conversa errada');
    });

    await test('a mesma conversa não acumula pausas', async () => {
        // Duas pausas de pé na mesma conversa faziam o fluxo continuar de dois
        // pontos diferentes — e o cliente receber tudo a dobrar.
        await correrFluxo(fluxoCom({ duracao: 2, unidade: 'dias' }));
        await AutomationEngine.correrFluxoNaConversa(fluxoCom({ duracao: 3, unidade: 'horas' }, 2), CONV, { ...MSG, id: 'wamid-3' }, EMPRESA, {}, { mensagemDisponivel: false });
        assert(aEspera().length === 1, `só a mais recente devia ficar de pé, estão ${aEspera().length}`);
        assert(esperas().some(e => e.estado === 'Cancelado'), 'a anterior devia ficar cancelada');
    });

    console.log('\n=== Quando as coisas correm mal ===\n');

    await test('sem a tabela criada, a pausa encurta mas o fluxo não se perde', async () => {
        // Enquanto a migração não for corrida, mais vale uma pausa curta do que
        // o fluxo partir-se ao meio e as mensagens seguintes nunca saírem.
        tabelasEmFalta = ['fluxo_esperas'];
        await correrFluxo(fluxoCom({ duracao: 3, unidade: 'horas' }));
        assert(enviadas.length === 3, `as 3 mensagens deviam sair ainda assim, saíram ${enviadas.length}`);
    });

    await test('o fluxo apagado durante a pausa falha sozinho, sem travar a fila', async () => {
        await correrFluxo(fluxoCom({ duracao: 3, unidade: 'horas' }));
        esperas()[0].retomar_em = new Date(Date.now() - 1000).toISOString();
        db['automations'] = [];   // alguém apagou o fluxo entretanto
        await EsperaFluxoService.processarFila();
        const e = esperas()[0];
        assert(e.estado === 'Falhou', `devia ficar Falhou, ficou ${e.estado}`);
        assert(/já não existe|nao existe/i.test(e.erro || ''), `devia explicar: ${e.erro}`);
    });

    await test('o bloco apagado do desenho falha sem rebentar', async () => {
        await correrFluxo(fluxoCom({ duracao: 3, unidade: 'horas' }));
        esperas()[0].retomar_em = new Date(Date.now() - 1000).toISOString();
        // O fluxo foi reeditado e o bloco onde a conversa estava já não existe.
        const f = tabela('automations')[0];
        f.nodes = f.nodes.filter((n: any) => n.id !== 'a2');
        f.edges = f.edges.filter((x: any) => x.target !== 'a2');
        await EsperaFluxoService.processarFila();
        assert(esperas()[0].estado === 'Falhou', `devia ficar Falhou, ficou ${esperas()[0].estado}`);
        assert(enviadas.length === 1, 'não devia sair mais nada');
    });

    await test('uma espera com problema não impede as outras de continuar', async () => {
        await correrFluxo(fluxoCom({ duracao: 3, unidade: 'horas' }));
        // Uma espera estragada, de uma conversa que já não existe.
        esperas()[0].retomar_em = new Date(Date.now() - 1000).toISOString();
        esperas().unshift({
            id: 'espera-ma', empresa_id: EMPRESA, conversation_id: 'conv-fantasma',
            automation_id: 999, node_id: 'a2', contexto: {},
            retomar_em: new Date(Date.now() - 2000).toISOString(), estado: 'A_espera'
        });
        await EsperaFluxoService.processarFila();
        assert(enviadas.length === 3, `a boa devia ter continuado, saíram ${enviadas.length}`);
        assert(esperas().find(e => e.id === 'espera-ma')!.estado === 'Falhou', 'a estragada devia ficar marcada');
    });

    await test('dois servidores não retomam a mesma espera', async () => {
        // O travão de "já estou a correr" é por processo. Em produção há mais do
        // que um processo a ler a mesma tabela, e aí só a própria base de dados
        // pode decidir quem fica com a linha. Sem essa reserva, dois servidores
        // retomavam a mesma conversa e o cliente recebia tudo a dobrar.
        await correrFluxo(fluxoCom({ duracao: 3, unidade: 'horas' }));
        const espera = JSON.parse(JSON.stringify(esperas()[0]));
        const retomar = (EsperaFluxoService as any).retomar.bind(EsperaFluxoService);
        await Promise.all([retomar(espera), retomar(espera)]);
        const vezes = enviadas.filter(e => e.texto === 'Segunda').length;
        assert(vezes === 1, `"Segunda" saiu ${vezes} vezes — a reserva na base de dados não segurou`);
    });

    await test('a fila não corre duas vezes ao mesmo tempo', async () => {
        await correrFluxo(fluxoCom({ duracao: 3, unidade: 'horas' }));
        esperas()[0].retomar_em = new Date(Date.now() - 1000).toISOString();
        await Promise.all([EsperaFluxoService.processarFila(), EsperaFluxoService.processarFila()]);
        assert(enviadas.filter(e => e.texto === 'Segunda').length === 1, '"Segunda" saiu em duplicado');
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (falhas.length) console.log('Falhou:\n  - ' + falhas.join('\n  - '));
    process.exit(failed === 0 ? 0 : 1);
})();
