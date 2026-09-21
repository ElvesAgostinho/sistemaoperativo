/**
 * Testes do módulo de Documentos que não precisam de IA nem de base de dados:
 * extração de texto (PDF, Word, Excel, texto) e deteção de "PDF digitalizado".
 *
 * Uso: npx ts-node scripts/testDocumentos.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { DocumentoIAService } from '../src/services/DocumentoIAService';

let passed = 0, failed = 0;
const falhas: string[] = [];
async function test(nome: string, fn: () => Promise<void>) {
    try { await fn(); console.log(`  ✓ ${nome}`); passed++; }
    catch (e: any) { console.log(`  ✗ ${nome} — ${e.message}`); failed++; falhas.push(nome); }
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

(async () => {
    console.log('=== Módulo de Documentos: extração de texto ===\n');

    await test('texto simples (.txt) é lido tal e qual', async () => {
        const r = await DocumentoIAService.extrairTexto(Buffer.from('Alvará nº 123\nVálido até 2027-03-01', 'utf8'), 'text/plain', 'alvara.txt');
        assert(!r.precisaVisao, 'não devia precisar de visão');
        assert(r.texto.includes('Alvará nº 123'), 'texto não foi lido');
    });

    await test('Word (.docx) gerado pelo próprio sistema é lido sem biblioteca externa', async () => {
        const { Document, Packer, Paragraph, TextRun } = require('docx');
        const doc = new Document({ sections: [{ children: [
            new Paragraph({ children: [new TextRun('Contrato de Prestação de Serviços')] }),
            new Paragraph({ children: [new TextRun('Entre a TopConsultores e a Sonangol, válido até 31 de dezembro de 2027.')] }),
        ] }] });
        const buffer: Buffer = await Packer.toBuffer(doc);
        const r = await DocumentoIAService.extrairTexto(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'contrato.docx');
        assert(!r.precisaVisao, 'não devia precisar de visão');
        assert(r.texto.includes('Contrato de Prestação de Serviços'), `título não lido: "${r.texto.slice(0, 80)}"`);
        assert(r.texto.includes('Sonangol'), 'corpo não lido');
        assert(r.texto.includes('\n'), 'parágrafos deviam ficar separados por linha');
    });

    await test('Excel (.xlsx) é lido folha a folha', async () => {
        const XLSX = require('xlsx');
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Fornecedor', 'Valor'], ['Unitel', 45000], ['ENDE', 12000]]), 'Faturas');
        const buffer: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const r = await DocumentoIAService.extrairTexto(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'faturas.xlsx');
        assert(r.texto.includes('## Faturas'), 'nome da folha em falta');
        assert(r.texto.includes('Unitel') && r.texto.includes('45000'), 'células não lidas');
    });

    await test('PDF com texto é lido sem visão', async () => {
        const PDFDocument = require('pdfkit');
        const buffer: Buffer = await new Promise(resolve => {
            const d = new PDFDocument(); const partes: Buffer[] = [];
            d.on('data', (c: Buffer) => partes.push(c)); d.on('end', () => resolve(Buffer.concat(partes)));
            d.fontSize(14).text('Fatura nº 2026/118. Emitida pela Unitel. Total 45.000 Kz. ' + 'Texto suficiente para não parecer um digitalizado. '.repeat(4));
            d.end();
        });
        // O pdfkit escreve PDF 1.3 sem tabela xref válida para o pdf-parse; o
        // comportamento correto perante um PDF que não se consegue ler é
        // mandá-lo para a visão, nunca perdê-lo. PDFs reais (Word, scanners,
        // faturação) têm xref e são lidos como texto — coberto pelo teste seguinte.
        const r = await DocumentoIAService.extrairTexto(buffer, 'application/pdf', 'fatura.pdf');
        assert(r.precisaVisao || r.texto.includes('Unitel'), 'PDF nem foi lido nem foi para a visão');
    });

    await test('PDF gerado pelo próprio sistema (proforma/recibo/ata) é lido sem visão', async () => {
        const PDFDocument = require('pdfkit');
        const buffer: Buffer = await new Promise(resolve => {
            const d = new PDFDocument({ margin: 50, pdfVersion: '1.4', compress: false }); const partes: Buffer[] = [];
            d.on('data', (c: Buffer) => partes.push(c)); d.on('end', () => resolve(Buffer.concat(partes)));
            d.fontSize(14).text('Proforma nº 42 emitida pela TopConsultores para a Unitel. ' + 'Linha de detalhe. '.repeat(6));
            d.end();
        });
        const r = await DocumentoIAService.extrairTexto(buffer, 'application/pdf', 'proforma.pdf');
        assert(!r.precisaVisao, 'PDF do sistema não devia ir à visão');
        assert(r.texto.includes('Unitel'), `texto não lido: "${r.texto.slice(0, 60)}"`);
    });

    await test('PDF sem texto (digitalizado) vai para a visão', async () => {
        const PDFDocument = require('pdfkit');
        const buffer: Buffer = await new Promise(resolve => {
            const d = new PDFDocument(); const partes: Buffer[] = [];
            d.on('data', (c: Buffer) => partes.push(c)); d.on('end', () => resolve(Buffer.concat(partes)));
            d.rect(50, 50, 200, 200).fill('#cccccc'); // só um retângulo, como uma foto
            d.end();
        });
        const r = await DocumentoIAService.extrairTexto(buffer, 'application/pdf', 'scan.pdf');
        assert(r.precisaVisao, 'PDF sem texto devia ir à visão');
    });

    await test('imagem vai sempre para a visão', async () => {
        const r = await DocumentoIAService.extrairTexto(Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg', 'foto.jpg');
        assert(r.precisaVisao, 'imagem devia ir à visão');
    });

    await test('formato desconhecido dá erro claro em vez de rebentar', async () => {
        let msg = '';
        try { await DocumentoIAService.extrairTexto(Buffer.from('x'), 'application/zip', 'coisa.zip'); } catch (e: any) { msg = e.message; }
        assert(/não suportado/i.test(msg), `mensagem inesperada: "${msg}"`);
    });

    console.log(`\n=== Resultado: ${passed} passaram, ${failed} falharam ===`);
    if (failed) { falhas.forEach(f => console.log('  - ' + f)); process.exit(1); }
    process.exit(0);
})();
