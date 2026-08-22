/**
 * 管人痴 / 都市日系 SLG · 辅助计算脚本
 *
 * 挂在酒馆助手「脚本」里单独运行。不要塞进玻璃状态栏：
 * 状态栏 iframe 的加载顺序盖不住整段对话，换日、时段、私密度、牌子
 * 必须在这里写回 MVU。
 *
 * 对照 变量相关/变量草稿。本脚本只做冷代码能判定的事；聊天里的进房、
 * 关注、上班仍由 AI 写，面板点的那些等 HUD 接线后再走自定义事件。
 *
 * 写法对齐 参考/辅助计算脚本.js：IIFE、等 Mvu、听 VARIABLE_UPDATE_ENDED、
 * 直接改 stat_data、防重入。
 */

(function () {
    'use strict';

    const TAG = '[管人痴辅助]';
    const CAL_FROM = 2026;
    const CAL_TO = 2030;
    const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const SEASON_BY_MONTH = [
        '冬季', '冬季', '春季', '春季', '春季',
        '夏季', '夏季', '夏季', '秋季', '秋季', '秋季', '冬季',
    ];
    const TIER_RANK = { 无: 0, 办卡: 1, 舰长: 2, 提督: 3, 总督: 4 };

    /* 世界书全名 → HUD 短名。跟 酒馆变量/mvuzod.js 的 GIRL_NAME_ALIAS 是同一份，
       正文美化.html 原来也自己存了一份（LR_HOST_ALIAS），已经改成走这里。
       AI 写 `主播: 永雏塔菲` 的时候要能折回 塔菲。 */
    const GIRL_NAME_ALIAS = {
        永雏塔菲: '塔菲',
        沙花叉克萝伊: '沙花叉',
        梦见璃亚梦: '璃亚梦',
        伊贺栖寅: '斯黛拉',
        '斯黛拉（伊贺栖寅）': '斯黛拉',
    };

    function canonGirlName(name) {
        if (name == null) return '';
        const key = String(name).trim();
        return GIRL_NAME_ALIAS[key] || key;
    }


    /* 直播习惯是稳定底盘，当天是否准时、休播或临时开播由日期种子决定。
       同一游戏日反复刷新得到同一结果，换日才会重新投骰；这比 Math.random()
       每次变量更新都翻转状态稳定。AI 明确改写直播字段时，当天自动结果让位。 */
    const STREAM_HABITS = {
        '塔菲': {
            days: ['周一', '周二', '周四', '周五', '周六', '周日'], start: '20:00', end: '23:30',
            reliability: 0.88, surprise: 0.06,
            titles: ['晚间杂谈与SC回', '联机游戏回', '新衣装与观众问答'],
        },
        '东雪莲': {
            days: ['周一', '周二', '周三', '周四', '周五', '周六'], start: '21:30', end: '00:30',
            reliability: 0.82, surprise: 0.10,
            titles: ['深夜杂谈', '游戏联机回', '观众点歌与聊天'],
        },
        '时雨羽衣': {
            days: ['周三', '周日'], start: '22:00', end: '00:30',
            reliability: 0.76, surprise: 0.04,
            titles: ['绘画杂谈', '游戏实况', '近况报告与告知'],
        },
        '沙花叉': {
            days: ['周一', '周二', '周四', '周五', '周日'], start: '21:00', end: '00:30',
            reliability: 0.80, surprise: 0.08,
            titles: ['晚间杂谈', '歌回', '挑战类游戏回'],
        },
        '红蔷薇': {
            days: ['周一', '周二', '周四', '周五', '周日'], start: '19:00', end: '22:00',
            reliability: 0.84, surprise: 0.07,
            titles: ['黄昏音乐电台', '情感来信杂谈', '夜景歌回'],
        },
        '斯黛拉': {
            days: ['周二', '周三', '周四', '周五', '周六', '周日'], start: '18:30', end: '21:30',
            reliability: 0.86, surprise: 0.05,
            titles: ['傍晚电台', '声音练习与点歌', '工作室杂谈'],
        },
        '璃亚梦': {
            days: ['周一', '周三', '周四', '周五', '周六', '周日'], start: '23:00', end: '02:00',
            reliability: 0.78, surprise: 0.16,
            titles: ['深夜emo小作文', '观众投票杂谈', '突发游戏回'],
        },
    };
    const streamManualLocks = new Map();
    const streamAutoWrites = new Map();

    // ==========================================
    // 地图节点私密度（来自 变量相关/city_mapdata_*.js，外加样例用地名）
    // 键：节点名，以及「大区域 · 节点名」
    // ==========================================

    const NODE_PRIVACY = {
        '大学城自习室': 2,
        '德泰百货': 1,
        '东塘奥特莱斯': 1,
        '东塘草莓园': 2,
        '东塘空港': 1,
        '东塘临江乐园': 3,
        '东塘区 · 东塘奥特莱斯': 1,
        '东塘区 · 东塘草莓园': 2,
        '东塘区 · 东塘空港': 1,
        '东塘区 · 东塘临江乐园': 3,
        '东塘区 · 东塘私汤别苑': 5,
        '东塘私汤别苑': 5,
        '鼓岭爱宠诊疗所': 3,
        '鼓岭买手店': 1,
        '鼓岭青砖咖啡': 2,
        '鼓岭区 · 鼓岭爱宠诊疗所': 3,
        '鼓岭区 · 鼓岭买手店': 1,
        '鼓岭区 · 鼓岭青砖咖啡': 2,
        '鼓岭区 · 鼓岭十字书店': 2,
        '鼓岭区 · 梧桐里': 1,
        '鼓岭区 · 梧桐里裁缝铺': 2,
        '鼓岭区 · 梧桐里洗衣房': 2,
        '鼓岭区 · 梧桐里照相馆': 4,
        '鼓岭区 · 云庭公寓': 4,
        '鼓岭十字书店': 2,
        '湖滨商街': 1,
        '花牌楼主题酒店': 5,
        '极光声学棚': 3,
        '江厦塔避难层': 3,
        '江厦塔机械车库': 3,
        '临江南站': 0,
        '落霞古籍文献馆': 2,
        '落霞后街': 1,
        '落霞极速网咖': 3,
        '落霞区 · 大学城自习室': 2,
        '落霞区 · 落霞古籍文献馆': 2,
        '落霞区 · 落霞后街': 1,
        '落霞区 · 落霞极速网咖': 3,
        '落霞区 · 学府七舍天台': 4,
        '明湖湖心岛': 4,
        '明湖环洲': 1,
        '明湖区 · 德泰百货': 1,
        '明湖区 · 湖滨商街': 1,
        '明湖区 · 明湖湖心岛': 4,
        '明湖区 · 明湖环洲': 1,
        '明湖区 · 明湖星河巨幕': 3,
        '明湖区 · 明湖云阙': 2,
        '明湖区 · 明湖中心医院': 2,
        '明湖星河巨幕': 3,
        '明湖云阙': 2,
        '明湖中心医院': 2,
        '浦江集装箱堆场': 4,
        '浦江研创园': 2,
        '青屏山半山茶社': 2,
        '青屏山背阴谷': 4,
        '青屏山风景区 · 青屏山半山茶社': 2,
        '青屏山风景区 · 青屏山背阴谷': 4,
        '青屏山风景区 · 青屏山古天文台': 4,
        '青屏山风景区 · 青屏山密林': 4,
        '青屏山风景区 · 青屏山索道': 2,
        '青屏山古天文台': 4,
        '青屏山密林': 4,
        '青屏山索道': 2,
        '清河塘澡堂': 3,
        '瓦房成人家居': 4,
        '乌溪画舫': 2,
        '乌溪门东': 1,
        '乌溪区 · 花牌楼主题酒店': 5,
        '乌溪区 · 清河塘澡堂': 3,
        '乌溪区 · 瓦房成人家居': 4,
        '乌溪区 · 乌溪画舫': 2,
        '乌溪区 · 乌溪门东': 1,
        '乌溪区 · 夜巷': 3,
        '梧桐里': 1,
        '梧桐里裁缝铺': 2,
        '梧桐里洗衣房': 2,
        '梧桐里照相馆': 4,
        '西洲岸声': 2,
        '西洲大剧院': 2,
        '西洲地下居酒屋': 2,
        '西洲江眼桥': 0,
        '西洲区 · 极光声学棚': 3,
        '西洲区 · 江厦塔避难层': 3,
        '西洲区 · 江厦塔机械车库': 3,
        '西洲区 · 西洲岸声': 2,
        '西洲区 · 西洲大剧院': 2,
        '西洲区 · 西洲地下居酒屋': 2,
        '西洲区 · 西洲江眼桥': 0,
        '西洲区 · 西洲永初里': 1,
        '西洲区 · 星芒电竞舱': 3,
        '西洲区 · 云庭公寓': 4,
        '西洲区 · 洲门站': 0,
        '西洲永初里': 1,
        '星芒电竞舱': 3,
        '学府七舍天台': 4,
        '夜巷': 3,
        '雨石跨江轮渡': 2,
        '雨石芦荡': 4,
        '雨石码头': 2,
        '雨石与浦江区 · 临江南站': 0,
        '雨石与浦江区 · 浦江集装箱堆场': 4,
        '雨石与浦江区 · 浦江研创园': 2,
        '雨石与浦江区 · 雨石跨江轮渡': 2,
        '雨石与浦江区 · 雨石芦荡': 4,
        '雨石与浦江区 · 雨石码头': 2,
        '云庭公寓': 4,
        '洲门站': 0,
        '自宅': 5,
    };

    // ------------------------------------------
    // 卡片和脚本之间的三个口子
    // ------------------------------------------

    const MVU_SCOPE = { type: 'message', message_id: 'latest' };

    function readBundle() {
        try {
            if (typeof Mvu === 'undefined') return null;
            const data = Mvu.getMvuData(MVU_SCOPE);
            if (!data || !data.stat_data) return null;
            return { data, stat: data.stat_data };
        } catch (err) {
            console.error(TAG, err);
            return null;
        }
    }

    function commitBundle(bundle) {
        try {
            Mvu.replaceMvuData(bundle.data, MVU_SCOPE);
            return true;
        } catch (err) {
            console.error(TAG, err);
            return false;
        }
    }

    /** 礼物栏要画的东西。价格、点数、图标 URL 都从这里拿，卡片不自己存。 */
    function roomMenu() {
        /* 图标走 Pages 的 assets/gifts/。原来拼的是 图床/礼物/gift-*.png，
           那个目录从来没上传过，11 个文件全 404 —— 礼物栏一直是没有图的。
           现在用同目录下新出的 128×128 webp（合计 60KB，原来的 256 png 留着给 HUD 自己的礼物页）。 */
        const icon = file => `${PAGES_HOST}/assets/gifts/${file}`;
        return {
            礼物: GIFTS.map(g => ({ ...g, 图标: icon(g.file) })),
            大航海: GUARD_BUY.map(g => ({ ...g, 图标: icon(g.file) })),
            数量档位: QTY_STEPS.slice(),
            醒目留言档位: SC_STEPS.slice(),
            资源域名: ART_HOST,
            底图域名: `${PAGES_HOST}/city/plate`,
        };
    }

    /** 卡片挂载时读一次的快照。顺手把这间房的对手种上（第一次进房才会生成）。 */
    function roomView(name) {
        const host = canonGirlName(name);
        const bundle = readBundle();
        if (!bundle) return null;
        const room = seedRoom(bundle.stat, host);
        if (!room) return null;
        repaintHeat(bundle.stat, host);
        commitBundle(bundle);

        const stat = bundle.stat;
        const girl = girlOf(stat, host) || {};
        const live = girl.直播 || {};
        const player = stat.玩家信息 || {};
        const fan = player.粉丝身份?.[host] || {};
        const navy = room.大航海 || {};
        return {
            主播: host,
            牌子名: room.牌子名 || host,
            档期: room.档期 || '',
            开播: live.开播 === true,
            标题: live.标题 || '',
            热度: (Number(room.底盘热度) || 0) + (Number(room.本场热度) || 0),
            底盘热度: Number(room.底盘热度) || 0,
            粉丝数: Number(live.粉丝数) || 0,
            金钱: Number(player.金钱) || 0,
            关注: fan.关注 === true,
            累计打赏: Number(fan.累计打赏) || 0,
            牌子等级: badgeLevel(fan.累计打赏),
            牌子档位: fan.牌子档位 && fan.牌子档位 !== '无' ? fan.牌子档位 : '',
            牌子剩余天数: Number(fan.牌子剩余天数) || 0,
            高能榜: (Array.isArray(room.高能榜) ? room.高能榜 : []).map(r => ({ 名字: r.名字, 本场消费: Number(r.本场消费) || 0 })),
            大航海: {
                舰长: Number(navy.舰长) || 0,
                提督: Number(navy.提督) || 0,
                总督: Number(navy.总督) || 0,
                名单: Array.isArray(navy.名单) ? navy.名单.slice() : [],
            },
        };
    }

    /**
     * 玩家在直播间做的每一件事都走这一个入口，卡片不再自己拼 MVU 补丁。
     * 入参：{ 主播, 动作: '礼物'|'大航海'|'醒目留言'|'关注'|'进房', 礼物, 数量, 金额, 内容, 关注 }
     * 返回：{ ok, 花费, 人气, 还手, 提示, 快照 }；钱不够或名字不认识就 ok:false，什么都不写。
     */
    function roomAction(input) {
        const req = input || {};
        const host = canonGirlName(req.主播);
        const bundle = readBundle();
        if (!bundle) return { ok: false, 提示: 'MVU 未就绪' };
        const stat = bundle.stat;
        if (!girlOf(stat, host)) return { ok: false, 提示: `没有这个主播: ${host}` };

        const room = seedRoom(stat, host);
        const player = ensureObj(stat, '玩家信息');
        const fan = ensureObj(ensureObj(player, '粉丝身份'), host);
        const action = String(req.动作 || '').trim();

        if (action === '进房') {
            player.所在直播间 = host;
            repaintHeat(stat, host);
            commitBundle(bundle);
            return { ok: true, 花费: 0, 快照: roomView(host) };
        }
        if (action === '关注') {
            fan.关注 = req.关注 !== false;
            commitBundle(bundle);
            return { ok: true, 花费: 0, 快照: roomView(host) };
        }

        // 以下都要花钱
        let cost = 0;
        let popAdd = 0;
        let guard = null;
        let qty = 1;
        if (action === '礼物') {
            const gift = giftOf(req.礼物);
            if (!gift) return { ok: false, 提示: `没有这件礼物: ${req.礼物}` };
            qty = Math.max(1, Math.floor(Number(req.数量) || 1));
            cost = gift.price * qty;
            // 先算钱够不够，再动 combo：拒绝掉的那一笔不该留下连送痕迹
            if (cost > (Number(player.金钱) || 0)) return { ok: false, 提示: '余额不足' };
            popAdd = comboPop(room, gift.name, gift.pop, qty);
        } else if (action === '大航海') {
            guard = guardOf(req.礼物 || req.档位);
            if (!guard) return { ok: false, 提示: `没有这个档位: ${req.礼物 || req.档位}` };
            cost = guard.price;
            if (cost > (Number(player.金钱) || 0)) return { ok: false, 提示: '余额不足' };
            popAdd = guard.pop;
            resetCombo(room);
        } else if (action === '醒目留言') {
            cost = Math.max(0, Math.floor(Number(req.金额) || 0));
            if (!cost) return { ok: false, 提示: '醒目留言金额为空' };
            if (cost > (Number(player.金钱) || 0)) return { ok: false, 提示: '余额不足' };
            popAdd = Math.round(cost * 4);
            resetCombo(room);
        } else {
            return { ok: false, 提示: `未知动作: ${action}` };
        }

        const money = Number(player.金钱) || 0;
        player.金钱 = money - cost;
        player.所在直播间 = host;
        if (cost > 0) {
            fan.关注 = true;
            fan.累计打赏 = (Number(fan.累计打赏) || 0) + cost;
            fan.牌子等级 = badgeLevel(fan.累计打赏);
        }
        if (guard) {
            fan.牌子档位 = guard.name;
            fan.牌子剩余天数 = guard.days;
            const navy = ensureObj(room, '大航海');
            navy[guard.name] = (Number(navy[guard.name]) || 0) + 1;
            if (!Array.isArray(navy.名单)) navy.名单 = [];
            const mine = navy.名单.find(x => x.名字 === '你');
            if (mine) { mine.档位 = guard.name; mine.天数 = guard.days; }
            else navy.名单.unshift({ 名字: '你', 档位: guard.name, 天数: guard.days });
        }

        room.本场热度 = (Number(room.本场热度) || 0) + popAdd;

        if (cost > 0) {
            if (!Array.isArray(room.高能榜)) room.高能榜 = [];
            const mine = room.高能榜.find(r => r.名字 === '你');
            if (mine) mine.本场消费 = (Number(mine.本场消费) || 0) + cost;
            else room.高能榜.push({ 名字: '你', 本场消费: cost });
            room.高能榜.sort((a, b) => Number(b.本场消费) - Number(a.本场消费));
        }

        repaintHeat(stat, host);
        // 单笔 ≥100 才可能招来还手；小额刷榜不惊动榜一
        const strike = cost >= 100 ? rivalStrikeBack(stat, host) : null;
        commitBundle(bundle);

        return {
            ok: true,
            花费: cost,
            人气: popAdd,
            还手: strike,
            快照: roomView(host),
        };
    }

    // ==========================================
    // 工具
    // ==========================================

    function clampInt(value, min, max, fallback) {
        const n = Math.floor(Number(value));
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, n));
    }

    function isLeap(year) {
        return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    }

    function daysInMonth(year, month) {
        return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    }

    function dayOfYear(year, month, day) {
        let n = day;
        for (let m = 1; m < month; m++) n += daysInMonth(year, m);
        return n;
    }

    function parseMvuDate(full) {
        const match = String(full || '').trim().match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
        if (!match) return null;
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
        return { year, month, day };
    }

    function calendarSide(full) {
        const parsed = parseMvuDate(full);
        if (!parsed) return null;
        const { year, month, day } = parsed;
        const week = Math.floor((dayOfYear(year, month, day) - 1) / 7) + 1;
        return {
            星期: WEEKDAYS[new Date(year, month - 1, day).getDay()],
            季节: SEASON_BY_MONTH[month - 1],
            年内周次: week,
        };
    }

    /** 预置 2026–2030，缺档时用同一公式现场算。 */
    const CALENDAR_TABLE = (function buildCalendarTable() {
        const table = Object.create(null);
        for (let year = CAL_FROM; year <= CAL_TO; year++) {
            for (let month = 1; month <= 12; month++) {
                const dim = daysInMonth(year, month);
                for (let day = 1; day <= dim; day++) {
                    const full = `${year}年${month}月${day}日`;
                    table[full] = calendarSide(full);
                }
            }
        }
        return table;
    })();

    function dateDisplayOf(full) {
        const key = String(full || '').trim();
        return CALENDAR_TABLE[key] || calendarSide(key);
    }

    /** 草稿梯子。起点含、终点不含。23:00 起算深夜。 */
    function periodFromClock(clock) {
        const [h, m] = String(clock || '').split(':').map(Number);
        if (!Number.isFinite(h)) return null;
        const t = h * 60 + (Number.isFinite(m) ? m : 0);
        if (t >= 6 * 60 && t < 9 * 60) return '朝';
        if (t >= 9 * 60 && t < 16 * 60) return '昼';
        if (t >= 16 * 60 && t < 19 * 60) return '暮';
        if (t >= 19 * 60 && t < 23 * 60) return '夜';
        return '深夜';
    }

    function badgeLevel(tipped) {
        const x = Math.max(0, Number(tipped) || 0);
        if (x <= 0) return 0;
        if (x >= 200000) return 20;
        return Math.min(20, Math.floor(20 * (x / 200000) ** (1 / 3.5)));
    }

    // ==========================================
    // 主播体量：粉丝数 / 底盘热度 / 大航海
    // ==========================================

    /**
     * 一个主播有多大，只由「体量档位」这一个 0–100 的刻度决定，其余全是它的函数。
     * 这里是唯一的定义处：开局页那根滑杆、以后 HUD 和直播间状态机都走这两个函数，
     * 不要在别的文件里再存一张"这间房多大"的表——之前 STREAM_HABITS.viewers 和
     * 正文美化.html 的 LR_HOSTS.pop 各存一份，结果七个人的大小排序在玩家眼前是反的。
     *
     * 底盘热度取 50 × 8^(档位/25)，每 25 档翻 8 倍。系数是拿 LR_HOSTS.pop 里那七个
     * 已定稿的值反解定标的：时雨羽衣 1200 → 38、红蔷薇 2800 → 48、斯黛拉 3100 → 49、
     * 沙花叉 3600 → 51、东雪莲 4200 → 53、璃亚梦 6310 → 58、塔菲 18240 → 71，
     * 跟她们各自在世界里的位置一一对得上。
     *
     * 粉丝／热度比随体量下降（小主播 60 倍、头部 18 倍）：小直播间靠路人堆关注数，
     * 大直播间本来就留得住人。大航海按粉丝的 0.12% → 0.5%，随体量上升。
     *
     * 注意区分两个"热度"：
     *   底盘热度 —— 常态值，只跟体量有关，下播后回落到它附近；
     *   本场热度 —— 这一场靠礼物堆上去的虚火，下播清零。
     * 玩家在直播间看到的 对象信息.X.直播.热度 = 底盘热度 + 本场热度残留。
     *
     * 只做换算，不写回变量。
     */
    const TIER_LABELS = [
        [20, '小透明'], [40, '小有关注'], [60, '稳定主播'],
        [80, '热门主播'], [95, '头部主播'], [Infinity, '现象级'],
    ];

    function roundNice(n) {
        const x = Math.max(0, Math.round(Number(n) || 0));
        if (x >= 100000) return Math.round(x / 1000) * 1000;
        if (x >= 10000) return Math.round(x / 100) * 100;
        if (x >= 1000) return Math.round(x / 10) * 10;
        return x;
    }

    function tierLabel(tier) {
        return (TIER_LABELS.find(([max]) => tier < max) || TIER_LABELS[TIER_LABELS.length - 1])[1];
    }

    /** 体量档位 → 这个主播的全套规模数字。 */
    function streamScale(tier) {
        const t = Math.max(0, Math.min(100, Number(tier) || 0));
        const base = 50 * 8 ** (t / 25);
        const followers = base * (60 - 0.42 * t);
        const guards = followers * (0.0012 + 0.000038 * t);
        return {
            档位: t,
            档位名: tierLabel(t),
            粉丝数: roundNice(followers),
            底盘热度: roundNice(base),
            舰长数: roundNice(guards),
            /* 提督（1998/月）和总督（19998/月）是稀的，而且要能干净地归零——
               减去一个门槛再除，小房两档都是 0，符合草稿「小房经常是 0」。
               比值上比草稿更保守：草稿头牌是 舰长:提督 ≈ 15:1、舰长:总督 ≈ 60:1，
               这里是 24:1 和 260:1。 */
            提督数: Math.max(0, Math.floor((guards - 40) / 24)),
            总督数: Math.max(0, Math.floor((guards - 300) / 260)),
        };
    }

    /**
     * 粉丝数 → 体量档位。粉丝数是存进 MVU 的那个权威值（AI 也看得到），
     * 底盘热度和大航海要能从它一致地反推出来，否则改一个忘一个就会漂。
     * 曲线单调，直接扫一遍 0–100 取最近的整数档，比解析求逆好读也够准。
     */
    function tierOfFollowers(followers) {
        const target = Math.max(0, Number(followers) || 0);
        let best = 0;
        let bestGap = Infinity;
        for (let t = 0; t <= 100; t += 0.1) {
            const gap = Math.abs(streamScale(t).粉丝数 - target);
            if (gap < bestGap) { bestGap = gap; best = t; }
        }
        return Math.round(best * 10) / 10;
    }

    /** 粉丝数 → 全套规模数字。七位已定稿主播存粉丝数，其余都从这里推。 */
    function scaleOfFollowers(followers) {
        return streamScale(tierOfFollowers(followers));
    }

    // ==========================================
    // 直播间状态机
    // ==========================================

    /* 对照 草稿/直播间状态机.md。本文件是直播间所有数值的唯一出处：礼物表、人气点数、
       NPC 对手、热度涨落、榜与大航海的写入都在这里。正文美化.html 只负责画，
       不存表、不算数、不写 MVU——它通过 LinjiangAux.roomMenu/roomView/roomAction 说话。

       两个"热度"始终分开：
         底盘热度 —— 常态值，由粉丝数反解，礼物不动它；
         本场热度 —— 这一场靠礼物堆的虚火，没有新礼物就按拍衰减，下播清零。
       给 AI 看的 对象信息.<名>.直播.热度 = 底盘 + 本场，收成约数。 */

    // 一件东西一行：价格、人气点数、图标文件。以前价格/点数/图标分在三张表里。
    const GIFTS = [
        { name: '小心心', price: 0, pop: 2, file: 'gift-heart.webp' },
        { name: '辣条', price: 1, pop: 8, file: 'gift-snack.webp' },
        { name: '干杯', price: 20, pop: 70, file: 'gift-cheers.webp' },
        { name: '心愿盲盒', price: 50, pop: 150, file: 'gift-blindbox.webp' },
        { name: '情书', price: 100, pop: 400, file: 'gift-letter.webp' },
        { name: '小飞机', price: 200, pop: 900, file: 'gift-plane.webp' },
        { name: '摩天大楼', price: 520, pop: 2200, file: 'gift-tower.webp' },
        { name: '火箭', price: 1288, pop: 8000, file: 'gift-rocket.webp' },
    ];
    const GUARD_BUY = [
        { name: '舰长', price: 138, pop: 500, days: 30, file: 'gift-guard-1.webp' },
        { name: '提督', price: 1998, pop: 9000, days: 30, file: 'gift-guard-2.webp' },
        { name: '总督', price: 19998, pop: 40000, days: 30, file: 'gift-guard-3.webp' },
    ];
    const QTY_STEPS = [1, 10, 66, 233];
    const SC_STEPS = [30, 50, 100];
    /* 两个资源站，分工是被响应头逼出来的：
       ART_HOST（图床）放头像和 SFW 封面。它不给 Cache-Control，也不给
         Access-Control-Allow-Origin —— 后者意味着跨源 fetch 读不到响应体，
         素材缓存脚本没法把它的东西收进 IndexedDB，只能交给浏览器的启发式缓存。
         头像封面本来就在上面、<img> 直连不需要 CORS，所以不动它。
       PAGES_HOST（GitHub Pages）放礼物图标和突发事件底图。它给
         Cache-Control: max-age=600 + ETag + ACAO: *，能被缓存脚本接管；
         而且这两类素材本来就在仓库里，跟着 pages.yml 一起发，不用手动上传。 */
    const ART_HOST = 'https://anchor.bolt.qzz.io';
    const PAGES_HOST = 'https://tangquanghuy.github.io/linjiang-glass';

    /* NPC 名字池：临江本地网名的调子（地名 + 生活状态），不要平台网名腔。 */
    const NPC_NAMES = [
        '云庭7楼', '湖滨卡座', '鼓岭晚风', '西洲加班人', '梧桐里租客', '落霞后街',
        '明湖环洲', '洲门站末班', '雨石轮渡', '青屏山雾', '东塘镇口', '乌溪门东',
        '浦江夜班', '学府七舍', '德泰三楼', '江厦塔停车场', '清河塘常客', '夜巷拐角',
        '永初里二单元', '星芒3号舱',
    ];

    /* 连送递减，下限 40%。刷辣条不能把房间刷成火箭场。 */
    const COMBO_DECAY = [1, 0.85, 0.7, 0.55, 0.4];
    /* 没有新礼物时，本场热度每拍衰减一成。 */
    const SESSION_DECAY = 0.9;

    /* ===== 观众带来的热度 =====
       原来 本场热度 只有玩家掏钱才会动：玩家全程只看不花钱，一整场热度就钉在
       底盘 × pulse 上不动，等于"热度只反映玩家投入"。观众送的礼、公屏的人气
       一点都不算，这不合理。补两条：

       一、正文里那段 <LiveRoom> 的弹幕，按内容结算（只有玩家在看的房间有）。
           这段文本是 AI 必须按 世界书/直播间卡片规则 输出的结构化格式，
           字段固定、礼物名取自白名单，所以能直接当输入用，不必让 AI 另写热度。
           热度是 底盘+本场 的派生量，交给 AI 写必然和底盘/本场那条分界打架，
           而且 变量更新规则 里 直播.热度 本来就在 脚本只读 名单上。

       二、所有在播的房间，每拍加一点环境流量（跟玩家在不在看无关）。
           路人进出本来就该有起伏，代码算这个没成本。

       发言按底盘的比例折算、礼物按 GIFTS 表的绝对点数：绝对值在塔菲（底盘
       18200）和璃亚梦（1390）之间差十三倍，一条发言写死几点对小房是洪水、
       对塔菲是噪音；而一发火箭在小房掀翻天，那是应该的。 */

    /** 每条发言（普通/舰长/提督/总督）折算成底盘的多少。一轮 20 条约 3%。 */
    const CHAT_HEAT_RATE = 0.0015;
    /** 观众送礼的点数打折：玩家自己送的火箭要比路人的更有分量。 */
    const NPC_GIFT_WEIGHT = 0.6;
    /** 一轮最多计入几条礼物弹幕。防 AI 一口气写六个火箭，卡条数比卡点数直观。 */
    const NPC_GIFT_LINES_MAX = 6;
    /** 一轮弹幕结算的总增量上限，按底盘的倍数。 */
    const ROUND_GAIN_CAP_RATE = 1.5;
    /** 环境流量：每拍最多加底盘的百分之几。配 0.9 衰减，收敛在底盘的 1.3 倍附近。 */
    const AMBIENT_MAX_RATE = 0.06;

    /**
     * 连送递减，两层一起算：
     *   1) 单笔内部——一次送 n 个，第 2 个起就开始打折，刷 233 个辣条不等于 233 倍人气；
     *   2) 跨笔——连续送同一件礼物才累计，换一件就重置。
     * 不按世界时钟算：时钟只有 AI 推进时才动，整场直播可能一直停在同一分钟，
     * 按分钟算会把「辣条→干杯→情书→火箭」这条正常消费链也当成连刷全部打到下限。
     */
    /** 从第 startStep 连击开始，送 qty 个的递减总点数。观众送礼也用这条，只是不记连击状态。 */
    function decayedPop(unitPop, qty, startStep) {
        let step = Math.max(0, Number(startStep) || 0);
        let total = 0;
        for (let i = 0; i < qty; i += 1) {
            total += unitPop * COMBO_DECAY[Math.min(step, COMBO_DECAY.length - 1)];
            step += 1;
        }
        return { total: Math.round(total), step };
    }

    function comboPop(room, giftName, unitPop, qty) {
        const combo = ensureObj(room, '连送');
        const start = combo.礼物 === giftName ? (Number(combo.次数) || 0) : 0;
        const { total, step } = decayedPop(unitPop, qty, start);
        combo.礼物 = giftName;
        combo.次数 = step;
        return total;
    }

    function resetCombo(room) {
        const combo = ensureObj(room, '连送');
        combo.礼物 = '';
        combo.次数 = 0;
    }

    function giftOf(name) {
        const key = String(name || '').trim();
        return GIFTS.find(g => g.name === key) || GUARD_BUY.find(g => g.name === key) || null;
    }

    function guardOf(name) {
        const key = String(name || '').trim();
        return GUARD_BUY.find(g => g.name === key) || null;
    }

    function roomOf(statData, name) {
        const sys = ensureObj(statData, '系统配置');
        return ensureObj(ensureObj(sys, '直播间'), name);
    }

    function girlOf(statData, name) {
        const girls = statData?.对象信息;
        return (girls && girls[name]) || null;
    }

    /** 榜一 NPC 的开工消费：按底盘热度定档。塔菲那档约 730，小房约 50~150。 */
    function rivalSeedSpend(baseHeat) {
        return Math.max(40, Math.min(900, Math.round(baseHeat * 0.04)));
    }

    /**
     * 第一次进这间房（或本聊天第一次开播）时生成对手，之后只更新、不重抽。
     * 种子存进 系统配置.直播间.<名>.种子，所以重进房间还是那几个人。
     */
    function seedRoom(statData, name) {
        const room = roomOf(statData, name);
        const girl = girlOf(statData, name);
        if (!girl || !girl.直播) return null;

        // 底盘热度和大航海人数缺了就从粉丝数补——开局页没写过的自定义主播会走到这里
        const followers = Number(girl.直播.粉丝数) || 0;
        const scale = followers > 0 ? scaleOfFollowers(followers) : null;
        if (!(Number(room.底盘热度) > 0) && scale) room.底盘热度 = scale.底盘热度;
        if (typeof room.本场热度 !== 'number') room.本场热度 = 0;
        const navy = ensureObj(room, '大航海');
        if (!(Number(navy.舰长) > 0) && scale) {
            navy.舰长 = scale.舰长数;
            navy.提督 = scale.提督数;
            navy.总督 = scale.总督数;
        }
        if (!Array.isArray(navy.名单)) navy.名单 = [];

        if (room.种子) return room;

        const seed = `${name}|${statData.世界信息?.年历 || ''}|${Date.now().toString(36)}`;
        room.种子 = seed;

        const base = Number(room.底盘热度) || 0;
        const top = rivalSeedSpend(base);
        const count = 4 + Math.floor(streamHashUnit(`${seed}|count`) * 4); // 4~7 个
        const pool = NPC_NAMES.slice();
        const board = [];
        for (let i = 0; i < count; i += 1) {
            const pick = Math.floor(streamHashUnit(`${seed}|name|${i}`) * pool.length);
            const who = pool.splice(pick, 1)[0] || ('观众' + (i + 1));
            /* 榜一拿满额，往下按 0.62^i 递减再抖一点：榜首和榜二要有明显差距，
               不然玩家一笔就能连超三个人。 */
            const share = top * (0.62 ** i) * (0.8 + streamHashUnit(`${seed}|spend|${i}`) * 0.4);
            board.push({ 名字: who, 本场消费: Math.max(1, Math.round(share)) });
        }
        board.sort((a, b) => b.本场消费 - a.本场消费);
        room.高能榜 = board;

        // 大航海名单里放几个常客具名位，人数仍以三档计数为准
        const named = Math.min(Number(navy.舰长) || 0, 1 + Math.floor(streamHashUnit(`${seed}|navy`) * 3));
        const navyList = [];
        for (let i = 0; i < named; i += 1) {
            const pick = Math.floor(streamHashUnit(`${seed}|navyname|${i}`) * pool.length);
            const who = pool.splice(pick, 1)[0] || ('舰长' + (i + 1));
            navyList.push({ 名字: who, 档位: '舰长', 天数: 1 + Math.floor(streamHashUnit(`${seed}|navyday|${i}`) * 30) });
        }
        if ((Number(navy.提督) || 0) > 0 && pool.length) {
            const who = pool.splice(Math.floor(streamHashUnit(`${seed}|ti`) * pool.length), 1)[0];
            navyList.push({ 名字: who, 档位: '提督', 天数: 1 + Math.floor(streamHashUnit(`${seed}|tiday`) * 30) });
        }
        if ((Number(navy.总督) || 0) > 0 && pool.length) {
            const who = pool.splice(Math.floor(streamHashUnit(`${seed}|du`) * pool.length), 1)[0];
            navyList.push({ 名字: who, 档位: '总督', 天数: 1 + Math.floor(streamHashUnit(`${seed}|duday`) * 30) });
        }
        navy.名单 = navyList;

        // 榜一还手的本场预算，用尽就认输，防止 NPC 钱包无限
        room.还手预算 = Math.round(top * (2 + streamHashUnit(`${seed}|budget`) * 2));
        room.连送 = { 礼物: '', 次数: 0 };
        console.log(TAG, `直播间对手已生成: ${name} / ${count} 人 / 榜一 ${board[0]?.本场消费}`);
        return room;
    }

    /** 给 AI 看的 直播.热度 = 底盘 + 本场，收成约数。 */
    function repaintHeat(statData, name) {
        const room = roomOf(statData, name);
        const girl = girlOf(statData, name);
        if (!girl?.直播) return;
        if (girl.直播.开播 !== true) return;
        const total = (Number(room.底盘热度) || 0) + (Number(room.本场热度) || 0);
        writeIfChanged(girl.直播, '热度', roundNice(total));
    }

    // ==========================================
    // <LiveRoom> 弹幕的语法层
    // 只把「一行 → 字段表」这件事做掉，不管显示。正文美化.html 的
    // lrParseDanmuLine 负责把字段映射成渲染用的结构，那一层留在卡片里。
    // 语法只有这一份：两边各写一个迟早会漂，这仓库里已经吃过好几次这种亏。
    // ==========================================

    const ROOM_FIELD_KEYS = ['类型', '名字', '礼物', '数量', '金额', '内容', '牌子'];

    /** 一行弹幕 → { 类型, 名字, 礼物, 数量, 金额, 内容, 牌子 }。认不出来返回 null。 */
    function parseRoomLine(rawLine) {
        const text = String(rawLine || '').replace(/^[-•]\s+/, '').trim();
        if (!text) return null;
        const re = new RegExp('(' + ROOM_FIELD_KEYS.join('|') + ')\\s*[:：]', 'g');
        const hits = [];
        let m;
        while ((m = re.exec(text))) hits.push({ key: m[1], at: m.index, end: m.index + m[0].length });
        if (!hits.length) return null;
        const fields = {};
        for (let i = 0; i < hits.length; i += 1) {
            const to = i + 1 < hits.length ? hits[i + 1].at : text.length;
            fields[hits[i].key] = text.slice(hits[i].end, to).trim();
        }
        return fields;
    }

    /** 整段 <LiveRoom> 正文 → { 主播, 主播说, 弹幕: [字段表] }。 */
    function parseRoomText(raw) {
        const room = { 主播: '', 主播说: '', 弹幕: [] };
        let inDanmu = false;
        String(raw || '').split(/\r?\n/).forEach((line) => {
            const t = line.trim();
            if (!t) return;
            if (/^弹幕\s*[:：]/.test(t)) { inDanmu = true; return; }
            if (/^主播说\s*[:：]/.test(t)) { inDanmu = false; room.主播说 = t.replace(/^主播说\s*[:：]\s*/, ''); return; }
            if (/^主播\s*[:：]/.test(t)) { inDanmu = false; room.主播 = t.replace(/^主播\s*[:：]\s*/, '').trim(); return; }
            if (/^[-•]\s+/.test(t) || inDanmu) {
                const fields = parseRoomLine(t);
                if (fields && fields.类型) room.弹幕.push(fields);
            }
        });
        return room;
    }

    /** 从整条消息里挑出所有 <LiveRoom> 段。闭合标签只认 ASCII 名，见 世界书/直播间卡片规则。 */
    function extractRoomBlocks(text) {
        const out = [];
        const re = /<LiveRoom\s*>([\s\S]*?)<\/\s*LiveRoom\s*>/gi;
        let m;
        while ((m = re.exec(String(text || '')))) out.push(m[1]);
        return out;
    }

    /** 字符串指纹。用来判断这段弹幕是不是已经结算过。 */
    function textFingerprint(text) {
        const s = String(text || '');
        let h = 5381;
        for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return (h >>> 0).toString(36) + '-' + s.length;
    }

    /**
     * 一段弹幕值多少热度。
     * 发言按底盘比例，礼物按表里的点数（打 NPC_GIFT_WEIGHT 折、数量走递减），
     * 醒目留言按 金额 × 4，跟玩家那条路一致。
     * 只算不写，方便干跑测试。
     */
    function danmuHeat(lines, baseHeat) {
        let chat = 0;
        let giftLines = 0;
        let pop = 0;
        (lines || []).forEach((f) => {
            const kind = String(f.类型 || '').trim();
            if (kind === '普通' || kind === '舰长' || kind === '提督' || kind === '总督') {
                chat += 1;
                pop += baseHeat * CHAT_HEAT_RATE;
                return;
            }
            if (kind === '礼物') {
                if (giftLines >= NPC_GIFT_LINES_MAX) return;   // 超出的整条忽略
                const gift = giftOf(f.礼物);
                if (!gift) return;                              // 白名单外的礼物不算
                const qty = Math.max(1, Math.min(999, parseInt(f.数量, 10) || 1));
                giftLines += 1;
                pop += decayedPop(gift.pop, qty, 0).total * NPC_GIFT_WEIGHT;
                return;
            }
            if (kind === '醒目留言') {
                const amount = Math.max(0, parseInt(f.金额, 10) || 0);
                pop += amount * 4 * NPC_GIFT_WEIGHT;
            }
            // 进入 / 系统 不计：那是平台提示，不是人气
        });
        const cap = Math.round(baseHeat * ROUND_GAIN_CAP_RATE);
        return {
            人气: Math.min(Math.round(pop), cap),
            发言条数: chat,
            礼物条数: giftLines,
            触顶: Math.round(pop) > cap
        };
    }

    /** 最新一条 AI 楼层。取不到聊天上下文就返回 null（比如干跑测试）。 */
    function latestMessage() {
        try {
            const win = (typeof window !== 'undefined' && (window.parent || window)) || null;
            const st = win && win.SillyTavern;
            const ctx = st && typeof st.getContext === 'function' ? st.getContext() : null;
            const chat = ctx && Array.isArray(ctx.chat) ? ctx.chat : null;
            if (!chat || !chat.length) return null;
            for (let i = chat.length - 1; i >= 0; i -= 1) {
                const msg = chat[i];
                if (!msg || msg.is_user || msg.is_system) continue;
                return { 楼层: i, 文本: String(msg.mes || '') };
            }
        } catch (_) { /* 读不到就当没有 */ }
        return null;
    }

    /**
     * 按正文里的弹幕给房间加热度。
     *
     * 幂等靠标记，不能只靠 isProcessing —— 那个防的是脚本自己改完变量又被 schema
     * reconciliation 二次唤起的递归，同一条消息在别的场合还是会再过一遍：
     * swipe、重 roll、手动编辑楼层、切聊天重进都会让 VARIABLE_UPDATE_ENDED 再来一次。
     * 本文件其余的写入都是"按状态重算"（热度 = 底盘+本场、牌子等级 = f(累计打赏)），
     * 重算多少次结果都一样；而"数弹幕再累加"是纯增量，多跑一次就多加一次。
     * 所以在房间上记 楼层:指纹，两者都对得上就跳过。swipe 换了内容指纹就变，
     * 会重新结算一次 —— 那是另一个分支的剧情，应该重算。
     */
    function settleRoomsFromText(statData, text, floor) {
        const blocks = extractRoomBlocks(text);
        if (!blocks.length) return [];
        const done = [];
        blocks.forEach((block) => {
            const parsed = parseRoomText(block);
            const host = canonGirlName(parsed.主播);
            const girl = girlOf(statData, host);
            if (!girl || !girl.直播) return;
            if (girl.直播.开播 !== true) return;          // 没开播的房间不结算
            if (!parsed.弹幕.length) return;

            const room = roomOf(statData, host);
            const mark = `${floor == null ? '-' : floor}:${textFingerprint(block)}`;
            if (room.本场结算 === mark) return;            // 这段已经算过

            const base = Number(room.底盘热度) || 0;
            const gain = danmuHeat(parsed.弹幕, base);
            room.本场结算 = mark;
            if (gain.人气 <= 0) return;
            room.本场热度 = (Number(room.本场热度) || 0) + gain.人气;
            repaintHeat(statData, host);
            done.push({ 主播: host, ...gain });
            console.log(TAG, `弹幕结算: ${host} +${gain.人气}（发言 ${gain.发言条数} / 礼物 ${gain.礼物条数}${gain.触顶 ? ' / 触顶' : ''}）`);
        });
        return done;
    }

    /**
     * 环境流量：所有在播的房间每拍加一点，跟玩家在不在看无关。
     * 抖动用 (种子|时钟) 做哈希，同一拍算出来是同一个值。
     * 只在时钟真往前走了那一拍调用，和 decaySessionHeat 共用那道门。
     * 每拍 +底盘×(0~6%)、每拍 ×0.9 衰减，本场热度收敛在底盘的三成左右，
     * 也就是总热度在底盘的 1.3 倍附近浮动。
     */
    function ambientHeat(statData) {
        const rooms = statData?.系统配置?.直播间;
        if (!rooms || typeof rooms !== 'object') return;
        const clock = String(statData?.世界信息?.时间?.时钟 || '');
        Object.keys(rooms).forEach((name) => {
            const room = rooms[name];
            if (!room || typeof room !== 'object') return;
            const girl = girlOf(statData, name);
            if (girl?.直播?.开播 !== true) return;
            const base = Number(room.底盘热度) || 0;
            if (base <= 0) return;
            const r = streamHashUnit(`${room.种子 || name}|ambient|${clock}`) * AMBIENT_MAX_RATE;
            const add = Math.round(base * r);
            if (add <= 0) return;
            room.本场热度 = (Number(room.本场热度) || 0) + add;
            repaintHeat(statData, name);
        });
    }

    /** 没有新礼物的那一拍：本场热度衰减一成，掉到底盘的 1% 以下就归零。 */
    function decaySessionHeat(statData) {
        const rooms = statData?.系统配置?.直播间;
        if (!rooms || typeof rooms !== 'object') return;
        Object.entries(rooms).forEach(([name, room]) => {
            if (!room || typeof room !== 'object') return;
            const girl = girlOf(statData, name);
            if (girl?.直播?.开播 !== true) return;
            const session = Number(room.本场热度) || 0;
            if (session <= 0) return;
            const next = Math.floor(session * SESSION_DECAY);
            room.本场热度 = next <= (Number(room.底盘热度) || 0) * 0.01 ? 0 : next;
            repaintHeat(statData, name);
        });
    }

    /**
     * 榜一 NPC 还手。玩家用单笔 ≥100 抢走榜一之后，有约三成机会在下一拍回一笔，
     * 量级在干杯~情书之间，且吃本场预算。总督级还手禁止。
     */
    function rivalStrikeBack(statData, name) {
        const room = roomOf(statData, name);
        const board = Array.isArray(room.高能榜) ? room.高能榜 : [];
        if (!board.length) return null;
        const budget = Number(room.还手预算) || 0;
        if (budget <= 0) return null;
        const sorted = board.slice().sort((a, b) => Number(b.本场消费) - Number(a.本场消费));
        if (sorted[0]?.名字 !== '你') return null;
        const rival = sorted.find(r => r.名字 !== '你');
        if (!rival) return null;

        /* 掷骰的种子要带上「这是第几次还手」。只用时钟不行：世界时钟只有 AI 推进时才动，
           玩家在同一分钟里连抢几次榜一，同一个种子会算出同一个结果——要么每次都还手，
           要么一次都不还。带上次数之后每次是独立的一掷。 */
        const times = Number(room.还手次数) || 0;
        const seed = `${room.种子}|strike|${statData.世界信息?.时间?.时钟 || ''}|${times}`;
        room.还手次数 = times + 1;
        if (streamHashUnit(seed) > 0.3) return null;

        const need = Number(sorted[0].本场消费) - Number(rival.本场消费) + 1;
        const spend = Math.min(budget, Math.max(20, Math.min(need, 100 + Math.floor(streamHashUnit(seed + '|amt') * 200))));
        rival.本场消费 = Number(rival.本场消费) + spend;
        room.还手预算 = budget - spend;
        room.本场热度 = (Number(room.本场热度) || 0) + Math.round(spend * 3.5);
        repaintHeat(statData, name);
        console.log(TAG, `榜一还手: ${name} / ${rival.名字} +${spend}`);
        return { 名字: rival.名字, 金额: spend };
    }

    function normalizeArea(area) {
        return String(area || '').replace(/\s*·\s*/g, ' · ').trim();
    }

    function nodePrivacyOf(area) {
        const raw = String(area || '').trim();
        if (!raw) return null;
        const norm = normalizeArea(raw);
        if (Object.prototype.hasOwnProperty.call(NODE_PRIVACY, norm)) return NODE_PRIVACY[norm];
        if (Object.prototype.hasOwnProperty.call(NODE_PRIVACY, raw)) return NODE_PRIVACY[raw];
        const sub = norm.includes('·') ? norm.split('·').pop().trim() : norm;
        if (sub && Object.prototype.hasOwnProperty.call(NODE_PRIVACY, sub)) return NODE_PRIVACY[sub];
        return null;
    }

    /**
     * 场所覆盖节点。AI 会发明小地点名，所以除了精确表还有关键词。
     * 越密的规则越先命中。
     */
    function placePrivacyOf(place) {
        const s = String(place || '').trim();
        if (!s) return null;
        if (/卧室|客房|套房|浴室|反锁|自宅|情侣酒店|客厅/.test(s)) return 5;
        if (/天台|崖边|密林|野外|芦荡|灌木|江滩|集装箱|暗房|穹顶|观鸟棚|画室/.test(s)) return 4;
        if (/试衣|隔间|帘后|储藏|更衣室|卫生|后排|夹缝|避难|厕所/.test(s)) return 3;
        if (/包厢|包舱|包间|卡座|单间|侧厢|控制台/.test(s)) return 2;
        if (/车厢|安检|候车|广场|摊位|桥面|大厅/.test(s)) return 0;
        if (/走廊|前台|外摆/.test(s)) return 4;
        return null;
    }

    function privacyOf(area, place) {
        const fromPlace = placePrivacyOf(place);
        if (fromPlace != null) return fromPlace;
        const fromNode = nodePrivacyOf(area);
        if (fromNode != null) return fromNode;
        return null;
    }

    function writeIfChanged(obj, key, next) {
        if (!obj || next == null) return false;
        if (obj[key] === next) return false;
        obj[key] = next;
        return true;
    }

    function ensureObj(parent, key) {
        if (!parent[key] || typeof parent[key] !== 'object' || Array.isArray(parent[key])) {
            parent[key] = {};
        }
        return parent[key];
    }

    // ==========================================
    // 各块同步
    // ==========================================

    function syncDateAndPeriod(world) {
        if (!world || typeof world !== 'object') return;
        const side = dateDisplayOf(world.年历);
        if (side) {
            const display = ensureObj(world, '日期显示');
            writeIfChanged(display, '星期', side.星期);
            writeIfChanged(display, '季节', side.季节);
            writeIfChanged(display, '年内周次', side.年内周次);
        }

        const time = world.时间;
        if (time && typeof time === 'object') {
            const period = periodFromClock(time.时钟);
            if (period) writeIfChanged(time, '时段', period);
        }
    }

    function syncOneLocation(loc) {
        if (!loc || typeof loc !== 'object') return;
        const privacy = privacyOf(loc.区域, loc.场所);
        if (privacy != null) writeIfChanged(loc, '私密度', privacy);
    }

    function syncLocations(statData) {
        const world = statData.世界信息;
        if (world?.位置) syncOneLocation(world.位置);

        const companion = statData.玩家信息?.同行 || null;
        const playerLoc = world?.位置;
        const girls = statData.对象信息;
        if (!girls || typeof girls !== 'object') return;

        Object.entries(girls).forEach(([name, girl]) => {
            if (!girl || typeof girl !== 'object') return;
            const loc = girl.位置;
            if (!loc || typeof loc !== 'object') return;
            if (companion && name === companion && playerLoc) {
                if (playerLoc.区域) writeIfChanged(loc, '区域', playerLoc.区域);
                if (playerLoc.场所 != null) writeIfChanged(loc, '场所', playerLoc.场所);
            }
            syncOneLocation(loc);
        });
    }

    function syncFanAccounts(statData) {
        const fans = statData.玩家信息?.粉丝身份;
        if (!fans || typeof fans !== 'object') return;

        Object.entries(fans).forEach(([name, fan]) => {
            if (!fan || typeof fan !== 'object') return;
            const tipped = Math.max(0, Number(fan.累计打赏) || 0);
            if (fan.累计打赏 !== tipped) fan.累计打赏 = tipped;
            writeIfChanged(fan, '牌子等级', badgeLevel(tipped));

            const tier = Object.prototype.hasOwnProperty.call(TIER_RANK, fan.牌子档位) ? fan.牌子档位 : '无';
            if (fan.牌子档位 !== tier) fan.牌子档位 = tier;
            if (tier === '无') {
                writeIfChanged(fan, '牌子剩余天数', 0);
            } else {
                fan.牌子剩余天数 = clampInt(fan.牌子剩余天数, 0, 30, 0);
            }

            fan.禁言剩余天数 = clampInt(fan.禁言剩余天数, 0, 9999, 0);
            if (fan.禁言剩余天数 > 0) fan.禁言中 = true;
        });
    }

    function streamHashUnit(text) {
        let hash = 2166136261;
        const source = String(text || '');
        for (let i = 0; i < source.length; i += 1) {
            hash ^= source.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0) / 4294967296;
    }

    function streamMinutes(clock) {
        const [hour, minute] = String(clock || '00:00').split(':').map(Number);
        return ((hour || 0) * 60 + (minute || 0) + 1440) % 1440;
    }

    function streamClock(minutes) {
        const value = (minutes + 1440) % 1440;
        const hour = Math.floor(value / 60);
        const minute = value % 60;
        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }

    function streamInWindow(now, start, end) {
        return end <= start ? now >= start || now <= end : now >= start && now <= end;
    }

    function streamMoment(statData) {
        const world = statData?.世界信息 || {};
        return {
            date: String(world.年历 || ''),
            weekday: String(world.日期显示?.星期 || ''),
            clock: String(world.时间?.时钟 || '00:00'),
        };
    }

    function streamDecision(name, habit, moment) {
        const seed = `${moment.date}|${name}`;
        const planned = habit.days.includes(moment.weekday);
        const jitterSteps = [-30, 0, 0, 0, 30, 60];
        const jitter = jitterSteps[Math.floor(streamHashUnit(`${seed}|jitter`) * jitterSteps.length)];
        let start = streamMinutes(habit.start) + jitter;
        let end = streamMinutes(habit.end) + jitter;
        let happens = planned && streamHashUnit(`${seed}|show`) < habit.reliability;
        let spontaneous = false;

        if (!planned && streamHashUnit(`${seed}|surprise`) < habit.surprise) {
            spontaneous = true;
            happens = true;
            const offset = [-90, -30, 30, 90][Math.floor(streamHashUnit(`${seed}|surprise-at`) * 4)];
            start = streamMinutes(habit.start) + offset;
            end = start + 90 + Math.floor(streamHashUnit(`${seed}|surprise-len`) * 4) * 30;
        }

        const now = streamMinutes(moment.clock);
        const live = happens && streamInWindow(now, (start + 1440) % 1440, (end + 1440) % 1440);
        const titles = habit.titles || ['临时杂谈'];
        const title = titles[Math.floor(streamHashUnit(`${seed}|title`) * titles.length)];
        /* 规模不在这里定。pulse 只是当刻的抖动系数（0.86~1.14），乘在由 粉丝数 反解出的
           底盘热度上。原来这里有一张 habit.viewers 规模表，跟粉丝数推出来的量级对不上
           （时雨羽衣被写成比塔菲还热），已经删掉。 */
        const pulse = 0.86 + streamHashUnit(`${seed}|pulse|${Math.floor(now / 30)}`) * 0.28;

        return {
            live,
            planned,
            spontaneous,
            cancelled: planned && !happens,
            start: streamClock(start),
            end: streamClock(end),
            title,
            /* pulse 是当日/当刻的抖动系数（0.86~1.14），乘在底盘热度上。
               规模本身由 粉丝数 → 底盘热度 决定，不在这里另存一份。 */
            pulse,
        };
    }

    function streamFieldsChanged(stream, previous) {
        if (!stream || !previous) return false;
        return stream.开播 !== previous.开播
            || stream.标题 !== previous.标题
            || stream.热度 !== previous.热度;
    }

    /**
     * 这间房的底盘热度。优先读 系统配置.直播间.<名>.底盘热度（变量初始化写的），
     * 读不到就从 直播.粉丝数 现场反解——两条路走的是同一条曲线，不会有第二套数。
     */
    function roomBaseHeat(statData, name, stream) {
        const room = statData?.系统配置?.直播间?.[name];
        const stored = Number(room?.底盘热度);
        if (Number.isFinite(stored) && stored > 0) return stored;
        const followers = Number(stream?.粉丝数) || 0;
        return followers > 0 ? scaleOfFollowers(followers).底盘热度 : 0;
    }

    function observeManualStreamWrites(statData, before) {
        if (!before) return;
        const date = streamMoment(statData).date;
        const girls = statData.对象信息 || {};
        Object.entries(girls).forEach(([name, girl]) => {
            const stream = girl?.直播;
            const previous = before.对象信息?.[name]?.直播;
            if (!streamFieldsChanged(stream, previous)) return;
            const expected = streamAutoWrites.get(name);
            if (expected && expected.date === date && expected.live === (stream.开播 === true)) {
                streamAutoWrites.delete(name);
                return;
            }
            streamManualLocks.set(name, date);
            streamAutoWrites.delete(name);
            console.log(TAG, `直播人工接管: ${name}`);
        });
    }

    function driveStreams(statData, before) {
        observeManualStreamWrites(statData, before);
        const moment = streamMoment(statData);
        const previousMoment = before ? streamMoment(before) : null;
        const momentChanged = !previousMoment
            || moment.date !== previousMoment.date
            || moment.weekday !== previousMoment.weekday
            || moment.clock !== previousMoment.clock;
        if (!momentChanged) return;

        for (const [name, lockDate] of streamManualLocks) {
            if (lockDate !== moment.date) streamManualLocks.delete(name);
        }

        const girls = statData.对象信息 || {};
        Object.entries(STREAM_HABITS).forEach(([name, habit]) => {
            const stream = girls[name]?.直播;
            if (!stream || streamManualLocks.get(name) === moment.date) return;
            const decision = streamDecision(name, habit, moment);
            const oldLive = stream.开播 === true;
            const oldTitle = stream.标题;
            const oldHeat = Number(stream.热度) || 0;

            writeIfChanged(stream, '开播', decision.live);
            if (decision.live) {
                if (!stream.标题) writeIfChanged(stream, '标题', decision.title);
                /* 开播热度取底盘（由粉丝数反解），再乘一点当日抖动。
                   以前这里用的是 STREAM_HABITS.viewers，那是第二张手写的规模表，
                   跟粉丝数推出来的量级对不上——时雨羽衣被写成比塔菲还热。删了。 */
                if (!(Number(stream.热度) > 0)) {
                    writeIfChanged(stream, '热度', roomBaseHeat(statData, name, stream) * decision.pulse);
                }
            }

            const changed = oldLive !== (stream.开播 === true)
                || oldTitle !== stream.标题
                || oldHeat !== (Number(stream.热度) || 0);
            if (changed) streamAutoWrites.set(name, { date: moment.date, live: stream.开播 === true });
        });
    }

    function syncStreams(statData, before) {
        driveStreams(statData, before);
        /* 时钟往前走了一拍：先衰减，再补环境流量。放在 driveStreams 之后，
           那边刚决定了谁在播，这两步只处理已经在播的房间。
           顺序是「先衰减后加」——反过来的话新加的那一份当拍就被削掉一成。
           这道门本身也是幂等的：同一轮里 before 和 after 的时钟一样就整段跳过。 */
        const nowClock = String(statData?.世界信息?.时间?.时钟 || '');
        const wasClock = String(before?.世界信息?.时间?.时钟 || '');
        if (before && nowClock && nowClock !== wasClock) {
            decaySessionHeat(statData);
            ambientHeat(statData);
        }

        /* 正文里的 <LiveRoom> 弹幕结算。放在衰减之后，这一轮加的不当拍被削。 */
        const msg = latestMessage();
        if (msg) settleRoomsFromText(statData, msg.文本, msg.楼层);
        const girls = statData.对象信息;
        if (!girls || typeof girls !== 'object') return;

        const watching = statData.玩家信息?.所在直播间 ?? null;
        let stillWatching = watching;

        Object.entries(girls).forEach(([name, girl]) => {
            if (!girl || typeof girl !== 'object') return;
            const stream = girl.直播;
            if (!stream || typeof stream !== 'object') return;

            const live = stream.开播 === true;
            if (!live) {
                /* 下播清标题和热度，粉丝数是常驻的、不清 */
                writeIfChanged(stream, '标题', '');
                writeIfChanged(stream, '热度', 0);
                const room = statData.系统配置?.直播间?.[name];
                if (room) {
                    writeIfChanged(room, '本场热度', 0);
                    // 结算标记跟着本场一起清：下一场重新开始，不会因为标记还在而漏算
                    if (room.本场结算) writeIfChanged(room, '本场结算', '');
                }
                if (watching === name) stillWatching = null;
            } else {
                /* 给 AI 看的热度收成约数：底账留在 系统配置，模型看到的是"大概一万八" */
                const heat = roundNice(Number(stream.热度) || 0);
                if (stream.热度 !== heat) stream.热度 = heat;
            }
            const fans = Math.max(0, Math.floor(Number(stream.粉丝数) || 0));
            if (stream.粉丝数 !== fans) stream.粉丝数 = fans;

            const fan = statData.玩家信息?.粉丝身份?.[name];
            const wasLive = before?.对象信息?.[name]?.直播?.开播 === true;
            if (live && !wasLive && fan?.关注 && before) {
                try {
                    if (typeof toastr !== 'undefined') toastr.info(`${name} 开播了`);
                } catch (_) { /* ignore */ }
                console.log(TAG, `开播提醒: ${name}`);
            }
        });

        if (statData.玩家信息 && stillWatching !== watching) {
            statData.玩家信息.所在直播间 = stillWatching;
        }
    }

    function onCalendarRollover(statData, before) {
        const now = statData.世界信息?.年历;
        const prev = before?.世界信息?.年历;
        if (!now || !prev || now === prev) return;
        if (!parseMvuDate(now) || !parseMvuDate(prev)) return;

        console.log(TAG, `换日 ${prev} → ${now}`);

        const work = statData.玩家信息?.工作;
        if (work && typeof work === 'object') writeIfChanged(work, '今日已上班', false);

        const fans = statData.玩家信息?.粉丝身份;
        if (fans && typeof fans === 'object') {
            Object.values(fans).forEach((fan) => {
                if (!fan || typeof fan !== 'object') return;
                if (fan.牌子档位 && fan.牌子档位 !== '无') {
                    const days = Math.max(0, (Number(fan.牌子剩余天数) || 0) - 1);
                    fan.牌子剩余天数 = days;
                    if (days <= 0) fan.牌子档位 = '无';
                } else {
                    fan.牌子剩余天数 = 0;
                }

                const muteDays = Number(fan.禁言剩余天数) || 0;
                if (muteDays > 0) {
                    const next = muteDays - 1;
                    fan.禁言剩余天数 = next;
                    if (next <= 0) fan.禁言中 = false;
                }
            });
        }

        const girls = statData.对象信息;
        if (!girls || typeof girls !== 'object') return;
        Object.entries(girls).forEach(([name, girl]) => {
            const exp = girl?.性经历;
            if (!exp || typeof exp !== 'object') return;
            const nowCount = Number(exp.近期性经验次数) || 0;
            const prevCount = Number(before?.对象信息?.[name]?.性经历?.近期性经验次数);
            const roseThisUpdate = Number.isFinite(prevCount) && nowCount > prevCount;
            if (!roseThisUpdate) {
                exp.近期性经验次数 = Math.max(0, nowCount - 1);
            }
        });
    }

    // ==========================================
    // 主逻辑
    // ==========================================

    let isProcessing = false;
    let loggedReady = false;

    function handleVariableUpdate(rawVariables, rawVariablesBefore) {
        if (isProcessing) {
            console.log(TAG, '防重入，跳过');
            return;
        }
        isProcessing = true;
        try {
            const statData = rawVariables?.stat_data;
            if (!statData) return;
            const before = rawVariablesBefore?.stat_data || null;

            if (!loggedReady) {
                console.log(TAG, 'MVU 变量连接成功');
                loggedReady = true;
            }

            onCalendarRollover(statData, before);
            syncDateAndPeriod(statData.世界信息);
            syncLocations(statData);
            syncFanAccounts(statData);
            syncStreams(statData, before);
        } catch (err) {
            console.error(TAG, err);
        } finally {
            isProcessing = false;
        }
    }

    async function waitMvu() {
        if (typeof waitGlobalInitialized === 'function') {
            await waitGlobalInitialized('Mvu');
            return;
        }
        await new Promise((resolve) => {
            const tick = () => {
                if (typeof Mvu !== 'undefined') resolve();
                else setTimeout(tick, 200);
            };
            tick();
        });
    }

    const api = {
        parseMvuDate,
        dateDisplayOf,
        periodFromClock,
        badgeLevel,
        streamScale,
        tierOfFollowers,
        scaleOfFollowers,
        // 直播间：卡片只用这几个，不要自己读写 MVU、也不要自己存表
        canonName: canonGirlName,
        roomMenu,
        roomView,
        roomAction,
        // 弹幕语法层：卡片的 lrSplitLineFields 走这里，语法只留一份
        parseRoomLine,
        parseRoomText,
        // 热度结算，导出主要是给 scripts/check-live-room.cjs 干跑
        danmuHeat,
        settleRoomsFromText,
        ambientHeat,
        privacyOf,
        streamDecision,
        handleVariableUpdate,
    };

    const root = typeof globalThis !== 'undefined' ? globalThis : {};
    try {
        root.__管人痴辅助计算_loaded__ = true;
        root.LinjiangAux = api;
        if (root.parent && root.parent !== root) {
            root.parent.__管人痴辅助计算_loaded__ = true;
            root.parent.LinjiangAux = api;
        }
    } catch (_) { /* iframe 跨域时只写自己 */ }

    const init = async () => {
        await waitMvu();
        if (typeof eventOn === 'function' && typeof Mvu !== 'undefined') {
            eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, handleVariableUpdate);
        } else {
            console.warn(TAG, '未找到 Mvu / eventOn，脚本已加载但不会写回变量');
        }
        console.log(TAG, '脚本已加载');
        try {
            if (typeof toastr !== 'undefined') toastr.success('[辅助计算脚本] 脚本已加载');
        } catch (_) { /* ignore */ }
    };

    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    if (isBrowser) {
        if (typeof $ === 'function') $(init);
        else init();
    }
})();
