export async function onRequest(context) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };

    const url = new URL(context.request.url);
    const symbols = url.searchParams.get('symbols') || 'sz000001';
    const symbolList = symbols.split(',').map(s => s.trim());

    try {
        const API_KEY = 'QT_wat5QfcJ6N9pDZM5';
        const stockData = [];
        
        for (const symbol of symbolList) {
            const realData = await fetchRealStockData(symbol, API_KEY);
            if (realData) {
                stockData.push(realData);
            } else {
                return new Response(JSON.stringify({
                    success: false,
                    error: `无法获取股票 ${symbol} 的真实数据 - 数据源不可用`,
                    timestamp: new Date().toISOString(),
                    note: '系统只提供真实数据，不使用任何模拟数据'
                }), { headers: corsHeaders });
            }
        }

        return new Response(JSON.stringify({
            success: true,
            timestamp: new Date().toISOString(),
            data: stockData,
            symbols_count: symbolList.length,
            data_source: 'real-time-api',
            api_key: API_KEY
        }), { headers: corsHeaders });
        
    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: '真实数据源连接失败: ' + error.message,
            timestamp: new Date().toISOString(),
            note: '系统只提供真实数据'
        }), { headers: corsHeaders });
    }
}

async function fetchRealStockData(symbol, apiKey) {
    // 使用腾讯股票API获取真实数据
    const tencentUrl = `https://qt.gtimg.cn/q=${symbol}`;

    try {
        const response = await fetch(tencentUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://gu.qq.com/'
            }
        });

        if (response.ok) {
            const data = await response.text();
            const parsed = parseRealStockData(data, symbol);
            if (parsed && parsed.price && parseFloat(parsed.price) > 0) {
                return parsed;
            }
        }
    } catch (error) {
        console.error('腾讯API失败:', error);
    }

    // 备用：新浪财经API
    try {
        const sinaUrl = `https://hq.sinajs.cn/list=${symbol}`;
        const response = await fetch(sinaUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (response.ok) {
            const data = await response.text();
            const parsed = parseSinaStockData(data, symbol);
            if (parsed && parsed.price && parseFloat(parsed.price) > 0) {
                return parsed;
            }
        }
    } catch (error) {
        console.error('新浪API失败:', error);
    }

    return null;
}

function parseRealStockData(data, symbol) {
    try {
        const match = data.match(/="([^"]+)"/);
        if (!match) return null;
        
        const fields = match[1].split('~');
        if (fields.length < 33) return null;

        return {
            symbol: symbol,
            name: fields[1],
            price: fields[3],
            change: fields[31],
            change_percent: fields[32] + '%',
            volume: fields[6],
            high: fields[33],
            low: fields[34],
            open: fields[5],
            close_prev: fields[4],
            timestamp: new Date().toISOString(),
            data_source: 'tencent_real_api'
        };
    } catch (error) {
        return null;
    }
}

function parseSinaStockData(data, symbol) {
    try {
        const match = data.match(/="([^"]+)"/);
        if (!match) return null;
        
        const fields = match[1].split(',');
        if (fields.length < 6) return null;

        return {
            symbol: symbol,
            name: fields[0],
            price: fields[3],
            change: (parseFloat(fields[3]) - parseFloat(fields[2])).toFixed(2),
            change_percent: (((parseFloat(fields[3]) - parseFloat(fields[2])) / parseFloat(fields[2])) * 100).toFixed(2) + '%',
            volume: fields[8],
            high: fields[4],
            low: fields[5],
            open: fields[1],
            close_prev: fields[2],
            timestamp: new Date().toISOString(),
            data_source: 'sina_real_api'
        };
    } catch (error) {
        return null;
    }
}
