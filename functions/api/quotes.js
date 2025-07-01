export async function onRequest(context) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json; charset=utf-8'
    };

    const url = new URL(context.request.url);
    const symbols = url.searchParams.get('symbols') || 'sz000001';
    const symbolList = symbols.split(',').map(s => s.trim());

    try {
        const API_KEY = 'QT_wat5QfcJ6N9pDZM5';
        const stockData = [];
        const errors = [];
        const warnings = [];
        
        for (const symbol of symbolList) {
            try {
                const realData = await fetchRealStockData(symbol, API_KEY);
                if (realData) {
                    // 数据质量检查和修复
                    const validatedData = validateAndFixStockData(realData);
                    stockData.push(validatedData);
                    
                    // 收集警告信息
                    if (validatedData.data_quality_warnings.length > 0) {
                        warnings.push(...validatedData.data_quality_warnings);
                    }
                } else {
                    errors.push(`股票 ${symbol} 数据获取失败`);
                }
            } catch (error) {
                errors.push(`股票 ${symbol} 处理异常: ${error.message}`);
            }
        }

        // 即使有部分失败，也返回成功获取的数据
        const result = {
            success: stockData.length > 0,
            api_call_time: new Date().toISOString(),
            trading_close_time: "15:00:00", // 真正的收盘时间
            data: stockData,
            symbols_requested: symbolList,
            symbols_success: stockData.length,
            symbols_failed: errors.length,
            data_source: 'real-time-api-enhanced',
            api_key: API_KEY,
            market_status: getMarketStatus(),
            data_quality: {
                total_warnings: warnings.length,
                warnings: warnings,
                errors: errors
            },
            agent_decision_ready: stockData.length > 0 && warnings.length === 0
        };

        return new Response(JSON.stringify(result, null, 2), { headers: corsHeaders });
        
    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: '系统错误: ' + error.message,
            timestamp: new Date().toISOString(),
            agent_decision_ready: false
        }, null, 2), { headers: corsHeaders });
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

        // 修复字符编码问题
        const stockName = fixChineseEncoding(fields[1] || '');
        
        // 解析时间戳
        const updateTimeStr = fields[30];
        const timeInfo = parseTimeStamp(updateTimeStr);

        return {
            // 基本信息 - 修复编码
            stock_code: symbol,
            stock_name: stockName,
            stock_name_raw: fields[1], // 保留原始数据用于调试
            
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
            volume: parseInt(fields[36]) || 0,
            amount: parseFloat(fields[37]) * 10000 || 0,
            turnover_rate: parseFloat(fields[38]) || 0,
            
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
            
            // 买卖五档数量
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
            pe_ratio: parseFloat(fields[39]) || 0,
            pb_ratio: parseFloat(fields[46]) || 0,
            market_cap: parseFloat(fields[45]) || 0,
            circulation_cap: parseFloat(fields[44]) || 0,
            amplitude: parseFloat(fields[43]) || 0,
            volume_ratio: parseFloat(fields[49]) || 0,
            
            // 涨跌停价格
            limit_up: parseFloat(fields[47]) || 0,
            limit_down: parseFloat(fields[48]) || 0,
            
            // 内外盘
            outer_volume: parseInt(fields[7]) || 0,
            inner_volume: parseInt(fields[8]) || 0,
            
            // 修正的时间信息
            trading_close_time: "15:00:00", // 真正的收盘时间
            data_update_time: timeInfo.beijingTime, // 数据更新时间
            data_timestamp: timeInfo.isoTime,
            raw_timestamp: updateTimeStr,
            data_status: timeInfo.status,
            data_age_minutes: timeInfo.ageMinutes,
            
            // 数据源信息
            data_source: 'tencent_enhanced_api'
        };
    } catch (error) {
        console.error('解析股票数据失败:', error);
        return null;
    }
}

function validateAndFixStockData(data) {
    const warnings = [];
    const fixedData = { ...data };
    
    // 1. 检查股票名称编码
    if (data.stock_name.includes('�') || data.stock_name.length < 2) {
        warnings.push(`股票名称编码异常: ${data.stock_code}`);
        fixedData.stock_name = getStockNameFallback(data.stock_code);
    }
    
    // 2. 检查市盈率异常
    if (data.pe_ratio < 0) {
        warnings.push(`市盈率为负数: ${data.pe_ratio} (可能为亏损股票)`);
        fixedData.pe_ratio_status = 'negative_earnings';
    } else if (data.pe_ratio > 1000) {
        warnings.push(`市盈率异常过高: ${data.pe_ratio}`);
        fixedData.pe_ratio_status = 'extremely_high';
    } else {
        fixedData.pe_ratio_status = 'normal';
    }
    
    // 3. 检查价格数据一致性
    if (data.current_price <= 0) {
        warnings.push(`当前价格异常: ${data.current_price}`);
    }
    
    if (data.high_price < data.low_price) {
        warnings.push(`最高价低于最低价: 高${data.high_price} 低${data.low_price}`);
    }
    
    // 4. 检查成交量异常
    if (data.volume === 0 && data.data_status === 'trading_morning') {
        warnings.push(`交易时间内成交量为0，可能停牌`);
        fixedData.trading_status = 'possibly_suspended';
    }
    
    // 5. 检查买卖盘数据
    const bidPrices = [data.bid_price_1, data.bid_price_2, data.bid_price_3, data.bid_price_4, data.bid_price_5];
    const askPrices = [data.ask_price_1, data.ask_price_2, data.ask_price_3, data.ask_price_4, data.ask_price_5];
    
    if (bidPrices.every(p => p === 0) || askPrices.every(p => p === 0)) {
        warnings.push(`买卖盘数据缺失`);
        fixedData.order_book_status = 'incomplete';
    }
    
    // 6. 数据质量评级
    let qualityScore = 100;
    qualityScore -= warnings.length * 10;
    
    if (qualityScore >= 90) fixedData.data_quality_grade = 'A';
    else if (qualityScore >= 80) fixedData.data_quality_grade = 'B';
    else if (qualityScore >= 70) fixedData.data_quality_grade = 'C';
    else fixedData.data_quality_grade = 'D';
    
    fixedData.data_quality_score = qualityScore;
    fixedData.data_quality_warnings = warnings;
    fixedData.agent_usable = qualityScore >= 70; // Agent可用性标识
    
    return fixedData;
}

function fixChineseEncoding(rawName) {
    // 常见股票名称映射
    const nameMap = {
        'ƽ������': '平安银行',
        '����ę́': '贵州茅台',
        '�� �ƣ�': '万科A',
        '������': '浦发银行',
        '������': '招商银行'
    };
    
    return nameMap[rawName] || rawName;
}

function getStockNameFallback(stockCode) {
    const codeMap = {
        'sz000001': '平安银行',
        'sh600519': '贵州茅台',
        'sz000002': '万科A',
        'sh600000': '浦发银行',
        'sh600036': '招商银行',
        'sh000001': '上证指数',
        'sz399001': '深证成指'
    };
    
    return codeMap[stockCode] || `股票${stockCode}`;
}

function parseTimeStamp(updateTimeStr) {
    if (!updateTimeStr || updateTimeStr.length !== 14) {
        return {
            beijingTime: '数据时间未知',
            isoTime: new Date().toISOString(),
            status: 'unknown',
            ageMinutes: 0
        };
    }
    
    try {
        const year = updateTimeStr.substring(0, 4);
        const month = updateTimeStr.substring(4, 6);
        const day = updateTimeStr.substring(6, 8);
        const hour = updateTimeStr.substring(8, 10);
        const minute = updateTimeStr.substring(10, 12);
        const second = updateTimeStr.substring(12, 14);
        
        const beijingTime = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
        const dataTime = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`);
        const now = new Date();
        const ageMinutes = Math.floor((now.getTime() - dataTime.getTime()) / (1000 * 60));
        
        // 判断数据状态 - 基于15:00收盘时间
        let status = 'market_closed';
        const timeNum = parseInt(hour) * 100 + parseInt(minute);
        
        if (timeNum >= 930 && timeNum <= 1130) status = 'trading_morning';
        else if (timeNum >= 1300 && timeNum <= 1500) status = 'trading_afternoon';
        else if (timeNum > 1500 && timeNum <= 1600) status = 'after_hours_processing';
        else status = 'market_closed';
        
        return {
            beijingTime,
            isoTime: dataTime.toISOString(),
            status,
            ageMinutes
        };
    } catch (error) {
        return {
            beijingTime: '时间解析失败',
            isoTime: new Date().toISOString(),
            status: 'error',
            ageMinutes: 0
        };
    }
}

function getMarketStatus() {
    const now = new Date();
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const hour = beijingTime.getUTCHours();
    const minute = beijingTime.getUTCMinutes();
    const time = hour * 100 + minute;
    const weekday = beijingTime.getUTCDay();
    
    if (weekday === 0 || weekday === 6) return 'weekend_closed';
    
    if (time >= 930 && time <= 1130) return 'trading_morning';
    else if (time >= 1300 && time <= 1500) return 'trading_afternoon';
    else if (time > 1500 && time <= 1600) return 'after_hours_processing';
    else return 'market_closed';
}
