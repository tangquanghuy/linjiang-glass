// ==================== 全局变量 ====================
let currentPhoneData = null;
let currentPanel = null;

// 导航栈，用于处理多级页面
let navigationStack = [];

//  好友列表导航记忆
let friendsListScrollPosition = 0; // 好友列表滚动位置
let lastViewedFriend = null; // 最后查看的好友名称
let friendDetailScrollPosition = 0; //  好友详情页的滚动位置

/**
 * 判断对象中是否存在有效的联系人项
 */
function hasContactEntries(obj) {
    if (!obj || typeof obj !== 'object') return false;
    return Object.keys(obj).length > 0;
}

/**
 * 获取当前可用的联系人数据源（使用变量脚本的羁绊列表）
 */
function getRelationshipDataSource(source = currentPhoneData) {
    /* 优先从传入的source获取羁绊列表 */
    if (source && hasContactEntries(source.羁绊列表)) {
        return source.羁绊列表;
    }

    /* 优先复用统一的最新MVU取数逻辑，兼容 chat / message / 旧版变量接口 */
    if (typeof fetchLatestMvuData === 'function') {
        try {
            const latestGameData = fetchLatestMvuData(false);
            if (latestGameData && hasContactEntries(latestGameData.羁绊列表)) {
                return latestGameData.羁绊列表;
            }
        } catch (e) {
            console.warn('[手机状态栏] 统一MVU取数获取羁绊列表失败:', e);
        }
    }

    /* 降级：尝试从MVU变量框架获取羁绊列表数据 */
    if (typeof Mvu !== 'undefined' && Mvu.getMvuData) {
        try {
            /* 尝试从最新消息获取，使用extractMvuGameData提取数据 */
            const mvuData = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
            const gameData = extractMvuGameData(mvuData);
            if (gameData && hasContactEntries(gameData.羁绊列表)) {
                return gameData.羁绊列表;
            }
            /* 尝试从chat级别获取 */
            const chatData = Mvu.getMvuData({ type: 'chat' });
            const chatGameData = extractMvuGameData(chatData);
            if (chatGameData && hasContactEntries(chatGameData.羁绊列表)) {
                return chatGameData.羁绊列表;
            }
        } catch (e) {
            console.error('[手机状态栏] MVU获取羁绊列表失败:', e);
        }
    }
    return null;
}

/**
 * 获取联系人的有效键列表
 */
function getRelationshipKeys(collection) {
    if (!collection) return [];
    return Object.keys(collection);
}

// ==================== 角色头像配置 ====================
const CHARACTER_AVATAR_CONFIG = {
    '奈雅丽': 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E5%A5%88%E9%9B%85%E4%B8%BD.webp',
    '星极': 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E6%98%9F%E6%9E%81.webp',
    '法露特': 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E6%B3%95%E9%9C%B2%E7%89%B9.webp',
    '亚丝娜': 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E4%BA%9A%E4%B8%9D%E5%A8%9C.webp',
    '露露卡': 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E9%9C%B2%E9%9C%B2%E5%8D%A1.webp',
    '奥契丝': 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E5%A5%A5%E5%A5%91%E4%B8%9D.webp',
    '红莲': 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E7%BA%A2%E8%8E%B2.webp',
    '艾克莉西娅': 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E8%89%BE%E5%85%8B%E8%8E%89%E8%A5%BF%E5%A8%85.webp',
    '克拉米': 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E5%85%8B%E6%8B%89%E7%B1%B3.webp',
    '初濑伊纲': 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E5%88%9D%E6%BF%91%E4%BC%8A%E7%BA%B2.webp',
    '史蒂芬妮': 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E5%8F%B2%E8%92%82%E8%8A%AC%E5%A6%AE.webp',
    '吉普莉尔': 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E5%90%89%E6%99%AE%E8%8E%89%E5%B0%94.webp',
    '特图': 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E7%89%B9%E5%9B%BE.webp',
    '白': 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E7%99%BD.webp',
    '绯': 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E7%BB%AF.webp',
    '菲尔': 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E8%8F%B2%E5%B0%94.webp',
    "卡提希娅": 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E5%8D%A1%E6%8F%90%E5%B8%8C%E5%A8%85.webp',
    "爱弥斯": 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E7%88%B1%E5%BC%A5%E6%96%AF.webp',
    "璐米欧儿": 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E7%92%90%E7%B1%B3%E6%AC%A7%E5%84%BF.webp',
    "雅儿贞特": 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E9%9B%85%E5%84%BF%E8%B4%9E%E7%89%B9.webp',
    "达妮娅": 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E8%BE%BE%E5%A6%AE%E5%A8%85.webp',
    "洛茜": 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E6%B4%9B%E8%8C%9C.webp',
    "叶瞬光": 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E5%8F%B6%E7%9E%AC%E5%85%89.webp',
    "莉贝尔": 'https://rpg.bolt.qzz.io/%E5%A4%B4%E5%83%8F/%E8%8E%89%E8%B4%9D%E5%B0%94.webp'
};

/**
 * 获取角色头像URL
 * @param {string} name - 角色名称
 * @returns {string|null} - 头像URL或null
 */
function getCharacterAvatar(name) {
    if (!name) return null;
    // 直接匹配
    if (CHARACTER_AVATAR_CONFIG[name]) {
        return CHARACTER_AVATAR_CONFIG[name];
    }
    // 模糊匹配：检查名称是否包含配置中的任何角色名
    for (const [charName, avatarUrl] of Object.entries(CHARACTER_AVATAR_CONFIG)) {
        if (name.includes(charName) || charName.includes(name)) {
            return avatarUrl;
        }
    }
    return null;
}

//  实时刷新相关变量
let messageEventListener = null;
let lastMessageCount = 0;
let isEventListening = false;
let refreshPollingInterval = null;

