/**
 * Ciclo de vida de um documento (máquina de estados).
 *
 * Distinto do estado de PROCESSAMENTO (a_processar / arquivado / por_rever /
 * descartado / erro), que só diz se a IA já o leu e se um humano já o
 * confirmou. O ciclo diz em que ponto da vida útil o documento está.
 *
 * Só se listam aqui transições que têm uma ação real por trás. As de
 * aprovação pertencem ao motor de fluxos (DocumentosFluxoService) e só ele
 * as executa (ator 'workflow'); as de assinatura ficam ativas quando as
 * assinaturas (Fase D) existirem — até lá são recusadas com um motivo claro,
 * em vez de aparecerem como botões que não fazem nada.
 */
export type Ciclo =
    | 'DRAFT' | 'PENDING_REVIEW' | 'IN_REVIEW' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'
    | 'PENDING_SIGNATURE' | 'SIGNED' | 'ACTIVE' | 'EXPIRED' | 'ARCHIVED' | 'RETENTION_PENDING' | 'DELETED';

export const CICLOS: Ciclo[] = [
    'DRAFT', 'PENDING_REVIEW', 'IN_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED',
    'PENDING_SIGNATURE', 'SIGNED', 'ACTIVE', 'EXPIRED', 'ARCHIVED', 'RETENTION_PENDING', 'DELETED'
];

export const ROTULO_CICLO: Record<Ciclo, string> = {
    DRAFT: 'Rascunho', PENDING_REVIEW: 'Por rever', IN_REVIEW: 'Em revisão', PENDING_APPROVAL: 'Aguarda aprovação',
    APPROVED: 'Aprovado', REJECTED: 'Rejeitado', PENDING_SIGNATURE: 'Aguarda assinatura', SIGNED: 'Assinado',
    ACTIVE: 'Ativo', EXPIRED: 'Caducado', ARCHIVED: 'Arquivado', RETENTION_PENDING: 'Em retenção', DELETED: 'Eliminado'
};

// Quem pode pedir a transição: 'utilizador' (ação manual no ecrã), 'sistema'
// (automática: IA arquivou, validade passou, retenção venceu), 'workflow' (Fase C).
type Ator = 'utilizador' | 'sistema' | 'workflow';

interface Regra { para: Ciclo; atores: Ator[]; disponivel: boolean; motivoIndisponivel?: string; exigeMotivo?: boolean }

const AGUARDA_ASSINATURA = 'Disponível quando as assinaturas eletrónicas (Fase D) estiverem ativas.';
const AGUARDA_RETENCAO = 'Disponível quando as políticas de retenção (Fase D) estiverem ativas.';

const REGRAS: Record<Ciclo, Regra[]> = {
    DRAFT: [
        { para: 'ACTIVE', atores: ['utilizador', 'sistema'], disponivel: true },
        { para: 'PENDING_APPROVAL', atores: ['workflow'], disponivel: true },
        { para: 'DELETED', atores: ['utilizador'], disponivel: true, exigeMotivo: true },
    ],
    PENDING_REVIEW: [
        { para: 'IN_REVIEW', atores: ['utilizador'], disponivel: true },
        { para: 'ACTIVE', atores: ['utilizador'], disponivel: true },
        { para: 'DELETED', atores: ['utilizador'], disponivel: true, exigeMotivo: true },
    ],
    IN_REVIEW: [
        { para: 'ACTIVE', atores: ['utilizador'], disponivel: true },
        { para: 'DRAFT', atores: ['utilizador'], disponivel: true, exigeMotivo: true },
        { para: 'PENDING_APPROVAL', atores: ['workflow'], disponivel: true },
    ],
    PENDING_APPROVAL: [
        { para: 'APPROVED', atores: ['workflow'], disponivel: true },   // aprovação final, ou cancelamento de uma resubmissão
        { para: 'REJECTED', atores: ['workflow'], disponivel: true, exigeMotivo: true },
        // cancelamento do processo: volta ao estado em que estava
        { para: 'DRAFT', atores: ['workflow'], disponivel: true, exigeMotivo: true },
        { para: 'IN_REVIEW', atores: ['workflow'], disponivel: true, exigeMotivo: true },
        { para: 'ACTIVE', atores: ['workflow'], disponivel: true, exigeMotivo: true },
    ],
    APPROVED: [
        { para: 'PENDING_SIGNATURE', atores: ['workflow'], disponivel: false, motivoIndisponivel: AGUARDA_ASSINATURA },
        { para: 'ACTIVE', atores: ['workflow', 'utilizador'], disponivel: true },
        { para: 'PENDING_APPROVAL', atores: ['workflow'], disponivel: true },
    ],
    REJECTED: [
        { para: 'DRAFT', atores: ['utilizador'], disponivel: true },
        { para: 'DELETED', atores: ['utilizador'], disponivel: true, exigeMotivo: true },
    ],
    PENDING_SIGNATURE: [
        { para: 'SIGNED', atores: ['workflow'], disponivel: false, motivoIndisponivel: AGUARDA_ASSINATURA },
    ],
    SIGNED: [
        { para: 'ACTIVE', atores: ['workflow', 'sistema'], disponivel: false, motivoIndisponivel: AGUARDA_ASSINATURA },
    ],
    ACTIVE: [
        { para: 'PENDING_APPROVAL', atores: ['workflow'], disponivel: true },   // ex.: renovação de contrato submetida a aprovação
        { para: 'EXPIRED', atores: ['sistema'], disponivel: true },
        { para: 'ARCHIVED', atores: ['utilizador'], disponivel: true },
        { para: 'RETENTION_PENDING', atores: ['sistema'], disponivel: false, motivoIndisponivel: AGUARDA_RETENCAO },
        { para: 'DELETED', atores: ['utilizador'], disponivel: true, exigeMotivo: true },
    ],
    EXPIRED: [
        { para: 'ACTIVE', atores: ['utilizador'], disponivel: true, exigeMotivo: true },   // renovado: nova versão/validade
        { para: 'ARCHIVED', atores: ['utilizador'], disponivel: true },
        { para: 'DELETED', atores: ['utilizador'], disponivel: true, exigeMotivo: true },
    ],
    ARCHIVED: [
        { para: 'ACTIVE', atores: ['utilizador'], disponivel: true, exigeMotivo: true },
        { para: 'RETENTION_PENDING', atores: ['sistema'], disponivel: false, motivoIndisponivel: AGUARDA_RETENCAO },
        { para: 'DELETED', atores: ['utilizador'], disponivel: true, exigeMotivo: true },
    ],
    RETENTION_PENDING: [
        { para: 'ARCHIVED', atores: ['utilizador'], disponivel: false, motivoIndisponivel: AGUARDA_RETENCAO },
        { para: 'DELETED', atores: ['utilizador'], disponivel: false, motivoIndisponivel: AGUARDA_RETENCAO, exigeMotivo: true },
    ],
    DELETED: [
        { para: 'ACTIVE', atores: ['utilizador'], disponivel: true, exigeMotivo: true },   // restauro
    ],
};

export class DocumentosCicloService {
    /** Transições possíveis a partir de um estado, com indicação das que ainda não estão ativas. */
    public static opcoes(de: Ciclo, ator: Ator = 'utilizador'): { para: Ciclo; rotulo: string; disponivel: boolean; motivo?: string; exigeMotivo: boolean }[] {
        return (REGRAS[de] || [])
            .filter(r => r.atores.includes(ator))
            .map(r => ({ para: r.para, rotulo: ROTULO_CICLO[r.para], disponivel: r.disponivel, motivo: r.motivoIndisponivel, exigeMotivo: !!r.exigeMotivo }));
    }

    /** Valida uma transição. Devolve o erro (string) ou null se for permitida. */
    public static validar(de: Ciclo, para: Ciclo, ator: Ator, motivo?: string): string | null {
        if (!CICLOS.includes(de) || !CICLOS.includes(para)) return 'Estado desconhecido.';
        if (de === para) return `O documento já está em "${ROTULO_CICLO[para]}".`;
        const regra = (REGRAS[de] || []).find(r => r.para === para);
        if (!regra) return `Não é possível passar de "${ROTULO_CICLO[de]}" para "${ROTULO_CICLO[para]}".`;
        if (!regra.atores.includes(ator)) return `Esta transição não pode ser feita manualmente.`;
        if (!regra.disponivel) return regra.motivoIndisponivel || 'Transição ainda não disponível.';
        if (regra.exigeMotivo && !(motivo || '').trim()) return 'Indique o motivo.';
        return null;
    }
}
