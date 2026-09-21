export const API = import.meta.env.VITE_API_URL;

export const authFetch = (url: string, options: any = {}) => {
    const token = localStorage.getItem('os_auth_token');
    const headers: any = { ...options.headers, Authorization: `Bearer ${token}` };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    return fetch(url, { ...options, headers });
};

export const AREAS = ['Legal & Licenças', 'Financeiro', 'RH', 'Clientes', 'Fornecedores', 'Operações', 'Qualidade & Segurança', 'Outros'];

export const COR = { accent: '#0854A0', ink: '#1D2D3E', muted: '#5B738B', faint: '#8996A3', border: '#D5D7DA', borderSoft: '#E7E9EB', canvas: '#F5F6F7', good: '#107E3E', warn: '#DF6E0C', bad: '#BB0000' };

export const ROTULO_CICLO: Record<string, string> = {
    DRAFT: 'Rascunho', PENDING_REVIEW: 'Por rever', IN_REVIEW: 'Em revisão', PENDING_APPROVAL: 'Aguarda aprovação',
    APPROVED: 'Aprovado', REJECTED: 'Rejeitado', PENDING_SIGNATURE: 'Aguarda assinatura', SIGNED: 'Assinado',
    ACTIVE: 'Ativo', EXPIRED: 'Caducado', ARCHIVED: 'Arquivado', RETENTION_PENDING: 'Em retenção', DELETED: 'Eliminado'
};
export const COR_CICLO: Record<string, { c: string; bg: string }> = {
    DRAFT: { c: COR.muted, bg: COR.borderSoft }, PENDING_REVIEW: { c: COR.warn, bg: '#FCEFDD' }, IN_REVIEW: { c: COR.warn, bg: '#FCEFDD' },
    PENDING_APPROVAL: { c: COR.accent, bg: '#E4EDF7' }, APPROVED: { c: COR.good, bg: '#DCEEE2' }, REJECTED: { c: COR.bad, bg: '#F6DEDE' },
    PENDING_SIGNATURE: { c: COR.accent, bg: '#E4EDF7' }, SIGNED: { c: COR.good, bg: '#DCEEE2' }, ACTIVE: { c: COR.good, bg: '#DCEEE2' },
    EXPIRED: { c: COR.bad, bg: '#F6DEDE' }, ARCHIVED: { c: COR.faint, bg: COR.borderSoft }, RETENTION_PENDING: { c: COR.warn, bg: '#FCEFDD' }, DELETED: { c: COR.bad, bg: '#F6DEDE' }
};

export interface Doc {
    id: string; codigo: string | null; titulo: string; descricao?: string | null; nome_ficheiro: string; url: string | null; mime_type: string; tamanho: number;
    area: string; tipo: string | null; tipo_id: number | null; resumo: string | null; campos: Record<string, any>; metadados: Record<string, any>;
    data_documento: string | null; validade: string | null;
    entidade_tipo: string | null; entidade_id: string | null; entidade_nome: string | null;
    origem: string; origem_ref?: string | null; origem_detalhe: string | null; estado: string; ciclo: string; confidencialidade: string; versao_atual: number;
    pasta_id: number | null; responsavel_id: string | null; criado_por: string | null; confianca: number | null; erro: string | null; criado_em: string; texto?: string;
    nivel_acesso?: string;
}

export interface TipoDoc {
    id: number; nome: string; prefixo: string; area_padrao: string; confidencialidade_padrao: string; tem_validade: boolean; ativo: boolean;
    campos: { chave: string; rotulo: string; tipo: 'texto' | 'numero' | 'moeda' | 'data' | 'boolean' | 'selecao'; opcoes?: string[]; obrigatorio?: boolean }[];
}

export const diasAte = (data: string | null): number | null => {
    if (!data) return null;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return Math.round((new Date(data + 'T00:00:00').getTime() - hoje.getTime()) / 86400000);
};
export const fmtData = (d: string | null | undefined) => d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-PT') : '—';
export const fmtDataHora = (d: string | null | undefined) => d ? new Date(d).toLocaleString('pt-PT') : '—';
export const fmtTam = (n: number) => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export const btn = (primario = false, perigo = false): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '2px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
    border: primario ? 'none' : `1px solid ${perigo ? '#fecaca' : COR.border}`, background: primario ? COR.accent : 'white', color: primario ? 'white' : perigo ? COR.bad : COR.ink
});
export const input: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: '2px', border: `1px solid ${COR.border}`, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' };
export const label: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 700, color: COR.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' };

export const ROTULO_ACAO: Record<string, string> = {
    upload: 'Carregado', classificado: 'Classificado pela IA', confirmado: 'Confirmado', ver: 'Consultado', descarregar: 'Descarregado', editar: 'Alterado',
    transicao: 'Mudança de estado', nova_versao: 'Nova versão', restaurar_versao: 'Versão restaurada', apagar_definitivo: 'Apagado definitivamente',
    acesso_concedido: 'Acesso concedido', acesso_revogado: 'Acesso revogado', acesso_negado: 'Acesso negado', reprocessar: 'Reprocessado',
    pesquisa: 'Pesquisa', tipo_criado: 'Tipo criado', tipo_alterado: 'Tipo alterado', definicoes_captura: 'Captura alterada', permissoes_area: 'Permissões de área alteradas',
    fluxo_iniciado: 'Submetido a aprovação', aprovou: 'Aprovou', rejeitou: 'Rejeitou', delegou: 'Delegou', escalado: 'Escalado por prazo', fluxo_cancelado: 'Aprovação cancelada',
    fluxo_criado: 'Fluxo criado', fluxo_editado: 'Fluxo alterado', enviado_email: 'Enviado por email'
};

export const ROTULO_TAREFA: Record<string, string> = { pendente: 'Pendente', aprovada: 'Aprovada', rejeitada: 'Rejeitada', delegada: 'Delegada', cancelada: 'Cancelada', escalada: 'Escalada' };
export const COR_TAREFA: Record<string, { c: string; bg: string }> = {
    pendente: { c: COR.accent, bg: '#E4EDF7' }, aprovada: { c: COR.good, bg: '#DCEEE2' }, rejeitada: { c: COR.bad, bg: '#F6DEDE' },
    delegada: { c: COR.muted, bg: COR.borderSoft }, cancelada: { c: COR.faint, bg: COR.borderSoft }, escalada: { c: COR.warn, bg: '#FCEFDD' }
};
export const ROTULO_ENTIDADE: Record<string, string> = { cliente: 'Cliente', colaborador: 'Colaborador', ativo: 'Ativo', negocio: 'Negócio' };

export const usuarioAtual = (): { id?: string; role?: string; nome?: string } => { try { return JSON.parse(localStorage.getItem('os_auth_user') || '{}'); } catch { return {}; } };
export const horasRestantes = (prazo: string | null): string | null => {
    if (!prazo) return null;
    const ms = new Date(prazo).getTime() - Date.now();
    const h = Math.round(Math.abs(ms) / 3600000);
    const txt = h < 48 ? `${h} h` : `${Math.round(h / 24)} dia${Math.round(h / 24) === 1 ? '' : 's'}`;
    return ms < 0 ? `atrasada ${txt}` : `faltam ${txt}`;
};
