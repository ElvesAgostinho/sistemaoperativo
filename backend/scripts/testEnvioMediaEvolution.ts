/**
 * O pedido REAL que vai para a Evolution quando se envia uma imagem, um vídeo
 * ou um documento.
 *
 * Todos os outros testes trocam o sendMediaMessage por um falso — e por isso
 * ninguém viu que, desde a Evolution 2.3, o formato estava errado: os campos
 * iam dentro de `mediaMessage` (formato da v1), a Evolution respondia 400 e
 * nenhuma multimédia saía. Este teste corre a função verdadeira e só troca a
 * rede.
 *
 * Uso: npx ts-node scripts/testEnvioMediaEvolution.ts   (a partir de backend/)
 */
import path from 'path';

process.env.EVOLUTION_API_URL = 'https://evolution.exemplo.pt';
process.env.AUTHENTICATION_API_KEY = 'chave';

const canal = { id: 'evo-1', provider: 'evolution', credentials: { instanceName: 'INST_1' } };
const supa: any = { from: () => { const s: any = {}; s.select = () => s; s.eq = () => s; s.single = async () => ({ data: canal, error: null }); return s; } };

const pedidos: { url: string; corpo: any }[] = [];
(global as any).fetch = async (url: string, opts: any) => {
    pedidos.push({ url: String(url), corpo: JSON.parse(opts.body) });
    return { ok: true, status: 201, json: async () => ({ key: { id: 'x' } }) } as any;
};

const { WhatsAppChannelManager } = require(path.join(__dirname, '..', 'src', 'services', 'WhatsAppChannelManager'));

let passed = 0, failed = 0;
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
async function test(nome: string, fn: () => Promise<void>) {
    pedidos.length = 0;
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; }
}

(async () => {
    console.log('\n=== Multimédia pela Evolution ===\n');

    await test('um PDF vai com os campos SOLTOS (formato da Evolution 2.3)', async () => {
        const ok = await WhatsAppChannelManager.sendMediaMessage(supa, 'evo-1', '923 000 000',
            'data:application/pdf;base64,JVBERi0xLjQ=', 'Comprovativo.pdf', 'Comprovativo da venda');
        assert(ok === true, 'devia dar como enviado');
        const p = pedidos[0];
        assert(p.url === 'https://evolution.exemplo.pt/message/sendMedia/INST_1', p.url);
        assert(!('mediaMessage' in p.corpo), `o formato da v1 dá 400 na 2.3: ${JSON.stringify(p.corpo)}`);
        assert(p.corpo.mediatype === 'document' && p.corpo.mimetype === 'application/pdf', JSON.stringify(p.corpo));
        assert(p.corpo.media === 'JVBERi0xLjQ=', 'o base64 vai sem o prefixo data:');
        assert(p.corpo.fileName === 'Comprovativo.pdf' && p.corpo.caption === 'Comprovativo da venda', JSON.stringify(p.corpo));
        assert(p.corpo.number === '244923000000', `o número leva o indicativo: ${p.corpo.number}`);
    });

    await test('uma imagem por link vai como image, com o link', async () => {
        await WhatsAppChannelManager.sendMediaMessage(supa, 'evo-1', '244923000000', 'https://x/foto.jpg', 'foto.jpg', '');
        const c = pedidos[0].corpo;
        assert(c.mediatype === 'image' && c.media === 'https://x/foto.jpg' && !('mediaMessage' in c), JSON.stringify(c));
    });

    await test('o áudio continua a ir pelo endpoint da nota de voz', async () => {
        await WhatsAppChannelManager.sendMediaMessage(supa, 'evo-1', '244923000000', 'data:audio/ogg;base64,T2dn', 'a.ogg');
        assert(/sendWhatsAppAudio/.test(pedidos[0].url), pedidos[0].url);
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    process.exit(failed ? 1 : 0);
})();
