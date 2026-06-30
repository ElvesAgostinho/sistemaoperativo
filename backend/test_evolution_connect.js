const evolutionUrl = "https://evolution.topconsultores.pt";
const apiKey = "lXNRduSBn1GY3f0me7JQJFkR2VTMfgCNo0TDUmchX6gedO0o9BOPjupThv0cwsKOXUXOfcJ1q7ahphpplBVd5bQDY1CXA69nHYY2n3JpeUpbPHApQb2tWrIuj3xOg5hMJhHED3U045Mj12vKpt81IuS9CLzBlUwUkG6EHY6qUeBa6QXNPNsrjsh9JXeMfyEapuStkhi6Llt8waNE1IRJjsXA6R4ga3gRgVWXFYt3B0giAb5WSZZXWu7lzAFPkBp8";

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
