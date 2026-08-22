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
    
    private static async getCompanyConfig(empresaId?: number): Promise<Record<string, string>> {
        let query = supabase.from('configuracoes_sistema').select('chave, valor');
        if (empresaId) {
            query = query.eq('empresa_id', empresaId);
        } else {
            query = query.is('empresa_id', null);
        }

        const { data: configs } = await query;
        return (configs || []).reduce((acc: any, c: any) => ({...acc, [c.chave]: c.valor}), {});
    }

    public static async gerarReciboVencimento(
        nomeFuncionario: string,
        nif: string,
        mesAno: string,
        dadosSalariais: SalarioResult,
        empresaId?: number
    ): Promise<string> {
        const confMap = await PdfService.getCompanyConfig(empresaId);

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

    public static async gerarRelatorioNegocio(
        stats: {
            hr: { active_employees: number; monthly_payroll: number; departments: { name: string; value: number }[] };
            crm: { total_clients: number; active_leads: number; won_value: number; active_value: number; funnel: { name: string; value: number }[] };
        },
        empresaId?: number
    ): Promise<string> {
        const confMap = await PdfService.getCompanyConfig(empresaId);

        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 50 });
                const fileName = `Relatorio_Negocio_${Date.now()}.pdf`;
                const filePath = path.join(__dirname, '..', '..', 'tmp', fileName);

                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
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
                   .text(`${companyAddress} | NIF: ${companyNif} ${companyPhone ? '| Tel: ' + companyPhone : ''}`, 70, 80);

                doc.fillColor('#017E84').fontSize(16).font('Helvetica-Bold').text('RELATÓRIO DE DESEMPENHO DO NEGÓCIO', 50, 140);
                const agora = new Date();
                doc.fontSize(10).font('Helvetica').fillColor('#495057')
                   .text(`Gerado em ${agora.toLocaleDateString('pt-PT')} às ${agora.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`, 50, 162);

                doc.moveTo(50, 185).lineTo(doc.page.width - 50, 185).strokeColor('#dee2e6').lineWidth(2).stroke();

                let y = 205;
                doc.fillColor('#495057').fontSize(12).font('Helvetica-Bold').text('INDICADORES PRINCIPAIS', 50, y);
                y += 22;

                const kpis: [string, string][] = [
                    ['Receita Ganha (CRM)', PdfService.formatCurrency(stats.crm.won_value)],
                    ['Pipeline Ativo (CRM)', PdfService.formatCurrency(stats.crm.active_value)],
                    ['Total de Clientes', String(stats.crm.total_clients)],
                    ['Leads em Aberto', String(stats.crm.active_leads)],
                    ['Colaboradores Ativos', String(stats.hr.active_employees)],
                    ['Custo Salarial Mensal', PdfService.formatCurrency(stats.hr.monthly_payroll)],
                ];

                kpis.forEach(([label, value], i) => {
                    const col = i % 2;
                    const row = Math.floor(i / 2);
                    const x = 50 + col * 260;
                    const rowY = y + row * 34;
                    doc.rect(x, rowY, 245, 28).fill('#f8f9fa').strokeColor('#e9ecef').lineWidth(1).stroke();
                    doc.fillColor('#6c757d').fontSize(8).font('Helvetica-Bold').text(label.toUpperCase(), x + 10, rowY + 6);
                    doc.fillColor('#212529').fontSize(12).font('Helvetica-Bold').text(value, x + 10, rowY + 15);
                });

                y = y + Math.ceil(kpis.length / 2) * 34 + 20;

                doc.fillColor('#495057').fontSize(12).font('Helvetica-Bold').text('FUNIL DE VENDAS (CRM)', 50, y);
                y += 22;
                if (stats.crm.funnel.length === 0) {
                    doc.font('Helvetica').fontSize(10).fillColor('#adb5bd').text('Sem negócios registados.', 50, y);
                    y += 24;
                } else {
                    doc.rect(50, y, doc.page.width - 100, 22).fill('#e9ecef');
                    doc.fillColor('#495057').fontSize(9).font('Helvetica-Bold');
                    doc.text('FASE', 60, y + 6);
                    doc.text('NEGÓCIOS', doc.page.width - 150, y + 6, { width: 90, align: 'right' });
                    y += 22;
                    doc.font('Helvetica').fontSize(10).fillColor('#212529');
                    stats.crm.funnel.forEach(f => {
                        doc.text(f.name, 60, y + 7);
                        doc.text(String(f.value), doc.page.width - 150, y + 7, { width: 90, align: 'right' });
                        doc.moveTo(50, y + 24).lineTo(doc.page.width - 50, y + 24).strokeColor('#f1f3f5').lineWidth(1).stroke();
                        y += 24;
                    });
                }

                y += 20;
                doc.fillColor('#495057').fontSize(12).font('Helvetica-Bold').text('COLABORADORES POR DEPARTAMENTO', 50, y);
                y += 22;
                if (stats.hr.departments.length === 0) {
                    doc.font('Helvetica').fontSize(10).fillColor('#adb5bd').text('Sem colaboradores registados.', 50, y);
                } else {
                    doc.rect(50, y, doc.page.width - 100, 22).fill('#e9ecef');
                    doc.fillColor('#495057').fontSize(9).font('Helvetica-Bold');
                    doc.text('DEPARTAMENTO', 60, y + 6);
                    doc.text('COLABORADORES', doc.page.width - 170, y + 6, { width: 110, align: 'right' });
                    y += 22;
                    doc.font('Helvetica').fontSize(10).fillColor('#212529');
                    stats.hr.departments.forEach(d => {
                        doc.text(d.name, 60, y + 7);
                        doc.text(String(d.value), doc.page.width - 170, y + 7, { width: 110, align: 'right' });
                        doc.moveTo(50, y + 24).lineTo(doc.page.width - 50, y + 24).strokeColor('#f1f3f5').lineWidth(1).stroke();
                        y += 24;
                    });
                }

                doc.fillColor('#adb5bd').fontSize(9).font('Helvetica');
                doc.text('Documento gerado automaticamente pelo BusinessOS', 50, doc.page.height - 50, { align: 'center' });

                doc.end();

                stream.on('finish', () => resolve(filePath));
                stream.on('error', (err) => reject(err));

            } catch (error) {
                reject(error);
            }
        });
    }

    public static async gerarDeclaracaoServico(
        colaborador: { nome: string; bi: string; nif?: string; cargo?: string; salario_base: number; data_inicio?: string },
        empresaId?: number
    ): Promise<string> {
        const confMap = await PdfService.getCompanyConfig(empresaId);

        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 50 });
                const fileName = `Declaracao_${colaborador.nome.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
                const filePath = path.join(__dirname, '..', '..', 'tmp', fileName);

                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
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
                   .text(`${companyAddress} | NIF: ${companyNif} ${companyPhone ? '| Tel: ' + companyPhone : ''}`, 70, 80);

                doc.fillColor('#017E84').fontSize(16).font('Helvetica-Bold').text('DECLARAÇÃO DE VÍNCULO LABORAL', 50, 150, { align: 'center', width: doc.page.width - 100 });

                const dataInicioFmt = colaborador.data_inicio ? new Date(colaborador.data_inicio).toLocaleDateString('pt-PT') : 'data não especificada';
                const hoje = new Date().toLocaleDateString('pt-PT');

                const corpo = `Para os devidos efeitos, a ${companyName}, contribuinte fiscal n.º ${companyNif}, com sede em ${companyAddress}, declara que ${colaborador.nome}, portador(a) do documento de identificação n.º ${colaborador.bi}${colaborador.nif ? `, NIF ${colaborador.nif}` : ''}, exerce funções nesta empresa desde ${dataInicioFmt}, desempenhando atualmente o cargo de ${colaborador.cargo || 'colaborador(a)'}, com uma retribuição mensal base de ${PdfService.formatCurrency(colaborador.salario_base)}.

Esta declaração é emitida a pedido do(a) interessado(a) para os fins que se mostrarem necessários.`;

                doc.fillColor('#212529').fontSize(11).font('Helvetica')
                   .text(corpo, 50, 195, { width: doc.page.width - 100, align: 'justify', lineGap: 6 });

                doc.fontSize(11).text(`Luanda, ${hoje}`, 50, doc.page.height - 160, { align: 'right', width: doc.page.width - 100 });

                doc.moveTo(doc.page.width / 2 - 100, doc.page.height - 110).lineTo(doc.page.width / 2 + 100, doc.page.height - 110).strokeColor('#212529').lineWidth(1).stroke();
                doc.fontSize(10).text('Assinatura e Carimbo da Entidade Empregadora', 0, doc.page.height - 100, { align: 'center', width: doc.page.width });

                doc.fillColor('#adb5bd').fontSize(9).font('Helvetica');
                doc.text('Documento gerado automaticamente pelo BusinessOS', 50, doc.page.height - 50, { align: 'center' });

                doc.end();

                stream.on('finish', () => resolve(filePath));
                stream.on('error', (err) => reject(err));

            } catch (error) {
                reject(error);
            }
        });
    }

    // Gera a proforma em PDF com a identidade real da empresa (nome, NIF,
    // morada, logótipo) e o modelo de termos/condições/rodapé configurados
    // em Definições > Empresa (ou Financeiro > Documentos) — nunca texto
    // fixo/genérico. Só desenha o PDF; quem chama trata da parte de BD
    // (atualizar o negócio, guardar o registo da proforma).
    public static async gerarProformaPdf(
        negocio: { id: number; clientes?: { nome?: string; empresa?: string; telefone?: string; email?: string } },
        itens: Array<{ descricao: string; qtd: number; preco_unitario: number }>,
        empresaId?: number
    ): Promise<{ filePath: string; totalGeral: number }> {
        const confMap = await PdfService.getCompanyConfig(empresaId);

        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 50 });
                const fileName = `Proforma_${negocio.id}_${Date.now()}.pdf`;
                const filePath = path.join(__dirname, '..', '..', 'tmp', fileName);

                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

                const stream = fs.createWriteStream(filePath);
                doc.pipe(stream);

                if (confMap['COMPANY_LOGO_BASE64']) {
                    PdfService.applyCompanyLogo(doc, confMap['COMPANY_LOGO_BASE64'], confMap['COMPANY_LOGO_POSITION'] || 'top-left');
                }

                const companyName = confMap['COMPANY_NAME'] || 'BUSINESS OS, LDA';
                const companyNif = confMap['COMPANY_NIF'] || '5000000000';
                const companyAddress = confMap['COMPANY_ADDRESS'] || 'Luanda, Angola';
                const companyPhone = confMap['COMPANY_PHONE'] || '';
                const companyEmail = confMap['COMPANY_EMAIL'] || '';

                doc.rect(50, 40, doc.page.width - 100, 80).fill('#f8f9fa');
                doc.strokeColor('#dee2e6').lineWidth(1).rect(50, 40, doc.page.width - 100, 80).stroke();
                doc.fillColor('#212529').fontSize(22).font('Helvetica-Bold').text(companyName, 70, 55);
                doc.fontSize(9.5).font('Helvetica').fillColor('#6c757d')
                    .text(`${companyAddress} | NIF: ${companyNif}${companyPhone ? ' | Tel: ' + companyPhone : ''}${companyEmail ? ' | ' + companyEmail : ''}`, 70, 80, { width: doc.page.width - 140 });

                doc.fillColor('#C9992E').fontSize(16).font('Helvetica-Bold').text('PROPOSTA COMERCIAL / PROFORMA', 50, 145);
                doc.fillColor('#495057').fontSize(10).font('Helvetica')
                    .text(`Ref: PRF-${new Date().getFullYear()}-${String(negocio.id).padStart(4, '0')}    ·    Data: ${new Date().toLocaleDateString('pt-PT')}`, 50, 166);

                const validadeDias = Number(confMap['PROFORMA_VALIDADE_DIAS']) || 30;
                const dataValidade = new Date(Date.now() + validadeDias * 86400000).toLocaleDateString('pt-PT');
                doc.text(`Válida até: ${dataValidade}`, 50, 180);

                let y = 210;
                doc.rect(50, y, doc.page.width - 100, 55).fill('#ffffff').strokeColor('#dee2e6').lineWidth(1).stroke();
                doc.fillColor('#495057').fontSize(9).font('Helvetica-Bold').text('CLIENTE', 60, y + 8);
                doc.font('Helvetica').fontSize(10.5).fillColor('#212529');
                doc.text(negocio.clientes?.empresa || negocio.clientes?.nome || 'Cliente', 60, y + 22);
                const contactoLinha = [
                    negocio.clientes?.empresa ? `A/C: ${negocio.clientes?.nome}` : null,
                    negocio.clientes?.telefone ? `Tel: ${negocio.clientes?.telefone}` : null,
                    negocio.clientes?.email ? `Email: ${negocio.clientes?.email}` : null,
                ].filter(Boolean).join('   ·   ');
                if (contactoLinha) doc.fontSize(9).fillColor('#6c757d').text(contactoLinha, 60, y + 38);

                y += 75;
                doc.rect(50, y, doc.page.width - 100, 22).fill('#e9ecef');
                doc.fillColor('#495057').fontSize(9).font('Helvetica-Bold');
                doc.text('DESCRIÇÃO', 60, y + 7);
                doc.text('QTD', 330, y + 7, { width: 50, align: 'right' });
                doc.text('PREÇO UNIT.', 385, y + 7, { width: 90, align: 'right' });
                doc.text('TOTAL', 480, y + 7, { width: 85, align: 'right' });
                y += 22;

                doc.font('Helvetica').fontSize(10).fillColor('#212529');
                let totalGeral = 0;
                itens.forEach(item => {
                    const totalItem = item.qtd * item.preco_unitario;
                    totalGeral += totalItem;
                    doc.text(item.descricao, 60, y + 7, { width: 260 });
                    doc.text(String(item.qtd), 330, y + 7, { width: 50, align: 'right' });
                    doc.text(PdfService.formatCurrency(item.preco_unitario), 385, y + 7, { width: 90, align: 'right' });
                    doc.text(PdfService.formatCurrency(totalItem), 480, y + 7, { width: 85, align: 'right' });
                    doc.moveTo(50, y + 26).lineTo(doc.page.width - 50, y + 26).strokeColor('#f1f3f5').lineWidth(1).stroke();
                    y += 26;
                });

                y += 10;
                doc.rect(330, y, doc.page.width - 380, 34).fill('#C9992E');
                doc.fillColor('#201705').fontSize(12).font('Helvetica-Bold');
                doc.text('TOTAL GERAL', 345, y + 11);
                doc.text(PdfService.formatCurrency(totalGeral), 460, y + 11, { width: 105, align: 'right' });
                y += 55;

                const condicoesPagamento = confMap['PROFORMA_CONDICOES_PAGAMENTO'];
                if (condicoesPagamento) {
                    doc.fillColor('#495057').fontSize(9).font('Helvetica-Bold').text('CONDIÇÕES DE PAGAMENTO', 50, y);
                    doc.font('Helvetica').fontSize(9.5).fillColor('#212529').text(condicoesPagamento, 50, y + 14, { width: doc.page.width - 100, lineGap: 3 });
                    y += 14 + doc.heightOfString(condicoesPagamento, { width: doc.page.width - 100 }) + 16;
                }

                const termos = confMap['PROFORMA_TERMOS'];
                if (termos) {
                    doc.fillColor('#495057').fontSize(9).font('Helvetica-Bold').text('TERMOS E CONDIÇÕES', 50, y);
                    doc.font('Helvetica').fontSize(9).fillColor('#6c757d').text(termos, 50, y + 14, { width: doc.page.width - 100, lineGap: 3 });
                }

                const rodape = confMap['PROFORMA_RODAPE'] || 'Documento gerado automaticamente pelo BusinessOS.';
                doc.fillColor('#adb5bd').fontSize(8.5).font('Helvetica').text(rodape, 50, doc.page.height - 50, { align: 'center', width: doc.page.width - 100 });

                doc.end();

                stream.on('finish', () => resolve({ filePath, totalGeral }));
                stream.on('error', reject);
            } catch (error) {
                reject(error);
            }
        });
    }

    private static formatCurrency(value: number): string {
        return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(value);
    }
}
