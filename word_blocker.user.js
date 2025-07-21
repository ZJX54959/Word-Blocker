// ==UserScript==
// @name         网页屏蔽词过滤器
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  根据自定义规则自动屏蔽网页上的词语
// @author       You
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // --- 配置和数据存储 ---
    const CONFIG_KEY = 'wordBlockerConfig';

    // 默认配置结构
    const defaultConfig = {
        rules: [
            // 示例规则
            // { pattern: '示例屏蔽词', scope: 'global', regex: true, enabled: true },
            // { pattern: 'example.com', scope: 'https://example.com/*', regex: false, enabled: true }
        ],
        settings: {
            replaceWith: '[已屏蔽]', // 屏蔽后替换的文本
            showPlaceholder: true, // true: 显示替换文本, false: 直接删除
            scanInterval: 1000, // 动态内容扫描间隔 (ms)
            enableScan: true // 是否启用动态内容扫描
        }
    };

    // 加载配置，如果不存在则使用默认配置
    let config = GM_getValue(CONFIG_KEY, defaultConfig);

    // 保存配置
    function saveConfig() {
        GM_setValue(CONFIG_KEY, config);
    }

    // --- 核心屏蔽逻辑 ---
    function blockWords() {
        const currentUrl = window.location.href;
        const body = document.body;
        if (!body) return; // 页面可能还没完全加载

        const settingsPanel = document.getElementById('wordBlockerSettingsPanel');

        config.rules.forEach(rule => {
            // 跳过禁用或空的规则
            if (!rule.enabled || !rule.pattern || rule.pattern.trim() === '') return;

            // 检查作用域
            let appliesToCurrentPage = false;
            if (rule.scope === 'global') {
                appliesToCurrentPage = true;
            } else {
                try {
                    // 尝试将 scope 作为通配符或正则匹配 URL
                    const scopePattern = new RegExp(rule.scope.replace(/\*/g, '.*')); // 简单通配符转正则
                    if (scopePattern.test(currentUrl)) {
                        appliesToCurrentPage = true;
                    }
                } catch (e) {
                    console.error(`[WordBlocker] 无效的作用域表达式: ${rule.scope}`, e);
                }
            }

            if (appliesToCurrentPage) {
                try {
                    // 创建正则表达式
                    // 'g' flag for global replacement, 'i' for case-insensitive (optional)
                    const regex = new RegExp(rule.pattern, rule.regex ? 'gi' : 'g');

                    // 遍历文本节点进行替换 (更安全的方式)
                    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
                    const replacementText = config.settings.showPlaceholder ? config.settings.replaceWith : '';
                    let node;
                    while (node = walker.nextNode()) {
                        // 避免在脚本、样式标签或设置面板内替换
                        if (node.parentNode && 
                            (node.parentNode.nodeName === 'SCRIPT' || 
                             node.parentNode.nodeName === 'STYLE' || 
                             (settingsPanel && settingsPanel.contains(node)))) {
                            continue;
                        }
                        if (regex.test(node.nodeValue)) {
                            node.nodeValue = node.nodeValue.replace(regex, replacementText);
                        }
                    }
                } catch (e) {
                    console.error(`[WordBlocker] 处理规则时出错: ${rule.pattern}`, e);
                }
            }
        });
    }

    // --- 设置界面 ---
    function showSettingsPanel() {
        // 移除旧面板（如果存在）
        const oldPanel = document.getElementById('wordBlockerSettingsPanel');
        if (oldPanel) {
            oldPanel.remove();
        }

        // 创建面板元素
        const panel = document.createElement('div');
        panel.id = 'wordBlockerSettingsPanel';
        // ... (此处将添加 UI 元素和逻辑)

        // 添加样式 (稍后实现)
        GM_addStyle(settingsPanelCSS());

        // 添加基础结构和标题
        panel.innerHTML = `
            <div class="wb-modal-content">
                <span class="wb-close-btn">&times;</span>
                <h2>屏蔽词设置</h2>
                <div id="wb-rules-list"></div>
                <button id="wb-add-rule-btn">添加新规则</button>
                <hr>
                <h3>全局设置</h3>
                <label>替换文本: <input type="text" id="wb-replace-with" value="${escapeHtml(config.settings.replaceWith)}"></label><br>
                <label>显示替换文本: <input type="checkbox" id="wb-show-placeholder" ${config.settings.showPlaceholder ? 'checked' : ''}></label><br>
                <label>启用动态扫描: <input type="checkbox" id="wb-enable-scan" ${config.settings.enableScan ? 'checked' : ''}></label><br>
                <label>扫描间隔 (ms): <input type="number" id="wb-scan-interval" value="${config.settings.scanInterval}" min="500"></label><br>
                <button id="wb-save-settings-btn">保存设置</button>
                <button id="wb-reset-settings-btn">重置为默认</button>
            </div>
        `;

        document.body.appendChild(panel);

        // --- UI 交互逻辑 ---
        const closeBtn = panel.querySelector('.wb-close-btn');
        closeBtn.onclick = () => panel.remove();

        const rulesListDiv = panel.querySelector('#wb-rules-list');
        const addRuleBtn = panel.querySelector('#wb-add-rule-btn');
        const saveSettingsBtn = panel.querySelector('#wb-save-settings-btn');
        const resetSettingsBtn = panel.querySelector('#wb-reset-settings-btn');

        // 渲染规则列表
        function renderRules() {
            rulesListDiv.innerHTML = ''; // 清空列表
            config.rules.forEach((rule, index) => {
                const ruleDiv = document.createElement('div');
                ruleDiv.className = 'wb-rule-item';
                ruleDiv.innerHTML = `
                    <input type="checkbox" class="wb-rule-enabled" ${rule.enabled ? 'checked' : ''} data-index="${index}">
                    <input type="text" class="wb-rule-pattern" value="${escapeHtml(rule.pattern)}" placeholder="屏蔽词/正则" data-index="${index}">
                    <input type="text" class="wb-rule-scope" value="${escapeHtml(rule.scope)}" placeholder="作用域 (global 或 URL 通配符)" data-index="${index}">
                    <label><input type="checkbox" class="wb-rule-is-regex" ${rule.regex ? 'checked' : ''} data-index="${index}"> 正则?</label>
                    <button class="wb-delete-rule-btn" data-index="${index}">删除</button>
                `;
                rulesListDiv.appendChild(ruleDiv);
            });

            // 绑定删除按钮事件
            panel.querySelectorAll('.wb-delete-rule-btn').forEach(btn => {
                btn.onclick = (e) => {
                    const index = parseInt(e.target.dataset.index, 10);
                    config.rules.splice(index, 1);
                    renderRules(); // 重新渲染
                };
            });

            // 绑定规则内容更改事件 (实时更新 config 对象)
            panel.querySelectorAll('.wb-rule-enabled, .wb-rule-pattern, .wb-rule-scope, .wb-rule-is-regex').forEach(input => {
                input.onchange = (e) => {
                    const index = parseInt(e.target.dataset.index, 10);
                    const prop = e.target.className.split(' ')[0].replace('wb-rule-', ''); // 获取属性名
                    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                    config.rules[index][prop] = value;
                };
            });
        }

        // 添加新规则
        addRuleBtn.onclick = () => {
            config.rules.push({ pattern: '', scope: 'global', regex: false, enabled: true });
            renderRules(); // 重新渲染
        };

        // 保存设置
        saveSettingsBtn.onclick = () => {
            // 更新全局设置
            config.settings.replaceWith = panel.querySelector('#wb-replace-with').value;
            config.settings.showPlaceholder = panel.querySelector('#wb-show-placeholder').checked;
            config.settings.enableScan = panel.querySelector('#wb-enable-scan').checked;
            config.settings.scanInterval = parseInt(panel.querySelector('#wb-scan-interval').value, 10) || 1000;

            saveConfig();
            alert('设置已保存！刷新页面生效。');
            panel.remove();
            // 保存后立即执行一次屏蔽，以便看到效果（如果当前页面匹配）
            blockWords();
        };

        // 重置设置
        resetSettingsBtn.onclick = () => {
            if (confirm('确定要重置所有规则和设置为默认值吗？')) {
                config = JSON.parse(JSON.stringify(defaultConfig)); // 深拷贝默认配置
                saveConfig();
                alert('已重置为默认设置！刷新页面生效。');
                panel.remove();
                // 重置后立即执行一次屏蔽
                blockWords();
            }
        };

        // 初始渲染
        renderRules();
    }

    // --- 辅助函数 ---
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return unsafe; // 处理非字符串输入
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
     }

    // --- 辅助函数 ---
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return unsafe; // 处理非字符串输入
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
     }

    // --- 样式定义 ---
    function settingsPanelCSS() {
        return `
            #wordBlockerSettingsPanel {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                z-index: 99999; /* 确保在顶层 */
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .wb-modal-content {
                background-color: #fefefe;
                padding: 20px;
                border: 1px solid #888;
                width: 80%;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                border-radius: 5px;
                box-shadow: 0 4px 8px 0 rgba(0,0,0,0.2);
            }
            .wb-close-btn {
                color: #aaa;
                float: right;
                font-size: 28px;
                font-weight: bold;
                cursor: pointer;
            }
            .wb-close-btn:hover,
            .wb-close-btn:focus {
                color: black;
                text-decoration: none;
            }
            #wb-rules-list {
                margin-bottom: 15px;
                border: 1px solid #ccc;
                padding: 10px;
                min-height: 100px;
                max-height: 40vh;
                overflow-y: auto;
            }
            .wb-rule-item {
                display: flex;
                align-items: center;
                margin-bottom: 8px;
                gap: 5px; /* 元素间距 */
            }
            .wb-rule-item input[type="text"] {
                flex-grow: 1; /* 文本框占据剩余空间 */
                padding: 5px;
                border: 1px solid #ccc;
                border-radius: 3px;
            }
             .wb-rule-item input.wb-rule-pattern {
                min-width: 150px; /* 保证屏蔽词输入框有一定宽度 */
            }
            .wb-rule-item input.wb-rule-scope {
                min-width: 150px; /* 保证作用域输入框有一定宽度 */
            }
            .wb-rule-item button {
                padding: 3px 8px;
                cursor: pointer;
                background-color: #f44336;
                color: white;
                border: none;
                border-radius: 3px;
            }
            .wb-rule-item button:hover {
                background-color: #da190b;
            }
            #wb-add-rule-btn, #wb-save-settings-btn, #wb-reset-settings-btn {
                padding: 8px 15px;
                margin-top: 10px;
                margin-right: 5px;
                cursor: pointer;
                border: none;
                border-radius: 4px;
            }
            #wb-add-rule-btn {
                background-color: #4CAF50; /* Green */
                color: white;
            }
            #wb-save-settings-btn {
                background-color: #008CBA; /* Blue */
                color: white;
            }
             #wb-reset-settings-btn {
                background-color: #ff9800; /* Orange */
                color: white;
            }
            label {
                margin-right: 10px;
            }
            hr {
                margin: 15px 0;
            }
        `;
    }

    // --- 初始化和执行 ---

    // 注册菜单命令
    GM_registerMenuCommand('设置屏蔽词', showSettingsPanel);

    // 初始执行屏蔽
    blockWords();

    // 监听 DOM 变化以处理动态加载的内容 (如果启用)
    let observer = null;
    function startObserver() {
        if (observer) observer.disconnect(); // 断开旧的观察者
        if (!config.settings.enableScan) return;

        observer = new MutationObserver(debounce(blockWords, config.settings.scanInterval));
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true // 观察文本内容变化
        });
    }

    // 防抖函数
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // 页面加载完成后启动观察者
    if (document.readyState === 'complete') {
        startObserver();
    } else {
        window.addEventListener('load', startObserver);
    }

    console.log('[WordBlocker] 脚本已加载');

})();