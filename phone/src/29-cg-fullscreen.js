/**
 * 全屏显示CG图片（复用壁纸查看器）
 */
let currentCGInfo = null; // 存储当前CG信息用于切换

function showCGFullscreen(imgUrl, characterName, sceneType, currentIndex) {
    const $viewer = $('#wallpaper-fullscreen-viewer');
    const $img = $('#wallpaper-fullscreen-img');
    const $setWallpaperBtn = $('#cg-set-wallpaper-btn');
    const $navControls = $('#cg-nav-controls');
    const $indexDisplay = $('#cg-index-display');

    // 获取该场景的最大图片数
    const maxCount = CG_LIST[characterName]?.[sceneType] || 1;
    const index = currentIndex || 1;

    // 存储当前CG信息
    currentCGInfo = {
        character: characterName,
        scene: sceneType,
        current: index,
        max: maxCount
    };

    $img.attr('src', imgUrl);
    $viewer.addClass('active');

    // 显示导航控件和设为壁纸按钮
    $setWallpaperBtn.data('cg-url', imgUrl).show();
    $navControls.show();

    // 更新索引显示
    $indexDisplay.text(`${index} / ${maxCount}`).show();

    // 更新按钮状态
    updateCGNavButtons();
}

function updateCGNavButtons() {
    if (!currentCGInfo) return;

    const $prevBtn = $('#cg-prev-btn');
    const $nextBtn = $('#cg-next-btn');

    // 禁用/启用按钮
    $prevBtn.prop('disabled', currentCGInfo.current <= 1)
        .css('opacity', currentCGInfo.current <= 1 ? '0.4' : '1');
    $nextBtn.prop('disabled', currentCGInfo.current >= currentCGInfo.max)
        .css('opacity', currentCGInfo.current >= currentCGInfo.max ? '0.4' : '1');
}

function switchCGImage(direction) {
    if (!currentCGInfo) return;

    let newIndex = currentCGInfo.current;
    if (direction === 'prev' && newIndex > 1) {
        newIndex--;
    } else if (direction === 'next' && newIndex < currentCGInfo.max) {
        newIndex++;
    } else {
        return; // 已到边界
    }

    currentCGInfo.current = newIndex;

    // 更新图片
    const newUrl = getCGImageUrl(currentCGInfo.character, currentCGInfo.scene, newIndex);
    const $img = $('#wallpaper-fullscreen-img');

    $img.css('opacity', '0.5');
    $img.attr('src', newUrl);
    $img.on('load.cgswitch', function () {
        $img.css('opacity', '1').off('load.cgswitch');
    });

    // 更新设为壁纸按钮的URL
    $('#cg-set-wallpaper-btn').data('cg-url', newUrl);

    // 更新索引显示
    $('#cg-index-display').text(`${newIndex} / ${currentCGInfo.max}`);

    // 更新按钮状态
    updateCGNavButtons();
}

