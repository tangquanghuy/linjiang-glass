// 手机界面拖动变量
let isPhoneDragging = false;
let phoneDragStartX = 0;
let phoneDragStartY = 0;
let phoneStartX = 0;
let phoneStartY = 0;

// 置顶状态
let isPinned = false;

// 壁纸数据
const phoneWpBaseUrl = 'https://anchor.bolt.qzz.io/%E5%B0%81%E9%9D%A2/';
const phoneWpData = {
    "东雪莲": [
        "东雪莲"
    ],
    "塔菲": [
        "塔菲"
    ],
    "沙花叉": [
        "沙花叉"
    ],
    "时雨羽衣": [
        "时雨羽衣"
    ],
    "红蔷薇": [
        "红蔷薇"
    ],
    "斯黛拉": [
        "斯黛拉"
    ],
    "璃亚梦": [
        "梦见璃亚梦"
    ]
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

