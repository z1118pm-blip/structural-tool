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
}

function sweepStop(){
  if(S.sweep.rafId){
    cancelAnimationFrame(S.sweep.rafId);
    S.sweep.rafId = null;
  }
  const wasPlaying = S.sweep.playing;
  S.sweep.playing = false;
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
  const el = document.getElementById(key);
  if(!el) return;
  sweepSetValue(key, parseFloat(el.min));
  run();
}

function sweepPlay(loop){
  if(S.sweep.playing) return; // 防重入：如果已在播放，直接忽略
  const key = S.sweep.param;
  const el  = document.getElementById(key);
  if(!el) return;

  const rowEl = document.getElementById('row-'+key);
  if(rowEl && rowEl.classList.contains('is-disabled')) return;

  const min = parseFloat(el.min);
  const max = parseFloat(el.max);
  const cur = parseFloat(el.value);
  const startVal = (max - cur < 1e-9) ? min : cur;
  const span = max - startVal;

  S.sweep.startVal = startVal;
  S.sweep.span     = span;
  S.sweep.t0       = performance.now();
  S.sweep.playing  = true;
  S.sweep.loop     = loop !== false;
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
        S.sweep.startVal = min;
        S.sweep.span     = max - min;
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
      S.sweep.playing = false;
      S.sweep.rafId   = null;
      sweepUpdatePlayBtn();
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
  for(const id of ['btn-reset','btn-help','btn-share','btn-tip']){
    const el = document.getElementById(id);
    if(el) el.disabled = locked;
  }
  // 游戏侧边按钮是 <a>，无 disabled 属性，用类切换视觉禁用；实际拦截在 click 监听里
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
  document.querySelectorAll('.spanEditToggle, .spanEditClear').forEach(el => {
    el.disabled = locked;
  });
  document.querySelectorAll('.spanEditBox input[type=range]').forEach(el => {
    el.disabled = locked;
  });
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
  sweepReset();

  let recorder;
  try{
    const stream = src.captureStream(30);
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 6_000_000
    });
  }catch(e){
    R.active  = false;
    S.lightBg = false;
    run();
    alert('录制初始化失败：' + e.message);
    return;
  }

  recorder.ondataavailable = e => {
    if(e.data && e.data.size > 0) R.chunks.push(e.data);
  };
  recorder.onstop = () => {
    const wasCancelled = R.cancel;
    const chunks      = R.chunks;
    const finalMime   = R.mime;
    const scope       = R.scope;

    R.active   = false;
    R.cancel   = false;
    R.chunks   = [];
    R.recorder = null;

    S.lightBg = false;
    document.body.classList.remove('recording');
    run();

    updateRecBtn();
    setSweepLocked(false);

    if(wasCancelled){
      console.log('[rec] 已取消，未保存');
      return;
    }
    if(!chunks.length){
      alert('录制未产生数据（可能时长过短）。');
      return;
    }
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
  };

  R.recorder = recorder;

  updateRecBtn();
  setSweepLocked(true);

  recorder.start(100);

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
  R.active = false;

  sweepStop();

  if(R.recorder && R.recorder.state !== 'inactive'){
    try{ R.recorder.stop(); }catch(e){ /* 忽略 */ }
  }
}

(function bindRec(){
  const btn = document.getElementById('btnSweepRec');
  const sel = document.getElementById('sweepRecScope');
  if(sel) S.rec.scope = sel.value;
  if(btn) btn.addEventListener('click', startRecording);
  if(sel) sel.addEventListener('change', ()=>{ S.rec.scope = sel.value; });
})();