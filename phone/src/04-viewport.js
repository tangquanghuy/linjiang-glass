// ==================== 边界限制工具函数 ====================
// clamp 函数：将值限制在 min 和 max 之间
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// 获取可靠的视口尺寸（支持 iframe 和各种环境）
function getViewportSize() {
    // 优先使用 visualViewport（更准确，支持缩放）
    if (window.visualViewport) {
        const vv = window.visualViewport;
        if (vv.width > 0 && vv.height > 0) {
            return { width: vv.width, height: vv.height };
        }
    }

    // 回退到 innerWidth/innerHeight
    let w = window.innerWidth || document.documentElement.clientWidth || 0;
    let h = window.innerHeight || document.documentElement.clientHeight || 0;

    // iframe 中尝试父窗口
    if ((w === 0 || h === 0) && window.parent !== window) {
        try {
            const pw = window.parent.innerWidth || window.parent.document.documentElement.clientWidth;
            const ph = window.parent.innerHeight || window.parent.document.documentElement.clientHeight;
            if (pw > 0) w = pw;
            if (ph > 0) h = ph;
        } catch (e) {
            // 跨域无法访问父窗口
        }
    }

    // 最终回退到默认值（避免返回 0）
    return {
        width: w > 0 ? w : 800,
        height: h > 0 ? h : 600
    };
}

// 完全限制在视口内（不允许任何部分超出）
function constrainFullyInViewport(x, y, elementWidth, elementHeight) {
    const viewport = getViewportSize();

    const boundedX = clamp(x, 0, viewport.width - elementWidth);
    const boundedY = clamp(y, 0, viewport.height - elementHeight);

    return { x: boundedX, y: boundedY };
}

