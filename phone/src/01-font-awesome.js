// ==================== 手机界面状态栏 ====================
// ==================== 加载 Font Awesome（安全方式）====================
function loadFontAwesome() {
    // 检查是否已经加载
    if ($('link[href*="font-awesome"]').length > 0 || $('link[href*="fontawesome"]').length > 0) {
        return;
    }

    // 通过 link 标签加载（异步，不会阻塞渲染）
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
}

