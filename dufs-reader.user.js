// ==UserScript==
// @name         DUFS Reader - 沉浸式文本阅读器
// @namespace    https://github.com/YOUR_USERNAME/dufs-reader
// @version      1.1.0
// @description  为DUFS文件服务器的文本文件提供沉浸式小说阅读体验
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

    const TEXT_EXT = /\.(txt|text|md|log|novel|asc)(\?.*)?$/i;
    const currentPath = decodeURIComponent(window.location.pathname);
    if (!TEXT_EXT.test(currentPath)) return;

    /* ========================================
       预设
    ======================================== */
    const THEMES = [
        { name: '纯净白', bg: '#FFFFFF', text: '#2B2B2B' },
        { name: '豆沙绿', bg: '#C7EDCC', text: '#2D4A30' },
        { name: '杏仁黄', bg: '#FAF9DE', text: '#4A4A3A' },
        { name: '羊皮纸', bg: '#F5E6CB', text: '#5B4636' },
        { name: '浅月白', bg: '#F0EDE5', text: '#3E3B36' },
        { name: '淡粉', bg: '#FDEDED', text: '#4A3333' },
        { name: '淡蓝', bg: '#E3EDFD', text: '#1A3A5C' },
        { name: '银灰', bg: '#EAEAEA', text: '#333333' },
        { name: '夜间', bg: '#1E2329', text: '#C8CCD0' },
        { name: '墨黑', bg: '#111111', text: '#A8A8A8' },
    ];

    const FONTS = [
        { name: '系统默认', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif' },
        { name: '微软雅黑', value: '"Microsoft YaHei", "微软雅黑", sans-serif' },
        { name: '思源宋体', value: '"Noto Serif SC", "Source Han Serif SC", "思源宋体", serif' },
        { name: '楷体', value: 'KaiTi, "楷体", STKaiti, serif' },
        { name: '仿宋', value: 'FangSong, "仿宋", STFangsong, serif' },
        { name: '宋体', value: 'SimSun, "宋体", "Songti SC", serif' },
    ];

    const DEFAULTS = {
        enabled: true,
        themeIndex: 3,
        fontIndex: 0,
        fontSize: 19,
        fontWeight: 400,
        lineHeight: 2.0,
        contentWidth: 820,
        letterSpacing: 0.5,
        paragraphSpacing: 10,
        textIndent: false,
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
       代理跳转
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
       获取原始文本
    ======================================== */
    const pre = document.querySelector('pre');
    const originalText = (pre ? pre.textContent : document.body.innerText) || '';
    const originalHTML = document.documentElement.innerHTML;
    const fileName = currentPath.split('/').pop().replace(/\.[^.]+$/, '');

    /* ========================================
       字数统计（只统计有效字符：中文、字母、数字）
    ======================================== */
    function countValidChars(text) {
        const matches = text.match(/[\p{L}\p{N}]/gu);
        return matches ? matches.length : 0;
    }
    function formatNumber(n) {
        if (n >= 10000) return (n / 10000).toFixed(1) + ' 万';
        return n.toLocaleString();
    }
    function estimateReadingTime(charCount) {
        const minutes = Math.ceil(charCount / 500);
        if (minutes >= 60) {
            const h = Math.floor(minutes / 60);
            const m = minutes % 60;
            return h + ' 小时' + (m > 0 ? ' ' + m + ' 分钟' : '');
        }
        return minutes + ' 分钟';
    }

    const totalChars = countValidChars(originalText);

    /* ========================================
       段落分类逻辑
    ======================================== */
    // 真正的分隔线：整行只由符号组成，无任何中文/字母/数字
    function isSeparatorLine(text) {
        if (text.length < 2 || text.length > 40) return false;
        return /^[\s\*\-=~·—…☆★●○◆◇■□▲△▽▼◎※#@&+_|/\\><^`'"\u3000]+$/u.test(text)
            && !/[\p{L}\p{N}]/u.test(text);
    }

    // 章节标题：匹配常见章节格式
    function isChapterTitle(text) {
        if (text.length > 40) return false;
        return /^(第[一二三四五六七八九十百千万零\d]+[章节回卷部篇集幕话]|Chapter\s*\d+|CHAPTER\s*\d+|序[章言幕]?$|尾声$|后记$|前言$|楔子$|番外|终章$|引子$|附录)/i.test(text);
    }

    /* ========================================
       全局样式
    ======================================== */
    GM_addStyle(`
        .dr-reader-root * { box-sizing: border-box; margin: 0; padding: 0; }

        /* 进度条 */
        #dr-progress-bar {
            position: fixed; top: 0; left: 0; height: 3px; z-index: 100000;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
            transition: width 0.15s ease-out; width: 0%;
            box-shadow: 0 0 8px rgba(102,126,234,0.5);
        }

        /* 悬浮按钮 */
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

        /* 遮罩 */
        #dr-overlay {
            position: fixed; inset: 0; z-index: 99998;
            background: rgba(0,0,0,0.3); backdrop-filter: blur(2px);
            opacity: 0; visibility: hidden;
            transition: all 0.3s ease;
        }
        #dr-overlay.active { opacity: 1; visibility: visible; }

        /* 面板 */
        #dr-panel {
            position: fixed; top: 0; right: -400px; z-index: 99999;
            width: 380px; height: 100vh; overflow-y: auto;
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

        /* 开关 */
        .dr-toggle-row {
            display: flex; align-items: center; justify-content: space-between;
            padding: 4px 0;
        }
        .dr-toggle-row + .dr-toggle-row { margin-top: 10px; }
        .dr-toggle-label { font-size: 15px; font-weight: 500; color: #333; }
        .dr-toggle-sublabel { font-size: 12px; color: #aaa; margin-top: 2px; }
        .dr-toggle {
            position: relative; width: 50px; height: 28px;
            background: #ddd; border-radius: 14px; cursor: pointer;
            transition: background 0.3s ease; flex-shrink: 0;
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

        /* 颜色按钮 */
        .dr-colors { display: flex; flex-wrap: wrap; gap: 10px; }
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
            opacity: 0; transition: opacity 0.2s; pointer-events: none;
        }
        .dr-color-btn:hover .dr-color-name { opacity: 1; }

        /* 下拉 */
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

        /* 滑动条 */
        .dr-slider-row { margin-bottom: 16px; }
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
        }
        input.dr-slider::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none;
            width: 20px; height: 20px; border-radius: 50%;
            background: linear-gradient(135deg, #667eea, #764ba2);
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(102,126,234,0.35);
            transition: transform 0.2s;
        }
        input.dr-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }
        input.dr-slider::-moz-range-thumb {
            width: 20px; height: 20px; border-radius: 50%; border: none;
            background: linear-gradient(135deg, #667eea, #764ba2);
            cursor: pointer; box-shadow: 0 2px 8px rgba(102,126,234,0.35);
        }

        /* 展开按钮 */
        .dr-expand-btn {
            display: flex; align-items: center; gap: 6px;
            width: 100%; padding: 10px 0; border: none;
            background: none; cursor: pointer; font-size: 13px;
            color: #667eea; font-weight: 500; transition: color 0.2s;
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

        /* 输入框 */
        .dr-input-group { margin-top: 12px; }
        .dr-input-label {
            display: block; font-size: 12px; color: #888;
            margin-bottom: 4px; font-weight: 500;
        }
        .dr-input {
            width: 100%; padding: 8px 12px; border: 1.5px solid #e0e0e0;
            border-radius: 8px; font-size: 13px; color: #333;
            background: #fafafa; outline: none; transition: border-color 0.2s;
        }
        .dr-input:focus { border-color: #667eea; }

        /* ===== 阅读区域 ===== */
        .dr-reader-root {
            min-height: 100vh; padding: 0; margin: 0;
            transition: background-color 0.4s ease, color 0.4s ease;
        }
        .dr-reader-root .dr-title {
            text-align: center; padding: 60px 20px 10px;
            font-size: 26px; font-weight: 700;
            opacity: 0.85; letter-spacing: 2px;
        }
        /* 字数信息栏 */
        .dr-reader-root .dr-meta {
            text-align: center; padding: 8px 20px 30px;
            font-size: 13px; opacity: 0.45;
            display: flex; align-items: center; justify-content: center; gap: 16px;
        }
        .dr-meta-item {
            display: inline-flex; align-items: center; gap: 4px;
        }
        .dr-meta-dot {
            width: 4px; height: 4px; border-radius: 50%;
            background: currentColor; opacity: 0.5;
        }

        .dr-reader-root .dr-content {
            margin: 0 auto; padding: 0 30px 80px;
            transition: max-width 0.4s ease;
        }

        /* 普通段落 —— 默认无缩进，段间距分隔 */
        .dr-reader-root .dr-content p {
            margin-bottom: 0;
            transition: all 0.3s ease;
            word-wrap: break-word;
            text-align: justify;
        }
        /* 开启首行缩进时 */
        .dr-reader-root.indent-on .dr-content p.dr-para {
            text-indent: 2em;
        }
        /* 对话行（引号开头）不缩进 */
        .dr-reader-root.indent-on .dr-content p.dr-dialogue {
            text-indent: 0;
        }

        /* 分隔符 */
        .dr-reader-root .dr-content p.dr-separator {
            text-indent: 0 !important; text-align: center;
            padding: 24px 0; opacity: 0.35;
            font-size: 14px; letter-spacing: 8px;
        }

        /* 章节标题 */
        .dr-reader-root .dr-content p.dr-chapter {
            text-indent: 0 !important; text-align: center;
            font-weight: 700; padding: 32px 0 16px;
            font-size: 1.15em; opacity: 0.8;
            letter-spacing: 2px;
        }

        /* 空行占位 */
        .dr-reader-root .dr-content .dr-blank {
            height: 0.8em;
        }

        /* 底部 */
        .dr-footer {
            text-align: center; padding: 40px 20px 30px;
            font-size: 12px; opacity: 0.4;
        }
        .dr-footer-stats {
            margin-top: 6px; font-size: 11px; opacity: 0.7;
        }

        /* 返回顶部 */
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

        /* 重置按钮 */
        .dr-reset-btn {
            width: 100%; padding: 10px; border: 1.5px dashed #ddd;
            border-radius: 8px; background: none; cursor: pointer;
            font-size: 13px; color: #999; transition: all 0.2s;
            margin-top: 8px;
        }
        .dr-reset-btn:hover { border-color: #667eea; color: #667eea; }

        /* 字数统计徽章（面板内） */
        .dr-stats-badge {
            display: flex; align-items: center; gap: 12px;
            padding: 10px 14px; background: linear-gradient(135deg, #667eea10, #764ba210);
            border-radius: 10px; margin-bottom: 4px;
        }
        .dr-stats-badge .dr-stat-item {
            display: flex; flex-direction: column; align-items: center;
            flex: 1;
        }
        .dr-stats-badge .dr-stat-num {
            font-size: 18px; font-weight: 700;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .dr-stats-badge .dr-stat-label {
            font-size: 11px; color: #999; margin-top: 2px;
        }
        .dr-stats-divider {
            width: 1px; height: 30px; background: #e0e0e0;
        }
    `);

    /* ========================================
       构建阅读界面
    ======================================== */
    function buildReader() {
        const theme = THEMES[settings.themeIndex] || THEMES[3];
        const font = FONTS[settings.fontIndex] || FONTS[0];

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
        root.className = 'dr-reader-root' + (settings.textIndent ? ' indent-on' : '');
        root.style.backgroundColor = theme.bg;
        root.style.color = theme.text;

        // 标题
        const titleEl = document.createElement('div');
        titleEl.className = 'dr-title';
        titleEl.textContent = fileName;
        titleEl.style.fontFamily = font.value;
        root.appendChild(titleEl);

        // 字数统计信息
        const meta = document.createElement('div');
        meta.className = 'dr-meta';
        meta.innerHTML = `
            <span class="dr-meta-item">共 ${formatNumber(totalChars)} 字</span>
            <span class="dr-meta-dot"></span>
            <span class="dr-meta-item">预计 ${estimateReadingTime(totalChars)}</span>
        `;
        meta.style.fontFamily = font.value;
        root.appendChild(meta);

        // 内容区域
        const content = document.createElement('div');
        content.className = 'dr-content';
        content.style.maxWidth = settings.contentWidth + 'px';

        // 解析段落
        const lines = originalText.split(/\n/);
        lines.forEach((line) => {
            const trimmed = line.trim();

            // 空行 → 间距占位
            if (trimmed === '') {
                const blank = document.createElement('div');
                blank.className = 'dr-blank';
                content.appendChild(blank);
                return;
            }

            const p = document.createElement('p');

            if (isSeparatorLine(trimmed)) {
                // 分隔线
                p.className = 'dr-separator';
                p.textContent = '· · ·';
            } else if (isChapterTitle(trimmed)) {
                // 章节标题
                p.className = 'dr-chapter';
                p.textContent = trimmed;
            } else {
                // 判断是否为对话行（以引号开头）
                const isDialogue = /^["""「『【（(\[]/.test(trimmed);
                p.className = isDialogue ? 'dr-dialogue' : 'dr-para';
                p.textContent = trimmed;
            }

            p.style.fontFamily = font.value;
            p.style.fontSize = settings.fontSize + 'px';
            p.style.fontWeight = settings.fontWeight;
            p.style.lineHeight = settings.lineHeight;
            p.style.letterSpacing = settings.letterSpacing + 'px';

            if (!p.classList.contains('dr-separator') && !p.classList.contains('dr-chapter')) {
                p.style.marginBottom = settings.paragraphSpacing + 'px';
            }

            content.appendChild(p);
        });

        root.appendChild(content);

        // 底部
        const footer = document.createElement('div');
        footer.className = 'dr-footer';
        footer.innerHTML = `
            <div>— ${fileName} · 全文完 —</div>
            <div class="dr-footer-stats">共 ${formatNumber(totalChars)} 字 · 预计阅读 ${estimateReadingTime(totalChars)}</div>
        `;
        footer.style.fontFamily = font.value;
        root.appendChild(footer);

        document.body.appendChild(root);

        // 返回顶部
        const backTop = document.createElement('button');
        backTop.id = 'dr-back-top';
        backTop.innerHTML = '↑';
        backTop.title = '返回顶部';
        backTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
        document.body.appendChild(backTop);

        // 滚动
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
        setTimeout(() => injectUI(), 100);
    }

    /* ========================================
       实时更新样式
    ======================================== */
    function applyStyleUpdate() {
        const theme = THEMES[settings.themeIndex] || THEMES[3];
        const font = FONTS[settings.fontIndex] || FONTS[0];
        const root = document.querySelector('.dr-reader-root');
        if (!root) return;

        root.style.backgroundColor = theme.bg;
        root.style.color = theme.text;
        root.classList.toggle('indent-on', settings.textIndent);

        const titleEl = root.querySelector('.dr-title');
        if (titleEl) titleEl.style.fontFamily = font.value;

        const metaEl = root.querySelector('.dr-meta');
        if (metaEl) metaEl.style.fontFamily = font.value;

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
            if (!p.classList.contains('dr-separator') && !p.classList.contains('dr-chapter')) {
                p.style.marginBottom = settings.paragraphSpacing + 'px';
            }
        });
    }

    /* ========================================
       注入UI
    ======================================== */
    function injectUI() {
        // 移除旧的
        ['dr-fab', 'dr-overlay', 'dr-panel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });

        // FAB
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

        panel.innerHTML = `
            <div class="dr-panel-header">
                <h3>📖 阅读设置</h3>
                <button class="dr-panel-close" id="dr-close">✕</button>
            </div>

            <!-- 字数统计 -->
            <div class="dr-section">
                <div class="dr-stats-badge">
                    <div class="dr-stat-item">
                        <span class="dr-stat-num">${formatNumber(totalChars)}</span>
                        <span class="dr-stat-label">有效字数</span>
                    </div>
                    <div class="dr-stats-divider"></div>
                    <div class="dr-stat-item">
                        <span class="dr-stat-num">${estimateReadingTime(totalChars)}</span>
                        <span class="dr-stat-label">预计阅读</span>
                    </div>
                </div>
            </div>

            <!-- 开关 -->
            <div class="dr-section">
                <div class="dr-toggle-row">
                    <span class="dr-toggle-label">✨ 阅读模式</span>
                    <div class="dr-toggle ${settings.enabled ? 'active' : ''}" id="dr-toggle-reader"></div>
                </div>
            </div>

            <!-- 主题 -->
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

            <!-- 字体 -->
            <div class="dr-section">
                <div class="dr-section-title">🔤 字体</div>
                <select class="dr-select" id="dr-font-select">
                    ${FONTS.map((f, i) => `
                        <option value="${i}" ${i === settings.fontIndex ? 'selected' : ''}
                                style="font-family:${f.value}">${f.name}</option>
                    `).join('')}
                </select>
            </div>

            <!-- 排版 -->
            <div class="dr-section">
                <div class="dr-section-title">⚙️ 排版调整</div>

                <!-- 首行缩进开关 -->
                <div class="dr-toggle-row" style="margin-bottom:14px;">
                    <div>
                        <div class="dr-toggle-label" style="font-size:13px;">首行缩进</div>
                        <div class="dr-toggle-sublabel">对话行自动取消缩进</div>
                    </div>
                    <div class="dr-toggle ${settings.textIndent ? 'active' : ''}" id="dr-toggle-indent"></div>
                </div>

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
                        <span class="dr-slider-title">段间距</span>
                        <span class="dr-slider-value" id="dr-val-paragraphspacing">${settings.paragraphSpacing}px</span>
                    </div>
                    <input type="range" class="dr-slider" id="dr-slider-paragraphspacing"
                           min="0" max="40" step="2" value="${settings.paragraphSpacing}">
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

            <!-- 更多设置 -->
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
                        💡 开启后，访问本地地址的文本文件将自动跳转到代理地址，路径保持不变。
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
        const togglePanel = (show) => {
            panel.classList.toggle('active', show);
            overlay.classList.toggle('active', show);
        };
        fab.addEventListener('click', () => togglePanel(true));
        overlay.addEventListener('click', () => togglePanel(false));
        document.getElementById('dr-close').addEventListener('click', () => togglePanel(false));
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

        // 首行缩进开关
        document.getElementById('dr-toggle-indent').addEventListener('click', function () {
            settings.textIndent = !settings.textIndent;
            this.classList.toggle('active', settings.textIndent);
            saveSettings(settings);
            applyStyleUpdate();
        });

        // 主题颜色
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

        // 字体
        document.getElementById('dr-font-select').addEventListener('change', function () {
            settings.fontIndex = parseInt(this.value);
            saveSettings(settings);
            applyStyleUpdate();
        });

        // 滑动条
        const sliderBindings = [
            { id: 'dr-slider-fontsize', key: 'fontSize', valId: 'dr-val-fontsize', suffix: 'px', parse: parseInt },
            { id: 'dr-slider-fontweight', key: 'fontWeight', valId: 'dr-val-fontweight', suffix: '', parse: parseInt },
            { id: 'dr-slider-lineheight', key: 'lineHeight', valId: 'dr-val-lineheight', suffix: '', parse: parseFloat },
            { id: 'dr-slider-letterspacing', key: 'letterSpacing', valId: 'dr-val-letterspacing', suffix: 'px', parse: parseFloat },
            { id: 'dr-slider-paragraphspacing', key: 'paragraphSpacing', valId: 'dr-val-paragraphspacing', suffix: 'px', parse: parseInt },
            { id: 'dr-slider-width', key: 'contentWidth', valId: 'dr-val-width', suffix: 'px', parse: parseInt },
        ];

        sliderBindings.forEach(({ id, key, valId, suffix, parse }) => {
            const slider = document.getElementById(id);
            const valDisplay = document.getElementById(valId);
            if (!slider || !valDisplay) return;
            slider.addEventListener('input', function () {
                const val = parse(this.value);
                settings[key] = val;
                valDisplay.textContent = val + suffix;
                applyStyleUpdate();
            });
            slider.addEventListener('change', () => saveSettings(settings));
        });

        // 展开代理设置
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

        // 代理地址
        document.getElementById('dr-input-local').addEventListener('change', function () {
            settings.localAddress = this.value.trim().replace(/\/+$/, '');
            saveSettings(settings);
        });
        document.getElementById('dr-input-proxy').addEventListener('change', function () {
            settings.proxyAddress = this.value.trim().replace(/\/+$/, '');
            saveSettings(settings);
        });

        // 重置
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
