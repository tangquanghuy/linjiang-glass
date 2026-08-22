// 切换壁纸分类的展开/收起状态
function toggleWallpaperCategory(categoryName) {

    const container = $(`.wallpaper-category-images[data-category="${categoryName}"]`);

    if (container.length === 0) {
        return;
    }

    // 判断当前是展开还是收起
    if (container.is(':visible')) {
        // 收起
        container.slideUp(300);
        // 更新箭头图标
        $(`.wallpaper-category[data-category="${categoryName}"] .fa-chevron-up`)
            .removeClass('fa-chevron-up')
            .addClass('fa-chevron-down');
    } else {
        // 展开
        container.slideDown(300);
        // 更新箭头图标
        $(`.wallpaper-category[data-category="${categoryName}"] .fa-chevron-down`)
            .removeClass('fa-chevron-down')
            .addClass('fa-chevron-up');

        // 如果是第一次展开，加载图片
        if (!phoneWpLoaded.has(categoryName)) {
            phoneWpLoaded.add(categoryName);

            // 显示加载动画
            container.html('<div style="text-align: center; padding: 30px;"><i class="fas fa-circle-notch fa-spin" style="font-size: 24px; color: #9C27B0;"></i><div style="margin-top: 10px; color: #9ca3af; font-size: 13px;">加载中...</div></div>');

            // 模拟加载延迟（实际会因为网络而延迟）
            setTimeout(() => {
                const images = phoneWpCategories[categoryName];
                let imagesHtml = '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">';

                images.forEach((url, index) => {
                    imagesHtml += `
                        <div class="wallpaper-item" data-wallpaper-url="${url}" 
                             style="cursor: pointer; position: relative; padding-bottom: 133%; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); background: #f0f0f0;">
                            <img src="${url}" 
                                 style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s; opacity: 0; transition: opacity 0.3s;"
                                 onload="this.style.opacity='1'"
                                 onmouseover="this.style.transform='scale(1.05)'"
                                 onmouseout="this.style.transform='scale(1)'"
                                 onerror="this.parentElement.innerHTML='<div style=\\'position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f0f0f0;color:#999;font-size:11px;\\'>加载失败</div>'"
                            />
                        </div>
                    `;
                });

                imagesHtml += '</div>';
                container.html(imagesHtml);

            }, 500);
        }
    }
}

function setWallpaper(imageUrl) {

    const $screen = $('#mobile-phone-overlay .mobile-phone-screen');

    if ($screen.length === 0) {
        return;
    }

    // 使用 setProperty 和 important 标记来覆盖样式表中的 !important
    const screenElement = $screen[0];
    screenElement.style.setProperty('background-image', `url(${imageUrl})`, 'important');
    screenElement.style.setProperty('background-size', 'cover', 'important');
    screenElement.style.setProperty('background-position', 'center', 'important');
    screenElement.style.setProperty('background-repeat', 'no-repeat', 'important');


    // 保存到localStorage
    try {
        localStorage.setItem('dnf-phone-wallpaper', imageUrl);
    } catch (e) {
    }

    // 显示提示
    if (typeof toastr !== 'undefined') {
        toastr.success('壁纸已更换');
    }
}

// 恢复壁纸
function restoreWallpaper() {
    try {
        const defaultWallpaper = 'https://anchor.bolt.qzz.io/NSFW/%E7%BA%A2%E8%94%B7%E8%96%87/%E8%B6%B3%E4%BA%A42.webp';
        let savedWallpaper = localStorage.getItem('dnf-phone-wallpaper');

        // 验证保存的壁纸URL是否有效（不为空且包含http）
        if (!savedWallpaper || savedWallpaper.trim() === '' || !savedWallpaper.startsWith('http')) {
            console.log('保存的壁纸无效，使用默认壁纸');
            savedWallpaper = defaultWallpaper;
            localStorage.setItem('dnf-phone-wallpaper', defaultWallpaper);
        }

        const $screen = $('#mobile-phone-overlay .mobile-phone-screen');
        if ($screen.length > 0) {
            const screenElement = $screen[0];
            screenElement.style.setProperty('background-image', `url(${savedWallpaper})`, 'important');
            screenElement.style.setProperty('background-size', 'cover', 'important');
            screenElement.style.setProperty('background-position', 'center', 'important');
            screenElement.style.setProperty('background-repeat', 'no-repeat', 'important');

            console.log('已设置壁纸:', savedWallpaper);
        }
    } catch (e) {
        console.error('恢复壁纸失败:', e);
    }
}

// 上传自定义壁纸
function uploadCustomWallpaper(file) {

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
        if (typeof toastr !== 'undefined') {
            toastr.error('请选择图片文件');
        }
        return;
    }

    // 验证文件大小（限制为10MB）
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        if (typeof toastr !== 'undefined') {
            toastr.error('图片文件大小不能超过10MB');
        }
        return;
    }

    // 使用FileReader读取图片
    const reader = new FileReader();

    reader.onload = function (e) {
        const imageDataUrl = e.target.result;

        // 创建Image对象验证图片
        const img = new Image();
        img.onload = function () {

            // 设置为壁纸
            setWallpaper(imageDataUrl);

            if (typeof toastr !== 'undefined') {
                toastr.success('自定义壁纸已上传');
            }

            // 重置文件输入框
            $('#wallpaper-upload-input').val('');
        };

        img.onerror = function () {
            if (typeof toastr !== 'undefined') {
                toastr.error('图片加载失败，请选择有效的图片文件');
            }
            // 重置文件输入框
            $('#wallpaper-upload-input').val('');
        };

        img.src = imageDataUrl;
    };

    reader.onerror = function (e) {
        if (typeof toastr !== 'undefined') {
            toastr.error('文件读取失败');
        }
        // 重置文件输入框
        $('#wallpaper-upload-input').val('');
    };

    // 读取文件为DataURL
    reader.readAsDataURL(file);
}

// 重置为默认壁纸
function resetWallpaper() {

    const defaultWallpaper = 'https://anchor.bolt.qzz.io/NSFW/%E7%BA%A2%E8%94%B7%E8%96%87/%E8%B6%B3%E4%BA%A42.webp';

    const $screen = $('#mobile-phone-overlay .mobile-phone-screen');

    if ($screen.length === 0) {
        return;
    }

    // 设置默认壁纸
    const screenElement = $screen[0];
    screenElement.style.setProperty('background-image', `url(${defaultWallpaper})`, 'important');
    screenElement.style.setProperty('background-size', 'cover', 'important');
    screenElement.style.setProperty('background-position', 'center', 'important');
    screenElement.style.setProperty('background-repeat', 'no-repeat', 'important');


    // 保存到localStorage
    try {
        localStorage.setItem('dnf-phone-wallpaper', defaultWallpaper);
    } catch (e) {
    }

    // 显示提示
    if (typeof toastr !== 'undefined') {
        toastr.success('已恢复默认壁纸');
    }
}

// 打开全屏壁纸查看器
function openWallpaperFullscreen() {

    // 获取当前壁纸URL
    const savedWallpaper = localStorage.getItem('dnf-phone-wallpaper');

    if (!savedWallpaper) {
        if (typeof toastr !== 'undefined') {
            toastr.info('当前使用默认壁纸，无法查看大图');
        }
        return;
    }

    // 设置图片src并显示查看器
    const $viewer = $('#wallpaper-fullscreen-viewer');
    const $img = $('#wallpaper-fullscreen-img');

    $img.attr('src', savedWallpaper);
    $viewer.addClass('active');

}

// 关闭全屏壁纸查看器
function closeWallpaperFullscreen() {

    const $viewer = $('#wallpaper-fullscreen-viewer');
    $viewer.removeClass('active');

    // 隐藏"设为壁纸"按钮和导航控件
    $('#cg-set-wallpaper-btn').hide().removeData('cg-url');
    $('#cg-nav-controls').hide();
    $('#cg-index-display').hide();

    // 清除当前CG信息
    currentCGInfo = null;

    // 清空图片src节省内存
    setTimeout(() => {
        if (!$viewer.hasClass('active')) {
            $('#wallpaper-fullscreen-img').attr('src', '');
        }
    }, 300);
}

