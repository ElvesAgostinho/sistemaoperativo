const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const db = new Database(path.join(__dirname, '..', 'data', 'businessos.db'));

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("Tables:");
tables.forEach(t => {
    console.log(t.name);
    const cols = db.prepare(`PRAGMA table_info(${t.name})`).all();
    console.log(cols.map(c => `  - ${c.name} (${c.type})`).join('\n'));
});
