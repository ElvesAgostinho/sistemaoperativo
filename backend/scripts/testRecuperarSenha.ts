/**
 * Testes da recuperação de palavra-passe.
 *
 * É a porta de entrada de quem já não consegue entrar: tem de funcionar sempre,
 * e tem de ser chata para quem anda a tentar adivinhar contas alheias. Por isso
 * o que aqui se verifica é sobretudo o comportamento perante o abuso:
 *  - a resposta é igual quer o email exista ou não (senão entrega a lista de
 *    quem tem conta a quem andar a experimentar endereços);
 *  - o link só serve uma vez e expira;
 *  - há um limite de pedidos seguidos.
 *
 * Uso: npx ts-node scripts/testRecuperarSenha.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import path from 'path';
import express from 'express';

// ============================================================
// Supabase de mentira: contas, códigos de recuperação e perfis
// ============================================================
const contas: Record<string, { id: string; password: string; confirmado: boolean }> = {};
const codigos: Record<string, { email: string; usado: boolean; expiraEm: number }> = {};
const perfis: any[] = [];
let seqCodigo = 1;

const emailsEnviados: { para: string; assunto: string; corpo: string }[] = [];
let smtpFunciona = true;

const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });

const tabelaPerfis = () => ({
    select: () => ({
        eq: (_c: string, val: any) => ({
            maybeSingle: async () => ({ data: perfis.find(p => p.email === val) || null, error: null })
        })
    })
});

const adminApi = {
    generateLink: async ({ type, email }: any) => {
        const conta = contas[String(email).toLowerCase()];
        if (!conta) return { data: null, error: { message: 'User not found' } };
        const token = `tok-${seqCodigo++}`;
        codigos[token] = { email: String(email).toLowerCase(), usado: false, expiraEm: Date.now() + 60 * 60 * 1000 };
        return { data: { properties: { hashed_token: token, action_link: `https://exemplo/${type}/${token}` } }, error: null };
    },
    updateUserById: async (id: string, patch: any) => {
        const conta = Object.values(contas).find(c => c.id === id);
        if (conta && patch.email_confirm) conta.confirmado = true;
        return { error: null };
    }
};

let sessaoAtual: { email: string } | null = null;

const clienteSupabase = () => ({
    from: (t: string) => (t === 'perfis' ? tabelaPerfis() : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    auth: {
        admin: adminApi,
        verifyOtp: async ({ token_hash }: any) => {
            const c = codigos[String(token_hash)];
            if (!c || c.usado || c.expiraEm < Date.now()) return { data: null, error: { message: 'Token invalid or expired' } };
            c.usado = true;
            sessaoAtual = { email: c.email };
            return { data: { session: { access_token: `sessao-de-${c.email}` }, user: { id: contas[c.email].id, email: c.email } }, error: null };
        },
        updateUser: async ({ password }: any) => {
            if (!sessaoAtual) return { error: { message: 'Sem sessão' } };
            contas[sessaoAtual.email].password = password;
            return { error: null };
        },
        signUp: async () => ({ data: { user: null }, error: { message: 'não usado neste teste' } }),
        signInWithPassword: async ({ email, password }: any) => {
            const c = contas[String(email).toLowerCase()];
            if (!c || c.password !== password) return { data: null, error: { message: 'Invalid login credentials' } };
            if (!c.confirmado) return { data: null, error: { message: 'Email not confirmed' } };
            return { data: { user: { id: c.id }, session: { access_token: 'x' } }, error: null };
        }
    },
    rpc: async () => ({ data: [], error: null })
});

const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({
    supabase: clienteSupabase(), supabaseAdmin: clienteSupabase(), getSupabase: () => clienteSupabase()
}, supaPath);

const sjsPath = require.resolve('@supabase/supabase-js');
require.cache[sjsPath] = fake({ createClient: () => clienteSupabase() }, sjsPath);

const emailPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'EmailService'));
require.cache[emailPath] = fake({ EmailService: {
    isConfigured: async () => true,
    enviarEmailPersonalizado: async (para: string, assunto: string, corpo: string) => {
        if (!smtpFunciona) return false;
        emailsEnviados.push({ para, assunto, corpo });
        return true;
    }
} }, emailPath);

const aiPath = require.resolve(path.join(__dirname, '..', 'src', 'services', 'AIRouterService'));
require.cache[aiPath] = fake({ rotearEExecutar: async () => ({}) }, aiPath);
const authMwPath = require.resolve(path.join(__dirname, '..', 'src', 'middleware', 'authMiddleware'));
require.cache[authMwPath] = fake({ requireAuth: (_r: any, _s: any, n: any) => n() }, authMwPath);

const authRoutes = require(path.join(__dirname, '..', 'src', 'api', 'authRoutes')).default;

// ============================================================
// Servidor de teste
// ============================================================
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
const servidor = app.listen(0);
const PORTA = (servidor.address() as any).port;
const B = `http://127.0.0.1:${PORTA}`;

const chamar = async (rota: string, corpo: any) => {
    const r = await fetch(B + rota, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    return [r.status, await r.json()] as [number, any];
};

// Endereco proprio por teste: a trava de "3 pedidos por email em 15 minutos" vive
// no servidor e nao se reinicia entre testes — com um endereco fixo, os testes
// acabavam travados uns pelos outros e pareciam falhas do codigo.
let n = 0;
let ANA = '';
let NC = '';

let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };

async function test(nome: string, fn: () => Promise<void>) {
    for (const k of Object.keys(contas)) delete contas[k];
    for (const k of Object.keys(codigos)) delete codigos[k];
    perfis.length = 0; emailsEnviados.length = 0; seqCodigo = 1; sessaoAtual = null; smtpFunciona = true;
    n++;
    ANA = `ana${n}@empresa.ao`;
    NC = `naoconfirmado${n}@empresa.ao`;
    contas[ANA] = { id: `user-ana-${n}`, password: 'antiga123', confirmado: true };
    contas[NC] = { id: `user-nc-${n}`, password: 'antiga123', confirmado: false };
    perfis.push({ id: `user-ana-${n}`, email: ANA, empresa_id: 'empresa-1' });
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}

/** O link que foi parar ao email, tal como a pessoa o recebe. */
const codigoDoEmail = () => {
    const m = (emailsEnviados[0]?.corpo || '').match(/codigo=([^"&\s]+)/);
    return m ? decodeURIComponent(m[1]) : '';
};

(async () => {
    console.log('\n=== Pedir a recuperação ===\n');

    await test('envia o email com um link para redefinir', async () => {
        const [s, d] = await chamar('/api/auth/recuperar-senha', { email: ANA });
        assert(s === 200 && d.success, `devia aceitar: ${JSON.stringify(d)}`);
        assert(emailsEnviados.length === 1, `devia enviar 1 email, enviou ${emailsEnviados.length}`);
        assert(emailsEnviados[0].para === ANA, `destinatário errado: ${emailsEnviados[0].para}`);
        assert(/redefinir-senha\?codigo=/.test(emailsEnviados[0].corpo), `o email devia trazer o link: ${emailsEnviados[0].corpo.slice(0, 200)}`);
    });

    await test('a resposta é igual para um email que não existe', async () => {
        const [s1, d1] = await chamar('/api/auth/recuperar-senha', { email: ANA });
        emailsEnviados.length = 0;
        const [s2, d2] = await chamar('/api/auth/recuperar-senha', { email: 'ninguem@lado-nenhum.ao' });
        assert(s1 === s2, `estados diferentes entregam quem tem conta: ${s1} vs ${s2}`);
        assert(d1.message === d2.message, `mensagens diferentes: "${d1.message}" vs "${d2.message}"`);
        assert(emailsEnviados.length === 0, 'não devia enviar nada para um email que não existe');
    });

    await test('o email mal escrito é recusado antes de qualquer coisa', async () => {
        const [s, d] = await chamar('/api/auth/recuperar-senha', { email: 'isto-nao-e-email' });
        assert(s === 400 && /email/i.test(d.error || ''), `devia recusar: ${s} ${JSON.stringify(d)}`);
        assert(emailsEnviados.length === 0, 'não devia enviar nada');
    });

    await test('insistir muitas vezes é travado', async () => {
        for (let i = 0; i < 3; i++) await chamar('/api/auth/recuperar-senha', { email: 'insistente@empresa.ao' });
        const [s, d] = await chamar('/api/auth/recuperar-senha', { email: 'insistente@empresa.ao' });
        assert(s === 429, `o 4º pedido devia ser travado, deu ${s}`);
        assert(/15 minutos|pouco/i.test(d.error || ''), `devia explicar porquê: ${d.error}`);
    });

    await test('se o correio falhar, a pessoa não fica a pensar que recebeu', async () => {
        smtpFunciona = false;
        const [s, d] = await chamar('/api/auth/recuperar-senha', { email: ANA });
        // A resposta continua neutra (não se revela nada), mas o servidor regista o erro.
        assert(s === 200 && d.success, 'a resposta ao visitante mantém-se neutra');
        assert(emailsEnviados.length === 0, 'nada saiu, como esperado');
    });

    console.log('\n=== Escolher a nova palavra-passe ===\n');

    await test('o código do email troca a palavra-passe', async () => {
        await chamar('/api/auth/recuperar-senha', { email: ANA });
        const [s, d] = await chamar('/api/auth/redefinir-senha', { codigo: codigoDoEmail(), password: 'novaSegura1' });
        assert(s === 200 && d.success, `devia aceitar: ${JSON.stringify(d)}`);
        assert(contas[ANA].password === 'novaSegura1', 'a palavra-passe devia ter mudado');
    });

    await test('o mesmo link não serve duas vezes', async () => {
        await chamar('/api/auth/recuperar-senha', { email: ANA });
        const codigo = codigoDoEmail();
        await chamar('/api/auth/redefinir-senha', { codigo, password: 'primeira123' });
        const [s, d] = await chamar('/api/auth/redefinir-senha', { codigo, password: 'segunda123' });
        assert(s === 400 && /usado|expirou/i.test(d.error || ''), `devia recusar a segunda vez: ${s} ${JSON.stringify(d)}`);
        assert(contas[ANA].password === 'primeira123', 'a segunda tentativa não podia mudar nada');
    });

    await test('um código inventado não serve', async () => {
        const [s, d] = await chamar('/api/auth/redefinir-senha', { codigo: 'inventado', password: 'qualquer123' });
        assert(s === 400 && /link/i.test(d.error || ''), `devia recusar: ${s} ${JSON.stringify(d)}`);
    });

    await test('um link expirado não serve', async () => {
        await chamar('/api/auth/recuperar-senha', { email: ANA });
        const codigo = codigoDoEmail();
        codigos[codigo].expiraEm = Date.now() - 1000;      // fez uma hora
        const [s] = await chamar('/api/auth/redefinir-senha', { codigo, password: 'qualquer123' });
        assert(s === 400, `devia recusar um link velho, deu ${s}`);
    });

    await test('palavra-passe curta é recusada com a razão', async () => {
        await chamar('/api/auth/recuperar-senha', { email: ANA });
        const [s, d] = await chamar('/api/auth/redefinir-senha', { codigo: codigoDoEmail(), password: '123' });
        assert(s === 400 && /6/.test(d.error || ''), `devia dizer o mínimo: ${JSON.stringify(d)}`);
        assert(contas[ANA].password === 'antiga123', 'não podia mudar nada');
    });

    await test('sem código não se muda nada', async () => {
        const [s] = await chamar('/api/auth/redefinir-senha', { password: 'qualquer123' });
        assert(s === 400, `devia recusar, deu ${s}`);
    });

    console.log('\n=== Depois de redefinir ===\n');

    await test('a palavra-passe nova entra e a antiga deixa de entrar', async () => {
        await chamar('/api/auth/recuperar-senha', { email: ANA });
        await chamar('/api/auth/redefinir-senha', { codigo: codigoDoEmail(), password: 'aNovaDeTodas' });
        const cliente = clienteSupabase();
        const nova = await cliente.auth.signInWithPassword({ email: ANA, password: 'aNovaDeTodas' });
        const velha = await cliente.auth.signInWithPassword({ email: ANA, password: 'antiga123' });
        assert(!nova.error, 'a nova devia entrar');
        assert(!!velha.error, 'a antiga devia deixar de entrar');
    });

    await test('quem nunca confirmou o email fica com a conta confirmada ao redefinir', async () => {
        // Sem isto, a pessoa redefinia a palavra-passe e continuava presa no
        // "confirme a sua conta" — sem nunca perceber porquê.
        perfis.push({ id: `user-nc-${n}`, email: NC, empresa_id: 'empresa-1' });
        await chamar('/api/auth/recuperar-senha', { email: NC });
        const [s] = await chamar('/api/auth/redefinir-senha', { codigo: codigoDoEmail(), password: 'agoraSim123' });
        assert(s === 200, `devia aceitar, deu ${s}`);
        assert(contas[NC].confirmado === true, 'a conta devia ficar confirmada');
        const cliente = clienteSupabase();
        const r = await cliente.auth.signInWithPassword({ email: NC, password: 'agoraSim123' });
        assert(!r.error, `devia conseguir entrar: ${r.error?.message}`);
    });

    servidor.unref();
    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (falhas.length) console.log('Falhou:\n  - ' + falhas.join('\n  - '));
    process.exit(failed === 0 ? 0 : 1);
})();
