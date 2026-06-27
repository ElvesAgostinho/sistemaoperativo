import { Request, Response } from 'express';
import { PayrollService, SalarioRequest } from '../services/PayrollService';
import { PdfService } from '../services/PdfService';
import { EmailService } from '../services/EmailService';
import { RecruitmentService, CandidatoExtraido } from '../services/RecruitmentService';
import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';

export const processarSalario = async (req: Request, res: Response) => {
    // ... existing ...
    try {
        const { nomeFuncionario, nif, mesAno, emailDestino, salarioBase, faltasInjustificadas, subsidiosNaoTributaveis, subsidiosTributaveis } = req.body;

        if (!nomeFuncionario || !salarioBase || !emailDestino) {
            return res.status(400).json({ error: 'Parâmetros obrigatórios em falta.' });
        }

        const reqSalario: SalarioRequest = {
            salarioBase: Number(salarioBase),
            faltasInjustificadas: Number(faltasInjustificadas || 0),
            subsidiosNaoTributaveis: Number(subsidiosNaoTributaveis || 0),
            subsidiosTributaveis: Number(subsidiosTributaveis || 0)
        };

        const empresaId = (req as any).user?.empresa_id;

        const calculos = PayrollService.calcularSalario(reqSalario);
        const pdfPath = await PdfService.gerarReciboVencimento(nomeFuncionario, nif || '999999999', mesAno || '06/2026', calculos, empresaId);
        const fileName = path.basename(pdfPath);

        return res.json({
            success: true,
            message: 'Processamento concluído.',
            dados_salariais: calculos,
            recibo_pdf: '/tmp/' + fileName,
            email_status: 'Pendente configuração SMTP' 
        });

    } catch (error: any) {
        console.error('Erro ao processar salário:', error);
        return res.status(500).json({ error: 'Falha no processamento salarial.', details: error.message });
    }
};

export const analisarCurriculos = async (req: Request, res: Response) => {
    // ... existing ...
    try {
        const files = req.files as Express.Multer.File[];
        const { requisitosVaga } = req.body;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'Nenhum ficheiro PDF enviado.' });
        }

        if (!requisitosVaga) {
            return res.status(400).json({ error: 'É necessário informar os requisitos da vaga.' });
        }

        const candidatosAnalisados: CandidatoExtraido[] = [];

        for (const file of files) {
            const tempFilePath = file.path; 

            try {
                const textoCV = await RecruitmentService.extrairTextoDePDF(tempFilePath);
                const candidato = await RecruitmentService.analisarCurriculoComIA(textoCV, requisitosVaga);
                candidatosAnalisados.push(candidato);

            } catch (err) {
                console.error(`Erro ao analisar o CV ${file.originalname}:`, err);
            } finally {
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
            }
        }

        const excelPath = RecruitmentService.gerarExcelMelhoresCandidatos(candidatosAnalisados, 5);

        const candidatosAprovados = candidatosAnalisados.sort((a, b) => b.pontuacao_adequacao - a.pontuacao_adequacao).slice(0, 5);
        for (const cand of candidatosAprovados) {
            if (cand.email && cand.email.includes('@')) {
                const empresaId = (req as any).user?.empresa_id;
                await EmailService.notificarCandidatoAprovado(cand.email, cand.nome, requisitosVaga, empresaId);
            }
        }

        return res.json({
            success: true,
            message: `Foram analisados ${candidatosAnalisados.length} currículos.`,
            excel_path: excelPath,
            candidatos_analisados: candidatosAnalisados
        });

    } catch (error: any) {
        console.error('Erro no módulo de recrutamento:', error);
        return res.status(500).json({ error: 'Falha ao processar os currículos.', details: error.message });
    }
};

// NOVO: Gerar Template Excel
export const baixarTemplateSalarios = (req: Request, res: Response) => {
    const templateData = [
        {
            'Nome': 'João Silva',
            'NIF': '123456789',
            'Email': 'joao@empresa.com',
            'Salário Base': 150000,
            'Faltas': 0,
            'Sub. Tributável': 10000,
            'Sub. Não Tributável': 5000
        },
        {
            'Nome': 'Maria Santos',
            'NIF': '987654321',
            'Email': 'maria@empresa.com',
            'Salário Base': 350000,
            'Faltas': 2,
            'Sub. Tributável': 0,
            'Sub. Não Tributável': 25000
        }
    ];

    const worksheet = xlsx.utils.json_to_sheet(templateData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Template Lote");

    const fileName = `Template_Salarios_Bulk.xlsx`;
    const filePath = path.join(__dirname, '..', '..', 'tmp', fileName);
    
    if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath), { recursive: true });
    xlsx.writeFile(workbook, filePath);

    res.download(filePath, fileName, (err) => {
        if (!err) fs.unlinkSync(filePath); // Limpar após download
    });
};

// NOVO: Processar Excel em Massa e devolver Relatório Mestre (Sem disparar emails para ter aprovação humana)
export const processarSalariosLote = async (req: Request, res: Response) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'Nenhum ficheiro Excel enviado.' });
        }

        // 1. Ler Excel
        const workbook = xlsx.readFile(file.path);
        const sheetName = workbook.SheetNames[0];
        const dadosTabela = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        // Passamos a chamar o método DB que garante persistência e auditoria
        const relatorioResultados = await PayrollService.processarLoteDB(req, dadosTabela, currentMonth, currentYear, 'Admin do Sistema (Upload)');

        // 3. Gerar Excel Mestre para Revisão Humana
        const relatorioSheet = xlsx.utils.json_to_sheet(relatorioResultados);
        const relatorioWorkbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(relatorioWorkbook, relatorioSheet, 'Salários Processados');

        const relatorioFileName = `Relatorio_Mestre_RH_${Date.now()}.xlsx`;
        const relatorioPath = path.join(__dirname, '..', '..', 'tmp', relatorioFileName);
        xlsx.writeFile(relatorioWorkbook, relatorioPath);

        return res.json({
            success: true,
            message: 'Lote processado com sucesso e gravado na base de dados.',
            resultados: relatorioResultados.slice(0, 5), // Retorna preview dos primeiros 5
            totalProcessado: relatorioResultados.length,
            relatorioDownloadUrl: `http://localhost:${process.env.PORT || 3001}/api/hr/download/${relatorioFileName}`
        });

    } catch (error) {
        console.error('Erro a processar salários em massa:', error);
        return res.status(500).json({ error: 'Erro ao processar ficheiro Excel.' });
    }
};

import { EmployeeService } from '../services/EmployeeService';
import { getSupabase } from '../lib/supabaseClient';

export const getRubricas = async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase(req);
        const { data: rubricas, error } = await supabase.from('rubricas').select('*').order('codigo', { ascending: true });
        if (error) throw error;
        res.json({ success: true, rubricas });
    } catch(err: any) { res.status(500).json({ success: false, error: err.message }); }
};

export const createRubrica = async (req: Request, res: Response) => {
    try {
        const { codigo, descricao, tipo, incide_inss, incide_irt } = req.body;
        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;
        
        const { data: info, error } = await supabase.from('rubricas').insert({
            empresa_id,
            codigo, descricao, tipo, incide_inss: incide_inss ? true : false, incide_irt: incide_irt ? true : false
        }).select('id').single();
        if (error) throw error;
        res.json({ success: true, id: info.id });
    } catch(err: any) { res.status(500).json({ success: false, error: err.message }); }
};

export const getTabelasImposto = async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase(req);
        const { data: tabelas, error } = await supabase.from('tabelas_imposto').select('*').order('tipo', { ascending: true }).order('limite_inferior', { ascending: true });
        if (error) throw error;
        res.json({ success: true, tabelas });
    } catch(err: any) { res.status(500).json({ success: false, error: err.message }); }
};

export const getEmployees = async (req: Request, res: Response) => {
    try {
        await EmployeeService.seedDummyEmployee(req); // Ensure we have data
        const employees = await EmployeeService.getAllEmployees(req);
        return res.json({ success: true, employees });
    } catch (error) {
        console.error('Erro a listar colaboradores:', error);
        return res.status(500).json({ error: 'Erro de servidor' });
    }
};

export const createEmployee = async (req: Request, res: Response) => {
    try {
        const dados = req.body;
        if (!dados.nome || !dados.salario_base) {
            return res.status(400).json({ error: 'Nome e Salário Base são obrigatórios.' });
        }
        
        const novoId = await EmployeeService.createEmployee(req, dados);
        
        return res.json({ 
            success: true, 
            message: 'Colaborador registado com sucesso.',
            colaborador_id: novoId 
        });
    } catch (error: any) {
        console.error('Erro a registar colaborador:', error);
        return res.status(500).json({ error: 'Erro ao registar na base de dados.', details: error.message });
    }
};

export const generateDeclaracao = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const pdfPath = await EmployeeService.gerarDeclaracaoServico(req, Number(id));
        const fileName = path.basename(pdfPath);
        return res.json({ 
            success: true, 
            message: 'Declaração gerada com sucesso.',
            pdf_path: '/tmp/' + fileName 
        });
    } catch (error) {
        console.error('Erro a gerar declaração:', error);
        return res.status(500).json({ error: 'Erro ao gerar documento' });
    }
};

export const deleteEmployee = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        await EmployeeService.deleteEmployee(req, id);
        return res.json({ success: true, message: 'Colaborador apagado com sucesso.' });
    } catch (error: any) {
        console.error('Erro ao apagar colaborador:', error);
        return res.status(500).json({ success: false, error: 'Erro de servidor', details: error.message });
    }
};

export const deleteDepartamento = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        await EmployeeService.deleteDepartamento(req, id);
        return res.json({ success: true, message: 'Departamento apagado com sucesso.' });
    } catch (error: any) {
        console.error('Erro ao apagar departamento:', error);
        return res.status(500).json({ success: false, error: 'Erro de servidor', details: error.message });
    }
};

export const fecharProcessamentoMensal = async (req: Request, res: Response) => {
    try {
        const { mes, ano } = req.body;
        if (!mes || !ano) return res.status(400).json({ error: 'Mês e Ano são obrigatórios.' });

        const loteId = await EmployeeService.processarSalarios(req, Number(mes), Number(ano));
        
        return res.json({ 
            success: true, 
            message: 'Salários processados com sucesso.',
            lote_id: loteId
        });
    } catch (error: any) {
        return res.status(400).json({ error: error.message });
    }
};

export const visualizarProcessamento = async (req: Request, res: Response) => {
    try {
        const { mes, ano } = req.params;
        const dados: any = await EmployeeService.getProcessamento(req, Number(mes), Number(ano));
        
        if (!dados) return res.json({ success: true, processamento: null, recibos: [] });
        
        return res.json({ success: true, processamento: dados.processamento, recibos: dados.recibos });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};

export const gerarRecibo = async (req: Request, res: Response) => {
    try {
        const { recibo_id } = req.params;
        const pdfPath = await EmployeeService.gerarReciboPdf(req, Number(recibo_id));
        const fileName = path.basename(pdfPath);
        return res.json({ success: true, pdf_path: '/tmp/' + fileName });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
};

// ================= CONTROLO DE PONTO EM MASSA =================

export const baixarTemplatePonto = async (req: Request, res: Response) => {
    try {
        // Obter todos os colaboradores ativos
        const allEmployees = await EmployeeService.getAllEmployees(req);
        const employees = allEmployees.filter((e: any) => e.estado === 'Ativo');
        
        // Criar template com o ID e Nome
        const templateData = employees.map((emp: any) => ({
            'ID Colaborador': emp.id,
            'Nome': emp.nome,
            'Faltas Injustificadas': 0, // A preencher pelo RH
            'Faltas Médicas': 0, // A preencher pelo RH
            'Observações': ''
        }));

        const sheet = xlsx.utils.json_to_sheet(templateData.length > 0 ? templateData : [
            { 'ID Colaborador': 1, 'Nome': 'João Silva', 'Faltas Injustificadas': 2, 'Faltas Médicas': 0, 'Observações': '' }
        ]);
        
        // Ajustar largura das colunas
        sheet['!cols'] = [
            { wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 40 }
        ];

        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, sheet, 'Controlo de Ponto');

        const fileName = `Template_Ponto_${Date.now()}.xlsx`;
        const filePath = path.join(__dirname, '..', '..', 'tmp', fileName);
        
        if (!fs.existsSync(path.dirname(filePath))) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
        }
        
        xlsx.writeFile(workbook, filePath);

        res.download(filePath, 'Template_Controlo_Ponto.xlsx', (err) => {
            if (!err) fs.unlinkSync(filePath); // Cleanup
        });
    } catch (error) {
        console.error('Erro ao gerar template de ponto:', error);
        return res.status(500).json({ error: 'Erro ao gerar o template.' });
    }
};

export const processarPontoEmMassa = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Ficheiro Excel não encontrado na submissão.' });
        }

        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const dadosPonto = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        let faltasRegistadas = 0;
        let erros = [];

        // Data atual para as faltas (primeiro dia do mês corrente)
        const date = new Date();
        const dataInicio = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
        const dataFim = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0]; // Último dia

        for (const row of dadosPonto as any[]) {
            const idColaborador = row['ID Colaborador'];
            const faltasInjust = parseInt(row['Faltas Injustificadas'] || '0');
            const faltasMed = parseInt(row['Faltas Médicas'] || '0');

            if (!idColaborador) continue;

            try {
                if (faltasInjust > 0) {
                    await EmployeeService.registrarAusencia(req, idColaborador, 'Falta Injustificada', dataInicio, dataFim, false, null);
                    faltasRegistadas++;
                }
                
                if (faltasMed > 0) {
                    // Pendente de atestado
                    await EmployeeService.registrarAusencia(req, idColaborador, 'Falta Justificada (Médico)', dataInicio, dataFim, false, null);
                    faltasRegistadas++;
                }
            } catch (e: any) {
                erros.push(`Erro no Colaborador ID ${idColaborador}: ${e.message}`);
            }
        }

        // Cleanup
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        return res.json({
            success: true,
            message: `Foram processados os registos. ${faltasRegistadas} novas faltas inseridas (Pendentes).`,
            erros: erros.length > 0 ? erros : undefined
        });

    } catch (error) {
        console.error('Erro a processar ponto em massa:', error);
        return res.status(500).json({ error: 'Erro ao processar ficheiro de ponto.' });
    }
};

// ================= ONBOARDING EM MASSA =================

export const baixarTemplateColaboradores = async (req: Request, res: Response) => {
    try {
        const departamentos = await EmployeeService.listarDepartamentos(req) as any[];

        const exemploRow = [{
            'nome': 'João Silva', 'bi': '005123456LA041', 'nif': '5000012345',
            'niss': '10000123456', 'cargo': 'Analista de Sistemas', 'salario_base': 150000,
            'tipo_contrato': 'Prazo Certo', 'data_inicio': '2026-07-01', 'data_fim': '2027-06-30',
            'departamento': departamentos[0]?.nome || 'Tecnologia',
            'genero': 'M', 'estado_civil': 'Solteiro', 'data_nascimento': '1990-05-15',
            'numero_dependentes': 0, 'telefone': '923000000', 'email': 'joao.silva@empresa.ao',
            'banco': 'BAI', 'iban': 'AO06004000000000000000000',
            'sub_alimentacao': 15000, 'sub_transporte': 8000, 'endereco': 'Rua da Missão, Luanda',
        }];

        const instrucoes = [
            { 'Campo': 'nome', 'Obrigatório': 'SIM', 'Notas': 'Nome completo do colaborador' },
            { 'Campo': 'bi', 'Obrigatório': 'SIM', 'Notas': 'Deve ser único no sistema' },
            { 'Campo': 'salario_base', 'Obrigatório': 'SIM', 'Notas': 'Só números, sem Kz (ex: 150000)' },
            { 'Campo': 'tipo_contrato', 'Obrigatório': 'SIM', 'Notas': 'Prazo Certo | Indeterminado | Obra Certa | Prestação de Serviços' },
            { 'Campo': 'data_inicio', 'Obrigatório': 'SIM', 'Notas': 'Formato: YYYY-MM-DD (ex: 2026-07-01)' },
            { 'Campo': 'data_fim', 'Obrigatório': 'NÃO', 'Notas': 'Só para contratos a prazo. YYYY-MM-DD' },
            { 'Campo': 'departamento', 'Obrigatório': 'NÃO', 'Notas': 'Consulte a folha "Departamentos"' },
            { 'Campo': 'genero', 'Obrigatório': 'NÃO', 'Notas': 'M ou F' },
            { 'Campo': 'estado_civil', 'Obrigatório': 'NÃO', 'Notas': 'Solteiro | Casado | Divorciado | Viúvo | União de Facto' },
            { 'Campo': 'sub_alimentacao', 'Obrigatório': 'NÃO', 'Notas': 'Subsídio de Alimentação em AOA' },
            { 'Campo': 'sub_transporte', 'Obrigatório': 'NÃO', 'Notas': 'Subsídio de Transporte em AOA' },
        ];

        const deptRows = departamentos.length > 0
            ? departamentos.map((d: any) => ({ 'Nome do Departamento': d.nome, 'Responsável': d.nome_gestor || '' }))
            : [{ 'Nome do Departamento': 'Sem departamentos. Crie primeiro na aba Departamentos.', 'Responsável': '' }];

        const wb = xlsx.utils.book_new();
        const sheetC = xlsx.utils.json_to_sheet(exemploRow);
        sheetC['!cols'] = Array(21).fill({ wch: 20 });
        xlsx.utils.book_append_sheet(wb, sheetC, 'Colaboradores');
        const sheetI = xlsx.utils.json_to_sheet(instrucoes);
        sheetI['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 60 }];
        xlsx.utils.book_append_sheet(wb, sheetI, 'Instrucoes');
        const sheetD = xlsx.utils.json_to_sheet(deptRows);
        sheetD['!cols'] = [{ wch: 35 }, { wch: 25 }];
        xlsx.utils.book_append_sheet(wb, sheetD, 'Departamentos');

        const filePath = path.join(__dirname, '..', '..', 'tmp', `Template_Colaboradores_${Date.now()}.xlsx`);
        if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath), { recursive: true });
        xlsx.writeFile(wb, filePath);
        res.download(filePath, 'Template_Onboarding_Colaboradores.xlsx', (err) => { if (!err) fs.unlinkSync(filePath); });
    } catch (error: any) {
        return res.status(500).json({ error: 'Erro ao gerar template.', details: error.message });
    }
};

export const importarColaboradoresEmMassa = async (req: Request, res: Response) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro enviado.' });
        const wb = xlsx.readFile(req.file.path);
        const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        const departamentos = await EmployeeService.listarDepartamentos(req) as any[];
        const deptMap: Record<string, number> = {};
        for (const d of departamentos) deptMap[d.nome.toLowerCase().trim()] = d.id;

        const criados: any[] = [];
        const erros: any[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const linha = i + 2;
            if (!row['nome']?.toString().trim()) { erros.push({ linha, motivo: 'Nome é obrigatório' }); continue; }
            if (!row['bi']?.toString().trim()) { erros.push({ linha, nome: row['nome'], motivo: 'BI é obrigatório' }); continue; }
            if (!row['salario_base'] || isNaN(Number(row['salario_base']))) { erros.push({ linha, nome: row['nome'], motivo: 'Salário inválido' }); continue; }
            if (!row['tipo_contrato']) { erros.push({ linha, nome: row['nome'], motivo: 'Tipo de contrato obrigatório' }); continue; }
            if (!row['data_inicio']) { erros.push({ linha, nome: row['nome'], motivo: 'Data de início obrigatória' }); continue; }

            const deptNome = row['departamento'] ? String(row['departamento']).toLowerCase().trim() : '';
            const deptId = deptMap[deptNome] || null;

            try {
                const id = await await EmployeeService.createEmployee(req, {
                    nome: String(row['nome']).trim(), bi: String(row['bi']).trim(),
                    nif: row['nif'] ? String(row['nif']) : null, niss: row['niss'] ? String(row['niss']) : null,
                    cargo: row['cargo'] ? String(row['cargo']).trim() : 'Por definir',
                    salario_base: Number(row['salario_base']),
                    tipo_contrato: String(row['tipo_contrato']), data_inicio: String(row['data_inicio']),
                    data_fim: row['data_fim'] ? String(row['data_fim']) : null,
                    departamento: row['departamento'] ? String(row['departamento']).trim() : null,
                    departamento_id: deptId, genero: row['genero'] || null,
                    estado_civil: row['estado_civil'] || null,
                    data_nascimento: row['data_nascimento'] ? String(row['data_nascimento']) : null,
                    numero_dependentes: row['numero_dependentes'] ? Number(row['numero_dependentes']) : 0,
                    telefone: row['telefone'] ? String(row['telefone']) : null,
                    email: row['email'] ? String(row['email']) : null,
                    banco: row['banco'] ? String(row['banco']) : null,
                    iban: row['iban'] ? String(row['iban']) : null,
                    sub_alimentacao_contrato: row['sub_alimentacao'] ? Number(row['sub_alimentacao']) : 0,
                    sub_transporte_contrato: row['sub_transporte'] ? Number(row['sub_transporte']) : 0,
                    endereco: row['endereco'] ? String(row['endereco']) : null,
                    contato_emergencia: null, nacionalidade: 'Angolana',
                });
                criados.push({ linha, nome: String(row['nome']).trim(), id });
            } catch (e: any) {
                erros.push({ linha, nome: row['nome'], motivo: e.message });
            }
        }
        return res.json({
            success: true,
            resumo: `✅ ${criados.length} colaboradores criados | ⚠️ ${erros.length} erros`,
            total_lido: rows.length, total_criado: criados.length, total_erros: erros.length,
            erros: erros.length > 0 ? erros : undefined,
        });
    } catch (error: any) {
        return res.status(500).json({ error: 'Erro ao importar colaboradores.', details: error.message });
    }
};

// ================= RECRUTAMENTO EM MASSA (EXCEL) =================

export const baixarTemplateCandidatos = (req: Request, res: Response) => {
    try {
        const exemplo = [{
            'nome': 'Maria Santos', 'email': 'maria@gmail.com', 'telefone': '912345678',
            'cargo_pretendido': 'Contabilista Sénior', 'experiencia_anos': 5,
            'formacao': 'Licenciatura em Contabilidade', 'universidade': 'UAN',
            'idiomas': 'Português, Inglês', 'disponibilidade': '2026-08-01',
            'pretensao_salarial': 200000, 'fonte': 'LinkedIn', 'observacoes': 'Candidatura espontânea',
        }];
        const instrucoes = [
            { 'Campo': 'nome', 'Obrigatório': 'SIM', 'Notas': 'Nome completo do candidato' },
            { 'Campo': 'cargo_pretendido', 'Obrigatório': 'SIM', 'Notas': 'Vaga a que se candidata' },
            { 'Campo': 'fonte', 'Obrigatório': 'NÃO', 'Notas': 'LinkedIn | Referência Interna | Job Fair | Candidatura Espontânea' },
            { 'Campo': 'pretensao_salarial', 'Obrigatório': 'NÃO', 'Notas': 'Valor em AOA, apenas números' },
            { 'Campo': 'disponibilidade', 'Obrigatório': 'NÃO', 'Notas': 'Data a partir da qual pode começar. Formato: YYYY-MM-DD' },
        ];
        const wb = xlsx.utils.book_new();
        const s1 = xlsx.utils.json_to_sheet(exemplo);
        s1['!cols'] = Array(12).fill({ wch: 25 });
        xlsx.utils.book_append_sheet(wb, s1, 'Candidatos');
        const s2 = xlsx.utils.json_to_sheet(instrucoes);
        s2['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 60 }];
        xlsx.utils.book_append_sheet(wb, s2, 'Instrucoes');

        const filePath = path.join(__dirname, '..', '..', 'tmp', `Template_Candidatos_${Date.now()}.xlsx`);
        if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath), { recursive: true });
        xlsx.writeFile(wb, filePath);
        res.download(filePath, 'Template_Recrutamento_Candidatos.xlsx', (err) => { if (!err) fs.unlinkSync(filePath); });
    } catch (error: any) {
        return res.status(500).json({ error: 'Erro ao gerar template de candidatos.' });
    }
};

export const importarCandidatosEmMassa = async (req: Request, res: Response) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro enviado.' });
        const wb = xlsx.readFile(req.file.path);
        const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        const supabase = getSupabase(req);
        const empresa_id = (req as any).user?.empresa_id;

        const criados: any[] = [];
        const erros: any[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const linha = i + 2;
            if (!row['nome'] || !row['cargo_pretendido']) {
                erros.push({ linha, motivo: 'Nome e cargo pretendido são obrigatórios.' });
                continue;
            }
            try {
                const { data: cliente, error: cliErr } = await supabase.from('clientes').insert({
                    empresa_id,
                    nome: String(row['nome']).trim(),
                    email: row['email'] ? String(row['email']) : null,
                    telefone: row['telefone'] ? String(row['telefone']) : null,
                    empresa: `Candidato: ${row['cargo_pretendido']}`
                }).select('id').single();
                if (cliErr) throw cliErr;

                const { error: negErr } = await supabase.from('negocios').insert({
                    empresa_id,
                    cliente_id: cliente.id,
                    titulo: `[REC] ${row['cargo_pretendido']} — ${row['nome']}`,
                    valor_estimado: row['pretensao_salarial'] ? Number(row['pretensao_salarial']) : 0,
                    fase: 'Nova Lead'
                });
                if (negErr) throw negErr;
                
                criados.push({ linha, nome: String(row['nome']).trim() });
            } catch (e: any) {
                erros.push({ linha, nome: row['nome'], motivo: e.message });
            }
        }
        return res.json({
            success: true,
            resumo: `✅ ${criados.length} candidatos no Pipeline de Recrutamento | ⚠️ ${erros.length} erros`,
            total_criado: criados.length, total_erros: erros.length,
            erros: erros.length > 0 ? erros : undefined,
        });
    } catch (error: any) {
        return res.status(500).json({ error: 'Erro ao importar candidatos.', details: error.message });
    }
};
