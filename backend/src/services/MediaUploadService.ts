import { supabase } from '../lib/supabaseClient';

export type TipoMedia = 'imagem' | 'video' | 'audio' | 'documento';
export type Pasta = 'workflows' | 'campanhas' | 'conhecimento' | 'documentos';

/**
 * Guarda multimédia enviada pelo utilizador (nós do Autopilot, campanhas) no
 * Supabase Storage e devolve um link público.
 *
 * Antes isto ia para uma pasta local do servidor — o que não funciona em
 * produção por duas razões: o container é Linux (o caminho gravado era um
 * caminho de Windows da máquina de desenvolvimento) e o disco do container é
 * apagado a cada redeploy, levando os ficheiros com ele.
 */
export class MediaUploadService {

    public static tipoDeMedia(mimeType: string): TipoMedia {
        if (mimeType.startsWith('image/')) return 'imagem';
        if (mimeType.startsWith('video/')) return 'video';
        if (mimeType.startsWith('audio/')) return 'audio';
        return 'documento';
    }

    public static async upload(
        buffer: Buffer,
        nomeOriginal: string,
        mimeType: string,
        pasta: Pasta,
        empresaId?: string | number,
        // A Base de Conhecimento guarda um ficheiro por nome (reenviar substitui
        // o anterior); multimédia guarda cada envio como ficheiro novo.
        opcoes?: { nomeFixo?: boolean }
    ): Promise<{ url: string; tipo: TipoMedia; nome: string }> {
        const nomeSeguro = nomeOriginal.replace(/[^a-zA-Z0-9._-]/g, '_');
        const caminho = opcoes?.nomeFixo
            ? `${pasta}/${empresaId || 'sem-empresa'}/${nomeSeguro}`
            : `${pasta}/${empresaId || 'sem-empresa'}/${Date.now()}_${nomeSeguro}`;

        const { error } = await supabase.storage
            .from('whatsapp-media')
            .upload(caminho, buffer, { contentType: mimeType, upsert: !!opcoes?.nomeFixo });

        if (error) throw new Error('Falha ao guardar o ficheiro: ' + error.message);

        const { data } = supabase.storage.from('whatsapp-media').getPublicUrl(caminho);
        if (!data?.publicUrl) throw new Error('Não foi possível gerar o link do ficheiro.');

        return { url: data.publicUrl, tipo: MediaUploadService.tipoDeMedia(mimeType), nome: nomeOriginal };
    }

    // ============================================================
    // BUCKET PRIVADO DE DOCUMENTOS
    // Contratos, recibos e identificação nunca podem ter um link permanente:
    // guardam-se num bucket privado (criado pelo backend se não existir, sem
    // restrição de tipo de ficheiro) e só saem por links assinados que
    // expiram. O bucket público "whatsapp-media" fica só para multimédia.
    // ============================================================
    private static readonly BUCKET_DOCS = 'documentos';
    private static bucketDocsPronto = false;

    private static async garantirBucketDocs(): Promise<void> {
        if (this.bucketDocsPronto) return;
        const { data } = await supabase.storage.getBucket(this.BUCKET_DOCS);
        if (!data) {
            const { error } = await supabase.storage.createBucket(this.BUCKET_DOCS, { public: false, fileSizeLimit: 30 * 1024 * 1024 });
            if (error && !/already exists/i.test(error.message)) throw new Error('Não foi possível criar o bucket de documentos: ' + error.message);
        }
        this.bucketDocsPronto = true;
    }

    /** Guarda um documento no bucket privado e devolve o caminho (não um link). */
    public static async guardarDocumento(buffer: Buffer, empresaId: string, nomeFicheiro: string, mimeType: string): Promise<string> {
        await this.garantirBucketDocs();
        const nomeSeguro = nomeFicheiro.replace(/[^a-zA-Z0-9._-]/g, '_');
        const caminho = `${empresaId}/${Date.now()}_${nomeSeguro}`;
        const { error } = await supabase.storage.from(this.BUCKET_DOCS).upload(caminho, buffer, { contentType: mimeType, upsert: false });
        if (error) throw new Error('Falha ao guardar o ficheiro: ' + error.message);
        return caminho;
    }

    /**
     * Anexos de email. Vão para o bucket privado e não para o público por duas
     * razões: o público só aceita imagens/vídeos/áudio (um .txt ou um .zip era
     * recusado), e um anexo pode ser um contrato — com link público, qualquer
     * pessoa que apanhasse o endereço abria-o.
     */
    public static async guardarAnexoEmail(buffer: Buffer, empresaId: string, nomeFicheiro: string, mimeType: string): Promise<string> {
        await this.garantirBucketDocs();
        const nomeSeguro = nomeFicheiro.replace(/[^a-zA-Z0-9._-]/g, '_');
        const caminho = `${empresaId}/email-anexos/${Date.now()}_${nomeSeguro}`;
        const { error } = await supabase.storage.from(this.BUCKET_DOCS).upload(caminho, buffer, { contentType: mimeType || 'application/octet-stream', upsert: false });
        if (error) throw new Error('Falha ao guardar o anexo: ' + error.message);
        return caminho;
    }

    /** Link temporário para ver/descarregar (expira). */
    public static async assinarDocumento(caminho: string, segundos = 3600): Promise<string | null> {
        if (!caminho) return null;
        const { data, error } = await supabase.storage.from(this.BUCKET_DOCS).createSignedUrl(caminho, segundos);
        if (error) { console.error('[MediaUpload] Falha a assinar link:', error.message); return null; }
        return data?.signedUrl || null;
    }

    public static async descarregarDocumento(caminho: string): Promise<Buffer> {
        const { data, error } = await supabase.storage.from(this.BUCKET_DOCS).download(caminho);
        if (error || !data) throw new Error('Não foi possível ler o ficheiro guardado: ' + (error?.message || 'vazio'));
        return Buffer.from(await data.arrayBuffer());
    }

    public static async apagarDocumento(caminho: string, empresaId: string): Promise<boolean> {
        // Só dentro da pasta da própria empresa.
        if (!caminho || !caminho.startsWith(`${empresaId}/`) || caminho.includes('..')) return false;
        const { error } = await supabase.storage.from(this.BUCKET_DOCS).remove([caminho]);
        if (error) { console.error('[MediaUpload] Falha a apagar documento:', error.message); return false; }
        return true;
    }

    /**
     * Apaga um ficheiro a partir do link público, mas SÓ se ele estiver dentro
     * da pasta da própria empresa. Sem esta verificação, bastava passar o link
     * de outra empresa para lhe apagar os ficheiros.
     *
     * Devolve false (sem rebentar) quando o link não é reconhecido ou não
     * pertence a esta empresa — apagar multimédia é sempre limpeza, nunca deve
     * fazer falhar a operação principal que a despoletou.
     */
    public static async apagar(url: string, pasta: Pasta, empresaId?: string | number): Promise<boolean> {
        try {
            if (!url || !empresaId) return false;
            const marcador = '/whatsapp-media/';
            const i = url.indexOf(marcador);
            if (i === -1) return false;

            const caminho = decodeURIComponent(url.slice(i + marcador.length).split('?')[0]);
            const prefixoEsperado = `${pasta}/${empresaId}/`;
            if (!caminho.startsWith(prefixoEsperado) || caminho.includes('..')) {
                console.warn(`[MediaUpload] Recusado apagar "${caminho}": fora da pasta da empresa ${empresaId}.`);
                return false;
            }

            const { error } = await supabase.storage.from('whatsapp-media').remove([caminho]);
            if (error) {
                console.error('[MediaUpload] Erro ao apagar ficheiro:', error.message);
                return false;
            }
            return true;
        } catch (e: any) {
            console.error('[MediaUpload] Erro inesperado ao apagar ficheiro:', e.message);
            return false;
        }
    }
}
