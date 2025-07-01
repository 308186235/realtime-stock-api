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
            api_call_time: new Date().toISOString(),
            data: stockData,
            symbols_count: symbolList.length,
            data_source: 'real-time-api',
            api_key: API_KEY,
            market_status: getMarketStatus()
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
            const parsed = parseCompleteStockData(data, symbol);
            if (parsed && parsed.current_price && parseFloat(parsed.current_price) > 0) {
                return parsed;
            }
        }
    } catch (error) {
        console.error('腾讯API失败:', error);
    }

    return null;
}

function parseCompleteStockData(data, symbol) {
    try {
        const match = data.match(/="([^"]+)"/);
        if (!match) return null;
        
        const fields = match[1].split('~');
        if (fields.length < 50) return null;

        // 解析腾讯API的时间戳
        const updateTimeStr = fields[30]; // "20250701161409"
        let stockDataTime = new Date().toISOString(); // 默认值
        let beijingTimeStr = '';
        let dataStatus = 'unknown';
        
        if (updateTimeStr && updateTimeStr.length === 14) {
            const year = updateTimeStr.substring(0, 4);
            const month = updateTimeStr.substring(4, 6);
            const day = updateTimeStr.substring(6, 8);
            const hour = updateTimeStr.substring(8, 10);
            const minute = updateTimeStr.substring(10, 12);
            const second = updateTimeStr.substring(12, 14);
            
            // 构建北京时间，然后转换为UTC
            const beijingTime = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`);
            stockDataTime = beijingTime.toISOString();
            beijingTimeStr = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
            
            // 判断数据状态
            dataStatus = getDataStatus(parseInt(hour), parseInt(minute));
        }

        // 根据腾讯API完整字段解析
        return {
            // 基本信息
            stock_code: symbol,
            stock_name: fields[1] || '',
            
            // 价格信息
            current_price: parseFloat(fields[3]) || 0,
            yesterday_close: parseFloat(fields[4]) || 0,
            today_open: parseFloat(fields[5]) || 0,
            high_price: parseFloat(fields[33]) || 0,
            low_price: parseFloat(fields[34]) || 0,
            
            // 涨跌信息
            change: parseFloat(fields[31]) || 0,
            change_percent: parseFloat(fields[32]) || 0,
            
            // 成交信息
            volume: parseInt(fields[36]) || 0,           // 成交量(手)
            amount: parseFloat(fields[37]) * 10000 || 0, // 成交额(元)
            turnover_rate: parseFloat(fields[38]) || 0,  // 换手率
            
            // 买卖五档价格
            bid_price_1: parseFloat(fields[9]) || 0,
            bid_price_2: parseFloat(fields[11]) || 0,
            bid_price_3: parseFloat(fields[13]) || 0,
            bid_price_4: parseFloat(fields[15]) || 0,
            bid_price_5: parseFloat(fields[17]) || 0,
            
            ask_price_1: parseFloat(fields[19]) || 0,
            ask_price_2: parseFloat(fields[21]) || 0,
            ask_price_3: parseFloat(fields[23]) || 0,
            ask_price_4: parseFloat(fields[25]) || 0,
            ask_price_5: parseFloat(fields[27]) || 0,
            
            // 买卖五档数量(手)
            bid_volume_1: parseInt(fields[10]) || 0,
            bid_volume_2: parseInt(fields[12]) || 0,
            bid_volume_3: parseInt(fields[14]) || 0,
            bid_volume_4: parseInt(fields[16]) || 0,
            bid_volume_5: parseInt(fields[18]) || 0,
            
            ask_volume_1: parseInt(fields[20]) || 0,
            ask_volume_2: parseInt(fields[22]) || 0,
            ask_volume_3: parseInt(fields[24]) || 0,
            ask_volume_4: parseInt(fields[26]) || 0,
            ask_volume_5: parseInt(fields[28]) || 0,
            
            // 技术指标
            pe_ratio: parseFloat(fields[39]) || 0,        // 市盈率
            pb_ratio: parseFloat(fields[46]) || 0,        // 市净率
            market_cap: parseFloat(fields[45]) || 0,      // 总市值(亿)
            circulation_cap: parseFloat(fields[44]) || 0, // 流通市值(亿)
            amplitude: parseFloat(fields[43]) || 0,       // 振幅
            volume_ratio: parseFloat(fields[49]) || 0,    // 量比
            
            // 涨跌停价格
            limit_up: parseFloat(fields[47]) || 0,        // 涨停价
            limit_down: parseFloat(fields[48]) || 0,      // 跌停价
            
            // 内外盘
            outer_volume: parseInt(fields[7]) || 0,       // 外盘(手)
            inner_volume: parseInt(fields[8]) || 0,       // 内盘(手)
            
            // 时间信息 - 使用股票数据的真实时间戳
            stock_data_time: stockDataTime,              // 股票数据时间(ISO格式)
            beijing_time: beijingTimeStr,                // 北京时间(易读格式)
            raw_timestamp: updateTimeStr,                // 原始时间戳
            data_status: dataStatus,                     // 数据状态
            data_age_minutes: getDataAge(updateTimeStr), // 数据年龄(分钟)
            
            // 数据源信息
            data_source: 'tencent_complete_api'
        };
    } catch (error) {
        console.error('解析股票数据失败:', error);
        return null;
    }
}

function getDataStatus(hour, minute) {
    const time = hour * 100 + minute;
    
    if (time >= 930 && time <= 1130) {
        return 'trading_morning'; // 上午交易时间
    } else if (time >= 1300 && time <= 1500) {
        return 'trading_afternoon'; // 下午交易时间
    } else if (time >= 1500 && time <= 1700) {
        return 'after_hours'; // 盘后时间
    } else if (time >= 900 && time < 930) {
        return 'pre_market'; // 盘前时间
    } else {
        return 'market_closed'; // 休市时间
    }
}

function getDataAge(updateTimeStr) {
    if (!updateTimeStr || updateTimeStr.length !== 14) return 0;
    
    try {
        const year = updateTimeStr.substring(0, 4);
        const month = updateTimeStr.substring(4, 6);
        const day = updateTimeStr.substring(6, 8);
        const hour = updateTimeStr.substring(8, 10);
        const minute = updateTimeStr.substring(10, 12);
        const second = updateTimeStr.substring(12, 14);
        
        const dataTime = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`);
        const now = new Date();
        const ageMs = now.getTime() - dataTime.getTime();
        return Math.floor(ageMs / (1000 * 60)); // 转换为分钟
    } catch (error) {
        return 0;
    }
}

function getMarketStatus() {
    const now = new Date();
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const hour = beijingTime.getUTCHours();
    const minute = beijingTime.getUTCMinutes();
    const time = hour * 100 + minute;
    const weekday = beijingTime.getUTCDay();
    
    // 周末休市
    if (weekday === 0 || weekday === 6) {
        return 'weekend_closed';
    }
    
    if (time >= 930 && time <= 1130) {
        return 'trading_morning';
    } else if (time >= 1300 && time <= 1500) {
        return 'trading_afternoon';
    } else if (time >= 1500 && time <= 1700) {
        return 'after_hours';
    } else if (time >= 900 && time < 930) {
        return 'pre_market';
    } else {
        return 'market_closed';
    }
}
