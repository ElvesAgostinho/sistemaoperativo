/**
 * Testes da máquina de estados do ciclo de vida dos documentos e dos
 * metadados dinâmicos (funções puras, sem base de dados).
 *
 * Uso: npx ts-node scripts/testDocumentosCiclo.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { DocumentosCicloService, CICLOS } from '../src/services/DocumentosCicloService';
import { DocumentosGovernoService } from '../src/services/DocumentosGovernoService';

let passed = 0, failed = 0; const falhas: string[] = [];
function test(nome: string, fn: () => void) {
    try { fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
const validar = DocumentosCicloService.validar.bind(DocumentosCicloService);

console.log('=== Ciclo de vida ===\n');

test('transições válidas do dia a dia são aceites', () => {
    assert(validar('DRAFT', 'ACTIVE', 'sistema') === null, 'DRAFT→ACTIVE (IA arquivou) devia ser aceite');
    assert(validar('PENDING_REVIEW', 'ACTIVE', 'utilizador') === null, 'confirmar um Por rever devia ser aceite');
    assert(validar('ACTIVE', 'ARCHIVED', 'utilizador') === null, 'arquivar devia ser aceite');
    assert(validar('ACTIVE', 'EXPIRED', 'sistema') === null, 'caducar pelo sistema devia ser aceite');
});

test('transições sem sentido são recusadas com mensagem legível', () => {
    const e = validar('ACTIVE', 'DRAFT', 'utilizador');
    assert(!!e && /Não é possível passar de "Ativo" para "Rascunho"/.test(e), `mensagem inesperada: ${e}`);
    assert(validar('DELETED', 'ARCHIVED', 'utilizador') !== null, 'DELETED→ARCHIVED devia ser recusado');
});

test('o mesmo estado é recusado', () => {
    assert(/já está/.test(validar('ACTIVE', 'ACTIVE', 'utilizador') || ''), 'devia dizer que já está nesse estado');
});

test('caducar é só do sistema — um utilizador não pode "caducar" à mão', () => {
    const e = validar('ACTIVE', 'EXPIRED', 'utilizador');
    assert(!!e && /manualmente/.test(e), `esperava recusa por ator, veio: ${e}`);
});

test('eliminar exige motivo; com motivo passa', () => {
    assert(/motivo/i.test(validar('ACTIVE', 'DELETED', 'utilizador') || ''), 'sem motivo devia ser recusado');
    assert(validar('ACTIVE', 'DELETED', 'utilizador', 'documento duplicado') === null, 'com motivo devia passar');
});

test('aprovações são só do motor de fluxos; assinaturas continuam indisponíveis (Fase D)', () => {
    const e = validar('DRAFT', 'PENDING_APPROVAL', 'utilizador');
    assert(!!e && /manualmente/.test(e), `submeter à mão devia ser recusado por ator, veio: ${e}`);
    assert(validar('DRAFT', 'PENDING_APPROVAL', 'workflow') === null, 'o fluxo devia poder submeter um rascunho');
    assert(validar('ACTIVE', 'PENDING_APPROVAL', 'workflow') === null, 'o fluxo devia poder submeter um ativo (renovação)');
    assert(validar('PENDING_APPROVAL', 'APPROVED', 'workflow') === null, 'aprovar pelo fluxo');
    assert(/motivo/i.test(validar('PENDING_APPROVAL', 'REJECTED', 'workflow') || ''), 'rejeitar exige motivo');
    assert(validar('PENDING_APPROVAL', 'ACTIVE', 'workflow', 'cancelado') === null, 'cancelar repõe o estado anterior');
    assert(validar('APPROVED', 'ACTIVE', 'utilizador') === null, 'um aprovado pode ser posto em vigor à mão');
    assert(DocumentosCicloService.opcoes('DRAFT', 'utilizador').every(o => o.para !== 'PENDING_APPROVAL'), 'PENDING_APPROVAL não deve aparecer como botão manual');
    const opcoes = DocumentosCicloService.opcoes('APPROVED', 'workflow');
    assert(opcoes.some(o => o.para === 'PENDING_SIGNATURE' && !o.disponivel), 'PENDING_SIGNATURE devia estar listada como indisponível');
});

test('restaurar um eliminado volta a ACTIVE (nunca se perde)', () => {
    assert(validar('DELETED', 'ACTIVE', 'utilizador', 'eliminado por engano') === null, 'restauro devia ser aceite');
});

test('todos os estados têm pelo menos uma saída ou são terminais conhecidos', () => {
    for (const c of CICLOS) {
        const saidas = DocumentosCicloService.opcoes(c, 'utilizador').concat(DocumentosCicloService.opcoes(c, 'sistema'), DocumentosCicloService.opcoes(c, 'workflow'));
        assert(saidas.length > 0, `estado ${c} não tem nenhuma transição definida`);
    }
});

console.log('\n=== Metadados dinâmicos ===\n');

const tipoContrato = { campos: [
    { chave: 'contraparte', rotulo: 'Contraparte', tipo: 'texto', obrigatorio: true },
    { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' },
    { chave: 'data_inicio', rotulo: 'Início', tipo: 'data' },
    { chave: 'tipo_doc', rotulo: 'Tipo', tipo: 'selecao', opcoes: ['Prestação', 'Fornecimento'] },
] };

test('campos soltos da IA são mapeados para os campos do tipo (com sinónimos)', () => {
    const m = DocumentosGovernoService.metadadosDe(tipoContrato, { destinatario: 'Sonangol', valor: '25.000.000', emissor: 'X' });
    assert(m.contraparte === 'Sonangol', `contraparte devia vir de "destinatario", veio ${m.contraparte}`);
    assert(m.valor === 25000000, `"25.000.000" devia dar 25000000, veio ${JSON.stringify(m.valor)}`);
});

test('números como se escrevem em Angola: milhares com ponto, decimais com vírgula', () => {
    const n = DocumentosGovernoService.numeroDe.bind(DocumentosGovernoService);
    assert(n('25.000.000') === 25000000, '25.000.000');
    assert(n('25.000,50 Kz') === 25000.5, '25.000,50 Kz');
    assert(n('1 250,00') === 1250, '1 250,00');
    assert(n('3500') === 3500, '3500');
    assert(n('3.5') === 3.5, '3.5 (decimal com ponto, 1 dígito)');
    assert(n('1,234.56') === 1234.56, '1,234.56 (formato inglês)');
    assert(n('abc') === null, 'abc devia ser null');
    assert(n(42) === 42, 'número passa tal e qual');
});

test('validação: obrigatório em falta, número inválido, data mal formada, opção fora da lista', () => {
    assert(/obrigatório/.test(DocumentosGovernoService.validarMetadados(tipoContrato, {}) || ''), 'faltava obrigatório');
    assert(/número/.test(DocumentosGovernoService.validarMetadados(tipoContrato, { contraparte: 'X', valor: 'abc' }) || ''), 'valor não numérico');
    assert(/data/.test(DocumentosGovernoService.validarMetadados(tipoContrato, { contraparte: 'X', data_inicio: '15/03/2026' }) || ''), 'data mal formada');
    assert(/opções/.test(DocumentosGovernoService.validarMetadados(tipoContrato, { contraparte: 'X', tipo_doc: 'Outro' }) || ''), 'opção inválida');
    assert(DocumentosGovernoService.validarMetadados(tipoContrato, { contraparte: 'X', valor: 100, data_inicio: '2026-03-15', tipo_doc: 'Prestação' }) === null, 'válido devia passar');
});

console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
if (failed) { falhas.forEach(f => console.log('  - ' + f)); process.exit(1); }
