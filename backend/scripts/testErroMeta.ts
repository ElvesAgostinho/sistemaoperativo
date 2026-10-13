/**
 * Os erros da Meta ditos em português, e o nó cego do webhook.
 *
 * O cliente viu no painel, a vermelho: "Error validating access token: The
 * session is invalid because the user logged out." Numa página onde ninguém
 * tinha saído de lado nenhum. A mensagem está correcta e não serve de nada a
 * quem está a configurar um número de WhatsApp.
 *
 * Uso: npx ts-node scripts/testErroMeta.ts   (a partir de backend/)
 */
import path from 'path';

const { ErroMeta } = require(path.join(__dirname, '..', 'src', 'services', 'ErroMeta'));

let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };

function test(nome: string, fn: () => void) {
    try { fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}

(async () => {
    console.log('\n=== O erro que o cliente apanhou ===\n');

    test('o token temporário é explicado, e diz-se como fazer o permanente', () => {
        const r = ErroMeta.explicar({
            message: 'Error validating access token: The session is invalid because the user logged out.',
            code: 190, error_subcode: 467, type: 'OAuthException',
        }, 400);

        assert(/tempor[áa]rio/i.test(r.texto), `devia dizer que o token é temporário: ${r.texto}`);
        assert(/24 horas/.test(r.texto), `devia dizer quanto dura: ${r.texto}`);
        assert(!!r.comoResolver, 'tem de dizer o que fazer');
        assert(/Utilizadores de sistema/i.test(r.comoResolver), `devia indicar o caminho: ${r.comoResolver}`);
        assert(/Nunca expira/i.test(r.comoResolver), 'devia dizer qual a validade a escolher');
    });

    test('nada do que se mostra está em inglês', () => {
        const linha = ErroMeta.numaLinha({
            message: 'Error validating access token: The session is invalid because the user logged out.',
            code: 190, error_subcode: 467,
        }, 400);

        // A mensagem original pode ir no fim, entre aspas, para quem a procurar.
        const semOriginal = linha.split('(a Meta disse:')[0];
        for (const palavra of ['Error', 'invalid', 'session', 'logged out', 'token error']) {
            assert(!new RegExp(palavra, 'i').test(semOriginal.replace(/token/gi, '')),
                `"${palavra}" não devia aparecer na explicação: ${semOriginal}`);
        }
    });

    test('a mensagem original fica lá, para quem a for procurar', () => {
        const linha = ErroMeta.numaLinha({ message: 'Error validating access token', code: 190, error_subcode: 467 });
        assert(linha.includes('Error validating access token'), `devia guardar a original: ${linha}`);
    });

    console.log('\n=== Os outros erros de configuração ===\n');

    test('falta de permissão diz que o token tem de ser gerado OUTRA VEZ', () => {
        // É a parte que engana: dar o activo ao utilizador de sistema não
        // conserta um token já criado. Sem isto, a pessoa dá a permissão, tenta
        // de novo com o mesmo token, e apanha o mesmo erro.
        const r = ErroMeta.explicar({ message: 'Permissions error', code: 200 }, 403);
        assert(/permiss[ãa]o/i.test(r.texto), r.texto);
        assert(/outra vez|novamente/i.test(r.comoResolver || ''), `devia mandar gerar de novo: ${r.comoResolver}`);
    });

    test('identificador errado fala dos DOIS ids, que é o engano comum', () => {
        const r = ErroMeta.explicar({ message: 'Unsupported get request. Object does not exist', code: 803 }, 400);
        assert(/n[úu]mero de telefone/i.test(r.comoResolver || ''), r.comoResolver || '');
        assert(/WhatsApp Business/i.test(r.comoResolver || ''), r.comoResolver || '');
    });

    test('um erro desconhecido passa como veio, sem inventar', () => {
        const r = ErroMeta.explicar({ message: 'Algo muito especifico e novo', code: 999999 });
        assert(r.texto === 'Algo muito especifico e novo', r.texto);
        assert(!r.comoResolver, 'não se inventa uma solução para um erro que não se conhece');
    });

    test('sem resposta nenhuma, diz-se isso e o estado', () => {
        const r = ErroMeta.explicar(null, 502);
        assert(/502/.test(r.texto), r.texto);
    });

    console.log('\n=== O canal "por ligar" não envia nada ===\n');

    test('um canal pending nunca é escolhido para enviar', () => {
        // Guarda-se um canal 'pending' so para a Meta poder validar o webhook —
        // o token de acesso dele ainda nao serve. Em ultimo recurso o sistema
        // apanhava-o na mesma (`canais[0]`) e o envio falhava de certeza.
        const fs = require('fs');
        const fonte = fs.readFileSync(
            path.join(__dirname, '..', 'src', 'services', 'WhatsAppChannelManager.ts'), 'utf8',
        );
        const i = fonte.indexOf('const utilizaveis');
        assert(i > 0, 'a escolha do canal já não filtra os pendentes');
        const pedaco = fonte.slice(i, i + 400);
        assert(/status !== 'pending'/.test(pedaco), `devia excluir os pendentes: ${pedaco.slice(0, 120)}`);
        assert(!/\|\| canais\[0\]/.test(pedaco), 'não pode voltar a cair na lista toda');
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===\n`);
    if (failed) { console.log('Falharam: ' + falhas.join(', ')); process.exit(1); }
})();
