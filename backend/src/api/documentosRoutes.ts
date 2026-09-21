import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { getSupabase, supabase } from '../lib/supabaseClient';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { DocumentosService } from '../services/DocumentosService';
import { DocumentosGovernoService, Utilizador } from '../services/DocumentosGovernoService';
import { DocumentosCicloService, Ciclo, CICLOS, ROTULO_CICLO } from '../services/DocumentosCicloService';
import { MediaUploadService } from '../services/MediaUploadService';
import { DocumentosFluxoService } from '../services/DocumentosFluxoService';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 20 } });

const empresaDe = (req: AuthRequest) => String(req.user!.empresa_id);
const nomeSeguro = (f: Express.Multer.File) => path.basename(Buffer.from(f.originalname, 'latin1').toString('utf8'));
const utilizador = (req: AuthRequest): Utilizador => ({
    id: req.user!.id, nome: (req.user as any).nome || req.user!.email, role: req.user!.role, empresa_id: empresaDe(req),
    ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || undefined
});
const ehAdmin = (req: AuthRequest) => ['admin', 'superadmin'].includes(req.user!.role);
const soAdmin = (req: AuthRequest, res: Response, next: NextFunction) => ehAdmin(req) ? next() : res.status(403).json({ error: 'Só administradores.' });

// Módulo pago à parte: sem "documentos" em modulos_empresa, nada aqui responde.
router.use(requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user?.empresa_id) return res.status(400).json({ error: 'Empresa não encontrada.' });
    if (!(await DocumentosService.empresaTemModulo(empresaDe(req)))) {
        return res.status(403).json({ error: 'O módulo Documentos não está incluído no seu plano. Contacte o administrador do sistema.' });
    }
    next();
});

const filtroAreas = (req: AuthRequest) => DocumentosService.areasPermitidas(empresaDe(req), req.user!.id, req.user!.role);

/**
 * Carrega um documento da própria empresa e decide o nível de acesso do
 * utilizador. Conhecer o ID nunca chega: sem nível, a resposta é 404 (não
 * 403), para não confirmar sequer que o documento existe.
 */
async function carregarComAcesso(req: AuthRequest, res: Response, minimo: 'ver' | 'editar' | 'gerir'): Promise<any | null> {
    const { data: doc } = await supabase.from('documentos').select('*').eq('id', req.params.id).eq('empresa_id', empresaDe(req)).maybeSingle();
    if (!doc) { res.status(404).json({ error: 'Documento não encontrado.' }); return null; }
    const nivel = await DocumentosGovernoService.nivelDe(doc, utilizador(req), await filtroAreas(req));
    const ordem = { ver: 1, editar: 2, gerir: 3 } as const;
    if (!nivel || ordem[nivel] < ordem[minimo]) {
        await DocumentosGovernoService.auditar(empresaDe(req), utilizador(req), 'acesso_negado', doc, { minimo }, 'negado');
        res.status(nivel ? 403 : 404).json({ error: nivel ? 'Sem permissão para esta operação.' : 'Documento não encontrado.' });
        return null;
    }
    doc.nivel_acesso = nivel;
    return doc;
}

// ============================================================
// RESUMO E LISTAGEM
// ============================================================
router.get('/resumo', async (req: AuthRequest, res: Response) => {
    try {
        const areas = await filtroAreas(req);
        let q = supabase.from('documentos').select('id, area, estado, ciclo, validade, confidencialidade, responsavel_id, criado_por')
            .eq('empresa_id', empresaDe(req)).neq('estado', 'descartado').neq('ciclo', 'DELETED');
        if (areas) q = q.in('area', areas);
        const { data: brutos } = await q;
        const data = await DocumentosService.filtrarVisiveis(brutos || [], utilizador(req));

        const porArea: Record<string, number> = {};
        let porRever = 0, aProcessar = 0, comErro = 0;
        for (const d of data) {
            if (d.estado === 'arquivado' && d.ciclo !== 'ARCHIVED') porArea[d.area] = (porArea[d.area] || 0) + 1;
            if (d.estado === 'por_rever') porRever++;
            if (d.estado === 'a_processar') aProcessar++;
            if (d.estado === 'erro') comErro++;
        }
        const conf = await DocumentosService.conformidade(empresaDe(req), areas, utilizador(req));
        const [{ count: tarefasPendentes }, { count: notificacoesNaoLidas }] = await Promise.all([
            supabase.from('documento_tarefas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaDe(req)).eq('aprovador_id', req.user!.id).eq('estado', 'pendente'),
            supabase.from('documento_notificacoes').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaDe(req)).eq('user_id', req.user!.id).eq('lida', false)
        ]);
        res.json({
            success: true,
            areas: DocumentosService.areas.map(a => ({ nome: a, total: porArea[a] || 0 })),
            porRever, aProcessar, comErro,
            tarefasPendentes: tarefasPendentes || 0, notificacoesNaoLidas: notificacoesNaoLidas || 0,
            vencidos: conf.vencidos.length, aVencer: conf.aVencer.length,
            areasPermitidas: areas, ehAdmin: ehAdmin(req)
        });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/', async (req: AuthRequest, res: Response) => {
    try {
        const areas = await filtroAreas(req);
        const { area, estado, ciclo, entidade_tipo, entidade_id, texto, pasta_id, tipo_id, origem_ref } = req.query as Record<string, string>;
        let q = supabase.from('documentos')
            .select('id, codigo, titulo, nome_ficheiro, storage_path, mime_type, tamanho, area, tipo, tipo_id, resumo, campos, metadados, data_documento, validade, entidade_tipo, entidade_id, entidade_nome, origem, origem_ref, origem_detalhe, estado, ciclo, confidencialidade, versao_atual, pasta_id, responsavel_id, criado_por, confianca, erro, criado_em')
            .eq('empresa_id', empresaDe(req)).order('criado_em', { ascending: false }).limit(300);
        if (areas) q = q.in('area', areas);
        if (area) q = q.eq('area', area);
        q = estado ? q.eq('estado', estado) : q.neq('estado', 'descartado');
        q = ciclo ? q.eq('ciclo', ciclo) : q.neq('ciclo', 'DELETED');
        if (tipo_id) q = q.eq('tipo_id', Number(tipo_id));
        if (pasta_id) q = pasta_id === 'raiz' ? q.is('pasta_id', null) : q.eq('pasta_id', Number(pasta_id));
        if (entidade_tipo && entidade_id) q = q.eq('entidade_tipo', entidade_tipo).eq('entidade_id', entidade_id);
        if (origem_ref) q = q.eq('origem_ref', origem_ref);   // ex.: os anexos arquivados de um email
        if (texto) {
            const t = texto.replace(/[%,()]/g, ' ').trim();
            q = q.or(`titulo.ilike.%${t}%,codigo.ilike.%${t}%,resumo.ilike.%${t}%,entidade_nome.ilike.%${t}%,nome_ficheiro.ilike.%${t}%`);
        }
        const { data, error } = await q;
        if (error) throw error;
        const visiveis = await DocumentosService.filtrarVisiveis(data || [], utilizador(req));
        res.json({ success: true, documentos: await DocumentosService.comLinks(visiveis) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/conformidade', async (req: AuthRequest, res: Response) => {
    try {
        res.json({ success: true, ...(await DocumentosService.conformidade(empresaDe(req), await filtroAreas(req), utilizador(req))) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/pesquisar', async (req: AuthRequest, res: Response) => {
    try {
        const pergunta = String(req.body.pergunta || '').trim();
        if (!pergunta) return res.status(400).json({ error: 'Escreva a pergunta.' });
        const r = await DocumentosService.pesquisar(empresaDe(req), pergunta, await filtroAreas(req), utilizador(req));
        await DocumentosGovernoService.auditar(empresaDe(req), utilizador(req), 'pesquisa', null, { pergunta, resultados: r.documentos.length });
        res.json({ success: true, ...r });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// ENTRADA MANUAL
// ============================================================
// Cada tabela tem a sua coluna de nome; pedir uma que não existe faz a consulta falhar.
const TABELA_ENTIDADE: Record<string, [string, string]> = { cliente: ['clientes', 'nome'], colaborador: ['colaboradores', 'nome'], ativo: ['ativos', 'nome'], negocio: ['negocios', 'titulo'], reuniao: ['reunioes', 'titulo'] };
async function resolverEntidade(empresaId: string, tipo?: string, id?: string): Promise<{ entidade_tipo: string; entidade_id: string; entidade_nome: string } | null | 'invalida'> {
    if (!tipo || !id) return null;
    const alvo = TABELA_ENTIDADE[tipo];
    if (!alvo) return 'invalida';
    const { data: ent } = await supabase.from(alvo[0]).select(`id, ${alvo[1]}`).eq('id', id).eq('empresa_id', empresaId).maybeSingle();
    if (!ent) return 'invalida';
    return { entidade_tipo: tipo, entidade_id: String(id), entidade_nome: (ent as any)[alvo[1]] || '' };
}

router.post('/upload', upload.array('files', 20), async (req: AuthRequest, res: Response) => {
    const ligacao = await resolverEntidade(empresaDe(req), req.body.entidade_tipo, req.body.entidade_id);
    if (ligacao === 'invalida') return res.status(400).json({ error: 'Entidade não encontrada.' });
    const ficheiros = (req.files as Express.Multer.File[]) || [];
    if (ficheiros.length === 0) return res.status(400).json({ error: 'Nenhum ficheiro enviado.' });
    const pastaId = req.body.pasta_id ? Number(req.body.pasta_id) : null;
    const resultados = [];
    for (const f of ficheiros) {
        try {
            const r = await DocumentosService.receber({
                empresaId: empresaDe(req), buffer: f.buffer, nomeFicheiro: nomeSeguro(f), mimeType: f.mimetype,
                origem: 'manual', criadoPor: req.user!.id
            });
            if (pastaId && !r.duplicado) await supabase.from('documentos').update({ pasta_id: pastaId }).eq('id', r.id).eq('empresa_id', empresaDe(req));
            if (ligacao && !r.duplicado) await supabase.from('documentos').update(ligacao).eq('id', r.id).eq('empresa_id', empresaDe(req));
            resultados.push({ nome: nomeSeguro(f), ...r });
        } catch (e: any) {
            resultados.push({ nome: nomeSeguro(f), erro: e.message });
        }
    }
    res.json({ success: true, resultados });
});

// ============================================================
// TIPOS DE DOCUMENTO
// ============================================================
router.get('/tipos', async (req: AuthRequest, res: Response) => {
    try { res.json({ success: true, tipos: await DocumentosGovernoService.tipos(empresaDe(req)) }); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
});

const validarCamposTipo = (campos: any): string | null => {
    if (!Array.isArray(campos)) return 'Os campos têm de ser uma lista.';
    const chaves = new Set<string>();
    for (const c of campos) {
        if (!c.chave || !/^[a-z0-9_]{1,40}$/.test(c.chave)) return `Chave inválida "${c.chave}": use letras minúsculas, números e _.`;
        if (chaves.has(c.chave)) return `Chave repetida: ${c.chave}`;
        chaves.add(c.chave);
        if (!c.rotulo?.trim()) return `O campo "${c.chave}" precisa de um rótulo.`;
        if (!['texto', 'numero', 'moeda', 'data', 'boolean', 'selecao'].includes(c.tipo)) return `Tipo de campo inválido em "${c.chave}".`;
        if (c.tipo === 'selecao' && (!Array.isArray(c.opcoes) || c.opcoes.length === 0)) return `"${c.rotulo}" é uma seleção sem opções.`;
    }
    return null;
};

router.post('/tipos', soAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const { nome, prefixo, area_padrao, confidencialidade_padrao, tem_validade, campos } = req.body;
        if (!nome?.trim()) return res.status(400).json({ error: 'O nome é obrigatório.' });
        if (!/^[A-Za-z]{2,6}$/.test(prefixo || '')) return res.status(400).json({ error: 'Prefixo: 2 a 6 letras (ex: CTR).' });
        const erroCampos = validarCamposTipo(campos || []);
        if (erroCampos) return res.status(400).json({ error: erroCampos });
        const { data, error } = await supabase.from('documento_tipos').insert({
            empresa_id: empresaDe(req), nome: nome.trim(), prefixo: prefixo.toUpperCase(), area_padrao: area_padrao || 'Outros',
            confidencialidade_padrao: ['Normal', 'Confidencial', 'Restrito'].includes(confidencialidade_padrao) ? confidencialidade_padrao : 'Normal',
            tem_validade: !!tem_validade, campos: campos || []
        }).select('id').single();
        if (error) return res.status(400).json({ error: /duplicate/i.test(error.message) ? 'Já existe um tipo com esse nome.' : error.message });
        await DocumentosGovernoService.auditar(empresaDe(req), utilizador(req), 'tipo_criado', null, { nome });
        res.json({ success: true, id: data.id });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/tipos/:id', soAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const alt: any = {};
        for (const k of ['nome', 'prefixo', 'area_padrao', 'confidencialidade_padrao', 'tem_validade', 'campos', 'ativo']) if (k in req.body) alt[k] = req.body[k];
        if (alt.prefixo && !/^[A-Za-z]{2,6}$/.test(alt.prefixo)) return res.status(400).json({ error: 'Prefixo: 2 a 6 letras.' });
        if (alt.prefixo) alt.prefixo = alt.prefixo.toUpperCase();
        if (alt.campos) { const e = validarCamposTipo(alt.campos); if (e) return res.status(400).json({ error: e }); }
        const { data, error } = await supabase.from('documento_tipos').update(alt).eq('id', req.params.id).eq('empresa_id', empresaDe(req)).select('id, nome');
        if (error) return res.status(400).json({ error: /duplicate/i.test(error.message) ? 'Já existe um tipo com esse nome.' : error.message });
        if (!data || data.length === 0) return res.status(404).json({ error: 'Tipo não encontrado.' });
        await DocumentosGovernoService.auditar(empresaDe(req), utilizador(req), 'tipo_alterado', null, { id: req.params.id, alteracoes: Object.keys(alt) });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// PASTAS
// ============================================================
router.get('/pastas', async (req: AuthRequest, res: Response) => {
    try { res.json({ success: true, pastas: await DocumentosGovernoService.pastas(empresaDe(req)) }); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/pastas', async (req: AuthRequest, res: Response) => {
    try {
        const nome = String(req.body.nome || '').trim();
        if (!nome) return res.status(400).json({ error: 'O nome é obrigatório.' });
        const parent_id = req.body.parent_id ? Number(req.body.parent_id) : null;
        if (parent_id) {
            const { data: pai } = await supabase.from('documento_pastas').select('id').eq('id', parent_id).eq('empresa_id', empresaDe(req)).maybeSingle();
            if (!pai) return res.status(400).json({ error: 'Pasta-mãe não encontrada.' });
        }
        const { data, error } = await supabase.from('documento_pastas').insert({ empresa_id: empresaDe(req), parent_id, nome }).select('id').single();
        if (error) throw error;
        res.json({ success: true, id: data.id });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/pastas/:id', async (req: AuthRequest, res: Response) => {
    try {
        const id = Number(req.params.id);
        const alt: any = {};
        if (typeof req.body.nome === 'string' && req.body.nome.trim()) alt.nome = req.body.nome.trim();
        if ('parent_id' in req.body) {
            const novoPai = req.body.parent_id ? Number(req.body.parent_id) : null;
            if (novoPai !== null) {
                if (novoPai === id || await DocumentosGovernoService.ehDescendente(empresaDe(req), id, novoPai)) return res.status(400).json({ error: 'Não pode mover uma pasta para dentro dela própria.' });
                const { data: pai } = await supabase.from('documento_pastas').select('id').eq('id', novoPai).eq('empresa_id', empresaDe(req)).maybeSingle();
                if (!pai) return res.status(400).json({ error: 'Pasta de destino não encontrada.' });
            }
            alt.parent_id = novoPai;
        }
        if (Object.keys(alt).length === 0) return res.status(400).json({ error: 'Nada para alterar.' });
        const { data, error } = await supabase.from('documento_pastas').update(alt).eq('id', id).eq('empresa_id', empresaDe(req)).select('id');
        if (error) throw error;
        if (!data || data.length === 0) return res.status(404).json({ error: 'Pasta não encontrada.' });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/pastas/:id', async (req: AuthRequest, res: Response) => {
    try {
        const id = Number(req.params.id);
        const { data: pasta } = await supabase.from('documento_pastas').select('id, parent_id').eq('id', id).eq('empresa_id', empresaDe(req)).maybeSingle();
        if (!pasta) return res.status(404).json({ error: 'Pasta não encontrada.' });
        // Nada se perde: documentos e subpastas sobem para a pasta-mãe.
        await supabase.from('documentos').update({ pasta_id: pasta.parent_id }).eq('empresa_id', empresaDe(req)).eq('pasta_id', id);
        await supabase.from('documento_pastas').update({ parent_id: pasta.parent_id }).eq('empresa_id', empresaDe(req)).eq('parent_id', id);
        const { error } = await supabase.from('documento_pastas').delete().eq('id', id).eq('empresa_id', empresaDe(req));
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// ATIVOS
// ============================================================
router.get('/ativos/lista', async (req: AuthRequest, res: Response) => {
    try {
        const { data: ativos } = await supabase.from('ativos').select('*').eq('empresa_id', empresaDe(req)).order('nome');
        const { data: docs } = await supabase.from('documentos').select('entidade_id, validade, estado').eq('empresa_id', empresaDe(req)).eq('entidade_tipo', 'ativo').eq('estado', 'arquivado').neq('ciclo', 'DELETED');
        const hoje = new Date().toISOString().slice(0, 10);
        const stats: Record<string, { docs: number; vencidos: number }> = {};
        for (const d of (docs || [])) {
            const s = stats[d.entidade_id] || (stats[d.entidade_id] = { docs: 0, vencidos: 0 });
            s.docs++;
            if (d.validade && d.validade < hoje) s.vencidos++;
        }
        res.json({ success: true, ativos: (ativos || []).map((a: any) => ({ ...a, ...(stats[String(a.id)] || { docs: 0, vencidos: 0 }) })) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/ativos', async (req: AuthRequest, res: Response) => {
    try {
        const { nome, categoria, marca, modelo, numero_serie, localizacao, estado, notas } = req.body;
        if (!nome?.trim()) return res.status(400).json({ error: 'O nome é obrigatório.' });
        const { data, error } = await supabase.from('ativos').insert({
            empresa_id: empresaDe(req), nome: nome.trim(), categoria: categoria || 'Equipamento', marca, modelo, numero_serie, localizacao,
            estado: ['Ativo', 'Em manutenção', 'Desativado'].includes(estado) ? estado : 'Ativo', notas
        }).select('id').single();
        if (error) throw error;
        res.json({ success: true, id: data.id });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/ativos/:id', async (req: AuthRequest, res: Response) => {
    try {
        const alt: any = {};
        for (const k of ['nome', 'categoria', 'marca', 'modelo', 'numero_serie', 'localizacao', 'estado', 'notas']) if (k in req.body) alt[k] = req.body[k];
        const { data, error } = await supabase.from('ativos').update(alt).eq('id', req.params.id).eq('empresa_id', empresaDe(req)).select('id');
        if (error) throw error;
        if (!data || data.length === 0) return res.status(404).json({ error: 'Ativo não encontrado.' });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/ativos/:id', async (req: AuthRequest, res: Response) => {
    try {
        const { data, error } = await supabase.from('ativos').delete().eq('id', req.params.id).eq('empresa_id', empresaDe(req)).select('id');
        if (error) throw error;
        if (!data || data.length === 0) return res.status(404).json({ error: 'Ativo não encontrado.' });
        await supabase.from('documentos').update({ entidade_tipo: null, entidade_id: null }).eq('empresa_id', empresaDe(req)).eq('entidade_tipo', 'ativo').eq('entidade_id', String(req.params.id));
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/entidades/opcoes', async (req: AuthRequest, res: Response) => {
    try {
        const e = empresaDe(req);
        const [c, col, at, us] = await Promise.all([
            supabase.from('clientes').select('id, nome').eq('empresa_id', e).order('nome').limit(500),
            supabase.from('colaboradores').select('id, nome').eq('empresa_id', e).order('nome').limit(500),
            supabase.from('ativos').select('id, nome').eq('empresa_id', e).order('nome').limit(500),
            getSupabase(req).from('perfis').select('id, nome, email, role').eq('empresa_id', e).order('nome').limit(500),
        ]);
        res.json({ success: true, clientes: c.data || [], colaboradores: col.data || [], ativos: at.data || [], utilizadores: us.data || [] });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// AUDITORIA GLOBAL (admin)
// ============================================================
router.get('/auditoria/global', soAdmin, async (req: AuthRequest, res: Response) => {
    try { res.json({ success: true, eventos: await DocumentosGovernoService.historico(empresaDe(req), undefined, 300) }); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// DEFINIÇÕES (admin)
// ============================================================
router.get('/definicoes/estado', soAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const e = empresaDe(req);
        const [email, wa, perms, users] = await Promise.all([
            DocumentosService.capturaAtiva(e, 'email'), DocumentosService.capturaAtiva(e, 'whatsapp'),
            supabase.from('documentos_permissoes').select('user_id, area').eq('empresa_id', e),
            getSupabase(req).from('perfis').select('id, nome, email, role').eq('empresa_id', e)
        ]);
        res.json({ success: true, capturaEmail: email, capturaWhatsapp: wa, permissoes: perms.data || [], utilizadores: users.data || [], areas: DocumentosService.areas });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/definicoes/captura', soAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const e = empresaDe(req);
        for (const canal of ['email', 'whatsapp'] as const) {
            if (typeof req.body[canal] !== 'boolean') continue;
            const chave = `documentos_captura_${canal}`;
            await supabase.from('configuracoes').delete().eq('empresa_id', e).eq('chave', chave);
            await supabase.from('configuracoes').insert({ empresa_id: e, chave, valor: String(req.body[canal]) });
        }
        await DocumentosGovernoService.auditar(e, utilizador(req), 'definicoes_captura', null, req.body);
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/definicoes/permissoes/:userId', soAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const e = empresaDe(req);
        const areas: string[] = Array.isArray(req.body.areas) ? req.body.areas.filter((a: string) => DocumentosService.areas.includes(a)) : [];
        await supabase.from('documentos_permissoes').delete().eq('empresa_id', e).eq('user_id', req.params.userId);
        if (areas.length > 0) {
            const { error } = await supabase.from('documentos_permissoes').insert(areas.map(area => ({ empresa_id: e, user_id: req.params.userId, area })));
            if (error) throw error;
        }
        await DocumentosGovernoService.auditar(e, utilizador(req), 'permissoes_area', null, { user_id: req.params.userId, areas });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// FLUXOS DE APROVAÇÃO (modelos) — admin edita, todos leem
// ============================================================
router.get('/fluxos', async (req: AuthRequest, res: Response) => {
    try {
        const fluxos = await DocumentosFluxoService.fluxos(empresaDe(req));
        res.json({ success: true, fluxos: ehAdmin(req) ? fluxos : fluxos.filter((f: any) => f.ativo) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/fluxos', soAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const nome = String(req.body.nome || '').trim();
        if (!nome) return res.status(400).json({ error: 'Indique o nome do fluxo.' });
        const v = await DocumentosFluxoService.validarEtapas(empresaDe(req), req.body.etapas);
        if (v.erro) return res.status(400).json({ error: v.erro });
        const { data, error } = await supabase.from('documento_fluxos').insert({
            empresa_id: empresaDe(req), nome, descricao: req.body.descricao || null, tipo_id: req.body.tipo_id ? Number(req.body.tipo_id) : null,
            etapas: v.etapas, ativar_ao_aprovar: req.body.ativar_ao_aprovar !== false, criado_por: req.user!.id
        }).select('*').single();
        if (error) return res.status(400).json({ error: error.code === '23505' ? 'Já existe um fluxo com esse nome.' : error.message });
        await DocumentosGovernoService.auditar(empresaDe(req), utilizador(req), 'fluxo_criado', null, { fluxo: nome, etapas: v.etapas!.length });
        res.json({ success: true, fluxo: data });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/fluxos/:id', soAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const alt: any = {};
        if (req.body.nome !== undefined) { alt.nome = String(req.body.nome).trim(); if (!alt.nome) return res.status(400).json({ error: 'Indique o nome do fluxo.' }); }
        if (req.body.descricao !== undefined) alt.descricao = req.body.descricao || null;
        if (req.body.tipo_id !== undefined) alt.tipo_id = req.body.tipo_id ? Number(req.body.tipo_id) : null;
        if (req.body.ativar_ao_aprovar !== undefined) alt.ativar_ao_aprovar = !!req.body.ativar_ao_aprovar;
        if (req.body.ativo !== undefined) alt.ativo = !!req.body.ativo;
        if (req.body.etapas !== undefined) {
            const v = await DocumentosFluxoService.validarEtapas(empresaDe(req), req.body.etapas);
            if (v.erro) return res.status(400).json({ error: v.erro });
            alt.etapas = v.etapas;
        }
        const { data, error } = await supabase.from('documento_fluxos').update(alt).eq('id', Number(req.params.id)).eq('empresa_id', empresaDe(req)).select('id').maybeSingle();
        if (error) return res.status(400).json({ error: error.code === '23505' ? 'Já existe um fluxo com esse nome.' : error.message });
        if (!data) return res.status(404).json({ error: 'Fluxo não encontrado.' });
        await DocumentosGovernoService.auditar(empresaDe(req), utilizador(req), 'fluxo_editado', null, { fluxo_id: data.id, campos: Object.keys(alt) });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Apagar um fluxo: os processos já feitos guardam o nome e as etapas, por isso não se perdem.
router.delete('/fluxos/:id', soAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const { count } = await supabase.from('documento_processos').select('id', { count: 'exact', head: true }).eq('fluxo_id', Number(req.params.id)).eq('empresa_id', empresaDe(req)).eq('estado', 'em_curso');
        if ((count || 0) > 0) return res.status(400).json({ error: `Há ${count} processo(s) em curso neste fluxo. Desative-o em vez de o apagar.` });
        const { data } = await supabase.from('documento_fluxos').delete().eq('id', Number(req.params.id)).eq('empresa_id', empresaDe(req)).select('id, nome').maybeSingle();
        if (!data) return res.status(404).json({ error: 'Fluxo não encontrado.' });
        await DocumentosGovernoService.auditar(empresaDe(req), utilizador(req), 'fluxo_apagado', null, { fluxo_id: data.id, fluxo: data.nome });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// AS MINHAS APROVAÇÕES E NOTIFICAÇÕES
// ============================================================
router.get('/aprovacoes/minhas', async (req: AuthRequest, res: Response) => {
    try { res.json({ success: true, tarefas: await DocumentosFluxoService.minhasTarefas(empresaDe(req), req.user!.id) }); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/aprovacoes/:tarefaId/decidir', async (req: AuthRequest, res: Response) => {
    try {
        const decisao = req.body.decisao === 'aprovar' ? 'aprovada' : req.body.decisao === 'rejeitar' ? 'rejeitada' : null;
        if (!decisao) return res.status(400).json({ error: 'Decisão inválida (aprovar / rejeitar).' });
        const r = await DocumentosFluxoService.decidir(Number(req.params.tarefaId), utilizador(req), decisao, req.body.comentario);
        if (!r.ok) return res.status(400).json({ error: r.erro });
        res.json({ success: true, estado: r.estado });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/aprovacoes/:tarefaId/delegar', async (req: AuthRequest, res: Response) => {
    try {
        if (!req.body.para) return res.status(400).json({ error: 'Indique a quem delegar.' });
        const r = await DocumentosFluxoService.delegar(Number(req.params.tarefaId), utilizador(req), String(req.body.para), req.body.comentario);
        if (!r.ok) return res.status(400).json({ error: r.erro });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/notificacoes/minhas', async (req: AuthRequest, res: Response) => {
    try { res.json({ success: true, ...(await DocumentosFluxoService.notificacoes(empresaDe(req), req.user!.id)) }); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/notificacoes/lidas', async (req: AuthRequest, res: Response) => {
    try {
        const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : undefined;
        await DocumentosFluxoService.marcarLidas(empresaDe(req), req.user!.id, ids);
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// CHECKLISTS DE PROCESSO
// ============================================================
const ENTIDADES_CHECKLIST = ['cliente', 'colaborador', 'ativo', 'negocio'];

router.get('/checklists', async (req: AuthRequest, res: Response) => {
    try {
        const lista = await DocumentosFluxoService.checklists(empresaDe(req));
        res.json({ success: true, checklists: ehAdmin(req) ? lista : lista.filter((c: any) => c.ativo) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/checklists', soAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const nome = String(req.body.nome || '').trim();
        if (!nome) return res.status(400).json({ error: 'Indique o nome da checklist.' });
        if (!ENTIDADES_CHECKLIST.includes(req.body.entidade_tipo)) return res.status(400).json({ error: 'Tipo de entidade inválido.' });
        const v = await DocumentosFluxoService.validarItens(empresaDe(req), req.body.itens);
        if (v.erro) return res.status(400).json({ error: v.erro });
        const { data, error } = await supabase.from('documento_checklists').insert({ empresa_id: empresaDe(req), nome, entidade_tipo: req.body.entidade_tipo, itens: v.itens }).select('*').single();
        if (error) return res.status(400).json({ error: error.code === '23505' ? 'Já existe uma checklist com esse nome.' : error.message });
        res.json({ success: true, checklist: data });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/checklists/:id', soAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const alt: any = {};
        if (req.body.nome !== undefined) { alt.nome = String(req.body.nome).trim(); if (!alt.nome) return res.status(400).json({ error: 'Indique o nome da checklist.' }); }
        if (req.body.entidade_tipo !== undefined) { if (!ENTIDADES_CHECKLIST.includes(req.body.entidade_tipo)) return res.status(400).json({ error: 'Tipo de entidade inválido.' }); alt.entidade_tipo = req.body.entidade_tipo; }
        if (req.body.ativo !== undefined) alt.ativo = !!req.body.ativo;
        if (req.body.itens !== undefined) { const v = await DocumentosFluxoService.validarItens(empresaDe(req), req.body.itens); if (v.erro) return res.status(400).json({ error: v.erro }); alt.itens = v.itens; }
        const { data, error } = await supabase.from('documento_checklists').update(alt).eq('id', Number(req.params.id)).eq('empresa_id', empresaDe(req)).select('id').maybeSingle();
        if (error) return res.status(400).json({ error: error.code === '23505' ? 'Já existe uma checklist com esse nome.' : error.message });
        if (!data) return res.status(404).json({ error: 'Checklist não encontrada.' });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/checklists/:id', soAdmin, async (req: AuthRequest, res: Response) => {
    try {
        const { data } = await supabase.from('documento_checklists').delete().eq('id', Number(req.params.id)).eq('empresa_id', empresaDe(req)).select('id').maybeSingle();
        if (!data) return res.status(404).json({ error: 'Checklist não encontrada.' });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Panorama: que entidades ainda têm documentos obrigatórios em falta.
router.get('/checklists/:id/panorama', async (req: AuthRequest, res: Response) => {
    try {
        const { data: cl } = await supabase.from('documento_checklists').select('*').eq('id', Number(req.params.id)).eq('empresa_id', empresaDe(req)).maybeSingle();
        if (!cl) return res.status(404).json({ error: 'Checklist não encontrada.' });
        res.json({ success: true, checklist: { id: cl.id, nome: cl.nome, entidade_tipo: cl.entidade_tipo }, entidades: await DocumentosFluxoService.panoramaChecklist(cl) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/checklists/:id/estado/:entidadeId', async (req: AuthRequest, res: Response) => {
    try {
        const { data: cl } = await supabase.from('documento_checklists').select('*').eq('id', Number(req.params.id)).eq('empresa_id', empresaDe(req)).maybeSingle();
        if (!cl) return res.status(404).json({ error: 'Checklist não encontrada.' });
        res.json({ success: true, ...(await DocumentosFluxoService.estadoChecklist(cl, req.params.entidadeId, utilizador(req))) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// UM DOCUMENTO
// ============================================================
router.get('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const doc = await carregarComAcesso(req, res, 'ver'); if (!doc) return;
        const [documento] = await DocumentosService.comLinks([doc]);
        await DocumentosGovernoService.auditar(empresaDe(req), utilizador(req), 'ver', doc);
        const ciclo = DocumentosCicloService.opcoes(doc.ciclo as Ciclo, 'utilizador');
        res.json({ success: true, documento, transicoes: ciclo, rotuloCiclo: ROTULO_CICLO[doc.ciclo as Ciclo] });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Link de descarregamento de curta duração — cada pedido fica registado.
router.get('/:id/descarregar', async (req: AuthRequest, res: Response) => {
    try {
        const doc = await carregarComAcesso(req, res, 'ver'); if (!doc) return;
        const url = await MediaUploadService.assinarDocumento(doc.storage_path, 300);
        if (!url) return res.status(500).json({ error: 'Não foi possível gerar o link.' });
        await DocumentosGovernoService.auditar(empresaDe(req), utilizador(req), 'descarregar', doc, { versao: doc.versao_atual });
        res.json({ success: true, url, expira_em_segundos: 300 });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const doc = await carregarComAcesso(req, res, 'editar'); if (!doc) return;
        const permitido = ['titulo', 'descricao', 'area', 'tipo', 'tipo_id', 'resumo', 'campos', 'metadados', 'data_documento', 'validade', 'entidade_tipo', 'entidade_id', 'entidade_nome', 'estado', 'confidencialidade', 'responsavel_id', 'pasta_id'];
        const alt: any = { atualizado_em: new Date().toISOString() };
        for (const k of permitido) if (k in req.body) alt[k] = req.body[k] === '' ? null : req.body[k];

        if (alt.estado && !['arquivado', 'por_rever', 'descartado'].includes(alt.estado)) delete alt.estado;
        if (alt.area && !DocumentosService.areas.includes(alt.area)) return res.status(400).json({ error: 'Área inválida.' });
        if (alt.confidencialidade && !['Normal', 'Confidencial', 'Restrito'].includes(alt.confidencialidade)) return res.status(400).json({ error: 'Confidencialidade inválida.' });
        if ((alt.confidencialidade || alt.responsavel_id !== undefined) && doc.nivel_acesso !== 'gerir') return res.status(403).json({ error: 'Só quem gere o documento pode alterar a confidencialidade ou o responsável.' });

        // Tipo: ao mudar, o nome do tipo acompanha; os metadados são validados contra os campos do tipo.
        let tipoDoc: any = null;
        if (alt.tipo_id !== undefined && alt.tipo_id !== null) {
            const tipos = await DocumentosGovernoService.tipos(empresaDe(req));
            tipoDoc = tipos.find(t => t.id === Number(alt.tipo_id));
            if (!tipoDoc) return res.status(400).json({ error: 'Tipo de documento não encontrado.' });
            alt.tipo = tipoDoc.nome;
        } else if (doc.tipo_id) {
            const tipos = await DocumentosGovernoService.tipos(empresaDe(req));
            tipoDoc = tipos.find(t => t.id === doc.tipo_id) || null;
        }
        if (alt.metadados !== undefined) {
            if (typeof alt.metadados !== 'object' || Array.isArray(alt.metadados)) return res.status(400).json({ error: 'Metadados inválidos.' });
            const erro = DocumentosGovernoService.validarMetadados(tipoDoc, alt.metadados);
            if (erro) return res.status(400).json({ error: erro });
        }
        if (alt.pasta_id) {
            const { data: pasta } = await supabase.from('documento_pastas').select('id').eq('id', Number(alt.pasta_id)).eq('empresa_id', empresaDe(req)).maybeSingle();
            if (!pasta) return res.status(400).json({ error: 'Pasta não encontrada.' });
        }
        if (alt.entidade_tipo && alt.entidade_id) {
            const lig = await resolverEntidade(empresaDe(req), alt.entidade_tipo, alt.entidade_id);
            if (lig === 'invalida' || !lig) return res.status(400).json({ error: 'Entidade não encontrada.' });
            alt.entidade_nome = lig.entidade_nome || alt.entidade_nome;
        }

        // Confirmar um "Por rever" ativa o documento no ciclo de vida.
        if (alt.estado === 'arquivado' && doc.ciclo === 'PENDING_REVIEW') alt.ciclo = 'ACTIVE';
        if (alt.estado === 'arquivado' && !doc.codigo) {
            await DocumentosGovernoService.atribuirCodigo(empresaDe(req), doc.id, tipoDoc?.prefixo || 'DOC');
        }

        const { data, error } = await supabase.from('documentos').update(alt).eq('id', doc.id).eq('empresa_id', empresaDe(req)).select('id').single();
        if (error || !data) return res.status(404).json({ error: 'Documento não encontrado ou sem permissão.' });
        const mudou = Object.keys(alt).filter(k => k !== 'atualizado_em');
        await DocumentosGovernoService.auditar(empresaDe(req), utilizador(req), alt.estado === 'arquivado' && doc.estado === 'por_rever' ? 'confirmado' : 'editar', doc, { campos: mudou });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/transicao', async (req: AuthRequest, res: Response) => {
    try {
        const doc = await carregarComAcesso(req, res, 'editar'); if (!doc) return;
        const para = String(req.body.para || '') as Ciclo;
        if (!CICLOS.includes(para)) return res.status(400).json({ error: 'Estado inválido.' });
        if (para === 'DELETED' && doc.nivel_acesso !== 'gerir') return res.status(403).json({ error: 'Só quem gere o documento o pode eliminar.' });
        const r = await DocumentosGovernoService.transitar(doc, para, 'utilizador', utilizador(req), req.body.motivo);
        if (!r.ok) return res.status(400).json({ error: r.erro });
        res.json({ success: true, ciclo: para, rotulo: ROTULO_CICLO[para] });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Enviar o documento (versão atual) por email, pelo SMTP da empresa. Fica registado em Enviados e na auditoria.
router.post('/:id/enviar-email', async (req: AuthRequest, res: Response) => {
    try {
        const doc = await carregarComAcesso(req, res, 'ver'); if (!doc) return;
        const para = String(req.body.para || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) return res.status(400).json({ error: 'Indique um email de destino válido.' });
        if (doc.confidencialidade === 'Restrito' && doc.nivel_acesso !== 'gerir') return res.status(403).json({ error: 'Só quem gere um documento Restrito o pode enviar para fora.' });
        const assunto = String(req.body.assunto || '').trim() || `${doc.codigo ? doc.codigo + ' — ' : ''}${doc.titulo}`;
        const mensagem = String(req.body.mensagem || '').trim();
        const buffer = await MediaUploadService.descarregarDocumento(doc.storage_path);
        const { EmailService } = require('../services/EmailService');
        const corpo = `<p>${mensagem ? mensagem.replace(/\n/g, '<br>') : `Segue em anexo o documento <strong>${doc.titulo}</strong>.`}</p><p style="color:#888;font-size:12px">Enviado por ${utilizador(req).nome} através do BusinessOS.</p>`;
        const r = await EmailService.enviarComAnexos(para, assunto, corpo, [{ filename: doc.nome_ficheiro, content: buffer, contentType: doc.mime_type || undefined }], empresaDe(req));
        if (!r.ok) return res.status(400).json({ error: r.erro });
        await DocumentosGovernoService.auditar(empresaDe(req), utilizador(req), 'enviado_email', doc, { para, assunto, versao: doc.versao_atual });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/reprocessar', async (req: AuthRequest, res: Response) => {
    try {
        const doc = await carregarComAcesso(req, res, 'editar'); if (!doc) return;
        await supabase.from('documentos').update({ estado: 'a_processar', erro: null }).eq('id', doc.id);
        await DocumentosGovernoService.auditar(empresaDe(req), utilizador(req), 'reprocessar', doc);
        DocumentosService.processarFila().catch(() => {});
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Eliminação física só para documentos já marcados como DELETED (soft delete primeiro).
router.delete('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const doc = await carregarComAcesso(req, res, 'gerir'); if (!doc) return;
        if (doc.ciclo !== 'DELETED' && doc.estado !== 'por_rever' && doc.estado !== 'erro' && doc.estado !== 'descartado') {
            return res.status(400).json({ error: 'Marque primeiro o documento como eliminado (fica recuperável); só depois pode apagar definitivamente.' });
        }
        const { data: versoes } = await supabase.from('documento_versoes').select('storage_path').eq('documento_id', doc.id);
        const { error } = await supabase.from('documentos').delete().eq('id', doc.id).eq('empresa_id', empresaDe(req));
        if (error) throw error;
        const caminhos = new Set<string>([doc.storage_path, ...(versoes || []).map((v: any) => v.storage_path)].filter(Boolean));
        for (const c of caminhos) await MediaUploadService.apagarDocumento(c, empresaDe(req));
        await DocumentosGovernoService.auditar(empresaDe(req), utilizador(req), 'apagar_definitivo', doc, { versoes: caminhos.size });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ---------- versões ----------
router.get('/:id/versoes', async (req: AuthRequest, res: Response) => {
    try {
        const doc = await carregarComAcesso(req, res, 'ver'); if (!doc) return;
        res.json({ success: true, versoes: await DocumentosGovernoService.versoes(doc.id), atual: doc.versao_atual });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/versoes', upload.single('file'), async (req: AuthRequest, res: Response) => {
    try {
        const doc = await carregarComAcesso(req, res, 'editar'); if (!doc) return;
        if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro enviado.' });
        const r = await DocumentosGovernoService.novaVersao(doc, req.file.buffer, nomeSeguro(req.file), req.file.mimetype, String(req.body.comentario || ''), utilizador(req));
        // O conteúdo mudou: reindexar para a pesquisa continuar certa.
        await supabase.from('documentos').update({ estado: 'a_processar' }).eq('id', doc.id);
        DocumentosService.processarFila().catch(() => {});
        res.json({ success: true, ...r });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/versoes/:numero/restaurar', async (req: AuthRequest, res: Response) => {
    try {
        const doc = await carregarComAcesso(req, res, 'editar'); if (!doc) return;
        const r = await DocumentosGovernoService.restaurarVersao(doc, Number(req.params.numero), utilizador(req));
        res.json({ success: true, ...r });
    } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ---------- acessos por documento ----------
router.get('/:id/acessos', async (req: AuthRequest, res: Response) => {
    try {
        const doc = await carregarComAcesso(req, res, 'gerir'); if (!doc) return;
        res.json({ success: true, acessos: await DocumentosGovernoService.acessos(doc.id) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/acessos/:userId', async (req: AuthRequest, res: Response) => {
    try {
        const doc = await carregarComAcesso(req, res, 'gerir'); if (!doc) return;
        const { nivel, expira_em } = req.body;
        if (!['ver', 'editar', 'gerir'].includes(nivel)) return res.status(400).json({ error: 'Nível inválido.' });
        const { data: perfil } = await getSupabase(req).from('perfis').select('id').eq('id', req.params.userId).eq('empresa_id', empresaDe(req)).maybeSingle();
        if (!perfil) return res.status(400).json({ error: 'Utilizador não pertence a esta empresa.' });
        const { error } = await supabase.from('documento_acessos').upsert({
            empresa_id: empresaDe(req), documento_id: doc.id, user_id: req.params.userId, nivel, expira_em: expira_em || null, concedido_por: req.user!.id
        }, { onConflict: 'documento_id,user_id' });
        if (error) throw error;
        await DocumentosGovernoService.auditar(empresaDe(req), utilizador(req), 'acesso_concedido', doc, { user_id: req.params.userId, nivel, expira_em: expira_em || null });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/acessos/:userId', async (req: AuthRequest, res: Response) => {
    try {
        const doc = await carregarComAcesso(req, res, 'gerir'); if (!doc) return;
        await supabase.from('documento_acessos').delete().eq('documento_id', doc.id).eq('user_id', req.params.userId);
        await DocumentosGovernoService.auditar(empresaDe(req), utilizador(req), 'acesso_revogado', doc, { user_id: req.params.userId });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ---------- histórico ----------
// ============================================================
// APROVAÇÃO DE UM DOCUMENTO
// ============================================================
router.get('/:id/processos', async (req: AuthRequest, res: Response) => {
    try {
        const doc = await carregarComAcesso(req, res, 'ver'); if (!doc) return;
        const processos = await DocumentosFluxoService.processosDoDocumento(doc.id);
        const fluxos = (await DocumentosFluxoService.fluxos(empresaDe(req))).filter((f: any) => f.ativo).map((f: any) => ({ id: f.id, nome: f.nome, descricao: f.descricao, tipo_id: f.tipo_id, etapas: (f.etapas || []).length }));
        const podeSubmeter = doc.nivel_acesso !== 'ver' && ['DRAFT', 'IN_REVIEW', 'ACTIVE', 'APPROVED'].includes(doc.ciclo) && !processos.some((p: any) => p.estado === 'em_curso');
        res.json({ success: true, processos, fluxos, podeSubmeter, nivel: doc.nivel_acesso });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/processos', async (req: AuthRequest, res: Response) => {
    try {
        const doc = await carregarComAcesso(req, res, 'editar'); if (!doc) return;
        const fluxoId = Number(req.body.fluxo_id);
        if (!fluxoId) return res.status(400).json({ error: 'Escolha o fluxo de aprovação.' });
        const r = await DocumentosFluxoService.iniciar(doc, fluxoId, utilizador(req), req.body.comentario);
        if (!r.ok) return res.status(400).json({ error: r.erro });
        res.json({ success: true, processo: r.processo });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/processos/:processoId/cancelar', async (req: AuthRequest, res: Response) => {
    try {
        const doc = await carregarComAcesso(req, res, 'ver'); if (!doc) return;
        const r = await DocumentosFluxoService.cancelar(Number(req.params.processoId), utilizador(req), String(req.body.motivo || ''), doc.nivel_acesso === 'gerir');
        if (!r.ok) return res.status(400).json({ error: r.erro });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/historico', async (req: AuthRequest, res: Response) => {
    try {
        const doc = await carregarComAcesso(req, res, 'ver'); if (!doc) return;
        res.json({ success: true, eventos: await DocumentosGovernoService.historico(empresaDe(req), doc.id) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
