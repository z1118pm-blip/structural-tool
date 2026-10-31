"use strict";

const SWEEP_DUR = 3000;   /* 单程时长，ms */

function sweepUpdatePlayBtn(){
  const btn = document.getElementById('btnSweepPlay');
  if(!btn) return;
  if(S.sweep.playing){
    btn.textContent = '■ 停止';
    btn.classList.add('playing');
    btn.title = S.sweep.loop ? '停止循环播放' : '暂停';
  } else {
    btn.textContent = '▶ 播放';
    btn.classList.remove('playing');
    btn.title = '循环播放（再点一次停止）';
  }
}

function sweepSetValue(key, v){
  /* 沉降与转角扫掠，代理到 supportMap 上 */
  if (key === 'settleDy' || key === 'supportRot0') {
    if (!S.supportMap) S.supportMap = {};
    if (!S.supportMap['0']) S.supportMap['0'] = {};
    
    if (key === 'settleDy') {
      v = Math.max(-100, Math.min(100, v));
      /* S.settleDy 仅为兼容旧分享链接/旧逻辑保留，solve 不读此字段；
         真正驱动计算的是 supportMap['0'].dy。 */
      S.settleDy = v;
      S.supportMap['0'].dy = v;
    } else if (key === 'supportRot0') {
      v = Math.max(-10, Math.min(10, v)); // v 是扫掠的 mrad
      S.supportMap['0'].rot = v / 1000;
    }
    
    // 直接更新左侧面板对应 UI，不触发整块重绘以防滑块卡顿
    if (key === 'settleDy') {
      const input = document.querySelector(`.supportDyRange[data-col="0"]`);
      const out = document.getElementById('v-support-dy-0');
      if(input) { input.value = v; updateRangeProgress(input); }
      if(out) out.textContent = v.toFixed(0);
    } else {
      const input = document.querySelector(`.supportRotRange[data-col="0"]`);
      const out = document.getElementById('v-support-rot-0');
      if(input) { 
        input.value = v; // mrad 直接对应滑块值
        updateRangeProgress(input); 
      }
      if(out) out.textContent = v.toFixed(2) + ' mrad (' + (v * 0.0572958).toFixed(2) + '°)';
    }
    
    // 同步进度条
    const progEl = document.getElementById('sweepProgress');
    const progOut = document.getElementById('v-sweepProgress');
    if(progEl) {
      progEl.min = key === 'settleDy' ? -100 : -10;
      progEl.max = key === 'settleDy' ? 100 : 10;
      progEl.step = key === 'settleDy' ? 1 : 0.1;
      progEl.value = v;
      updateRangeProgress(progEl);
    }
    if(progOut) progOut.textContent = key === 'settleDy' ? v.toFixed(0) + ' mm' : v.toFixed(2) + ' mrad (' + (v * 0.0572958).toFixed(2) + '°)';
    return;
  }

  const el = document.getElementById(key);
  if(!el) return;
  const min = parseFloat(el.min);
  const max = parseFloat(el.max);
  v = Math.max(min, Math.min(max, v));
  el.value = v;
  S[key] = v;
  const out = document.getElementById('v-'+key);
  if(out && fmtMap[key]) out.textContent = fmtMap[key](v);
  updateRangeProgress(el);

  // 扫掠播放时同步另一侧的镜像滑块
  if (key === 'betaF' || key === 'betaJ') {
    const elD = document.getElementById(key + '_d');
    if (elD) {
      elD.value = v;
      const outD = document.getElementById('v-' + key + '_d');
      if (outD) outD.textContent = v.toFixed(2);
      updateRangeProgress(elD);
    }
  }

  // 同步扫掠进度条
  const progEl = document.getElementById('sweepProgress');
  const progOut = document.getElementById('v-sweepProgress');
  if(progEl) {
    progEl.min = el.min;
    progEl.max = el.max;
    progEl.step = el.step;
    progEl.value = v;
    updateRangeProgress(progEl);
  }
  if(progOut && fmtMap[key]) {
    progOut.textContent = fmtMap[key](v);
  }

  // 静默展开对应参数所在的折叠面板（不切换 Tab）
  // 说明：原来这里会 tabBtn.click() 强制切 Tab。由于 sweepSetValue 在播放期间
  // 每帧都会被 tick() 调用，一旦触发 click 会反复触发，导致 Tab 闪烁，且会打断
  // 用户在「自检」Tab 里对扫掠过程的观察。现在只展开 <details>，不动 Tab。
  if(S.sweep.playing) {
    const isModelParam = ['L1','L2','L3','h1','h2','h3','Lc','bc','hc','bb','hb','r','As','braceI'].includes(key);
    const isLoadParam  = ['q1','q2','q3','qc1','qc2','qc3','H1','H2','H3','P1','P2','P3','tempAll','tempGrad','settleDy','betaF','betaJ'].includes(key);

    const openDetails = (id) => { 
      const el = document.getElementById(id); 
      if(el && !el.open) el.open = true; 
    };

    if (isModelParam) {
      if (key === 'As' || key === 'braceI') openDetails('details-model-brace');
      else if (['bc','hc','bb','hb','r'].includes(key)) openDetails('details-model-mat');
      else openDetails('details-model-topo');
    } else if (isLoadParam) {
      if (['tempAll','tempGrad','settleDy'].includes(key)) openDetails('details-load-other');
      else if (['H1','H2','H3'].includes(key)) openDetails('details-load-horz');
      else openDetails('details-load-vert');
    }
  }
}

function sweepStop(){
  if(S.sweep.rafId){
    cancelAnimationFrame(S.sweep.rafId);
    S.sweep.rafId = null;
  }
  const wasPlaying = S.sweep.playing;
  S.sweep.playing = false;
  document.getElementById('chartForce')?.classList.remove('sweeping');
  document.getElementById('chartDeform')?.classList.remove('sweeping');
  sweepUpdatePlayBtn();
  /* 扫掠期间跳过了刚度分解（额外 2 次 analyze 会拖慢帧率）；
     停止后异步补一次完整计算 */
  if(wasPlaying && typeof scheduleRender === 'function'){
    scheduleRender();
  }
}

function sweepReset(){
  sweepStop();
  const key = S.sweep.param;
  /* settleDy / supportRot0 没有对应的 <input id=...>，
     必须走 sweepSetValue 的代理分支（写 supportMap['0']）。 */
  if(key === 'settleDy' || key === 'supportRot0'){
    sweepSetValue(key, key === 'settleDy' ? -100 : -10);
    run();
    return;
  }
  const el = document.getElementById(key);
  if(!el) return;
  sweepSetValue(key, parseFloat(el.min));
  run();
}

function sweepPlay(loop, forcedRange){
  if(S.sweep.playing) return; // 防重入：如果已在播放，直接忽略
  if(typeof movingLoadStop === 'function') movingLoadStop();
  
  // 修复：如果在延迟启动的间隙用户关闭了扫掠条，拒绝启动
  const bar = document.getElementById('sweepBar');
  if(bar && !bar.classList.contains('on')) return;

  S.probe = { elIndex: null, xRatio: 0.5 }; // 扫掠开始时清空探针，防止索引失效
  const key = S.sweep.param;
  
  let min, max, cur;
  if (key === 'settleDy' || key === 'supportRot0') {
    min = key === 'settleDy' ? -100 : -10;
    max = key === 'settleDy' ? 100 : 10;
    const colEntry = (S.supportMap && S.supportMap['0']) || {};
    if (key === 'settleDy') {
      cur = colEntry.dy || 0;
    } else {
      cur = (colEntry.rot || 0) * 1000; // rad 转成 mrad
    }
  } else {
    const el = document.getElementById(key);
    if(!el) return;
    min = parseFloat(el.min);
    max = parseFloat(el.max);
    cur = parseFloat(el.value);
  }

  const rowEl = document.getElementById('row-'+key);
  if(rowEl && rowEl.classList.contains('is-disabled')) return;
  S.sweep.forcedMin = (forcedRange && forcedRange[0] != null) ? forcedRange[0] : min;
  S.sweep.forcedMax = (forcedRange && forcedRange[1] != null) ? forcedRange[1] : max;

  // 如果传入了强制区间（如自检卡），则第一圈必须立刻使用强制区间的起点和跨度
  if (forcedRange && forcedRange[0] != null && forcedRange[1] != null) {
    S.sweep.startVal = S.sweep.forcedMin;
    S.sweep.span     = S.sweep.forcedMax - S.sweep.forcedMin;
  } else {
    // 正常手动播放，从当前滑块值开始
    const startVal = (max - cur < 1e-9) ? min : cur;
    S.sweep.startVal = startVal;
    S.sweep.span     = max - startVal;
  }

  S.sweep.t0       = performance.now();
  S.sweep.playing  = true;
  S.sweep.loop     = loop !== false;
  document.getElementById('chartForce')?.classList.add('sweeping');
  document.getElementById('chartDeform')?.classList.add('sweeping');

  sweepUpdatePlayBtn();

  /* 播放时长倍率：默认 1（3s 单程）；自检场景设为 2（6s 单程，放慢一倍） */
  const DUR = SWEEP_DUR * (S.sweep.durMul || 1);

  const tick = (now) => {
    if(!S.sweep.playing) return;

    const row = document.getElementById('row-'+key);
    if(row && row.classList.contains('is-disabled')){
      sweepStop();
      return;
    }

    let t = (now - S.sweep.t0) / DUR;
    if(t >= 1){
      if(S.sweep.loop){
        S.sweep.startVal = S.sweep.forcedMin; // 使用强制区间最小值
        S.sweep.span     = S.sweep.forcedMax - S.sweep.forcedMin;
        S.sweep.t0       = now;
        t = 0;
      } else {
        t = 1;
      }
    }

    const v = S.sweep.startVal + S.sweep.span * t;
    sweepSetValue(key, v);
    run();

    if(S.sweep.loop || t < 1){
      S.sweep.rafId = requestAnimationFrame(tick);
    } else {
      /* 自然结束走统一收尾，确保最后一次 run() 之后补算刚度分解/P-Δ，
         避免读数永久停在"扫掠中"。 */
      sweepStop();
    }
  };
  S.sweep.rafId = requestAnimationFrame(tick);
}

function sweepToggle(){
  if(S.sweep.playing) sweepStop();
  else                sweepPlay();
}

(function bindSweep(){
  const bar      = document.getElementById('sweepBar');
  const btnBar   = document.getElementById('btn-sweep');
  const btnClose = document.getElementById('btnSweepClose');
  const btnPlay  = document.getElementById('btnSweepPlay');
  const btnReset = document.getElementById('btnSweepReset');
  const sel      = document.getElementById('sweepParam');
  if(!bar || !btnBar || !sel) return;

  S.sweep.param = sel.value;

  /* 动态注入扫掠进度滑块 */
  let progRow = document.getElementById('sweepProgressRow');
  if(!progRow){
    progRow = document.createElement('div');
    progRow.className = 'sweepRow';
    progRow.id = 'sweepProgressRow';
    progRow.style.marginBottom = '2px';
    progRow.innerHTML = `
      <input type="range" id="sweepProgress" style="flex:1; height:4px; margin:0 8px 0 2px;" value="0">
      <b id="v-sweepProgress" style="font-size:11px; font-weight:600; width:52px; text-align:right; color:#38bdf8; font-variant-numeric:tabular-nums;">—</b>
    `;
    const btnRow = bar.querySelector('.sweepRow.btns');
    if(btnRow) bar.insertBefore(progRow, btnRow);
    else bar.appendChild(progRow);
  }
  
  const progEl = document.getElementById('sweepProgress');
  const progOut = document.getElementById('v-sweepProgress');
  
  let progRaf = null;
  progEl.addEventListener('input', ()=>{
    if(S.sweep.playing) sweepStop();
    const v = parseFloat(progEl.value);
    const key = S.sweep.param;
    sweepSetValue(key, v);
    // 进度条独立走自己的 rAF，避免与主滑块 dragRaf 互相抢占导致偶发一帧迟滞
    if(progRaf) return;
    progRaf = requestAnimationFrame(()=>{
      progRaf = null;
      if(typeof run === 'function') run();
    });
  });

  const openSweep = () => {
    bar.classList.add('on');
    btnBar.classList.add('on');
    sweepReset();
  };
  const closeSweep = () => {
    sweepStop();
    bar.classList.remove('on');
    btnBar.classList.remove('on');
  };

  btnBar.addEventListener('click', ()=>{
    if(bar.classList.contains('on')) closeSweep();
    else                             openSweep();
  });
  if(btnClose) btnClose.addEventListener('click', closeSweep);
  if(btnPlay)  btnPlay.addEventListener('click', ()=>{
    /* 手动点播放时恢复默认速度，避免沿用自检的慢放倍率 */
    S.sweep.durMul = 1;
    sweepToggle();
  });
  if(btnReset) btnReset.addEventListener('click', sweepReset);

  sel.addEventListener('change', ()=>{
    sweepStop();
    S.sweep.param = sel.value;
    sweepReset();
  });
})();

function updateRecBtn(){
  const btn = document.getElementById('btnSweepRec');
  if(!btn) return;
  if(S.rec.active){
    btn.textContent = '■ 录制中';
    btn.classList.add('rec');
    btn.title = '再点一次取消（不保存）';
  }else{
    btn.textContent = '⬇ 录制';
    btn.classList.remove('rec');
    btn.title = '录制为视频（自动选 mp4 / webm，建议单次不超过 60 秒，再点一次取消）';
  }
}

function setSweepLocked(locked){
  for(const id of [
    'sweepParam','sweepRecScope',
    'btnSweepPlay','btnSweepReset',
    'btnSweepClose','btn-sweep'
  ]){
    const el = document.getElementById(id);
    if(el) el.classList.toggle('sweepLocked', locked);
  }
  // 录制时锁定左侧所有滑块、下拉和分段按钮，防止用户误触中断录制
  const leftCol = document.getElementById('leftCol');
  if(leftCol){
    leftCol.querySelectorAll('input, select, .seg button').forEach(el => {
      el.disabled = locked;
    });
  }
  // 底栏按钮（保留 btnSweepRec 可点，它是取消录制入口）
  // 注意：btn-tip 已经移到顶部，这里一并禁用
  for(const id of ['btn-reset','btn-help','btn-share','btn-tip']){
    const el = document.getElementById(id);
    if(el) el.disabled = locked;
  }
  // 游戏入口是 <a>，无 disabled 属性，用类切换视觉禁用
  const gameBtn = document.getElementById('gameSideBtn');
  if(gameBtn) gameBtn.classList.toggle('is-locked', locked);
  // 右侧 chartBar 内所有 slider（拖动会触发 sweepStop 中断录制）
  document.querySelectorAll('#stage input[type=range]').forEach(el => {
    el.disabled = locked;
  });

  /* ===== 录制锁定补强：右侧图表工具条 + 支撑网格 + 逐跨编辑器 =====
     这些控件点击都会触发 run()，录制画面会突变但录制不会停止。
     - 右侧 segMini 按钮是 <button>，直接 disabled；
     - 支撑网格是 <div>，用 pointer-events 拦截（事件委托层另有一道保险）；
     - 逐跨编辑器按钮是 <button>，已插入的 input 直接 disabled；
       录制中动态展开的新 input 在 renderSpanEditors / renderPSpanEditors 里按 S.rec.active 处理。 */
  document.querySelectorAll('#stage .segMini button, #chartForce .tagBar button, #chartDeform .tagBar button').forEach(el => {
    el.disabled = locked;
  });
  const braceWrap = document.getElementById('braceGridWrap');
  if(braceWrap) braceWrap.style.pointerEvents = locked ? 'none' : '';
  const removeWrap = document.getElementById('removeBeamGridWrap');
  if(removeWrap) removeWrap.style.pointerEvents = locked ? 'none' : '';
  document.querySelectorAll('.spanEditToggle, .spanEditClear').forEach(el => {
    el.disabled = locked;
  });

  /* 锁定顶部右侧的显示模式切换，防止录制中画面布局突变 */
  document.querySelectorAll('#stageModeBar button').forEach(el => {
    el.disabled = locked;
  });
  document.querySelectorAll('.spanEditBox input[type=range]').forEach(el => {
    el.disabled = locked;
  });

  /* 自检卡片是 div，不会被 disabled 覆盖，需要单独拦截点击 */
  document.querySelectorAll('.selfTestCard').forEach(el => {
    el.style.pointerEvents = locked ? 'none' : '';
    el.style.opacity = locked ? '0.5' : '';
  });
}

/* 统一收尾：正常停止、取消、构造失败、启动失败、运行错误、stop() 异常，
   全部经过此函数，幂等。 */
function _finalizeRecording(exportData){
  const R = S.rec;
  if(R.finalized) return;
  R.finalized = true;

  /* 显式停止捕获轨道，防止流泄漏 */
  if(R.stream){
    try{ R.stream.getTracks().forEach(t => t.stop()); }catch(e){}
    R.stream = null;
  }

  const shouldSave = !!exportData && !R.cancel && R.chunks && R.chunks.length > 0;
  const chunks = R.chunks || [];
  const finalMime = R.mime || '';
  const scope = R.scope;

  R.active   = false;
  R.recorder = null;
  R.chunks   = [];
  R.cancel   = false;

  S.lightBg = false;
  document.body.classList.remove('recording');
  sweepStop();
  try{ run(); }catch(e){ console.error('[rec] finalize run 失败:', e); }

  updateRecBtn();
  setSweepLocked(false);

  if(shouldSave){
    try{
      const blob = new Blob(chunks, { type: finalMime });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const ts   = new Date().toISOString()
                       .replace(/[:T]/g,'-').replace(/\..+$/,'');
      const ext  = finalMime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
      a.href = url;
      a.download = `sweep_${S.sweep.param}_${scope}_${ts}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url), 2000);
      console.log(`[rec] 已保存 ${a.download}  (${(blob.size/1024).toFixed(0)} KB)`);
    }catch(e){
      console.error('[rec] 保存失败:', e);
      alert('录制保存失败：' + e.message);
    }
  } else if(!exportData){
    console.log('[rec] 已取消或异常中止，未保存');
  }
}

function startRecording(){
  const R = S.rec;
  if(R.active){
    R.cancel = true;
    stopRecording();
    return;
  }
  if(!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream){
    alert('当前浏览器不支持 canvas 录制，请使用 Chrome / Edge / Firefox。');
    return;
  }

  const canvasId = { force:'cvForce', deform:'cvD' }[R.scope] || 'cvForce';
  const src = document.getElementById(canvasId);
  if(!src || !src.width || !src.offsetWidth){
    alert('目标图形当前不可见（可能被显示模式隐藏），无法录制。');
    return;
  }

  let mime = '';
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1.4D401E',
    'video/mp4;codecs=avc1',
    'video/mp4;codecs=h264',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  for(const m of candidates){
    try{
      if(MediaRecorder.isTypeSupported(m)){ mime = m; break; }
    }catch(e){ /* 忽略非法 mime */ }
  }
  if(!mime){
    alert('当前浏览器不支持 mp4 / webm 录制，请使用 Chrome 124+ / Edge 124+ / Safari 14.1+。');
    return;
  }

  R.mime   = mime;
  R.chunks = [];
  R.cancel = false;

  R.active  = true;
  S.lightBg = true;
  S.sweep.durMul = 1;
  document.body.classList.add('recording');

  let recorder;
  let stream = null;
  try{
    sweepReset();   /* 移入 try：异常时走现有 catch 里的统一收尾 */
    stream = src.captureStream(30);
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 6_000_000
    });
  }catch(e){
    if(stream){ try{ stream.getTracks().forEach(t => t.stop()); }catch(_){} }
    R.finalized = true; // 尚未真正开始，标记已终结以避免二次收尾
    R.active  = false;
    S.lightBg = false;
    document.body.classList.remove('recording');
    try{ run(); }catch(_){}
    updateRecBtn();
    setSweepLocked(false);
    alert('录制初始化失败：' + e.message);
    return;
  }

  R.stream    = stream;
  R.finalized = false;

  recorder.ondataavailable = e => {
    if(e.data && e.data.size > 0) R.chunks.push(e.data);
  };
  recorder.onstop  = () => _finalizeRecording(true);
  recorder.onerror = (e) => {
    console.error('[rec] MediaRecorder error:', e);
    _finalizeRecording(false);
  };

  R.recorder = recorder;

  updateRecBtn();
  setSweepLocked(true);

  try{
    recorder.start(100);
  }catch(e){
    console.error('[rec] start 失败:', e);
    alert('录制启动失败：' + e.message);
    _finalizeRecording(false);
    return;
  }

  setTimeout(()=>{
    if(!R.active) return;
    sweepPlay(false);

    const waitDone = () => {
      if(!R.active) return;
      if(S.sweep.playing){
        requestAnimationFrame(waitDone);
      }else{
        setTimeout(()=>{
          if(R.active) stopRecording();
        }, 500);
      }
    };
    requestAnimationFrame(waitDone);
  }, 120);
}

function stopRecording(){
  const R = S.rec;
  if(!R.active) return;

  sweepStop();

  if(R.recorder && R.recorder.state !== 'inactive'){
    try{
      R.recorder.stop(); // 正常触发 onstop → _finalizeRecording(true)
    }catch(e){
      /* stop() 抛异常时 onstop 不会触发，必须兜底收尾 */
      _finalizeRecording(false);
    }
  } else {
    /* recorder 已失效或未创建 */
    _finalizeRecording(false);
  }
}

(function bindRec(){
  const btn = document.getElementById('btnSweepRec');
  const seg = document.getElementById('sweepRecScope');
  
  if(seg) {
    const btns = seg.querySelectorAll('button');
    // 初始化
    const active = seg.querySelector('.on');
    if(active) S.rec.scope = active.dataset.scope;
    
    // 监听按钮切换
    btns.forEach(b => {
      b.addEventListener('click', () => {
        btns.forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        S.rec.scope = b.dataset.scope;
      });
    });
  }
  
  if(btn) btn.addEventListener('click', startRecording);
})();