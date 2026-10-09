/**
 * Testes da ficha do lead no chat do WhatsApp.
 *
 * Quem escreve para o WhatsApp da empresa é um lead, e o chat só mostrava um
 * nome e um número. Esta ficha é onde se trabalha o lead sem sair da conversa.
 * O que aqui se segura: não se vê nem se mexe em contactos de outra empresa, e
 * um lead que nunca chegou ao CRM ganha ficha ao ser guardado — senão não havia
 * onde pendurar as etiquetas.
 *
 * Uso: npx ts-node scripts/testFichaContacto.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import path from 'path';
import express from 'express';

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
    const filtros: any[] = [];
    let op = 'select'; let payload: any = null; let contar = false;
    const self: any = {}; const ret = () => self;
    self.select = (_c?: string, o?: any) => { if (o?.count) contar = true; return self; };
    self.order = ret; self.limit = ret; self.not = ret; self.or = ret; self.is = ret; self.filter = ret;
    self.neq = (col: string, val: any) => { filtros.push({ col, val, op: 'neq' }); return self; };
    self.insert = (p: any) => { op = 'insert'; payload = p; return self; };
    self.update = (p: any) => { op = 'update'; payload = p; return self; };
    self.delete = () => { op = 'delete'; return self; };
    self.eq = (col: string, val: any) => { filtros.push({ col, val, op: 'eq' }); return self; };
    self.in = (col: string, val: any[]) => { filtros.push({ col, val, op: 'in' }); return self; };

    const correr = () => {
        const linhas = tabela(t);
        if (op === 'insert') {
            const novos = (Array.isArray(payload) ? payload : [payload]).map(p => ({ id: p.id ?? seq++, ...p }));
            if (t === 'etiquetas') {
                for (const n of novos) {
                    if (linhas.some(l => l.empresa_id === n.empresa_id && String(l.nome).toLowerCase() === String(n.nome).toLowerCase())) {
                        return { data: null, error: { code: '23505', message: 'duplicate key' } };
                    }
                }
            }
            linhas.push(...novos);
            return { data: Array.isArray(payload) ? novos : novos[0], error: null };
        }
        if (op === 'update') { const alvo = linhas.filter(l => bate(l, filtros)); alvo.forEach(l => Object.assign(l, payload)); return { data: alvo.map(l => JSON.parse(JSON.stringify(l))), error: null }; }
        if (op === 'delete') { const fora = linhas.filter(l => bate(l, filtros)); db[t] = linhas.filter(l => !bate(l, filtros)); return { data: fora, error: null }; }
        const achados = linhas.filter(l => bate(l, filtros)).map(l => JSON.parse(JSON.stringify(l)));
        return contar ? { data: null, error: null, count: achados.length } : { data: achados, error: null };
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
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'x' } }) }) }
};
const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });

const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);

const emailPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'EmailService'));
require.cache[emailPath] = fake({ EmailService: { enviarEmailPersonalizado: async () => true, isConfigured: async () => true } }, emailPath);
class MockOpenAI {
    embeddings = { create: async () => ({ data: [{ embedding: new Array(1536).fill(0.001) }] }) };
    chat = { completions: { create: async () => ({ choices: [{ message: { content: 'ia' } }] }) } };
}
require.cache[require.resolve('openai')] = fake(MockOpenAI, require.resolve('openai'));

const EMPRESA = 'empresa-1';
const OUTRA = 'empresa-2';

const authMwPath = require.resolve(path.join(__dirname, '..', 'src', 'middleware', 'authMiddleware'));
require.cache[authMwPath] = fake({
    requireAuth: (req: any, _s: any, n: any) => { req.user = { id: 'agente-1', empresa_id: EMPRESA }; n(); },
    AuthRequest: {}
}, authMwPath);

const whatsappRoutes = require(path.join(__dirname, '..', 'src', 'api', 'whatsappRoutes')).default;
const etiquetaRoutes = require(path.join(__dirname, '..', 'src', 'api', 'etiquetaRoutes')).default;

const app = express();
app.use(express.json());
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/etiquetas', etiquetaRoutes);
const servidor = app.listen(0);
const PORTA = (servidor.address() as any).port;
const B = `http://127.0.0.1:${PORTA}`;

const chamar = async (metodo: string, rota: string, corpo?: any) => {
    const r = await fetch(B + rota, {
        method: metodo, headers: { 'Content-Type': 'application/json' },
        body: corpo ? JSON.stringify(corpo) : undefined
    });
    return [r.status, await r.json().catch(() => ({}))] as [number, any];
};

let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };

async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    // Acima dos ids semeados a mao, senao um registo novo nascia com o id de um
    // existente e os testes mediam a linha errada.
    seq = 100;
    tabela('wa_conversations').push(
        { id: 'conv-1', empresa_id: EMPRESA, channel_id: 'chan-1', phone_number: '244923000111', contact_name: 'Maria Cliente', created_at: '2026-01-10T10:00:00Z', last_client_message_at: '2026-02-01T09:00:00Z' },
        { id: 'conv-nova', empresa_id: EMPRESA, channel_id: 'chan-1', phone_number: '244923999888', contact_name: '244923999888', created_at: '2026-03-01T10:00:00Z' },
        { id: 'conv-outra', empresa_id: OUTRA, channel_id: 'chan-2', phone_number: '244900000000', contact_name: 'De outra empresa' }
    );
    tabela('clientes').push(
        { id: 1, empresa_id: EMPRESA, nome: 'Maria Cliente', telefone: '244923000111', email: null, empresa: null, tags: ['cliente'], custom_fields: {}, criado_em: '2026-01-10T10:00:00Z' },
        { id: 9, empresa_id: OUTRA, nome: 'De outra', telefone: '244900000000', tags: ['segredo'], custom_fields: {} }
    );
    tabela('wa_messages').push(
        { id: 'm1', conversation_id: 'conv-1', direction: 'inbound', content: 'Olá' },
        { id: 'm2', conversation_id: 'conv-1', direction: 'outbound', content: 'Boa tarde' }
    );
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}

const clienteDe = (id: number) => tabela('clientes').find(c => c.id === id)!;

(async () => {
    console.log('\n=== Abrir a ficha ===\n');

    await test('mostra o contacto, as etiquetas e quantas mensagens tem', async () => {
        const [s, d] = await chamar('GET', '/api/whatsapp/conversations/conv-1/contacto');
        assert(s === 200 && d.success, `devia abrir: ${JSON.stringify(d)}`);
        assert(d.cliente?.nome === 'Maria Cliente', `nome errado: ${d.cliente?.nome}`);
        assert(d.cliente?.tags?.includes('cliente'), `etiquetas erradas: ${JSON.stringify(d.cliente?.tags)}`);
        assert(d.totalMensagens === 2, `deviam ser 2 mensagens, são ${d.totalMensagens}`);
    });

    await test('um lead que ainda não está no CRM abre na mesma', async () => {
        const [s, d] = await chamar('GET', '/api/whatsapp/conversations/conv-nova/contacto');
        assert(s === 200 && d.success, 'devia abrir');
        assert(d.cliente === null, 'devia dizer que ainda não há ficha no CRM');
        assert(d.conversa?.phone_number === '244923999888', `devia trazer o número: ${d.conversa?.phone_number}`);
    });

    await test('mostra o negócio aberto, se houver', async () => {
        tabela('negocios').push({ id: 7, empresa_id: EMPRESA, cliente_id: 1, titulo: 'Reserva de quarto', fase: 'Em Negociação', criado_em: '2026-02-01T10:00:00Z' });
        const [, d] = await chamar('GET', '/api/whatsapp/conversations/conv-1/contacto');
        assert(d.negocio?.fase === 'Em Negociação', `fase errada: ${JSON.stringify(d.negocio)}`);
    });

    await test('não abre a ficha de uma conversa de outra empresa', async () => {
        const [s] = await chamar('GET', '/api/whatsapp/conversations/conv-outra/contacto');
        assert(s === 404, `devia recusar, deu ${s}`);
    });

    console.log('\n=== Corrigir os dados ===\n');

    await test('guarda nome, email, empresa e notas', async () => {
        const [s, d] = await chamar('PUT', '/api/whatsapp/conversations/conv-1/contacto', {
            nome: 'Maria da Silva', email: 'maria@empresa.ao', empresa: 'Padaria Sol', notas: 'Prefere ser contactada de manhã.'
        });
        assert(s === 200 && d.success, `devia guardar: ${JSON.stringify(d)}`);
        const c = clienteDe(1);
        assert(c.nome === 'Maria da Silva' && c.email === 'maria@empresa.ao', `mal guardado: ${JSON.stringify(c)}`);
        assert(c.custom_fields?.notas === 'Prefere ser contactada de manhã.', `notas mal guardadas: ${JSON.stringify(c.custom_fields)}`);
    });

    await test('o nome corrigido passa a ser o da lista de conversas', async () => {
        await chamar('PUT', '/api/whatsapp/conversations/conv-1/contacto', { nome: 'Maria da Silva' });
        const conv = tabela('wa_conversations').find(c => c.id === 'conv-1')!;
        assert(conv.contact_name === 'Maria da Silva', `a conversa devia passar a mostrar o nome certo: ${conv.contact_name}`);
    });

    await test('um lead sem ficha ganha-a ao ser guardado', async () => {
        // Sem isto não havia onde pendurar as etiquetas de quem acabou de escrever.
        const antes = tabela('clientes').length;
        const [s, d] = await chamar('PUT', '/api/whatsapp/conversations/conv-nova/contacto', { nome: 'Novo Lead', email: 'novo@exemplo.ao' });
        assert(s === 200 && d.success, `devia criar: ${JSON.stringify(d)}`);
        assert(tabela('clientes').length === antes + 1, 'devia aparecer um contacto novo no CRM');
        assert(d.cliente?.telefone === '244923999888', `telefone errado: ${d.cliente?.telefone}`);
    });

    await test('não guarda nada numa conversa de outra empresa', async () => {
        const [s] = await chamar('PUT', '/api/whatsapp/conversations/conv-outra/contacto', { nome: 'Invasor' });
        assert(s === 404, `devia recusar, deu ${s}`);
        assert(clienteDe(9).nome === 'De outra', 'o contacto da outra empresa não podia ser tocado');
    });

    console.log('\n=== Etiquetas a partir do chat ===\n');

    await test('põe uma etiqueta ao lead e ela fica na ficha', async () => {
        const [s, d] = await chamar('PUT', '/api/etiquetas/contacto/1', { adicionar: ['interessado'] });
        assert(s === 200 && d.success, `devia pôr: ${JSON.stringify(d)}`);
        const [, ficha] = await chamar('GET', '/api/whatsapp/conversations/conv-1/contacto');
        assert(ficha.cliente.tags.includes('interessado'), `devia aparecer na ficha: ${JSON.stringify(ficha.cliente.tags)}`);
    });

    await test('tira a etiqueta a quem já comprou', async () => {
        await chamar('PUT', '/api/etiquetas/contacto/1', { adicionar: ['comprou'] });
        const [, d] = await chamar('PUT', '/api/etiquetas/contacto/1', { remover: ['comprou'] });
        assert(!d.tags.includes('comprou'), `devia sair: ${JSON.stringify(d.tags)}`);
        assert(d.tags.includes('cliente'), 'não pode levar as outras à frente');
    });

    await test('não põe etiquetas num contacto de outra empresa', async () => {
        const [s] = await chamar('PUT', '/api/etiquetas/contacto/9', { adicionar: ['intruso'] });
        assert(s === 400, `devia recusar, deu ${s}`);
        assert(!clienteDe(9).tags.includes('intruso'), 'o contacto da outra empresa não podia ser tocado');
    });

    console.log('\n=== Etiquetas na lista de conversas ===\n');

    await test('a lista de conversas traz as etiquetas, com a cor do catalogo', async () => {
        // Sem isto so se viam abrindo a ficha de cada um, e nao se percebia num
        // relance quem esta em que ponto.
        tabela('etiquetas').push({ id: 'e1', empresa_id: EMPRESA, nome: 'comprou', cor: '#107E3E' });
        await chamar('PUT', '/api/etiquetas/contacto/1', { adicionar: ['comprou'] });
        const [s, d] = await chamar('GET', '/api/whatsapp/conversations');
        assert(s === 200 && d.success, `devia listar: ${JSON.stringify(d).slice(0, 200)}`);
        const maria = (d.conversations || []).find((c: any) => c.id === 'conv-1');
        assert(!!maria, 'a conversa devia estar na lista');
        const nomes = (maria.etiquetas || []).map((e: any) => e.nome);
        assert(nomes.includes('comprou'), `devia trazer a etiqueta: ${JSON.stringify(maria.etiquetas)}`);
        const comprou = maria.etiquetas.find((e: any) => e.nome === 'comprou');
        assert(comprou.cor === '#107E3E', `devia trazer a cor do catalogo: ${comprou.cor}`);
    });

    await test('uma conversa sem contacto no CRM vem sem etiquetas, e nao rebenta', async () => {
        const [s, d] = await chamar('GET', '/api/whatsapp/conversations');
        const nova = (d.conversations || []).find((c: any) => c.id === 'conv-nova');
        assert(s === 200 && !!nova, 'devia listar na mesma');
        assert(Array.isArray(nova.etiquetas) && nova.etiquetas.length === 0, `devia vir vazia: ${JSON.stringify(nova.etiquetas)}`);
    });

    await test('nao traz etiquetas de contactos de outra empresa', async () => {
        const [, d] = await chamar('GET', '/api/whatsapp/conversations');
        assert(!(d.conversations || []).some((c: any) => c.id === 'conv-outra'), 'a conversa da outra empresa nao devia aparecer');
    });

    servidor.unref();
    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (falhas.length) console.log('Falhou:\n  - ' + falhas.join('\n  - '));
    process.exit(failed === 0 ? 0 : 1);
})();
