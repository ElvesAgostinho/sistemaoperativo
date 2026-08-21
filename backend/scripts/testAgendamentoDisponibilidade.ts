/**
 * Teste isolado do cálculo de disponibilidade do Agendamento
 * (AgendamentoService.getDisponibilidade). Mock de Supabase, sem tocar
 * em dados reais.
 *
 * Cenário: serviço de 30 min, expediente das 09:00 às 12:00 (grelha de
 * 15 em 15 min), com uma marcação já existente das 10:00 às 10:30.
 * Esperado: 10:00 e 09:45 (que terminaria às 10:15, dentro do range
 * ocupado) ficam de fora; 09:00, 09:15, 09:30, 10:30, 10:45, 11:00,
 * 11:15, 11:30 ficam disponíveis (11:30+30min=12:00, ainda cabe).
 *
 * Corre com: npx ts-node backend/scripts/testAgendamentoDisponibilidade.ts
 */

const supabaseClientPath = require.resolve('../src/lib/supabaseClient');

const SERVICO = { id: 1, duracao_minutos: 30 };
const HORARIO = { hora_inicio: '09:00:00', hora_fim: '12:00:00', ativo: true };
const OCUPADOS = [{ hora_inicio: '10:00:00', hora_fim: '10:30:00', profissional_id: null }];

function makeQueryBuilder(table: string) {
  const state: any = { filters: {} };
  const builder: any = {
    select: () => builder,
    eq: (col: string, val: any) => { state.filters[col] = val; return builder; },
    neq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => {
      if (table === 'agendamento_horarios') return { data: HORARIO, error: null };
      return { data: null, error: null };
    },
    single: async () => {
      if (table === 'agendamento_servicos') return { data: SERVICO, error: null };
      return { data: null, error: null };
    },
    then: (resolve: any) => {
      if (table === 'agendamentos') return resolve({ data: OCUPADOS, error: null });
      return resolve({ data: [], error: null });
    }
  };
  return builder;
}

const mockSupabase = { from: (table: string) => makeQueryBuilder(table) };

require.cache[supabaseClientPath] = {
  id: supabaseClientPath, filename: supabaseClientPath, loaded: true,
  exports: { supabase: mockSupabase, supabaseAdmin: mockSupabase, getSupabase: () => mockSupabase },
} as any;

async function main() {
  const { AgendamentoService } = require('../src/services/AgendamentoService');

  // Usa uma data fixa no futuro para não cair no filtro "não oferecer horários já passados hoje"
  const dataFutura = '2027-03-01'; // segunda-feira, dia_semana = 1

  const { horarios } = await AgendamentoService.getDisponibilidade('empresa-teste', 1, dataFutura, undefined, mockSupabase);

  console.log('Horários disponíveis:', horarios);

  console.assert(!horarios.includes('09:45'), 'FALHOU: 09:45 devia estar bloqueado (colide com 10:00-10:30)');
  console.assert(!horarios.includes('10:00'), 'FALHOU: 10:00 devia estar bloqueado (o próprio horário ocupado)');
  console.assert(!horarios.includes('10:15'), 'FALHOU: 10:15 devia estar bloqueado (colide)');
  console.assert(horarios.includes('09:00'), 'FALHOU: 09:00 devia estar disponível');
  console.assert(horarios.includes('10:30'), 'FALHOU: 10:30 devia estar disponível (logo após o ocupado)');
  console.assert(horarios.includes('11:30'), 'FALHOU: 11:30 devia estar disponível (11:30+30min=12:00, cabe exatamente)');
  console.assert(!horarios.includes('11:45'), 'FALHOU: 11:45 NÃO devia estar disponível (11:45+30min=12:15, passa do expediente)');

  console.log('\nTodos os testes correram (ver acima por falhas de assert).');
}

main().catch(e => { console.error('ERRO NO TESTE:', e); process.exit(1); });
