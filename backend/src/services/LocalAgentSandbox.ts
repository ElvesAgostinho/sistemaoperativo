import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

const BASE_DIR = path.join('C:', 'Users', 'DELL', 'Desktop', 'SISTEMA OPERATIVO', 'Empresa_Arquivos');

// Ensure base dir exists
if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
}

export class LocalAgentSandbox {

    static allowedApps: Record<string, string> = {
        'excel': 'start excel',
        'word': 'start winword',
        'winword': 'start winword',
        'powerbi': 'start pbidesktop',
        'primavera': 'start primavera' // Example mapping
    };

    /**
     * Nível 1: Controlo do Computador Seguro
     */
    static async abrirAplicacao(appName: string): Promise<string> {
        const key = appName.toLowerCase().trim();
        const command = this.allowedApps[key];

        if (!command) {
            throw new Error(`Segurança Sandbox: Aplicação '${appName}' não é permitida ou não está configurada.`);
        }

        return new Promise((resolve, reject) => {
            exec(command, (error) => {
                if (error) {
                    return reject(new Error(`Erro ao abrir aplicação: ${error.message}`));
                }
                resolve(`Aplicação ${appName} aberta com sucesso no host.`);
            });
        });
    }

    /**
     * Valida um caminho para impedir Directory Traversal
     */
    private static validatePath(subPath: string): string {
        // Resolve contra a BASE_DIR
        const targetPath = path.resolve(BASE_DIR, subPath);
        // Garante que o targetPath começa pela BASE_DIR (evita saídas tipo ../../../Windows)
        if (!targetPath.startsWith(BASE_DIR)) {
            throw new Error(`Segurança Sandbox: Tentativa de acesso fora da pasta permitida. Bloqueado.`);
        }
        return targetPath;
    }

    /**
     * Nível 2: Gestão de Ficheiros
     */
    static async abrirPasta(subPath: string = ''): Promise<string> {
        const targetPath = this.validatePath(subPath);
        
        if (!fs.existsSync(targetPath)) {
            throw new Error(`Pasta não encontrada: ${targetPath}`);
        }

        return new Promise((resolve, reject) => {
            // No Windows, abrir uma pasta no explorador:
            exec(`start explorer "${targetPath}"`, (error) => {
                if (error) return reject(new Error(`Erro ao abrir pasta: ${error.message}`));
                resolve(`Pasta aberta no host: ${targetPath}`);
            });
        });
    }

    static criarPasta(subPath: string): string {
        const targetPath = this.validatePath(subPath);
        if (!fs.existsSync(targetPath)) {
            fs.mkdirSync(targetPath, { recursive: true });
            return `Pasta criada: ${targetPath}`;
        }
        return `A pasta já existe: ${targetPath}`;
    }

    static getBaseDir(): string {
        return BASE_DIR;
    }
}
