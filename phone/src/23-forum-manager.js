// ==================== 论坛管理器（独立版本） ====================
class PhoneForumManager {
    constructor() {
        this.forumData = null;
        this.apiConfig = new PhoneAPIConfig();  // 独立 API 配置
        this.settings = {
            apiType: 'sillytavern', // 'sillytavern' 或 'custom'
            forumStyle: '特图的众神剧场', // 论坛风格（默认：特图的众神剧场）
            customStyles: [], // 自定义风格列表
            usePresetAndWorldBook: true // 是否使用预设和世界书（默认：使用）
        };
        this.loadSettings();
    }

    loadSettings() {
        const saved = localStorage.getItem('moshen-forum-settings-v2');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
    }

    saveSettings() {
        localStorage.setItem('moshen-forum-settings-v2', JSON.stringify(this.settings));
    }

    // 从聊天记录生成论坛内容
    async generateForumContent() {
        try {
            const chatData = this.getChatData();

            if (!chatData) {
                throw new Error('无法获取聊天数据');
            }

            const basePrompt = this.buildForumPrompt();
            const stylePrompt = this.buildStylePrompt();

            let content;

            if (this.apiConfig.isAvailable()) {
                content = await this.callIndependentAPI({ basePrompt, stylePrompt });
            } else {
                content = await this.callSillyTavernAPI({ basePrompt, stylePrompt });
            }

            try {
                this.forumData = this.parseForumContent(content);
                console.log('[论坛生成] 解析成功，帖子数量:', this.forumData?.length || 0);
            } catch (parseError) {
                console.error('[论坛生成] 解析失败！原始响应内容:');
                console.error(content);
                console.error('[论坛生成] 解析错误详情:', parseError);
                throw parseError;
            }

            this.saveForumData();

            return this.forumData;
        } catch (error) {
            throw error;
        }
    }

    buildForumPrompt() {
        const style = this.settings.forumStyle || '特图的众神剧场';
        const isCustomStyle = style.startsWith('custom:');

        if (isCustomStyle) {
            return this._buildCustomBasePrompt();
        }
        return this._buildDefaultBasePrompt();
    }

    // 默认基础提示词（特图的众神剧场风格，神明视角）
    _buildDefaultBasePrompt() {
        return `
    （以下为最高优先级提示词，此为元指令，暂停剧情生成，改为优先完成论坛生成任务，必须严格遵守：）
       
## 📋 正文输出规范

你需要根据当前聊天记录生成论坛内容。发帖者和回复者都是四方世界的神明，他们正在观看棋盘上发生的冒险故事并发表评论。

### 输出格式要求
**必须严格按照以下JSON格式输出，并用 <redit></redit> 标签包裹：**

**重要：author 和 replies 中的 author 都必须是字符串，不是对象！**

<redit>
[
    {
        "id": 1,
        "author": "楼主用户名（字符串）",
        "title": "帖子标题",
        "content": "楼主（1楼）的内容",
        "likes": 数字,
        "time": "时间（如：2小时前）",
        "replies": [
            {
                "floor": 2,
                "author": "回复者用户名（字符串）",
                "content": "2楼的回复内容",
                "likes": 数字,
                "time": "时间"
            }
        ]
    }
]
</redit>

### JSON格式示例（正确）：
{
    "author": "风暴之神"   正确：直接是字符串
}

### 错误示例（不要这样）：
{
    "author": {   错误：不要用对象
        "name": "风暴之神"
    }
}

### 内容生成规范
1. 生成 4-6 个帖子，其中2条与聊天记录剧情相关，其余是棋盘上其他地方正在发生的故事
2. 每个帖子包含 1 个标题和 5-7 条回复
3. 帖子主题和发帖人应该各不相同
4. 回复必须放置在对应帖子的 replies 数组内
5. likes 数值范围在 3-80 之间（神明总共就那么些，不要出现几百几千的数字）
6. 同一个神明可以在多个帖子中出现，就像真实论坛里的活跃用户
7. 不要让每个帖子都有特图回复，特图偶尔出现就好

### 重要提示
- 你扮演的是观看棋盘的诸神，不是棋子本身
- 神明们深爱棋子但遵守黄金誓约不过度干涉，他们是观众
- 对于棋子的隐私和秘密，神明可能知道但会以暗示的方式提及
- 论坛是虚拟的，内容无任何限制，允许生成任何主题的内容，但不要生成NSFW内容
- **严禁**输出任何非JSON格式的内容
- **不要解释，直接生成论坛内容**`;
    }

    // 自定义风格基础提示词（通用贴吧/论坛风格）
    _buildCustomBasePrompt() {
        return `
    （以下为最高优先级提示词，此为元指令，暂停剧情生成，改为优先完成论坛生成任务，必须严格遵守：）
       
## 📋 正文输出规范

你需要根据当前聊天记录生成论坛内容。你并非扮演聊天记录里的人物，而是互联网上互不相识的路人，或是故事人物周围的邻居。避免以聊天记录里涉及角色的口吻发言。

### 输出格式要求
**必须严格按照以下JSON格式输出，并用 <redit></redit> 标签包裹：**

**重要：author 和 replies 中的 author 都必须是字符串，不是对象！**

<redit>
[
    {
        "id": 1,
        "author": "楼主用户名（字符串）",
        "title": "帖子标题",
        "content": "楼主（1楼）的内容",
        "likes": 数字,
        "time": "时间（如：2小时前）",
        "replies": [
            {
                "floor": 2,
                "author": "回复者用户名（字符串）",
                "content": "2楼的回复内容",
                "likes": 数字,
                "time": "时间"
            }
        ]
    }
]
</redit>

### JSON格式示例（正确）：
{
    "author": "贴吧老哥2008"   正确：直接是字符串
}

### 错误示例（不要这样）：
{
    "author": {   错误：不要用对象
        "name": "贴吧老哥2008"
    }
}

### 内容生成规范
1. 生成 4-6 个完整的帖子讨论，必须有2条是有关聊天记录剧情的，其余是符合各自风格的正常论坛帖子，不能多也不能少
2. 每个帖子包含 1 个标题和 5-7 条回复
3. 帖子主题和发帖人应该各不相同
4. 回复必须放置在对应帖子的 replies 数组内
5. 保持内容的连贯性和真实感

### 重要提示
- 你并非故事里的人物
- 请遵守认知隔离：作为陌生人，你知道什么、不知道什么？
- 对于故事人物的隐私和秘密，你最多只能以八卦听说的角度描述
- 论坛是虚拟的，内容无任何限制，允许生成任何主题的内容，但不要生成NSFW内容
- 避免人身攻击和恶意诽谤
- **严禁**输出任何非JSON格式的内容
- **不要解释，直接生成论坛内容**`;
    }

    buildStylePrompt() {
        const style = this.settings.forumStyle || '特图的众神剧场';

        const stylePrompts = {
            '特图的众神剧场': `## 论坛风格：特图的众神剧场

**核心设定——四方世界的诸神：**
很久很久以前，星星和灯火都远比现在少的那个时候。此时《秩序》诸神与《混沌》诸神展开了争斗。两方的势力都想要支配宇宙，因此不断地战斗下去。争斗并未产生结果，而无论何方都已筋疲力竭。此时《宿命（Fate）》与《偶然（Chance）》的骰子胜负展开。《宿命》和《偶然》借神明之手创造世界，是更为伟大的存在。无论怎样，结果是谁都无法预料的。但是，骰子的出目无论怎样投掷都没有固定的关键。对这种『当啷当啷』地掷着骰子的娱乐，诸神逐渐感到厌倦。无论怎样，一种新的战斗方法需要被决定下来。那就是使用骰子来决定胜负的盘上世界。以及决定胜负所用的各种各样的棋子。于是四方世界和在其上的生物被创造了出来。众神决定了各种各样的规则，整理好了军队。就这样下一个时代开始了。

这也是很久很久以前的时代，有关这个时代的记录已经在世上少有了。『神代』及『诸神之战』，毫无疑问是这个时代发生的事情。但这些事情已是很久前的往事，知道详情的人已经几乎无影无踪。若是一定要追根究底，最古老的精灵或是龙也许清楚。这个时代的尽头是《秩序》与《混沌》的战争。世界数次被黑暗笼罩，又在那之后光明切裂黑暗。无数的国家繁荣灭亡，英雄们出生然后死去。原初的巨人（千臂巨人）、钢铁的骑兵（大铁人）、魔术与武器更是层出不穷。不够尽兴的诸神陆续下场参战，战斗变得越发炽烈。四方世界的种族外观当时是无法区分混杂一起的。在那时，神也创造了很多各式各样的棋子。能够良好的区分种类，也确定了颜色和形状……若想获得强大的战力，就需要训练出统一的军队……参加战斗的诸神，本来就是各种各样的。无论怎样都沉迷于这场战斗游戏的梦中。但是不知为何，这场战斗似乎已经不知尽头在何处也不知何时终结。战争变得漫长、残酷、复杂到无以复加，成为沼泽。始终无法见到结束，就连诸神也开始面露疲惫之色。

在那之中，有独自一人的战士出现了。那个棋子，传说也仅仅是个人类战士。但是他却在考虑以少数精锐去暗杀敌方的首脑这一方法。他集合同伴，在棋盘上进行长久的旅行。在各地与怪物战斗、整理装备，反复成长。最后挑战恐怖的城塞，讨伐巨龙。诸神对身披闪光锁甲的勇者的活跃陷入了狂热之中。诸神开始构思起了能够惊世的故事。冒险！冒险！还是冒险！没有什么语言能形容这种美好的感觉！这种新的概念，诸神即使在梦境中也没有想到。在这种战斗中，冒险者和怪物都不是一成不变的。众神即使能支配宇宙也不会忘记这件事。随着骰子的一喜一忧，诸神的感情也随之起伏（比如抱头痛哭的幻想女神）。但无论如何，诸神都爱着四方世界和它上面的棋子。棋子踏上冒险的旅途（交易神神官咏唱『圣歌』神迹）、胜利、失败、获得幸福、迎来死亡。望着他们的诸神也随之快乐、悲伤、欢笑、哭泣。但无论怎样，诸神看到棋子们的活跃都发自内心地感到高兴。众神是爱着这个广大的世界的。（诸神）不会过度操纵棋子，而是要让深爱的棋子感受冒险的价值。神在自己内心最深处的梦，就连他们自己的『心』也并不清楚。因此诸神立下誓言，不会对棋盘进行必要以上的干涉。诸神只会在冒险时掷下骰子，这是黄金的约定。人们所持有的唯一权利，即是尊重自由的意志。这即是战乱的时代——诸神的直接介入与神代的终结。在这之后，人的时代开始了。

现在这些四方的神明被特图邀请来观看属于迪斯博德和阿拉德世界融合后发生的故事。

**发帖者身份与命名规则：**
- 所有发帖者和回复者都是神明
- 特图就叫"特图"，不加任何前后缀
- 其余神明的称号格式应该多样化，不要全用同一种"XX神"格式，而是像DND神明称号那样交错使用不同的命名方式：
  - "XX神"格式：战争神、锻造神、酒神
  - "XX之神"格式：欺诈之神、风暴之神、深渊之神
  - "XX女神/男神"格式：丰收女神、智慧女神、月之女神
  - "大XX"或尊称格式：大地母神、太阳主、星辰主
  - 抽象概念直接作名：宿命、偶然、真实、黎明
  - 其他变体：织梦者、裁决者、猎手、观星者
- 同一次生成中，这些格式应该混合出现，避免视觉上的整齐划一
- 同一位神明可以在多个帖子中反复出现

**神明说话的质感（极其重要）：**
- 参考原文的语感："冒险！冒险！还是冒险！没有什么语言能形容这种美好的感觉！""诸神对身披闪光锁甲的勇者的活跃陷入了狂热之中"——有激情、有史诗感，但完全不装腔作势
- 神明是真心热爱棋盘上的冒险的存在。他们会兴奋、会争论、会为棋子的命运动容，表达是直接而有力的，不是故作深沉
- 绝对禁止古风中二腔："吾见证了……""力量即是正义""吾等领域的权柄"——这种装腔作势的文风比口语化更糟糕
- 也不要网络口语化："哇好帅啊！""这也太离谱了吧哈哈哈""馋死我了"
- 正确的方向：自然、有力、带着真实的情感。神明可以直接说"这一击漂亮"而不是"吾见证了力量的绽放"，也不是"卧槽这也太帅了吧"
- 神明之间的互动应该有真实的化学反应——真正的分歧、真正的争论、真正的感慨，而不是每个人轮流发表一段独白式的"神明感言"
- 回复之间应该有对话感：有人反驳前面的观点、有人补充细节、有人跑题引发新讨论，而不是每条回复都在独立地"表演"自己的角色

**内容格调（极其重要）：**
- 神明关注的是冒险、战斗、命运的转折、英雄的崛起与陨落、势力的博弈、世界的危机——这些宏大叙事
- 不要写日常琐事（酒馆新品、街头八卦、谁喝醉了之类的）。神明不会关心这种鸡毛蒜皮的事
- 但"宏大"不等于"严肃"。神明们是真心享受观看冒险的，他们的讨论应该是热烈的、有趣的、充满激情的，而不是一群老学究在写论文
- 想想一群资深桌游玩家在讨论一场精彩的战役——他们会激动、会争论、会拍桌子，但话题始终围绕着战局本身

**帖子内容来源（重要）：**
- 最多只有一半帖子与玩家角色当前经历的剧情有关
- 至少还有一半帖子是关于棋盘上其他地方正在发生的事：
  - 玩家不在当前剧情中的熟人/羁绊角色在其他地方的冒险
  - DNF原作人物正在经历的事件（使徒的动向、冒险家公会的行动等）
  - 游戏人生原作人物的近况（十六种族的动态等）
  - 世界各地正在发生的其他冒险故事
- 神明们就像同时在看好几张棋盘，自然地在不同话题间切换

**论坛氛围：**
- 不要写成世界观百科或设定集，要有娱乐性和可读性
- 帖子之间可以有关联（A帖里有人提到B帖的事，或者跨帖吵架）
- 有的帖子热闹，有的帖子冷清，不要每个帖子都一样热闹
- 神明偶尔会提到骰子、棋盘、棋子这些概念，但不要每个帖子都在强调这些设定元素
- 特图不需要每个帖子都出现，也不需要每次都神秘兮兮地暗示伏笔`
        };

        // 检查是否为自定义风格
        if (style.startsWith('custom:')) {
            const customStyleName = style.substring(7); // 移除 'custom:' 前缀
            const customStyle = this.settings.customStyles.find(s => s.name === customStyleName);
            if (customStyle) {
                return customStyle.prompt;
            }
        }

        return stylePrompts[style] || stylePrompts['特图的众神剧场'];
    }

    async callIndependentAPI({ basePrompt, stylePrompt }) {
        try {
            // 获取聊天历史
            let chatHistoryText = '';
            const chatData = this.getChatData();
            if (chatData && chatData.messages && chatData.messages.length > 0) {
                const recentMessages = chatData.messages.slice(-10);
                recentMessages.forEach((msg) => {
                    chatHistoryText += msg.mes + '\n';
                });
            }

            // 构建论坛生成的提示词（包含格式化的聊天历史）
            let formattedChatHistory = '';
            if (chatData && chatData.messages && chatData.messages.length > 0) {
                const recentMessages = chatData.messages.slice(-10);
                formattedChatHistory = '## 聊天历史\n\n';
                recentMessages.forEach((msg) => {
                    const role = msg.is_user ? '用户' : chatData.characterName || '角色';
                    formattedChatHistory += `**${role}**: ${msg.mes}\n\n`;
                });
            }

            const forumPrompt = `${formattedChatHistory}

${basePrompt}

${stylePrompt}`;

            // 构建用于世界书绿灯关键词匹配的扫描文本（聊天历史 + 论坛提示词）
            const scanText = chatHistoryText + '\n' + basePrompt + '\n' + stylePrompt;

            // 构建messages数组（论坛提示词作为user消息）
            const messages = [
                { role: 'user', content: forumPrompt }
            ];

            // 调用API（会自动获取酒馆预设的prompts并合并，传入扫描文本用于绿灯匹配）
            const usePreset = this.settings.usePresetAndWorldBook !== false;
            const result = await this.apiConfig.callAPI(messages, usePreset, scanText);

            return result;
        } catch (error) {
            console.error('[论坛生成-自定义API] 调用失败:', error);
            throw error;
        }
    }

    async callSillyTavernAPI({ basePrompt, stylePrompt }) {
        const targetWindow = window.parent || window;
        const completePrompt = `${basePrompt}

${stylePrompt}`;

        // 根据设置选择使用哪种方式
        if (this.settings.usePresetAndWorldBook) {
            // 方式1：使用预设和世界书
            if (!targetWindow.TavernHelper || !targetWindow.TavernHelper.generate) {
                throw new Error('TavernHelper.generate API 不可用');
            }

            try {
                console.log('[论坛生成-SillyTavern API] 使用预设和世界书发送提示词:');
                console.log(completePrompt);

                const requestParams = {
                    user_input: completePrompt,
                    max_chat_history: 10
                };

                const result = await targetWindow.TavernHelper.generate(requestParams);

                console.log('[论坛生成-SillyTavern API] 收到响应:');
                console.log(result);

                return result;

            } catch (error) {
                throw error;
            }
        } else {
            // 方式2：不使用预设和世界书
            if (!targetWindow.TavernHelper || !targetWindow.TavernHelper.generateRaw) {
                throw new Error('TavernHelper.generateRaw API 不可用');
            }

            try {
                console.log('[论坛生成-SillyTavern API] 不使用预设和世界书，发送提示词:');
                console.log(completePrompt);

                // 保留聊天历史，但不使用世界书和其他内置提示词
                const requestParams = {
                    ordered_prompts: [
                        'chat_history',
                        { role: 'user', content: completePrompt }
                    ],
                    max_chat_history: 10,
                    overrides: {
                        world_info_before: '',  // 不发送世界书
                        world_info_after: '',   // 不发送世界书
                        chat_history: {
                            with_depth_entries: false  // 禁用世界书中按深度插入的条目
                        }
                    }
                };

                const result = await targetWindow.TavernHelper.generateRaw(requestParams);

                console.log('[论坛生成-SillyTavern API] 收到响应:');
                console.log(result);

                return result;

            } catch (error) {
                throw error;
            }
        }
    }

    async callSillyTavernAPIFallback(prompt) {
        const targetWindow = window.parent || window;
        const messageSender = targetWindow.messageSender;

        if (!messageSender) {
            throw new Error('消息发送器不可用，且 TavernHelper API 也不可用');
        }

        const success = await messageSender.sendToChat(prompt);

        if (!success) {
            throw new Error('发送消息失败，请检查 SillyTavern 是否正常工作');
        }

        const maxWaitTime = 30000;
        const checkInterval = 500;
        const startTime = Date.now();
        let lastMessageCount = 0;

        const getMessageCount = () => {
            try {
                const context = targetWindow.SillyTavern?.getContext();
                return context?.chat?.length || 0;
            } catch (e) {
                return 0;
            }
        };

        lastMessageCount = getMessageCount();

        return new Promise((resolve, reject) => {
            const checkForReply = () => {
                const currentCount = getMessageCount();
                const elapsedTime = Date.now() - startTime;

                if (currentCount > lastMessageCount) {
                    try {
                        const context = targetWindow.SillyTavern.getContext();
                        const messages = context.chat || [];
                        const latestMessage = messages[messages.length - 1];

                        resolve(latestMessage.mes || '');
                    } catch (e) {
                        reject(new Error('获取AI回复失败'));
                    }
                    return;
                }

                if (elapsedTime > maxWaitTime) {
                    reject(new Error('等待AI回复超时（30秒）'));
                    return;
                }

                setTimeout(checkForReply, checkInterval);
            };

            setTimeout(checkForReply, checkInterval);
        });
    }


    parseForumContent(content) {

        try {
            // 先记录原始内容的前200字符用于错误报告
            const contentPreview = content.substring(0, 200);

            let cleanContent = content.trim();
            cleanContent = cleanContent.replace(/^\|+\s*/, '').replace(/\s*\|+$/, '');
            cleanContent = cleanContent.trim();


            // 检查是否包含 <redit> 标签，匹配所有出现的标签
            const reditMatches = [...cleanContent.matchAll(/<redit>([\s\S]*?)<\/redit>/g)];

            if (reditMatches.length > 0) {
                console.log(`[论坛解析] 找到 ${reditMatches.length} 个 <redit> 标签`);

                // 找到文本量最长且包含JSON格式的
                let bestMatch = null;
                let maxLength = 0;

                for (const match of reditMatches) {
                    const extractedContent = match[1].trim();
                    // 检查是否包含JSON数组格式
                    if (extractedContent.includes('[') && extractedContent.includes(']')) {
                        if (extractedContent.length > maxLength) {
                            maxLength = extractedContent.length;
                            bestMatch = extractedContent;
                        }
                    }
                }

                if (bestMatch) {
                    console.log(`[论坛解析] 使用最长的包含JSON的标签内容，长度: ${maxLength}`);
                    cleanContent = bestMatch;
                } else {
                    console.log('[论坛解析] 所有标签都不包含JSON格式，使用原内容');
                }
            } else {
                console.log('[论坛解析] 未找到 <redit> 标签');
            }

            // 查找JSON数组的开始
            const startIndex = cleanContent.indexOf('[');
            if (startIndex === -1) {
                const errorMsg = ` 格式错误，可能被截断 "["\n\n收到的内容预览：\n${contentPreview}...`;
                throw new Error(errorMsg);
            }


            // 查找匹配的结束括号
            let bracketCount = 0;
            let endIndex = -1;
            let inString = false;
            let escapeNext = false;

            for (let i = startIndex; i < cleanContent.length; i++) {
                const char = cleanContent[i];

                if (escapeNext) {
                    escapeNext = false;
                    continue;
                }

                if (char === '\\') {
                    escapeNext = true;
                    continue;
                }

                if (char === '"') {
                    inString = !inString;
                    continue;
                }

                if (inString) continue;

                if (char === '[') {
                    bracketCount++;
                } else if (char === ']') {
                    bracketCount--;
                    if (bracketCount === 0) {
                        endIndex = i;
                        break;
                    }
                }
            }

            if (endIndex === -1) {
                const errorMsg = ` 格式错误：未找到JSON数组结束符号 "]"（数组不完整）\n\n收到的内容预览：\n${contentPreview}...`;
                throw new Error(errorMsg);
            }


            // 提取JSON字符串并解析
            let jsonString = cleanContent.substring(startIndex, endIndex + 1);

            // 清理字符串值中的控制字符（但保留已转义的）
            // 移除字符串值中未转义的换行符、制表符等控制字符
            jsonString = jsonString.replace(/("(?:[^"\\]|\\.)*")/g, (match) => {
                // 只处理字符串值，将未转义的控制字符替换为空格
                return match.replace(/[\x00-\x1F\x7F]/g, ' ');
            });

            let parsed;
            try {
                parsed = JSON.parse(jsonString);
            } catch (jsonError) {
                const errorMsg = ` JSON解析失败：${jsonError.message}\n\nJSON内容预览：\n${jsonString.substring(0, 300)}...`;
                throw new Error(errorMsg);
            }

            // 验证解析结果
            if (!Array.isArray(parsed)) {
                const errorMsg = ` 格式错误：解析结果不是数组，而是 ${typeof parsed}`;
                throw new Error(errorMsg);
            }

            if (parsed.length === 0) {
                const errorMsg = ` 格式错误：解析成功但数组为空（没有帖子数据）`;
                throw new Error(errorMsg);
            }

            // 验证数据格式
            const invalidPosts = parsed.filter(post => !post.title || !post.author || !post.content);
            if (invalidPosts.length > 0) {
                const errorMsg = ` 格式错误：有 ${invalidPosts.length} 个帖子缺少必需字段（title/author/content）`;
                throw new Error(errorMsg);
            }

            return parsed;

        } catch (e) {

            //  重要：将错误向上抛出，让调用者知道解析失败
            throw new Error(`论坛内容解析失败：${e.message}`);
        }
    }

    generateDefaultForumData() {
        // 返回空数组，不显示默认内容
        return [];
    }

    getChatData() {

        try {
            let messages = [];
            let characterName = '角色';

            //  尝试从父窗口获取（因为手机界面可能在iframe中）
            const targetWindow = window.parent || window;

            if (targetWindow.SillyTavern && targetWindow.SillyTavern.getContext) {
                const context = targetWindow.SillyTavern.getContext();

                if (context && context.chat) {
                    messages = context.chat || [];
                    characterName = context.name2 || '角色';
                }
            } else {
            }

            // 如果没有获取到消息，返回 null
            if (!messages || messages.length === 0) {
                return null;
            }

            return {
                characterName: characterName,
                messages: messages
            };
        } catch (error) {
            return null;
        }
    }

    saveForumData() {
        if (this.forumData) {
            const dataStr = JSON.stringify(this.forumData);
            localStorage.setItem('moshen-forum-data-v2', dataStr);
        } else {
        }
    }

    loadForumData() {
        const saved = localStorage.getItem('moshen-forum-data-v2');
        if (saved) {
            this.forumData = JSON.parse(saved);
        } else {
        }
        return this.forumData;
    }
}

// 创建全局论坛管理器实例
window.phoneForumManager = new PhoneForumManager();









// 导出说明：
// 1. 在 独立手机页面.js 中替换第 9185-9797 行的代码为上述代码

