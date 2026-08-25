/* 酒馆环境替身：让 小手机脚本.js 能在浏览器里裸跑，方便看样式。
   只实现脚本真正用到的那几个全局：
     SillyTavern.chat / getContext()、Mvu.getMvuData、TavernHelper.*、
     toastr.*、waitGlobalInitialized、eventOn / tavern_events、getVariables
   数据是假的，改这里就能换预览内容。 */

const NOW = Date.now();

/* 世界栏暂时沿用旧预览字段；羁绊页使用当前项目的 对象信息 结构。 */
const STAT_DATA = {
    world_info: {
        time: { current_time: '2026年8月21日 星期五 21:07' },
        environment: { weather: '晴 26°' },
        location: { current: '临江市 · 西洲区' },
    },
    世界信息: {
        年历: '2026年8月21日',
        时间: { 时钟: '21:07', 时段: '夜晚' },
        位置: { 区域: '西洲区', 场所: '江湾公寓', 私密度: 3 },
    },
    玩家信息: { 体力: 88, 金钱: 512300, 同行: null, 所在直播间: '东雪莲' },
    系统配置: {},
    对象信息: {
        东雪莲: {
            羁绊: { 好感度: 80, 顺从度: 12, 心情: '开朗' },
            位置: { 区域: '西洲区 · 西洲江湾公寓', 场所: '直播间', 私密度: 2 },
            直播: { 开播: true, 标题: '新歌试听和深夜杂谈', 热度: 186420, 粉丝数: 328000 },
        },
        塔菲: {
            羁绊: { 好感度: 135, 顺从度: 28, 心情: '悠闲' },
            位置: { 区域: '临江区', 场所: '录音棚', 私密度: 3 },
            直播: { 开播: false, 标题: '', 热度: 0, 粉丝数: 241000 },
        },
        斯黛拉: {
            羁绊: { 好感度: 56, 顺从度: 5, 心情: '专注' },
            位置: { 区域: '东城区', 场所: '商业街', 私密度: 1 },
            直播: { 开播: false, 标题: '', 热度: 0, 粉丝数: 97000 },
        },
    },
};

/* 聊天记录：好友、群聊和消息仍由方括号标记解析。 */
const CHAT = [
    {
        mes: '街角的灯亮起来了。[好友id|东雪莲|10086] [好友id|塔菲|10087] [好友id|斯黛拉|10090]',
        send_date: NOW - 1000 * 60 * 90,
        variables: { 0: { stat_data: STAT_DATA } },
        swipe_id: 0,
    },
    {
        mes: '[群聊|直播企划组|20001|东雪莲、塔菲、斯黛拉、我]\n[群聊消息|20001|东雪莲|文本|明天七点，老地方集合。]\n[群聊消息|20001|斯黛拉|文本|我把流程发群里了。]',
        send_date: NOW - 1000 * 60 * 40,
    },
    {
        mes: '[对方消息|东雪莲|10086|文本|你还没睡？]\n[我方消息|我|10086|文本|在看你的直播。]\n[对方消息|东雪莲|10086|文本|那不许中途跑。]',
        send_date: NOW - 1000 * 60 * 12,
        variables: { 0: { stat_data: STAT_DATA } },
        swipe_id: 0,
    },
];

const noop = () => {};
const context = {
    chat: CHAT,
    eventSource: { on: noop, off: noop },
    event_types: { MESSAGE_RECEIVED: 'message_received', CHAT_CHANGED: 'chat_changed' },
};

window.SillyTavern = { chat: CHAT, getContext: () => context };
window.Mvu = {
    getMvuData: () => ({ stat_data: STAT_DATA }),
    replaceMvuData: async () => true,
};
window.TavernHelper = {
    generate: async () => '（预览环境不产出内容）',
    generateRaw: async () => '（预览环境不产出内容）',
    getPreset: () => null,
    getCharWorldbookNames: () => ({ primary: null, additional: [] }),
    getWorldbook: async () => [],
};
window.getVariables = () => ({ stat_data: STAT_DATA });
window.waitGlobalInitialized = async () => true;
window.eventOn = noop;
window.tavern_events = context.event_types;

const log = (level) => (msg) => console.log(`[toastr:${level}]`, msg);
window.toastr = { info: log('info'), success: log('success'), warning: log('warn'), error: log('error') };

/* 预览页自己用：等手机初始化完。 */
window.__phoneReady = new Promise((resolve) => {
    const tick = setInterval(() => {
        if (document.getElementById('mobile-phone-overlay')) {
            clearInterval(tick);
            resolve();
        }
    }, 50);
});