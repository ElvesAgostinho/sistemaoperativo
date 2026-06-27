import { Router } from 'express';
import multer from 'multer';
import { 
    processarSalario, analisarCurriculos, baixarTemplateSalarios, processarSalariosLote, 
    getEmployees, createEmployee, generateDeclaracao, deleteEmployee, deleteDepartamento,
    fecharProcessamentoMensal, visualizarProcessamento, gerarRecibo,
    baixarTemplatePonto, processarPontoEmMassa,
    baixarTemplateColaboradores, importarColaboradoresEmMassa,
    baixarTemplateCandidatos, importarCandidatosEmMassa,
    getRubricas, createRubrica, getTabelasImposto
} from '../controllers/hrController';

const router = Router();
const upload = multer({ dest: 'tmp/' }); // Guardar PDFs temporariamente

// Rota para testar o processamento salarial
router.post('/payroll', processarSalario);

// Rota para analisar múltiplos currículos e gerar Excel
router.post('/recruit', upload.array('curriculos', 200), analisarCurriculos);

// Novos endpoints de Lote
router.get('/payroll-template', baixarTemplateSalarios);
router.post('/payroll-bulk', upload.single('loteExcel'), processarSalariosLote);

// Configurações Salariais Avançadas
router.get('/rubricas', getRubricas);
router.post('/rubricas', createRubrica);
router.get('/tabelas-imposto', getTabelasImposto);

// Gestão de Colaboradores
router.get('/employees', getEmployees);
router.post('/employees', createEmployee);
router.put('/employees/:id', (req, res) => {
    try {
        const id = Number(req.params.id);
        require('../services/EmployeeService').EmployeeService.updateEmployee(id, req.body);
        res.json({ success: true, message: 'Colaborador atualizado com sucesso.' });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});
router.post('/employees/:id/declaracao', generateDeclaracao);
router.delete('/employees/:id', deleteEmployee);

// Dossier do Funcionário
router.get('/employees/:id/documents', (req, res) => {
    try {
        const id = Number(req.params.id);
        const docs = require('../services/EmployeeService').EmployeeService.listarDocumentos(id);
        res.json({ success: true, documents: docs });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/employees/:id/documents', upload.single('documento'), (req, res) => {
    try {
        const id = Number(req.params.id);
        const { categoria, titulo } = req.body;
        const filePath = req.file ? req.file.path : null;
        if (!filePath) return res.status(400).json({ error: 'Nenhum ficheiro recebido.' });
        
        const docId = require('../services/EmployeeService').EmployeeService.adicionarDocumento({
            colaborador_id: id,
            categoria,
            titulo,
            file_path: '/tmp/' + req.file!.filename
        });
        
        res.json({ success: true, docId });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Gestão de Departamentos
router.get('/departamentos', (req, res) => {
    try {
        const deptos = require('../services/EmployeeService').EmployeeService.listarDepartamentos();
        res.json({ success: true, departamentos: deptos });
    } catch(err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/departamentos', (req, res) => {
    try {
        require('../services/EmployeeService').EmployeeService.criarDepartamento(req.body);
        res.json({ success: true });
    } catch(err: any) { res.status(500).json({ success: false, error: err.message }); }
});
router.delete('/departamentos/:id', deleteDepartamento);
// Gestão de Presenças e Faltas
router.get('/ausencias', (req, res) => {
    try {
        const colaborador_id = req.query.colaborador_id ? Number(req.query.colaborador_id) : undefined;
        const ausencias = require('../services/EmployeeService').EmployeeService.listarAusencias(colaborador_id);
        res.json({ success: true, ausencias });
    } catch(err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/attendance-template', baixarTemplatePonto);
router.post('/attendance-bulk', upload.single('loteExcel'), processarPontoEmMassa);

router.post('/ausencias', upload.single('comprovativo'), (req, res) => {
    try {
        const { colaborador_id, tipo, data_inicio, data_fim, justificada } = req.body;
        const filePath = req.file ? req.file.path : null;
        require('../services/EmployeeService').EmployeeService.registrarAusencia(
            Number(colaborador_id), tipo, data_inicio, data_fim, 
            justificada === 'true', filePath
        );
        res.json({ success: true });
    } catch(err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/ausencias/:id/estado', (req, res) => {
    try {
        require('../services/EmployeeService').EmployeeService.atualizarEstadoAusencia(Number(req.params.id), req.body.estado);
        res.json({ success: true });
    } catch(err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// Motor de Processamento Salarial (Novo)
router.post('/processamento', fecharProcessamentoMensal); // Renomear esta função depois para algo como gerarRascunho
router.get('/processamento/:mes/:ano', visualizarProcessamento);
router.get('/recibo/:recibo_id/pdf', gerarRecibo);

// Edição de Recibo e Fecho Oficial do Lote
router.put('/recibo/:id', (req, res) => {
    try {
        require('../services/EmployeeService').EmployeeService.atualizarReciboManual(Number(req.params.id), req.body);
        res.json({ success: true });
    } catch(err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/processamento/:id/fechar', (req, res) => {
    try {
        require('../services/EmployeeService').EmployeeService.fecharProcessamento(Number(req.params.id));
        res.json({ success: true });
    } catch(err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// Adiantamentos (Vales)
router.get('/adiantamentos', (req, res) => {
    try {
        const result = require('../services/EmployeeService').EmployeeService.listarAdiantamentos();
        res.json({ success: true, adiantamentos: result });
    } catch(err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/adiantamentos', (req, res) => {
    try {
        require('../services/EmployeeService').EmployeeService.criarAdiantamento(req.body);
        res.json({ success: true });
    } catch(err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// Avaliações de Desempenho
router.get('/avaliacoes', (req, res) => {
    try {
        const result = require('../services/EmployeeService').EmployeeService.listarAvaliacoes();
        res.json({ success: true, avaliacoes: result });
    } catch(err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/avaliacoes', (req, res) => {
    try {
        require('../services/EmployeeService').EmployeeService.criarAvaliacao(req.body);
        res.json({ success: true });
    } catch(err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// Onboarding em Massa
router.get('/employees-template', baixarTemplateColaboradores);
router.post('/employees-bulk', upload.single('loteExcel'), importarColaboradoresEmMassa);

// Recrutamento em Massa (Excel)
router.get('/candidates-template', baixarTemplateCandidatos);
router.post('/candidates-bulk', upload.single('loteExcel'), importarCandidatosEmMassa);

export default router;
