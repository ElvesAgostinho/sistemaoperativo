/**
 * Testes da ponte Autopilot → Agendamento (sem base de dados real).
 *
 * Verifica o que o gestor vai depender: o fluxo perceber o que o cliente
 * escreveu, não deixar marcar em horário ocupado, e guardar os campos próprios
 * da empresa (nº de pessoas, matrícula...).
 *
 * Uso: npx ts-node scripts/testAgendamentoFluxo.ts   (a partir de backend/)
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
    if (x.op === 'gte') return String(v) >= String(x.val);
    return true;
});

function mockFrom(t: string) {
    const filtros: any[] = []; let op = 'select'; let payload: any = null;
    const self: any = {}; const ret = () => self;
    self.select = ret; self.order = ret; self.limit = ret; self.not = ret; self.or = ret; self.in = ret; self.is = ret; self.ilike = ret; self.filter = ret; self.lt = ret; self.lte = ret; self.gt = ret;
    self.insert = (p: any) => { op = 'insert'; payload = p; return self; };
    self.update = (p: any) => { op = 'update'; payload = p; return self; };
    self.delete = () => { op = 'delete'; return self; };
    self.eq = (col: string, val: any) => { filtros.push({ col, val, op: 'eq' }); return self; };
    self.neq = (col: string, val: any) => { filtros.push({ col, val, op: 'neq' }); return self; };
    self.gte = (col: string, val: any) => { filtros.push({ col, val, op: 'gte' }); return self; };
    const correr = () => {
        const linhas = tabela(t);
        if (op === 'insert') { const n = { id: payload.id ?? seq++, ...payload }; linhas.push(n); return { data: n, error: null }; }
        if (op === 'update') { const alvo = linhas.filter(l => bate(l, filtros)); alvo.forEach(l => Object.assign(l, payload)); return { data: alvo, error: null }; }
        if (op === 'delete') { db[t] = linhas.filter(l => !bate(l, filtros)); return { data: [], error: null }; }
        return { data: linhas.filter(l => bate(l, filtros)).map(l => JSON.parse(JSON.stringify(l))), error: null };
    };
    const um = () => { const r = correr(); const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data; return { data: d, error: r.error || (d ? null : { code: 'PGRST116' }) }; };
    self.single = () => Promise.resolve(um());
    self.maybeSingle = () => Promise.resolve({ ...um(), error: null });
    self.then = (res: any, rej: any) => Promise.resolve(correr()).then(res, rej);
    return self;
}
const mockSupabase: any = { from: mockFrom, rpc: () => Promise.resolve({ data: [], error: null }) };
const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });
const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);
const waPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'WhatsAppChannelManager'));
const enviadas: any[] = [];
// Usa a classe REAL do WhatsApp (para a escolha do canal ser mesmo testada) e
// troca só o transporte, que é o que não pode sair para a Internet num teste.
const { WhatsAppChannelManager: WaReal } = require(waPath);
WaReal.sendMessage = async (_s: any, _c: string, _p: string, m: string) => { enviadas.push(m); return 'mid'; };

const { AgendamentoFluxoService } = require(path.join(__dirname, '..', 'src', 'services', 'AgendamentoFluxoService'));

const EMPRESA = 'empresa-1';
let passed = 0, failed = 0; const falhas: string[] = [];
async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    enviadas.length = 0; seq = 1;
    tabela('agendamento_servicos').push(
        { id: 1, empresa_id: EMPRESA, nome: 'Quarto simples', duracao_minutos: 60, ativo: true },
        { id: 2, empresa_id: EMPRESA, nome: 'Quarto duplo', duracao_minutos: 60, ativo: true }
    );
    tabela('wa_channels').push({ id: 'chan-1', empresa_id: EMPRESA, provider: 'evolution', status: 'connected' });
    // aberto todos os dias das 08:00 às 18:00
    for (let d = 0; d < 7; d++) tabela('agendamento_horarios').push({ id: d + 1, empresa_id: EMPRESA, dia_semana: d, hora_inicio: '08:00', hora_fim: '18:00', ativo: true });
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
// A data local, como o TextoDataHoraService a calcula. O toISOString devolve UTC
// e, com Angola uma hora a frente, entre a meia-noite e a uma da manha dava o dia
// anterior — a suite falhava todas as noites nessa janela por causa do teste, nao
// do codigo.
const amanha = () => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

(async () => {
    console.log('\n=== Encontrar o serviço pelo que o cliente escreveu ===\n');

    await test('aceita o nome, parte do nome, o id e o número da opção', async () => {
        assert((await AgendamentoFluxoService.encontrarServico(EMPRESA, 'Quarto simples'))?.id === 1, 'nome exato');
        assert((await AgendamentoFluxoService.encontrarServico(EMPRESA, 'quarto DUPLO'))?.id === 2, 'maiúsculas/minúsculas');
        assert((await AgendamentoFluxoService.encontrarServico(EMPRESA, 'duplo'))?.id === 2, 'parte do nome');
        assert((await AgendamentoFluxoService.encontrarServico(EMPRESA, '1'))?.id === 1, 'número da opção');
        assert((await AgendamentoFluxoService.encontrarServico(EMPRESA, 'quarto')) === null, 'ambíguo (bate nos dois) devia dar null');
        assert((await AgendamentoFluxoService.encontrarServico(EMPRESA, 'piscina')) === null, 'não existe');
    });

    console.log('\n=== Ver horários livres ===\n');

    await test('devolve horários e a data por extenso', async () => {
        const r = await AgendamentoFluxoService.horariosLivres(EMPRESA, 'Quarto simples', amanha());
        assert(r.ok && r.horarios.length > 0, `devia haver horários: ${JSON.stringify(r)}`);
        assert(r.texto.includes(','), 'o texto devia listar vários horários');
        assert(/de/.test(r.dataPorExtenso || ''), `data por extenso: ${r.dataPorExtenso}`);
    });

    await test('explica quando não percebe o serviço ou a data', async () => {
        const a = await AgendamentoFluxoService.horariosLivres(EMPRESA, 'piscina', 'amanhã');
        assert(!a.ok && /servico|serviço/i.test(a.erro || ''), `erro do serviço: ${a.erro}`);
        const b = await AgendamentoFluxoService.horariosLivres(EMPRESA, 'Quarto simples', 'quando puder');
        assert(!b.ok && /data/i.test(b.erro || ''), `erro da data: ${b.erro}`);
        const c = await AgendamentoFluxoService.horariosLivres(EMPRESA, 'Quarto simples', '01/01/2020');
        assert(!c.ok && /passou/i.test(c.erro || ''), `data no passado: ${c.erro}`);
    });

    console.log('\n=== Criar marcação pelo fluxo ===\n');

    await test('cria com texto como o cliente escreve e guarda no Agendamento', async () => {
        const r = await AgendamentoFluxoService.criarPeloFluxo(EMPRESA, {
            servico: 'quarto simples', data: 'amanhã', hora: '2 da tarde',
            nome: 'Ana Paula', telefone: '244923000111', notas: 'pelo WhatsApp'
        });
        assert(r.ok, `devia criar: ${r.erro}`);
        const linha = tabela('agendamentos')[0];
        assert(linha.data === amanha() && linha.hora_inicio === '14:00', `data/hora erradas: ${linha.data} ${linha.hora_inicio}`);
        assert(linha.hora_fim === '15:00', `fim devia ser 15:00 (60 min): ${linha.hora_fim}`);
        assert(linha.cliente_nome === 'Ana Paula' && linha.cliente_telefone === '244923000111', 'cliente mal gravado');
        assert(linha.origem === 'fluxo', `origem devia ser "fluxo": ${linha.origem}`);
        assert(enviadas.some(m => /confirmada/i.test(m)), 'o cliente devia receber a confirmação');
    });

    await test('não deixa marcar em cima de outra marcação', async () => {
        const dados = { servico: 'Quarto simples', data: 'amanhã', hora: '10:00', nome: 'A', telefone: '244900000001' };
        const primeira = await AgendamentoFluxoService.criarPeloFluxo(EMPRESA, dados);
        assert(primeira.ok, 'a primeira devia passar');
        const segunda = await AgendamentoFluxoService.criarPeloFluxo(EMPRESA, { ...dados, nome: 'B', telefone: '244900000002' });
        assert(!segunda.ok && /disponível|disponivel/i.test(segunda.erro || ''), `devia recusar: ${segunda.erro}`);
        assert(tabela('agendamentos').length === 1, 'só devia existir uma marcação');
    });

    await test('recusa com motivo legível o que não percebe', async () => {
        const base = { servico: 'Quarto simples', data: 'amanhã', hora: '10:00', nome: 'A', telefone: '244900000001' };
        assert(/serviço/i.test((await AgendamentoFluxoService.criarPeloFluxo(EMPRESA, { ...base, servico: 'xpto' })).erro || ''), 'serviço');
        assert(/data/i.test((await AgendamentoFluxoService.criarPeloFluxo(EMPRESA, { ...base, data: 'logo' })).erro || ''), 'data');
        assert(/hora/i.test((await AgendamentoFluxoService.criarPeloFluxo(EMPRESA, { ...base, hora: 'depois' })).erro || ''), 'hora');
        assert(/nome/i.test((await AgendamentoFluxoService.criarPeloFluxo(EMPRESA, { ...base, nome: '  ' })).erro || ''), 'nome');
        assert(tabela('agendamentos').length === 0, 'nada devia ter sido criado');
    });

    await test('guarda os campos próprios da empresa e exige os obrigatórios', async () => {
        tabela('agendamento_config').push({
            empresa_id: EMPRESA, modelo: 'hotel', rotulo_item: 'Tipo de quarto', rotulo_agendamento: 'Reserva',
            campos: [
                { chave: 'pessoas', rotulo: 'Nº de pessoas', tipo: 'numero', obrigatorio: true },
                { chave: 'documento', rotulo: 'BI', tipo: 'texto' }
            ]
        });
        const base = { servico: 'Quarto simples', data: 'amanhã', hora: '11:00', nome: 'Ana', telefone: '244900000001' };

        const semObrigatorio = await AgendamentoFluxoService.criarPeloFluxo(EMPRESA, base);
        assert(!semObrigatorio.ok && /pessoas/i.test(semObrigatorio.erro || ''), `devia exigir o nº de pessoas: ${semObrigatorio.erro}`);

        const naoNumero = await AgendamentoFluxoService.criarPeloFluxo(EMPRESA, { ...base, dados: { pessoas: 'muitas' } });
        assert(!naoNumero.ok && /número/i.test(naoNumero.erro || ''), `devia exigir número: ${naoNumero.erro}`);

        const ok = await AgendamentoFluxoService.criarPeloFluxo(EMPRESA, { ...base, dados: { pessoas: '2', documento: '00123BA' } });
        assert(ok.ok, `devia criar: ${ok.erro}`);
        const linha = tabela('agendamentos')[0];
        assert(linha.dados?.pessoas === 2 && linha.dados?.documento === '00123BA', `dados extra mal guardados: ${JSON.stringify(linha.dados)}`);
    });

    await test('lista as marcações futuras do cliente em texto', async () => {
        await AgendamentoFluxoService.criarPeloFluxo(EMPRESA, { servico: 'Quarto simples', data: 'amanhã', hora: '09:00', nome: 'Ana', telefone: '244923000111' });
        const r = await AgendamentoFluxoService.minhasMarcacoes(EMPRESA, '244923000111');
        assert(r.lista.length === 1, `devia haver 1 marcação: ${r.lista.length}`);
        assert(/1 - .*09:00/.test(r.texto), `texto inesperado: ${r.texto}`);
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (failed) { falhas.forEach(f => console.log('  - ' + f)); process.exit(1); }
    process.exit(0);
})();
