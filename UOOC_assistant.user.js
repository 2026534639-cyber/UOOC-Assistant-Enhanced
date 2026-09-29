// ==UserScript==
// @name         UOOC assistant
// @namespace    http://tampermonkey.net/
// @version      2.3.0
// @description  【使用前先看介绍/有问题可反馈】UOOC 助手：2倍速/静音/自动播放+连播(自动跳过测验与讨论)+AI答题(单选/多选/判断/填空/名词解释/问答/论述,未支持题型仅跳过该题)+自动LLM答题+数学图片识别+全课程进度统计+倍速2~4x任选。点击⚙️配置API。
// @author       cc & wybbb1 (原作者); 理不尽 (维护)
// @include      https://www.uooc.net.cn/home/learn/*
// @include      https://www.uooc.net.cn/home/course/exam/*
// @include      https://www.uooc.net.cn/home/exam/*
// @include      https://www.uooc.net.cn/exam/*
// @include      https://*.uooc.net.cn/home/learn/*
// @include      https://*.uooc.net.cn/home/exam/*
// @include      https://*.uooc.net.cn/exam/*
// @include      *://bkxk.webvpn.szu.edu.cn/https/www.uooc.net.cn/home/learn/*
// @include      *://bkxk.webvpn.szu.edu.cn/https/www.uooc.net.cn/home/exam/*
// @include      *://bkxk.webvpn.szu.edu.cn/https/www.uooc.net.cn/exam/*
// @match          https://www.uooc.net.cn/home/learn/*
// @match          https://www.uooc.net.cn/home/exam/*
// @match          https://www.uooc.net.cn/exam/*
// @match          *://bkxk.webvpn.szu.edu.cn/https/www.uooc.net.cn/home/learn/*
// @match          *://bkxk.webvpn.szu.edu.cn/https/www.uooc.net.cn/home/exam/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @connect      assets.uooconline.com
// @connect      *
// @run-at       document-idle
// @license      MIT
// @noframes
// ==/UserScript==

(function() {
    'use strict';

    console.log('[UOOC助手] 脚本开始加载...');

    // 全局LLM启用状态
    window.llmEnabled = false;
    // 全局自动LLM答题开关 (检测到题目自动答题，无需手动点击)
    window.llmAutoAnswer = false;

    // 显示诊断横幅 (帮助用户确认脚本已加载)
    function showDebugBanner(message) {
        var existing = document.getElementById('uooc-debug-banner');
        if (existing) {
            existing.innerText = message;
            existing.style.display = 'block';
            return;
        }
        var banner = document.createElement('div');
        banner.id = 'uooc-debug-banner';
        banner.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;background:#4CAF50;color:white;padding:8px 16px;font-size:12px;font-family:Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3)';
        banner.innerText = message;
        document.body.appendChild(banner);
        // 5秒后自动隐藏
        setTimeout(function() { banner.style.display = 'none'; }, 5000);
    }
    showDebugBanner('[UOOC助手] v2.3.0 已加载 — 查看控制台获取详情');

    // ==================== LLM配置管理模块 ====================
    const LLMConfig = {
        get: function() {
            try {
                return GM_getValue('llm_config', null);
            } catch (e) {
                console.log('[UOOC助手] GM_getValue不可用，使用localStorage');
                return JSON.parse(localStorage.getItem('llm_config') || 'null');
            }
        },
        save: function(config) {
            try {
                GM_setValue('llm_config', config);
            } catch (e) {
                console.log('[UOOC助手] GM_setValue不可用，使用localStorage');
                localStorage.setItem('llm_config', JSON.stringify(config));
            }
        },
        showConfigUI: function() {
            const config = this.get() || { baseUrl: '', apiKey: '', model: '' };

            const dialog = document.createElement('div');
            dialog.id = 'llm-config-dialog';
            dialog.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 20px;
                border-radius: 10px;
                box-shadow: 0 0 20px rgba(0,0,0,0.5);
                z-index: 999999;
                min-width: 400px;
                font-family: Arial, sans-serif;
            `;

            dialog.innerHTML = `
                <h3 style="margin: 0 0 15px 0; color: #333;">AI答题配置</h3>
                <div style="margin-bottom: 10px;">
                    <label style="display: block; margin-bottom: 5px; color: #666;">API Base URL:</label>
                    <input type="text" id="llm-baseurl" value="${config.baseUrl || ''}"
                           placeholder="例如: https://api.openai.com/v1"
                           style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 10px;">
                    <label style="display: block; margin-bottom: 5px; color: #666;">API Key:</label>
                    <input type="password" id="llm-apikey" value="${config.apiKey || ''}"
                           placeholder="输入你的API Key"
                           style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; color: #666;">模型名称 (可选):</label>
                    <input type="text" id="llm-model" value="${config.model || ''}"
                           placeholder="例如: gpt-4o / glm-5.3-flashx / deepseek-v4.1-flash (数学题需 vision 模型)"
                           style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; color: #666;">
                        <input type="checkbox" id="llm-vision" ${config.useVision ? 'checked' : ''}>
                        启用图片题目支持 (Vision 模型)
                    </label>
                        <div style="font-size: 11px; color: #999; margin-top: 3px;">
                        数学课程的题目以图片公式显示，启用后会自动下载题目图片并发送给 LLM 识别。<br>
                        支持 vision 的模型: gpt-4o、glm-5.3-flashx、deepseek-v4.1-flash、Qwen3.8-Omni-Flash。<br>
                        ⚠️ GLM-5.3-Flash (不带 X) 为纯文本模型，无法识别图片。
                    </div>
                </div>
                <div style="text-align: right;">
                    <button id="llm-config-cancel" style="padding: 8px 20px; margin-right: 10px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">取消</button>
                    <button id="llm-config-save" style="padding: 8px 20px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">保存</button>
                </div>
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee; font-size: 11px; color: #999;">
                    提示: 配置会保存在本地，只需配置一次。支持OpenAI兼容格式的API。
                </div>
            `;

            document.body.appendChild(dialog);

            document.getElementById('llm-config-cancel').onclick = function() {
                document.body.removeChild(dialog);
            };

            document.getElementById('llm-config-save').onclick = function() {
                const baseUrl = document.getElementById('llm-baseurl').value.trim();
                const apiKey = document.getElementById('llm-apikey').value.trim();
                const model = document.getElementById('llm-model').value.trim();
                const useVision = document.getElementById('llm-vision').checked;

                if (!baseUrl || !apiKey) {
                    alert('请填写完整的API配置！');
                    return;
                }

                LLMConfig.save({ baseUrl, apiKey, model, useVision });
                document.body.removeChild(dialog);
                alert('AI答题配置已保存！');
            };
        }
    };

    // ==================== CID 提取模块 ====================
    // 支持旧URL格式: https://www.uooc.net.cn/home/learn/index#/<cid>/...
    // 支持新URL格式: https://www.uooc.net.cn/home/learn/new/<cid>#/<cid>/...

    function extractCid() {
        const href = location.href;
        console.log('[UOOC助手] 当前URL:', href);

        // 尝试从 hash 中提取 CID: #/<cid>/
        let match = href.match(/#\/(\d+)\//);
        if (match) {
            console.log('[UOOC助手] 从hash提取CID:', match[1]);
            return match[1];
        }

        // 尝试从路径中提取: /learn/new/<cid> 或 /learn/index#/<cid>
        match = href.match(/\/learn\/(?:new\/(\d+)|index)/);
        if (match) {
            const cid = match[1];
            if (cid) {
                console.log('[UOOC助手] 从路径提取CID:', cid);
                return cid;
            }
        }

        // 降级: 尝试从整个URL中提取第一个数字段作为CID
        match = href.match(/\/learn\/(?:\w+\/)?(\d+)/);
        if (match) {
            console.log('[UOOC助手] 降级提取CID:', match[1]);
            return match[1];
        }

        console.warn('[UOOC助手] 未能从URL提取CID');
        return null;
    }

    // ==================== 测评页面功能模块 ====================

    // 检测是否在测评页面
    function isQuizPage() {
        // 检查主页面
        if (document.querySelector('.queContainer') || document.querySelector('#examMain')) {
            return true;
        }
        // 检查iframe
        const iframe = document.querySelector('iframe');
        if (iframe) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                return iframeDoc.querySelector('.queContainer') || iframeDoc.querySelector('#examMain');
            } catch (e) {
                return false;
            }
        }
        return false;
    }

    // 测评页是否"当前可见": SPA 切走后旧考试 iframe 会残留在 DOM 里 (隐藏),
    // 只按 .queContainer 判断会把残留 iframe 当成当前页 → 自动答题重复触发、答案弹窗反复弹出
    function isQuizPageVisible() {
        if (document.querySelector('.queContainer') || document.querySelector('#examMain')) return true;
        const iframes = document.querySelectorAll('iframe');
        for (let i = 0; i < iframes.length; i++) {
            try {
                const f = iframes[i];
                const d = f.contentDocument || f.contentWindow.document;
                if (d && (d.querySelector('.queContainer') || d.querySelector('#examMain'))) {
                    const rect = f.getBoundingClientRect();
                    if (rect.width > 50 && rect.height > 50) return true; // 残留 iframe 尺寸为 0, 会被过滤
                }
            } catch (e) {}
        }
        return false;
    }

    // 当前可见考试卷的标识 (iframe src 去掉参数), 用于"同一张卷只自动答一次"
    function getVisibleExamSrc() {
        const iframes = document.querySelectorAll('iframe');
        for (let i = 0; i < iframes.length; i++) {
            try {
                const f = iframes[i];
                const d = f.contentDocument || f.contentWindow.document;
                if (d && (d.querySelector('.queContainer') || d.querySelector('#examMain'))) {
                    const rect = f.getBoundingClientRect();
                    if (rect.width > 50 && rect.height > 50) return (f.src || '').split('?')[0];
                }
            } catch (e) {}
        }
        return null;
    }

    // ==================== 学习进度悬浮窗 ====================
    // 统计侧栏任务行 (goSource): complete 打勾 = 已看/已完成
    function collectProgress() {
        const rows = Array.from(document.querySelectorAll('.basic'));
        let videoDone = 0, videoTotal = 0, quizDone = 0, quizTotal = 0;
        rows.forEach(function(row) {
            const ng = row.getAttribute('ng-click') || '';
            if (ng.indexOf('goSource') < 0) return; // 只统计任务行 (排除章节/小节/知识点标题)
            const t = (row.innerText || '').trim();
            const done = row.classList.contains('complete');
            if (t.indexOf('视频') >= 0 || row.querySelector('[class*="icon-video"]')) {
                videoTotal++;
                if (done) videoDone++;
            } else if (t.indexOf('测验') >= 0 || t.indexOf('作业') >= 0 || t.indexOf('考试') >= 0 || row.querySelector('[class*="icon-test"], [class*="icon-quiz"], [class*="icon-exam"], [class*="icon-homework"]')) {
                quizTotal++;
                if (done) quizDone++;
            }
        });
        return { videoDone: videoDone, videoTotal: videoTotal, quizDone: quizDone, quizTotal: quizTotal };
    }

    // ==================== 全课程进度 (getCatalogList 接口, 一次拿全) ====================
    // 目录树每个知识点节点带 icon_list (任务清单: 视频=10/测验=80/讨论=70/文本=60/附件=50)
    // 和 finished (该知识点任务全部完成) / learning (学习中) 标记
    function getCatalogListData() {
        // 60 秒缓存 (promise 级缓存, 防并发重复请求)
        if (!window.__uoocCatalogCache || Date.now() - window.__uoocCatalogCache.ts > 60000) {
            var cid = (typeof extractCid === 'function' && extractCid()) || (location.hash.match(/#\/(\d+)\//) || [])[1];
            var isWebVpn = location.hostname.indexOf('webvpn') !== -1;
            var url = isWebVpn
                ? location.origin + '/https/www.uooc.net.cn/home/learn/getCatalogList?cid=' + encodeURIComponent(cid) + '&hidemsg_=true&show='
                : 'https://www.uooc.net.cn/home/learn/getCatalogList?cid=' + encodeURIComponent(cid) + '&hidemsg_=true&show=';
            window.__uoocCatalogCache = {
                ts: Date.now(),
                promise: fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(function(r) { return r.json(); })
            };
        }
        return window.__uoocCatalogCache.promise;
    }

    function computeCourseProgressFromTree(chapters) {
        var videoTotal = 0, videoDone = 0, quizTotal = 0, quizDone = 0, pointsTotal = 0, pointsDone = 0, pointsLearning = 0;
        (function walk(list) {
            list.forEach(function(n) {
                var isLeaf = !n.children || !n.children.length; // 知识点层级才有任务
                if (n.icon_list) {
                    n.icon_list.forEach(function(t) {
                        if (String(t.type) === '10') { // 视频
                            videoTotal++;
                            if (isLeaf && n.finished === 1) videoDone++;
                        } else if (String(t.type) === '80') { // 测验
                            quizTotal++;
                            if (isLeaf && n.finished === 1) quizDone++;
                        }
                    });
                }
                if (isLeaf && n.icon_list) {
                    pointsTotal++;
                    if (n.finished === 1) pointsDone++;
                    else if (n.learning === 1) pointsLearning++;
                }
                if (n.children && n.children.length) walk(n.children);
            });
        })(chapters);
        return { videoTotal: videoTotal, videoDone: videoDone, quizTotal: quizTotal, quizDone: quizDone, pointsTotal: pointsTotal, pointsDone: pointsDone, pointsLearning: pointsLearning };
    }

    // 悬浮窗: 有 × 可关闭; 主 UI 上有"📊 进度"按钮可重新打开
    function ensureProgressPanel() {
        var panel = document.getElementById('uooc-progress-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'uooc-progress-panel';
            panel.style.cssText = 'position:fixed;right:12px;bottom:80px;z-index:99999;background:rgba(30,30,30,0.92);color:#eee;padding:10px 14px;border-radius:8px;font-size:12px;font-family:Arial,"Microsoft YaHei",sans-serif;box-shadow:0 2px 12px rgba(0,0,0,0.4);min-width:180px;display:none;line-height:1.7;';
            panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
                '<b style="color:#ffd54a;">📊 学习进度</b>' +
                '<span id="uooc-progress-close" style="cursor:pointer;color:#aaa;font-size:15px;padding:0 4px;" title="关闭">×</span></div>' +
                '<div id="uooc-progress-body">统计中...</div>' +
                '<div style="color:#888;font-size:10px;margin-top:4px;">以当前展开的目录为准</div>';
            document.body.appendChild(panel);
            document.getElementById('uooc-progress-close').onclick = function() {
                panel.style.display = 'none';
            };
        }
        return panel;
    }

    function refreshProgressPanel() {
        var panel = document.getElementById('uooc-progress-panel');
        if (!panel || panel.style.display === 'none') return; // 关闭状态不刷新
        var p = collectProgress();
        var body = document.getElementById('uooc-progress-body');
        if (!body) return;
        if (p.videoTotal === 0 && p.quizTotal === 0) {
            body.innerHTML = '<span style="color:#999;">未检测到任务点</span>';
            return;
        }
        body.innerHTML =
            '📹 视频: <b style="color:#7CFC00;">' + p.videoDone + '</b> / ' + p.videoTotal + ' 已看<br>' +
            '📝 测验: <b style="color:#7CFC00;">' + p.quizDone + '</b> / ' + p.quizTotal + ' 已完成';
    }

    // 获取测评页面的document（可能是iframe）
    function getQuizDocument() {
        // 先检查主页面
        const mainDocContainers = document.querySelectorAll('.queContainer');
        if (mainDocContainers.length > 0) {
            console.log('[UOOC助手-AI] 在主文档中找到题目');
            return document;
        }

        // 检查iframe
        const iframe = document.querySelector('iframe');
        if (iframe) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                const iframeContainers = iframeDoc.querySelectorAll('.queContainer');
                if (iframeContainers.length > 0) {
                    console.log('[UOOC助手-AI] 在iframe中找到题目');
                    return iframeDoc;
                }
            } catch (e) {
                console.log('[UOOC助手-AI] 无法访问iframe:', e.message);
            }
        }

        return null;
    }

    function isUselessCaption(text) {
        if (!text) return true;
        var t = String(text).trim().toLowerCase();
        if (!t) return true;
        if (/^(image(\.(png|jpg|jpeg|gif|webp))?|img|formula|math)$/i.test(t)) return true;
        if (/^https?:\/\//i.test(t) && /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(t)) return true;
        return false;
    }

    function collectImageUrls(elem) {
        if (!elem) return [];
        var urls = [];
        elem.querySelectorAll('img').forEach(function(img) {
            var src = img.currentSrc || img.src || img.getAttribute('src') || img.getAttribute('data-src') || '';
            if (!src || src.indexOf('data:image/svg') === 0) return;
            if (src.indexOf('http://') === 0) src = 'https://' + src.slice(7);
            urls.push(src);
        });
        return urls;
    }

    function extractMathText(elem) {
        if (!elem) return { text: '', images: [] };
        var images = collectImageUrls(elem);
        var mathJaxElems = elem.querySelectorAll('.MathJax, .mjx-math, .mjx-chtml, math, .katex');
        var texSource = '';
        mathJaxElems.forEach(function(mjx) {
            var tex = mjx.getAttribute('data-math') ||
                      mjx.getAttribute('data-tex') ||
                      mjx.getAttribute('data-latex') ||
                      mjx.getAttribute('alttext') || '';
            if (tex && !isUselessCaption(tex)) texSource += ' ' + tex;
            else {
                var t = (mjx.innerText || mjx.textContent || '').trim();
                if (t && !isUselessCaption(t)) texSource += ' ' + t;
            }
        });
        elem.querySelectorAll('img').forEach(function(img) {
            var latex = img.getAttribute('data-latex') || img.getAttribute('data-equation') || '';
            var alt = img.getAttribute('alt') || '';
            if (latex && !isUselessCaption(latex)) texSource += ' ' + latex;
            else if (alt && !isUselessCaption(alt)) texSource += ' ' + alt;
        });
        var text = (elem.innerText || elem.textContent || '').trim();
        if (isUselessCaption(text)) text = '';
        text = (texSource.trim() + ' ' + text).trim();
        if (images.length) {
            text = (text ? text + ' ' : '') + '[数学图片题目] ' + images.join(' | ');
        }
        return { text: text, images: images };
    }

    // 依次尝试多个元素，返回第一个有文本的 extractMathText 结果
    function firstMathText() {
        for (var i = 0; i < arguments.length; i++) {
            var r = extractMathText(arguments[i]);
            if (r && r.text) return r;
        }
        return { text: '', images: [] };
    }

    // 去掉 extractMathText 附加的图片标记, 只留真实文字 (用于纯文字/图文混合题的文字部分)
    function stripImageMarker(text) {
        return String(text || '').replace(/\[数学图片题目\][\s\S]*$/, '').trim();
    }

    // 规范化文本用于比较 (去除空格/换行/HTML标签，用于 source 数据匹配)
    function normalizeText(text) {
        if (!text) return '';
        // 移除HTML标签，规范化空白
        return text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function extractQuestions() {
        console.log('[UOOC助手-AI] 开始提取题目...');

        // 获取测评页面的document
        const quizDoc = getQuizDocument();
        if (!quizDoc) {
            console.log('[UOOC助手-AI] 未找到测评页面document');
            return [];
        }

        // 调试：检查页面元素 (支持多种容器选择器)
        let containers = quizDoc.querySelectorAll('.queContainer');
        console.log('[UOOC助手-AI] 找到 .queContainer 元素数量:', containers.length);

        // 备用选择器 (数学课程可能使用不同布局)
        if (containers.length === 0) {
            containers = quizDoc.querySelectorAll('.question-item, .que-item, .exam-question, .quiz-question, .question_wrapper');
            console.log('[UOOC助手-AI] 备用选择器匹配数量:', containers.length);
        }
        if (containers.length === 0) {
            containers = quizDoc.querySelectorAll('[ng-repeat*="question"], [ng-repeat*="questions"]');
            console.log('[UOOC助手-AI] ng-repeat选择器匹配数量:', containers.length);
        }

        // 如果没找到
        if (containers.length === 0) {
            console.log('[UOOC助手-AI] 未找到题目容器');
            console.log('[UOOC助手-AI] 当前URL:', window.location.href);
            // 调试：输出页面结构
            console.log('[UOOC助手-AI] 页面body片段:', quizDoc.body?.innerText?.substring(0, 500));
            return [];
        }

        const questions = [];

        containers.forEach((container, index) => {
            console.log(`[UOOC助手-AI] 处理第 ${index + 1} 个容器`);

            const typeElem = container.querySelector('input[type="radio"], input[type="checkbox"]') ||
                             container.querySelector('[name*="answer"]') ||
                             container.querySelector('[type="radio"]') ||
                             container.querySelector('[type="checkbox"]');

            // ===== 填空题 / 主观题支持 (textarea 作答, 无 radio/checkbox) =====
            if (!typeElem) {
                // 主观题 (31名词解释/40问答/60论述): .ue-container 初始化 UEditor 富文本
                const ueEl = container.querySelector('.ue-container');
                if (ueEl) {
                    const sMain = firstMathText(container.querySelector('.ti-q-c'));
                    console.log(`[UOOC助手-AI] 第 ${index + 1} 题：主观题 (UEditor 富文本)`);
                    questions.push({
                        index: index + 1,
                        type: '主观题',
                        question: sMain.text,
                        images: sMain.images,
                        options: [],
                        isBlank: true,
                        ueEditorId: ueEl.id || ('u' + (container.querySelector('.index[id^="anchor"]')?.id.replace('anchor', '') || '')),
                        ueTextarea: ueEl,
                        ownerWin: quizDoc.defaultView || null,
                        isRadio: false
                    });
                    return;
                }
                // 填空题: 每空一个 .ue-container1 textarea, 位于 label.ti-a ("第N空") 内
                // 排除主观题的 .ue-container (类名 token 不同互不匹配) 与 UEditor 的 textarea.hide
                const blankAreas = Array.from(container.querySelectorAll('textarea')).filter(function(ta) {
                    if (ta.classList.contains('ue-container') || ta.classList.contains('hide')) return false;
                    return ta.closest('.ti-a') || ta.closest('.ti-alist');
                });
                if (blankAreas.length > 0) {
                    const bMain = firstMathText(container.querySelector('.ti-q-c'));
                    const blanks = blankAreas.map(function(ta, bi) {
                        const lab = (ta.closest('.ti-a')?.querySelector('.ti-a-i')?.innerText || '').trim() || ('第' + (bi + 1) + '空');
                        return { label: lab.replace(/[:：\s]+$/, ''), textarea: ta };
                    });
                    console.log(`[UOOC助手-AI] 第 ${index + 1} 题：填空题，${blanks.length} 个空`);
                    questions.push({
                        index: index + 1,
                        type: '填空题',
                        question: bMain.text,
                        images: bMain.images,
                        options: [],
                        blanks: blanks,
                        isBlank: true,
                        isRadio: false
                    });
                    return;
                }
                // 真正不认识的题型: 只跳过这一题, 其余题目继续 (不整体罢工)
                console.log(`[UOOC助手-AI] 第 ${index + 1} 个容器：不支持的题型，跳过该题 (其余题目正常作答)`);
                return;
            }

            const isRadio = typeElem.type === 'radio';
            // 使用 extractMathText 支持数学公式 (返回 {text, images})
            const qMain = firstMathText(container.querySelector('.ti-q-c'),
                                        container.querySelector('.question-text'),
                                        container.querySelector('.que-title'));
            const questionText = qMain.text;
            const questionImages = qMain.images;
            const options = [];
            const seenOpt = new Set();

            // 支持多种选项结构 (Set 去重: .ti-a 同时命中 ng-repeat 选择器会导致选项翻倍)
            const optionElems = Array.from(container.querySelectorAll('.ti-a, .option-item, .answer-option, [ng-repeat*="option"]'))
                .filter(el => el.querySelector('input'))
                .filter(el => !seenOpt.has(el) && seenOpt.add(el));

            optionElems.forEach((optElem) => {
                const rawLabel = optElem.querySelector('.ti-a-i')?.innerText.trim() ||
                                    optElem.querySelector('.option-label')?.innerText.trim() ||
                                    optElem.querySelector('.opt-letter')?.innerText.trim() ||
                                    optElem.querySelector('input')?.value?.replace(/[0-9]/g, c => String.fromCharCode(65+parseInt(c))) || '';
                // 规范化标签: 只保留字母，去除点号/空格/杂质 (A. → A)
                const optionLabel = (rawLabel.replace(/[^A-Za-z]/g, '').toUpperCase()) || rawLabel.trim().toUpperCase();
                const oMain = firstMathText(optElem.querySelector('.ti-a-c'),
                                            optElem.querySelector('.option-text'),
                                            optElem.querySelector('.opt-text'));
                const optionText = oMain.text;
                const optionImages = oMain.images;
                const inputElem = optElem.querySelector('input');
                const inputValue = inputElem?.value || '';
                options.push({
                    label: optionLabel,
                    text: optionText,
                    images: optionImages,
                    value: inputValue,
                    // 用于 LLM 匹配: 使用规范化后的标签字母 (A/B/C/D)
                    // 数学课程选项 shuffled, LLM 返回的是显示标签而非内部 key
                    matchKey: optionLabel,
                    input: inputElem
                });
            });

            let questionType = '判断题';
            if (options.length > 2) {
                questionType = isRadio ? '单选题' : '多选题';
            } else if (options.length === 2) {
                questionType = '判断题';
            }

            console.log(`[UOOC助手-AI] 第 ${index + 1} 题：${questionType}，选项数量: ${options.length}`);

            questions.push({
                index: index + 1,
                type: questionType,
                question: questionText,
                images: questionImages,
                options: options,
                isRadio: isRadio
            });
        });

        console.log('[UOOC助手-AI] 提取到', questions.length, '道题目');
        return questions;
    }

    // 构建LLM提示词
    function buildPrompt(questions) {
        let prompt = '请回答以下选择题，每题直接给出答案选项字母（如A、B、C、D或A、B等），不需要解释。\n\n';

        questions.forEach(q => {
            prompt += `第${q.index}题 [${q.type}]\n`;
            prompt += `题目：${q.question}\n`;
            q.options.forEach(opt => {
                prompt += `${opt.label}. ${opt.text}\n`;
            });
            prompt += '\n';
        });

        prompt += '\n请按以下格式返回答案（每行一个题号和答案）：\n';
        prompt += '1. A\n2. B\n3. A,B\n...\n';
        prompt += '注意：多选题答案用逗号分隔，判断题A表示正确，B表示错误。\n';
        prompt += '注意：题目可能包含数学公式( LaTeX 标记如 $\\frac{a}{b}$、$x^{2}$ 等)、MathJax渲染内容，\n';
        prompt += '或以图片形式显示的数学公式(图片 URL 以 [数学图片题目] 标记)。\n';
        prompt += '请根据公式内容正确分析和答题。\n';
        prompt += '【填空题】请给出要填入空格的答案文本，用纯文本数学记号（如 x^2、√2、π、(-2,2)、(-∞,0)∪(0,π)，\n';
        prompt += '不要用 LaTeX 反斜杠记法）。填空题答案格式：题号. 答案文本，多个空用 | 分隔。\n';
        prompt += '【主观题(名词解释/问答/论述)】用一段简洁的中文作答：名词解释1-2句给出定义要点，问答/论述2-4句答出核心要点，\n';
        prompt += '必须写在同一行。格式：题号. 答案文本';

        return prompt;
    }

    // 全角字符归一化 (DeepSeek 等中文模型爱输出 Ａ/１/：/，, 不归一解析必挂)
    function normalizeFullWidth(text) {
        if (!text) return '';
        return String(text).replace(/[０-９Ａ-Ｚａ-ｚ．。：，、（）]/g, function(ch) {
            const code = ch.charCodeAt(0);
            if (code >= 0xFF10 && code <= 0xFF19) return String.fromCharCode(code - 0xFF10 + 0x30); // 数字
            if (code >= 0xFF21 && code <= 0xFF3A) return String.fromCharCode(code - 0xFF21 + 0x41); // 大写字母
            if (code >= 0xFF41 && code <= 0xFF5A) return String.fromCharCode(code - 0xFF41 + 0x61); // 小写→后续 toUpperCase
            if (ch === '．' || ch === '。') return '.';
            if (ch === '：') return ':';
            if (ch === '，' || ch === '、') return ',';
            if (ch === '（') return '(';
            if (ch === '）') return ')';
            return ch;
        });
    }

    // 单题响应解析 (逐题 vision 模式): 返回字母数组或文本答案, 失败返回 null
    function parseSingleAnswer(respText, q) {
        const t = normalizeFullWidth(respText || '');
        if (q.isBlank) {
            const lines = t.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
            // 优先取 "N. 答案文本" 行
            for (let i = 0; i < lines.length; i++) {
                const m = lines[i].match(/^(\d+)\s*[.、:)]\s*(.+)$/);
                if (m) return m[2].replace(/\*/g, '').trim();
            }
            // 无题号前缀: 取最后一行非纯字母的内容 (跳过"好的，以下是答案"之类)
            for (let j = lines.length - 1; j >= 0; j--) {
                if (!/^[A-Z][A-Z,、\s]*$/.test(lines[j]) && !/^[（(]?(正确|错误|对|错)[)）]?$/.test(lines[j])) {
                    return lines[j].replace(/\*/g, '').replace(/^答案[:：]?\s*/, '').trim();
                }
            }
            return null;
        }
        // 选择/判断: 三级匹配, 避免把解释文字里的英文单词首字母当成选项
        // 分隔符含中文连接词 (A和C / A与B / A+B / A、C)
        let m2 = t.match(/(?:答案|应选|选|answer)[^A-Za-z]{0,3}([A-Z]{1,6}(?:\s*[,，、和与及跟+]\s*[A-Z])*)/i);
        if (!m2) m2 = t.match(/^\s*\d+\s*[.、:)]\s*([A-Z]{1,6}(?:\s*[,，、和与及跟+]\s*[A-Z])*)/m);
        if (!m2) m2 = t.match(/(?<![A-Za-z])([A-Z]{1,6}(?:\s*[,，、和与及跟+]\s*[A-Z])*)(?![a-z])/);
        if (!m2) {
            // 模型偶尔用小写回答 (如 "b") — 只接受独立的 a~d, 避免误抓英文单词
            m2 = t.match(/(?<![A-Za-z])([a-d]{1,4}(?:\s*[,，、和与及跟+]\s*[a-d])*)(?![a-z])/);
        }
        if (m2) {
            const raw = m2[1].toUpperCase().split(/[\s,，、和与及跟+]+/).join('');
            const arr = raw.split('').filter(a => /^[A-Z]$/.test(a));
            return arr.length ? arr : null;
        }
        // 判断题可能返回"正确/错误"文字
        if (q.type === '判断题') {
            if (/正确|对/.test(t)) return ['A'];
            if (/错误|错/.test(t)) return ['B'];
        }
        return null;
    }

        // 解析LLM返回的答案
    function parseAnswers(llmResponse, questions) {
        llmResponse = normalizeFullWidth(llmResponse);
        const answers = [];

        // 策略0: 全局扫描 "1. A" / "1、A" / "1：A" / "1) A" (容忍 markdown 加粗、前后缀文字、行尾句号)
        const globalRe = /(\d+)\s*[\.、:：\)]\s*([A-Z])((?:\s*[,，、和与及跟]\s*[A-Z])*)/g;
        let gm;
        while ((gm = globalRe.exec(llmResponse)) !== null) {
            const qIndex = parseInt(gm[1]) - 1;
            // 填空题不走字母匹配 (答案可能是任意文本, 如 "A∪B" 会被误拆)
            if (qIndex >= 0 && qIndex < questions.length && !answers[qIndex] && !(questions[qIndex] && questions[qIndex].isBlank)) {
                const combined = (gm[2] + (gm[3] || '')).toUpperCase();
                answers[qIndex] = combined.split(/\s*[,，、和与及跟]\s*/).filter(a => /^[A-Z]$/.test(a));
            }
        }
        if (answers.filter(a => a && a.length).length >= questions.length) {
            return answers;
        }

        const lines = llmResponse.split('\n');

        // 策略1: 标准格式 "1. A" 或 "1. A,B"
        lines.forEach(line => {
            const match = line.trim().match(/^(\d+)\.\s*([A-Z,]+)$/);
            if (match) {
                const qIndex = parseInt(match[1]) - 1;
                const answer = match[2].toUpperCase().split(',').map(a => a.trim());
                answers[qIndex] = answer;
            }
        });

        // 策略2: 更灵活的格式匹配
        if (answers.filter(a => a).length < questions.length) {
            console.log('[UOOC助手-AI] 标准格式解析不完整，尝试灵活匹配...');
            lines.forEach(line => {
                const trimmed = line.trim();
                // 匹配 "1: A"、"Question 1: A"、"1) A"、"第1题: A" 等格式
                let match = trimmed.match(/^(第?\s*(\d+)\s*题?[:\)\s]+)\s*([A-Z,]+)/i) ||
                            trimmed.match(/^(\d+)[\:\)\.]\s*([A-Z,]+)/);
                if (match) {
                    const qIndex = parseInt(match[2] || match[1]) - 1;
                    const answer = match[3].toUpperCase().split(',').map(a => a.trim());
                    if (!answers[qIndex]) answers[qIndex] = answer;
                }
            });
        }

        // 策略3: 如果还是不够，尝试逐题按顺序分配 (假设 LLM 按顺序返回)
        if (answers.filter(a => a).length < questions.length) {
            console.log('[UOOC助手-AI] 灵活匹配仍不完整，尝试按序匹配...');
            // 提取所有大写字母选项
            const letterLines = lines
                .filter(l => /^[A-Z][,\s]*[A-Z]*$/.test(l.trim()))
                .map(l => l.trim().split(',').map(a => a.trim().toUpperCase()));
            if (letterLines.length === questions.length) {
                letterLines.forEach((ans, idx) => {
                    if (!answers[idx]) answers[idx] = ans;
                });
            }
        }

        // 策略4: 填空题答案 (题号. 文本) — 在字母解析全部尝试完后按行取剩余填空题的文本答案
        questions.forEach((q, qi) => {
            if (answers[qi] && answers[qi].length) return;
            if (!q.isBlank) return;
            for (const line of lines) {
                const m = line.trim().match(/^(\d+)\s*[\.、:：\)]\s*(.+)$/);
                if (m && parseInt(m[1]) - 1 === qi) {
                    let txt = m[2].replace(/\*/g, '').replace(/^[`"']+/, '').replace(/[`"']+$/, '').trim();
                    if (txt && !/^[A-Z]$/.test(txt)) {
                        answers[qi] = txt.split('|').map(function(s) { return s.trim(); });
                        break;
                    }
                }
            }
        });

        return answers;
    }

    // 将 blob 规范化为可发送的图片 data URL。
    // 优课 CDN 有时给图片错误的 Content-Type (application/octet-stream),
    // 直接转发会被 vision 接口 400 拒收 — 统一用 canvas 重编码成规范 PNG/JPEG;
    // 连 canvas 都解不出来的 (真垃圾文件) 返回 null, 由上层跳过该图。
    function blobToCleanDataUrl(blob) {
        return new Promise(function(resolve) {
            if (!blob || blob.size < 50) { resolve(null); return; }
            var reader = new FileReader();
            reader.onload = function() {
                var dataUrl = reader.result;
                if (blob.type && blob.type.indexOf('image/') === 0 && blob.size <= 1.2 * 1024 * 1024) {
                    resolve(dataUrl); // 正常图片且不大, 原样使用
                    return;
                }
                var img = new Image();
                img.onload = function() {
                    try {
                        var maxDim = 1600;
                        var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
                        var canvas = document.createElement('canvas');
                        canvas.width = Math.max(1, Math.round(img.width * scale));
                        canvas.height = Math.max(1, Math.round(img.height * scale));
                        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                        var out = blob.size > 1.2 * 1024 * 1024
                            ? canvas.toDataURL('image/jpeg', 0.9)
                            : canvas.toDataURL('image/png');
                        resolve(out);
                    } catch (e) { resolve(null); }
                };
                img.onerror = function() { resolve(null); }; // 浏览器都解不出 → 真垃圾
                img.src = dataUrl;
            };
            reader.onerror = function() { resolve(null); };
            reader.readAsDataURL(blob);
        });
    }

    // 将图片 URL 转换为 base64 (用于 vision 模型)
    async function fetchImageAsBase64(url) {
        return new Promise(function(resolve) {
            var handleBlob = function(blob) {
                blobToCleanDataUrl(blob).then(function(clean) {
                    if (!clean) console.log('[UOOC助手-AI] 图片无法解析为有效图像，跳过:', url);
                    resolve(clean);
                });
            };
            try {
                // 优先用 GM_xmlhttpRequest 绕过 CORS (assets.uooconline.com 与主站不同源)
                if (typeof GM_xmlhttpRequest === 'function') {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: url,
                        responseType: 'blob',
                        timeout: 20000,
                        onload: function(r) {
                            if (r.status !== 200 || !r.response) {
                                console.log('[UOOC助手-AI] 图片下载失败:', r.status, url);
                                resolve(null);
                                return;
                            }
                            handleBlob(r.response);
                        },
                        onerror: function() { console.log('[UOOC助手-AI] 图片下载出错:', url); resolve(null); },
                        ontimeout: function() { console.log('[UOOC助手-AI] 图片下载超时:', url); resolve(null); }
                    });
                } else {
                    // 回退: 普通 fetch (可能被 CORS 拦截)
                    fetch(url, { method: 'GET', mode: 'cors' })
                        .then(function(resp) { return resp.ok ? resp.blob() : null; })
                        .then(function(blob) {
                            if (!blob) { resolve(null); return; }
                            handleBlob(blob);
                        })
                        .catch(function(e) { console.log('[UOOC助手-AI] 图片下载失败:', e.message, url); resolve(null); });
                }
            } catch(e) {
                console.log('[UOOC助手-AI] 图片转base64失败:', e.message, url);
                resolve(null);
            }
        });
    }

    // 调用LLM API
    async function callLLM(questions) {
        const config = LLMConfig.get();
        if (!config || !config.baseUrl || !config.apiKey) {
            alert('请先配置AI API！点击页面右上角的"AI设置"按钮进行配置。');
            return null;
        }

        console.log('[UOOC助手-AI] 开始调用LLM API...');
        const prompt = buildPrompt(questions);

        // 检测是否有图片题目 (数学公式图片) — 直接看对象上的 images 数组
        const hasImageQuestions = questions.some(q => (q.images && q.images.length > 0) ||
            q.options.some(opt => opt.images && opt.images.length > 0));

        try {
            async function sendLLMRequest(messages) {
                return fetch(`${config.baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${config.apiKey}`
                    },
                    body: JSON.stringify({
                        model: config.model || 'gpt-4o',
                        messages: messages,
                        temperature: 0.3,
                        max_tokens: 4000
                    })
                });
            }

            const textMessages = [
                { role: 'system', content: '你是一个专业的答题助手，请严格按照要求的格式返回答案。' },
                { role: 'user', content: prompt }
            ];

            var answers = null;

            if (hasImageQuestions && config.useVision !== false) {
                // 逐题 vision: 每题一个小请求 (题干图+选项图), 单题失败不影响其余题目。
                // (整套一个大请求会因图片过多被接口拒收, 之后纯文本又看不到图, 全军覆没)
                console.log('[UOOC助手-AI] 检测到图片题目，逐题 vision 识别...');
                answers = [];
                var rawLog = [];
                var visionOK = 0;

                // 单题答题: 返回 {txt} 或 {err}
                // 纯文字题目走文本请求, 图片题目走 vision 请求, 图文混合两者兼备
                async function answerOneQuestion(q, prevBad) {
                    var badHint = prevBad ? ('\n你上一次的回答是「' + String(prevBad).substring(0, 80) + '」，格式无法解析。请严格只返回规定格式的答案，不要任何其他内容。') : '';
                    var qText = stripImageMarker(q.question);
                    var parts = [{ type: 'text', text: '第' + q.index + '题 [' + q.type + ']' + (qText ? '\n题干文字：' + qText : '\n题干图片：') }];
                    var loaded = 0;
                    for (var i = 0; i < (q.images || []).length; i++) {
                        var b64 = await fetchImageAsBase64(q.images[i]);
                        if (b64) { parts.push({ type: 'image_url', image_url: { url: b64 } }); loaded++; }
                    }
                    for (var oi = 0; oi < q.options.length; oi++) {
                        var opt = q.options[oi];
                        var oText = stripImageMarker(opt.text);
                        parts.push({ type: 'text', text: (oText ? '选项 ' + opt.label + ' 文字：' + oText : '选项 ' + opt.label + ' 图片：') });
                        for (var j = 0; j < (opt.images || []).length; j++) {
                            var ob64 = await fetchImageAsBase64(opt.images[j]);
                            if (ob64) { parts.push({ type: 'image_url', image_url: { url: ob64 } }); loaded++; }
                        }
                    }
                    if (loaded === 0) {
                        // 纯文字题目: 没有任何图片, 直接文本请求 (不再误判为下载失败而跳过)
                        var hasAnyText = qText || q.options.some(function(o) { return stripImageMarker(o.text); });
                        if (!hasAnyText) return { err: '无图片且无文字内容' };
                        parts.push({ type: 'text', text: '\n请严格按以下格式返回，不要任何解释：\n选择题/判断题：只返回选项字母（多选用逗号或"和"连接，如 A,B 或 A和C；判断题 A=正确、B=错误）。\n填空/主观题：只返回要填入的答案文本（纯文本数学记号；主观题一句话作答）。' + badHint });
                        var tResp = await sendLLMRequest([
                            { role: 'system', content: '你是专业的答题助手。只返回规定格式的答案。' },
                            { role: 'user', content: parts }
                        ]);
                        if (!tResp.ok) return { err: 'HTTP ' + tResp.status };
                        var tData = await tResp.json();
                        return { txt: ((tData.choices && tData.choices[0] && tData.choices[0].message.content) || '').trim() };
                    }
                    parts.push({ type: 'text', text: '请严格按以下格式返回，不要任何解释：\n选择题/判断题：只返回选项字母（多选用逗号或"和"连接，如 A,B 或 A和C；判断题 A=正确、B=错误）。\n填空/主观题：只返回要填入的答案文本（纯文本数学记号如 x^2、√2、(-2,2)，勿用 LaTeX 反斜杠；主观题一句话作答）。' + badHint });
                    var resp = await sendLLMRequest([
                        { role: 'system', content: '你是专业的数学答题助手。图片中是数学公式，先识别再计算。只返回规定格式的答案。' },
                        { role: 'user', content: parts }
                    ]);
                    if (!resp.ok) return { err: 'HTTP ' + resp.status };
                    var d = await resp.json();
                    return { txt: ((d.choices && d.choices[0] && d.choices[0].message.content) || '').trim() };
                }

                var lastRaw = {};
                for (var qi = 0; qi < questions.length; qi++) {
                    var q = questions[qi];
                    try {
                        var r = await answerOneQuestion(q);
                        rawLog.push('第' + q.index + '题: ' + (r.err ? '(' + r.err + ')' : (r.txt || '(空)').substring(0, 80)));
                        if (r.txt) {
                            console.log('[UOOC助手-AI] 第' + q.index + '题 LLM返回:', r.txt);
                            var one = parseSingleAnswer(r.txt, q);
                            if (one && (!Array.isArray(one) || one.length)) {
                                answers[qi] = one;
                                visionOK++;
                            } else if (r.txt) {
                                lastRaw[qi] = r.txt; // 记录无法解析的回答, 重试时反馈给模型
                            }
                        }
                    } catch (e) {
                        console.log('[UOOC助手-AI] 第' + q.index + '题处理异常:', e.message);
                        rawLog.push('第' + q.index + '题: (异常 ' + e.message + ')');
                    }
                    await new Promise(function(rWait) { setTimeout(rWait, 250); }); // 轻微间隔防限流
                }

                // 补漏重试: 首轮没拿到答案的题再试一次 (限流/超时等瞬时失败的第二机会)。
                // 若上次有返回但解析失败, 会把原回答喂回给模型要求纠正格式。
                // 全部失败时不重试 (说明是系统性问题), 直接走下方纯文本兜底。
                var missed = [];
                for (var mi0 = 0; mi0 < questions.length; mi0++) {
                    if (!answers[mi0] || !answers[mi0].length) missed.push(mi0);
                }
                if (missed.length > 0 && missed.length < questions.length) {
                    console.log('[UOOC助手-AI] 补漏重试 ' + missed.length + ' 题: 第' + missed.map(function(i2) { return questions[i2].index; }).join(',') + '题');
                    for (var mi = 0; mi < missed.length; mi++) {
                        var q2 = questions[missed[mi]];
                        try {
                            var r2 = await answerOneQuestion(q2, lastRaw[missed[mi]]);
                            rawLog.push('第' + q2.index + '题(重试): ' + (r2.err ? '(' + r2.err + ')' : (r2.txt || '(空)').substring(0, 80)));
                            if (r2.txt) {
                                var one2 = parseSingleAnswer(r2.txt, q2);
                                if (one2 && (!Array.isArray(one2) || one2.length)) {
                                    answers[missed[mi]] = one2;
                                    visionOK++;
                                }
                            }
                        } catch (e2) {
                            rawLog.push('第' + q2.index + '题(重试): (异常 ' + e2.message + ')');
                        }
                        await new Promise(function(rWait2) { setTimeout(rWait2, 250); });
                    }
                }

                window.__uoocLastLLMResponse = rawLog.join('\n') || '(无返回)';
                console.log('[UOOC助手-AI] vision 逐题完成(含补漏): 成功 ' + visionOK + '/' + questions.length);

                // 整套全失败 → 纯文本整体兜底一次 (文本型课程/混合课程仍可能答出部分)
                if (visionOK === 0) {
                    console.log('[UOOC助手-AI] vision 全部失败，降级纯文本整体重试');
                    var resp2 = await sendLLMRequest(textMessages);
                    if (!resp2.ok) throw new Error('API请求失败: ' + resp2.status + ' ' + resp2.statusText);
                    var d2 = await resp2.json();
                    var t2 = (d2.choices && d2.choices[0] && d2.choices[0].message.content) || '';
                    console.log('[UOOC助手-AI] LLM返回(文本兜底):', t2);
                    window.__uoocLastLLMResponse = t2;
                    answers = parseAnswers(t2, questions);
                }
            } else {
                // 无图片题目: 单次文本请求
                const response = await sendLLMRequest(textMessages);
                if (!response.ok) {
                    throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                const answerText = data.choices[0].message.content;
                console.log('[UOOC助手-AI] LLM返回:', answerText);
                window.__uoocLastLLMResponse = answerText;
                answers = parseAnswers(answerText, questions);
            }

            return answers;
        } catch (error) {
            console.error('[UOOC助手-AI] LLM调用失败:', error);
            alert(`AI答题失败: ${error.message}\n请检查API配置是否正确。`);
            return null;
        }
    }

    // 填入答案
    function fillAnswers(questions, answers) {
        console.log('[UOOC助手-AI] 开始填入答案...');
        let filledCount = 0;

        questions.forEach((q, idx) => {
            const answer = answers[idx];
            if (!answer) {
                console.log(`[UOOC助手-AI] 第${q.index}题：未找到答案`);
                return;
            }

            // ===== 填空题: 给 textarea 设值并触发该站的读取事件 =====
            if (q.isBlank) {
                // -- 主观题 (名词解释/问答/论述): 通过 UEditor API 写入富文本 --
                if (q.ueEditorId) {
                    const text = (Array.isArray(answer) ? answer.join(' ') : String(answer)).trim();
                    if (!text) return;
                    const html = text.replace(/\n+/g, '<br>');
                    let viaUE = false;
                    try {
                        const win = q.ownerWin;
                        if (win && win.UE && typeof win.UE.getEditor === 'function') {
                            // 该站初始化时已创建实例, getEditor 返回缓存实例; ready 回调在未就绪时会排队
                            const ed = win.UE.getEditor(q.ueEditorId);
                            if (ed) {
                                ed.ready(function() {
                                    try { ed.setContent(html); } catch(e) {}
                                });
                                viaUE = true;
                            }
                        }
                    } catch(e) { console.log('[UOOC助手-AI] UEditor 写入异常:', e.message); }
                    // 兜底: 同步原始 textarea 值 (编辑器未就绪时站点自己也读不到, 但至少不留空)
                    try {
                        if (q.ueTextarea && !q.ueTextarea.classList.contains('ue-container')) {
                            q.ueTextarea.value = text;
                            q.ueTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    } catch(e) {}
                    console.log(`[UOOC助手-AI] 第${q.index}题 主观题：${viaUE ? '已通过 UEditor 写入' : '编辑器不可用，仅同步 textarea'}`);
                    filledCount++;
                    return;
                }
                if (!q.blanks || !q.blanks.length) return;
                // 单空直接用整条答案; 多空时若含 | 再拆分
                let parts = Array.isArray(answer) ? answer.map(function(s) { return String(s); }) : [String(answer)];
                if (parts.length === 1 && q.blanks.length > 1 && parts[0].indexOf('|') >= 0) {
                    parts = parts[0].split('|').map(function(s) { return s.trim(); });
                }
                q.blanks.forEach((b, bi) => {
                    const val = (parts[bi] !== undefined ? parts[bi] : (q.blanks.length === 1 ? parts[0] : '')).trim();
                    if (!val || !b.textarea) return;
                    const ta = b.textarea;
                    try {
                        ta.focus();
                        ta.value = val;
                        ta.dispatchEvent(new Event('input', { bubbles: true }));
                        ta.dispatchEvent(new Event('change', { bubbles: true }));
                        // UOOC 通过 ng-mouseleave="vm.addAnswer($event,question)" 在鼠标离开时读取 textarea 值
                        ta.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
                        console.log(`[UOOC助手-AI] 第${q.index}题 ${b.label}：填入 "${val}"`);
                        filledCount++;
                    } catch(e) {
                        console.log(`[UOOC助手-AI] 第${q.index}题填空失败:`, e.message);
                    }
                });
                return;
            }

            // 点击对应的选项
            // 优先匹配 display label (matchKey), 兼容 value 匹配 (非数学课程)
            answer.forEach(ansRaw => {
                // 规范化答案字母: 大写、去掉非字母杂质 (markdown 星号、句号等)
                const ans = String(ansRaw).trim().toUpperCase().replace(/[^A-Z]/g, '');
                if (!ans) return;
                const option = q.options.find(opt => opt.matchKey === ans) ||
                               q.options.find(opt => opt.value === ans) ||
                               q.options.find(opt => opt.label === ans);
                if (option && option.input) {
                    // 点击前聚焦并触发事件
                    option.input.focus();
                    option.input.click();
                    // 触发 Angular 变更检测 (数学课程 iframe 可能需要)
                    try { option.input.dispatchEvent(new MouseEvent('change', { bubbles: true })); } catch(e) {}
                    console.log(`[UOOC助手-AI] 第${q.index}题：选择 ${ans} (匹配 ${option.matchKey})`);
                    filledCount++;
                } else {
                    console.log(`[UOOC助手-AI] 第${q.index}题：答案 ${ans} 未找到匹配选项`);
                    console.log(`[UOOC助手-AI]   可用选项:`, q.options.map(o => o.matchKey + '(value=' + o.value + ')').join(', '));
                }
            });
        });

        console.log('[UOOC助手-AI] 共填入', filledCount, '个答案');
        return filledCount;
    }

    // 主答题流程
    async function autoAnswerQuiz() {
        console.log('[UOOC助手-AI] ===== 开始自动答题流程 =====');

        // 检查配置
        const config = LLMConfig.get();
        if (!config || !config.baseUrl || !config.apiKey) {
            console.log('[UOOC助手-AI] 未配置API，显示配置界面');
            LLMConfig.showConfigUI();
            return;
        }

        // 提取题目
        const questions = extractQuestions();
        if (questions.length === 0) {
            console.log('[UOOC助手-AI] 未找到题目');
            return;
        }

        console.log(`[UOOC助手-AI] 检测到 ${questions.length} 道题目，开始AI答题...`);

        // 调用LLM
        const answers = await callLLM(questions);
        console.log('[UOOC助手-AI] LLM返回 answers:', JSON.stringify(answers));
        if (!answers) return;

        console.log('[UOOC助手-AI] questions[0].options:', questions[0]?.options?.map(o => ({label: o.label, matchKey: o.matchKey, value: o.value, text: o.text?.substring(0,50)})));

        // 填入答案
        const filledCount = fillAnswers(questions, answers);
        console.log('[UOOC助手-AI] 填充结果: 共填入', filledCount, '个答案，共', questions.length, '道题');
        window.__uoocLastFillResult = { filled: filledCount, total: questions.length };

        // 提示用户检查并提交 (始终附带逐题情况, 部分填入时也能定位漏题原因)
        // 若答题期间用户已切走 (连播推进到别处), 不再弹窗打扰, 只写控制台
        // 连播的"测验自动完成"流程中 (__uoocSilentAnswer) 也不弹窗
        setTimeout(function() {
            let msg = `✅ AI答题完成！\n\n已自动填入 ${filledCount}/${questions.length} 个答案。`;
            const raw = String(window.__uoocLastLLMResponse || '');
            if (raw) {
                msg += `\n\n—— 各题情况 ——\n${raw.substring(0, 450)}`;
            }
            if (filledCount < questions.length) {
                msg += `\n\n⚠️ 有题目未填入，"各题情况"里 (HTTP/图片下载失败/异常) 的就是原因。`;
            }
            msg += `\n\n请仔细检查答案后，手动点击"提交试卷"按钮。`;
            if (window.__uoocSilentAnswer) {
                console.log('[UOOC助手-AI] 连播测验自动完成流程中，静默跳过弹窗:', msg.replace(/\n/g, ' '));
            } else if (isQuizPageVisible()) {
                alert(msg);
            } else {
                console.log('[UOOC助手-AI] 已离开答题页面，答案已填入但不再弹窗:', msg.replace(/\n/g, ' '));
            }
        }, 500);
    }

    // 在测评页面显示提示
    function showQuizPageHint() {
        if (document.getElementById('llm-quiz-hint')) {
            return;
        }

        // 只有在LLM启用时才显示提示
        if (!window.llmEnabled) {
            console.log('[UOOC助手-AI] LLM未启用，不显示答题提示');
            return;
        }

        console.log('[UOOC助手-AI] 检测到测评页面，LLM已启用');

        // 标记已显示
        const marker = document.createElement('div');
        marker.id = 'llm-quiz-hint';
        marker.style.display = 'none';
        document.body.appendChild(marker);

        // 在控制台提示
        console.log('[UOOC助手-AI] 在视频页面点击"🤖 开始答题"按钮即可开始AI答题');
    }

    // ==================== 原有视频助手功能 ====================

    // 修复CID提取 - 支持新旧URL格式
    function ckeckTestIgnorable() {
        var cid = extractCid();
        console.log('[UOOC助手] 课程ID:', cid);

        if (!cid) {
            console.warn('[UOOC助手] 无法获取课程ID，跳过测验检查');
            window.canIgnoreTest = false;
            return;
        }

        // 使用原生fetch替代jQuery $.ajax (新页面可能不加载jQuery)
        // 动态构造请求URL：直接访问用 www.uooc.net.cn，WebVPN 则通过代理域名
        var isWebVpn = location.hostname.indexOf('webvpn') !== -1;
        var fetchUrl = isWebVpn
            ? location.origin + '/https/www.uooc.net.cn/home/learn/getCourseLearn?cid=' + encodeURIComponent(cid)
            : 'https://www.uooc.net.cn/home/learn/getCourseLearn?cid=' + encodeURIComponent(cid);
        fetch(fetchUrl, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
        .then(function(response) {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            return response.json();
        })
        .then(function(res) {
            window.canIgnoreTest = Boolean(res.data && res.data.course_learn_mode === '20');
            console.log('[UOOC助手] 可忽略测验:', window.canIgnoreTest);
        })
        .catch(function(err) {
            console.log('[UOOC助手] 获取课程学习模式失败，使用默认设置:', err.message);
            window.canIgnoreTest = false;
        });
    }

    // 绑定章节变化 - 增强对新页面的兼容性
    function bindChapterChange() {
        function bindSubChapterChange() {
            // 新旧页面可能有不同的选择器
            // 旧页面: [source-view] | 新页面: newlearn-source-video, .video-js
            var sourceView = document.querySelector('[source-view]') ||
                             document.querySelector('newlearn-source-video') ||
                             document.querySelector('.newlearn_source_video') ||
                             document.querySelector('.video-js') ||
                             document.querySelector('.newlearn_center_bottom_content');
            if (!sourceView) return;
            var sObserver = new MutationObserver(function(mutations) {
                if (document.querySelector('[source-view] [uooc-video] video') ||
                    document.querySelector('video#player_html5_api') ||
                    document.querySelector('video.vjs-tech')) {
                    console.log('[UOOC助手] 检测到视频变化');
                    setTimeout(start, 250);
                }
            });
            sObserver.observe(sourceView, { childList: true });
        }

        // 尝试多个可能的容器选择器
        // 旧页面: .learn-main-left | 新页面: .newlearn_sidebar
        var mainLeft = document.querySelector('.learn-main-left') ||
                       document.querySelector('.learn-sidebar') ||
                       document.querySelector('.course-sidebar') ||
                       document.querySelector('.chapter-tree') ||
                       document.querySelector('.newlearn_sidebar') ||
                       document.querySelector('.newlearn_left');

        if (!mainLeft) {
            console.log('[UOOC助手] 未找到章节容器元素，跳过章节绑定');
            return;
        }

        var mObserver = new MutationObserver(function(mutations) {
            bindSubChapterChange();
        });
        mObserver.observe(mainLeft, { childList: true });
        bindSubChapterChange();
    }

    function autoQuiz() {
        // 从所有元素的source属性中查找包含真实JSON数据的那个 (新旧页面兼容)
        // 新页面的[uooc-video]元素的source属性值为"curSource" (Angular引用)，
        // 实际JSON数据存放在另一个元素的source属性中
        function findSourceData() {
            // 策略1: 搜索所有带source属性的元素，找到第一个包含JSON的
            var allSourceElems = document.querySelectorAll('[source], [data-source]');
            for (var i = 0; i < allSourceElems.length; i++) {
                var attr = allSourceElems[i].getAttribute('source') || allSourceElems[i].getAttribute('data-source');
                if (attr && attr.startsWith('{')) {
                    try {
                        return { source: JSON.parse(attr), elem: allSourceElems[i] };
                    } catch(e) {
                        continue;
                    }
                }
            }

            // 策略2: 尝试从Angular作用域获取
            var sourceDiv = document.querySelector('div[uooc-video]') || document.querySelector('[source-view]');
            if (sourceDiv && window.angular) {
                try {
                    var scope = window.angular.element(sourceDiv).scope();
                    if (scope && scope.curSource) {
                        return { source: scope.curSource, elem: sourceDiv };
                    }
                } catch(e) {
                    console.log('[UOOC助手] 无法从Angular作用域获取源数据:', e.message);
                }
            }

            return null;
        }

        function autoQuizAnswer() {
            try {
                // 查找测验弹窗层 (新旧页面兼容)
                // 旧页面: #quizLayer, .smallTest-view | 新页面: .question_content, .layui-layer
                var quizLayer = document.getElementById('quizLayer') ||
                               document.querySelector('.quiz-layer, .smallTest-view, [class*="quiz"], .layui-layer, .modal-quiz, .question_content');
                if (!quizLayer) return;

                // 获取视频源数据
                var sourceData = findSourceData();
                if (!sourceData) {
                    console.log('[UOOC助手] 未找到视频源数据');
                    return;
                }
                var source = sourceData.source;

                // 查找题目
                var quizQuestion = document.querySelector('.smallTest-view .ti-q-c') ||
                                   document.querySelector('.quiz-question .ti-q-c') ||
                                   document.querySelector('.ti-q-c') ||
                                   document.querySelector('.quiz-content .question');

                if (!quizQuestion) return;

                // 使用 extractMathText 支持 MathJax/LaTeX 数学公式 (返回 {text, images})
                var mqResult = extractMathText(quizQuestion);
                var quizQuestionText = mqResult.text || quizQuestion.innerHTML || quizQuestion.innerText;
                if (!source.quiz || source.quiz.length === 0) return;

// 使用规范化匹配 (对数学公式更鲁棒，跳过原始===比较)
                var quizData;
                var normalizedQ = normalizeText(quizQuestionText);
                quizData = source.quiz.find(q => normalizeText(q.question) === normalizedQ);
                
                // 最后尝试部分匹配 (关键词)
                if (!quizData) {
                    for (var q of source.quiz) {
                        if (q.question && quizQuestionText &&
                            normalizeText(quizQuestionText).includes(normalizeText(q.question).substring(0, 20))) {
                            quizData = q;
                            break;
                        }
                    }
                }
                
                if (!quizData) {
                    console.log('[UOOC助手] 未找到匹配的题目 (已尝试精确+模糊+部分匹配)');
                    return;
                }

                var quizAnswer = quizData.answer;
                var quizOptions = quizLayer.querySelector('div.ti-alist') ||
                                 quizLayer.querySelector('.options-list') ||
                                 quizLayer.querySelector('[class*="option"]');
                if (!quizOptions) return;

                var answers = eval(quizAnswer);
                for (let ans of answers) {
                    var idx = ans.charCodeAt() - 'A'.charCodeAt();
                    if (quizOptions.children[idx]) {
                        quizOptions.children[idx].click();
                    }
                }
                var submitBtn = quizLayer.querySelector('button');
                if (submitBtn) submitBtn.click();
                console.log('[UOOC助手] 自动答题完成');
            } catch (err) {
                console.error('[UOOC助手] 自动答题出错:', err);
            }
        }

        var learnView = document.querySelector('.lean_view') ||
                        document.querySelector('.learn-view') ||
                        document.querySelector('.video-view') ||
                        document.querySelector('.learn-main') ||
                        document.querySelector('.video-player-container') ||
                        document.querySelector('.newlearn_center') ||
                        document.querySelector('.newlearn_center_bottom') ||
                        document.querySelector('.new_learn_content') ||
                        document.querySelector('.main') ||
                        document.body;

        if (!learnView) return;
        var observer = new MutationObserver(function(mutations) {
            for (let mutation of mutations) {
                let node = mutation.addedNodes[0];
                if (node && node.id && node.id.includes('layui-layer')) {
                    console.log('[UOOC助手] 检测到测验弹窗');
                    autoQuizAnswer();
                    // 新增：如果自动LLM答题已启用，同时触发AI答题
                    if (window.llmAutoAnswer && document.getElementById('llm-answer-btn')) {
                        console.log('[UOOC助手-AI] 自动触发AI答题');
                        setTimeout(function() {
                            var btn = document.getElementById('llm-answer-btn');
                            if (btn && !btn.disabled) {
                                btn.click();
                            }
                        }, 500);
                    }
                    break;
                }
                // 新增：检测新页面可能的弹窗类名
                if (node && node.classList) {
                    let classStr = Array.from(node.classList).join(' ');
                    if (classStr.includes('quiz') || classStr.includes('layer')) {
                        console.log('[UOOC助手] 检测到可能的测验弹窗:', node.tagName, node.className);
                        setTimeout(autoQuizAnswer, 300);
                        // 新增：如果自动LLM答题已启用，同时触发AI答题
                        if (window.llmAutoAnswer) {
                            setTimeout(function() {
                                if (document.getElementById('llm-answer-btn')) {
                                    var btn = document.getElementById('llm-answer-btn');
                                    if (btn && !btn.disabled) {
                                        console.log('[UOOC助手-AI] 自动触发AI答题 (弹窗检测)');
                                        btn.click();
                                    }
                                } else if (typeof autoAnswerQuiz === 'function') {
                                    void autoAnswerQuiz();
                                }
                            }, 500);
                        }
                    }
                }
            }
        });
        observer.observe(learnView, { childList: true });
    }

    // 全局视频元素引用 (SPA导航时会被更新)
    window.__uoocVideo = null;
    // 标记是否已经绑定过 focus/visibility 监听器
    var __videoEventBound = false;

    // 动态获取当前视频元素
    function getCurrentVideo() {
        // SPA 会整体替换 <video> 元素: 缓存的旧元素一旦脱离 DOM 必须重新查找,
        // 否则静音/倍速/播放/连播全部作用在死元素上 (表现为"要强制刷新才生效")
        var cached = window.__uoocVideo;
        if (cached && cached.isConnected) return cached;
        if (cached && !cached.isConnected) {
            console.log('[UOOC助手] 旧视频元素已失效(SPA切换)，重新查找');
            window.__uoocVideo = null;
        }
        var v = document.getElementById('player_html5_api') ||
                document.querySelector('video.vjs-tech') ||
                document.querySelector('video.html5-video-player video') ||
                document.querySelector('video');
        if (v && v !== window.__uoocVideo) {
            window.__uoocVideo = v;
            if (v && !v.__uooc_events_bound) {
                v.__uooc_events_bound = true;
                console.log('[UOOC助手] 检测到新视频元素，重新绑定事件');
                // 应用当前设置到新视频
                if (document.getElementById('rate') && document.getElementById('rate').checked) {
                    var rt = getUoocRate();
                    v.playbackRate = rt;
                    if (window.videojs && typeof videojs.getPlayer === 'function') {
                        try { var p = videojs.getPlayer(v); if (p && p.playbackRate) p.playbackRate(rt); } catch(e) {}
                    }
                }
                if (document.getElementById('volume') && document.getElementById('volume').checked) {
                    v.muted = true;
                }
                if (document.getElementById('play') && document.getElementById('play').checked && !window.__uoocNavPending) {
                    const playPromise = v.play();
                    if (playPromise && typeof playPromise.catch === 'function') {
                        playPromise.catch(() => {});
                    }
                }
            }
        }
        return v;
    }

    // 倍速条目标速度 (2~4x, 滑条选择, localStorage 持久化, 默认 2)
    function getUoocRate() {
        var v = parseFloat(localStorage.getItem('uooc_rate') || '2');
        if (isNaN(v) || v < 1 || v > 4) v = 2;
        return v;
    }

    // 把倍速应用到当前视频 (原生属性 + videojs 双通道)
    function setVideoRate(v) {
        var video = getCurrentVideo();
        if (!video) return;
        video.playbackRate = v;
        if (window.videojs && typeof videojs.getPlayer === 'function') {
            try {
                var p = videojs.getPlayer(video);
                if (p && typeof p.playbackRate === 'function') p.playbackRate(v);
            } catch (e) {}
        }
    }

    // 绑定视频事件 - 增强兼容性 (SPA导航时重新绑定)
    function bindVideoEvents() {
        var video = getCurrentVideo();
        if (!video) {
            console.log('[UOOC助手] 未找到视频元素');
            return;
        }
        console.log('[UOOC助手] 绑定视频事件');

        // 防止重复绑定 onpause
        if (video.__onpause_bound) return;
        video.__onpause_bound = true;
        video.onpause = function() {
            var v = getCurrentVideo();
            if (v && document.getElementById('play') && document.getElementById('play').checked && !v.ended) {
                v.play();
            }
        };
        // ended 双保险: onended 属性可能被站点自身代码覆盖, addEventListener 不受影响。
        // 4 秒去重窗防止两条路径同时触发导致连点。
        var endedHandler = function() {
            var now = Date.now();
            if (window.__uoocLastEnded && now - window.__uoocLastEnded < 4000) return;
            window.__uoocLastEnded = now;
            console.log('[UOOC助手] 视频播放结束，触发连播');
            findNextVideo();
        };
        video.onended = endedHandler;
        video.addEventListener('ended', endedHandler);

        // 新增：窗口重新获得焦点时自动恢复视频播放 (解决鼠标移开/失去焦点暂停问题)
        if (!__videoEventBound) {
            __videoEventBound = true;

            window.addEventListener('focus', function() {
                var v = getCurrentVideo();
                if (v && document.getElementById('play') && document.getElementById('play').checked) {
                    if (v.paused) {
                        console.log('[UOOC助手] 窗口重新获得焦点，恢复视频播放');
                        const playPromise = v.play();
                        if (playPromise && typeof playPromise.catch === 'function') {
                            playPromise.catch(() => {});
                        }
                        // 通过video.js API 也同步恢复
                        if (window.videojs && typeof videojs.getPlayer === 'function') {
                            try {
                                var player = videojs.getPlayer(v);
                                if (player && typeof player.play === 'function') {
                                    player.play();
                                }
                            } catch(e) {}
                        }
                    }
                }
            });

            // 新增：定期检查视频是否被暂停，自动恢复 (应对UOOC自身暂停逻辑 + SPA视频替换)
            setInterval(function() {
                var v = getCurrentVideo(); // 动态获取当前视频 (SPA导航后自动更新)
                if (v && document.getElementById('play') && document.getElementById('play').checked) {
                    if (v.paused && !v.ended && !window.__uoocNavPending) {
                        console.log('[UOOC助手] 检测到视频暂停，自动恢复播放');
                        const playPromise = v.play();
                        if (playPromise && typeof playPromise.catch === 'function') {
                            playPromise.catch(() => {});
                        }
                    }
                }
            }, 2000);
        }
    }

    // 新增：自动LLM答题轮询 (检测到题目自动答题)
    function startLLMPoll() {
        console.log('[UOOC助手] 自动LLM答题轮询已启动');
        var hasAnswered = false;
        var answeredExam = null; // 已自动答过的卷子标识 (src), 同一张卷不重复答

        var llmPoll = setInterval(function() {
            if (!window.llmAutoAnswer) {
                clearInterval(llmPoll);
                return;
            }
            // 连播的"测验自动完成"流程正在答题时, 轮询让路 (防双重作答)
            if (window.__uoocAnswerBusy) {
                return;
            }

            // 检查是否在考试/测评页面 (用"可见性"判断: SPA 切走后残留的隐藏 iframe 不算数)
            var currentUrl = window.location.href;
            var isQuiz = currentUrl.includes('/exam') || currentUrl.includes('/quiz') || isQuizPageVisible();

            if (!isQuiz) {
                hasAnswered = false; // 重置，准备下一次答题
                return;
            }

            // 检查是否已答题完成
            var answerBtn = document.getElementById('llm-answer-btn');
            if (answerBtn && answerBtn.disabled) {
                return; // 答题进行中，等待完成
            }

            if (hasAnswered) {
                return; // 已经答过题了，跳过
            }

            // 同一张卷只自动答一次: 残留 iframe 再怎么被检测到也不会重复触发弹窗
            var examSrc = getVisibleExamSrc() || ('url:' + currentUrl);
            if (answeredExam === examSrc) {
                return;
            }

            // 检查是否有题目
            var hasQuestions = document.querySelector('.queContainer') ||
                               document.querySelector('#examMain') ||
                               document.querySelector('.question-content');

            if (!hasQuestions && !isQuizPageVisible()) {
                return;
            }

            // 自动触发LLM答题
            console.log('[UOOC助手] 自动检测到题目，开始AI答题...');
            hasAnswered = true;
            answeredExam = examSrc;
            if (answerBtn) {
                answerBtn.click();
            } else if (typeof autoAnswerQuiz === 'function') {
                void autoAnswerQuiz();
            }
        }, 1000);

        // 清理轮询
        window.addEventListener('beforeunload', function() {
            clearInterval(llmPoll);
        });
    }

    // ==================== 自动讨论：识别话题 → 多角度短发言 → 逐条发布 ====================
    // 注意: 优课会用 AI 评估讨论发言质量并打击 AI 生成内容,
    // 所以生成的发言刻意保持学生口吻 (1-2 句、口语化、不同角度、无套话)
    function getDiscussionTopic() {
        const els = document.querySelectorAll('div, p, span');
        for (let i = 0; i < els.length; i++) {
            const el = els[i];
            if (el.children.length > 0) continue; // 只看叶子节点
            const t = (el.innerText || '').trim();
            if (t.length >= 15 && t.length <= 300 && (t.indexOf('？') >= 0 || t.indexOf('吗') >= 0 || t.indexOf('谈谈') >= 0)) {
                return t;
            }
        }
        return null;
    }

    function callLLMText(prompt) {
        var config = LLMConfig.get();
        if (!config || !config.baseUrl || !config.apiKey) {
            return Promise.reject(new Error('请先点击⚙️配置 AI API'));
        }
        return fetch(config.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.apiKey },
            body: JSON.stringify({
                model: config.model || 'gpt-4o',
                messages: [
                    { role: 'system', content: '你是一个在网络讨论区发言的在校大学生，说话口语化、简短、有个人观点。' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.9,
                max_tokens: 600
            })
        }).then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function(d) {
            return (d.choices[0].message.content || '').trim();
        });
    }

    function getUeditorInstance() {
        try {
            if (window.UE && window.UE.instants) {
                var keys = Object.keys(window.UE.instants);
                for (var i = 0; i < keys.length; i++) {
                    var inst = window.UE.instants[keys[i]];
                    if (inst && typeof inst.setContent === 'function') return inst;
                }
            }
        } catch (e) {}
        return null;
    }

    function postDiscussionReply(text) {
        var ue = getUeditorInstance();
        if (!ue) return false;
        try {
            ue.ready(function() {
                try { ue.setContent('<p>' + text + '</p>'); } catch (e) {}
            });
        } catch (e) { return false; }
        var btn = document.querySelector('.replay-editor-btn');
        if (!btn) return false;
        btn.click();
        return true;
    }

    function autoDiscussFlow() {
        var topic = getDiscussionTopic();
        if (!topic) {
            alert('没有识别到讨论话题，请先打开一个"讨论"页面再点本按钮');
            return;
        }
        var count = 3;
        if (!window.confirm('检测到讨论话题：\n\n' + topic.substring(0, 150) + '\n\n将自动发布 ' + count + ' 条不同角度的简短发言（每条 1-2 句）。\n\n优课会用 AI 评估发言，已按学生口吻生成，但仍建议发布后自己看一眼。确定执行？')) return;

        var prompt = '这门课的讨论区话题是：' + topic + '\n\n请以选课学生的身份，从3个不同角度各写一条讨论发言。要求：每条1-2句话；口语化、像学生随口打的字；直接给出观点和理由；可以用第一人称；禁止出现"首先""其次""总之""综上""作为一名大学生"等套话；禁止分点和列表；三条的切入角度要明显不同。按格式返回（每行一条）：\n1. 发言内容\n2. 发言内容\n3. 发言内容';

        callLLMText(prompt).then(function(resp) {
            var replies = [];
            resp.split('\n').forEach(function(line) {
                var m = line.trim().match(/^(\d+)[.、:：)]\s*(.+)$/);
                if (m && m[2].length > 5) replies.push(m[2].replace(/\*/g, '').trim());
            });
            if (replies.length === 0) {
                alert('AI 返回格式解析失败：\n' + resp.substring(0, 200));
                return;
            }
            if (replies.length > count) replies = replies.slice(0, count);

            console.log('[UOOC助手-讨论] 生成 ' + replies.length + ' 条发言，开始逐条发布');
            var i = 0;
            function postNext() {
                if (i >= replies.length) {
                    console.log('[UOOC助手-讨论] 全部发布完成');
                    return;
                }
                var ok = postDiscussionReply(replies[i]);
                if (ok) {
                    console.log('[UOOC助手-讨论] 已发布第' + (i + 1) + '条:', replies[i]);
                    i++;
                    setTimeout(postNext, 6000 + Math.floor(Math.random() * 6000)); // 随机 6~12 秒
                } else {
                    console.log('[UOOC助手-讨论] 编辑器不可用，发布中止');
                }
            }
            postNext();
        }).catch(function(e) {
            alert('AI 调用失败: ' + e.message);
        });
    }

    // ==================== 连播遇测验：自动完成流程 ====================
    // 连播勾选中时: 进入测验页 → 等题目渲染 → AI 填答 → 自动提交 → 继续连播。
    // 前提: 用户勾选了"连播"(视为接受全自动完成测验); AI 一题都没填上时不提交, 转手动。
    function findExamIframeDoc() {
        const iframes = document.querySelectorAll('iframe');
        for (let i = 0; i < iframes.length; i++) {
            try {
                const f = iframes[i];
                const d = f.contentDocument || f.contentWindow.document;
                if (d && d.querySelectorAll('.queContainer').length > 0) return { doc: d, win: f.contentWindow };
            } catch (e) {}
        }
        return null;
    }

    function findButtonByText(doc, text) {
        const els = doc.querySelectorAll('button, a, input[type="button"], input[type="submit"], div, span');
        for (let i = 0; i < els.length; i++) {
            const el = els[i];
            if ((el.innerText || el.value || '').trim() === text && el.children.length === 0) return el;
        }
        return null;
    }

    function autoCompleteQuizFlow(attempts) {
        // 连播被取消就停 (用户中途关闭连播 = 接管)
        var continueBox = document.getElementById('continue');
        if (!continueBox || !continueBox.checked) {
            window.__uoocSilentAnswer = false;
            console.log('[UOOC助手] 连播已取消，停止测验自动完成');
            return;
        }

        var exam = findExamIframeDoc();
        if (!exam) {
            if (attempts > 0) { setTimeout(() => autoCompleteQuizFlow(attempts - 1), 2000); }
            else { console.log('[UOOC助手] 等待测验页面加载超时，连播停止'); window.__uoocNavPending = false; }
            return;
        }
        if (exam.doc.querySelectorAll('.queContainer').length === 0) {
            if (attempts > 0) { setTimeout(() => autoCompleteQuizFlow(attempts - 1), 2000); }
            return;
        }

        console.log('[UOOC助手] 测验页已就绪，开始 AI 答题...');
        window.__uoocSilentAnswer = true;
        autoAnswerQuiz().then(function() {
            window.__uoocAnswerBusy = false;
            var res = window.__uoocLastFillResult || { filled: 0, total: 0 };
            console.log('[UOOC助手] 测验自动填答完成: ' + res.filled + '/' + res.total);
            if (res.filled <= 0) {
                console.log('[UOOC助手] AI 一题都没填上，不自动提交，请你手动处理');
                window.__uoocSilentAnswer = false;
                window.__uoocNavPending = false;
                return;
            }
            // 提交: 先覆盖原生 confirm, 再点"提交试卷", 再点确认弹层
            try { exam.win.confirm = function() { return true; }; } catch (e) {}
            var submitBtn = findButtonByText(exam.doc, '提交试卷');
            if (!submitBtn) { console.log('[UOOC助手] 未找到"提交试卷"按钮，请你手动提交'); window.__uoocSilentAnswer = false; window.__uoocNavPending = false; return; }
            submitBtn.click();
            console.log('[UOOC助手] 已点击提交试卷，等待确认弹层...');
            var confirmTries = 8;
            var confirmTimer = setInterval(function() {
                confirmTries--;
                var okBtn = null;
                var layerBtns = exam.doc.querySelectorAll('.layui-layer-btn a, .layui-layer button, .layui-layer input[type="button"]');
                for (var k = 0; k < layerBtns.length; k++) {
                    var t = (layerBtns[k].innerText || layerBtns[k].value || '').trim();
                    if (t.indexOf('确定') >= 0 || t.indexOf('确认') >= 0) { okBtn = layerBtns[k]; break; }
                }
                if (okBtn) {
                    clearInterval(confirmTimer);
                    okBtn.click();
                    console.log('[UOOC助手] 测验已自动提交，6 秒后继续连播');
                    setTimeout(function() {
                        window.__uoocSilentAnswer = false;
                        window.__uoocNavPending = false;
                        window.__uoocLastForwardClick = Date.now();
                        findNextVideo();
                    }, 6000);
                } else if (confirmTries <= 0) {
                    clearInterval(confirmTimer);
                    console.log('[UOOC助手] 未检测到确认弹层（可能已直接提交），8 秒后继续连播');
                    setTimeout(function() {
                        window.__uoocSilentAnswer = false;
                        window.__uoocNavPending = false;
                        window.__uoocLastForwardClick = Date.now();
                        findNextVideo();
                    }, 8000);
                }
            }, 1000);
        });
    }

    // 应用设置到视频元素 (2倍速/静音/播放) — 动态获取当前视频 (SPA兼容)
    function applyVideoSettings() {
        var video = getCurrentVideo();
        if (!video) return false;

        var volume = document.getElementById('volume');
        var play = document.getElementById('play');
        var rate = document.getElementById('rate');

        // 应用倍速 (跟随滑条选择, 通过videojs API + 直接设置双重保障)
        if (rate && rate.checked) {
            var rt = getUoocRate();
            if (video.playbackRate !== rt) {
                video.playbackRate = rt;
            }
            if (window.videojs && typeof videojs.getPlayer === 'function') {
                try {
                    var player = videojs.getPlayer(video);
                    if (player && typeof player.playbackRate === 'function') {
                        player.playbackRate(rt);
                    }
                } catch (e) {
                    console.log('[UOOC助手] videojs API设置倍速失败:', e.message);
                }
            }
        }

        // 应用静音
        if (volume && volume.checked) {
            video.muted = true;
        }

        // 应用播放 (排除已播完的视频: ended 状态下调 play() 会从头重播,
        // 与连播"遇测验停止"叠加后会形成 无限重播循环, 必须排除)
        if (play && play.checked && video.paused && !video.ended && !window.__uoocNavPending) {
            console.log('[UOOC助手] 自动播放视频');
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {});
            }
        }

        return true;
    }

    function start() {
        console.log('[UOOC助手] start() 函数执行');

        // 3秒轮询 (全局仅注册一次): 晚出现的视频也能自动生效静音/倍速/连播绑定。
        // 之前注册在"当时就找到视频"的分支里 — 页面刚打开还没有视频时 start() 重试
        // 超时放弃, 轮询永远不会注册 → 点开视频不生效, 必须刷新才能恢复。
        if (!window.__uoocPollTimer) {
            window.__uoocPollTimer = setInterval(function() {
                applyVideoSettings();
                bindVideoEvents();
                refreshProgressPanel(); // 进度悬浮窗打开时自动刷新 (关闭状态直接返回)
                // 连播自愈: ended 事件被吞/处理器被覆盖时, 视频会停在最后一秒 —
                // 每 3 秒检查一次, 停在结尾就重试推进 (endedHandler 的 4 秒去重防连点)。
                // 若上次"向前点击"后 15 秒内仍在原地 (下一个视频被锁, 点不开), 不再反复点击。
                try {
                    var v = getCurrentVideo();
                    if (v && v.ended && document.getElementById('continue') && document.getElementById('continue').checked &&
                        (!window.__uoocLastEnded || Date.now() - window.__uoocLastEnded >= 4000) &&
                        (!window.__uoocLastForwardClick || Date.now() - window.__uoocLastForwardClick >= 15000)) {
                        window.__uoocLastEnded = Date.now();
                        console.log('[UOOC助手] 检测到视频停在结尾，重试连播推进');
                        findNextVideo();
                    }
                } catch(e) {}
            }, 3000);
        }

        bindKeyboardEvents();
        bindVideoEvents();
        autoQuiz();

        // 动态查找视频元素 (支持SPA异步加载)
        var video = getCurrentVideo();
        if (!video) {
            window.__startRetryCount = (window.__startRetryCount || 0) + 1;
            if (window.__startRetryCount < 20) {
                console.log('[UOOC助手] start() 中未找到视频元素，第', window.__startRetryCount, '次重试');
                setTimeout(start, 500);
            } else {
                console.warn('[UOOC助手] 重试20次后仍未找到视频元素，脚本进入监听模式');
                // 2倍速模块会在视频加载后自动应用
            }
            return;
        }

        window.__startRetryCount = 0;

        // 应用设置到当前视频
        applyVideoSettings();

        // 新增：SPA视频替换监听 — 当视频元素被替换时重新应用设置
        // 通过MutationObserver监控视频容器，检测到新视频时重新绑定
        var videoContainer = document.querySelector('.video-js') ||
                             document.querySelector('.learn-video') ||
                             document.querySelector('.newlearn_center_bottom') ||
                             document.body;

        var videoObserver = new MutationObserver(function(mutations) {
            for (let mutation of mutations) {
                for (let node of mutation.addedNodes) {
                    if (node && (node.tagName === 'VIDEO' ||
                                (node.querySelector && (
                                    node.querySelector('video') ||
                                    node.querySelector('.vjs-tech'))))) {
                        console.log('[UOOC助手] SPA检测到新视频元素，重新应用设置');
                        setTimeout(function() {
                            bindVideoEvents();
                            applyVideoSettings();
                        }, 300);
                        break;
                    }
                }
            }
        });
        videoObserver.observe(videoContainer, { childList: true, subtree: true });
    }

    function placeComponents() {
        console.log('[UOOC助手] 开始放置UI组件');

        function copyToClipboard(content) {
            var t = document.createElement('textarea');
            t.value = content;
            document.body.appendChild(t);
            t.select();
            document.execCommand('copy');
            document.body.removeChild(t);
        }

        function getCheckbox(name, text) {
            var p = document.createElement('p');
            p.style = 'color: #ccc; padding-left: 10px;';
            var checkbox = document.createElement('input');
            checkbox.id = checkbox.name = checkbox.value = name;
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.style = 'margin-left: 15px; width: 12px; height: 12px;';
            p.append(checkbox);
            var label = document.createElement('label');
            label.htmlFor = name;
            label.innerText = text;
            label.style = 'margin-left: 13px; font-size: 12px;';
            p.append(label);
            return p;
        }

        function getContainer(_id) {
            var container = document.createElement('div');
            container.id = _id;
            container.style = 'display: flex; flex-direction: row; align-items: center;';
            return container;
        }

        function getCopyButton() {
            var copyButton = document.createElement('p');
            copyButton.style = 'color: #ccc; padding-left: 10px;';
            var btn = document.createElement('button');
            btn.innerText = '复制题目答案';
            btn.style = 'margin-left: 13px; padding: 0 5px 0; font-size: 12px; cursor: pointer;';
            btn.onclick = function() {
                try {
                    var testPaperTop = frames[0] ? frames[0].document.querySelector('.testPaper-Top') : document.querySelector('.testPaper-Top');
                    if (!testPaperTop) {
                        alert('该页面不是测验页面，无法复制内容');
                    } else {
                        if (testPaperTop.querySelector('.fl_right')) {
                            var queItems = frames[0] ? Array.from(frames[0].document.querySelectorAll('.queItems')) : Array.from(document.querySelectorAll('.queItems'));
                            var content = queItems.map(queType => {
                                var res = '';
                                if (queType.querySelector('.queItems-type').innerText.indexOf('选') >= 0) {
                                    var questions = queType.querySelectorAll('.queContainer');
                                    res += Array.from(questions).map((question) => {
                                        var que = question.querySelector('.queBox').innerText.replace(/\n{2,}/g, '\n').replace(/(\w\.)\n/g, '$1 ');
                                        var ans = question.querySelector('.answerBox div:first-child').innerText.replace(/\n/g, '');
                                        var scoresDiv = question.querySelector('.scores');
                                        var right = false;
                                        if (scoresDiv) {
                                            var match = scoresDiv.innerText.match(/\d+\.?\d+/g);
                                            if (match) {
                                                var right = match.map(score => eval(score));
                                                right = right[0] === right[1];
                                            }
                                        }
                                        return `${que}\n${ans}\n是否正确：${right}\n`;
                                    }).join('\n');
                                }
                                return res;
                            }).join('\n');
                            copyToClipboard(content);
                            alert('题目及答案已复制到剪切板');
                        } else {
                            alert('该测验可能还没提交，无法复制');
                        }
                    }
                } catch (err) {
                    alert('复制出错：' + err.message);
                }
            };
            return copyButton;
        }

        function setCheckboxes(container) {
            var rateCheckbox = getCheckbox('rate', '倍速');
            // 倍速条: 2~4x 滑条, 拖动即生效并记住选择
            var rateSlider = document.createElement('input');
            rateSlider.id = 'rate-slider';
            rateSlider.type = 'range';
            rateSlider.min = '2'; rateSlider.max = '4'; rateSlider.step = '0.25';
            rateSlider.value = localStorage.getItem('uooc_rate') || '2';
            rateSlider.style = 'margin-left: 8px; width: 90px; vertical-align: middle; cursor: pointer; accent-color: #ffd54a;';
            rateSlider.title = '倍速滑条：2 ~ 4 倍，拖动选择，立即生效';
            var rateLabel = document.createElement('label');
            rateLabel.style = 'margin-left: 4px; font-size: 12px; color: #ffd54a; min-width: 36px; display: inline-block;';
            rateLabel.innerText = parseFloat(rateSlider.value) + 'x';
            rateSlider.oninput = function() {
                var v = parseFloat(this.value);
                if (isNaN(v) || v < 1 || v > 4) v = 2;
                localStorage.setItem('uooc_rate', String(v));
                rateLabel.innerText = v + 'x';
                if (document.getElementById('rate') && document.getElementById('rate').checked) setVideoRate(v);
            };
            rateCheckbox.appendChild(rateSlider);
            rateCheckbox.appendChild(rateLabel);
            var volumeCheckbox = getCheckbox('volume', '静音');
            var playCheckbox = getCheckbox('play', '播放');
            var continueCheckbox = getCheckbox('continue', '连播');
            var copyButton = getCopyButton();

            // 创建LLM答题复选框和设置按钮
            var llmContainer = document.createElement('p');
            llmContainer.style = 'color: #ccc; padding-left: 10px; display: flex; align-items: center;';

            // 创建设置按钮（齿轮图标）
            var settingBtn = document.createElement('span');
            settingBtn.innerHTML = '⚙️';
            settingBtn.style = 'margin-left: 15px; font-size: 16px; cursor: pointer; margin-right: 5px;';
            settingBtn.title = '配置AI答题参数';
            settingBtn.onclick = function() {
                LLMConfig.showConfigUI();
            };

            // 创建LLM复选框
            var llmCheckbox = document.createElement('input');
            llmCheckbox.id = llmCheckbox.name = llmCheckbox.value = 'llm';
            llmCheckbox.type = 'checkbox';
            llmCheckbox.checked = window.llmEnabled;
            llmCheckbox.style = 'width: 12px; height: 12px;';
            llmCheckbox.onchange = function(event) {
                window.llmEnabled = event.target.checked;
                console.log('[UOOC助手] LLM答题', window.llmEnabled ? '已启用' : '已禁用');

                if (window.llmEnabled) {
                    // 检查配置
                    const config = LLMConfig.get();
                    if (!config || !config.baseUrl || !config.apiKey) {
                        alert('LLM答题已启用，但尚未配置API参数！\n\n请点击⚙️图标进行配置。');
                        setTimeout(function() {
                            LLMConfig.showConfigUI();
                        }, 300);
                    }
                }

                // 更新答题按钮状态
                updateAnswerButtonState();
            };

            var llmLabel = document.createElement('label');
            llmLabel.htmlFor = 'llm';
            llmLabel.innerText = 'LLM答题';
            llmLabel.style = 'margin-left: 13px; font-size: 12px;';

            // 创建"开始答题"按钮
            var answerBtn = document.createElement('button');
            answerBtn.id = 'llm-answer-btn';
            answerBtn.innerHTML = '🤖 开始答题';
            answerBtn.className = 'btn btn-primary';
            answerBtn.style.cssText = `
                margin-left: 10px;
                padding: 4px 12px;
                font-size: 12px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.3s;
                opacity: 0.5;
                pointer-events: auto;
                z-index: 10001;
            `;
            answerBtn.onmouseover = function() {
                if (window.llmEnabled) {
                    this.style.transform = 'scale(1.05)';
                    this.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.4)';
                }
            };
            answerBtn.onmouseout = function() {
                this.style.transform = 'scale(1)';
                this.style.boxShadow = 'none';
            };
            answerBtn.onclick = async function() {
                if (!window.llmEnabled) {
                    alert('请先勾选"LLM答题"复选框！');
                    return;
                }

                // 禁用按钮，显示loading
                answerBtn.disabled = true;
                answerBtn.innerHTML = '⏳ 正在答题...';
                answerBtn.style.opacity = '0.7';

                try {
                    await autoAnswerQuiz();
                    // 答题完成
                    answerBtn.innerHTML = '✅ 答题完成';
                    answerBtn.style.background = '#28a745';

                    setTimeout(function() {
                        answerBtn.disabled = false;
                        answerBtn.innerHTML = '🤖 开始答题';
                        answerBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                        answerBtn.style.opacity = '1';
                    }, 3000);
                } catch (error) {
                    // 答题失败
                    answerBtn.innerHTML = '❌ 答题失败';
                    answerBtn.style.background = '#dc3545';

                    setTimeout(function() {
                        answerBtn.disabled = false;
                        answerBtn.innerHTML = '🤖 开始答题';
                        answerBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                        answerBtn.style.opacity = '1';
                    }, 2000);
                }
            };

            // 更新按钮状态的函数 (按钮始终可点击，点击时会检查LLM是否启用)
            function updateAnswerButtonState() {
                if (window.llmEnabled) {
                    answerBtn.style.opacity = '1';
                } else {
                    answerBtn.style.opacity = '0.5';
                }
                answerBtn.style.pointerEvents = 'auto'; // 始终允许点击
            }

            llmContainer.appendChild(settingBtn);
            llmContainer.appendChild(llmCheckbox);
            llmContainer.appendChild(llmLabel);
            llmContainer.appendChild(answerBtn);

            // 新增：创建"自动LLM答题"复选框 (检测到题目自动答题，无需手动点击)
            var autoAnswerCheckbox = document.createElement('input');
            autoAnswerCheckbox.id = 'auto-llm-answer';
            autoAnswerCheckbox.type = 'checkbox';
            autoAnswerCheckbox.style = 'width: 12px; height: 12px; margin-left: 8px;';
            autoAnswerCheckbox.onchange = function(event) {
                window.llmAutoAnswer = event.target.checked;
                console.log('[UOOC助手] 自动LLM答题:', window.llmAutoAnswer ? '已启用' : '已禁用');
                // 自动LLM答题开启时，同时开启LLM答题
                if (window.llmAutoAnswer && !window.llmEnabled) {
                    window.llmEnabled = true;
                    llmCheckbox.checked = true;
                    console.log('[UOOC助手] 自动LLM答题已启用，同时开启LLM答题模式');
                    // 检查配置
                    const config = LLMConfig.get();
                    if (!config || !config.baseUrl || !config.apiKey) {
                        setTimeout(function() {
                            LLMConfig.showConfigUI();
                        }, 300);
                    }
                }
                // 启动答题轮询
                if (window.llmAutoAnswer) {
                    startLLMPoll();
                }
            };

            var autoAnswerLabel = document.createElement('label');
            autoAnswerLabel.htmlFor = 'auto-llm-answer';
            autoAnswerLabel.innerText = '自动答题';
            autoAnswerLabel.style = 'margin-left: 5px; font-size: 12px; color: #ffc107;';
            autoAnswerLabel.title = '开启后，检测到题目自动调用LLM答题，无需手动点击"开始答题"';

            llmContainer.appendChild(autoAnswerCheckbox);
            llmContainer.appendChild(autoAnswerLabel);

            if (rateCheckbox.firstElementChild) {
                rateCheckbox.firstElementChild.onchange = function(event) {
                    // 动态获取当前视频元素 (SPA导航后视频可能已替换)
                    var v = getCurrentVideo();
                    if (v) {
                        if (event.target.checked) {
                            setVideoRate(getUoocRate());
                        }
                        else setVideoRate(1);
                    }
                };
            }

            if (volumeCheckbox.firstElementChild) {
                volumeCheckbox.firstElementChild.onchange = function(event) {
                    var v = getCurrentVideo();
                    if (v) {
                        v.muted = event.target.checked;
                    }
                };
            }

            if (playCheckbox.firstElementChild) {
                playCheckbox.firstElementChild.onchange = function(event) {
                    var v = getCurrentVideo();
                    if (v) {
                        if (event.target.checked) v.play();
                        else v.pause();
                    }
                };
            }

            var progressBtn = document.createElement('button');
            progressBtn.innerText = '📊 进度';
            progressBtn.title = '显示/隐藏学习进度悬浮窗';
            progressBtn.style = 'margin-left: 8px; padding: 2px 8px; font-size: 12px; cursor: pointer; border: none; border-radius: 4px; background: #3a3a3a; color: #eee;';
            progressBtn.onclick = function() {
                var panel = ensureProgressPanel();
                var show = (panel.style.display === 'none' || !panel.style.display);
                panel.style.display = show ? 'block' : 'none';
                if (show) refreshProgressPanel();
            };

            container.appendChild(llmContainer);
            container.appendChild(rateCheckbox);
            container.appendChild(volumeCheckbox);
            container.appendChild(playCheckbox);
            container.appendChild(continueCheckbox);
            container.appendChild(copyButton);
            container.appendChild(progressBtn);
            var discussBtn = document.createElement('button');
            discussBtn.innerText = '💬 讨论';
            discussBtn.title = '在讨论页自动发布多条不同角度的简短发言（需先打开一个讨论页面）';
            discussBtn.style = 'margin-left: 8px; padding: 2px 8px; font-size: 12px; cursor: pointer; border: none; border-radius: 4px; background: #3a3a3a; color: #eee;';
            discussBtn.onclick = function() {
                if (typeof autoDiscussFlow === 'function') autoDiscussFlow();
            };
            container.appendChild(discussBtn);
        }

        /*function setPrompt(container) {
            var div = document.createElement('div');
            div.innerHTML = `提示：<u>该版本为内测版，使用时请先关闭正式版</u>，<u><a href="https://greasyfork.org/zh-CN/scripts/425837-uooc-assistant-beta/feedback" target="_blank" style="color: yellow;">若出现 BUG 点此反馈</a></u>，键盘的 ← 和 → 可以控制快进/快退，↑ 和 ↓ 可以控制音量增大/减小，空格键可以控制播放/暂停`;
            div.style = 'color: #cccccc; height: min-height; margin: 0 20px 0; padding: 0 5px; border-radius: 5px; font-size: 12px;';
            container.appendChild(div);
        }*/

        function setAttribution(container) {
            var div = document.createElement('div');
            div.innerHTML = 'UOOC助手 by cc & wybbb1 / 理不尽 | v2.3.0';
            div.style = 'color: #888; font-size: 10px; margin: 5px 20px; padding: 2px 5px;';
            container.appendChild(div);
        }

        // 增强: 尝试多个可能的头部容器选择器 (新旧页面兼容)
        // 旧页面: .learn-head | 新页面: newlearn-head, .newlearn_head
        var head = document.querySelector('.learn-head') ||
                   document.querySelector('.learn-header') ||
                   document.querySelector('.header') ||
                   document.querySelector('.control-panel') ||
                   document.querySelector('newlearn-head') ||
                   document.querySelector('.newlearn_head') ||
                   document.querySelector('[class*="learn-head"]') ||
                   document.querySelector('[class*="control-panel"]');

        if (!head) {
            // 降级: 在页面顶部创建固定容器
            console.log('[UOOC助手] 未找到.learn-head元素，创建顶部固定容器...');
            head = document.createElement('div');
            head.id = 'learn-head-fallback';
            head.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: rgba(30,30,30,0.9); z-index: 10000; padding: 5px 15px; display: flex; align-items: center;';
            var headIndicator = document.createElement('span');
            headIndicator.innerText = 'UOOC助手';
            headIndicator.style.cssText = 'color: #ccc; font-size: 12px; margin-right: 10px;';
            head.appendChild(headIndicator);
            document.body.appendChild(head);
        }

        console.log('[UOOC助手] 找到头部元素:', head.tagName, head.className || head.id);

        // 避免重复添加
        if (document.getElementById('checkbox-container')) {
            console.log('[UOOC助手] UI组件已存在，跳过添加');
            return true;
        }

        // 创建包裹容器（用于包裹head的原有内容）
        let headContent = document.createElement('div');
        headContent.id = 'head-content-wrapper';

        // 将head的所有子元素移动到contentWrapper中（如果不是创建的fallback）
        if (head.id !== 'learn-head-fallback') {
            while (head.firstChild) {
                headContent.appendChild(head.firstChild);
            }
        } else {
            // fallback模式下不移动子元素，设为null以便后续跳过
            headContent = null;
        }

        // 为head添加过渡动画样式
        head.style.transition = 'max-height 0.4s ease, opacity 0.4s ease, margin-top 0.4s ease';
        head.style.overflow = 'visible';
        head.style.position = 'relative';

        // 创建切换按钮（放在head内，但在contentWrapper外）
        const toggleBtn = document.createElement('div');
        toggleBtn.id = 'control-panel-toggle';
        toggleBtn.innerHTML = '▲';
        toggleBtn.style.cssText = `
            position: absolute;
            bottom: -25px;
            left: 50%;
            transform: translateX(-50%);
            width: 80px;
            height: 25px;
            background: rgba(51, 51, 51, 0.95);
            color: #ccc;
            text-align: center;
            line-height: 25px;
            font-size: 12px;
            cursor: pointer;
            border-radius: 0 0 10px 10px;
            transition: all 0.3s ease;
            z-index: 1000;
            user-select: none;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        `;
        toggleBtn.onmouseover = function() {
            this.style.background = 'rgba(102, 126, 234, 0.95)';
            this.style.color = 'white';
        };
        toggleBtn.onmouseout = function() {
            this.style.background = 'rgba(51, 51, 51, 0.95)';
            this.style.color = '#ccc';
        };

        // 创建控制台容器
        var checkboxContainer = getContainer('checkbox-container');
        checkboxContainer.style.cssText = `
            display: flex;
            flex-direction: row;
            align-items: center;
        `;
        setCheckboxes(checkboxContainer);
        setAttribution(checkboxContainer);

        // 组装元素
        if (headContent) {
            head.appendChild(headContent);
        }
        head.appendChild(checkboxContainer);

        if (head.id !== 'learn-head-fallback') {
            head.appendChild(toggleBtn);

            // 记录原始高度
            const originalHeight = head.offsetHeight + 30;
            head.style.height = originalHeight + 'px';

            // 控制显示/隐藏的函数
            let isPanelVisible = true;
            function hidePanel() {
                if (!isPanelVisible) return;
                isPanelVisible = false;

                if (headContent) {
                    headContent.style.maxHeight = '0px';
                    headContent.style.opacity = '0';
                    headContent.style.overflow = 'hidden';
                    headContent.style.transition = 'max-height 0.4s ease, opacity 0.4s ease';
                }

                checkboxContainer.style.maxHeight = '0px';
                checkboxContainer.style.opacity = '0';
                checkboxContainer.style.overflow = 'hidden';
                checkboxContainer.style.transition = 'max-height 0.4s ease, opacity 0.4s ease';

                head.style.maxHeight = '25px';
                head.style.opacity = '1';

                toggleBtn.innerHTML = '▼';
            }

            function showPanel() {
                if (isPanelVisible) return;
                isPanelVisible = true;

                if (headContent) {
                    headContent.style.maxHeight = originalHeight + 'px';
                    headContent.style.opacity = '1';
                }

                checkboxContainer.style.maxHeight = originalHeight + 'px';
                checkboxContainer.style.opacity = '1';

                head.style.maxHeight = originalHeight + 'px';
                head.style.opacity = '1';

                toggleBtn.innerHTML = '▲';
            }

            toggleBtn.onclick = function() {
                if (isPanelVisible) {
                    hidePanel();
                } else {
                    showPanel();
                }
            };
        } else {
            // fallback模式不隐藏
            toggleBtn.style.display = 'none';
        }

        console.log('[UOOC助手] UI组件添加完成');
        return true;
    }

    function bindKeyboardEvents() {
        console.log('[UOOC助手] 绑定键盘事件');
        document.onkeydown = function(event) {
            var complete = false;
            var basicActiveDiv = document.querySelector('div.basic.active');
            var video = document.getElementById('player_html5_api') ||
                        document.querySelector('video.vjs-tech');

            if (!video) {
                // 尝试延迟查找
                video = document.querySelector('video');
            }
            if (!video) return;

            if (basicActiveDiv && basicActiveDiv.classList.contains('complete')) complete = true;
            switch (event.key) {
                case 'ArrowLeft': {
                    event.preventDefault();
                    video.currentTime -= 10;
                    break;
                }
                case 'ArrowRight': {
                    event.preventDefault();
                    if (complete) video.currentTime += 10;
                    break;
                }
                case 'ArrowUp': {
                    event.preventDefault();
                    if (video.volume + 0.1 <= 1.0) video.volume += 0.1;
                    else video.volume = 1.0;
                    break;
                }
                case 'ArrowDown': {
                    event.preventDefault();
                    if (video.volume - 0.1 >= 0.0) video.volume -= 0.1;
                    else video.volume = 0.0;
                    break;
                }
                case ' ': {
                    event.preventDefault();
                    let continueCheckbox = document.getElementById('play');
                    if (continueCheckbox) continueCheckbox.click();
                    break;
                }
            }
        };
    }

    function findNextVideo() {
        var video = document.getElementById('player_html5_api') ||
                    document.querySelector('video.vjs-tech');

        if (video) {
            if (!document.getElementById('continue') || !document.getElementById('continue').checked) {
                video.currentTime = 0;
            } else {
                let current_video = document.querySelector('.basic.active');
                if (!current_video) {
                    // 尝试备用选择器
                    current_video = document.querySelector('.active-video, .current-video, .video-item.active');
                }
                if (!current_video) return;

                let next_part = current_video.parentNode;
                let next_video = current_video;
                // 连播只在视频之间切换: 讨论/测验/文档任务点一律跳过 (答题由用户手动完成)
                let isVideo = (node) => { return Boolean(node && (node.querySelector('span.icon-video') || node.querySelector('.video-icon') || node.querySelector('[class*="video"]'))); };
                let canBack = () => { return Boolean(next_part.parentNode.parentNode.tagName === 'LI'); };
                let toNextVideo = () => {
                    next_video = next_video.nextElementSibling;
                    while (next_video && !isVideo(next_video)) next_video = next_video.nextElementSibling;
                };
                let isExistsVideo = () => {
                    let _video = next_part.firstElementChild;
                    while (_video && !isVideo(_video)) _video = _video.nextElementSibling;
                    return Boolean(_video && isVideo(_video));
                };
                let isExistsNextVideo = () => {
                    let _video = current_video.nextElementSibling;
                    while (_video && !isVideo(_video)) _video = _video.nextElementSibling;
                    return Boolean(_video && isVideo(_video));
                };
                let isExistsNextListAfterFile = () => {
                    let part = next_part.nextElementSibling;
                    return Boolean(part && part.childElementCount > 0);
                };
                let toNextListAfterFile = () => { next_part = next_part.nextElementSibling; };
                let toOuterList = () => { next_part = next_part.parentNode.parentNode; };
                let toOuterItem = () => { next_part = next_part.parentNode; };
                let isExistsNextListAfterList = () => { return Boolean(next_part.nextElementSibling); };
                let toNextListAfterList = () => { next_part = next_part.nextElementSibling; };
                let expandList = () => {
                    if (next_part.firstElementChild) {
                        next_part.firstElementChild.click();
                    }
                };
                let toExpandListFirstElement = () => {
                    next_part = next_part.firstElementChild.nextElementSibling;
                    if (next_part && next_part.classList.contains('unfoldInfo')) next_part = next_part.nextElementSibling;
                };
                let isList = () => { return Boolean(next_part && next_part.tagName === 'UL'); };
                let toInnerList = () => { next_part = next_part.firstElementChild; };
                let toFirstVideo = () => {
                    next_video = next_part.firstElementChild;
                    while (next_video && !isVideo(next_video)) next_video = next_video.nextElementSibling;
                };

                let mode = {
                    FIRST_VIDEO: 'FIRST_VIDEO',
                    NEXT_VIDEO: 'NEXT_VIDEO',
                    LAST_LIST: 'LAST_LIST',
                    NEXT_LIST: 'NEXT_LIST',
                    INNER_LIST: 'INNER_LIST',
                    OUTER_LIST: 'OUTER_LIST',
                    OUTER_ITEM: 'OUTER_ITEM',
                };

                let search = (_mode) => {
                    switch (_mode) {
                        case mode.FIRST_VIDEO:
                            if (isExistsVideo()) {
                                toFirstVideo();
                                if (next_video) next_video.click();
                                start();
                            } else if (isExistsNextListAfterFile()) {
                                search(mode.LAST_LIST);
                            } else if (window.canIgnoreTest) {
                                next_part = next_part.lastElementChild;
                                search(mode.OUTER_LIST);
                            }
                            break;
                        case mode.NEXT_VIDEO:
                            if (isExistsNextVideo()) {
                                toNextVideo();
                                if (next_video) next_video.click();
                                start();
                            } else if (isExistsNextListAfterFile()) {
                                search(mode.LAST_LIST);
                            } else {
                                search(mode.OUTER_ITEM);
                            }
                            break;
                        case mode.LAST_LIST:
                            toNextListAfterFile();
                            toInnerList();
                            search(mode.INNER_LIST);
                            break;
                        case mode.NEXT_LIST:
                            toNextListAfterList();
                            search(mode.INNER_LIST);
                            break;
                        case mode.INNER_LIST:
                            if (next_part.firstElementChild) {
                                expandList();
                                function waitForExpand() {
                                    if (next_part.firstElementChild.nextElementSibling) {
                                        if (next_part.firstElementChild.nextElementSibling.childElementCount === 0) {
                                            search(mode.OUTER_LIST);
                                        } else {
                                            toExpandListFirstElement();
                                            if (isList()) {
                                                toInnerList();
                                                search(mode.INNER_LIST);
                                            } else {
                                                search(mode.FIRST_VIDEO);
                                            }
                                        }
                                    } else {
                                        setTimeout(waitForExpand, 250);
                                    }
                                }
                                waitForExpand();
                            }
                            break;
                        case mode.OUTER_LIST:
                            toOuterList();
                            if (isExistsNextListAfterList()) {
                                search(mode.NEXT_LIST);
                            } else if (canBack()) {
                                search(mode.OUTER_LIST);
                            }
                            break;
                        case mode.OUTER_ITEM:
                            toOuterItem();
                            if (isExistsNextListAfterList()) {
                                toNextListAfterList();
                                search(mode.INNER_LIST);
                            } else if (canBack()){
                                search(mode.OUTER_LIST);
                            }
                            break;
                        default:
                            break;
                    }
                };

                // 顺序连播 (替代旧的跳跃式状态机):
                // 闯关模式必须按顺序学, 严格从当前位置向后找 ——
                // 下一任务是视频 → 播放; 是测验/作业 → 停止 (手动完成后再连播);
                // 是讨论/文本/附件 → 跳过; 遇到折叠的章节标题 → 展开后重新扫描。
                let isQuizLike = (node) => {
                    if (!node) return false;
                    if (node.querySelector('[class*="icon-test"], [class*="icon-quiz"], [class*="icon-exam"], [class*="icon-homework"]')) return true;
                    var t = node.innerText || '';
                    return t.indexOf('测验') >= 0 || t.indexOf('作业') >= 0 || t.indexOf('考试') >= 0;
                };
                // 标题文本归一化: 侧栏激活行标题里的空格是不换行空格 (U+00A0),
                // 点击前后的 innerText 空格种类不同, 不归一化精确匹配永远失败
                let normLabel = (t) => {
                    return String(t || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
                };
                // 顺序连播 = 目录树遍历 (多层级: 章节→小节→知识点→任务):
                // 1. 从当前位置向后扫, 跳过测验/讨论/文本, 遇视频就播
                // 2. 遇到折叠的标题 → 点击进入, 然后【等待它的任务列表渲染出来】才继续扫
                //    (不等待的话会跳过该知识点直接点到更后面的大章节 — 闯关模式会走乱)
                // 3. 等待超时 (空知识点) → 跳过它继续
                let linearScan = (attemptsLeft, waitText) => {
                    let rows = Array.from(document.querySelectorAll('.basic'));
                    let startIdx;

                    if (waitText) {
                        // 正在等待刚进入的标题 (waitText) 渲染出任务列表
                        let idx = -1;
                        for (let k = 0; k < rows.length; k++) {
                            let t = normLabel(rows[k].innerText);
                            if (t === waitText || t.indexOf(waitText) >= 0) { idx = k; break; }
                        }
                        if (idx < 0) {
                            if (attemptsLeft > 1) { setTimeout(() => { linearScan(attemptsLeft - 1, waitText); }, 700); return; }
                            window.__uoocNavPending = false;
                            console.log('[UOOC助手] 目标章节未渲染出来，连播停止');
                            return;
                        }
                        let nextRow = rows[idx + 1];
                        let nextNg = nextRow ? (nextRow.getAttribute('ng-click') || '') : '';
                        if (nextNg.indexOf('goSource') < 0) {
                            // 任务列表还没渲染出来 → 继续等 (绝不越过它往下扫)
                            if (attemptsLeft > 1) { setTimeout(() => { linearScan(attemptsLeft - 1, waitText); }, 700); return; }
                            // 等待超时: 该层级没有任务 (空知识点) → 跳过它, 从下一行继续
                            console.log('[UOOC助手]', waitText, '下无任务，跳过');
                            startIdx = idx + 1;
                        } else {
                            startIdx = idx + 1; // 任务列表已渲染, 从它的任务开始找视频
                        }
                    } else {
                        let cur = rows.findIndex(r => r.classList.contains('active'));
                        if (cur < 0) {
                            // 侧栏重渲染期间 active 行会短暂消失 — 耐心重试而不是放弃
                            if (attemptsLeft > 1) {
                                setTimeout(() => { linearScan(attemptsLeft - 1); }, 600);
                                return;
                            }
                            window.__uoocNavPending = false;
                            console.log('[UOOC助手] 找不到当前播放项，连播停止');
                            return;
                        }
                        startIdx = cur + 1;
                    }

                    for (let i = startIdx; i < rows.length; i++) {
                        let row = rows[i];
                        let ng = row.getAttribute('ng-click') || '';
                        if (ng.indexOf('toggleChapter') >= 0) {
                            // 标题行: 下一行是任务行 → 已展开 (继续扫); 下一行还是标题 → 折叠的, 点击进入
                            let nextRow = rows[i + 1];
                            let nextNg = nextRow ? (nextRow.getAttribute('ng-click') || '') : '';
                            let expanded = nextNg.indexOf('goSource') >= 0;
                            if (!expanded) {
                                var hText = normLabel(row.innerText);
                                window.__uoocNavPending = true;
                                row.click();
                                console.log('[UOOC助手] 进入下一章节/知识点:', hText);
                                if (attemptsLeft > 1) {
                                    setTimeout(() => { linearScan(attemptsLeft - 1, hText); }, 900);
                                } else {
                                    window.__uoocNavPending = false;
                                }
                                return;
                            }
                            continue; // 已展开的标题: 它的任务行就在后面, 继续扫
                        }
                        if (ng.indexOf('goSource') >= 0) {
                            if (isVideo(row)) {
                                window.__uoocNavPending = false;
                                window.__uoocLastForwardClick = Date.now();
                                row.click();
                                start();
                                return;
                            }
                            if (isQuizLike(row)) {
                                // 连播遇到测验: 进入并自动完成 (AI 填答 + 自动提交), 而不是跳过卡住
                                console.log('[UOOC助手] 连播遇到测验，进入并自动完成');
                                window.__uoocNavPending = true;
                                window.__uoocSilentAnswer = true;
                                window.__uoocAnswerBusy = true;
                                window.__uoocLastForwardClick = Date.now();
                                row.click();
                                if (attemptsLeft > 1) {
                                    setTimeout(() => { autoCompleteQuizFlow(attempts - 1); }, 3000);
                                } else {
                                    window.__uoocNavPending = false;
                                    window.__uoocSilentAnswer = false;
                                }
                                return;
                            }
                            continue; // 讨论/文本/附件: 跳过
                        }
                        // 其他行: 跳过
                    }
                    window.__uoocNavPending = false;
                    console.log('[UOOC助手] 后续没有可自动播放的视频，连播停止');
                };
                try {
                    linearScan(10);
                } catch (err) {
                    console.error('[UOOC助手] 查找下一个视频出错:', err);
                }
            }
        }
    }

    function init() {
        console.log('[UOOC助手] 开始初始化...');

        // 检测页面类型
        const currentUrl = window.location.href;
        console.log('[UOOC助手] 当前URL:', currentUrl);

        // 测评页面 (包括 iframe 中的测评)
        // 检查 iframe 中的题目容器 (数学课程考试页题干在 iframe 中)
        var quizInIframe = false;
        try { quizInIframe = Boolean(isQuizPage()); } catch(e) {}
        if (currentUrl.includes('/exam') || quizInIframe) {
            console.log('[UOOC助手-AI] 检测到测评页面 (iframe 或 /exam URL)');
            // 在测评页面放置UI组件 (数学考试页面无视频播放器，无 .learn-head 会使用 fallback)
            setTimeout(function() {
                var placed = placeComponents();
                if (placed) {
                    showQuizPageHint();
                    // 新增：如果自动LLM答题已启用，立即开始答题轮询
                    if (window.llmAutoAnswer) {
                        console.log('[UOOC助手-AI] 自动LLM答题已启用，开始检测题目...');
                        startLLMPoll();
                    }
                } else {
                    console.warn('[UOOC助手-AI] UI放置失败，2秒后重试...');
                    setTimeout(function() { placeComponents(); }, 2000);
                }
            }, 800);
            // 延迟检测: iframe 可能稍后加载完毕
            setTimeout(function() {
                if (isQuizPage()) {
                    console.log('[UOOC助手-AI] iframe 测评已加载，确保UI已放置');
                    if (!document.getElementById('checkbox-container')) {
                        placeComponents();
                        showQuizPageHint();
                    }
                }
            }, 3000);
            return;
        }

        // 视频学习页面
        // 不再阻塞等待 jQuery — 新页面可能不加载 jQuery
        // ckeckTestIgnorable 已改为使用原生 fetch
        console.log('[UOOC助手] jQuery可用:', typeof $ !== 'undefined');
        ckeckTestIgnorable();

        function waitHead() {
            console.log('[UOOC助手] 等待头部元素...');

            // 尝试多个可能的头部选择器 (新旧页面兼容)
            // 旧页面: .learn-head | 新页面: newlearn-head, .newlearn_head
            var head = document.querySelector('.learn-head') ||
                       document.querySelector('.learn-header') ||
                       document.querySelector('.header') ||
                       document.querySelector('.control-panel') ||
                       document.querySelector('newlearn-head') ||
                       document.querySelector('.newlearn_head');

            if (head) {
                console.log('[UOOC助手] 找到头部元素，开始放置组件');
                var uiSuccess = placeComponents();
                if (uiSuccess) {
                    bindChapterChange();

                    function ready() {
                        console.log('[UOOC助手] UOOC assistant beta has initialized.');

                        // 检查LLM启用状态和配置
                        if (window.llmEnabled) {
                            const config = LLMConfig.get();
                            if (!config || !config.baseUrl || !config.apiKey) {
                                console.log('[UOOC助手] LLM已启用但未配置API');
                                setTimeout(function() {
                                    alert('LLM答题功能已启用，但尚未配置API参数！\n\n请点击⚙️图标进行配置。');
                                    LLMConfig.showConfigUI();
                                }, 1000);
                            } else {
                                console.log('[UOOC助手] LLM配置正常，已准备就绪');
                            }
                        }

                        start();
                    }

                    // 检测视频元素是否存在 (支持新旧页面)
                    if (document.getElementById('player_html5_api') ||
                        document.querySelector('video.vjs-tech') ||
                        document.querySelector('video')) {
                        ready();
                    } else {
                        // 新页面可能需要点击视频任务行才加载播放器。
                        // 只点"未看完的视频任务行"——绝不点知识点标题行:
                        // 点标题会导航到知识点落地页, 播放器永远出不来
                        var videoItem = null;
                        var taskRows = document.querySelectorAll('.basic[ng-click*="goSource"]');
                        for (var tI = 0; tI < taskRows.length; tI++) {
                            if (taskRows[tI].querySelector('[class*="icon-video"], [class*="video"]') && !taskRows[tI].classList.contains('complete')) {
                                videoItem = taskRows[tI];
                                break;
                            }
                        }
                        if (videoItem) {
                            console.log('[UOOC助手] 点击未看完的视频任务行:', (videoItem.innerText || '').trim().substring(0, 20));
                            videoItem.click();
                            // 延迟检查，SPA异步渲染
                            var videoReadyAttempts = 0;
                            var checkVideoReady = function() {
                                videoReadyAttempts++;
                                if (document.getElementById('player_html5_api') ||
                                    document.querySelector('video.vjs-tech') ||
                                    document.querySelector('video')) {
                                    ready();
                                } else if (videoReadyAttempts < 20) {
                                    setTimeout(checkVideoReady, 300);
                                } else {
                                    console.log('[UOOC助手] 超时未找到视频元素，脚本已初始化但播放器可能尚未就绪');
                                    start();
                                }
                            };
                            setTimeout(checkVideoReady, 300);
                        } else {
                            console.log('[UOOC助手] 未找到视频元素/图标，脚本进入监听模式');
                            // 脚本已初始化，2倍速模块会在视频加载后自动应用
                            start();
                        }
                    }
                }
            } else {
                // 超过一定时间后仍找不到头部元素，创建fallback
                var elapsedAttempts = (window.__initAttemptCount || 0) + 1;
                window.__initAttemptCount = elapsedAttempts;

                if (elapsedAttempts > 20) {
                    console.warn('[UOOC助手] 经过多次尝试仍未找到头部元素，创建fallback容器');
                    placeComponents();
                    bindChapterChange();
                    start();
                } else {
                    setTimeout(waitHead, 250);
                }
            }
        }
        waitHead();
    }

    // ==================== 倍速自动应用模块 (合并自uooc-2x) ====================
    // 确保所有视频元素自动应用滑条所选倍速 (2~4x); 倍速复选框未勾选时不强制
    const VIDEO_SELECTOR_2X = "video#player_html5_api.vjs-tech, video.vjs-tech";
    const MEDIA_EVENTS_2X = ["loadedmetadata", "loadeddata", "canplay", "loadstart", "play", "ratechange"];
    const boundVideos = new WeakSet();

    const getVideos = () => Array.from(document.querySelectorAll(VIDEO_SELECTOR_2X));

    const applyRate = (video) => {
        var rateBox = document.getElementById('rate');
        if (!rateBox || !rateBox.checked) return;
        var target = getUoocRate();
        if (video.playbackRate === target) return;
        video.playbackRate = target;

        const videojsApi = window.videojs;
        if (!videojsApi || typeof videojsApi.getPlayer !== "function") return;

        const player = videojsApi.getPlayer(video.id);
        if (player && typeof player.playbackRate === "function") {
            player.playbackRate(target);
        }
    };

    const bindVideo2x = (video) => {
        if (boundVideos.has(video)) return;
        boundVideos.add(video);
        const apply = () => applyRate(video);
        for (const eventName of MEDIA_EVENTS_2X) {
            video.addEventListener(eventName, apply);
        }
    };

    const applyToAllVideos = () => {
        for (const video of getVideos()) {
            bindVideo2x(video);
            applyRate(video);
        }
    };

    const observer2x = new MutationObserver(applyToAllVideos);
    observer2x.observe(document.documentElement, { childList: true, subtree: true });

    let resumeWhenVisible = false;
    document.addEventListener("visibilitychange", () => {
        const videos = getVideos();

        if (document.visibilityState === "hidden") {
            resumeWhenVisible = videos.some((video) => !video.paused && !video.ended);
            return;
        }

        applyToAllVideos();
        if (!resumeWhenVisible) return;

        resumeWhenVisible = false;
        for (const video of videos) {
            applyRate(video);
            if (!video.paused || video.ended) continue;

            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === "function") {
                void playPromise.catch(() => undefined);
            }
        }
    });

    window.addEventListener("pageshow", applyToAllVideos);

    // 延迟应用2倍速（等待视频元素加载）
    setTimeout(applyToAllVideos, 1000);

    // ==================== 初始化 ====================

    // 不使用window.onload，直接执行
    console.log('[UOOC助手] 脚本已加载，等待页面就绪');
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();