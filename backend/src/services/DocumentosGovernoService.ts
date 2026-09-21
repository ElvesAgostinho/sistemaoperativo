import crypto from 'crypto';
import { supabase } from '../lib/supabaseClient';
import { MediaUploadService } from './MediaUploadService';
import { DocumentosCicloService, Ciclo } from './DocumentosCicloService';

export interface CampoTipo {
    chave: string; rotulo: string;
    tipo: 'texto' | 'numero' | 'moeda' | 'data' | 'boolean' | 'selecao';
    opcoes?: string[]; obrigatorio?: boolean;
}

export interface Utilizador { id: string; nome?: string; role: string; empresa_id: string; ip?: string }

// Tipos criados automaticamente para cada empresa na primeira utilização.
// O admin pode alterá-los, desativá-los ou criar outros.
const TIPOS_PADRAO: { nome: string; prefixo: string; area: string; conf: 'Normal' | 'Confidencial' | 'Restrito'; validade: boolean; campos: CampoTipo[] }[] = [
    { nome: 'Contrato', prefixo: 'CTR', area: 'Clientes', conf: 'Confidencial', validade: true, campos: [
        { chave: 'contraparte', rotulo: 'Contraparte', tipo: 'texto' }, { chave: 'nif', rotulo: 'NIF', tipo: 'texto' },
        { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' }, { chave: 'data_inicio', rotulo: 'Início', tipo: 'data' },
        { chave: 'renovacao_automatica', rotulo: 'Renovação automática', tipo: 'boolean' }, { chave: 'aviso_dias', rotulo: 'Aviso prévio (dias)', tipo: 'numero' } ] },
    { nome: 'Fatura', prefixo: 'FAT', area: 'Financeiro', conf: 'Normal', validade: false, campos: [
        { chave: 'emissor', rotulo: 'Emissor', tipo: 'texto' }, { chave: 'nif', rotulo: 'NIF', tipo: 'texto' }, { chave: 'numero', rotulo: 'Nº da fatura', tipo: 'texto' },
        { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' }, { chave: 'vencimento', rotulo: 'Vencimento', tipo: 'data' }, { chave: 'pago', rotulo: 'Pago', tipo: 'boolean' } ] },
    { nome: 'Recibo', prefixo: 'REC', area: 'Financeiro', conf: 'Normal', validade: false, campos: [
        { chave: 'emissor', rotulo: 'Emissor', tipo: 'texto' }, { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' }, { chave: 'numero', rotulo: 'Número', tipo: 'texto' } ] },
    { nome: 'Proforma', prefixo: 'PRO', area: 'Clientes', conf: 'Normal', validade: true, campos: [
        { chave: 'cliente', rotulo: 'Cliente', tipo: 'texto' }, { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' } ] },
    { nome: 'Licença', prefixo: 'LIC', area: 'Legal & Licenças', conf: 'Normal', validade: true, campos: [
        { chave: 'emissor', rotulo: 'Entidade emissora', tipo: 'texto' }, { chave: 'numero', rotulo: 'Número', tipo: 'texto' } ] },
    { nome: 'Alvará', prefixo: 'ALV', area: 'Legal & Licenças', conf: 'Normal', validade: true, campos: [
        { chave: 'emissor', rotulo: 'Entidade emissora', tipo: 'texto' }, { chave: 'numero', rotulo: 'Número', tipo: 'texto' }, { chave: 'atividade', rotulo: 'Atividade', tipo: 'texto' } ] },
    { nome: 'Certidão', prefixo: 'CRT', area: 'Legal & Licenças', conf: 'Normal', validade: true, campos: [
        { chave: 'emissor', rotulo: 'Entidade emissora', tipo: 'texto' }, { chave: 'numero', rotulo: 'Número', tipo: 'texto' } ] },
    { nome: 'Certificado', prefixo: 'CER', area: 'Qualidade & Segurança', conf: 'Normal', validade: true, campos: [
        { chave: 'emissor', rotulo: 'Entidade emissora', tipo: 'texto' }, { chave: 'norma', rotulo: 'Norma / âmbito', tipo: 'texto' } ] },
    { nome: 'Identificação', prefixo: 'IDN', area: 'RH', conf: 'Restrito', validade: true, campos: [
        { chave: 'titular', rotulo: 'Titular', tipo: 'texto' }, { chave: 'numero', rotulo: 'Número', tipo: 'texto' },
        { chave: 'tipo_doc', rotulo: 'Tipo', tipo: 'selecao', opcoes: ['BI', 'Passaporte', 'NIF', 'Cartão de residente', 'Outro'] } ] },
    { nome: 'Contrato de trabalho', prefixo: 'CTT', area: 'RH', conf: 'Restrito', validade: true, campos: [
        { chave: 'colaborador', rotulo: 'Colaborador', tipo: 'texto' }, { chave: 'cargo', rotulo: 'Cargo', tipo: 'texto' },
        { chave: 'data_admissao', rotulo: 'Admissão', tipo: 'data' }, { chave: 'vencimento', rotulo: 'Vencimento', tipo: 'moeda' } ] },
    { nome: 'Declaração', prefixo: 'DEC', area: 'RH', conf: 'Confidencial', validade: false, campos: [ { chave: 'titular', rotulo: 'Titular', tipo: 'texto' } ] },
    { nome: 'Relatório', prefixo: 'REL', area: 'Operações', conf: 'Normal', validade: false, campos: [ { chave: 'autor', rotulo: 'Autor', tipo: 'texto' }, { chave: 'periodo', rotulo: 'Período', tipo: 'texto' } ] },
    { nome: 'Ata', prefixo: 'ATA', area: 'Operações', conf: 'Normal', validade: false, campos: [ { chave: 'reuniao', rotulo: 'Reunião', tipo: 'texto' }, { chave: 'data_reuniao', rotulo: 'Data', tipo: 'data' } ] },
    { nome: 'Manual', prefixo: 'MAN', area: 'Operações', conf: 'Normal', validade: false, campos: [ { chave: 'equipamento', rotulo: 'Equipamento', tipo: 'texto' }, { chave: 'fabricante', rotulo: 'Fabricante', tipo: 'texto' } ] },
    { nome: 'Ficha Técnica', prefixo: 'FTC', area: 'Operações', conf: 'Normal', validade: false, campos: [ { chave: 'produto', rotulo: 'Produto', tipo: 'texto' } ] },
    { nome: 'Ficha de Segurança', prefixo: 'FDS', area: 'Qualidade & Segurança', conf: 'Normal', validade: true, campos: [ { chave: 'produto', rotulo: 'Produto', tipo: 'texto' }, { chave: 'fabricante', rotulo: 'Fabricante', tipo: 'texto' } ] },
    { nome: 'Guia de Remessa', prefixo: 'GRM', area: 'Fornecedores', conf: 'Normal', validade: false, campos: [ { chave: 'fornecedor', rotulo: 'Fornecedor', tipo: 'texto' }, { chave: 'numero', rotulo: 'Número', tipo: 'texto' } ] },
    { nome: 'Documento Alfandegário', prefixo: 'ALF', area: 'Fornecedores', conf: 'Normal', validade: false, campos: [ { chave: 'numero', rotulo: 'Número', tipo: 'texto' }, { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' } ] },
    { nome: 'Apólice', prefixo: 'APL', area: 'Legal & Licenças', conf: 'Confidencial', validade: true, campos: [ { chave: 'seguradora', rotulo: 'Seguradora', tipo: 'texto' }, { chave: 'numero', rotulo: 'Nº da apólice', tipo: 'texto' }, { chave: 'premio', rotulo: 'Prémio', tipo: 'moeda' } ] },
    { nome: 'Comprovativo', prefixo: 'CMP', area: 'Financeiro', conf: 'Normal', validade: false, campos: [ { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' }, { chave: 'referencia', rotulo: 'Referência', tipo: 'texto' } ] },
    { nome: 'Correspondência', prefixo: 'COR', area: 'Outros', conf: 'Normal', validade: false, campos: [ { chave: 'remetente', rotulo: 'Remetente', tipo: 'texto' }, { chave: 'assunto', rotulo: 'Assunto', tipo: 'texto' } ] },
    { nome: 'Outro', prefixo: 'DOC', area: 'Outros', conf: 'Normal', validade: false, campos: [] },
];

export class DocumentosGovernoService {

    // ============================================================
    // TIPOS DE DOCUMENTO
    // ============================================================
    public static async tipos(empresaId: string): Promise<any[]> {
        let { data } = await supabase.from('documento_tipos').select('*').eq('empresa_id', empresaId).order('nome');
        if (!data || data.length === 0) {
            const { error } = await supabase.from('documento_tipos').insert(TIPOS_PADRAO.map(t => ({
                empresa_id: empresaId, nome: t.nome, prefixo: t.prefixo, area_padrao: t.area,
                confidencialidade_padrao: t.conf, tem_validade: t.validade, campos: t.campos
            })));
            if (error && !/duplicate/i.test(error.message)) throw error;
            ({ data } = await supabase.from('documento_tipos').select('*').eq('empresa_id', empresaId).order('nome'));
        }
        return data || [];
    }

    /** Encontra o tipo pelo nome que a IA devolveu (tolerante a acentos/maiúsculas). */
    public static async tipoPorNome(empresaId: string, nome: string | null): Promise<any | null> {
        const lista = await this.tipos(empresaId);
        const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
        const alvo = norm(nome || '');
        return lista.find(t => t.ativo && norm(t.nome) === alvo)
            || lista.find(t => t.ativo && alvo && (norm(t.nome).includes(alvo) || alvo.includes(norm(t.nome))))
            || lista.find(t => t.nome === 'Outro') || null;
    }

    /**
     * Converte um valor como as pessoas o escrevem em Angola/Portugal para
     * número: "25.000.000", "25.000,50 Kz", "1 250,00", "3500" — o último
     * separador decide se é decimal; os outros são milhares.
     */
    public static numeroDe(v: any): number | null {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'number') return isFinite(v) ? v : null;
        let s = String(v).replace(/[^\d.,-]/g, '');
        if (!s) return null;
        const ultPonto = s.lastIndexOf('.'), ultVirg = s.lastIndexOf(',');
        if (ultPonto !== -1 && ultVirg !== -1) {
            // Ambos presentes: o último é o decimal.
            const decimal = ultPonto > ultVirg ? '.' : ',';
            s = s.split(decimal === '.' ? ',' : '.').join('');
            s = s.replace(decimal, '.');
        } else if (ultPonto !== -1 || ultVirg !== -1) {
            const sep = ultPonto !== -1 ? '.' : ',';
            const partes = s.split(sep);
            // Vários separadores, ou um só com exatamente 3 dígitos a seguir: milhares.
            const ehMilhar = partes.length > 2 || (partes.length === 2 && partes[1].length === 3);
            s = ehMilhar ? partes.join('') : partes.join('.');
        }
        const n = Number(s);
        return isFinite(n) ? n : null;
    }

    /** Preenche os metadados do tipo a partir dos campos soltos que a IA extraiu. */
    public static metadadosDe(tipo: any, camposIA: Record<string, any>): Record<string, any> {
        const out: Record<string, any> = {};
        const campos: CampoTipo[] = Array.isArray(tipo?.campos) ? tipo.campos : [];
        const ia = camposIA || {};
        const sinonimos: Record<string, string[]> = {
            contraparte: ['contraparte', 'destinatario', 'cliente', 'fornecedor', 'emissor'],
            emissor: ['emissor', 'entidade_emissora'], cliente: ['cliente', 'destinatario'], fornecedor: ['fornecedor', 'emissor'],
            titular: ['titular', 'destinatario', 'nome'], colaborador: ['colaborador', 'titular', 'nome'],
            numero: ['numero', 'numero_documento', 'referencia'], valor: ['valor', 'total', 'montante'],
            vencimento: ['vencimento', 'data_vencimento'], data_inicio: ['data_inicio', 'inicio'], data_admissao: ['data_admissao', 'admissao'],
        };
        for (const c of campos) {
            const chaves = [c.chave, ...(sinonimos[c.chave] || [])];
            const v = chaves.map(k => ia[k]).find(x => x !== undefined && x !== null && x !== '');
            if (v !== undefined) out[c.chave] = (c.tipo === 'numero' || c.tipo === 'moeda') ? (this.numeroDe(v) ?? v) : v;
        }
        return out;
    }

    public static validarMetadados(tipo: any, metadados: Record<string, any>): string | null {
        const campos: CampoTipo[] = Array.isArray(tipo?.campos) ? tipo.campos : [];
        for (const c of campos) {
            const v = metadados?.[c.chave];
            if (c.obrigatorio && (v === undefined || v === null || v === '')) return `O campo "${c.rotulo}" é obrigatório.`;
            if (v === undefined || v === null || v === '') continue;
            if ((c.tipo === 'numero' || c.tipo === 'moeda') && this.numeroDe(v) === null) return `"${c.rotulo}" tem de ser um número.`;
            if (c.tipo === 'data' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return `"${c.rotulo}" tem de ser uma data (AAAA-MM-DD).`;
            if (c.tipo === 'selecao' && c.opcoes?.length && !c.opcoes.includes(String(v))) return `"${c.rotulo}" tem de ser uma das opções: ${c.opcoes.join(', ')}.`;
        }
        return null;
    }

    // ============================================================
    // CÓDIGO DOCUMENTAL
    // ============================================================
    public static async atribuirCodigo(empresaId: string, documentoId: string, prefixo: string): Promise<string | null> {
        const { data, error } = await supabase.rpc('proximo_codigo_documento', { p_empresa_id: empresaId, p_prefixo: (prefixo || 'DOC').toUpperCase().slice(0, 6) });
        if (error) { console.error('[Documentos] Falha a gerar código:', error.message); return null; }
        await supabase.from('documentos').update({ codigo: data }).eq('id', documentoId).is('codigo', null);
        return data;
    }

    // ============================================================
    // CICLO DE VIDA
    // ============================================================
    public static async transitar(doc: any, para: Ciclo, ator: 'utilizador' | 'sistema' | 'workflow', user: Utilizador | null, motivo?: string): Promise<{ ok: boolean; erro?: string }> {
        const erro = DocumentosCicloService.validar(doc.ciclo as Ciclo, para, ator, motivo);
        if (erro) return { ok: false, erro };

        const alt: any = { ciclo: para, atualizado_em: new Date().toISOString() };
        if (para === 'ARCHIVED') alt.arquivado_em = new Date().toISOString();
        if (para === 'DELETED') alt.eliminado_em = new Date().toISOString();
        if (para === 'ACTIVE' && (doc.ciclo === 'DELETED' || doc.ciclo === 'ARCHIVED')) { alt.eliminado_em = null; alt.arquivado_em = null; }

        const { error } = await supabase.from('documentos').update(alt).eq('id', doc.id).eq('empresa_id', doc.empresa_id);
        if (error) return { ok: false, erro: error.message };
        await this.auditar(doc.empresa_id, user, 'transicao', doc, { de: doc.ciclo, para, motivo: motivo || null, ator });
        return { ok: true };
    }

    /** Documentos ativos cuja validade já passou caducam sozinhos (corre no poller). */
    public static async caducarVencidos(): Promise<number> {
        const hoje = new Date().toISOString().slice(0, 10);
        const { data } = await supabase.from('documentos').select('id, empresa_id, titulo, ciclo, validade')
            .eq('ciclo', 'ACTIVE').not('validade', 'is', null).lt('validade', hoje).limit(200);
        let n = 0;
        for (const d of (data || [])) {
            const r = await this.transitar(d, 'EXPIRED', 'sistema', null, `Validade ${d.validade} ultrapassada.`);
            if (r.ok) n++;
        }
        return n;
    }

    // ============================================================
    // VERSÕES
    // ============================================================
    public static async registarVersaoInicial(empresaId: string, doc: { id: string; storage_path: string; nome_ficheiro: string; mime_type: string; tamanho: number; hash: string }, criadoPor?: string) {
        await supabase.from('documento_versoes').insert({
            empresa_id: empresaId, documento_id: doc.id, numero: 1, storage_path: doc.storage_path, nome_ficheiro: doc.nome_ficheiro,
            mime_type: doc.mime_type, tamanho: doc.tamanho, hash: doc.hash, comentario: 'Versão inicial', criado_por: criadoPor || null
        });
    }

    public static async novaVersao(doc: any, buffer: Buffer, nomeFicheiro: string, mimeType: string, comentario: string, user: Utilizador): Promise<{ numero: number }> {
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        const storagePath = await MediaUploadService.guardarDocumento(buffer, doc.empresa_id, nomeFicheiro, mimeType);
        const numero = (doc.versao_atual || 1) + 1;

        const { error } = await supabase.from('documento_versoes').insert({
            empresa_id: doc.empresa_id, documento_id: doc.id, numero, storage_path: storagePath, nome_ficheiro: nomeFicheiro,
            mime_type: mimeType, tamanho: buffer.length, hash, comentario: comentario || null, criado_por: user.id
        });
        if (error) throw error;

        await supabase.from('documentos').update({
            storage_path: storagePath, nome_ficheiro: nomeFicheiro, mime_type: mimeType, tamanho: buffer.length, hash,
            versao_atual: numero, atualizado_em: new Date().toISOString()
        }).eq('id', doc.id);

        await this.auditar(doc.empresa_id, user, 'nova_versao', doc, { numero, comentario, nome_ficheiro: nomeFicheiro });
        return { numero };
    }

    /** Restaurar = criar uma versão nova a partir de uma antiga. O histórico nunca se apaga. */
    public static async restaurarVersao(doc: any, numeroOrigem: number, user: Utilizador): Promise<{ numero: number }> {
        const { data: origem } = await supabase.from('documento_versoes').select('*').eq('documento_id', doc.id).eq('numero', numeroOrigem).maybeSingle();
        if (!origem) throw new Error('Versão não encontrada.');
        const numero = (doc.versao_atual || 1) + 1;
        const { error } = await supabase.from('documento_versoes').insert({
            empresa_id: doc.empresa_id, documento_id: doc.id, numero, storage_path: origem.storage_path, nome_ficheiro: origem.nome_ficheiro,
            mime_type: origem.mime_type, tamanho: origem.tamanho, hash: origem.hash, comentario: `Restauro da versão ${numeroOrigem}`,
            restaurada_de: numeroOrigem, criado_por: user.id
        });
        if (error) throw error;
        await supabase.from('documentos').update({
            storage_path: origem.storage_path, nome_ficheiro: origem.nome_ficheiro, mime_type: origem.mime_type, tamanho: origem.tamanho, hash: origem.hash,
            versao_atual: numero, atualizado_em: new Date().toISOString()
        }).eq('id', doc.id);
        await this.auditar(doc.empresa_id, user, 'restaurar_versao', doc, { numero, de: numeroOrigem });
        return { numero };
    }

    public static async versoes(documentoId: string): Promise<any[]> {
        const { data } = await supabase.from('documento_versoes').select('*').eq('documento_id', documentoId).order('numero', { ascending: false });
        return Promise.all((data || []).map(async (v: any) => ({ ...v, url: await MediaUploadService.assinarDocumento(v.storage_path, 900) })));
    }

    // ============================================================
    // PASTAS
    // ============================================================
    public static async pastas(empresaId: string): Promise<any[]> {
        const { data } = await supabase.from('documento_pastas').select('*').eq('empresa_id', empresaId).order('nome');
        const { data: contagem } = await supabase.from('documentos').select('pasta_id').eq('empresa_id', empresaId).eq('estado', 'arquivado').not('pasta_id', 'is', null);
        const n: Record<string, number> = {};
        for (const d of (contagem || [])) n[String(d.pasta_id)] = (n[String(d.pasta_id)] || 0) + 1;
        return (data || []).map((p: any) => ({ ...p, documentos: n[String(p.id)] || 0 }));
    }

    /** Impede ciclos (mover uma pasta para dentro de si própria ou de uma descendente). */
    public static async ehDescendente(empresaId: string, pastaId: number, possivelAncestral: number): Promise<boolean> {
        let atual: number | null = possivelAncestral;
        for (let i = 0; i < 50 && atual !== null; i++) {
            if (atual === pastaId) return true;
            const r: any = await supabase.from('documento_pastas').select('parent_id').eq('id', atual).eq('empresa_id', empresaId).maybeSingle();
            atual = (r.data?.parent_id ?? null) as number | null;
        }
        return false;
    }

    // ============================================================
    // ACESSO POR DOCUMENTO E CONFIDENCIALIDADE
    // ============================================================
    /**
     * Regra: admins veem tudo. Um utilizador vê o documento se a área lhe for
     * permitida E (o documento é Normal, OU é o responsável, OU tem acesso
     * explícito válido). Restrito exige acesso explícito mesmo para quem tem
     * a área. O nível devolvido é o maior que se aplica.
     */
    public static async nivelDe(doc: any, user: Utilizador, areasPermitidas: string[] | null): Promise<'gerir' | 'editar' | 'ver' | null> {
        if (user.role === 'admin' || user.role === 'superadmin') return 'gerir';
        if (doc.responsavel_id === user.id || doc.criado_por === user.id) return 'gerir';

        const { data: acesso } = await supabase.from('documento_acessos').select('nivel, expira_em')
            .eq('documento_id', doc.id).eq('user_id', user.id).maybeSingle();
        const explicito = acesso && (!acesso.expira_em || new Date(acesso.expira_em) > new Date()) ? acesso.nivel : null;
        if (explicito) return explicito;

        const areaOk = !areasPermitidas || areasPermitidas.includes(doc.area);
        const normal = areaOk && doc.confidencialidade !== 'Restrito' && doc.confidencialidade !== 'Confidencial';
        if (normal) return 'editar'; // Normal + área permitida: pode ver e corrigir metadados

        // Quem foi chamado a aprovar tem de conseguir ler o que aprova, mesmo fora da sua área ou confidencial.
        const { DocumentosFluxoService } = require('./DocumentosFluxoService');
        if (await DocumentosFluxoService.temTarefaNoDocumento(doc.id, user.id)) return 'ver';
        return null;
    }

    public static async acessos(documentoId: string): Promise<any[]> {
        const { data } = await supabase.from('documento_acessos').select('*').eq('documento_id', documentoId).order('criado_em');
        const ids = (data || []).map((a: any) => a.user_id);
        if (ids.length === 0) return [];
        const { data: perfis } = await supabase.from('perfis').select('id, nome, email').in('id', ids);
        const nomes = new Map((perfis || []).map((p: any) => [p.id, p]));
        return (data || []).map((a: any) => ({ ...a, nome: nomes.get(a.user_id)?.nome || '—', email: nomes.get(a.user_id)?.email || '' }));
    }

    // ============================================================
    // AUDITORIA
    // ============================================================
    // O token só traz o email; o nome próprio vem do perfil e fica em cache
    // para não custar uma consulta por cada evento.
    private static nomesCache = new Map<string, { nome: string; ate: number }>();
    private static async nomeDe(user: Utilizador): Promise<string> {
        const c = this.nomesCache.get(user.id);
        if (c && c.ate > Date.now()) return c.nome;
        let nome = user.nome || '';
        try {
            const { data } = await supabase.from('perfis').select('nome').eq('id', user.id).maybeSingle();
            if (data?.nome) nome = data.nome;
        } catch { /* fica o email */ }
        this.nomesCache.set(user.id, { nome, ate: Date.now() + 10 * 60 * 1000 });
        return nome;
    }

    public static async auditar(empresaId: string, user: Utilizador | null, acao: string, doc: { id?: string; titulo?: string } | null, detalhes: Record<string, any> = {}, resultado = 'ok') {
        try {
            const userNome = user ? await this.nomeDe(user) : 'sistema';
            await supabase.from('documentos_auditoria').insert({
                empresa_id: empresaId, user_id: user?.id || null, user_nome: userNome || null,
                acao, documento_id: doc?.id || null, documento_titulo: doc?.titulo || null, detalhes, ip: user?.ip || null, resultado
            });
        } catch (e: any) {
            console.error('[Documentos] Falha a registar auditoria:', e.message);
        }
    }

    public static async historico(empresaId: string, documentoId?: string, limite = 200): Promise<any[]> {
        let q = supabase.from('documentos_auditoria').select('*').eq('empresa_id', empresaId).order('criado_em', { ascending: false }).limit(limite);
        if (documentoId) q = q.eq('documento_id', documentoId);
        const { data } = await q;
        return data || [];
    }
}
