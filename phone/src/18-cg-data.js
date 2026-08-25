// ==================== CG collection ====================
// Data source: IMAGE_LISTS in the external???? page.
const SFW_SCENES = new Set(["通用"]);
const CG_LIST = {
    "东雪莲": {
        "通用": 8,
        "乳交": 2,
        "事后口交": 3,
        "亲吻": 4,
        "传教士体位做爱": 4,
        "做爱射精": 4,
        "做爱高潮": 5,
        "口交": 4,
        "后入做爱": 2,
        "吮吸乳头": 3,
        "女上位做爱": 4,
        "射外面事后": 2,
        "打屁股后入": 2,
        "抱着摸小穴": 2,
        "抱腿站着后入": 3,
        "抱起来做爱": 2,
        "指交": 2,
        "掰开小穴": 3,
        "摸胸": 3,
        "激烈站着后入": 4,
        "站着后入": 3,
        "素股": 2,
        "背后坐位做爱": 2,
        "脱衣服": 4,
        "自己掰开小穴": 2,
        "自慰": 2,
        "舔小穴": 2,
        "足交": 4,
        "趴着口交": 2,
        "躺着抬腿做爱": 2
    },
    "塔菲": {
        "通用": 8,
        "乳交": 2,
        "事后口交": 3,
        "亲吻": 4,
        "传教士体位做爱": 4,
        "做爱射精": 4,
        "做爱高潮": 5,
        "口交": 4,
        "后入做爱": 2,
        "吮吸乳头": 3,
        "女上位做爱": 4,
        "射外面事后": 2,
        "打屁股后入": 2,
        "抱着摸小穴": 2,
        "抱腿站着后入": 3,
        "抱起来做爱": 2,
        "指交": 2,
        "掰开小穴": 3,
        "摸胸": 3,
        "激烈站着后入": 4,
        "站着后入": 3,
        "素股": 2,
        "背后坐位做爱": 2,
        "脱衣服": 4,
        "自己掰开小穴": 2,
        "自慰": 2,
        "舔小穴": 2,
        "足交": 4,
        "趴着口交": 2,
        "躺着抬腿做爱": 2
    },
    "沙花叉": {
        "通用": 8,
        "乳交": 2,
        "事后口交": 3,
        "亲吻": 4,
        "传教士体位做爱": 4,
        "做爱射精": 4,
        "做爱高潮": 5,
        "口交": 4,
        "后入做爱": 2,
        "吮吸乳头": 3,
        "女上位做爱": 4,
        "射外面事后": 2,
        "打屁股后入": 2,
        "抱着摸小穴": 2,
        "抱腿站着后入": 3,
        "抱起来做爱": 2,
        "指交": 2,
        "掰开小穴": 3,
        "摸胸": 3,
        "激烈站着后入": 4,
        "站着后入": 3,
        "素股": 2,
        "背后坐位做爱": 2,
        "脱衣服": 4,
        "自己掰开小穴": 2,
        "自慰": 2,
        "舔小穴": 2,
        "足交": 4,
        "趴着口交": 2,
        "躺着抬腿做爱": 2
    },
    "时雨羽衣": {
        "通用": 8,
        "乳交": 2,
        "事后口交": 3,
        "亲吻": 4,
        "传教士体位做爱": 4,
        "做爱射精": 4,
        "做爱高潮": 5,
        "口交": 4,
        "后入做爱": 2,
        "吮吸乳头": 3,
        "女上位做爱": 4,
        "射外面事后": 2,
        "打屁股后入": 2,
        "抱着摸小穴": 2,
        "抱腿站着后入": 3,
        "抱起来做爱": 2,
        "指交": 2,
        "掰开小穴": 3,
        "摸胸": 3,
        "激烈站着后入": 4,
        "站着后入": 3,
        "素股": 2,
        "背后坐位做爱": 2,
        "脱衣服": 4,
        "自己掰开小穴": 2,
        "自慰": 2,
        "舔小穴": 2,
        "足交": 4,
        "趴着口交": 2,
        "躺着抬腿做爱": 2
    },
    "红蔷薇": {
        "通用": 8,
        "乳交": 2,
        "事后口交": 3,
        "亲吻": 4,
        "传教士体位做爱": 4,
        "做爱射精": 4,
        "做爱高潮": 5,
        "口交": 4,
        "后入做爱": 2,
        "吮吸乳头": 3,
        "女上位做爱": 4,
        "射外面事后": 2,
        "打屁股后入": 2,
        "抱着摸小穴": 2,
        "抱腿站着后入": 3,
        "抱起来做爱": 2,
        "指交": 2,
        "掰开小穴": 3,
        "摸胸": 3,
        "激烈站着后入": 4,
        "站着后入": 3,
        "素股": 2,
        "背后坐位做爱": 2,
        "脱衣服": 4,
        "自己掰开小穴": 2,
        "自慰": 2,
        "舔小穴": 2,
        "足交": 4,
        "趴着口交": 2,
        "躺着抬腿做爱": 2
    },
    "斯黛拉": {
        "通用": 8,
        "乳交": 2,
        "事后口交": 3,
        "亲吻": 4,
        "传教士体位做爱": 4,
        "做爱射精": 4,
        "做爱高潮": 5,
        "口交": 4,
        "后入做爱": 2,
        "吮吸乳头": 3,
        "女上位做爱": 4,
        "射外面事后": 2,
        "打屁股后入": 2,
        "抱着摸小穴": 2,
        "抱腿站着后入": 3,
        "抱起来做爱": 2,
        "指交": 2,
        "掰开小穴": 3,
        "摸胸": 3,
        "激烈站着后入": 4,
        "站着后入": 3,
        "素股": 2,
        "背后坐位做爱": 2,
        "脱衣服": 4,
        "自己掰开小穴": 2,
        "自慰": 2,
        "舔小穴": 2,
        "足交": 4,
        "趴着口交": 2,
        "躺着抬腿做爱": 2
    },
    "璃亚梦": {
        "通用": 8,
        "乳交": 2,
        "事后口交": 3,
        "亲吻": 4,
        "传教士体位做爱": 4,
        "做爱射精": 4,
        "做爱高潮": 5,
        "口交": 4,
        "后入做爱": 2,
        "吮吸乳头": 3,
        "女上位做爱": 4,
        "射外面事后": 2,
        "打屁股后入": 2,
        "抱着摸小穴": 2,
        "抱腿站着后入": 3,
        "抱起来做爱": 2,
        "指交": 2,
        "掰开小穴": 3,
        "摸胸": 3,
        "激烈站着后入": 4,
        "站着后入": 3,
        "素股": 2,
        "背后坐位做爱": 2,
        "脱衣服": 4,
        "自己掰开小穴": 2,
        "自慰": 2,
        "舔小穴": 2,
        "足交": 4,
        "趴着口交": 2,
        "躺着抬腿做爱": 2
    }
};
const CG_BASE_URL = "https://anchor.bolt.qzz.io/";

/**
 * 获取已解锁的CG数据
 * @param {boolean} includeVirtual - 是否包含虚拟解锁（一键解锁）的数据
 */
function getUnlockedCG(includeVirtual = false) {
    try {
        const realData = JSON.parse(localStorage.getItem('unlocked_cg') || '{}');

        if (!includeVirtual) {
            return realData;
        }

        // 合并虚拟数据
        const virtualData = JSON.parse(localStorage.getItem('unlocked_cg_virtual') || '{}');
        const mergedData = JSON.parse(JSON.stringify(realData)); // 深拷贝

        for (const [char, scenes] of Object.entries(virtualData)) {
            if (!mergedData[char]) mergedData[char] = {};
            for (const [scene, count] of Object.entries(scenes)) {
                // 如果真实数据里没有，就用虚拟数据
                if (!mergedData[char][scene]) {
                    mergedData[char][scene] = count;
                }
            }
        }
        return mergedData;
    } catch (e) {
        console.error('读取CG数据失败:', e);
        return {};
    }
}

/**
 * 保存已解锁的CG数据
 * @param {Object} data - 要保存的CG数据
 * @param {boolean} isVirtual - 是否保存为虚拟解锁数据
 */
function saveUnlockedCG(data, isVirtual = false) {
    try {
        const key = isVirtual ? 'unlocked_cg_virtual' : 'unlocked_cg';
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.error('保存CG数据失败:', e);
    }
}

/**
 * 解锁CG（供外部调用）
 * @param {string} characterName - 角色名称
 * @param {string} sceneType - 场景类型
 * @param {number} maxCount - 该场景的最大CG数量
 */
function unlockCG(characterName, sceneType, maxCount) {
    const character = String(characterName || '').trim();
    const scene = String(sceneType || '').trim();
    if (!character || !scene || !CG_LIST[character]?.[scene]) return false;
    const unlocked = getUnlockedCG();
    if (!unlocked[character]) {
        unlocked[character] = {};
    }
    const count = Math.max(1, Math.floor(Number(maxCount) || CG_LIST[character][scene] || 1));
    const previous = Number(unlocked[character][scene]) || 0;
    if (previous >= count) return false;
    unlocked[character][scene] = count;
    saveUnlockedCG(unlocked);
    return true;
}

const CG_UNLOCK_MESSAGE_CHANNEL = 'linjiang-cg-unlock';

function refreshVisibleCGCollection() {
    setTimeout(() => {
        try {
            if (typeof currentPanel !== 'undefined' && currentPanel !== 'gallery') return;
            if (typeof navigationStack !== 'undefined' && navigationStack.length > 0) return;
            if (typeof generateGalleryPanel !== 'function') return;
            const $body = $('#phone-app-body');
            if (!$body.length) return;
            $body.html(generateGalleryPanel(typeof currentPhoneData === 'undefined' ? null : currentPhoneData));
            if (typeof bindCGGalleryEvents === 'function') bindCGGalleryEvents();
        } catch (e) {
            console.warn('[CG收集] 实时刷新失败:', e);
        }
    }, 0);
}

function onCGUnlockMessage(event) {
    const data = event.data;
    if (!data || data.channel !== CG_UNLOCK_MESSAGE_CHANNEL || data.type !== 'apply') return;
    if (unlockCG(data.character, data.scene, data.count)) refreshVisibleCGCollection();
}

addEventListener('message', onCGUnlockMessage);
/**
 * 一键解锁角色的所有CG
 * @param {string} characterName - 角色名称
 * @param {boolean} isVirtual - 是否是虚拟解锁（仅查看，不计入真实收集）
 * @returns {number} - 解锁的CG数量
 */
function unlockAllCGForCharacter(characterName, isVirtual = false) {
    if (!CG_LIST[characterName]) return 0;

    // 根据模式读取对应的数据源
    let currentData;
    try {
        const key = isVirtual ? 'unlocked_cg_virtual' : 'unlocked_cg';
        currentData = JSON.parse(localStorage.getItem(key) || '{}');
    } catch (e) {
        currentData = {};
    }

    if (!currentData[characterName]) {
        currentData[characterName] = {};
    }

    let unlockedCount = 0;
    const scenes = CG_LIST[characterName];

    // 如果是虚拟解锁，还需要检查真实解锁数据，避免覆盖真实进度（虽然逻辑上虚拟集合包含真实集合，但保存时分开）
    // 不过简单起见，虚拟解锁库只记录“通过一键解锁获得的权限”，读取时合并即可

    for (const [sceneType, maxCount] of Object.entries(scenes)) {
        if (!(sceneType in currentData[characterName])) {
            currentData[characterName][sceneType] = maxCount;
            unlockedCount++;
        }
    }

    if (unlockedCount > 0) {
        saveUnlockedCG(currentData, isVirtual);
    }

    return unlockedCount;
}

/**
 * 获取角色的好感度（从好友列表数据中）
 * @param {string} characterName - 角色名称
 * @param {Object|null} relationshipSource - 可选，已解析的对象信息数据
 * @returns {number} - 好感度值，如果找不到返回0
 */
function getCharacterAffection(characterName, relationshipSource = null) {
    const contactSource = relationshipSource || getRelationshipDataSource();
    if (!contactSource) return 0;

    // 尝试直接匹配角色名
    if (contactSource[characterName]) {
        return getContactAffection(contactSource[characterName]);
    }

    // 尝试模糊匹配（角色名可能是部分匹配）
    for (const [key, contact] of Object.entries(contactSource)) {
        if (key.includes(characterName) || characterName.includes(key)) {
            return getContactAffection(contact);
        }
    }

    return 0;
}

/**
 * 计算CG收藏进度统计
 * @returns {Object} - 包含总进度和各角色进度的对象
 */
function getCGCollectionStats() {
    const unlocked = getUnlockedCG();
    const stats = {
        total: { unlocked: 0, total: 0, percentage: 0 },
        characters: {}
    };

    for (const [charName, scenes] of Object.entries(CG_LIST)) {
        const totalScenes = Object.keys(scenes).length;
        const unlockedScenes = unlocked[charName] ? Object.keys(unlocked[charName]).length : 0;
        const percentage = totalScenes > 0 ? Math.round((unlockedScenes / totalScenes) * 100) : 0;

        stats.characters[charName] = {
            unlocked: unlockedScenes,
            total: totalScenes,
            percentage: percentage
        };

        stats.total.unlocked += unlockedScenes;
        stats.total.total += totalScenes;
    }

    stats.total.percentage = stats.total.total > 0
        ? Math.round((stats.total.unlocked / stats.total.total) * 100)
        : 0;

    return stats;
}

