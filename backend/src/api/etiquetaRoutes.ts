import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { getSupabase } from '../lib/supabaseClient';
import { EtiquetaService } from '../services/EtiquetaService';

const router = Router();

/** A lista da empresa, com quantos contactos têm cada uma. */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const empresaId = req.user?.empresa_id;
        if (!empresaId) return res.status(400).json({ error: 'Utilizador sem empresa associada.' });
        const client = getSupabase(req);

        const [etiquetas, contagens] = await Promise.all([
            EtiquetaService.listar(empresaId, client),
            EtiquetaService.contagens(empresaId, client)
        ]);

        res.json({
            success: true,
            etiquetas: etiquetas.map(e => ({ ...e, contactos: contagens[e.nome.trim().toLowerCase()] || 0 }))
        });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const empresaId = req.user?.empresa_id;
        if (!empresaId) return res.status(400).json({ error: 'Utilizador sem empresa associada.' });
        const { nome, cor, descricao } = req.body || {};
        const etiqueta = await EtiquetaService.criar(
            empresaId, nome, { cor, descricao, criadoPor: req.user?.id }, getSupabase(req)
        );
        res.json({ success: true, etiqueta });
    } catch (err: any) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const empresaId = req.user?.empresa_id;
        const { nome, cor, descricao } = req.body || {};
        const client = getSupabase(req);

        const { data: atual } = await client.from('etiquetas')
            .select('id, nome').eq('id', req.params.id).eq('empresa_id', empresaId).maybeSingle();
        if (!atual) return res.status(404).json({ success: false, error: 'Etiqueta não encontrada.' });

        const novoNome = nome !== undefined ? String(nome).trim() : atual.nome;
        if (!novoNome) return res.status(400).json({ success: false, error: 'Dê um nome à etiqueta.' });

        // Mudar o nome da etiqueta tem de mudar também nos contactos que a têm —
        // senão o contacto fica com um nome que já não existe na lista.
        if (!EtiquetaService.mesma(novoNome, atual.nome)) {
            const { data: clientes } = await client.from('clientes').select('id, tags').eq('empresa_id', empresaId);
            for (const c of (clientes || [])) {
                const tags: string[] = c.tags || [];
                if (!tags.some((t: string) => EtiquetaService.mesma(t, atual.nome))) continue;
                await client.from('clientes')
                    .update({ tags: tags.map((t: string) => EtiquetaService.mesma(t, atual.nome) ? novoNome : t) })
                    .eq('id', c.id);
            }
        }

        const patch: any = { nome: novoNome };
        if (cor !== undefined) patch.cor = cor;
        if (descricao !== undefined) patch.descricao = descricao;

        const { data, error } = await client.from('etiquetas')
            .update(patch).eq('id', req.params.id).eq('empresa_id', empresaId)
            .select('id, nome, cor, descricao').single();
        if (error) throw error;
        res.json({ success: true, etiqueta: data });
    } catch (err: any) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const empresaId = req.user?.empresa_id;
        // Por omissão tira-se também dos contactos: deixá-la pendurada neles
        // depois de a apagar da lista era voltar ao texto livre pela porta do lado.
        const tirarDosContactos = req.query.manter !== 'true';
        const r = await EtiquetaService.apagar(
            empresaId!, req.params.id, { tirarDosContactos }, getSupabase(req)
        );
        res.json({ success: true, ...r });
    } catch (err: any) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/** Pôr e tirar etiquetas de um contacto, a partir do CRM ou do chat. */
router.put('/contacto/:clienteId', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const empresaId = req.user?.empresa_id;
        if (!empresaId) return res.status(400).json({ error: 'Utilizador sem empresa associada.' });
        const { adicionar, remover } = req.body || {};
        const tags = await EtiquetaService.aplicarNoContacto(
            empresaId, req.params.clienteId,
            { adicionar: adicionar || [], remover: remover || [] },
            getSupabase(req)
        );
        res.json({ success: true, tags });
    } catch (err: any) {
        res.status(400).json({ success: false, error: err.message });
    }
});

export default router;
