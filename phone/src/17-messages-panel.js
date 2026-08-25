// ==================== 面板内容生成函数 ====================

/**
 * 头像：固定主播与开局自定义主播统一走 getCharacterAvatar，没有素材时显示首字渐变底
 * @param {string} name - 联系人/群名
 * @param {boolean} isGroup - 群聊用不同的兜底图标
 * @returns {string} - 头像 HTML
 */
function renderPhoneAvatar(name, isGroup = false) {
    const safeName = escapeHtml(name || '');
    const url = (typeof getCharacterAvatar === 'function') ? getCharacterAvatar(name) : null;

    if (isGroup) {
        return `<div class="ph-avatar ph-avatar--group"><i class="fas fa-user-group"></i></div>`;
    }

    /* 复用论坛那套按用户名取色的逻辑，保证同一个人每次颜色一致 */
    const bg = (typeof getUserAvatarColor === 'function')
        ? getUserAvatarColor(name)
        : 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)';
    const initial = safeName.slice(0, 1) || '?';

    /* 图挂了（远程头像很容易超时）就 this.remove()，露出底下的首字兜底，
       不会留一个空白圆圈。 */
    const img = url
        ? `<img class="ph-avatar-img" src="${url}" alt="" loading="lazy" onerror="this.remove()">`
        : '';

    return `<div class="ph-avatar" style="background:${bg};"><span class="ph-avatar-initial">${initial}</span>${img}</div>`;
}

/* 好感度：正数粉、负数灰蓝，数字等宽 */
function renderAffection(affection) {
    const cls = affection < 0 ? 'ph-affection ph-affection--cold' : 'ph-affection';
    return `<span class="${cls}"><i class="fas fa-heart"></i>${affection}</span>`;
}

function generateMessagesPanel(data) {
    const relationshipSource = getRelationshipDataSource(data) || {};
    let html = '';

    //  创建群聊按钮（使用 class 而不是 onclick，通过事件委托绑定）
    html += `
        <button type="button" class="create-group-button ph-action-row">
            <i class="fas fa-user-plus"></i>
            <span>创建群聊</span>
        </button>
    `;

    // 提取群聊信息
    const groups = extractGroupsFromChat();

    /* 联系人与羁绊共用 对象信息 名单；聊天标记只补充私聊号码。
       这样同一个主播在两个 App 中是同一个对象，同时点击联系人仍能匹配
       [对方消息|名字|号码|...] 里的号码。 */
    const chatFriends = extractFriendsFromChat();
    const chatFriendByName = new Map([...chatFriends.values()].map(friend => [restoreEraText(friend.name || ''), friend]));
    const friends = getRelationshipKeys(relationshipSource).sort((a, b) => {
        const contactA = relationshipSource[a];
        const contactB = relationshipSource[b];
        const liveA = getContactStream(contactA).live;
        const liveB = getContactStream(contactB).live;
        if (liveA !== liveB) return liveA ? -1 : 1;
        return getContactAffection(contactB) - getContactAffection(contactA);
    });

    // 用于跟踪已添加的联系人（防止重复）
    const addedContactIds = new Set();
    const addedContactNames = new Set();

    // 渲染MVU好友
    friends.forEach(studentKey => {
        const friend = relationshipSource[studentKey];
        const affection = getContactAffection(friend);
        const displayName = restoreEraText(studentKey);
        const chatFriend = chatFriendByName.get(displayName);
        const contactId = chatFriend?.id || studentKey;
        const mood = getContactMood(friend);
        const thought = mood ? escapeHtml(`心情：${mood}`) : '';

        // 添加到已渲染集合
        addedContactIds.add(studentKey);
        addedContactIds.add(String(contactId));
        if (displayName) {
            addedContactNames.add(displayName);
        }

        html += `
            <div class="list-item contact-item ph-row" data-type="friend" data-id="${escapeHtml(contactId)}" data-name="${escapeHtml(displayName)}">
                ${renderPhoneAvatar(displayName)}
                <div class="ph-row-main">
                    <div class="ph-row-title">${escapeHtml(displayName)}</div>
                    ${thought ? `<div class="ph-row-sub">${thought}</div>` : ''}
                </div>
                <div class="ph-row-meta">${renderAffection(affection)}</div>
                <i class="fas fa-chevron-right ph-chevron"></i>
            </div>
        `;
    });

    // 渲染从聊天记录提取的好友（不在MVU中的）
    chatFriends.forEach(friend => {
        const normalizedName = restoreEraText(friend.name || '');
        // 使用更精确的去重逻辑：检查ID和名字是否都不在已添加列表中
        if (!addedContactIds.has(friend.id) && !addedContactNames.has(normalizedName)) {

            addedContactIds.add(friend.id);
            if (normalizedName) {
                addedContactNames.add(normalizedName);
            }

            html += `
                <div class="list-item contact-item ph-row" data-type="friend" data-id="${escapeHtml(friend.id)}" data-name="${escapeHtml(normalizedName)}">
                    ${renderPhoneAvatar(normalizedName)}
                    <div class="ph-row-main">
                        <div class="ph-row-title">${escapeHtml(normalizedName)}</div>
                        <div class="ph-row-sub">来自聊天记录 · ${escapeHtml(friend.id)}</div>
                    </div>
                    <i class="fas fa-chevron-right ph-chevron"></i>
                </div>
            `;
        }
    });

    // 渲染群聊
    if (groups.size > 0) {
        html += '<div class="ph-section-title">群聊</div>';
        groups.forEach(group => {
            // 检查群聊是否已添加
            if (!addedContactIds.has(group.id)) {
                addedContactIds.add(group.id);

                html += `
                    <div class="list-item contact-item ph-row" data-type="group" data-id="${escapeHtml(group.id)}" data-name="${escapeHtml(group.name)}" data-members="${escapeHtml(group.members)}">
                        ${renderPhoneAvatar(group.name, true)}
                        <div class="ph-row-main">
                            <div class="ph-row-title">${escapeHtml(group.name)}</div>
                            <div class="ph-row-sub">${escapeHtml(group.members)}</div>
                        </div>
                        <div class="ph-row-meta"><span class="ph-row-count">${group.memberCount}人</span></div>
                        <i class="fas fa-chevron-right ph-chevron"></i>
                    </div>
                `;
            }
        });
    }

    return html;
}
