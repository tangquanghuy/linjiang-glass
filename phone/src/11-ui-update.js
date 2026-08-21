// ==================== UI更新函数 ====================
function updatePhoneTime() {
    /* 从MVU变量读取时间 */
    /* 时间更新由 updatePhoneData() 函数从 MVU 变量的 current_time 读取 */
    try {
        /* 尝试从各种可能的来源获取数据 */
        let currentTime = null;

        /* 方法1: 从window.mvuGameData读取（如果存在） */
        if (window.mvuGameData?.world_info?.time?.current_time) {
            currentTime = window.mvuGameData.world_info.time.current_time;
        }

        /* 方法2: 从全局变量读取（如果存在） */
        if (!currentTime && typeof gameData !== 'undefined' && gameData?.world_info?.time?.current_time) {
            currentTime = gameData.world_info.time.current_time;
        }

        /* 如果获取到了时间数据，更新显示 */
        if (currentTime) {
            updatePhoneTimeFromMVU(currentTime);
        }
    } catch (error) {
        /* 静默失败，不影响其他功能 */
    }
}

/* 从MVU时间字符串解析并更新显示 */
function updatePhoneTimeFromMVU(currentTimeStr) {
    // currentTimeStr 格式: "2024年11月9日 星期六 14:30"
    if (!currentTimeStr) return;

    try {
        // 提取时间部分（最后5个字符）
        const timeMatch = currentTimeStr.match(/(\d{1,2}:\d{2})$/);
        const timeString = timeMatch ? timeMatch[1] : '14:30';

        // 提取日期部分（年月日）
        const dateMatch = currentTimeStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        let dateString = '10/24';
        if (dateMatch) {
            const month = String(dateMatch[2]).padStart(2, '0');
            const day = String(dateMatch[3]).padStart(2, '0');
            dateString = `${month}/${day}`;
        }

        // 更新锁屏时间和日期
        $('#phone-big-time').text(timeString);
        $('#phone-date').text(dateString);

        // 更新状态栏时间
        $('#phone-status-time').text(timeString);

    } catch (error) {
    }
}

function updatePhoneData(data) {
    if (!data) {
        return;
    }


    //  保存数据到全局变量，供定时器使用
    window.mvuGameData = data;

    // 更新世界信息
    const worldInfo = data.world_info || {};
    const time = worldInfo.time || {};
    const location = worldInfo.location || {};
    const environment = worldInfo.environment || {};

    //  更新时间（从MVU的current_time读取）
    if (time.current_time) {
        updatePhoneTimeFromMVU(time.current_time);
    }

    // 更新天气
    if (environment.weather) {
        $('#phone-weather').text(environment.weather);
        // 更新状态栏天气
        $('#phone-status-weather').text(environment.weather);
    }

    // ✨ 实时更新当前打开的App内容
    if (currentPanel && $('#mobile-phone-overlay').hasClass('active')) {

        // 重新生成并更新当前面板内容
        let content = '';
        switch (currentPanel) {
            case 'messages':
                content = generateMessagesPanel(data);
                break;
            case 'shop':
                content = generateShopPanel(data);
                break;
            case 'gallery':
                content = generateGalleryPanel(data);
                break;
            case 'friends':
                content = generateFriendsPanel(data);
                break;
            case 'checkin':
                content = generateCheckInPanel(data);
                break;
            case 'settings':
                content = generateSizeSettingsPanel();
                break;
            default:
                break;
        }

        if (content) {
            $('#phone-app-body').html(content);
        }
    }

}

