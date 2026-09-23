import { supabase } from '../lib/supabaseClient';
import { EmailService } from './EmailService';

export interface ContactoEmail {
    id: number | null;
    nome: string | null;
    email: string;
    empresa: string | null;
    custom_fields: Record<string, any> | null;
}

/**
 * Campanhas de email em massa.
 *
 * Segue o mesmo desenho das campanhas de WhatsApp: a mensagem de cada pessoa é
 * resolvida no momento em que a campanha é criada (o envio não recalcula nada),
 * e um processador em segundo plano manda aos poucos. Enviar 2000 emails de
 * rajada faz o servidor de correio fechar a porta e o domínio ganhar fama de
 * spam — por isso há um limite de ritmo e ele não é contornável pela interface.
 */
export class EmailCampaignService {

    /** Acima disto, os servidores de correio começam a recusar ou a marcar como spam. */
    private static readonly MAX_POR_MINUTO = 60;
    private static aCorrer = false;

    private static readonly EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    public static valido(email: string): boolean {
        return EmailCampaignService.EMAIL_VALIDO.test(String(email || '').trim());
    }

    // ============================================================
    // Quem recebe
    // ============================================================
    public static async resolverPublico(
        empresaId: string,
        publicoTipo: 'todos' | 'tags' | 'manual' | 'lista',
        opcoes: { tags?: string[]; manualIds?: number[]; lista?: string },
        client: any = supabase
    ): Promise<ContactoEmail[]> {
        // Lista colada à mão: não toca no CRM, aceita separação por vírgulas,
        // ponto e vírgula ou linhas, e ignora o que não for um email.
        if (publicoTipo === 'lista') {
            const vistos = new Set<string>();
            return String(opcoes.lista || '')
                .split(/[,;\n]+/).map(t => t.trim()).filter(Boolean)
                .filter(e => EmailCampaignService.valido(e))
                .filter(e => { const k = e.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; })
                .map(e => ({ id: null, nome: null, email: e, empresa: null, custom_fields: null }));
        }

        let query = client.from('clientes').select('id, nome, email, empresa, custom_fields').eq('empresa_id', empresaId);
        if (publicoTipo === 'tags' && opcoes.tags?.length) query = query.overlaps('tags', opcoes.tags);
        else if (publicoTipo === 'manual' && opcoes.manualIds?.length) query = query.in('id', opcoes.manualIds);

        const { data, error } = await query;
        if (error) throw error;

        // Um contacto sem email não pode receber, e o mesmo endereço não entra
        // duas vezes — senão a mesma pessoa recebia a mesma coisa repetida.
        const vistos = new Set<string>();
        return (data || [])
            .filter((c: any) => EmailCampaignService.valido(c.email))
            .filter((c: any) => { const k = String(c.email).toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; });
    }

    /** Substitui {{nome}}, {{empresa}}, {{email}} e qualquer campo personalizado. */
    public static resolver(texto: string, contacto: ContactoEmail): string {
        return String(texto || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, chave) => {
            const k = String(chave).toLowerCase();
            if (k === 'nome') return contacto.nome || '';
            if (k === 'email') return contacto.email || '';
            if (k === 'empresa') return contacto.empresa || '';
            const v = contacto.custom_fields?.[chave] ?? contacto.custom_fields?.[k];
            return v === undefined || v === null ? '' : String(v);
        });
    }

    // ============================================================
    // Criar
    // ============================================================
    public static async criar(
        empresaId: string,
        dados: {
            nome: string; descricao?: string; assunto: string; corpo_html: string;
            anexos?: { nome: string; url: string; tipo?: string; tamanho?: number }[];
            publico_tipo: 'todos' | 'tags' | 'manual' | 'lista';
            publico_tags?: string[]; manual_ids?: number[]; lista?: string;
            agendada_para?: string; velocidade_por_minuto?: number;
        },
        criadoPor: string,
        client: any = supabase
    ) {
        if (!dados.nome?.trim()) throw new Error('Dê um nome à campanha.');
        if (!dados.assunto?.trim()) throw new Error('Escreva o assunto do email.');
        if (!dados.corpo_html?.trim()) throw new Error('Escreva a mensagem.');

        if (!(await EmailService.isConfigured(empresaId, client))) {
            throw new Error('O email da empresa ainda não está configurado (Definições → Email).');
        }

        const contactos = await EmailCampaignService.resolverPublico(
            empresaId, dados.publico_tipo,
            { tags: dados.publico_tags, manualIds: dados.manual_ids, lista: dados.lista },
            client
        );
        if (contactos.length === 0) {
            throw new Error(dados.publico_tipo === 'lista'
                ? 'Nenhum endereço válido na lista que colou.'
                : 'Nenhum contacto com email neste público-alvo.');
        }

        const velocidade = Math.max(1, Math.min(dados.velocidade_por_minuto || 30, EmailCampaignService.MAX_POR_MINUTO));

        const { data: campanha, error } = await client.from('email_campanhas').insert({
            empresa_id: empresaId,
            nome: dados.nome.trim(),
            descricao: dados.descricao || null,
            assunto: dados.assunto,
            corpo_html: dados.corpo_html,
            anexos: dados.anexos || [],
            publico_tipo: dados.publico_tipo,
            publico_tags: dados.publico_tags || null,
            estado: dados.agendada_para ? 'Agendada' : 'Rascunho',
            agendada_para: dados.agendada_para || null,
            velocidade_por_minuto: velocidade,
            criado_por: criadoPor
        }).select('id').single();
        if (error) throw error;

        const destinatarios = contactos.map(c => ({
            campanha_id: campanha.id,
            empresa_id: empresaId,
            cliente_id: c.id,
            nome: c.nome,
            email: c.email,
            assunto_resolvido: EmailCampaignService.resolver(dados.assunto, c),
            corpo_resolvido: EmailCampaignService.resolver(dados.corpo_html, c),
            estado: 'Pendente'
        }));

        const { error: errDest } = await client.from('email_campanha_destinatarios').insert(destinatarios);
        if (errDest) throw errDest;

        return { id: campanha.id, totalDestinatarios: destinatarios.length };
    }

    // ============================================================
    // Estados
    // ============================================================
    public static async iniciar(empresaId: string, id: string, client: any = supabase) {
        const { data: c } = await client.from('email_campanhas').select('estado').eq('id', id).eq('empresa_id', empresaId).single();
        if (!c) throw new Error('Campanha não encontrada.');
        if (!['Rascunho', 'Pausada', 'Agendada'].includes(c.estado)) throw new Error(`Uma campanha ${c.estado} não pode ser iniciada.`);
        await client.from('email_campanhas')
            .update({ estado: 'Em_Execucao', iniciada_em: new Date().toISOString(), agendada_para: null })
            .eq('id', id).eq('empresa_id', empresaId);
    }

    public static async pausar(empresaId: string, id: string, client: any = supabase) {
        await client.from('email_campanhas').update({ estado: 'Pausada' })
            .eq('id', id).eq('empresa_id', empresaId).eq('estado', 'Em_Execucao');
    }

    public static async cancelar(empresaId: string, id: string, client: any = supabase) {
        await client.from('email_campanhas').update({ estado: 'Cancelada' }).eq('id', id).eq('empresa_id', empresaId);
        // Quem ainda não recebeu deixa de estar na fila; quem já recebeu fica no histórico.
        await client.from('email_campanha_destinatarios').update({ estado: 'Falhou', erro: 'Campanha cancelada' })
            .eq('campanha_id', id).eq('empresa_id', empresaId).eq('estado', 'Pendente');
    }

    public static async metricas(empresaId: string, id: string, client: any = supabase) {
        const conta = async (estado?: string) => {
            let q = client.from('email_campanha_destinatarios')
                .select('id', { count: 'exact', head: true }).eq('campanha_id', id).eq('empresa_id', empresaId);
            if (estado) q = q.eq('estado', estado);
            const { count } = await q;
            return count || 0;
        };
        const [total, enviados, falhados, pendentes] = await Promise.all([conta(), conta('Enviado'), conta('Falhou'), conta('Pendente')]);
        return { total, enviados, falhados, pendentes };
    }

    // ============================================================
    // Processamento em segundo plano
    // ============================================================
    public static async processarFila() {
        if (EmailCampaignService.aCorrer) return;
        EmailCampaignService.aCorrer = true;
        try {
            const agora = new Date().toISOString();
            await supabase.from('email_campanhas')
                .update({ estado: 'Em_Execucao', iniciada_em: agora })
                .eq('estado', 'Agendada').lte('agendada_para', agora);

            const { data: ativas } = await supabase.from('email_campanhas').select('*').eq('estado', 'Em_Execucao');
            for (const campanha of (ativas || [])) {
                await EmailCampaignService.processarLote(campanha);
            }
        } catch (e) {
            console.error('[EmailCampaign] Erro no processamento da fila:', e);
        } finally {
            EmailCampaignService.aCorrer = false;
        }
    }

    private static async processarLote(campanha: any) {
        try {
            // O poller corre a cada 20 segundos: um lote de ~1/3 da velocidade por
            // minuto mantém o ritmo sem rajadas.
            const tamanhoLote = Math.max(1, Math.min(Math.ceil((campanha.velocidade_por_minuto || 30) / 3), 25));

            const { data: pendentes } = await supabase.from('email_campanha_destinatarios')
                .select('*').eq('campanha_id', campanha.id).eq('estado', 'Pendente').limit(tamanhoLote);

            if (!pendentes || pendentes.length === 0) {
                const { count } = await supabase.from('email_campanha_destinatarios')
                    .select('id', { count: 'exact', head: true }).eq('campanha_id', campanha.id).eq('estado', 'Pendente');
                if (!count) {
                    await supabase.from('email_campanhas')
                        .update({ estado: 'Concluida', concluida_em: new Date().toISOString() }).eq('id', campanha.id);
                    console.log(`[EmailCampaign] Campanha "${campanha.nome}" concluída.`);
                }
                return;
            }

            for (const destinatario of pendentes) {
                await EmailCampaignService.enviarPara(campanha, destinatario);
            }
        } catch (e) {
            console.error(`[EmailCampaign] Erro no lote da campanha ${campanha.id}:`, e);
        }
    }

    private static async enviarPara(campanha: any, destinatario: any) {
        // Marca antes de enviar: se o servidor reiniciar a meio, o pior que
        // acontece é este email não sair — nunca sair duas vezes à mesma pessoa.
        const { data: reservado } = await supabase.from('email_campanha_destinatarios')
            .update({ estado: 'Enviado', enviado_em: new Date().toISOString() })
            .eq('id', destinatario.id).eq('estado', 'Pendente').select('id');
        if (!reservado || reservado.length === 0) return;   // outro ciclo já o apanhou

        try {
            const anexos = Array.isArray(campanha.anexos) ? campanha.anexos : [];
            const r = anexos.length
                ? await EmailService.enviarComAnexosDeLinks(
                    destinatario.email,
                    destinatario.assunto_resolvido || campanha.assunto,
                    destinatario.corpo_resolvido || campanha.corpo_html,
                    anexos, campanha.empresa_id, { registarNaCaixa: false, campanhaId: campanha.id })
                : await EmailService.enviarEmailPersonalizado(
                    destinatario.email,
                    destinatario.assunto_resolvido || campanha.assunto,
                    destinatario.corpo_resolvido || campanha.corpo_html,
                    campanha.empresa_id, undefined, { registarNaCaixa: false, campanhaId: campanha.id });

            const correu = r === true || (r as any)?.ok === true;
            if (!correu) throw new Error((r as any)?.erro || 'o servidor de correio não aceitou a mensagem');
        } catch (e: any) {
            await supabase.from('email_campanha_destinatarios')
                .update({ estado: 'Falhou', erro: String(e?.message || e).slice(0, 400), enviado_em: null })
                .eq('id', destinatario.id);
            console.error(`[EmailCampaign] Falhou para ${destinatario.email}:`, e?.message || e);
        }
    }
}
