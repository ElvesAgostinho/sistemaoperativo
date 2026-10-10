/**
 * Testes do registo de auditoria.
 *
 * O ecrã "Ver auditoria" existia e funcionava — e estava sempre vazio. Estava
 * vazio porque em todo o sistema havia UMA acção que escrevia lá: delegar uma
 * conversa a um agente. Na produção do cliente: 97 conversas, 0 conversas
 * delegadas, 0 registos. Tudo o resto (pausar o bot, trocar o fluxo, pôr uma
 * etiqueta, corrigir a ficha) acontecia sem deixar rasto.
 *
 * Havia ainda uma armadilha por baixo: o registo era gravado sem a empresa, a
 * contar com um gatilho na base de dados que a ia buscar à conversa — mas a
 * leitura filtra por empresa, por isso o que ficasse em branco desaparecia.
 *
 * Uso: npx ts-node scripts/testAuditoria.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import path from 'path';

// ---------- base de dados em memória ----------
const db: Record<string, any[]> = {};
const tabela = (t: string) => (db[t] = db[t] || []);
let seq = 100;
let erroDeEscrita: any = null;
let erroDeLeitura: Record<string, any> = {};

const bate = (row: any, f: any[]) => f.every(x => {
    const v = row[x.col];
    switch (x.op) {
        case 'eq': return String(v) === String(x.val);
        case 'in': return x.val.map(String).includes(String(v));
        default: return true;
    }
});

function mockFrom(t: string) {
    const filtros: any[] = [];
    let op = 'select'; let payload: any = null; let limite = Infinity;
    let ordem: { col: string; asc: boolean } | null = null;
    const self: any = {};
    self.select = () => self;
    self.order = (col: string, o: any) => { ordem = { col, asc: !!o?.ascending }; return self; };
    self.limit = (n: number) => { limite = n; return self; };
    self.insert = (p: any) => { op = 'insert'; payload = p; return self; };
    self.update = (p: any) => { op = 'update'; payload = p; return self; };
    for (const o of ['eq', 'in'] as const) {
        self[o] = (col: string, val: any) => { filtros.push({ col, val, op: o }); return self; };
    }
    const correr = () => {
        if (op === 'insert' && erroDeEscrita) return { data: null, error: erroDeEscrita };
        if (op === 'select' && erroDeLeitura[t]) return { data: null, error: erroDeLeitura[t] };
        const linhas = tabela(t);
        if (op === 'insert') {
            const novos = (Array.isArray(payload) ? payload : [payload]).map((p, i) => ({
                id: p.id ?? `log-${seq++}`,
                // A base de dados carimba a hora; aqui simula-se, com os registos
                // a entrar por ordem para se poder testar a ordenação.
                created_at: p.created_at ?? new Date(Date.now() + seq * 1000 + i).toISOString(),
                ...p,
            }));
            linhas.push(...novos);
            return { data: novos, error: null };
        }
        if (op === 'update') {
            const alvo = linhas.filter(l => bate(l, filtros));
            alvo.forEach(l => Object.assign(l, payload));
            return { data: alvo, error: null };
        }
        let achados = linhas.filter(l => bate(l, filtros)).map(l => JSON.parse(JSON.stringify(l)));
        if (ordem) {
            const o = ordem as { col: string; asc: boolean };
            achados.sort((a, b) => (a[o.col] < b[o.col] ? -1 : 1) * (o.asc ? 1 : -1));
        }
        return { data: achados.slice(0, limite), error: null };
    };
    const um = () => { const r = correr(); const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data; return { data: d, error: r.error }; };
    self.single = () => Promise.resolve(um());
    self.maybeSingle = () => Promise.resolve(um());
    self.then = (res: any, rej: any) => Promise.resolve(correr()).then(res, rej);
    return self;
}

const mockSupabase: any = { from: mockFrom };
const fake = (e: any, p: string): any => ({ id: p, filename: p, loaded: true, exports: e, children: [], paths: [], parent: null });
const supaPath = require.resolve(path.join(__dirname, '..', 'src', 'lib', 'supabaseClient'));
require.cache[supaPath] = fake({ supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase }, supaPath);

const { AuditoriaService } = require(path.join(__dirname, '..', 'src', 'services', 'AuditoriaService'));

const EMPRESA = 'empresa-1';
const OUTRA = 'empresa-2';
const CONV = 'conv-1';
let passed = 0, failed = 0; const falhas: string[] = [];
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
const registos = () => tabela('wa_audit_logs');

async function test(nome: string, fn: () => Promise<void>) {
    for (const t of Object.keys(db)) delete db[t];
    erroDeEscrita = null; erroDeLeitura = {}; seq = 100;
    tabela('perfis').push(
        { id: 'dono', nome: 'Elves', empresa_id: EMPRESA },
        { id: 'alexandre', nome: 'Alexandre', empresa_id: EMPRESA },
    );
    const antes = console.error; const antesWarn = console.warn;
    console.error = () => { }; console.warn = () => { };
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
    finally { console.error = antes; console.warn = antesWarn; }
}

(async () => {
    console.log('\n=== O que fica guardado ===\n');

    await test('a empresa vai sempre escrita, não à espera de um gatilho', async () => {
        // Era este o buraco: o registo entrava sem empresa, a contar que a base
        // de dados a fosse buscar à conversa. A leitura filtra por empresa, por
        // isso o que ficasse em branco nunca mais aparecia.
        await AuditoriaService.registar({
            empresaId: EMPRESA, quemId: 'dono', accao: 'bot_pausado',
            conversationId: CONV, detalhes: 'desligou o bot.',
        });
        assert(registos().length === 1, 'devia ficar 1 registo');
        assert(registos()[0].empresa_id === EMPRESA, `a empresa ficou em branco: ${JSON.stringify(registos()[0])}`);
    });

    await test('guarda quem, o quê e a explicação', async () => {
        await AuditoriaService.registar({
            empresaId: EMPRESA, quemId: 'dono', accao: 'fluxo_escolhido',
            conversationId: CONV, alvoTipo: 'fluxo', alvoId: 29,
            detalhes: 'pos o fluxo "Reservas" a atender este cliente.',
            extra: { nome: 'Reservas' },
        });
        const r = registos()[0];
        assert(r.performed_by === 'dono', 'falta quem fez');
        assert(r.action === 'fluxo_escolhido', 'falta o que foi feito');
        assert(r.alvo_id === '29', `o alvo devia ficar como texto: ${r.alvo_id}`);
        assert(/Reservas/.test(r.details), 'a explicação tem de dizer o nome, não só o número');
        assert(r.extra?.nome === 'Reservas', 'o extra tem de ficar');
    });

    await test('uma acção sem conversa também fica registada', async () => {
        // Mudar as permissões de alguém não é de nenhuma conversa, e antes a
        // coluna era obrigatória.
        await AuditoriaService.registar({
            empresaId: EMPRESA, quemId: 'dono', accao: 'permissoes_alteradas',
            alvoUtilizador: 'alexandre', alvoTipo: 'utilizador', alvoId: 'alexandre',
            detalhes: 'alterou as permissões de Alexandre.',
        });
        assert(registos().length === 1, 'devia ficar registada');
        assert(registos()[0].conversation_id === null, 'sem conversa é legítimo');
    });

    await test('sem empresa não grava — e diz porquê', async () => {
        // Gravar sem empresa era gravar para o vazio: ninguém o voltava a ler.
        await AuditoriaService.registar({
            empresaId: null, quemId: 'dono', accao: 'bot_pausado', detalhes: 'x',
        });
        assert(registos().length === 0, 'não pode gravar um registo que ninguém vai ler');
    });

    console.log('\n=== Nunca deita o trabalho abaixo ===\n');

    await test('uma falha a registar não rebenta a operação', async () => {
        // Se o cliente está à espera que o bot pare, o bot tem de parar — mesmo
        // que o registo falhe.
        erroDeEscrita = { message: 'tabela em manutenção' };
        let rebentou = false;
        try {
            await AuditoriaService.registar({
                empresaId: EMPRESA, quemId: 'dono', accao: 'bot_pausado',
                conversationId: CONV, detalhes: 'desligou o bot.',
            });
        } catch { rebentou = true; }
        assert(!rebentou, 'registar nunca pode atirar uma excepção para cima');
    });

    console.log('\n=== Ler a auditoria de uma conversa ===\n');

    await test('mostra o que aconteceu, do mais recente para trás', async () => {
        for (const d of ['primeiro', 'segundo', 'terceiro']) {
            await AuditoriaService.registar({
                empresaId: EMPRESA, quemId: 'dono', accao: 'bot_pausado',
                conversationId: CONV, detalhes: d,
            });
        }
        const r = await AuditoriaService.daConversa(EMPRESA, CONV);
        assert(r.length === 3, `deviam ser 3, são ${r.length}`);
        assert(r[0].details === 'terceiro', `o mais recente primeiro: ${r.map((x: any) => x.details).join(', ')}`);
    });

    await test('troca os identificadores pelos nomes das pessoas', async () => {
        // Sem isto a auditoria eram linhas de uuid, que não respondem a "quem foi".
        await AuditoriaService.registar({
            empresaId: EMPRESA, quemId: 'dono', accao: 'conversa_delegada',
            conversationId: CONV, alvoUtilizador: 'alexandre',
            detalhes: 'passou esta conversa a um colega.',
        });
        const r = await AuditoriaService.daConversa(EMPRESA, CONV);
        assert(r[0].performed_by_name === 'Elves', `devia dizer Elves: ${r[0].performed_by_name}`);
        assert(r[0].target_user_name === 'Alexandre', `devia dizer Alexandre: ${r[0].target_user_name}`);
    });

    await test('o que o sistema fez sozinho diz "Sistema"', async () => {
        await AuditoriaService.registar({
            empresaId: EMPRESA, quemId: null, accao: 'fluxo_disparado',
            conversationId: CONV, detalhes: 'correu o fluxo de seguimento.',
        });
        const r = await AuditoriaService.daConversa(EMPRESA, CONV);
        assert(r[0].performed_by_name === 'Sistema', `devia dizer Sistema: ${r[0].performed_by_name}`);
    });

    await test('quem já saiu da empresa não vira um buraco', async () => {
        await AuditoriaService.registar({
            empresaId: EMPRESA, quemId: 'ja-saiu', accao: 'bot_pausado',
            conversationId: CONV, detalhes: 'desligou o bot.',
        });
        const r = await AuditoriaService.daConversa(EMPRESA, CONV);
        assert(r[0].performed_by_name === 'Utilizador removido', `${r[0].performed_by_name}`);
    });

    await test('uma conversa sem nada devolve uma lista vazia, não um erro', async () => {
        const r = await AuditoriaService.daConversa(EMPRESA, 'conv-sem-nada');
        assert(Array.isArray(r) && r.length === 0, 'devia ser uma lista vazia');
    });

    console.log('\n=== Cada empresa só vê o que é seu ===\n');

    await test('a auditoria de uma empresa não aparece na outra', async () => {
        await AuditoriaService.registar({
            empresaId: EMPRESA, quemId: 'dono', accao: 'bot_pausado',
            conversationId: CONV, detalhes: 'da empresa 1',
        });
        await AuditoriaService.registar({
            empresaId: OUTRA, quemId: 'outro', accao: 'bot_pausado',
            conversationId: CONV, detalhes: 'da empresa 2',
        });
        const r = await AuditoriaService.daConversa(EMPRESA, CONV);
        assert(r.length === 1, `devia ver só o seu, viu ${r.length}`);
        assert(r[0].details === 'da empresa 1', 'viu o da outra empresa');
    });

    await test('o mesmo na vista da empresa toda', async () => {
        await AuditoriaService.registar({ empresaId: EMPRESA, quemId: 'dono', accao: 'bot_pausado', detalhes: 'meu' });
        await AuditoriaService.registar({ empresaId: OUTRA, quemId: 'outro', accao: 'bot_pausado', detalhes: 'dele' });
        const r = await AuditoriaService.daEmpresa(EMPRESA);
        assert(r.length === 1 && r[0].details === 'meu', `fuga entre empresas: ${JSON.stringify(r.map((x: any) => x.details))}`);
    });

    console.log('\n=== A vista da empresa toda ===\n');

    await test('junta o que é de conversas e o que não é', async () => {
        await AuditoriaService.registar({ empresaId: EMPRESA, quemId: 'dono', accao: 'bot_pausado', conversationId: CONV, detalhes: 'de uma conversa' });
        await AuditoriaService.registar({ empresaId: EMPRESA, quemId: 'dono', accao: 'permissoes_alteradas', alvoUtilizador: 'alexandre', detalhes: 'de ninguém em especial' });
        const r = await AuditoriaService.daEmpresa(EMPRESA);
        assert(r.length === 2, `deviam ser 2, são ${r.length}`);
    });

    await test('um erro de leitura é dito, não escondido', async () => {
        // Devolver uma lista vazia quando a leitura falha fazia o ecrã dizer
        // "não há nada" — que é exactamente a confusão que já custou uma vez.
        erroDeLeitura['wa_audit_logs'] = { message: 'tabela em falta' };
        let erro = '';
        try { await AuditoriaService.daEmpresa(EMPRESA); } catch (e: any) { erro = e.message; }
        assert(/tabela em falta/.test(erro), `devia dar erro: "${erro}"`);
    });

    console.log('\n=== O portugues que o cliente le ===\n');

    await test('os textos que chegam ao cliente levam os acentos', async () => {
        // Estes textos aparecem no ecra. Escrevi-os sem acentos nos scripts que
        // os inseriram no codigo, para fugir a problemas de codificacao, e o
        // resultado foi "desligou o atendimento automatico" a aparecer na
        // producao. Um sistema que se vende a empresas nao se apresenta assim.
        //
        // A primeira versao deste teste procurava na MESMA linha do `detalhes:`
        // e deixava passar tudo o que estivesse na linha a seguir — que era
        // justamente o caso. Agora olha-se para cada texto entre aspas.
        const fs = require('fs');
        const ficheiros = [
            path.join(__dirname, '..', 'src', 'api', 'whatsappRoutes.ts'),
            path.join(__dirname, '..', 'src', 'api', 'userRoutes.ts'),
            path.join(__dirname, '..', 'src', 'api', 'etiquetaRoutes.ts'),
            path.join(__dirname, '..', 'src', 'middleware', 'permissaoMiddleware.ts'),
            path.join(__dirname, '..', 'src', 'services', 'PermissaoService.ts'),
        ];

        // Palavras que em portugues levam acento ou cedilha de certeza, e que
        // aparecem nestes textos.
        const semAcento = [
            'automatico', 'permissoes', 'permissao', 'accoes', 'accao', 'modulos',
            'proprias', 'proprio', 'nao ', 'ultima', 'numero', 'informacao',
            'ja nao', 'pos o ', 'repos ', 'sera ', 'esta e ', 'voce',
        ];

        const culpados: string[] = [];
        for (const f of ficheiros) {
            const linhas = fs.readFileSync(f, 'utf8').split('\n');
            linhas.forEach((linha: string, n: number) => {
                // Comentarios e logs do servidor nao sao vistos por ninguem de fora.
                const limpa = linha.trim();
                if (limpa.startsWith('//') || limpa.startsWith('*') || limpa.startsWith('/*')) return;
                if (/console\.(log|warn|error)/.test(linha)) return;

                // Cada texto entre aspas simples ou crases nesta linha.
                const textos = [
                    ...linha.matchAll(/'([^'\\]{12,})'/g),
                    ...linha.matchAll(/`([^`\\]{12,})`/g),
                ].map(m => m[1]);

                for (const bruto of textos) {
                    // O regex acima tambem apanha o CODIGO entre dois literais
                    // da mesma linha (", requireAuth, exigirPermissao("). Uma
                    // frase em portugues nao tem parenteses nem chavetas; o que
                    // os tiver nao e texto para ninguem ler.
                    const t = bruto.replace(/\$\{[^}]*\}/g, '');
                    if (/[(){}\[\]=<>;\/\|]/.test(t)) continue;
                    if (!/^[A-Za-zÀ-ÿ]/.test(t.trim())) continue;
                    if (!/\s/.test(t)) continue;
                    const baixo = t.toLowerCase();
                    for (const palavra of semAcento) {
                        if (baixo.includes(palavra)) {
                            culpados.push(`${path.basename(f)}:${n + 1} — "${t.slice(0, 64)}"`);
                            return;
                        }
                    }
                }
            });
        }

        assert(culpados.length === 0, 'texto sem acentos a chegar ao cliente:\n      ' + culpados.join('\n      '));
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (falhas.length) console.log('Falhou:\n  - ' + falhas.join('\n  - '));
    process.exit(failed === 0 ? 0 : 1);
})();
