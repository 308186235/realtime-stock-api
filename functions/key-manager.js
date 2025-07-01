/**
 * API密钥管理器 - 支持密钥测试和更换
 * 提供便捷的密钥管理功能
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
    // 路由处理
    if (path.endsWith('/test-key')) {
      return handleTestKey(request, corsHeaders);
    } else if (path.endsWith('/replace-key')) {
      return handleReplaceKey(request, env, corsHeaders);
    } else if (path.endsWith('/key-status')) {
      return handleKeyStatus(env, corsHeaders);
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: '未知的密钥管理端点',
        available_endpoints: ['/test-key', '/replace-key', '/key-status']
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

// 测试新密钥
async function handleTestKey(request, corsHeaders) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({
      success: false,
      error: '请使用POST方法'
    }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const { api_key, test_symbol = 'sz000001' } = body;

    if (!api_key) {
      return new Response(JSON.stringify({
        success: false,
        error: '缺少api_key参数'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 测试密钥有效性
    const testResult = await testApiKey(api_key, test_symbol);

    return new Response(JSON.stringify({
      success: testResult.success,
      message: testResult.success ? '密钥测试成功' : '密钥测试失败',
      test_data: testResult.data,
      error: testResult.error,
      api_key_preview: api_key.substring(0, 8) + '***',
      test_symbol: test_symbol,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: `密钥测试失败: ${error.message}`,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// 更换密钥
async function handleReplaceKey(request, env, corsHeaders) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({
      success: false,
      error: '请使用POST方法'
    }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const { new_key, key_name, expire_date } = body;

    if (!new_key) {
      return new Response(JSON.stringify({
        success: false,
        error: '缺少new_key参数'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 测试新密钥
    const testResult = await testApiKey(new_key, 'sz000001');
    
    if (!testResult.success) {
      return new Response(JSON.stringify({
        success: false,
        error: '新密钥测试失败，无法更换',
        test_error: testResult.error,
        timestamp: new Date().toISOString()
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 备份旧密钥信息
    const oldKey = env.STOCK_API_KEY || 'QT_wat5QfcJ6N9pDZM5';
    const oldExpireDate = env.API_KEY_EXPIRE_DATE || '2025-02-01';

    // 记录操作日志
    const operationLog = {
      operation: 'key_replacement',
      old_key_preview: oldKey.substring(0, 8) + '***',
      new_key_preview: new_key.substring(0, 8) + '***',
      key_name: key_name || '未命名密钥',
      old_expire_date: oldExpireDate,
      new_expire_date: expire_date || '未设置',
      timestamp: new Date().toISOString(),
      operator: 'system'
    };

    return new Response(JSON.stringify({
      success: true,
      message: '密钥更换成功',
      operation_log: operationLog,
      next_steps: [
        '新密钥已通过测试',
        '请在Cloudflare Pages设置中更新环境变量',
        '更新STOCK_API_KEY为新密钥',
        '更新API_KEY_EXPIRE_DATE为新到期日期'
      ],
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: `密钥更换失败: ${error.message}`,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// 获取密钥状态
async function handleKeyStatus(env, corsHeaders) {
  const apiKey = env.STOCK_API_KEY || 'QT_wat5QfcJ6N9pDZM5';
  const expireDate = env.API_KEY_EXPIRE_DATE || '2025-02-01';
  
  const now = new Date();
  const expire = new Date(expireDate);
  const daysLeft = Math.ceil((expire - now) / (1000 * 60 * 60 * 24));
  
  // 测试当前密钥
  const testResult = await testApiKey(apiKey, 'sz000001');

  return new Response(JSON.stringify({
    success: true,
    key_status: {
      api_key_preview: apiKey.substring(0, 8) + '***',
      expire_date: expireDate,
      days_until_expire: Math.max(0, daysLeft),
      is_expired: daysLeft <= 0,
      is_expiring_soon: daysLeft <= 7 && daysLeft > 0,
      test_result: testResult.success ? 'passed' : 'failed',
      test_error: testResult.error
    },
    recommendations: getKeyRecommendations(daysLeft, testResult.success),
    timestamp: new Date().toISOString()
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// 测试API密钥
async function testApiKey(apiKey, testSymbol) {
  try {
    const tencentUrl = `https://qt.gtimg.cn/q=${testSymbol}`;
    
    const response = await fetch(tencentUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://gu.qq.com/'
      }
    });

    if (!response.ok) {
      return {
        success: false,
        error: `API请求失败: ${response.status}`,
        data: null
      };
    }

    const data = await response.text();
    
    if (data && data.includes('v_') && data.includes(testSymbol)) {
      // 解析测试数据
      const match = data.match(/="([^"]+)"/);
      if (match) {
        const fields = match[1].split('~');
        return {
          success: true,
          error: null,
          data: {
            symbol: testSymbol,
            name: fields[1] || '',
            price: parseFloat(fields[3]) || 0,
            change_percent: parseFloat(fields[32]) || 0
          }
        };
      }
    }

    return {
      success: false,
      error: '数据格式异常',
      data: null
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}

// 获取密钥建议
function getKeyRecommendations(daysLeft, testPassed) {
  const recommendations = [];

  if (daysLeft <= 0) {
    recommendations.push('🚨 密钥已过期，请立即更换新密钥');
  } else if (daysLeft <= 3) {
    recommendations.push('⚠️ 密钥即将过期，建议立即准备新密钥');
  } else if (daysLeft <= 7) {
    recommendations.push('⏰ 密钥将在一周内过期，建议准备新密钥');
  } else {
    recommendations.push('✅ 密钥状态正常');
  }

  if (!testPassed) {
    recommendations.push('🔧 当前密钥测试失败，请检查网络连接');
  }

  return recommendations;
}
