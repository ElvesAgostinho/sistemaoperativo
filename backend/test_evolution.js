const evolutionUrl = "https://evolution.topconsultores.pt";
const apiKey = "lXNRduSBn1GY3f0me7JQJFkR2VTMfgCNo0TDUmchX6gedO0o9BOPjupThv0cwsKOXUXOfcJ1q7ahphpplBVd5bQDY1CXA69nHYY2n3JpeUpbPHApQb2tWrIuj3xOg5hMJhHED3U045Mj12vKpt81IuS9CLzBlUwUkG6EHY6qUeBa6QXNPNsrjsh9JXeMfyEapuStkhi6Llt8waNE1IRJjsXA6R4ga3gRgVWXFYt3B0giAb5WSZZXWu7lzAFPkBp8";

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
