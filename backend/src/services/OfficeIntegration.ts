import * as fs from 'fs';
import * as path from 'path';
import { Document, Paragraph, TextRun, Packer } from 'docx';
import PDFDocument from 'pdfkit';
import { LocalAgentSandbox } from './LocalAgentSandbox';

export class OfficeIntegration {

    static async gerarContratoWord(dadosFuncionario: any, pastaFuncionario: string): Promise<string> {
        const doc = new Document({
            sections: [
                {
                    properties: {},
                    children: [
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: "CONTRATO DE TRABALHO - BUSINESS OS",
                                    bold: true,
                                    size: 32,
                                }),
                            ],
                        }),
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `\n\nEntre a Empresa e o Colaborador: ${dadosFuncionario.nome}`,
                                    size: 24,
                                }),
                            ],
                        }),
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `\nCargo: ${dadosFuncionario.cargo}`,
                                    size: 24,
                                }),
                            ],
                        }),
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `Salário Base: ${dadosFuncionario.salario_base} Kz`,
                                    size: 24,
                                }),
                            ],
                        }),
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `\n\nEste documento foi gerado automaticamente pelo Agente Operacional AI.`,
                                    italics: true,
                                }),
                            ],
                        }),
                    ],
                },
            ],
        });

        const outputPath = path.join(LocalAgentSandbox.getBaseDir(), pastaFuncionario, 'Contrato.docx');
        
        const buffer = await Packer.toBuffer(doc);
        fs.writeFileSync(outputPath, buffer);

        return outputPath;
    }

    static async gerarPdfDeWord(dadosFuncionario: any, pastaFuncionario: string): Promise<string> {
        // Como o PDFKit não lê docx, geramos o PDF a partir dos mesmos dados
        const outputPath = path.join(LocalAgentSandbox.getBaseDir(), pastaFuncionario, 'Contrato.pdf');
        
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument();
            const stream = fs.createWriteStream(outputPath);
            
            doc.pipe(stream);
            
            doc.fontSize(20).text('CONTRATO DE TRABALHO - BUSINESS OS', { align: 'center' });
            doc.moveDown();
            doc.fontSize(14).text(`Colaborador: ${dadosFuncionario.nome}`);
            doc.text(`Cargo: ${dadosFuncionario.cargo}`);
            doc.text(`Salário Base: ${dadosFuncionario.salario_base} Kz`);
            
            doc.moveDown();
            doc.fontSize(10).text('Gerado pelo Agente Operacional AI.', { align: 'center', oblique: true });
            
            doc.end();
            
            stream.on('finish', () => resolve(outputPath));
            stream.on('error', (err) => reject(err));
        });
    }

    static async gerarRelatorioWordGenerico(titulo: string, conteudo: string, nomeFicheiro: string): Promise<string> {
        const doc = new Document({
            sections: [
                {
                    properties: {},
                    children: [
                        new Paragraph({
                            alignment: 'center',
                            spacing: { after: 400 },
                            children: [
                                new TextRun({ text: titulo.toUpperCase(), bold: true, size: 48, color: "017E84", font: "Segoe UI" }),
                            ],
                        }),
                        new Paragraph({
                            alignment: 'center',
                            spacing: { after: 800 },
                            children: [
                                new TextRun({ text: `Relatório Executivo Gerado a: ${new Date().toLocaleDateString('pt-PT')}`, italics: true, size: 24, color: "666666", font: "Segoe UI" }),
                            ],
                        }),
                        new Paragraph({
                            alignment: 'both',
                            spacing: { line: 360 }, // 1.5 spacing
                            children: [
                                new TextRun({ text: conteudo, size: 24, font: "Segoe UI", color: "333333" }),
                            ],
                        }),
                    ],
                },
            ],
        });

        const baseDir = path.resolve(LocalAgentSandbox.getBaseDir());
        if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
        
        if (!nomeFicheiro.endsWith('.docx')) nomeFicheiro += '.docx';
        const outputPath = path.join(baseDir, nomeFicheiro);
        
        const buffer = await Packer.toBuffer(doc);
        fs.writeFileSync(outputPath, buffer);

        return outputPath;
    }

    static async gerarApresentacaoPowerPoint(titulo: string, slides: { titulo: string, texto: string, prompt_imagem?: string, imagem_local?: string }[], nomeFicheiro: string): Promise<string> {
        const PptxGenJS = require('pptxgenjs');
        const pres = new PptxGenJS();
        
        pres.theme = { headFontFace: 'Segoe UI', bodyFontFace: 'Segoe UI' };
        pres.defineSlideMaster({
            title: "MASTER_SLIDE",
            background: { color: "F8F9FA" }, // Light gray background
            objects: [
                { rect: { x: 0, y: 0, w: '100%', h: 0.8, fill: { color: "017E84" } } }
            ]
        });

        // Capa com fundo totalmente Odoo Teal
        const coverSlide = pres.addSlide();
        coverSlide.background = { color: "017E84" };
        coverSlide.addText(titulo.toUpperCase(), { x: 1, y: 2.2, w: '80%', fontSize: 44, bold: true, align: 'center', color: 'FFFFFF' });
        coverSlide.addText('Apresentação Executiva Gerada por Inteligência Artificial', { x: 1, y: 3.5, w: '80%', fontSize: 20, align: 'center', color: 'E0F2F1', italic: true });

        // Slides de Conteúdo
        for (const s of slides) {
            const slide = pres.addSlide({ masterName: "MASTER_SLIDE" });
            slide.addText(s.titulo, { x: 0.5, y: 0.15, w: '90%', h: 0.5, fontSize: 28, bold: true, color: 'FFFFFF' });
            
            let imgData = null;

            if (s.imagem_local && fs.existsSync(s.imagem_local)) {
                imgData = s.imagem_local;
            } else if (s.prompt_imagem) {
                try {
                    const OpenAI = require('openai').default;
                    const key = process.env.OPENAI_API_KEY;
                    if (key) {
                        const client = new OpenAI({ apiKey: key });
                        const response = await client.images.generate({
                            model: "dall-e-3",
                            prompt: s.prompt_imagem,
                            n: 1,
                            size: "1024x1024",
                        });
                        const imageUrl = response.data[0].url;
                        const imgRes = await fetch(imageUrl);
                        const arrayBuffer = await imgRes.arrayBuffer();
                        const buffer = Buffer.from(arrayBuffer);
                        imgData = `data:image/png;base64,${buffer.toString('base64')}`;
                    }
                } catch(e) {
                    console.error("Erro a gerar imagem para slide:", e);
                }
            }

            if (imgData) {
                slide.addShape(pres.ShapeType.rect, { x: 0.5, y: 1.2, w: 4.5, h: 3.8, fill: { color: "FFFFFF" }, line: { color: "E2E8F0" } });
                slide.addText(s.texto, { x: 0.7, y: 1.4, w: 4.1, h: 3.4, fontSize: 18, color: '333333', align: 'left', valign: 'top' });
                
                if (imgData.startsWith('data:')) {
                    slide.addImage({ data: imgData, x: 5.2, y: 1.2, w: 4.3, h: 3.8 });
                } else {
                    slide.addImage({ path: imgData, x: 5.2, y: 1.2, w: 4.3, h: 3.8 });
                }
            } else {
                slide.addShape(pres.ShapeType.rect, { x: 0.5, y: 1.2, w: '90%', h: 3.8, fill: { color: "FFFFFF" }, line: { color: "E2E8F0" } });
                slide.addText(s.texto, { x: 0.7, y: 1.4, w: '86%', h: 3.4, fontSize: 18, color: '333333', align: 'left', valign: 'top' });
            }
        }

        const baseDir = path.resolve(LocalAgentSandbox.getBaseDir());
        if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
        
        if (!nomeFicheiro.endsWith('.pptx')) nomeFicheiro += '.pptx';
        const outputPath = path.join(baseDir, nomeFicheiro);
        
        await pres.writeFile({ fileName: outputPath });

        return outputPath;
    }
}
