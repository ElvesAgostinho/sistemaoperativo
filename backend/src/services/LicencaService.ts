import { supabase } from '../lib/supabaseClient';

/**
 * Os módulos que uma empresa tem licenciados.
 *
 * Isto estava espalhado por três sítios, cada um com a sua lista por omissão
 * (uma com 11 módulos, outra com 3), e todos liam a configuração como o próprio
 * utilizador — ou seja, sujeitos às regras de acesso da base de dados. Quando a
 * leitura falhava, caíam na lista cheia e a empresa passava a ver tudo.
 *
 * Numa verificação de licença, falhar para o lado aberto é exatamente ao
 * contrário do que deve ser: na dúvida dá-se menos, não mais. Quem paga por
 * três módulos não pode acabar com onze porque uma leitura correu mal.
 */
export class LicencaService {

    /** O aviso dos módulos que já não existem sai uma vez por empresa. */
    private static fantasmasAvisados = new Set<string>();

    /** O que uma empresa nova recebe enquanto ninguém lhe definir a licença. */
    public static readonly PADRAO = ['crm', 'wa', 'auto'];

    /** Estes não se licenciam: sem eles ninguém consegue usar nem configurar nada. */
    public static readonly SEMPRE = ['home', 'settings'];

    /** Tudo o que existe, para o painel do superadmin listar. */
    public static readonly TODOS = [
        'hr', 'crm', 'reunioes', 'auto', 'wa', 'kb', 'email', 'data', 'chat',
        'afiliados', 'contabilidade', 'agendamento', 'documentos'
    ];

    /**
     * Lê a licença com o cliente de administração, não com o do utilizador: as
     * regras de acesso da base de dados podiam esconder a linha e o sistema
     * concluía "não há limite nenhum".
     */
    public static async modulosDaEmpresa(empresaId?: string | null): Promise<string[]> {
        if (!empresaId) return [...LicencaService.PADRAO];

        try {
            const { data, error } = await supabase.from('configuracoes')
                .select('valor').eq('empresa_id', empresaId).eq('chave', 'modulos_empresa').maybeSingle();

            if (error) {
                // Falhar fechado, e dizê-lo alto: um erro de leitura não pode
                // valer uma licença completa.
                console.error(`[Licenca] Não foi possível ler a licença da empresa ${empresaId}:`, error.message);
                return [...LicencaService.PADRAO];
            }

            // Sem linha é uma empresa a que ainda ninguém definiu a licença.
            if (!data?.valor) return [...LicencaService.PADRAO];

            const lista = JSON.parse(data.valor);
            if (!Array.isArray(lista)) {
                console.error(`[Licenca] A licença da empresa ${empresaId} não é uma lista.`);
                return [...LicencaService.PADRAO];
            }
            // Uma lista vazia é uma escolha legítima: a empresa fica só com o
            // essencial. Não se "corrige" para a lista cheia.
            const limpa = lista.filter((m: any) => typeof m === 'string');

            // Módulos que já não existem ficam para trás nas licenças antigas
            // (a empresa mestre tem um "pc" que nunca existiu no código). Não
            // fazem mal — ninguém lhes consegue abrir nada — mas aparecem nas
            // contagens e no painel do superadmin, onde confundem quem está a
            // decidir o que a empresa comprou. Vão para o log uma vez, porque
            // um módulo que o painel não sabe desligar merece ser conhecido.
            const fantasmas = limpa.filter((m: string) => !LicencaService.TODOS.includes(m));
            if (fantasmas.length && !LicencaService.fantasmasAvisados.has(empresaId)) {
                LicencaService.fantasmasAvisados.add(empresaId);
                console.warn(`[Licenca] A empresa ${empresaId} tem módulos que já não existem: ${fantasmas.join(', ')}. São ignorados.`);
            }

            return limpa.filter((m: string) => LicencaService.TODOS.includes(m));
        } catch (e: any) {
            console.error(`[Licenca] Erro a ler a licença da empresa ${empresaId}:`, e?.message || e);
            return [...LicencaService.PADRAO];
        }
    }

    /** Esta empresa tem este módulo? */
    public static async temModulo(empresaId: string | null | undefined, modulo: string): Promise<boolean> {
        if (LicencaService.SEMPRE.includes(modulo)) return true;
        const modulos = await LicencaService.modulosDaEmpresa(empresaId);
        return modulos.includes(modulo);
    }
}
