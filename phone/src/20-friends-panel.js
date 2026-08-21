/* 羁绊行：跟消息列表共用 ph-row / ph-avatar / ph-badge 那套组件，
   样式在 css/rows.css，这里只拼结构。 */
function renderFriendListItem(contactKey, contact) {
    /* 适配变量脚本的羁绊列表结构 */
    const displayName = escapeHtml(contactKey);
    const isNearby = contact.附近 === true;
    const affection = contact.好感度 ?? 0;
    const gender = contact.性别 || '';
    const race = contact.种族 || '';
    const level = contact.等级 ?? 1;
    const isTraveling = contact.同行誓约 === true;

    /* 简要信息：性别 · 种族 · Lv */
    const infoChips = [gender, race, `Lv.${level}`].filter(Boolean)
        .map(v => escapeHtml(v)).join(' · ');

    const badges = [
        isNearby ? '<span class="ph-badge ph-badge--blue">附近</span>' : '',
        isTraveling ? '<span class="ph-badge ph-badge--purple">同行</span>' : '',
    ].join('');

    return `
        <div class="list-item friend-item ph-row" data-friend-name="${escapeHtml(contactKey)}">
            ${renderPhoneAvatar(contactKey)}
            <div class="ph-row-main">
                <div class="ph-row-titleline">
                    <span class="ph-row-title">${displayName}</span>
                    ${badges}
                </div>
                ${infoChips ? `<div class="ph-row-sub">${infoChips}</div>` : ''}
                ${contact.当前想法 ? `<div class="ph-row-quote">${escapeHtml(contact.当前想法)}</div>` : ''}
            </div>
            <div class="ph-row-meta">${renderAffection(affection)}</div>
            <i class="fas fa-chevron-right ph-chevron"></i>
        </div>
    `;
}

function generateFriendsPanel(data) {
    const contactSource = getRelationshipDataSource(data);

    if (!contactSource) {
        return '<div class="empty-message">暂无羁绊数据</div>';
    }

    const contactEntries = getRelationshipKeys(contactSource)
        .map(key => ({ key, contact: contactSource[key] }))
        .filter(entry => entry.contact && typeof entry.contact === 'object')
        .sort((a, b) => {
            /* 同行誓约的排在前面 */
            const travelA = a.contact?.同行誓约 === true;
            const travelB = b.contact?.同行誓约 === true;
            if (travelA && !travelB) return -1;
            if (!travelA && travelB) return 1;

            /* 附近的排在前面 */
            const nearbyA = a.contact?.附近 === true;
            const nearbyB = b.contact?.附近 === true;
            if (nearbyA && !nearbyB) return -1;
            if (!nearbyA && nearbyB) return 1;

            /* 按好感度排序 */
            const affectionA = a.contact?.好感度 ?? 0;
            const affectionB = b.contact?.好感度 ?? 0;
            return affectionB - affectionA;
        });

    if (contactEntries.length === 0) {
        return '<div class="empty-message">暂无羁绊数据</div>';
    }

    /* 直接渲染联系人列表 */
    const friendItems = contactEntries.map(({ key, contact }) => renderFriendListItem(key, contact)).join('');

    return `
        <div class="friend-list-container">
            <div class="friend-list-header ph-section-title">羁绊 · ${contactEntries.length} 人</div>
            <div class="friend-list-body">
                ${friendItems}
            </div>
        </div>
    `;
}

/**
 * HTML安全显示文本（避免HTML注入但保留原文）
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 文本还原函数（将特殊编码转换回正常字符）
 * 用于处理变量名中的特殊字符编码
 */
function restoreEraText(text) {
    if (!text) return '';
    // 将 __DOT__ 还原为 . （避免路径解析冲突的编码）
    // 将 __SQUOTE__ 还原为 ' （避免字符串解析冲突的编码）
    return text.replace(/__DOT__/g, '.').replace(/__SQUOTE__/g, "'");
}

/**
 * 显示好友详情
 * @param {string} friendName - 好友名称
 * @param {object} friendData - 好友数据
 * @param {boolean} isRestoring - 是否是恢复状态（不重置滚动位置）
 */
function showFriendDetail(friendName, friendData, isRestoring = false) {

    //  只有在非恢复模式下才重置详情页滚动位置
    if (!isRestoring) {
        friendDetailScrollPosition = 0;
    } else {
    }

    //  保存好友列表的滚动位置（多种方式尝试，确保iframe兼容）
    let appBodyElement = document.getElementById('phone-app-body');

    // 如果原生方式找不到，尝试使用 jQuery
    if (!appBodyElement) {
        const $appBody = $('#phone-app-body');
        if ($appBody.length > 0) {
            appBodyElement = $appBody[0];
        }
    }

    if (appBodyElement) {
        // 使用原生属性获取滚动位置
        friendsListScrollPosition = appBodyElement.scrollTop;

        //  新增：查找当前点击的好友元素位置
        const $friendItem = $(`.friend-item[data-friend-name="${friendName}"]`);
        if ($friendItem.length > 0) {
            const friendItemTop = $friendItem.position().top + appBodyElement.scrollTop;

            // 保存额外信息用于精确定位
            friendsListScrollPosition = Math.max(friendsListScrollPosition, friendItemTop);
        } else {
        }
    } else {
        friendsListScrollPosition = 0;
    }

    //  记录当前查看的好友
    lastViewedFriend = friendName;

    // 保存当前页面到导航栈
    const currentTitle = $('#phone-app-title').text();
    const currentContent = $('#phone-app-body').html();
    navigationStack.push({
        title: currentTitle,
        content: currentContent,
        scrollPosition: friendsListScrollPosition //  同时保存到导航栈中
    });

    /* 适配变量脚本的羁绊列表结构 */
    const gender = friendData.性别 || '';
    const isNearby = friendData.附近 === true;
    const race = friendData.种族 || '';
    const level = friendData.等级 ?? 1;
    const appearance = friendData.外貌 || '';
    const clothing = friendData.着装 || '';
    const affection = friendData.好感度 ?? 0;
    const isTraveling = friendData.同行誓约 === true;
    const currentThought = friendData.当前想法 || '';

    /* 好感度进度条颜色 */
    const affectionPercent = Math.abs(affection);
    const affectionBarColor = affection >= 50 ? '#ec4899' : affection >= 0 ? '#f59e0b' : '#ef4444';
    const affectionLabel = affection >= 80 ? '挚友' : affection >= 50 ? '亲密' : affection >= 20 ? '友好' : affection >= 0 ? '普通' : affection >= -50 ? '冷淡' : '敌对';

    /* 头像 */
    const avatarUrl = getCharacterAvatar(friendName);
    const avatarHtml = avatarUrl
        ? `<img src="${avatarUrl}" style="width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 3px solid #e5e7eb;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
           <div style="display: none; width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); align-items: center; justify-content: center; font-size: 28px; color: #fff; border: 3px solid #e5e7eb;">${escapeHtml(friendName.charAt(0))}</div>`
        : `<div style="width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; font-size: 28px; color: #fff; border: 3px solid #e5e7eb;">${escapeHtml(friendName.charAt(0))}</div>`;

    let html = `
        <div id="friend-detail-scroll-container" style="padding: 10px; max-height: calc(100vh - 200px); overflow-y: auto;">
            <!-- 角色卡片头部 -->
            <div class="list-item" style="margin-bottom: 12px; text-align: center; padding: 20px 15px;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                    ${avatarHtml}
                    <div>
                        <div style="font-size: 18px; font-weight: 700; color: #1f2937;">${escapeHtml(friendName)}</div>
                        <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                            ${[gender, race, `Lv.${level}`].filter(Boolean).map(v => escapeHtml(v)).join(' · ')}
                        </div>
                    </div>
                    <!-- 状态标签 -->
                    <div style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: center;">
                        ${isNearby ? '<span style="font-size: 11px; background: #dbeafe; color: #2563eb; padding: 3px 10px; border-radius: 12px; font-weight: 600;">📍 附近</span>' : '<span style="font-size: 11px; background: #f3f4f6; color: #9ca3af; padding: 3px 10px; border-radius: 12px;">不在附近</span>'}
                        ${isTraveling ? '<span style="font-size: 11px; background: #ede9fe; color: #7c3aed; padding: 3px 10px; border-radius: 12px; font-weight: 600;">⚔ 同行誓约</span>' : ''}
                    </div>
                </div>
            </div>
            
            <!-- 好感度 -->
            <div class="list-item" style="margin-bottom: 12px;">
                <div class="list-item-header">
                    <span class="list-item-name">💕 好感度</span>
                    <span style="font-size: 13px; font-weight: 600; color: ${affectionBarColor};">${affection} · ${affectionLabel}</span>
                </div>
                <div style="margin-top: 8px;">
                    <div style="width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                        <div style="width: ${affectionPercent}%; height: 100%; background: ${affectionBarColor}; border-radius: 4px; transition: width 0.3s ease;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: #9ca3af; margin-top: 4px;">
                        <span>-100</span>
                        <span>0</span>
                        <span>100</span>
                    </div>
                </div>
            </div>
            
            <!-- 外貌 -->
            ${appearance ? `
            <div class="list-item" style="margin-bottom: 12px;">
                <div class="list-item-header">
                    <span class="list-item-name">👤 外貌</span>
                </div>
                <div class="list-item-desc" style="margin-top: 6px;">
                    <div style="font-size: 12px; line-height: 1.6; color: #4b5563;">${escapeHtml(appearance)}</div>
                </div>
            </div>
            ` : ''}
            
            <!-- 着装 -->
            ${clothing ? `
            <div class="list-item" style="margin-bottom: 12px;">
                <div class="list-item-header">
                    <span class="list-item-name">👗 着装</span>
                </div>
                <div class="list-item-desc" style="margin-top: 6px;">
                    <div style="font-size: 12px; line-height: 1.6; color: #4b5563;">${escapeHtml(clothing)}</div>
                </div>
            </div>
            ` : ''}
            
            <!-- 当前想法 -->
            ${currentThought ? `
            <div class="list-item" style="margin-bottom: 12px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);">
                <div class="list-item-header">
                    <span class="list-item-name">💭 当前想法</span>
                </div>
                <div class="list-item-desc" style="margin-top: 6px;">
                    <div style="font-size: 12px; line-height: 1.6; color: #92400e; font-style: italic;">"${escapeHtml(currentThought)}"</div>
                </div>
            </div>
            ` : ''}
        </div>
    `;

    /* 设置详情面板 */
    $('#phone-app-title').text(`👤 ${escapeHtml(friendName)}`);
    $('#phone-app-body').html(html);

    /* 确保内容可见 */
    if (!isRestoring) {
        $('#phone-app-body').css('opacity', '1');
    }

    /* 添加滚动监听器 */
    setTimeout(() => {
        let scrollContainer = document.getElementById('friend-detail-scroll-container');

        if (!scrollContainer) {
            const $scrollContainer = $('#friend-detail-scroll-container');
            if ($scrollContainer.length > 0) {
                scrollContainer = $scrollContainer[0];
            }
        }

        if (scrollContainer) {
            scrollContainer.removeEventListener('scroll', handleDetailScroll);
            scrollContainer.addEventListener('scroll', handleDetailScroll, { passive: true });
        }
    }, 150);
}

//  详情页滚动处理函数
function handleDetailScroll(event) {
    if (event.target) {
        friendDetailScrollPosition = event.target.scrollTop;
        // 使用节流，避免频繁打印日志
        if (!window._detailScrollLogTimer) {
            const elementName = event.target.id || event.target.className || 'unknown';
            window._detailScrollLogTimer = setTimeout(() => {
                window._detailScrollLogTimer = null;
            }, 500); // 减少到500ms，更快响应
        }
    }
}

