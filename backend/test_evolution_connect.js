const evolutionUrl = "https://evolution.topconsultores.pt";
const apiKey = "***REMOVED_EVOLUTION_API_KEY***";

async function test() {
    try {
        console.log("Connecting instance...");
        let connectRes = await fetch(`${evolutionUrl}/instance/connect/SISTEMA_EMP_49427199-186f-47e1-b3fe-7e25b92daef6`, {
            headers: { 'apikey': apiKey }
        });
        console.log("Connect status:", connectRes.status);
        console.log("Connect text:", await connectRes.text());
    } catch(e) {
        console.error(e);
    }
}
test();
