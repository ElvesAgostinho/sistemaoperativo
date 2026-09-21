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
