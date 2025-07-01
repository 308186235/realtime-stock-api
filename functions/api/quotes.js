export async function onRequest(context) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };

    const url = new URL(context.request.url);
    const symbols = url.searchParams.get('symbols') || 'sz000001';
    
    const mockData = [
        { symbol: 'sz000001', name: '平安银行', price: '10.50', change: '+0.25', change_percent: '+2.44' },
        { symbol: 'sh600000', name: '浦发银行', price: '8.75', change: '-0.15', change_percent: '-1.69' },
        { symbol: 'sh600519', name: '贵州茅台', price: '1680.00', change: '+25.50', change_percent: '+1.54' }
    ];

    const result = {
        success: true,
        timestamp: new Date().toISOString(),
        data: mockData.filter(stock => symbols.includes(stock.symbol))
    };

    return new Response(JSON.stringify(result), { headers: corsHeaders });
}
