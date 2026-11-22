/**
 * Testes do aviso de WhatsApp desligado (para o dono da plataforma).
 *
 * O caso real: uma empresa ficou um mês com o número desligado sem ninguém dar
 * por isso. Dados aqui inventados.
 *
 * Uso: npx ts-node scripts/testAvisoWhatsAppDesligado.ts   (a partir de backend/)
 */
import path from 'path';

const db: Record<string, any[]> = {};
const tabela = (t: string) => (db[t] = db[t] || []);
function mockFrom(t: string) {
    const filtros: ((r: any) => boolean)[] = [];
    let op: 'select' | 'update' | 'insert' = 'select';
    let payload: any = null;
    let ordem: { col: string; asc: boolean } | null = null;
    let limite: number | null = null;
    const s: any = {};
    s.select = () => s;
    s.eq = (c: string, v: any) => { filtros.push(r => String(r[c]) === String(v)); return s; };
    s.is = (c: string, v: any) => { filtros.push(r => (r[c] ?? null) === v); return s; };
    s.not = (c: string) => { filtros.push(r => r[c] != null); return s; };
    s.order = (c: string, o: any) => { ordem = { col: c, asc: o?.ascending !== false }; return s; };
    s.limit = (n: number) => { limite = n; return s; };
    s.update = (p: any) => { op = 'update'; payload = p; return s; };
    s.insert = (p: any) => { op = 'insert'; payload = p; return s; };
    const correr = () => {
        if (op === 'insert') { tabela(t).push({ ...payload }); return { data: [payload], error: null }; }
        let l = tabela(t).filter(r => filtros.every(f => f(r)));
        if (op === 'update') { l.forEach(r => Object.assign(r, JSON.parse(JSON.stringify(payload)))); return { data: l, error: null }; }
        if (ordem) { const o = ordem; l = [...l].sort((a, b) => (a[o.col] > b[o.col] ? 1 : -1) * (o.asc ? 1 : -1)); }
        if (limite !== null) l = l.slice(0, limite);
        return { data: l.map(r => JSON.parse(JSON.stringify(r))), error: null };
    };
    s.maybeSingle = () => Promise.resolve({ data: correr().data[0] ?? null, error: null });
    s.then = (res: any, rej: any) => Promise.resolve(correr()).then(res, rej);
    return s;
}
const mockSupabase: any = { from: mockFrom };
const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });
const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);

const emails: { para: string; assunto: string; corpo: string }[] = [];
const emailPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'EmailService'));
require.cache[emailPath] = fake({ EmailService: { enviarEmailPersonalizado: async (para: string, assunto: string, corpo: string) => { emails.push({ para, assunto, corpo }); return true; } } }, emailPath);

process.env.EVOLUTION_API_URL = 'https://evo.exemplo';
let instancias: any[] | null = [];
(global as any).fetch = async (url: string) => {
    if (url.includes('/instance/fetchInstances')) {
        if (instancias === null) throw new Error('sem rede');
        return { json: async () => instancias } as any;
    }
    throw new Error('pedido inesperado ' + url);
};

const { AvisoWhatsAppDesligadoService: A } = require(path.join(__dirname, '..', 'src', 'services', 'AvisoWhatsAppDesligadoService'));

const NOITE = new Date('2026-11-23T05:00:00Z');   // 06:00 em Angola: antes da hora do resumo do dia
const MANHA = new Date('2026-11-23T08:30:00Z');   // 09:30 em Angola
const horasAntes = (d: Date, h: number) => new Date(d.getTime() - h * 3600000).toISOString();

function canal(id: string, empresa: string, status: string, credentials: any = {}) {
    tabela('wa_channels').push({ id, empresa_id: 'emp-' + id, provider: 'evolution', status, credentials: { instanceName: 'INST_' + id, ...credentials }, empresas: { nome: empresa } });
}
const c = (id: string) => tabela('wa_channels').find(x => x.id === id);

let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (cond: boolean, m: string) => { if (!cond) throw new Error(m); };
async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    tabela('perfis').push({ email: 'dono@plataforma.exemplo', empresa_id: 'emp-mestre', role: 'superadmin', ativo: true });
    emails.length = 0; instancias = []; A.libertar();
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}

(async () => {
    console.log('\n=== Quando um número se desliga ===\n');

    await test('um número que estava ligado e se desliga: email logo, e fica registado desde quando', async () => {
        canal('a', 'Loja A', 'connected');
        instancias = [{ name: 'INST_a', connectionStatus: 'close', ownerJid: '244900000001@s.whatsapp.net' }];
        const r = await A.vigiar(NOITE);
        assert(r.desligouSe.length === 1 && emails.length === 1, JSON.stringify({ r, emails }));
        assert(/Loja A/.test(emails[0].assunto) && /código QR/.test(emails[0].corpo), JSON.stringify(emails[0]));
        assert(c('a').status === 'disconnected' && c('a').credentials.desligado_desde === NOITE.toISOString(), JSON.stringify(c('a')));
    });

    await test('não repete o aviso a cada 5 minutos', async () => {
        canal('a', 'Loja A', 'connected');
        instancias = [{ name: 'INST_a', connectionStatus: 'close', ownerJid: '244900000001@s.whatsapp.net' }];
        await A.vigiar(NOITE);
        await A.vigiar(new Date(NOITE.getTime() + 5 * 60000));
        assert(emails.length === 1, `foram ${emails.length} emails`);
    });

    await test('um número parado há semanas não "acabou de se desligar" (sem alarme falso)', async () => {
        canal('b', 'Loja B', 'disconnected');
        tabela('wa_conversations').push({ channel_id: 'b', last_client_message_at: horasAntes(NOITE, 24 * 30) });
        instancias = [{ name: 'INST_b', connectionStatus: 'close', ownerJid: '244900000002@s.whatsapp.net' }];
        const r = await A.vigiar(NOITE);
        assert(r.desligouSe.length === 0 && emails.length === 0, JSON.stringify(emails));
        assert(c('b').credentials.desligado_antes === true, JSON.stringify(c('b')));
    });

    await test('um número que recebeu mensagens há pouco e está desligado conta como acabado de desligar', async () => {
        // Mesmo que o ecrã de conversas já o tenha marcado "disconnected" antes do vigia passar.
        canal('a', 'Loja A', 'disconnected');
        tabela('wa_conversations').push({ channel_id: 'a', last_client_message_at: horasAntes(NOITE, 2) });
        instancias = [{ name: 'INST_a', connectionStatus: 'close', ownerJid: '244900000001@s.whatsapp.net' }];
        const r = await A.vigiar(NOITE);
        assert(r.desligouSe.length === 1, JSON.stringify(r));
    });

    await test('um número que nunca chegou a ligar não dá alarme de "desligou-se"', async () => {
        canal('n', 'Loja N', 'disconnected');
        instancias = [{ name: 'INST_n', connectionStatus: 'connecting' }];
        await A.vigiar(NOITE);
        assert(emails.length === 0, JSON.stringify(emails));
    });

    await test('quando volta a ligar, as marcas saem e o estado fica "ligado"', async () => {
        canal('a', 'Loja A', 'disconnected', { desligado_desde: horasAntes(NOITE, 3) });
        instancias = [{ name: 'INST_a', connectionStatus: 'open', ownerJid: '244900000001@s.whatsapp.net' }];
        await A.vigiar(NOITE);
        assert(c('a').status === 'connected' && !c('a').credentials.desligado_desde, JSON.stringify(c('a')));
        assert(c('a').credentials.instanceName === 'INST_a', 'o resto das credenciais fica');
    });

    await test('sem resposta da Evolution não se conclui nada (nem se mexe no estado)', async () => {
        canal('a', 'Loja A', 'connected');
        instancias = null;
        await A.vigiar(NOITE);
        assert(c('a').status === 'connected' && emails.length === 0, JSON.stringify(c('a')));
    });

    console.log('\n=== O resumo do dia ===\n');

    await test('às 09:30 sai um resumo com quem está parado — e só um por dia', async () => {
        canal('b', 'Loja B', 'disconnected', { desligado_antes: true });
        canal('n', 'Loja N', 'disconnected');
        canal('ok', 'Loja OK', 'connected');
        tabela('wa_conversations').push({ channel_id: 'b', last_client_message_at: '2026-10-20T19:30:00.000Z' });
        instancias = [
            { name: 'INST_b', connectionStatus: 'close', ownerJid: '244900000002@s.whatsapp.net' },
            { name: 'INST_n', connectionStatus: 'connecting' },
            { name: 'INST_ok', connectionStatus: 'open', ownerJid: '244900000003@s.whatsapp.net' },
        ];
        const r1 = await A.vigiar(MANHA);
        assert(r1.resumoEnviado && emails.length === 1, JSON.stringify(emails));
        const corpo = emails[0].corpo;
        assert(/Loja B/.test(corpo) && /20\/10/.test(corpo) && /Loja N: nunca chegou a ligar/.test(corpo), corpo);
        assert(!/Loja OK/.test(corpo), 'quem está ligado não entra no resumo');
        await A.vigiar(new Date(MANHA.getTime() + 2 * 3600000));
        assert(emails.length === 1, 'o resumo é um por dia');
    });

    await test('antes das 08:00 não há resumo', async () => {
        canal('b', 'Loja B', 'disconnected', { desligado_antes: true });
        instancias = [{ name: 'INST_b', connectionStatus: 'close', ownerJid: '244900000002@s.whatsapp.net' }];
        const r = await A.vigiar(new Date('2026-11-23T05:00:00Z'));   // 06:00 em Angola
        assert(!r.resumoEnviado && emails.length === 0, JSON.stringify(emails));
    });

    await test('sem ninguém parado, não sai resumo', async () => {
        canal('ok', 'Loja OK', 'connected');
        instancias = [{ name: 'INST_ok', connectionStatus: 'open', ownerJid: '244900000003@s.whatsapp.net' }];
        const r = await A.vigiar(MANHA);
        assert(!r.resumoEnviado && emails.length === 0, JSON.stringify(emails));
    });

    console.log('\n=== O painel ===\n');

    await test('a lista põe primeiro quem precisa de atenção, com a última mensagem recebida', async () => {
        canal('ok', 'Loja OK', 'connected');
        canal('b', 'Loja B', 'disconnected', { desligado_antes: true });
        canal('n', 'Loja N', 'disconnected');
        tabela('wa_conversations').push({ channel_id: 'b', last_client_message_at: '2026-10-20T19:30:00.000Z' });
        instancias = [
            { name: 'INST_ok', connectionStatus: 'open', ownerJid: '244900000003@s.whatsapp.net' },
            { name: 'INST_b', connectionStatus: 'close', ownerJid: '244900000002@s.whatsapp.net' },
            { name: 'INST_n', connectionStatus: 'connecting' },
        ];
        const l = await A.estadoDeTodos();
        assert(l.map((x: any) => x.estado).join(',') === 'desligado,nunca_ligado,ligado', JSON.stringify(l.map((x: any) => x.estado)));
        assert(l[0].empresa === 'Loja B' && l[0].numero === '244900000002' && l[0].ultimaMensagemRecebida === '2026-10-20T19:30:00.000Z', JSON.stringify(l[0]));
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (failed) { console.log('Falharam:\n - ' + falhas.join('\n - ')); process.exit(1); }
    process.exit(0);
})();
