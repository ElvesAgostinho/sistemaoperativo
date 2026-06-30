const evolutionUrl = "https://evolution.topconsultores.pt";
const apiKey = "***REMOVED_EVOLUTION_API_KEY***";

async function test() {
    try {
        console.log("Creating instance...");
        let createRes = await fetch(`${evolutionUrl}/instance/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            body: JSON.stringify({ instanceName: "TESTE_123", integration: 'WHATSAPP-BAILEYS', qrcode: true })
        });
        console.log("Create status:", createRes.status);
        console.log("Create text:", await createRes.text());
    } catch(e) {
        console.error(e);
    }
}
test();
