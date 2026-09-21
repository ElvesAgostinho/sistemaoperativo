/**
 * Navegação entre módulos com um "alvo": abrir o módulo Documentos já num
 * documento, ou o Email já numa mensagem. O App ouve o evento e troca de
 * módulo; o módulo de destino consome o alvo quando monta.
 */
export type Modulo = 'home' | 'hr' | 'crm' | 'data' | 'chat' | 'auto' | 'wa' | 'kb' | 'email' | 'settings' | 'superadmin' | 'reunioes' | 'afiliados' | 'contabilidade' | 'agendamento' | 'documentos';

const CHAVE = 'os_nav_alvo';

export function irPara(modulo: Modulo, alvo?: Record<string, string>) {
    try { if (alvo) sessionStorage.setItem(CHAVE, JSON.stringify({ modulo, ...alvo, em: Date.now() })); } catch { /* sem sessionStorage */ }
    window.dispatchEvent(new CustomEvent('os:navegar', { detail: { modulo } }));
}

/** Devolve (e apaga) o alvo guardado para este módulo, se houver e for recente. */
export function consumirAlvo(modulo: Modulo): Record<string, string> | null {
    try {
        const raw = sessionStorage.getItem(CHAVE);
        if (!raw) return null;
        const alvo = JSON.parse(raw);
        if (alvo.modulo !== modulo) return null;
        sessionStorage.removeItem(CHAVE);
        if (Date.now() - Number(alvo.em || 0) > 10 * 60 * 1000) return null;
        return alvo;
    } catch { return null; }
}

/** Alvo vindo do URL (links de email: ?modulo=documentos&doc=...). Guarda-o e limpa o URL. */
export function alvoDoUrl(): Modulo | null {
    const params = new URLSearchParams(window.location.search);
    const modulo = params.get('modulo') as Modulo | null;
    if (!modulo) return null;
    const alvo: Record<string, string> = {};
    params.forEach((v, k) => { if (k !== 'modulo') alvo[k] = v; });
    try { sessionStorage.setItem(CHAVE, JSON.stringify({ modulo, ...alvo, em: Date.now() })); } catch { /* ignora */ }
    window.history.replaceState({}, document.title, window.location.pathname);
    return modulo;
}
