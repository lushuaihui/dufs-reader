// ==UserScript==
// @name         DUFS Reader - 沉浸式文本阅读器
// @namespace    https://github.com/YOUR_USERNAME/dufs-reader
// @version      1.2.0
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
// @updateURL    https://raw.githubusercontent.com/YOUR_USERNAME/dufs-reader/main/dufs-reader.user.js
// @downloadURL  https://raw.githubusercontent.com/YOUR_USERNAME/dufs-reader/main/dufs-reader.user.js
// ==/UserScript==

(function () {
    'use strict';

    const TEXT_EXT = /\.(txt|text|md|log|novel|asc)(\?.*)?$/i;
    const currentPath = decodeURIComponent(window.location.pathname);
    if (!TEXT_EXT.test(currentPath)) return;

    const PANEL_WIDTH = 380;

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

    // 代理跳转
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

    // 获取原始文本
    const pre = document.querySelector('pre');
    const originalText = (pre ? pre.textContent : document.body.innerText) || '';
    const originalHTML = document.documentElement.innerHTML;
    const fileName = currentPath.split('/').pop().replace(/\.[^.]+$/, '');

    // 字数统计
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

    // 段落分类
    function isSeparatorLine(text) {
        if (text.length < 2 || text.length > 40) return false;
        return /^[\s\*\-=~·—…☆★●○◆◇■□▲△▽▼◎※#@&+_|/\\><^`'"\u3000]+$/u.test(text)
            && !/[\p{L}\p{N}]/u.test(text);
    }
    function isChapterTitle(text) {
        if (text.length > 40) return false;
        return /^(第[一二三四五六七八九十百千万零\d]+[章节回卷部篇集幕话]|Chapter\s*\d+|CHAPTER\s*\d+|序[章言幕]?$|尾声$|后记$|前言$|楔子$|番外|终章$|引子$|附录)/i.test(text);
    }

    /* ========================================
       样式
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

        /* ===== 悬浮按钮 ===== */
        #dr-fab {
            position: fixed; top: 20px; right: 20px; z-index: 100001;
            width: 46px; height: 46px; border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: none; cursor: pointer;
            box-shadow: 0 4px 15px rgba(102,126,234,0.4);
            display: flex; align-items: center; justify-content: center;
            transition: all 0.35s cubic-bezier(.4,0,.2,1);
            font-size: 20px; color: white;
        }
        #dr-fab:hover {
            transform: scale(1.1) rotate(5deg);
            box-shadow: 0 6px 24px rgba(102,126,234,0.55);
        }
        /* 面板打开时 FAB 左移避让 */
        #dr-fab.shifted {
            right: ${PANEL_WIDTH + 20}px;
        }

        /* ===== 遮罩：完全透明，仅用于捕获点击关闭面板 ===== */
        #dr-overlay {
            position: fixed; inset: 0; z-index: 99998;
            background: transparent;
            opacity: 0; visibility: hidden;
            transition: opacity 0.3s ease;
            cursor: default;
        }
        #dr-overlay.active {
            opacity: 1; visibility: visible;
        }

        /* ===== 面板 ===== */
        #dr-panel {
            position: fixed; top: 0; right: -${PANEL_WIDTH + 20}px; z-index: 99999;
            width: ${PANEL_WIDTH}px; height: 100vh; overflow-y: auto;
            background: rgba(255,255,255,0.97);
            backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            color: #333;
            box-shadow: -2px 0 30px rgba(0,0,0,0.10);
            transition: right 0.35s cubic-bezier(.4,0,.2,1);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
            font-size: 14px;
            border-left: 1px solid rgba(0,0,0,0.06);
        }
        #dr-panel.active { right: 0; }
        #dr-panel::-webkit-scrollbar { width: 4px; }
        #dr-panel::-webkit-scrollbar-thumb { background: #ccc; border-radius: 2px; }

        .dr-panel-header {
            position: sticky; top: 0; z-index: 10;
            display: flex; align-items: center; justify-content: space-between;
            padding: 18px 22px 14px;
            border-bottom: 1px solid rgba(0,0,0,0.06);
            background: rgba(255,255,255,0.92);
            backdrop-filter: blur(12px);
        }
        .dr-panel-header h3 {
            font-size: 16px; font-weight: 600; color: #333;
            display: flex; align-items: center; gap: 8px;
        }
        .dr-panel-close {
            width: 30px; height: 30px; border: none; border-radius: 8px;
            background: #f0f0f0; cursor: pointer; font-size: 16px; color: #999;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.2s;
        }
        .dr-panel-close:hover { background: #e8e8e8; color: #666; transform: scale(1.05); }

        .dr-section {
            padding: 16px 22px; border-bottom: 1px solid #f3f3f3;
        }
        .dr-section-title {
            font-size: 12px; font-weight: 600; color: #999;
            text-transform: uppercase; letter-spacing: 1px;
            margin-bottom: 12px;
        }

        /* 开关 */
        .dr-toggle-row {
            display: flex; align-items: center; justify-content: space-between;
            padding: 4px 0;
        }
        .dr-toggle-row + .dr-toggle-row { margin-top: 10px; }
        .dr-toggle-label { font-size: 14px; font-weight: 500; color: #333; }
        .dr-toggle-sublabel { font-size: 11px; color: #bbb; margin-top: 2px; }
        .dr-toggle {
            position: relative; width: 48px; height: 26px;
            background: #ddd; border-radius: 13px; cursor: pointer;
            transition: background 0.3s ease; flex-shrink: 0;
        }
        .dr-toggle.active { background: #667eea; }
        .dr-toggle::after {
            content: ''; position: absolute;
            width: 20px; height: 20px; border-radius: 50%;
            background: #fff; top: 3px; left: 3px;
            transition: transform 0.3s cubic-bezier(.4,0,.2,1);
            box-shadow: 0 1px 3px rgba(0,0,0,0.15);
        }
        .dr-toggle.active::after { transform: translateX(22px); }

        /* 颜色 */
        .dr-colors { display: flex; flex-wrap: wrap; gap: 10px; }
        .dr-color-btn {
            width: 34px; height: 34px; border-radius: 50%;
            border: 3px solid transparent; cursor: pointer;
            transition: all 0.25s ease; position: relative;
            box-shadow: 0 1px 4px rgba(0,0,0,0.08);
        }
        .dr-color-btn:hover { transform: scale(1.15); }
        .dr-color-btn.selected {
            border-color: #667eea;
            box-shadow: 0 0 0 2px #fff, 0 0 0 4px #667eea;
        }
        .dr-color-btn .dr-color-name {
            position: absolute; bottom: -18px; left: 50%;
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
        .dr-slider-row { margin-bottom: 14px; }
        .dr-slider-row:last-child { margin-bottom: 0; }
        .dr-slider-header {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 6px;
        }
        .dr-slider-title { font-size: 13px; color: #555; font-weight: 500; }
        .dr-slider-value {
            font-size: 11px; color: #667eea; font-weight: 600;
            background: #667eea12; padding: 2px 8px; border-radius: 4px;
            min-width: 44px; text-align: center;
        }
        input.dr-slider {
            -webkit-appearance: none; appearance: none;
            width: 100%; height: 5px; border-radius: 3px;
            background: #e8e8e8; outline: none; cursor: pointer;
        }
        input.dr-slider::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none;
            width: 18px; height: 18px; border-radius: 50%;
            background: linear-gradient(135deg, #667eea, #764ba2);
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(102,126,234,0.35);
            transition: transform 0.2s;
        }
        input.dr-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }
        input.dr-slider::-moz-range-thumb {
            width: 18px; height: 18px; border-radius: 50%; border: none;
            background: linear-gradient(135deg, #667eea, #764ba2);
            cursor: pointer; box-shadow: 0 2px 6px rgba(102,126,234,0.35);
        }

        /* 展开 */
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
            transition: background-color 0.4s ease, color 0.4s ease,
                        padding-right 0.35s cubic-bezier(.4,0,.2,1);
        }
        /* 面板打开时，阅读区右侧让出空间 */
        .dr-reader-root.panel-open {
            padding-right: ${PANEL_WIDTH}px;
        }

        .dr-reader-root .dr-title {
            text-align: center; padding: 60px 20px 10px;
            font-size: 26px; font-weight: 700;
            opacity: 0.85; letter-spacing: 2px;
        }
        .dr-reader-root .dr-meta {
            text-align: center; padding: 8px 20px 30px;
            font-size: 13px; opacity: 0.45;
            display: flex; align-items: center; justify-content: center; gap: 16px;
        }
        .dr-meta-item { display: inline-flex; align-items: center; gap: 4px; }
        .dr-meta-dot {
            width: 4px; height: 4px; border-radius: 50%;
            background: currentColor; opacity: 0.5;
        }

        .dr-reader-root .dr-content {
            margin: 0 auto; padding: 0 30px 80px;
            transition: max-width 0.4s ease;
        }

        .dr-reader-root .dr-content p {
            margin-bottom: 0;
            transition: all 0.3s ease;
            word-wrap: break-word;
            text-align: justify;
        }
        .dr-reader-root.indent-on .dr-content p.dr-para { text-indent: 2em; }
        .dr-reader-root.indent-on .dr-content p.dr-dialogue { text-indent: 0; }

        .dr-reader-root .dr-content p.dr-separator {
            text-indent: 0 !important; text-align: center;
            padding: 24px 0; opacity: 0.35;
            font-size: 14px; letter-spacing: 8px;
        }
        .dr-reader-root .dr-content p.dr-chapter {
            text-indent: 0 !important; text-align: center;
            font-weight: 700; padding: 32px 0 16px;
            font-size: 1.15em; opacity: 0.8; letter-spacing: 2px;
        }
        .dr-reader-root .dr-content .dr-blank { height: 0.8em; }

        .dr-footer {
            text-align: center; padding: 40px 20px 30px;
            font-size: 12px; opacity: 0.4;
        }
        .dr-footer-stats { margin-top: 6px; font-size: 11px; opacity: 0.7; }

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
        #dr-back-top.shifted { right: ${PANEL_WIDTH + 30}px; }

        /* 重置 */
        .dr-reset-btn {
            width: 100%; padding: 10px; border: 1.5px dashed #ddd;
            border-radius: 8px; background: none; cursor: pointer;
            font-size: 13px; color: #999; transition: all 0.2s; margin-top: 8px;
        }
        .dr-reset-btn:hover { border-color: #667eea; color: #667eea; }

        /* 统计徽章 */
        .dr-stats-badge {
            display: flex; align-items: center; gap: 12px;
            padding: 10px 14px;
            background: linear-gradient(135deg, #667eea10, #764ba210);
            border-radius: 10px;
        }
        .dr-stats-badge .dr-stat-item {
            display: flex; flex-direction: column; align-items: center; flex: 1;
        }
        .dr-stats-badge .dr-stat-num {
            font-size: 17px; font-weight: 700;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .dr-stats-badge .dr-stat-label { font-size: 11px; color: #999; margin-top: 2px; }
        .dr-stats-divider { width: 1px; height: 30px; background: #e0e0e0; }

        /* ===== 进度条也要让位 ===== */
        #dr-progress-bar {
            transition: width 0.15s ease-out, right 0.35s cubic-bezier(.4,0,.2,1);
            right: 0;
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

        const progressBar = document.createElement('div');
        progressBar.id = 'dr-progress-bar';
        document.body.appendChild(progressBar);

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

        // 字数统计
        const meta = document.createElement('div');
        meta.className = 'dr-meta';
        meta.innerHTML = `
            <span class="dr-meta-item">共 ${formatNumber(totalChars)} 字</span>
            <span class="dr-meta-dot"></span>
            <span class="dr-meta-item">预计 ${estimateReadingTime(totalChars)}</span>
        `;
        meta.style.fontFamily = font.value;
        root.appendChild(meta);

        // 内容
        const content = document.createElement('div');
        content.className = 'dr-content';
        content.style.maxWidth = settings.contentWidth + 'px';

        const lines = originalText.split(/\n/);
        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed === '') {
                const blank = document.createElement('div');
                blank.className = 'dr-blank';
                content.appendChild(blank);
                return;
            }

            const p = document.createElement('p');

            if (isSeparatorLine(trimmed)) {
                p.className = 'dr-separator';
                p.textContent = '· · ·';
            } else if (isChapterTitle(trimmed)) {
                p.className = 'dr-chapter';
                p.textContent = trimmed;
            } else {
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
       面板开关控制（核心改动）
    ======================================== */
    let panelOpen = false;

    function togglePanel(show) {
        panelOpen = typeof show === 'boolean' ? show : !panelOpen;

        const panel = document.getElementById('dr-panel');
        const overlay = document.getElementById('dr-overlay');
        const fab = document.getElementById('dr-fab');
        const root = document.querySelector('.dr-reader-root');
        const backTop = document.getElementById('dr-back-top');

        if (panel) panel.classList.toggle('active', panelOpen);
        if (overlay) overlay.classList.toggle('active', panelOpen);
        if (fab) fab.classList.toggle('shifted', panelOpen);
        if (root) root.classList.toggle('panel-open', panelOpen);
        if (backTop) backTop.classList.toggle('shifted', panelOpen);
    }

    /* ========================================
       注入UI
    ======================================== */
    function injectUI() {
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

        // 遮罩（透明，仅点击关闭）
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

            <div class="dr-section">
                <div class="dr-toggle-row">
                    <span class="dr-toggle-label">✨ 阅读模式</span>
                    <div class="dr-toggle ${settings.enabled ? 'active' : ''}" id="dr-toggle-reader"></div>
                </div>
            </div>

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

            <div class="dr-section">
                <div class="dr-section-title">🔤 字体</div>
                <select class="dr-select" id="dr-font-select">
                    ${FONTS.map((f, i) => `
                        <option value="${i}" ${i === settings.fontIndex ? 'selected' : ''}
                                style="font-family:${f.value}">${f.name}</option>
                    `).join('')}
                </select>
            </div>

            <div class="dr-section">
                <div class="dr-section-title">⚙️ 排版调整</div>

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

            <div class="dr-section" style="border-bottom:none;">
                <button class="dr-reset-btn" id="dr-reset">↻ 恢复默认设置</button>
            </div>
        `;

        document.body.appendChild(panel);

        /* ===== 事件 ===== */
        fab.addEventListener('click', () => togglePanel(true));
        overlay.addEventListener('click', () => togglePanel(false));
        document.getElementById('dr-close').addEventListener('click', () => togglePanel(false));
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && panelOpen) togglePanel(false);
        });

        // 阅读模式
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

        // 缩进
        document.getElementById('dr-toggle-indent').addEventListener('click', function () {
            settings.textIndent = !settings.textIndent;
            this.classList.toggle('active', settings.textIndent);
            saveSettings(settings);
            applyStyleUpdate();
        });

        // 主题
        document.getElementById('dr-theme-colors').addEventListener('click', function (e) {
            const btn = e.target.closest('.dr-color-btn');
            if (!btn) return;
            const idx = parseInt(btn.dataset.index);
            settings.themeIndex = idx;
            saveSettings(settings);
            this.querySelectorAll('.dr-color-btn').forEach((b, i) => b.classList.toggle('selected', i === idx));
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

        // 代理展开
        document.getElementById('dr-expand-proxy').addEventListener('click', function () {
            this.classList.toggle('expanded');
            document.getElementById('dr-proxy-section').classList.toggle('show');
        });

        document.getElementById('dr-toggle-proxy').addEventListener('click', function () {
            settings.proxyEnabled = !settings.proxyEnabled;
            this.classList.toggle('active', settings.proxyEnabled);
            saveSettings(settings);
        });

        document.getElementById('dr-input-local').addEventListener('change', function () {
            settings.localAddress = this.value.trim().replace(/\/+$/, '');
            saveSettings(settings);
        });
        document.getElementById('dr-input-proxy').addEventListener('change', function () {
            settings.proxyAddress = this.value.trim().replace(/\/+$/, '');
            saveSettings(settings);
        });

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
