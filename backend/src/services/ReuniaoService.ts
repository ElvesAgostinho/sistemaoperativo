import { SupabaseClient } from '@supabase/supabase-js';

interface CriarReuniaoInput {
    empresa_id?: string | number | null;
    titulo: string;
    data_hora: string;
    emails_convidados?: string;
}

export class ReuniaoService {
    /**
     * Cria o registo de uma reunião com sala Jitsi gerada. Ponto único de criação
     * usado tanto pela rota REST (reunioesController) quanto pela tool de IA
     * (AIToolsService), para evitar que a fórmula de roomName/linkJitsi divirja
     * entre os dois lugares.
     */
    public static async criarReuniaoRegistro(dados: CriarReuniaoInput, supabaseClient: SupabaseClient) {
        const roomName = `BusinessOS_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const linkJitsi = `https://meet.jit.si/${roomName}`;

        const { data: info, error } = await supabaseClient.from('reunioes').insert({
            empresa_id: dados.empresa_id || null,
            titulo: dados.titulo,
            data_hora: dados.data_hora,
            link_jitsi: linkJitsi,
            emails_convidados: dados.emails_convidados || '',
            estado: 'Agendada'
        }).select('id').single();

        if (error) throw error;

        return { id: info.id as string, roomName, linkJitsi };
    }
}
