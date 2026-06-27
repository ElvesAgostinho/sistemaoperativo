import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { SalarioResult } from './PayrollService';
import { supabase } from '../lib/supabaseClient';

export class PdfService {
    
    public static applyCompanyLogo(doc: typeof PDFDocument, base64str: string, position: string) {
        if (!base64str) return;
        try {
            const matches = base64str.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const buffer = Buffer.from(matches[2], 'base64');
                const logoWidth = 100;
                const logoHeight = 50;
                
                const pageW = doc.page.width;
                const pageH = doc.page.height;

                if (position === 'top-left') {
                    doc.image(buffer, 50, 40, { fit: [logoWidth, logoHeight] });
                } else if (position === 'top-right') {
                    doc.image(buffer, pageW - 50 - logoWidth, 40, { fit: [logoWidth, logoHeight] });
                } else if (position === 'top-center') {
                    doc.image(buffer, (pageW - logoWidth) / 2, 40, { fit: [logoWidth, logoHeight] });
                } else if (position === 'watermark') {
                    doc.save();
                    doc.opacity(0.1);
                    doc.image(buffer, (pageW - 300) / 2, (pageH - 300) / 2, { fit: [300, 300] });
                    doc.restore();
                }
            }
        } catch(e) {
            console.error("Error applying logo", e);
        }
    }
    
    public static async gerarReciboVencimento(
        nomeFuncionario: string, 
        nif: string, 
        mesAno: string, 
        dadosSalariais: SalarioResult,
        empresaId?: number
    ): Promise<string> {
        let query = supabase.from('configuracoes_sistema').select('chave, valor');
        if (empresaId) {
            query = query.eq('empresa_id', empresaId);
        } else {
            query = query.is('empresa_id', null);
        }
        
        const { data: configs } = await query;
        const confMap = (configs || []).reduce((acc: any, c: any) => ({...acc, [c.chave]: c.valor}), {});

        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 50 });
                const fileName = `Recibo_${nomeFuncionario.replace(/\s+/g, '_')}_${mesAno.replace('/', '_')}.pdf`;
                const filePath = path.join(__dirname, '..', '..', 'tmp', fileName);
                
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)){
                    fs.mkdirSync(dir, { recursive: true });
                }

                const stream = fs.createWriteStream(filePath);
                doc.pipe(stream);
                
                if (confMap['COMPANY_LOGO_BASE64']) {
                    PdfService.applyCompanyLogo(doc, confMap['COMPANY_LOGO_BASE64'], confMap['COMPANY_LOGO_POSITION'] || 'top-left');
                }

                const companyName = confMap['COMPANY_NAME'] || 'BUSINESS OS, LDA';
                const companyNif = confMap['COMPANY_NIF'] || '5000000000';
                const companyAddress = confMap['COMPANY_ADDRESS'] || 'Luanda, Angola';
                const companyPhone = confMap['COMPANY_PHONE'] || '';

                doc.rect(50, 40, doc.page.width - 100, 80).fill('#f8f9fa');
                doc.strokeColor('#dee2e6').lineWidth(1).rect(50, 40, doc.page.width - 100, 80).stroke();
                
                doc.fillColor('#212529').fontSize(22).font('Helvetica-Bold').text(companyName, 70, 55);
                doc.fontSize(10).font('Helvetica').fillColor('#6c757d')
                   .text(`${companyAddress} | NIF: ${companyNif} ${companyPhone ? '| Tel: '+companyPhone : ''}`, 70, 80);
                
                doc.moveDown(3);
                
                doc.fillColor('#0d6efd').fontSize(16).font('Helvetica-Bold').text('RECIBO DE VENCIMENTO', 50, 140);
                doc.fontSize(11).font('Helvetica').fillColor('#495057').text(`Processamento: ${mesAno}`, 50, 160);
                
                doc.moveTo(50, 180).lineTo(doc.page.width - 50, 180).strokeColor('#dee2e6').lineWidth(2).stroke();

                doc.rect(50, 195, doc.page.width - 100, 60).fill('#ffffff').strokeColor('#dee2e6').lineWidth(1).stroke();
                doc.fillColor('#495057').fontSize(10).font('Helvetica-Bold').text('DADOS DO COLABORADOR', 60, 205);
                doc.font('Helvetica').fontSize(11);
                doc.fillColor('#212529').text(`Nome: ${nomeFuncionario}`, 60, 225);
                doc.text(`NIF: ${nif}`, 300, 225);

                const tableTop = 280;
                doc.rect(50, tableTop, doc.page.width - 100, 25).fill('#e9ecef');
                doc.fillColor('#495057').fontSize(10).font('Helvetica-Bold');
                doc.text('DESCRIÇÃO', 60, tableTop + 8);
                doc.text('RENDIMENTOS', 300, tableTop + 8, { width: 100, align: 'right' });
                doc.text('DEDUÇÕES', 420, tableTop + 8, { width: 100, align: 'right' });

                doc.font('Helvetica').fontSize(11).fillColor('#212529');
                let currentY = tableTop + 35;
                
                const addRow = (desc: string, rend: number | null, ded: number | null) => {
                    doc.text(desc, 60, currentY);
                    if (rend !== null) doc.text(this.formatCurrency(rend), 300, currentY, { width: 100, align: 'right' });
                    if (ded !== null) doc.text(this.formatCurrency(ded), 420, currentY, { width: 100, align: 'right' });
                    doc.moveTo(50, currentY + 15).lineTo(doc.page.width - 50, currentY + 15).strokeColor('#f8f9fa').lineWidth(1).stroke();
                    currentY += 25;
                };

                addRow('Salário Base', dadosSalariais.salarioBruto, null);
                if (dadosSalariais.descontoFaltas > 0) addRow('Faltas / Ausências', null, dadosSalariais.descontoFaltas);
                addRow('Segurança Social (INSS 3%)', null, dadosSalariais.inssTrabalhador);
                addRow('Imposto de Rendimento (IRT)', null, dadosSalariais.irt);

                const totalsTop = currentY + 20;
                doc.rect(50, totalsTop, doc.page.width - 100, 40).fill('#f8f9fa').strokeColor('#dee2e6').lineWidth(1).stroke();
                doc.fillColor('#495057').fontSize(11).font('Helvetica-Bold');
                doc.text('TOTAIS', 60, totalsTop + 14);
                
                doc.fillColor('#0d6efd').text(this.formatCurrency(dadosSalariais.salarioBruto), 300, totalsTop + 14, { width: 100, align: 'right' });
                doc.fillColor('#dc3545').text(this.formatCurrency(dadosSalariais.totalDescontos), 420, totalsTop + 14, { width: 100, align: 'right' });

                const liquidTop = totalsTop + 55;
                doc.rect(250, liquidTop, doc.page.width - 300, 40).fill('#198754');
                doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold');
                doc.text('LÍQUIDO A RECEBER', 260, liquidTop + 13);
                doc.text(this.formatCurrency(dadosSalariais.salarioLiquido), 420, liquidTop + 13, { width: 100, align: 'right' });

                doc.fillColor('#adb5bd').fontSize(9).font('Helvetica');
                doc.text('Documento processado validamente por BusinessOS | Emissão Automática', 50, doc.page.height - 70, { align: 'center' });

                doc.end();

                stream.on('finish', () => resolve(filePath));
                stream.on('error', (err) => reject(err));

            } catch (error) {
                reject(error);
            }
        });
    }

    private static formatCurrency(value: number): string {
        return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(value);
    }
}
