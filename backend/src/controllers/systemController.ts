import { Request, Response } from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import open from 'open';

const apps = [
  { id: 'excel', name: 'Microsoft Excel', command: 'start excel', icon: '/src/assets/microsoft_excel_icon_1782341631804.png' },
  { id: 'word', name: 'Microsoft Word', command: 'start winword', icon: '/src/assets/microsoft_word_icon_1782341647034.png' },
  { id: 'powerpoint', name: 'Microsoft PowerPoint', command: 'start powerpnt', icon: '/src/assets/microsoft_powerpoint_icon_1782341660597.png' },
  { id: 'powerbi', name: 'Power BI Desktop', command: 'start pbidesktop', icon: '/src/assets/power_bi_icon_1782341675857.png' },
  { id: 'chrome', name: 'Google Chrome', command: 'start chrome', icon: '/src/assets/google_chrome_icon_1782341691379.png' },
  { id: 'edge', name: 'Microsoft Edge', command: 'start msedge', icon: '/src/assets/microsoft_edge_icon_1782341706620.png' },
  { id: 'notepad', name: 'Bloco de Notas', command: 'start notepad', icon: '/src/assets/notepad_icon_1782341722525.png' },
  { id: 'calc', name: 'Calculadora', command: 'start calc', icon: '/src/assets/calculator_icon_1782341737687.png' },
  { id: 'explorer', name: 'Explorador de Ficheiros', command: 'start explorer', icon: '/src/assets/explorer_icon_1782341752809.png' },
  { id: 'whatsapp', name: 'WhatsApp', command: 'start https://web.whatsapp.com', icon: '/src/assets/whatsapp_icon_1782341766911.png' },
];

export const getLocalApps = (req: Request, res: Response) => {
  res.json({ apps });
};

export const launchApp = (req: Request, res: Response) => {
  const { appId, customCommand } = req.body;
  
  if (customCommand) {
    const isDir = fs.existsSync(customCommand) && fs.statSync(customCommand).isDirectory();
    
    // "explorer" command is the most native and reliable way to open files/folders in Windows without quote parsing issues
    exec(`explorer "${customCommand}"`, (error) => {
        if (error) {
            console.error("Explorer launch failed:", error);
            // Fallback to opening the folder and selecting the file if opening the file fails
            if (!isDir) {
                exec(`explorer /select,"${customCommand}"`);
            }
        }
    });
    
    return res.json({ message: `${customCommand} launched successfully via Explorer.` });
  }

  const appToLaunch = apps.find(a => a.id === appId);
  if (!appToLaunch) {
    return res.status(404).json({ error: 'App not found' });
  }

  // O comando na array apps já está formatado como 'start excel', 'start chrome', etc.
  exec(appToLaunch.command, (error) => {
    if (error) {
       console.error(`Error launching ${appId}:`, error);
    }
  });

  return res.json({ message: `${appToLaunch.name} launched successfully.` });
};

export const getLocalDocuments = (req: Request, res: Response) => {
  try {
    const documentsPath = path.join(os.homedir(), 'Desktop', 'SISTEMA OPERATIVO');
    
    // Recursive file finder
    const getAllFiles = (dirPath: string, arrayOfFiles: string[] = [], depth = 0) => {
      // Prevent stack overflow or extreme slowness - Limitar a profundidade a 2
      if (depth > 2) return arrayOfFiles;
      
      try {
        if (!fs.existsSync(dirPath)) return arrayOfFiles;
        const files = fs.readdirSync(dirPath);
        files.forEach(file => {
          const fullPath = path.join(dirPath, file);
          try {
            if (fs.statSync(fullPath).isDirectory()) {
              const lowerFile = file.toLowerCase();
              if (!['node_modules', '.git', 'dist', 'build', '.vscode'].includes(lowerFile) && !file.startsWith('.')) {
                // Adiciona a própria pasta aos resultados
                arrayOfFiles.push(fullPath);
                arrayOfFiles = getAllFiles(fullPath, arrayOfFiles, depth + 1);
              }
            } else {
              if (!file.startsWith('~') && !file.startsWith('.')) {
                  arrayOfFiles.push(fullPath);
              }
            }
          } catch (e) {
            // Ignore stat errors for locked files
          }
        });
      } catch (err) {
        // Ignore permission errors on some folders
      }
      return arrayOfFiles;
    };

    const allFiles = getAllFiles(documentsPath);
    
    const documents = allFiles
      .map(filePath => {
        let isDir = false;
        try { isDir = fs.statSync(filePath).isDirectory(); } catch(e){}
        return {
          name: path.basename(filePath),
          path: filePath,
          type: isDir ? 'folder' : path.extname(filePath).toLowerCase()
        };
      })
      .filter(file => file.type === 'folder' || ['.pdf', '.docx', '.xlsx', '.csv', '.txt', '.pptx'].includes(file.type));

    res.json({ documents, path: documentsPath });
  } catch (error) {
    console.error('Error reading documents:', error);
    res.status(500).json({ error: 'Could not read local documents.' });
  }
};
