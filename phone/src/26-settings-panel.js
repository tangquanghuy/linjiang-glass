function generateSettingsPanel(data) {
    let html = '<div style="padding: 10px 0;">';

    // 壁纸设置
    html += `
        <div style="margin-bottom: 20px;">
            <div style="font-size: 14px; font-weight: 600; color: #2d3748; margin-bottom: 12px; padding: 0 5px;">
                 壁纸设置
            </div>
            
            <!-- 默认壁纸按钮 -->
            <div class="list-item default-wallpaper-btn" style="cursor: pointer; user-select: none; margin-bottom: 12px;">
                <div class="list-item-header">
                    <span class="list-item-name">
                        <i class="fas fa-undo" style="margin-right: 8px; color: #3B82F6;"></i>
                        恢复默认壁纸
                    </span>
                    <span style="color: #9ca3af; font-size: 12px;">
                        <i class="fas fa-chevron-right"></i>
                    </span>
                </div>
            </div>
            
            <!-- 上传壁纸按钮 -->
            <div class="list-item upload-wallpaper-btn" style="cursor: pointer; user-select: none; margin-bottom: 12px;">
                <div class="list-item-header">
                    <span class="list-item-name">
                        <i class="fas fa-upload" style="margin-right: 8px; color: #10B981;"></i>
                        上传自定义壁纸
                    </span>
                    <span style="color: #9ca3af; font-size: 12px;">
                        <i class="fas fa-chevron-right"></i>
                    </span>
                </div>
            </div>
            
            <!-- 隐藏的文件输入框 -->
            <input type="file" id="wallpaper-upload-input" accept="image/*" style="display: none;">
    `;

    // 遍历壁纸分类
    for (const [categoryName, images] of Object.entries(phoneWpCategories)) {
        const isLoaded = phoneWpLoaded.has(categoryName);

        html += `
            <div class="wallpaper-category" data-category="${categoryName}" style="margin-bottom: 12px;">
                <div class="list-item" style="cursor: pointer; user-select: none;">
                    <div class="list-item-header wallpaper-category-header" data-category="${categoryName}">
                        <span class="list-item-name">
                            <i class="fas fa-image" style="margin-right: 8px; color: #9C27B0;"></i>
                            ${categoryName}
                        </span>
                        <span style="color: #9ca3af; font-size: 12px;">
                            <i class="fas fa-chevron-${isLoaded ? 'up' : 'down'}"></i>
                        </span>
                    </div>
                </div>
                <div class="wallpaper-category-images" data-category="${categoryName}" style="display: ${isLoaded ? 'block' : 'none'}; padding: 10px;">
        `;

        if (isLoaded) {
            // 已加载，显示图片网格
            html += '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">';
            images.forEach((url, index) => {
                html += `
                    <div class="wallpaper-item" data-wallpaper-url="${url}" 
                         style="cursor: pointer; position: relative; padding-bottom: 133%; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <img src="${url}" 
                             style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s;"
                             onmouseover="this.style.transform='scale(1.05)'"
                             onmouseout="this.style.transform='scale(1)'"
                             onerror="this.parentElement.innerHTML='<div style=\\'position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f0f0f0;color:#999;\\'>加载失败</div>'"
                        />
                    </div>
                `;
            });
            html += '</div>';
        } else {
            // 未加载，显示加载提示
            html += `
                <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 13px;">
                    <i class="fas fa-image" style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;"></i>
                    <div>点击展开查看壁纸</div>
                </div>
            `;
        }

        html += `
                </div>
            </div>
        `;
    }

    html += '</div>'; // 结束壁纸设置区域
    html += '</div>';

    return html;
}

// 生成尺寸设置面板
/* 尺寸设置：iOS 分组表单（一张卡里若干行，标签在左、输入在右），
   样式全在 css/forms.css，这里不再写内联样式。 */
function generateSizeSettingsPanel() {
    /* 没存过尺寸时显示 CSS 里的默认机型（390×844），跟机身比例保持一致 */
    const currentWidth = parseInt(localStorage.getItem('mobile-phone-width')) || 390;
    const currentHeight = parseInt(localStorage.getItem('mobile-phone-height')) || 844;

    const presets = [
        { label: 'iPhone 15', w: 393, h: 852 },
        { label: 'iPhone 13', w: 390, h: 844 },
        { label: 'iPhone SE', w: 375, h: 667 },
        { label: 'Android', w: 360, h: 800 },
    ];

    const presetHtml = presets.map(p => `
        <button type="button" class="phone-size-preset-btn ph-chip" data-width="${p.w}" data-height="${p.h}">
            <span class="ph-chip-title">${p.label}</span>
            <span class="ph-chip-sub">${p.w}×${p.h}</span>
        </button>
    `).join('');

    return `
        <div class="ph-section-title">手机尺寸</div>
        <div class="ph-group">
            <div class="ph-field">
                <label class="ph-field-label" for="phone-width-input">宽度</label>
                <input class="ph-field-input" type="number" id="phone-width-input" value="${currentWidth}" min="320" max="600" step="1" inputmode="numeric">
                <span class="ph-field-unit">px</span>
            </div>
            <div class="ph-field">
                <label class="ph-field-label" for="phone-height-input">高度</label>
                <input class="ph-field-input" type="number" id="phone-height-input" value="${currentHeight}" min="500" max="900" step="1" inputmode="numeric">
                <span class="ph-field-unit">px</span>
            </div>
        </div>
        <div class="ph-group-footnote">宽 320–600，高 500–900。点「恢复默认」回到 390×844 的机身比例。</div>

        <div class="ph-section-title">常用机型</div>
        <div class="ph-chip-grid">${presetHtml}</div>

        <button type="button" class="phone-size-apply-btn ph-btn ph-btn--filled">应用设置</button>
        <button type="button" class="phone-size-reset-btn ph-btn ph-btn--plain">恢复默认</button>
    `;
}

