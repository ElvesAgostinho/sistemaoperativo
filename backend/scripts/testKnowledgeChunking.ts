/**
 * Testes da fatiagem de texto da Base de Conhecimento (funções puras, sem
 * chamadas à OpenAI nem à base de dados).
 *
 * Uso: npx ts-node scripts/testKnowledgeChunking.ts   (a partir de backend/)
 */
import { KnowledgeBaseService } from '../src/services/KnowledgeBaseService';

let passed = 0, failed = 0;
const falhas: string[] = [];

function test(nome: string, fn: () => void) {
    try { fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

const DOC = `Horário de atendimento

Atendemos de segunda a sexta, das 8h30 às 17h30. Ao sábado abrimos das 9h00 às 13h00.

Formas de pagamento

Aceitamos transferência bancária e numerário. Não aceitamos cheques.

Entregas

Entregamos em Luanda em 48 horas. Nas restantes províncias, de 5 a 7 dias úteis.`;

console.log('=== Fatiagem da Base de Conhecimento ===\n');

test('texto vazio não produz pedaços', () => {
    assert(KnowledgeBaseService.chunkText('').length === 0, 'devia devolver lista vazia');
    assert(KnowledgeBaseService.chunkText('   \n\n  ').length === 0, 'só espaços devia devolver lista vazia');
});

test('texto pequeno fica num só pedaço', () => {
    const c = KnowledgeBaseService.chunkText(DOC, 2000, 200);
    assert(c.length === 1, `esperava 1 pedaço, vieram ${c.length}`);
});

test('nenhum pedaço começa a meio de uma frase', () => {
    const c = KnowledgeBaseService.chunkText(DOC, 200, 50);
    assert(c.length > 1, 'o limite baixo devia obrigar a vários pedaços');
    for (const p of c) {
        assert(/^[A-ZÀ-Ú0-9]/.test(p.trim()), `pedaço começa a meio: "${p.slice(0, 40)}"`);
    }
});

test('nenhuma palavra é partida ao meio', () => {
    const c = KnowledgeBaseService.chunkText(DOC, 200, 50);
    const palavras = new Set(DOC.split(/\s+/).filter(Boolean));
    for (const p of c) {
        for (const w of p.split(/\s+/).filter(Boolean)) {
            assert(palavras.has(w), `palavra partida encontrada: "${w}"`);
        }
    }
});

test('todo o conteúdo original aparece em algum pedaço', () => {
    const c = KnowledgeBaseService.chunkText(DOC, 200, 50);
    const tudo = c.join(' ');
    for (const frase of ['Não aceitamos cheques', 'das 9h00 às 13h00', '5 a 7 dias úteis']) {
        assert(tudo.includes(frase), `perdeu-se do original: "${frase}"`);
    }
});

test('uma frase maior que o limite é cortada em vez de travar', () => {
    const gigante = 'A'.repeat(1000);
    const c = KnowledgeBaseService.chunkText(gigante, 200, 50);
    assert(c.length > 1, 'devia ter sido cortada em vários pedaços');
    assert(c.every(p => p.length <= 200), 'algum pedaço ficou acima do limite');
});

test('parágrafos seguidos não são colados sem separação', () => {
    const c = KnowledgeBaseService.chunkText(DOC, 2000, 200);
    assert(c[0].includes('\n\n'), 'os parágrafos deviam manter-se separados dentro do pedaço');
});

console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
if (failed > 0) { falhas.forEach(f => console.log('  - ' + f)); process.exit(1); }
