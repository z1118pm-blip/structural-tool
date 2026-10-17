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
}

function sweepStop(){
  if(S.sweep.rafId){
    cancelAnimationFrame(S.sweep.rafId);
    S.sweep.rafId = null;
  }
  S.sweep.playing = false;
  sweepUpdatePlayBtn();
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

  const tick = (now) => {
    if(!S.sweep.playing) return;

    const row = document.getElementById('row-'+key);
    if(row && row.classList.contains('is-disabled')){
      sweepStop();
      return;
    }

    let t = (now - S.sweep.t0) / SWEEP_DUR;
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
  if(btnPlay)  btnPlay.addEventListener('click', sweepToggle);
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
    btn.title = '录制为视频（自动选 mp4 / webm，再点一次取消）';
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
  // 录制时锁定左侧所有滑块和分段按钮，防止用户误触中断录制
  const leftCol = document.getElementById('leftCol');
  if(leftCol){
    leftCol.querySelectorAll('input, .seg button').forEach(el => {
      el.disabled = locked;
    });
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