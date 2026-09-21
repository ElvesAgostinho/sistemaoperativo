import OpenAI from 'openai';
import path from 'path';

export const AREAS = [
    'Legal & Licenças', 'Financeiro', 'RH', 'Clientes', 'Fornecedores',
    'Operações', 'Qualidade & Segurança', 'Outros'
] as const;
export type Area = typeof AREAS[number];

export const TIPOS = [
    'Fatura', 'Recibo', 'Proforma', 'Contrato', 'Licença', 'Certificado', 'Alvará',
    'Identificação', 'Declaração', 'Relatório', 'Ata', 'Manual', 'Ficha Técnica',
    'Ficha de Segurança', 'Guia de Remessa', 'Documento Alfandegário', 'Apólice',
    'Comprovativo', 'Correspondência', 'Outro'
] as const;

export interface AnaliseDocumento {
    e_documento: boolean;
    titulo: string;
    area: Area;
    tipo: string;
    resumo: string;
    entidade: { tipo: 'cliente' | 'colaborador' | 'ativo' | 'fornecedor' | null; nome: string | null };
    campos: Record<string, any>;
    metadados: Record<string, any>;        // campos do tipo configurado pela empresa, já pela chave certa
    data_documento: string | null;
    validade: string | null;
    texto: string;
    confianca: number;
}

/**
 * O que a empresa já sabe e que ajuda a IA a acertar: os tipos de documento
 * que configurou (com os campos próprios), os nomes dos clientes /
 * colaboradores / ativos registados e o nome da própria empresa (para não a
 * confundir com a contraparte).
 */
export interface ContextoEmpresa {
    empresaNome?: string | null;
    tipos?: { nome: string; area_padrao?: string; tem_validade?: boolean; campos?: { chave: string; rotulo: string; tipo: string; opcoes?: string[] }[] }[];
    entidades?: { clientes?: string[]; colaboradores?: string[]; ativos?: string[] };
}
const MAX_NOMES_POR_LISTA = 300;

// Modelo com visão: lê fotos e PDFs digitalizados. A OpenAI é chamada
// diretamente (não pelo gateway) porque o gateway só publica um alias de
// texto e este passo precisa de visão e de saída em JSON.
const MODELO_LEITURA = process.env.DOCUMENTOS_MODELO || 'gpt-4o-mini';
const MAX_TEXTO_ENVIADO = 12000;

/**
 * Lê um documento (PDF, imagem, texto, folha de cálculo), classifica-o e
 * extrai o que interessa: área, tipo, entidade a que pertence, campos-chave
 * e validade. Fotos de papel e PDFs digitalizados vão ao modelo com visão;
 * documentos com texto vão só como texto, que é muito mais barato.
 */
export class DocumentoIAService {

    public static async analisar(buffer: Buffer, mimeType: string, nomeFicheiro: string, contexto: ContextoEmpresa = {}): Promise<AnaliseDocumento> {
        const { texto, precisaVisao } = await this.extrairTexto(buffer, mimeType, nomeFicheiro);

        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const conteudoUtilizador: any[] = [];

        if (precisaVisao) {
            const ehPdf = mimeType === 'application/pdf' || nomeFicheiro.toLowerCase().endsWith('.pdf');
            if (ehPdf) {
                conteudoUtilizador.push({
                    type: 'file',
                    file: { filename: nomeFicheiro, file_data: `data:application/pdf;base64,${buffer.toString('base64')}` }
                });
            } else {
                conteudoUtilizador.push({
                    type: 'image_url',
                    image_url: { url: `data:${mimeType};base64,${buffer.toString('base64')}`, detail: 'high' }
                });
            }
            conteudoUtilizador.push({ type: 'text', text: `Nome do ficheiro: ${nomeFicheiro}\n\nLê o documento na imagem/PDF acima e transcreve o texto completo no campo "texto".` });
        } else {
            conteudoUtilizador.push({
                type: 'text',
                text: `Nome do ficheiro: ${nomeFicheiro}\n\nTEXTO DO DOCUMENTO:\n${texto.slice(0, MAX_TEXTO_ENVIADO)}${texto.length > MAX_TEXTO_ENVIADO ? '\n[...texto truncado...]' : ''}\n\nO texto já foi extraído — deixa o campo "texto" vazio.`
            });
        }

        const resposta = await client.chat.completions.create({
            model: MODELO_LEITURA,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: this.promptSistema(contexto) },
                { role: 'user', content: conteudoUtilizador }
            ]
        } as any);

        const bruto = resposta.choices[0]?.message?.content || '{}';
        let json: any = {};
        try { json = JSON.parse(bruto); } catch { json = {}; }

        return this.normalizar(json, precisaVisao ? (json.texto || '') : texto, nomeFicheiro);
    }

    // ------------------------------------------------------------------

    private static promptSistema(ctx: ContextoEmpresa): string {
        const tipos = (ctx.tipos || []).filter(t => t.nome);
        const listaTipos = tipos.length > 0
            ? tipos.map(t => `  - "${t.nome}"${t.area_padrao ? ` (área habitual: ${t.area_padrao})` : ''}${t.tem_validade ? ' [tem validade]' : ''}${(t.campos || []).length ? `: campos ${t.campos!.map(c => `${c.chave} (${c.rotulo}, ${c.tipo}${c.opcoes?.length ? `: ${c.opcoes.join('/')}` : ''})`).join(', ')}` : ''}`).join('\n')
            : null;
        const corta = (l?: string[]) => (l || []).filter(Boolean).slice(0, MAX_NOMES_POR_LISTA);
        const clientes = corta(ctx.entidades?.clientes), colaboradores = corta(ctx.entidades?.colaboradores), ativos = corta(ctx.entidades?.ativos);
        const blocoEmpresa = [
            ctx.empresaNome ? `A empresa dona do arquivo chama-se "${ctx.empresaNome}". Ela própria NUNCA é a "entidade": a entidade é a outra parte (o cliente, o fornecedor, o colaborador, o equipamento). Do mesmo modo, NIF, morada e contactos em "metadados" (ex.: nif, contraparte) são os da outra parte — se o documento só trouxer os da própria empresa, deixa null.` : '',
            listaTipos ? `TIPOS DE DOCUMENTO CONFIGURADOS PELA EMPRESA (usa um destes em "tipo" sempre que encaixar; só recorres à lista genérica se nenhum servir):\n${listaTipos}\nPara o tipo escolhido, preenche "metadados" com as chaves EXATAS dos campos desse tipo (valor null quando o documento não o diz).` : '',
            clientes.length ? `CLIENTES REGISTADOS: ${clientes.join(' | ')}` : '',
            colaboradores.length ? `COLABORADORES REGISTADOS: ${colaboradores.join(' | ')}` : '',
            ativos.length ? `ATIVOS/EQUIPAMENTOS REGISTADOS: ${ativos.join(' | ')}` : '',
            (clientes.length || colaboradores.length || ativos.length) ? `Se a entidade do documento for um destes registos, escreve o nome EXATAMENTE como está na lista (mesmo que o documento o escreva de forma diferente, com "Lda", siglas ou maiúsculas). Se não for nenhum, escreve o nome como aparece no documento.` : ''
        ].filter(Boolean).join('\n\n');

        return `És o arquivista de uma empresa em Angola. Recebes um documento e devolves APENAS um objeto JSON com esta forma exata:

{
  "e_documento": true/false,
  "titulo": "título curto e útil (ex: 'Fatura Unitel nº 2024/118', 'Alvará Industrial 2025', 'Contrato de trabalho — Ana Silva')",
  "area": uma de [${AREAS.map(a => `"${a}"`).join(', ')}],
  "tipo": ${tipos.length ? 'um dos tipos configurados pela empresa (abaixo) ou, só se nenhum servir, ' : ''}uma de [${TIPOS.map(t => `"${t}"`).join(', ')}],
  "resumo": "uma frase a dizer o que é e o que interessa (quem, o quê, quanto, até quando)",
  "entidade": { "tipo": "cliente" | "colaborador" | "ativo" | "fornecedor" | null, "nome": "nome da pessoa/empresa/equipamento a que o documento diz respeito" | null },
  "campos": { "emissor": ..., "destinatario": ..., "nif": ..., "numero": ..., "valor": número ou null, "moeda": "AOA"/"USD"/"EUR"/null, ...outros campos relevantes },
  "metadados": { ...campos do tipo configurado, pela chave exata... } ou {},
  "data_documento": "AAAA-MM-DD" | null,
  "validade": "AAAA-MM-DD" | null,
  "texto": "transcrição completa (só quando te pedirem)",
  "confianca": 0.0 a 1.0
}

${blocoEmpresa ? blocoEmpresa + '\n\n' : ''}Regras:
- "e_documento" é false para coisas que não são documentos da empresa: logótipos, assinaturas soltas, memes, publicidade, newsletters, fotos sem texto útil.
- "validade" é a data em que o documento CADUCA ou o contrato TERMINA (licenças, alvarás, certificados, BI, apólices, contratos com prazo, garantias). Se não caduca, null. Nunca inventes datas.
- "entidade": para uma fatura de fornecedor é o fornecedor; para uma proforma ou contrato de venda é o cliente; para contrato de trabalho, BI, recibo de vencimento ou certificado de formação é o colaborador; para manual, certificado de calibração, inspeção ou apólice de uma máquina/viatura é o ativo.
- "area": Legal & Licenças (alvarás, licenças, certidões, registos, INSS, estatutos), Financeiro (faturas, recibos, comprovativos, extratos, impostos), RH (contratos de trabalho, identificação de colaboradores, formações, medicina do trabalho), Clientes (propostas, contratos de venda, proformas a clientes), Fornecedores (faturas e contratos de fornecedores, importação, alfândega), Operações (manuais, fichas técnicas, manutenções, produção), Qualidade & Segurança (certificados de qualidade, inspeções, fichas de segurança, auditorias, planos de emergência), Outros.
- "confianca": quão certo estás da área, tipo e entidade. Documento nítido e inequívoco: 0.9+. Foto má, texto parcial ou tipo ambíguo: abaixo de 0.7.
- "data_documento" é a data de emissão/assinatura. Num contrato com início e fim, "validade" é a data de fim; se houver renovação automática, mantém a data de fim e indica-o em "campos.renovacao_automatica": true.
- Valores numéricos sem símbolos nem separadores de milhar ("25.000.000,00 Kz" → 25000000). Datas sempre AAAA-MM-DD; datas por extenso em português ("31 de outubro de 2027") convertem-se.
- Nunca inventes NIF, números de documento ou datas: se não estiver escrito, null.
- Responde só com o JSON.`;
    }

    private static normalizar(json: any, texto: string, nomeFicheiro: string): AnaliseDocumento {
        const area = AREAS.includes(json.area) ? json.area : 'Outros';
        const validade = this.dataValida(json.validade);
        const dataDoc = this.dataValida(json.data_documento);
        const confianca = Math.max(0, Math.min(1, Number(json.confianca) || 0));
        const entTipo = ['cliente', 'colaborador', 'ativo', 'fornecedor'].includes(json.entidade?.tipo) ? json.entidade.tipo : null;

        return {
            e_documento: json.e_documento !== false,
            titulo: (json.titulo || '').toString().trim().slice(0, 200) || path.parse(nomeFicheiro).name,
            area,
            tipo: (json.tipo || 'Outro').toString().slice(0, 60),
            resumo: (json.resumo || '').toString().slice(0, 500),
            entidade: { tipo: entTipo, nome: json.entidade?.nome ? String(json.entidade.nome).slice(0, 200) : null },
            campos: (json.campos && typeof json.campos === 'object') ? json.campos : {},
            metadados: (json.metadados && typeof json.metadados === 'object' && !Array.isArray(json.metadados)) ? json.metadados : {},
            data_documento: dataDoc,
            validade,
            texto: (texto || '').toString(),
            confianca
        };
    }

    private static dataValida(v: any): string | null {
        if (!v || typeof v !== 'string') return null;
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return null;
        const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
        return isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
    }

    /**
     * Texto do ficheiro por via barata sempre que possível. Só recorre à visão
     * quando não há texto para extrair (foto, PDF digitalizado).
     */
    public static async extrairTexto(buffer: Buffer, mimeType: string, nomeFicheiro: string): Promise<{ texto: string; precisaVisao: boolean }> {
        const ext = path.extname(nomeFicheiro).toLowerCase();

        if (mimeType.startsWith('image/')) return { texto: '', precisaVisao: true };

        if (ext === '.txt' || ext === '.md' || ext === '.csv' || mimeType.startsWith('text/')) {
            return { texto: buffer.toString('utf8'), precisaVisao: false };
        }

        if (ext === '.pdf' || mimeType === 'application/pdf') {
            try {
                const pdfParse = require('pdf-parse');
                const data = await pdfParse(buffer);
                const texto = (data.text || '').trim();
                // PDF digitalizado: quase sem texto por página. Vai à visão.
                const paginas = Math.max(1, data.numpages || 1);
                if (texto.length / paginas < 80) return { texto: '', precisaVisao: true };
                return { texto, precisaVisao: false };
            } catch {
                return { texto: '', precisaVisao: true };
            }
        }

        if (ext === '.xlsx' || ext === '.xls' || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
            const XLSX = require('xlsx');
            const wb = XLSX.read(buffer, { type: 'buffer' });
            const partes: string[] = [];
            for (const nome of wb.SheetNames) {
                const csv = XLSX.utils.sheet_to_csv(wb.Sheets[nome]);
                if (csv.trim()) partes.push(`## ${nome}\n${csv}`);
            }
            return { texto: partes.join('\n\n'), precisaVisao: false };
        }

        if (ext === '.docx' || mimeType.includes('wordprocessingml')) {
            return { texto: this.textoDeDocx(buffer), precisaVisao: false };
        }

        throw new Error(`Formato não suportado: ${ext || mimeType}. Envie PDF, imagem, Word (.docx), Excel ou texto.`);
    }

    // .docx é um zip com word/document.xml; o texto está nos elementos <w:t>.
    // Não há biblioteca de leitura de Word no projeto, e isto chega para
    // classificar e pesquisar sem acrescentar dependências.
    private static textoDeDocx(buffer: Buffer): string {
        const zlib = require('zlib');
        // O registo de fim do zip (EOCD) diz onde começa o diretório central;
        // percorrem-se as entradas até à "word/document.xml".
        const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
        if (eocd === -1) throw new Error('Ficheiro Word inválido.');
        const assinaturaCentral = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
        let pos = buffer.readUInt32LE(eocd + 16);
        while (pos + 46 <= buffer.length && buffer.subarray(pos, pos + 4).equals(assinaturaCentral)) {
            const nomeLen = buffer.readUInt16LE(pos + 28);
            const extraLen = buffer.readUInt16LE(pos + 30);
            const comentLen = buffer.readUInt16LE(pos + 32);
            const nome = buffer.toString('utf8', pos + 46, pos + 46 + nomeLen);
            if (nome === 'word/document.xml') {
                const metodo = buffer.readUInt16LE(pos + 10);
                const tamComprimido = buffer.readUInt32LE(pos + 20);
                const offsetLocal = buffer.readUInt32LE(pos + 42);
                const nomeLocalLen = buffer.readUInt16LE(offsetLocal + 26);
                const extraLocalLen = buffer.readUInt16LE(offsetLocal + 28);
                const inicio = offsetLocal + 30 + nomeLocalLen + extraLocalLen;
                const dados = buffer.subarray(inicio, inicio + tamComprimido);
                const xml = (metodo === 8 ? zlib.inflateRawSync(dados) : dados).toString('utf8');
                return xml
                    .replace(/<\/w:p>/g, '\n')
                    .replace(/<w:tab\/>/g, '\t')
                    .replace(/<[^>]+>/g, '')
                    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
            }
            pos = pos + 46 + nomeLen + extraLen + comentLen;
        }
        throw new Error('Ficheiro Word inválido ou sem conteúdo.');
    }
}
