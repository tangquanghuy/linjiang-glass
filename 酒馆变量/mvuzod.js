import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

/**
 * 管人痴 / 都市日系 SLG · MVU Zod Schema
 *
 * 字段、范围、枚举对齐 变量相关/变量草稿。
 * 冷代码（时段、日期显示、私密度、牌子等级、换日扣天数、直播人数）
 * 由 变量相关/辅助计算脚本.js 回写；本 Schema 负责形状、默认值与截断。
 *
 * 对象名以 HUD / data.js 短名为准：
 *   东雪莲 / 塔菲 / 沙花叉 / 时雨羽衣 / 红蔷薇 / 斯黛拉 / 璃亚梦
 */

// --- 工具函数 ---

const boolPreprocess = (defaultVal = false) => z.preprocess(
    v => 'string' == typeof v ? '是' === v || 'true' === v : v,
    z.boolean()
).prefault(defaultVal);

const clampNum = (defaultVal, min, max) => z.coerce.number()
    .prefault(defaultVal)
    .transform(v => _.clamp(v, min, max));

const str = (val = '') => z.string().prefault(val);

const isPlainObject = v => !!v && 'object' === typeof v && !Array.isArray(v);

const safeStr = (val = '') => z.preprocess(v => 'string' === typeof v ? v : val, z.string());
const safeNum = (val = 0) => z.preprocess(v => {
    if ('number' === typeof v) return Number.isFinite(v) ? v : val;
    if ('string' === typeof v) {
        const trimmed = v.trim();
        if (!trimmed) return val;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : val;
    }
    return val;
}, z.number());

const nullableStr = (defaultVal = null) => z.preprocess(v => {
    if (v == null) return null;
    if ('string' === typeof v) {
        const trimmed = v.trim();
        if (!trimmed || trimmed === 'null' || trimmed === '无') return null;
        return trimmed;
    }
    return defaultVal;
}, z.string().nullable()).prefault(defaultVal);

const enumOr = (values, fallback) => z.preprocess(
    v => values.includes(v) ? v : fallback,
    z.enum(values)
).prefault(fallback);

const closedEnum = (values, fallback) => z.preprocess(
    v => values.includes(v) ? v : fallback,
    z.enum(values)
).prefault(fallback);

// --- 对象名别名（世界书全名 → HUD 短名） ---

const GIRL_NAME_ALIAS = {
    永雏塔菲: '塔菲',
    沙花叉克萝伊: '沙花叉',
    梦见璃亚梦: '璃亚梦',
    伊贺栖寅: '斯黛拉',
    '斯黛拉（伊贺栖寅）': '斯黛拉',
};

const canonGirlName = name => {
    if (name == null) return name;
    const key = String(name).trim();
    return GIRL_NAME_ALIAS[key] || key;
};

const remapGirlKeys = record => {
    if (!isPlainObject(record)) return {};
    const out = {};
    Object.entries(record).forEach(([key, value]) => {
        out[canonGirlName(key)] = value;
    });
    return out;
};

const normalizeClock = v => {
    const s = String(v == null ? '' : v).trim();
    const match = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return '08:00';
    const h = _.clamp(Number(match[1]), 0, 23);
    const min = _.clamp(Number(match[2]), 0, 59);
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

const normalizeArea = v => String(v || '').replace(/\s*·\s*/g, ' · ').trim();

const uniqStrings = list => _.uniq((Array.isArray(list) ? list : []).filter(item => 'string' === typeof item && item.trim()));

// --- 枚举 ---

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const SEASONS = ['春季', '夏季', '秋季', '冬季'];
const PERIODS = ['朝', '昼', '暮', '夜', '深夜'];
const EVENT_CATEGORIES = ['纯爱', '日常', '生理窘迫', '调教', '睡奸', '催眠奸', '特殊H'];
const EVENT_STATUSES = ['待触发', '可触发', '已完成', '已过期'];
const TENURES = ['租住', '自有', '借住'];
const FAN_TIERS = ['无', '办卡', '舰长', '提督', '总督'];
const MATERIAL_CATS = ['植物', '动物', '矿物', '化学', '织物', '其他'];
const CONSUMABLE_CATS = ['食物', '饮料', '药物', '日用', '其他'];
const GOODS_CATS = ['服装', '饰品', '器具', '器材', '其他'];

const weekdayEnum = enumOr(WEEKDAYS, '周三');
const seasonEnum = enumOr(SEASONS, '春季');
const periodEnum = enumOr(PERIODS, '朝');
const eventStatusEnum = enumOr(EVENT_STATUSES, '待触发');
const tenureEnum = enumOr(TENURES, '租住');
const fanTierEnum = enumOr(FAN_TIERS, '无');
const materialCatEnum = closedEnum(MATERIAL_CATS, '其他');
const consumableCatEnum = closedEnum(CONSUMABLE_CATS, '其他');
const goodsCatEnum = closedEnum(GOODS_CATS, '其他');

const eventCategorySchema = z.preprocess(
    v => {
        if ('string' === typeof v) return v ? [v] : [];
        return Array.isArray(v) ? v : [];
    },
    z.array(z.enum(EVENT_CATEGORIES)).transform(list => _.uniq(list.filter(item => EVENT_CATEGORIES.includes(item))))
).prefault([]);

const periodArraySchema = z.preprocess(
    v => {
        if ('string' === typeof v) return v ? [v] : [];
        return Array.isArray(v) ? v : [];
    },
    z.array(z.enum(PERIODS)).transform(list => _.uniq(list.filter(item => PERIODS.includes(item))))
).prefault([]);

// --- 位置 ---

const locationSchema = z.preprocess(
    v => isPlainObject(v) ? v : {},
    z.object({
        区域: z.preprocess(v => normalizeArea(v), str('')),
        场所: str(''),
        私密度: clampNum(1, 0, 5),
    })
);

// --- 日期显示（脚本写入，AI 只读） ---

const dateDisplaySchema = z.preprocess(
    v => isPlainObject(v) ? v : {},
    z.object({
        星期: weekdayEnum,
        季节: seasonEnum,
        年内周次: clampNum(1, 1, 53),
    })
);

// --- 事件提示：脚本与AI共用，值保持为短文本 ---

const noticeSchema = z.preprocess(
    v => isPlainObject(v) ? v : {},
    z.record(z.string(), safeStr('')).transform(r => _.pickBy(r, value => String(value || '').trim()))
).prefault({});
// --- 工作 / 房产 / 粉丝身份 ---

const workSchema = z.preprocess(
    v => isPlainObject(v) ? v : {},
    z.object({
        职业: nullableStr(null),
        地点: z.preprocess(v => {
            if (v == null || v === '' || v === 'null' || v === '无') return null;
            return normalizeArea(v);
        }, z.string().nullable()).prefault(null),
        日收入: z.coerce.number().prefault(0).transform(v => Math.max(0, Math.floor(Number.isFinite(v) ? v : 0))),
        今日已上班: boolPreprocess(false),
    }).transform(r => {
        if (!r.职业) {
            return { 职业: null, 地点: null, 日收入: 0, 今日已上班: false };
        }
        return r;
    })
);

const propertySchema = z.object({
    名称: str(''),
    区域: z.preprocess(v => normalizeArea(v), str('')),
    产权: tenureEnum,
    描述: str(''),
});

const fixedExpenseSchema = z.preprocess(
    v => isPlainObject(v) ? v : {},
    z.object({
        金额: z.coerce.number().prefault(0).transform(v => Math.max(0, Math.floor(Number.isFinite(v) ? v : 0))),
        支付周期: closedEnum(['每日', '每周', '每月'], '每月'),
    })
);
const fanSchema = z.object({
    关注: boolPreprocess(false),
    累计打赏: z.coerce.number().prefault(0).transform(v => Math.max(0, Math.floor(Number.isFinite(v) ? v : 0))),
    牌子等级: clampNum(0, 0, 20),
    牌子档位: fanTierEnum,
    牌子剩余天数: clampNum(0, 0, 30),
    房管: boolPreprocess(false),
    禁言中: boolPreprocess(false),
    禁言剩余天数: clampNum(0, 0, 9999),
}).transform(r => ({
    ...r,
    牌子剩余天数: r.牌子档位 === '无' ? 0 : r.牌子剩余天数,
    禁言中: r.禁言剩余天数 > 0 ? true : r.禁言中,
}));

// --- 背包 ---

const materialSchema = z.object({
    名称: str(''),
    类别: materialCatEnum,
    数量: clampNum(1, 0, 99999),
    来源: str(''),
    描述: str(''),
}).transform(r => _.pick(r, ['名称', '类别', '数量', '来源', '描述']));

const consumableSchema = z.object({
    名称: str(''),
    类别: consumableCatEnum,
    数量: clampNum(1, 0, 99999),
    强度: clampNum(3, 1, 5),
    描述: str(''),
}).transform(r => _.pick(r, ['名称', '类别', '数量', '强度', '描述']));

const goodsSchema = z.object({
    名称: str(''),
    类别: goodsCatEnum,
    数量: clampNum(1, 0, 99999),
    佩戴: boolPreprocess(false),
    描述: str(''),
}).transform(r => ({
    ..._.pick(r, ['名称', '类别', '数量', '佩戴', '描述']),
    佩戴: r.类别 === '器材' ? false : r.佩戴,
}));

const inventorySchema = z.preprocess(
    v => isPlainObject(v) ? v : {},
    z.object({
        素材: z.record(z.string().describe('素材名'), materialSchema).prefault({}),
        消耗品: z.record(z.string().describe('道具名'), consumableSchema).prefault({}),
        用品: z.record(z.string().describe('用品名'), goodsSchema).prefault({}),
    }).transform(r => ({
        素材: _.pickBy(r.素材, item => item.数量 > 0),
        消耗品: _.pickBy(r.消耗品, item => item.数量 > 0),
        用品: _.pickBy(r.用品, item => item.数量 > 0),
    }))
);

// --- 对象：羁绊 / 性经历 / 开发度 / 生理 / 直播 ---

const bondSchema = z.preprocess(
    v => isPlainObject(v) ? v : {},
    z.object({
        好感度: clampNum(0, 0, 1000),
        顺从度: clampNum(0, 0, 1000),
        心情: str(''),
    })
);

const EXPERIENCE_KEYS = [
    '露出经验',
    '自慰经验',
    '排泄调教经验',
    '道具调教经验',
    '凌辱调教经验',
    '隐奸经验',
    '青奸经验',
    '睡奸经验',
    '催眠奸经验',
    '情趣扮演经验',
    '盗摄经验',
    '性直播经验',
];

const experienceCounter = value => Math.max(0, Math.floor(Number.isFinite(Number(value)) ? Number(value) : 0));

const experienceItemSchema = z.preprocess(v => {
    if (isPlainObject(v)) {
        return {
            次数: v.次数 ?? v.值 ?? 0,
            可更新: v.可更新 ?? true,
        };
    }
    return { 次数: v, 可更新: true };
}, z.object({
    次数: z.coerce.number().prefault(0).transform(experienceCounter),
    可更新: boolPreprocess(true),
}));

const experienceSchema = z.preprocess(
    v => isPlainObject(v) ? v : {},
    z.object({
        近期性经验次数: z.coerce.number().prefault(0).transform(experienceCounter),
        ...Object.fromEntries(EXPERIENCE_KEYS.map(key => [key, experienceItemSchema])),
    })
);

/* 升档门槛：从档位 n 升到 n+1 所需的进度，档位 5 封顶所以只有五个数。
   Schema 会先于 VARIABLE_UPDATE_ENDED 执行，而真正的升档在辅助脚本监听这个事件后完成，
   所以这里必须保留“恰好到门槛”的一格作为交接哨兵。若档位 0 在这里先截成 39，旧值已经是
   39 时，之后模型无论再写 40 还是 500 都仍会变成 39；辅助脚本看不到正增量，进度便永久卡住。
   超过门槛的值仍会被压到门槛，单轮上限与升档次数继续由辅助脚本控制。 */
const DEV_TIER_STEPS = [40, 80, 130, 190, 260];
const devProposalCeiling = tier => {
    const need = DEV_TIER_STEPS[_.clamp(Math.floor(Number(tier) || 0), 0, 5)];
    return need || 0;
};

const devPartSchema = z.preprocess(v => {
    if (!isPlainObject(v)) return {};
    return {
        档位: v.档位 ?? 0,
        进度: v.进度 ?? 0,
        可更新: v.可更新 ?? true,
        评语: v.评语 ?? '',
    };
}, z.object({
    档位: clampNum(0, 0, 5),
    进度: clampNum(0, 0, 999),
    可更新: boolPreprocess(true),
    评语: str(''),
}).transform(r => ({
    /* 为辅助脚本的升档阶段保留门槛值；超过门槛的异常大数仍在这里折叠。辅助脚本消费后，
       会把没有成功升档的持久值统一压回门槛前一格。 */
    ...r,
    进度: _.clamp(r.进度, 0, devProposalCeiling(r.档位)),
})));

const developmentSchema = z.preprocess(v => {
    if (!isPlainObject(v)) return {};
    const next = { ...v };
    if (next.胸部 && !next.胸) {
        next.胸 = next.胸部;
        delete next.胸部;
    }
    return next;
}, z.object({
    口腔: devPartSchema,
    胸: devPartSchema,
    小穴: devPartSchema,
    肛门: devPartSchema,
}));
const statusItemSchema = z.preprocess(v => {
    if (typeof v === 'string') return { 到期条件: v };
    if (!isPlainObject(v)) return { 到期条件: '手动确认解除后移除' };
    const oldTime = v.到期时间;
    return {
        到期条件: v.到期条件
            ?? (oldTime ? `${oldTime} 到期移除` : '手动确认解除后移除'),
    };
}, z.object({
    到期条件: safeStr('手动确认解除后移除'),
}));

const statusRecordSchema = z.preprocess(v => {
    if (Array.isArray(v)) {
        return Object.fromEntries(v
            .filter(item => typeof item === 'string' && item.trim())
            .map(item => [item.trim(), { 到期条件: '手动确认解除后移除' }]));
    }
    return isPlainObject(v) ? v : {};
}, z.record(z.string(), statusItemSchema)).prefault({});
const physiologySchema = z.preprocess(
    v => isPlainObject(v) ? v : {},
    z.object({
        性欲度: clampNum(0, 0, 100),
        体力: clampNum(100, 0, 100),
        尿意: clampNum(0, 0, 100),
        异常状态: statusRecordSchema,
    })
);
/**
 * 直播间没有人数，只有热度。
 *   粉丝数 —— 稳定量，她一共有多少人关注，是公开事实，AI 该知道；
 *   热度   —— 开播时 = 系统配置.直播间.<名>.底盘热度 + 本场礼物堆的虚火，下播回 0。
 * 底盘热度、本场热度、高能榜、大航海是后台账，只在 系统配置.直播间 里，不摊给模型。
 */
const streamSchema = z.preprocess(
    v => {
        if (!isPlainObject(v)) return {};
        const next = { ...v };
        // 旧档里的 人数 直接当热度用，别丢
        if (next.人数 != null && next.热度 == null) next.热度 = next.人数;
        delete next.人数;
        return next;
    },
    z.object({
        开播: boolPreprocess(false),
        标题: str(''),
        热度: z.coerce.number().prefault(0).transform(n => Math.max(0, Math.floor(Number.isFinite(n) ? n : 0))),
        粉丝数: z.coerce.number().prefault(0).transform(n => Math.max(0, Math.floor(Number.isFinite(n) ? n : 0))),
    }).transform(r => {
        // 没开播就没有标题也没有热度，但粉丝数是常驻的
        if (!r.开播) return { 开播: false, 标题: '', 热度: 0, 粉丝数: r.粉丝数 };
        return r;
    })
);

const girlSchema = z.preprocess(
    v => isPlainObject(v) ? v : {},
    z.object({
        羁绊: bondSchema,
        位置: locationSchema,
        性经历: experienceSchema,
        开发度: developmentSchema,
        生理: physiologySchema,
        直播: streamSchema,
    })
);

// --- 玩家信息 ---

const playerSchema = z.preprocess(
    v => isPlainObject(v) ? v : {},
    z.object({
        体力: clampNum(100, 0, 100),
        金钱: z.coerce.number().prefault(0).transform(v => Math.max(0, Math.floor(Number.isFinite(v) ? v : 0))),
        同行: z.preprocess(v => canonGirlName(v), nullableStr(null)),
        工作: workSchema,
        居住地: z.preprocess(v => normalizeArea(v), str('')),
        房产: z.record(z.string().describe('房产名称'), propertySchema).prefault({}),
        生活固定支出: z.record(z.string().describe('支出项'), fixedExpenseSchema).prefault({}),
        所在直播间: z.preprocess(v => canonGirlName(v), nullableStr(null)),
        粉丝身份: z.preprocess(
            remapGirlKeys,
            z.record(z.string().describe('对象名'), fanSchema)
        ).prefault({}),
        背包: inventorySchema,
    })
);

// --- 世界信息 ---

const worldSchema = z.preprocess(
    v => {
        const next = isPlainObject(v) ? { ...v } : {};
        if (!isPlainObject(next.事件提示)) {
            const oldEvents = next.事件池?.当日事件;
            next.事件提示 = isPlainObject(oldEvents)
                ? Object.fromEntries(Object.entries(oldEvents).map(([id, event]) => [
                    id,
                    String(event?.简述 || event?.标题 || id),
                ]))
                : {};
        }
        delete next.事件池;
        return next;
    },
    z.object({
        年历: str('2026年4月1日'),
        日期显示: dateDisplaySchema,
        时间: z.preprocess(
            v => isPlainObject(v) ? v : {},
            z.object({
                时钟: z.preprocess(normalizeClock, z.string()).prefault('08:00'),
                时段: periodEnum,
            })
        ),
        位置: locationSchema,
        事件提示: noticeSchema,
    })
);
// --- Arcade / 街机里程碑（脚本写入，按聊天隔离） ---

const arcadeCounter = (val = 0) => z.coerce.number().prefault(val)
    .transform(v => Math.max(0, Math.floor(Number.isFinite(v) ? v : val)));

const arcadeStatsSchema = z.preprocess(
    v => isPlainObject(v) ? v : {},
    z.object({
        刮刮乐: z.preprocess(v => isPlainObject(v) ? v : {}, z.object({
            结算次数: arcadeCounter(),
            中奖次数: arcadeCounter(),
            最高倍率: safeNum(0),
            累计返奖: safeNum(0),
        })),
        幸运机: z.preprocess(v => isPlainObject(v) ? v : {}, z.object({
            旋转次数: arcadeCounter(),
            中奖次数: arcadeCounter(),
            最高倍率: safeNum(0),
            累计返奖: safeNum(0),
        })),
        捕鱼: z.preprocess(v => isPlainObject(v) ? v : {}, z.object({
            结算次数: arcadeCounter(),
            捕获次数: arcadeCounter(),
            最高倍率: safeNum(0),
            累计返奖: safeNum(0),
            清屏次数: arcadeCounter(),
        })),
    })
);

const arcadeConfigSchema = z.preprocess(
    v => isPlainObject(v) ? v : {},
    z.object({
        版本: arcadeCounter(3),
        统计: arcadeStatsSchema,
        已解锁: z.record(z.string(), boolPreprocess(false)).prefault({}),
        已达成: z.record(z.string(), boolPreprocess(false)).prefault({}),
    })
);

// --- 主 Schema ---

const sysConfigSchema = z.preprocess(
    v => isPlainObject(v) ? v : {},
    z.record(z.string(), z.any()).transform(r => {
        const parsed = arcadeConfigSchema.safeParse(r.街机);
        return { ...r, 街机: parsed.success ? parsed.data : arcadeConfigSchema.parse({}) };
    })
).prefault({});

export const Schema = z.object({
    世界信息: worldSchema,
    玩家信息: playerSchema,
    对象信息: z.preprocess(
        remapGirlKeys,
        z.record(z.string().describe('对象名'), girlSchema)
    ).prefault({}),
    系统配置: sysConfigSchema,
}).transform(data => {
    const girls = data.对象信息 || {};
    const girlNames = Object.keys(girls);

    if (data.玩家信息.同行 && !girlNames.includes(data.玩家信息.同行)) {
        data.玩家信息.同行 = canonGirlName(data.玩家信息.同行);
        if (!girlNames.includes(data.玩家信息.同行)) data.玩家信息.同行 = null;
    }
    if (data.玩家信息.所在直播间 && !girlNames.includes(data.玩家信息.所在直播间)) {
        data.玩家信息.所在直播间 = canonGirlName(data.玩家信息.所在直播间);
        if (!girlNames.includes(data.玩家信息.所在直播间)) data.玩家信息.所在直播间 = null;
    }

    const watching = data.玩家信息.所在直播间;
    if (watching && girls[watching]?.直播?.开播 !== true) {
        data.玩家信息.所在直播间 = null;
    }

    const companion = data.玩家信息.同行;
    const playerLoc = data.世界信息?.位置;
    if (companion && girls[companion]?.位置 && playerLoc) {
        if (playerLoc.区域) girls[companion].位置.区域 = playerLoc.区域;
        if (playerLoc.场所 != null) girls[companion].位置.场所 = playerLoc.场所;
    }

    return data;
});

$(() => {
    registerMvuSchema(Schema);
});
