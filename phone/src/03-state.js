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
 * Contact entries are project objects under stat_data object information.
 */
function hasContactEntries(obj) {
    if (!obj || typeof obj !== 'object') return false;
    return Object.keys(obj).length > 0;
}

function relationshipObjects(source) {
    const objects = source?.对象信息;
    return hasContactEntries(objects) ? objects : null;
}

function getRelationshipDataSource(source = currentPhoneData) {
    const direct = relationshipObjects(source);
    if (direct) return direct;

    if (typeof fetchLatestMvuData === 'function') {
        try {
            const latest = relationshipObjects(fetchLatestMvuData(false));
            if (latest) return latest;
        } catch (error) {
            console.warn('[phone bonds] failed to read latest MVU data:', error);
        }
    }

    if (typeof Mvu !== 'undefined' && Mvu.getMvuData) {
        try {
            const messageData = relationshipObjects(extractMvuGameData(
                Mvu.getMvuData({ type: 'message', message_id: 'latest' }),
            ));
            if (messageData) return messageData;

            const chatData = relationshipObjects(extractMvuGameData(Mvu.getMvuData({ type: 'chat' })));
            if (chatData) return chatData;
        } catch (error) {
            console.error('[phone bonds] failed to read MVU objects:', error);
        }
    }
    return null;
}

function getRelationshipKeys(collection) {
    return collection ? Object.keys(collection) : [];
}

function getContactBond(contact) {
    return contact?.羁绊 && typeof contact.羁绊 === 'object' ? contact.羁绊 : {};
}

function bondNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1000, Math.round(number))) : 0;
}

function getContactAffection(contact) {
    return bondNumber(getContactBond(contact).好感度);
}

function getContactObedience(contact) {
    return bondNumber(getContactBond(contact).顺从度);
}

function getContactMood(contact) {
    return String(getContactBond(contact).心情 || '').trim();
}

function getContactLocationText(contact) {
    const location = contact?.位置 && typeof contact.位置 === 'object' ? contact.位置 : {};
    return [location.区域, location.场所]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .join(' · ');
}

function getContactStream(contact) {
    const stream = contact?.直播 && typeof contact.直播 === 'object' ? contact.直播 : {};
    return {
        live: stream.开播 === true,
        title: String(stream.标题 || '').trim(),
        heat: Math.max(0, Math.floor(Number(stream.热度) || 0)),
        followers: Math.max(0, Math.floor(Number(stream.粉丝数) || 0)),
    };
}

// ==================== Character avatar configuration ====================
const PHONE_AVATAR_BASE = 'https://anchor.bolt.qzz.io/' + encodeURIComponent('头像') + '/';
const PHONE_BUILTIN_STREAMERS = new Set([
    '东雪莲', '塔菲', '沙花叉', '时雨羽衣', '红蔷薇', '斯黛拉', '璃亚梦',
]);
const PHONE_CUSTOM_COVER_PREFIX = 'custom_char_cover_';

function validPhoneAvatar(value) {
    const src = String(value || '').trim();
    if (/^https?:\/\//i.test(src)) return src;
    if (/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i.test(src)) return src;
    return '';
}

function readPhoneCoverCache(name) {
    const windows = [window, window.parent, window.top];
    const seen = new Set();
    for (const candidate of windows) {
        if (!candidate || seen.has(candidate)) continue;
        seen.add(candidate);
        try {
            const src = validPhoneAvatar(candidate.localStorage?.getItem(PHONE_CUSTOM_COVER_PREFIX + name));
            if (src) return src;
        } catch (error) { /* cross-origin window */ }
    }
    return '';
}

/**
 * 固定主播使用正文美化同一套 anchor 头像；开局创建的自定义主播优先读取
 * 系统配置.直播间.<名字>.封面，再读取开局壳保存的 custom_char_cover_<名字>。
 */
function getCharacterAvatar(name, source = currentPhoneData) {
    const key = String(name || '').trim();
    if (!key) return null;

    const room = source?.系统配置?.直播间?.[key] || {};
    const configured = validPhoneAvatar(room.封面);
    if (configured) return configured;

    const cached = readPhoneCoverCache(key);
    if (cached) return cached;

    if (PHONE_BUILTIN_STREAMERS.has(key)) {
        return PHONE_AVATAR_BASE + encodeURIComponent(key) + '.webp';
    }
    return null;
}

// ==================== 实时刷新相关变量 ====================
let messageEventListener = null;
let lastMessageCount = 0;
let isEventListening = false;
let refreshPollingInterval = null;

