import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import pptxgen from 'pptxgenjs';

export const createPowerPointFile = async (
  filename: string, 
  slides: { title: string; content: string[] }[]
): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const pres = new pptxgen();

      // Title Slide
      const slide0 = pres.addSlide();
      slide0.addText(filename.replace('.pptx', ''), { 
        x: 1, y: 2, w: 8, h: 2, 
        fontSize: 36, bold: true, align: "center", color: "363636" 
      });
      slide0.addText('BusinessOS - Agente Autónomo', { 
        x: 1, y: 4, w: 8, h: 1, 
        fontSize: 18, align: "center", color: "666666" 
      });

      // Content Slides
      slides.forEach(slideData => {
        const slide = pres.addSlide();
        
        slide.addText(slideData.title, { 
          x: 0.5, y: 0.5, w: 9, h: 1, 
          fontSize: 24, bold: true, color: "003366" 
        });

        const bulletPoints = slideData.content.map(text => ({ text, options: { bullet: true } }));
        
        slide.addText(bulletPoints, { 
          x: 0.5, y: 1.5, w: 9, h: 4, 
          fontSize: 18, color: "333333", align: "left"
        });
      });

      const docsDir = path.join(os.homedir(), 'Documents', 'BusinessOS_Gerados');
      if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
      }

      const filePath = path.join(docsDir, filename.endsWith('.pptx') ? filename : `${filename}.pptx`);

      pres.writeFile({ fileName: filePath })
        .then(() => {
          // Open the file automatically
          exec(`start "" "${filePath}"`);
          resolve(filePath);
        })
        .catch(err => {
          console.error("Error saving PPTX:", err);
          reject(err);
        });

    } catch (error) {
      console.error('Error generating PowerPoint:', error);
      reject(error);
    }
  });
};
