import { Request, Response } from 'express';
import { CrmService } from '../services/CrmService';

export const getClientes = async (req: Request, res: Response) => {
    try {
        const clientes = await CrmService.getClientes(req);
        return res.json({ success: true, clientes });
    } catch (error) {
        console.error('Erro a listar clientes:', error);
        return res.status(500).json({ error: 'Erro de servidor' });
    }
};

export const createCliente = async (req: Request, res: Response) => {
    try {
        const { nome, email, telefone, empresa } = req.body;
        if (!nome) {
            return res.status(400).json({ error: 'Nome do cliente é obrigatório.' });
        }
        
        const novoId = await CrmService.createCliente(req, { nome, email, telefone, empresa });
        
        return res.json({ 
            success: true, 
            message: 'Cliente registado com sucesso.',
            cliente_id: novoId 
        });
    } catch (error: any) {
        console.error('Erro a registar cliente:', error);
        return res.status(500).json({ error: 'Erro ao registar na base de dados.', details: error.message });
    }
};

export const deleteCliente = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await CrmService.deleteCliente(req, Number(id));
        return res.json({ success: true, message: 'Cliente apagado com sucesso.' });
    } catch (error: any) {
        console.error('Erro ao apagar cliente:', error);
        return res.status(500).json({ error: 'Erro de servidor', details: error.message });
    }
};

export const getNegocios = async (req: Request, res: Response) => {
    try {
        const negocios = await CrmService.getNegocios(req);
        return res.json({ success: true, negocios });
    } catch (error) {
        console.error('Erro a listar negócios:', error);
        return res.status(500).json({ error: 'Erro de servidor' });
    }
};

export const createNegocio = async (req: Request, res: Response) => {
    try {
        const { cliente_id, titulo, valor_estimado } = req.body;
        if (!titulo) {
            return res.status(400).json({ error: 'O título do negócio é obrigatório.' });
        }
        
        const novoId = await CrmService.createNegocio(req, { cliente_id, titulo, valor_estimado });
        
        return res.json({ 
            success: true, 
            message: 'Negócio registado com sucesso.',
            negocio_id: novoId 
        });
    } catch (error: any) {
        console.error('Erro a registar negócio:', error);
        return res.status(500).json({ error: 'Erro ao registar na base de dados.', details: error.message });
    }
};

export const deleteNegocio = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await CrmService.deleteNegocio(req, Number(id));
        return res.json({ success: true, message: 'Negócio apagado com sucesso.' });
    } catch (error: any) {
        console.error('Erro ao apagar negócio:', error);
        return res.status(500).json({ error: 'Erro de servidor', details: error.message });
    }
};

export const updateFaseNegocio = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { fase } = req.body;
        
        if (!fase) return res.status(400).json({ error: 'A nova fase é obrigatória.' });

        await CrmService.updateFaseNegocio(req, Number(id), fase);
        
        return res.json({ success: true, message: 'Fase atualizada.' });
    } catch (error: any) {
        console.error('Erro a atualizar fase:', error);
        return res.status(500).json({ error: 'Erro ao atualizar fase.', details: error.message });
    }
};

export const generateProforma = async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // negocio_id
        const { itens } = req.body;
        
        if (!itens || !Array.isArray(itens) || itens.length === 0) {
            return res.status(400).json({ error: 'São necessários itens para gerar a proforma.' });
        }

        const pdfPath = await CrmService.gerarProformaPdf(req, Number(id), itens);
        const path = require('path');
        const fileName = path.basename(pdfPath);
        
        return res.json({ 
            success: true, 
            message: 'Proforma gerada com sucesso.',
            pdf_path: '/tmp/' + fileName 
        });
    } catch (error: any) {
        console.error('Erro a gerar proforma:', error);
        return res.status(500).json({ error: 'Erro ao gerar documento.', details: error.message });
    }
};

export const registerPayment = async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // negocio_id
        const { valor, metodo_pagamento, data_pagamento } = req.body;
        
        if (!valor || !data_pagamento) {
            return res.status(400).json({ error: 'Valor e data de pagamento são obrigatórios.' });
        }

        const recibo_id = await CrmService.registerPayment(req, Number(id), Number(valor), metodo_pagamento, data_pagamento);
        
        return res.json({ 
            success: true, 
            message: 'Pagamento registado com sucesso e integrado na Contabilidade.',
            recibo_id
        });
    } catch (error: any) {
        console.error('Erro a registar pagamento:', error);
        return res.status(500).json({ error: 'Erro ao registar pagamento.', details: error.message });
    }
};
