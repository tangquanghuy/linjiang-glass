/**
 * 根据用户名生成一致的随机颜色
 * @param {string} username - 用户名
 * @returns {string} - 渐变色CSS
 */
function getUserAvatarColor(username) {
    if (!username) return 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)';

    // 丰富的颜色方案
    const colorSchemes = [
        // 紫色系
        'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
        'linear-gradient(135deg, #c084fc 0%, #a855f7 100%)',
        'linear-gradient(135deg, #e879f9 0%, #d946ef 100%)',

        // 蓝色系
        'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
        'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
        'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',

        // 绿色系
        'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
        'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',

        // 橙色系
        'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
        'linear-gradient(135deg, #fb923c 0%, #f97316 100%)',
        'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',

        // 红色系
        'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        'linear-gradient(135deg, #f87171 0%, #ef4444 100%)',
        'linear-gradient(135deg, #fb7185 0%, #f43f5e 100%)',

        // 粉色系
        'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
        'linear-gradient(135deg, #f472b6 0%, #ec4899 100%)',

        // 青色系
        'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
        'linear-gradient(135deg, #2dd4bf 0%, #14b8a6 100%)',

        // 靛蓝色系
        'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
        'linear-gradient(135deg, #818cf8 0%, #6366f1 100%)',

        // 玫瑰色系
        'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',

        // 琥珀色系
        'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',

        // 石板色系
        'linear-gradient(135deg, #64748b 0%, #475569 100%)',

        // 混合渐变色系
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'linear-gradient(135deg, #ffa726 0%, #fb8c00 100%)',
        'linear-gradient(135deg, #ab47bc 0%, #8e24aa 100%)',
        'linear-gradient(135deg, #26c6da 0%, #00acc1 100%)',
        'linear-gradient(135deg, #66bb6a 0%, #43a047 100%)',
        'linear-gradient(135deg, #ec407a 0%, #d81b60 100%)'
    ];

    // 简单哈希函数：将用户名转换为一致的索引
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = ((hash << 5) - hash) + username.charCodeAt(i);
        hash = hash & hash; // 转换为32位整数
    }

    // 确保索引为正数
    const index = Math.abs(hash) % colorSchemes.length;
    return colorSchemes[index];
}

/**
 * 生成论坛用户头像HTML
 * @param {string} username - 用户名
 * @param {number} size - 头像尺寸（像素）
 * @param {number} fontSize - 字体大小（像素）
 * @returns {string} - 头像HTML
 */
function getForumAvatarHtml(username, size = 32, fontSize = 12) {
    const avatarUrl = getCharacterAvatar(username);
    if (avatarUrl) {
        return `<img src="${avatarUrl}" style="width: ${size}px; height: ${size}px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div style="display: none; width: ${size}px; height: ${size}px; border-radius: 50%; background: ${getUserAvatarColor(username)}; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: ${fontSize}px; flex-shrink: 0;">${escapeHtml(username)[0] || '?'}</div>`;
    }
    return `<div style="width: ${size}px; height: ${size}px; border-radius: 50%; background: ${getUserAvatarColor(username)}; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: ${fontSize}px; flex-shrink: 0;">${escapeHtml(username)[0] || '?'}</div>`;
}

/**
 * 显示论坛帖子详情
 */
function showForumPostDetail(postIndex, postData) {

    // 保存当前页面到导航栈
    const currentTitle = $('#phone-app-title').text();
    const currentContent = $('#phone-app-body').html();
    navigationStack.push({
        title: currentTitle,
        content: currentContent
    });

    // 获取回复列表（从帖子对象的replies数组中）
    const replyPosts = Array.isArray(postData.replies) ? postData.replies : [];
    const replyCount = replyPosts.length;

    // 构建帖子详情HTML
    let html = `
        <div style="padding: 12px;">
            <!-- 帖子主楼 -->
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
                <!-- 作者信息 -->
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 14px;">
                    ${getForumAvatarHtml(postData.author, 48, 18)}
                    <div style="flex: 1;">
                        <div style="font-weight: 600; font-size: 14px; color: #2d3748;">${escapeHtml(postData.author)}</div>
                        <div style="font-size: 12px; color: #a0aec0;">${escapeHtml(postData.time)}</div>
                    </div>
                    <div style="background: #f7fafc; padding: 4px 12px; border-radius: 12px; font-size: 11px; color: #718096;">
                        1楼 (楼主)
                    </div>
                </div>
                
                <!-- 帖子标题 -->
                <h2 style="font-size: 18px; font-weight: 600; color: #2d3748; margin: 0 0 12px 0; line-height: 1.4;">${escapeHtml(postData.title)}</h2>
                
                <!-- 帖子内容 -->
                <div style="font-size: 14px; color: #4a5568; line-height: 1.8; white-space: pre-wrap; margin-bottom: 14px;">${escapeHtml(postData.content)}</div>
                
                <!-- 统计信息 -->
                <div style="display: flex; gap: 20px; padding-top: 12px; border-top: 1px solid #f7fafc; font-size: 13px; color: #718096;">
                    <span style="display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-thumbs-up"></i> 
                        ${postData.likes} 赞
                    </span>
                    <span style="display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-comment"></i> 
                        ${replyCount} 回复
                    </span>
                </div>
            </div>
            
            <!-- 回复区域标题 -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding: 0 4px;">
                <h3 style="margin: 0; font-size: 14px; color: #4a5568; font-weight: 600;">全部回复</h3>
                <span style="font-size: 12px; color: #a0aec0;">${replyCount} 条</span>
            </div>
    `;

    // 构建回复列表
    if (replyCount > 0) {
        html += `<div style="display: flex; flex-direction: column; gap: 10px;">`;

        replyPosts.forEach((reply) => {
            const floorNumber = reply.floor || 2; // 使用reply中的floor字段，默认从2开始
            html += `
                <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
                    <!-- 回复作者信息 -->
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        ${getForumAvatarHtml(reply.author, 36, 14)}
                        <div style="flex: 1;">
                            <div style="font-weight: 600; font-size: 13px; color: #2d3748;">${escapeHtml(reply.author)}</div>
                            <div style="font-size: 11px; color: #a0aec0;">${escapeHtml(reply.time)}</div>
                        </div>
                        <div style="background: #f7fafc; padding: 3px 10px; border-radius: 10px; font-size: 11px; color: #718096;">
                            ${floorNumber}楼
                        </div>
                    </div>
                    
                    <!-- 回复内容 -->
                    <div style="font-size: 13px; color: #4a5568; line-height: 1.7; white-space: pre-wrap; margin-bottom: 10px;">${escapeHtml(reply.content)}</div>
                    
                    <!-- 回复统计 -->
                    <div style="display: flex; gap: 16px; padding-top: 8px; border-top: 1px solid #f7fafc; font-size: 12px; color: #718096;">
                        <span style="display: flex; align-items: center; gap: 4px;">
                            <i class="fas fa-thumbs-up" style="font-size: 11px;"></i> 
                            ${reply.likes}
                        </span>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
    } else {
        // 空状态
        html += `
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 40px 20px; text-align: center; color: #a0aec0;">
                <i class="fas fa-comment-dots" style="font-size: 36px; margin-bottom: 12px; opacity: 0.5;"></i>
                <div style="font-size: 13px;">暂无回复</div>
                <div style="font-size: 11px; margin-top: 6px; opacity: 0.7;">来抢沙发吧~</div>
            </div>
        `;
    }

    html += `</div>`; // 关闭主容器

    // 设置详情面板
    $('#phone-app-title').text(' 帖子详情');
    $('#phone-app-body').html(html);
}

