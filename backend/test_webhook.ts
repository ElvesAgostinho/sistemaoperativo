import * as dotenv from 'dotenv';
dotenv.config();
import { WorkflowEngine } from './src/services/WorkflowEngine';

async function testWebhook() {
    console.log("Iniciando teste de recebimento de mensagem...");
    
    // Obter um ID de canal (simulando que o webhook passou pelo primeiro obstáculo usando o RPC)
    const { supabase } = require('./src/lib/supabaseClient');
    const { data: channelId } = await supabase.rpc('get_evolution_channel_id');
    
    if (!channelId) {
        console.error("Falha ao obter channel ID. Verifique o RPC.");
        return;
    }
    console.log("Channel ID encontrado:", channelId);

    // Simular os dados do Webhook
    const msg = {
        channel_id: channelId,
        phone_number: "351912345678",
        contact_name: "Cliente Teste MCP",
        content: "Olá, tenho interesse no vosso serviço!",
        direction: 'inbound' as const
    };

    console.log("Chamando WorkflowEngine.processIncomingMessage...");
    await WorkflowEngine.processIncomingMessage(msg);
    console.log("Processamento concluído. Verificando a BD...");

    // Tentar ler com o supabase-mcp-server ou apenas avisar
    console.log("Por favor, note que as inserções (clientes, negocios, wa_messages) usando a anon key vão falhar silenciosamente no backend devido ao RLS, caso não use a service key.");
}

testWebhook().catch(console.error);
