// ==================== 辅助函数：从聊天记录中提取信息 ====================
/**
 * 从SillyTavern聊天记录中提取好友信息
 */
function extractFriendsFromChat() {
    const friends = new Map();

    try {
        //  尝试获取 SillyTavern 的聊天消息（支持 iframe）
        let messages = [];
        const targetWindow = window.parent || window;

        if (targetWindow.SillyTavern && typeof targetWindow.SillyTavern.getContext === 'function') {
            const context = targetWindow.SillyTavern.getContext();
            messages = context.chat || [];
        } else {
            return friends;
        }

        messages.forEach(msg => {
            if (!msg.mes) return;
            const text = msg.mes;

            // 提取好友: [好友id|名字|号码]
            const friendRegex = /\[好友id\|([^|]+)\|(\d+)\]/g;
            let match;
            while ((match = friendRegex.exec(text)) !== null) {
                const name = match[1];
                const id = match[2];
                if (!friends.has(id)) {
                    friends.set(id, {
                        name,
                        id,
                        isGroup: false,
                        lastMessage: '',
                        time: new Date().toLocaleTimeString()
                    });
                }
            }
        });

    } catch (error) {
    }

    return friends;
}

/**
 * 从SillyTavern聊天记录中提取群聊信息
 * 参考 mobile-master/app/friend-renderer.js 的实现
 * 支持从群聊定义和群聊消息中提取
 */
function extractGroupsFromChat() {
    const groupsMap = new Map();

    try {
        //  尝试获取 SillyTavern 的聊天消息（支持 iframe）
        let messages = [];
        const targetWindow = window.parent || window;

        if (targetWindow.SillyTavern && typeof targetWindow.SillyTavern.getContext === 'function') {
            const context = targetWindow.SillyTavern.getContext();
            messages = context.chat || [];
        } else {
            return groupsMap;
        }

        // 定义正则表达式
        const groupPattern = /\[群聊\|([^|]+)\|([^|]+)\|([^\]]+)\]/g;  // [群聊|群名|群号|成员]
        const createGroupPattern = /\[创建群聊\|([^|]+)\|([^|]+)\|([^\]]+)\]/g;  // [创建群聊|群号|群名|成员]
        const groupMessagePattern = /\[群聊消息\|([^|]+)\|([^|]+)\|([^|]+)\|([^\]]+)\]/g;  // [群聊消息|群ID|发送者|类型|内容]
        const myGroupMessagePattern = /\[我方群聊消息\|我\|([^|]+)\|([^|]+)\|([^\]]+)\]/g;  // [我方群聊消息|我|群ID|类型|内容]


        messages.forEach((msg, index) => {
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

            // 如果消息包含群聊相关内容，记录日志
            // if (text.includes('[群聊') || text.includes('[创建群聊')) {
            // }

            // 1. 提取群聊定义格式: [群聊|群名|群号|成员]
            let match;
            groupPattern.lastIndex = 0; //  重置正则索引
            while ((match = groupPattern.exec(text)) !== null) {
                const groupName = match[1];
                const groupId = match[2];
                const groupMembers = match[3];
                const groupKey = `group_${groupId}`; // 使用群ID作为唯一标识

                if (!groupsMap.has(groupKey)) {
                    groupsMap.set(groupKey, {
                        name: groupName,
                        id: groupId,
                        isGroup: true,
                        members: groupMembers,
                        memberCount: groupMembers.split(/[、,，]/).filter(m => m.trim()).length,
                        messageIndex: index,
                        lastMessage: '',
                        time: msg.send_date || Date.now()
                    });
                }
            }

            // 2. 提取创建群聊格式: [创建群聊|群号|群名|成员]
            createGroupPattern.lastIndex = 0;
            while ((match = createGroupPattern.exec(text)) !== null) {
                const groupId = match[1];
                const groupName = match[2];
                const groupMembers = match[3];
                const groupKey = `group_${groupId}`;

                if (!groupsMap.has(groupKey)) {
                    groupsMap.set(groupKey, {
                        name: groupName,
                        id: groupId,
                        isGroup: true,
                        members: groupMembers,
                        memberCount: groupMembers.split(/[、,，]/).filter(m => m.trim()).length,
                        messageIndex: index,
                        lastMessage: '',
                        time: msg.send_date || Date.now()
                    });
                }
            }

            // 3. 从群聊消息中提取: [群聊消息|群ID|发送者|类型|内容]
            groupMessagePattern.lastIndex = 0;
            while ((match = groupMessagePattern.exec(text)) !== null) {
                const groupId = match[1];
                const senderName = match[2];
                const messageType = match[3];
                const messageContent = match[4];
                const groupKey = `group_${groupId}`;

                if (!groupsMap.has(groupKey)) {
                    // 如果群聊不存在，创建一个基于消息的群聊记录
                    groupsMap.set(groupKey, {
                        name: `群聊${groupId}`,
                        id: groupId,
                        isGroup: true,
                        members: senderName,
                        memberCount: 1,
                        messageIndex: index,
                        lastMessage: messageContent.substring(0, 20),
                        time: msg.send_date || Date.now()
                    });
                } else {
                    // 如果已存在，更新成员列表和最新消息索引
                    const existingGroup = groupsMap.get(groupKey);
                    if (existingGroup.members && !existingGroup.members.includes(senderName)) {
                        existingGroup.members += `、${senderName}`;
                        existingGroup.memberCount = existingGroup.members.split(/[、,，]/).filter(m => m.trim()).length;
                    }
                    if (existingGroup.messageIndex < index) {
                        existingGroup.messageIndex = index;
                        existingGroup.lastMessage = messageContent.substring(0, 20);
                        existingGroup.time = msg.send_date || Date.now();
                    }
                }
            }

            // 4. 从我方群聊消息中提取: [我方群聊消息|我|群ID|类型|内容]
            myGroupMessagePattern.lastIndex = 0;
            while ((match = myGroupMessagePattern.exec(text)) !== null) {
                const groupId = match[1];
                const messageType = match[2];
                const messageContent = match[3];
                const groupKey = `group_${groupId}`;

                if (!groupsMap.has(groupKey)) {
                    // 如果群聊不存在，创建一个基于消息的群聊记录
                    groupsMap.set(groupKey, {
                        name: `群聊${groupId}`,
                        id: groupId,
                        isGroup: true,
                        members: '我',
                        memberCount: 1,
                        messageIndex: index,
                        lastMessage: messageContent.substring(0, 20),
                        time: msg.send_date || Date.now()
                    });
                } else {
                    // 如果已存在，更新最新消息索引
                    const existingGroup = groupsMap.get(groupKey);
                    if (!existingGroup.members.includes('我')) {
                        existingGroup.members += '、我';
                        existingGroup.memberCount = existingGroup.members.split(/[、,，]/).filter(m => m.trim()).length;
                    }
                    if (existingGroup.messageIndex < index) {
                        existingGroup.messageIndex = index;
                        existingGroup.lastMessage = messageContent.substring(0, 20);
                        existingGroup.time = msg.send_date || Date.now();
                    }
                }
            }
        });

        if (groupsMap.size > 0) {
            groupsMap.forEach((group, key) => {
            });
        } else {
        }
    } catch (error) {
    }

    return groupsMap;
}

