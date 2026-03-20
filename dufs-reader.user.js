// ==UserScript==
// @name         DUFS Reader - 沉浸式文本阅读器
// @namespace    https://github.com/YOUR_USERNAME/dufs-reader
// @version      1.0.0
// @description  为DUFS文件服务器的文本文件提供沉浸式小说阅读体验，支持主题/字体/代理等设置
// @author       lushuaihui
// @match        http://192.168.5.2:5000/*
// @match        https://admin.lushuaihui.top:12030/*
// @match        http://admin.lushuaihui.top:12030/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-end
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/lushuaihui/dufs-reader/main/dufs-reader.user.js
// @downloadURL  https://raw.githubusercontent.com/lushuaihui/dufs-reader/main/dufs-reader.user.js
// ==/UserScript==

(function () {
    'use strict';

    /* ========================================
       常量 & 预设
    ======================================== */
    const TEXT_EXT = /\.(txt|text|md|log|novel|asc)(\?.*)?$/i;
    const currentPath = decodeURIComponent(window.location.pathname);

    // 不是文本文件则退出
    if (!TEXT_EXT.test(currentPath)) return;

    // 主题预设 —— 精选护眼色
    const THEMES = [
        { name: '纯净白', bg: '#FFFFFF', text: '#2B2B2B' },
        { name: '豆沙绿', bg: '#C7EDCC', text: '#2D4A30' },
        { name: '杏仁黄', bg: '#FAF9DE', text: '#4A4A3A' },
        { name: '羊皮纸', bg: '#F5E6CB', text: '#5B4636' },
        { name: '淡粉', bg: '#FDEDED', text: '#4A3333' },
        { name: '淡蓝', bg: '#E3EDFD', text: '#1A3A5C' },
        { name: '银灰', bg: '#EAEAEA', text: '#333333' },
        { name: '夜间', bg: '#1C2833', text: '#D5D8DC' },
        { name: '墨黑', bg: '#111111', text: '#B8B8B8' },
    ];

    // 字体预设
    const FONTS = [
        { name: '系统默认', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif' },
        { name: '微软雅黑', value: '"Microsoft YaHei", "微软雅黑", sans-serif' },
        { name: '思源宋体', value: '"Noto Serif SC", "Source Han Serif SC", "思源宋体", serif' },
        { name: '楷体', value: 'KaiTi, "楷体", STKaiti, serif' },
        { name: '仿宋', value: 'FangSong, "仿宋", STFangsong, serif' },
        { name: '宋体', value: 'SimSun, "宋体", "Songti SC", serif' },
    ];

    // 默认配置
    const DEFAULTS = {
        enabled: true,
        themeIndex: 3,       // 羊皮纸
        fontIndex: 0,        // 系统默认
        fontSize: 19,        // px
        fontWeight: 400,
        lineHeight: 2.0,
        contentWidth: 820,   // px
        letterSpacing: 0.5,  // px
        proxyEnabled: false,
        proxyAddress: 'http://admin.lushuaihui.top:12030',
        localAddress: 'http://192.168.5.2:5000',
    };

    /* ========================================
       设置存取
    ======================================== */
    function loadSettings() {
        try {
            const raw = GM_getValue('dufs_reader_settings', null);
            return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
        } catch { return { ...DEFAULTS }; }
    }
    function saveSettings(s) {
        GM_setValue('dufs_reader_settings', JSON.stringify(s));
    }

    let settings = loadSettings();

    /* ========================================
       代理跳转（无感）
    ======================================== */
    function handleProxy() {
        if (!settings.proxyEnabled) return false;
        const cur = window.location.origin;
        const local = settings.localAddress.replace(/\/+$/, '');
        if (cur === local) {
            const target = settings.proxyAddress.replace(/\/+$/, '') + window.location.pathname + window.location.search + window.location.hash;
            window.location.replace(target);
            return true;
        }
        return false;
    }
    if (handleProxy()) return;

    /* ========================================
       获取原始文本内容
    ======================================== */
    const pre = document.querySelector('pre');
    const originalText = (pre ? pre.textContent : document.body.innerText) || '';
    const originalHTML = document.documentElement.innerHTML;
    const fileName = currentPath.split('/').pop().replace(/\.[^.]+$/, '');

    /* ========================================
       注入全局样式
    ======================================== */
    GM_addStyle(`
        /* ===== 基础重置 ===== */
        .dr-reader-root * { box-sizing: border-box; margin: 0; padding: 0; }

        /* ===== 阅读进度条 ===== */
        #dr-progress-bar {
            position: fixed; top: 0; left: 0; height: 3px; z-index: 100000;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
            transition: width 0.15s ease-out; width: 0%;
            box-shadow: 0 0 8px rgba(102,126,234,0.5);
        }

        /* ===== 悬浮按钮 ===== */
        #dr-fab {
            position: fixed; top: 20px; right: 20px; z-index: 99999;
            width: 46px; height: 46px; border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: none; cursor: pointer;
            box-shadow: 0 4px 15px rgba(102,126,234,0.4);
            display: flex; align-items: center; justify-content: center;
            transition: all 0.3s cubic-bezier(.4,0,.2,1);
            font-size: 20px; color: white;
        }
        #dr-fab:hover {
            transform: scale(1.1) rotate(5deg);
            box-shadow: 0 6px 24px rgba(102,126,234,0.55);
        }

        /* ===== 遮罩 ===== */
        #dr-overlay {
            position: fixed; inset: 0; z-index: 99998;
            background: rgba(0,0,0,0.3); backdrop-filter: blur(2px);
            opacity: 0; visibility: hidden;
            transition: all 0.3s ease;
        }
        #dr-overlay.active { opacity: 1; visibility: visible; }

        /* ===== 设置面板 ===== */
        #dr-panel {
            position: fixed; top: 0; right: -380px; z-index: 99999;
            width: 360px; height: 100vh; overflow-y: auto;
            background: #fff; color: #333;
            box-shadow: -4px 0 30px rgba(0,0,0,0.15);
            transition: right 0.35s cubic-bezier(.4,0,.2,1);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
            font-size: 14px;
        }
        #dr-panel.active { right: 0; }
        #dr-panel::-webkit-scrollbar { width: 4px; }
        #dr-panel::-webkit-scrollbar-thumb { background: #ccc; border-radius: 2px; }

        .dr-panel-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 20px 22px 16px; border-bottom: 1px solid #f0f0f0;
            background: linear-gradient(135deg, #667eea08, #764ba208);
        }
        .dr-panel-header h3 {
            font-size: 17px; font-weight: 600; color: #333;
            display: flex; align-items: center; gap: 8px;
        }
        .dr-panel-close {
            width: 32px; height: 32px; border: none; border-radius: 8px;
            background: #f5f5f5; cursor: pointer; font-size: 18px; color: #999;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.2s;
        }
        .dr-panel-close:hover { background: #eee; color: #666; }

        .dr-section {
            padding: 18px 22px; border-bottom: 1px solid #f5f5f5;
        }
        .dr-section-title {
            font-size: 13px; font-weight: 600; color: #888;
            text-transform: uppercase; letter-spacing: 1px;
            margin-bottom: 14px;
        }

        /* ===== 开关 ===== */
        .dr-toggle-row {
            display: flex; align-items: center; justify-content: space-between;
            padding: 4px 0;
        }
        .dr-toggle-label {
            font-size: 15px; font-weight: 500; color: #333;
        }
        .dr-toggle {
            position: relative; width: 50px; height: 28px;
            background: #ddd; border-radius: 14px; cursor: pointer;
            transition: background 0.3s ease;
            flex-shrink: 0;
        }
        .dr-toggle.active { background: #667eea; }
        .dr-toggle::after {
            content: ''; position: absolute;
            width: 22px; height: 22px; border-radius: 50%;
            background: #fff; top: 3px; left: 3px;
            transition: transform 0.3s cubic-bezier(.4,0,.2,1);
            box-shadow: 0 1px 4px rgba(0,0,0,0.15);
        }
        .dr-toggle.active::after { transform: translateX(22px); }

        /* ===== 颜色选择器 ===== */
        .dr-colors {
            display: flex; flex-wrap: wrap; gap: 10px;
        }
        .dr-color-btn {
            width: 36px; height: 36px; border-radius: 50%;
            border: 3px solid transparent; cursor: pointer;
            transition: all 0.25s ease; position: relative;
            box-shadow: 0 1px 4px rgba(0,0,0,0.1);
        }
        .dr-color-btn:hover { transform: scale(1.15); }
        .dr-color-btn.selected {
            border-color: #667eea;
            box-shadow: 0 0 0 2px #fff, 0 0 0 4px #667eea;
        }
        .dr-color-btn .dr-color-name {
            position: absolute; bottom: -20px; left: 50%;
            transform: translateX(-50%); font-size: 10px;
            color: #999; white-space: nowrap;
            opacity: 0; transition: opacity 0.2s;
            pointer-events: none;
        }
        .dr-color-btn:hover .dr-color-name { opacity: 1; }

        /* ===== 下拉框 ===== */
        .dr-select {
            width: 100%; padding: 8px 12px; border: 1.5px solid #e0e0e0;
            border-radius: 8px; font-size: 14px; color: #333;
            background: #fafafa; cursor: pointer; outline: none;
            transition: border-color 0.2s;
            -webkit-appearance: none; appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
            background-repeat: no-repeat; background-position: right 12px center;
        }
        .dr-select:focus { border-color: #667eea; }

        /* ===== 滑动条 ===== */
        .dr-slider-row {
            margin-bottom: 16px;
        }
        .dr-slider-row:last-child { margin-bottom: 0; }
        .dr-slider-header {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 8px;
        }
        .dr-slider-title { font-size: 13px; color: #555; font-weight: 500; }
        .dr-slider-value {
            font-size: 12px; color: #667eea; font-weight: 600;
            background: #667eea15; padding: 2px 8px; border-radius: 4px;
        }

        input.dr-slider {
            -webkit-appearance: none; appearance: none;
            width: 100%; height: 6px; border-radius: 3px;
            background: #e8e8e8; outline: none; cursor: pointer;
            transition: background 0.2s;
        }
        input.dr-slider::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none;
            width: 20px; height: 20px; border-radius: 50%;
            background: linear-gradient(135deg, #667eea, #764ba2);
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(102,126,234,0.35);
            transition: transform 0.2s;
        }
        input.dr-slider::-webkit-slider-thumb:hover {
            transform: scale(1.2);
        }
        input.dr-slider::-moz-range-thumb {
            width: 20px; height: 20px; border-radius: 50%; border: none;
            background: linear-gradient(135deg, #667eea, #764ba2);
            cursor: pointer; box-shadow: 0 2px 8px rgba(102,126,234,0.35);
        }

        /* ===== 更多设置折叠 ===== */
        .dr-expand-btn {
            display: flex; align-items: center; gap: 6px;
            width: 100%; padding: 10px 0; border: none;
            background: none; cursor: pointer; font-size: 13px;
            color: #667eea; font-weight: 500;
            transition: color 0.2s;
        }
        .dr-expand-btn:hover { color: #764ba2; }
        .dr-expand-btn .arrow {
            transition: transform 0.3s; display: inline-block; font-size: 10px;
        }
        .dr-expand-btn.expanded .arrow { transform: rotate(90deg); }

        .dr-proxy-section {
            max-height: 0; overflow: hidden;
            transition: max-height 0.4s cubic-bezier(.4,0,.2,1), opacity 0.3s;
            opacity: 0;
        }
        .dr-proxy-section.show { max-height: 400px; opacity: 1; }

        /* ===== 输入框 ===== */
        .dr-input-group { margin-top: 12px; }
        .dr-input-label {
            display: block; font-size: 12px; color: #888;
            margin-bottom: 4px; font-weight: 500;
        }
        .dr-input {
            width: 100%; padding: 8px 12px; border: 1.5px solid #e0e0e0;
            border-radius: 8px; font-size: 13px; color: #333;
            background: #fafafa; outline: none;
            transition: border-color 0.2s;
        }
        .dr-input:focus { border-color: #667eea; }

        /* ===== 阅读区域 ===== */
        .dr-reader-root {
            min-height: 100vh; padding: 0; margin: 0;
            transition: background-color 0.4s ease, color 0.4s ease;
        }
        .dr-reader-root .dr-title {
            text-align: center; padding: 60px 20px 30px;
            font-size: 24px; font-weight: 700;
            opacity: 0.85; letter-spacing: 2px;
        }
        .dr-reader-root .dr-content {
            margin: 0 auto; padding: 0 30px 80px;
            transition: max-width 0.4s ease;
        }
        .dr-reader-root .dr-content p {
            text-indent: 2em;
            margin-bottom: 0;
            transition: font-size 0.3s, font-weight 0.3s, line-height 0.3s;
            word-wrap: break-word;
            text-align: justify;
        }
        .dr-reader-root .dr-content p.dr-separator {
            text-indent: 0; text-align: center;
            padding: 20px 0; font-weight: bold; opacity: 0.5;
        }
        .dr-reader-root .dr-content p.dr-short-line {
            text-indent: 0; text-align: center;
            font-weight: 600; padding: 16px 0 8px; opacity: 0.7;
        }

        /* ===== 底部信息 ===== */
        .dr-footer {
            text-align: center; padding: 40px 20px 30px;
            font-size: 12px; opacity: 0.4;
        }

        /* ===== 返回顶部 ===== */
        #dr-back-top {
            position: fixed; bottom: 30px; right: 30px; z-index: 99990;
            width: 42px; height: 42px; border-radius: 50%;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border: none; cursor: pointer; color: #fff; font-size: 18px;
            box-shadow: 0 4px 15px rgba(102,126,234,0.35);
            display: flex; align-items: center; justify-content: center;
            opacity: 0; visibility: hidden;
            transition: all 0.3s ease;
        }
        #dr-back-top.visible { opacity: 1; visibility: visible; }
        #dr-back-top:hover {
            transform: translateY(-3px);
            box-shadow: 0 6px 20px rgba(102,126,234,0.5);
        }

        /* ===== 重置按钮 ===== */
        .dr-reset-btn {
            width: 100%; padding: 10px; border: 1.5px dashed #ddd;
            border-radius: 8px; background: none; cursor: pointer;
            font-size: 13px; color: #999; transition: all 0.2s;
            margin-top: 8px;
        }
        .dr-reset-btn:hover { border-color: #667eea; color: #667eea; }
    `);

    /* ========================================
       构建阅读界面
    ======================================== */
    function buildReader() {
        const theme = THEMES[settings.themeIndex] || THEMES[3];
        const font = FONTS[settings.fontIndex] || FONTS[0];

        // 清除原始内容
        document.title = fileName + ' - DUFS Reader';
        document.body.innerHTML = '';
        document.body.className = '';
        document.body.style.cssText = 'margin:0;padding:0;';
        document.documentElement.style.cssText = 'margin:0;padding:0;';

        // 进度条
        const progressBar = document.createElement('div');
        progressBar.id = 'dr-progress-bar';
        document.body.appendChild(progressBar);

        // 阅读容器
        const root = document.createElement('div');
        root.className = 'dr-reader-root';
        root.style.backgroundColor = theme.bg;
        root.style.color = theme.text;

        // 标题
        const title = document.createElement('div');
        title.className = 'dr-title';
        title.textContent = fileName;
        title.style.fontFamily = font.value;
        root.appendChild(title);

        // 内容区域
        const content = document.createElement('div');
        content.className = 'dr-content';
        content.style.maxWidth = settings.contentWidth + 'px';

        // 处理段落
        const lines = originalText.split(/\n/);
        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed === '') return; // 跳过空行

            const p = document.createElement('p');

            // 特殊行识别（分隔符、短标题行）
            if (/^[\*\-=~·]{3,}$/.test(trimmed) || trimmed === '***' || trimmed === '---') {
                p.className = 'dr-separator';
                p.textContent = trimmed;
            } else if (trimmed.length <= 15 && !/[，。！？；：、""''（）]/.test(trimmed)) {
                // 可能是章节标题
                p.className = 'dr-short-line';
                p.textContent = trimmed;
            } else {
                p.textContent = trimmed;
            }

            p.style.fontFamily = font.value;
            p.style.fontSize = settings.fontSize + 'px';
            p.style.fontWeight = settings.fontWeight;
            p.style.lineHeight = settings.lineHeight;
            p.style.letterSpacing = settings.letterSpacing + 'px';
            p.style.marginBottom = (settings.lineHeight * settings.fontSize * 0.5) + 'px';

            content.appendChild(p);
        });

        root.appendChild(content);

        // 底部
        const footer = document.createElement('div');
        footer.className = 'dr-footer';
        footer.textContent = '— ' + fileName + ' · DUFS Reader —';
        footer.style.fontFamily = font.value;
        root.appendChild(footer);

        document.body.appendChild(root);

        // 返回顶部按钮
        const backTop = document.createElement('button');
        backTop.id = 'dr-back-top';
        backTop.innerHTML = '↑';
        backTop.title = '返回顶部';
        backTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
        document.body.appendChild(backTop);

        // 滚动事件
        const onScroll = () => {
            const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
            const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const progress = scrollHeight > 0 ? (scrollTop / scrollHeight * 100) : 0;
            progressBar.style.width = progress + '%';
            backTop.classList.toggle('visible', scrollTop > 400);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    /* ========================================
       恢复原始界面
    ======================================== */
    function restoreOriginal() {
        document.documentElement.innerHTML = originalHTML;
        // 重新注入 FAB 和面板（延迟以等DOM稳定）
        setTimeout(() => {
            injectUI();
        }, 100);
    }

    /* ========================================
       实时更新样式（不重建DOM）
    ======================================== */
    function applyStyleUpdate() {
        const theme = THEMES[settings.themeIndex] || THEMES[3];
        const font = FONTS[settings.fontIndex] || FONTS[0];
        const root = document.querySelector('.dr-reader-root');
        if (!root) return;

        root.style.backgroundColor = theme.bg;
        root.style.color = theme.text;

        const titleEl = root.querySelector('.dr-title');
        if (titleEl) titleEl.style.fontFamily = font.value;

        const content = root.querySelector('.dr-content');
        if (content) content.style.maxWidth = settings.contentWidth + 'px';

        const footerEl = root.querySelector('.dr-footer');
        if (footerEl) footerEl.style.fontFamily = font.value;

        root.querySelectorAll('.dr-content p').forEach(p => {
            p.style.fontFamily = font.value;
            p.style.fontSize = settings.fontSize + 'px';
            p.style.fontWeight = settings.fontWeight;
            p.style.lineHeight = settings.lineHeight;
            p.style.letterSpacing = settings.letterSpacing + 'px';
            p.style.marginBottom = (settings.lineHeight * settings.fontSize * 0.5) + 'px';
        });
    }

    /* ========================================
       构建设置面板
    ======================================== */
    function injectUI() {
        // 悬浮按钮
        const fab = document.createElement('button');
        fab.id = 'dr-fab';
        fab.innerHTML = '📖';
        fab.title = '阅读设置';
        document.body.appendChild(fab);

        // 遮罩
        const overlay = document.createElement('div');
        overlay.id = 'dr-overlay';
        document.body.appendChild(overlay);

        // 面板
        const panel = document.createElement('div');
        panel.id = 'dr-panel';

        const theme = THEMES[settings.themeIndex] || THEMES[3];

        panel.innerHTML = `
            <div class="dr-panel-header">
                <h3>📖 阅读设置</h3>
                <button class="dr-panel-close" id="dr-close">✕</button>
            </div>

            <!-- 阅读模式开关 -->
            <div class="dr-section">
                <div class="dr-toggle-row">
                    <span class="dr-toggle-label">✨ 阅读模式</span>
                    <div class="dr-toggle ${settings.enabled ? 'active' : ''}" id="dr-toggle-reader"></div>
                </div>
            </div>

            <!-- 主题颜色 -->
            <div class="dr-section">
                <div class="dr-section-title">🎨 主题颜色</div>
                <div class="dr-colors" id="dr-theme-colors">
                    ${THEMES.map((t, i) => `
                        <div class="dr-color-btn ${i === settings.themeIndex ? 'selected' : ''}"
                             style="background:${t.bg}; ${t.bg === '#FFFFFF' ? 'box-shadow: inset 0 0 0 1px #ddd, 0 1px 4px rgba(0,0,0,0.1);' : ''}"
                             data-index="${i}" title="${t.name}">
                            <span class="dr-color-name">${t.name}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- 字体选择 -->
            <div class="dr-section">
                <div class="dr-section-title">🔤 字体</div>
                <select class="dr-select" id="dr-font-select">
                    ${FONTS.map((f, i) => `
                        <option value="${i}" ${i === settings.fontIndex ? 'selected' : ''}
                                style="font-family:${f.value}">${f.name}</option>
                    `).join('')}
                </select>
            </div>

            <!-- 滑动条设置 -->
            <div class="dr-section">
                <div class="dr-section-title">⚙️ 排版调整</div>

                <div class="dr-slider-row">
                    <div class="dr-slider-header">
                        <span class="dr-slider-title">字体大小</span>
                        <span class="dr-slider-value" id="dr-val-fontsize">${settings.fontSize}px</span>
                    </div>
                    <input type="range" class="dr-slider" id="dr-slider-fontsize"
                           min="14" max="32" step="1" value="${settings.fontSize}">
                </div>

                <div class="dr-slider-row">
                    <div class="dr-slider-header">
                        <span class="dr-slider-title">字体粗细</span>
                        <span class="dr-slider-value" id="dr-val-fontweight">${settings.fontWeight}</span>
                    </div>
                    <input type="range" class="dr-slider" id="dr-slider-fontweight"
                           min="300" max="900" step="100" value="${settings.fontWeight}">
                </div>

                <div class="dr-slider-row">
                    <div class="dr-slider-header">
                        <span class="dr-slider-title">行间距</span>
                        <span class="dr-slider-value" id="dr-val-lineheight">${settings.lineHeight}</span>
                    </div>
                    <input type="range" class="dr-slider" id="dr-slider-lineheight"
                           min="1.2" max="3.0" step="0.1" value="${settings.lineHeight}">
                </div>

                <div class="dr-slider-row">
                    <div class="dr-slider-header">
                        <span class="dr-slider-title">字间距</span>
                        <span class="dr-slider-value" id="dr-val-letterspacing">${settings.letterSpacing}px</span>
                    </div>
                    <input type="range" class="dr-slider" id="dr-slider-letterspacing"
                           min="0" max="4" step="0.5" value="${settings.letterSpacing}">
                </div>

                <div class="dr-slider-row">
                    <div class="dr-slider-header">
                        <span class="dr-slider-title">内容宽度</span>
                        <span class="dr-slider-value" id="dr-val-width">${settings.contentWidth}px</span>
                    </div>
                    <input type="range" class="dr-slider" id="dr-slider-width"
                           min="500" max="1400" step="20" value="${settings.contentWidth}">
                </div>
            </div>

            <!-- 更多设置（代理） -->
            <div class="dr-section">
                <button class="dr-expand-btn" id="dr-expand-proxy">
                    <span class="arrow">▶</span> 更多设置（代理跳转）
                </button>
                <div class="dr-proxy-section" id="dr-proxy-section">
                    <div class="dr-toggle-row" style="margin-top:8px;">
                        <span class="dr-toggle-label">🌐 代理跳转</span>
                        <div class="dr-toggle ${settings.proxyEnabled ? 'active' : ''}" id="dr-toggle-proxy"></div>
                    </div>
                    <div class="dr-input-group">
                        <label class="dr-input-label">本地地址</label>
                        <input class="dr-input" id="dr-input-local" type="text"
                               value="${settings.localAddress}" placeholder="http://192.168.5.2:5000">
                    </div>
                    <div class="dr-input-group">
                        <label class="dr-input-label">代理地址</label>
                        <input class="dr-input" id="dr-input-proxy" type="text"
                               value="${settings.proxyAddress}" placeholder="http://admin.lushuaihui.top:12030">
                    </div>
                    <p style="font-size:11px;color:#aaa;margin-top:10px;line-height:1.5;">
                        💡 开启后，访问本地地址的文本文件将自动跳转到代理地址，适用于内网穿透场景。
                    </p>
                </div>
            </div>

            <!-- 重置 -->
            <div class="dr-section" style="border-bottom:none;">
                <button class="dr-reset-btn" id="dr-reset">↻ 恢复默认设置</button>
            </div>
        `;

        document.body.appendChild(panel);

        /* ===== 事件绑定 ===== */

        // 打开/关闭面板
        const togglePanel = (show) => {
            panel.classList.toggle('active', show);
            overlay.classList.toggle('active', show);
        };
        fab.addEventListener('click', () => togglePanel(true));
        overlay.addEventListener('click', () => togglePanel(false));
        document.getElementById('dr-close').addEventListener('click', () => togglePanel(false));

        // ESC 关闭面板
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') togglePanel(false);
        });

        // 阅读模式开关
        document.getElementById('dr-toggle-reader').addEventListener('click', function () {
            settings.enabled = !settings.enabled;
            this.classList.toggle('active', settings.enabled);
            saveSettings(settings);
            togglePanel(false);
            if (settings.enabled) {
                buildReader();
                injectUI();
            } else {
                restoreOriginal();
            }
        });

        // 主题颜色选择
        document.getElementById('dr-theme-colors').addEventListener('click', function (e) {
            const btn = e.target.closest('.dr-color-btn');
            if (!btn) return;
            const idx = parseInt(btn.dataset.index);
            settings.themeIndex = idx;
            saveSettings(settings);
            this.querySelectorAll('.dr-color-btn').forEach((b, i) => {
                b.classList.toggle('selected', i === idx);
            });
            applyStyleUpdate();
        });

        // 字体选择
        document.getElementById('dr-font-select').addEventListener('change', function () {
            settings.fontIndex = parseInt(this.value);
            saveSettings(settings);
            applyStyleUpdate();
        });

        // 滑动条通用处理
        const sliderBindings = [
            { id: 'dr-slider-fontsize', key: 'fontSize', valId: 'dr-val-fontsize', suffix: 'px', parse: parseInt },
            { id: 'dr-slider-fontweight', key: 'fontWeight', valId: 'dr-val-fontweight', suffix: '', parse: parseInt },
            { id: 'dr-slider-lineheight', key: 'lineHeight', valId: 'dr-val-lineheight', suffix: '', parse: parseFloat },
            { id: 'dr-slider-letterspacing', key: 'letterSpacing', valId: 'dr-val-letterspacing', suffix: 'px', parse: parseFloat },
            { id: 'dr-slider-width', key: 'contentWidth', valId: 'dr-val-width', suffix: 'px', parse: parseInt },
        ];

        sliderBindings.forEach(({ id, key, valId, suffix, parse }) => {
            const slider = document.getElementById(id);
            const valDisplay = document.getElementById(valId);
            slider.addEventListener('input', function () {
                const val = parse(this.value);
                settings[key] = val;
                valDisplay.textContent = val + suffix;
                applyStyleUpdate();
            });
            slider.addEventListener('change', () => saveSettings(settings));
        });

        // 更多设置展开
        document.getElementById('dr-expand-proxy').addEventListener('click', function () {
            this.classList.toggle('expanded');
            document.getElementById('dr-proxy-section').classList.toggle('show');
        });

        // 代理开关
        document.getElementById('dr-toggle-proxy').addEventListener('click', function () {
            settings.proxyEnabled = !settings.proxyEnabled;
            this.classList.toggle('active', settings.proxyEnabled);
            saveSettings(settings);
        });

        // 代理地址输入
        document.getElementById('dr-input-local').addEventListener('change', function () {
            settings.localAddress = this.value.trim().replace(/\/+$/, '');
            saveSettings(settings);
        });
        document.getElementById('dr-input-proxy').addEventListener('change', function () {
            settings.proxyAddress = this.value.trim().replace(/\/+$/, '');
            saveSettings(settings);
        });

        // 重置设置
        document.getElementById('dr-reset').addEventListener('click', () => {
            if (confirm('确定要恢复所有默认设置吗？')) {
                settings = { ...DEFAULTS };
                saveSettings(settings);
                togglePanel(false);
                if (settings.enabled) {
                    buildReader();
                    injectUI();
                }
            }
        });
    }

    /* ========================================
       初始化
    ======================================== */
    if (settings.enabled) {
        buildReader();
    }
    injectUI();

})();
