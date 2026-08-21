// ==================== 图片处理功能 ====================
/**
 * 处理消息内容中的图片标签
 * @param {string} content - 原始消息内容
 * @returns {string} - 处理后的HTML内容
 */
function processMessageImages(content) {
    if (!content) return '';

    // 使用正则替换 <pic>...</pic> 为图片HTML
    const imageRegex = /<pic>(.*?)<\/pic>/gi;

    const processedContent = content.replace(imageRegex, (match, imagePath) => {
        const imageUrl = `https://rpg.bolt.qzz.io/${imagePath.trim()}.webp`;
        // 使用data属性存储URL，通过事件委托处理点击
        return `<div class="message-image-container" style="margin: 8px 0;">
            <img src="${imageUrl}" 
                 class="message-image clickable-image" 
                 data-image-url="${imageUrl}"
                 style="max-width: 200px; max-height: 200px; border-radius: 8px; cursor: pointer; display: block;"
                 onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<div class=\'image-error\' style=\'color:#999;font-size:12px;padding:8px;\'>📷 图片加载失败</div>');" />
        </div>`;
    });

    return processedContent;
}

/**
 * 查看完整图片（大图模式）
 * @param {string} imageUrl - 图片URL
 */
function viewFullImage(imageUrl) {

    // 移除已存在的查看器
    $('#image-viewer').remove();

    // 创建全屏图片查看器
    const viewer = $('<div>', {
        id: 'image-viewer',
        css: {
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column'
        }
    });

    // 关闭按钮
    const closeBtn = $('<button>', {
        text: '✕ 关闭',
        css: {
            position: 'absolute',
            top: '20px',
            right: '20px',
            padding: '10px 20px',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold'
        }
    }).on('click', function () {
        $('#image-viewer').remove();
    });

    // 图片元素
    const img = $('<img>', {
        src: imageUrl,
        css: {
            maxWidth: '90%',
            maxHeight: '90%',
            objectFit: 'contain'
        }
    });

    viewer.append(closeBtn, img);

    // 点击背景关闭
    viewer.on('click', function (e) {
        if (e.target === this) {
            $(this).remove();
        }
    });

    $('body').append(viewer);
}

/**
 * 发送聊天消息
 */
async function sendChatMessage() {
    const $input = $('#chat-input');
    const $sendBtn = $('#chat-send-btn');
    const $sendIcon = $sendBtn.find('i');
    const message = $input.val().trim();

    if (!message) return;


    // 清空输入框
    $input.val('');

    try {
        //  传递按钮引用，让 MessageSender 控制按钮状态
        const success = await window.messageSender.sendMessage(message, {
            button: $sendBtn,
            icon: $sendIcon,
            input: $input
        });

        if (success) {
        }
    } catch (error) {
    }
}

