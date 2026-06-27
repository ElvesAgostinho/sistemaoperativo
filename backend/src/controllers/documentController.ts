import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
// @ts-ignore
import pdfParse from 'pdf-parse';
import { generateCompletion } from '../services/ollama';
import { processAgentRequest } from '../services/agentService';

export const uploadDocument = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { originalname, buffer, mimetype } = file;
    let extractedText = '';

    // Simple text extraction
    if (mimetype === 'application/pdf') {
      const data = await pdfParse(buffer);
      extractedText = data.text;
    } else if (mimetype === 'text/plain') {
      extractedText = buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Use PDF or TXT.' });
    }

    // TODO: Generate embedding locally (e.g. via Ollama mxbai-embed-large or similar)
    // For now, we will store the raw text in Supabase, and a summary.

    // Let local AI summarize the document to prove it works
    const prompt = `Por favor faz um resumo curto do seguinte documento: \n\n${extractedText.substring(0, 3000)}`;
    const summary = await generateCompletion(prompt);

    // Save to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(`public/${Date.now()}_${originalname}`, buffer, {
        contentType: mimetype,
      });

    if (uploadError) {
      throw uploadError;
    }

    // Save metadata to database (assuming a 'documents' table exists)
    // const { data: dbData, error: dbError } = await supabase.from('documents').insert({
    //   file_name: originalname,
    //   summary: summary,
    //   storage_path: uploadData.path
    // });

    return res.status(200).json({
      message: 'Document uploaded and summarized successfully',
      file: originalname,
      summary: summary
    });

  } catch (error: any) {
    console.error('Upload Error:', error);
    return res.status(500).json({ error: 'Failed to process document', details: error.message });
  }
};

export const searchDocuments = async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Call the Agent Service to determine if it's an action or a chat
    const agentResponse = await processAgentRequest(query);

    if (agentResponse.actionResult) {
       return res.status(200).json({ response: agentResponse.actionResult, isAction: true });
    }

    return res.status(200).json({ response: agentResponse.text, isAction: false });

  } catch (error: any) {
    console.error('Search Error:', error);
    return res.status(500).json({ error: 'Failed to search documents' });
  }
};
