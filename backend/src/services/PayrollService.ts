import { Request } from 'express';
import { getSupabase } from '../lib/supabaseClient';

export interface SalarioRequest {
    salarioBase: number;
    subsidiosNaoTributaveis: number;
    subsidiosTributaveis: number;
    faltasInjustificadas: number;
    diasUteisMes?: number;
}

export interface SalarioResult {
    salarioBruto: number;
    descontoFaltas: number;
    salarioAposFaltas: number;
    inssTrabalhador: number;
    materiaColetavelIRT: number;
    irt: number;
    totalDescontos: number;
    salarioLiquido: number;
}

export class PayrollService {
    
    private static readonly TABELA_IRT = [
        { limiteInferior: 0, limiteSuperior: 100000, parcelaFixa: 0, taxa: 0.00 },
        { limiteInferior: 100001, limiteSuperior: 150000, parcelaFixa: 0, taxa: 0.13 },
        { limiteInferior: 150001, limiteSuperior: 200000, parcelaFixa: 12500, taxa: 0.16 },
        { limiteInferior: 200001, limiteSuperior: 300000, parcelaFixa: 31250, taxa: 0.18 },
        { limiteInferior: 300001, limiteSuperior: 500000, parcelaFixa: 55750, taxa: 0.19 },
        { limiteInferior: 500001, limiteSuperior: 1000000, parcelaFixa: 94750, taxa: 0.20 },
        { limiteInferior: 1000001, limiteSuperior: 1500000, parcelaFixa: 211750, taxa: 0.21 },
        { limiteInferior: 1500001, limiteSuperior: 2000000, parcelaFixa: 323750, taxa: 0.22 },
        { limiteInferior: 2000001, limiteSuperior: 2500000, parcelaFixa: 433750, taxa: 0.23 },
        { limiteInferior: 2500001, limiteSuperior: 5000000, parcelaFixa: 553750, taxa: 0.24 },
        { limiteInferior: 500001, limiteSuperior: 10000000, parcelaFixa: 1163750, taxa: 0.245 },
        { limiteInferior: 10000001, limiteSuperior: Infinity, parcelaFixa: 2393750, taxa: 0.25 }
    ];

    public static calcularSalario(req: SalarioRequest): SalarioResult {
        const diasBase = req.diasUteisMes || 30;
        const valorPorDia = req.salarioBase / diasBase;
        const descontoFaltas = valorPorDia * req.faltasInjustificadas;
        const salarioAposFaltas = Math.max(0, req.salarioBase - descontoFaltas);
        const inssTrabalhador = salarioAposFaltas * 0.03;
        const materiaColetavelIRT = (salarioAposFaltas - inssTrabalhador) + req.subsidiosTributaveis;
        const irt = this.calcularIRT(materiaColetavelIRT);
        const salarioBruto = req.salarioBase + req.subsidiosNaoTributaveis + req.subsidiosTributaveis;
        const totalDescontos = descontoFaltas + inssTrabalhador + irt;
        const salarioLiquido = salarioBruto - totalDescontos;

        return {
            salarioBruto, descontoFaltas, salarioAposFaltas,
            inssTrabalhador, materiaColetavelIRT, irt, totalDescontos, salarioLiquido
        };
    }

    private static calcularIRT(materiaColetavel: number): number {
        if (materiaColetavel <= 100000) return 0;
        for (const escalao of this.TABELA_IRT) {
            if (materiaColetavel >= escalao.limiteInferior && materiaColetavel <= escalao.limiteSuperior) {
                const excesso = materiaColetavel - (escalao.limiteInferior - 1);
                const irtCalculado = escalao.parcelaFixa + (excesso * escalao.taxa);
                return Math.max(0, irtCalculado);
            }
        }
        return 0;
    }

    public static processarLote(dadosLote: any[]): any[] {
        const resultados: any[] = [];
        for (const linha of dadosLote) {
            const salarioBase = Number(linha['Salário Base'] || linha['salarioBase'] || 0);
            const faltas = Number(linha['Faltas'] || linha['faltasInjustificadas'] || 0);
            const subNaoTributaveis = Number(linha['Sub. Não Tributável'] || linha['subsidiosNaoTributaveis'] || 0);
            const subTributaveis = Number(linha['Sub. Tributável'] || linha['subsidiosTributaveis'] || 0);

            if (salarioBase > 0) {
                const calculos = this.calcularSalario({
                    salarioBase, faltasInjustificadas: faltas,
                    subsidiosNaoTributaveis: subNaoTributaveis, subsidiosTributaveis: subTributaveis
                });

                resultados.push({
                    'Nome Funcionário': linha['Nome'] || linha['nomeFuncionario'] || 'Desconhecido',
                    'NIF': linha['NIF'] || '000000000',
                    'Email': linha['Email'] || '',
                    'Salário Base (Kz)': salarioBase,
                    'Faltas (Dias)': faltas,
                    'Desconto INSS 3% (Kz)': calculos.inssTrabalhador,
                    'Encargo INSS Empresa 8% (Kz)': calculos.salarioAposFaltas * 0.08,
                    'Retenção IRT (Kz)': calculos.irt,
                    'Salário Líquido a Pagar (Kz)': calculos.salarioLiquido
                });
            }
        }
        return resultados;
    }

    public static async processarLoteDB(req: Request, dadosLote: any[], mes: number, ano: number, utilizador: string) {
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const { data: procResult, error: procError } = await supabase.from('processamentos_mensais').insert({
            empresa_id, mes, ano, estado: 'Rascunho'
        }).select('id').single();
        if (procError) throw procError;

        const processamento_id = procResult.id;

        await supabase.from('ai_router_logs').insert({
            empresa_id, user_email: utilizador, rotas: 'CRIACAO_EM_MASSA'
        }); // Auditoria simplificada

        const resultados = this.processarLote(dadosLote);

        const recibos = resultados.map(r => {
            const inss_entidade = (r['Salário Base (Kz)'] - (r['Salário Base (Kz)'] / 30 * r['Faltas (Dias)'])) * 0.08;
            return {
                empresa_id,
                processamento_id,
                colaborador_id: 1, // Mock
                salario_base: r['Salário Base (Kz)'],
                faltas_dias: r['Faltas (Dias)'],
                inss_trabalhador: r['Desconto INSS 3% (Kz)'],
                inss_entidade,
                irt: r['Retenção IRT (Kz)'],
                total_liquido: r['Salário Líquido a Pagar (Kz)']
            };
        });

        if (recibos.length > 0) {
            const { error: insertError } = await supabase.from('recibos_vencimento').insert(recibos);
            if (insertError) throw insertError;
        }

        return resultados;
    }
}
