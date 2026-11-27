/**
 * Grava um áudio em partes, e envia cada parte assim que fica pronta.
 *
 * Antes gravava-se a reunião inteira numa peça só e enviava-se no fim. Se a
 * página fechasse, perdia-se tudo; numa reunião de uma hora o ficheiro podia
 * passar os 25 MB que a transcrição aceita, e falhava; e o convidado que
 * fechava o separador sem carregar em "Sair" não deixava nada.
 *
 * Agora: uma parte a cada 4 minutos (cada uma é um ficheiro completo, que se
 * transcreve sozinho), com a hora REAL a que começou — é por ela que as falas
 * de várias pessoas se põem pela ordem certa. Voz a 32 kbps: uma hora são
 * ~14 MB no total, e cada parte ~1 MB.
 */

const PARTE_MS = 4 * 60 * 1000;
const BITS_POR_SEGUNDO = 32000;

export type TipoGravacao = 'host' | 'convidado' | 'sala';

export class GravadorSegmentado {
    private recorder: MediaRecorder | null = null;
    private pedacos: Blob[] = [];
    private inicioParte = 0;
    private relogio: ReturnType<typeof setTimeout> | null = null;
    private aParar = false;
    private envios: Promise<void>[] = [];
    public partesEnviadas = 0;
    public partesFalhadas = 0;
    public aoMudar?: () => void;

    constructor(
        private stream: MediaStream,
        private reuniaoId: string,
        private participanteNome: string,
        private tipo: TipoGravacao,
    ) { }

    public get aGravar(): boolean {
        return !!this.recorder && this.recorder.state === 'recording';
    }

    public get aEnviar(): boolean {
        return this.envios.length > 0;
    }

    public iniciar(): void {
        this.aParar = false;
        this.novaParte();
    }

    private novaParte(): void {
        if (this.aParar) return;
        if (!this.stream.getAudioTracks().some(t => t.readyState === 'live')) return;
        // O iPhone (Safari) não grava em WebM, só em MP4 — e o tipo tem de ir
        // certo até à transcrição, que escolhe o formato pela extensão.
        const tipoMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
            .find(t => MediaRecorder.isTypeSupported(t)) || '';
        const recorder = new MediaRecorder(this.stream, { ...(tipoMime ? { mimeType: tipoMime } : {}), audioBitsPerSecond: BITS_POR_SEGUNDO });
        this.pedacos = [];
        this.inicioParte = Date.now();
        const inicio = this.inicioParte;
        recorder.ondataavailable = e => { if (e.data.size > 0) this.pedacos.push(e.data); };
        recorder.onstop = () => {
            const tipo = (recorder.mimeType || tipoMime || 'audio/webm').split(';')[0];
            const blob = new Blob(this.pedacos, { type: tipo });
            this.pedacos = [];
            if (blob.size > 0) this.enviar(blob, inicio);
            // A parte seguinte começa logo — o corte entre as duas é de milissegundos.
            if (!this.aParar) this.novaParte();
            this.aoMudar?.();
        };
        recorder.start();
        this.recorder = recorder;
        this.relogio = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, PARTE_MS);
        this.aoMudar?.();
    }

    private enviar(blob: Blob, inicio: number): void {
        const envio = (async () => {
            for (let tentativa = 1; tentativa <= 3; tentativa++) {
                try {
                    const fd = new FormData();
                    const ext = /mp4|aac/.test(blob.type) ? 'mp4' : /ogg/.test(blob.type) ? 'ogg' : 'webm';
                    fd.append('audio', blob, `parte-${inicio}.${ext}`);
                    fd.append('participante_nome', this.participanteNome);
                    fd.append('participante_tipo', this.tipo);
                    fd.append('inicio_em', String(inicio));
                    const r = await fetch(`${import.meta.env.VITE_API_URL}/api/public/reuniao/${this.reuniaoId}/gravacao`, { method: 'POST', body: fd });
                    if (r.ok) { this.partesEnviadas++; return; }
                } catch { /* tenta outra vez */ }
                await new Promise(res => setTimeout(res, 2000 * tentativa));
            }
            this.partesFalhadas++;
        })();
        this.envios.push(envio);
        envio.finally(() => {
            this.envios = this.envios.filter(e => e !== envio);
            this.aoMudar?.();
        });
    }

    /** Pára, envia a última parte e espera que TODAS as partes tenham chegado. */
    public async parar(): Promise<void> {
        this.aParar = true;
        if (this.relogio) clearTimeout(this.relogio);
        const r = this.recorder;
        if (r && r.state !== 'inactive') {
            await new Promise<void>(res => {
                const antes = r.onstop;
                r.onstop = (ev) => { (antes as any)?.call(r, ev); res(); };
                r.stop();
            });
        }
        this.recorder = null;
        await Promise.all(this.envios);
        this.aoMudar?.();
    }

    /** Pára as faixas do microfone / da partilha (o browser deixa de mostrar o aviso de gravação). */
    public libertar(): void {
        this.stream.getTracks().forEach(t => t.stop());
    }
}
