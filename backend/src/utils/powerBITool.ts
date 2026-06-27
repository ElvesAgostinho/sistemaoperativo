import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';

export const createPowerBIDataset = async (
  filename: string,
  headers: string[],
  rows: any[][]
): Promise<string> => {
  try {
    const docsDir = path.join(os.homedir(), 'Documents', 'BusinessOS_Gerados', 'PowerBI_Datasets');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    const safeFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    const filePath = path.join(docsDir, safeFilename);

    // Build CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    fs.writeFileSync(filePath, csvContent, 'utf-8');

    // Attempt to open Power BI using start ms-powerbi: or pbid
    // It will just open the app. The user will have to click "Get Data" -> Text/CSV.
    exec('start pbid', (error) => {
      if (error) {
        // Fallback or silently fail if Power BI is not installed/in PATH
        console.log("Could not start Power BI directly, but dataset is saved.");
      }
    });

    return filePath;
  } catch (error) {
    console.error('Error creating Power BI dataset:', error);
    throw error;
  }
};
