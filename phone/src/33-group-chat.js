// ==================== 群聊管理功能 ====================
/**
 * 移除thinking标签包裹的内容
 * 参考 mobile-master/app/message-app.js
 */
function removeThinkingTags(text) {
    if (!text || typeof text !== 'string') {
        return text;
    }

    // 移除 <think>...</think> 和 <thinking>...</thinking> 标签及其内容
    const thinkingTagRegex = /<think>[\s\S]*?<\/think>|<thinking>[\s\S]*?<\/thinking>/gi;
    return text.replace(thinkingTagRegex, '');
}

/**
 * 检查格式标记是否在thinking标签内
 * 参考 mobile-master/app/message-app.js
 */
function isPatternInsideThinkingTags(text, patternStart, patternEnd) {
    if (!text || typeof text !== 'string') {
        return false;
    }

    const thinkingTagRegex = /<think>[\s\S]*?<\/think>|<thinking>[\s\S]*?<\/thinking>/gi;
    let match;

    while ((match = thinkingTagRegex.exec(text)) !== null) {
        const thinkStart = match.index;
        const thinkEnd = match.index + match[0].length;

        // 检查格式标记是否完全在thinking标签内
        if (patternStart >= thinkStart && patternEnd <= thinkEnd) {
            return true;
        }
    }

    return false;
}

/**
 * 只移除不在thinking标签内的格式标记
 * 参考 mobile-master/app/message-app.js
 */
function removePatternOutsideThinkingTags(text, pattern) {
    if (!text || typeof text !== 'string') {
        return text;
    }

    // 创建新的正则表达式实例，避免lastIndex问题
    const newPattern = new RegExp(pattern.source, pattern.flags);
    let result = text;
    const replacements = [];
    let match;

    // 找到所有匹配
    while ((match = newPattern.exec(text)) !== null) {
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;

        // 检查这个匹配是否在thinking标签内
        if (!isPatternInsideThinkingTags(text, matchStart, matchEnd)) {
            replacements.push({
                start: matchStart,
                end: matchEnd,
                text: match[0]
            });
        }
    }

    // 从后往前替换，避免索引问题
    replacements.reverse().forEach(replacement => {
        result = result.substring(0, replacement.start) + result.substring(replacement.end);
    });

    return result;
}

/**
 * 删除群聊
 * 完整参考 mobile-master/app/message-app.js 的实现
 * @param {string} groupId - 群聊ID
 * @param {string} groupName - 群聊名称
 */
async function deleteGroup(groupId, groupName) {

    const confirmed = await showCustomConfirm({
        title: '删除群聊',
        message: '这会删除消息中的群聊格式标记和相关的消息记录。',
        icon: '',
        itemInfo: {
            name: groupName,
            description: `群聊 ID: ${groupId}`,
            icon: '🎁'
        },
        confirmText: '确认删除',
        cancelText: '取消'
    });

    if (!confirmed) {
        return;
    }

    try {
        const targetWindow = window.parent || window;

        // 检查 SillyTavern API
        if (!targetWindow.SillyTavern || typeof targetWindow.SillyTavern.getContext !== 'function') {
            throw new Error('SillyTavern API 不可用');
        }

        const context = targetWindow.SillyTavern.getContext();
        if (!context || !context.chat || !Array.isArray(context.chat)) {
            throw new Error('聊天上下文不可用');
        }

        if (typeof toastr !== 'undefined') {
            toastr.info('正在查找相关群聊消息...');
        }


        // 查找包含该群聊信息的消息
        const messagesToProcess = [];

        // 创建所有可能包含群聊ID的格式正则表达式
        // 只要[]内任何位置包含目标ID就匹配
        const allGroupFormatsRegex = new RegExp(`\\[[^\\]]*\\|${groupId}\\|[^\\]]*\\]|\\[[^\\]]*\\|${groupId}\\]`, 'g');

        context.chat.forEach((message, index) => {
            if (message.mes && typeof message.mes === 'string') {
                let messageModified = false;
                let newMessageContent = message.mes;

                // 预处理：移除thinking标签包裹的内容进行检测
                const messageForCheck = removeThinkingTags(message.mes);

                // 检查是否包含群聊格式标记（在移除thinking标签后的内容中）
                allGroupFormatsRegex.lastIndex = 0;
                if (allGroupFormatsRegex.test(messageForCheck)) {
                    // 只移除不在thinking标签内的群聊格式标记
                    newMessageContent = removePatternOutsideThinkingTags(message.mes, allGroupFormatsRegex);
                    messageModified = newMessageContent !== message.mes;
                    if (messageModified) {
                    }
                }

                if (messageModified) {
                    messagesToProcess.push({
                        index: index,
                        id: message.id || index,
                        action: newMessageContent.trim().length > 0 ? 'modify' : 'delete',
                        reason: '移除群聊格式标记',
                        originalContent: message.mes,
                        newContent: newMessageContent.trim(),
                        preview: message.mes.length > 50 ? message.mes.substring(0, 50) + '...' : message.mes
                    });
                }

                // 重置正则表达式
                allGroupFormatsRegex.lastIndex = 0;
            }
        });

        if (messagesToProcess.length === 0) {
            if (typeof toastr !== 'undefined') {
                toastr.warning('未找到相关群聊记录');
            }
            return;
        }

        if (typeof toastr !== 'undefined') {
            toastr.info(`找到 ${messagesToProcess.length} 条相关消息，正在处理...`);
        }

        // 从后往前处理，避免索引变化
        const sortedMessages = messagesToProcess.sort((a, b) => b.index - a.index);
        let processedCount = 0;

        for (const msgInfo of sortedMessages) {
            try {
                if (msgInfo.action === 'delete') {
                    // 直接从数组中删除
                    context.chat.splice(msgInfo.index, 1);
                } else if (msgInfo.action === 'modify') {
                    // 修改消息内容
                    context.chat[msgInfo.index].mes = msgInfo.newContent;
                }
                processedCount++;
            } catch (error) {
            }
        }

        // 保存聊天
        if (typeof context.saveChat === 'function') {
            await context.saveChat();
        }

        if (processedCount > 0) {
            if (typeof toastr !== 'undefined') {
                toastr.success(`成功处理群聊 "${groupName}" 相关的 ${processedCount} 条消息`);
            }

            // 关闭聊天面板并刷新消息列表
            closeChatPanel();

            setTimeout(() => {
                if (currentPhoneData) {
                    const content = generateMessagesPanel(currentPhoneData);
                    $('#phone-app-body').html(content);
                }
            }, 500);
        } else {
            if (typeof toastr !== 'undefined') {
                toastr.error('处理失败');
            }
        }

    } catch (error) {
        if (typeof toastr !== 'undefined') {
            toastr.error('删除群聊失败: ' + error.message);
        }
    }
}

/**
 * 打开创建群聊面板
 * 参考 mobile-master/app/message-app.js
 */
function openCreateGroupPanel() {

    const content = generateCreateGroupPanel();

    // 更新面板标题和内容
    $('#phone-app-title').text(' 创建群聊');
    $('#phone-app-body').html(content);
    $('#phone-detail-panel').addClass('active');

    // 保存当前面板状态
    currentPanel = 'create-group';

    // 绑定事件
    bindCreateGroupEvents();
}

/**
 * 生成创建群聊面板内容
 */
function generateCreateGroupPanel() {
    // 获取所有好友用于选择
    const availableFriends = getAvailableFriendsForGroup();

    return `
        <div class="create-group-container" style="padding: 16px;">
            <!-- 群聊名称 -->
            <div class="form-group" style="margin-bottom: 16px;">
                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #374151;">
                    <span style="color: #ef4444;">*</span> 群聊名称
                </label>
                <input type="text" id="group-name-input" placeholder="请输入群聊名称" 
                    style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 14px; outline: none; transition: all 0.2s; background: #ffffff; color: #1f2937;"
                    onfocus="this.style.borderColor='#667eea'; this.style.background='#ffffff'" onblur="this.style.borderColor='#e5e7eb'">
            </div>
            
            <!-- 群聊ID -->
            <div class="form-group" style="margin-bottom: 16px;">
                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #374151;">
                    <span style="color: #ef4444;">*</span> 群聊ID
                </label>
                <input type="number" id="group-id-input" placeholder="请输入群聊ID（6位数字）" 
                    style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 14px; outline: none; transition: all 0.2s; background: #ffffff; color: #1f2937;"
                    onfocus="this.style.borderColor='#667eea'; this.style.background='#ffffff'" onblur="this.style.borderColor='#e5e7eb'">
            </div>
            
            <!-- 成员选择 -->
            <div class="form-group" style="margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label style="font-size: 13px; font-weight: 600; color: #374151;">
                        <span style="color: #ef4444;">*</span> 选择成员
                    </label>
                    <button id="select-all-friends-btn" 
                        style="padding: 4px 12px; background: #f3f4f6; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; color: #6b7280; font-weight: 500;"
                        onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f3f4f6'">
                        全选
                    </button>
                </div>
                <div id="friends-selection-list" style="max-height: 200px; overflow-y: auto; border: 2px solid #e5e7eb; border-radius: 8px; padding: 8px;">
                    ${availableFriends.length > 0 ? generateFriendsSelectionList(availableFriends) : '<div style="text-align: center; padding: 20px; color: #9ca3af;">暂无可选好友</div>'}
                </div>
            </div>
            
            <!-- 已选成员 -->
            <div class="form-group" style="margin-bottom: 20px;">
                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #374151;">
                    已选成员
                </label>
                <div id="selected-members-container" style="display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; background: #f9fafb; border-radius: 8px; min-height: 60px;">
                    <div class="selected-member-tag" data-member="我" style="display: inline-flex; align-items: center; padding: 6px 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 16px; font-size: 13px; font-weight: 500;">
                        <span>我 (群主)</span>
                    </div>
                </div>
            </div>
            
            <!-- 创建按钮 -->
            <button id="create-group-submit-btn" 
                style="width: 100%; padding: 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);"
                onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 12px rgba(102, 126, 234, 0.4)'"
                onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 6px rgba(102, 126, 234, 0.3)'">
                <span style="font-size: 16px; margin-right: 6px;"></span> 创建群聊
            </button>
            
            <!-- 提示信息 -->
            <div style="margin-top: 16px; padding: 12px; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px;">
                <div style="font-size: 12px; color: #1e40af; line-height: 1.6;">
                    <div style="margin-bottom: 6px;"> <strong>提示：</strong></div>
                    <div>• 创建后会自动编辑到最新楼层</div>
                    <div>• 格式：[群聊|群名|群ID|成员列表]</div>
                    <div>• 至少选择一个成员</div>
                </div>
            </div>
        </div>
    `;
}

/**
 * 获取可选好友列表
 */
function getAvailableFriendsForGroup() {
    const friends = [];

    try {
        // 从MVU变量中获取好友
        const relationshipSource = getRelationshipDataSource(currentPhoneData);
        if (relationshipSource) {
            getRelationshipKeys(relationshipSource).forEach(studentKey => {
                const friend = relationshipSource[studentKey];
                if (!friend || typeof friend !== 'object') return;
                const displayName = restoreEraText(studentKey);
                friends.push({
                    id: `friend_${studentKey}`,
                    name: displayName,
                    identity: ''
                });
            });
        }

        // 从聊天记录中提取好友
        const chatFriends = extractFriendsFromChat();
        chatFriends.forEach(chatFriend => {
            // 检查是否已存在
            const exists = friends.some(f => f.id === chatFriend.id || f.name === chatFriend.name);
            if (!exists) {
                friends.push({
                    id: chatFriend.id,
                    name: chatFriend.name,
                    identity: '聊天记录'
                });
            }
        });

    } catch (error) {
    }

    return friends;
}

/**
 * 生成好友选择列表
 */
function generateFriendsSelectionList(friends) {
    return friends.map(friend => `
        <div class="friend-selection-item" data-friend-id="${friend.id}" data-friend-name="${friend.name}"
            style="display: flex; align-items: center; padding: 8px; margin-bottom: 4px; border-radius: 6px; cursor: pointer; transition: all 0.2s;"
            onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'">
            <input type="checkbox" class="friend-checkbox" value="${friend.id}" 
                style="margin-right: 10px; width: 16px; height: 16px; cursor: pointer;">
            <div style="flex: 1;">
                <div style="font-size: 13px; font-weight: 500; color: #1f2937;">${friend.name}</div>
                <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">${friend.identity}</div>
            </div>
        </div>
    `).join('');
}

/**
 * 绑定创建群聊相关事件
 */
function bindCreateGroupEvents() {
    // 全选按钮
    $('#select-all-friends-btn').off('click').on('click', function () {
        const $checkboxes = $('.friend-checkbox');
        const allChecked = $checkboxes.toArray().every(cb => cb.checked);

        $checkboxes.prop('checked', !allChecked);
        $(this).text(allChecked ? '全选' : '取消全选');

        // 更新已选成员显示
        updateSelectedMembers();
    });

    // 好友选择
    $('.friend-checkbox').off('change').on('change', function () {
        updateSelectedMembers();
    });

    // 创建按钮
    $('#create-group-submit-btn').off('click').on('click', function () {
        createGroup();
    });

    //  移除成员按钮（使用事件委托）
    $('body').off('click.removeMember').on('click.removeMember', '.remove-member-btn', function (e) {
        e.stopPropagation();
        const friendId = $(this).data('friend-id');
        removeMember(friendId);
    });
}

/**
 * 更新已选成员显示
 */
function updateSelectedMembers() {
    const $container = $('#selected-members-container');
    const $checkboxes = $('.friend-checkbox:checked');

    // 保留"我"标签
    $container.html(`
        <div class="selected-member-tag" data-member="我" style="display: inline-flex; align-items: center; padding: 6px 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 16px; font-size: 13px; font-weight: 500;">
            <span>我 (群主)</span>
        </div>
    `);

    // 添加选中的好友
    $checkboxes.each(function () {
        const $item = $(this).closest('.friend-selection-item');
        const friendName = $item.data('friend-name');
        const friendId = $item.data('friend-id');

        $container.append(`
            <div class="selected-member-tag" data-member="${friendId}" style="display: inline-flex; align-items: center; padding: 6px 12px; background: #3b82f6; color: white; border-radius: 16px; font-size: 13px; font-weight: 500;">
                <span>${friendName}</span>
                <span class="remove-member-btn" data-friend-id="${friendId}" style="margin-left: 6px; cursor: pointer; opacity: 0.8;">✕</span>
            </div>
        `);
    });
}

/**
 * 移除已选成员
 */
function removeMember(friendId) {
    $(`.friend-checkbox[value="${friendId}"]`).prop('checked', false);

    // 更新显示
    updateSelectedMembers();
}

/**
 * 创建群聊
 */
async function createGroup() {
    const groupName = $('#group-name-input').val().trim();
    const groupId = $('#group-id-input').val().trim();
    const $checkboxes = $('.friend-checkbox:checked');

    // 验证输入
    if (!groupName) {
        if (typeof toastr !== 'undefined') {
            toastr.error('请输入群聊名称');
        }
        return;
    }

    if (!groupId || !/^\d+$/.test(groupId)) {
        if (typeof toastr !== 'undefined') {
            toastr.error('请输入有效的群聊ID（纯数字）');
        }
        return;
    }

    if ($checkboxes.length === 0) {
        if (typeof toastr !== 'undefined') {
            toastr.error('请至少选择一个群成员');
        }
        return;
    }

    // 收集成员列表
    const members = ['我']; // 群主默认在群里
    $checkboxes.each(function () {
        const $item = $(this).closest('.friend-selection-item');
        const friendName = $item.data('friend-name');
        members.push(friendName);
    });

    // 格式化群聊信息: [群聊|群名|群ID|成员列表]
    const membersStr = members.join('、');
    const groupInfo = `[群聊|${groupName}|${groupId}|${membersStr}]`;


    try {

        // 检查 SillyTavern 是否准备就绪
        const targetWindow = window.parent || window;
        if (!targetWindow.SillyTavern || typeof targetWindow.SillyTavern.getContext !== 'function') {
            throw new Error('SillyTavern API 不可用');
        }

        const context = targetWindow.SillyTavern.getContext();
        if (!context || !context.chat || !Array.isArray(context.chat)) {
            throw new Error('聊天上下文不可用');
        }


        // 构建消息对象（参考 mobile-master/context-editor.js 的 addMessage 方法）
        const message = {
            name: '系统',
            is_user: true,
            is_system: false,
            force_avatar: false,
            mes: groupInfo,
            send_date: Date.now(),
            extra: {}
        };

        // 添加到聊天数组
        context.chat.push(message);

        // 使用 SillyTavern API 添加消息
        if (typeof context.addOneMessage === 'function') {
            context.addOneMessage(message);
        }

        // 保存聊天
        if (typeof context.saveChat === 'function') {
            await context.saveChat();
        }


        if (typeof toastr !== 'undefined') {
            toastr.success(`群聊 "${groupName}" 创建成功！已添加到聊天记录`);
        }

        // 延迟关闭面板并刷新列表
        setTimeout(() => {
            closeAppPanel();
            // 刷新消息列表
            if (currentPhoneData) {
                const content = generateMessagesPanel(currentPhoneData);
                $('#phone-app-body').html(content);
            }
        }, 1000);

    } catch (error) {
        if (typeof toastr !== 'undefined') {
            toastr.error('创建群聊失败: ' + error.message);
        }
    }
}

