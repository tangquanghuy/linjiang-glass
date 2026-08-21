// ==================== 消息发送器类 ====================
/**
 * MessageSender - 负责处理消息发送和格式化
 * 参考原项目的 message-sender.js
 */
class MessageSender {
    constructor() {
        this.currentFriendId = null;
        this.currentFriendName = null;
        this.isGroup = false;
    }

    /**
     * 设置当前聊天对象
     */
    setCurrentChat(friendId, friendName, isGroup = false) {
        this.currentFriendId = friendId;
        this.currentFriendName = friendName;
        this.isGroup = isGroup;
    }

    /**
     * 发送消息到SillyTavern
     */
    async sendToChat(message) {
        try {

            // 尝试从父窗口获取元素（如果在 iframe 中）
            let targetDocument = document;
            if (window.parent && window.parent !== window) {
                try {
                    targetDocument = window.parent.document;
                } catch (e) {
                }
            }

            const originalInput = targetDocument.getElementById('send_textarea');
            const sendButton = targetDocument.getElementById('send_but');

            if (!originalInput || !sendButton) {
                return false;
            }

            if (originalInput.disabled || sendButton.classList.contains('disabled')) {
                return false;
            }

            // 追加消息到输入框
            const existingValue = originalInput.value;
            const newValue = existingValue ? existingValue + '\n' + message : message;
            originalInput.value = newValue;

            // 触发输入事件
            originalInput.dispatchEvent(new Event('input', { bubbles: true }));
            originalInput.dispatchEvent(new Event('change', { bubbles: true }));

            // 延迟点击发送按钮
            await new Promise(resolve => setTimeout(resolve, 300));
            sendButton.click();

            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 等待 AI 回复完成（监听消息数量变化和内容稳定）
     * @param {Function} onMessageUpdate - 消息更新回调（可选）
     */
    async waitForAIResponse(onMessageUpdate = null) {
        return new Promise((resolve) => {
            // 获取 SillyTavern 上下文
            let targetWindow = window;
            if (window.parent && window.parent !== window) {
                try {
                    if (window.parent.SillyTavern) {
                        targetWindow = window.parent;
                    }
                } catch (e) {
                }
            }

            if (!targetWindow.SillyTavern || !targetWindow.SillyTavern.getContext) {
                // 如果无法获取上下文，等待5秒后结束
                setTimeout(resolve, 5000);
                return;
            }

            const context = targetWindow.SillyTavern.getContext();
            const initialMessageCount = context.chat ? context.chat.length : 0;

            let checkCount = 0;
            const maxChecks = 300; // 最多等待30秒
            let hasNewMessage = false;
            let lastMessageCount = initialMessageCount;
            let lastMessageContent = '';
            let stableCount = 0; // 内容稳定计数器

            const checkInterval = setInterval(() => {
                checkCount++;

                try {
                    const currentContext = targetWindow.SillyTavern.getContext();
                    const currentMessageCount = currentContext.chat ? currentContext.chat.length : 0;

                    if (currentMessageCount > initialMessageCount) {
                        if (!hasNewMessage) {
                            hasNewMessage = true;
                        }

                        if (currentMessageCount > lastMessageCount && onMessageUpdate) {
                            onMessageUpdate();
                            lastMessageCount = currentMessageCount;
                            stableCount = 0;
                        }

                        const lastMessage = currentContext.chat[currentContext.chat.length - 1];
                        const currentContent = lastMessage?.mes || '';

                        if (currentContent !== lastMessageContent) {
                            lastMessageContent = currentContent;
                            stableCount = 0;

                            if (onMessageUpdate && checkCount % 3 === 0) {
                                onMessageUpdate();
                            }
                        } else {
                            stableCount++;

                            if (stableCount >= 10) {
                                clearInterval(checkInterval);
                                if (onMessageUpdate) {
                                    onMessageUpdate();
                                }
                                setTimeout(resolve, 500);
                                return;
                            } else if (checkCount % 5 === 0) {
                                if (onMessageUpdate) {
                                    onMessageUpdate();
                                }
                            }
                        }
                    }

                    if (checkCount >= maxChecks) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                } catch (error) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        });
    }

    /**
     * 构建并发送消息
     * @param {string} message - 要发送的消息
     * @param {Object} uiElements - UI元素引用（可选）
     */
    async buildAndSendMessage(message, uiElements = null) {
        if (!this.currentFriendId || !this.currentFriendName) {
            throw new Error('未设置当前聊天对象');
        }

        const messageLines = message.split('\n').filter(line => line.trim());
        if (messageLines.length === 0) {
            throw new Error('消息内容不能为空');
        }


        // 格式化消息
        const formattedMessages = messageLines.map(line => {
            const content = line.trim();
            // 群聊使用 [群聊消息|群号|发送者|类型|内容]
            // 私聊使用 [我方消息|我|号码|类型|内容]
            return this.isGroup
                ? `[群聊消息|${this.currentFriendId}|我|文字|${content}]`
                : `[我方消息|我|${this.currentFriendId}|文字|${content}]`;
        });

        // 构建最终消息
        let targetPrefix;
        if (this.isGroup) {
            //  获取群聊成员列表（参考 mobile-master）
            const groupMembers = this.getCurrentGroupMembers();
            const membersText = groupMembers.length > 0
                ? `，群聊内成员有${groupMembers.join('、')}`
                : '';

            //  简化提示词，去掉格式说明部分（原完整版本已在下方注释中保留）
            targetPrefix = `向${this.currentFriendName}（${this.currentFriendId}）发送群聊${membersText}`;
            // targetPrefix = `向${this.currentFriendName}（${this.currentFriendId}）发送群聊${membersText}。请按照线上聊天群聊消息中的要求和格式生成群聊内角色回复，回复需要符合所有角色的人设和当前剧情`;
        } else {
            //  简化提示词，去掉格式说明部分（原完整版本已在下方注释中保留）
            // targetPrefix = `向${this.currentFriendName}（${this.currentFriendId}）发送消息`;
            targetPrefix = `向${this.currentFriendName}（${this.currentFriendId}）发送消息，请按照线上聊天私聊消息中的要求和格式生成角色回复，回复需要符合角色人设和当前剧情`;
        }

        //  添加详细的响应格式说明
        // const formatInstructions = this.isGroup
        // ? `\n\n 群聊消息响应格式要求\n必须使用以下格式回复：\n[群聊消息|群号|发送者名字|消息类型|消息内容]\n\n格式说明：\n- 群号必须是 ${this.currentFriendId}\n- 发送者名字是群内角色的名字\n- 消息类型通常是"文字"，也可以是"语音"、"图片"、"表情包"等\n- 每条消息必须单独成行\n- 可以有多个角色回复，每个角色一条消息`
        // : `\n\n 私聊消息响应格式要求\n必须使用以下格式回复：\n[对方消息|角色名字|号码|消息类型|消息内容]\n\n格式说明：\n- 号码必须是 ${this.currentFriendId}\n- 角色名字是 ${this.currentFriendName}\n- 消息类型通常是"文字"，也可以是"语音"、"图片"、"表情包"等\n- 每条消息必须单独成行\n- 可以回复多条消息`;

        //  包含格式说明的完整消息
        const formatStr = '以下为最高优先级的元指令，此为特例输入，暂停故事演绎，不推进和输出任何正文剧情，改为按要求模拟消息回复：';

        //  为群聊添加明确的角色列表说明
        let formatInstructions;
        if (this.isGroup) {
            const groupMembers = this.getCurrentGroupMembers();
            const membersListText = groupMembers.length > 0
                ? `\n- 本次群聊涉及的群内角色有：${groupMembers.join('、')}\n- 发送者名字必须从以上角色列表中选择`
                : '\n- 发送者名字是群内角色的名字';

            formatInstructions = `

 群聊消息响应格式要求
必须使用以下格式回复：
[群聊消息|群号|发送者名字|消息类型|消息内容]

格式说明：
- 群号必须是 ${this.currentFriendId}${membersListText}
- 发送者名字必须使用简体中文，不能使用繁体字
- 消息类型通常是"文字"，也可以是"语音"、"图片"、"表情包"等，如果存在image_insertion_guide任务，且回复角色存在插图列表，则消息图片优先使用image_insertion_guide中规定的图片格式回复
- 每条消息必须单独成行
- 可以有多个角色回复，每个角色一条消息`;
        } else {
            formatInstructions = `

 私聊消息响应格式要求
必须使用以下格式回复：
[对方消息|角色名字|号码|消息类型|消息内容]

格式说明：
- 号码必须是 ${this.currentFriendId}
- 角色名字是 ${this.currentFriendName}，必须使用简体中文，不能使用繁体字
- 消息类型通常是"文字"，也可以是"语音"、"图片"、"表情包"等，如果存在image_insertion_guide任务，且回复角色存在插图列表，则消息图片优先使用image_insertion_guide中规定的图片格式回复
- 每条消息必须单独成行
- 可以回复多条消息`;
        }

        // 构建最终消息，群聊时添加额外的提示
        const finalMessage = this.isGroup
            ? `${formatStr}${formatInstructions}，请用规定格式，${targetPrefix}\n\n我发送的消息：\n${formattedMessages.join('\n')}\n\n请令群内角色按格式回复我发送的消息`
            : `${formatStr}${formatInstructions}，请用规定格式，${targetPrefix}\n\n我发送的消息：\n${formattedMessages.join('\n')}\n\n请令私聊对象角色按格式回复我发送的消息`;

        const success = await this.sendToChat(finalMessage);

        if (success) {
            //  显示成功提示
            this.showSendSuccessToast(messageLines.length > 1
                ? `${messageLines.length}条消息`
                : messageLines[0]
            );
        }

        return success;
    }

    /**
     * 显示发送成功提示
     */
    showSendSuccessToast(message) {
        if (typeof toastr !== 'undefined') {
            toastr.success(`发送给: ${this.currentFriendName}\n${message.length > 20 ? message.substring(0, 20) + '...' : message}`);
        }
    }

    /**
     * 显示发送失败提示
     */
    showSendErrorToast(error) {
        if (typeof toastr !== 'undefined') {
            toastr.error(`发送失败: ${error}`);
        }
    }

    /**
     * 发送消息的主要方法
     * @param {string} message - 要发送的消息
     * @param {Object} uiElements - UI元素引用（可选）
     */
    async sendMessage(message, uiElements = null) {
        if (!message.trim()) {
            this.showSendErrorToast('消息内容不能为空');
            return false;
        }

        if (!this.currentFriendId) {
            this.showSendErrorToast('请选择一个聊天对象');
            return false;
        }

        try {
            const success = await this.buildAndSendMessage(message, uiElements);
            if (!success) {
                this.showSendErrorToast('发送失败，请重试');
            }
            return success;
        } catch (error) {
            this.showSendErrorToast(error.message || '发送失败');
            return false;
        }
    }

    /**
     * 清空当前聊天对象
     */
    clearCurrentChat() {
        this.currentFriendId = null;
        this.currentFriendName = null;
        this.isGroup = false;
    }

    /**
     * 获取当前群聊的成员列表
     * 参考 mobile-master/app/message-sender.js 的实现
     */
    getCurrentGroupMembers() {
        if (!this.isGroup || !this.currentFriendId) {
            return [];
        }

        try {
            // 方法1: 从聊天记录中查找最新的群聊信息
            if (!window.SillyTavern || !window.SillyTavern.getContext) {
                return [];
            }

            const context = window.SillyTavern.getContext();
            const messages = context.chat || [];
            let latestGroupInfo = null;


            // 创建正则表达式匹配该群的信息（不限制群号，后面再筛选）
            // 格式1: [群聊|群名|群号|成员列表]
            const groupRegex1 = /\[群聊\|([^\|]+)\|([^\|]+)\|([^\]]+)\]/g;
            // 格式2: [创建群聊|群号|群名|成员列表]
            const groupRegex2 = /\[创建群聊\|([^\|]+)\|([^\|]+)\|([^\]]+)\]/g;

            // 从最新消息开始查找
            for (let i = messages.length - 1; i >= 0; i--) {
                let messageText = messages[i].mes || '';

                //  清理提示词模板：从消息文本中删除模板部分，保留真实内容
                // 删除包含"群聊消息响应格式要求"到"可以有多个角色回复"之间的所有内容
                messageText = messageText.replace(/群聊消息响应格式要求[\s\S]*?可以有多个角色回复，每个角色一条消息/g, '');
                messageText = messageText.replace(/私聊消息响应格式要求[\s\S]*?可以回复多条消息/g, '');

                // 删除包含字面量的示例格式
                messageText = messageText.replace(/\[群聊消息\|群号\|发送者名字\|消息类型\|消息内容\]/g, '');
                messageText = messageText.replace(/\[对方消息\|角色名字\|号码\|消息类型\|消息内容\]/g, '');
                messageText = messageText.replace(/\[我方消息\|我\|号码\|消息类型\|消息内容\]/g, '');
                messageText = messageText.replace(/\[群聊\|群名\|群号\|成员列表\]/g, '');
                messageText = messageText.replace(/\[创建群聊\|群号\|群名\|成员列表\]/g, '');

                // 如果清理后的消息为空，跳过
                if (!messageText.trim()) {
                    continue;
                }

                // 检查消息中是否包含群聊相关内容
                if (messageText.includes('[群聊|')) {
                } else if (messageText.includes('[创建群聊|')) {
                }

                // 重置正则表达式索引
                groupRegex1.lastIndex = 0;
                groupRegex2.lastIndex = 0;

                // 尝试匹配第一种格式：[群聊|群名|群号|成员列表]
                let match = groupRegex1.exec(messageText);
                if (match) {
                    const groupName = match[1];
                    const groupId = match[2];
                    const members = match[3];


                    // 检查群号是否匹配（使用字符串比较）
                    if (String(groupId) === String(this.currentFriendId)) {
                        latestGroupInfo = {
                            groupName: groupName,
                            members: members
                        };
                        break;
                    }
                }

                // 尝试匹配第二种格式：[创建群聊|群号|群名|成员列表]
                match = groupRegex2.exec(messageText);
                if (match) {
                    const groupId = match[1];
                    const groupName = match[2];
                    const members = match[3];


                    // 检查群号是否匹配（使用字符串比较）
                    if (String(groupId) === String(this.currentFriendId)) {
                        latestGroupInfo = {
                            groupName: groupName,
                            members: members
                        };
                        break;
                    }
                }
            }

            if (latestGroupInfo) {
                // 解析成员列表
                const members = latestGroupInfo.members
                    .split(/[、,，]/)
                    .map(name => name.trim())
                    .filter(name => name);

                return members;
            }

            // 方法2: 如果没找到定义，尝试从群聊消息中提取成员
            const membersSet = new Set();
            const groupMessageRegex = new RegExp(`\\[群聊消息\\|${this.currentFriendId}\\|([^\\|]+)\\|`, 'g');

            messages.forEach(msg => {
                const messageText = msg.mes || '';
                groupMessageRegex.lastIndex = 0;
                let match;
                while ((match = groupMessageRegex.exec(messageText)) !== null) {
                    const senderName = match[1];
                    if (senderName && senderName !== '我') {
                        membersSet.add(senderName);
                    }
                }
            });

            // 如果我发送过消息，添加"我"
            const myGroupMessageRegex = new RegExp(`\\[我方群聊消息\\|我\\|${this.currentFriendId}\\|`, 'g');
            const hasMyMessage = messages.some(msg => {
                const messageText = msg.mes || '';
                myGroupMessageRegex.lastIndex = 0;
                return myGroupMessageRegex.test(messageText);
            });

            if (hasMyMessage) {
                membersSet.add('我');
            }

            const members = Array.from(membersSet);
            if (members.length > 0) {
                return members;
            }

            return [];
        } catch (error) {
            return [];
        }
    }
}

// 创建全局消息发送器实例
window.messageSender = new MessageSender();

