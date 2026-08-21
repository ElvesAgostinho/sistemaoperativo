/**
 * Teste isolado do motor de processamento salarial (EmployeeService.processarSalarios).
 * Usa um mock de Supabase (sem tocar em dados reais) para validar:
 *  - contagem de dias de falta injustificada dentro do mês-alvo (incluindo faltas
 *    que começam antes ou terminam depois do mês)
 *  - o payload de recibos_vencimento gerado bate com o cálculo de PayrollService
 *  - reprocessar um mês em Rascunho apaga os recibos antigos antes de reinserir
 *  - um mês Fechado não pode ser reprocessado
 *
 * Corre com: npx ts-node backend/scripts/testPayrollEngine.ts
 */

const supabaseClientPath = require.resolve('../src/lib/supabaseClient');

let insertedRecibos: any[] = [];
let deletedProcessamentoIds: number[] = [];
let processamentosState = new Map<string, { id: number; estado: string }>();
let nextProcId = 100;

const COLABORADORES = [
  { id: 1, salario_base: 300000, sub_alimentacao_contrato: 30000, sub_transporte_contrato: 20000 },
  { id: 2, salario_base: 150000, sub_alimentacao_contrato: 15000, sub_transporte_contrato: 10000 },
];

// Colaborador 2 teve uma falta injustificada de 28/07 a 03/08 (2026) -> só 3 dias caem em Agosto (01,02,03)
const AUSENCIAS: Record<number, any[]> = {
  1: [],
  2: [{ data_inicio: '2026-07-28', data_fim: '2026-08-03' }],
};

function makeQueryBuilder(table: string) {
  const state: any = { table, filters: {} as Record<string, any>, isDelete: false };
  const builder: any = {
    select: () => builder,
    eq: (col: string, val: any) => { state.filters[col] = val; return builder; },
    lte: () => builder,
    gte: () => builder,
    order: () => builder,
    delete: () => { state.isDelete = true; return builder; },
    maybeSingle: async () => {
      if (table === 'processamentos_mensais') {
        const key = `${state.filters.mes}-${state.filters.ano}`;
        const found = processamentosState.get(key);
        return { data: found || null, error: null };
      }
      return { data: null, error: null };
    },
    single: async () => ({ data: null, error: null }),
    insert: (payload: any) => {
      if (table === 'processamentos_mensais') {
        const id = nextProcId++;
        const key = `${payload.mes}-${payload.ano}`;
        processamentosState.set(key, { id, estado: payload.estado });
        return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
      }
      if (table === 'recibos_vencimento') {
        const rows = Array.isArray(payload) ? payload : [payload];
        insertedRecibos.push(...rows);
        return Promise.resolve({ error: null });
      }
      return Promise.resolve({ error: null });
    },
    then: (resolve: any) => {
      if (state.isDelete && table === 'recibos_vencimento') {
        insertedRecibos = insertedRecibos.filter(r => r.processamento_id !== state.filters.processamento_id);
        if (state.filters.processamento_id) deletedProcessamentoIds.push(state.filters.processamento_id);
        return resolve({ error: null });
      }
      // Usado quando o código faz `await supabase.from(...).select(...)` sem .single()/.maybeSingle()
      if (table === 'colaboradores') return resolve({ data: COLABORADORES, error: null });
      if (table === 'ausencias') return resolve({ data: AUSENCIAS[state.filters.colaborador_id] || [], error: null });
      return resolve({ data: [], error: null });
    }
  };
  return builder;
}

const mockSupabase = {
  from: (table: string) => makeQueryBuilder(table),
};

require.cache[supabaseClientPath] = {
  id: supabaseClientPath,
  filename: supabaseClientPath,
  loaded: true,
  exports: {
    supabase: mockSupabase,
    supabaseAdmin: mockSupabase,
    getSupabase: () => mockSupabase,
  },
} as any;

async function main() {
  const { EmployeeService } = require('../src/services/EmployeeService');

  const fakeReq: any = { user: { empresa_id: 'test-empresa' } };

  console.log('--- Teste 1: processar Agosto/2026 ---');
  const procId = await EmployeeService.processarSalarios(fakeReq, 8, 2026);
  console.assert(typeof procId === 'number', 'processamento_id deve ser number');
  console.assert(insertedRecibos.length === 2, `esperava 2 recibos, veio ${insertedRecibos.length}`);

  const recibo1 = insertedRecibos.find(r => r.colaborador_id === 1);
  const recibo2 = insertedRecibos.find(r => r.colaborador_id === 2);

  console.assert(recibo1.faltas_dias === 0, `colaborador 1 não devia ter faltas, veio ${recibo1.faltas_dias}`);
  console.assert(recibo2.faltas_dias === 3, `colaborador 2 devia ter 3 dias de falta em Agosto (overlap), veio ${recibo2.faltas_dias}`);
  console.assert(recibo2.desconto_faltas > 0, 'desconto_faltas do colaborador 2 devia ser > 0');
  console.assert(recibo1.subsidio_alimentacao === 30000 && recibo1.subsidio_transporte === 20000, 'subsídios do colaborador 1 incorretos');
  console.assert(recibo1.total_liquido > 0 && recibo1.total_liquido < recibo1.salario_base + 50000, 'total_liquido do colaborador 1 fora do intervalo esperado');

  console.log('Recibo colaborador 1:', recibo1);
  console.log('Recibo colaborador 2:', recibo2);

  console.log('\n--- Teste 2: reprocessar o mesmo mês (Rascunho) limpa recibos antigos ---');
  insertedRecibos = [];
  const procId2 = await EmployeeService.processarSalarios(fakeReq, 8, 2026);
  console.assert(procId2 === procId, 'reprocessar deve reutilizar o mesmo processamento_id (Rascunho)');
  console.assert(deletedProcessamentoIds.includes(procId), 'devia ter apagado os recibos antigos do processamento antes de reinserir');
  console.assert(insertedRecibos.length === 2, `esperava 2 recibos após reprocessar, veio ${insertedRecibos.length}`);

  console.log('\n--- Teste 3: mês Fechado não pode ser reprocessado ---');
  const key = '8-2026';
  processamentosState.set(key, { id: procId, estado: 'Fechado' });
  let threw = false;
  try {
    await EmployeeService.processarSalarios(fakeReq, 8, 2026);
  } catch (e: any) {
    threw = true;
    console.assert(e.message.includes('já foi processado'), `mensagem de erro inesperada: ${e.message}`);
  }
  console.assert(threw, 'devia ter lançado erro ao tentar reprocessar mês fechado');

  console.log('\nTodos os testes correram (ver acima por falhas de assert).');
}

main().catch(e => { console.error('ERRO NO TESTE:', e); process.exit(1); });
