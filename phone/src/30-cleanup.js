// ==================== 清理函数 ====================
function cleanupMobilePhone() {
    //  移除窗口resize监听
    $(window).off('resize.mobilePhone');

    // 移除手机界面拖动事件监听（原生事件）
    const dragHandle = document.getElementById('phone-drag-handle');
    if (dragHandle) {
        dragHandle.removeEventListener('pointerdown', handlePhoneDragStart);
        dragHandle.removeEventListener('pointermove', handlePhoneDragMove);
        dragHandle.removeEventListener('pointerup', handlePhoneDragEnd);
        dragHandle.removeEventListener('pointercancel', handlePhoneDragEnd);
    }

    // 重置拖动状态
    isPhoneDragging = false;

    // 重置置顶状态
    isPinned = false;

    $('#mobile-phone-overlay').remove();
    $('#mobile-phone-styles').remove();
}

