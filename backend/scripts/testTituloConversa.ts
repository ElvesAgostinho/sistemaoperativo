/**
 * Testes do nome que cada conversa do Assistente leva na lista lateral.
 *
 * Era `prompt.substring(0, 30)` — um corte cego aos 30 caracteres, que deixava
 * a lista com coisas como "Quando termina o contrato de c". O cliente viu isso
 * numa fotografia e perguntou se dava para arrumar.
 *
 * Uso: npx ts-node scripts/testTituloConversa.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import path from 'path';
import fs from 'fs';

const FICHEIRO = path.join(__dirname, '..', 'src', 'services', 'EnterpriseAssistantService.ts');

/**
 * A função vive dentro do serviço, que arrasta meia aplicação atrás de si
 * (Supabase, o motor de IA, as ferramentas). Compila-se só o pedaço dela e
 * corre-se — continua a ser a fonte verdadeira, não uma cópia que envelhece.
 */
function carregarFuncao(): (p: string, limite?: number) => string {
    const ts = require('typescript');
    const fonte = fs.readFileSync(FICHEIRO, 'utf8');

    const inicio = fonte.indexOf('function tituloDaPergunta');
    if (inicio === -1) throw new Error('não encontrei a função tituloDaPergunta');
    const fim = fonte.indexOf('\n}', inicio) + 2;

    const js = ts.transpileModule(fonte.slice(inicio, fim), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    }).outputText;

    return new Function(js + '\nreturn tituloDaPergunta;')();
}

const titulo = carregarFuncao();

let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };

function test(nome: string, fn: () => void) {
    try { fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}

const LONGA = 'Quando termina o contrato de consultoria com o Amândio Issipope e quanto pagamos por mês?';

console.log('\n=== O nome da conversa ===\n');

test('uma pergunta curta fica inteira, sem reticências', () => {
    assert(titulo('Quantos clientes tenho?') === 'Quantos clientes tenho?', titulo('Quantos clientes tenho?'));
    assert(titulo('Olá!') === 'Olá!', titulo('Olá!'));
});

test('uma pergunta longa corta no fim de uma palavra', () => {
    // O caso que o cliente viu: "Quando termina o contrato de c".
    const t = titulo(LONGA);
    assert(t.endsWith('...'), `devia acabar em reticências: "${t}"`);

    const sem = t.slice(0, -3);
    assert(!sem.endsWith(' '), `não devia sobrar um espaço antes das reticências: "${t}"`);

    const ultima = sem.split(' ').pop()!;
    assert(LONGA.split(/\s+/).includes(ultima), `cortou a meio da palavra "${ultima}": "${t}"`);
});

test('nunca mais corta a meio da palavra', () => {
    const frases = [
        LONGA,
        'Preciso de saber quantos funcionários entraram este mês na empresa',
        'Mostra-me as faturas por pagar dos últimos noventa dias por favor',
        'Qual foi o cliente que mais comprou no trimestre passado e quanto gastou',
    ];
    for (const f of frases) {
        const t = titulo(f);
        if (!t.endsWith('...')) continue;
        const ultima = t.slice(0, -3).split(' ').pop()!;
        assert(f.split(/\s+/).includes(ultima), `"${f}" -> "${t}" (palavra partida: "${ultima}")`);
    }
});

test('não deixa pontuação pendurada antes das reticências', () => {
    const t = titulo('Diz-me quantos clientes tenho no CRM, e quantos compraram este mês');
    assert(!/[,;:.!?-]\.\.\.$/.test(t), `ficou pontuação pendurada: "${t}"`);
});

test('uma palavra gigante sem espaços corta-se mesmo', () => {
    // Senão o título ficava vazio e a conversa sem nome nenhum.
    const t = titulo('a'.repeat(120));
    assert(t.length > 10 && t.endsWith('...'), `devia cortar: "${t}"`);
});

test('uma pergunta vazia não fica sem nome', () => {
    for (const vazio of ['', '   ', '\n\n']) {
        assert(titulo(vazio) === 'Nova conversa', `${JSON.stringify(vazio)} -> "${titulo(vazio)}"`);
    }
});

test('as quebras de linha não entram no nome', () => {
    // Quem cola um texto de várias linhas ficava com o título partido.
    const t = titulo('Quantos clientes\n\ntenho no CRM?');
    assert(!/\n/.test(t), `não pode levar quebras de linha: ${JSON.stringify(t)}`);
    assert(t === 'Quantos clientes tenho no CRM?', t);
});

test('cabe na coluna lateral', () => {
    // A coluna tem 272px; acima de ~48 caracteres o texto corta-se outra vez
    // com o "…" do CSS e deixa de se perceber a pergunta.
    const t = titulo('Preciso de saber quantos funcionários entraram este mês na empresa e quanto custaram');
    assert(t.length <= 48, `${t.length} caracteres é demais: "${t}"`);
});

test('a função é MESMO usada ao gravar a conversa', () => {
    // Sem isto, os testes de cima passavam com a função a existir e ninguém a
    // chamar — confirmei-o, voltando a pôr o substring(0, 30) no sítio que
    // grava e vendo os oito passarem na mesma.
    const fonte = fs.readFileSync(FICHEIRO, 'utf8');
    assert(/titulo:\s*tituloDaPergunta\(/.test(fonte),
        'a conversa não está a ser gravada com o nome arrumado');
    assert(!/titulo:\s*prompt\.substring/.test(fonte),
        'o corte cego aos 30 caracteres voltou');
});

console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
if (falhas.length) console.log('Falhou:\n  - ' + falhas.join('\n  - '));
process.exit(failed === 0 ? 0 : 1);
