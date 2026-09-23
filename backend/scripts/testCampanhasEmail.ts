/**
 * Testes das campanhas de email.
 *
 * O que interessa a quem manda 2000 emails: ninguém receber duas vezes, ninguém
 * ficar de fora por um endereço mal escrito, a campanha andar aos poucos em vez
 * de disparar tudo, e uma falha num destinatário não parar os outros.
 *
 * Uso: npx ts-node scripts/testCampanhasEmail.ts   (a partir de backend/)
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
    switch (x.op) {
        case 'eq': return String(v) === String(x.val);
        case 'neq': return String(v) !== String(x.val);
        case 'in': return x.val.map(String).includes(String(v));
        case 'lte': return String(v ?? '') <= String(x.val);
        case 'overlaps': return Array.isArray(v) && v.some((t: any) => x.val.includes(t));
        default: return true;
    }
});

function mockFrom(t: string) {
    const filtros: any[] = [];
    let op = 'select'; let payload: any = null; let limite = Infinity; let contar = false;
    const self: any = {}; const ret = () => self;
    self.select = (_c?: string, o?: any) => { if (o?.count) contar = true; return self; };
    self.order = ret; self.not = ret; self.or = ret; self.is = ret; self.ilike = ret; self.gt = ret; self.gte = ret; self.lt = ret;
    self.limit = (n: number) => { limite = n; return self; };
    self.insert = (p: any) => { op = 'insert'; payload = p; return self; };
    self.update = (p: any) => { op = 'update'; payload = p; return self; };
    self.delete = () => { op = 'delete'; return self; };
    for (const o of ['eq', 'neq', 'in', 'lte', 'overlaps'] as const) {
        self[o] = (col: string, val: any) => { filtros.push({ col, val, op: o }); return self; };
    }
    const correr = () => {
        const linhas = tabela(t);
        if (op === 'insert') {
            const novos = (Array.isArray(payload) ? payload : [payload]).map(p => ({ id: p.id ?? seq++, ...p }));
            // O índice único (campanha_id, lower(email)) da migração, replicado aqui.
            if (t === 'email_campanha_destinatarios') {
                for (const n of novos) {
                    const repetido = linhas.some(l => l.campanha_id === n.campanha_id && String(l.email).toLowerCase() === String(n.email).toLowerCase());
                    if (repetido) return { data: null, error: { code: '23505', message: 'duplicate key' } };
                }
            }
            linhas.push(...novos);
            return { data: Array.isArray(payload) ? novos : novos[0], error: null };
        }
        if (op === 'update') {
            const alvo = linhas.filter(l => bate(l, filtros));
            alvo.forEach(l => Object.assign(l, payload));
            return { data: alvo.map(l => JSON.parse(JSON.stringify(l))), error: null, count: alvo.length };
        }
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

// O serviço de email real, com o transporte trocado.
const emailPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'EmailService'));
const { EmailService } = require(emailPath);
const enviados: { para: string; assunto: string; corpo: string; anexos?: any[] }[] = [];
let recusarEstes: string[] = [];
EmailService.isConfigured = async () => true;
EmailService.enviarEmailPersonalizado = async (para: string, assunto: string, corpo: string, _e?: any, _c?: any, o?: any) => {
    if (recusarEstes.includes(para)) return false;
    enviados.push({ para, assunto, corpo, anexos: o?.anexosGuardados });
    return true;
};

// O Storage e trocado por um mapa em memoria, para se poder contar quantas vezes
// o mesmo anexo foi lido (uma campanha nao pode ir buscar o ficheiro por pessoa).
const mediaPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'MediaUploadService'));
const { MediaUploadService } = require(mediaPath);
let leiturasDoAnexo = 0;
MediaUploadService.descarregarDocumento = async (caminho: string) => {
    leiturasDoAnexo++;
    if (caminho.includes('desaparecido')) throw new Error('ficheiro apagado do Storage');
    return Buffer.from('conteudo do anexo');
};

const { EmailCampaignService } = require(path.join(__dirname, '..', 'src', 'services', 'EmailCampaignService'));

const EMPRESA = 'empresa-1';
let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };

async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    enviados.length = 0; recusarEstes = []; seq = 1; leiturasDoAnexo = 0;
    tabela('clientes').push(
        { id: 1, empresa_id: EMPRESA, nome: 'Ana Paula', email: 'ana@exemplo.ao', empresa: 'Padaria Sol', tags: ['cliente'], custom_fields: { cidade: 'Luanda' } },
        { id: 2, empresa_id: EMPRESA, nome: 'Carlos', email: 'carlos@exemplo.ao', empresa: null, tags: ['lead'], custom_fields: null },
        { id: 3, empresa_id: EMPRESA, nome: 'Sem Email', email: null, empresa: null, tags: ['cliente'], custom_fields: null },
        { id: 4, empresa_id: EMPRESA, nome: 'Mal Escrito', email: 'isto-nao-e-email', empresa: null, tags: ['cliente'], custom_fields: null },
        { id: 5, empresa_id: EMPRESA, nome: 'Repetida', email: 'ANA@exemplo.ao', empresa: null, tags: ['cliente'], custom_fields: null },
        { id: 9, empresa_id: 'outra-empresa', nome: 'De Outra', email: 'outra@exemplo.ao', empresa: null, tags: ['cliente'], custom_fields: null }
    );
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}

const base = {
    nome: 'Promoção de setembro', assunto: 'Olá {{nome}}, temos novidades',
    corpo_html: '<p>Bom dia {{nome}} da {{empresa}}. Falamos consigo para {{email}}.</p>',
    publico_tipo: 'todos' as const
};

(async () => {
    console.log('\n=== Quem recebe ===\n');

    await test('só entram contactos desta empresa e com email válido', async () => {
        const c = await EmailCampaignService.resolverPublico(EMPRESA, 'todos', {});
        const enderecos = c.map((x: any) => x.email).sort();
        assert(c.length === 2, `deviam ser 2 (Ana e Carlos), foram ${c.length}: ${enderecos.join(', ')}`);
        assert(!enderecos.includes('outra@exemplo.ao'), 'nunca pode apanhar contactos de outra empresa');
        assert(!enderecos.includes('isto-nao-e-email'), 'endereço inválido não devia entrar');
    });

    await test('o mesmo endereço não entra duas vezes, mesmo escrito em maiúsculas', async () => {
        const c = await EmailCampaignService.resolverPublico(EMPRESA, 'todos', {});
        const minusculas = c.map((x: any) => String(x.email).toLowerCase());
        assert(new Set(minusculas).size === minusculas.length, `endereços repetidos: ${minusculas.join(', ')}`);
    });

    await test('filtrar por etiqueta', async () => {
        const c = await EmailCampaignService.resolverPublico(EMPRESA, 'tags', { tags: ['lead'] });
        assert(c.length === 1 && c[0].email === 'carlos@exemplo.ao', `devia ser só o Carlos: ${JSON.stringify(c)}`);
    });

    await test('lista colada à mão aceita vírgulas, linhas e ignora o lixo', async () => {
        const c = await EmailCampaignService.resolverPublico(EMPRESA, 'lista', {
            lista: 'a@x.ao, b@x.ao\nc@x.ao; lixo, a@x.ao'
        });
        assert(c.length === 3, `deviam ser 3 endereços únicos, foram ${c.length}: ${c.map((x: any) => x.email).join(', ')}`);
    });

    console.log('\n=== Criar ===\n');

    await test('cada pessoa fica com a sua própria mensagem já resolvida', async () => {
        const r = await EmailCampaignService.criar(EMPRESA, base, 'user-1');
        assert(r.totalDestinatarios === 2, `deviam ser 2 destinatários, são ${r.totalDestinatarios}`);
        const dest = tabela('email_campanha_destinatarios');
        const ana = dest.find(d => d.email === 'ana@exemplo.ao');
        assert(ana.assunto_resolvido === 'Olá Ana Paula, temos novidades', `assunto mal resolvido: ${ana.assunto_resolvido}`);
        assert(ana.corpo_resolvido.includes('Ana Paula') && ana.corpo_resolvido.includes('Padaria Sol'), `corpo mal resolvido: ${ana.corpo_resolvido}`);
        const carlos = dest.find(d => d.email === 'carlos@exemplo.ao');
        assert(!carlos.corpo_resolvido.includes('{{'), `ficaram chavetas por resolver: ${carlos.corpo_resolvido}`);
        assert(carlos.corpo_resolvido.includes('da .'), `sem empresa, a variável devia ficar vazia: ${carlos.corpo_resolvido}`);
    });

    await test('recusa campanha sem assunto, sem mensagem ou sem ninguém', async () => {
        const falhou = async (dados: any, esperado: RegExp) => {
            try { await EmailCampaignService.criar(EMPRESA, dados, 'user-1'); return 'não falhou'; }
            catch (e: any) { return esperado.test(e.message) ? 'ok' : `mensagem errada: ${e.message}`; }
        };
        assert((await falhou({ ...base, assunto: '' }, /assunto/i)) === 'ok', 'devia exigir assunto');
        assert((await falhou({ ...base, corpo_html: '' }, /mensagem/i)) === 'ok', 'devia exigir mensagem');
        assert((await falhou({ ...base, publico_tipo: 'lista', lista: 'nada disto presta' }, /endereço|válido/i)) === 'ok', 'devia recusar lista sem endereços');
    });

    await test('a velocidade é travada no máximo que os servidores aguentam', async () => {
        await EmailCampaignService.criar(EMPRESA, { ...base, velocidade_por_minuto: 5000 }, 'user-1');
        const c = tabela('email_campanhas')[0];
        assert(c.velocidade_por_minuto <= 60, `velocidade devia ser travada, ficou ${c.velocidade_por_minuto}`);
    });

    console.log('\n=== Enviar ===\n');

    await test('envia a cada pessoa a mensagem dela', async () => {
        const r = await EmailCampaignService.criar(EMPRESA, base, 'user-1');
        await EmailCampaignService.iniciar(EMPRESA, r.id);
        await EmailCampaignService.processarFila();
        assert(enviados.length === 2, `deviam sair 2 emails, saíram ${enviados.length}`);
        const paraAna = enviados.find(e => e.para === 'ana@exemplo.ao');
        assert(paraAna!.assunto.includes('Ana Paula'), `a Ana devia receber o assunto dela: ${paraAna!.assunto}`);
    });

    await test('correr a fila duas vezes não envia a mesma coisa duas vezes', async () => {
        const r = await EmailCampaignService.criar(EMPRESA, base, 'user-1');
        await EmailCampaignService.iniciar(EMPRESA, r.id);
        await EmailCampaignService.processarFila();
        await EmailCampaignService.processarFila();
        assert(enviados.length === 2, `devia continuar a 2 emails, foram ${enviados.length}`);
    });

    await test('uma falha não trava os outros e fica registada', async () => {
        recusarEstes = ['carlos@exemplo.ao'];
        const r = await EmailCampaignService.criar(EMPRESA, base, 'user-1');
        await EmailCampaignService.iniciar(EMPRESA, r.id);
        await EmailCampaignService.processarFila();
        assert(enviados.some(e => e.para === 'ana@exemplo.ao'), 'a Ana devia receber na mesma');
        const carlos = tabela('email_campanha_destinatarios').find(d => d.email === 'carlos@exemplo.ao');
        assert(carlos.estado === 'Falhou', `o Carlos devia ficar como Falhou, está ${carlos.estado}`);
        assert(!!carlos.erro, 'devia guardar o motivo da falha');
        const m = await EmailCampaignService.metricas(EMPRESA, r.id);
        assert(m.enviados === 1 && m.falhados === 1, `métricas erradas: ${JSON.stringify(m)}`);
    });

    await test('a campanha fecha-se sozinha quando não falta ninguém', async () => {
        const r = await EmailCampaignService.criar(EMPRESA, base, 'user-1');
        await EmailCampaignService.iniciar(EMPRESA, r.id);
        await EmailCampaignService.processarFila();
        await EmailCampaignService.processarFila();
        const c = tabela('email_campanhas')[0];
        assert(c.estado === 'Concluida', `devia ficar Concluida, ficou ${c.estado}`);
        assert(!!c.concluida_em, 'devia registar a hora em que acabou');
    });

    await test('pausada deixa de enviar; retomada continua de onde ficou', async () => {
        const r = await EmailCampaignService.criar(EMPRESA, { ...base, publico_tipo: 'lista', lista: 'a@x.ao, b@x.ao, c@x.ao', velocidade_por_minuto: 3 }, 'user-1');
        await EmailCampaignService.iniciar(EMPRESA, r.id);
        await EmailCampaignService.processarFila();
        const enviadosAntes = enviados.length;
        await EmailCampaignService.pausar(EMPRESA, r.id);
        await EmailCampaignService.processarFila();
        assert(enviados.length === enviadosAntes, `pausada não devia enviar mais (${enviadosAntes} -> ${enviados.length})`);
        await EmailCampaignService.iniciar(EMPRESA, r.id);
        // Com 3 por minuto, cada ciclo manda 1 — é o ritmo, não um erro. O que
        // interessa é chegar ao fim sem repetir ninguém.
        for (let i = 0; i < 6; i++) await EmailCampaignService.processarFila();
        assert(enviados.length === 3, `depois de retomar deviam sair os 3, saíram ${enviados.length}`);
        assert(new Set(enviados.map(e => e.para)).size === 3, 'ninguém pode receber duas vezes');
        assert(tabela('email_campanhas')[0].estado === 'Concluida', 'devia acabar por ficar Concluida');
    });

    await test('cancelar tira da fila quem ainda não recebeu', async () => {
        const r = await EmailCampaignService.criar(EMPRESA, base, 'user-1');
        await EmailCampaignService.cancelar(EMPRESA, r.id);
        await EmailCampaignService.processarFila();
        assert(enviados.length === 0, `cancelada não devia enviar nada, enviou ${enviados.length}`);
        const c = tabela('email_campanhas')[0];
        assert(c.estado === 'Cancelada', `estado devia ser Cancelada, é ${c.estado}`);
    });

    await test('os emails da campanha não enchem a caixa de Enviados', async () => {
        const r = await EmailCampaignService.criar(EMPRESA, base, 'user-1');
        await EmailCampaignService.iniciar(EMPRESA, r.id);
        await EmailCampaignService.processarFila();
        assert(tabela('emails').length === 0, `a campanha não devia gravar cópias na caixa, gravou ${tabela('emails').length}`);
    });

    console.log('\n=== Anexos ===\n');

    const ANEXO = { nome: 'catalogo.pdf', caminho: 'empresa-1/email-anexos/123_catalogo.pdf', tipo: 'application/pdf', tamanho: 1024 };

    await test('o anexo segue com a mensagem', async () => {
        const r = await EmailCampaignService.criar(EMPRESA, { ...base, anexos: [ANEXO] }, 'user-1');
        await EmailCampaignService.iniciar(EMPRESA, r.id);
        await EmailCampaignService.processarFila();
        assert(enviados.length === 2, `deviam sair 2 emails, sairam ${enviados.length}`);
        assert(enviados.every(e => e.anexos?.length === 1), `todos deviam levar o anexo: ${JSON.stringify(enviados.map(e => e.anexos))}`);
    });

    await test('o ficheiro so e lido uma vez, nao uma vez por pessoa', async () => {
        const r = await EmailCampaignService.criar(EMPRESA, { ...base, publico_tipo: 'lista', lista: 'a@x.ao, b@x.ao, c@x.ao', anexos: [{ ...ANEXO, caminho: 'empresa-1/email-anexos/so-deste-teste.pdf' }] }, 'user-1');
        await EmailCampaignService.iniciar(EMPRESA, r.id);
        for (let i = 0; i < 4; i++) await EmailCampaignService.processarFila();
        assert(enviados.length === 3, `deviam sair 3 emails, sairam ${enviados.length}`);
        assert(leiturasDoAnexo === 1, `o anexo devia ser lido 1 vez, foi ${leiturasDoAnexo}`);
    });

    await test('anexo que desapareceu do Storage marca como falhado, sem mentir que enviou', async () => {
        const perdido = { nome: 'perdido.pdf', caminho: 'empresa-1/email-anexos/desaparecido.pdf', tipo: 'application/pdf' };
        const r = await EmailCampaignService.criar(EMPRESA, { ...base, publico_tipo: 'lista', lista: 'a@x.ao', anexos: [perdido] }, 'user-1');
        await EmailCampaignService.iniciar(EMPRESA, r.id);
        await EmailCampaignService.processarFila();
        assert(enviados.length === 0, 'nao devia enviar nada');
        const d = tabela('email_campanha_destinatarios')[0];
        assert(d.estado === 'Falhou', `devia ficar Falhou, esta ${d.estado}`);
        assert(/anexo/i.test(d.erro || ''), `o motivo devia falar do anexo: ${d.erro}`);
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (falhas.length) console.log('Falhou:\n  - ' + falhas.join('\n  - '));
    process.exit(failed === 0 ? 0 : 1);
})();
