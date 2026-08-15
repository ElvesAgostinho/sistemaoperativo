import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Rede de segurança global: sem isto, qualquer exceção não tratada em
 * qualquer componente desmonta a árvore React inteira e o utilizador
 * fica com um ecrã totalmente branco, sem qualquer indicação do que
 * aconteceu (ex.: após o link de confirmação de email do Supabase,
 * ou num estado inesperado de sessão).
 */
export default class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ErrorBoundary] Erro não tratado capturado:', error, info.componentStack);
    }

    handleReload = () => {
        this.setState({ hasError: false, error: null });
        window.location.href = window.location.origin;
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#f8fafc', fontFamily: 'Inter, sans-serif', padding: '24px', textAlign: 'center' }}>
                    <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: '16px' }} />
                    <h2 style={{ color: '#0f172a', marginBottom: '8px' }}>Ocorreu um problema inesperado</h2>
                    <p style={{ color: '#475569', maxWidth: '420px', lineHeight: 1.5, marginBottom: '24px' }}>
                        Algo correu mal ao carregar esta página. Tente recarregar. Se o problema persistir, contacte o suporte.
                    </p>
                    <button
                        onClick={this.handleReload}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#0f172a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
                    >
                        <RefreshCw size={16} /> Recarregar
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
