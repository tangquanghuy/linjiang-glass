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


    /* 直播习惯是稳定底盘，当天是否准时、休播或临时开播由日期种子决定。
       同一游戏日反复刷新得到同一结果，换日才会重新投骰；这比 Math.random()
       每次变量更新都翻转状态稳定。AI 明确改写直播字段时，当天自动结果让位。 */
    const STREAM_HABITS = {
        '塔菲': {
            days: ['周一', '周二', '周四', '周五', '周六', '周日'], start: '20:00', end: '23:30',
            reliability: 0.88, surprise: 0.06, viewers: [9000, 24000],
            titles: ['晚间杂谈与SC回', '联机游戏回', '新衣装与观众问答'],
        },
        '东雪莲': {
            days: ['周一', '周二', '周三', '周四', '周五', '周六'], start: '21:30', end: '00:30',
            reliability: 0.82, surprise: 0.10, viewers: [1200, 6200],
            titles: ['深夜杂谈', '游戏联机回', '观众点歌与聊天'],
        },
        '时雨羽衣': {
            days: ['周三', '周日'], start: '22:00', end: '00:30',
            reliability: 0.76, surprise: 0.04, viewers: [18000, 68000],
            titles: ['绘画杂谈', '游戏实况', '近况报告与告知'],
        },
        '沙花叉': {
            days: ['周一', '周二', '周四', '周五', '周日'], start: '21:00', end: '00:30',
            reliability: 0.80, surprise: 0.08, viewers: [12000, 48000],
            titles: ['晚间杂谈', '歌回', '挑战类游戏回'],
        },
        '红蔷薇': {
            days: ['周一', '周二', '周四', '周五', '周日'], start: '19:00', end: '22:00',
            reliability: 0.84, surprise: 0.07, viewers: [1800, 9000],
            titles: ['黄昏音乐电台', '情感来信杂谈', '夜景歌回'],
        },
        '斯黛拉': {
            days: ['周二', '周三', '周四', '周五', '周六', '周日'], start: '18:30', end: '21:30',
            reliability: 0.86, surprise: 0.05, viewers: [2200, 11000],
            titles: ['傍晚电台', '声音练习与点歌', '工作室杂谈'],
        },
        '璃亚梦': {
            days: ['周一', '周三', '周四', '周五', '周六', '周日'], start: '23:00', end: '02:00',
            reliability: 0.78, surprise: 0.16, viewers: [2600, 12000],
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
        const [viewerMin, viewerMax] = habit.viewers || [500, 3000];
        const base = viewerMin + streamHashUnit(`${seed}|viewers`) * Math.max(0, viewerMax - viewerMin);
        const pulse = 0.86 + streamHashUnit(`${seed}|pulse|${Math.floor(now / 30)}`) * 0.28;

        return {
            live,
            planned,
            spontaneous,
            cancelled: planned && !happens,
            start: streamClock(start),
            end: streamClock(end),
            title,
            viewers: Math.max(0, Math.round(base * pulse)),
        };
    }

    function streamFieldsChanged(stream, previous) {
        if (!stream || !previous) return false;
        return stream.开播 !== previous.开播
            || stream.标题 !== previous.标题
            || stream.人数 !== previous.人数;
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
            const oldViewers = Number(stream.人数) || 0;

            writeIfChanged(stream, '开播', decision.live);
            if (decision.live) {
                if (!stream.标题) writeIfChanged(stream, '标题', decision.title);
                if (!(Number(stream.人数) > 0)) writeIfChanged(stream, '人数', decision.viewers);
            }

            const changed = oldLive !== (stream.开播 === true)
                || oldTitle !== stream.标题
                || oldViewers !== (Number(stream.人数) || 0);
            if (changed) streamAutoWrites.set(name, { date: moment.date, live: stream.开播 === true });
        });
    }

    function syncStreams(statData, before) {
        driveStreams(statData, before);
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
                writeIfChanged(stream, '标题', '');
                writeIfChanged(stream, '人数', 0);
                if (watching === name) stillWatching = null;
            } else {
                const viewers = Math.max(0, Math.floor(Number(stream.人数) || 0));
                if (stream.人数 !== viewers) stream.人数 = viewers;
            }

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
