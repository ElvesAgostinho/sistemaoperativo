import { Request, Response } from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import open from 'open';

const apps = [
  { id: 'excel', name: 'Microsoft Excel', command: 'start excel', icon: '/assets/microsoft_excel_icon_1782341631804.png' },
  { id: 'word', name: 'Microsoft Word', command: 'start winword', icon: '/assets/microsoft_word_icon_1782341647034.png' },
  { id: 'powerpoint', name: 'Microsoft PowerPoint', command: 'start powerpnt', icon: '/assets/microsoft_powerpoint_icon_1782341660597.png' },
  { id: 'powerbi', name: 'Power BI Desktop', command: 'start pbidesktop', icon: '/assets/power_bi_icon_1782341675857.png' },
  { id: 'chrome', name: 'Google Chrome', command: 'start chrome', icon: '/assets/google_chrome_icon_1782341691379.png' },
  { id: 'edge', name: 'Microsoft Edge', command: 'start msedge', icon: '/assets/microsoft_edge_icon_1782341706620.png' },
  { id: 'notepad', name: 'Bloco de Notas', command: 'start notepad', icon: '/assets/notepad_icon_1782341722525.png' },
  { id: 'calc', name: 'Calculadora', command: 'start calc', icon: '/assets/calculator_icon_1782341737687.png' },
  { id: 'explorer', name: 'Explorador de Ficheiros', command: 'start explorer', icon: '/assets/explorer_icon_1782341752809.png' },
  { id: 'whatsapp', name: 'WhatsApp', command: 'start https://web.whatsapp.com', icon: '/assets/whatsapp_icon_1782341766911.png' },
];

export const getLocalApps = (req: Request, res: Response) => {
  res.json({ apps });
};

export const launchApp = (req: Request, res: Response) => {
  const { appId, customCommand } = req.body;
  
  if (customCommand) {
    const isDir = fs.existsSync(customCommand) && fs.statSync(customCommand).isDirectory();
    
    exec(`explorer "${customCommand}"`, (error) => {
        if (error) {
            console.error("Explorer launch failed:", error);
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

  exec(appToLaunch.command, (error) => {
    if (error) {
       console.error(`Error launching ${appId}:`, error);
    }
  });

  return res.json({ message: `${appToLaunch.name} launched successfully.` });
};

export const getLocalDocuments = (req: Request, res: Response) => {
  try {
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const documentsPath = path.join(os.homedir(), 'Documents');
    
    const getAllFiles = (dirPath: string, arrayOfFiles: string[] = [], depth = 0) => {
      if (depth > 2) return arrayOfFiles; // Max depth of 2 to avoid lag
      
      try {
        if (!fs.existsSync(dirPath)) return arrayOfFiles;
        const files = fs.readdirSync(dirPath);
        files.forEach(file => {
          const fullPath = path.join(dirPath, file);
          try {
            if (fs.statSync(fullPath).isDirectory()) {
              const lowerFile = file.toLowerCase();
              if (!['node_modules', '.git', 'dist', 'build', '.vscode', 'appdata', 'application data'].includes(lowerFile) && !file.startsWith('.')) {
                arrayOfFiles.push(fullPath);
                arrayOfFiles = getAllFiles(fullPath, arrayOfFiles, depth + 1);
              }
            } else {
              if (!file.startsWith('~') && !file.startsWith('.')) {
                  arrayOfFiles.push(fullPath);
              }
            }
          } catch (e) {
            // Ignore stat errors
          }
        });
      } catch (err) {
        // Ignore permission errors
      }
      return arrayOfFiles;
    };

    let allFiles = getAllFiles(desktopPath);
    allFiles = getAllFiles(documentsPath, allFiles);
    
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
      .filter(file => file.type === 'folder' || ['.pdf', '.docx', '.xlsx', '.csv', '.txt', '.pptx', '.png', '.jpg', '.jpeg'].includes(file.type));

    // Reverse to show most recent at top (assuming loosely based on traversal order, or we can sort)
    // Actually, sort by modified time would be better, but let's just slice the first 200 to avoid UI freeze
    const limitedDocs = documents.slice(0, 200);

    res.json({ documents: limitedDocs, path: 'PC Local (Desktop & Documents)' });
  } catch (error) {
    console.error('Error reading documents:', error);
    res.status(500).json({ error: 'Could not read local documents.' });
  }
};
