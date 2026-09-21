import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
    // Usado quando esta boundary protege só uma área da página (ex: um módulo
    // dentro da shell principal) em vez do ecrã inteiro — evita ocupar 100vh
    // dentro de um layout que já tem a sua própria barra lateral/topo, e o
    // texto refere-se a "este módulo" em vez de "esta página".
    compact?: boolean;
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

        // "removeChild/insertBefore ... não é filho deste nó" quer dizer que algo de
        // fora (tradutor do browser, extensão) mexeu no DOM que o React gere. O
        // estado da aplicação está bom; basta voltar a montar. Faz-se uma vez por
        // minuto para não entrar em ciclo se o problema persistir.
        if (/removeChild|insertBefore|não é filho|not a child/i.test(error?.message || '')) {
            try {
                const ultimo = Number(sessionStorage.getItem('os_recuperacao_dom') || 0);
                if (Date.now() - ultimo > 60_000) {
                    sessionStorage.setItem('os_recuperacao_dom', String(Date.now()));
                    setTimeout(() => window.location.reload(), 300);
                }
            } catch { /* sem sessionStorage: fica o ecrã com o botão */ }
        }
    }

    handleReload = () => {
        this.setState({ hasError: false, error: null, componentStack: null });
        window.location.href = window.location.origin;
    };

    render() {
        if (this.state.hasError) {
            const { compact } = this.props;
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: compact ? '100%' : '100vh', height: compact ? '100%' : undefined, width: '100%', backgroundColor: '#f8fafc', fontFamily: 'Inter, sans-serif', padding: '24px', textAlign: 'center', boxSizing: 'border-box' }}>
                    <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: '16px' }} />
                    <h2 style={{ color: '#0f172a', marginBottom: '8px' }}>{compact ? 'Este módulo encontrou um problema' : 'Ocorreu um problema inesperado'}</h2>
                    <p style={{ color: '#475569', maxWidth: '420px', lineHeight: 1.5, marginBottom: '24px' }}>
                        {compact
                            ? 'Algo correu mal ao carregar este módulo. Pode tentar outro módulo no menu à esquerda, ou recarregar a página.'
                            : 'Algo correu mal ao carregar esta página. Tente recarregar. Se o problema persistir, contacte o suporte.'}
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
