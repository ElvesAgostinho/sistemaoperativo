const fs = require('fs');
const path = require('path');

const dbTsPath = path.join(__dirname, 'src', 'db.ts');
let content = fs.readFileSync(dbTsPath, 'utf8');

// Primeiro removemos todos os empresa_id existentes para não duplicar
content = content.replace(/\s*empresa_id\s+INTEGER\s*,/g, '');
content = content.replace(/\s*empresa_id\s+TEXT\s*,/g, '');

// Agora adicionamos empresa_id TEXT logo a seguir a AUTOINCREMENT,
content = content.replace(/id INTEGER PRIMARY KEY AUTOINCREMENT,/g, 'id INTEGER PRIMARY KEY AUTOINCREMENT,\n        empresa_id TEXT,');

// Para a tabela Configuracoes que não tem id:
// CREATE TABLE IF NOT EXISTS Configuracoes (
//     chave TEXT PRIMARY KEY,
//     valor TEXT,
content = content.replace(/chave TEXT PRIMARY KEY,/g, 'chave TEXT PRIMARY KEY,\n        empresa_id TEXT,');

fs.writeFileSync(dbTsPath, content);
console.log('db.ts updated successfully!');
