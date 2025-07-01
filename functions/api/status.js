export async function onRequest() { return new Response(JSON.stringify({success: true, status: " online\}), {headers: {\Content-Type\: \application/json\, \Access-Control-Allow-Origin\: \*\}}); }
