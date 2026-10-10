import { supabase } from '../lib/supabaseClient';
import { LicencaService } from './LicencaService';

/**
 * O que cada pessoa pode ver e fazer dentro da empresa.
 *
 * Isto estava escrito à mão no ecrã (ROLE_PERMISSIONS no App.tsx), preso a
 * cinco papéis fixos, e o servidor não verificava nada. O ecrã escondia o
 * botão do RH a um agente, mas quem soubesse o endereço chamava a API na
 * mesma — esconder não é proteger.
 *
 * Agora há um sítio só. O papel continua a dar um ponto de partida sensato
 * (ninguém tem de configurar vinte coisas para pôr um agente a trabalhar), mas
 * o dono pode afinar pessoa a pessoa. E o servidor verifica.
 *
 * Duas barreiras, não uma: a LICENÇA diz o que a empresa comprou, a PERMISSÃO
 * diz o que aquela pessoa faz do que a empresa comprou. Um módulo que a
 * empresa não licenciou não se abre a ninguém, por mais permissões que tenha.
 */

/** Uma acção que se pode dar ou tirar a alguém. */
export interface Accao {
    chave: string;
    nome: string;
    descricao: string;
    /** Só faz sentido se a pessoa tiver este módulo. */
    modulo?: string;
}

export class PermissaoService {

    /** Os módulos que não se tiram a ninguém: sem eles não se entra. */
    public static readonly MODULOS_SEMPRE = ['home', 'settings'];

    /**
     * As acções sensíveis. Tudo o que não está aqui é do dia-a-dia e vem com o
     * módulo; o que está aqui tem de ser dado de propósito.
     */
    public static readonly ACCOES: Accao[] = [
        { chave: 'wa.responder', modulo: 'wa', nome: 'Responder a conversas', descricao: 'Escrever e enviar mensagens aos clientes.' },
        { chave: 'wa.delegar', modulo: 'wa', nome: 'Delegar conversas', descricao: 'Passar uma conversa a outro colega da equipa.' },
        { chave: 'wa.auditoria', modulo: 'wa', nome: 'Ver auditoria', descricao: 'Ver quem fez o quê em cada conversa. Normalmente só o dono e os supervisores.' },
        { chave: 'wa.bot', modulo: 'wa', nome: 'Pausar e retomar o bot', descricao: 'Ligar e desligar o atendimento automático de um cliente.' },
        { chave: 'wa.fluxo', modulo: 'wa', nome: 'Escolher o fluxo da conversa', descricao: 'Decidir que fluxo atende cada cliente.' },
        { chave: 'wa.canal', modulo: 'wa', nome: 'Gerir a ligação ao WhatsApp', descricao: 'Ligar e desligar o número da empresa. Mexer aqui derruba o atendimento de todos.' },
        { chave: 'auto.editar', modulo: 'auto', nome: 'Criar e editar fluxos', descricao: 'Mexer no desenho das automações.' },
        { chave: 'auto.disparar', modulo: 'auto', nome: 'Disparar fluxos em massa', descricao: 'Mandar um fluxo a muitos contactos de uma vez. Um disparo mal feito põe o número em risco.' },
        { chave: 'email.campanhas', modulo: 'email', nome: 'Enviar campanhas de email', descricao: 'Enviar email em massa em nome da empresa.' },
        { chave: 'crm.apagar', modulo: 'crm', nome: 'Apagar clientes', descricao: 'Remover fichas de clientes do CRM.' },
        { chave: 'equipa.gerir', nome: 'Gerir a equipa', descricao: 'Aprovar contas, mudar permissões e desativar colegas. Dê isto a muito poucas pessoas.' },
        { chave: 'empresa.definicoes', nome: 'Mudar as definições da empresa', descricao: 'Nome, logótipo, dados de faturação e integrações.' },
    ];

    /**
     * O ponto de partida de cada papel. Não é uma regra fechada: assim que o
     * dono mexer nas permissões de alguém, passa a valer o que ele escolheu.
     */
    private static readonly POR_PAPEL: Record<string, { modulos: string[]; accoes: string[] }> = {
        superadmin: { modulos: ['*'], accoes: ['*'] },
        admin: { modulos: ['*'], accoes: ['*'] },
        sales_manager: {
            modulos: ['crm', 'wa', 'email', 'data', 'chat', 'kb', 'reunioes', 'afiliados', 'agendamento', 'documentos'],
            accoes: ['wa.responder', 'wa.delegar', 'wa.auditoria', 'wa.bot', 'wa.fluxo', 'email.campanhas'],
        },
        hr_manager: {
            modulos: ['hr', 'chat', 'kb', 'email', 'reunioes', 'documentos'],
            accoes: [],
        },
        rh_user: {
            modulos: ['hr', 'chat', 'kb', 'reunioes'],
            accoes: [],
        },
        agente: {
            // O caso do Alexandre: atende clientes e mais nada. Sem auditoria,
            // sem delegar, sem disparos.
            modulos: ['wa', 'chat', 'kb', 'email', 'reunioes', 'agendamento'],
            accoes: ['wa.responder'],
        },
        pending: { modulos: [], accoes: [] },
    };

    /** O que um papel dá por omissão, para o ecrã poder mostrar "o normal para um agente". */
    public static omissaoDoPapel(papel: string): { modulos: string[]; accoes: string[] } {
        const base = PermissaoService.POR_PAPEL[papel] || PermissaoService.POR_PAPEL.pending;
        return { modulos: [...base.modulos], accoes: [...base.accoes] };
    }

    /** Este papel manda em tudo (dono da empresa ou superadmin)? */
    public static mandaEmTudo(papel: string): boolean {
        const base = PermissaoService.POR_PAPEL[papel];
        return !!base && base.modulos.includes('*');
    }

    /**
     * O que esta pessoa pode, mesmo. Cruza três coisas: o que a empresa
     * licenciou, o que o papel dá e o que o dono afinou à mão.
     */
    public static async efectivas(utilizadorId: string): Promise<{
        papel: string;
        empresaId: string | null;
        modulos: string[];
        accoes: string[];
        proprias: boolean;
    }> {
        const vazio = { papel: 'pending', empresaId: null, modulos: [...PermissaoService.MODULOS_SEMPRE], accoes: [], proprias: false };

        let perfil: any = null;
        try {
            const { data, error } = await supabase.from('perfis')
                .select('role, empresa_id, permissoes, ativo').eq('id', utilizadorId).maybeSingle();
            if (error) {
                // Falhar fechado: não saber quem é dá o mínimo, não o máximo.
                console.error('[Permissoes] Não foi possível ler o perfil:', error.message);
                return vazio;
            }
            perfil = data;
        } catch (e: any) {
            console.error('[Permissoes] Erro a ler o perfil:', e?.message || e);
            return vazio;
        }

        if (!perfil) return vazio;

        // Uma conta desativada não tem permissões nenhumas, seja qual for o papel.
        if (perfil.ativo === false) {
            return { papel: perfil.role || 'pending', empresaId: perfil.empresa_id || null, modulos: [], accoes: [], proprias: false };
        }

        const papel = perfil.role || 'pending';
        const empresaId = perfil.empresa_id || null;
        const licenca = await LicencaService.modulosDaEmpresa(empresaId);

        const proprias = PermissaoService.lerGuardadas(perfil.permissoes);
        const base = PermissaoService.omissaoDoPapel(papel);

        const todosOsModulos = LicencaService.TODOS;
        const todasAsAccoes = PermissaoService.ACCOES.map(a => a.chave);

        const expandir = (lista: string[], tudo: string[]) =>
            lista.includes('*') ? [...tudo] : lista;

        const pedidos = proprias
            ? { modulos: proprias.modulos, accoes: proprias.accoes }
            : { modulos: expandir(base.modulos, todosOsModulos), accoes: expandir(base.accoes, todasAsAccoes) };

        // A licença é o tecto. O dono pode dar menos do que comprou, nunca mais.
        const modulos = pedidos.modulos.filter(m => licenca.includes(m));

        // Uma acção de um módulo que a pessoa não abre não serve de nada, e
        // deixá-la ligada confundia quem está a configurar.
        const accoes = pedidos.accoes.filter(chave => {
            const a = PermissaoService.ACCOES.find(x => x.chave === chave);
            if (!a) return false;
            return !a.modulo || modulos.includes(a.modulo);
        });

        return {
            papel, empresaId,
            modulos: [...new Set([...PermissaoService.MODULOS_SEMPRE, ...modulos])],
            accoes,
            proprias: !!proprias,
        };
    }

    /** Lê a coluna `permissoes`, que pode vir como texto, objecto ou lixo. */
    private static lerGuardadas(valor: any): { modulos: string[]; accoes: string[] } | null {
        if (!valor) return null;
        try {
            const o = typeof valor === 'string' ? JSON.parse(valor) : valor;
            if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
            const lista = (x: any) => (Array.isArray(x) ? x.filter((i: any) => typeof i === 'string') : []);
            // Um objecto sem nenhuma das duas chaves é lixo, não "sem permissões".
            if (!Array.isArray(o.modulos) && !Array.isArray(o.accoes)) return null;
            return { modulos: lista(o.modulos), accoes: lista(o.accoes) };
        } catch {
            return null;
        }
    }

    /** Esta pessoa pode fazer isto? */
    public static async pode(utilizadorId: string, accao: string): Promise<boolean> {
        const p = await PermissaoService.efectivas(utilizadorId);
        return p.accoes.includes(accao);
    }

    /** Esta pessoa abre este módulo? */
    public static async abreModulo(utilizadorId: string, modulo: string): Promise<boolean> {
        if (PermissaoService.MODULOS_SEMPRE.includes(modulo)) return true;
        const p = await PermissaoService.efectivas(utilizadorId);
        return p.modulos.includes(modulo);
    }

    /**
     * Grava as permissões de alguém. Devolve o que ficou gravado para quem
     * chama poder registar na auditoria o que mudou.
     */
    public static async guardar(
        utilizadorId: string,
        modulos: string[],
        accoes: string[]
    ): Promise<{ modulos: string[]; accoes: string[] }> {
        const validos = LicencaService.TODOS;
        const chaves = PermissaoService.ACCOES.map(a => a.chave);

        const limpo = {
            modulos: [...new Set(modulos)].filter(m => validos.includes(m)),
            accoes: [...new Set(accoes)].filter(a => chaves.includes(a)),
        };

        const { error } = await supabase.from('perfis').update({ permissoes: limpo }).eq('id', utilizadorId);
        if (error) throw new Error(error.message);
        return limpo;
    }

    /** Volta a pessoa ao que o papel dela dá por omissão. */
    public static async repor(utilizadorId: string): Promise<void> {
        const { error } = await supabase.from('perfis').update({ permissoes: null }).eq('id', utilizadorId);
        if (error) throw new Error(error.message);
    }
}
