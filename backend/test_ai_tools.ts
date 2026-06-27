import { executeAITool } from './src/services/AIToolsService';

async function testTools() {
    const results = [];
    
    console.log('Testing consultar_db...');
    const res1 = await executeAITool('consultar_db', { query: 'SELECT * FROM Clientes LIMIT 1' });
    console.log(res1);
    
    console.log('Testing criar_pasta...');
    const res2 = await executeAITool('criar_pasta', { caminho: 'TestePasta' });
    console.log(res2);
    
    console.log('Testing criar_ficheiro...');
    const res3 = await executeAITool('criar_ficheiro', { caminho: 'TestePasta/teste.txt', conteudo: 'Ola mundo' });
    console.log(res3);
    
    console.log('Testing registar_atividade_crm...');
    const res4 = await executeAITool('registar_atividade_crm', { tipo: 'nota', descricao: 'Teste automatico' });
    console.log(res4);
    
    console.log('Testing criar_evento_calendario...');
    const res5 = await executeAITool('criar_evento_calendario', { titulo: 'Teste evento', data_evento: '2026-06-25 10:00' });
    console.log(res5);
    
    console.log('Testing ler_ficheiro_pc (should fail with not found if not exists, but catch block should not crash)...');
    const res6 = await executeAITool('ler_ficheiro_pc', { caminho_ou_nome: 'nao_existe.txt' });
    console.log(res6);
    
    console.log('All tests finished.');
}

testTools().catch(console.error);
