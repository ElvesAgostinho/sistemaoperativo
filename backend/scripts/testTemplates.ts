/**
 * Testes dos templates de WhatsApp: as regras que a Meta aplica (e que é melhor
 * apanhar aqui do que levar com a recusa depois) e a conversão para o texto
 * equivalente usado nos canais sem templates.
 *
 * Uso: npx ts-node scripts/testTemplates.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { WhatsAppTemplateService as T } from '../src/services/WhatsAppTemplateService';

let passed = 0, failed = 0; const falhas: string[] = [];
function test(nome: string, fn: () => void) {
    try { fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const base: any = { name: 'promocao_natal', language: 'pt_PT', category: 'MARKETING', body: 'Olá {{1}}, temos uma promoção para si.', exemplos: ['Ana'] };

console.log('\n=== Validação (regras da Meta) ===\n');

test('template simples válido passa', () => {
    assert(T.validar(base) === null, `devia ser válido: ${T.validar(base)}`);
});

test('nome só aceita minúsculas, números e _', () => {
    assert(/minúsculas/.test(T.validar({ ...base, name: 'Promoção Natal' }) || ''), 'nome com maiúsculas/espaços devia ser recusado');
    assert(T.validar({ ...base, name: 'promo_2026' }) === null, 'nome válido recusado');
});

test('corpo obrigatório e com limite de 1024', () => {
    assert(/corpo/.test(T.validar({ ...base, body: '' }) || ''), 'corpo vazio');
    assert(/1024/.test(T.validar({ ...base, body: 'x'.repeat(1100) }) || ''), 'corpo demasiado longo');
});

test('variáveis têm de ser seguidas e com exemplos', () => {
    assert(/seguidas/.test(T.validar({ ...base, body: 'Olá {{1}}, o pedido {{3}} está pronto.', exemplos: ['Ana', '12'] }) || ''), 'salto de variável');
    assert(/exemplo/.test(T.validar({ ...base, body: 'Olá {{1}}, pedido {{2}}.', exemplos: ['Ana'] }) || ''), 'exemplos em falta');
    assert(T.validar({ ...base, body: 'Olá {{1}}, pedido {{2}} pronto.', exemplos: ['Ana', '12'] }) === null, 'duas variáveis com exemplos devia passar');
});

test('corpo não pode começar nem acabar em variável, nem ter duas seguidas', () => {
    assert(/começar/.test(T.validar({ ...base, body: '{{1}}, bem-vindo!' }) || ''), 'começa com variável');
    assert(/começar|terminar/.test(T.validar({ ...base, body: 'Bem-vindo {{1}}' }) || ''), 'termina com variável');
    assert(/seguidas/.test(T.validar({ ...base, body: 'Olá {{1}}{{2}} tudo bem?', exemplos: ['a', 'b'] }) || ''), 'duas variáveis coladas');
});

test('cabeçalho de texto: máximo 60, uma variável, com exemplo', () => {
    assert(/60/.test(T.validar({ ...base, header: { format: 'TEXT', text: 'x'.repeat(70) } }) || ''), 'cabeçalho longo');
    assert(/uma variável/.test(T.validar({ ...base, header: { format: 'TEXT', text: '{{1}} e {{2}}' } }) || ''), 'duas variáveis no cabeçalho');
    assert(/exemplo/.test(T.validar({ ...base, header: { format: 'TEXT', text: 'Olá {{1}}' } }) || ''), 'exemplo do cabeçalho em falta');
    assert(T.validar({ ...base, header: { format: 'TEXT', text: 'Promoção de Natal' } }) === null, 'cabeçalho simples devia passar');
});

test('botões: 3 de resposta rápida OU 2 de ação, nunca misturados', () => {
    const qr = (n: number) => Array.from({ length: n }, (_, i) => ({ type: 'QUICK_REPLY', text: `Opção ${i + 1}` }));
    assert(T.validar({ ...base, buttons: qr(3) }) === null, '3 respostas rápidas devia passar');
    assert(/3 botões/.test(T.validar({ ...base, buttons: qr(4) }) || ''), '4 respostas rápidas');
    assert(/misture/.test(T.validar({ ...base, buttons: [...qr(1), { type: 'URL', text: 'Site', url: 'https://x.ao' }] }) || ''), 'mistura de tipos');
    assert(/http/.test(T.validar({ ...base, buttons: [{ type: 'URL', text: 'Site', url: 'x.ao' }] }) || ''), 'url inválido');
    assert(T.validar({ ...base, buttons: [{ type: 'URL', text: 'Site', url: 'https://x.ao' }, { type: 'PHONE_NUMBER', text: 'Ligar', phone_number: '+244923000000' }] }) === null, '2 botões de ação válidos');
});

console.log('\n=== Conversão para os componentes da Meta e de volta ===\n');

test('componentes gerados têm a forma que a Meta espera', () => {
    const c = T.componentesDe({ ...base, header: { format: 'TEXT', text: 'Promoção' }, footer: 'Responda PARAR para sair', buttons: [{ type: 'QUICK_REPLY', text: 'Quero' }] });
    const tipos = c.map((x: any) => x.type);
    assert(JSON.stringify(tipos) === JSON.stringify(['HEADER', 'BODY', 'FOOTER', 'BUTTONS']), `ordem/tipos errados: ${tipos}`);
    const corpo = c.find((x: any) => x.type === 'BODY');
    assert(corpo.example?.body_text?.[0]?.[0] === 'Ana', 'exemplo do corpo em falta');
    assert(c.find((x: any) => x.type === 'BUTTONS').buttons[0].type === 'QUICK_REPLY', 'botão mal convertido');
});

test('ida e volta (componentes → entrada) mantém o conteúdo', () => {
    const c = T.componentesDe({ ...base, header: { format: 'IMAGE', exemplo: 'https://x.ao/foto.jpg' }, footer: 'Obrigado', buttons: [{ type: 'URL', text: 'Ver', url: 'https://x.ao' }] });
    const e = T.entradaDe(c);
    assert(e.body === base.body && e.footer === 'Obrigado', 'corpo/rodapé perdidos');
    assert(e.header?.format === 'IMAGE' && e.header.exemplo === 'https://x.ao/foto.jpg', 'cabeçalho perdido');
    assert(e.buttons?.[0].url === 'https://x.ao', 'botão perdido');
});

console.log('\n=== Texto equivalente (canal sem templates) ===\n');

test('variáveis substituídas e estrutura legível', () => {
    const c = T.componentesDe({ ...base, body: 'Olá {{1}}, o seu pedido {{2}} está pronto.', exemplos: ['Ana', '123'], header: { format: 'TEXT', text: 'Residencial Paraíso' }, footer: 'Obrigado pela preferência', buttons: [{ type: 'QUICK_REPLY', text: 'Confirmar' }, { type: 'QUICK_REPLY', text: 'Cancelar' }] });
    const { texto } = T.renderizarTexto(c, ['Carlos', '2026/44']);
    assert(texto.includes('*Residencial Paraíso*'), 'cabeçalho em falta');
    assert(texto.includes('Olá Carlos, o seu pedido 2026/44 está pronto.'), `variáveis não substituídas: ${texto}`);
    assert(texto.includes('_Obrigado pela preferência_'), 'rodapé em falta');
    assert(texto.includes('1 - Confirmar') && texto.includes('2 - Cancelar'), 'botões não numerados');
});

test('cabeçalho multimédia é devolvido à parte para ser enviado como anexo', () => {
    const c = T.componentesDe({ ...base, header: { format: 'IMAGE', exemplo: 'https://x.ao/promo.jpg' } });
    const r = T.renderizarTexto(c, ['Ana']);
    assert(r.media?.tipo === 'image' && r.media.url === 'https://x.ao/promo.jpg', `media não devolvida: ${JSON.stringify(r.media)}`);
});

test('botões de link e telefone aparecem com o destino', () => {
    const c = T.componentesDe({ ...base, buttons: [{ type: 'URL', text: 'Ver preços', url: 'https://x.ao/precos' }, { type: 'PHONE_NUMBER', text: 'Ligar', phone_number: '+244923000000' }] });
    const { texto } = T.renderizarTexto(c, ['Ana']);
    assert(texto.includes('https://x.ao/precos') && texto.includes('+244923000000'), `destinos em falta: ${texto}`);
});

console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
if (failed) { falhas.forEach(f => console.log('  - ' + f)); process.exit(1); }
