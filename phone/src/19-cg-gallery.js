// CG面板当前模式：'unlock'（一键解锁模式）或 'progress'（收藏进度模式）
let cgPanelMode = 'progress';
const CG_CHARACTER_PAGE_SIZE = 6;
const CG_UNLOCK_AFFECTION_REQUIREMENT = 800;
const CG_FAVORITES_STORAGE_KEY = 'dnf-phone-cg-favorite-characters';
let cgCharacterPage = 0;

function getCGFavoriteCharacters() {
    try {
        const raw = JSON.parse(localStorage.getItem(CG_FAVORITES_STORAGE_KEY) || '[]');
        return Array.isArray(raw) ? raw.filter(name => CG_LIST[name]) : [];
    } catch (e) {
        return [];
    }
}

function saveCGFavoriteCharacters(favorites) {
    try {
        const validFavorites = Array.from(new Set(favorites.filter(name => CG_LIST[name])));
        localStorage.setItem(CG_FAVORITES_STORAGE_KEY, JSON.stringify(validFavorites));
    } catch (e) {
        console.error('保存CG收藏角色失败:', e);
    }
}

function isCGCharacterFavorite(characterName) {
    return getCGFavoriteCharacters().includes(characterName);
}

function toggleCGCharacterFavorite(characterName) {
    const favorites = getCGFavoriteCharacters();
    const index = favorites.indexOf(characterName);
    if (index >= 0) {
        favorites.splice(index, 1);
    } else if (CG_LIST[characterName]) {
        favorites.unshift(characterName);
    }
    saveCGFavoriteCharacters(favorites);
}

function getSortedCGCharacters() {
    const characters = Object.keys(CG_LIST);
    const favoriteSet = new Set(getCGFavoriteCharacters());
    return characters.slice().sort((a, b) => {
        const favA = favoriteSet.has(a);
        const favB = favoriteSet.has(b);
        if (favA && !favB) return -1;
        if (!favA && favB) return 1;
        return characters.indexOf(a) - characters.indexOf(b);
    });
}

const CG_COVER_NAME_MAP = {
    // The image host stores this cover under the character's full display name.
    '璃亚梦': '梦见璃亚梦',
};

function getCGCharacterCover(characterName) {
    const coverName = CG_COVER_NAME_MAP[characterName] || characterName;
    return `${CG_BASE_URL}%E5%B0%81%E9%9D%A2/${encodeURIComponent(coverName)}.webp`;
}

/**
 * 切换CG面板模式
 */
function toggleCGPanelMode() {
    cgPanelMode = cgPanelMode === 'progress' ? 'unlock' : 'progress';
    // 重新渲染CG面板
    if (currentPanel === 'gallery') {
        const content = generateGalleryPanel(currentPhoneData);
        $('#phone-app-body').html(content);
        // 重新绑定事件需要在openAppPanel中处理
        bindCGGalleryEvents();
    }
}

/**
 * 绑定CG画廊事件（抽取出来方便重用）
 */
function bindCGGalleryEvents() {
    const $appBody = $('#phone-app-body');
    if ($appBody.length === 0) return;

    // 重置滚动位置到顶部，确保用户能看到模式切换按钮
    // $appBody.scrollTop(0); // 用户要求移除强制置顶

    $appBody.off('click.cggallery');

    // 模式切换按钮
    $appBody.on('click.cggallery', '.cg-mode-segment', function (e) {
        e.stopPropagation();
        const mode = $(this).data('mode');
        if (mode !== cgPanelMode) {
            toggleCGPanelMode();
        }
    });

    // 角色封面卡：进入该角色CG列表
    $appBody.on('click.cggallery', '.cg-character-card', function (e) {
        if ($(e.target).closest('.cg-favorite-btn, .cg-unlock-btn').length) return;
        e.stopPropagation();
        const char = $(this).data('character');
        if (char) {
            showCGCharacterDetail(char);
        }
    });

    // 爱心收藏/取消收藏，收藏角色自动置顶
    $appBody.on('click.cggallery', '.cg-favorite-btn', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const char = $(this).data('character');
        if (!char) return;
        const wasFavorite = isCGCharacterFavorite(char);
        toggleCGCharacterFavorite(char);
        if (!wasFavorite) {
            cgCharacterPage = 0;
        }
        const content = generateGalleryPanel(currentPhoneData);
        $('#phone-app-body').html(content);
        bindCGGalleryEvents();
    });

    // 角色封面列表翻页
    $appBody.on('click.cggallery', '.cg-page-btn', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const direction = $(this).data('direction');
        const total = getSortedCGCharacters().length;
        const pageCount = Math.max(1, Math.ceil(total / CG_CHARACTER_PAGE_SIZE));
        if (direction === 'prev' && cgCharacterPage > 0) {
            cgCharacterPage--;
        } else if (direction === 'next' && cgCharacterPage < pageCount - 1) {
            cgCharacterPage++;
        }
        const content = generateGalleryPanel(currentPhoneData);
        $('#phone-app-body').html(content);
        bindCGGalleryEvents();
    });

    // 展开/收起详情列表
    $appBody.on('click.cggallery', '.cg-toggle-details-btn', function (e) {
        e.stopPropagation();
        const $btn = $(this);
        const $list = $btn.next('.cg-details-list');
        const $icon = $btn.find('.fa-chevron-down');

        $list.slideToggle(200, function () {
            if ($list.is(':visible')) {
                $icon.css('transform', 'rotate(180deg)');
            } else {
                $icon.css('transform', 'rotate(0deg)');
            }
        });
        $btn.toggleClass('active');
    });

    // 一键解锁按钮
    $appBody.on('click.cggallery', '.cg-unlock-btn', function (e) {
        e.stopPropagation();
        const char = $(this).data('character');
        const affection = getCharacterAffection(char);

        if (affection < CG_UNLOCK_AFFECTION_REQUIREMENT) {
            if (typeof toastr !== 'undefined') {
                toastr.warning(`${char} 的好感度需达到 ${CG_UNLOCK_AFFECTION_REQUIREMENT} 才能一键解锁！`);
            } else {
                alert(`${char} 的好感度需达到 ${CG_UNLOCK_AFFECTION_REQUIREMENT} 才能一键解锁！`);
            }
            return;
        }

        // 关键修改：传入 true 表示虚拟解锁，不记录入真实存档
        const unlockedCount = unlockAllCGForCharacter(char, true);

        if (typeof toastr !== 'undefined') {
            toastr.success(`已开启 ${char} 的预览权限`);
        }

        // 刷新面板
        const isInDetail = $(this).closest('.cg-character-detail-container').length > 0;
        const content = isInDetail ? generateCGCharacterDetailPanel(char, currentPhoneData) : generateGalleryPanel(currentPhoneData);
        $('#phone-app-body').html(content);
        bindCGGalleryEvents();

        // 保持展开状态
        if (cgPanelMode === 'unlock' && !isInDetail) {
            $('.cg-details-list').show();
            $('.cg-toggle-details-btn').find('.fa-chevron-down').css('transform', 'rotate(180deg)');
            $('.cg-toggle-details-btn').addClass('active');
        }
    });

    // 已解锁CG点击切换图片编号
    $appBody.on('click.cggallery', '.cg-item.unlocked .cg-switch-btn', function (e) {
        e.stopPropagation();
        const $item = $(this).closest('.cg-item');
        const char = $item.data('character');
        const scene = $item.data('scene');
        const max = parseInt($item.data('max'));
        let current = parseInt($item.data('current'));

        current = current >= max ? 1 : current + 1;
        $item.data('current', current);

        const newUrl = getCGImageUrl(char, scene, current);
        $item.find('img').attr('src', newUrl).show();
        $item.find('img').next().hide();

        $(this).text(`${current}/${max}`);
    });

    // 点击已解锁CG查看大图
    $appBody.on('click.cggallery', '.cg-item.unlocked', function (e) {
        if ($(e.target).closest('.cg-switch-btn').length) return;

        const char = $(this).data('character');
        const scene = $(this).data('scene');
        const current = parseInt($(this).data('current')) || 1;
        const imgUrl = getCGImageUrl(char, scene, current);

        showCGFullscreen(imgUrl, char, scene, current);
    });
}

/**
 * 生成CG图片URL
 */
function getCGImageUrl(characterName, sceneType, index = 1) {
    const folder = SFW_SCENES.has(sceneType) ? 'SFW' : 'NSFW';
    const path = `${folder}/${characterName}/${sceneType}${index}.webp`;
    return CG_BASE_URL + encodeURIComponent(path).replace(/%2F/g, '/');
}

/**
 * 生成CG收集面板
 */
function generateGalleryPanel(data) {
    const stats = getCGCollectionStats();
    const displayUnlockedCG = getUnlockedCG(cgPanelMode === 'unlock');
    const relationshipSource = getRelationshipDataSource(data);
    const characters = getSortedCGCharacters();
    const isProgressMode = cgPanelMode === 'progress';
    const favoriteSet = new Set(getCGFavoriteCharacters());
    const pageCount = Math.max(1, Math.ceil(characters.length / CG_CHARACTER_PAGE_SIZE));

    if (cgCharacterPage < 0) cgCharacterPage = 0;
    if (cgCharacterPage >= pageCount) cgCharacterPage = pageCount - 1;

    const pageStart = cgCharacterPage * CG_CHARACTER_PAGE_SIZE;
    const pageCharacters = characters.slice(pageStart, pageStart + CG_CHARACTER_PAGE_SIZE);

    let html = `<div class="cg-gallery-container" style="padding: 14px 14px 78px 14px; background: #f8fafc; min-height: 100%; box-sizing: border-box;">`;
    html += renderCGGalleryStyles();

    html += `
        <div style="
            background: #e2e8f0; 
            border-radius: 10px; 
            padding: 3px; 
            display: flex; 
            margin-bottom: 20px;
            position: relative;
        ">
            <div data-mode="progress" class="cg-mode-segment" style="
                flex: 1; text-align: center; padding: 10px 0; font-size: 13px; font-weight: 600; cursor: pointer; border-radius: 8px; z-index: 1; transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                ${isProgressMode ? 'background: #fff; color: #0f172a; box-shadow: 0 2px 4px rgba(0,0,0,0.06); transform: scale(1);' : 'color: #64748b; transform: scale(0.98);'}
            ">收藏进度</div>
            <div data-mode="unlock" class="cg-mode-segment" style="
                flex: 1; text-align: center; padding: 10px 0; font-size: 13px; font-weight: 600; cursor: pointer; border-radius: 8px; z-index: 1; transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                ${!isProgressMode ? 'background: #fff; color: #0f172a; box-shadow: 0 2px 4px rgba(0,0,0,0.06); transform: scale(1);' : 'color: #64748b; transform: scale(0.98);'}
            ">一键解锁</div>
        </div>
    `;

    if (isProgressMode) {
        html += `
            <div class="cg-toggle-details-btn" style="
                background: white; border-radius: 16px; padding: 22px; 
                box-shadow: 0 4px 20px rgba(0,0,0,0.03); border: 1px solid #f1f5f9;
                margin-bottom: 20px; cursor: pointer; position: relative; overflow: hidden;
            ">
                <!-- 装饰性背景光晕 -->
                <div style="position: absolute; top: -20px; right: -20px; width: 100px; height: 100px; background: radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%); border-radius: 50%;"></div>
                
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 14px; position: relative; z-index: 2;">
                    <div>
                        <div style="font-size: 13px; color: #64748b; margin-bottom: 6px; font-weight: 500;">当前收集总览</div>
                        <div style="font-size: 32px; font-weight: 800; color: #0f172a; line-height: 1; letter-spacing: -0.5px;">${stats.total.percentage}<span style="font-size: 16px; color: #94a3b8; font-weight: 600; margin-left: 2px;">%</span></div>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-size: 12px; color: #94a3b8; font-weight: 500;">详情</span>
                        <i class="fas fa-chevron-down" style="font-size: 12px; color: #94a3b8; margin-left: 6px; transition: transform 0.3s;"></i>
                    </div>
                </div>
                <div style="background: #f1f5f9; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 10px;">
                    <div style="background: linear-gradient(90deg, #3b82f6, #60a5fa); width: ${stats.total.percentage}%; height: 100%; border-radius: 4px; box-shadow: 0 1px 2px rgba(59, 130, 246, 0.2);"></div>
                </div>
                <div style="font-size: 12px; color: #64748b; font-weight: 500; display: flex; justify-content: space-between;">
                    <span>已解锁场景</span>
                    <span style="color: #0f172a; font-weight: 700;">${stats.total.unlocked} <span style="color: #cbd5e1; font-weight: 400;">/</span> ${stats.total.total}</span>
                </div>
            </div>
        `;

        html += `<div class="cg-details-list" style="display: none; margin-bottom: 24px; background: white; border-radius: 16px; padding: 8px 0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);">`;
        characters.forEach(char => {
            const charStats = stats.characters[char];
            const affection = getCharacterAffection(char, relationshipSource);
            html += `
                <div style="
                    display: flex; align-items: center; padding: 14px 16px; 
                    border-bottom: 1px solid #f8fafc;
                ">
                    <div style="width: 85px; font-weight: 700; color: #334155; font-size: 14px;">
                        ${escapeHtml(char)}
                        <div style="font-size: 11px; color: #94a3b8; font-weight: 500; margin-top: 2px;">${charStats.unlocked}/${charStats.total}</div>
                    </div>
                    <div style="flex: 1; padding: 0 8px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <!-- 红色爱心 -->
                            <span style="font-size: 12px; color: #f43f5e; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                                <i class="fas fa-heart"></i> ${affection}
                            </span>
                            <span style="font-size: 12px; color: #64748b; font-weight: 600;">${charStats.percentage}%</span>
                        </div>
                        <div style="background: #f1f5f9; height: 6px; border-radius: 3px; overflow: hidden;">
                            <div style="background: ${charStats.percentage === 100 ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #3b82f6, #60a5fa)'}; width: ${charStats.percentage}%; height: 100%;"></div>
                        </div>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    if (!isProgressMode) {
        html += `
            <div class="cg-toggle-details-btn" style="
                background: white; border-radius: 16px; padding: 18px; 
                box-shadow: 0 4px 20px rgba(0,0,0,0.03); border: 1px solid #f1f5f9;
                margin-bottom: 20px; cursor: pointer; display: flex; align-items: center; justify-content: space-between;
            ">
                <div style="display: flex; align-items: center; gap: 14px;">
                    <div style="width: 36px; height: 36px; border-radius: 10px; background: #fff7ed; display: flex; align-items: center; justify-content: center; color: #f97316; box-shadow: 0 2px 5px rgba(249, 115, 22, 0.1);">
                        <i class="fas fa-unlock-alt" style="font-size: 16px;"></i>
                    </div>
                    <div>
                        <div style="font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 2px;">开启CG预览权限</div>
                        <div style="font-size: 11px; color: #94a3b8;">需好感度 ≥ ${CG_UNLOCK_AFFECTION_REQUIREMENT}，不影响真实收集度</div>
                    </div>
                </div>
                <i class="fas fa-chevron-down" style="font-size: 12px; color: #cbd5e1; transition: transform 0.3s;"></i>
            </div>
        `;

        html += `<div class="cg-details-list" style="display: none; margin-bottom: 24px; background: white; border-radius: 16px; padding: 8px 0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);">`;
        characters.forEach(char => {
            const charStats = stats.characters[char];
            const affection = getCharacterAffection(char, relationshipSource);
            const canUnlock = affection >= CG_UNLOCK_AFFECTION_REQUIREMENT;

            const charUnlockedMap = displayUnlockedCG[char] || {};
            const totalScenes = Object.keys(CG_LIST[char]).length;
            const currentUnlockedCount = Object.keys(charUnlockedMap).length;
            const isUnlockedModeActive = currentUnlockedCount >= totalScenes;

            let btnState = '';
            if (isUnlockedModeActive) {
                btnState = `<span style="color: #10b981; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 4px;"><i class="fas fa-check-circle"></i> 已开启</span>`;
            } else if (canUnlock) {
                btnState = `
                    <button class="cg-unlock-btn" data-character="${escapeHtml(char)}" style="
                        background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); 
                        color: white; border: none; padding: 6px 14px; 
                        border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;
                        box-shadow: 0 2px 6px rgba(234, 88, 12, 0.25); transition: transform 0.1s;
                    ">开启</button>
                `;
            } else {
                btnState = `<span style="color: #cbd5e1; font-size: 12px; font-weight: 500;">好感不足</span>`;
            }

            html += `
                <div style="
                    display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; 
                    border-bottom: 1px solid #f8fafc;
                ">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div>
                            <span style="font-weight: 700; color: #334155; font-size: 14px; display: block;">${escapeHtml(char)}</span>
                            <span style="font-size: 11px; color: #94a3b8; font-weight: 500;">真实进度: ${charStats.unlocked}/${charStats.total}</span>
                        </div>
                        <span style="
                            font-size: 11px; 
                            color: ${affection >= CG_UNLOCK_AFFECTION_REQUIREMENT ? '#f43f5e' : '#94a3b8'}; 
                            background: ${affection >= CG_UNLOCK_AFFECTION_REQUIREMENT ? '#fff1f2' : '#f1f5f9'}; 
                            padding: 3px 8px; border-radius: 12px; font-weight: 600;
                            height: fit-content;
                        ">
                            ❤ ${affection}
                        </span>
                    </div>
                    <div>${btnState}</div>
                </div>
            `;
        });
        html += `</div>`;
    }

    html += `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin: 10px 2px 12px;">
            <div>
                <div style="font-size:16px; font-weight:800; color:#0f172a;">角色图鉴</div>
                <div style="font-size:11px; color:#94a3b8; margin-top:2px;">${characters.length} 人</div>
            </div>
            <div style="font-size:12px; color:#64748b; font-weight:700;">${cgCharacterPage + 1} / ${pageCount}</div>
        </div>
        <div class="cg-character-card-grid">
    `;

    pageCharacters.forEach(char => {
        const charStats = stats.characters[char];
        const affection = getCharacterAffection(char, relationshipSource);
        const isFavorite = favoriteSet.has(char);
        const charUnlockedMap = displayUnlockedCG[char] || {};
        const totalScenes = Object.keys(CG_LIST[char]).length;
        const currentUnlockedCount = Object.keys(charUnlockedMap).length;
        const isPreviewActive = currentUnlockedCount >= totalScenes;
        const canUnlock = affection >= CG_UNLOCK_AFFECTION_REQUIREMENT;
        const coverUrl = getCGCharacterCover(char);
        const fallbackInitial = escapeHtml(char.charAt(0));
        let unlockStateHtml = '';

        if (!isProgressMode) {
            if (isPreviewActive) {
                unlockStateHtml = `<span class="cg-card-pill cg-card-pill-ok"><i class="fas fa-check-circle"></i> 已开启</span>`;
            } else if (canUnlock) {
                unlockStateHtml = `<button class="cg-unlock-btn cg-card-unlock-btn" data-character="${escapeHtml(char)}">开启</button>`;
            } else {
                unlockStateHtml = `<span class="cg-card-pill">好感不足</span>`;
            }
        }

        html += `
            <div class="cg-character-card" data-character="${escapeHtml(char)}">
                <button class="cg-favorite-btn ${isFavorite ? 'active' : ''}" data-character="${escapeHtml(char)}" title="${isFavorite ? '取消收藏' : '收藏置顶'}">
                    <i class="fas fa-heart"></i>
                </button>
                <div class="cg-character-cover">
                    <img src="${coverUrl}" alt="${escapeHtml(char)}" decoding="async"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="cg-character-cover-fallback">${fallbackInitial}</div>
                </div>
                <div class="cg-character-info">
                    <div class="cg-character-name">${escapeHtml(char)}</div>
                    <div class="cg-character-meta">
                        <span><i class="fas fa-images"></i> ${charStats.unlocked}/${charStats.total}</span>
                        <span><i class="fas fa-heart"></i> ${affection}</span>
                    </div>
                    <div class="cg-character-progress">
                        <div style="width:${charStats.percentage}%;"></div>
                    </div>
                    ${unlockStateHtml ? `<div class="cg-character-action-row">${unlockStateHtml}</div>` : ''}
                </div>
            </div>
        `;
    });

    html += `</div>`;

    if (pageCount > 1) {
        html += `
            <div class="cg-pagination">
                <button class="cg-page-btn" data-direction="prev" ${cgCharacterPage === 0 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i> 上一页
                </button>
                <span>${cgCharacterPage + 1} / ${pageCount}</span>
                <button class="cg-page-btn" data-direction="next" ${cgCharacterPage >= pageCount - 1 ? 'disabled' : ''}>
                    下一页 <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        `;
    }

    html += `</div>`;
    return html;
}

function renderCGGalleryStyles() {
    return `
        <style>
            .cg-character-card-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 14px;
            }
            .cg-character-card {
                position: relative;
                min-width: 0;
                overflow: hidden;
                border: 2px solid transparent;
                border-radius: 12px;
                background: #fff;
                cursor: pointer;
                box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
                transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
            }
            .cg-character-card:hover {
                transform: translateY(-4px);
                border-color: rgba(59, 130, 246, 0.45);
                box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
            }
            .cg-favorite-btn {
                position: absolute;
                top: 8px;
                right: 8px;
                z-index: 4;
                width: 30px;
                height: 30px;
                border: 1px solid rgba(255, 255, 255, 0.65);
                border-radius: 50%;
                background: rgba(15, 23, 42, 0.38);
                color: rgba(255, 255, 255, 0.9);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(15, 23, 42, 0.18);
                backdrop-filter: blur(6px);
                transition: transform 0.18s ease, background 0.18s ease, color 0.18s ease;
            }
            .cg-favorite-btn:hover {
                transform: scale(1.08);
                background: rgba(225, 29, 72, 0.92);
                color: #fff;
            }
            .cg-favorite-btn.active {
                background: #fff;
                border-color: #fff;
                color: #e11d48;
            }
            .cg-character-cover {
                position: relative;
                width: 100%;
                aspect-ratio: 3 / 4;
                overflow: hidden;
                background: #e2e8f0;
            }
            .cg-character-cover img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                object-position: top center;
                display: block;
                transition: transform 0.35s ease;
            }
            .cg-character-card:hover .cg-character-cover img {
                transform: scale(1.06);
            }
            .cg-character-cover-fallback {
                display: none;
                width: 100%;
                height: 100%;
                align-items: center;
                justify-content: center;
                background: linear-gradient(135deg, #64748b, #334155);
                color: #fff;
                font-size: 34px;
                font-weight: 800;
            }
            .cg-character-info {
                position: relative;
                z-index: 2;
                margin-top: -18px;
                padding: 11px 10px 12px;
                border-radius: 12px 12px 0 0;
                background: linear-gradient(to top, #fff 70%, rgba(255, 255, 255, 0.94));
            }
            .cg-character-name {
                min-width: 0;
                overflow: hidden;
                color: #0f172a;
                font-size: 15px;
                font-weight: 800;
                text-align: center;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .cg-character-meta {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 7px;
                margin-top: 7px;
                color: #64748b;
                font-size: 11px;
                font-weight: 700;
            }
            .cg-character-meta span {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                min-width: 0;
            }
            .cg-character-meta .fa-heart {
                color: #e11d48;
            }
            .cg-character-progress {
                height: 5px;
                margin-top: 9px;
                overflow: hidden;
                border-radius: 999px;
                background: #e2e8f0;
            }
            .cg-character-progress > div {
                height: 100%;
                border-radius: inherit;
                background: linear-gradient(90deg, #3b82f6, #10b981);
            }
            .cg-character-action-row {
                display: flex;
                justify-content: center;
                margin-top: 9px;
                min-height: 24px;
            }
            .cg-card-pill,
            .cg-card-unlock-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
                min-height: 24px;
                padding: 0 9px;
                border: none;
                border-radius: 999px;
                background: #f1f5f9;
                color: #94a3b8;
                font-size: 11px;
                font-weight: 800;
                white-space: nowrap;
            }
            .cg-card-pill-ok {
                background: #ecfdf5;
                color: #059669;
            }
            .cg-card-unlock-btn {
                background: linear-gradient(135deg, #f97316, #ea580c);
                color: #fff;
                cursor: pointer;
                box-shadow: 0 3px 8px rgba(234, 88, 12, 0.24);
            }
            .cg-pagination {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
                margin-top: 18px;
                color: #64748b;
                font-size: 13px;
                font-weight: 800;
            }
            .cg-page-btn {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                min-height: 34px;
                padding: 0 12px;
                border: 1px solid #dbe3ef;
                border-radius: 10px;
                background: #fff;
                color: #2563eb;
                font-size: 12px;
                font-weight: 800;
                cursor: pointer;
                box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
            }
            .cg-page-btn:disabled {
                cursor: not-allowed;
                opacity: 0.42;
            }
        </style>
    `;
}

function renderCGSceneGrid(characterName, scenes, charUnlocked) {
    let html = `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">`;

    Object.entries(scenes).forEach(([sceneType, maxCount]) => {
        const isUnlocked = sceneType in charUnlocked;

        if (isUnlocked) {
            const imgUrl = getCGImageUrl(characterName, sceneType, 1);
            html += `
                <div class="cg-item unlocked" data-character="${escapeHtml(characterName)}" data-scene="${escapeHtml(sceneType)}" data-max="${maxCount}" data-current="1"
                    style="
                        aspect-ratio: 3/4; border-radius: 8px; overflow: hidden; position: relative; cursor: pointer; 
                        background: #e2e8f0; box-shadow: 0 2px 6px rgba(0,0,0,0.1);
                    ">
                    <img src="${imgUrl}" alt="${escapeHtml(sceneType)}" 
                        style="width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.5s;" 
                        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center; color: #94a3b8; font-size: 10px;">加载失败</div>
                    ${maxCount > 1 ? `
                        <div class="cg-switch-btn" style="
                            position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,0.6); backdrop-filter: blur(2px);
                            color: white; font-size: 9px; padding: 2px 8px; border-radius: 12px; font-weight: 600;
                        ">1/${maxCount}</div>
                    ` : ''}
                    <div style="
                        position: absolute; bottom: 0; left: 0; right: 0; 
                        background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%);
                        color: white; font-size: 11px; padding: 16px 8px 6px 8px; font-weight: 500;
                        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                    ">${escapeHtml(sceneType)}</div>
                </div>
            `;
        } else {
            html += `
                <div class="cg-item locked" style="
                    aspect-ratio: 3/4; border-radius: 8px; background: #f8fafc; 
                    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
                    border: 1px dashed #cbd5e1; color: #cbd5e1;
                ">
                    <i class="fas fa-lock" style="font-size: 18px;"></i>
                    <span style="font-size: 10px; font-weight: 500;">locked</span>
                </div>
            `;
        }
    });

    html += `</div>`;
    return html;
}

function generateCGCharacterDetailPanel(characterName, data) {
    const scenes = CG_LIST[characterName];
    if (!scenes) {
        return '<div class="empty-message">未找到该角色CG数据</div>';
    }

    const stats = getCGCollectionStats();
    const displayUnlockedCG = getUnlockedCG(cgPanelMode === 'unlock');
    const relationshipSource = getRelationshipDataSource(data);
    const charStats = stats.characters[characterName] || { unlocked: 0, total: Object.keys(scenes).length, percentage: 0 };
    const charUnlocked = displayUnlockedCG[characterName] || {};
    const affection = getCharacterAffection(characterName, relationshipSource);
    const coverUrl = getCGCharacterCover(characterName);
    const totalScenes = Object.keys(scenes).length;
    const currentUnlockedCount = Object.keys(charUnlocked).length;
    const isPreviewActive = currentUnlockedCount >= totalScenes;
    const canUnlock = affection >= CG_UNLOCK_AFFECTION_REQUIREMENT;

    let unlockHtml = '';
    if (cgPanelMode === 'unlock') {
        if (isPreviewActive) {
            unlockHtml = `<span style="display:inline-flex;align-items:center;gap:6px;color:#059669;background:#ecfdf5;border-radius:999px;padding:7px 12px;font-size:12px;font-weight:800;"><i class="fas fa-check-circle"></i> 已开启预览</span>`;
        } else if (canUnlock) {
            unlockHtml = `<button class="cg-unlock-btn" data-character="${escapeHtml(characterName)}" style="border:none;border-radius:999px;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;padding:8px 14px;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 3px 8px rgba(234,88,12,0.24);">开启预览</button>`;
        } else {
            unlockHtml = `<span style="display:inline-flex;align-items:center;gap:6px;color:#94a3b8;background:#f1f5f9;border-radius:999px;padding:7px 12px;font-size:12px;font-weight:800;">好感不足</span>`;
        }
    }

    return `
        <div class="cg-character-detail-container" style="padding: 14px 14px 78px 14px; background: #f8fafc; min-height: 100%; box-sizing: border-box;">
            <div style="background:#fff;border-radius:14px;padding:12px;margin-bottom:14px;box-shadow:0 6px 18px rgba(15,23,42,0.08);display:flex;gap:12px;align-items:center;">
                <div style="width:82px;aspect-ratio:3/4;border-radius:10px;overflow:hidden;background:#e2e8f0;flex-shrink:0;">
                    <img src="${coverUrl}" alt="${escapeHtml(characterName)}" decoding="async" style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block;"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;background:linear-gradient(135deg,#64748b,#334155);color:#fff;font-size:28px;font-weight:800;">${escapeHtml(characterName.charAt(0))}</div>
                </div>
                <div style="min-width:0;flex:1;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
                        <div style="font-size:18px;font-weight:800;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(characterName)}</div>
                        <span style="font-size:12px;color:#64748b;font-weight:800;white-space:nowrap;">${charStats.percentage}%</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:#64748b;font-weight:700;margin-bottom:9px;">
                        <span><i class="fas fa-images" style="color:#2563eb;"></i> ${charStats.unlocked}/${charStats.total}</span>
                        <span><i class="fas fa-heart" style="color:#e11d48;"></i> ${affection}</span>
                    </div>
                    <div style="height:7px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
                        <div style="height:100%;width:${charStats.percentage}%;background:linear-gradient(90deg,#3b82f6,#10b981);border-radius:inherit;"></div>
                    </div>
                    ${unlockHtml ? `<div style="margin-top:10px;">${unlockHtml}</div>` : ''}
                </div>
            </div>
            ${renderCGSceneGrid(characterName, scenes, charUnlocked)}
        </div>
    `;
}

function showCGCharacterDetail(characterName) {
    const appBodyElement = document.getElementById('phone-app-body');
    navigationStack.push({
        title: $('#phone-app-title').text(),
        content: $('#phone-app-body').html(),
        scrollPosition: appBodyElement ? appBodyElement.scrollTop : 0
    });

    $('#phone-app-title').text(`🖼️ ${characterName}`);
    $('#phone-app-body').html(generateCGCharacterDetailPanel(characterName, currentPhoneData));
    $('#phone-app-body').scrollTop(0);
    bindCGGalleryEvents();
}

