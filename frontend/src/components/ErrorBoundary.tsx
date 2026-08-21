import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    componentStack: string | null;
}

/**
 * Rede de segurança global: sem isto, qualquer exceção não tratada em
 * qualquer componente desmonta a árvore React inteira e o utilizador
 * fica com um ecrã totalmente branco, sem qualquer indicação do que
 * aconteceu (ex.: após o link de confirmação de email do Supabase,
 * ou num estado inesperado de sessão).
 */
export default class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null, componentStack: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, componentStack: null };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ErrorBoundary] Erro não tratado capturado:', error, info.componentStack);
        this.setState({ componentStack: info.componentStack || null });
    }

    handleReload = () => {
        this.setState({ hasError: false, error: null, componentStack: null });
        window.location.href = window.location.origin;
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: 'Inter, sans-serif', padding: '24px', textAlign: 'center' }}>
                    <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: '16px' }} />
                    <h2 style={{ color: '#0f172a', marginBottom: '8px' }}>Ocorreu um problema inesperado</h2>
                    <p style={{ color: '#475569', maxWidth: '420px', lineHeight: 1.5, marginBottom: '24px' }}>
                        Algo correu mal ao carregar esta página. Tente recarregar. Se o problema persistir, contacte o suporte.
                    </p>
                    <button
                        onClick={this.handleReload}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#0f172a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, marginBottom: '20px' }}
                    >
                        <RefreshCw size={16} /> Recarregar
                    </button>
                    {this.state.error && (
                        <details style={{ maxWidth: '640px', width: '100%', textAlign: 'left' }}>
                            <summary style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '12px' }}>Detalhes técnicos (para o suporte)</summary>
                            <pre style={{
                                marginTop: '10px', padding: '12px', background: '#0f172a', color: '#f1f5f9', borderRadius: '6px',
                                fontSize: '11px', lineHeight: 1.5, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', textAlign: 'left'
                            }}>
                                {this.state.error.name}: {this.state.error.message}
                                {'\n'}URL: {window.location.href}
                                {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
                                {this.state.componentStack ? `\n\nComponent stack:${this.state.componentStack}` : ''}
                            </pre>
                        </details>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
