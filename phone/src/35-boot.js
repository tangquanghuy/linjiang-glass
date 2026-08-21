// ==================== 启动 ====================
$(() => {
    // 等待依赖加载后再初始化手机界面
    (async () => {
        const MAX_WAIT_TIME = 30000;
        const CHECK_INTERVAL = 100;
        const startTime = Date.now();

        try {
            // 等待 waitGlobalInitialized 函数可用
            while (typeof waitGlobalInitialized !== 'function') {
                if (Date.now() - startTime > MAX_WAIT_TIME) {
                    console.error('[手机界面] 等待 waitGlobalInitialized 超时，尝试直接初始化');
                    initializeMobilePhone();
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
            }

            // 等待 Mvu 初始化完成
            await waitGlobalInitialized('Mvu');
            initializeMobilePhone();
        } catch (e) {
            console.error('[手机界面] 初始化失败:', e);
            // 即使出错也尝试初始化基本功能
            try {
                initializeMobilePhone();
            } catch (e2) {
                console.error('[手机界面] 备用初始化也失败:', e2);
            }
        }
    })();
});

// ESC键关闭手机或全屏查看器
$(document).on('keydown', function (e) {
    if (e.key === 'Escape') {
        // 优先关闭全屏壁纸查看器
        const $viewer = $('#wallpaper-fullscreen-viewer');
        if ($viewer.hasClass('active')) {
            closeWallpaperFullscreen();
            return;
        }

        // 然后关闭手机界面（如果未置顶）
        const overlay = $('#mobile-phone-overlay');
        if (overlay.hasClass('active') && !isPinned) {
            closeMobilePhone();
        }
    }
});

// 卸载时清理
$(window).on('unload', () => {
    cleanupMobilePhone();
});


