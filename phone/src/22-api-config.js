// ==================== 独立 API 配置管理器（参考凡人.html变量思考API设置逻辑） ====================
// ==================== 独立 API 配置管理器（参考凡人.html变量思考API设置逻辑） ====================
class PhoneAPIConfig {
    constructor() {
        this.settings = {
            enabled: false,
            apiUrl: '',
            apiKey: '',
            model: '',
            // 自动生成论坛配置
            autoGenerate: {
                enabled: false,        // 是否启用自动生成
                threshold: 10,         // 触发阈值（楼层数）
                showNotification: true // 是否显示弹窗通知
            }
        };
        this.loadSettings();

        // 自动生成状态
        this.autoGenerateState = {
            lastMessageCount: 0,       // 上次记录的消息数量
            isGenerating: false,       // 是否正在生成中
            messagesSinceLastGen: 0    // 自上次生成以来的消息数
        };
    }

    loadSettings() {
        // 从localStorage读取配置（参考凡人.html的loadConfigIntoModal）
        this.settings.enabled = localStorage.getItem('forum_api_enabled_v2') === 'true';
        this.settings.apiUrl = localStorage.getItem('forum_api_url_v2') || '';
        this.settings.apiKey = localStorage.getItem('forum_api_key_v2') || '';
        this.settings.model = localStorage.getItem('forum_api_model_v2') || '';

        // 读取自动生成配置
        const autoGenSaved = localStorage.getItem('forum_auto_generate_v2');
        if (autoGenSaved) {
            try {
                this.settings.autoGenerate = { ...this.settings.autoGenerate, ...JSON.parse(autoGenSaved) };
            } catch (e) {
                console.warn('[论坛API] 读取自动生成配置失败:', e);
            }
        }
    }

    saveSettings() {
        // 保存到localStorage（参考凡人.html的saveThinkingApiConfig）
        localStorage.setItem('forum_api_enabled_v2', this.settings.enabled);
        localStorage.setItem('forum_api_url_v2', this.settings.apiUrl);
        localStorage.setItem('forum_api_key_v2', this.settings.apiKey);
        localStorage.setItem('forum_api_model_v2', this.settings.model);

        // 保存自动生成配置
        localStorage.setItem('forum_auto_generate_v2', JSON.stringify(this.settings.autoGenerate));
    }

    isAvailable() {
        return this.settings.enabled && this.settings.apiUrl && this.settings.apiKey && this.settings.model;
    }

    // 检查是否应该自动生成论坛
    shouldAutoGenerate() {
        const canGenerate = this.isAvailable() &&
            this.settings.autoGenerate.enabled &&
            !this.autoGenerateState.isGenerating;
        console.log('[论坛自动生成] shouldAutoGenerate检查:', {
            isAvailable: this.isAvailable(),
            autoGenerateEnabled: this.settings.autoGenerate.enabled,
            isGenerating: this.autoGenerateState.isGenerating,
            result: canGenerate
        });
        return canGenerate;
    }

    // 重置自动生成计数器
    resetAutoGenerateCounter() {
        this.autoGenerateState.messagesSinceLastGen = 0;
        this.autoGenerateState.lastMessageCount = getCurrentMessageCount();
        console.log('[论坛自动生成] 计数器已重置');
    }

    // 增加消息计数并检查是否需要触发自动生成
    incrementMessageCount() {
        if (!this.shouldAutoGenerate()) return false;

        this.autoGenerateState.messagesSinceLastGen++;

        console.log('[论坛自动生成] 消息计数:', {
            messagesSinceLastGen: this.autoGenerateState.messagesSinceLastGen,
            threshold: this.settings.autoGenerate.threshold,
            shouldTrigger: this.autoGenerateState.messagesSinceLastGen >= this.settings.autoGenerate.threshold
        });

        if (this.autoGenerateState.messagesSinceLastGen >= this.settings.autoGenerate.threshold) {
            return true; // 需要触发自动生成
        }
        return false;
    }

    // ========== API调用方法 ==========
    async callAPI(messages, usePreset = true, chatHistory = '') {
        if (!this.isAvailable()) {
            throw new Error('API配置不完整，请先在设置中填写API URL、API Key和模型');
        }

        const { apiUrl, apiKey, model } = this.settings;
        const targetWindow = window.parent || window;
        const TavernHelper = targetWindow.TavernHelper;

        // 构建最终的messages数组，按预设顺序组织
        let finalMessages = [];

        // 获取世界书内容（如果启用预设）
        let worldInfoBefore = []; // 角色定义之前的世界书条目
        let worldInfoAfter = [];  // 角色定义之后的世界书条目

        if (usePreset && TavernHelper) {
            try {
                // 只获取角色卡绑定的世界书
                const charWorldbooks = typeof TavernHelper.getCharWorldbookNames === 'function'
                    ? TavernHelper.getCharWorldbookNames('current')
                    : { primary: null, additional: [] };

                // 合并角色卡的主世界书和附加世界书
                const worldbookNames = [
                    ...(charWorldbooks.primary ? [charWorldbooks.primary] : []),
                    ...charWorldbooks.additional
                ];

                // 获取每个世界书的内容
                for (const wbName of worldbookNames) {
                    if (typeof TavernHelper.getWorldbook === 'function') {
                        try {
                            const entries = await TavernHelper.getWorldbook(wbName);
                            entries
                                .filter(entry => entry.enabled && entry.content)
                                .forEach(entry => {
                                    let shouldActivate = false;

                                    // 蓝灯(constant)始终激活
                                    if (entry.strategy.type === 'constant') {
                                        shouldActivate = true;
                                    }
                                    // 绿灯(selective)需要关键词匹配
                                    else if (entry.strategy.type === 'selective' && chatHistory) {
                                        // 检查主要关键字是否匹配
                                        const primaryKeys = entry.strategy.keys || [];
                                        const matchesPrimary = primaryKeys.some(key => {
                                            if (key instanceof RegExp) {
                                                return key.test(chatHistory);
                                            }
                                            return chatHistory.includes(key);
                                        });

                                        if (matchesPrimary) {
                                            // 检查次要关键字
                                            const secondary = entry.strategy.keys_secondary;
                                            if (!secondary || !secondary.keys || secondary.keys.length === 0) {
                                                shouldActivate = true;
                                            } else {
                                                const secondaryMatches = secondary.keys.map(key => {
                                                    if (key instanceof RegExp) {
                                                        return key.test(chatHistory);
                                                    }
                                                    return chatHistory.includes(key);
                                                });

                                                switch (secondary.logic) {
                                                    case 'and_any':
                                                        shouldActivate = secondaryMatches.some(m => m);
                                                        break;
                                                    case 'and_all':
                                                        shouldActivate = secondaryMatches.every(m => m);
                                                        break;
                                                    case 'not_all':
                                                        shouldActivate = !secondaryMatches.every(m => m);
                                                        break;
                                                    case 'not_any':
                                                        shouldActivate = !secondaryMatches.some(m => m);
                                                        break;
                                                    default:
                                                        shouldActivate = true;
                                                }
                                            }
                                        }
                                    }

                                    if (shouldActivate) {
                                        const msg = {
                                            role: entry.position.role || 'system',
                                            content: entry.content
                                        };
                                        // 根据插入位置分类
                                        if (entry.position.type === 'before_character_definition' ||
                                            entry.position.type === 'before_example_messages') {
                                            worldInfoBefore.push(msg);
                                        } else {
                                            worldInfoAfter.push(msg);
                                        }
                                    }
                                });
                        } catch (e) {
                            console.warn(`[论坛API] 获取世界书 ${wbName} 失败:`, e.message);
                        }
                    }
                }
            } catch (e) {
                console.warn('[论坛API] 获取世界书列表失败:', e.message);
            }
        }

        // 尝试通过TavernHelper获取酒馆预设的prompts
        if (usePreset && TavernHelper && typeof TavernHelper.getPreset === 'function') {
            try {
                const preset = TavernHelper.getPreset('in_use');

                // 遍历预设中已启用的提示词，按顺序处理
                if (preset && preset.prompts) {
                    preset.prompts
                        .filter(p => p.enabled)
                        .forEach(prompt => {
                            // 处理占位符提示词
                            if (prompt.id === 'worldInfoBefore') {
                                // 插入世界书（角色定义之前）
                                finalMessages.push(...worldInfoBefore);
                            } else if (prompt.id === 'worldInfoAfter') {
                                // 插入世界书（角色定义之后）
                                finalMessages.push(...worldInfoAfter);
                            } else if (prompt.content) {
                                // 普通提示词和系统提示词
                                finalMessages.push({
                                    role: prompt.role || 'user',
                                    content: prompt.content
                                });
                            }
                            // 其他占位符（charDescription, chatHistory等）暂时跳过
                        });
                }
            } catch (e) {
                console.warn('[论坛API] 获取酒馆预设失败:', e.message);
            }
        }

        // 添加传入的messages（论坛生成的提示词）
        messages.forEach(msg => {
            finalMessages.push({
                role: msg.role || 'user',
                content: msg.content
            });
        });

        // 构建请求URL
        let requestUrl = apiUrl.trim();
        if (!requestUrl.endsWith('/')) {
            requestUrl += '/';
        }
        if (!requestUrl.endsWith('/v1/')) {
            requestUrl += 'v1/';
        }
        requestUrl += 'chat/completions';

        // 尝试从预设获取温度设置
        let temperature = 0.8;
        let maxTokens = 5000;
        if (usePreset && TavernHelper && typeof TavernHelper.getPreset === 'function') {
            try {
                const preset = TavernHelper.getPreset('in_use');
                if (preset && preset.settings) {
                    temperature = preset.settings.temperature || 0.8;
                    maxTokens = preset.settings.max_completion_tokens || 5000;
                }
            } catch (e) {
                // 使用默认值
            }
        }

        const requestBody = {
            model: model,
            messages: finalMessages,
            temperature: temperature,
            max_tokens: maxTokens
        };

        // 打印最终发送的完整提示词
        console.log('[论坛API] 最终发送的提示词:', finalMessages);

        try {
            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API调用失败: HTTP ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            const result = data.choices?.[0]?.message?.content;

            if (!result) {
                throw new Error('API响应格式错误：未找到生成的内容');
            }

            return result;

        } catch (error) {
            console.error('[论坛API] 调用失败:', error);
            throw error;
        }
    }

    // ========== 测试连接（参考凡人.html） ==========
    async testConnection(apiUrl, apiKey, model) {
        if (!apiUrl || !apiKey || !model) {
            return {
                success: false,
                error: '请填写完整的 API 配置信息（地址、密钥、模型）'
            };
        }

        // 简单测试：发送一个测试消息
        const testMessages = [
            { role: 'user', content: 'Hello! This is a test message. Please reply with "OK".' }
        ];

        // 临时保存当前配置
        const originalSettings = { ...this.settings };

        // 使用测试配置
        this.settings.apiUrl = apiUrl;
        this.settings.apiKey = apiKey;
        this.settings.model = model;
        this.settings.enabled = true;

        try {
            // 测试连接时不使用预设和世界书（usePreset=false）
            await this.callAPI(testMessages, false, '');
            // 恢复原配置
            this.settings = originalSettings;
            return { success: true };
        } catch (error) {
            // 恢复原配置
            this.settings = originalSettings;
            return {
                success: false,
                error: error.message
            };
        }
    }
}

