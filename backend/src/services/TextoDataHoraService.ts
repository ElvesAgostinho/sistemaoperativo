/**
 * Interpreta datas e horas escritas por pessoas, em português de Angola/Portugal.
 *
 * É propositadamente determinístico — sem IA: o mesmo texto dá sempre o mesmo
 * resultado, é instantâneo, não custa nada e não inventa. Quando não percebe,
 * diz que não percebeu (e o fluxo pode voltar a perguntar) em vez de adivinhar.
 *
 * Aceita, por exemplo:
 *   datas: "12/10", "12-10-2026", "2026-10-12", "12 de outubro", "hoje",
 *          "amanhã", "depois de amanhã", "sexta", "próxima segunda", "dia 3"
 *   horas: "14:30", "14h30", "14h", "14", "2 da tarde", "9 da manhã",
 *          "meio-dia", "meia-noite", "19.45"
 */

const MESES: Record<string, number> = {
    janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, mar: 3, abril: 4, abr: 4,
    maio: 5, mai: 5, junho: 6, jun: 6, julho: 7, jul: 7, agosto: 8, ago: 8,
    setembro: 9, set: 9, outubro: 10, out: 10, novembro: 11, nov: 11, dezembro: 12, dez: 12
};

// 0 = domingo (igual ao getDay() do JavaScript)
const DIAS_SEMANA: Record<string, number> = {
    domingo: 0, segunda: 1, 'segunda-feira': 1, terca: 2, 'terca-feira': 2,
    quarta: 3, 'quarta-feira': 3, quinta: 4, 'quinta-feira': 4,
    sexta: 5, 'sexta-feira': 5, sabado: 6
};

const normalizar = (v: any): string =>
    String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

const doisDigitos = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;

export class TextoDataHoraService {
    /**
     * Converte texto em data (AAAA-MM-DD). Devolve null se não perceber.
     * `hoje` permite testar com uma data fixa.
     */
    public static data(texto: string, hoje: Date = new Date()): string | null {
        const t = normalizar(texto);
        if (!t) return null;

        const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

        // já vem no formato da base de dados
        const jaIso = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
        if (jaIso) return this.montar(Number(jaIso[1]), Number(jaIso[2]), Number(jaIso[3]));

        if (/\bhoje\b/.test(t)) return iso(base);
        if (/\bamanha\b/.test(t) && !/depois/.test(t)) { const d = new Date(base); d.setDate(d.getDate() + 1); return iso(d); }
        if (/depois de amanha/.test(t)) { const d = new Date(base); d.setDate(d.getDate() + 2); return iso(d); }

        // "12/10", "12-10-2026", "12.10.26"
        const numerica = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
        if (numerica) {
            const dia = Number(numerica[1]), mes = Number(numerica[2]);
            let ano = numerica[3] ? Number(numerica[3]) : base.getFullYear();
            if (ano < 100) ano += 2000;
            const r = this.montar(ano, mes, dia);
            // sem ano e já passou → assume-se o ano seguinte
            if (r && !numerica[3] && r < iso(base)) return this.montar(ano + 1, mes, dia);
            return r;
        }

        // "12 de outubro", "12 outubro de 2026", "1 de out"
        const porExtenso = t.match(/\b(\d{1,2})\s*(?:de\s+)?([a-z]+)(?:\s+(?:de\s+)?(\d{4}))?\b/);
        if (porExtenso && MESES[porExtenso[2]]) {
            const dia = Number(porExtenso[1]), mes = MESES[porExtenso[2]];
            const ano = porExtenso[3] ? Number(porExtenso[3]) : base.getFullYear();
            const r = this.montar(ano, mes, dia);
            if (r && !porExtenso[3] && r < iso(base)) return this.montar(ano + 1, mes, dia);
            return r;
        }

        // dia da semana: "sexta", "próxima segunda", "na quarta-feira"
        for (const [nome, alvo] of Object.entries(DIAS_SEMANA)) {
            if (new RegExp(`\\b${nome}\\b`).test(t)) {
                const d = new Date(base);
                let avanco = (alvo - d.getDay() + 7) % 7;
                if (avanco === 0) avanco = 7;                       // "sexta" na sexta = a próxima
                if (/proxim|seguinte/.test(t) && avanco < 7) avanco += 0; // "próxima sexta" = a mesma próxima
                d.setDate(d.getDate() + avanco);
                return iso(d);
            }
        }

        // "dia 3" — dia deste mês (ou do mês seguinte, se já passou)
        const soDia = t.match(/\bdia\s+(\d{1,2})\b/);
        if (soDia) {
            const dia = Number(soDia[1]);
            const r = this.montar(base.getFullYear(), base.getMonth() + 1, dia);
            if (r && r < iso(base)) {
                const proximo = new Date(base.getFullYear(), base.getMonth() + 1, 1);
                return this.montar(proximo.getFullYear(), proximo.getMonth() + 1, dia);
            }
            return r;
        }

        return null;
    }

    /** Converte texto em hora (HH:MM). Devolve null se não perceber. */
    public static hora(texto: string): string | null {
        const t = normalizar(texto);
        if (!t) return null;

        if (/meio[\s-]?dia/.test(t)) return '12:00';
        if (/meia[\s-]?noite/.test(t)) return '00:00';

        let horas: number | null = null, minutos = 0;

        // "2 da tarde", "9h da noite", "8 da manhã" — o número vem antes do período do dia
        let m = t.match(/\b(\d{1,2})\s*(?:h|horas?)?\s*(?::|h)?\s*(\d{2})?\s*(?:da|de)\s+(manha|tarde|noite|madrugada)\b/);
        if (m) { horas = Number(m[1]); minutos = m[2] ? Number(m[2]) : 0; }

        // "14:30", "14h30", "14.30", "14 30"
        if (horas === null) {
            m = t.match(/\b(\d{1,2})\s*(?::|h|\.|\s)\s*(\d{2})\b/);
            if (m) { horas = Number(m[1]); minutos = Number(m[2]); }
        }
        if (horas === null) {
            // "14h", "14 horas", "as 14", "14"
            m = t.match(/\b(\d{1,2})\s*h\b/) || t.match(/\b(\d{1,2})\s*horas?\b/) || t.match(/(?:as|às)\s*(\d{1,2})\b/) || t.match(/^(\d{1,2})$/);
            if (m) { horas = Number(m[1]); minutos = 0; }
        }
        if (horas === null) return null;

        // "2 da tarde", "9 da noite", "8 da manhã"
        if (/(da|de)\s*(tarde|noite)/.test(t) && horas < 12) horas += 12;
        if (/(da|de)\s*(manha|madrugada)/.test(t) && horas === 12) horas = 0;

        if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;
        return `${doisDigitos(horas)}:${doisDigitos(minutos)}`;
    }

    /** Escreve a data como as pessoas dizem: "12 de outubro de 2026". */
    public static dataPorExtenso(isoData: string): string {
        const [a, m, d] = String(isoData || '').split('-').map(Number);
        if (!a || !m || !d) return String(isoData || '');
        const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        return `${d} de ${nomes[m - 1]} de ${a}`;
    }

    /** Valida o dia/mês/ano de verdade (31 de fevereiro não existe). */
    private static montar(ano: number, mes: number, dia: number): string | null {
        if (!ano || !mes || !dia || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
        const d = new Date(ano, mes - 1, dia);
        if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
        return iso(d);
    }
}
