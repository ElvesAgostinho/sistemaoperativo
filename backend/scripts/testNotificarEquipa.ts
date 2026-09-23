/**
 * Testes do nó "Notificar Equipa" — pelos dois canais, email e WhatsApp.
 *
 * É o nó que avisa o dono do negócio de que entrou dinheiro à porta. Se falhar
 * em silêncio, perde-se o cliente e ninguém dá por nada. Por isso aqui testa-se
 * não só o caminho feliz, mas sobretudo o que acontece quando corre mal:
 * sem canal de WhatsApp ligado, com o número escrito de maneiras diferentes,
 * e com o canal trocado (email no campo do WhatsApp e ao contrário).
 *
 * Uso: npx ts-node scripts/testNotificarEquipa.ts   (a partir de backend/)
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
    if (x.op === 'neq') return String(v) !== String(x.val);
    if (x.op === 'in') return x.val.map(String).includes(String(v));
    return true;
});

function mockFrom(t: string) {
    const filtros: any[] = []; let op = 'select'; let payload: any = null;
    const self: any = {}; const ret = () => self;
    self.select = ret; self.order = ret; self.limit = ret; self.not = ret; self.or = ret; self.is = ret;
    self.ilike = ret; self.filter = ret; self.lt = ret; self.lte = ret; self.gt = ret; self.gte = ret;
    self.insert = (p: any) => { op = 'insert'; payload = p; return self; };
    self.update = (p: any) => { op = 'update'; payload = p; return self; };
    self.delete = () => { op = 'delete'; return self; };
    self.eq = (col: string, val: any) => { filtros.push({ col, val, op: 'eq' }); return self; };
    self.neq = (col: string, val: any) => { filtros.push({ col, val, op: 'neq' }); return self; };
    self.in = (col: string, val: any[]) => { filtros.push({ col, val, op: 'in' }); return self; };
    const correr = () => {
        const linhas = tabela(t);
        if (op === 'insert') { const n = { id: payload.id ?? seq++, ...payload }; linhas.push(n); return { data: n, error: null }; }
        if (op === 'update') { const alvo = linhas.filter(l => bate(l, filtros)); alvo.forEach(l => Object.assign(l, payload)); return { data: alvo, error: null }; }
        if (op === 'delete') { db[t] = linhas.filter(l => !bate(l, filtros)); return { data: [], error: null }; }
        return { data: linhas.filter(l => bate(l, filtros)).map(l => JSON.parse(JSON.stringify(l))), error: null };
    };
    const um = () => { const r = correr(); const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data; return { data: d, error: r.error || (d ? null : { code: 'PGRST116', message: 'no rows' }) }; };
    self.single = () => Promise.resolve(um());
    self.maybeSingle = () => Promise.resolve({ ...um(), error: null });
    self.then = (res: any, rej: any) => Promise.resolve(correr()).then(res, rej);
    self.catch = (rej: any) => Promise.resolve(correr()).catch(rej);
    return self;
}
const mockSupabase: any = { from: mockFrom, rpc: () => Promise.resolve({ data: [], error: null }) };
const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });

const whatsapps: { channelId: string; phone: string; content: string }[] = [];
const emails: { para: string; assunto: string; corpo: string }[] = [];

const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);
const waPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'WhatsAppChannelManager'));
// Usa a classe REAL do WhatsApp (para a escolha do canal ser mesmo testada) e
// troca só o transporte, que é o que não pode sair para a Internet num teste.
const { WhatsAppChannelManager: WaReal } = require(waPath);
WaReal.sendMessage = async (_s: any, channelId: string, phone: string, content: string) => {
    const canal = tabela('wa_channels').find(c => c.id === channelId);
    if (!canal) throw new Error('Canal não encontrado');
    // Um canal desligado não entrega nada — é o que acontece na realidade.
    if (canal.status && canal.status !== 'connected') throw new Error('Canal desligado');
    whatsapps.push({ channelId, phone, content });
    return 'mid';
};
WaReal.sendMediaMessage = async () => true;
const emailPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'EmailService'));
require.cache[emailPath] = fake({ EmailService: {
    enviarEmailPersonalizado: async (para: string, assunto: string, corpo: string) => {
        if (!para || !para.includes('@')) return false;   // o SMTP recusa o que não é email
        emails.push({ para, assunto, corpo });
        return true;
    }
} }, emailPath);
class MockOpenAI {
    embeddings = { create: async () => ({ data: [{ embedding: new Array(1536).fill(0.001) }] }) };
    chat = { completions: { create: async () => ({ choices: [{ message: { content: 'ia' } }] }) } };
}
require.cache[require.resolve('openai')] = fake(MockOpenAI, require.resolve('openai'));

const { AutomationEngine } = require(path.join(__dirname, '..', 'src', 'services', 'AutomationEngine'));
const Engine: any = AutomationEngine;

const EMPRESA = 'empresa-1';
const OUTRA = 'empresa-2';

/** Corre só o nó de notificação, com a configuração dada. */
async function notificar(config: any, empresaId: string | null = EMPRESA, contexto: any = {}) {
    const nodes = [
        { id: 'n1', type: 'action', data: { actionType: 'NOTIFY_TEAM', config } },
        { id: 'fim', type: 'end', data: {} }
    ];
    const edges = [{ id: 'e1', source: 'n1', target: 'fim' }];
    const ctx = { telefone: '244923000111', nome_whatsapp: 'Joana', mensagem: 'quero reservar', ...contexto };
    return Engine.executeGraph(nodes, edges, 'n1', ctx, empresaId, [1], {});
}

let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    whatsapps.length = 0; emails.length = 0; seq = 1;
    tabela('wa_channels').push({ id: 'chan-1', empresa_id: EMPRESA, provider: 'evolution', status: 'connected' });
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}

(async () => {
    console.log('\n=== Por email ===\n');

    await test('envia o email com as variáveis já substituídas', async () => {
        await notificar({ canal: 'email', destinatario: 'reservas@empresa.ao', mensagem: 'Novo pedido de {{nome_whatsapp}} ({{telefone}})' });
        assert(emails.length === 1, `devia enviar 1 email, enviou ${emails.length}`);
        assert(emails[0].para === 'reservas@empresa.ao', `destinatário errado: ${emails[0].para}`);
        assert(emails[0].corpo.includes('Joana') && emails[0].corpo.includes('244923000111'),
            `as variáveis não foram substituídas: ${emails[0].corpo}`);
    });

    await test('o email é o canal por omissão (sem "canal" configurado)', async () => {
        await notificar({ destinatario: 'geral@empresa.ao', mensagem: 'aviso' });
        assert(emails.length === 1, `devia enviar por email, enviou ${emails.length}`);
    });

    await test('aceita vários destinatários separados por vírgula', async () => {
        await notificar({ canal: 'email', destinatario: 'a@empresa.ao, b@empresa.ao', mensagem: 'aviso' });
        assert(emails.length === 2, `devia enviar aos dois, enviou ${emails.length}: ${emails.map(e => e.para).join(', ')}`);
    });

    await test('não tenta enviar email para um número de telefone', async () => {
        await notificar({ canal: 'email', destinatario: '244923000111', mensagem: 'aviso' });
        assert(emails.length === 0, 'não devia mandar email para um número');
        assert(whatsapps.length === 1, `devia perceber que é um telemóvel e mandar por WhatsApp, enviou ${whatsapps.length}`);
    });

    console.log('\n=== Por WhatsApp ===\n');

    await test('envia a mensagem pelo canal ligado da empresa', async () => {
        await notificar({ canal: 'whatsapp', destinatario: '244923111222', mensagem: 'Reserva de {{nome_whatsapp}}' });
        assert(whatsapps.length === 1, `devia enviar 1 WhatsApp, enviou ${whatsapps.length}`);
        assert(whatsapps[0].phone.replace(/\D/g, '') === '244923111222', `número errado: ${whatsapps[0].phone}`);
        assert(whatsapps[0].content.includes('Joana'), `variável não substituída: ${whatsapps[0].content}`);
    });

    await test('aceita o número escrito com +, espaços e traços', async () => {
        await notificar({ canal: 'whatsapp', destinatario: '+244 923 111-222', mensagem: 'aviso' });
        assert(whatsapps.length === 1, `devia enviar, enviou ${whatsapps.length}`);
        assert(whatsapps[0].phone.replace(/\D/g, '') === '244923111222', `número mal limpo: ${whatsapps[0].phone}`);
    });

    await test('escolhe um canal LIGADO quando há vários', async () => {
        db['wa_channels'] = [
            { id: 'chan-velho', empresa_id: EMPRESA, provider: 'evolution', status: 'disconnected' },
            { id: 'chan-bom', empresa_id: EMPRESA, provider: 'evolution', status: 'connected' }
        ];
        await notificar({ canal: 'whatsapp', destinatario: '244923111222', mensagem: 'aviso' });
        assert(whatsapps.length === 1, 'devia enviar pelo canal que está ligado, não pelo primeiro da lista');
        assert(whatsapps[0].channelId === 'chan-bom', `usou o canal errado: ${whatsapps[0].channelId}`);
    });

    await test('canal a funcionar mas marcado como desligado: envia e corrige o registo', async () => {
        // A coluna status so e acertada quando alguem abre a pagina do WhatsApp.
        // Um fluxo que corra de madrugada nao pode ficar mudo por causa disso.
        db['wa_channels'] = [{ id: 'chan-1', empresa_id: EMPRESA, provider: 'evolution', status: 'disconnected' }];
        // o transporte aceita (o telefone esta mesmo ligado)
        const antes = WaReal.sendMessage;
        WaReal.sendMessage = async (_s: any, channelId: string, phone: string, content: string) => { whatsapps.push({ channelId, phone, content }); return 'mid'; };
        await notificar({ canal: 'whatsapp', destinatario: '244923111222', mensagem: 'aviso' });
        WaReal.sendMessage = antes;
        assert(whatsapps.length === 1, `devia enviar na mesma, enviou ${whatsapps.length}`);
        assert(tabela('wa_channels')[0].status === 'connected', `devia corrigir o registo para connected, ficou ${tabela('wa_channels')[0].status}`);
    });

    await test('nunca usa o canal de outra empresa', async () => {
        db['wa_channels'] = [{ id: 'chan-outra', empresa_id: OUTRA, provider: 'evolution', status: 'connected' }];
        await notificar({ canal: 'whatsapp', destinatario: '244923111222', mensagem: 'aviso' });
        assert(whatsapps.length === 0, 'não devia enviar pelo canal de outra empresa');
    });

    await test('sem canal de WhatsApp, avisa por email em vez de falhar em silêncio', async () => {
        db['wa_channels'] = [];
        await notificar({ canal: 'whatsapp', destinatario: '244923111222', mensagem: 'aviso', emailAlternativo: 'dono@empresa.ao' });
        assert(whatsapps.length === 0, 'não há canal, não pode enviar por WhatsApp');
        assert(emails.length === 1, 'devia cair para o email alternativo configurado');
        assert(emails[0].para === 'dono@empresa.ao', `email errado: ${emails[0].para}`);
    });

    await test('percebe um email escrito no campo quando o canal diz WhatsApp', async () => {
        await notificar({ canal: 'whatsapp', destinatario: 'reservas@empresa.ao', mensagem: 'aviso' });
        assert(emails.length === 1, 'devia enviar por email, que é o que o destinatário é');
        assert(whatsapps.length === 0, 'não devia tentar mandar um email pelo WhatsApp');
    });

    console.log('\n=== Os dois ao mesmo tempo ===\n');

    await test('canal "ambos" avisa por email e por WhatsApp', async () => {
        await notificar({ canal: 'ambos', destinatario: 'reservas@empresa.ao, 244923111222', mensagem: 'Reserva de {{nome_whatsapp}}' });
        assert(emails.length === 1, `devia enviar 1 email, enviou ${emails.length}`);
        assert(whatsapps.length === 1, `devia enviar 1 WhatsApp, enviou ${whatsapps.length}`);
    });

    console.log('\n=== Configuração incompleta ===\n');

    await test('sem destinatário não rebenta o fluxo', async () => {
        await notificar({ canal: 'email', destinatario: '', mensagem: 'aviso' });
        assert(emails.length === 0 && whatsapps.length === 0, 'não devia enviar nada');
    });

    await test('sem mensagem não envia um aviso vazio', async () => {
        await notificar({ canal: 'email', destinatario: 'a@empresa.ao', mensagem: '' });
        assert(emails.length === 0, 'não devia enviar um email vazio');
    });

    await test('o fluxo continua depois do nó, mesmo quando o aviso falha', async () => {
        db['wa_channels'] = [];
        const nodes = [
            { id: 'n1', type: 'action', data: { actionType: 'NOTIFY_TEAM', config: { canal: 'whatsapp', destinatario: '244923111222', mensagem: 'x' } } },
            { id: 'n2', type: 'action', data: { actionType: 'NOTIFY_TEAM', config: { canal: 'email', destinatario: 'dono@empresa.ao', mensagem: 'o fluxo continuou' } } },
            { id: 'fim', type: 'end', data: {} }
        ];
        const edges = [{ id: 'e1', source: 'n1', target: 'n2' }, { id: 'e2', source: 'n2', target: 'fim' }];
        const ctx: any = { telefone: '244923000111', nome_whatsapp: 'Joana' };
        await Engine.executeGraph(nodes, edges, 'n1', ctx, EMPRESA, [1], {});
        assert(emails.some(e => e.corpo.includes('o fluxo continuou')), 'o fluxo devia continuar e executar o nó seguinte');
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (falhas.length) console.log('Falhou:\n  - ' + falhas.join('\n  - '));
    process.exit(failed === 0 ? 0 : 1);
})();
