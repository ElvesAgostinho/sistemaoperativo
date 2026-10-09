/**
 * Testes dos disparos de fluxo (correr um fluxo para muita gente).
 *
 * Um fluxo só arrancava quando chegava uma mensagem; quem nunca respondia nunca
 * mais era contactado. Isto permite o contrário — e é por isso que precisa de
 * cuidado: disparar para 500 contactos de rajada é a forma mais rápida de um
 * número pessoal ser banido pelo WhatsApp.
 *
 * O que aqui se segura: ninguém recebe duas vezes, quem tem o bot pausado é
 * deixado em paz, uma falha não trava os outros, e o ritmo é mesmo respeitado.
 *
 * Uso: npx ts-node scripts/testDisparosFluxo.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import path from 'path';

// ---------- base de dados em memória ----------
const db: Record<string, any[]> = {};
const tabela = (t: string) => (db[t] = db[t] || []);
let seq = 100;

const bate = (row: any, f: any[]) => f.every(x => {
    const v = row[x.col];
    switch (x.op) {
        case 'eq': return String(v) === String(x.val);
        case 'neq': return String(v) !== String(x.val);
        case 'in': return x.val.map(String).includes(String(v));
        case 'overlaps': return Array.isArray(v) && v.some((t: any) => x.val.includes(t));
        default: return true;
    }
});

function mockFrom(t: string) {
    const filtros: any[] = [];
    let op = 'select'; let payload: any = null; let limite = Infinity; let contar = false;
    const self: any = {}; const ret = () => self;
    self.select = (_c?: string, o?: any) => { if (o?.count) contar = true; return self; };
    self.order = ret; self.not = ret; self.or = ret; self.is = ret; self.filter = ret; self.ilike = ret;
    self.limit = (n: number) => { limite = n; return self; };
    self.insert = (p: any) => { op = 'insert'; payload = p; return self; };
    self.update = (p: any) => { op = 'update'; payload = p; return self; };
    self.delete = () => { op = 'delete'; return self; };
    for (const o of ['eq', 'neq', 'in', 'overlaps'] as const) {
        self[o] = (col: string, val: any) => { filtros.push({ col, val, op: o }); return self; };
    }
    const correr = () => {
        const linhas = tabela(t);
        if (op === 'insert') {
            const novos = (Array.isArray(payload) ? payload : [payload]).map(p => ({ id: p.id ?? seq++, ...p }));
            if (t === 'fluxo_disparo_destinatarios') {
                for (const n of novos) {
                    if (linhas.some(l => l.disparo_id === n.disparo_id && l.telefone === n.telefone)) {
                        return { data: null, error: { code: '23505', message: 'duplicate key' } };
                    }
                }
            }
            linhas.push(...novos);
            return { data: Array.isArray(payload) ? novos : novos[0], error: null };
        }
        if (op === 'update') { const alvo = linhas.filter(l => bate(l, filtros)); alvo.forEach(l => Object.assign(l, payload)); return { data: alvo.map(l => JSON.parse(JSON.stringify(l))), error: null }; }
        if (op === 'delete') { const fora = linhas.filter(l => bate(l, filtros)); db[t] = linhas.filter(l => !bate(l, filtros)); return { data: fora, error: null }; }
        const achados = linhas.filter(l => bate(l, filtros)).slice(0, limite).map(l => JSON.parse(JSON.stringify(l)));
        return contar ? { data: null, error: null, count: achados.length } : { data: achados, error: null };
    };
    const um = () => { const r = correr(); const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data; return { data: d, error: r.error || (d ? null : { code: 'PGRST116' }) }; };
    self.single = () => Promise.resolve(um());
    self.maybeSingle = () => Promise.resolve({ ...um(), error: null });
    self.then = (res: any, rej: any) => Promise.resolve(correr()).then(res, rej);
    self.catch = (rej: any) => Promise.resolve(correr()).catch(rej);
    return self;
}

const mockSupabase: any = { from: mockFrom, rpc: () => Promise.resolve({ data: [], error: null }) };
const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });
const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);

// O motor é o real, mas sem sair para a Internet e sem esperas a sério.
const enginePath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'AutomationEngine'));
const { AutomationEngine } = require(enginePath);
const corridos: { conversationId: string; fluxo: string; telefone: string }[] = [];
let recusarEstes: string[] = [];
AutomationEngine.correrFluxoNaConversa = async (fluxo: any, conversationId: string, message: any) => {
    if (recusarEstes.includes(message.phone_number)) return { ok: false, erro: 'o canal recusou' };
    corridos.push({ conversationId, fluxo: fluxo.nome, telefone: message.phone_number });
    return { ok: true };
};

const { FluxoDisparoService } = require(path.join(__dirname, '..', 'src', 'services', 'FluxoDisparoService'));

const EMPRESA = 'empresa-1';
const OUTRA = 'empresa-2';
let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const FLUXO = {
    id: 1, nome: 'Seguimento', ativo: true, empresa_id: EMPRESA,
    nodes: [
        { id: 't1', type: 'trigger', data: { triggerKind: 'whatsapp_message', matchMode: 'any' } },
        { id: 'r1', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Ainda está interessado?' } } }
    ],
    edges: [{ id: 'e1', source: 't1', target: 'r1' }]
};

async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    corridos.length = 0; recusarEstes = []; seq = 100;
    tabela('wa_channels').push({ id: 'chan-1', empresa_id: EMPRESA, status: 'connected' });
    tabela('automations').push(JSON.parse(JSON.stringify(FLUXO)));
    tabela('clientes').push(
        { id: 1, empresa_id: EMPRESA, nome: 'Ana', telefone: '244900000001', tags: ['interessado'], custom_fields: {} },
        { id: 2, empresa_id: EMPRESA, nome: 'Carlos', telefone: '244900000002', tags: ['interessado'], custom_fields: {} },
        { id: 3, empresa_id: EMPRESA, nome: 'Sem telefone', telefone: null, tags: ['interessado'], custom_fields: {} },
        { id: 4, empresa_id: EMPRESA, nome: 'Repetida', telefone: '244900000001', tags: ['interessado'], custom_fields: {} },
        { id: 5, empresa_id: EMPRESA, nome: 'Comprou', telefone: '244900000005', tags: ['comprou'], custom_fields: {} },
        { id: 9, empresa_id: OUTRA, nome: 'De outra', telefone: '244900000009', tags: ['interessado'], custom_fields: {} }
    );
    tabela('wa_conversations').push(
        { id: 'conv-1', empresa_id: EMPRESA, channel_id: 'chan-1', phone_number: '244900000001', contact_name: 'Ana' }
    );
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}

const base = { automation_id: 1, publico_tipo: 'tags' as const, publico_tags: ['interessado'], velocidade_por_minuto: 12 };
const dest = () => tabela('fluxo_disparo_destinatarios');

/** Corre a fila até não sobrar ninguém (o ritmo faz lotes pequenos de propósito). */
const correrTudo = async (voltas = 8) => { for (let i = 0; i < voltas; i++) await FluxoDisparoService.processarFila(); };

(async () => {
    console.log('\n=== Quem recebe ===\n');

    await test('só contactos desta empresa, com telefone, sem repetir', async () => {
        const c = await FluxoDisparoService.resolverPublico(EMPRESA, 'tags', { tags: ['interessado'] });
        const nums = c.map((x: any) => x.telefone).sort();
        assert(c.length === 2, `deviam ser 2 (Ana e Carlos), foram ${c.length}: ${nums.join(', ')}`);
        assert(!nums.includes('244900000009'), 'nunca pode apanhar contactos de outra empresa');
    });

    await test('filtrar por etiqueta deixa os outros de fora', async () => {
        const c = await FluxoDisparoService.resolverPublico(EMPRESA, 'tags', { tags: ['comprou'] });
        assert(c.length === 1 && c[0].telefone === '244900000005', `devia ser só o "comprou": ${JSON.stringify(c)}`);
    });

    console.log('\n=== Criar o disparo ===\n');

    await test('cria uma linha por pessoa e diz quantas são', async () => {
        const r = await FluxoDisparoService.criar(EMPRESA, base, 'user-1');
        assert(r.total === 2, `deviam ser 2, são ${r.total}`);
        assert(dest().length === 2, `deviam ficar 2 linhas, ficaram ${dest().length}`);
        assert(dest().every(d => d.estado === 'Pendente'), 'todas por enviar');
    });

    await test('recusa um fluxo cujo gatilho não vai dar a lado nenhum', async () => {
        // Mais vale dizê-lo agora do que deixar 300 linhas a falhar uma a uma.
        tabela('automations').push({ id: 2, nome: 'Vazio', ativo: true, empresa_id: EMPRESA, nodes: [{ id: 't1', type: 'trigger', data: {} }], edges: [] });
        let erro = '';
        try { await FluxoDisparoService.criar(EMPRESA, { ...base, automation_id: 2 }, 'user-1'); } catch (e: any) { erro = e.message; }
        assert(/ligado|nada para enviar/i.test(erro), `devia explicar: ${erro}`);
    });

    await test('recusa quando o público-alvo não apanha ninguém', async () => {
        let erro = '';
        try { await FluxoDisparoService.criar(EMPRESA, { ...base, publico_tags: ['nao-existe'] }, 'user-1'); } catch (e: any) { erro = e.message; }
        assert(/nenhum contacto/i.test(erro), `devia explicar: ${erro}`);
    });

    await test('não dispara um fluxo de outra empresa', async () => {
        tabela('automations').push({ ...FLUXO, id: 3, empresa_id: OUTRA });
        let erro = '';
        try { await FluxoDisparoService.criar(EMPRESA, { ...base, automation_id: 3 }, 'user-1'); } catch (e: any) { erro = e.message; }
        assert(/não encontrado|nao encontrado/i.test(erro), `devia recusar: ${erro}`);
    });

    await test('o ritmo é travado no máximo que o WhatsApp tolera', async () => {
        const r = await FluxoDisparoService.criar(EMPRESA, { ...base, velocidade_por_minuto: 500 }, 'user-1');
        const d = tabela('fluxo_disparos').find(x => x.id === r.id)!;
        assert(d.velocidade_por_minuto <= 12, `devia ser travado, ficou ${d.velocidade_por_minuto}`);
    });

    console.log('\n=== Correr ===\n');

    await test('corre o fluxo para cada pessoa, uma vez', async () => {
        const r = await FluxoDisparoService.criar(EMPRESA, base, 'user-1');
        await FluxoDisparoService.iniciar(EMPRESA, r.id);
        await correrTudo();
        assert(corridos.length === 2, `devia correr 2 vezes, correu ${corridos.length}`);
        assert(new Set(corridos.map(c => c.telefone)).size === 2, 'ninguém pode receber duas vezes');
    });

    await test('correr a fila mais vezes não repete ninguém', async () => {
        const r = await FluxoDisparoService.criar(EMPRESA, base, 'user-1');
        await FluxoDisparoService.iniciar(EMPRESA, r.id);
        await correrTudo(12);
        assert(corridos.length === 2, `devia continuar a 2, foram ${corridos.length}`);
    });

    await test('quem tem o bot pausado é deixado em paz', async () => {
        // Alguém pausou de propósito; um disparo não pode atropelar isso.
        tabela('clientes').find(c => c.id === 2)!.bot_paused = true;
        const r = await FluxoDisparoService.criar(EMPRESA, base, 'user-1');
        await FluxoDisparoService.iniciar(EMPRESA, r.id);
        await correrTudo();
        assert(corridos.length === 1, `só a Ana devia receber, correram ${corridos.length}`);
        const carlos = dest().find(d => d.telefone === '244900000002')!;
        assert(carlos.estado === 'Ignorado', `o Carlos devia ficar Ignorado, está ${carlos.estado}`);
        assert(/pausado/i.test(carlos.erro || ''), `devia dizer porquê: ${carlos.erro}`);
    });

    await test('cria a conversa de quem nunca escreveu', async () => {
        // Um contacto que veio do CRM e nunca mandou mensagem não tem conversa;
        // sem a criar, o fluxo não teria onde assentar.
        const antes = tabela('wa_conversations').length;
        const r = await FluxoDisparoService.criar(EMPRESA, base, 'user-1');
        await FluxoDisparoService.iniciar(EMPRESA, r.id);
        await correrTudo();
        assert(tabela('wa_conversations').length === antes + 1, 'devia criar a conversa que faltava');
        const carlos = tabela('wa_conversations').find(c => c.phone_number === '244900000002');
        assert(!!carlos, 'a conversa do Carlos devia existir agora');
    });

    await test('quem foi atendido pelo disparo continua com esse fluxo', async () => {
        const r = await FluxoDisparoService.criar(EMPRESA, base, 'user-1');
        await FluxoDisparoService.iniciar(EMPRESA, r.id);
        await correrTudo();
        const conv = tabela('wa_conversations').find(c => c.phone_number === '244900000001')!;
        assert(String(conv.automation_escolhida_id) === '1', `devia ficar escolhido: ${conv.automation_escolhida_id}`);
    });

    await test('uma falha não trava os outros e fica registada', async () => {
        recusarEstes = ['244900000002'];
        const r = await FluxoDisparoService.criar(EMPRESA, base, 'user-1');
        await FluxoDisparoService.iniciar(EMPRESA, r.id);
        await correrTudo();
        assert(corridos.some(c => c.telefone === '244900000001'), 'a Ana devia receber na mesma');
        const carlos = dest().find(d => d.telefone === '244900000002')!;
        assert(carlos.estado === 'Falhou' && !!carlos.erro, `devia ficar Falhou com motivo: ${JSON.stringify(carlos)}`);
        const m = await FluxoDisparoService.metricas(EMPRESA, r.id);
        assert(m.enviados === 1 && m.falhados === 1, `métricas erradas: ${JSON.stringify(m)}`);
    });

    await test('o disparo fecha-se sozinho no fim', async () => {
        const r = await FluxoDisparoService.criar(EMPRESA, base, 'user-1');
        await FluxoDisparoService.iniciar(EMPRESA, r.id);
        await correrTudo();
        const d = tabela('fluxo_disparos').find(x => x.id === r.id)!;
        assert(d.estado === 'Concluido', `devia ficar Concluido, ficou ${d.estado}`);
        assert(!!d.concluido_em, 'devia registar a hora');
    });

    await test('pausado deixa de correr; retomado continua de onde ficou', async () => {
        const r = await FluxoDisparoService.criar(EMPRESA, { ...base, velocidade_por_minuto: 3 }, 'user-1');
        await FluxoDisparoService.iniciar(EMPRESA, r.id);
        await FluxoDisparoService.processarFila();
        const antes = corridos.length;
        await FluxoDisparoService.pausar(EMPRESA, r.id);
        await correrTudo();
        assert(corridos.length === antes, `pausado não devia correr mais (${antes} -> ${corridos.length})`);
        await FluxoDisparoService.iniciar(EMPRESA, r.id);
        await correrTudo();
        assert(corridos.length === 2, `depois de retomar deviam ser 2, são ${corridos.length}`);
        assert(new Set(corridos.map(c => c.telefone)).size === 2, 'ninguém pode receber duas vezes');
    });

    await test('cancelar tira da fila quem ainda não recebeu', async () => {
        const r = await FluxoDisparoService.criar(EMPRESA, base, 'user-1');
        await FluxoDisparoService.cancelar(EMPRESA, r.id);
        await correrTudo();
        assert(corridos.length === 0, `cancelado não devia correr nada, correu ${corridos.length}`);
        assert(dest().every(d => d.estado === 'Ignorado'), 'os pendentes deviam ficar Ignorados');
    });

    await test('se o fluxo for apagado a meio, o disparo para em vez de falhar linha a linha', async () => {
        const r = await FluxoDisparoService.criar(EMPRESA, base, 'user-1');
        await FluxoDisparoService.iniciar(EMPRESA, r.id);
        db['automations'] = [];
        await FluxoDisparoService.processarFila();
        const d = tabela('fluxo_disparos').find(x => x.id === r.id)!;
        assert(d.estado === 'Cancelado', `devia cancelar-se, ficou ${d.estado}`);
    });

    await test('dispara um fluxo "so a mao", mesmo desligado', async () => {
        tabela('automations').push({
            id: 5, nome: 'Seguimento', ativo: false, empresa_id: EMPRESA,
            nodes: [
                { id: 't1', type: 'trigger', data: { triggerKind: 'manual' } },
                { id: 'r1', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'ola' } } }
            ],
            edges: [{ id: 'e1', source: 't1', target: 'r1' }]
        });
        const r = await FluxoDisparoService.criar(EMPRESA, { ...base, automation_id: 5 }, 'user-1');
        assert(r.total === 2, `devia apanhar 2, apanhou ${r.total}`);
        await FluxoDisparoService.iniciar(EMPRESA, r.id);
        await correrTudo();
        assert(corridos.length === 2, `devia correr para os 2, correu ${corridos.length}`);
    });

    await test('dispara um fluxo sem bloco de gatilho nenhum', async () => {
        tabela('automations').push({
            id: 6, nome: 'Sem gatilho', ativo: true, empresa_id: EMPRESA,
            nodes: [{ id: 'r1', type: 'action', position: { x: 0, y: 0 }, data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'ola' } } }],
            edges: []
        });
        const r = await FluxoDisparoService.criar(EMPRESA, { ...base, automation_id: 6 }, 'user-1');
        await FluxoDisparoService.iniciar(EMPRESA, r.id);
        await correrTudo();
        assert(corridos.length === 2, `devia correr para os 2, correu ${corridos.length}`);
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (falhas.length) console.log('Falhou:\n  - ' + falhas.join('\n  - '));
    process.exit(failed === 0 ? 0 : 1);
})();
