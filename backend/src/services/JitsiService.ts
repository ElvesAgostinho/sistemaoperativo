/**
 * Jitsi público (meet.jit.si) — sem servidor próprio, sem domínio, sem custo.
 * A sala existe assim que alguém entra; o "acesso" é só quem conhece o link
 * (nome de sala com timestamp + parte aleatória, não adivinhável na prática),
 * mesmo modelo já usado antes neste projeto.
 */
export class JitsiService {
    public static criarSala(nomeInterno: string): { roomName: string; url: string } {
        return { roomName: nomeInterno, url: `https://meet.jit.si/${nomeInterno}` };
    }
}
