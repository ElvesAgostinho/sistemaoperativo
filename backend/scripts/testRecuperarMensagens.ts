/**
 * Testes do recuperador de mensagens e do tradutor "@lid" → número.
 *
 * O caso real (22/11/2026): mensagens de clientes estavam na Evolution e
 * nunca chegaram ao sistema — o WhatsApp só as entregou depois, numa
 * sincronização do histórico, que não passa pelo webhook. (Números e nomes
 * aqui são inventados.)
 *
 * Uso: npx ts-node scripts/testRecuperarMensagens.ts   (a partir de backend/)
 */
import path from 'path';

// ---------- base de dados em memória ----------
const db: Record<string, any[]> = {};
const tabela = (t: string) => (db[t] = db[t] || []);
function mockFrom(t: string) {
    const filtros: ((r: any) => boolean)[] = [];
    let op: 'select' | 'update' | 'delete' = 'select';
    let patch: any = null;
    const s: any = {};
    s.select = () => s;
    s.eq = (c: string, v: any) => { filtros.push(r => String(r[c]) === String(v)); return s; };
    s.in = (c: string, vs: any[]) => { filtros.push(r => vs.map(String).includes(String(r[c]))); return s; };
    s.like = (c: string, p: string) => { const re = new RegExp('^' + p.replace(/%/g, '.*') + '$'); filtros.push(r => re.test(String(r[c]))); return s; };
    s.update = (p: any) => { op = 'update'; patch = p; return s; };
    s.delete = () => { op = 'delete'; return s; };
    const correr = () => {
        const alvo = tabela(t).filter(r => filtros.every(f => f(r)));
        if (op === 'update') { alvo.forEach(r => Object.assign(r, patch)); return { data: alvo, error: null }; }
        if (op === 'delete') { db[t] = tabela(t).filter(r => !alvo.includes(r)); return { data: alvo, error: null }; }
        return { data: alvo.map(r => ({ ...r })), error: null };
    };
    s.maybeSingle = () => Promise.resolve({ data: correr().data[0] ?? null, error: null });
    s.then = (res: any, rej: any) => Promise.resolve(correr()).then(res, rej);
    return s;
}
const mockSupabase: any = { from: mockFrom };
const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });
const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);

// ---------- a Evolution ----------
process.env.EVOLUTION_API_URL = 'https://evo.exemplo';
let chats: any[] = [];
let mensagensPorJid: Record<string, any[]> = {};
(global as any).fetch = async (url: string, opts: any) => {
    const corpo = opts?.body ? JSON.parse(opts.body) : {};
    if (url.includes('/chat/findChats/')) return { json: async () => chats } as any;
    if (url.includes('/chat/findMessages/')) {
        const jid = corpo?.where?.key?.remoteJid;
        return { json: async () => ({ messages: { records: mensagensPorJid[jid] || [] } }) } as any;
    }
    throw new Error('pedido inesperado: ' + url);
};

const { RecuperarMensagensService: R } = require(path.join(__dirname, '..', 'src', 'services', 'RecuperarMensagensService'));
const { WhatsAppLidService: Lid } = require(path.join(__dirname, '..', 'src', 'services', 'WhatsAppLidService'));

const tratadas: { id: string; soGuardar: boolean; alt?: string }[] = [];
R.tratar = async (msg: any, _inst: string, opcoes: any) => { tratadas.push({ id: msg.key.id, soGuardar: !!opcoes.soGuardar, alt: msg.key.remoteJidAlt }); return true; };

const CANAL = { id: 'chan-1', empresa_id: 'emp-1', credentials: { instanceName: 'INST' } };
const agora = () => Math.floor(Date.now() / 1000);
const msg = (id: string, jid: string, segundosAtras: number, extra: any = {}) => {
    const { key, ...resto } = extra;
    return {
        key: { id, remoteJid: jid, fromMe: false, ...(key || {}) },
        messageTimestamp: agora() - segundosAtras, message: { conversation: 'texto' }, ...resto,
    };
};
const chat = (jid: string, segundosAtras: number) => ({ remoteJid: jid, updatedAt: new Date((agora() - segundosAtras) * 1000).toISOString(), lastMessage: { messageTimestamp: agora() - segundosAtras } });

let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    chats = []; mensagensPorJid = {}; tratadas.length = 0; Lid.limparCache();
    const e = console.error; console.error = () => { };
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (err: any) { console.log(`  ✗ ${nome} — ${err.message}`); failed++; falhas.push(nome); }
    finally { console.error = e; }
}

(async () => {
    console.log('\n=== Recuperar o que não chegou ===\n');

    await test('a mensagem que está na Evolution e não no sistema é recuperada', async () => {
        chats = [chat('244923000333@s.whatsapp.net', 60)];
        mensagensPorJid['244923000333@s.whatsapp.net'] = [msg('cliente-1', '244923000333@s.whatsapp.net', 3600)];
        const n = await R.recuperarCanal(CANAL, 30 * 60);
        assert(n === 1 && tratadas[0]?.id === 'cliente-1', JSON.stringify(tratadas));
    });

    await test('com mais de 10 minutos só entra na conversa; com menos, os fluxos respondem', async () => {
        chats = [chat('A@s.whatsapp.net', 30)];
        mensagensPorJid['A@s.whatsapp.net'] = [msg('velha', 'A@s.whatsapp.net', 3600), msg('nova', 'A@s.whatsapp.net', 120)];
        await R.recuperarCanal(CANAL, 30 * 60);
        const velha = tratadas.find(t => t.id === 'velha'); const nova = tratadas.find(t => t.id === 'nova');
        assert(velha?.soGuardar === true, 'a de há uma hora não leva resposta automática');
        assert(nova?.soGuardar === false, 'a de há 2 minutos é tratada como acabada de chegar');
        assert(tratadas[0].id === 'velha', 'pela ordem em que foram enviadas');
    });

    await test('um lead de há 2 horas a quem ninguém respondeu é atendido agora (só a última mensagem dele)', async () => {
        // O número esteve preso o dia todo: o lead escreveu, insistiu, e
        // ninguém lhe respondeu. Quando a mensagem finalmente chega, o fluxo
        // tem de lhe responder — tarde é melhor do que nunca.
        chats = [chat('L@s.whatsapp.net', 30)];
        mensagensPorJid['L@s.whatsapp.net'] = [msg('lead-1', 'L@s.whatsapp.net', 3 * 3600), msg('lead-2', 'L@s.whatsapp.net', 2 * 3600)];
        await R.recuperarCanal(CANAL, 30 * 60);
        assert(tratadas.find(t => t.id === 'lead-1')?.soGuardar === true, 'a primeira só entra na conversa');
        assert(tratadas.find(t => t.id === 'lead-2')?.soGuardar === false, 'a última leva a resposta do fluxo');
    });

    await test('se alguém já lhe respondeu depois (o sistema ou pelo telemóvel), o fluxo não volta a responder', async () => {
        chats = [chat('L@s.whatsapp.net', 30)];
        mensagensPorJid['L@s.whatsapp.net'] = [
            msg('lead-1', 'L@s.whatsapp.net', 2 * 3600),
            msg('resposta', 'L@s.whatsapp.net', 3600, { key: { fromMe: true } }),
        ];
        await R.recuperarCanal(CANAL, 30 * 60);
        assert(tratadas.length === 1 && tratadas[0].soGuardar === true, JSON.stringify(tratadas));
    });

    await test('um lead de há mais de 6 horas só entra na conversa (quem atende já o vê)', async () => {
        chats = [chat('L@s.whatsapp.net', 30)];
        mensagensPorJid['L@s.whatsapp.net'] = [msg('lead-velho', 'L@s.whatsapp.net', 8 * 3600)];
        await R.recuperarCanal(CANAL, 30 * 60);
        assert(tratadas[0]?.soGuardar === true, JSON.stringify(tratadas));
    });

    await test('o que já está no sistema não volta a entrar', async () => {
        tabela('wa_messages').push({ message_id: 'ja-tem' });
        chats = [chat('A@s.whatsapp.net', 30)];
        mensagensPorJid['A@s.whatsapp.net'] = [msg('ja-tem', 'A@s.whatsapp.net', 300)];
        assert(await R.recuperarCanal(CANAL, 30 * 60) === 0, `não devia recuperar: ${JSON.stringify(tratadas)}`);
    });

    await test('o que a empresa enviou não é recuperado (seria duplicar a conversa)', async () => {
        chats = [chat('A@s.whatsapp.net', 30)];
        mensagensPorJid['A@s.whatsapp.net'] = [msg('nossa', 'A@s.whatsapp.net', 300, { key: { fromMe: true } })];
        assert(await R.recuperarCanal(CANAL, 30 * 60) === 0, JSON.stringify(tratadas));
    });

    await test('a mesma mensagem duas vezes (a da hora e a da sincronização): uma só, a que traz o número', async () => {
        chats = [chat('11112222333344@lid', 30)];
        mensagensPorJid['11112222333344@lid'] = [
            msg('dup', '11112222333344@lid', 3600),
            msg('dup', '11112222333344@lid', 3600, { key: { remoteJidAlt: '244923000222@s.whatsapp.net' } }),
        ];
        await R.recuperarCanal(CANAL, 30 * 60);
        assert(tratadas.length === 1 && tratadas[0].alt === '244923000222@s.whatsapp.net', JSON.stringify(tratadas));
    });

    await test('grupos, conversas paradas e mensagens com mais de 3 dias ficam de fora', async () => {
        chats = [chat('123@g.us', 30), chat('PARADA@s.whatsapp.net', 5 * 3600), chat('A@s.whatsapp.net', 30)];
        mensagensPorJid['123@g.us'] = [msg('grupo', '123@g.us', 60)];
        mensagensPorJid['PARADA@s.whatsapp.net'] = [msg('parada', 'PARADA@s.whatsapp.net', 5 * 3600)];
        mensagensPorJid['A@s.whatsapp.net'] = [msg('muito-velha', 'A@s.whatsapp.net', 4 * 86400)];
        assert(await R.recuperarCanal(CANAL, 30 * 60) === 0, JSON.stringify(tratadas));
    });

    await test('a primeira passagem olha para os últimos 3 dias', async () => {
        chats = [chat('A@s.whatsapp.net', 2 * 86400)];
        mensagensPorJid['A@s.whatsapp.net'] = [msg('de-anteontem', 'A@s.whatsapp.net', 2 * 86400)];
        assert(await R.recuperarCanal(CANAL, 3 * 86400) === 1, JSON.stringify(tratadas));
    });

    console.log('\n=== Contactos "@lid" ===\n');

    await test('o número de um "@lid" vem das outras mensagens desse contacto', async () => {
        mensagensPorJid['11112222333344@lid'] = [
            msg('a', '11112222333344@lid', 10),
            msg('b', '11112222333344@lid', 900000, { key: { remoteJidAlt: '244923000222@s.whatsapp.net' } }),
        ];
        assert(await Lid.resolver('INST', '11112222333344@lid') === '244923000222', 'devia descobrir o número');
    });

    await test('sem nenhuma mensagem com o número, não inventa', async () => {
        mensagensPorJid['55556666777@lid'] = [msg('a', '55556666777@lid', 10)];
        assert(await Lid.resolver('INST', '55556666777@lid') === null, 'devia dar null');
    });

    await test('a conversa "@lid" junta-se à do número: as mensagens passam para lá e a duplicada sai', async () => {
        tabela('wa_conversations').push(
            { id: 'c-num', channel_id: 'chan-1', phone_number: '244923000222', contact_name: 'Joana Cliente' },
            { id: 'c-lid', channel_id: 'chan-1', phone_number: '11112222333344@lid', contact_name: '11112222333344@lid' },
        );
        tabela('wa_messages').push({ id: 1, conversation_id: 'c-lid', message_id: 'x' }, { id: 2, conversation_id: 'c-num', message_id: 'y' });
        mensagensPorJid['11112222333344@lid'] = [msg('b', '11112222333344@lid', 10, { key: { remoteJidAlt: '244923000222@s.whatsapp.net' } })];
        assert(await R.unificarConversasLid(CANAL) === 1, 'devia ter unificado uma');
        assert(tabela('wa_messages').every(m => m.conversation_id === 'c-num'), JSON.stringify(tabela('wa_messages')));
        assert(!tabela('wa_conversations').some(c => c.id === 'c-lid'), 'a conversa "@lid" devia sair');
    });

    await test('sem conversa do número, a "@lid" passa a ser a do número', async () => {
        tabela('wa_conversations').push({ id: 'c-lid', channel_id: 'chan-1', phone_number: '999@lid', contact_name: '999@lid' });
        mensagensPorJid['999@lid'] = [msg('b', '999@lid', 10, { key: { remoteJidAlt: '244911222333@s.whatsapp.net' } })];
        await R.unificarConversasLid(CANAL);
        const c = tabela('wa_conversations')[0];
        assert(c.phone_number === '244911222333' && c.contact_name === '244911222333', JSON.stringify(c));
    });

    await test('a "@lid" que não se consegue resolver fica como está (e aparece na caixa)', async () => {
        tabela('wa_conversations').push({ id: 'c-lid', channel_id: 'chan-1', phone_number: '777@lid', contact_name: 'Ana' });
        mensagensPorJid['777@lid'] = [msg('a', '777@lid', 10)];
        assert(await R.unificarConversasLid(CANAL) === 0, 'nada a unificar');
        assert(tabela('wa_conversations')[0].phone_number === '777@lid', 'fica');
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (failed) { console.log('Falharam:\n - ' + falhas.join('\n - ')); process.exit(1); }
    process.exit(0);
})();
