/**
 * Quanto tempo dura uma pausa, e como se escreve esse tempo.
 *
 * Três sítios precisam de saber isto: o painel que a configura, o bloco que a
 * mostra no desenho, e o motor no servidor que a cumpre. Estavam os três a ler
 * a configuração à sua maneira — e o resultado era o painel dizer "1 dia"
 * enquanto o bloco ao lado dizia "1 minuto(s)". Aqui ficam as regras uma vez só.
 *
 * (O servidor tem a sua cópia em AutomationEngine.segundosDaPausa, porque não
 * partilha código com o ecrã; os testes de testEsperaFluxo.ts seguram que as
 * duas dizem o mesmo.)
 */

export const UNIDADES = ['segundos', 'minutos', 'horas', 'dias'] as const;
export type Unidade = typeof UNIDADES[number];

const POR_UNIDADE: Record<string, number> = { segundos: 1, minutos: 60, horas: 3600, dias: 86400 };

/**
 * Lê a duração seja como for que esteja guardada. Os fluxos antigos têm
 * `segundos` ou `minutos`; os novos têm `duracao` e `unidade`. Todos têm de
 * continuar a abrir bem — há fluxos gravados das três maneiras.
 */
export function duracaoDaPausa(config: any): { duracao: number; unidade: Unidade } {
  const c = config || {};

  if (c.duracao !== undefined && c.unidade && POR_UNIDADE[c.unidade] !== undefined) {
    const n = Number(c.duracao);
    return { duracao: Number.isFinite(n) && n > 0 ? n : 1, unidade: c.unidade as Unidade };
  }

  const seg = c.segundos !== undefined
    ? parseInt(c.segundos, 10)
    : (parseInt(c.minutos ?? c.minutes ?? '1', 10) * 60);

  if (!Number.isFinite(seg) || seg <= 0) return { duracao: 1, unidade: 'minutos' };

  // Mostra na maior unidade que der certo: 7200s lê-se melhor como "2 horas".
  if (seg % 86400 === 0) return { duracao: seg / 86400, unidade: 'dias' };
  if (seg % 3600 === 0) return { duracao: seg / 3600, unidade: 'horas' };
  if (seg % 60 === 0) return { duracao: seg / 60, unidade: 'minutos' };
  return { duracao: seg, unidade: 'segundos' };
}

export function segundosDaPausa(config: any): number {
  const { duracao, unidade } = duracaoDaPausa(config);
  return Math.round(duracao * (POR_UNIDADE[unidade] ?? 1));
}

export function emSegundos(duracao: number, unidade: string): number {
  return Math.round(duracao * (POR_UNIDADE[unidade] ?? 1));
}

/** "3 horas", "30 minutos", "1 dia" — como uma pessoa diria. */
export function pausaPorExtenso(segundos: number): string {
  const diz = (n: number, singular: string, plural: string) =>
    `${n} ${n === 1 ? singular : plural}`;

  if (segundos >= 86400) return diz(Math.round((segundos / 86400) * 10) / 10, 'dia', 'dias');
  if (segundos >= 3600) return diz(Math.round((segundos / 3600) * 10) / 10, 'hora', 'horas');
  if (segundos >= 60) return diz(Math.round((segundos / 60) * 10) / 10, 'minuto', 'minutos');
  return diz(segundos, 'segundo', 'segundos');
}

/**
 * Acima disto a espera deixa de ser um temporizador em memória e passa a ficar
 * guardada no servidor. Tem de ser o mesmo número que o ESPERA_EM_MEMORIA_MAX
 * do motor, senão o painel promete uma coisa e o servidor faz outra.
 */
export const ESPERA_GUARDADA_ACIMA_DE = 120;
