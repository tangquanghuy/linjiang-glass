// ==================== 实时刷新功能 ====================
/**
 * 设置消息事件监听器
 * 参考 mobile-master/app/message-app.js 的实现
 */
function setupMessageEventListener() {
    if (isEventListening) {
        console.log('[论坛自动生成] 事件监听器已存在，跳过设置');
        return;
    }


    // 多种检测方法（参考 mobile-master）
    const detectionMethods = [
        // 方法1: SillyTavern.getContext()
        () => {
            if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
                const context = window.SillyTavern.getContext();
                if (context && context.eventSource && typeof context.eventSource.on === 'function' && context.event_types) {
                    return {
                        eventSource: context.eventSource,
                        event_types: context.event_types,
                        foundIn: 'SillyTavern.getContext()'
                    };
                }
            }
            return null;
        },

        // 方法2: 全局 eventOn 函数
        () => {
            if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined' && tavern_events.MESSAGE_RECEIVED) {
                return {
                    eventSource: { on: eventOn },
                    event_types: tavern_events,
                    foundIn: 'global eventOn'
                };
            }
            return null;
        },

        // 方法3: 父窗口 eventSource
        () => {
            if (window.parent && window.parent.eventSource && typeof window.parent.eventSource.on === 'function') {
                if (window.parent.event_types && window.parent.event_types.MESSAGE_RECEIVED) {
                    return {
                        eventSource: window.parent.eventSource,
                        event_types: window.parent.event_types,
                        foundIn: 'parent.eventSource'
                    };
                }
            }
            return null;
        }
    ];

    // 尝试各种检测方法
    for (let i = 0; i < detectionMethods.length; i++) {
        try {
            const result = detectionMethods[i]();
            if (result && result.eventSource && result.event_types) {

                // 绑定消息接收事件
                if (result.event_types.MESSAGE_RECEIVED) {
                    result.eventSource.on(result.event_types.MESSAGE_RECEIVED, onMessageReceived);
                    isEventListening = true;
                    console.log('[论坛自动生成] 事件监听器绑定成功，来源:', result.foundIn);

                    // 初始化消息计数
                    updateMessageCount();

                    // 同时初始化论坛自动生成的计数器
                    if (window.phoneForumManager && window.phoneForumManager.apiConfig) {
                        window.phoneForumManager.apiConfig.resetAutoGenerateCounter();
                    }

                    return;
                }
            }
        } catch (error) {
            console.error('[论坛自动生成] 检测方法', i, '失败:', error);
        }
    }

    // 如果所有方法都失败，启动轮询作为降级方案
    console.log('[论坛自动生成] 所有事件检测方法失败，启动轮询方案');
    startRefreshPolling();
}

/**
 * 处理消息接收事件
 */
function onMessageReceived(messageId) {
    try {
        console.log('[论坛自动生成] 收到消息事件, messageId:', messageId);

        // 检查消息数量变化
        const currentCount = getCurrentMessageCount();
        console.log('[论坛自动生成] 消息数量:', { currentCount, lastMessageCount });

        if (currentCount > lastMessageCount) {
            lastMessageCount = currentCount;

            // 刷新信息面板
            refreshMessagesPanel();

            // 检查是否需要自动生成论坛
            checkAutoGenerateForum();
        }
    } catch (error) {
        console.error('[论坛自动生成] onMessageReceived错误:', error);
    }
}

/**
 * 检查并触发自动生成论坛
 */
async function checkAutoGenerateForum() {
    try {
        console.log('[论坛自动生成] 开始检查...');

        const manager = window.phoneForumManager;
        if (!manager || !manager.apiConfig) {
            console.log('[论坛自动生成] manager或apiConfig不存在');
            return;
        }

        const apiConfig = manager.apiConfig;

        // 检查是否应该自动生成
        if (!apiConfig.shouldAutoGenerate()) {
            console.log('[论坛自动生成] shouldAutoGenerate返回false，跳过');
            return;
        }

        // 增加消息计数并检查是否达到阈值
        const shouldGenerate = apiConfig.incrementMessageCount();

        if (shouldGenerate) {
            console.log('[论坛自动生成] 达到阈值，开始自动生成论坛...');

            // 设置生成状态
            apiConfig.autoGenerateState.isGenerating = true;
            isForumGenerating = true;  // 设置全局生成状态

            // 如果当前正在查看论坛面板，立即刷新显示生成中状态
            if (currentPanel === 'forum') {
                $('#phone-app-body').html(generateForumPanel());
            }

            // 显示开始生成的通知
            if (apiConfig.settings.autoGenerate.showNotification && typeof toastr !== 'undefined') {
                toastr.info(
                    `已达到 ${apiConfig.settings.autoGenerate.threshold} 楼阈值，正在自动生成论坛内容...`,
                    '📰 论坛自动生成',
                    { timeOut: 3000 }
                );
            }

            try {
                // 调用论坛生成
                await manager.generateForumContent();

                // 重置计数器
                apiConfig.resetAutoGenerateCounter();

                // 显示成功通知
                if (apiConfig.settings.autoGenerate.showNotification && typeof toastr !== 'undefined') {
                    toastr.success(
                        '论坛内容已自动更新',
                        '📰 论坛生成完成',
                        {
                            timeOut: 5000,
                            onclick: function () {
                                // 点击通知时打开论坛面板
                                if (window.openMobilePhone) {
                                    window.openMobilePhone('forum');
                                }
                            }
                        }
                    );
                }

                // 如果当前正在查看论坛面板，刷新显示
                if (currentPanel === 'forum') {
                    $('#phone-app-body').html(generateForumPanel());
                }

                console.log('[论坛自动生成] 自动生成完成');

            } catch (error) {
                console.error('[论坛自动生成] 生成失败:', error);

                if (apiConfig.settings.autoGenerate.showNotification && typeof toastr !== 'undefined') {
                    toastr.error(
                        '自动生成论坛失败: ' + (error.message || '未知错误'),
                        '📰 论坛生成失败',
                        { timeOut: 5000 }
                    );
                }
            } finally {
                // 重置生成状态
                apiConfig.autoGenerateState.isGenerating = false;
                isForumGenerating = false;  // 重置全局生成状态

                // 刷新论坛面板，恢复按钮状态
                if (currentPanel === 'forum') {
                    $('#phone-app-body').html(generateForumPanel());
                }
            }
        }
    } catch (error) {
        console.error('[论坛自动生成] 检查失败:', error);
    }
}

/**
 * 获取当前消息数量
 */
function getCurrentMessageCount() {
    try {
        // 在 iframe 环境中需要从 parent 获取 SillyTavern
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
            return context.chat ? context.chat.length : 0;
        }
    } catch (error) {
    }
    return 0;
}

/**
 * 更新消息计数
 */
function updateMessageCount() {
    lastMessageCount = getCurrentMessageCount();
}

/**
 * 刷新信息面板
 */
function refreshMessagesPanel() {
    try {
        // 只在打开信息面板时刷新
        if (currentPanel === 'messages' && currentPhoneData) {

            // 重新生成面板内容
            const content = generateMessagesPanel(currentPhoneData);
            $('#phone-app-body').html(content);

            // 重新绑定事件
            bindMessagePanelEvents();

        }
    } catch (error) {
    }
}

/**
 * 启动轮询刷新（降级方案）
 */
function startRefreshPolling() {
    // 清除旧的轮询
    if (refreshPollingInterval) {
        clearInterval(refreshPollingInterval);
    }

    console.log('[论坛自动生成] 启动轮询刷新，间隔5秒');

    refreshPollingInterval = setInterval(() => {
        const currentCount = getCurrentMessageCount();

        if (currentCount > lastMessageCount) {
            console.log('[论坛自动生成] 轮询检测到新消息:', { currentCount, lastMessageCount });
            lastMessageCount = currentCount;
            refreshMessagesPanel();

            // 检查是否需要自动生成论坛
            checkAutoGenerateForum();
        }
    }, 5000); // 每5秒检查一次
}

/**
 * 停止刷新机制
 */
function stopRefreshMechanism() {
    // 清除轮询
    if (refreshPollingInterval) {
        clearInterval(refreshPollingInterval);
        refreshPollingInterval = null;
    }

    // 清除聊天刷新
    if (chatPanelRefreshInterval) {
        clearInterval(chatPanelRefreshInterval);
        chatPanelRefreshInterval = null;
    }

    // 标记停止监听
    isEventListening = false;
}

/**
 * 绑定信息面板事件
 */
function bindMessagePanelEvents() {
    // 绑定联系人点击事件
    $('.contact-item').off('click').on('click', function () {
        const contactType = $(this).data('type');
        const contactId = $(this).data('id');
        const contactName = $(this).data('name');
        const isGroup = contactType === 'group';
        const members = $(this).data('members') || '';


        // 打开聊天面板
        openChatPanel(contactId, contactName, isGroup, members);
    });
}

