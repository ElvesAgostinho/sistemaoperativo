import React, { useEffect, useState } from 'react';
import { ArrowLeft, Upload, CheckCircle, Briefcase, MapPin } from 'lucide-react';

interface Vaga {
    id: string;
    titulo: string;
    departamento: string;
    localizacao: string;
    descricao: string;
    empresas: { nome: string };
    empresa_id: string;
}

const CandidaturaForm = () => {
    // URL pattern: /carreiras/:empresa_id/vaga/:vaga_id
    const pathnameParts = window.location.pathname.split('/');
    const empresa_id = pathnameParts[2];
    const vaga_id = pathnameParts[4];
    
    const navigateTo = (url: string) => {
        window.location.href = url;
    };

    const [vaga, setVaga] = useState<Vaga | null>(null);
    const [loading, setLoading] = useState(true);
    
    // Form state
    const [nome, setNome] = useState('');
    const [email, setEmail] = useState('');
    const [telefone, setTelefone] = useState('');
    const [linkedin, setLinkedin] = useState('');
    const [file, setFile] = useState<File | null>(null);
    
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!vaga_id) {
            setLoading(false);
            return;
        }
        
        const fetchVaga = async () => {
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/public/vaga/${vaga_id}`);
                const data = await res.json();
                if (data.success && data.vaga) {
                    setVaga(data.vaga);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchVaga();
    }, [vaga_id]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');

        try {
            let cv_url = 'Nenhum CV anexado';
            if (file) {
                cv_url = `https://storage.exemplo.com/cv/${file.name}`;
            }

            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/public/candidatar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vaga_id,
                    empresa_id,
                    nome,
                    email,
                    telefone,
                    linkedin_url: linkedin,
                    cv_url
                })
            });
            const data = await res.json();
            if (data.success) {
                setSuccess(true);
            } else {
                setError(data.error || 'Erro ao submeter candidatura.');
            }
        } catch (err) {
            setError('Erro de rede.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">A carregar detalhes da vaga...</div>;
    if (!vaga) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-red-600">Vaga não encontrada.</div>;

    if (success) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center max-w-md w-full">
                    <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-6" />
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Candidatura Submetida!</h2>
                    <p className="text-gray-600 mb-8">Obrigado pelo seu interesse. A equipa da {vaga.empresas?.nome} irá analisar o seu perfil e entrará em contacto em breve.</p>
                    <button 
                        onClick={() => navigateTo(`/carreiras/${empresa_id}`)}
                        className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors w-full"
                    >
                        Ver Mais Vagas
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 font-sans py-12 px-4">
            <div className="max-w-3xl mx-auto">
                <button 
                    onClick={() => navigateTo(`/carreiras/${empresa_id}`)}
                    className="flex items-center text-indigo-600 hover:text-indigo-800 font-medium mb-8 transition-colors"
                >
                    <ArrowLeft size={20} className="mr-2" />
                    Voltar para todas as vagas
                </button>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="bg-indigo-600 p-8 text-white">
                        <h1 className="text-3xl font-bold mb-4">{vaga.titulo}</h1>
                        <div className="flex flex-wrap gap-6 text-indigo-100">
                            <span className="flex items-center gap-2"><Briefcase size={18} /> {vaga.departamento}</span>
                            <span className="flex items-center gap-2"><MapPin size={18} /> {vaga.localizacao}</span>
                        </div>
                    </div>

                    <div className="p-8">
                        <h3 className="text-xl font-bold text-gray-900 mb-4">Descrição da Função</h3>
                        <div className="text-gray-600 mb-10 whitespace-pre-wrap leading-relaxed">
                            {vaga.descricao}
                        </div>

                        <div className="border-t border-gray-200 pt-10">
                            <h3 className="text-2xl font-bold text-gray-900 mb-6">Candidatar-me a esta vaga</h3>
                            
                            {error && <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">{error}</div>}

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Nome Completo *</label>
                                        <input required type="text" value={nome} onChange={e => setNome(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="João Silva" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                                        <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="joao@exemplo.com" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Telefone</label>
                                        <input type="tel" value={telefone} onChange={e => setTelefone(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="+351 912 345 678" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Perfil LinkedIn</label>
                                        <input type="url" value={linkedin} onChange={e => setLinkedin(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="https://linkedin.com/in/..." />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Anexar Currículo (PDF) *</label>
                                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer" onClick={() => document.getElementById('cv-upload')?.click()}>
                                        <div className="space-y-1 text-center">
                                            <Upload className="mx-auto h-12 w-12 text-gray-400" />
                                            <div className="flex text-sm text-gray-600 justify-center">
                                                <label htmlFor="cv-upload" className="relative cursor-pointer bg-transparent rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
                                                    <span>Faça upload do ficheiro</span>
                                                    <input id="cv-upload" name="cv-upload" type="file" accept=".pdf,.doc,.docx" className="sr-only" onChange={handleFileChange} required />
                                                </label>
                                            </div>
                                            <p className="text-xs text-gray-500">PDF ou DOCX até 10MB</p>
                                        </div>
                                    </div>
                                    {file && <div className="mt-2 text-sm text-indigo-600 font-medium">Ficheiro selecionado: {file.name}</div>}
                                </div>

                                <button 
                                    type="submit" 
                                    disabled={submitting}
                                    className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-bold text-lg hover:bg-indigo-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center"
                                >
                                    {submitting ? 'A Enviar Candidatura...' : 'Submeter Candidatura'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CandidaturaForm;
