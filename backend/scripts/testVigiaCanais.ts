/**
 * Testes do vigia dos números: o que fica "ligado" mas não recebe é reiniciado.
 *
 * O caso real (22/11/2026, dados aqui inventados): um número com muito
 * movimento passou das 08:34 às 17:45 a aparecer como ligado sem receber uma
 * única mensagem na hora.
 *
 * Uso: npx ts-node scripts/testVigiaCanais.ts   (a partir de backend/)
 */
import path from 'path';

const db: Record<string, any[]> = {};
const tabela = (t: string) => (db[t] = db[t] || []);
function mockFrom(t: string) {
    const filtros: ((r: any) => boolean)[] = [];
    let ordem: { col: string; asc: boolean } | null = null;
    let limite: number | null = null;
    const s: any = {};
    s.select = () => s;
    s.eq = (c: string, v: any) => { filtros.push(r => String(r[c]) === String(v)); return s; };
    s.gte = (c: string, v: any) => { filtros.push(r => r[c] != null && String(r[c]) >= String(v)); return s; };
    s.not = (c: string, _op: string, _v: any) => { filtros.push(r => r[c] != null); return s; };
    s.order = (c: string, o: any) => { ordem = { col: c, asc: o?.ascending !== false }; return s; };
    s.limit = (n: number) => { limite = n; return s; };
    const correr = () => {
        let l = tabela(t).filter(r => filtros.every(f => f(r)));
        if (ordem) { const o = ordem; l = [...l].sort((a, b) => (a[o.col] > b[o.col] ? 1 : -1) * (o.asc ? 1 : -1)); }
        if (limite !== null) l = l.slice(0, limite);
        return { data: l, error: null };
    };
    s.maybeSingle = () => Promise.resolve({ data: correr().data[0] ?? null, error: null });
    s.then = (res: any, rej: any) => Promise.resolve(correr()).then(res, rej);
    return s;
}
const mockSupabase: any = { from: mockFrom };
const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });
const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);

process.env.EVOLUTION_API_URL = 'https://evo.exemplo';
let estadoEvolution = 'open';
const reinicios: string[] = [];
(global as any).fetch = async (url: string, opts: any) => {
    if (url.includes('/instance/connectionState/')) return { json: async () => ({ instance: { state: estadoEvolution } }) } as any;
    if (url.includes('/instance/restart/') && opts?.method === 'POST') { reinicios.push(url.split('/').pop()!); return { json: async () => ({ instance: { state: 'open' } }) } as any; }
    throw new Error('pedido inesperado ' + url);
};

const { VigiaCanaisService: V } = require(path.join(__dirname, '..', 'src', 'services', 'VigiaCanaisService'));

const CANAL = { id: 'chan-1', empresa_id: 'emp-1', status: 'connected', provider: 'evolution', credentials: { instanceName: 'INST' } };
// 14:00 em Angola (13:00 UTC)
const DE_DIA = new Date('2026-11-22T13:00:00Z');
const DE_NOITE = new Date('2026-11-22T23:30:00Z');   // 00:30 em Angola
const horasAntes = (d: Date, h: number) => new Date(d.getTime() - h * 3600000).toISOString();

function conversas(n: number, ultimaHorasAntes: number, quando = DE_DIA) {
    for (let i = 0; i < n; i++) {
        tabela('wa_conversations').push({ id: 'c' + i, channel_id: 'chan-1', last_client_message_at: horasAntes(quando, ultimaHorasAntes + i) });
    }
}

let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    tabela('wa_channels').push({ ...CANAL });
    reinicios.length = 0; estadoEvolution = 'open'; V.esquecer();
    const w = console.warn; console.warn = () => { };
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
    finally { console.warn = w; }
}

(async () => {
    console.log('\n=== O vigia dos números ===\n');

    await test('um número com muito movimento, 4 h calado de dia, com a Evolution a dizer "ligado": reinicia', async () => {
        conversas(25, 4);
        const r = await V.vigiar(DE_DIA);
        assert(r.length === 1 && reinicios[0] === 'INST', `devia ter reiniciado: ${JSON.stringify(reinicios)}`);
    });

    await test('com uma mensagem há 30 minutos: está a receber, não mexe', async () => {
        conversas(25, 0.5);
        await V.vigiar(DE_DIA);
        assert(reinicios.length === 0, 'não devia reiniciar');
    });

    await test('de noite, o silêncio é normal: não mexe', async () => {
        conversas(25, 5, DE_NOITE);
        await V.vigiar(DE_NOITE);
        assert(reinicios.length === 0, 'não devia reiniciar à noite');
    });

    await test('um número com pouco movimento: calado é normal, não mexe', async () => {
        conversas(10, 10);
        await V.vigiar(DE_DIA);
        assert(reinicios.length === 0, 'não devia reiniciar um número quase sem conversas');
    });

    await test('se a Evolution diz que está desligado, reiniciar não resolve (é preciso o QR): não mexe', async () => {
        conversas(25, 4);
        estadoEvolution = 'close';
        await V.vigiar(DE_DIA);
        assert(reinicios.length === 0, 'não devia reiniciar um número desligado');
    });

    await test('no máximo um reinício a cada 3 horas por número', async () => {
        conversas(25, 4);
        await V.vigiar(DE_DIA);
        await V.vigiar(new Date(DE_DIA.getTime() + 60 * 60000));
        assert(reinicios.length === 1, `foram ${reinicios.length} reinícios`);
        await V.vigiar(new Date(DE_DIA.getTime() + 4 * 3600000));
        assert(reinicios.length === 2, 'passadas 3 h pode reiniciar outra vez');
    });

    await test('de manhã, o silêncio da noite não conta (não reinicia todos os números às 08:00)', async () => {
        const OITO = new Date('2026-11-22T07:00:00Z');   // 08:00 em Angola
        conversas(25, 11, OITO);                            // a última mensagem foi ontem às 21:00
        await V.vigiar(OITO);
        assert(reinicios.length === 0, 'às 08:00 só passou 1 hora do dia');
        await V.vigiar(new Date('2026-11-22T09:30:00Z')); // 10:30 em Angola: 3 h e meia sem nada
        assert(reinicios.length === 1, 'às 10:30, sem nada desde as 07:00, já reinicia');
    });

    await test('a hora de Angola é UTC+1', async () => {
        assert(V.horaDeAngola(new Date('2026-11-22T06:30:00Z')) === 7, 'às 06:30 UTC são 07 h em Angola');
        assert(V.horaDeAngola(new Date('2026-11-22T23:10:00Z')) === 0, 'às 23:10 UTC é meia-noite em Angola');
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (failed) { console.log('Falharam:\n - ' + falhas.join('\n - ')); process.exit(1); }
    process.exit(0);
})();
