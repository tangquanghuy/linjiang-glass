/* 酒馆环境替身：让 小手机脚本.js 能在浏览器里裸跑，方便看样式。
   只实现脚本真正用到的那几个全局：
     SillyTavern.chat / getContext()、Mvu.getMvuData、TavernHelper.*、
     toastr.*、waitGlobalInitialized、eventOn / tavern_events、getVariables
   数据是假的，改这里就能换预览内容。 */

const NOW = Date.now();

/* MVU 变量：world_info 喂状态栏/天气，羁绊列表喂好友与消息列表 */
const STAT_DATA = {
    world_info: {
        time: { current_time: '2026年8月21日 星期五 21:07' },
        environment: { weather: '晴 26°' },
        location: { current: '临江市 · 老城区' },
    },
    系统配置: {},
    羁绊列表: {
        卡提希娅: { 好感度: 86, 附近: true, 同行誓约: true, 性别: '女', 种族: '魔族', 等级: 47, 当前想法: '今晚的烟火，他会记得吗。' },
        奈雅丽: { 好感度: 63, 附近: true, 性别: '女', 种族: '精灵', 等级: 39, 当前想法: '这条巷子的风有股铁锈味。' },
        星极: { 好感度: 41, 性别: '女', 种族: '人类', 等级: 52, 当前想法: '数据还差一点就能对上了。' },
        法露特: { 好感度: 12, 性别: '女', 种族: '龙族', 等级: 61 },
        红莲: { 好感度: -8, 性别: '女', 种族: '魔族', 等级: 58, 当前想法: '别再靠近了。' },
        夜斗: { 好感度: 27, 性别: '男', 种族: '神族', 等级: 44 },
    },
};

/* 聊天记录：好友/群聊/消息都是从消息文本里的方括号标记解析出来的 */
const CHAT = [
    {
        mes: '街角的灯亮起来了。[好友id|卡提希娅|10086] [好友id|奈雅丽|10087] [好友id|星极|10090]',
        send_date: NOW - 1000 * 60 * 90,
        variables: { 0: { stat_data: STAT_DATA } },
        swipe_id: 0,
    },
    {
        mes: '[群聊|讨伐队|20001|卡提希娅、奈雅丽、星极、我]\n[群聊消息|20001|卡提希娅|文本|明天七点，老地方集合。]\n[群聊消息|20001|星极|文本|我把坐标发群里了。]',
        send_date: NOW - 1000 * 60 * 40,
    },
    {
        mes: '[对方消息|卡提希娅|10086|文本|你还没睡？]\n[我方消息|我|10086|文本|在看烟火。]\n[对方消息|卡提希娅|10086|文本|哪儿？我也想看。]',
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

/* 预览页自己用：等手机初始化完 */
window.__phoneReady = new Promise((resolve) => {
    const tick = setInterval(() => {
        if (document.getElementById('mobile-phone-overlay')) {
            clearInterval(tick);
            resolve();
        }
    }, 50);
});
