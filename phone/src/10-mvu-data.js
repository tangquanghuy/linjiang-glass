// ==================== MVU变量框架数据管理 ====================

/**
 * 【新增】直接从聊天记录获取最新MVU数据（不受更新时序影响）
 * 跟 MVU 源码的 getLastValidVariable 实现方式一样
 * @returns {object|null} - MVU数据对象，如果找不到返回null
 */
function getLatestMvuDataFromChat() {
    try {
        const chat = SillyTavern?.chat;
        if (!chat || chat.length === 0) return null;

        // 从后往前找第一个有 stat_data 的消息
        for (let i = chat.length - 1; i >= 0; i--) {
            const msg = chat[i];
            const swipeId = msg.swipe_id ?? 0;
            const variables = _.get(msg, ['variables', swipeId]);
            if (variables && _.has(variables, 'stat_data')) {
                return variables;
            }
        }
        return null;
    } catch (error) {
        console.warn('[手机状态栏] 从chat获取MVU数据失败:', error);
        return null;
    }
}

/**
 * 从MVU数据对象中提取实际的游戏数据
 * 兼容两种数据结构：
 * 1. 数据在 stat_data 键下（旧版本）
 * 2. 数据直接在根级别（MVU Zod 格式）
 * @param {object} mvuData - MVU返回的数据对象
 * @returns {object} - 提取的游戏数据
 */
function extractMvuGameData(mvuData) {
    if (!mvuData || typeof mvuData !== 'object') {
        return {};
    }

    /* 优先检查 stat_data 路径 */
    const statData = _.get(mvuData, 'stat_data', null);
    if (statData && typeof statData === 'object' && Object.keys(statData).length > 0) {
        return statData;
    }

    /* 如果 stat_data 为空，检查数据是否直接在根级别 */
    const dataKeys = Object.keys(mvuData).filter(k => !k.startsWith('$') && k !== 'stat_data');
    if (dataKeys.length > 0) {
        return mvuData;
    }

    return {};
}

/**
 * 【核心函数】获取最新的MVU游戏数据
 * 所有需要获取MVU数据的地方都应该调用此函数
 * 优先从 SillyTavern.chat 直接获取，不受变量更新时序影响
 * @param {boolean} updateGlobal - 是否更新全局 currentPhoneData，默认 true
 * @returns {object} - 游戏数据对象
 */
function fetchLatestMvuData(updateGlobal = true) {
    let gameData = {};

    try {
        /* 【优先】直接从 SillyTavern.chat 获取，不受更新时序影响 */
        const chatMvuData = getLatestMvuDataFromChat();
        if (chatMvuData) {
            gameData = extractMvuGameData(chatMvuData);
        }

        /* 降级：使用 Mvu.getMvuData 获取数据 */
        if (Object.keys(gameData).length === 0 && typeof Mvu !== 'undefined' && Mvu.getMvuData) {
            /* 尝试从最新消息获取 */
            const mvuData = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
            gameData = extractMvuGameData(mvuData);

            /* 如果消息级别没有数据，尝试从chat级别获取 */
            if (Object.keys(gameData).length === 0) {
                const chatData = Mvu.getMvuData({ type: 'chat' });
                gameData = extractMvuGameData(chatData);
            }
        }

        /* 降级：使用旧的 getVariables 方法 */
        if (Object.keys(gameData).length === 0 && typeof getVariables === 'function') {
            const chatVars = getVariables({ type: 'chat' }) || {};
            gameData = extractMvuGameData(chatVars);
        }

        /* 更新全局变量 */
        if (updateGlobal && Object.keys(gameData).length > 0) {
            currentPhoneData = gameData;
        }

    } catch (error) {
        console.error('[手机状态栏] 获取MVU数据失败:', error);
    }

    return gameData;
}

/**
 * 刷新全局数据并更新UI
 */
function refreshPhoneData() {
    const gameData = fetchLatestMvuData(true);
    if (Object.keys(gameData).length > 0) {
        updatePhoneData(gameData);
    }
    return gameData;
}

// ==================== MVU变量框架事件监听 ====================
function registerMvuEventListeners() {
    /* 使用MVU变量框架，数据将在打开应用时按需获取 */
}

// 加载初始MVU数据
function loadInitialMvuData() {
    const gameData = fetchLatestMvuData(true);
    if (Object.keys(gameData).length > 0) {
        updatePhoneData(gameData);
        return true;
    }
    return false;
}

