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

        // 计算整体数据质量
        const overallQuality = calculateOverallQuality(stockData, warnings, errors);

        const result = {
            success: stockData.length > 0,
            api_call_time: new Date().toISOString(),
            trading_close_time: "15:00:00",
            data: stockData,
            symbols_requested: symbolList,
            symbols_success: stockData.length,
            symbols_failed: errors.length,
            data_source: 'real-time-api-v2-enhanced',
            api_key: API_KEY,
            market_status: getMarketStatus(),
            data_quality: {
                overall_grade: overallQuality.grade,
                overall_score: overallQuality.score,
                total_warnings: warnings.length,
                warnings: warnings,
                errors: errors,
                critical_issues: overallQuality.criticalIssues
            },
            agent_decision_ready: overallQuality.agentReady,
            agent_recommendations: overallQuality.recommendations
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

        // 验证字段解析正确性
        const fieldValidation = validateFieldParsing(fields, symbol);
        
        // 修复字符编码并获取正确的股票名称
        const stockName = getCorrectStockName(symbol, fields[1]);
        
        // 解析时间戳
        const updateTimeStr = fields[30];
        const timeInfo = parseTimeStamp(updateTimeStr);

        // 判断股票类型
        const stockType = determineStockType(symbol);

        return {
            // 基本信息 - 完全修复
            stock_code: symbol,
            stock_name: stockName.corrected,
            stock_name_confidence: stockName.confidence,
            stock_name_raw: fields[1],
            stock_type: stockType,
            
            // 价格信息 - 验证合理性
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
            
            // 买卖五档 - 根据股票类型处理
            ...parseBidAskData(fields, stockType),
            
            // 技术指标 - 特殊值处理
            pe_ratio: parseFloat(fields[39]) || 0,
            pb_ratio: parseFloat(fields[46]) || 0,
            market_cap: parseFloat(fields[45]) || 0,
            circulation_cap: parseFloat(fields[44]) || 0,
            amplitude: parseFloat(fields[43]) || 0,
            volume_ratio: parseFloat(fields[49]) || 0,
            
            // 涨跌停价格 - 指数特殊处理
            ...parseLimitPrices(fields, stockType),
            
            // 内外盘
            outer_volume: parseInt(fields[7]) || 0,
            inner_volume: parseInt(fields[8]) || 0,
            
            // 修正的时间信息
            trading_close_time: "15:00:00",
            data_update_time: timeInfo.beijingTime,
            data_timestamp: timeInfo.isoTime,
            raw_timestamp: updateTimeStr,
            data_status: timeInfo.status,
            data_age_minutes: timeInfo.ageMinutes,
            
            // 字段验证信息
            field_validation: fieldValidation,
            
            // 数据源信息
            data_source: 'tencent_enhanced_v2'
        };
    } catch (error) {
        console.error('解析股票数据失败:', error);
        return null;
    }
}

function getCorrectStockName(symbol, rawName) {
    // 完整的股票名称数据库
    const stockNameDB = {
        // 主板股票
        'sz000001': '平安银行',
        'sz000002': '万科A',
        'sh600000': '浦发银行',
        'sh600036': '招商银行',
        'sh600519': '贵州茅台',
        
        // 创业板
        'sz300001': '特锐德',
        
        // 科创板
        'sh688001': '华兴源创',
        
        // 北交所
        'bj430047': '诺思兰德',
        
        // 指数
        'sh000001': '上证指数',
        'sz399001': '深证成指',
        'sz399006': '创业板指',
        
        // B股
        'sz200001': '深物业B'
    };

    const correctName = stockNameDB[symbol];
    
    if (correctName) {
        return {
            corrected: correctName,
            confidence: 'high',
            source: 'database'
        };
    }

    // 尝试修复编码问题
    const fixedName = fixChineseEncoding(rawName);
    if (fixedName !== rawName) {
        return {
            corrected: fixedName,
            confidence: 'medium',
            source: 'encoding_fix'
        };
    }

    // 生成默认名称
    return {
        corrected: generateDefaultName(symbol),
        confidence: 'low',
        source: 'generated'
    };
}

function determineStockType(symbol) {
    if (symbol.startsWith('sh000') || symbol.startsWith('sz399')) {
        return 'index';
    } else if (symbol.startsWith('sz300') || symbol.startsWith('sz301')) {
        return 'gem'; // 创业板
    } else if (symbol.startsWith('sh688') || symbol.startsWith('sh689')) {
        return 'star'; // 科创板
    } else if (symbol.startsWith('bj') || symbol.startsWith('nq')) {
        return 'bse'; // 北交所
    } else if (symbol.includes('200') || symbol.includes('900')) {
        return 'b_share'; // B股
    } else {
        return 'main_board'; // 主板
    }
}

function parseBidAskData(fields, stockType) {
    // 指数没有买卖盘数据，这是正常的
    if (stockType === 'index') {
        return {
            bid_price_1: null, bid_price_2: null, bid_price_3: null, bid_price_4: null, bid_price_5: null,
            ask_price_1: null, ask_price_2: null, ask_price_3: null, ask_price_4: null, ask_price_5: null,
            bid_volume_1: null, bid_volume_2: null, bid_volume_3: null, bid_volume_4: null, bid_volume_5: null,
            ask_volume_1: null, ask_volume_2: null, ask_volume_3: null, ask_volume_4: null, ask_volume_5: null,
            order_book_available: false,
            order_book_reason: '指数无买卖盘数据'
        };
    }

    return {
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
        
        order_book_available: true,
        order_book_reason: null
    };
}

function parseLimitPrices(fields, stockType) {
    const limitUp = parseFloat(fields[47]) || 0;
    const limitDown = parseFloat(fields[48]) || 0;
    
    // 指数没有涨跌停限制
    if (stockType === 'index') {
        return {
            limit_up: null,
            limit_down: null,
            has_price_limit: false,
            price_limit_reason: '指数无涨跌停限制'
        };
    }

    // 检查是否为有效的涨跌停价格
    if (limitUp <= 0 || limitDown <= 0 || limitUp === -1 || limitDown === -1) {
        return {
            limit_up: null,
            limit_down: null,
            has_price_limit: false,
            price_limit_reason: '涨跌停价格数据异常'
        };
    }

    return {
        limit_up: limitUp,
        limit_down: limitDown,
        has_price_limit: true,
        price_limit_reason: null
    };
}

function validateFieldParsing(fields, symbol) {
    const issues = [];
    
    // 检查字段数量
    if (fields.length < 50) {
        issues.push(`字段数量不足: ${fields.length}/50+`);
    }
    
    // 检查关键字段的合理性
    const price = parseFloat(fields[3]);
    const volume = parseInt(fields[36]);
    
    if (price <= 0) {
        issues.push('当前价格异常');
    }
    
    if (volume < 0) {
        issues.push('成交量异常');
    }
    
    // 检查股票代码匹配
    const codeInData = fields[2];
    const expectedCode = symbol.replace(/^(sh|sz|bj)/, '');
    if (codeInData && codeInData !== expectedCode) {
        issues.push(`股票代码不匹配: 期望${expectedCode}, 实际${codeInData}`);
    }
    
    return {
        is_valid: issues.length === 0,
        issues: issues,
        confidence: issues.length === 0 ? 'high' : issues.length <= 2 ? 'medium' : 'low'
    };
}

function validateAndFixStockData(data) {
    const warnings = [];
    const fixedData = { ...data };
    
    // 1. 检查股票名称
    if (data.stock_name_confidence === 'low') {
        warnings.push(`股票名称置信度低: ${data.stock_code}`);
    }
    
    // 2. 检查市盈率 - 更智能的处理
    if (data.pe_ratio < 0) {
        warnings.push(`市盈率为负数: ${data.pe_ratio} (亏损股票)`);
        fixedData.pe_ratio_status = 'negative_earnings';
        fixedData.financial_health = 'loss_making';
    } else if (data.pe_ratio > 100) {
        warnings.push(`市盈率过高: ${data.pe_ratio} (高估值或微利)`);
        fixedData.pe_ratio_status = 'extremely_high';
        fixedData.financial_health = 'high_valuation';
    } else if (data.pe_ratio === 0) {
        fixedData.pe_ratio_status = 'no_data';
        fixedData.financial_health = 'unknown';
    } else {
        fixedData.pe_ratio_status = 'normal';
        fixedData.financial_health = 'profitable';
    }
    
    // 3. 检查价格数据一致性
    if (data.high_price < data.low_price && data.high_price > 0 && data.low_price > 0) {
        warnings.push(`价格数据异常: 最高价${data.high_price} < 最低价${data.low_price}`);
    }
    
    // 4. 检查指数特殊情况
    if (data.stock_type === 'index') {
        if (!data.order_book_available) {
            // 指数没有买卖盘是正常的，不算警告
        }
        if (!data.has_price_limit) {
            // 指数没有涨跌停是正常的，不算警告
        }
    } else {
        // 非指数股票的检查
        if (!data.order_book_available) {
            warnings.push(`买卖盘数据缺失: ${data.stock_code}`);
        }
        
        if (data.volume === 0 && data.data_status.includes('trading')) {
            warnings.push(`交易时间内成交量为0，可能停牌: ${data.stock_code}`);
            fixedData.trading_status = 'possibly_suspended';
        }
    }
    
    // 5. 字段验证问题
    if (data.field_validation && !data.field_validation.is_valid) {
        warnings.push(`数据解析问题: ${data.field_validation.issues.join(', ')}`);
    }
    
    // 6. 数据质量评级 - 更精确的算法
    let qualityScore = 100;
    
    // 根据不同类型的问题扣分
    warnings.forEach(warning => {
        if (warning.includes('股票名称')) qualityScore -= 5;
        else if (warning.includes('市盈率')) qualityScore -= 3;
        else if (warning.includes('价格数据异常')) qualityScore -= 15;
        else if (warning.includes('数据解析问题')) qualityScore -= 20;
        else qualityScore -= 5;
    });
    
    // 根据股票类型调整评分标准
    if (data.stock_type === 'index') {
        qualityScore += 10; // 指数数据标准不同
    }
    
    if (qualityScore >= 95) fixedData.data_quality_grade = 'A+';
    else if (qualityScore >= 90) fixedData.data_quality_grade = 'A';
    else if (qualityScore >= 80) fixedData.data_quality_grade = 'B';
    else if (qualityScore >= 70) fixedData.data_quality_grade = 'C';
    else fixedData.data_quality_grade = 'D';
    
    fixedData.data_quality_score = Math.max(0, qualityScore);
    fixedData.data_quality_warnings = warnings;
    fixedData.agent_usable = qualityScore >= 75; // 提高Agent使用标准
    
    return fixedData;
}

function calculateOverallQuality(stockData, warnings, errors) {
    if (stockData.length === 0) {
        return {
            grade: 'F',
            score: 0,
            agentReady: false,
            criticalIssues: ['无可用数据'],
            recommendations: ['检查股票代码有效性', '验证数据源连接']
        };
    }
    
    const avgScore = stockData.reduce((sum, stock) => sum + stock.data_quality_score, 0) / stockData.length;
    const highQualityCount = stockData.filter(stock => stock.data_quality_score >= 90).length;
    const usableCount = stockData.filter(stock => stock.agent_usable).length;
    
    const criticalIssues = [];
    const recommendations = [];
    
    // 检查关键问题
    const nameIssues = warnings.filter(w => w.includes('股票名称')).length;
    if (nameIssues > stockData.length * 0.5) {
        criticalIssues.push('超过50%股票名称编码异常');
        recommendations.push('修复字符编码问题');
    }
    
    const parseIssues = warnings.filter(w => w.includes('数据解析')).length;
    if (parseIssues > 0) {
        criticalIssues.push('数据解析存在问题');
        recommendations.push('验证API字段映射');
    }
    
    let overallGrade;
    if (avgScore >= 95) overallGrade = 'A+';
    else if (avgScore >= 90) overallGrade = 'A';
    else if (avgScore >= 80) overallGrade = 'B';
    else if (avgScore >= 70) overallGrade = 'C';
    else overallGrade = 'D';
    
    const agentReady = usableCount >= stockData.length * 0.8 && criticalIssues.length === 0;
    
    if (!agentReady) {
        recommendations.push('提高数据质量后再进行Agent决策');
    }
    
    return {
        grade: overallGrade,
        score: Math.round(avgScore),
        agentReady,
        criticalIssues,
        recommendations,
        usableDataRatio: usableCount / stockData.length
    };
}

function fixChineseEncoding(rawName) {
    const nameMap = {
        'ƽ������': '平安银行',
        '����ę́': '贵州茅台',
        '�� �ƣ�': '万科A',
        '������': '浦发银行',
        '������': '招商银行',
        '�����': '特锐德',
        '����Դ��': '华兴源创',
        'ŵ˼����': '诺思兰德',
        '��ָ֤��': '上证指数',
        '��֤��ָ': '深证成指',
        '��ҵ��ָ': '创业板指'
    };
    
    return nameMap[rawName] || rawName;
}

function generateDefaultName(symbol) {
    const typeMap = {
        'sz000': '深市主板',
        'sz300': '创业板',
        'sh600': '沪市主板',
        'sh688': '科创板',
        'bj': '北交所',
        'sh000': '上证指数',
        'sz399': '深证指数'
    };
    
    for (const [prefix, type] of Object.entries(typeMap)) {
        if (symbol.startsWith(prefix)) {
            return `${type}股票${symbol}`;
        }
    }
    
    return `股票${symbol}`;
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
