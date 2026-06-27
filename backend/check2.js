const db = require('better-sqlite3')('../data/businessos.db'); 
const rows = db.prepare("SELECT * FROM Mensagens_IA ORDER BY id DESC LIMIT 5").all();
console.log(rows);
