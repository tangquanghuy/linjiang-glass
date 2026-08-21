// 手机界面拖动变量
let isPhoneDragging = false;
let phoneDragStartX = 0;
let phoneDragStartY = 0;
let phoneStartX = 0;
let phoneStartY = 0;

// 置顶状态
let isPinned = false;

// 壁纸数据
const phoneWpBaseUrl = 'https://rpg.bolt.qzz.io/%E5%B0%81%E9%9D%A2/';
const phoneWpData = {
    '卡提希娅': ['卡提希娅'],
    '奈雅丽': ['奈雅丽'],
    '星极': ['星极'],
    '法露特': ['法露特'],
    '红莲': ['红莲'],
    '艾克莉西娅': ['艾克莉西娅'],
    '凯尔贝洛斯': ['凯尔贝洛斯'],
    '夜斗': ['夜斗'],
    '奥契丝': ['奥契丝'],
    '癌骑士': ['癌骑士'],
    '皇冠': ['皇冠'],
    '绯': ['绯'],
    '白': ['白'],
    '吉普莉尔': ['吉普莉尔'],
    '史蒂芬妮': ['史蒂芬妮'],
    '菲尔': ['菲尔'],
    '克拉米': ['克拉米'],
    '初濑伊纲': ['初濑伊纲'],
    '达妮娅': ['达妮娅']
};
// 生成完整URL的壁纸分类
const phoneWpCategories = Object.fromEntries(
    Object.entries(phoneWpData).map(([name, files]) => [
        name,
        files.map(file => `${phoneWpBaseUrl}${encodeURIComponent(file)}.webp`)
    ])
);



// 已加载的分类
const phoneWpLoaded = new Set();

// 当前壁纸
let phoneWpCurrent = localStorage.getItem('dnf-phone-wallpaper') || '';

// 当前聊天对象
let currentChatFriend = null;

// 论坛生成状态标记
let isForumGenerating = false;

//  论坛相关函数将在文件末尾"全局函数暴露"区域统一定义

