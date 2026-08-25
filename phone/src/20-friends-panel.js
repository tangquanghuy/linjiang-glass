/* 羁绊页沿用 参考/魔审小手机.js 的白色信息卡结构，只映射当前项目：
   对象信息.<名字>.羁绊 / 位置 / 直播。 */
function renderBondAvatar(name, size = 52) {
    const safeName = escapeHtml(name);
    const src = getCharacterAvatar(name);
    const initial = escapeHtml(Array.from(String(name || '?'))[0] || '?');
    const fallback = `
        <div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,#ec4899,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:${Math.round(size * 0.42)}px;font-weight:700;flex:none;">${initial}</div>`;
    if (!src) return fallback;
    return `
        <div style="position:relative;width:${size}px;height:${size}px;flex:none;">
            ${fallback}
            <img src="${escapeHtml(src)}" alt="${safeName}" loading="lazy" decoding="async"
                style="position:absolute;inset:0;width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.9);box-shadow:0 2px 8px rgba(0,0,0,.12);"
                onerror="this.remove()">
        </div>`;
}

function renderFriendListItem(contactKey, contact) {
    const displayName = restoreEraText(contactKey);
    const affection = getContactAffection(contact);
    const obedience = getContactObedience(contact);
    const mood = getContactMood(contact) || '暂无记录';
    const location = getContactLocationText(contact) || '位置未记录';
    const stream = getContactStream(contact);

    return `
        <div class="list-item friend-item"
             style="cursor:pointer;transition:background-color .2s;border:1px solid rgba(0,0,0,.06);border-radius:12px;padding:14px;margin-bottom:10px;"
             data-friend-name="${escapeHtml(contactKey)}">
            <div style="display:flex;align-items:flex-start;gap:12px;">
                ${renderBondAvatar(displayName, 52)}
                <div style="min-width:0;flex:1;">
                    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
                        <span style="font-size:16px;font-weight:700;color:#1f2937;">${escapeHtml(displayName)}</span>
                        ${stream.live ? '<span style="font-size:10px;background:#8b5cf6;color:#fff;padding:2px 7px;border-radius:4px;font-weight:600;">直播中</span>' : ''}
                    </div>
                    <div style="display:flex;gap:12px;font-size:13px;margin-bottom:6px;">
                        <span style="color:#ef4470;font-weight:600;">❤ ${affection}</span>
                        <span style="color:#8b5cf6;font-weight:600;">✦ ${obedience}</span>
                        <span style="color:#d97706;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">☀ ${escapeHtml(mood)}</span>
                    </div>
                    <div style="font-size:12px;color:#6b7280;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        <span>📍</span><span style="overflow:hidden;text-overflow:ellipsis;">${escapeHtml(location)}</span>
                    </div>
                    ${stream.live ? `<div style="font-size:11px;color:#7c3aed;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📡 ${escapeHtml(stream.title || '直播中')} · 热度 ${stream.heat.toLocaleString('zh-CN')}</div>` : ''}
                </div>
            </div>
        </div>`;
}

function generateFriendsPanel(data) {
    const contactSource = getRelationshipDataSource(data);
    if (!contactSource) return '<div class="empty-message">暂无羁绊数据</div>';

    const contactEntries = getRelationshipKeys(contactSource)
        .map(key => ({ key, contact: contactSource[key] }))
        .filter(entry => entry.contact && typeof entry.contact === 'object')
        .sort((a, b) => {
            const liveA = getContactStream(a.contact).live;
            const liveB = getContactStream(b.contact).live;
            if (liveA !== liveB) return liveA ? -1 : 1;
            return getContactAffection(b.contact) - getContactAffection(a.contact);
        });

    if (!contactEntries.length) return '<div class="empty-message">暂无羁绊数据</div>';
    return `
        <div class="friend-list-container">
            <div class="friend-list-header" style="font-weight:600;font-size:12px;color:#6b7280;margin:8px 4px 12px;">羁绊对象 (${contactEntries.length})</div>
            <div class="friend-list-body">${contactEntries.map(({ key, contact }) => renderFriendListItem(key, contact)).join('')}</div>
        </div>`;
}

function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function restoreEraText(text) {
    if (!text) return '';
    return text.replace(/__DOT__/g, '.').replace(/__SQUOTE__/g, "'");
}

function showFriendDetail(friendName, friendData, isRestoring = false) {
    if (!isRestoring) friendDetailScrollPosition = 0;

    let appBodyElement = document.getElementById('phone-app-body') || $('#phone-app-body')[0] || null;
    if (appBodyElement) {
        friendsListScrollPosition = appBodyElement.scrollTop;
        const $friendItem = $(`.friend-item[data-friend-name="${friendName}"]`);
        if ($friendItem.length) {
            friendsListScrollPosition = Math.max(friendsListScrollPosition, $friendItem.position().top + appBodyElement.scrollTop);
        }
    } else {
        friendsListScrollPosition = 0;
    }

    lastViewedFriend = friendName;
    navigationStack.push({
        title: $('#phone-app-title').text(),
        content: $('#phone-app-body').html(),
        scrollPosition: friendsListScrollPosition,
    });

    const displayName = restoreEraText(friendName);
    const affection = getContactAffection(friendData);
    const obedience = getContactObedience(friendData);
    const mood = getContactMood(friendData) || '暂无记录';
    const location = getContactLocationText(friendData) || '位置未记录';
    const stream = getContactStream(friendData);
    const streamTitle = stream.live ? (stream.title || '直播中') : '当前未开播';

    const html = `
        <div id="friend-detail-scroll-container" style="padding:10px;max-height:calc(100vh - 200px);overflow-y:auto;">
            <div class="list-item" style="margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:13px;">
                    ${renderBondAvatar(displayName, 68)}
                    <div style="min-width:0;flex:1;">
                        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
                            <span style="font-size:18px;font-weight:700;color:#1f2937;">${escapeHtml(displayName)}</span>
                            <span style="font-size:10px;background:${stream.live ? '#8b5cf6' : '#9ca3af'};color:#fff;padding:2px 7px;border-radius:4px;font-weight:600;">${stream.live ? '直播中' : '未开播'}</span>
                        </div>
                        <div style="font-size:12px;color:#6b7280;margin-top:7px;line-height:1.5;">📍 ${escapeHtml(location)}</div>
                    </div>
                </div>
            </div>

            <div class="list-item" style="margin-bottom:12px;">
                <div class="list-item-header"><span class="list-item-name">💕 羁绊状态</span></div>
                <div class="list-item-desc">
                    <div style="display:flex;justify-content:space-around;padding:10px 0 12px;border-bottom:1px solid #e5e7eb;">
                        <div style="text-align:center;">
                            <div style="font-size:24px;font-weight:600;color:#ec4899;">❤ ${affection}</div>
                            <div style="font-size:11px;color:#9ca3af;margin-top:2px;">好感度</div>
                        </div>
                        <div style="text-align:center;">
                            <div style="font-size:24px;font-weight:600;color:#8b5cf6;">✦ ${obedience}</div>
                            <div style="font-size:11px;color:#9ca3af;margin-top:2px;">顺从度</div>
                        </div>
                    </div>
                    <div style="padding-top:10px;font-size:13px;color:#92400e;">☀️ 心情：${escapeHtml(mood)}</div>
                </div>
            </div>

            <div class="list-item" style="margin-bottom:12px;">
                <div class="list-item-header">
                    <span class="list-item-name">📡 直播状态</span>
                    <span class="list-item-value" style="color:${stream.live ? '#7c3aed' : '#9ca3af'};">${stream.live ? 'ON AIR' : 'OFFLINE'}</span>
                </div>
                <div class="list-item-desc" style="line-height:1.7;">
                    <div style="font-size:13px;color:#374151;">${escapeHtml(streamTitle)}</div>
                    ${stream.live ? `<div>热度：${stream.heat.toLocaleString('zh-CN')}</div>` : ''}
                    <div>粉丝：${stream.followers.toLocaleString('zh-CN')}</div>
                </div>
            </div>
        </div>`;

    $('#phone-app-title').text(`羁绊 · ${displayName}`);
    $('#phone-app-body').html(html);
    if (!isRestoring) $('#phone-app-body').css('opacity', '1');

    setTimeout(() => {
        const scrollContainer = document.getElementById('friend-detail-scroll-container') || $('#friend-detail-scroll-container')[0];
        if (scrollContainer) {
            scrollContainer.removeEventListener('scroll', handleDetailScroll);
            scrollContainer.addEventListener('scroll', handleDetailScroll, { passive: true });
        }
    }, 150);
}

function handleDetailScroll(event) {
    if (!event.target) return;
    friendDetailScrollPosition = event.target.scrollTop;
    if (!window._detailScrollLogTimer) {
        window._detailScrollLogTimer = setTimeout(() => { window._detailScrollLogTimer = null; }, 500);
    }
}