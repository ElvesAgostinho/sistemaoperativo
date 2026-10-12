/**
 * Testes das escolhas clicáveis: botões, menus e sondagens.
 *
 * Até aqui um menu era texto — "1 - Preços | 2 - Reservar" — e o cliente tinha
 * de ESCREVER o número. Quem escrevia "preços" levava com "Não percebi essa
 * resposta". Era atrito a cada passo de cada fluxo.
 *
 * E havia uma metade que não existia de todo: ler o toque. Procurei por
 * `buttonsResponseMessage`, `listResponseMessage` e `interactiveResponseMessage`
 * em todo o backend e não havia uma única ocorrência. Provei-o na produção:
 * enviei uma sondagem ao cliente, ele votou em "Reservar", e na conversa não
 * entrou nada — o voto chegou ao webhook e foi deitado fora.
 *
 * Uso: npx ts-node scripts/testEscolhaClicavel.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import path from 'path';

// ---------- base de dados em memória ----------
const db: Record<string, any[]> = {};
const tabela = (t: string) => (db[t] = db[t] || []);

const bate = (row: any, f: any[]) => f.every(x => String(row[x.col]) === String(x.val));

function mockFrom(t: string) {
    const filtros: any[] = [];
    const self: any = {}; const ret = () => self;
    self.select = ret; self.order = ret; self.limit = ret; self.filter = ret; self.neq = ret;
    self.insert = (p: any) => { tabela(t).push(...(Array.isArray(p) ? p : [p])); return self; };
    self.update = () => self;
    self.eq = (col: string, val: any) => { filtros.push({ col, val }); return self; };
    const correr = () => ({ data: tabela(t).filter(l => bate(l, filtros)), error: null });
    const um = () => { const d = correr().data[0] ?? null; return { data: d, error: null }; };
    self.single = () => Promise.resolve(um());
    self.maybeSingle = () => Promise.resolve(um());
    self.then = (res: any, rej: any) => Promise.resolve(correr()).then(res, rej);
    return self;
}

const mockSupabase: any = { from: mockFrom };
const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });
const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);

// As chamadas à Evolution e à Meta não saem daqui.
const enviados: { url: string; corpo: any }[] = [];
let recusar: string[] = [];
const fetchReal = global.fetch;
(global as any).fetch = async (url: string, opts: any) => {
    const corpo = opts?.body ? JSON.parse(opts.body) : {};
    enviados.push({ url: String(url), corpo });
    const caminho = String(url).split('/message/')[1]?.split('/')[0] || String(url);
    if (recusar.some(r => String(url).includes(r))) {
        return { status: 400, json: async () => ({ response: { message: ['TypeError: this.isZero is not a function'] } }) } as any;
    }
    return { status: 201, json: async () => ({ key: { id: 'msg-' + caminho } }) } as any;
};

process.env.EVOLUTION_API_URL = 'https://evolution.exemplo.pt';
process.env.AUTHENTICATION_API_KEY = 'chave';

const { WhatsAppInterativoService: Interativo } = require(path.join(__dirname, '..', 'src', 'services', 'WhatsAppInterativoService'));
const { WhatsAppEscolhaRecebida: Escolha } = require(path.join(__dirname, '..', 'src', 'services', 'WhatsAppEscolhaRecebida'));

const EMPRESA = 'empresa-1';
const CANAL = 'chan-1';
let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const opcoes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 'op' + (i + 1), rotulo: 'Opção ' + (i + 1) }));

const pedido = (n: number) => ({
    empresaId: EMPRESA, channelId: CANAL, telefone: '244928053925',
    texto: 'Como posso ajudar?', opcoes: opcoes(n),
});

async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    enviados.length = 0; recusar = [];
    tabela('wa_channels').push({
        id: CANAL, empresa_id: EMPRESA, provider: 'evolution', status: 'connected',
        credentials: { instanceName: 'INST_1' },
    });
    const antes = console.log; const antesErr = console.error;
    console.log = () => { }; console.error = () => { };
    try { await fn(); console.log = antes; antes(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log = antes; antes(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
    finally { console.log = antes; console.error = antesErr; }
}

(async () => {
    console.log('\n=== Que formato para quantas opções ===\n');

    await test('até três opções são botões', async () => {
        // Botões ficam à vista: o cliente escolhe sem mais um toque para abrir.
        for (const n of [1, 2, 3]) {
            assert(Interativo.formatoIdeal(n)[0] === 'botoes', `${n} opções devia dar botões`);
        }
    });

    await test('acima de três, sondagem — porque a lista está avariada', async () => {
        // A lista era o ideal, mas o sendList desta Evolution rebenta com
        // "this.isZero is not a function". A sondagem faz o mesmo trabalho: o
        // cliente escolhe sem escrever, que é o que conta.
        for (const n of [4, 6, 10, 12]) {
            assert(Interativo.formatoIdeal(n, false)[0] === 'sondagem', `${n} opções devia dar sondagem`);
        }
    });

    await test('com a lista disponível, de quatro a dez é lista', async () => {
        for (const n of [4, 7, 10]) {
            assert(Interativo.formatoIdeal(n, true)[0] === 'lista', `${n} opções devia dar lista`);
        }
    });

    await test('acima de doze é texto — nenhum formato aguenta', async () => {
        assert(Interativo.formatoIdeal(13)[0] === 'texto', 'treze opções não cabem em lado nenhum');
    });

    await test('o texto numerado é sempre a última rede', async () => {
        for (const n of [1, 5, 11]) {
            const ordem = Interativo.formatoIdeal(n);
            assert(ordem[ordem.length - 1] === 'texto', `${n}: o texto tem de ficar no fim — ${ordem.join(',')}`);
        }
    });

    console.log('\n=== Enviar ===\n');

    await test('três opções saem como botões de verdade', async () => {
        const r = await Interativo.perguntar(pedido(3));
        assert(r.ok && r.formato === 'botoes', `devia enviar botões: ${JSON.stringify(r)}`);
        const env = enviados[0];
        assert(/sendButtons/.test(env.url), `endpoint errado: ${env.url}`);
        assert(env.corpo.buttons.length === 3, `deviam ir 3 botões, foram ${env.corpo.buttons.length}`);
        assert(env.corpo.buttons[0].type === 'reply', 'tipo errado');
        assert(env.corpo.buttons[0].id === 'op1', `o id tem de ir no botão: ${env.corpo.buttons[0].id}`);
    });

    await test('cinco opções saem como sondagem', async () => {
        const r = await Interativo.perguntar(pedido(5));
        assert(r.ok && r.formato === 'sondagem', `devia enviar sondagem: ${JSON.stringify(r)}`);
        const env = enviados[0];
        assert(/sendPoll/.test(env.url), `endpoint errado: ${env.url}`);
        assert(env.corpo.values.length === 5, `deviam ir 5 opções, foram ${env.corpo.values.length}`);
        assert(env.corpo.selectableCount === 1, 'só se escolhe uma');
    });

    await test('se os botões falharem, cai na sondagem sozinho', async () => {
        recusar = ['sendButtons'];
        const r = await Interativo.perguntar(pedido(3));
        assert(r.ok && r.formato === 'sondagem', `devia cair na sondagem: ${JSON.stringify(r)}`);
        assert(r.tentativas.length === 1 && r.tentativas[0].formato === 'botoes', 'devia dizer o que falhou');
    });

    await test('se tudo falhar, sai o texto numerado de sempre', async () => {
        recusar = ['sendButtons', 'sendPoll'];
        const r = await Interativo.perguntar(pedido(3));
        assert(r.ok && r.formato === 'texto', `devia cair no texto: ${JSON.stringify(r)}`);
        const ultimo = enviados[enviados.length - 1];
        assert(/1 - Opção 1/.test(ultimo.corpo.text || ''), `devia ir numerado: ${ultimo.corpo.text}`);
    });

    await test('a lista nem se tenta numa Evolution — poupa-se a chamada', async () => {
        // Tentá-la a cada menu era uma chamada perdida e um erro no log a cada
        // pergunta, numa instalação onde se sabe que não funciona.
        const r = await Interativo.perguntar(pedido(6));
        assert(!enviados.some(e => /sendList/.test(e.url)), 'não devia ter tentado a lista');
        assert(r.formato === 'sondagem', r.formato);
    });

    await test('num canal Meta a lista é o primeiro a ser tentado', async () => {
        db['wa_channels'] = [{
            id: CANAL, empresa_id: EMPRESA, provider: 'meta', status: 'connected',
            credentials: { phoneNumberId: '123', accessToken: 'tok' },
        }];
        const r = await Interativo.perguntar(pedido(6));
        assert(r.ok && r.formato === 'lista', `devia usar a lista: ${JSON.stringify(r)}`);
        const env = enviados[0];
        assert(env.corpo.interactive?.type === 'list', `tipo errado: ${JSON.stringify(env.corpo).slice(0, 150)}`);
        assert(env.corpo.interactive.action.sections[0].rows.length === 6, 'deviam ir 6 linhas');
    });

    await test('rótulos compridos são encurtados, não recusados', async () => {
        // O WhatsApp recusa a mensagem inteira se um rótulo passar do limite —
        // e aí o cliente não recebia nada.
        const r = await Interativo.perguntar({
            ...pedido(1),
            opcoes: [{ id: 'a', rotulo: 'Quero saber os preços dos quartos para o próximo mês inteiro' }],
        });
        assert(r.ok, 'devia enviar na mesma');
        const rotulo = enviados[0].corpo.buttons[0].displayText;
        assert(rotulo.length <= 20, `${rotulo.length} caracteres é demais: "${rotulo}"`);
        assert(rotulo.endsWith('…'), `devia mostrar que foi cortado: "${rotulo}"`);
    });

    console.log('\n=== Ler o toque ===\n');

    await test('botão tocado no formato moderno (o que esta Evolution produz)', async () => {
        const e = Escolha.ler({
            message: { viewOnceMessage: { message: { interactiveResponseMessage: {
                nativeFlowResponseMessage: { paramsJson: JSON.stringify({ id: 'op2', display_text: 'Reservar' }) },
            } } } },
        });
        assert(!!e, 'devia reconhecer o toque');
        assert(e.id === 'op2' && e.texto === 'Reservar', JSON.stringify(e));
        assert(e.origem === 'botao', e.origem);
    });

    await test('botão tocado no formato antigo', async () => {
        const e = Escolha.ler({
            message: { buttonsResponseMessage: { selectedButtonId: 'op1', selectedDisplayText: 'Preços' } },
        });
        assert(e?.id === 'op1' && e?.texto === 'Preços', JSON.stringify(e));
    });

    await test('linha do menu escolhida', async () => {
        const e = Escolha.ler({
            message: { listResponseMessage: { title: 'Quarto duplo', singleSelectReply: { selectedRowId: 'q_duplo' } } },
        });
        assert(e?.id === 'q_duplo' && e?.origem === 'lista', JSON.stringify(e));
    });

    await test('botão tocado pela Meta', async () => {
        const e = Escolha.ler({ interactive: { type: 'button_reply', button_reply: { id: 'op3', title: 'Falar' } } });
        assert(e?.id === 'op3' && e?.texto === 'Falar', JSON.stringify(e));
    });

    await test('linha escolhida pela Meta', async () => {
        const e = Escolha.ler({ interactive: { type: 'list_reply', list_reply: { id: 'q1', title: 'Simples' } } });
        assert(e?.id === 'q1' && e?.origem === 'lista', JSON.stringify(e));
    });

    await test('uma mensagem escrita não é uma escolha', async () => {
        // Senão o texto normal do cliente passava a ser tratado como um toque.
        assert(Escolha.ler({ message: { conversation: 'bom dia' } }) === null, 'texto não é escolha');
        assert(Escolha.ler({ message: { imageMessage: {} } }) === null, 'uma foto não é escolha');
        assert(Escolha.ler({}) === null, 'nada não é escolha');
    });

    await test('o voto numa sondagem é reconhecido', async () => {
        const e = Escolha.lerVoto({ pollUpdates: [{ vote: { selectedOptions: ['Reservar'] } }] }, []);
        assert(e?.texto === 'Reservar' && e?.origem === 'sondagem', JSON.stringify(e));
    });

    await test('um voto que não se consegue ler NÃO se adivinha', async () => {
        // Devolver a primeira opção da sondagem punha o cliente num caminho que
        // ele não escolheu — pior do que não perceber e voltar a perguntar.
        const e = Escolha.lerVoto({ pollUpdates: [{}] }, ['Preços', 'Reservar']);
        assert(e === null, `não se adivinha: ${JSON.stringify(e)}`);
    });

    await test('o fluxo recebe o id, não o rótulo', async () => {
        // O id acerta sem depender de maiúsculas, acentos ou de dois rótulos
        // parecidos ("Reservar" e "Reservar já").
        const e = Escolha.ler({ message: { buttonsResponseMessage: { selectedButtonId: 'op1', selectedDisplayText: 'Preços' } } });
        assert(Escolha.comoTexto(e) === 'op1', Escolha.comoTexto(e));
    });

    await test('sem id, vale o texto', async () => {
        // As sondagens não levam id: o voto volta com o texto escolhido.
        assert(Escolha.comoTexto({ id: '', texto: 'Reservar', origem: 'sondagem' }) === 'Reservar', 'devia valer o texto');
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (falhas.length) console.log('Falhou:\n  - ' + falhas.join('\n  - '));
    (global as any).fetch = fetchReal;
    process.exit(failed === 0 ? 0 : 1);
})();
