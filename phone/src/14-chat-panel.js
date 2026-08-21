// ==================== 聊天界面功能函数 ====================
/**
 * 从聊天记录中提取与指定联系人的消息
 */
function extractMessagesForContact(contactId, isGroup = false) {
    const messages = [];
    const messageSet = new Set(); // 用于去重

    try {
        let chatMessages = [];

        let targetWindow = window;
        if (window.parent && window.parent !== window) {
            try {
                if (window.parent.SillyTavern) {
                    targetWindow = window.parent;
                }
            } catch (e) {
            }
        }

        if (targetWindow.SillyTavern && targetWindow.SillyTavern.getContext) {
            const context = targetWindow.SillyTavern.getContext();
            chatMessages = context.chat || [];
        } else {
        }

        chatMessages.forEach((msg, index) => {
            if (!msg.mes) return;
            let text = msg.mes;

            //  清理提示词模板：从消息文本中删除模板部分，保留真实内容
            text = text.replace(/群聊消息响应格式要求[\s\S]*?可以有多个角色回复，每个角色一条消息/g, '');
            text = text.replace(/私聊消息响应格式要求[\s\S]*?可以回复多条消息/g, '');
            text = text.replace(/\[群聊消息\|群号\|发送者名字\|消息类型\|消息内容\]/g, '');
            text = text.replace(/\[对方消息\|角色名字\|号码\|消息类型\|消息内容\]/g, '');
            text = text.replace(/\[我方消息\|我\|号码\|消息类型\|消息内容\]/g, '');
            text = text.replace(/\[群聊\|群名\|群号\|成员列表\]/g, '');
            text = text.replace(/\[创建群聊\|群号\|群名\|成员列表\]/g, '');

            // 如果清理后的消息为空，跳过
            if (!text.trim()) return;

            // 如果是群聊，记录包含群聊消息的文本
            // if (isGroup && text.includes('[群聊消息|')) {
            // }

            // 匹配私聊消息: [我方消息|我|号码|类型|内容] 或 [对方消息|名字|号码|类型|内容]
            const privateRegex = /\[(我方消息|对方消息)\|([^|]*)\|([^|]*)\|([^|]*)\|([^\]]*)\]/g;
            // 匹配群聊消息: [群聊消息|群号|发送者|类型|内容]
            const groupRegex = /\[群聊消息\|([^|]*)\|([^|]*)\|([^|]*)\|([^\]]*)\]/g;
            //  新增：匹配我方群聊消息: [我方群聊消息|我|群号|类型|内容]
            const myGroupRegex = /\[我方群聊消息\|我\|([^|]*)\|([^|]*)\|([^\]]*)\]/g;

            let match;

            if (isGroup) {
                groupRegex.lastIndex = 0;
                while ((match = groupRegex.exec(text)) !== null) {
                    const groupId = match[1].trim();
                    const sender = match[2].trim();
                    const msgType = match[3].trim();
                    const content = match[4];

                    //  过滤模板消息：如果内容仅为"内容"或"消息内容"，跳过
                    if (content.trim() === '内容' || content.trim() === '消息内容') {
                        continue;
                    }

                    if (String(groupId) === String(contactId)) {
                        const messageKey = `${sender}|${msgType}|${content}`;

                        if (!messageSet.has(messageKey)) {
                            messageSet.add(messageKey);
                            messages.push({
                                isMine: sender === '我',
                                sender: sender,
                                type: msgType,
                                content: content,
                                time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                            });
                        }
                    }
                }

                myGroupRegex.lastIndex = 0;
                while ((match = myGroupRegex.exec(text)) !== null) {
                    const groupId = match[1].trim();
                    const msgType = match[2].trim();
                    const content = match[3];

                    //  过滤模板消息：如果内容仅为"内容"或"消息内容"，跳过
                    if (content.trim() === '内容' || content.trim() === '消息内容') {
                        continue;
                    }

                    if (String(groupId) === String(contactId)) {
                        const messageKey = `我|${msgType}|${content}`;

                        if (!messageSet.has(messageKey)) {
                            messageSet.add(messageKey);
                            messages.push({
                                isMine: true,
                                sender: '我',
                                type: msgType,
                                content: content,
                                time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                            });
                        }
                    }
                }
            } else {
                while ((match = privateRegex.exec(text)) !== null) {
                    const type = match[1];
                    const sender = match[2].trim();
                    const number = match[3].trim();
                    const msgType = match[4].trim();
                    const content = match[5];

                    //  过滤模板消息：如果内容仅为"内容"或"消息内容"，跳过
                    if (content.trim() === '内容' || content.trim() === '消息内容') {
                        continue;
                    }


                    //  使用 String() 转换确保类型一致
                    if (String(number) === String(contactId)) {
                        // 创建消息唯一标识，用于去重
                        const isMine = type === '我方消息';
                        const senderName = isMine ? '我' : sender;
                        const messageKey = `${isMine}|${senderName}|${msgType}|${content}`;

                        if (!messageSet.has(messageKey)) {
                            messageSet.add(messageKey);
                            messages.push({
                                isMine: isMine,
                                sender: senderName,
                                type: msgType,
                                content: content,
                                time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                            });
                        } else {
                        }
                    }
                }
            }
        });

    } catch (error) {
    }

    return messages;
}

// 全局变量：聊天界面轮询定时器
let chatPanelRefreshInterval = null;
let currentChatContactId = null;
let currentChatContactName = null;
let currentChatIsGroup = false;

/**
 * 打开聊天界面
 */
function openChatPanel(contactId, contactName, isGroup = false, members = '') {

    // 保存当前聊天信息（用于恢复定时器）
    currentChatContactId = contactId;
    currentChatContactName = contactName;
    currentChatIsGroup = isGroup;

    // 设置当前聊天对象
    window.messageSender.setCurrentChat(contactId, contactName, isGroup);

    // 更新聊天标题（群聊显示成员列表）
    let title = isGroup ? `👥 ${contactName}` : `💬 ${contactName}`;

    //  如果是群聊，显示成员信息
    if (isGroup && members) {
        const memberCount = members.split(/[、,，]/).filter(m => m.trim()).length;
        title += ` (${memberCount}人)`;
        $('#chat-title').html(`
            <div style="display: flex; align-items: center; justify-content: center; flex-direction: column;">
                <div style="font-size: 16px; font-weight: 600;">${title}</div>
                <div style="font-size: 11px; opacity: 0.7; margin-top: 2px;">${members}</div>
            </div>
        `);
    } else {
        $('#chat-title').text(title);
    }

    //  在聊天标题栏右侧添加删除按钮（仅群聊）
    const $rightActions = $('#chat-right-actions');

    if (isGroup) {
        // 添加删除按钮到右上角
        $rightActions.html(`
            <button class="chat-delete-group-btn" data-group-id="${contactId}" data-group-name="${contactName}" 
                    style="background: none; border: none; color: #ef4444; font-size: 22px; 
                           cursor: pointer; padding: 0; width: 36px; height: 36px; display: flex; 
                           align-items: center; justify-content: center; transition: transform 0.2s;"
                    onmouseover="this.style.transform='scale(1.1)'" 
                    onmouseout="this.style.transform='scale(1)'">
                
            </button>
        `);
    } else {
        // 私聊时清空右侧区域
        $rightActions.html('');
    }

    // 渲染消息列表
    renderChatMessages(contactId, isGroup);

    // 显示聊天面板
    $('#phone-chat-panel').addClass('active');

    // 清空输入框
    $('#chat-input').val('');

    //  启动自动刷新（每1000ms轮询一次）
    if (chatPanelRefreshInterval) {
        clearInterval(chatPanelRefreshInterval);
    }
    chatPanelRefreshInterval = setInterval(() => {
        //  检查手机界面是否打开
        const $mobileOverlay = $('#mobile-phone-overlay');
        const isMobileOpen = $mobileOverlay.hasClass('active');

        //  检查聊天面板是否打开
        const $chatPanel = $('#phone-chat-panel');
        const isChatOpen = $chatPanel.hasClass('active');

        // 只有手机界面和聊天界面都打开时才刷新
        // 不再在这里停止定时器，让它持续运行，只在需要时才刷新
        if (isMobileOpen && isChatOpen) {
            renderChatMessages(contactId, isGroup);
        }
        // 如果界面关闭，什么都不做，继续等待下一次检查
    }, 1000);
}

/**
 * 关闭聊天界面
 */
function closeChatPanel() {
    $('#phone-chat-panel').removeClass('active');
    window.messageSender.clearCurrentChat();

    //  不清除 currentChatContactId 等变量，保留用于重新打开手机时的状态恢复
    //  只清除定时器，因为聊天面板已经关闭

    //  停止自动刷新
    if (chatPanelRefreshInterval) {
        clearInterval(chatPanelRefreshInterval);
        chatPanelRefreshInterval = null;
    }
}

/**
 * 渲染聊天消息
 */
function renderChatMessages(contactId, isGroup = false) {
    console.log('[renderChatMessages] 刷新聊天消息:', contactId, '群聊:', isGroup);
    const messages = extractMessagesForContact(contactId, isGroup);
    const $container = $('#chat-messages');

    // 如果没有消息，显示空白（不显示默认消息）
    if (messages.length === 0) {
        $container.html('');
        return;
    }

    let html = '';
    messages.forEach(msg => {
        const messageClass = msg.isMine ? 'mine' : 'other';

        // 获取发送者头像（仅对非自己的消息）
        let avatarHtml = '';
        if (!msg.isMine) {
            const senderName = msg.sender || contactId;
            const avatarUrl = getCharacterAvatar(senderName);
            if (avatarUrl) {
                avatarHtml = `<img src="${avatarUrl}" style="width: 36px; height: 36px; border-radius: 8px; object-fit: cover; flex-shrink: 0;" onerror="this.style.display='none'">`;
            } else {
                // 无头像时显示首字母
                const initial = senderName ? senderName.charAt(0) : '?';
                avatarHtml = `<div style="width: 36px; height: 36px; border-radius: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px; flex-shrink: 0;">${initial}</div>`;
            }
        }

        //  群聊消息显示发送者名称
        let senderInfo = '';
        if (isGroup) {
            // 群聊中，所有消息都显示发送者
            const senderName = msg.isMine ? '我' : msg.sender;
            const senderColor = msg.isMine ? '#4CAF50' : '#2196F3';
            senderInfo = `<div class="message-sender" style="font-size: 11px; font-weight: 600; color: ${senderColor}; margin-bottom: 4px;">${senderName}</div>`;
        }

        const typeInfo = msg.type !== '文字' ? `<div style="font-size: 11px; opacity: 0.8; margin-bottom: 3px;">[${msg.type}]</div>` : '';

        //  处理消息中的图片标签
        const processedContent = processMessageImages(msg.content);

        // 根据是否是自己的消息决定布局
        if (msg.isMine) {
            html += `
                <div class="message-item ${messageClass}">
                    <div class="message-bubble">
                        ${senderInfo}
                        ${typeInfo}
                        <div>${processedContent}</div>
                        <div class="message-time">${msg.time}</div>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="message-item ${messageClass}" style="display: flex; align-items: flex-start; gap: 8px;">
                    ${avatarHtml}
                    <div class="message-bubble">
                        ${senderInfo}
                        ${typeInfo}
                        <div>${processedContent}</div>
                        <div class="message-time">${msg.time}</div>
                    </div>
                </div>
            `;
        }
    });

    $container.html(html);

    //  已移除自动滚动到底部的功能，允许用户查看历史聊天记录
    // setTimeout(() => {
    //     $container.scrollTop($container[0].scrollHeight);
    // }, 100);
}

