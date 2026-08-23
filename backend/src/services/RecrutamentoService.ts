import { supabase } from '../lib/supabaseClient';
import { AIGatewayService } from './AIGatewayService';

export interface ParecerIA {
    score: number;
    pontos_fortes: string[];
    pontos_fracos: string[];
}

export class RecrutamentoService {
    /**
     * Avaliação por IA de um CV face aos critérios de uma vaga — ponto único
     * usado tanto pelo upload interno (RH) como pela candidatura pública, para
     * nunca mais haver um caminho com pontuação real e outro com Math.random().
     */
    public static async avaliarCandidato(cvTexto: string, vagaTitulo: string, vagaCriterios: string): Promise<ParecerIA> {
        const systemPrompt = `
        És um sistema de Triagem de RH altamente minucioso.
        Vais receber o CV de um candidato e os critérios definidos para a Vaga de "${vagaTitulo}".
        Avalia o CV puramente com base nestes critérios.
        Retorna UM JSON ESTRITAMENTE com a seguinte estrutura:
        {
            "score": [0 a 100],
            "pontos_fortes": ["ponto 1", "ponto 2"],
            "pontos_fracos": ["falta X", "não menciona Y"]
        }
        `;
        const userPrompt = `
        CRITÉRIOS DA VAGA:
        ${vagaCriterios || 'Nenhum critério específico definido — avalia de forma geral a qualidade e clareza do CV.'}

        TEXTO EXTRAÍDO DO CV:
        ${cvTexto}
        `;

        const response = await AIGatewayService.chamarComFallback({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3
        });

        const raw = response.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(raw);
        return {
            score: Number(parsed.score) || 0,
            pontos_fortes: Array.isArray(parsed.pontos_fortes) ? parsed.pontos_fortes : [],
            pontos_fracos: Array.isArray(parsed.pontos_fracos) ? parsed.pontos_fracos : []
        };
    }

    /**
     * Envia o CV para o Supabase Storage (bucket já usado para media do WhatsApp
     * e avatares — evita ter de criar/configurar um bucket novo) em vez de disco
     * local, que não sobrevive a um redeploy/restart do container.
     */
    public static async uploadCvParaStorage(buffer: Buffer, nomeFicheiroOriginal: string, mimeType: string, empresaId: string | number): Promise<string> {
        const ext = (nomeFicheiroOriginal.match(/\.[a-zA-Z0-9]+$/)?.[0] || '.pdf').toLowerCase();
        const storagePath = `curriculos/${empresaId}/${Date.now()}${ext}`;

        const { error } = await supabase.storage
            .from('whatsapp-media')
            .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

        if (error) throw new Error('Falha ao guardar o currículo: ' + error.message);

        const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(storagePath);
        if (!urlData?.publicUrl) throw new Error('Não foi possível gerar o link do currículo.');
        return urlData.publicUrl;
    }

    /**
     * Mensagem de feedback empática gerada por IA quando um candidato avança
     * para "Oferta" ou é "Rejeitado" — nunca instrui o modelo a inventar uma
     * entrevista (isso passou a ser um evento real, ver agendar-entrevista).
     */
    public static async gerarMensagemDecisao(etapa: 'Oferta' | 'Rejeitado', nomeCandidato: string, vagaTitulo: string, parecer?: ParecerIA): Promise<string> {
        const prompt = `
        És um(a) Diretor(a) de Recursos Humanos a redigir um email para dar feedback a um candidato.
        Tom: Empático, profissional, acolhedor.
        A decisão foi: ${etapa === 'Oferta' ? 'AVANÇAR COM PROPOSTA/OFERTA' : 'REJEITADO'}.
        A Vaga era para: ${vagaTitulo}.
        O nome do candidato é: ${nomeCandidato}.
        ${parecer ? `A avaliação da IA detetou isto (usa se quiseres fundamentar levemente): ${JSON.stringify(parecer)}` : ''}

        Gera APENAS o texto da mensagem final, pronta a enviar. Não uses variáveis por preencher, não inventes datas nem eventos.
        Se for AVANÇAR COM OFERTA: parabeniza e diz que a equipa entrará em contacto em breve com os próximos passos.
        Se for REJEITADO: sê muito educado, agradece o tempo investido, diz que o perfil não encaixa perfeitamente desta vez e deseja sucesso.
        `;

        const response = await AIGatewayService.chamarComFallback({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.6
        });

        return response.choices[0]?.message?.content || (etapa === 'Oferta'
            ? `Parabéns, ${nomeCandidato}! Vamos avançar consigo para a vaga de ${vagaTitulo}. Entraremos em contacto em breve.`
            : `Obrigado pelo seu interesse na vaga de ${vagaTitulo}, ${nomeCandidato}. Nesta ocasião optámos por outro perfil, mas desejamos-lhe sucesso.`);
    }
}
