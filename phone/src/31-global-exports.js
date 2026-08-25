// ==================== 全局函数暴露 ====================
if (typeof window !== 'undefined') {
    window.initializeMobilePhone = initializeMobilePhone;
    window.cleanupMobilePhone = cleanupMobilePhone;
    window.openMobilePhone = openMobilePhone;
    window.closeMobilePhone = closeMobilePhone;
    const phoneLauncher = () => {
        if ($('#mobile-phone-overlay').length) {
            openMobilePhone();
            return;
        }
        let tries = 0;
        const timer = setInterval(() => {
            tries += 1;
            if ($('#mobile-phone-overlay').length) {
                clearInterval(timer);
                openMobilePhone();
            } else if (tries >= 100) {
                clearInterval(timer);
            }
        }, 50);
    };
    const exposePhoneLauncher = (target) => {
        try {
            if (target) target.__linjiangOpenMobilePhone = phoneLauncher;
        } catch (e) { }
    };
    exposePhoneLauncher(window);
    exposePhoneLauncher(window.parent);
    exposePhoneLauncher(window.top);

    /* 玻璃状态栏代替悬浮球唤起手机，而它跑在酒馆里另一个 iframe（外部部署/V20260826/状态栏.html）。
       上面那三次 exposePhoneLauncher 是「同源才成立」的路：只要本脚本所在的框架跟酒馆顶层
       之间有一层跨源/沙箱，赋值就会抛异常被 catch 吞掉，壳层于是在 window / parent / top
       上一个启动函数都找不到 —— 表现就是点了手机钮什么都不发生（HUD 那边 8 秒后一条
       `bridge timeout: openPhone`）。

       所以再留一条不依赖同源的路：postMessage。谁都能给我们发信，收到唤起请求就照常走
       phoneLauncher（逻辑一点没改，跟当年悬浮球点下去是同一条），然后回一个 ack，让壳层
       知道这次唤起有人接了、不用再报错。 */
    const PHONE_CHANNEL = 'linjiang-phone';
    window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || data.channel !== PHONE_CHANNEL || data.type !== 'open') return;
        try {
            phoneLauncher();
        } catch (e) {
            console.warn('[手机界面] 唤起失败', e);
            return;
        }
        try {
            event.source?.postMessage({ channel: PHONE_CHANNEL, type: 'opened', id: data.id }, '*');
        } catch (e) { }
    });

    window.togglePin = togglePin;

    // 壁纸相关函数
    window.toggleWallpaperCategory = toggleWallpaperCategory;
    window.setWallpaper = setWallpaper;
    window.resetWallpaper = resetWallpaper;
    window.uploadCustomWallpaper = uploadCustomWallpaper;
    window.openWallpaperFullscreen = openWallpaperFullscreen;
    window.closeWallpaperFullscreen = closeWallpaperFullscreen;

    // 聊天相关函数
    window.openChatPanel = openChatPanel;
    window.closeChatPanel = closeChatPanel;
    window.renderChatMessages = renderChatMessages;
    window.sendChatMessage = sendChatMessage;

    // 图片处理函数
    window.viewFullImage = viewFullImage;
    window.processMessageImages = processMessageImages;

    // 论坛相关函数
    window.phoneGenerateForum = async function () {
        const manager = window.phoneForumManager;

        if (!manager) {
            alert('论坛管理器未初始化，请刷新页面重试');
            return;
        }

        //  设置生成状态标记
        isForumGenerating = true;

        // 显示加载状态
        const $generateBtn = $('.phone-forum-generate-btn');
        const originalBtnHtml = $generateBtn.html();

        // 更新按钮为沙漏样式
        $generateBtn.prop('disabled', true);
        $generateBtn.html('<i class="fas fa-hourglass-half fa-spin"></i>');
        $generateBtn.css({
            'background': '#9E9E9E',
            'cursor': 'not-allowed'
        });

        // 在标题左侧添加"正在刷新中"提示
        const $titleContainer = $('.phone-forum-generate-btn').parent().prev();
        $titleContainer.find('.forum-loading-tip').remove(); // 移除旧的提示
        $titleContainer.append('<span class="forum-loading-tip" style="font-size: 12px; color: #FF9800; white-space: nowrap;"><i class="fas fa-hourglass-half fa-spin"></i> 正在刷新中</span>');

        if (typeof toastr !== 'undefined') {
            toastr.info('正在生成论坛内容...', '论坛');
        }

        try {
            await manager.generateForumContent();

            //  检查手机界面是否还打开着（用户可能在生成过程中关闭了界面）
            const $overlay = $('#mobile-phone-overlay');
            const isPhoneOpen = $overlay.hasClass('active');

            //  清除生成状态标记
            isForumGenerating = false;

            if (!isPhoneOpen) {
                return;
            }

            //  检查当前是否还在论坛面板（用户可能切换到其他应用）
            if (currentPanel !== 'forum') {
                return;
            }

            $('#phone-app-body').html(generateForumPanel());

            if (typeof toastr !== 'undefined') {
                toastr.success('论坛内容已更新！', '论坛');
            }
        } catch (error) {

            //  清除生成状态标记
            isForumGenerating = false;

            //  检查手机界面是否还打开着
            const $overlay = $('#mobile-phone-overlay');
            const isPhoneOpen = $overlay.hasClass('active');

            if (!isPhoneOpen) {
                return;
            }

            // 恢复按钮状态（只有在手机界面还打开时才恢复）
            const $btn = $('.phone-forum-generate-btn');
            $btn.prop('disabled', false);
            $btn.html(originalBtnHtml);
            $btn.css({
                'background': '#4CAF50',
                'cursor': 'pointer'
            });

            // 移除加载提示
            $('.forum-loading-tip').remove();

            if (typeof toastr !== 'undefined') {
                const errorMessage = error?.message || String(error) || '未知错误';
                const errorMsg = errorMessage.length > 200 ? errorMessage.substring(0, 200) + '...' : errorMessage;
                toastr.error(errorMsg, '论坛生成失败', {
                    timeOut: 10000,
                    extendedTimeOut: 5000,
                    closeButton: true,
                    progressBar: true
                });
            } else {
                alert('论坛生成失败:\n' + (error?.message || String(error) || '未知错误'));
            }
        }
    };

    window.resetPanelMemory = function () {
        localStorage.removeItem('mobile-last-panel');
        if (typeof toastr !== 'undefined') {
            toastr.success('已清除面板记忆');
        }
    };
    window.fixMobilePhone = function () {
        // 清理并重新初始化
        cleanupMobilePhone();
        setTimeout(() => {
            initializeMobilePhone();
        }, 100);
    };

    //  调试工具：测试群聊消息解析
    window.testGroupMessageParsing = function (testMessages) {

        const regex = /\[群聊消息\|([^|]*)\|([^|]*)\|([^|]*)\|([^\]]*)\]/g;

        const messages = testMessages || [
            '[群聊消息|745816|夏目|文字|汪！]',
            '[群聊消息|745816|夏目|语音|（一段急促又欢快的犬吠，还夹杂着兴奋的呜咽声）]',
            '[群聊消息|745816|夏目|文字|要！！夏目要吃！]',
            '[群聊消息|745816|白团|文字|。]'
        ];

        messages.forEach((text, i) => {
            regex.lastIndex = 0;
            const match = regex.exec(text);
            if (match) {
            } else {
            }
        });
    };

}

