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
    // O `ok` faz parte da resposta real e havia codigo nosso a testa-lo. Sem
    // ele aqui, um caminho inteiro dava-se por falhado em silencio e o teste
    // nao dizia porque — perdi tempo a procurar um bug que era do mock.
    if (recusar.some(r => String(url).includes(r))) {
        return { ok: false, status: 400, headers: { get: () => null }, json: async () => ({ response: { message: ['TypeError: this.isZero is not a function'] } }) } as any;
    }
    return {
        ok: true, status: 201,
        headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'image/jpeg' : null) },
        arrayBuffer: async () => new ArrayBuffer(8),
        json: async () => ({ key: { id: 'msg-' + caminho } }),
    } as any;
};

process.env.EVOLUTION_API_URL = 'https://evolution.exemplo.pt';
process.env.AUTHENTICATION_API_KEY = 'chave';

const { WhatsAppInterativoService: Interativo, LIMITES: LIMITES_SERVIDOR } = require(path.join(__dirname, '..', 'src', 'services', 'WhatsAppInterativoService'));
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

    await test('com botoes fiaveis, ate tres opcoes sao botoes', async () => {
        // Botões ficam à vista: o cliente escolhe sem mais um toque para abrir.
        for (const n of [1, 2, 3]) {
            assert(Interativo.formatoIdeal(n, false, true)[0] === 'botoes', `${n} opções devia dar botões`);
        }
    });

    await test('sem botoes fiaveis, nunca se tentam botoes', async () => {
        // Tenta-los era mandar uma mensagem que o cliente nunca recebe, e ficar
        // a pensar que correu bem.
        for (const n of [1, 2, 3, 5, 10]) {
            const ordem = Interativo.formatoIdeal(n, false, false);
            assert(!ordem.includes('botoes'), `${n} opcoes nao devia tentar botoes: ${ordem.join(',')}`);
        }
    });

    await test('sem botoes fiaveis, qualquer numero de opcoes da lista numerada', async () => {
        // Num numero ligado por QR code o WhatsApp nao entrega botoes. A
        // sondagem chegava, mas uma sondagem com contagem de votos nao e um menu
        // de atendimento — e um inquerito. Volta-se a lista numerada, que
        // funciona e nao finge ser outra coisa.
        for (const n of [1, 3, 5, 10, 12]) {
            assert(Interativo.formatoIdeal(n, false, false)[0] === 'texto', `${n} opcoes devia dar texto`);
        }
    });

    await test('a sondagem so sai se o canal a pedir de proposito', async () => {
        assert(Interativo.formatoIdeal(5, false, false, true)[0] === 'sondagem', 'com sondagens ligadas, sai sondagem');
        assert(Interativo.formatoIdeal(5, false, false, false)[0] === 'texto', 'por omissao, nao');
    });

    await test('com a lista disponível, de quatro a dez é lista', async () => {
        for (const n of [4, 7, 10]) {
            assert(Interativo.formatoIdeal(n, true, true)[0] === 'lista', `${n} opções devia dar lista`);
        }
    });

    await test('acima de doze é texto — nenhum formato aguenta', async () => {
        assert(Interativo.formatoIdeal(13)[0] === 'texto', 'treze opções não cabem em lado nenhum');
    });

    await test('o texto numerado é sempre a última rede', async () => {
        for (const fiaveis of [true, false]) {
            for (const n of [1, 5, 11]) {
                const ordem = Interativo.formatoIdeal(n, false, fiaveis);
                assert(ordem[ordem.length - 1] === 'texto', `${n}: o texto tem de ficar no fim — ${ordem.join(',')}`);
            }
        }
    });

    console.log('\n=== Enviar ===\n');

    await test('numa Evolution comum, tres opcoes saem como LISTA NUMERADA', async () => {
        // Provado no numero do cliente: os botoes saem com 201 e nao chegam. A
        // lista numerada chega, e o motor continua a aceitar "1" ou "precos".
        const r = await Interativo.perguntar(pedido(3));
        assert(r.ok && r.formato === 'texto', `devia enviar texto: ${JSON.stringify(r)}`);
        const env = enviados[enviados.length - 1];
        assert(/1 - Op/.test(env.corpo.text || ''), `devia ir numerado: ${env.corpo.text}`);
    });

    await test('num canal onde os botoes ESTAO confirmados, saem botoes', async () => {
        // Quem tenha uma Evolution onde eles funcionem (a 2.3.6, por exemplo)
        // liga-os na configuracao do canal.
        db['wa_channels'] = [{
            id: CANAL, empresa_id: EMPRESA, provider: 'evolution', status: 'connected',
            credentials: { instanceName: 'INST_1', botoesFiaveis: true },
        }];
        const r = await Interativo.perguntar(pedido(3));
        assert(r.ok && r.formato === 'botoes', `devia enviar botões: ${JSON.stringify(r)}`);
        const env = enviados[0];
        assert(/sendButtons/.test(env.url), `endpoint errado: ${env.url}`);
        assert(env.corpo.buttons.length === 3, `deviam ir 3 botões, foram ${env.corpo.buttons.length}`);
        assert(env.corpo.buttons[0].id === 'op1', `o id tem de ir no botão: ${env.corpo.buttons[0].id}`);
    });

    await test('com as sondagens ligadas, cinco opcoes saem como sondagem', async () => {
        db['wa_channels'] = [{
            id: CANAL, empresa_id: EMPRESA, provider: 'evolution', status: 'connected',
            credentials: { instanceName: 'INST_1', sondagens: true },
        }];
        const r = await Interativo.perguntar(pedido(5));
        assert(r.ok && r.formato === 'sondagem', `devia enviar sondagem: ${JSON.stringify(r)}`);
        const env = enviados[0];
        assert(env.corpo.values.length === 5, `deviam ir 5 opções, foram ${env.corpo.values.length}`);
        assert(env.corpo.selectableCount === 1, 'só se escolhe uma');
    });

    await test('se os botões falharem, cai no texto sozinho', async () => {
        db['wa_channels'] = [{
            id: CANAL, empresa_id: EMPRESA, provider: 'evolution', status: 'connected',
            credentials: { instanceName: 'INST_1', botoesFiaveis: true },
        }];
        recusar = ['sendButtons'];
        const r = await Interativo.perguntar(pedido(3));
        assert(r.ok && r.formato === 'texto', `devia cair no texto: ${JSON.stringify(r)}`);
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
        assert(r.formato === 'texto', r.formato);
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
        // Com botoes fiaveis, o limite e 20 e o corte tem de existir: o WhatsApp
        // recusa a mensagem inteira se passar, e ai o cliente nao recebia nada.
        db['wa_channels'] = [{
            id: CANAL, empresa_id: EMPRESA, provider: 'evolution', status: 'connected',
            credentials: { instanceName: 'INST_1', botoesFiaveis: true },
        }];
        enviados.length = 0;
        await Interativo.perguntar({
            ...pedido(1),
            opcoes: [{ id: 'a', rotulo: 'Quero saber os preços dos quartos para o próximo mês inteiro' }],
        });
        const rotulo = enviados[0].corpo.buttons[0].displayText;
        assert(rotulo.length <= 20, `${rotulo.length} caracteres é demais: "${rotulo}"`);
        assert(rotulo.endsWith('…'), `devia mostrar que foi cortado: "${rotulo}"`);
    });

    console.log('\n=== Cabeçalho e secções (como no ManyChat) ===\n');

    const canalMeta = () => {
        db['wa_channels'] = [{
            id: CANAL, empresa_id: EMPRESA, provider: 'meta', status: 'connected',
            credentials: { phoneNumberId: '111', accessToken: 'tok' },
        }];
    };

    await test('uma imagem vai DENTRO da mensagem de botões', async () => {
        // É o que faz o menu parecer de uma marca em vez de uma linha de texto
        // com botões por baixo. Só a mensagem de botões da Meta a leva por dentro.
        canalMeta();
        await Interativo.perguntar({
            ...pedido(3),
            cabecalho: { tipo: 'imagem', url: 'https://x/capa.jpg' },
        });
        const env = enviados[enviados.length - 1];
        const h = env.corpo.interactive.header;
        assert(h && h.type === 'image', `devia ir imagem no cabeçalho: ${JSON.stringify(h)}`);
        assert(h.image.link === 'https://x/capa.jpg', JSON.stringify(h));
    });

    await test('na lista, a imagem vai à frente numa mensagem própria', async () => {
        // A lista da Meta aceita cabeçalho, mas só de texto. Em vez de deitar a
        // imagem fora, ela segue antes — perde-se o encaixe, não a imagem.
        canalMeta();
        await Interativo.perguntar({
            ...pedido(6),
            cabecalho: { tipo: 'imagem', url: 'https://x/capa.jpg' },
        });
        const lista = enviados[enviados.length - 1];
        assert(lista.corpo.interactive.type === 'list', JSON.stringify(lista.corpo.interactive.type));
        assert(!lista.corpo.interactive.header, 'a lista não pode levar imagem por dentro');
        const media = enviados.filter(e => e.corpo?.type === 'image');
        assert(media.length === 1, `a imagem devia ter saído à parte: ${media.length}`);
        assert(media[0].corpo.image.link === 'https://x/capa.jpg', JSON.stringify(media[0].corpo));
    });

    await test('um cabeçalho de texto cabe na lista', async () => {
        canalMeta();
        await Interativo.perguntar({
            ...pedido(6),
            cabecalho: { tipo: 'texto', texto: 'Residencial Paraíso' },
        });
        const h = enviados[enviados.length - 1].corpo.interactive.header;
        assert(h && h.type === 'text' && h.text === 'Residencial Paraíso', JSON.stringify(h));
    });

    await test('as opções agrupam-se em secções', async () => {
        canalMeta();
        await Interativo.perguntar({
            ...pedido(0),
            opcoes: [
                { id: 'q1', rotulo: 'Simples', seccao: 'Quartos' },
                { id: 'q2', rotulo: 'Duplo', seccao: 'Quartos' },
                { id: 's1', rotulo: 'Pequeno-almoço', seccao: 'Serviços' },
                { id: 's2', rotulo: 'Transfer', seccao: 'Serviços' },
            ],
        });
        const sec = enviados[enviados.length - 1].corpo.interactive.action.sections;
        assert(sec.length === 2, `deviam ser 2 secções, são ${sec.length}`);
        assert(sec[0].title === 'Quartos' && sec[0].rows.length === 2, JSON.stringify(sec[0]));
        assert(sec[1].title === 'Serviços' && sec[1].rows.length === 2, JSON.stringify(sec[1]));
    });

    await test('dez linhas continua a ser o tecto, por mais secções que haja', async () => {
        // O limite da Meta é no TOTAL das linhas. Passar dele faz a Meta recusar
        // a mensagem inteira — e aí o cliente não recebia nada.
        canalMeta();
        await Interativo.perguntar({
            ...pedido(0),
            opcoes: Array.from({ length: 18 }, (_, i) => ({
                id: 'o' + i, rotulo: 'Opção ' + i, seccao: 'Grupo ' + (i % 6),
            })),
        });
        const env = enviados[enviados.length - 1];
        if (env.corpo.interactive) {
            const total = env.corpo.interactive.action.sections
                .reduce((n: number, g: any) => n + g.rows.length, 0);
            assert(total <= 10, `${total} linhas é demais`);
        }
    });

    await test('sem secções nenhumas, fica tudo num grupo só — como antes', async () => {
        canalMeta();
        await Interativo.perguntar(pedido(6));
        const sec = enviados[enviados.length - 1].corpo.interactive.action.sections;
        assert(sec.length === 1, `devia ser 1 secção, são ${sec.length}`);
        assert(sec[0].rows.length === 6, JSON.stringify(sec[0].rows.length));
    });

    await test('no texto numerado, as secções vêem-se e a numeração não reinicia', async () => {
        // Sem isto, uma lista agrupada chegava como dez linhas seguidas, sem se
        // perceber o que ia com o quê. E se a numeração reiniciasse por grupo,
        // havia dois "1" e o fluxo não sabia qual era qual.
        const t = Interativo.comoTexto({
            ...pedido(0),
            texto: 'Como posso ajudar?',
            opcoes: [
                { id: 'a', rotulo: 'Simples', seccao: 'Quartos' },
                { id: 'b', rotulo: 'Duplo', seccao: 'Quartos' },
                { id: 'c', rotulo: 'Transfer', seccao: 'Serviços' },
            ],
        });
        assert(t.includes('*Quartos*') && t.includes('*Serviços*'), t);
        assert(t.includes('1 - Simples') && t.includes('2 - Duplo') && t.includes('3 - Transfer'), t);
    });

    await test('a linha do cabeçalho não se perde no texto numerado', async () => {
        const t = Interativo.comoTexto({
            ...pedido(2),
            cabecalho: { tipo: 'texto', texto: 'Residencial Paraíso' },
        });
        assert(t.startsWith('Residencial Paraíso'), t.slice(0, 60));
    });

    console.log('\n=== O painel e o servidor dizem o mesmo ===\n');

    await test('a previsao do painel bate certo com o que o servidor faz', async () => {
        // Sao duas copias da mesma regra — uma no navegador, para desenhar a
        // pre-visualizacao, outra aqui — e nada no compilador as obriga a
        // concordar. Se divergirem, o painel mostra botoes e o cliente recebe
        // uma lista numerada, que e exactamente a surpresa que nao queremos.
        const ts = require('typescript');
        const fs = require('fs');
        const fonte = fs.readFileSync(
            path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'automation', 'PreVisualizacaoEscolha.tsx'), 'utf8'
        );
        const ini = fonte.indexOf('const LIMITES');
        const fim = fonte.indexOf('\n}', fonte.indexOf('export function formatoPrevisto')) + 2;
        const pedaco = fonte.slice(ini, fim).replace('export function', 'function');
        const js = ts.transpileModule(pedaco, {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
        }).outputText;
        // O codigo transpilado escreve em `exports`; sem lho dar, rebenta.
        const doEcra = new Function('exports', js + '\nreturn formatoPrevisto;')({});

        for (let n = 0; n <= 15; n++) {
            for (const comLista of [false, true]) {
                for (const comBotoes of [false, true]) {
                    const servidor = Interativo.formatoIdeal(n, comLista, comBotoes)[0];
                    const ecra = doEcra(n, comLista, comBotoes);
                    assert(servidor === ecra,
                        `${n} opcoes (lista:${comLista} botoes:${comBotoes}): servidor diz "${servidor}", painel mostra "${ecra}"`);
                }
            }
        }
    });

    await test('os limites sao os mesmos dos dois lados', async () => {
        const fs = require('fs');
        const fonte = fs.readFileSync(
            path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'automation', 'PreVisualizacaoEscolha.tsx'), 'utf8'
        );
        const m = fonte.match(/const LIMITES = \{ botoes: (\d+), lista: (\d+), sondagem: (\d+) \}/);
        assert(!!m, 'nao encontrei os limites no painel');
        assert(Number(m[1]) === LIMITES_SERVIDOR.botoes.opcoes, `botoes: painel ${m[1]}, servidor ${LIMITES_SERVIDOR.botoes.opcoes}`);
        assert(Number(m[2]) === LIMITES_SERVIDOR.lista.opcoes, `lista: painel ${m[2]}, servidor ${LIMITES_SERVIDOR.lista.opcoes}`);
        assert(Number(m[3]) === LIMITES_SERVIDOR.sondagem.opcoes, `sondagem: painel ${m[3]}, servidor ${LIMITES_SERVIDOR.sondagem.opcoes}`);
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
