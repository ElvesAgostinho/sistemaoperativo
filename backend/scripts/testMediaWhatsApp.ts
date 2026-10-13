/**
 * A multimédia do painel e a da conversa são a MESMA peça.
 *
 * Quando o editor de blocos passou a deixar carregar ficheiros, era preciso que
 * o painel mostrasse o ficheiro como o cliente o vai receber. A alternativa a
 * partilhar o código era copiá-lo — e esta semana inteira foi passada a
 * consertar duas cópias da mesma regra que tinham deixado de concordar.
 *
 * Estes testes seguram as duas funções que decidem o que se desenha, e seguram
 * que o ficheiro carregado chega ao cliente com o nome que a pessoa lhe deu.
 */
import path from 'path';

let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };

function test(nome: string, fn: () => void) {
    try { fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}

/** Carrega as funções puras do componente do frontend, sem o React. */
function carregarDoEcra() {
    const ts = require('typescript');
    const fs = require('fs');
    const fonte = fs.readFileSync(
        path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'whatsapp', 'MediaWhatsApp.tsx'),
        'utf8',
    );
    const ini = fonte.indexOf('export function tipoPeloEndereco');
    const fim = fonte.indexOf('\n}', fonte.indexOf('export function nomeDoEndereco')) + 2;
    assert(ini > 0 && fim > ini, 'não encontrei as funções no componente');

    const pedaco = fonte.slice(ini, fim).replace(/export function/g, 'function');
    const js = ts.transpileModule(pedaco, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    }).outputText;
    return new Function('exports', js + '\nreturn { tipoPeloEndereco, nomeDoEndereco };')({});
}

(async () => {
    const ecra = carregarDoEcra();

    console.log('\n=== Que tipo de ficheiro é este ===\n');

    test('as imagens são reconhecidas', () => {
        for (const u of ['https://x/a.jpg', 'https://x/a.JPEG', 'https://x/a.png', 'https://x/a.gif', 'https://x/a.webp']) {
            assert(ecra.tipoPeloEndereco(u) === 'imagem', `${u} devia ser imagem, deu ${ecra.tipoPeloEndereco(u)}`);
        }
    });

    test('os vídeos são reconhecidos', () => {
        for (const u of ['https://x/a.mp4', 'https://x/a.MOV', 'https://x/a.webm']) {
            assert(ecra.tipoPeloEndereco(u) === 'video', `${u} devia ser vídeo`);
        }
    });

    test('os áudios são reconhecidos', () => {
        // O .ogg é o que o WhatsApp usa nas notas de voz. Se ele caísse no
        // documento, a nota de voz aparecia como um cartão de ficheiro.
        for (const u of ['https://x/a.ogg', 'https://x/a.mp3', 'https://x/a.m4a', 'https://x/a.wav']) {
            assert(ecra.tipoPeloEndereco(u) === 'audio', `${u} devia ser áudio`);
        }
    });

    test('o resto é documento', () => {
        for (const u of ['https://x/a.pdf', 'https://x/a.docx', 'https://x/sem-extensao']) {
            assert(ecra.tipoPeloEndereco(u) === 'documento', `${u} devia ser documento`);
        }
    });

    test('a pergunta no fim do endereço não engana', () => {
        // O Supabase devolve endereços com ?token=… em alguns casos. Sem cortar
        // a pergunta, a extensão lida era "jpg?token=abc" e nada era imagem.
        assert(ecra.tipoPeloEndereco('https://x/a.jpg?token=abc') === 'imagem', 'devia continuar a ser imagem');
    });

    console.log('\n=== O nome que se mostra ===\n');

    test('o carimbo de tempo do carregamento não se mostra', () => {
        // Os ficheiros carregados levam `Date.now()_` à frente, para não se
        // substituírem uns aos outros. Mostrar isso a quem só quer ver o nome
        // do contrato não serve a ninguém.
        const u = 'https://sb.co/storage/.../workflows/emp/1791850143992_Contrato_de_Arrendamento.pdf';
        assert(ecra.nomeDoEndereco(u) === 'Contrato_de_Arrendamento.pdf', ecra.nomeDoEndereco(u));
    });

    test('um nome que começa por números NÃO é cortado a meio', () => {
        // "2024_relatorio.pdf" tem 4 dígitos, não um carimbo de tempo. Cortar
        // ali dava "relatorio.pdf" e perdia-se o ano, que é informação.
        assert(ecra.nomeDoEndereco('https://x/2024_relatorio.pdf') === '2024_relatorio.pdf', ecra.nomeDoEndereco('https://x/2024_relatorio.pdf'));
    });

    test('os acentos do nome voltam legíveis', () => {
        assert(ecra.nomeDoEndereco('https://x/Contrato%20de%20Arrendamento.pdf') === 'Contrato de Arrendamento.pdf',
            ecra.nomeDoEndereco('https://x/Contrato%20de%20Arrendamento.pdf'));
    });

    test('um endereço estragado não rebenta', () => {
        // Um % solto faz o decodeURIComponent atirar. Isso não pode derrubar o
        // painel inteiro de quem está a montar um fluxo.
        const r = ecra.nomeDoEndereco('https://x/100%_feito.pdf');
        assert(typeof r === 'string' && r.length > 0, `devia devolver algo: ${r}`);
    });

    console.log('\n=== O painel e o servidor concordam nos tipos ===\n');

    test('os tipos do ecrã são os mesmos blocos que o servidor envia', () => {
        // Le-se a lista da fonte em vez de importar o servico: importa-lo puxa
        // o cliente do Supabase, que precisa de credenciais que um teste nao tem.
        const fs = require('fs');
        const fonte = fs.readFileSync(
            path.join(__dirname, '..', 'src', 'services', 'BlocosMensagemService.ts'), 'utf8',
        );
        const lista = fonte.slice(
            fonte.indexOf('BLOCOS_DISPONIVEIS'),
            fonte.indexOf('];', fonte.indexOf('BLOCOS_DISPONIVEIS')),
        );
        assert(lista.length > 0, 'nao encontrei a lista dos blocos no servidor');
        const doServidor = [...lista.matchAll(/tipo: '([a-z]+)'/g)]
            .map((m: any) => m[1])
            .filter((t: string) => t !== 'texto' && t !== 'pausa');
        assert(doServidor.length === 4, `esperava 4 tipos de media, li ${doServidor.length}: ${doServidor}`);
        const doEcra = ['imagem', 'video', 'audio', 'documento'];
        for (const t of doServidor) {
            assert(doEcra.includes(t), `o servidor envia "${t}" e o ecrã não o sabe desenhar`);
        }
        for (const t of doEcra) {
            assert(doServidor.includes(t), `o ecrã desenha "${t}" e o servidor não o envia`);
        }
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===\n`);
    if (failed) { console.log('Falharam: ' + falhas.join(', ')); process.exit(1); }
})();
