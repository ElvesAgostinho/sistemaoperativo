const token = 'zoXPPNFU9oeH1qxHhGr1RIpbI6LftPqSyBLUsnRL64174f5b';

async function getVPSList() {
    const urlsToTry = [
        'https://developers.hostinger.com/api/v1/vps',
        'https://api.hostinger.com/v1',
        'https://api.hostinger.com/api/v1/vps'
    ];

    for (const url of urlsToTry) {
        console.log(`\nTestando ${url}...`);
        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                }
            });
            const text = await res.text();
            console.log(`Status: ${res.status}`);
            console.log(`Response: ${text.substring(0, 500)}`);
        } catch (err) {
            console.error(`Erro ao conectar: ${err.message}`);
        }
    }
}

getVPSList();
