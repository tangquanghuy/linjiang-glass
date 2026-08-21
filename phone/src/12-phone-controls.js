// ==================== 控制函数 ====================
function openMobilePhone() {
    $('#mobile-phone-overlay').addClass('active');

    //  刷新MVU数据
    try {
        loadInitialMvuData();
    } catch (error) {
        console.warn('[手机界面] 加载MVU数据失败:', error);
    }

    //  启动实时监听
    setupMessageEventListener();

    //  恢复聊天定时器（如果之前在聊天中）
    if (currentChatContactId && $('#phone-chat-panel').hasClass('active')) {
        // 如果聊天面板仍然打开，恢复定时器
        if (!chatPanelRefreshInterval) {
            chatPanelRefreshInterval = setInterval(() => {
                const $mobileOverlay = $('#mobile-phone-overlay');
                const isMobileOpen = $mobileOverlay.hasClass('active');
                const $chatPanel = $('#phone-chat-panel');
                const isChatOpen = $chatPanel.hasClass('active');

                if (isMobileOpen && isChatOpen) {
                    renderChatMessages(currentChatContactId, currentChatIsGroup);
                }
            }, 1000);
        }
    }

    // 延迟初始化，确保DOM完全渲染
    setTimeout(() => {
        // 初始化页面滑动功能（只初始化一次）
        if (!pageSwipe.initialized) {
            initPageSwipe();
            pageSwipe.initialized = true;
        }

        // 恢复上次打开的面板
        try {
            const lastPanel = localStorage.getItem('mobile-last-panel');
            // 只有当存在有效的面板名称时才恢复
            if (lastPanel && lastPanel.trim() !== '' && lastPanel !== 'null') {
                openAppPanel(lastPanel, true); // 传入true表示是从关闭状态恢复
            } else {
            }
        } catch (e) {
        }
    }, 100);
}

function closeMobilePhone() {
    const $overlay = $('#mobile-phone-overlay');
    $overlay.removeClass('active');

    //  停止刷新机制
    stopRefreshMechanism();

    //  保存好友详情页的滚动位置（如果当前在详情页）
    if (currentPanel === 'friends' && lastViewedFriend && navigationStack.length > 0) {
        //  优先使用滚动监听器已保存的位置，因为DOM可能已经被修改
        // 只有在还没有保存位置时才从DOM读取
        if (friendDetailScrollPosition === 0) {
            let scrollContainer = document.getElementById('friend-detail-scroll-container');
            if (!scrollContainer) {
                const $scrollContainer = $('#friend-detail-scroll-container');
                if ($scrollContainer.length > 0) {
                    scrollContainer = $scrollContainer[0];
                }
            }

            if (scrollContainer) {
                friendDetailScrollPosition = scrollContainer.scrollTop;
            } else {
            }
        } else {
        }
    }

    // 保存当前面板状态到 localStorage
    try {
        if (currentPanel) {
            localStorage.setItem('mobile-last-panel', currentPanel);
        } else {
            localStorage.setItem('mobile-last-panel', '');
        }
    } catch (e) {
    }

    // 关闭时取消置顶状态
    if (isPinned) {
        isPinned = false;
        $('#phone-pin-btn').removeClass('pinned');
        $overlay.removeClass('pinned');
    }

    // 不关闭应用面板，保持状态供下次打开
    // closeAppPanel(); // 注释掉这行，保持面板状态

    // 重置手机框架位置和动画
    const $phoneFrame = $('.mobile-phone-frame');
    $phoneFrame.css({
        'transform': '',
        'animation': '',
        'transition': ''
    });
}

// 置顶切换
function togglePin() {
    isPinned = !isPinned;
    const $pinBtn = $('#phone-pin-btn');
    const $overlay = $('#mobile-phone-overlay');

    if (isPinned) {
        $pinBtn.addClass('pinned');
        $overlay.addClass('pinned');
        if (typeof toastr !== 'undefined') {
            toastr.info('已置顶，可以操作底层页面');
        }
    } else {
        $pinBtn.removeClass('pinned');
        $overlay.removeClass('pinned');
        if (typeof toastr !== 'undefined') {
            toastr.info('已取消置顶');
        }
    }
}

// 初始化手机界面拖动（复用小按钮的拖动逻辑）
function initPhoneDrag() {
    const $dragHandle = $('#phone-drag-handle');
    const $phoneFrame = $('.mobile-phone-frame');

    if ($dragHandle.length === 0 || $phoneFrame.length === 0) {
        return;
    }

    const dragHandle = $dragHandle[0];

    // 阻止拖动手柄上的点击事件冒泡
    $dragHandle.on('click', function (e) {
        e.stopPropagation();
    });

    // 使用原生 Pointer Events（更可靠）
    dragHandle.addEventListener('pointerdown', handlePhoneDragStart);
    dragHandle.addEventListener('pointermove', handlePhoneDragMove);
    dragHandle.addEventListener('pointerup', handlePhoneDragEnd);
    dragHandle.addEventListener('pointercancel', handlePhoneDragEnd);

}

function handlePhoneDragStart(e) {

    // 阻止默认行为和冒泡
    e.preventDefault();
    e.stopPropagation();

    isPhoneDragging = true;

    // 捕获指针，确保后续的 pointermove 和 pointerup 事件能够被触发
    e.target.setPointerCapture(e.pointerId);

    const $phoneFrame = $('.mobile-phone-frame');

    phoneDragStartX = e.clientX;
    phoneDragStartY = e.clientY;

    // 先立即移除过渡和动画，避免在读取 transform 时受过渡影响
    $phoneFrame.css({
        'animation': 'none',
        'transition': 'none'
    });

    // 强制浏览器重新计算样式（确保过渡被立即停止）
    $phoneFrame[0].offsetHeight;

    // 读取当前的 transform 值（停止过渡后，这个值是准确的）
    const currentTransform = $phoneFrame.css('transform');
    if (currentTransform && currentTransform !== 'none') {
        const matrix = currentTransform.match(/matrix\(([^)]+)\)/);
        if (matrix) {
            const values = matrix[1].split(', ');
            phoneStartX = parseFloat(values[4]) || 0;
            phoneStartY = parseFloat(values[5]) || 0;
        } else {
            phoneStartX = 0;
            phoneStartY = 0;
        }
    } else {
        phoneStartX = 0;
        phoneStartY = 0;
    }

}

function handlePhoneDragMove(e) {
    if (!isPhoneDragging) return;

    e.preventDefault();

    // 计算移动距离
    const deltaX = e.clientX - phoneDragStartX;
    const deltaY = e.clientY - phoneDragStartY;

    // 计算新的 transform 偏移
    const newX = phoneStartX + deltaX;
    const newY = phoneStartY + deltaY;

    // 获取手机框架和视口信息
    const $phoneFrame = $('.mobile-phone-frame');
    const frameRect = $phoneFrame[0].getBoundingClientRect();
    const frameWidth = frameRect.width || 375;
    const frameHeight = frameRect.height || 737;
    const viewport = getViewportSize();

    // 计算手机框架的初始中心位置（无 transform 时的位置）
    // 手机框架通过 flexbox 居中，所以初始位置是视口中心
    const initialCenterX = viewport.width / 2;
    const initialCenterY = viewport.height / 2;

    // 计算应用 transform 后的实际位置
    const actualLeft = initialCenterX - frameWidth / 2 + newX;
    const actualTop = initialCenterY - frameHeight / 2 + newY;

    // 边界限制：确保至少有 minVisible 像素在屏幕内
    const minVisible = 80;
    const minX = -frameWidth + minVisible;
    const maxX = viewport.width - minVisible;
    const minY = -frameHeight + minVisible;
    const maxY = viewport.height - minVisible;

    // 限制实际位置
    const boundedLeft = clamp(actualLeft, minX, maxX);
    const boundedTop = clamp(actualTop, minY, maxY);

    // 反算回 transform 值
    const boundedTransformX = boundedLeft - (initialCenterX - frameWidth / 2);
    const boundedTransformY = boundedTop - (initialCenterY - frameHeight / 2);

    // 应用 transform
    $phoneFrame.css('transform', `translate(${boundedTransformX}px, ${boundedTransformY}px)`);
}

function handlePhoneDragEnd(e) {
    if (!isPhoneDragging) return;

    isPhoneDragging = false;

    // 释放指针捕获
    if (e.target.hasPointerCapture && e.target.hasPointerCapture(e.pointerId)) {
        e.target.releasePointerCapture(e.pointerId);
    }

}

function openAppPanel(appName, isRestoringFromClose = false) {

    // 检查数据
    if (!currentPhoneData) {
        const loaded = loadInitialMvuData();

        if (!loaded) {
            if (typeof toastr !== 'undefined') {
                toastr.warning('未找到数据\n请先初始化MVU变量或发送一条消息');
            }
            return;
        }
    }

    //  只有从关闭状态恢复时才检查是否需要恢复好友详情页面
    const relationshipSource = getRelationshipDataSource(currentPhoneData);
    const shouldRestoreFriendDetail = (
        isRestoringFromClose &&
        appName === 'friends' &&
        lastViewedFriend &&
        relationshipSource &&
        relationshipSource[lastViewedFriend]
    );

    // 清空导航栈，因为这是一个新的应用
    navigationStack = [];

    currentPanel = appName;
    let title = '';
    let content = '';

    //  添加异常处理，避免生成函数出错导致整个面板空白
    try {
        switch (appName) {
            /* 标题里不放 emoji：导航栏走 iOS 的纯文字标题，图标交给 App 图标本身 */
            case 'messages':
                title = '信息';
                content = generateMessagesPanel(currentPhoneData);
                break;
            case 'gallery':
                title = 'CG收集';
                fetchLatestMvuData(true);
                content = generateGalleryPanel(currentPhoneData);
                break;
            case 'forum':
                title = '论坛';
                content = generateForumPanel();
                break;
            case 'friends':
                title = '羁绊列表';
                // 使用统一的数据获取函数刷新数据
                fetchLatestMvuData(true);
                content = generateFriendsPanel(currentPhoneData);
                break;
            case 'wallpaper':
                title = '壁纸';
                // 清空已加载的壁纸分类状态，避免状态不一致
                phoneWpLoaded.clear();
                content = generateSettingsPanel(currentPhoneData);
                break;
            case 'settings':
                title = '设置';
                content = generateSizeSettingsPanel();
                break;
            default:
                title = '未知应用';
                content = '<div class="empty-message">应用不存在</div>';
                break;
        }
    } catch (error) {
        //  捕获异常，显示错误信息而不是空白
        title = title || `⚠ ${appName}`;
        content = `
            <div class="empty-message">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3; color: #ef4444;"></i>
                <div style="color: #ef4444; font-weight: 600;">加载面板时出错</div>
                <div style="font-size: 12px; color: #9ca3af; margin-top: 10px;">
                    ${error.message || '未知错误'}
                </div>
                    style="margin-top: 16px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    查看详细错误
                </button>
            </div>
        `;
    }

    $('#phone-app-title').text(title);
    $('#phone-app-body').html(content);
    $('#phone-detail-panel').addClass('active');

    //  特殊处理：好友列表面板，恢复之前的状态（多种方式尝试，确保iframe兼容）
    if (appName === 'friends') {
        // 如果需要恢复好友详情页
        if (shouldRestoreFriendDetail) {

            //  立即隐藏内容，避免看到好友列表或详情顶部的闪烁
            $('#phone-app-body').css('opacity', '0');

            // 延迟执行以确保DOM已完全渲染
            setTimeout(() => {
                const latestRelationships = getRelationshipDataSource();
                const friendData = latestRelationships ? latestRelationships[lastViewedFriend] : null;
                if (friendData) {
                    //  直接显示好友详情，跳过好友列表的显示
                    showFriendDetail(lastViewedFriend, friendData, true); // 传入 isRestoring = true

                    //  恢复好友详情页的滚动位置
                    setTimeout(() => {
                        //  获取真正的滚动容器
                        let scrollContainer = document.getElementById('friend-detail-scroll-container');
                        if (!scrollContainer) {
                            const $scrollContainer = $('#friend-detail-scroll-container');
                            if ($scrollContainer.length > 0) {
                                scrollContainer = $scrollContainer[0];
                            }
                        }

                        if (scrollContainer) {
                            scrollContainer.scrollTop = friendDetailScrollPosition;

                            //  恢复完成后淡入显示内容
                            setTimeout(() => {
                                $('#phone-app-body').css('opacity', '1');
                            }, 50); // 短暂延迟，确保滚动已完成
                        } else {
                            $('#phone-app-body').css('opacity', '1');
                        }
                    }, 50); // 减少延迟，更快恢复
                }
            }, 100); // 减少初始延迟
        } else {
            // 只有不恢复详情页时才单独恢复滚动位置
            if (friendsListScrollPosition > 0) {
                setTimeout(() => {
                    let appBodyElement = document.getElementById('phone-app-body');

                    // 如果原生方式找不到，尝试使用 jQuery
                    if (!appBodyElement) {
                        const $appBody = $('#phone-app-body');
                        if ($appBody.length > 0) {
                            appBodyElement = $appBody[0];
                        }
                    }

                    if (appBodyElement) {
                        appBodyElement.scrollTop = friendsListScrollPosition;
                    } else {
                    }
                }, 100);
            }
        }
    }

    // 特殊处理：如果是消息面板，检查并测试联系人点击
    if (appName === 'messages') {
        setTimeout(() => {
            const contactItems = $('.contact-item');
            contactItems.each(function (index) {
                const $item = $(this);
                const element = this;

                // 为第一个联系人添加一个测试点击处理器
                if (index === 0) {
                    $item.on('click.test', function () {
                    });
                }
            });

            // 测试事件委托是否生效（移除 $._data 调用，它不是标准API）
        }, 100);
    }



    // 特殊处理：如果是设置面板（尺寸设置），绑定事件
    if (appName === 'settings') {
        setTimeout(() => {

            const $appBody = $('#phone-app-body');
            if ($appBody.length === 0) {
                return;
            }

            // 先解绑之前的事件
            $appBody.off('click.phonesize');

            // 绑定预设尺寸按钮
            $appBody.on('click.phonesize', '.phone-size-preset-btn', function (e) {
                e.preventDefault();
                const width = $(this).data('width');
                const height = $(this).data('height');
                $('#phone-width-input').val(width);
                $('#phone-height-input').val(height);
            });

            // 绑定应用设置按钮
            $appBody.on('click.phonesize', '.phone-size-apply-btn', function (e) {
                e.preventDefault();
                const width = parseInt($('#phone-width-input').val());
                const height = parseInt($('#phone-height-input').val());

                if (width < 320 || width > 600 || height < 500 || height > 900) {
                    if (typeof toastr !== 'undefined') {
                        toastr.error('尺寸超出范围！');
                    }
                    return;
                }

                applyPhoneSize(width, height);
            });

            // 绑定恢复默认按钮
            $appBody.on('click.phonesize', '.phone-size-reset-btn', function (e) {
                e.preventDefault();
                resetPhoneSize();
            });

        }, 100);
    }

    // 特殊处理：如果是壁纸面板（wallpaper），绑定壁纸事件
    if (appName === 'wallpaper') {
        setTimeout(() => {

            const $appBody = $('#phone-app-body');
            if ($appBody.length === 0) {
                return;
            }

            // 先解绑之前的事件
            $appBody.off('click.wallpaper');

            // 1. 绑定默认壁纸按钮点击事件
            $appBody.on('click.wallpaper', '.default-wallpaper-btn', function (e) {
                e.stopPropagation();
                resetWallpaper();
            });

            // 1.5 绑定上传壁纸按钮点击事件
            $appBody.on('click.wallpaper', '.upload-wallpaper-btn', function (e) {
                e.stopPropagation();
                // 触发隐藏的文件输入框
                $('#wallpaper-upload-input').click();
            });

            // 1.6 绑定文件选择事件
            $('#wallpaper-upload-input').off('change').on('change', function (e) {
                const file = e.target.files[0];
                if (file) {
                    uploadCustomWallpaper(file);
                }
            });

            // 2. 绑定分类头点击事件（使用事件委托，点击整个.list-item区域都有效）
            $appBody.on('click.wallpaper', '.wallpaper-category .list-item', function (e) {
                const $categoryDiv = $(this).closest('.wallpaper-category');
                const categoryName = $categoryDiv.data('category');

                if (categoryName) {
                    e.stopPropagation();
                    toggleWallpaperCategory(categoryName);
                }
            });

            // 3. 绑定壁纸图片点击事件（使用事件委托）
            $appBody.on('click.wallpaper', '.wallpaper-item', function (e) {
                const wallpaperUrl = $(this).data('wallpaper-url');

                if (wallpaperUrl) {
                    e.stopPropagation();
                    setWallpaper(wallpaperUrl);
                }
            });

        }, 100);
    }

    // 特殊处理：如果是CG收集面板，绑定事件
    if (appName === 'gallery') {
        setTimeout(() => {
            bindCGGalleryEvents();
        }, 100);
    }

    // 特殊处理：如果是日历面板，绑定日期点击事件
    if (appName === 'calendar') {
        setTimeout(() => {
            const $appBody = $('#phone-app-body');
            if ($appBody.length === 0) return;

            // 先解绑之前的事件
            $appBody.off('click.calendar');

            // 绑定日期点击事件
            $appBody.on('click.calendar', '.cal-day', function (e) {
                e.preventDefault();
                e.stopPropagation();

                const day = $(this).data('day');
                if (day) {
                    selectCalendarDay(day);
                }
            });
        }, 100);
    }

}

function closeAppPanel() {

    // 检查是否有导航历史
    if (navigationStack.length > 0) {
        const previousPage = navigationStack.pop();

        //  如果从好友详情页返回到好友列表，保留 lastViewedFriend 以便下次恢复
        const isReturningToFriendsList = previousPage.title && (previousPage.title.includes('好友列表') || previousPage.title.includes('羁绊列表'));
        if (isReturningToFriendsList) {
            // 保留 lastViewedFriend 不清除
        }

        // 恢复上一级页面
        $('#phone-app-title').text(previousPage.title);
        $('#phone-app-body').html(previousPage.content);

        //  恢复滚动位置（如果有保存）- 多种方式尝试，确保iframe兼容
        if (previousPage.scrollPosition !== undefined || lastViewedFriend) {
            setTimeout(() => {
                let appBodyElement = document.getElementById('phone-app-body');

                // 如果原生方式找不到，尝试使用 jQuery
                if (!appBodyElement) {
                    const $appBody = $('#phone-app-body');
                    if ($appBody.length > 0) {
                        appBodyElement = $appBody[0];
                    }
                }

                if (appBodyElement) {
                    //  优先使用元素定位恢复位置
                    if (lastViewedFriend) {
                        const $friendItem = $(`.friend-item[data-friend-name="${lastViewedFriend}"]`);
                        if ($friendItem.length > 0) {
                            const targetPosition = $friendItem.position().top + appBodyElement.scrollTop;
                            appBodyElement.scrollTop = targetPosition;
                            return;
                        }
                    }

                    // 备选：使用保存的滚动位置
                    if (previousPage.scrollPosition > 0) {
                        appBodyElement.scrollTop = previousPage.scrollPosition;
                        const actualPosition = appBodyElement.scrollTop;

                        // 如果实际位置和目标位置不一致，可能是DOM还没完全渲染，再试一次
                        if (actualPosition < previousPage.scrollPosition - 10) {
                            setTimeout(() => {
                                appBodyElement.scrollTop = previousPage.scrollPosition;
                            }, 150);
                        }
                    }
                } else {
                }
            }, 150); // 增加延迟确保DOM已完全渲染
        }

    } else {
        // 没有历史记录，关闭整个面板
        $('#phone-detail-panel').removeClass('active');
        currentPanel = null;

        //  不清除 lastViewedFriend 和 friendsListScrollPosition，以便下次打开时恢复
        // 只有当用户完全关闭手机界面时才清除

        // 清除保存的面板状态
        try {
            localStorage.setItem('mobile-last-panel', '');
        } catch (e) {
        }
    }
}

