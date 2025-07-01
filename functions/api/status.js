export async function onRequest(context) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };

    const status = {
        success: true,
        timestamp: new Date().toISOString(),
        service: 'Real-time Stock API',
        status: 'online'
    };

    return new Response(JSON.stringify(status), { headers: corsHeaders });
}
