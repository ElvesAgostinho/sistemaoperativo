import { useState, useEffect } from 'react';
import { Upload, Users, FileText, Download, CheckCircle, AlertTriangle, Briefcase, Calendar, Plus, Bot, Trash2, Sun, Search, Lock, Edit2, DollarSign, Star, LayoutGrid, List } from 'lucide-react';

export default function HrApp() {
  const [activeTab, setActiveTab] = useState<'recrutamento' | 'salarios' | 'colaboradores' | 'presencas' | 'departamentos' | 'adiantamentos' | 'desempenho' | 'rubricas'>('colaboradores');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  
  const [showNewEmployeeModal, setShowNewEmployeeModal] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    nome: '', genero: 'Masculino', data_nascimento: '', estado_civil: 'Solteiro(a)', nacionalidade: 'Angolana', numero_dependentes: 0,
    endereco: '', telefone: '', email: '', contato_emergencia: '',
    bi: '', nif: '', niss: '', validade_documento: '', validade_carta_conducao: '', data_emissao_documento: '', data_emissao_carta_conducao: '',
    departamento_id: '', cargo: '', 
    salario_base: '', sub_alimentacao_contrato: 30000, sub_transporte_contrato: 20000,
    banco: '', iban: '',
    tipo_contrato: 'Tempo Indeterminado', data_inicio: '', data_fim: ''
  });
  const [showEditEmployeeModal, setShowEditEmployeeModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState<any>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);

  // Estados para Dossier do Funcionário
  const [showDossierModal, setShowDossierModal] = useState(false);
  const [dossierEmployeeId, setDossierEmployeeId] = useState<number | null>(null);
  const [dossierDocuments, setDossierDocuments] = useState<any[]>([]);
  const [newDocument, setNewDocument] = useState({ categoria: 'Formação', titulo: '' });
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  // Listens to the Custom Event dispatched by App.tsx Top Nav
  useEffect(() => {
    const handleTabChange = (e: any) => {
      if (e.detail) setActiveTab(e.detail);
    };
    window.addEventListener('hr-tab-change', handleTabChange);
    return () => window.removeEventListener('hr-tab-change', handleTabChange);
  }, []);

  // --- Estados de Departamentos ---
  const [departamentos, setDepartamentos] = useState<any[]>([]);
  const [loadingDepartamentos, setLoadingDepartamentos] = useState(false);
  const [showNewDepartamentoModal, setShowNewDepartamentoModal] = useState(false);
  const [newDepartamento, setNewDepartamento] = useState({ nome: '', descricao: '', gestor_id: '', orcamento_mensal: '' });

  // --- Estados de Configuração Salarial (Rubricas) ---
  const [rubricas, setRubricas] = useState<any[]>([]);
  const [tabelasImposto, setTabelasImposto] = useState<any[]>([]);
  const [showNovaRubricaModal, setShowNovaRubricaModal] = useState(false);
  const [novaRubrica, setNovaRubrica] = useState({ codigo: '', descricao: '', tipo: 'Abono', incide_inss: true, incide_irt: true });

  const fetchRubricas = async () => {
    try {
      const res = await fetch('http://127.0.0.1:3001/api/hr/rubricas');
      const data = await res.json();
      if(data.success) setRubricas(data.rubricas);
      
      const resI = await fetch('http://127.0.0.1:3001/api/hr/tabelas-imposto');
      const dataI = await resI.json();
      if(dataI.success) setTabelasImposto(dataI.tabelas);
    } catch(err) { console.error(err); }
  };

  const handleSaveRubrica = async (e: any) => {
    e.preventDefault();
    try {
      await fetch('http://127.0.0.1:3001/api/hr/rubricas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novaRubrica)
      });
      setShowNovaRubricaModal(false);
      fetchRubricas();
    } catch(err) { alert('Erro ao salvar rubrica'); }
  };

  const fetchDepartamentos = async () => {
    setLoadingDepartamentos(true);
    try {
      const res = await fetch('http://127.0.0.1:3001/api/hr/departamentos');
      const data = await res.json();
      if (data.success) {
        setDepartamentos(data.departamentos);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDepartamentos(false);
    }
  };

  const handleSaveDepartamento = async (e: any) => {
    e.preventDefault();
    try {
      const res = await fetch('http://127.0.0.1:3001/api/hr/departamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDepartamento)
      });
      const data = await res.json();
      if (data.success) {
        setShowNewDepartamentoModal(false);
        setNewDepartamento({ nome: '', descricao: '', gestor_id: '', orcamento_mensal: '' });
        fetchDepartamentos();
      } else {
        alert("Erro: " + data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao gravar departamento.");
    }
  };

  // --- Estados de Colaboradores ---
  const [employees, setEmployees] = useState<any[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState<number | null>(null);

  // --- Estados de Férias e Ausências ---
  const [showVacationModal, setShowVacationModal] = useState<number | null>(null);
  const [employeeVacations, setEmployeeVacations] = useState<any[]>([]);
  const [loadingVacations, setLoadingVacations] = useState(false);
  const [newVacation, setNewVacation] = useState({ tipo: 'Férias', data_inicio: '', data_fim: '', justificada: true });

  const fetchEmployeeVacations = async (empId: number) => {
    setLoadingVacations(true);
    try {
      const res = await fetch(`http://127.0.0.1:3001/api/hr/ausencias?colaborador_id=${empId}`);
      const data = await res.json();
      if (data.success) {
        setEmployeeVacations(data.ausencias);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingVacations(false);
    }
  };

  const handleOpenVacations = (empId: number) => {
    setShowVacationModal(empId);
    fetchEmployeeVacations(empId);
  };

  const handleSaveVacation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showVacationModal) return;
    
    try {
      const formData = new FormData();
      formData.append('colaborador_id', showVacationModal.toString());
      formData.append('tipo', newVacation.tipo);
      formData.append('data_inicio', newVacation.data_inicio);
      formData.append('data_fim', newVacation.data_fim);
      formData.append('justificada', newVacation.justificada.toString());

      const res = await fetch('http://127.0.0.1:3001/api/hr/ausencias', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setNewVacation({ tipo: 'Férias', data_inicio: '', data_fim: '', justificada: true });
        fetchEmployeeVacations(showVacationModal);
      } else {
        alert("Erro: " + data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao gravar ausência.");
    }
  };

  const handleUpdateVacationStatus = async (id: number, estado: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:3001/api/hr/ausencias/${id}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado })
      });
      const data = await res.json();
      if (data.success) {
        if (showVacationModal) fetchEmployeeVacations(showVacationModal);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const res = await fetch('http://127.0.0.1:3001/api/hr/employees');
      const data = await res.json();
      if (data.success) {
        setEmployees(data.employees);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingEmployees(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'colaboradores' && employees.length === 0) {
      fetchEmployees();
    }
    if ((activeTab === 'colaboradores' || activeTab === 'departamentos') && departamentos.length === 0) {
      fetchDepartamentos();
    }
    if (activeTab === 'rubricas') {
      fetchRubricas();
    }
  }, [activeTab]);

  const handleGenerateDoc = async (id: number) => {
    setGeneratingDoc(id);
    try {
      const res = await fetch(`http://127.0.0.1:3001/api/hr/employees/${id}/declaracao`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        window.open('http://127.0.0.1:3001' + data.pdf_path, '_blank');
      } else {
        alert('Erro ao gerar declaração.');
      }
    } catch (err) {
      alert('Erro de comunicação.');
    } finally {
      setGeneratingDoc(null);
    }
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingEmployee(true);
    try {
      const res = await fetch('http://127.0.0.1:3001/api/hr/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEmployee)
      });
      const data = await res.json();
      if (data.success) {
        setShowNewEmployeeModal(false);
        setNewEmployee({
          nome: '', genero: 'Masculino', data_nascimento: '', estado_civil: 'Solteiro(a)', nacionalidade: 'Angolana', numero_dependentes: 0,
          endereco: '', telefone: '', email: '', contato_emergencia: '',
          bi: '', nif: '', niss: '', departamento_id: '', cargo: '', 
          validade_documento: '', validade_carta_conducao: '', data_emissao_documento: '', data_emissao_carta_conducao: '',
          salario_base: '', sub_alimentacao_contrato: 30000, sub_transporte_contrato: 20000,
          banco: '', iban: '',
          tipo_contrato: 'Tempo Indeterminado', data_inicio: '', data_fim: ''
        });
        fetchEmployees(); // recarrega a lista
      } else {
        alert("Erro: " + data.error);
      }
    } catch (err) {
      alert("Erro ao comunicar com o servidor.");
    } finally {
      setIsSavingEmployee(false);
    }
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEmployee) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch(`http://127.0.0.1:3001/api/hr/employees/${editEmployee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editEmployee)
      });
      const data = await res.json();
      if (data.success) {
        setShowEditEmployeeModal(false);
        setEditEmployee(null);
        fetchEmployees();
      } else {
        alert("Erro: " + data.error);
      }
    } catch (err) {
      alert("Erro ao comunicar com o servidor.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const deleteEmployee = async (id: number) => {
    if (!window.confirm("ATENÇÃO: Ao apagar o colaborador, apagará os seus recibos, ausências e contratos associados. Continuar?")) return;
    try {
      await fetch(`http://127.0.0.1:3001/api/hr/employees/${id}`, { method: 'DELETE' });
      fetchEmployees();
    } catch (err) {
      alert("Erro ao apagar colaborador.");
    }
  };

  const deleteDepartamento = async (id: number) => {
    if (!window.confirm("Deseja eliminar este departamento? Os colaboradores passarão a ficar sem departamento associado.")) return;
    try {
      await fetch(`http://127.0.0.1:3001/api/hr/departamentos/${id}`, { method: 'DELETE' });
      fetchDepartamentos();
    } catch (err) {
      alert("Erro ao apagar departamento.");
    }
  };

  const openDossier = async (empId: number) => {
    setDossierEmployeeId(empId);
    setShowDossierModal(true);
    try {
      const res = await fetch(`http://127.0.0.1:3001/api/hr/employees/${empId}/documents`);
      const data = await res.json();
      if (data.success) {
        setDossierDocuments(data.documents);
      }
    } catch { alert("Erro ao carregar documentos."); }
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentFile || !dossierEmployeeId) return;
    setIsUploadingDoc(true);
    const formData = new FormData();
    formData.append('documento', documentFile);
    formData.append('categoria', newDocument.categoria);
    formData.append('titulo', newDocument.titulo);

    try {
      const res = await fetch(`http://127.0.0.1:3001/api/hr/employees/${dossierEmployeeId}/documents`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setDocumentFile(null);
        setNewDocument({ categoria: 'Formação', titulo: '' });
        openDossier(dossierEmployeeId); // refresh
      } else {
        alert("Erro: " + data.error);
      }
    } catch { alert("Erro ao enviar documento."); }
    finally { setIsUploadingDoc(false); }
  };

  // --- Estados de Recrutamento / Triagem ---
  const [vagas, setVagas] = useState<any[]>([]);
  const [candidaturas, setCandidaturas] = useState<any[]>([]);
  const [showNovaVagaModal, setShowNovaVagaModal] = useState(false);
  const [novaVaga, setNovaVaga] = useState({ titulo: '', criterios: '' });
  
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [novaCandidatura, setNovaCandidatura] = useState({ vaga_id: '', nome: '', email: '', telefone: '' });
  const [showNovaCandidaturaModal, setShowNovaCandidaturaModal] = useState(false);
  const [isProcessingCv, setIsProcessingCv] = useState(false);

  const fetchVagas = async () => {
    try {
      const res = await fetch('http://127.0.0.1:3001/api/recrutamento/vagas');
      const data = await res.json();
      if (data.success) setVagas(data.vagas || []);
    } catch (err) { console.error(err); }
  };

  const fetchCandidaturas = async () => {
    try {
      const resCand = await fetch('http://127.0.0.1:3001/api/recrutamento/candidaturas');
      const dataCand = await resCand.json();
      if (dataCand.success) setCandidaturas(dataCand.candidaturas || []);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (activeTab === 'recrutamento') {
      fetchVagas();
      fetchCandidaturas();
    }
  }, [activeTab]);

  const handleCreateVaga = async (e: any) => {
    e.preventDefault();
    try {
      await fetch('http://127.0.0.1:3001/api/recrutamento/vagas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novaVaga)
      });
      setNovaVaga({ titulo: '', criterios: '' });
      setShowNovaVagaModal(false);
      fetchVagas();
    } catch (err) { alert('Erro ao criar vaga'); }
  };

  const handleUploadCv = async (e: any) => {
    e.preventDefault();
    if (!cvFile || !novaCandidatura.vaga_id) return alert('Selecione uma vaga e um CV (PDF).');
    
    setIsProcessingCv(true);
    const formData = new FormData();
    formData.append('cv', cvFile);
    formData.append('vaga_id', novaCandidatura.vaga_id);
    formData.append('nome', novaCandidatura.nome);
    formData.append('email', novaCandidatura.email);
    formData.append('telefone', novaCandidatura.telefone);

    try {
      const res = await fetch('http://127.0.0.1:3001/api/recrutamento/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        alert('Candidatura submetida e avaliada pela IA!');
        setShowNovaCandidaturaModal(false);
        setNovaCandidatura({ vaga_id: '', nome: '', email: '', telefone: '' });
        setCvFile(null);
        fetchCandidaturas();
      } else {
        alert('Erro: ' + data.error);
      }
    } catch (err) {
      alert('Erro ao enviar CV.');
    } finally {
      setIsProcessingCv(false);
    }
  };

  const handleDecisaoCandidatura = async (id: number, estado: string) => {
    if (!window.confirm(`Tem a certeza que deseja marcar como ${estado}? O candidato será notificado.`)) return;
    try {
      const res = await fetch(`http://127.0.0.1:3001/api/recrutamento/${id}/decisao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Sucesso! Mensagem enviada gerada pela IA:\n\n${data.feedbackGerado}`);
        fetchCandidaturas();
      }
    } catch (err) {
      alert('Erro ao tomar decisão');
    }
  };

  // --- Estados de Salários ---
  const [payrollFile, setPayrollFile] = useState<File | null>(null);
  const [isProcessingPayroll, setIsProcessingPayroll] = useState(false);
  const [payrollResults, setPayrollResults] = useState<any>(null);
  const [editingRecibo, setEditingRecibo] = useState<any>(null); // Guardar o recibo que está a ser editado manualmente

  // --- Estados de Presenças ---
  const [ausencias, setAusencias] = useState<any[]>([]);
  const [showNovaAusenciaModal, setShowNovaAusenciaModal] = useState(false);
  const [novaAusencia, setNovaAusencia] = useState({
    colaborador_id: '', tipo: 'Falta Injustificada', data_inicio: '', data_fim: '', justificada: 'false'
  });
  const [ausenciaFile, setAusenciaFile] = useState<File | null>(null);
  const [attendanceBulkFile, setAttendanceBulkFile] = useState<File | null>(null);
  const [isProcessingAttendance, setIsProcessingAttendance] = useState(false);

  // --- Estados de Adiantamentos ---
  const [adiantamentos, setAdiantamentos] = useState<any[]>([]);
  const [showNovoAdiantamentoModal, setShowNovoAdiantamentoModal] = useState(false);
  const [novoAdiantamento, setNovoAdiantamento] = useState({
    colaborador_id: '', valor_total: '', parcelas_mensais: ''
  });

  // --- Estados de Avaliações ---
  const [avaliacoes, setAvaliacoes] = useState<any[]>([]);
  const [showNovaAvaliacaoModal, setShowNovaAvaliacaoModal] = useState(false);
  const [novaAvaliacao, setNovaAvaliacao] = useState({
    colaborador_id: '', avaliador_id: '', pontuacao: '5', comentarios: ''
  });

  // --- Estados de Import em Massa ---
  const [employeeBulkFile, setEmployeeBulkFile] = useState<File | null>(null);
  const [isImportingEmployees, setIsImportingEmployees] = useState(false);
  const [employeeBulkResult, setEmployeeBulkResult] = useState<any>(null);
  const [candidateBulkFile, setCandidateBulkFile] = useState<File | null>(null);
  const [isImportingCandidates, setIsImportingCandidates] = useState(false);
  const [candidateBulkResult, setCandidateBulkResult] = useState<any>(null);

  const carregarAusencias = async () => {
    try {
      const res = await fetch('http://127.0.0.1:3001/api/hr/ausencias');
      const data = await res.json();
      if(data.success) setAusencias(data.ausencias);
    } catch(err) { console.error(err); }
  };

  const carregarAdiantamentos = async () => {
    try {
      const res = await fetch('http://127.0.0.1:3001/api/hr/adiantamentos');
      const data = await res.json();
      if(data.success) setAdiantamentos(data.adiantamentos);
    } catch(err) { console.error(err); }
  };

  const carregarAvaliacoes = async () => {
    try {
      const res = await fetch('http://127.0.0.1:3001/api/hr/avaliacoes');
      const data = await res.json();
      if(data.success) setAvaliacoes(data.avaliacoes);
    } catch(err) { console.error(err); }
  };

  useEffect(() => {
    if (activeTab === 'presencas') carregarAusencias();
    if (activeTab === 'adiantamentos') {
      carregarAdiantamentos();
      if (employees.length === 0) fetchEmployees();
    }
    if (activeTab === 'desempenho') {
      carregarAvaliacoes();
      if (employees.length === 0) fetchEmployees();
    }
  }, [activeTab]);

  // --- Handlers de Novos Módulos ---
  const handleSaveAdiantamento = async (e: any) => {
    e.preventDefault();
    try {
      const res = await fetch('http://127.0.0.1:3001/api/hr/adiantamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novoAdiantamento)
      });
      const data = await res.json();
      if (data.success) {
        setShowNovoAdiantamentoModal(false);
        setNovoAdiantamento({ colaborador_id: '', valor_total: '', parcelas_mensais: '' });
        carregarAdiantamentos();
      } else {
        alert("Erro: " + data.error);
      }
    } catch (err) {
      alert("Erro de comunicação.");
    }
  };

  const handleSaveAvaliacao = async (e: any) => {
    e.preventDefault();
    try {
      const res = await fetch('http://127.0.0.1:3001/api/hr/avaliacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novaAvaliacao)
      });
      const data = await res.json();
      if (data.success) {
        setShowNovaAvaliacaoModal(false);
        setNovaAvaliacao({ colaborador_id: '', avaliador_id: '', pontuacao: '5', comentarios: '' });
        carregarAvaliacoes();
      } else {
        alert("Erro: " + data.error);
      }
    } catch (err) {
      alert("Erro de comunicação.");
    }
  };

  const handleImportEmployees = async () => {
    if (!employeeBulkFile) return;
    setIsImportingEmployees(true);
    setEmployeeBulkResult(null);
    const formData = new FormData();
    formData.append('loteExcel', employeeBulkFile);
    try {
      const res = await fetch('http://127.0.0.1:3001/api/hr/employees-bulk', { method: 'POST', body: formData });
      const data = await res.json();
      setEmployeeBulkResult(data);
      if (data.success && data.total_criado > 0) fetchEmployees();
      setEmployeeBulkFile(null);
    } catch { alert('Erro de comunicação com o servidor.'); }
    finally { setIsImportingEmployees(false); }
  };

  const handleImportCandidates = async () => {
    if (!candidateBulkFile) return;
    setIsImportingCandidates(true);
    setCandidateBulkResult(null);
    const formData = new FormData();
    formData.append('loteExcel', candidateBulkFile);
    try {
      const res = await fetch('http://127.0.0.1:3001/api/hr/candidates-bulk', { method: 'POST', body: formData });
      const data = await res.json();
      setCandidateBulkResult(data);
      setCandidateBulkFile(null);
    } catch { alert('Erro de comunicação com o servidor.'); }
    finally { setIsImportingCandidates(false); }
  };

  // --- Handlers de Salários ---
  const handlePayrollFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setPayrollFile(e.target.files[0]);
    }
  };

  const handleDownloadTemplate = () => {
    window.location.href = 'http://127.0.0.1:3001/api/hr/payroll-template';
  };

  const handleProcessPayroll = async () => {
    if (!payrollFile) return;
    setIsProcessingPayroll(true);

    const formData = new FormData();
    formData.append('loteExcel', payrollFile);

    try {
      const res = await fetch('http://127.0.0.1:3001/api/hr/payroll-bulk', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setPayrollResults(data);
      } else {
        alert("Erro retornado pelo servidor: " + data.error);
      }
    } catch (err) {
      console.error("Erro ao processar salários:", err);
      alert("Erro ao comunicar com o servidor.");
    } finally {
      setIsProcessingPayroll(false);
    }
  };

  // --- Handlers de Ponto ---
  const handleDownloadAttendanceTemplate = () => {
    window.location.href = 'http://127.0.0.1:3001/api/hr/attendance-template';
  };

  const handleProcessAttendance = async () => {
    if (!attendanceBulkFile) return;
    setIsProcessingAttendance(true);

    const formData = new FormData();
    formData.append('loteExcel', attendanceBulkFile);

    try {
      const res = await fetch('http://127.0.0.1:3001/api/hr/attendance-bulk', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        carregarAusencias();
        setAttendanceBulkFile(null);
      } else {
        alert("Erro: " + data.error);
      }
    } catch (err) {
      console.error("Erro ao processar ponto:", err);
      alert("Erro de comunicação com o servidor.");
    } finally {
      setIsProcessingAttendance(false);
    }
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* Submenu de Controlo Odoo */}
      <div className="odoo-control-panel">
        <div className="odoo-breadcrumb">
          Recursos Humanos / <span style={{ fontWeight: 600, marginLeft: '8px' }}>
            {activeTab === 'colaboradores' && 'Diretório de Colaboradores'}
            {activeTab === 'presencas' && 'Presenças e Faltas'}
            {activeTab === 'salarios' && 'Processamento de Salários'}
            {activeTab === 'rubricas' && 'Rubricas e Impostos'}
            {activeTab === 'recrutamento' && 'Triagem de CVs (IA)'}
          </span>
        </div>
        <div className="odoo-control-actions">
          <button 
            className={`odoo-btn ${activeTab === 'colaboradores' ? 'odoo-btn-primary' : ''}`}
            onClick={() => setActiveTab('colaboradores')}
          >
            Diretório
          </button>
          <button 
            className={`odoo-btn ${activeTab === 'departamentos' ? 'odoo-btn-primary' : ''}`}
            onClick={() => setActiveTab('departamentos')}
          >
            Departamentos
          </button>
          <button 
            className={`odoo-btn ${activeTab === 'presencas' ? 'odoo-btn-primary' : ''}`}
            onClick={() => setActiveTab('presencas')}
          >
            Presenças
          </button>
          <button 
            className={`odoo-btn ${activeTab === 'salarios' ? 'odoo-btn-primary' : ''}`}
            onClick={() => setActiveTab('salarios')}
          >
            Processamento
          </button>
          <button 
            className={`odoo-btn ${activeTab === 'rubricas' ? 'odoo-btn-primary' : ''}`}
            onClick={() => setActiveTab('rubricas')}
          >
            Config Salarial
          </button>
          <button 
            className={`odoo-btn ${activeTab === 'recrutamento' ? 'odoo-btn-primary' : ''}`}
            onClick={() => setActiveTab('recrutamento')}
          >
            Triagem IA
          </button>
          <button 
            className={`odoo-btn ${activeTab === 'adiantamentos' ? 'odoo-btn-primary' : ''}`}
            onClick={() => setActiveTab('adiantamentos')}
          >
            Adiantamentos
          </button>
          <button 
            className={`odoo-btn ${activeTab === 'desempenho' ? 'odoo-btn-primary' : ''}`}
            onClick={() => setActiveTab('desempenho')}
          >
            Desempenho
          </button>
        </div>
      </div>

      <div className="odoo-content-area" style={{ backgroundColor: 'var(--odoo-bg-gray)', padding: '20px', alignItems: 'flex-start' }}>
        
        {/* ================= COLABORADORES ================= */}
        {activeTab === 'colaboradores' && (
          <div style={{ width: '100%', maxWidth: '1200px' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <button 
                className="odoo-btn odoo-btn-primary" 
                style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                onClick={() => setShowNewEmployeeModal(true)}
              >
                <Plus size={16} /> NOVO COLABORADOR
              </button>
              
              {/* Importação em Massa */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px dashed var(--odoo-border)', padding: '4px 10px', borderRadius: '6px', backgroundColor: 'white' }}>
                <button className="odoo-btn" onClick={() => window.location.href='http://127.0.0.1:3001/api/hr/employees-template'} style={{ fontSize: '12px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Download size={14} /> Template
                </button>
                <input type="file" accept=".xlsx,.xls,.csv" style={{ fontSize: '11px', width: '140px' }} onChange={e => setEmployeeBulkFile(e.target.files?.[0] || null)} />
                <button
                  className="odoo-btn odoo-btn-primary"
                  onClick={handleImportEmployees}
                  disabled={!employeeBulkFile || isImportingEmployees}
                  style={{ fontSize: '12px', padding: '4px 10px', backgroundColor: !employeeBulkFile ? '#ccc' : undefined, display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  {isImportingEmployees ? 'A IMPORTAR...' : <><Upload size={14} /> IMPORTAR LOTE</>}
                </button>
              </div>
              
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="text" className="odoo-input" placeholder="Pesquisar..." style={{ backgroundColor: 'white', padding: '8px 12px', border: '1px solid var(--odoo-border)', borderRadius: '4px' }} />
                
                <div style={{ display: 'flex', border: '1px solid var(--odoo-border)', borderRadius: '4px', overflow: 'hidden', backgroundColor: 'white' }}>
                  <button 
                    onClick={() => setViewMode('kanban')}
                    style={{ padding: '6px 10px', border: 'none', backgroundColor: viewMode === 'kanban' ? '#e9ecef' : 'transparent', cursor: 'pointer', borderRight: '1px solid var(--odoo-border)', display: 'flex', alignItems: 'center' }}
                    title="Vista de Cartões"
                  >
                    <LayoutGrid size={16} />
                  </button>
                  <button 
                    onClick={() => setViewMode('list')}
                    style={{ padding: '6px 10px', border: 'none', backgroundColor: viewMode === 'list' ? '#e9ecef' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    title="Vista de Lista"
                  >
                    <List size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Resultado da Importação em Massa */}
            {employeeBulkResult && (
              <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '6px', border: '1px solid', borderColor: employeeBulkResult.total_erros > 0 ? '#ffc107' : '#28a745', backgroundColor: employeeBulkResult.total_erros > 0 ? '#fff9e6' : '#f0fff4' }}>
                <strong>{employeeBulkResult.resumo}</strong>
                {employeeBulkResult.erros && employeeBulkResult.erros.length > 0 && (
                  <details style={{ marginTop: '8px', fontSize: '12px' }}>
                    <summary style={{ cursor: 'pointer', color: '#856404' }}>Ver {employeeBulkResult.erros.length} linha(s) com erro</summary>
                    <ul style={{ marginTop: '6px', paddingLeft: '20px' }}>
                      {employeeBulkResult.erros.map((e: any, i: number) => (
                        <li key={i} style={{ color: '#721c24' }}>Linha {e.linha}{e.nome ? ` (${e.nome})` : ''}: {e.motivo}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <button onClick={() => setEmployeeBulkResult(null)} style={{ marginTop: '6px', fontSize: '11px', background: 'none', border: 'none', cursor: 'pointer', color: '#666' }}>✕ Fechar</button>
              </div>
            )}

            {loadingEmployees ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>A carregar base de dados...</div>
            ) : (
              <>
                {viewMode === 'kanban' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', alignItems: 'start' }}>
                    {employees.map(emp => (
                      <div key={emp.id} style={{ backgroundColor: 'white', border: '1px solid var(--odoo-border)', borderRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '16px', display: 'flex', flexDirection: 'row', gap: '16px', position: 'relative' }}>
                        <button 
                          onClick={() => deleteEmployee(emp.id)}
                          style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', opacity: 0.5 }}
                          onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                          onMouseOut={(e) => e.currentTarget.style.opacity = '0.5'}
                          title="Apagar Colaborador"
                        >
                          <Trash2 size={16} />
                        </button>
                        
                        <div style={{ width: '60px', height: '60px', backgroundColor: 'var(--odoo-teal)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', fontSize: '24px', fontWeight: 'bold', flexShrink: 0 }}>
                          {emp.nome.charAt(0)}
                        </div>
                        
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                            <h4 style={{ margin: '0', color: 'var(--odoo-text-dark)', fontSize: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.nome}</h4>
                            <span style={{ fontSize: '11px', padding: '2px 6px', backgroundColor: emp.estado === 'Ativo' ? '#d4edda' : '#f8d7da', color: emp.estado === 'Ativo' ? '#155724' : '#721c24', borderRadius: '12px', flexShrink: 0, marginLeft: '8px' }}>
                              {emp.estado}
                            </span>
                          </div>
                          
                          <div style={{ color: 'var(--odoo-text-muted)', fontSize: '13px', marginBottom: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <Briefcase size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }}/>
                            {emp.cargo}
                          </div>

                          <div style={{ color: 'var(--odoo-text-muted)', fontSize: '12px', marginBottom: '8px' }}>
                            <Calendar size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }}/>
                            Fim de Contrato: <strong>{emp.data_fim || 'Sem Termo'}</strong>
                          </div>

                          {(emp.validade_documento || emp.validade_carta_conducao) && (
                            <div style={{ fontSize: '11px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {emp.validade_documento && (() => {
                                const days = Math.ceil((new Date(emp.validade_documento).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                                if (days < 0) return <span style={{ color: '#dc3545', fontWeight: 'bold' }}><AlertTriangle size={12}/> BI/Passaporte Caducado ({Math.abs(days)} dias)</span>;
                                if (days <= 30) return <span style={{ color: '#ffc107', fontWeight: 'bold' }}><AlertTriangle size={12}/> BI expira em {days} dias</span>;
                                return <span style={{ color: '#28a745' }}><CheckCircle size={12}/> BI Validade: {emp.validade_documento}</span>;
                              })()}
                              {emp.validade_carta_conducao && (() => {
                                const days = Math.ceil((new Date(emp.validade_carta_conducao).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                                if (days < 0) return <span style={{ color: '#dc3545', fontWeight: 'bold' }}><AlertTriangle size={12}/> Carta Condução Caducada</span>;
                                if (days <= 30) return <span style={{ color: '#ffc107', fontWeight: 'bold' }}><AlertTriangle size={12}/> Carta Condução expira em {days} dias</span>;
                                return <span style={{ color: '#28a745' }}><CheckCircle size={12}/> Carta Condução: {emp.validade_carta_conducao}</span>;
                              })()}
                            </div>
                          )}

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', borderTop: '1px solid var(--odoo-border)', paddingTop: '12px' }}>
                            <button 
                              className="odoo-btn" 
                              style={{ fontSize: '11px', padding: '4px 8px', color: 'var(--odoo-purple)', border: '1px solid var(--odoo-purple)', backgroundColor: 'transparent' }}
                              onClick={() => openDossier(emp.id)}
                            >
                              <FileText size={14} style={{ marginRight: 4 }}/> DOSSIER
                            </button>
                            <button 
                              className="odoo-btn" 
                              style={{ fontSize: '11px', padding: '4px 8px', backgroundColor: '#f0f4f8', color: 'var(--odoo-text-dark)' }}
                              onClick={(e) => { e.stopPropagation(); setEditEmployee(emp); setShowEditEmployeeModal(true); }}
                            >
                              <Edit2 size={14} style={{ marginRight: 4 }}/> EDITAR
                            </button>
                            <button 
                              className="odoo-btn" 
                              style={{ fontSize: '11px', padding: '4px 8px', color: 'var(--odoo-text-muted)', border: '1px solid var(--odoo-border)', backgroundColor: 'transparent' }}
                              onClick={() => handleGenerateDoc(emp.id)}
                              disabled={generatingDoc === emp.id}
                            >
                              {generatingDoc === emp.id ? 'A GERAR...' : 'DECLARAÇÃO'}
                            </button>
                            <button 
                              className="odoo-btn" 
                              style={{ fontSize: '11px', padding: '4px 8px', backgroundColor: 'transparent', border: '1px solid var(--odoo-border)', color: 'var(--odoo-text-muted)' }}
                              onClick={(e) => { e.stopPropagation(); handleOpenVacations(emp.id); }}
                            >
                              FÉRIAS
                            </button>
                          </div>

                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ backgroundColor: 'white', borderRadius: '4px', border: '1px solid var(--odoo-border)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                      <thead style={{ backgroundColor: '#f0f4f8', borderBottom: '2px solid var(--odoo-border)' }}>
                        <tr>
                          <th style={{ padding: '12px 16px', color: 'var(--odoo-text-dark)' }}>Nome</th>
                          <th style={{ padding: '12px 16px', color: 'var(--odoo-text-dark)' }}>Cargo</th>
                          <th style={{ padding: '12px 16px', color: 'var(--odoo-text-dark)' }}>Contrato</th>
                          <th style={{ padding: '12px 16px', color: 'var(--odoo-text-dark)' }}>Estado</th>
                          <th style={{ padding: '12px 16px', color: 'var(--odoo-text-dark)', textAlign: 'right' }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employees.map(emp => (
                          <tr key={emp.id} style={{ borderBottom: '1px solid var(--odoo-border)', cursor: 'pointer' }}>
                            <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--odoo-teal)' }}>{emp.nome}</td>
                            <td style={{ padding: '12px 16px', color: 'var(--odoo-text-muted)' }}>{emp.cargo}</td>
                            <td style={{ padding: '12px 16px', color: 'var(--odoo-text-muted)' }}>{emp.data_fim || 'Sem Termo'}</td>
                            <td style={{ padding: '12px 16px' }}>
                              <span style={{ fontSize: '11px', padding: '2px 6px', backgroundColor: emp.estado === 'Ativo' ? '#d4edda' : '#f8d7da', color: emp.estado === 'Ativo' ? '#155724' : '#721c24', borderRadius: '12px' }}>
                                {emp.estado}
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                               <button 
                                onClick={(e) => { e.stopPropagation(); openDossier(emp.id); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--odoo-teal)', opacity: 0.8 }}
                                title="Dossier Documental"
                               >
                                 <FileText size={16} />
                               </button>
                               <button 
                                onClick={(e) => { e.stopPropagation(); setEditEmployee(emp); setShowEditEmployeeModal(true); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--odoo-text-dark)', opacity: 0.8 }}
                                title="Editar Colaborador"
                               >
                                 <Edit2 size={16} />
                               </button>
                               <button 
                                onClick={() => handleGenerateDoc(emp.id)}
                                disabled={generatingDoc === emp.id}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--odoo-purple)', opacity: 0.8 }}
                                title="Gerar Declaração"
                               >
                                 <FileText size={16} />
                               </button>
                               <button 
                                onClick={() => deleteEmployee(emp.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', opacity: 0.8 }}
                                title="Apagar Colaborador"
                               >
                                 <Trash2 size={16} />
                               </button>
                              </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ================= DEPARTAMENTOS ================= */}
        {activeTab === 'departamentos' && (
          <div className="odoo-form-sheet" style={{ maxWidth: '1200px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', alignItems: 'center' }}>
              <h2 style={{ fontSize: '22px', color: 'var(--odoo-text-dark)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                Estrutura Organizacional
              </h2>
              <button className="odoo-btn odoo-btn-primary" onClick={() => setShowNewDepartamentoModal(true)}>
                + NOVO DEPARTAMENTO
              </button>
            </div>

            {loadingDepartamentos ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>A carregar departamentos...</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', alignItems: 'start' }}>
                {departamentos.map(d => (
                  <div key={d.id} style={{ backgroundColor: 'white', border: '1px solid var(--odoo-border)', borderRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '16px', position: 'relative' }}>
                    <button 
                      onClick={() => deleteDepartamento(d.id)}
                      style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', opacity: 0.5 }}
                      onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                      onMouseOut={(e) => e.currentTarget.style.opacity = '0.5'}
                      title="Apagar Departamento"
                    >
                      <Trash2 size={16} />
                    </button>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', paddingRight: '24px' }}>
                      <h4 style={{ margin: '0', color: 'var(--odoo-teal)', fontSize: '18px' }}>{d.nome}</h4>
                    </div>
                    <p style={{ color: 'var(--odoo-text-muted)', fontSize: '13px', marginBottom: '16px', minHeight: '38px' }}>
                      {d.descricao || 'Sem descrição.'}
                    </p>
                    <div style={{ borderTop: '1px solid var(--odoo-border)', paddingTop: '12px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--odoo-text-muted)' }}>Responsável:</span>
                        <strong style={{ color: 'var(--odoo-text-dark)' }}>{d.nome_gestor || 'Não atribuído'}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--odoo-text-muted)' }}>Orçamento Mensal:</span>
                        <strong style={{ color: 'var(--odoo-text-dark)' }}>{(d.orcamento_mensal || 0).toLocaleString()} Kz</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= PRESENÇAS ================= */}
        {activeTab === 'presencas' && (
          <div className="odoo-form-sheet" style={{ maxWidth: '1200px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', alignItems: 'center' }}>
              <h2 style={{ fontSize: '22px', color: 'var(--odoo-text-dark)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                Gestão de Faltas e Justificativas
              </h2>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button className="odoo-btn" onClick={handleDownloadAttendanceTemplate} style={{ border: '1px solid var(--odoo-border)' }}>
                  Baixar Template
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px dashed var(--odoo-border)', padding: '4px 8px', borderRadius: '4px' }}>
                  <input type="file" accept=".xlsx, .xls, .csv" onChange={(e) => setAttendanceBulkFile(e.target.files ? e.target.files[0] : null)} style={{ width: '150px', fontSize: '11px' }} />
                  <button 
                    className="odoo-btn odoo-btn-primary" 
                    onClick={handleProcessAttendance} 
                    disabled={!attendanceBulkFile || isProcessingAttendance}
                    style={{ padding: '6px 12px', fontSize: '12px', backgroundColor: !attendanceBulkFile ? '#ccc' : undefined }}
                  >
                    {isProcessingAttendance ? 'A LER...' : 'IMPORTAR PONTO'}
                  </button>
                </div>
                <button className="odoo-btn odoo-btn-primary" onClick={() => setShowNovaAusenciaModal(true)}>
                  + DECLARAR FALTA
                </button>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', backgroundColor: 'white', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--odoo-border)' }}>
              <thead style={{ backgroundColor: '#f0f4f8', borderBottom: '2px solid var(--odoo-border)' }}>
                <tr>
                  <th style={{ padding: '12px', color: 'var(--odoo-text-dark)' }}>Colaborador</th>
                  <th style={{ padding: '12px', color: 'var(--odoo-text-dark)' }}>Tipo</th>
                  <th style={{ padding: '12px', color: 'var(--odoo-text-dark)' }}>Data de Início</th>
                  <th style={{ padding: '12px', color: 'var(--odoo-text-dark)' }}>Data de Fim</th>
                  <th style={{ padding: '12px', color: 'var(--odoo-text-dark)' }}>Comprovativo</th>
                  <th style={{ padding: '12px', color: 'var(--odoo-text-dark)' }}>Estado RH</th>
                </tr>
              </thead>
              <tbody>
                {ausencias.map(aus => (
                  <tr key={aus.id} style={{ borderBottom: '1px solid var(--odoo-border)' }}>
                    <td style={{ padding: '12px', fontWeight: 500 }}>{aus.nome}</td>
                    <td style={{ padding: '12px' }}>{aus.tipo}</td>
                    <td style={{ padding: '12px' }}>{new Date(aus.data_inicio).toLocaleDateString('pt-PT')}</td>
                    <td style={{ padding: '12px' }}>{new Date(aus.data_fim).toLocaleDateString('pt-PT')}</td>
                    <td style={{ padding: '12px' }}>
                      {aus.comprovativo_path ? <span style={{ color: 'var(--odoo-teal)' }}>Anexo Enviado</span> : <span style={{ color: '#ccc' }}>Sem Anexo</span>}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {aus.estado_aprovacao === 'Pendente Chefia' && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="odoo-btn" style={{ padding: '2px 8px', fontSize: '11px', backgroundColor: '#fff3cd', color: '#856404', border: '1px solid #ffeeba' }}
                            onClick={async () => {
                              await fetch(`http://127.0.0.1:3001/api/hr/ausencias/${aus.id}/estado`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({estado: 'Pendente RH'})});
                              carregarAusencias();
                            }}
                          >Chefia: Aprovar</button>
                        </div>
                      )}
                      
                      {aus.estado_aprovacao === 'Pendente RH' && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="odoo-btn" style={{ padding: '2px 8px', fontSize: '11px', backgroundColor: '#d4edda', color: '#155724', border: '1px solid #c3e6cb' }}
                            onClick={async () => {
                              await fetch(`http://127.0.0.1:3001/api/hr/ausencias/${aus.id}/estado`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({estado: 'Justificada'})});
                              carregarAusencias();
                            }}
                          >RH: Validar Atestado</button>
                          
                          <button className="odoo-btn" style={{ padding: '2px 8px', fontSize: '11px', backgroundColor: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb' }}
                            onClick={async () => {
                              await fetch(`http://127.0.0.1:3001/api/hr/ausencias/${aus.id}/estado`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({estado: 'Rejeitada'})});
                              carregarAusencias();
                            }}
                          >Rejeitar (Injustificada)</button>
                        </div>
                      )}

                      {['Justificada', 'Injustificada', 'Rejeitada'].includes(aus.estado_aprovacao) && (
                        <span style={{ 
                          fontWeight: 'bold', 
                          padding: '4px 8px', borderRadius: '4px', fontSize: '11px',
                          backgroundColor: aus.estado_aprovacao === 'Justificada' ? '#d4edda' : '#f8d7da',
                          color: aus.estado_aprovacao === 'Justificada' ? '#155724' : '#721c24'
                        }}>
                          {aus.estado_aprovacao}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ================= RUBRICAS ================= */}
        {activeTab === 'rubricas' && (
          <div className="odoo-form-sheet" style={{ maxWidth: '1200px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '22px', color: 'var(--odoo-text-dark)', margin: 0 }}>
                  Rubricas Salariais & Tabelas de Imposto
                </h2>
                <p style={{ color: 'var(--odoo-text-muted)', margin: '4px 0 0 0', fontSize: '13px' }}>
                  Configuração de abonos, descontos e parâmetros fiscais (INSS e IRT).
                </p>
              </div>
              <button className="odoo-btn odoo-btn-primary" onClick={() => setShowNovaRubricaModal(true)}>
                + NOVA RUBRICA
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
              <div>
                <h3 style={{ fontSize: '16px', marginBottom: '16px', color: 'var(--odoo-teal)' }}>Rubricas Existentes</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: 'white', border: '1px solid var(--odoo-border)' }}>
                  <thead style={{ backgroundColor: '#f0f4f8', borderBottom: '2px solid var(--odoo-border)' }}>
                    <tr>
                      <th style={{ padding: '10px' }}>Cód</th>
                      <th style={{ padding: '10px' }}>Descrição</th>
                      <th style={{ padding: '10px' }}>Tipo</th>
                      <th style={{ padding: '10px', textAlign: 'center' }}>INSS</th>
                      <th style={{ padding: '10px', textAlign: 'center' }}>IRT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rubricas.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--odoo-border)' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold' }}>{r.codigo}</td>
                        <td style={{ padding: '10px' }}>{r.descricao}</td>
                        <td style={{ padding: '10px', color: r.tipo === 'Abono' ? 'green' : 'red' }}>{r.tipo}</td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>{r.incide_inss ? '✓' : '-'}</td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>{r.incide_irt ? '✓' : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 style={{ fontSize: '16px', marginBottom: '16px', color: 'var(--odoo-teal)' }}>Tabelas de Imposto (Escalões IRT)</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', backgroundColor: 'white', border: '1px solid var(--odoo-border)' }}>
                  <thead style={{ backgroundColor: '#f0f4f8', borderBottom: '2px solid var(--odoo-border)' }}>
                    <tr>
                      <th style={{ padding: '8px' }}>Até (AOA)</th>
                      <th style={{ padding: '8px' }}>Taxa (%)</th>
                      <th style={{ padding: '8px' }}>Parcela a Abater</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabelasImposto.filter(t => t.tipo === 'IRT_Angola').map(t => (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--odoo-border)' }}>
                        <td style={{ padding: '8px' }}>{Number(t.limite_superior) > 100000000 ? 'Ilimitado' : t.limite_superior.toLocaleString()}</td>
                        <td style={{ padding: '8px' }}>{(t.taxa * 100).toFixed(1)}%</td>
                        <td style={{ padding: '8px' }}>{t.parcela_abater.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h3 style={{ fontSize: '16px', marginBottom: '16px', marginTop: '24px', color: 'var(--odoo-teal)' }}>Taxas Contributivas (INSS)</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', backgroundColor: 'white', border: '1px solid var(--odoo-border)' }}>
                  <thead style={{ backgroundColor: '#f0f4f8', borderBottom: '2px solid var(--odoo-border)' }}>
                    <tr>
                      <th style={{ padding: '8px' }}>Tipo</th>
                      <th style={{ padding: '8px' }}>Taxa (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabelasImposto.filter(t => t.tipo.includes('INSS')).map(t => (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--odoo-border)' }}>
                        <td style={{ padding: '8px' }}>{t.tipo === 'INSS' ? 'INSS Trabalhador (Retenção)' : 'INSS Entidade (Encargo)'}</td>
                        <td style={{ padding: '8px' }}>{(t.taxa * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Nova Rubrica */}
            {showNovaRubricaModal && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '500px', padding: '24px' }}>
                  <h3 style={{ marginTop: 0, marginBottom: '24px' }}>Criar Rubrica Salarial</h3>
                  <form onSubmit={handleSaveRubrica}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '16px' }}>
                      <div className="odoo-form-group">
                        <label className="odoo-label">Código</label>
                        <input required className="odoo-input" placeholder="Ex: R01, D01" value={novaRubrica.codigo} onChange={e => setNovaRubrica({...novaRubrica, codigo: e.target.value})} />
                      </div>
                      <div className="odoo-form-group">
                        <label className="odoo-label">Descrição</label>
                        <input required className="odoo-input" value={novaRubrica.descricao} onChange={e => setNovaRubrica({...novaRubrica, descricao: e.target.value})} />
                      </div>
                    </div>
                    <div className="odoo-form-group" style={{ marginBottom: '16px' }}>
                      <label className="odoo-label">Tipo (Natureza)</label>
                      <select required className="odoo-input" value={novaRubrica.tipo} onChange={e => setNovaRubrica({...novaRubrica, tipo: e.target.value})}>
                        <option value="Abono">Abono (Receita)</option>
                        <option value="Desconto">Desconto (Dedução)</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                        <input type="checkbox" checked={novaRubrica.incide_inss} onChange={e => setNovaRubrica({...novaRubrica, incide_inss: e.target.checked})} />
                        Incide Segurança Social (INSS)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                        <input type="checkbox" checked={novaRubrica.incide_irt} onChange={e => setNovaRubrica({...novaRubrica, incide_irt: e.target.checked})} />
                        Incide IRT
                      </label>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                      <button type="button" className="odoo-btn" onClick={() => setShowNovaRubricaModal(false)}>Cancelar</button>
                      <button type="submit" className="odoo-btn odoo-btn-primary">Salvar Rubrica</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= SALÁRIOS LOTE ================= */}
        {activeTab === 'salarios' && (
          <div className="odoo-form-sheet" style={{ maxWidth: '1200px' }}>
            <h2 style={{ fontSize: '22px', color: 'var(--odoo-text-dark)', marginTop: 0, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Motor de Processamento Salarial (Angola)
            </h2>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '32px' }}>
              <div style={{ flex: 1, backgroundColor: '#f9f9f9', padding: '20px', borderRadius: '4px', border: '1px solid var(--odoo-border)' }}>
                <h4 style={{ margin: '0 0 16px 0', color: 'var(--odoo-text-dark)' }}>Processar Novo Mês</h4>
                
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                  <select 
                    className="odoo-input" 
                    id="mes-processamento"
                    defaultValue={new Date().getMonth() + 1}
                  >
                    <option value="1">Janeiro</option>
                    <option value="2">Fevereiro</option>
                    <option value="3">Março</option>
                    <option value="4">Abril</option>
                    <option value="5">Maio</option>
                    <option value="6">Junho</option>
                    <option value="7">Julho</option>
                    <option value="8">Agosto</option>
                    <option value="9">Setembro</option>
                    <option value="10">Outubro</option>
                    <option value="11">Novembro</option>
                    <option value="12">Dezembro</option>
                  </select>

                  <select 
                    className="odoo-input" 
                    id="ano-processamento"
                    defaultValue={new Date().getFullYear()}
                  >
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                    <option value="2027">2027</option>
                  </select>
                </div>

                <button 
                  className="odoo-btn odoo-btn-primary" 
                  onClick={async () => {
                    const mes = (document.getElementById('mes-processamento') as HTMLSelectElement).value;
                    const ano = (document.getElementById('ano-processamento') as HTMLSelectElement).value;
                    
                    setIsProcessingPayroll(true);
                    try {
                      const res = await fetch('http://127.0.0.1:3001/api/hr/processamento', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mes, ano })
                      });
                      const data = await res.json();
                      if (data.success) {
                        alert('Processamento concluído com sucesso!');
                        // Carregar os dados
                        const resGet = await fetch(`http://127.0.0.1:3001/api/hr/processamento/${mes}/${ano}`);
                        const getDados = await resGet.json();
                        setPayrollResults(getDados);
                      } else {
                        alert(data.error);
                      }
                    } catch(err) {
                      alert('Erro ao contactar o servidor.');
                    } finally {
                      setIsProcessingPayroll(false);
                    }
                  }}
                  disabled={isProcessingPayroll}
                  style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                >
                  {isProcessingPayroll ? 'A CALCULAR IMPOSTOS E INSS...' : 'PROCESSAR SALÁRIOS'}
                </button>
              </div>

              <div style={{ flex: 1, backgroundColor: '#f0f4f8', padding: '20px', borderRadius: '4px', border: '1px dashed var(--odoo-teal)' }}>
                <h4 style={{ margin: '0 0 12px 0', color: 'var(--odoo-teal)' }}>Consultar Processamento</h4>
                <p style={{ fontSize: '13px', color: 'var(--odoo-text-muted)', marginBottom: '16px' }}>
                  Consulte os recibos de vencimento gerados e os respetivos impostos aplicados.
                </p>
                <button 
                  className="odoo-btn" 
                  onClick={async () => {
                    const mes = (document.getElementById('mes-processamento') as HTMLSelectElement).value;
                    const ano = (document.getElementById('ano-processamento') as HTMLSelectElement).value;
                    
                    const res = await fetch(`http://127.0.0.1:3001/api/hr/processamento/${mes}/${ano}`);
                    const dados = await res.json();
                    if (dados.processamento) {
                      setPayrollResults(dados);
                    } else {
                      alert('Nenhum processamento encontrado para esta data.');
                      setPayrollResults(null);
                    }
                  }}
                  style={{ width: '100%' }}
                >
                  <Search size={16} style={{ marginRight: 6 }}/> CARREGAR DADOS DESTE MÊS
                </button>
              </div>
            </div>

            {/* Resultados Salariais */}
            {payrollResults && payrollResults.processamento && (
              <div style={{ borderTop: '1px solid var(--odoo-border)', paddingTop: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--odoo-teal)' }}>
                    <CheckCircle size={24} />
                    <h3 style={{ margin: 0 }}>
                      Mês {payrollResults.processamento.mes} / {payrollResults.processamento.ano}
                    </h3>
                  </div>
                  <div>
                    {payrollResults.processamento.estado === 'Rascunho' ? (
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <span style={{ backgroundColor: '#fff3cd', color: '#856404', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>RASCUNHO ABERTO (Editável)</span>
                        <button 
                          className="odoo-btn" 
                          style={{ backgroundColor: 'var(--odoo-teal)', color: 'white' }}
                          onClick={async () => {
                            if(confirm("Tem a certeza que quer fechar este mês? Os dados não poderão ser alterados após o fecho!")) {
                              await fetch(`http://127.0.0.1:3001/api/hr/processamento/${payrollResults.processamento.id}/fechar`, { method: 'POST' });
                              // Reload
                              const resGet = await fetch(`http://127.0.0.1:3001/api/hr/processamento/${payrollResults.processamento.mes}/${payrollResults.processamento.ano}`);
                              setPayrollResults(await resGet.json());
                            }
                          }}
                        >
                          <Lock size={16} style={{ marginRight: 6 }}/> APROVAR E FECHAR OFICIALMENTE
                        </button>
                      </div>
                    ) : (
                      <span style={{ backgroundColor: '#d4edda', color: '#155724', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>ESTADO: FECHADO E BLOQUEADO</span>
                    )}
                  </div>
                </div>
                
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', marginBottom: '24px' }}>
                  <thead style={{ backgroundColor: '#f0f4f8', borderBottom: '2px solid var(--odoo-border)' }}>
                    <tr>
                      <th style={{ padding: '12px', color: 'var(--odoo-text-dark)' }}>Colaborador</th>
                      <th style={{ padding: '12px', color: 'var(--odoo-text-dark)', textAlign: 'right' }}>Salário Base</th>
                      <th style={{ padding: '12px', color: 'var(--odoo-text-dark)', textAlign: 'right' }}>INSS (3%)</th>
                      <th style={{ padding: '12px', color: 'var(--odoo-text-dark)', textAlign: 'right' }}>IRT (Angola)</th>
                      <th style={{ padding: '12px', color: 'var(--odoo-text-dark)', textAlign: 'right' }}>Faltas</th>
                      <th style={{ padding: '12px', color: 'var(--odoo-text-dark)', textAlign: 'right' }}>Líquido a Receber</th>
                      <th style={{ padding: '12px', color: 'var(--odoo-text-dark)', textAlign: 'center' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrollResults.recibos.map((recibo: any) => (
                      <tr key={recibo.id} style={{ borderBottom: '1px solid var(--odoo-border)', backgroundColor: payrollResults.processamento.estado === 'Rascunho' ? '#fffbfa' : 'white' }}>
                        <td style={{ padding: '12px', fontWeight: 500 }}>{recibo.nome}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>{new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(recibo.salario_base)}</td>
                        <td style={{ padding: '12px', textAlign: 'right', color: '#dc3545' }}>-{new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(recibo.inss_trabalhador)}</td>
                        <td style={{ padding: '12px', textAlign: 'right', color: '#dc3545' }}>-{new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(recibo.irt)}</td>
                        <td style={{ padding: '12px', textAlign: 'right', color: '#dc3545' }}>-{new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(recibo.desconto_faltas || 0)}</td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: 'var(--odoo-teal)' }}>{new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(recibo.total_liquido)}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            {payrollResults.processamento.estado === 'Rascunho' && (
                              <button 
                                className="odoo-btn" 
                                style={{ fontSize: '11px', padding: '4px 8px', color: '#856404', border: '1px solid #856404', backgroundColor: 'transparent' }}
                                onClick={() => setEditingRecibo(recibo)}
                              >
                                <Edit2 size={12} style={{ marginRight: 4 }}/> EDITAR
                              </button>
                            )}
                            <button 
                              className="odoo-btn" 
                              style={{ fontSize: '11px', padding: '4px 8px', color: 'var(--odoo-purple)', border: '1px solid var(--odoo-purple)', backgroundColor: 'transparent' }}
                              onClick={async () => {
                                try {
                                  const r = await fetch(`http://127.0.0.1:3001/api/hr/recibo/${recibo.id}/pdf`);
                                  const d = await r.json();
                                  if(d.success) alert('Recibo Gerado:\n' + d.pdf_path);
                                  else alert('Erro ao gerar pdf');
                                } catch(e) { alert('Erro'); }
                              }}
                            >
                              <FileText size={12} style={{ marginRight: 4 }}/> PDF RECIBO
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}


        {/* ================= MODAL NOVO COLABORADOR ================= */}
        {showNewEmployeeModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '800px', maxWidth: '95%', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--odoo-border)', paddingBottom: '12px' }}>Registar Novo Colaborador (Ficha Completa)</h3>
              
              <form onSubmit={handleSaveEmployee}>
                
                {/* 1. DADOS PESSOAIS */}
                <h4 style={{ color: 'var(--odoo-teal)', marginBottom: '12px' }}>1. Dados Pessoais & Contactos</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Nome Completo *</label>
                    <input required type="text" className="odoo-input" value={newEmployee.nome} onChange={e => setNewEmployee({...newEmployee, nome: e.target.value})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Data de Nascimento</label>
                    <input type="date" className="odoo-input" value={newEmployee.data_nascimento} onChange={e => setNewEmployee({...newEmployee, data_nascimento: e.target.value})} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Género</label>
                    <select className="odoo-input" value={newEmployee.genero} onChange={e => setNewEmployee({...newEmployee, genero: e.target.value})}>
                      <option value="Masculino">Masculino</option>
                      <option value="Feminino">Feminino</option>
                    </select>
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Estado Civil</label>
                    <select className="odoo-input" value={newEmployee.estado_civil} onChange={e => setNewEmployee({...newEmployee, estado_civil: e.target.value})}>
                      <option value="Solteiro(a)">Solteiro(a)</option>
                      <option value="Casado(a)">Casado(a)</option>
                      <option value="Divorciado(a)">Divorciado(a)</option>
                      <option value="Viúvo(a)">Viúvo(a)</option>
                    </select>
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">N.º Dependentes</label>
                    <input type="number" min="0" className="odoo-input" value={newEmployee.numero_dependentes} onChange={e => setNewEmployee({...newEmployee, numero_dependentes: parseInt(e.target.value) || 0})} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Telefone</label>
                    <input type="text" className="odoo-input" value={newEmployee.telefone} onChange={e => setNewEmployee({...newEmployee, telefone: e.target.value})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Email Pessoal</label>
                    <input type="email" className="odoo-input" value={newEmployee.email} onChange={e => setNewEmployee({...newEmployee, email: e.target.value})} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Morada / Endereço</label>
                    <input type="text" className="odoo-input" value={newEmployee.endereco} onChange={e => setNewEmployee({...newEmployee, endereco: e.target.value})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Contacto de Emergência (Nome/Tel)</label>
                    <input type="text" className="odoo-input" value={newEmployee.contato_emergencia} onChange={e => setNewEmployee({...newEmployee, contato_emergencia: e.target.value})} />
                  </div>
                </div>

                {/* 2. DOCUMENTAÇÃO */}
                <h4 style={{ color: 'var(--odoo-teal)', marginBottom: '12px', marginTop: '24px' }}>2. Documentação & Fiscalidade</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">BI / Passaporte *</label>
                    <input required type="text" className="odoo-input" value={newEmployee.bi} onChange={e => setNewEmployee({...newEmployee, bi: e.target.value})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">NIF *</label>
                    <input required type="text" className="odoo-input" value={newEmployee.nif} onChange={e => setNewEmployee({...newEmployee, nif: e.target.value})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">NISS *</label>
                    <input required type="text" className="odoo-input" value={newEmployee.niss} onChange={e => setNewEmployee({...newEmployee, niss: e.target.value})} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Data de Emissão do BI / Passaporte</label>
                    <input type="date" className="odoo-input" value={newEmployee.data_emissao_documento} onChange={e => setNewEmployee({...newEmployee, data_emissao_documento: e.target.value})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Data de Validade do BI / Passaporte</label>
                    <input type="date" className="odoo-input" value={newEmployee.validade_documento} onChange={e => setNewEmployee({...newEmployee, validade_documento: e.target.value})} />
                  </div>
                </div>

                {newEmployee.cargo?.toLowerCase().includes('motorista') && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px', backgroundColor: '#fff3cd', padding: '12px', borderRadius: '4px', border: '1px solid #ffe69c' }}>
                    <div className="odoo-form-group" style={{ marginBottom: 0 }}>
                      <label className="odoo-label">Data de Emissão da Carta de Condução</label>
                      <input type="date" className="odoo-input" value={newEmployee.data_emissao_carta_conducao} onChange={e => setNewEmployee({...newEmployee, data_emissao_carta_conducao: e.target.value})} />
                    </div>
                    <div className="odoo-form-group" style={{ marginBottom: 0 }}>
                      <label className="odoo-label">Data de Validade da Carta de Condução</label>
                      <input type="date" className="odoo-input" value={newEmployee.validade_carta_conducao} onChange={e => setNewEmployee({...newEmployee, validade_carta_conducao: e.target.value})} />
                    </div>
                  </div>
                )}

                {/* 3. DADOS PROFISSIONAIS */}
                <h4 style={{ color: 'var(--odoo-teal)', marginBottom: '12px', marginTop: '24px' }}>3. Perfil Profissional & Contrato</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Departamento</label>
                    <select className="odoo-input" value={newEmployee.departamento_id} onChange={e => setNewEmployee({...newEmployee, departamento_id: e.target.value})}>
                      <option value="">(Nenhum)</option>
                      {departamentos.map((d: any) => (
                        <option key={d.id} value={d.id}>{d.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Cargo Profissional *</label>
                    <input required type="text" className="odoo-input" value={newEmployee.cargo} onChange={e => setNewEmployee({...newEmployee, cargo: e.target.value})} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Tipo de Contrato *</label>
                    <select className="odoo-input" value={newEmployee.tipo_contrato} onChange={e => setNewEmployee({...newEmployee, tipo_contrato: e.target.value})}>
                      <option value="Tempo Indeterminado">Sem Termo (Efetivo)</option>
                      <option value="Tempo Determinado">A Termo Certo</option>
                    </select>
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Data Admissão (Início) *</label>
                    <input required type="date" className="odoo-input" value={newEmployee.data_inicio} onChange={e => setNewEmployee({...newEmployee, data_inicio: e.target.value})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Fim (se aplicável)</label>
                    <input type="date" className="odoo-input" disabled={newEmployee.tipo_contrato !== 'Tempo Determinado'} value={newEmployee.data_fim} onChange={e => setNewEmployee({...newEmployee, data_fim: e.target.value})} />
                  </div>
                </div>

                {/* 4. DADOS SALARIAIS */}
                <h4 style={{ color: 'var(--odoo-teal)', marginBottom: '12px', marginTop: '24px' }}>4. Dados Salariais & Bancários</h4>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Salário Base (AOA) *</label>
                    <input required type="number" step="1000" className="odoo-input" value={newEmployee.salario_base} onChange={e => setNewEmployee({...newEmployee, salario_base: e.target.value})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Sub. Alimentação Fixo (AOA)</label>
                    <input type="number" step="1000" className="odoo-input" value={newEmployee.sub_alimentacao_contrato} onChange={e => setNewEmployee({...newEmployee, sub_alimentacao_contrato: parseInt(e.target.value) || 0})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Sub. Transporte Fixo (AOA)</label>
                    <input type="number" step="1000" className="odoo-input" value={newEmployee.sub_transporte_contrato} onChange={e => setNewEmployee({...newEmployee, sub_transporte_contrato: parseInt(e.target.value) || 0})} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Banco Domiciliação</label>
                    <input type="text" className="odoo-input" placeholder="Ex: BAI, BFA, BIC..." value={newEmployee.banco} onChange={e => setNewEmployee({...newEmployee, banco: e.target.value})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">IBAN (Conta Bancária)</label>
                    <input type="text" className="odoo-input" value={newEmployee.iban} onChange={e => setNewEmployee({...newEmployee, iban: e.target.value})} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--odoo-border)', paddingTop: '16px' }}>
                  <button type="button" className="odoo-btn" onClick={() => setShowNewEmployeeModal(false)} disabled={isSavingEmployee}>
                    Cancelar
                  </button>
                  <button type="submit" className="odoo-btn odoo-btn-primary" disabled={isSavingEmployee}>
                    {isSavingEmployee ? 'A Gravar...' : 'Gravar Colaborador'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================= MODAL NOVA AUSENCIA ================= */}
        {showNovaAusenciaModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '500px', maxWidth: '90%', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--odoo-border)', paddingBottom: '12px' }}>Declarar Falta / Ausência</h3>
              
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData();
                formData.append('colaborador_id', novaAusencia.colaborador_id);
                formData.append('tipo', novaAusencia.tipo);
                formData.append('data_inicio', novaAusencia.data_inicio);
                formData.append('data_fim', novaAusencia.data_fim);
                formData.append('justificada', novaAusencia.justificada);
                if (ausenciaFile) formData.append('comprovativo', ausenciaFile);

                const res = await fetch('http://127.0.0.1:3001/api/hr/ausencias', { method: 'POST', body: formData });
                const d = await res.json();
                if(d.success) {
                  setShowNovaAusenciaModal(false);
                  setNovaAusencia({ colaborador_id: '', tipo: 'Falta Injustificada', data_inicio: '', data_fim: '', justificada: 'false' });
                  setAusenciaFile(null);
                  carregarAusencias();
                } else alert('Erro: ' + d.error);
              }}>
                <div className="odoo-form-group" style={{ marginBottom: '16px' }}>
                  <label className="odoo-label">Colaborador *</label>
                  <select required className="odoo-input" value={novaAusencia.colaborador_id} onChange={e => setNovaAusencia({...novaAusencia, colaborador_id: e.target.value})}>
                    <option value="">Selecione...</option>
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.nome}</option>)}
                  </select>
                </div>

                <div className="odoo-form-group" style={{ marginBottom: '16px' }}>
                  <label className="odoo-label">Tipo de Ausência *</label>
                  <select className="odoo-input" value={novaAusencia.tipo} onChange={e => setNovaAusencia({...novaAusencia, tipo: e.target.value})}>
                    <option value="Falta Injustificada">Falta Injustificada</option>
                    <option value="Falta Justificada (Médico)">Falta Justificada (Médico)</option>
                    <option value="Licença Maternidade/Paternidade">Licença</option>
                    <option value="Férias">Férias</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Data de Início *</label>
                    <input required type="date" className="odoo-input" value={novaAusencia.data_inicio} onChange={e => setNovaAusencia({...novaAusencia, data_inicio: e.target.value})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Data de Fim *</label>
                    <input required type="date" className="odoo-input" value={novaAusencia.data_fim} onChange={e => setNovaAusencia({...novaAusencia, data_fim: e.target.value})} />
                  </div>
                </div>

                <div className="odoo-form-group" style={{ marginBottom: '16px' }}>
                  <label className="odoo-label">Foto / PDF do Comprovativo Médico (Opcional)</label>
                  <input type="file" accept="image/*, .pdf" className="odoo-input" onChange={e => {
                    if (e.target.files) setAusenciaFile(e.target.files[0]);
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--odoo-border)', paddingTop: '16px' }}>
                  <button type="button" className="odoo-btn" onClick={() => setShowNovaAusenciaModal(false)}>Cancelar</button>
                  <button type="submit" className="odoo-btn odoo-btn-primary">Gravar Registo</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================= MODAL EDITAR RECIBO (RASCUNHO) ================= */}
        {editingRecibo && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '500px', maxWidth: '90%', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--odoo-border)', paddingBottom: '12px' }}>
                Editar Valores: {editingRecibo.nome}
              </h3>
              
              <form onSubmit={async (e) => {
                e.preventDefault();
                const res = await fetch(`http://127.0.0.1:3001/api/hr/recibo/${editingRecibo.id}`, { 
                  method: 'PUT', 
                  headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify(editingRecibo)
                });
                const d = await res.json();
                if(d.success) {
                  setEditingRecibo(null);
                  const resGet = await fetch(`http://127.0.0.1:3001/api/hr/processamento/${payrollResults.processamento.mes}/${payrollResults.processamento.ano}`);
                  setPayrollResults(await resGet.json());
                } else alert('Erro: ' + d.error);
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Faltas (Dias)</label>
                    <input type="number" className="odoo-input" value={editingRecibo.faltas_dias} onChange={e => setEditingRecibo({...editingRecibo, faltas_dias: Number(e.target.value)})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Faltas (Desconto em AOA)</label>
                    <input type="number" className="odoo-input" value={editingRecibo.desconto_faltas} onChange={e => setEditingRecibo({...editingRecibo, desconto_faltas: Number(e.target.value)})} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Sub. Alimentação (AOA)</label>
                    <input type="number" className="odoo-input" value={editingRecibo.subsidio_alimentacao} onChange={e => setEditingRecibo({...editingRecibo, subsidio_alimentacao: Number(e.target.value)})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Sub. Transporte (AOA)</label>
                    <input type="number" className="odoo-input" value={editingRecibo.subsidio_transporte} onChange={e => setEditingRecibo({...editingRecibo, subsidio_transporte: Number(e.target.value)})} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Outros Abonos (Prémio)</label>
                    <input type="number" className="odoo-input" value={editingRecibo.outros_abonos} onChange={e => setEditingRecibo({...editingRecibo, outros_abonos: Number(e.target.value)})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Outros Descontos</label>
                    <input type="number" className="odoo-input" value={editingRecibo.outros_descontos} onChange={e => setEditingRecibo({...editingRecibo, outros_descontos: Number(e.target.value)})} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label" style={{ color: 'var(--odoo-purple)' }}>Forçar IRT (AOA)</label>
                    <input type="number" className="odoo-input" value={editingRecibo.irt} onChange={e => setEditingRecibo({...editingRecibo, irt: Number(e.target.value)})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label" style={{ color: 'var(--odoo-purple)' }}>Forçar INSS Trabalhador (AOA)</label>
                    <input type="number" className="odoo-input" value={editingRecibo.inss_trabalhador} onChange={e => setEditingRecibo({...editingRecibo, inss_trabalhador: Number(e.target.value)})} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--odoo-border)', paddingTop: '16px' }}>
                  <button type="button" className="odoo-btn" onClick={() => setEditingRecibo(null)}>Cancelar</button>
                  <button type="submit" className="odoo-btn odoo-btn-primary">Gravar Ajuste Manual</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================= MODAL NOVO DEPARTAMENTO ================= */}
        {showNewDepartamentoModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '500px', maxWidth: '90%', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--odoo-border)', paddingBottom: '12px' }}>Criar Novo Departamento</h3>
              
              <form onSubmit={handleSaveDepartamento}>
                <div className="odoo-form-group" style={{ marginBottom: '16px' }}>
                  <label className="odoo-label">Nome do Departamento *</label>
                  <input required type="text" className="odoo-input" value={newDepartamento.nome} onChange={e => setNewDepartamento({...newDepartamento, nome: e.target.value})} />
                </div>
                
                <div className="odoo-form-group" style={{ marginBottom: '16px' }}>
                  <label className="odoo-label">Descrição</label>
                  <textarea className="odoo-input" rows={3} value={newDepartamento.descricao} onChange={e => setNewDepartamento({...newDepartamento, descricao: e.target.value})} />
                </div>

                <div className="odoo-form-group" style={{ marginBottom: '16px' }}>
                  <label className="odoo-label">Responsável (Gestor)</label>
                  <select className="odoo-input" value={newDepartamento.gestor_id} onChange={e => setNewDepartamento({...newDepartamento, gestor_id: e.target.value})}>
                    <option value="">Nenhum (Pendente)</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.nome}</option>
                    ))}
                  </select>
                </div>

                <div className="odoo-form-group" style={{ marginBottom: '24px' }}>
                  <label className="odoo-label">Orçamento Mensal (AOA)</label>
                  <input type="number" step="1000" className="odoo-input" value={newDepartamento.orcamento_mensal} onChange={e => setNewDepartamento({...newDepartamento, orcamento_mensal: e.target.value})} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--odoo-border)', paddingTop: '16px' }}>
                  <button type="button" className="odoo-btn" onClick={() => setShowNewDepartamentoModal(false)}>Cancelar</button>
                  <button type="submit" className="odoo-btn odoo-btn-primary">Criar Departamento</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================= ADIANTAMENTOS ================= */}
        {activeTab === 'adiantamentos' && (
          <div className="odoo-form-sheet" style={{ maxWidth: '1100px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '22px', color: 'var(--odoo-text-dark)', margin: '0 0 4px 0' }}>Adiantamentos Salariais (Vales)</h2>
                <p style={{ fontSize: '13px', color: 'var(--odoo-text-muted)', margin: 0 }}>O desconto é automático e faseado em cada processamento mensal.</p>
              </div>
              <button className="odoo-btn odoo-btn-primary" onClick={() => setShowNovoAdiantamentoModal(true)}>
                + NOVO ADIANTAMENTO
              </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: 'white', border: '1px solid var(--odoo-border)', borderRadius: '4px', overflow: 'hidden' }}>
              <thead style={{ backgroundColor: '#f0f4f8', borderBottom: '2px solid var(--odoo-border)' }}>
                <tr>
                  <th style={{ padding: '12px', color: 'var(--odoo-text-dark)', textAlign: 'left' }}>Colaborador</th>
                  <th style={{ padding: '12px', color: 'var(--odoo-text-dark)', textAlign: 'right' }}>Valor Total</th>
                  <th style={{ padding: '12px', color: 'var(--odoo-text-dark)', textAlign: 'right' }}>Parcela / Mês</th>
                  <th style={{ padding: '12px', color: 'var(--odoo-text-dark)', textAlign: 'center' }}>Progresso</th>
                  <th style={{ padding: '12px', color: 'var(--odoo-text-dark)', textAlign: 'center' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {adiantamentos.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--odoo-text-muted)' }}>Sem adiantamentos registados.</td></tr>
                ) : adiantamentos.map(ad => (
                  <tr key={ad.id} style={{ borderBottom: '1px solid var(--odoo-border)' }}>
                    <td style={{ padding: '12px', fontWeight: 500 }}>{ad.nome}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: '#721c24' }}>
                      {Number(ad.valor_total).toLocaleString('pt-AO')} Kz
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {Number(ad.valor_por_parcela).toLocaleString('pt-AO')} Kz
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '8px', backgroundColor: '#e9ecef', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ 
                            height: '100%', borderRadius: '4px',
                            width: `${Math.round((ad.parcelas_pagas / ad.parcelas_mensais) * 100)}%`,
                            backgroundColor: ad.estado === 'Liquidado' ? '#28a745' : 'var(--odoo-teal)'
                          }} />
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--odoo-text-muted)', whiteSpace: 'nowrap' }}>
                          {ad.parcelas_pagas}/{ad.parcelas_mensais} parcelas
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{
                        padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                        backgroundColor: ad.estado === 'Liquidado' ? '#d4edda' : '#fff3cd',
                        color: ad.estado === 'Liquidado' ? '#155724' : '#856404'
                      }}>
                        {ad.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ================= DESEMPENHO ================= */}
        {activeTab === 'desempenho' && (
          <div className="odoo-form-sheet" style={{ maxWidth: '1100px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '22px', color: 'var(--odoo-text-dark)', margin: '0 0 4px 0' }}>Avaliações de Desempenho</h2>
                <p style={{ fontSize: '13px', color: 'var(--odoo-text-muted)', margin: 0 }}>Avaliação por escala de 1 a 5 estrelas. Historial de evolução por colaborador.</p>
              </div>
              <button className="odoo-btn odoo-btn-primary" onClick={() => setShowNovaAvaliacaoModal(true)}>
                + NOVA AVALIAÇÃO
              </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', backgroundColor: 'white', border: '1px solid var(--odoo-border)', borderRadius: '4px', overflow: 'hidden' }}>
              <thead style={{ backgroundColor: '#f0f4f8', borderBottom: '2px solid var(--odoo-border)' }}>
                <tr>
                  <th style={{ padding: '12px', color: 'var(--odoo-text-dark)', textAlign: 'left' }}>Colaborador Avaliado</th>
                  <th style={{ padding: '12px', color: 'var(--odoo-text-dark)', textAlign: 'left' }}>Avaliador</th>
                  <th style={{ padding: '12px', color: 'var(--odoo-text-dark)', textAlign: 'center' }}>Nota</th>
                  <th style={{ padding: '12px', color: 'var(--odoo-text-dark)', textAlign: 'left' }}>Comentários</th>
                  <th style={{ padding: '12px', color: 'var(--odoo-text-dark)', textAlign: 'center' }}>Data</th>
                </tr>
              </thead>
              <tbody>
                {avaliacoes.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--odoo-text-muted)' }}>Sem avaliações registadas.</td></tr>
                ) : avaliacoes.map(av => (
                  <tr key={av.id} style={{ borderBottom: '1px solid var(--odoo-border)' }}>
                    <td style={{ padding: '12px', fontWeight: 500 }}>{av.avaliado_nome}</td>
                    <td style={{ padding: '12px', color: 'var(--odoo-text-muted)' }}>{av.avaliador_nome || 'RH'}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '2px' }}>
                        {[1,2,3,4,5].map(star => (
                          <span key={star} style={{ color: star <= av.pontuacao ? '#ffc107' : '#dee2e6' }}><Star size={18} fill={star <= av.pontuacao ? '#ffc107' : 'transparent'} strokeWidth={1.5} /></span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--odoo-text-muted)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {av.comentarios || '—'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center', color: 'var(--odoo-text-muted)' }}>
                      {av.data_avaliacao ? new Date(av.data_avaliacao).toLocaleDateString('pt-PT') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}


        {/* ================= RECRUTAMENTO E TRIAGEM (IA) ================= */}
        {activeTab === 'recrutamento' && (
          <div className="odoo-form-sheet" style={{ maxWidth: '1200px' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '22px', color: 'var(--odoo-text-dark)', margin: '0 0 4px 0' }}>Triagem de Candidatos (IA)</h2>
                <p style={{ fontSize: '13px', color: 'var(--odoo-text-muted)', margin: 0 }}>Submeta o CV em PDF. A Inteligência Artificial avalia os candidatos mediante os Critérios da Vaga.</p>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="odoo-btn" onClick={() => setShowNovaVagaModal(true)}>
                  + CRIAR VAGA
                </button>
                <button className="odoo-btn odoo-btn-primary" onClick={() => setShowNovaCandidaturaModal(true)}>
                  + SUBMETER CV
                </button>
              </div>
            </div>

            {/* --- Importação em Massa via Excel --- */}
            <div style={{ marginBottom: '32px', padding: '20px', border: '1px dashed var(--odoo-border)', borderRadius: '8px', backgroundColor: '#f8f9fc' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', color: 'var(--odoo-text-dark)', display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={18} /> Importar Candidatos em Massa (Excel)</h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: 'var(--odoo-text-muted)' }}>
                Ideal para feiras de emprego, candidaturas espontâneas em massa ou exportações de LinkedIn. Os candidatos são criados no Pipeline de CRM com fase "Nova Lead".
              </p>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="odoo-btn" onClick={() => window.location.href='http://127.0.0.1:3001/api/hr/candidates-template'} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Download size={14} /> Baixar Template
                </button>
                <input type="file" accept=".xlsx,.xls" style={{ fontSize: '12px' }} onChange={e => setCandidateBulkFile(e.target.files?.[0] || null)} />
                <button
                  className="odoo-btn odoo-btn-primary"
                  onClick={handleImportCandidates}
                  disabled={!candidateBulkFile || isImportingCandidates}
                  style={{ backgroundColor: !candidateBulkFile ? '#ccc' : undefined, display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  {isImportingCandidates ? 'A IMPORTAR...' : <><Upload size={14} /> IMPORTAR CANDIDATOS</>}
                </button>
              </div>
              {candidateBulkResult && (
                <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '6px', backgroundColor: candidateBulkResult.total_erros > 0 ? '#fff9e6' : '#f0fff4', border: '1px solid', borderColor: candidateBulkResult.total_erros > 0 ? '#ffc107' : '#28a745' }}>
                  <strong>{candidateBulkResult.resumo}</strong>
                  {candidateBulkResult.erros?.length > 0 && (
                    <details style={{ marginTop: '6px', fontSize: '12px' }}>
                      <summary style={{ cursor: 'pointer' }}>Ver {candidateBulkResult.erros.length} erro(s)</summary>
                      <ul>{candidateBulkResult.erros.map((e: any, i: number) => <li key={i} style={{ color: '#721c24' }}>Linha {e.linha}: {e.motivo}</li>)}</ul>
                    </details>
                  )}
                  <button onClick={() => setCandidateBulkResult(null)} style={{ fontSize: '11px', background: 'none', border: 'none', cursor: 'pointer', color: '#666', marginTop: '4px' }}>✕ Fechar</button>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
              {/* Lado Esquerdo: Vagas */}
              <div>
                <h3 style={{ fontSize: '15px', color: 'var(--odoo-text-dark)', marginBottom: '16px' }}>Vagas Abertas</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {vagas.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#f8f9fa', border: '1px dashed #ced4da', borderRadius: '6px', fontSize: '13px', color: 'var(--odoo-text-muted)' }}>
                      Nenhuma vaga aberta. Crie uma para começar a receber candidaturas.
                    </div>
                  ) : vagas.map(v => (
                    <div key={v.id} style={{ padding: '16px', backgroundColor: 'white', border: '1px solid var(--odoo-border)', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                      <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--odoo-teal)', marginBottom: '8px' }}>{v.titulo}</div>
                      <div style={{ fontSize: '12px', color: 'var(--odoo-text-dark)', backgroundColor: '#f0f4f8', padding: '8px', borderRadius: '4px' }}>
                        <strong>Critérios:</strong><br/> {v.criterios}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lado Direito: Candidaturas */}
              <div>
                <h3 style={{ fontSize: '15px', color: 'var(--odoo-text-dark)', marginBottom: '16px' }}>Candidaturas Recentes</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {candidaturas.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f8f9fa', border: '1px dashed #ced4da', borderRadius: '6px', fontSize: '13px', color: 'var(--odoo-text-muted)' }}>
                      Sem candidaturas para mostrar. Submeta um CV para a IA analisar.
                    </div>
                  ) : candidaturas.map(c => {
                    let parecer: any = {};
                    try {
                      parecer = JSON.parse(c.ai_parecer || '{}');
                    } catch(e) {
                      console.error("JSON parse error on ai_parecer", e);
                    }
                    return (
                      <div key={c.id} style={{ padding: '16px', backgroundColor: 'white', border: '1px solid var(--odoo-border)', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--odoo-text-dark)' }}>{c.nome}</div>
                            <div style={{ fontSize: '12px', color: 'var(--odoo-text-muted)' }}>{c.email} | {c.telefone}</div>
                            <div style={{ fontSize: '12px', color: 'var(--odoo-teal)', marginTop: '4px', fontWeight: 500 }}>Vaga: {c.vaga_titulo}</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ fontSize: '24px', fontWeight: 700, color: c.ai_score >= 70 ? '#28a745' : c.ai_score >= 40 ? '#fd7e14' : '#dc3545' }}>
                              {c.ai_score}/100
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--odoo-text-muted)', textTransform: 'uppercase' }}>Fit Score (IA)</div>
                          </div>
                        </div>

                        {Array.isArray(parecer.pontos_fortes) && parecer.pontos_fortes.length > 0 && (
                          <div style={{ marginTop: '12px', fontSize: '13px' }}>
                            <strong style={{ color: '#28a745' }}>Pontos Fortes:</strong>
                            <ul style={{ margin: '4px 0 0 16px', padding: 0, color: 'var(--odoo-text-dark)' }}>
                              {parecer.pontos_fortes.map((p: string, i: number) => <li key={i}>{p}</li>)}
                            </ul>
                          </div>
                        )}
                        {Array.isArray(parecer.pontos_fracos) && parecer.pontos_fracos.length > 0 && (
                          <div style={{ marginTop: '12px', fontSize: '13px' }}>
                            <strong style={{ color: '#dc3545' }}>Pontos Fracos / Faltas:</strong>
                            <ul style={{ margin: '4px 0 0 16px', padding: 0, color: 'var(--odoo-text-dark)' }}>
                              {parecer.pontos_fracos.map((p: string, i: number) => <li key={i}>{p}</li>)}
                            </ul>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--odoo-border)' }}>
                          <div>
                            {c.estado === 'Pendente' ? (
                              <span style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: '#fff3cd', color: '#856404', borderRadius: '4px', fontWeight: 500 }}>Pendente Decisão</span>
                            ) : c.estado === 'Aprovado' ? (
                              <span style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '4px', fontWeight: 500 }}>Aprovado</span>
                            ) : (
                              <span style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '4px', fontWeight: 500 }}>Rejeitado</span>
                            )}
                          </div>
                          
                          {c.estado === 'Pendente' && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => handleDecisaoCandidatura(c.id, 'Rejeitado')} className="odoo-btn" style={{ fontSize: '12px', padding: '4px 12px', color: '#dc3545', borderColor: '#dc3545' }}>Rejeitar</button>
                              <button onClick={() => handleDecisaoCandidatura(c.id, 'Aprovado')} className="odoo-btn" style={{ fontSize: '12px', padding: '4px 12px', backgroundColor: '#28a745', color: 'white', border: 'none' }}>Aprovar (Avançar)</button>
                            </div>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ================= MODAL NOVA VAGA ================= */}
        {showNovaVagaModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '500px', maxWidth: '90%', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--odoo-border)', paddingBottom: '12px' }}>Criar Nova Vaga</h3>
              <form onSubmit={handleCreateVaga}>
                <div className="odoo-form-group" style={{ marginBottom: '16px' }}>
                  <label className="odoo-label">Título da Vaga *</label>
                  <input required type="text" className="odoo-input" placeholder="Ex: Desenvolvedor Frontend React" value={novaVaga.titulo} onChange={e => setNovaVaga({...novaVaga, titulo: e.target.value})} />
                </div>
                <div className="odoo-form-group" style={{ marginBottom: '24px' }}>
                  <label className="odoo-label">Critérios de Avaliação (Para a IA) *</label>
                  <textarea required className="odoo-input" rows={6} placeholder="Ex: Tem de ter no mínimo 3 anos de experiência em React. É obrigatório saber Inglês. Valoriza-se conhecimento de NodeJS." value={novaVaga.criterios} onChange={e => setNovaVaga({...novaVaga, criterios: e.target.value})} />
                  <div style={{ fontSize: '11px', color: 'var(--odoo-text-muted)', marginTop: '4px' }}>
                    Estes critérios serão lidos pela IA para atribuir um Fit Score ao CV do candidato.
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--odoo-border)', paddingTop: '16px' }}>
                  <button type="button" className="odoo-btn" onClick={() => setShowNovaVagaModal(false)}>Cancelar</button>
                  <button type="submit" className="odoo-btn odoo-btn-primary">Criar Vaga</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================= MODAL SUBMETER CV ================= */}
        {showNovaCandidaturaModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '500px', maxWidth: '90%', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--odoo-border)', paddingBottom: '12px' }}>Submeter Candidatura (Triagem IA)</h3>
              <form onSubmit={handleUploadCv}>
                <div className="odoo-form-group" style={{ marginBottom: '16px' }}>
                  <label className="odoo-label">Vaga de Destino *</label>
                  <select required className="odoo-input" value={novaCandidatura.vaga_id} onChange={e => setNovaCandidatura({...novaCandidatura, vaga_id: e.target.value})}>
                    <option value="">Selecione a Vaga...</option>
                    {vagas.map(v => <option key={v.id} value={v.id}>{v.titulo}</option>)}
                  </select>
                </div>
                <div className="odoo-form-group" style={{ marginBottom: '16px' }}>
                  <label className="odoo-label">Nome do Candidato *</label>
                  <input required type="text" className="odoo-input" value={novaCandidatura.nome} onChange={e => setNovaCandidatura({...novaCandidatura, nome: e.target.value})} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Email</label>
                    <input type="email" className="odoo-input" value={novaCandidatura.email} onChange={e => setNovaCandidatura({...novaCandidatura, email: e.target.value})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Telefone *</label>
                    <input required type="text" className="odoo-input" value={novaCandidatura.telefone} onChange={e => setNovaCandidatura({...novaCandidatura, telefone: e.target.value})} />
                  </div>
                </div>
                <div className="odoo-form-group" style={{ marginBottom: '24px' }}>
                  <label className="odoo-label">Curriculum Vitae (PDF) *</label>
                  <input required type="file" accept=".pdf" className="odoo-input" style={{ padding: '8px' }} onChange={e => setCvFile(e.target.files?.[0] || null)} />
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--odoo-border)', paddingTop: '16px' }}>
                  <button type="button" className="odoo-btn" onClick={() => setShowNovaCandidaturaModal(false)} disabled={isProcessingCv}>Cancelar</button>
                  <button type="submit" className="odoo-btn odoo-btn-primary" disabled={isProcessingCv}>
                    {isProcessingCv ? 'A Analisar com IA...' : 'Submeter e Analisar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================= MODAL NOVO ADIANTAMENTO ================= */}
        {showNovoAdiantamentoModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '480px', maxWidth: '90%', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '8px' }}>Registar Novo Adiantamento (Vale)</h3>
              <p style={{ fontSize: '12px', color: 'var(--odoo-text-muted)', marginBottom: '24px', borderBottom: '1px solid var(--odoo-border)', paddingBottom: '12px' }}>
                O desconto mensal será calculado automaticamente: <strong>Valor Total ÷ Nº de Parcelas</strong>.
              </p>
              <form onSubmit={handleSaveAdiantamento}>
                <div className="odoo-form-group" style={{ marginBottom: '16px' }}>
                  <label className="odoo-label">Colaborador *</label>
                  <select required className="odoo-input" value={novoAdiantamento.colaborador_id} onChange={e => setNovoAdiantamento({...novoAdiantamento, colaborador_id: e.target.value})}>
                    <option value="">Selecionar...</option>
                    {employees.filter(e => e.estado === 'Ativo').map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.nome} — {emp.cargo}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Valor Total (Kz) *</label>
                    <input required type="number" min="1" className="odoo-input" placeholder="Ex: 100000" value={novoAdiantamento.valor_total} onChange={e => setNovoAdiantamento({...novoAdiantamento, valor_total: e.target.value})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Nº de Parcelas *</label>
                    <input required type="number" min="1" max="24" className="odoo-input" placeholder="Ex: 4" value={novoAdiantamento.parcelas_mensais} onChange={e => setNovoAdiantamento({...novoAdiantamento, parcelas_mensais: e.target.value})} />
                  </div>
                </div>
                {novoAdiantamento.valor_total && novoAdiantamento.parcelas_mensais && (
                  <div style={{ backgroundColor: '#f0f4f8', padding: '10px 14px', borderRadius: '6px', marginBottom: '20px', fontSize: '13px' }}>
                    <DollarSign size={16} style={{ marginRight: 4 }}/> Desconto Mensal: <strong>{(Number(novoAdiantamento.valor_total) / Number(novoAdiantamento.parcelas_mensais)).toLocaleString('pt-AO')} Kz / mês</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--odoo-border)', paddingTop: '16px' }}>
                  <button type="button" className="odoo-btn" onClick={() => setShowNovoAdiantamentoModal(false)}>Cancelar</button>
                  <button type="submit" className="odoo-btn odoo-btn-primary">Confirmar Vale</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================= MODAL NOVA AVALIAÇÃO ================= */}
        {showNovaAvaliacaoModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '500px', maxWidth: '90%', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--odoo-border)', paddingBottom: '12px' }}>Nova Avaliação de Desempenho</h3>
              <form onSubmit={handleSaveAvaliacao}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Colaborador Avaliado *</label>
                    <select required className="odoo-input" value={novaAvaliacao.colaborador_id} onChange={e => setNovaAvaliacao({...novaAvaliacao, colaborador_id: e.target.value})}>
                      <option value="">Selecionar...</option>
                      {employees.filter(e => e.estado === 'Ativo').map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Avaliador (Gestor)</label>
                    <select className="odoo-input" value={novaAvaliacao.avaliador_id} onChange={e => setNovaAvaliacao({...novaAvaliacao, avaliador_id: e.target.value})}>
                      <option value="">RH (Genérico)</option>
                      {employees.filter(e => e.estado === 'Ativo').map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="odoo-form-group" style={{ marginBottom: '16px' }}>
                  <label className="odoo-label">Pontuação *</label>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                    {[1,2,3,4,5].map(star => (
                      <span
                        key={star}
                        onClick={() => setNovaAvaliacao({...novaAvaliacao, pontuacao: String(star)})}
                        style={{ fontSize: '28px', cursor: 'pointer', color: star <= Number(novaAvaliacao.pontuacao) ? '#ffc107' : '#dee2e6', transition: 'color 0.1s' }}
                      >★</span>
                    ))}
                    <span style={{ fontSize: '13px', color: 'var(--odoo-text-muted)', marginLeft: '8px' }}>
                      {['', 'Insatisfatório', 'Abaixo do Esperado', 'Bom', 'Muito Bom', 'Excelente'][Number(novaAvaliacao.pontuacao)]}
                    </span>
                  </div>
                </div>

                <div className="odoo-form-group" style={{ marginBottom: '20px' }}>
                  <label className="odoo-label">Comentários / Objetivos</label>
                  <textarea className="odoo-input" rows={4} placeholder="Pontos fortes, áreas a melhorar, metas para o próximo período..." value={novaAvaliacao.comentarios} onChange={e => setNovaAvaliacao({...novaAvaliacao, comentarios: e.target.value})} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--odoo-border)', paddingTop: '16px' }}>
                  <button type="button" className="odoo-btn" onClick={() => setShowNovaAvaliacaoModal(false)}>Cancelar</button>
                  <button type="submit" className="odoo-btn odoo-btn-primary">Guardar Avaliação</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================= MODAL FÉRIAS E AUSÊNCIAS ================= */}
        {showVacationModal !== null && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '600px', maxWidth: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              
              <div style={{ padding: '24px', borderBottom: '1px solid var(--odoo-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>Gestão de Férias e Ausências</h3>
                  <button onClick={() => setShowVacationModal(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6c757d' }}>&times;</button>
                </div>
                <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'var(--odoo-text-muted)' }}>
                  Colaborador: <strong>{employees.find(e => e.id === showVacationModal)?.nome}</strong>
                </p>
              </div>

              <div style={{ padding: '24px', overflowY: 'auto' }}>
                <form onSubmit={handleSaveVacation} style={{ marginBottom: '32px', backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '8px', border: '1px solid var(--odoo-border)' }}>
                  <h4 style={{ margin: '0 0 16px 0', fontSize: '14px' }}>Registar Nova Ausência</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div className="odoo-form-group">
                      <label className="odoo-label">Tipo de Ausência *</label>
                      <select required className="odoo-input" value={newVacation.tipo} onChange={e => setNewVacation({...newVacation, tipo: e.target.value})}>
                        <option value="Férias">Férias</option>
                        <option value="Baixa Médica">Baixa Médica</option>
                        <option value="Falta Injustificada">Falta Injustificada</option>
                        <option value="Licença de Maternidade/Paternidade">Licença Maternidade/Paternidade</option>
                        <option value="Outro (Justificada)">Outro (Justificada)</option>
                      </select>
                    </div>
                    <div className="odoo-form-group" style={{ display: 'flex', alignItems: 'center', marginTop: '24px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                        <input type="checkbox" checked={newVacation.justificada} onChange={e => setNewVacation({...newVacation, justificada: e.target.checked})} />
                        Falta/Ausência Justificada?
                      </label>
                    </div>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div className="odoo-form-group">
                      <label className="odoo-label">Data de Início *</label>
                      <input required type="date" className="odoo-input" value={newVacation.data_inicio} onChange={e => setNewVacation({...newVacation, data_inicio: e.target.value})} />
                    </div>
                    <div className="odoo-form-group">
                      <label className="odoo-label">Data de Fim *</label>
                      <input required type="date" className="odoo-input" value={newVacation.data_fim} onChange={e => setNewVacation({...newVacation, data_fim: e.target.value})} />
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" className="odoo-btn odoo-btn-primary" style={{ padding: '6px 16px', fontSize: '13px' }}>Registar Ausência</button>
                  </div>
                </form>

                <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', borderBottom: '2px solid var(--odoo-border)', paddingBottom: '8px' }}>Histórico de Férias/Ausências</h4>
                {loadingVacations ? (
                  <p style={{ fontSize: '13px', color: 'var(--odoo-text-muted)', textAlign: 'center', padding: '20px' }}>A carregar histórico...</p>
                ) : employeeVacations.length === 0 ? (
                  <p style={{ fontSize: '13px', color: 'var(--odoo-text-muted)', textAlign: 'center', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>Nenhum registo encontrado.</p>
                ) : (
                  <div style={{ border: '1px solid var(--odoo-border)', borderRadius: '4px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead style={{ backgroundColor: '#f0f4f8' }}>
                        <tr>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Tipo</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Período</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Estado</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employeeVacations.map(vac => (
                          <tr key={vac.id} style={{ borderTop: '1px solid var(--odoo-border)' }}>
                            <td style={{ padding: '10px 12px' }}>
                              <strong>{vac.tipo}</strong>
                              {!vac.justificada && <span style={{ display: 'block', fontSize: '10px', color: '#dc3545' }}>(Não Justificada)</span>}
                            </td>
                            <td style={{ padding: '10px 12px', color: 'var(--odoo-text-muted)' }}>
                              {new Date(vac.data_inicio).toLocaleDateString('pt-PT')} a {new Date(vac.data_fim).toLocaleDateString('pt-PT')}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{ 
                                padding: '3px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 600,
                                backgroundColor: vac.estado_aprovacao === 'Aprovado' ? '#d1e7dd' : vac.estado_aprovacao === 'Rejeitado' ? '#f8d7da' : '#fff3cd',
                                color: vac.estado_aprovacao === 'Aprovado' ? '#0f5132' : vac.estado_aprovacao === 'Rejeitado' ? '#842029' : '#856404'
                              }}>
                                {vac.estado_aprovacao}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                              {vac.estado_aprovacao !== 'Aprovado' && (
                                <button onClick={() => handleUpdateVacationStatus(vac.id, 'Aprovado')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#198754', padding: '4px' }} title="Aprovar">
                                  <CheckCircle size={16} />
                                </button>
                              )}
                              {vac.estado_aprovacao !== 'Rejeitado' && (
                                <button onClick={() => handleUpdateVacationStatus(vac.id, 'Rejeitado')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc3545', padding: '4px' }} title="Rejeitar">
                                  <AlertTriangle size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= MODAL DOSSIER DO FUNCIONÁRIO ================= */}
        {showDossierModal && dossierEmployeeId && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '600px', maxWidth: '95%', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--odoo-border)', paddingBottom: '12px' }}>
                <h3 style={{ margin: 0, color: 'var(--odoo-text-dark)' }}>Dossier do Colaborador</h3>
                <button onClick={() => setShowDossierModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>&times;</button>
              </div>

              <form onSubmit={handleUploadDocument} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px', backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '6px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="odoo-form-group" style={{ flex: 1 }}>
                    <label className="odoo-label">Categoria</label>
                    <select className="odoo-input" value={newDocument.categoria} onChange={e => setNewDocument({...newDocument, categoria: e.target.value})}>
                      <option value="Identificação">Identificação (BI, Carta Condução)</option>
                      <option value="Formação">Educação / Formação</option>
                      <option value="Legal/Judicial">Legal / Judicial (Registo Criminal)</option>
                      <option value="Contrato">Contratos & Adendas</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </div>
                  <div className="odoo-form-group" style={{ flex: 1 }}>
                    <label className="odoo-label">Título / Descrição</label>
                    <input required type="text" className="odoo-input" value={newDocument.titulo} onChange={e => setNewDocument({...newDocument, titulo: e.target.value})} placeholder="Ex: Certificado Bacharelato" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                  <div className="odoo-form-group" style={{ flex: 1 }}>
                    <label className="odoo-label">Ficheiro (PDF/Img)</label>
                    <input required type="file" className="odoo-input" accept=".pdf,image/*" onChange={e => setDocumentFile(e.target.files?.[0] || null)} />
                  </div>
                  <button type="submit" className="odoo-btn odoo-btn-primary" disabled={isUploadingDoc || !documentFile} style={{ height: '36px', padding: '0 24px' }}>
                    {isUploadingDoc ? 'A enviar...' : <><Upload size={16} style={{ marginRight: '8px' }}/> Submeter Ficheiro</>}
                  </button>
                </div>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {dossierDocuments.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--odoo-text-muted)', fontSize: '13px' }}>Nenhum documento guardado.</p>
                ) : (
                  dossierDocuments.map(doc => (
                    <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', border: '1px solid var(--odoo-border)', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ padding: '8px', backgroundColor: '#e9ecef', borderRadius: '4px', color: 'var(--odoo-teal)' }}>
                          <FileText size={20} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--odoo-text-dark)' }}>{doc.titulo}</div>
                          <div style={{ fontSize: '11px', color: 'var(--odoo-text-muted)' }}>
                            <span style={{ backgroundColor: '#f0f4f8', padding: '2px 6px', borderRadius: '12px', marginRight: '6px' }}>{doc.categoria}</span>
                            Adicionado a {new Date(doc.criado_em).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <a href={`http://127.0.0.1:3001${doc.file_path}`} target="_blank" rel="noreferrer" className="odoo-btn" style={{ fontSize: '11px', padding: '6px 10px', textDecoration: 'none' }}>Ver Ficheiro</a>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= MODAL EDITAR COLABORADOR ================= */}
        {showEditEmployeeModal && editEmployee && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '800px', maxWidth: '95%', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ marginTop: 0, marginBottom: '24px', borderBottom: '1px solid var(--odoo-border)', paddingBottom: '12px' }}>Editar Colaborador: {editEmployee.nome}</h3>
              
              <form onSubmit={handleUpdateEmployee}>
                
                <h4 style={{ color: 'var(--odoo-teal)', marginBottom: '12px' }}>1. Dados Pessoais</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Nome Completo *</label>
                    <input required type="text" className="odoo-input" value={editEmployee.nome} onChange={e => setEditEmployee({...editEmployee, nome: e.target.value})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Telefone</label>
                    <input type="text" className="odoo-input" value={editEmployee.telefone || ''} onChange={e => setEditEmployee({...editEmployee, telefone: e.target.value})} />
                  </div>
                </div>

                <h4 style={{ color: 'var(--odoo-teal)', marginBottom: '12px', marginTop: '24px' }}>2. Documentação & Fiscalidade</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">BI / Passaporte</label>
                    <input type="text" className="odoo-input" value={editEmployee.bi || ''} onChange={e => setEditEmployee({...editEmployee, bi: e.target.value})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">NIF *</label>
                    <input required type="text" className="odoo-input" value={editEmployee.nif || ''} onChange={e => setEditEmployee({...editEmployee, nif: e.target.value})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">NISS *</label>
                    <input required type="text" className="odoo-input" value={editEmployee.niss || ''} onChange={e => setEditEmployee({...editEmployee, niss: e.target.value})} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Data de Emissão do BI / Passaporte</label>
                    <input type="date" className="odoo-input" value={editEmployee.data_emissao_documento || ''} onChange={e => setEditEmployee({...editEmployee, data_emissao_documento: e.target.value})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Validade BI / Passaporte</label>
                    <input type="date" className="odoo-input" value={editEmployee.validade_documento || ''} onChange={e => setEditEmployee({...editEmployee, validade_documento: e.target.value})} />
                  </div>
                </div>

                {editEmployee.cargo?.toLowerCase().includes('motorista') && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px', backgroundColor: '#fff3cd', padding: '12px', borderRadius: '4px', border: '1px solid #ffe69c' }}>
                    <div className="odoo-form-group" style={{ marginBottom: 0 }}>
                      <label className="odoo-label">Data de Emissão Carta Condução</label>
                      <input type="date" className="odoo-input" value={editEmployee.data_emissao_carta_conducao || ''} onChange={e => setEditEmployee({...editEmployee, data_emissao_carta_conducao: e.target.value})} />
                    </div>
                    <div className="odoo-form-group" style={{ marginBottom: 0 }}>
                      <label className="odoo-label">Validade Carta Condução</label>
                      <input type="date" className="odoo-input" value={editEmployee.validade_carta_conducao || ''} onChange={e => setEditEmployee({...editEmployee, validade_carta_conducao: e.target.value})} />
                    </div>
                  </div>
                )}

                <h4 style={{ color: 'var(--odoo-teal)', marginBottom: '12px', marginTop: '24px' }}>3. Contrato & Salário</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Cargo *</label>
                    <input required type="text" className="odoo-input" value={editEmployee.cargo || ''} onChange={e => setEditEmployee({...editEmployee, cargo: e.target.value})} />
                  </div>
                  <div className="odoo-form-group">
                    <label className="odoo-label">Salário Base (AOA) *</label>
                    <input required type="number" step="1000" className="odoo-input" value={editEmployee.salario_base || ''} onChange={e => setEditEmployee({...editEmployee, salario_base: e.target.value})} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--odoo-border)', paddingTop: '16px' }}>
                  <button type="button" className="odoo-btn" onClick={() => setShowEditEmployeeModal(false)} disabled={isSavingEdit}>Cancelar</button>
                  <button type="submit" className="odoo-btn odoo-btn-primary" disabled={isSavingEdit}>{isSavingEdit ? 'A Gravar...' : 'Guardar Alterações'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
