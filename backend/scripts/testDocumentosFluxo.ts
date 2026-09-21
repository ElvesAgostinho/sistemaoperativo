/**
 * Testes do motor de aprovações (Fase C) contra a base de dados real:
 * fluxo com duas etapas, decisão "qualquer"/"todos", rejeição, delegação,
 * cancelamento, escalonamento por prazo e checklists. Cria um documento de
 * teste na empresa indicada e apaga tudo no fim.
 *
 * Precisa de migration_documentos_fase_c.sql aplicada e de pelo menos dois
 * utilizadores na empresa.
 *
 * Uso: npx ts-node scripts/testDocumentosFluxo.ts <empresa_id>   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { supabase } from '../src/lib/supabaseClient';
import { DocumentosFluxoService } from '../src/services/DocumentosFluxoService';
import { DocumentosGovernoService, Utilizador } from '../src/services/DocumentosGovernoService';

let passed = 0, failed = 0; const falhas: string[] = [];
async function test(nome: string, fn: () => Promise<void>) {
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const EMPRESA = process.argv[2];
if (!EMPRESA) { console.error('Indique o empresa_id.'); process.exit(1); }

const TAG = 'TESTE-FLUXO-' + Date.now();
const docsCriados: string[] = [];
const fluxosCriados: number[] = [];
const checklistsCriadas: number[] = [];

async function novoDoc(ciclo = 'DRAFT', extra: any = {}): Promise<any> {
    const { data, error } = await supabase.from('documentos').insert({
        empresa_id: EMPRESA, titulo: `${TAG} ${docsCriados.length + 1}`, nome_ficheiro: 'teste.txt', mime_type: 'text/plain', tamanho: 10,
        area: 'Outros', estado: 'arquivado', ciclo, confidencialidade: 'Normal', versao_atual: 1, ...extra
    }).select('*').single();
    if (error) throw new Error(error.message);
    docsCriados.push(data.id);
    return data;
}
const recarregar = async (id: string) => (await supabase.from('documentos').select('*').eq('id', id).single()).data;
const tarefasDe = async (userId: string) => DocumentosFluxoService.minhasTarefas(EMPRESA, userId);

(async () => {
    const { data: perfis } = await supabase.from('perfis').select('id, nome, role').eq('empresa_id', EMPRESA).order('nome').limit(5);
    if (!perfis || perfis.length < 2) { console.error('Precisa de pelo menos 2 utilizadores na empresa.'); process.exit(1); }
    const [A, B, C] = perfis;
    const u = (p: any): Utilizador => ({ id: p.id, nome: p.nome, role: p.role, empresa_id: EMPRESA });
    console.log(`Utilizadores: A=${A.nome}, B=${B.nome}${C ? `, C=${C.nome}` : ''}\n`);

    console.log('=== Fluxos: validação ===\n');
    await test('etapas inválidas são recusadas com mensagem clara', async () => {
        assert(/pelo menos uma etapa/.test((await DocumentosFluxoService.validarEtapas(EMPRESA, [])).erro || ''), 'sem etapas');
        assert(/precisa de nome/.test((await DocumentosFluxoService.validarEtapas(EMPRESA, [{ aprovadores: [A.id] }])).erro || ''), 'sem nome');
        assert(/aprovador/.test((await DocumentosFluxoService.validarEtapas(EMPRESA, [{ nome: 'X', aprovadores: [] }])).erro || ''), 'sem aprovadores');
        assert(/não pertence/.test((await DocumentosFluxoService.validarEtapas(EMPRESA, [{ nome: 'X', aprovadores: ['00000000-0000-0000-0000-000000000000'] }])).erro || ''), 'aprovador de fora');
        assert(/só pode escalar se tiver prazo/.test((await DocumentosFluxoService.validarEtapas(EMPRESA, [{ nome: 'X', aprovadores: [A.id], escalar_para: B.id }])).erro || ''), 'escalar sem prazo');
        const ok = await DocumentosFluxoService.validarEtapas(EMPRESA, [{ nome: ' Chefia ', aprovadores: [A.id, A.id], modo: 'x', prazo_horas: '24' }]);
        assert(!ok.erro && ok.etapas![0].nome === 'Chefia' && ok.etapas![0].aprovadores.length === 1 && ok.etapas![0].modo === 'qualquer' && ok.etapas![0].prazo_horas === 24, `normalização: ${JSON.stringify(ok)}`);
    });

    const { data: fluxo2 } = await supabase.from('documento_fluxos').insert({
        empresa_id: EMPRESA, nome: `${TAG} duas etapas`, etapas: [
            { nome: 'Chefia', aprovadores: [A.id], modo: 'qualquer', prazo_horas: 48, escalar_para: null },
            { nome: 'Direção', aprovadores: [A.id, B.id], modo: 'todos', prazo_horas: null, escalar_para: null },
        ], ativar_ao_aprovar: true, criado_por: A.id
    }).select('*').single();
    fluxosCriados.push(fluxo2.id);

    console.log('\n=== Processo completo (aprovado) ===\n');
    let doc = await novoDoc('DRAFT');
    await test('submeter cria o processo, passa o documento a "Aguarda aprovação" e dá tarefa ao aprovador da 1ª etapa', async () => {
        const r = await DocumentosFluxoService.iniciar(doc, fluxo2.id, u(B), 'Por favor aprovar');
        assert(r.ok, r.erro || '');
        assert((await recarregar(doc.id)).ciclo === 'PENDING_APPROVAL', 'ciclo devia ser PENDING_APPROVAL');
        const ta = await tarefasDe(A.id);
        assert(ta.some(t => t.documento_id === doc.id && t.etapa_nome === 'Chefia'), 'A devia ter a tarefa da Chefia');
        assert(!(await tarefasDe(B.id)).some(t => t.documento_id === doc.id), 'B ainda não devia ter tarefa');
        const n = await DocumentosFluxoService.notificacoes(EMPRESA, A.id);
        assert(n.lista.some(x => x.tipo === 'tarefa_nova' && x.documento_id === doc.id), 'A devia ter sido notificado');
    });
    await test('não se submete duas vezes o mesmo documento', async () => {
        const r = await DocumentosFluxoService.iniciar(await recarregar(doc.id), fluxo2.id, u(B));
        assert(!r.ok && /já tem um processo/.test(r.erro || ''), `veio: ${r.erro}`);
    });
    await test('quem não é o aprovador não decide', async () => {
        const t = (await tarefasDe(A.id)).find(t => t.documento_id === doc.id)!;
        const r = await DocumentosFluxoService.decidir(t.id, u(B), 'aprovada');
        assert(!r.ok && /não lhe está atribuída/.test(r.erro || ''), `veio: ${r.erro}`);
    });
    await test('aprovar a 1ª etapa abre a 2ª para os dois aprovadores (modo "todos")', async () => {
        const t = (await tarefasDe(A.id)).find(t => t.documento_id === doc.id)!;
        const r = await DocumentosFluxoService.decidir(t.id, u(A), 'aprovada', 'ok');
        assert(r.ok && r.estado === 'em_curso', `veio: ${JSON.stringify(r)}`);
        assert((await tarefasDe(A.id)).some(t => t.documento_id === doc.id && t.etapa_nome === 'Direção'), 'A devia ter tarefa da Direção');
        assert((await tarefasDe(B.id)).some(t => t.documento_id === doc.id && t.etapa_nome === 'Direção'), 'B devia ter tarefa da Direção');
    });
    await test('em modo "todos", um só aprovador não chega', async () => {
        const t = (await tarefasDe(A.id)).find(t => t.documento_id === doc.id)!;
        const r = await DocumentosFluxoService.decidir(t.id, u(A), 'aprovada');
        assert(r.ok && r.estado === 'em_curso', 'devia continuar em curso');
        assert((await recarregar(doc.id)).ciclo === 'PENDING_APPROVAL', 'ainda aguarda');
    });
    await test('o último aprovador conclui: APPROVED e, por opção do fluxo, ACTIVE; quem submeteu é avisado', async () => {
        const t = (await tarefasDe(B.id)).find(t => t.documento_id === doc.id)!;
        const r = await DocumentosFluxoService.decidir(t.id, u(B), 'aprovada');
        assert(r.ok && r.estado === 'aprovado', `veio: ${JSON.stringify(r)}`);
        assert((await recarregar(doc.id)).ciclo === 'ACTIVE', 'devia estar ACTIVE');
        const procs = await DocumentosFluxoService.processosDoDocumento(doc.id);
        assert(procs[0].estado === 'aprovado' && procs[0].tarefas.filter((x: any) => x.estado === 'aprovada').length === 3, 'histórico do processo');
        const n = await DocumentosFluxoService.notificacoes(EMPRESA, B.id);
        assert(n.lista.some(x => x.tipo === 'processo_aprovado' && x.documento_id === doc.id), 'B (submeteu) devia ser avisado');
        const hist = await DocumentosGovernoService.historico(EMPRESA, doc.id);
        assert(hist.some(h => h.acao === 'fluxo_iniciado') && hist.filter(h => h.acao === 'aprovou').length === 3, 'auditoria do fluxo');
    });

    console.log('\n=== Rejeição, delegação, cancelamento ===\n');
    await test('rejeitar exige motivo, cancela as outras tarefas e passa o documento a REJECTED', async () => {
        doc = await novoDoc('DRAFT');
        assert((await DocumentosFluxoService.iniciar(doc, fluxo2.id, u(B))).ok, 'iniciar');
        const t = (await tarefasDe(A.id)).find(t => t.documento_id === doc.id)!;
        assert(/motivo/.test((await DocumentosFluxoService.decidir(t.id, u(A), 'rejeitada')).erro || ''), 'sem motivo');
        const r = await DocumentosFluxoService.decidir(t.id, u(A), 'rejeitada', 'Falta o anexo B');
        assert(r.ok && r.estado === 'rejeitado', `veio: ${JSON.stringify(r)}`);
        assert((await recarregar(doc.id)).ciclo === 'REJECTED', 'devia estar REJECTED');
        assert(!(await tarefasDe(B.id)).some(t => t.documento_id === doc.id), 'B não devia ter tarefas deste doc');
    });
    await test('delegar passa a tarefa a outra pessoa, que decide; o delegante deixa de a ter', async () => {
        doc = await novoDoc('ACTIVE');
        assert((await DocumentosFluxoService.iniciar(doc, fluxo2.id, u(B))).ok, 'iniciar a partir de ACTIVE');
        const t = (await tarefasDe(A.id)).find(t => t.documento_id === doc.id)!;
        assert(/a si próprio/.test((await DocumentosFluxoService.delegar(t.id, u(A), A.id)).erro || ''), 'delegar a si próprio');
        const r = await DocumentosFluxoService.delegar(t.id, u(A), B.id, 'Estou de férias');
        assert(r.ok, r.erro || '');
        assert(!(await tarefasDe(A.id)).some(t => t.documento_id === doc.id), 'A já não devia ter a tarefa');
        const tb = (await tarefasDe(B.id)).find(t => t.documento_id === doc.id)!;
        assert(tb && tb.delegado_de === A.id && tb.delegado_de_nome === A.nome, 'B devia ter a tarefa delegada por A');
        assert((await DocumentosFluxoService.decidir(tb.id, u(B), 'aprovada')).ok, 'B decide');
    });
    await test('cancelar repõe o estado anterior e só quem submeteu / gere / admin pode', async () => {
        const p = await DocumentosFluxoService.processoEmCurso(doc.id);
        assert(!!p, 'devia haver processo em curso (2ª etapa)');
        const naoPode = await DocumentosFluxoService.cancelar(p.id, { ...u(A), role: 'user' }, 'x', false);
        assert(!naoPode.ok && /Só quem submeteu/.test(naoPode.erro || ''), `veio: ${naoPode.erro}`);
        assert(/motivo/.test((await DocumentosFluxoService.cancelar(p.id, u(B), '', false)).erro || ''), 'sem motivo');
        const r = await DocumentosFluxoService.cancelar(p.id, u(B), 'Submetido por engano', false);
        assert(r.ok, r.erro || '');
        assert((await recarregar(doc.id)).ciclo === 'ACTIVE', 'devia voltar a ACTIVE');
        assert(!(await tarefasDe(A.id)).some(t => t.documento_id === doc.id) && !(await tarefasDe(B.id)).some(t => t.documento_id === doc.id), 'tarefas pendentes deviam ter sido canceladas');
    });

    console.log('\n=== Prazos (SLA) ===\n');
    await test('tarefa fora de prazo com "escalar para" passa para essa pessoa; sem escalar, só avisa uma vez', async () => {
        const { data: fluxoSla } = await supabase.from('documento_fluxos').insert({
            empresa_id: EMPRESA, nome: `${TAG} sla`, etapas: [{ nome: 'Rápida', aprovadores: [A.id], modo: 'qualquer', prazo_horas: 1, escalar_para: B.id }], criado_por: A.id
        }).select('*').single();
        fluxosCriados.push(fluxoSla.id);
        doc = await novoDoc('DRAFT');
        assert((await DocumentosFluxoService.iniciar(doc, fluxoSla.id, u(B))).ok, 'iniciar');
        const t = (await tarefasDe(A.id)).find(t => t.documento_id === doc.id)!;
        await supabase.from('documento_tarefas').update({ prazo: new Date(Date.now() - 60000).toISOString() }).eq('id', t.id);
        assert((await DocumentosFluxoService.escalarAtrasadas()) >= 1, 'devia ter escalado pelo menos uma');
        assert(!(await tarefasDe(A.id)).some(t => t.documento_id === doc.id), 'A já não devia ter a tarefa');
        const tb = (await tarefasDe(B.id)).find(t => t.documento_id === doc.id)!;
        assert(tb && tb.escalada_de === A.id, 'B devia ter a tarefa escalada');
        assert((await DocumentosFluxoService.escalarAtrasadas()) === 0 || !(await tarefasDe(B.id)).find(t => t.documento_id === doc.id && t.escalada_de === B.id), 'não deve escalar em cadeia');
        assert((await DocumentosFluxoService.decidir(tb.id, u(B), 'aprovada')).ok, 'B decide a escalada');
        assert((await recarregar(doc.id)).ciclo === 'ACTIVE', 'aprovado e ativo');
    });

    console.log('\n=== Acesso de aprovadores ===\n');
    await test('um aprovador vê um documento Restrito fora da sua área enquanto tiver tarefa', async () => {
        doc = await novoDoc('DRAFT', { confidencialidade: 'Restrito', area: 'RH' });
        const userB = { ...u(B), role: 'user' };
        assert((await DocumentosGovernoService.nivelDe(doc, userB, ['Financeiro'])) === null, 'sem tarefa, não vê');
        const { data: f } = await supabase.from('documento_fluxos').insert({ empresa_id: EMPRESA, nome: `${TAG} restrito`, etapas: [{ nome: 'Só B', aprovadores: [B.id], modo: 'qualquer', prazo_horas: null, escalar_para: null }], criado_por: A.id }).select('*').single();
        fluxosCriados.push(f.id);
        assert((await DocumentosFluxoService.iniciar(doc, f.id, u(A))).ok, 'iniciar');
        assert((await DocumentosGovernoService.nivelDe(doc, userB, ['Financeiro'])) === 'ver', 'com tarefa, vê');
    });

    console.log('\n=== Checklists ===\n');
    await test('checklist diz o que falta a uma entidade e o panorama ordena pelas mais incompletas', async () => {
        const tipos = await DocumentosGovernoService.tipos(EMPRESA);
        const ctr = tipos.find((t: any) => t.prefixo === 'CTR'); const alv = tipos.find((t: any) => t.prefixo === 'ALV');
        assert(!!ctr && !!alv, 'tipos padrão CTR/ALV');
        const { data: cliente } = await supabase.from('clientes').select('id, nome').eq('empresa_id', EMPRESA).limit(1).maybeSingle();
        if (!cliente) { console.log('    (sem clientes na empresa; a saltar)'); return; }
        const v = await DocumentosFluxoService.validarItens(EMPRESA, [{ tipo_id: ctr.id, obrigatorio: true }, { tipo_id: alv.id, obrigatorio: true, nota: 'válido' }, { tipo_id: ctr.id }]);
        assert(!v.erro && v.itens!.length === 2, 'itens duplicados deviam ser fundidos');
        const { data: cl } = await supabase.from('documento_checklists').insert({ empresa_id: EMPRESA, nome: `${TAG} dossier`, entidade_tipo: 'cliente', itens: v.itens }).select('*').single();
        checklistsCriadas.push(cl.id);
        await novoDoc('ACTIVE', { tipo_id: ctr.id, tipo: 'Contrato', entidade_tipo: 'cliente', entidade_id: String(cliente.id), entidade_nome: cliente.nome });
        await novoDoc('ACTIVE', { tipo_id: alv.id, tipo: 'Alvará', entidade_tipo: 'cliente', entidade_id: String(cliente.id), validade: '2020-01-01' });
        const e = await DocumentosFluxoService.estadoChecklist(cl, String(cliente.id), u(A));
        const porTipo = Object.fromEntries(e.itens.map((i: any) => [i.tipo_id, i.situacao]));
        assert(porTipo[ctr.id] === 'ok', `contrato devia estar ok, veio ${porTipo[ctr.id]}`);
        assert(porTipo[alv.id] === 'caducado', `alvará devia estar caducado, veio ${porTipo[alv.id]}`);
        assert(!e.completa && e.em_falta === 1, 'devia faltar 1 obrigatório');
        const pan = await DocumentosFluxoService.panoramaChecklist(cl);
        const linha = pan.find((x: any) => String(x.id) === String(cliente.id));
        assert(!!linha && linha.em_falta === 1 && linha.obrigatorios === 2, `panorama: ${JSON.stringify(linha)}`);
    });

    // limpeza
    await supabase.from('documento_checklists').delete().in('id', checklistsCriadas);
    if (docsCriados.length) {
        await supabase.from('documento_notificacoes').delete().in('documento_id', docsCriados);
        await supabase.from('documentos').delete().in('id', docsCriados);   // processos e tarefas caem em cascata
    }
    await supabase.from('documento_fluxos').delete().in('id', fluxosCriados);
    await supabase.from('documentos_auditoria').delete().eq('empresa_id', EMPRESA).like('documento_titulo', `${TAG}%`).then(() => {}, () => {});

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (failed) { falhas.forEach(f => console.log('  - ' + f)); process.exit(1); }
    process.exit(0);
})();
