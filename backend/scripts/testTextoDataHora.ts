/**
 * Testes do interpretador de datas e horas escritas por pessoas.
 * Uso: npx ts-node scripts/testTextoDataHora.ts   (a partir de backend/)
 */
import { TextoDataHoraService as S } from '../src/services/TextoDataHoraService';

let passed = 0, failed = 0; const falhas: string[] = [];
function test(nome: string, fn: () => void) {
    try { fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}
const eq = (a: any, b: any, m: string) => { if (a !== b) throw new Error(`${m}: esperado ${b}, veio ${a}`); };

// Quinta-feira, 8 de outubro de 2026
const HOJE = new Date(2026, 9, 8);

console.log('\n=== Datas ===\n');

test('formato da base de dados passa tal e qual', () => {
    eq(S.data('2026-12-25', HOJE), '2026-12-25', 'iso');
    eq(S.data('quero no dia 2026-11-03 por favor', HOJE), '2026-11-03', 'iso no meio da frase');
});

test('hoje, amanhã e depois de amanhã', () => {
    eq(S.data('hoje', HOJE), '2026-10-08', 'hoje');
    eq(S.data('pode ser amanhã', HOJE), '2026-10-09', 'amanhã');
    eq(S.data('depois de amanhã', HOJE), '2026-10-10', 'depois de amanhã');
});

test('datas com barras e traços', () => {
    eq(S.data('12/10', HOJE), '2026-10-12', '12/10');
    eq(S.data('12-10-2026', HOJE), '2026-10-12', '12-10-2026');
    eq(S.data('03.11.26', HOJE), '2026-11-03', '03.11.26');
});

test('data já passada sem ano salta para o ano seguinte', () => {
    eq(S.data('02/01', HOJE), '2027-01-02', '2 de janeiro já passou este ano');
});

test('datas por extenso', () => {
    eq(S.data('12 de outubro', HOJE), '2026-10-12', '12 de outubro');
    eq(S.data('1 de dez', HOJE), '2026-12-01', 'mês abreviado');
    eq(S.data('queria 25 de dezembro de 2027', HOJE), '2027-12-25', 'com ano');
    eq(S.data('3 de março', HOJE), '2027-03-03', 'março já passou → ano seguinte');
});

test('dias da semana', () => {
    eq(S.data('sexta', HOJE), '2026-10-09', 'sexta depois de quinta');
    eq(S.data('na segunda-feira', HOJE), '2026-10-12', 'segunda seguinte');
    eq(S.data('quinta', HOJE), '2026-10-15', 'quinta em quinta = a próxima');
    eq(S.data('sábado', HOJE), '2026-10-10', 'com acento');
});

test('"dia 3" resolve no mês certo', () => {
    eq(S.data('dia 20', HOJE), '2026-10-20', 'ainda este mês');
    eq(S.data('dia 3', HOJE), '2026-11-03', 'já passou → mês seguinte');
});

test('datas impossíveis e texto sem data devolvem null', () => {
    eq(S.data('31 de fevereiro', HOJE), null, '31 de fevereiro não existe');
    eq(S.data('45/13', HOJE), null, 'dia e mês inválidos');
    eq(S.data('quero reservar um quarto', HOJE), null, 'sem data');
    eq(S.data('', HOJE), null, 'vazio');
});

console.log('\n=== Horas ===\n');

test('formatos com minutos', () => {
    eq(S.hora('14:30'), '14:30', '14:30');
    eq(S.hora('14h30'), '14:30', '14h30');
    eq(S.hora('19.45'), '19:45', '19.45');
});

test('só horas', () => {
    eq(S.hora('14h'), '14:00', '14h');
    eq(S.hora('às 9'), '09:00', 'às 9');
    eq(S.hora('9'), '09:00', 'só o número');
    eq(S.hora('15 horas'), '15:00', '15 horas');
});

test('manhã, tarde, noite, meio-dia', () => {
    eq(S.hora('2 da tarde'), '14:00', '2 da tarde');
    eq(S.hora('9 da noite'), '21:00', '9 da noite');
    eq(S.hora('8 da manhã'), '08:00', '8 da manhã');
    eq(S.hora('meio-dia'), '12:00', 'meio-dia');
    eq(S.hora('meia noite'), '00:00', 'meia-noite');
});

test('horas impossíveis e texto sem hora devolvem null', () => {
    eq(S.hora('25:00'), null, '25h não existe');
    eq(S.hora('14:75'), null, 'minutos inválidos');
    eq(S.hora('de manhã'), null, 'sem número');
    eq(S.hora(''), null, 'vazio');
});

console.log('\n=== Escrita por extenso ===\n');
test('data em português', () => {
    eq(S.dataPorExtenso('2026-10-12'), '12 de outubro de 2026', 'por extenso');
});

console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
if (failed) { falhas.forEach(f => console.log('  - ' + f)); process.exit(1); }
