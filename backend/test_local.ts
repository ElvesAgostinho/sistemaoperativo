import { EmailService } from './src/services/EmailService';

async function test() {
    try {
        // Testar a conexão passando nada (simula o que AIToolsService faz sem token)
        const result = await EmailService.testarConexao();
        console.log("Result (no params):", result);
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

test();
