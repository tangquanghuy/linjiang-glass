// ==================== 初始化函数 ====================
function initializeMobilePhone() {

    //  论坛设置相关函数（在initializeMobilePhone中重新定义，确保作用域一致）
    window.phoneOpenForumSettings = function () {

        //  注意：返回时会重新生成论坛面板，所以不需要保存导航栈
        // 清空导航栈，确保不会有旧的导航历史干扰
        navigationStack.length = 0;

        const manager = window.phoneForumManager;
        const settings = manager.settings;
        const apiConfig = manager.apiConfig.settings;

        const html = `
            <div style="padding: 12px;">
                <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #2d3748;"> 论坛设置</h3>
                
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #4a5568; font-weight: 500;"> 论坛风格</label>
                    <select id="forum-style" style="width: 100%; padding: 8px; background: white; border: 1px solid #cbd5e0; border-radius: 4px; color: #2d3748;">
                        ${BUILTIN_FORUM_STYLES.map(style =>
                            `<option value="${style}" ${settings.forumStyle === style ? 'selected' : ''}>${style}</option>`
                        ).join('')}
                        ${settings.customStyles && settings.customStyles.length > 0 ? settings.customStyles.map(style =>
            `<option value="custom:${style.name}" ${settings.forumStyle === `custom:${style.name}` ? 'selected' : ''}>${style.name}</option>`
        ).join('') : ''}
                    </select>
                </div>
                
                <!-- 使用预设和世界书选项 -->
                <div style="margin-bottom: 16px;">
                    <label style="display: flex; align-items: center; cursor: pointer; padding: 10px; background: #f7fafc; border: 1px solid #cbd5e0; border-radius: 4px;">
                        <input type="checkbox" id="use-preset-worldbook" ${settings.usePresetAndWorldBook ? 'checked' : ''} style="margin-right: 8px; width: 16px; height: 16px; cursor: pointer;">
                        <span style="font-size: 12px; color: #2d3748; font-weight: 500;">📚 使用预设和世界书</span>
                    </label>
                    <small style="display: block; margin-top: 4px; padding-left: 24px; font-size: 10px; color: #718096;">
                        启用后将使用酒馆当前预设及世界书；关闭后仅使用聊天历史和自定义提示词
                    </small>
                </div>
                
                <!-- API类型选择 -->
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #4a5568; font-weight: 500;"> API类型</label>
                    <select id="forum-api-type" style="width: 100%; padding: 8px; background: white; border: 1px solid #cbd5e0; border-radius: 4px; color: #2d3748;">
                        <option value="sillytavern" ${!apiConfig.enabled && settings.apiType === 'sillytavern' ? 'selected' : ''}>SillyTavern 默认</option>
                        <option value="custom" ${apiConfig.enabled || settings.apiType === 'custom' ? 'selected' : ''}>自定义 API（独立配置）</option>
                    </select>
                </div>
                
                <!-- 自定义 API 配置面板（独立配置） -->
                <div id="custom-api-settings" style="display: ${apiConfig.enabled || settings.apiType === 'custom' ? 'block' : 'none'}; margin-bottom: 16px; padding: 12px; background: #f0f9ff; border: 2px solid #3b82f6; border-radius: 6px;">
                    <div style="margin-bottom: 10px;">
                        <label style="display: block; margin-bottom: 4px; font-size: 11px; color: #4a5568; font-weight: 500;">API URL (需兼容OpenAI)</label>
                        <input type="text" id="api-url" value="${escapeHtml(apiConfig.apiUrl)}" placeholder="例如: https://api.openai.com/v1" style="width: 100%; padding: 6px; background: white; border: 1px solid #cbd5e0; border-radius: 4px; color: #2d3748; box-sizing: border-box; font-size: 12px;">
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        <label style="display: block; margin-bottom: 4px; font-size: 11px; color: #4a5568; font-weight: 500;">API Key</label>
                        <input type="password" id="api-key" value="${escapeHtml(apiConfig.apiKey)}" placeholder="sk-..." style="width: 100%; padding: 6px; background: white; border: 1px solid #cbd5e0; border-radius: 4px; color: #2d3748; box-sizing: border-box; font-size: 12px;">
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        <label style="display: block; margin-bottom: 4px; font-size: 11px; color: #4a5568; font-weight: 500;">模型 (Model)</label>
                        <select id="api-model" style="width: 100%; padding: 6px; background: white; border: 1px solid #cbd5e0; border-radius: 4px; color: #2d3748; font-size: 12px;">
                            <option value="">请先获取模型列表...</option>
                        </select>
                        <div style="display: flex; gap: 6px; margin-top: 6px;">
                            <button id="fetch-models-btn" style="flex: 1; padding: 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">
                                <i class="fas fa-sync-alt"></i> 获取模型
                            </button>
                            <button id="test-connection-btn" style="flex: 1; padding: 8px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">
                                <i class="fas fa-check-circle"></i> 测试连接
                            </button>
                        </div>
                    </div>
                    
                    <div id="api-status" style="display: none; margin-top: 8px; padding: 8px; border-radius: 4px; font-size: 11px;"></div>
                    
                    <div style="margin-top: 8px; padding: 8px; background: #e0f2fe; border-radius: 4px; font-size: 10px; color: #0c4a6e;">
                        <strong>💡 提示：</strong>使用自定义 API 将独立调用 LLM
                    </div>
                    
                    <!-- 自动生成论坛配置（仅自定义API可用） -->
                    <div style="margin-top: 12px; padding: 10px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px;">
                        <div style="font-size: 12px; font-weight: 600; color: #92400e; margin-bottom: 8px;">
                            <i class="fas fa-magic"></i> 自动生成论坛
                        </div>
                        
                        <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 8px;">
                            <input type="checkbox" id="auto-generate-enabled" ${apiConfig.autoGenerate?.enabled ? 'checked' : ''} style="margin-right: 8px; width: 14px; height: 14px; cursor: pointer;">
                            <span style="font-size: 11px; color: #78350f;">启用自动生成</span>
                        </label>
                        
                        <div style="margin-bottom: 8px;">
                            <label style="display: block; margin-bottom: 4px; font-size: 10px; color: #78350f;">触发阈值（每隔多少楼自动生成）</label>
                            <input type="number" id="auto-generate-threshold" value="${apiConfig.autoGenerate?.threshold || 10}" min="1" max="100" style="width: 100%; padding: 5px; background: white; border: 1px solid #d97706; border-radius: 4px; color: #78350f; box-sizing: border-box; font-size: 11px;">
                        </div>
                        
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" id="auto-generate-notification" ${apiConfig.autoGenerate?.showNotification !== false ? 'checked' : ''} style="margin-right: 8px; width: 14px; height: 14px; cursor: pointer;">
                            <span style="font-size: 11px; color: #78350f;">生成时显示弹窗通知</span>
                        </label>
                        
                        <div style="margin-top: 6px; font-size: 9px; color: #a16207;">
                            💡 当聊天消息达到设定楼层数时，将自动生成论坛内容
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <button id="manage-custom-styles-btn" style="width: 100%; padding: 10px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 14px;">
                         自定义论坛
                    </button>
                    <div style="display: flex; gap: 8px;">
                        <button class="phone-forum-save-settings-btn" style="flex: 1; padding: 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
                            <i class="fas fa-save"></i> 保存
                        </button>
                        <button class="phone-forum-close-settings-btn" style="flex: 1; padding: 10px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
                            <i class="fas fa-times"></i> 取消
                        </button>
                    </div>
                </div>
            </div>
        `;

        $('#phone-app-title').text(' 论坛设置');
        $('#phone-app-body').html(html);


        //  关键！绑定所有按钮事件（在HTML插入后立即绑定）
        setTimeout(() => {
            // 恢复已保存的模型到下拉框
            const savedModel = apiConfig.model;
            if (savedModel) {
                const $modelSelect = $('#api-model');
                // 如果已保存模型，添加到下拉框并选中
                $modelSelect.append($('<option>', {
                    value: savedModel,
                    text: savedModel,
                    selected: true
                }));
            }

            // 绑定API类型切换事件
            $('#forum-api-type').off('change').on('change', function () {
                const isCustom = $(this).val() === 'custom';
                $('#custom-api-settings').toggle(isCustom);
            });

            // 绑定获取模型按钮
            $('#fetch-models-btn').off('click').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                window.phoneFetchModels && window.phoneFetchModels();
            });

            // 绑定测试连接按钮
            $('#test-connection-btn').off('click').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                window.phoneTestConnection && window.phoneTestConnection();
            });

            // 绑定管理自定义风格按钮
            $('#manage-custom-styles-btn').off('click').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                window.phoneManageCustomStyles && window.phoneManageCustomStyles();
            });

            // 绑定保存按钮
            $('.phone-forum-save-settings-btn').off('click').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                window.phoneSaveForumSettings && window.phoneSaveForumSettings();
            });

            // 绑定关闭按钮
            $('.phone-forum-close-settings-btn').off('click').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                window.phoneCloseForumSettings && window.phoneCloseForumSettings();
            });

        }, 0);
    };

    window.phoneSaveForumSettings = function () {

        try {
            const manager = window.phoneForumManager;

            if (!manager) {
                if (typeof toastr !== 'undefined') {
                    toastr.error('管理器未初始化！', '论坛');
                }
                return;
            }

            // 读取所有设置值
            const forumStyle = $('#forum-style').val();
            const apiType = $('#forum-api-type').val();
            const usePresetAndWorldBook = $('#use-preset-worldbook').is(':checked');

            // 保存论坛设置
            manager.settings.forumStyle = forumStyle;
            manager.settings.apiType = apiType;
            manager.settings.usePresetAndWorldBook = usePresetAndWorldBook;
            manager.saveSettings();

            // 保存独立 API 配置（只有选择"自定义API"时才启用）
            manager.apiConfig.settings.enabled = (apiType === 'custom');

            if (apiType === 'custom') {
                //  读取独立API配置（限定在当前显示的phone-app-body内）
                const $currentBody = $('#phone-app-body');
                const selectedModel = $currentBody.find('#api-model').val() || '';

                manager.apiConfig.settings.apiUrl = $currentBody.find('#api-url').val();
                manager.apiConfig.settings.apiKey = $currentBody.find('#api-key').val();
                manager.apiConfig.settings.model = selectedModel;

                // 保存自动生成论坛配置
                manager.apiConfig.settings.autoGenerate = {
                    enabled: $currentBody.find('#auto-generate-enabled').is(':checked'),
                    threshold: parseInt($currentBody.find('#auto-generate-threshold').val()) || 10,
                    showNotification: $currentBody.find('#auto-generate-notification').is(':checked')
                };

                // 如果启用了自动生成，重置计数器
                if (manager.apiConfig.settings.autoGenerate.enabled) {
                    manager.apiConfig.resetAutoGenerateCounter();
                }
            }

            manager.apiConfig.saveSettings();


            if (typeof toastr !== 'undefined') {
                toastr.success('设置已保存！', '论坛');
            }

            //  返回论坛界面 - 重新生成而不是恢复旧HTML，确保事件绑定正确
            setTimeout(() => {

                // 清空导航栈（因为我们要重新生成，不需要旧内容）
                navigationStack.length = 0;

                // 重新生成论坛面板，确保所有事件都正确绑定
                $('#phone-app-title').text(' 论坛');
                $('#phone-app-body').html(generateForumPanel());

            }, 100);
        } catch (error) {
            if (typeof toastr !== 'undefined') {
                toastr.error('保存设置失败: ' + error.message, '论坛');
            }
        }
    };

    window.phoneCloseForumSettings = function () {

        //  重新生成论坛面板而不是恢复旧HTML，确保事件绑定正确
        // 清空导航栈
        navigationStack.length = 0;

        // 重新生成论坛面板
        $('#phone-app-title').text(' 论坛');
        $('#phone-app-body').html(generateForumPanel());

    };

    //  自定义风格管理函数
    window.phoneManageCustomStyles = function () {

        const manager = window.phoneForumManager;
        const customStyles = manager.settings.customStyles || [];

        const html = `
            <div style="padding: 12px;">
                <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #2d3748;"> 自定义风格管理</h3>
                
                <button id="add-custom-style-btn" style="width: 100%; padding: 10px; margin-bottom: 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
                     新建自定义风格
                </button>
                
                <div id="custom-styles-list" style="margin-bottom: 16px;">
                    ${customStyles.length === 0 ?
                '<div style="text-align: center; padding: 20px; color: #718096; font-size: 12px;">暂无自定义风格</div>' :
                customStyles.map((style, index) => `
                            <div class="custom-style-item" data-index="${index}" style="background: white; border: 1px solid #cbd5e0; border-radius: 4px; padding: 10px; margin-bottom: 8px;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-weight: 500; color: #2d3748; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(style.name)}</div>
                                        <div style="font-size: 11px; color: #718096; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(style.prompt.substring(0, 50))}...</div>
                                    </div>
                                    <div style="display: flex; gap: 6px; margin-left: 10px;">
                                        <button class="edit-custom-style-btn" data-index="${index}" style="padding: 6px 10px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                                             编辑
                                        </button>
                                        <button class="delete-custom-style-btn" data-index="${index}" style="padding: 6px 10px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                                             删除
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')
            }
                </div>
                
                <button class="phone-back-to-settings-btn" style="width: 100%; padding: 10px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
                    ← 返回设置
                </button>
            </div>
        `;

        $('#phone-app-title').text(' 自定义风格管理');
        $('#phone-app-body').html(html);

        // 绑定事件
        setTimeout(() => {
            // 新建按钮
            $('#add-custom-style-btn').off('click').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                window.phoneShowCustomStyleEditor && window.phoneShowCustomStyleEditor();
            });

            // 编辑按钮
            $('.edit-custom-style-btn').off('click').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const index = $(this).data('index');
                window.phoneShowCustomStyleEditor && window.phoneShowCustomStyleEditor(index);
            });

            // 删除按钮
            $('.delete-custom-style-btn').off('click').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const index = $(this).data('index');
                if (confirm('确定要删除这个自定义风格吗？')) {
                    window.phoneDeleteCustomStyle && window.phoneDeleteCustomStyle(index);
                }
            });

            // 返回按钮
            $('.phone-back-to-settings-btn').off('click').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                window.phoneOpenForumSettings && window.phoneOpenForumSettings();
            });
        }, 0);
    };

    window.phoneShowCustomStyleEditor = function (editIndex) {

        const manager = window.phoneForumManager;
        const isEdit = editIndex !== undefined;
        const style = isEdit ? manager.settings.customStyles[editIndex] : { name: '', prompt: '' };

        const html = `
            <div style="padding: 12px;">
                <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #2d3748;">${isEdit ? ' 编辑' : ' 新建'}自定义风格</h3>
                
                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #4a5568; font-weight: 500;">风格名称</label>
                    <input type="text" id="custom-style-name" value="${escapeHtml(style.name)}" placeholder="例如：小红书" style="width: 100%; padding: 8px; background: white; border: 1px solid #cbd5e0; border-radius: 4px; color: #2d3748; box-sizing: border-box;">
                </div>
                
                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #4a5568; font-weight: 500;">风格提示词</label>
                    <textarea id="custom-style-prompt" placeholder="输入论坛风格的详细描述，类似于预设风格的 stylePrompts..." style="width: 100%; min-height: 300px; padding: 8px; background: white; border: 1px solid #cbd5e0; border-radius: 4px; color: #2d3748; box-sizing: border-box; font-family: monospace; font-size: 11px; resize: vertical;">${escapeHtml(style.prompt)}</textarea>
                    <div style="margin-top: 6px; display: flex; justify-content: space-between; align-items: center;">
                        <small style="font-size: 10px; color: #718096;">
                             提示：可以参考预设风格的格式，包括论坛核心设定、角色要求、论坛风格、常见内容类型等
                        </small>
                        <button id="import-example-btn" style="padding: 6px 12px; background: #8b5cf6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 500; white-space: nowrap;">
                             导入示例
                        </button>
                    </div>
                </div>
                
                <div style="display: flex; gap: 8px;">
                    <button id="save-custom-style-btn" data-index="${editIndex !== undefined ? editIndex : ''}" style="flex: 1; padding: 10px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
                         保存
                    </button>
                    <button class="phone-back-to-manage-btn" style="flex: 1; padding: 10px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
                        ← 取消
                    </button>
                </div>
            </div>
        `;

        $('#phone-app-title').text(isEdit ? ' 编辑自定义风格' : ' 新建自定义风格');
        $('#phone-app-body').html(html);

        // 绑定事件
        setTimeout(() => {
            // 导入示例按钮
            $('#import-example-btn').off('click').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                window.phoneImportExamplePrompt && window.phoneImportExamplePrompt();
            });

            // 保存按钮
            $('#save-custom-style-btn').off('click').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const index = $(this).data('index');
                window.phoneSaveCustomStyle && window.phoneSaveCustomStyle(index !== '' ? index : undefined);
            });

            // 取消按钮
            $('.phone-back-to-manage-btn').off('click').on('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                window.phoneManageCustomStyles && window.phoneManageCustomStyles();
            });
        }, 0);
    };

    window.phoneSaveCustomStyle = function (editIndex) {

        const manager = window.phoneForumManager;
        const name = $('#custom-style-name').val().trim();
        const prompt = $('#custom-style-prompt').val().trim();

        // 验证
        if (!name) {
            if (typeof toastr !== 'undefined') {
                toastr.error('请输入风格名称', '论坛');
            }
            return;
        }

        if (!prompt) {
            if (typeof toastr !== 'undefined') {
                toastr.error('请输入风格提示词', '论坛');
            }
            return;
        }

        // 检查名称是否重复（编辑时排除自身）
        const isDuplicate = manager.settings.customStyles.some((style, index) =>
            style.name === name && index !== editIndex
        );

        if (isDuplicate) {
            if (typeof toastr !== 'undefined') {
                toastr.error('风格名称已存在', '论坛');
            }
            return;
        }

        // 保存或更新
        if (editIndex !== undefined) {
            // 编辑现有风格
            manager.settings.customStyles[editIndex] = { name, prompt };
        } else {
            // 新建风格
            if (!manager.settings.customStyles) {
                manager.settings.customStyles = [];
            }
            manager.settings.customStyles.push({ name, prompt });
        }

        manager.saveSettings();

        if (typeof toastr !== 'undefined') {
            toastr.success(editIndex !== undefined ? '风格已更新' : '风格已创建', '论坛');
        }

        // 返回管理页面
        window.phoneManageCustomStyles && window.phoneManageCustomStyles();
    };

    window.phoneImportExamplePrompt = function () {

        const selectedStyle = manager.settings.forumStyle;
        const examplePrompt = BUILTIN_FORUM_STYLE_PROMPTS[selectedStyle] || DEFAULT_FORUM_STYLE_PROMPT;

        // 将示例提示词填充到编辑框
        $('#custom-style-prompt').val(examplePrompt);

        if (typeof toastr !== 'undefined') {
            toastr.success('已导入论坛主题示例', '论坛');
        }
    };

    window.phoneDeleteCustomStyle = function (index) {

        const manager = window.phoneForumManager;
        const deletedStyle = manager.settings.customStyles[index];

        // 如果当前选择的就是要删除的风格，则切换到默认风格
        if (manager.settings.forumStyle === `custom:${deletedStyle.name}`) {
            manager.settings.forumStyle = DEFAULT_FORUM_STYLE;
        }

        // 删除风格
        manager.settings.customStyles.splice(index, 1);
        manager.saveSettings();

        if (typeof toastr !== 'undefined') {
            toastr.success('风格已删除', '论坛');
        }

        // 刷新管理页面
        window.phoneManageCustomStyles && window.phoneManageCustomStyles();
    };

    // 🔧 API 配置辅助函数已移除，使用phoneFetchModels替代

    window.phoneShowAPIStatus = function (message, type = 'info') {
        const statusDiv = $('#api-status');
        if (!statusDiv.length) return;

        const colors = {
            info: '#3b82f6',
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b'
        };

        const bgColors = {
            info: '#eff6ff',
            success: '#f0fdf4',
            error: '#fef2f2',
            warning: '#fffbeb'
        };

        statusDiv.css({
            'display': 'block',
            'color': colors[type] || colors.info,
            'background': bgColors[type] || bgColors.info,
            'border': `1px solid ${colors[type] || colors.info}`
        });
        statusDiv.text(message);

        // 自动隐藏成功消息
        if (type === 'success') {
            setTimeout(() => {
                statusDiv.fadeOut();
            }, 3000);
        }
    };

    // 获取可用模型列表
    window.phoneFetchModels = async function () {
        const $currentBody = $('#phone-app-body');
        const apiUrl = $currentBody.find('#api-url').val().trim();
        const apiKey = $currentBody.find('#api-key').val().trim();
        const modelSelect = $currentBody.find('#api-model')[0];
        const buttonElement = $currentBody.find('#fetch-models-btn')[0];

        if (!apiUrl) {
            window.phoneShowAPIStatus('⚠️ 请先填写 API URL！', 'warning');
            return;
        }

        const originalBtnHTML = buttonElement.innerHTML;
        buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在获取...';
        buttonElement.disabled = true;

        try {
            let cleanedApiUrl = apiUrl.replace(/\/$/, '');
            if (!cleanedApiUrl.endsWith('/v1')) {
                cleanedApiUrl += '/v1';
            }

            let fetchUrl = cleanedApiUrl.endsWith('/models') ? cleanedApiUrl : `${cleanedApiUrl}/models`;

            const headers = {};
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const fetchOptions = {
                method: 'GET',
                headers: headers
            };

            const response = await fetch(fetchUrl, fetchOptions);
            if (!response.ok) {
                const errorText = await response.text();
                let errorDetail = '请求失败';
                try {
                    const errorJson = JSON.parse(errorText);
                    errorDetail = errorJson.error?.message || errorText;
                } catch (e) {
                    errorDetail = errorText;
                }
                throw new Error(`HTTP ${response.status}: ${errorDetail}`);
            }

            const responseText = await response.text();
            let data;
            try {
                data = responseText ? JSON.parse(responseText) : [];
            } catch (e) {
                throw new Error('API响应不是有效的JSON格式。');
            }

            let models = [];
            if (data && data.models && Array.isArray(data.models)) {
                models = data.models.map(model => model.name).filter(Boolean);
            } else if (data && data.data && Array.isArray(data.data)) {
                models = data.data.map(model => model.id).filter(Boolean);
            } else if (Array.isArray(data)) {
                models = data.map(model => (typeof model === 'string' ? model : model.id)).filter(Boolean);
            }

            modelSelect.innerHTML = '';
            if (models.length > 0) {
                models.sort();
                models.forEach(modelId => {
                    const option = document.createElement('option');
                    option.value = modelId;
                    option.textContent = modelId;
                    modelSelect.appendChild(option);
                });
                modelSelect.selectedIndex = 0;

                window.phoneShowAPIStatus(`✅ 成功获取 ${models.length} 个模型！`, 'success');
            } else {
                modelSelect.innerHTML = '<option disabled>未获取到模型</option>';
                window.phoneShowAPIStatus('⚠️ API返回成功，但模型列表为空或格式无法识别。', 'warning');
            }

        } catch (error) {
            console.error('获取模型失败:', error);
            modelSelect.innerHTML = '<option>获取失败</option>';
            window.phoneShowAPIStatus(`❌ 获取模型失败: ${error.message}`, 'error');
        } finally {
            buttonElement.innerHTML = originalBtnHTML;
            buttonElement.disabled = false;
        }
    };

    window.phoneTestConnection = async function () {
        const manager = window.phoneForumManager;
        const $currentBody = $('#phone-app-body');

        const apiUrl = $currentBody.find('#api-url').val();
        const apiKey = $currentBody.find('#api-key').val();
        const model = $currentBody.find('#api-model').val() || '';

        if (!apiUrl) {
            window.phoneShowAPIStatus('⚠️ 请先填写 API 地址', 'warning');
            return;
        }

        if (!apiKey) {
            window.phoneShowAPIStatus('⚠️ 请先填写 API 密钥', 'warning');
            return;
        }

        if (!model) {
            window.phoneShowAPIStatus('⚠️ 请先选择模型', 'warning');
            return;
        }

        window.phoneShowAPIStatus('🔄 正在测试连接...', 'info');

        try {
            const result = await manager.apiConfig.testConnection(apiUrl, apiKey, model);

            if (result.success) {
                window.phoneShowAPIStatus('✅ 连接测试成功！', 'success');
            } else {
                window.phoneShowAPIStatus(`❌ 连接测试失败: ${result.error}`, 'error');
            }
        } catch (error) {
            window.phoneShowAPIStatus(`❌ 连接测试失败: ${error.message}`, 'error');
        }
    };

    // 创建事件处理函数（可被多个地方复用）
    window.handlePhoneLiveButtonClick = function (e) {
        const target = e.target;

        // 安全检查
        if (!target || !target.classList) {
            return;
        }

        const classList = target.classList;
        const classArray = Array.from(classList);

        // 检查论坛按钮
        if (classArray.includes('phone-forum-generate-btn')) {
            e.preventDefault();
            e.stopPropagation();
            window.phoneGenerateForum && window.phoneGenerateForum();
            return;
        }

        if (classArray.includes('phone-forum-settings-btn')) {
            e.preventDefault();
            e.stopPropagation();
            window.phoneOpenForumSettings && window.phoneOpenForumSettings();
            return;
        }

        if (classArray.includes('phone-forum-save-settings-btn')) {
            e.preventDefault();
            e.stopPropagation();
            window.phoneSaveForumSettings && window.phoneSaveForumSettings();
            return;
        }

        if (classArray.includes('phone-forum-close-settings-btn')) {
            e.preventDefault();
            e.stopPropagation();
            window.phoneCloseForumSettings && window.phoneCloseForumSettings();
            return;
        }

        // 如果点击的是按钮内的图标、文字或 DIV，向上查找按钮
        if ((target.tagName === 'I' || target.tagName === 'SPAN' || target.tagName === 'DIV') && target.parentElement) {
            const parentClasses = Array.from(target.parentElement.classList || []);

            if (parentClasses.includes('phone-forum-generate-btn')) {
                e.preventDefault();
                e.stopPropagation();
                window.phoneGenerateForum && window.phoneGenerateForum();
                return;
            }

            if (parentClasses.includes('phone-forum-settings-btn')) {
                e.preventDefault();
                e.stopPropagation();
                window.phoneOpenForumSettings && window.phoneOpenForumSettings();
                return;
            }

            if (parentClasses.includes('phone-forum-save-settings-btn')) {
                e.preventDefault();
                e.stopPropagation();
                window.phoneSaveForumSettings && window.phoneSaveForumSettings();
                return;
            }

            if (parentClasses.includes('phone-forum-close-settings-btn')) {
                e.preventDefault();
                e.stopPropagation();
                window.phoneCloseForumSettings && window.phoneCloseForumSettings();
                return;
            }

        }
    };

    try {
        // 在主文档上监听（用于论坛按钮的捕获阶段处理）
        document.addEventListener('click', window.handlePhoneLiveButtonClick, true);

        // 清理旧元素
        $('#mobile-trigger-btn').remove();
        $('#mobile-phone-overlay').remove();
        $('#mobile-phone-styles').remove();

        // 加载 Font Awesome（安全方式，不会触发SillyTavern的检测）
        loadFontAwesome();

        // 注入样式
        $('head').append(phoneStyles);

        // The status HUD owns the launcher; this script only mounts the phone panel.
        const phoneOverlay = $('<div>', {
            id: 'mobile-phone-overlay',
            html: `
                <div class="mobile-phone-frame">
                    <div class="mobile-phone-screen">
                        <!-- 状态栏 -->
                        <div class="mobile-status-bar">
                            <div class="status-left">
                                <span class="time" id="phone-status-time">14:30</span>
                                <span class="status-weather">
                                    <i class="fas fa-cloud" id="phone-status-weather-icon"></i>
                                    <span id="phone-status-weather">多云</span>
                                </span>
                            </div>
                            <div class="status-center" id="phone-drag-handle" style="cursor: move;" title="拖动手机界面"></div>
                            <div class="status-right">
                                <span class="battery">
                                    <i class="fas fa-battery-full"></i>
                                    <span class="battery-text">100%</span>
                                </span>
                                <button id="phone-pin-btn" class="pin-btn" title="置顶/取消置顶">
                                    <i class="fas fa-thumbtack"></i>
                                </button>
                            </div>
                        </div>

                        <!-- 主内容区域 -->
                        <div class="mobile-content">
                            <!-- 主界面 -->
                            <div class="home-screen" id="phone-home-screen">
                                <!-- 时间天气卡片 -->
                                <div class="weather-card">
                                    <div class="weather-time">
                                        <span class="current-time" id="phone-big-time">14:30</span>
                                        <span class="current-date" id="phone-date">11/09</span>
                                    </div>
                                    <div class="weather-info">
                                        <i class="fas fa-cloud" style="font-size: 16px; color: #585858;"></i>
                                        <span class="weather-desc" id="phone-weather">多云</span>
                                    </div>
                                </div>

                                <!-- 应用页面容器 -->
                                <div class="app-pages-container">
                                    <!-- 滑动包装器 -->
                                    <div class="app-pages-wrapper" id="app-pages-wrapper">
                                        <!-- 第一页 -->
                                        <div class="app-page">
                                            <div class="app-grid">
                                                <!-- 第一行：信息，CG收集，论坛 -->
                                                <div class="app-row">
                                                    <div class="app-icon" data-app="messages">
                                                        <div class="app-icon-bg md-blue">
                                                            <i class="fas fa-comments"></i>
                                                        </div>
                                                        <span class="app-label">信息</span>
                                                    </div>
                                                    <div class="app-icon" data-app="gallery">
                                                        <div class="app-icon-bg md-green">
                                                            <i class="fas fa-images"></i>
                                                        </div>
                                                        <span class="app-label">CG收集</span>
                                                    </div>
                                                    <div class="app-icon" data-app="forum">
                                                        <div class="app-icon-bg md-purple">
                                                            <i class="fas fa-comments"></i>
                                                        </div>
                                                        <span class="app-label">论坛</span>
                                                    </div>
                                                </div>
                                                <!-- 第二行：羁绊，壁纸，设置 -->
                                                <div class="app-row">
                                                    <div class="app-icon" data-app="friends">
                                                        <div class="app-icon-bg md-pink">
                                                            <i class="fas fa-user-friends"></i>
                                                        </div>
                                                        <span class="app-label">羁绊</span>
                                                    </div>
                                                    <div class="app-icon" data-app="wallpaper">
                                                        <div class="app-icon-bg md-pink">
                                                            <i class="fas fa-image"></i>
                                                        </div>
                                                        <span class="app-label">壁纸</span>
                                                    </div>
                                                    <div class="app-icon" data-app="settings">
                                                        <div class="app-icon-bg md-blue">
                                                            <i class="fas fa-cog"></i>
                                                        </div>
                                                        <span class="app-label">设置</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <!-- 第二页（已去除重复入口） -->
                                    </div>
                                    
                                    <!-- 页面指示器 -->
                                    <div class="page-indicators" id="page-indicators">
                                        <div class="indicator active"></div>
                                    </div>
                                </div>
                                
                                <!-- 全屏按钮 -->
                                <button id="wallpaper-fullscreen-btn" class="wallpaper-fullscreen-btn" title="查看壁纸大图">
                                    <i class="fas fa-expand"></i>
                                </button>
                            </div>

                            <!-- 应用详情面板 -->
                            <div class="app-detail-panel" id="phone-detail-panel">
                                <div class="app-header">
                                    <button class="back-button" id="phone-back-btn">
                                        <i class="fas fa-chevron-left"></i>
                                    </button>
                                    <span class="app-title" id="phone-app-title">应用</span>
                                    <div style="width: 36px;"></div>
                                </div>
                                <div class="app-body" id="phone-app-body">
                                    <!-- 应用内容将在这里动态加载 -->
                                </div>
                            </div>

                            <!-- 聊天面板 -->
                            <div class="chat-panel" id="phone-chat-panel">
                                <div class="chat-header">
                                    <button class="back-button" id="chat-back-btn">
                                        <i class="fas fa-chevron-left"></i>
                                    </button>
                                    <span class="app-title" id="chat-title" style="flex: 1;">聊天</span>
                                    <div id="chat-right-actions" style="width: 36px; flex-shrink: 0;"></div>
                                </div>
                                <div class="chat-messages" id="chat-messages">
                                </div>
                                <div class="chat-input-area">
                                    <input type="text" class="chat-input" id="chat-input" placeholder="输入消息...">
                                    <button class="chat-send-btn" id="chat-send-btn">
                                        <i class="fas fa-paper-plane"></i>
                                    </button>
                                </div>
                            </div>
                            
                            <!-- 全屏壁纸查看器 -->
                            <div class="wallpaper-fullscreen-viewer" id="wallpaper-fullscreen-viewer">
                                <button class="wallpaper-close-btn" id="wallpaper-close-btn">
                                    <i class="fas fa-times"></i>
                                </button>
                                <div class="cg-nav-controls" id="cg-nav-controls" style="display: none; position: absolute; bottom: 15px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 15px; z-index: 210;">
                                    <button class="cg-nav-btn" id="cg-prev-btn" style="width: 40px; height: 40px; background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 50%; font-size: 16px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: all 0.2s; display: flex; align-items: center; justify-content: center;">
                                        <i class="fas fa-chevron-left"></i>
                                    </button>
                                    <button class="cg-set-wallpaper-btn" id="cg-set-wallpaper-btn" style="padding: 10px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; border: none; border-radius: 20px; font-size: 13px; font-weight: 500; cursor: pointer; box-shadow: 0 3px 12px rgba(102, 126, 234, 0.4); white-space: nowrap;">
                                        <i class="fas fa-image" style="margin-right: 6px;"></i>设为壁纸
                                    </button>
                                    <button class="cg-nav-btn" id="cg-next-btn" style="width: 40px; height: 40px; background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 50%; font-size: 16px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: all 0.2s; display: flex; align-items: center; justify-content: center;">
                                        <i class="fas fa-chevron-right"></i>
                                    </button>
                                </div>
                                <div class="cg-index-display" id="cg-index-display" style="display: none; position: absolute; top: 10px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.5); color: #fff; padding: 4px 12px; border-radius: 12px; font-size: 12px; z-index: 210;"></div>
                                <img id="wallpaper-fullscreen-img" src="" alt="壁纸预览">
                            </div>
                        </div>
                    </div>
                </div>
            `
        });

        $('body').append(phoneOverlay);

        // 延迟绑定事件，确保 DOM 完全就绪
        setTimeout(() => {
            bindPhoneEvents();
        }, 0);

        // 注册MVU事件监听
        registerMvuEventListeners();



        // 更新时间
        updatePhoneTime();
        setInterval(updatePhoneTime, 60000);

        setTimeout(() => {
            restoreWallpaper();
            restorePhoneSize();
        }, 200);

        // 标记全局变量供依赖检测（挂到父窗口，跨iframe可见）
        try { (window.parent || window).__小手机脚本_loaded__ = true; } catch(e) { window.__小手机脚本_loaded__ = true; }

    } catch (error) {
        if (typeof toastr !== 'undefined') {
            toastr.error('手机界面初始化失败：' + error.message);
        }
    }
}

