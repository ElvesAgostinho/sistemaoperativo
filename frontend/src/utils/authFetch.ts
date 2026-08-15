/**
 * Wrapper around fetch that automatically injects the Authorization header.
 * Use this instead of raw fetch() in all authenticated API calls.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = localStorage.getItem('os_auth_token');
    const headers = new Headers(options.headers || {});
    
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
    }
    
    return fetch(url, { ...options, headers });
}

export const API_URL = import.meta.env.VITE_API_URL || '';
