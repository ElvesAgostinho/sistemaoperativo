import * as xlsx from 'xlsx';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import fs from 'fs';

export const createExcelFile = (filename: string, sheetName: string, data: any[][]): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      // 1. Create a new workbook and worksheet
      const workbook = xlsx.utils.book_new();
      const worksheet = xlsx.utils.aoa_to_sheet(data);

      // 2. Add worksheet to workbook
      xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);

      // 3. Resolve save path (user's Documents folder)
      const saveDir = path.join(os.homedir(), 'Documents', 'BusinessOS_Gerados');
      
      // Ensure dir exists
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
      }

      const filePath = path.join(saveDir, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);

      // 4. Write to file
      xlsx.writeFile(workbook, filePath);

      // 5. Open it
      exec(`start "" "${filePath}"`, (error) => {
        if (error) {
           console.warn('File created but failed to open automatically:', error);
        }
      });

      resolve(filePath);
    } catch (err: any) {
      console.error('Error creating excel file:', err);
      reject(err);
    }
  });
};
