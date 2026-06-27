const db = require('better-sqlite3')('../data/businessos.db'); 
console.log(db.prepare("SELECT * FROM Reunioes").all());
