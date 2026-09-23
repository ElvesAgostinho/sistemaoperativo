/**
 * Teste de ponta a ponta: UM fluxo que usa TODOS os tipos de nó, corrido como
 * uma conversa real de WhatsApp (mensagem a mensagem), com o módulo de
 * Agendamento ligado.
 *
 * Os outros testes olham para os nós um a um. Este responde à pergunta que o
 * gestor faz: "se eu montar o fluxo todo, alguma coisa falha?". Por isso
 * verifica o que o cliente vê (as mensagens, por ordem) e o que fica gravado
 * (a marcação no Agendamento, com os campos próprios da empresa).
 *
 * Nada de IA: as datas e horas são lidas por regras (TextoDataHoraService).
 *
 * Uso: npx ts-node scripts/testFluxoCompleto.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import path from 'path';

// ============================================================
// Base de dados em memória (o estado tem de sobreviver entre mensagens)
// ============================================================
type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
let seq = 1;
const tabela = (t: string) => (db[t] = db[t] || []);

const bate = (row: Row, filtros: any[]) => filtros.every(f => {
    const v = row[f.col];
    switch (f.op) {
        case 'eq': return String(v) === String(f.val);
        case 'neq': return String(v) !== String(f.val);
        case 'in': return f.val.map(String).includes(String(v));
        case 'is': return f.val === null ? (v === null || v === undefined) : v === f.val;
        case 'ilike': return String(v || '').toLowerCase().includes(String(f.val).replace(/%/g, '').toLowerCase());
        case 'gt': return String(v) > String(f.val);
        case 'lt': return String(v) < String(f.val);
        case 'gte': return String(v) >= String(f.val);
        case 'lte': return String(v) <= String(f.val);
        case 'json': return String((row[f.col] || {})[f.sub]) === String(f.val);
        default: return true;
    }
});

function mockFrom(t: string) {
    const filtros: any[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
    let payload: any = null;
    const self: any = {};
    const ret = () => self;

    let selecao = '*';
    self.select = (cols?: string) => { if (cols) selecao = cols; return self; };
    self.order = ret; self.limit = ret; self.not = ret; self.or = ret;
    self.insert = (p: any) => { op = 'insert'; payload = p; return self; };
    self.update = (p: any) => { op = 'update'; payload = p; return self; };
    self.upsert = (p: any) => { op = 'upsert'; payload = p; return self; };
    self.delete = () => { op = 'delete'; return self; };
    for (const o of ['eq', 'neq', 'in', 'is', 'ilike', 'gt', 'lt', 'gte', 'lte'] as const) {
        self[o] = (col: string, val: any) => { filtros.push({ col, val, op: o }); return self; };
    }
    self.filter = (col: string, _op: string, val: any) => { const [c, sub] = col.split('->>'); filtros.push({ col: c, sub, val, op: 'json' }); return self; };

    const correr = () => {
        const linhas = tabela(t);
        if (op === 'insert' || op === 'upsert') {
            const novos = (Array.isArray(payload) ? payload : [payload]).map(p => ({ id: p.id ?? seq++, ...p }));
            for (const n of novos) {
                const chave = n.chave ?? n.id;
                if ((op === 'upsert' || t === 'wa_eventos_processados') && linhas.some(l => (l.chave ?? l.id) === chave)) {
                    return { data: null, error: { code: '23505', message: 'duplicate key' } };
                }
                linhas.push(n);
            }
            return { data: Array.isArray(payload) ? novos : novos[0], error: null };
        }
        if (op === 'update') { const alvo = linhas.filter(l => bate(l, filtros)); alvo.forEach(l => Object.assign(l, payload)); return { data: alvo, error: null }; }
        if (op === 'delete') { const fora = linhas.filter(l => bate(l, filtros)); db[t] = linhas.filter(l => !bate(l, filtros)); return { data: fora, error: null }; }
        // Cópias, como o Supabase real devolve, já com os "joins" do Supabase
        // resolvidos (ex: agendamento_servicos(nome) → linha.agendamento_servicos).
        const achados = linhas.filter(l => bate(l, filtros)).map(l => JSON.parse(JSON.stringify(l)));
        for (const [, alvo] of selecao.matchAll(/([a-z_]+)\s*\(/g)) {
            const chave = alvo.replace(/^agendamento_/, '').replace(/s$/, '') + '_id';
            for (const linha of achados) {
                const ligado = tabela(alvo).find(x => String(x.id) === String(linha[chave]));
                if (ligado) linha[alvo] = JSON.parse(JSON.stringify(ligado));
            }
        }
        return { data: achados, error: null };
    };
    const um = () => { const r = correr(); const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data; return { data: d, error: r.error || (d ? null : { code: 'PGRST116' }) }; };
    self.single = () => Promise.resolve(um());
    self.maybeSingle = () => Promise.resolve({ ...um(), error: null });
    self.then = (res: any, rej: any) => Promise.resolve(correr()).then(res, rej);
    self.catch = (rej: any) => Promise.resolve(correr()).catch(rej);
    return self;
}

const mockSupabase: any = { from: mockFrom, rpc: () => Promise.resolve({ data: [], error: null }) };
const fake = (e: any, p: string): NodeModule => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null } as any);

const enviadas: { content: string }[] = [];
const emails: any[] = [];
const midia: any[] = [];
const templates: any[] = [];

const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);
const waPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'WhatsAppChannelManager'));
require.cache[waPath] = fake({ WhatsAppChannelManager: {
    sendMessage: async (_s: any, _c: string, _p: string, content: string) => { enviadas.push({ content }); return 'mid'; },
    sendMediaMessage: async (_s: any, _c: string, _p: string, url: string, legenda: string) => { midia.push({ url, legenda }); return true; }
} }, waPath);
const emailPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'EmailService'));
require.cache[emailPath] = fake({ EmailService: { enviarEmailPersonalizado: async (...a: any[]) => { emails.push(a); return true; } } }, emailPath);
const tplPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'WhatsAppTemplateService'));
const tplReal = require(tplPath);
require.cache[tplPath] = fake({ WhatsAppTemplateService: {
    ...tplReal.WhatsAppTemplateService,
    enviar: async (...a: any[]) => { templates.push(a); enviadas.push({ content: '[template] boas_vindas' }); return { ok: true }; }
} }, tplPath);
class MockOpenAI {
    embeddings = { create: async () => ({ data: [{ embedding: new Array(1536).fill(0.001) }] }) };
    chat = { completions: { create: async () => ({ choices: [{ message: { content: 'resposta IA' } }] }) } };
}
require.cache[require.resolve('openai')] = fake(MockOpenAI, require.resolve('openai'));

const { AutomationEngine } = require(path.join(__dirname, '..', 'src', 'services', 'AutomationEngine'));
const Engine: any = AutomationEngine;

// ============================================================
// O fluxo: uma residencial que reserva quartos pelo WhatsApp
// ============================================================
const CANAL = 'chan-1';
const EMPRESA = 'empresa-1';
const TELEFONE = '244923000111';
const SERVICO = 'Quarto simples';

const fluxoCompleto = () => ({
    id: 1, nome: 'Residencial — reservas', ativo: true, empresa_id: EMPRESA,
    nodes: [
        { id: 't1', type: 'trigger', data: { triggerKind: 'whatsapp_message', matchMode: 'any' } },
        { id: 'log', type: 'action', data: { actionType: 'LOG_MESSAGE', config: { mensagem: 'entrou {{nome_whatsapp}}' } } },
        { id: 'tag', type: 'action', data: { actionType: 'ADD_TAG', config: { tag: 'lead_reserva' } } },
        { id: 'campo', type: 'action', data: { actionType: 'SET_CUSTOM_FIELD', config: { campo: 'origem_lead', valor: 'whatsapp' } } },
        { id: 'ola', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Ola {{nome_whatsapp}}! Aqui e a Residencial.' } } },
        { id: 'img', type: 'action', data: { actionType: 'SEND_IMAGE', config: { ficheiro: 'https://exemplo.ao/quarto.jpg', legenda: 'O nosso quarto' } } },
        { id: 'pausa', type: 'action', data: { actionType: 'DELAY', config: { segundos: 0 } } },
        { id: 'menu', type: 'menu', data: {
            pergunta: 'MENU: 1 - Reservar | 2 - As minhas reservas | 3 - Falar com alguem',
            options: [
                { id: 'o1', label: 'Reservar', matchValue: '1' },
                { id: 'o2', label: 'As minhas reservas', matchValue: '2' },
                { id: 'o3', label: 'Humano', matchValue: '3' }
            ] } },

        // ramo 1 — reservar
        { id: 'pedeData', type: 'action', data: { actionType: 'WAIT_REPLY', config: { mensagem: 'Para que dia quer reservar?', guardarEm: 'data_pedida' } } },
        { id: 'vagas', type: 'action', data: { actionType: 'CHECK_SLOTS', config: { servico: SERVICO, data: '{{data_pedida}}', guardarEm: 'horarios_livres', maximo: 6 } } },
        { id: 'temVagas', type: 'condition', data: { variable: '{{tem_vagas}}', operator: '==', value: 'sim' } },
        { id: 'semVagas', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Nesse dia nao consigo. {{agendamento_erro}}' } } },
        { id: 'voltaMenu', type: 'action', data: { actionType: 'GOTO_MENU', config: { menuNodeId: 'menu' } } },
        { id: 'pedeHora', type: 'action', data: { actionType: 'WAIT_REPLY', config: { mensagem: 'Temos livre: {{horarios_livres}}. A que horas?', guardarEm: 'hora_pedida' } } },
        { id: 'pedeNome', type: 'action', data: { actionType: 'WAIT_REPLY', config: { mensagem: 'Em que nome fica a reserva?', guardarEm: 'nome_cliente' } } },
        { id: 'pedePessoas', type: 'action', data: { actionType: 'WAIT_REPLY', config: { mensagem: 'Para quantas pessoas?', guardarEm: 'pessoas' } } },
        { id: 'marcar', type: 'action', data: { actionType: 'CREATE_BOOKING', config: {
            servico: SERVICO, data: '{{data_pedida}}', hora: '{{hora_pedida}}',
            nome: '{{nome_cliente}}', telefone: '{{telefone}}', notas: 'Reserva pelo WhatsApp',
            campos: { pessoas: '{{pessoas}}', pagamento: 'TPA' } } } },
        { id: 'deuCerto', type: 'condition', data: { variable: '{{agendamento_ok}}', operator: '==', value: 'sim' } },
        { id: 'confirmado', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Reservado, {{nome_cliente}}! {{agendamento_data_extenso}} as {{agendamento_hora}}.' } } },
        { id: 'avisaEquipa', type: 'action', data: { actionType: 'NOTIFY_TEAM', config: { destinatario: 'reservas', mensagem: 'Nova reserva de {{nome_cliente}}' } } },
        { id: 'avisaEmail', type: 'action', data: { actionType: 'SEND_EMAIL', config: { para: 'reservas@exemplo.ao', assunto: 'Nova reserva', mensagem: 'Reserva de {{nome_cliente}}' } } },
        { id: 'falhou', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Nao consegui marcar: {{agendamento_erro}}' } } },
        { id: 'voltaMenu2', type: 'action', data: { actionType: 'GOTO_MENU', config: { menuNodeId: 'menu' } } },

        // ramo 2 — as minhas reservas
        { id: 'listar', type: 'action', data: { actionType: 'LIST_BOOKINGS', config: { telefone: '{{telefone}}', guardarEm: 'minhas_marcacoes' } } },
        { id: 'temRes', type: 'condition', data: { variable: '{{tem_marcacoes}}', operator: '==', value: 'sim' } },
        { id: 'mostraRes', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'As suas reservas: {{minhas_marcacoes}}' } } },
        { id: 'semRes', type: 'action', data: { actionType: 'REPLY_MESSAGE', config: { mensagem: 'Ainda nao tem nenhuma reserva connosco.' } } },
        { id: 'voltaMenu3', type: 'action', data: { actionType: 'GOTO_MENU', config: { menuNodeId: 'menu' } } },

        // ramo 3 — template + humano
        { id: 'template', type: 'action', data: { actionType: 'SEND_TEMPLATE', config: { template_id: 'tpl-1', template_nome: 'boas_vindas', params: ['{{nome_whatsapp}}'] } } },
        { id: 'humano', type: 'action', data: { actionType: 'HANDOFF_HUMAN', config: { mensagem: 'Um colega ja continua consigo.' } } },
        { id: 'fim', type: 'end', data: {} }
    ],
    edges: [
        { id: 'a1', source: 't1', target: 'log' }, { id: 'a2', source: 'log', target: 'tag' },
        { id: 'a3', source: 'tag', target: 'campo' }, { id: 'a4', source: 'campo', target: 'ola' },
        { id: 'a5', source: 'ola', target: 'img' }, { id: 'a6', source: 'img', target: 'pausa' },
        { id: 'a7', source: 'pausa', target: 'menu' },
        { id: 'b1', source: 'menu', target: 'pedeData', sourceHandle: 'o1' },
        { id: 'b2', source: 'menu', target: 'listar', sourceHandle: 'o2' },
        { id: 'b3', source: 'menu', target: 'template', sourceHandle: 'o3' },
        { id: 'c1', source: 'pedeData', target: 'vagas' }, { id: 'c2', source: 'vagas', target: 'temVagas' },
        { id: 'c3', source: 'temVagas', target: 'pedeHora', sourceHandle: 'yes' },
        { id: 'c4', source: 'temVagas', target: 'semVagas', sourceHandle: 'no' },
        { id: 'c5', source: 'semVagas', target: 'voltaMenu' },
        { id: 'c6', source: 'pedeHora', target: 'pedeNome' }, { id: 'c7', source: 'pedeNome', target: 'pedePessoas' },
        { id: 'c8', source: 'pedePessoas', target: 'marcar' }, { id: 'c9', source: 'marcar', target: 'deuCerto' },
        { id: 'c10', source: 'deuCerto', target: 'confirmado', sourceHandle: 'yes' },
        { id: 'c11', source: 'deuCerto', target: 'falhou', sourceHandle: 'no' },
        { id: 'c12', source: 'confirmado', target: 'avisaEquipa' }, { id: 'c13', source: 'avisaEquipa', target: 'avisaEmail' },
        { id: 'c14', source: 'avisaEmail', target: 'fim' }, { id: 'c15', source: 'falhou', target: 'voltaMenu2' },
        { id: 'd1', source: 'listar', target: 'temRes' },
        { id: 'd2', source: 'temRes', target: 'mostraRes', sourceHandle: 'yes' },
        { id: 'd3', source: 'temRes', target: 'semRes', sourceHandle: 'no' },
        { id: 'd4', source: 'mostraRes', target: 'voltaMenu3' }, { id: 'd5', source: 'semRes', target: 'voltaMenu3' },
        { id: 'e1', source: 'template', target: 'humano' }, { id: 'e2', source: 'humano', target: 'fim' }
    ]
});

// ============================================================
let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
const dito = () => enviadas.map(e => e.content).join(' | ');

async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    enviadas.length = 0; emails.length = 0; midia.length = 0; templates.length = 0; seq = 1;
    tabela('wa_channels').push({ id: CANAL, empresa_id: EMPRESA, provider: 'evolution', status: 'connected' });
    tabela('agendamento_servicos').push({ id: 1, empresa_id: EMPRESA, nome: SERVICO, duracao_minutos: 60, ativo: true });
    for (let d = 0; d < 7; d++) tabela('agendamento_horarios').push({ id: d + 1, empresa_id: EMPRESA, dia_semana: d, hora_inicio: '08:00', hora_fim: '18:00', ativo: true });
    tabela('agendamento_config').push({ empresa_id: EMPRESA, modelo: 'hotel', rotulo_item: 'Quarto', rotulo_item_plural: 'Quartos',
        campos: [{ chave: 'pessoas', rotulo: 'N de pessoas', tipo: 'numero', obrigatorio: true }, { chave: 'pagamento', rotulo: 'Pagamento', tipo: 'texto' }] });
    tabela('wa_templates').push({ id: 'tpl-1', empresa_id: EMPRESA, name: 'boas_vindas', language: 'pt_PT', status: 'APPROVED',
        components: [{ type: 'BODY', text: 'Ola {{1}}, ja lhe respondemos.' }] });
    tabela('automations').push(fluxoCompleto());
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}

let n = 0;
const receber = (content: string) => Engine.processIncomingWhatsAppMessage({
    channel_id: CANAL, phone_number: TELEFONE, contact_name: 'Joana Miguel',
    content, direction: 'inbound', id: `m-${++n}-${Date.now()}`
});
const limpar = () => { enviadas.length = 0; };
const amanha = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

(async () => {
    console.log('\n=== Conversa 1: reservar do inicio ao fim ===\n');

    await test('a primeira mensagem sauda, manda a imagem e para no menu', async () => {
        await receber('Boa tarde');
        assert(enviadas.some(e => /Aqui e a Residencial/.test(e.content)), `devia saudar: ${dito()}`);
        assert(enviadas.some(e => /Joana Miguel/.test(e.content)), `devia usar o nome do WhatsApp: ${dito()}`);
        assert(midia.length === 1, `devia enviar 1 imagem, enviou ${midia.length}`);
        assert(enviadas.some(e => e.content.startsWith('MENU:')), `devia mostrar o menu: ${dito()}`);
        assert(!enviadas.some(e => /Para que dia/.test(e.content)), 'nao devia avancar sem a escolha do cliente');
    });

    await test('a saudacao nao se repete quando o cliente responde', async () => {
        await receber('Boa tarde'); limpar();
        await receber('1');
        assert(!enviadas.some(e => /Aqui e a Residencial/.test(e.content)), `repetiu a saudacao: ${dito()}`);
        assert(enviadas.filter(e => /Para que dia/.test(e.content)).length === 1, `devia perguntar o dia uma so vez: ${dito()}`);
    });

    await test('ve os horarios reais livres do dia que o cliente escreveu', async () => {
        await receber('Boa tarde'); await receber('1'); limpar();
        await receber('amanha');
        const m = enviadas.find(e => /Temos livre/.test(e.content));
        assert(!!m, `devia mostrar os horarios: ${dito()}`);
        assert(/\d{2}:\d{2}/.test(m!.content), `devia trazer horas reais: ${m!.content}`);
        assert(/08:00/.test(m!.content), `devia comecar as 08:00 (horario da casa): ${m!.content}`);
    });

    await test('grava a marcacao no Agendamento com os campos proprios da empresa', async () => {
        await receber('Boa tarde'); await receber('1'); await receber('amanha');
        await receber('2 da tarde'); await receber('Joana Miguel'); limpar();
        await receber('4');

        const marc = tabela('agendamentos');
        assert(marc.length === 1, `devia haver 1 marcacao, ha ${marc.length}`);
        const a = marc[0];
        assert(a.data === amanha(), `data errada: ${a.data} (esperava ${amanha()})`);
        assert(a.hora_inicio === '14:00', `"2 da tarde" devia dar 14:00, deu ${a.hora_inicio}`);
        assert(a.hora_fim === '15:00', `fim devia ser 15:00 (60 min), e ${a.hora_fim}`);
        assert(a.cliente_nome === 'Joana Miguel', `nome errado: ${a.cliente_nome}`);
        assert(a.cliente_telefone === TELEFONE, `telefone errado: ${a.cliente_telefone}`);
        assert(a.origem === 'fluxo', `origem devia ser "fluxo": ${a.origem}`);
        assert(Number(a.dados?.pessoas) === 4, `campo proprio "pessoas" nao ficou: ${JSON.stringify(a.dados)}`);
        assert(a.dados?.pagamento === 'TPA', `campo proprio "pagamento" nao ficou: ${JSON.stringify(a.dados)}`);
        assert(a.automation_id === 1, `devia registar o fluxo que criou: ${a.automation_id}`);
    });

    await test('confirma ao cliente com a data por extenso e avisa a equipa e o email', async () => {
        await receber('Boa tarde'); await receber('1'); await receber('amanha');
        await receber('2 da tarde'); await receber('Joana Miguel'); limpar();
        await receber('4');
        assert(enviadas.some(e => /Reservado, Joana Miguel/.test(e.content)), `devia confirmar com o nome: ${dito()}`);
        const conf = enviadas.find(e => /Reservado/.test(e.content))!;
        assert(/ de /.test(conf.content) && /14:00/.test(conf.content), `devia ter data por extenso e hora: ${conf.content}`);
        assert(emails.length >= 1, `devia enviar o email da reserva, enviou ${emails.length}`);
        assert(emails.some(e => JSON.stringify(e).includes('reservas@exemplo.ao')), `o email devia ir para reservas@exemplo.ao: ${JSON.stringify(emails).slice(0, 200)}`);
    });

    await test('a etiqueta e o campo personalizado ficam no contacto', async () => {
        await receber('Boa tarde');
        const c = tabela('clientes')[0] || tabela('crm_contactos')[0] || tabela('wa_contacts')[0];
        assert(!!c || tabela('automation_logs').length > 0, 'devia ter mexido no contacto ou registado o log');
    });

    console.log('\n=== Conversa 2: o que o sistema nao percebe ===\n');

    await test('data impossivel nao inventa nada: avisa e volta ao menu', async () => {
        await receber('Boa tarde'); await receber('1'); limpar();
        await receber('xpto bla bla');
        assert(enviadas.some(e => /Nao consigo/i.test(e.content)), `devia avisar: ${dito()}`);
        assert(enviadas.some(e => e.content.startsWith('MENU:')), `devia voltar ao menu: ${dito()}`);
        assert(tabela('agendamentos').length === 0, 'nao devia criar nenhuma marcacao');
    });

    await test('depois de falhar, o menu continua a funcionar', async () => {
        await receber('Boa tarde'); await receber('1'); await receber('xpto bla bla'); limpar();
        await receber('1');
        assert(enviadas.some(e => /Para que dia/.test(e.content)), `o menu devia voltar a funcionar: ${dito()}`);
    });

    await test('hora ja ocupada e recusada, sem duplicar a marcacao', async () => {
        // primeira reserva as 14:00
        await receber('Boa tarde'); await receber('1'); await receber('amanha');
        await receber('2 da tarde'); await receber('Joana Miguel'); await receber('4');
        assert(tabela('agendamentos').length === 1, 'a primeira devia ser criada');
        // segunda tentativa na mesma hora
        limpar();
        await receber('Boa tarde'); await receber('1'); await receber('amanha');
        await receber('14h'); await receber('Outro Cliente'); limpar();
        await receber('2');
        assert(tabela('agendamentos').length === 1, `nao devia duplicar: ha ${tabela('agendamentos').length}`);
        assert(enviadas.some(e => /Nao consegui marcar/.test(e.content)), `devia explicar porque nao deu: ${dito()}`);
        assert(enviadas.some(e => e.content.startsWith('MENU:')), `devia voltar ao menu: ${dito()}`);
    });

    await test('resposta fora das opcoes do menu repete o menu', async () => {
        await receber('Boa tarde'); limpar();
        await receber('banana');
        assert(enviadas.some(e => /nao percebi|não percebi/i.test(e.content)) || enviadas.some(e => e.content.startsWith('MENU:')),
            `devia re-perguntar: ${dito()}`);
        assert(!enviadas.some(e => /Aqui e a Residencial/.test(e.content)), `nao devia repetir a saudacao: ${dito()}`);
    });

    console.log('\n=== Conversa 3: as minhas reservas ===\n');

    await test('sem reservas, diz que nao tem e volta ao menu', async () => {
        await receber('Boa tarde'); limpar();
        await receber('2');
        assert(enviadas.some(e => /nao tem nenhuma reserva/i.test(e.content)), `devia dizer que nao tem: ${dito()}`);
        assert(enviadas.some(e => e.content.startsWith('MENU:')), `devia voltar ao menu: ${dito()}`);
    });

    await test('com reserva, lista-a em texto pronto a enviar', async () => {
        await receber('Boa tarde'); await receber('1'); await receber('amanha');
        await receber('2 da tarde'); await receber('Joana Miguel'); await receber('4');
        await receber('Boa tarde'); limpar();
        await receber('2');
        const m = enviadas.find(e => /As suas reservas/.test(e.content));
        assert(!!m, `devia listar: ${dito()}`);
        assert(/14:00/.test(m!.content) && new RegExp(SERVICO, 'i').test(m!.content), `a lista devia ter hora e quarto: ${m!.content}`);
    });

    console.log('\n=== Conversa 4: template e passagem a humano ===\n');

    await test('a opcao 3 envia o template e passa a conversa a um humano', async () => {
        await receber('Boa tarde'); limpar();
        await receber('3');
        assert(templates.length === 1, `devia enviar 1 template, enviou ${templates.length}`);
        assert(enviadas.some(e => /colega ja continua/i.test(e.content)), `devia avisar que passa a humano: ${dito()}`);
        const conv = tabela('wa_conversations')[0];
        assert(!conv || conv.fluxo_node_id == null, 'depois do handoff nao devia ficar nenhum passo pendente');
    });

    await test('depois do handoff o fluxo nao volta a responder sozinho', async () => {
        await receber('Boa tarde'); await receber('3'); limpar();
        await receber('obrigada');
        assert(!enviadas.some(e => e.content.startsWith('MENU:')), `nao devia voltar ao menu depois do handoff: ${dito()}`);
    });

    console.log('\n=== Robustez ===\n');

    await test('o mesmo evento entregue duas vezes so responde uma vez', async () => {
        const msg = { channel_id: CANAL, phone_number: TELEFONE, contact_name: 'Joana', content: 'Boa tarde', direction: 'inbound', id: 'ID-REPETIDO' };
        await Engine.processIncomingWhatsAppMessage(msg);
        const antes = enviadas.length;
        await Engine.processIncomingWhatsAppMessage(msg);
        assert(enviadas.length === antes, `duplicou: ${antes} -> ${enviadas.length} (${dito()})`);
    });

    await test('a simulacao percorre a conversa toda sem gravar nada', async () => {
        const fluxo = fluxoCompleto();
        const s1 = await Engine.simular(fluxo, 'Boa tarde', null);
        assert(s1.pendente?.nodeId === 'menu', `devia parar no menu: ${JSON.stringify(s1.pendente)}`);
        const s2 = await Engine.simular(fluxo, '1', s1.pendente);
        const s3 = await Engine.simular(fluxo, 'amanha', s2.pendente);
        assert(s3.passos.some((p: any) => p.titulo === 'CHECK_SLOTS'), 'devia mostrar o passo CHECK_SLOTS');
        assert(s3.mensagens.some((m: any) => /Temos livre/.test(m.texto)), `devia mostrar horarios reais: ${JSON.stringify(s3.mensagens)}`);
        const s4 = await Engine.simular(fluxo, '2 da tarde', s3.pendente);
        const s5 = await Engine.simular(fluxo, 'Joana', s4.pendente);
        const s6 = await Engine.simular(fluxo, '4', s5.pendente);
        assert(s6.passos.some((p: any) => p.titulo === 'CREATE_BOOKING'), 'devia mostrar o passo CREATE_BOOKING');
        assert(s6.terminou, 'a simulacao devia chegar ao fim');
        assert(tabela('agendamentos').length === 0, 'a simulacao NAO devia gravar marcacoes');
    });

    await test('todos os tipos de no do fluxo foram executados', async () => {
        const fluxo = fluxoCompleto();
        const vistos = new Set<string>();
        const correr = async (msgs: string[]) => {
            let est: any = null;
            for (const m of msgs) { const r = await Engine.simular(fluxo, m, est); r.passos.forEach((p: any) => vistos.add(p.titulo)); est = r.pendente; }
        };
        await correr(['Boa tarde', '1', 'amanha', '2 da tarde', 'Joana', '4']);
        await correr(['Boa tarde', '2']);
        await correr(['Boa tarde', '3']);
        await correr(['Boa tarde', '1', 'xpto']);
        const esperados = ['LOG_MESSAGE', 'ADD_TAG', 'SET_CUSTOM_FIELD', 'REPLY_MESSAGE', 'SEND_IMAGE', 'DELAY',
            'CHECK_SLOTS', 'CREATE_BOOKING', 'LIST_BOOKINGS', 'SEND_TEMPLATE', 'NOTIFY_TEAM', 'SEND_EMAIL', 'HANDOFF_HUMAN'];
        const faltam = esperados.filter(e => !vistos.has(e));
        assert(faltam.length === 0, `nos nunca executados: ${faltam.join(', ')}`);
        assert([...vistos].some(v => /Condicao|Condição/.test(v)), 'a condicao devia aparecer nos passos');
        assert([...vistos].some(v => /Voltar ao menu/i.test(v)), 'o GOTO_MENU devia aparecer nos passos');
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (falhas.length) console.log('Falhou:\n  - ' + falhas.join('\n  - '));
    process.exit(failed === 0 ? 0 : 1);
})();
