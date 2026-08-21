/**
 * 自定义确认弹窗
 * @param {Object} options - 弹窗配置
 * @param {string} options.title - 标题
 * @param {string} options.message - 消息内容
 * @param {string} options.icon - 图标emoji
 * @param {Object} options.itemInfo - 商品详细信息（可选）
 * @param {string} options.confirmText - 确认按钮文字
 * @param {string} options.cancelText - 取消按钮文字
 * @returns {Promise<boolean>} - 用户选择结果
 */
function showCustomConfirm(options = {}) {

    return new Promise((resolve) => {
        const {
            title = '确认操作',
            message = '确定要继续吗？',
            icon = '❓',
            itemInfo = null,
            confirmText = '确认',
            cancelText = '取消'
        } = options;


        // 构建商品信息HTML（带内联样式）
        let itemInfoHtml = '';
        if (itemInfo) {
            itemInfoHtml = `
                <div class="confirm-item-info" style="background:rgba(102,126,234,0.1);border:1px solid rgba(102,126,234,0.3);border-radius:12px;padding:16px;margin-bottom:24px;display:block;width:100%;box-sizing:border-box;">
                    <div class="confirm-item-name" style="display:block;width:100%;margin-bottom:8px;font-size:16px;font-weight:600;color:#f3f4f6;">
                        <span style="margin-right:8px;">${itemInfo.icon || '🎁'}</span>
                        <span>${itemInfo.name || '未知物品'}</span>
                    </div>
                    ${itemInfo.description ? `<div class="confirm-item-desc" style="display:block;width:100%;margin-bottom:8px;font-size:14px;color:#d1d5db;line-height:1.6;">${itemInfo.description}</div>` : ''}
                    ${itemInfo.price !== undefined ? `
                        <div class="confirm-item-price" style="display:block;width:100%;margin-bottom:0;font-size:15px;color:#fbbf24;font-weight:600;">
                            <span>💰 价格：</span>
                            <span>${itemInfo.price} 任务代币</span>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        //  计算弹窗宽度
        const windowWidth = $(window).width();
        const bodyWidth = $('body').width();
        const containerWidth = windowWidth || bodyWidth || 400;
        let modalWidth = Math.min(Math.max(containerWidth * 0.9, 300), 480);
        if (modalWidth < 300 || isNaN(modalWidth)) {
            modalWidth = 400;
        }

        // 创建弹窗HTML（直接在HTML中设置内联样式）
        const confirmHtml = `
            <div class="custom-confirm-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:100000;opacity:0;transition:opacity 0.3s ease-out;">
                <div class="custom-confirm-modal" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:20px;padding:2px;width:${modalWidth}px;max-width:480px;min-width:300px;box-shadow:0 12px 40px rgba(0,0,0,0.4);transform:translateY(30px) scale(0.95);opacity:0;transition:all 0.3s ease-out;display:block;box-sizing:border-box;margin:0 auto;">
                    <div class="custom-confirm-content" style="background:#1f2937;border-radius:18px;padding:28px 24px 20px;display:block;width:100%;box-sizing:border-box;min-height:100px;">
                        <div class="confirm-icon" style="width:64px;height:64px;margin:0 auto 20px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:32px;">${icon}</div>
                        <div class="confirm-title" style="font-size:22px;font-weight:700;margin-bottom:16px;color:#f3f4f6;text-align:center;display:block;width:100%;">${title}</div>
                        <div class="confirm-message" style="font-size:15px;line-height:1.7;color:#d1d5db;margin-bottom:24px;text-align:center;display:block;width:100%;">${message}</div>
                        ${itemInfoHtml}
                        <div class="confirm-buttons" style="display:flex;gap:12px;width:100%;">
                            <button class="confirm-btn confirm-btn-cancel" data-action="cancel" style="flex:1;padding:14px 20px;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;background:#374151;color:#d1d5db;min-height:48px;">
                                ${cancelText}
                            </button>
                            <button class="confirm-btn confirm-btn-confirm" data-action="confirm" style="flex:1;padding:14px 20px;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;min-height:48px;">
                                ${confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 创建弹窗元素
        const $confirm = $(confirmHtml);

        //  添加到父窗口的 body（而不是 iframe 内），这样即使手机关闭弹窗仍可见
        const targetBody = (window.parent !== window) ? $(window.parent.document.body) : $('body');
        $confirm.appendTo(targetBody);

        // 获取modal和content元素
        const $modal = $confirm.find('.custom-confirm-modal');
        const $content = $confirm.find('.custom-confirm-content');

        //  强制触发重绘
        $confirm[0].offsetHeight;

        // 检查尺寸
        const confirmRect = $confirm[0].getBoundingClientRect();
        const modalRect = $modal[0].getBoundingClientRect();

        // 渐入动画
        setTimeout(() => {
            $confirm.css('opacity', '1');
        }, 10);

        // 弹窗上滑动画
        setTimeout(() => {
            $modal.css({
                'transform': 'translateY(0) scale(1)',
                'opacity': '1'
            });
        }, 50);

        // 处理按钮点击
        const handleChoice = (confirmed) => {

            $confirm.fadeOut(200, () => {
                $confirm.remove();
                resolve(confirmed);
            });
        };

        // 绑定事件
        $confirm.find('[data-action="confirm"]').on('click', () => handleChoice(true));
        $confirm.find('[data-action="cancel"]').on('click', () => handleChoice(false));

        // 点击遮罩层取消
        $confirm.on('click', (e) => {
            if ($(e.target).hasClass('custom-confirm-overlay')) {
                handleChoice(false);
            }
        });

        // ESC键取消
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                $(document).off('keydown', handleEsc);
                handleChoice(false);
            }
        };
        $(document).on('keydown', handleEsc);

        // Enter键确认
        const handleEnter = (e) => {
            if (e.key === 'Enter') {
                $(document).off('keydown', handleEnter);
                handleChoice(true);
            }
        };
        $(document).on('keydown', handleEnter);

        // 自动聚焦确认按钮
        setTimeout(() => {
            $confirm.find('.confirm-btn-confirm').focus();
        }, 100);
    });
}

