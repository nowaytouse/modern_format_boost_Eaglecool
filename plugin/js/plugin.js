const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PLUGIN_ROOT = path.dirname(decodeURIComponent(new URL(window.location.href).pathname));
const BIN_IMG = path.join(PLUGIN_ROOT, 'bin', 'img-hevc');
const BIN_VID = path.join(PLUGIN_ROOT, 'bin', 'vid-hevc');
const spawnEnv = { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` };
const VIDEO_EXTS = new Set(['mp4','mov','mkv','avi','webm','m4v','wmv','flv']);
const $ = id => document.getElementById(id);
let isRunning = false;
let selectedItems = [];
let lang = localStorage.getItem('lang') || 'zh';

// ── i18n ───────────────────────────────────────────────────────
const I = {
  zh: {
    help:'帮助', selectedItems:'选中素材', noSelection:'未选中任何素材',
    refresh:'刷新', params:'处理参数', appleCompat:'Apple 兼容',
    appleDesc:'HEIC 跳过, WebP→HEVC', ultimate:'极限模式',
    ultimateDesc:'SSIM 饱和搜索', force:'强制重转', forceDesc:'忽略已处理标记',
    log:'运行日志', clear:'清空', start:'开始处理', processing:'处理中...',
    noItems:'请先选中素材并点击刷新', selected:'个素材已选中',
    startMsg:'开始处理 {n} 个素材', done:'完成', ok:'成功', skip:'跳过', fail:'失败',
    helpTitle:'关于 Modern Format Boost',
    helpBody:'<ul><li>智能图像优化：JPEG→JXL 无损转码, PNG→JXL 熵编码压缩</li>'
      +'<li>视频 HEVC 转码：三阶段饱和搜索, 硬件加速优先</li>'
      +'<li>Apple 兼容：HEIC/HEIF 原生跳过, 动态 WebP→HEVC</li>'
      +'<li>安全跳过：有损 WebP/AVIF 不做二次压缩, 避免画质损失</li>'
      +'<li>Live Photos 保护：检测 HEIC+MOV 配对, 保持 UUID 关联</li></ul>',
    statusOk:'✅ 转换成功', statusSkip:'⏭ 跳过', statusFail:'❌ 失败',
  },
  en: {
    help:'Help', selectedItems:'Selected Items', noSelection:'No items selected',
    refresh:'Refresh', params:'Parameters', appleCompat:'Apple Compat',
    appleDesc:'Skip HEIC, WebP→HEVC', ultimate:'Ultimate',
    ultimateDesc:'SSIM saturation search', force:'Force', forceDesc:'Ignore processed marks',
    log:'Log', clear:'Clear', start:'Start', processing:'Processing...',
    noItems:'Select items in Eagle first, then click Refresh', selected:'items selected',
    startMsg:'Processing {n} items', done:'Done', ok:'OK', skip:'Skipped', fail:'Failed',
    helpTitle:'About Modern Format Boost',
    helpBody:'<ul><li>Smart image optimization: JPEG→JXL lossless, PNG→JXL entropy coding</li>'
      +'<li>Video HEVC transcoding: 3-phase saturation search, HW accel priority</li>'
      +'<li>Apple compat: skip native HEIC/HEIF, animated WebP→HEVC</li>'
      +'<li>Safe skip: no re-compression on lossy WebP/AVIF to prevent quality loss</li>'
      +'<li>Live Photos protection: detect HEIC+MOV pairs, preserve UUID linkage</li></ul>',
    statusOk:'✅ Converted', statusSkip:'⏭ Skipped', statusFail:'❌ Failed',
  }
};
const t = k => I[lang][k] || k;

function updateSelInfo() {
    const n = selectedItems.length;
    $('sel-info').innerHTML = n
        ? `<span class="count">${n}</span><span class="label">${t('selected')}</span>`
        : `<span class="label">${t('noSelection')}</span>`;
}

function applyLang() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const k = el.dataset.i18n;
        if (I[lang][k]) el.textContent = I[lang][k];
    });
    $('btn-lang').textContent = lang === 'zh' ? 'EN' : '中文';
    updateSelInfo();
    updateHelpPanel();
}

// ── Window controls ────────────────────────────────────────────
$('btn-close').addEventListener('click', () => { try { window.close(); } catch { eagle.window.close(); } });
$('btn-min').addEventListener('click', () => { try { eagle.window.minimize(); } catch {} });

// ── Help panel ─────────────────────────────────────────────────
let helpVisible = false;
function updateHelpPanel() {
    $('help-panel').innerHTML = `<h3>${t('helpTitle')}</h3>${t('helpBody')}`;
}
$('btn-help').addEventListener('click', () => {
    helpVisible = !helpVisible;
    $('help-panel').style.display = helpVisible ? 'block' : 'none';
});

// ── Language toggle ────────────────────────────────────────────
$('btn-lang').addEventListener('click', () => {
    lang = lang === 'zh' ? 'en' : 'zh';
    localStorage.setItem('lang', lang);
    applyLang();
});

// ── Settings ───────────────────────────────────────────────────
const FLAGS = ['f-apple','f-ultimate','f-force'];
const DEFAULTS = { 'f-apple':true, 'f-ultimate':true, 'f-force':false };
function load() {
    FLAGS.forEach(id => {
        const saved = localStorage.getItem(id);
        $(id).checked = saved !== null ? saved === 'true' : DEFAULTS[id];
    });
}
function save() { FLAGS.forEach(id => localStorage.setItem(id, $(id).checked)); }

// ── Eagle selected items ───────────────────────────────────────
async function refreshSelected() {
    try {
        selectedItems = await eagle.item.getSelected();
    } catch {
        selectedItems = [];
    }
    updateSelInfo();
}
$('btn-refresh').addEventListener('click', refreshSelected);

// ── Log ────────────────────────────────────────────────────────
function log(msg) { $('log').value += msg + '\n'; $('log').scrollTop = $('log').scrollHeight; }
$('btn-clear').addEventListener('click', () => { $('log').value = ''; $('stats').textContent = ''; $('status-summary').style.display = 'none'; });

// ── Spawn tool, extract skip reason ────────────────────────────
function runTool(bin, args) {
    return new Promise(resolve => {
        if (!fs.existsSync(bin)) { log(`❌ ${bin}`); return resolve({ ok:false, skipped:false, reason:'' }); }
        let out = '';
        const proc = spawn(bin, args, { env: spawnEnv });
        const onData = d => { const s = d.toString(); out += s; log(s.trimEnd()); };
        proc.stdout.on('data', onData);
        proc.stderr.on('data', onData);
        proc.on('close', code => {
            const skipped = /⏭️|skipping/i.test(out);
            let reason = '';
            const m = out.match(/⏭️\s*(.+?)(?::|$)/m) || out.match(/skipping[^:]*:\s*(.+)/im);
            if (m) reason = m[1].trim().replace(/:.*/,'');
            resolve({ ok: code === 0, skipped, reason });
        });
        proc.on('error', e => { log(`❌ ${e.message}`); resolve({ ok:false, skipped:false, reason:e.message }); });
    });
}

// ── Temp dir helpers ───────────────────────────────────────────
function makeTempDir() {
    const dir = path.join(os.tmpdir(), 'mfb_' + Date.now() + '_' + Math.random().toString(36).slice(2,8));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}
function rmDir(dir) { try { fs.rmSync(dir, { recursive:true, force:true }); } catch {} }
function findOutputFile(dir) {
    try { const f = fs.readdirSync(dir).filter(x => !x.startsWith('.')); return f.length ? path.join(dir, f[0]) : null; }
    catch { return null; }
}

// ── Build CLI args ─────────────────────────────────────────────
function buildArgs(filePath, outputDir) {
    const args = ['run', filePath, '--output', outputDir, '--verbose'];
    if ($('f-apple').checked) args.push('--apple-compat'); else args.push('--no-apple-compat');
    if ($('f-ultimate').checked) args.push('--ultimate');
    if ($('f-force').checked) args.push('--force');
    return args;
}

// ── Process one Eagle item ─────────────────────────────────────
async function processItem(item) {
    const filePath = item.filePath;
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const bin = VIDEO_EXTS.has(ext) ? BIN_VID : BIN_IMG;
    const tmpDir = makeTempDir();

    const { ok, skipped, reason } = await runTool(bin, buildArgs(filePath, tmpDir));
    const outFile = findOutputFile(tmpDir);

    if (skipped || !outFile) {
        rmDir(tmpDir);
        return { status:'skip', file: path.basename(filePath), reason: reason || t('skip') };
    }
    if (ok) {
        const outName = path.basename(outFile);
        try { await item.moveToTrash(); } catch (e) { log(`⚠️ ${e.message}`); }
        try { await eagle.item.addFromPath(outFile); } catch (e) { log(`⚠️ ${e.message}`); }
        rmDir(tmpDir);
        return { status:'ok', file: path.basename(filePath), out: outName };
    }
    rmDir(tmpDir);
    return { status:'fail', file: path.basename(filePath), reason: reason || 'unknown error' };
}

// ── Status summary renderer ────────────────────────────────────
function showSummary(results) {
    const el = $('status-summary');
    const oks = results.filter(r => r.status === 'ok');
    const skips = results.filter(r => r.status === 'skip');
    const fails = results.filter(r => r.status === 'fail');
    let html = '';
    if (oks.length) html += `<div class="s-ok">${t('statusOk')}: ${oks.length}</div>`;
    if (skips.length) {
        html += `<div class="s-skip">${t('statusSkip')}: ${skips.length}</div>`;
        skips.forEach(s => { html += `<div class="s-skip">  · ${s.file} — ${s.reason}</div>`; });
    }
    if (fails.length) {
        html += `<div class="s-fail">${t('statusFail')}: ${fails.length}</div>`;
        fails.forEach(f => { html += `<div class="s-fail">  · ${f.file} — ${f.reason}</div>`; });
    }
    el.innerHTML = html;
    el.style.display = html ? 'block' : 'none';
}

// ── Main run ───────────────────────────────────────────────────
$('btn-run').addEventListener('click', async () => {
    if (isRunning) return;
    if (!selectedItems.length) { log(`❌ ${t('noItems')}`); return; }

    save();
    $('log').value = '';
    $('stats').textContent = '';
    $('status-summary').style.display = 'none';
    isRunning = true;
    $('btn-run').disabled = true;
    $('btn-run').textContent = t('processing');

    log(`🚀 ${t('startMsg').replace('{n}', selectedItems.length)}\n`);
    const results = [];
    for (const item of selectedItems) {
        log(`\n📄 ${path.basename(item.filePath)}`);
        try { results.push(await processItem(item)); }
        catch (e) { results.push({ status:'fail', file: path.basename(item.filePath), reason: e.message }); }
    }

    const okN = results.filter(r => r.status === 'ok').length;
    const total = results.length;
    $('stats').textContent = `${t('done')}: ✅ ${okN} ${t('ok')}  ⏭ ${total - okN} ${t('skip')}`;
    log(`\n${t('done')}: ${okN}/${total}`);
    showSummary(results);

    isRunning = false;
    $('btn-run').disabled = false;
    $('btn-run').textContent = t('start');
});

// ── Init ───────────────────────────────────────────────────────
load();
applyLang();
refreshSelected();
