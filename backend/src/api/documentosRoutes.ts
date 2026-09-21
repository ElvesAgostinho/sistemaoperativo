import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { getSupabase, supabase } from '../lib/supabaseClient';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { DocumentosService } from '../services/DocumentosService';
import { MediaUploadService } from '../services/MediaUploadService';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 20 } });

const empresaDe = (req: AuthRequest) => String(req.user!.empresa_id);
const nomeSeguro = (f: Express.Multer.File) => path.basename(Buffer.from(f.originalname, 'latin1').toString('utf8'));

// Módulo pago à parte: sem "documentos" em modulos_empresa, nada aqui responde.
router.use(requireAuth, async (req: AuthRequest, res: Response, next) => {
    if (!req.user?.empresa_id) return res.status(400).json({ error: 'Empresa não encontrada.' });
    if (!(await DocumentosService.empresaTemModulo(empresaDe(req)))) {
        return res.status(403).json({ error: 'O módulo Documentos não está incluído no seu plano. Contacte o administrador do sistema.' });
    }
    next();
});

async function filtroAreas(req: AuthRequest) {
    return DocumentosService.areasPermitidas(empresaDe(req), req.user!.id, req.user!.role);
}

// ============================================================
// LISTAGEM E RESUMO
// ============================================================
router.get('/resumo', async (req: AuthRequest, res: Response) => {
    try {
        const areas = await filtroAreas(req);
        let q = supabase.from('documentos').select('area, estado, validade').eq('empresa_id', empresaDe(req)).neq('estado', 'descartado');
        if (areas) q = q.in('area', areas);
        const { data } = await q;

        const porArea: Record<string, number> = {};
        let porRever = 0, aProcessar = 0, comErro = 0;
        for (const d of (data || [])) {
            if (d.estado === 'arquivado') porArea[d.area] = (porArea[d.area] || 0) + 1;
            if (d.estado === 'por_rever') porRever++;
            if (d.estado === 'a_processar') aProcessar++;
            if (d.estado === 'erro') comErro++;
        }
        const conf = await DocumentosService.conformidade(empresaDe(req), areas);
        res.json({
            success: true,
            areas: DocumentosService.areas.map(a => ({ nome: a, total: porArea[a] || 0 })),
            porRever, aProcessar, comErro,
            vencidos: conf.vencidos.length, aVencer: conf.aVencer.length,
            areasPermitidas: areas
        });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/', async (req: AuthRequest, res: Response) => {
    try {
        const areas = await filtroAreas(req);
        const { area, estado, entidade_tipo, entidade_id, texto } = req.query as Record<string, string>;
        let q = supabase.from('documentos')
            .select('id, titulo, nome_ficheiro, storage_path, mime_type, tamanho, area, tipo, resumo, campos, data_documento, validade, entidade_tipo, entidade_id, entidade_nome, origem, origem_detalhe, estado, confianca, erro, criado_em')
            .eq('empresa_id', empresaDe(req)).order('criado_em', { ascending: false }).limit(300);
        if (areas) q = q.in('area', areas);
        if (area) q = q.eq('area', area);
        q = estado ? q.eq('estado', estado) : q.neq('estado', 'descartado');
        if (entidade_tipo && entidade_id) q = q.eq('entidade_tipo', entidade_tipo).eq('entidade_id', entidade_id);
        if (texto) q = q.or(`titulo.ilike.%${texto}%,resumo.ilike.%${texto}%,entidade_nome.ilike.%${texto}%,nome_ficheiro.ilike.%${texto}%`);
        const { data, error } = await q;
        if (error) throw error;
        res.json({ success: true, documentos: await DocumentosService.comLinks(data || []) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/conformidade', async (req: AuthRequest, res: Response) => {
    try {
        res.json({ success: true, ...(await DocumentosService.conformidade(empresaDe(req), await filtroAreas(req))) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/pesquisar', async (req: AuthRequest, res: Response) => {
    try {
        const pergunta = String(req.body.pergunta || '').trim();
        if (!pergunta) return res.status(400).json({ error: 'Escreva a pergunta.' });
        res.json({ success: true, ...(await DocumentosService.pesquisar(empresaDe(req), pergunta, await filtroAreas(req))) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// ENTRADA MANUAL (um ou vários ficheiros)
// ============================================================
router.post('/upload', upload.array('files', 20), async (req: AuthRequest, res: Response) => {
    const ficheiros = (req.files as Express.Multer.File[]) || [];
    if (ficheiros.length === 0) return res.status(400).json({ error: 'Nenhum ficheiro enviado.' });
    const resultados = [];
    for (const f of ficheiros) {
        try {
            const r = await DocumentosService.receber({
                empresaId: empresaDe(req), buffer: f.buffer, nomeFicheiro: nomeSeguro(f), mimeType: f.mimetype,
                origem: 'manual', criadoPor: req.user!.id
            });
            resultados.push({ nome: nomeSeguro(f), ...r });
        } catch (e: any) {
            resultados.push({ nome: nomeSeguro(f), erro: e.message });
        }
    }
    res.json({ success: true, resultados });
});

// ============================================================
// UM DOCUMENTO: ver, corrigir, arquivar, descartar, apagar, reprocessar
// ============================================================
router.get('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const { data } = await supabase.from('documentos').select('*').eq('id', req.params.id).eq('empresa_id', empresaDe(req)).maybeSingle();
        if (!data) return res.status(404).json({ error: 'Documento não encontrado.' });
        const areas = await filtroAreas(req);
        if (areas && !areas.includes(data.area)) return res.status(403).json({ error: 'Sem acesso a esta área.' });
        const [documento] = await DocumentosService.comLinks([data]);
        res.json({ success: true, documento });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const permitido = ['titulo', 'area', 'tipo', 'resumo', 'campos', 'data_documento', 'validade', 'entidade_tipo', 'entidade_id', 'entidade_nome', 'estado'];
        const alteracoes: any = { atualizado_em: new Date().toISOString() };
        for (const k of permitido) if (k in req.body) alteracoes[k] = req.body[k] === '' ? null : req.body[k];
        if (alteracoes.estado && !['arquivado', 'por_rever', 'descartado'].includes(alteracoes.estado)) delete alteracoes.estado;
        if (alteracoes.area && !DocumentosService.areas.includes(alteracoes.area)) return res.status(400).json({ error: 'Área inválida.' });

        // Ligar a uma entidade escolhida à mão: confirma que ela é desta empresa.
        if (alteracoes.entidade_tipo && alteracoes.entidade_id) {
            const tabela = ({ cliente: 'clientes', colaborador: 'colaboradores', ativo: 'ativos', negocio: 'negocios', reuniao: 'reunioes' } as any)[alteracoes.entidade_tipo];
            if (!tabela) return res.status(400).json({ error: 'Tipo de entidade inválido.' });
            const { data: ent } = await supabase.from(tabela).select('id, nome, titulo').eq('id', alteracoes.entidade_id).eq('empresa_id', empresaDe(req)).maybeSingle();
            if (!ent) return res.status(400).json({ error: 'Entidade não encontrada.' });
            alteracoes.entidade_nome = ent.nome || ent.titulo || alteracoes.entidade_nome;
        }

        const { data, error } = await supabase.from('documentos').update(alteracoes).eq('id', req.params.id).eq('empresa_id', empresaDe(req)).select('id').single();
        if (error || !data) return res.status(404).json({ error: 'Documento não encontrado ou sem permissão.' });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/reprocessar', async (req: AuthRequest, res: Response) => {
    try {
        const { data } = await supabase.from('documentos').update({ estado: 'a_processar', erro: null }).eq('id', req.params.id).eq('empresa_id', empresaDe(req)).select('id');
        if (!data || data.length === 0) return res.status(404).json({ error: 'Documento não encontrado.' });
        DocumentosService.processarFila().catch(() => {});
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const { data: doc } = await supabase.from('documentos').select('id, storage_path').eq('id', req.params.id).eq('empresa_id', empresaDe(req)).maybeSingle();
        if (!doc) return res.status(404).json({ error: 'Documento não encontrado.' });
        const { error } = await supabase.from('documentos').delete().eq('id', doc.id).eq('empresa_id', empresaDe(req));
        if (error) throw error;
        if (doc.storage_path) await MediaUploadService.apagarDocumento(doc.storage_path, empresaDe(req));
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// ATIVOS (máquinas, viaturas, equipamento...)
// ============================================================
router.get('/ativos/lista', async (req: AuthRequest, res: Response) => {
    try {
        const { data: ativos } = await supabase.from('ativos').select('*').eq('empresa_id', empresaDe(req)).order('nome');
        const { data: docs } = await supabase.from('documentos').select('entidade_id, validade, estado').eq('empresa_id', empresaDe(req)).eq('entidade_tipo', 'ativo').eq('estado', 'arquivado');
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
        const permitido = ['nome', 'categoria', 'marca', 'modelo', 'numero_serie', 'localizacao', 'estado', 'notas'];
        const alt: any = {};
        for (const k of permitido) if (k in req.body) alt[k] = req.body[k];
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
        // Os documentos ficam; só perdem a ligação.
        await supabase.from('documentos').update({ entidade_tipo: null, entidade_id: null }).eq('empresa_id', empresaDe(req)).eq('entidade_tipo', 'ativo').eq('entidade_id', String(req.params.id));
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Entidades a que se pode ligar um documento (para o seletor no ecrã).
router.get('/entidades/opcoes', async (req: AuthRequest, res: Response) => {
    try {
        const e = empresaDe(req);
        const [c, col, at] = await Promise.all([
            supabase.from('clientes').select('id, nome').eq('empresa_id', e).order('nome').limit(500),
            supabase.from('colaboradores').select('id, nome').eq('empresa_id', e).order('nome').limit(500),
            supabase.from('ativos').select('id, nome').eq('empresa_id', e).order('nome').limit(500),
        ]);
        res.json({ success: true, clientes: c.data || [], colaboradores: col.data || [], ativos: at.data || [] });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// DEFINIÇÕES (só admin): captura por email/WhatsApp e permissões por área
// ============================================================
const soAdmin = (req: AuthRequest, res: Response, next: any) =>
    ['admin', 'superadmin'].includes(req.user!.role) ? next() : res.status(403).json({ error: 'Só administradores.' });

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
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
