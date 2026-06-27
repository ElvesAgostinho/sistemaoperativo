import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';

export class ExcelService {
  /**
   * Gera um ficheiro Excel e guarda-o localmente, com estilo visual super premium.
   */
  static async generateReport(filename: string, data: any[]): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BusinessOS OpenClaw';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Relatório Principal', {
        views: [{ state: 'frozen', ySplit: 1 }]
    });

    if (data && data.length > 0) {
        // Definir colunas com largura dinâmica
        const columns = Object.keys(data[0]).map(key => {
            return {
                header: key.toUpperCase().replace(/_/g, ' '),
                key: key,
                width: Math.max(key.length + 8, 20)
            };
        });
        sheet.columns = columns;

        // Estilizar Cabeçalho (Fundo Teal do Odoo e Texto Branco Negrito)
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12, name: 'Segoe UI' };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF017E84' } // Teal / Verde Água Odoo
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 30;

        // Adicionar Dados com Bordas e Cores Alternadas
        data.forEach((row, index) => {
            const addedRow = sheet.addRow(row);
            
            // Zebrado
            if (index % 2 !== 0) {
                addedRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }; // Cinza mt claro
            }

            addedRow.eachCell((cell: any) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFEEEEEE' } },
                    left: { style: 'thin', color: { argb: 'FFEEEEEE' } },
                    bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } },
                    right: { style: 'thin', color: { argb: 'FFEEEEEE' } }
                };
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
                cell.font = { name: 'Segoe UI', size: 11, color: { argb: 'FF333333' } };
            });
            addedRow.height = 25;
        });
    }

    const baseDir = path.resolve(os.homedir(), 'Desktop/SISTEMA OPERATIVO/Empresa_Arquivos');
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    
    // Assegurar que tem extensao xlsx
    if (!filename.endsWith('.xlsx')) filename += '.xlsx';
    const filePath = path.join(baseDir, filename);

    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  static openExcelFile(filePath: string): void {
    const command = `start excel "${filePath}"`;
    exec(command, (error) => {
      if (error) {
        console.error(`O Excel não é a aplicação padrão. Abrindo com default: ${error.message}`);
        exec(`start "" "${filePath}"`);
      }
    });
  }
}
