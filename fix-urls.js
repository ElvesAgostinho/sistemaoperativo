const fs = require('fs');
const path = require('path');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let changed = false;

            // Replace 'http://127.0.0.1:3001/...' with import.meta.env.VITE_API_URL + '/...'
            if (content.includes("'http://127.0.0.1:3001/")) {
                content = content.replace(/'http:\/\/127\.0\.0\.1:3001\//g, "import.meta.env.VITE_API_URL + '/");
                changed = true;
            }
            if (content.includes("'http://localhost:3001/")) {
                content = content.replace(/'http:\/\/localhost:3001\//g, "import.meta.env.VITE_API_URL + '/");
                changed = true;
            }

            // Replace `http://127.0.0.1:3001/...` with `${import.meta.env.VITE_API_URL}/...`
            if (content.includes("`http://127.0.0.1:3001/")) {
                content = content.replace(/`http:\/\/127\.0\.0\.1:3001\//g, "`${import.meta.env.VITE_API_URL}/");
                changed = true;
            }
            if (content.includes("`http://localhost:3001/")) {
                content = content.replace(/`http:\/\/localhost:3001\//g, "`${import.meta.env.VITE_API_URL}/");
                changed = true;
            }
            
            // Just in case it's exactly the URL without trailing slash
            if (content.includes("'http://127.0.0.1:3001'")) {
                content = content.replace(/'http:\/\/127\.0\.0\.1:3001'/g, "import.meta.env.VITE_API_URL");
                changed = true;
            }

            if (changed) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log('Fixed:', fullPath);
            }
        }
    }
}

processDir(path.join(__dirname, 'frontend/src'));
