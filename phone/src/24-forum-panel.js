// ==================== 论坛面板 ====================
function generateForumPanel() {


    const manager = window.phoneForumManager;

    const forumData = manager.loadForumData();

    // 获取当前论坛风格名称
    let forumStyleName = manager.settings.forumStyle || DEFAULT_FORUM_STYLE;
    if (forumStyleName.startsWith('custom:')) {
        forumStyleName = forumStyleName.substring(7); // 移除 'custom:' 前缀
    }

    if (!forumData || forumData.length === 0) {

        //  绑定按钮点击事件（使用事件委托）
        setTimeout(() => {
            $('.phone-forum-generate-btn').off('click').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (window.phoneGenerateForum) {
                    window.phoneGenerateForum();
                } else {
                    alert('论坛功能未初始化');
                }
            });

            $('.phone-forum-settings-btn').off('click').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (window.phoneOpenForumSettings) {
                    window.phoneOpenForumSettings();
                } else {
                }
            });

        }, 0);

        //  根据生成状态决定按钮样式（空状态）
        const emptyBtnHtml = isForumGenerating
            ? '<i class="fas fa-hourglass-half fa-spin"></i> 生成中...'
            : '<i class="fas fa-magic"></i> 生成论坛';
        const emptyBtnStyle = isForumGenerating
            ? 'margin-top: 20px; padding: 8px 16px; background: #9E9E9E; color: white; border: none; border-radius: 4px; cursor: not-allowed; opacity: 0.7;'
            : 'margin-top: 20px; padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;';
        const emptyBtnDisabled = isForumGenerating ? 'disabled' : '';

        return `
            <div style="padding: 12px 12px 0 12px; margin-bottom: 8px;">
                <div style="font-size: 14px; color: #667eea; font-weight: 600;">${escapeHtml(forumStyleName)}</div>
            </div>
            <div class="empty-message">
                <i class="fas fa-comments" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
                <div>${isForumGenerating ? '正在生成论坛内容...' : '暂无论坛内容'}</div>
                <div style="font-size: 12px; margin-top: 10px; opacity: 0.7;">${isForumGenerating ? '请稍候，内容生成中' : '点击下方按钮生成论坛'}</div>
                <button class="phone-forum-generate-btn" ${emptyBtnDisabled} style="${emptyBtnStyle}">
                    ${emptyBtnHtml}
                </button>
                <button class="phone-forum-settings-btn" style="margin-top: 10px; padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-cog"></i> 设置
                </button>
            </div>
        `;
    }


    //  绑定按钮点击事件（使用事件委托）
    setTimeout(() => {
        $('.phone-forum-generate-btn').off('click').on('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (window.phoneGenerateForum) {
                window.phoneGenerateForum();
            } else {
                alert('论坛功能未初始化');
            }
        });

        $('.phone-forum-settings-btn').off('click').on('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (window.phoneOpenForumSettings) {
                window.phoneOpenForumSettings();
            } else {
            }
        });

    }, 0);

    //  根据生成状态决定按钮样式
    const refreshBtnHtml = isForumGenerating
        ? '<i class="fas fa-hourglass-half fa-spin"></i> 生成中...'
        : '<i class="fas fa-sync"></i> 刷新';
    const refreshBtnStyle = isForumGenerating
        ? 'padding: 6px 12px; background: #9E9E9E; color: white; border: none; border-radius: 4px; cursor: not-allowed; font-size: 12px; opacity: 0.7;'
        : 'padding: 6px 12px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.3s;';
    const refreshBtnDisabled = isForumGenerating ? 'disabled' : '';

    //  如果正在生成，显示提示
    const loadingTipHtml = isForumGenerating
        ? '<span class="forum-loading-tip" style="font-size: 12px; color: #FF9800; white-space: nowrap;"><i class="fas fa-hourglass-half fa-spin"></i> 正在刷新中</span>'
        : '';

    let html = `
        <div style="padding: 12px;">
            <!-- 论坛风格标题 -->
            <div style="font-size: 14px; color: #667eea; font-weight: 600; margin-bottom: 10px;">${escapeHtml(forumStyleName)}</div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
                    <h3 style="margin: 0; font-size: 16px; color: #2d3748;"> 论坛热帖</h3>
                    ${loadingTipHtml}
                </div>
                <div style="display: flex; gap: 6px;">
                    <button class="phone-forum-generate-btn" ${refreshBtnDisabled} style="${refreshBtnStyle}">
                        ${refreshBtnHtml}
                    </button>
                    <button class="phone-forum-settings-btn" style="padding: 6px 12px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                        <i class="fas fa-cog"></i>
                    </button>
                </div>
            </div>
            <div style="max-height: 500px; overflow-y: auto;">
    `;

    forumData.forEach((post, index) => {
        html += `
            <div class="forum-post-item" data-post-index="${index}" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.08); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;">
                <!-- 帖子头部：作者信息 -->
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    ${getForumAvatarHtml(post.author, 32, 12)}
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; font-size: 13px; color: #2d3748;">${escapeHtml(post.author)}</div>
                        <div style="font-size: 11px; color: #a0aec0;">${escapeHtml(post.time)}</div>
                    </div>
                </div>
                
                <!-- 帖子内容 -->
                <div style="margin-bottom: 12px;">
                    <h3 style="font-size: 15px; font-weight: 600; color: #2d3748; margin: 0 0 8px 0; line-height: 1.3;">${escapeHtml(post.title)}</h3>
                    <div style="font-size: 13px; color: #4a5568; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(post.content)}</div>
                </div>
                
                <!-- 帖子统计和操作 -->
                <div style="display: flex; gap: 16px; padding-top: 10px; border-top: 1px solid #f7fafc; font-size: 12px; color: #718096;">
                    <span style="display: flex; align-items: center; gap: 4px;">
                        <i class="fas fa-thumbs-up" style="font-size: 11px;"></i> 
                        ${post.likes}
                    </span>
                    <span style="display: flex; align-items: center; gap: 4px;">
                        <i class="fas fa-comment" style="font-size: 11px;"></i> 
                        ${Array.isArray(post.replies) ? post.replies.length : (post.replies || 0)}
                    </span>
                </div>
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;

    return html;
}

