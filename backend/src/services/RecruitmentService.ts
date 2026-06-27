import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import axios from 'axios';
import * as xlsx from 'xlsx';

export interface CandidatoExtraido {
    nome: string;
    email: string;
    anos_experiencia: number;
    idiomas: string;
    pontos_fortes: string;
    resumo_analise: string;
    pontuacao_adequacao: number; // 0 a 100
}

export class RecruitmentService {
    
    private static readonly OLLAMA_URL = 'http://localhost:11434/api/generate';
    private static readonly MODEL_NAME = 'gemma';

    /**
     * Lê o texto de um ficheiro PDF (Currículo)
     */
    public static async extrairTextoDePDF(filePath: string): Promise<string> {
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            return data.text;
        } catch (error) {
            console.error(`Erro ao ler PDF ${filePath}:`, error);
            throw new Error('Falha ao processar documento PDF.');
        }
    }

    /**
     * Envia o texto do currículo para a IA avaliar com base nos critérios da vaga, usando o Router Inteligente.
     */
    public static async analisarCurriculoComIA(textoCV: string, requisitosVaga: string): Promise<CandidatoExtraido> {
        const prompt = `
És um especialista de Recursos Humanos. Analisa o currículo abaixo tendo em conta estes requisitos: "${requisitosVaga}".
Responde ESTRITAMENTE em JSON com as chaves: "nome", "email" (vazio se não tiver), "anos_experiencia" (número), "idiomas", "pontos_fortes", "resumo_analise", "pontuacao_adequacao" (0 a 100).
Não incluas blocos \`\`\`json no output. Apenas o JSON puro.

Currículo:
${textoCV.substring(0, 4000)}
        `;

        try {
            // Importa on demand para evitar dependências circulares caso existam
            const { rotearEExecutar } = require('./AIRouterService');
            
            // taskType = 'cv_analysis'
            const result = await rotearEExecutar('cv_analysis', prompt, textoCV);
            
            let respostaLimpa = result.texto;
            // Remover blocos markdown se existirem
            if (respostaLimpa.startsWith('```json')) {
                respostaLimpa = respostaLimpa.replace(/```json/g, '').replace(/```/g, '').trim();
            } else if (respostaLimpa.startsWith('```')) {
                respostaLimpa = respostaLimpa.replace(/```/g, '').trim();
            }

            const candidato: CandidatoExtraido = JSON.parse(respostaLimpa);
            return candidato;

        } catch (error: any) {
            console.error('Erro na análise da IA (Router):', error.message);
            return {
                nome: "Candidato Desconhecido",
                email: "",
                anos_experiencia: 0,
                idiomas: "N/A",
                pontos_fortes: "Erro na leitura do CV",
                resumo_analise: "A IA não conseguiu estruturar a resposta ou o modelo não respeitou o formato JSON.",
                pontuacao_adequacao: 0
            };
        }
    }

    /**
     * Recebe uma lista de candidatos, ordena pelos melhores e cria um ficheiro Excel.
     */
    public static gerarExcelMelhoresCandidatos(candidatos: CandidatoExtraido[], topN: number = 5): string {
        // Ordenar os candidatos pela pontuação (do maior para o menor)
        const candidatosOrdenados = candidatos.sort((a, b) => b.pontuacao_adequacao - a.pontuacao_adequacao);
        
        // Ficar apenas com os Top N
        const topCandidatos = candidatosOrdenados.slice(0, topN);

        // Transformar para o formato que a biblioteca SheetJS (xlsx) consegue ler
        const worksheet = xlsx.utils.json_to_sheet(topCandidatos);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, "Top Candidatos");

        // Guardar o ficheiro fisicamente
        const fileName = `Top_${topN}_Candidatos_${Date.now()}.xlsx`;
        const filePath = path.join(__dirname, '..', '..', 'tmp', fileName);
        
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }

        xlsx.writeFile(workbook, filePath);
        
        return filePath;
    }
}
