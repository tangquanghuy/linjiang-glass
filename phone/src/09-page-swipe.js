// ==================== 页面滑动功能 ====================
let pageSwipe = {
    currentPageIndex: 0,
    totalPages: 1,
    isDragging: false,
    hasMoved: false, //  是否真正移动过（用于区分点击和滑动）
    startX: 0,
    currentX: 0,
    threshold: 50, // 拖拽阈值
    initialized: false,
    wrapper: null, // 保存wrapper引用
    indicators: null, // 保存indicators引用
    boundHandleMove: null, // 保存绑定的move函数
    boundHandleEnd: null, // 保存绑定的end函数
    justFinishedDragging: false, // 刚完成拖动（防止立即触发click关闭）

    init: function () {
        // 尝试从jQuery和原生DOM两种方式获取
        let wrapper = document.getElementById('app-pages-wrapper');
        let indicators = document.getElementById('page-indicators');

        // 如果原生找不到，尝试jQuery
        if (!wrapper) {
            const $wrapper = $('#mobile-phone-overlay #app-pages-wrapper');
            wrapper = $wrapper.length > 0 ? $wrapper[0] : null;
        }

        if (!indicators) {
            const $indicators = $('#mobile-phone-overlay #page-indicators');
            indicators = $indicators.length > 0 ? $indicators[0] : null;
        }

        if (!wrapper || !indicators) {
            return;
        }

        // 保存引用
        this.wrapper = wrapper;
        this.indicators = indicators;

        // 创建绑定的函数引用（用于后续移除监听器）
        this.boundHandleMove = this.handleMove.bind(this);
        this.boundHandleEnd = this.handleEnd.bind(this);

        // 鼠标事件 (PC端)
        wrapper.addEventListener('mousedown', this.handleStart.bind(this));
        wrapper.addEventListener('mousemove', this.boundHandleMove);
        wrapper.addEventListener('mouseup', this.boundHandleEnd);
        wrapper.addEventListener('mouseleave', this.boundHandleEnd);

        // 触摸事件 (移动端)
        wrapper.addEventListener('touchstart', this.handleStart.bind(this), { passive: false });
        wrapper.addEventListener('touchmove', this.handleMove.bind(this), { passive: false });
        wrapper.addEventListener('touchend', this.handleEnd.bind(this));

        // 指示器点击事件
        const indicatorElements = indicators.querySelectorAll('.indicator');
        indicatorElements.forEach((indicator, index) => {
            indicator.addEventListener('click', () => {
                this.goToPage(index);
            });
        });
    },

    handleStart: function (e) {
        //  不要立即阻止传播，让点击事件能正常触发
        // 只在真正滑动时（handleMove）才阻止传播

        this.isDragging = true;
        this.hasMoved = false; //  记录是否真的移动了
        this.startX = e.type === 'mousedown' ? e.clientX : e.touches[0].clientX;
        this.currentX = this.startX;

        if (this.wrapper) {
            this.wrapper.style.transition = 'none';
        }

        // 鼠标事件：在document上监听move和up，防止滑出区域
        if (e.type === 'mousedown') {
            document.addEventListener('mousemove', this.boundHandleMove);
            document.addEventListener('mouseup', this.boundHandleEnd);
        }
    },

    handleMove: function (e) {
        if (!this.isDragging) return;

        this.currentX = e.type === 'mousemove' ? e.clientX : e.touches[0].clientX;
        const deltaX = this.currentX - this.startX;

        //  只有当移动超过5px时，才认为是真正的滑动
        if (Math.abs(deltaX) > 5) {
            if (!this.hasMoved) {
                this.hasMoved = true;
            }

            // 现在才阻止默认行为和传播
            e.preventDefault();
            e.stopPropagation();

            if (this.wrapper) {
                const translateX = -this.currentPageIndex * 100 + (deltaX / this.wrapper.offsetWidth) * 100;
                this.wrapper.style.transform = `translateX(${translateX}%)`;
            }
        }
    },

    handleEnd: function (e) {
        if (!this.isDragging) return;

        const deltaX = this.currentX - this.startX;

        //  只有当真正滑动过，才阻止事件传播
        if (this.hasMoved) {
            e.preventDefault();
            e.stopPropagation();
        }

        this.isDragging = false;

        // 移除document上的事件监听器
        document.removeEventListener('mousemove', this.boundHandleMove);
        document.removeEventListener('mouseup', this.boundHandleEnd);

        //  只有真正滑动过，才需要处理页面切换和设置标志
        if (this.hasMoved) {
            // 设置刚完成拖动标志，防止立即触发click关闭手机
            this.justFinishedDragging = true;
            setTimeout(() => {
                this.justFinishedDragging = false;
            }, 100);

            if (this.wrapper) {
                // 恢复过渡效果
                this.wrapper.style.transition = 'transform 0.3s ease-out';

                // 判断是否需要切换页面
                if (Math.abs(deltaX) > this.threshold) {
                    if (deltaX > 0 && this.currentPageIndex > 0) {
                        // 向右滑动，切换到上一页
                        this.goToPage(this.currentPageIndex - 1);
                    } else if (deltaX < 0 && this.currentPageIndex < this.totalPages - 1) {
                        // 向左滑动，切换到下一页
                        this.goToPage(this.currentPageIndex + 1);
                    } else {
                        // 回到当前页
                        this.goToPage(this.currentPageIndex);
                    }
                } else {
                    // 回到当前页
                    this.goToPage(this.currentPageIndex);
                }
            }
        }
    },

    goToPage: function (pageIndex) {
        if (pageIndex < 0 || pageIndex >= this.totalPages) return;

        this.currentPageIndex = pageIndex;
        if (this.wrapper) {
            this.wrapper.style.transform = `translateX(-${pageIndex * 100}%)`;
        }

        // 更新指示器
        this.updateIndicators();
    },

    updateIndicators: function () {
        if (!this.indicators) return;

        const indicatorElements = this.indicators.querySelectorAll('.indicator');
        indicatorElements.forEach((indicator, index) => {
            if (index === this.currentPageIndex) {
                indicator.classList.add('active');
            } else {
                indicator.classList.remove('active');
            }
        });
    }
};

function initPageSwipe() {
    pageSwipe.init();
}

