// 选择日期
window.selectCalendarDay = function (day) {
    uiSelectedCalendarDay = day;
    // 重新渲染日历内容（使用 currentPanel 判断，因为 mobile-phone-screen 是 class 不是 id）
    if (currentPanel === 'calendar') {
        const content = generateCalendarPanel(currentPhoneData);
        $('#phone-app-body').html(content);

        // 重新绑定日期点击事件
        setTimeout(() => {
            const $appBody = $('#phone-app-body');
            if ($appBody.length === 0) return;

            // 先解绑之前的事件
            $appBody.off('click.calendar');

            // 绑定日期点击事件
            $appBody.on('click.calendar', '.cal-day', function (e) {
                e.preventDefault();
                e.stopPropagation();

                const clickedDay = $(this).data('day');
                if (clickedDay) {
                    selectCalendarDay(clickedDay);
                }
            });
        }, 50);
    }
};

// 生成日历面板（手机内显示）
function generateCalendarPanel(data) {
    const calendarData = data?.calendar;

    if (!calendarData) {
        return `
            <div class="empty-message">
                <i class="fas fa-calendar-times" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
                <div>日历数据未找到</div>
            </div>
        `;
    }

    const year = calendarData.year || 2024;
    const month = calendarData.month || 4;
    const currentDay = calendarData.current_day || 1;
    const days = calendarData.days || {};

    // 初始化选中日期
    if (uiSelectedCalendarDay === null) {
        uiSelectedCalendarDay = currentDay;
    }

    // 防止切月/切档后的选中日期越界
    const daysInMonth = new Date(year, month, 0).getDate();
    if (uiSelectedCalendarDay > daysInMonth) uiSelectedCalendarDay = currentDay;

    const monthNames = ['', '一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

    // 计算当月第一天是周几
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0-6 (Sun-Sat)

    // 生成日历网格
    let gridHtml = '';
    // 填充空白
    for (let i = 0; i < firstDayOfWeek; i++) {
        gridHtml += `<div class="cal-day empty"></div>`;
    }

    // 填充日期
    for (let day = 1; day <= daysInMonth; day++) {
        const dayEvent = days[day.toString()] || '';
        const isPast = day < currentDay; // 过去
        const isCurrent = day === currentDay; // 今天
        const isSelected = day === uiSelectedCalendarDay; // 选中
        const hasEvent = !!dayEvent; // 有事件
        const isImportant = hasEvent && dayEvent.includes('【'); // 重要事件

        let classes = 'cal-day';
        if (isPast) classes += ' past';
        if (isCurrent) classes += ' current';
        if (isSelected) classes += ' selected';
        if (hasEvent) classes += ' has-event';
        if (isImportant) classes += ' important';

        gridHtml += `
            <div class="${classes}" data-day="${day}">
                <span class="day-num">${day}</span>
                ${hasEvent ? `<span class="event-dot"></span>` : ''}
            </div>
        `;
    }

    // 获取选中日期的事件
    const selectedEvent = days[uiSelectedCalendarDay.toString()] || '无特别安排';
    const isSelectedImportant = selectedEvent.includes('【');

    // 解析事件文本 (简单Markdown支持: 粗体)
    const formatEvent = (text) => {
        return text.replace(/【([^】]+)】/g, '<span class="tag">$1</span>');
    };

    return `
        <style>
            .cal-container {
                --c-bg: #fdfbf7;
                --c-text: #2c3e50;
                --c-accent: #c0392b; /* 赤🔴 */
                --c-accent-light: #e74c3c;
                --c-gold: #d4ac0d;
                --c-gray: #95a5a6;
                --c-gray-light: #ecf0f1;
                
                height: 100%;
                display: flex;
                flex-direction: column;
                background: var(--c-bg);
                color: var(--c-text);
                font-family: 'Shippori Mincho', 'Noto Serif JP', serif;
                overflow: hidden;
            }
            
            /* Header */
            .cal-header {
                padding: 16px 20px;
                display: flex;
                justify-content: space-between;
                align-items: flex-end;
                border-bottom: 2px solid rgba(192, 57, 43, 0.1);
                background: linear-gradient(to bottom, #fff, #fdfbf7);
            }
            .cal-month {
                font-size: 24px;
                font-weight: 700;
                color: var(--c-accent);
                line-height: 1;
            }
            .cal-year {
                font-size: 14px;
                color: var(--c-gray);
                margin-left: 8px;
                font-weight: 400;
            }
            .cal-fullscreen-btn {
                font-size: 14px;
                color: var(--c-accent);
                border: 1px solid var(--c-accent);
                border-radius: 4px;
                padding: 2px 8px;
                background: transparent;
                cursor: pointer;
                transition: all 0.2s;
            }
            .cal-fullscreen-btn:hover {
                background: var(--c-accent);
                color: white;
            }

            /* Weekdays */
            .cal-weekdays {
                display: grid;
                grid-template-columns: repeat(7, 1fr);
                text-align: center;
                font-size: 12px;
                color: var(--c-gray);
                padding: 10px 10px 0;
                font-weight: 600;
            }
            
            /* Grid */
            .cal-grid {
                display: grid;
                grid-template-columns: repeat(7, 1fr);
                gap: 4px;
                padding: 10px;
                flex-shrink: 0;
            }
            
            .cal-day {
                aspect-ratio: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                border-radius: 6px;
                cursor: pointer;
                position: relative;
                transition: all 0.2s;
                border: 1px solid transparent;
            }
            
            .cal-day.empty { pointer-events: none; }
            
            .cal-day:hover { background: rgba(0,0,0,0.03); }
            
            .cal-day.past {
                opacity: 0.4;
                color: var(--c-gray);
            }
            
            .cal-day.current {
                color: var(--c-accent);
                font-weight: 700;
                border-color: var(--c-accent);
            }
            
            .cal-day.selected {
                background: var(--c-accent) !important;
                color: white !important;
                box-shadow: 0 4px 10px rgba(192, 57, 43, 0.3);
                transform: scale(1.05);
                z-index: 2;
                opacity: 1;
            }

            .cal-day.has-event .day-num {
                margin-bottom: 2px;
            }
            
            .event-dot {
                width: 4px;
                height: 4px;
                border-radius: 50%;
                background: var(--c-gray);
            }
            .cal-day.important .event-dot { background: var(--c-accent); }
            .cal-day.selected .event-dot { background: white; }
            .cal-day.current .event-dot { background: var(--c-accent); }

            /* Event Details Card */
            .cal-details {
                flex: 1;
                min-height: 100px;
                max-height: 180px;
                background: white;
                margin: 0 16px 20px;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.05);
                border: 1px solid rgba(0,0,0,0.05);
                padding: 20px;
                overflow-y: auto;
                position: relative;
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                justify-content: flex-start;
                text-align: left;
            }
            
            
            .detail-date {
                font-size: 14px;
                color: var(--c-gray);
                margin-bottom: 12px;
                display: flex;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;
            }
            
            .detail-badge {
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 4px;
                background: var(--c-gray-light);
                color: var(--c-text);
            }
            
            .badge-today { background: var(--c-accent); color: white; }
            
            .cal-container .cal-details .detail-content,
            .detail-content {
                font-size: 15px !important;
                line-height: 1.7 !important;
                color: var(--c-text) !important;
                text-align: left !important;
                word-break: break-word !important;
                flex: 1;
                width: 100%;
                display: block !important;
            }
            
            .detail-content .tag {
                display: inline-block;
                color: var(--c-accent);
                font-weight: 700;
                margin-right: 4px;
            }
            
            /* Custom Scrollbar */
            .cal-details::-webkit-scrollbar { width: 4px; }
            .cal-details::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 2px; }

            /* Watermark Decoration */
            .cal-watermark {
                position: absolute;
                bottom: -20px;
                right: -20px;
                font-size: 120px;
                opacity: 0.03;
                color: var(--c-accent);
                font-family: serif;
                pointer-events: none;
                z-index: 0;
            }
        </style>

        <div class="cal-container">
            <div class="cal-header">
                <div>
                    <span class="cal-month">${monthNames[month]}</span>
                    <span class="cal-year">${year}</span>
                </div>
            </div>

            <div class="cal-weekdays">
                <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
            </div>

            <div class="cal-grid">
                ${gridHtml}
            </div>

            <div class="cal-details">
                <div class="detail-date">
                    ${month}月${uiSelectedCalendarDay}日
                    ${uiSelectedCalendarDay === currentDay ? '<span class="detail-badge badge-today">今日</span>' : ''}
                    ${uiSelectedCalendarDay < currentDay ? '<span class="detail-badge">已结束</span>' : ''}
                </div>
                <div class="detail-content">${formatEvent(selectedEvent)}</div>
                <div class="cal-watermark">花</div>
            </div>
        </div>
    `;
}

// 打开全屏日历查看器
function openCalendarFullscreen() {
    const calendarData = currentPhoneData?.calendar;

    if (!calendarData) {
        if (typeof toastr !== 'undefined') {
            toastr.warning('日历数据未找到');
        }
        return;
    }

    const year = calendarData.year || 2012;
    const month = calendarData.month || 4;
    const currentDay = calendarData.current_day || 1;
    const days = calendarData.days || {};

    // 创建全屏遮罩
    const $fullscreen = $(`
        <div id="calendar-fullscreen-viewer" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: #fdfbf7;
            z-index: 100000;
            display: flex;
            flex-direction: column;
            animation: calendarFsIn 0.3s ease;
            font-family: 'Shippori Mincho', serif;
        ">
            <!-- 顶部工具栏 -->
            <div class="calendar-fs-toolbar" style="
                padding: 20px 40px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: white;
                box-shadow: 0 4px 20px rgba(0,0,0,0.05);
            ">
                <button id="calendar-fs-close" style="
                    width: 40px; height: 40px;
                    border: none; border-radius: 50%;
                    background: transparent;
                    color: #2c3e50; font-size: 24px;
                    cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    transition: all 0.2s;
                "><i class="fas fa-arrow-left"></i></button>
                <div style="font-size: 24px; font-weight: 700; color: #c0392b; letter-spacing: 0.1em;">
                    ${year}年 · ${month}月
                </div>
                <div style="width: 40px;"></div>
            </div>
            
            <!-- 日历容器 -->
            <div id="calendar-fs-container" style="
                flex: 1;
                overflow-y: auto;
                padding: 40px;
                background-image: radial-gradient(#e0e0e0 1px, transparent 1px);
                background-size: 20px 20px;
            ">
                ${generateCalendarContentForFullscreen(year, month, currentDay, days)}
            </div>
            
            <style>
                @keyframes calendarFsIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                #calendar-fs-close:hover {
                    background: rgba(0,0,0,0.05);
                    transform: translateX(-4px);
                }
                #calendar-fs-container::-webkit-scrollbar { width: 8px; }
                #calendar-fs-container::-webkit-scrollbar-thumb { background: #ccc; border-radius: 4px; }
            </style>
        </div>
    `);

    $('body').append($fullscreen);

    // 关闭按钮
    $('#calendar-fs-close').on('click', function (e) {
        e.stopPropagation();
        $('#calendar-fullscreen-viewer').fadeOut(200, function () {
            $(this).remove();
        });
    });

    // ESC键关闭
    $(document).on('keydown.calendarFs', function (e) {
        if (e.key === 'Escape') {
            $('#calendar-fullscreen-viewer').fadeOut(200, function () {
                $(this).remove();
            });
            $(document).off('keydown.calendarFs');
        }
    });
}

// 生成全屏日历内容 (保留旧版列表样式但美化)
function generateCalendarContentForFullscreen(year, month, currentDay, days) {
    const monthNames = ['', '一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
    const daysInMonth = new Date(year, month, 0).getDate();

    let html = '<div style="max-width: 800px; margin: 0 auto; padding-bottom: 60px;">';

    // 遍历每一天
    for (let day = 1; day <= daysInMonth; day++) {
        const dayEvent = days[day.toString()] || '';
        const isPast = day < currentDay;
        const isCurrent = day === currentDay;
        const isImportant = dayEvent.includes('【');

        // 提取【】中的标签内容
        let importantLabel = '';
        if (isImportant) {
            const match = dayEvent.match(/【([^】]+)】/);
            if (match) {
                importantLabel = match[1];
            }
        }

        let cardBg = 'white';
        let borderColor = 'transparent';
        let dayColor = '#2c3e50';
        let opacity = '1';

        if (isPast) {
            opacity = '0.6';
            dayColor = '#95a5a6';
        } else if (isCurrent) {
            borderColor = '#c0392b';
            dayColor = '#c0392b';
        } else if (isImportant) {
            borderColor = '#d4ac0d';
        }

        html += `
            <div style="
                background: ${cardBg};
                border-left: 4px solid ${borderColor};
                border-radius: 4px;
                padding: 24px;
                margin-bottom: 16px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.05);
                opacity: ${opacity};
                display: flex;
                gap: 24px;
            ">
                <div style="
                    display: flex; flex-direction: column; align-items: center;
                    min-width: 60px;
                ">
                    <div style="font-size: 32px; font-weight: 700; color: ${dayColor}; line-height: 1;">${day}</div>
                    <div style="font-size: 12px; color: #95a5a6; margin-top: 4px;">${monthNames[month]}</div>
                </div>
                
                <div style="flex: 1; border-left: 1px solid #eee; padding-left: 24px;">
                    ${isCurrent ? `<div style="display: inline-block; background: #c0392b; color: white; padding: 2px 8px; border-radius: 2px; font-size: 11px; margin-bottom: 8px;">TODAY</div>` : ''}
                    ${importantLabel ? `<div style="display: inline-block; border: 1px solid #c0392b; color: #c0392b; padding: 1px 7px; border-radius: 2px; font-size: 11px; margin-bottom: 8px; margin-left: ${isCurrent ? '8px' : '0'};">${importantLabel}</div>` : ''}
                    
                    <div style="font-size: 15px; color: #34495e; line-height: 1.6;">
                        ${dayEvent || '<span style="color: #bdc3c7; font-style: italic;">No events planned</span>'}
                    </div>
                </div>
            </div>
        `;
    }

    html += '</div>';
    return html;
}

