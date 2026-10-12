/**
 * Testes dos blocos dentro de um nó.
 *
 * Para mandar três mensagens e uma imagem eram precisos quatro nós ligados por
 * setas, e cada um era um passo do motor. Era disso que o cliente se queixava:
 * "a pessoa não precisar sofrer com vários disparos de fluxos". Agora é um nó
 * só, com os blocos a sair por ordem.
 *
 * O que aqui se segura: os fluxos antigos continuam a correr, um bloco que
 * falhe não trava os seguintes, e os botões de link/chamada saem no formato
 * que a Evolution desta instalação aceita (confirmei os cinco tipos a mão).
 *
 * Uso: npx ts-node scripts/testBlocosMensagem.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import path from 'path';

const db: Record<string, any[]> = {};
const tabela = (t: string) => (db[t] = db[t] || []);
const bate = (row: any, f: any[]) => f.every(x => String(row[x.col]) === String(x.val));

function mockFrom(t: string) {
    const filtros: any[] = [];
    const self: any = {}; const ret = () => self;
    self.select = ret; self.order = ret; self.limit = ret;
    self.insert = (p: any) => { tabela(t).push(...(Array.isArray(p) ? p : [p])); return self; };
    self.update = () => self;
    self.eq = (col: string, val: any) => { filtros.push({ col, val }); return self; };
    const correr = () => ({ data: tabela(t).filter(l => bate(l, filtros)), error: null });
    const um = () => ({ data: correr().data[0] ?? null, error: null });
    self.single = () => Promise.resolve(um());
    self.maybeSingle = () => Promise.resolve(um());
    self.then = (res: any, rej: any) => Promise.resolve(correr()).then(res, rej);
    return self;
}

const mockSupabase: any = { from: mockFrom };
const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });
const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);

// O transporte é substituído: o que está em causa é a ORDEM e o FORMATO, não a rede.
const { WhatsAppChannelManager } = require(path.join(__dirname, '..', 'src', 'services', 'WhatsAppChannelManager'));
const saiu: { tipo: string; conteudo: string; extra?: any }[] = [];
let recusarTexto = false;
WhatsAppChannelManager.sendMessage = async (_s: any, _c: string, _p: string, texto: string) => {
    if (recusarTexto) throw new Error('o canal recusou');
    saiu.push({ tipo: 'texto', conteudo: texto });
    return 'mid';
};
WhatsAppChannelManager.sendMediaMessage = async (_s: any, _c: string, _p: string, url: string, nome: string, legenda?: string) => {
    saiu.push({ tipo: 'media', conteudo: url, extra: { nome, legenda } });
    return true;
};

const pedidos: { url: string; corpo: any }[] = [];
let recusarBotoes = false;
(global as any).fetch = async (url: string, opts: any) => {
    const corpo = opts?.body ? JSON.parse(opts.body) : {};
    pedidos.push({ url: String(url), corpo });
    if (recusarBotoes) return { status: 400, json: async () => ({ response: { message: ['recusado'] } }) } as any;
    saiu.push({ tipo: 'botoes', conteudo: corpo.description || '', extra: corpo.buttons });
    return { status: 201, json: async () => ({ key: { id: 'b1' } }) } as any;
};

process.env.EVOLUTION_API_URL = 'https://evolution.exemplo.pt';
process.env.AUTHENTICATION_API_KEY = 'chave';

const { BlocosMensagemService: Blocos } = require(path.join(__dirname, '..', 'src', 'services', 'BlocosMensagemService'));

const DESTINO = { empresaId: 'empresa-1', channelId: 'chan-1', telefone: '244928053925' };
const parse = (t: string) => String(t || '').replace(/\{\{nome\}\}/g, 'Ana');

let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };

async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    saiu.length = 0; pedidos.length = 0; recusarTexto = false; recusarBotoes = false;
    tabela('wa_channels').push({
        id: 'chan-1', empresa_id: 'empresa-1', provider: 'evolution',
        credentials: { instanceName: 'INST_1' },
    });
    const antes = console.log; const antesErr = console.error;
    console.log = () => { }; console.error = () => { };
    try { await fn(); console.log = antes; antes(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log = antes; antes(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
    finally { console.log = antes; console.error = antesErr; }
}

(async () => {
    console.log('\n=== Os fluxos antigos continuam a correr ===\n');

    await test('um nó com só "mensagem" é lido como um bloco de texto', async () => {
        // Há fluxos gravados assim. Mudar a forma de guardar não pode mudar o
        // que eles já fazem.
        const b = Blocos.lerBlocos({ mensagem: 'Bom dia' });
        assert(b.length === 1 && b[0].tipo === 'texto' && b[0].texto === 'Bom dia', JSON.stringify(b));
    });

    await test('um nó sem nada nenhum não rebenta', async () => {
        assert(Blocos.lerBlocos({}).length === 0, 'devia vir vazio');
        assert(Blocos.lerBlocos(null).length === 0, 'devia vir vazio');
    });

    await test('os blocos novos ganham ao campo antigo', async () => {
        const b = Blocos.lerBlocos({ mensagem: 'antigo', blocos: [{ tipo: 'texto', texto: 'novo' }] });
        assert(b.length === 1 && b[0].texto === 'novo', JSON.stringify(b));
    });

    console.log('\n=== A ordem ===\n');

    await test('os blocos saem pela ordem em que estão', async () => {
        await Blocos.enviar([
            { tipo: 'texto', texto: 'Primeira' },
            { tipo: 'imagem', url: 'https://x/foto.jpg', texto: 'A foto' },
            { tipo: 'texto', texto: 'Terceira' },
        ], DESTINO, parse);

        assert(saiu.length === 3, `deviam sair 3, saíram ${saiu.length}`);
        assert(saiu[0].conteudo === 'Primeira', saiu[0].conteudo);
        assert(saiu[1].tipo === 'media' && saiu[1].extra.legenda === 'A foto', JSON.stringify(saiu[1]));
        assert(saiu[2].conteudo === 'Terceira', saiu[2].conteudo);
    });

    await test('as variáveis são substituídas em todos os blocos', async () => {
        await Blocos.enviar([
            { tipo: 'texto', texto: 'Olá {{nome}}' },
            { tipo: 'imagem', url: 'https://x/f.jpg', texto: 'Para si, {{nome}}' },
        ], DESTINO, parse);
        assert(saiu[0].conteudo === 'Olá Ana', saiu[0].conteudo);
        assert(saiu[1].extra.legenda === 'Para si, Ana', saiu[1].extra.legenda);
    });

    await test('uma pausa curta atrasa mas não trava', async () => {
        const antes = Date.now();
        const r = await Blocos.enviar([
            { tipo: 'texto', texto: 'Um' },
            { tipo: 'pausa', duracao: 1, unidade: 'segundos' },
            { tipo: 'texto', texto: 'Dois' },
        ], DESTINO, parse);
        const demorou = Date.now() - antes;
        assert(demorou >= 900, `devia esperar ~1s, esperou ${demorou}ms`);
        assert(demorou < 5000, `não devia prender tanto: ${demorou}ms`);
        assert(r.enviados === 3, `${r.enviados}`);
    });

    await test('uma pausa longa nao cabe dentro de um no', async () => {
        // Dentro de um no a pausa prende mesmo o processo, por isso o tecto e
        // baixo. Esperas de horas tem o seu no proprio, o "Aguardar", que as
        // guarda e sobrevive a um reinicio.
        const { PAUSA_MAX_SEGUNDOS } = require(path.join(__dirname, '..', 'src', 'services', 'BlocosMensagemService'));
        assert(PAUSA_MAX_SEGUNDOS <= 60, `${PAUSA_MAX_SEGUNDOS}s e demasiado para prender o processo`);
        // A conta esta certa; e o tecto que a corta.
        assert(Blocos.segundosDaPausa({ tipo: 'pausa', duracao: 3, unidade: 'horas' }) === 10800, 'tres horas sao 10800s');
        assert(Blocos.segundosDaPausa({ tipo: 'pausa', duracao: 5, unidade: 'minutos' }) === 300, 'cinco minutos sao 300s');
        assert(Blocos.segundosDaPausa({ tipo: 'pausa', duracao: 0 }) === 0, 'zero e zero');
        assert(Blocos.segundosDaPausa({ tipo: 'pausa', duracao: -5 }) === 0, 'negativo nao espera ao contrario');
    });

    console.log('\n=== Um bloco que falha ===\n');

    await test('não trava os que vêm a seguir', async () => {
        // Mais vale o cliente receber três das quatro mensagens do que nenhuma.
        let n = 0;
        WhatsAppChannelManager.sendMessage = async (_s: any, _c: string, _p: string, texto: string) => {
            n++;
            if (n === 2) throw new Error('o canal recusou');
            saiu.push({ tipo: 'texto', conteudo: texto });
            return 'mid';
        };
        const r = await Blocos.enviar([
            { tipo: 'texto', texto: 'Um' }, { tipo: 'texto', texto: 'Dois' }, { tipo: 'texto', texto: 'Três' },
        ], DESTINO, parse);

        assert(r.enviados === 2, `deviam sair 2, saíram ${r.enviados}`);
        assert(r.falhados.length === 1 && r.falhados[0].indice === 1, JSON.stringify(r.falhados));
        assert(saiu.map(x => x.conteudo).join(',') === 'Um,Três', saiu.map(x => x.conteudo).join(','));

        // Repor o transporte COM o travao: sem ele, os testes seguintes nao
        // conseguiam simular uma recusa.
        WhatsAppChannelManager.sendMessage = async (_s: any, _c: string, _p: string, texto: string) => {
            if (recusarTexto) throw new Error('o canal recusou');
            saiu.push({ tipo: 'texto', conteudo: texto }); return 'mid';
        };
    });

    await test('um bloco vazio não conta como falha', async () => {
        // É um bloco por preencher, não uma avaria.
        const r = await Blocos.enviar([
            { tipo: 'texto', texto: '   ' }, { tipo: 'texto', texto: 'Um' },
        ], DESTINO, parse);
        assert(r.falhados.length === 0, JSON.stringify(r.falhados));
        assert(saiu.length === 1, `só devia sair uma: ${saiu.length}`);
    });

    await test('um bloco que nao sai fica ESCRITO, nao so num log', async () => {
        // O cliente disse: "o sistema nao pode funcionar com estes erros".
        // Tem razao no fundo: um bloco que falha nao e um erro ACEITAVEL, e um
        // erro que TEM DE SER VISTO. Antes ia so para o log do servidor, que
        // ninguem le. O fluxo continua — parar deixava o cliente com meia
        // conversa e ninguem avisado — mas o que faltou fica registado.
        const r = await Blocos.enviar([
            { tipo: 'texto', texto: 'Um' },
            { tipo: 'imagem', url: '' },
        ], DESTINO, parse);
        // Um bloco sem destino nao conta como falha: e um bloco por preencher.
        assert(r.falhados.length === 0, JSON.stringify(r.falhados));

        recusarTexto = true;
        const r2 = await Blocos.enviar([{ tipo: 'texto', texto: 'Nao vai sair' }], DESTINO, parse);
        assert(r2.falhados.length === 1, 'devia contar a falha');
        assert(r2.falhados[0].tipo === 'texto', r2.falhados[0].tipo);
        assert(/recusou/i.test(r2.falhados[0].erro), r2.falhados[0].erro);
        assert(r2.falhados[0].indice === 0, 'tem de dizer QUAL bloco falhou');
        recusarTexto = false;
    });

    console.log('\n=== Botões de acção ===\n');

    await test('um botão de link sai no formato certo', async () => {
        await Blocos.enviar([{
            tipo: 'texto', texto: 'Veja o e-book',
            botoes: [{ tipo: 'link', rotulo: 'COMPRAR E-BOOK', valor: 'https://exemplo.pt/ebook' }],
        }], DESTINO, parse);

        const p = pedidos[0];
        assert(/sendButtons/.test(p.url), p.url);
        assert(p.corpo.buttons[0].type === 'url', JSON.stringify(p.corpo.buttons[0]));
        assert(p.corpo.buttons[0].url === 'https://exemplo.pt/ebook', JSON.stringify(p.corpo.buttons[0]));
    });

    await test('um botão de chamada leva o número limpo', async () => {
        await Blocos.enviar([{
            tipo: 'texto', texto: 'Ligue-nos',
            botoes: [{ tipo: 'chamada', rotulo: 'Ligar agora', valor: '+244 928 053 925' }],
        }], DESTINO, parse);
        const b = pedidos[0].corpo.buttons[0];
        assert(b.type === 'call' && b.phoneNumber === '244928053925', JSON.stringify(b));
    });

    await test('um botão de copiar leva o código', async () => {
        await Blocos.enviar([{
            tipo: 'texto', texto: 'O seu código',
            botoes: [{ tipo: 'copiar', rotulo: 'Copiar', valor: 'PROMO20' }],
        }], DESTINO, parse);
        const b = pedidos[0].corpo.buttons[0];
        assert(b.type === 'copy' && b.copyCode === 'PROMO20', JSON.stringify(b));
    });

    await test('nunca vão mais de três botões', async () => {
        // O WhatsApp recusa a mensagem inteira acima de três, e aí o cliente
        // não recebia nada.
        await Blocos.enviar([{
            tipo: 'texto', texto: 'x',
            botoes: [1, 2, 3, 4, 5].map(i => ({ tipo: 'link', rotulo: 'B' + i, valor: 'https://x/' + i })),
        }], DESTINO, parse);
        assert(pedidos[0].corpo.buttons.length === 3, `foram ${pedidos[0].corpo.buttons.length}`);
    });

    await test('botões sem rótulo ou sem destino são deitados fora', async () => {
        await Blocos.enviar([{
            tipo: 'texto', texto: 'x',
            botoes: [
                { tipo: 'link', rotulo: '', valor: 'https://x' },
                { tipo: 'link', rotulo: 'Bom', valor: 'https://x' },
                { tipo: 'link', rotulo: 'Sem destino', valor: '' },
            ],
        }], DESTINO, parse);
        assert(pedidos[0].corpo.buttons.length === 1, `só o bom devia passar: ${JSON.stringify(pedidos[0].corpo.buttons)}`);
    });

    await test('um rótulo comprido é encurtado, não recusado', async () => {
        await Blocos.enviar([{
            tipo: 'texto', texto: 'x',
            botoes: [{ tipo: 'link', rotulo: 'Carregue aqui para comprar o e-book completo hoje', valor: 'https://x' }],
        }], DESTINO, parse);
        assert(pedidos[0].corpo.buttons[0].displayText.length <= 20, pedidos[0].corpo.buttons[0].displayText);
    });

    await test('as variáveis também funcionam nos botões', async () => {
        await Blocos.enviar([{
            tipo: 'texto', texto: 'x',
            botoes: [{ tipo: 'link', rotulo: 'Para {{nome}}', valor: 'https://x/{{nome}}' }],
        }], DESTINO, parse);
        const b = pedidos[0].corpo.buttons[0];
        assert(b.displayText === 'Para Ana' && b.url === 'https://x/Ana', JSON.stringify(b));
    });

    await test('um texto sem botões não passa pelo sendButtons', async () => {
        // Seria uma chamada diferente e mais frágil, sem ganho nenhum.
        await Blocos.enviar([{ tipo: 'texto', texto: 'simples' }], DESTINO, parse);
        assert(pedidos.length === 0, 'não devia ter chamado o sendButtons');
        assert(saiu[0].tipo === 'texto', JSON.stringify(saiu[0]));
    });

    await test('o painel e o servidor usam o mesmo tecto de pausa', async () => {
        // Sao duas copias do mesmo numero. Se divergirem, o painel deixa pedir
        // 30 segundos e o servidor corta noutro sitio, sem ninguem perceber.
        const { PAUSA_MAX_SEGUNDOS } = require(path.join(__dirname, '..', 'src', 'services', 'BlocosMensagemService'));
        const fonte = require('fs').readFileSync(
            path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'automation', 'EditorBlocos.tsx'), 'utf8');
        const m = fonte.match(/PAUSA_MAX_SEGUNDOS = (\d+)/);
        assert(!!m, 'nao encontrei o tecto no painel');
        assert(Number(m[1]) === PAUSA_MAX_SEGUNDOS, `painel ${m[1]}s, servidor ${PAUSA_MAX_SEGUNDOS}s`);
    });

    await test('os blocos do painel sao os mesmos do servidor', async () => {
        const { BLOCOS_DISPONIVEIS } = require(path.join(__dirname, '..', 'src', 'services', 'BlocosMensagemService'));
        const fonte = require('fs').readFileSync(
            path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'automation', 'EditorBlocos.tsx'), 'utf8');
        for (const b of BLOCOS_DISPONIVEIS) {
            assert(new RegExp(`tipo: '${b.tipo}'`).test(fonte), `o painel nao oferece o bloco "${b.tipo}"`);
        }
    });

    console.log('\n=== O catálogo do painel ===\n');

    await test('só entram blocos de conteúdo', async () => {
        // Condição e Etiquetas ramificam o fluxo ou mexem em dados: continuam a
        // ser nós próprios, ligados por setas, onde se veem.
        const tipos = Blocos.BLOCOS_DISPONIVEIS ?? [];
        const lista = (tipos.length ? tipos : require(path.join(__dirname, '..', 'src', 'services', 'BlocosMensagemService')).BLOCOS_DISPONIVEIS);
        const nomes = lista.map((b: any) => b.tipo);
        for (const esperado of ['texto', 'imagem', 'video', 'audio', 'documento', 'pausa']) {
            assert(nomes.includes(esperado), `falta o bloco ${esperado}`);
        }
        for (const foraDaquilo of ['condicao', 'etiqueta', 'notificar', 'api', 'menu']) {
            assert(!nomes.includes(foraDaquilo), `${foraDaquilo} não devia ser um bloco`);
        }
    });

    await test('todos os blocos têm nome e explicação', async () => {
        const lista = require(path.join(__dirname, '..', 'src', 'services', 'BlocosMensagemService')).BLOCOS_DISPONIVEIS;
        for (const b of lista) {
            assert(!!b.nome && b.nome.length > 2, `${b.tipo} sem nome`);
            assert(!!b.descricao && b.descricao.length > 15, `${b.tipo} sem explicação`);
        }
    });

    console.log('\n=== Quem leva blocos ===\n');

    const motor = () => require(path.join(__dirname, '..', 'src', 'services', 'AutomationEngine')).AutomationEngine;
    const doEcra = () => {
        const fs = require('fs');
        const fonte = fs.readFileSync(
            path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'automation', 'EditorBlocos.tsx'), 'utf8');
        const m = fonte.match(/export const ACCOES_COM_BLOCOS = \[([\s\S]*?)\]/);
        if (!m) throw new Error('nao encontrei a lista no painel');
        return m[1].split(',').map((x: string) => x.trim().replace(/['"]/g, '')).filter(Boolean);
    };

    await test('o painel e o servidor concordam em quem leva blocos', async () => {
        // Sao duas listas. Se divergirem, o painel oferece blocos num no que
        // nunca os envia — ou esconde-os num que os enviaria. As duas coisas
        // sao silenciosas.
        const servidor = [...motor().ACCOES_COM_BLOCOS].sort();
        const ecra = [...doEcra()].sort();
        assert(servidor.join(',') === ecra.join(','),
            `servidor: ${servidor.join(',')}\n      painel:   ${ecra.join(',')}`);
    });

    await test('quem FALA com o cliente leva blocos', async () => {
        // A regra, escrita. Um no novo que fale com o cliente e nasca sem
        // blocos cai aqui, em vez de ninguem reparar durante meses.
        const devem = ['AI_REPLY', 'HANDOFF_HUMAN', 'CHECK_SLOTS', 'CREATE_BOOKING',
                       'LIST_BOOKINGS', 'SET_CUSTOM_FIELD', 'WAIT_REPLY'];
        const lista = motor().ACCOES_COM_BLOCOS;
        for (const a of devem) {
            assert(lista.includes(a), `"${a}" fala com o cliente e devia levar blocos`);
        }
    });

    await test('quem NAO fala com o cliente nao leva blocos', async () => {
        // Encher estes nos de blocos tornava o cartao ilegivel sem dar nada.
        const naoDevem = [
            'ADD_TAG', 'REMOVE_TAG', 'EXTERNAL_REQUEST', 'LOG_MESSAGE',
            'JUMP_TO_WORKFLOW', 'DELAY', 'GOTO_MENU',
            'NOTIFY_TEAM',       // fala com a EQUIPA, nao com o cliente
            'SEND_EMAIL',        // e email; os blocos sao feitos para WhatsApp
            'SEND_TEMPLATE',     // a Meta define o formato, nada vai antes
            'SEND_IMAGE', 'SEND_VIDEO', 'SEND_AUDIO', 'SEND_DOCUMENT',  // sao eles proprios um bloco
            'REPLY_MESSAGE',     // e TODO feito de blocos; corre-os ele proprio
        ];
        const lista = motor().ACCOES_COM_BLOCOS;
        for (const a of naoDevem) {
            assert(!lista.includes(a), `"${a}" nao devia levar blocos`);
        }
    });

    await test('todos os nomes da lista existem mesmo', async () => {
        const fs = require('fs');
        const tipos = fs.readFileSync(
            path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'automation', 'types.ts'), 'utf8');
        for (const a of motor().ACCOES_COM_BLOCOS) {
            assert(tipos.includes(`'${a}'`), `"${a}" nao e um tipo de no que exista`);
        }
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (falhas.length) console.log('Falhou:\n  - ' + falhas.join('\n  - '));
    process.exit(failed === 0 ? 0 : 1);
})();
