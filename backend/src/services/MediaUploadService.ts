import { supabase } from '../lib/supabaseClient';

export type TipoMedia = 'imagem' | 'video' | 'audio' | 'documento';

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
        pasta: 'workflows' | 'campanhas',
        empresaId?: string | number
    ): Promise<{ url: string; tipo: TipoMedia; nome: string }> {
        const nomeSeguro = nomeOriginal.replace(/[^a-zA-Z0-9._-]/g, '_');
        const caminho = `${pasta}/${empresaId || 'sem-empresa'}/${Date.now()}_${nomeSeguro}`;

        const { error } = await supabase.storage
            .from('whatsapp-media')
            .upload(caminho, buffer, { contentType: mimeType, upsert: false });

        if (error) throw new Error('Falha ao guardar o ficheiro: ' + error.message);

        const { data } = supabase.storage.from('whatsapp-media').getPublicUrl(caminho);
        if (!data?.publicUrl) throw new Error('Não foi possível gerar o link do ficheiro.');

        return { url: data.publicUrl, tipo: MediaUploadService.tipoDeMedia(mimeType), nome: nomeOriginal };
    }
}
