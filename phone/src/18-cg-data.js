// ==================== CG收集系统 ====================

// SFW场景类型集合（用于判断图片路径）
const SFW_SCENES = new Set(["不爽", "得意", "害羞", "开心", "哭泣", "生气", "通用", "战斗"]);

// 五人共用的场景数据（NSFW + SFW）
const SHARED_CG_SCENES = {
    // SFW
    "不爽": 3, "得意": 3, "害羞": 3, "开心": 3, "哭泣": 3, "生气": 3, "通用": 3, "战斗": 3,
    // NSFW
    "亲吻": 5, "传教士体位做爱": 4, "掰开小穴": 2, "抱起来做爱": 3, "抱腿站着后入": 2,
    "抱着摸小穴": 2, "抱着躺床上": 2, "背后坐位做爱": 3, "打屁股后入": 2, "高抬腿站着后入": 2,
    "激烈站着后入": 4, "激烈做爱": 4, "即将插入肉棒": 3, "口交": 3, "口交颜射": 2,
    "摸胸": 4, "内射事后": 3, "女上位手淫": 2, "女上位做爱": 4, "趴床上后入": 2,
    "趴在床上": 3, "趴着口交": 2, "乳交": 2, "射外面事后": 2, "事后口交": 3,
    "吮吸乳头": 2, "素股": 2, "躺着抬腿做爱": 3, "舔小穴": 2, "脱衣服": 4,
    "一起洗澡": 2, "站着后入": 2, "站着足交": 2, "指交": 3, "抓屁股做爱": 2,
    "抓着脚足交": 2, "自己掰开小穴": 2, "自慰": 2, "坐着足交": 2, "做爱高潮": 5, "做爱射精": 4
};

// CG列表数据
const CG_LIST = {
    "奈雅丽": { ...SHARED_CG_SCENES },
    "星极": { ...SHARED_CG_SCENES },
    "法露特": { ...SHARED_CG_SCENES },
    "亚丝娜": { ...SHARED_CG_SCENES },
    "露露卡": { ...SHARED_CG_SCENES },
    "红莲": { ...SHARED_CG_SCENES },
    "奥契丝": { ...SHARED_CG_SCENES },
    "吉普莉尔": { ...SHARED_CG_SCENES },
    "艾克莉西娅": { ...SHARED_CG_SCENES },
    "白": { ...SHARED_CG_SCENES },
    "卡提希娅": { ...SHARED_CG_SCENES },
    "爱弥斯": { ...SHARED_CG_SCENES },
    "璐米欧儿": { ...SHARED_CG_SCENES },
    "史蒂芬妮": { ...SHARED_CG_SCENES },
    "达妮娅": { ...SHARED_CG_SCENES },
    "洛茜": { ...SHARED_CG_SCENES },
    "叶瞬光": { ...SHARED_CG_SCENES },
    "莉贝尔": { ...SHARED_CG_SCENES }
};

// CG图片基础URL
const CG_BASE_URL = "https://rpg.bolt.qzz.io/";

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
    const unlocked = getUnlockedCG();
    if (!unlocked[characterName]) {
        unlocked[characterName] = {};
    }
    if (!(sceneType in unlocked[characterName])) {
        // 如果没传maxCount，从CG_LIST获取
        const count = maxCount || CG_LIST[characterName]?.[sceneType] || 1;
        unlocked[characterName][sceneType] = count;
        saveUnlockedCG(unlocked);
    }
}

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
 * @param {Object|null} relationshipSource - 可选，已解析的羁绊列表数据
 * @returns {number} - 好感度值，如果找不到返回0
 */
function getCharacterAffection(characterName, relationshipSource = null) {
    const contactSource = relationshipSource || getRelationshipDataSource();
    if (!contactSource) return 0;

    // 尝试直接匹配角色名
    if (contactSource[characterName]) {
        return contactSource[characterName]?.好感度 ?? 0;
    }

    // 尝试模糊匹配（角色名可能是部分匹配）
    for (const [key, contact] of Object.entries(contactSource)) {
        if (key.includes(characterName) || characterName.includes(key)) {
            return contact?.好感度 ?? 0;
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

