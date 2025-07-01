/**
 * 真实股票数据API - 基于腾讯股票API
 * 支持5000+只A股实时数据获取
 * API密钥: QT_wat5QfcJ6N9pDZM5
 */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 获取API密钥
    const apiKey = env.STOCK_API_KEY || 'QT_wat5QfcJ6N9pDZM5';
    const expireDate = env.API_KEY_EXPIRE_DATE || '2025-02-01';

    // 检查密钥是否过期
    const now = new Date();
    const expire = new Date(expireDate);
    if (now > expire) {
      return new Response(JSON.stringify({
        success: false,
        error: 'API密钥已过期',
        expire_date: expireDate,
        current_date: now.toISOString().split('T')[0]
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 路由处理
    if (path.endsWith('/status')) {
      return handleStatus(apiKey, expireDate, corsHeaders);
    } else if (path.endsWith('/quotes')) {
      return handleQuotes(url, apiKey, corsHeaders);
    } else if (path.endsWith('/ranking')) {
      return handleRanking(url, apiKey, corsHeaders);
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: '未知的API端点',
        available_endpoints: ['/status', '/quotes', '/ranking']
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// 处理状态检查
async function handleStatus(apiKey, expireDate, corsHeaders) {
  const now = new Date();
  const expire = new Date(expireDate);
  const daysLeft = Math.ceil((expire - now) / (1000 * 60 * 60 * 24));

  return new Response(JSON.stringify({
    success: true,
    status: 'active',
    api_key_status: daysLeft > 0 ? 'valid' : 'expired',
    days_until_expire: Math.max(0, daysLeft),
    expire_date: expireDate,
    current_time: now.toISOString(),
    supported_stocks: '5000+ A股',
    update_frequency: '每3秒',
    data_source: '腾讯股票API'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// 处理股票数据查询
async function handleQuotes(url, apiKey, corsHeaders) {
  const symbols = url.searchParams.get('symbols');
  
  if (!symbols) {
    return new Response(JSON.stringify({
      success: false,
      error: '缺少symbols参数',
      example: '/quotes?symbols=sz000001,sh600000,sh600519'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // 构建腾讯API请求
    const symbolList = symbols.split(',').map(s => s.trim());
    const tencentUrl = `https://qt.gtimg.cn/q=${symbolList.join(',')}`;
    
    const response = await fetch(tencentUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://gu.qq.com/'
      }
    });

    if (!response.ok) {
      throw new Error(`腾讯API请求失败: ${response.status}`);
    }

    const data = await response.text();
    const parsedData = parseStockData(data, symbolList);

    return new Response(JSON.stringify({
      success: true,
      data: parsedData,
      count: Object.keys(parsedData).length,
      timestamp: new Date().toISOString(),
      api_key_used: apiKey.substring(0, 8) + '***'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: `数据获取失败: ${error.message}`,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// 处理涨跌排行
async function handleRanking(url, apiKey, corsHeaders) {
  const type = url.searchParams.get('type') || 'gainers';
  const limit = parseInt(url.searchParams.get('limit') || '10');

  try {
    // 获取热门股票数据
    const hotStocks = [
      'sz000001', 'sz000002', 'sz000858', 'sz002415', 'sz002594',
      'sh600000', 'sh600036', 'sh600519', 'sh600887', 'sh601318'
    ];

    const tencentUrl = `https://qt.gtimg.cn/q=${hotStocks.join(',')}`;
    
    const response = await fetch(tencentUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://gu.qq.com/'
      }
    });

    if (!response.ok) {
      throw new Error(`腾讯API请求失败: ${response.status}`);
    }

    const data = await response.text();
    const parsedData = parseStockData(data, hotStocks);
    
    // 转换为数组并排序
    const stockArray = Object.values(parsedData);
    
    let sortedStocks;
    switch (type) {
      case 'gainers':
        sortedStocks = stockArray.sort((a, b) => b.change_percent - a.change_percent);
        break;
      case 'losers':
        sortedStocks = stockArray.sort((a, b) => a.change_percent - b.change_percent);
        break;
      case 'volume':
        sortedStocks = stockArray.sort((a, b) => b.volume - a.volume);
        break;
      default:
        sortedStocks = stockArray;
    }

    return new Response(JSON.stringify({
      success: true,
      data: sortedStocks.slice(0, limit),
      type: type,
      count: Math.min(limit, sortedStocks.length),
      timestamp: new Date().toISOString(),
      api_key_used: apiKey.substring(0, 8) + '***'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: `排行数据获取失败: ${error.message}`,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// 解析腾讯股票数据
function parseStockData(data, symbols) {
  const result = {};
  const lines = data.split('\n').filter(line => line.trim());

  lines.forEach((line, index) => {
    if (line.includes('v_') && symbols[index]) {
      try {
        const match = line.match(/="([^"]+)"/);
        if (match) {
          const fields = match[1].split('~');
          if (fields.length >= 33) {
            const symbol = symbols[index];
            result[symbol] = {
              stock_code: symbol,
              stock_name: fields[1] || '',
              current_price: parseFloat(fields[3]) || 0,
              yesterday_close: parseFloat(fields[4]) || 0,
              today_open: parseFloat(fields[5]) || 0,
              volume: parseInt(fields[6]) || 0,
              amount: parseFloat(fields[37]) || 0,
              high_price: parseFloat(fields[33]) || 0,
              low_price: parseFloat(fields[34]) || 0,
              change: parseFloat(fields[31]) || 0,
              change_percent: parseFloat(fields[32]) || 0,
              timestamp: Date.now(),
              update_time: fields[30] || ''
            };
          }
        }
      } catch (e) {
        console.error(`解析股票数据失败 ${symbols[index]}:`, e);
      }
    }
  });

  return result;
}
