/** O link da sala do Jitsi com o nome da pessoa já preenchido. */
export const linkComNome = (jitsiUrl: string, nome: string): string => {
    const base = jitsiUrl.split('#')[0];
    return `${base}#userInfo.displayName=${encodeURIComponent(JSON.stringify(nome))}`;
};
