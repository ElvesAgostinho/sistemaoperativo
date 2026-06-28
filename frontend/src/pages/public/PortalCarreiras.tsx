import React, { useEffect, useState } from 'react';
import { Briefcase, MapPin, Building2, ChevronRight, Clock } from 'lucide-react';

interface Vaga {
    id: string;
    titulo: string;
    departamento: string;
    tipo: string;
    localizacao: string;
    descricao: string;
    created_at: string;
}

const PortalCarreiras = () => {
    // URL pattern: /carreiras/:empresa_id
    const pathnameParts = window.location.pathname.split('/');
    const empresa_id = pathnameParts[2];
    
    const [vagas, setVagas] = useState<Vaga[]>([]);
    const [empresaNome, setEmpresaNome] = useState('Nossa Empresa');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const navigateTo = (url: string) => {
        window.history.pushState({}, '', url);
        window.dispatchEvent(new Event('popstate')); // To trigger re-render if we had a global listener, or we can just reload for simplicity
        window.location.href = url;
    };

    useEffect(() => {
        const fetchVagas = async () => {
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/public/vagas/${empresa_id}`);
                const data = await res.json();
                
                if (data.success) {
                    setVagas(data.vagas);
                    if (data.empresaNome) setEmpresaNome(data.empresaNome);
                } else {
                    setError('Não foi possível carregar as vagas.');
                }
            } catch (err) {
                setError('Erro de conexão ao servidor.');
            } finally {
                setLoading(false);
            }
        };

        if (empresa_id) {
            fetchVagas();
        } else {
            setError('Empresa não especificada.');
            setLoading(false);
        }
    }, [empresa_id]);

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50">Carregando portal...</div>;
    if (error) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-red-600">{error}</div>;

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            {/* Header */}
            <header className="bg-indigo-600 text-white py-16 px-4">
                <div className="max-w-4xl mx-auto text-center">
                    <Building2 className="mx-auto h-12 w-12 mb-4 opacity-80" />
                    <h1 className="text-4xl font-bold mb-4">Carreiras na {empresaNome}</h1>
                    <p className="text-xl text-indigo-100 max-w-2xl mx-auto">
                        Junte-se à nossa equipa e ajude-nos a construir o futuro. 
                        Conheça as nossas vagas em aberto.
                    </p>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-4xl mx-auto py-12 px-4">
                <h2 className="text-2xl font-bold text-gray-900 mb-8">Vagas em Aberto ({vagas.length})</h2>
                
                {vagas.length === 0 ? (
                    <div className="bg-white p-8 rounded-xl shadow-sm text-center text-gray-500">
                        Neste momento não temos vagas abertas. Volte mais tarde!
                    </div>
                ) : (
                    <div className="space-y-4">
                        {vagas.map((vaga) => (
                            <div 
                                key={vaga.id} 
                                onClick={() => navigateTo(`/carreiras/${empresa_id}/vaga/${vaga.id}`)}
                                className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-indigo-100 transition-all cursor-pointer group"
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-900 group-hover:text-indigo-600 transition-colors mb-2">
                                            {vaga.titulo}
                                        </h3>
                                        <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                                            <span className="flex items-center gap-1">
                                                <Briefcase size={16} />
                                                {vaga.departamento}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <MapPin size={16} />
                                                {vaga.localizacao}
                                            </span>
                                            <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">
                                                <Clock size={14} />
                                                {vaga.tipo}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="hidden sm:flex items-center justify-center h-10 w-10 rounded-full bg-gray-50 group-hover:bg-indigo-50 text-gray-400 group-hover:text-indigo-600 transition-colors">
                                        <ChevronRight size={20} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default PortalCarreiras;
