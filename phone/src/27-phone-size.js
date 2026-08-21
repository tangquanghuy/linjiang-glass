// 应用手机尺寸设置
function applyPhoneSize(width, height) {

    const $phoneFrame = $('.mobile-phone-frame');
    if ($phoneFrame.length === 0) {
        return;
    }

    // 设置手机尺寸
    $phoneFrame.css({
        'width': width + 'px',
        'height': height + 'px'
    });

    // 保存到localStorage
    try {
        localStorage.setItem('mobile-phone-width', width);
        localStorage.setItem('mobile-phone-height', height);
    } catch (e) {
    }

    // 重新生成面板以更新显示
    const content = generateSizeSettingsPanel();
    $('#phone-app-body').html(content);

    // 重新绑定事件
    setTimeout(() => {
        const $appBody = $('#phone-app-body');
        $appBody.off('click.phonesize');

        $appBody.on('click.phonesize', '.phone-size-preset-btn', function (e) {
            e.preventDefault();
            const w = $(this).data('width');
            const h = $(this).data('height');
            $('#phone-width-input').val(w);
            $('#phone-height-input').val(h);
        });

        $appBody.on('click.phonesize', '.phone-size-apply-btn', function (e) {
            e.preventDefault();
            const w = parseInt($('#phone-width-input').val());
            const h = parseInt($('#phone-height-input').val());

            if (w < 320 || w > 600 || h < 500 || h > 900) {
                if (typeof toastr !== 'undefined') {
                    toastr.error('尺寸超出范围！');
                }
                return;
            }

            applyPhoneSize(w, h);
        });

        $appBody.on('click.phonesize', '.phone-size-reset-btn', function (e) {
            e.preventDefault();
            resetPhoneSize();
        });
    }, 100);

    // 显示提示
    if (typeof toastr !== 'undefined') {
        toastr.success(`手机尺寸已设置为 ${width}×${height}`);
    }
}

/* 恢复默认手机尺寸：把内联的 width/height 清掉，交回 CSS 的
   max-width + aspect-ratio(390/844)，而不是硬写一个 375×667。 */
function resetPhoneSize() {
    const $phoneFrame = $('.mobile-phone-frame');
    if ($phoneFrame.length > 0) {
        $phoneFrame.css({ width: '', height: '' });
    }

    // 清除localStorage中的设置
    try {
        localStorage.removeItem('mobile-phone-width');
        localStorage.removeItem('mobile-phone-height');
    } catch (e) {
    }

    // 重新生成面板，输入框回到默认值
    $('#phone-app-body').html(generateSizeSettingsPanel());

    if (typeof toastr !== 'undefined') {
        toastr.success('已恢复默认尺寸');
    }
}

// 恢复保存的手机尺寸
function restorePhoneSize() {
    try {
        const savedWidth = localStorage.getItem('mobile-phone-width');
        const savedHeight = localStorage.getItem('mobile-phone-height');

        if (savedWidth && savedHeight) {
            const width = parseInt(savedWidth);
            const height = parseInt(savedHeight);

            const $phoneFrame = $('.mobile-phone-frame');
            if ($phoneFrame.length > 0) {
                $phoneFrame.css({
                    'width': width + 'px',
                    'height': height + 'px'
                });
            }
        }
    } catch (e) {
    }
}

