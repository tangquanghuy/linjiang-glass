// ==================== 事件绑定 ====================
function bindPhoneEvents() {

    // The launcher lives in the status HUD; bind only panel-internal controls here.

    // 点击遮罩关闭（仅在未置顶时）
    $('#mobile-phone-overlay').on('click', function (e) {
        // 如果正在拖动页面或刚完成拖动，不关闭手机
        if (pageSwipe && (pageSwipe.isDragging || pageSwipe.justFinishedDragging)) {
            return;
        }
        if ($(e.target).attr('id') === 'mobile-phone-overlay' && !isPinned) {
            closeMobilePhone();
        }
    });

    // 置顶按钮点击
    $('#phone-pin-btn').on('click', function (e) {
        e.stopPropagation();
        togglePin();
    });

    // 全屏壁纸按钮点击
    $('#wallpaper-fullscreen-btn').on('click', function (e) {
        e.stopPropagation();
        openWallpaperFullscreen();
    });

    // 全屏壁纸关闭按钮点击
    $('#wallpaper-close-btn').on('click', function (e) {
        e.stopPropagation();
        closeWallpaperFullscreen();
    });

    // CG设为壁纸按钮点击
    $('#cg-set-wallpaper-btn').on('click', function (e) {
        e.stopPropagation();
        const cgUrl = $(this).data('cg-url');
        if (cgUrl) {
            setWallpaper(cgUrl);
            closeWallpaperFullscreen();
            if (typeof toastr !== 'undefined') {
                toastr.success('已将CG设为壁纸');
            }
        }
    });

    // 点击全屏查看器背景关闭
    $('#wallpaper-fullscreen-viewer').on('click', function (e) {
        if (e.target.id === 'wallpaper-fullscreen-viewer') {
            closeWallpaperFullscreen();
        }
    });

    // CG上一张/下一张按钮点击
    $('#cg-prev-btn').on('click', function (e) {
        e.stopPropagation();
        switchCGImage('prev');
    });

    $('#cg-next-btn').on('click', function (e) {
        e.stopPropagation();
        switchCGImage('next');
    });

    // 手机界面拖动功能
    initPhoneDrag();

    //  修复：应用图标点击改为事件委托，避免DOM更新后事件失效
    // 使用事件委托到 body，这样即使DOM更新也不会丢失事件
    $('body').off('click.appIcon').on('click.appIcon', '.app-icon[data-app], .app-icon[data-app] *', function (e) {
        e.stopPropagation();

        //  关键修复：使用closest查找最近的.app-icon元素（处理点击子元素的情况）
        const $appIcon = $(this).closest('.app-icon[data-app]');

        if ($appIcon.length === 0) {
            return; // 不是应用图标或其子元素
        }

        const appName = $appIcon.attr('data-app');

        if (appName) {
            openAppPanel(appName);
        } else {
        }
    });

    // 返回按钮
    $('#phone-back-btn').on('click', function () {
        closeAppPanel();
    });

    //  绑定创建群聊按钮（使用事件委托）
    $('body').off('click.createGroupBtn').on('click.createGroupBtn', '.create-group-button', function (e) {
        e.stopPropagation();
        openCreateGroupPanel();
    });

    //  绑定聊天界面中的删除群聊按钮（使用事件委托）
    $('body').off('click.deleteGroupBtn').on('click.deleteGroupBtn', '.chat-delete-group-btn', function (e) {
        e.stopPropagation();
        e.preventDefault();
        const groupId = $(this).data('group-id');
        const groupName = $(this).data('group-name');
        deleteGroup(groupId, groupName);
    });

    //  绑定询问阿罗娜按钮（使用事件委托）
    $('body').off('click.askArona').on('click.askArona', '.ask-arona-btn', async function (e) {
        e.stopPropagation();
        e.preventDefault();

        const $btn = $(this);
        const originalHtml = $btn.html();

        // 禁用按钮并显示加载状态
        $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> 发送中...');

        try {
            if (!window.messageSender) {
                throw new Error('消息发送器未初始化');
            }

            const message = '询问阿罗娜，有没有什么委托需要处理';
            const success = await window.messageSender.sendToChat(message);

            if (success) {
                if (typeof toastr !== 'undefined') {
                    toastr.success('已向阿罗娜发送询问', '发送成功');
                }
                // 恢复按钮状态
                $btn.prop('disabled', false).html(originalHtml);
            } else {
                throw new Error('发送消息失败');
            }
        } catch (error) {
            if (typeof toastr !== 'undefined') {
                toastr.error('发送失败: ' + error.message, '错误');
            }
            // 恢复按钮状态
            $btn.prop('disabled', false).html(originalHtml);
        }
    });

    // 绑定联系人点击事件（使用事件委托到 body）
    // 注意：由于联系人列表在 #phone-app-body 中动态生成，需要使用事件委托
    $('body').off('click.contactItem').on('click.contactItem', '.contact-item', function (e) {
        e.stopPropagation();

        const $item = $(this);
        const contactId = $item.data('id');
        const contactName = $item.data('name');
        const contactType = $item.data('type');
        const members = $item.data('members') || '';
        const isGroup = contactType === 'group';

        if (!contactId || !contactName) {
            return;
        }

        openChatPanel(contactId, contactName, isGroup, members);
    });

    // 绑定聊天界面返回按钮
    $('#chat-back-btn').on('click', function () {
        closeChatPanel();
    });

    // 绑定聊天发送按钮
    $('#chat-send-btn').on('click', function () {
        sendChatMessage();
    });

    // 绑定聊天输入框回车发送
    $('#chat-input').on('keypress', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });

    //  图片点击事件（使用事件委托）
    $('body').off('click.messageImage').on('click.messageImage', '.clickable-image', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const imageUrl = $(this).data('image-url');
        if (imageUrl) {
            viewFullImage(imageUrl);
        }
    });

    // 壁纸分类展开/收起（使用事件委托）
    $(document).on('click', '.wallpaper-category-header', function (e) {
        const categoryName = $(this).data('category');
        if (categoryName) {
            toggleWallpaperCategory(categoryName);
        }
    });

    // 论坛按钮点击（使用jQuery事件委托，和好友一样的方式）
    $(document).on('click', '.phone-forum-generate-btn', function (e) {
        e.stopPropagation();
        e.preventDefault();
        window.phoneGenerateForum && window.phoneGenerateForum();
    });

    $(document).on('click', '.phone-forum-settings-btn', function (e) {
        e.stopPropagation();
        e.preventDefault();
        window.phoneOpenForumSettings && window.phoneOpenForumSettings();
    });

    $(document).on('click', '.phone-forum-save-settings-btn', function (e) {
        e.stopPropagation();
        e.preventDefault();
        window.phoneSaveForumSettings && window.phoneSaveForumSettings();
    });

    $(document).on('click', '.phone-forum-close-settings-btn', function (e) {
        e.stopPropagation();
        e.preventDefault();
        window.phoneCloseForumSettings && window.phoneCloseForumSettings();
    });

    // 好友列表项点击（使用事件委托）
    $(document).on('click', '.friend-item', function (e) {
        e.stopPropagation();
        const $friendItem = $(this);
        const friendName = $friendItem.data('friend-name');

        if (!friendName) {
            return;
        }

        const relationshipSource = getRelationshipDataSource();
        if (!relationshipSource) {
            return;
        }

        const friendData = relationshipSource[friendName];
        if (!friendData) {
            return;
        }

        showFriendDetail(friendName, friendData);
    });

    // 论坛帖子点击（使用事件委托）
    $(document).on('click', '.forum-post-item', function (e) {
        e.stopPropagation();
        const $postItem = $(this);
        const postIndex = $postItem.data('post-index');


        if (postIndex === undefined) {
            return;
        }

        // 从论坛管理器获取帖子数据
        if (!window.phoneForumManager) {
            return;
        }

        const forumData = window.phoneForumManager.loadForumData();

        if (!forumData || !forumData[postIndex]) {
            return;
        }

        showForumPostDetail(postIndex, forumData[postIndex]);
    });

    // 在应用面板上监听好友点击
    const $appBody = $('#phone-app-body');

    if ($appBody.length > 0) {
        $appBody.on('click', '.friend-item', function (e) {
            e.stopPropagation();

            const $friendItem = $(this);
            const friendName = $friendItem.data('friend-name');

            if (!friendName) {
                return;
            }

            const relationshipSource = getRelationshipDataSource();
            if (!relationshipSource) {
                return;
            }

            const friendData = relationshipSource[friendName];
            if (!friendData) {
                return;
            }

            showFriendDetail(friendName, friendData);
        });

        // 在应用面板上监听论坛帖子点击
        $appBody.on('click', '.forum-post-item', function (e) {
            e.stopPropagation();
            const $postItem = $(this);
            const postIndex = $postItem.data('post-index');


            if (postIndex === undefined) {
                return;
            }

            // 从论坛管理器获取帖子数据
            if (!window.phoneForumManager) {
                return;
            }

            const forumData = window.phoneForumManager.loadForumData();

            if (!forumData || !forumData[postIndex]) {
                return;
            }

            showForumPostDetail(postIndex, forumData[postIndex]);
        });
    }

    // 备用：也监听整个分类容器的点击
    $(document).on('click', '.list-item-header', function (e) {
        // 如果点击的是好友项，不处理
        if ($(this).closest('.friend-item').length > 0) {
            return;
        }

        const categoryName = $(this).data('category');
        if (categoryName && !$(this).hasClass('wallpaper-category-header')) {
            toggleWallpaperCategory(categoryName);
        }
    });

    // 全局点击事件处理
    $(document).on('click', function (e) {
        const $target = $(e.target);

        const inMobilePhone = $target.closest('.mobile-phone-frame').length > 0 ||
            $target.closest('#mobile-phone-overlay').length > 0;

        if (inMobilePhone) {
            const inAppBody = $target.closest('#phone-app-body').length > 0;

            if (inAppBody) {
                // 检查是否点击了论坛按钮
                const $forumGenerateBtn = $target.closest('.phone-forum-generate-btn');
                if ($forumGenerateBtn.length > 0) {
                    e.stopPropagation();
                    e.preventDefault();
                    window.phoneGenerateForum();
                    return;
                }

                const $forumSettingsBtn = $target.closest('.phone-forum-settings-btn');
                if ($forumSettingsBtn.length > 0) {
                    e.stopPropagation();
                    e.preventDefault();
                    window.phoneOpenForumSettings();
                    return;
                }

                const $forumSaveSettingsBtn = $target.closest('.phone-forum-save-settings-btn');
                if ($forumSaveSettingsBtn.length > 0) {
                    e.stopPropagation();
                    e.preventDefault();
                    window.phoneSaveForumSettings();
                    return;
                }

                const $forumCloseSettingsBtn = $target.closest('.phone-forum-close-settings-btn');
                if ($forumCloseSettingsBtn.length > 0) {
                    e.stopPropagation();
                    e.preventDefault();
                    window.phoneCloseForumSettings();
                    return;
                }

                // 任务按钮的点击由原生事件处理，这里不需要处理

                // 检查是否点击了壁纸分类相关的元素
                const $listItemHeader = $target.closest('.list-item-header');
                if ($listItemHeader.length > 0) {
                    const categoryName = $listItemHeader.data('category');

                    if (categoryName) {
                        toggleWallpaperCategory(categoryName);
                    }
                }

                // 检查是否点击了壁纸项
                const $wallpaperItem = $target.closest('.wallpaper-item');
                if ($wallpaperItem.length > 0) {
                    const wallpaperUrl = $wallpaperItem.data('wallpaper-url');

                    if (wallpaperUrl) {
                        setWallpaper(wallpaperUrl);
                    }
                }
            }
        }
    });

    // 壁纸选择（使用事件委托，因为壁纸项是动态加载的）
    $(document).on('click', '.wallpaper-item', function (e) {
        const wallpaperUrl = $(this).data('wallpaper-url');
        if (wallpaperUrl) {
            setWallpaper(wallpaperUrl);
        }
    });

    // Keep a dragged phone frame recoverable after viewport changes.
    let resizeTimer;
    $(window).on('resize.mobilePhone', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            const viewport = getViewportSize();
            const $phoneFrame = $('.mobile-phone-frame');
            if ($phoneFrame.length === 0 || !$('#mobile-phone-overlay').hasClass('active')) return;

            const phoneRect = $phoneFrame[0].getBoundingClientRect();
            const frameWidth = $phoneFrame.outerWidth() || 375;
            const frameHeight = $phoneFrame.outerHeight() || 737;
            if (phoneRect.left < -frameWidth + 50 || phoneRect.top < -frameHeight + 50 ||
                phoneRect.right > viewport.width + frameWidth - 50 ||
                phoneRect.bottom > viewport.height + frameHeight - 50) {
                $phoneFrame.css('transform', 'translate(0, 0)');
            }
        }, 250);
    });

}

