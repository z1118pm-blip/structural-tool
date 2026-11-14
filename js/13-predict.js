"use strict";

/* =====================================================================
   13. 先猜后算（Predict-then-Reveal）
   交互：出结果前先徒手画 M 图形状 → 揭晓时与真实解叠加 → 宽松评分。
   评分只评形状（符号区段 / 反弯点位置 / 峰值相对大小），不评数值。
   坐标约定：用户笔画纵偏移 v 投影到屏幕法向 n_s=(el.sn, el.cs)，
   与 05-force.js 的绘制方向一致（正弯矩 → v>0），可直接比较符号。
   ===================================================================== */

(function initPredict(){
  /* ---------- 状态（不进 SHARE_KEYS，分享链接天然不携带） ---------- */
  S.predict = {
    phase: 'idle',        // 'idle' | 'draw' | 'reveal'
    target: 'M',
    strokes: {},          // { resIndex: [{t, vr}] }  vr = 纵偏移/杆件屏幕长度
    drawing: false,
    activeRes: -1,
    score: null,
    levelId: null
  };

  let wrap = null, cvs = null, panel = null, hintEl = null;
  let toS = null;         // 当前 overlay 的坐标变换
  let ro  = null;         // ResizeObserver

  const AMBER = '#fbbf24';
  const NP = 61;

  /* ---------- 小工具 ---------- */
  function chartForce(){ return document.getElementById('chartForce'); }
  function cvForce(){ return document.getElementById('cvForce'); }
  function drawableResults(){
    if(!MODEL) return [];
    const out = [];
    MODEL.results.forEach((res, idx)=>{
      if(res.el.kind === 'brace') return; // 支撑为二力杆，M 恒为 0
      out.push(idx);
    });
    return out;
  }
  function elemScreenGeom(res){
    const el = res.el;
    const ni = MODEL.nodes[el.i], nj = MODEL.nodes[el.j];
    const A = toS(ni.x, ni.y), B = toS(nj.x, nj.y);
    const dx = B[0]-A[0], dy = B[1]-A[1];
    const len = Math.hypot(dx, dy) || 1;
    return { A, B, ux: dx/len, uy: dy/len, len,
             nsx: el.sn, nsy: el.cs }; // 屏幕法向（正弯矩方向）
  }
  function pickElement(mx, my, tol){
    let best = -1, bestD = tol;
    for(const idx of drawableResults()){
      const g = elemScreenGeom(MODEL.results[idx]);
      const t = Math.max(0, Math.min(1, ((mx-g.A[0])*g.ux + (my-g.A[1])*g.uy) / g.len));
      const px = g.A[0] + g.ux*t*g.len, py = g.A[1] + g.uy*t*g.len;
      const d = Math.hypot(mx-px, my-py);
      if(d < bestD){ bestD = d; best = idx; }
    }
    return best;
  }

  /* ---------- overlay 构建 / 销毁 ---------- */
  function buildOverlay(){
    const host = chartForce(), base = cvForce();
    if(!host || !base) return false;
    destroyOverlay();

    wrap = document.createElement('div');
    wrap.id = 'predictOverlay';
    cvs = document.createElement('canvas');
    cvs.id = 'cvPredict';
    wrap.appendChild(cvs);

    hintEl = document.createElement('div');
    hintEl.className = 'prdHint';
    wrap.appendChild(hintEl);

    const bar = document.createElement('div');
    bar.className = 'prdBar';
    bar.innerHTML =
      '<button type="button" id="prdSubmit" class="prdBtn prdPrimary">✔ 揭晓答案</button>' +
      '<button type="button" id="prdClear" class="prdBtn">清空</button>' +
      '<button type="button" id="prdExit" class="prdBtn">退出</button>';
    wrap.appendChild(bar);

    panel = document.createElement('div');
    panel.className = 'prdPanel';
    panel.style.display = 'none';
    wrap.appendChild(panel);

    host.appendChild(wrap);
    positionOverlay();
    bindCanvasEvents();

    bar.querySelector('#prdSubmit').addEventListener('click', reveal);
    bar.querySelector('#prdClear').addEventListener('click', ()=>{
      S.predict.strokes = {};
      redrawOverlay();
    });
    bar.querySelector('#prdExit').addEventListener('click', predictExit);

    if(window.ResizeObserver){
      ro = new ResizeObserver(()=>{ positionOverlay(); redrawOverlay(); });
      ro.observe(host);
    }
    return true;
  }
  function destroyOverlay(){
    if(ro){ ro.disconnect(); ro = null; }
    if(wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    wrap = cvs = panel = hintEl = null;
  }
  function positionOverlay(){
    if(!wrap) return;
    const base = cvForce();
    wrap.style.left   = base.offsetLeft + 'px';
    wrap.style.top    = base.offsetTop + 'px';
    wrap.style.width  = base.offsetWidth + 'px';
    wrap.style.height = base.offsetHeight + 'px';
  }

  /* ---------- 界面锁定 / 解锁 ---------- */
  function lockUI(){
    const lc = document.getElementById('leftCol');
    if(lc) lc.classList.add('predict-locked');
    const host = chartForce();
    if(host){
      const tb = host.querySelector('.tagBar');
      if(tb) tb.classList.add('predict-locked');
      const cb = host.querySelector('.chartBar');
      if(cb) cb.classList.add('predict-locked');
    }
    const smb = document.getElementById('stageModeBar');
    if(smb) smb.classList.add('predict-locked');
    const dob = document.getElementById('deformOverlayBox');
    if(dob) dob.classList.add('predict-locked');
    const btnSweep = document.getElementById('btn-sweep');
    if(btnSweep) btnSweep.disabled = true;
  }
  function unlockUI(){
    document.querySelectorAll('.predict-locked').forEach(el=> el.classList.remove('predict-locked'));
    const btnSweep = document.getElementById('btn-sweep');
    if(btnSweep) btnSweep.disabled = false;
  }

  /* ---------- 进入 / 退出 ---------- */
  function predictEnter(opts){
    opts = opts || {};
    if(S.predict.phase !== 'idle') return;
    if(S.rec && S.rec.active){
      if(typeof showToast === 'function') showToast('录制进行中，无法进入先猜后算。');
      return;
    }
    /* 停扫掠 + 关扫掠条 */
    if(S.sweep.playing && typeof sweepStop === 'function') sweepStop();
    const bar = document.getElementById('sweepBar');
    if(bar) bar.classList.remove('on');
    const btnBar = document.getElementById('btn-sweep');
    if(btnBar) btnBar.classList.remove('on');

    /* 强制显示 M 图（首期只支持 M），并保证受力图可见 */
    if(S.forceType !== 'M'){
      S.forceType = 'M';
      document.querySelectorAll('#segForce button').forEach(b=>{
        b.classList.toggle('on', b.dataset.force === 'M');
      });
    }
    if(S.displayMode === 'deform'){
      const b = document.querySelector('#segDisp button[data-disp="force"]');
      if(b) b.click();
    }
    run();
    if(!MODEL) return;

    S.predict.phase = 'draw';
    S.predict.strokes = {};
    S.predict.drawing = false;
    S.predict.activeRes = -1;
    S.predict.score = null;
    S.predict.levelId = opts.levelId || null;

    if(!buildOverlay()){ S.predict.phase = 'idle'; return; }

    /* 提示语：优先关卡自定义 hint */
    let hint = '✏️ 请在内力图画布上<b>徒手画出各杆弯矩图形状</b>（沿杆件描画，自动吸附）；画完点「揭晓答案」。';
    if(S.predict.levelId){
      const lv = (typeof LEVELS !== 'undefined') ? LEVELS.find(l=>l.id===S.predict.levelId) : null;
      if(lv && lv.predict && lv.predict.hint) hint = '✏️ ' + lv.predict.hint;
    }
    hintEl.innerHTML = hint;

    lockUI();
    redrawOverlay();
    if(typeof showToast === 'function')
      showToast('先猜后算：左侧参数已锁定。沿杆件描画你的预测曲线，同杆重画即覆盖。', 8000);
  }
  function predictExit(){
    if(S.predict.phase === 'idle') return;
    S.predict.phase = 'idle';
    S.predict.drawing = false;
    destroyOverlay();
    unlockUI();
    run(); // 恢复真实图（清掉任何视觉残留）
  }
  window.__predictEnter = predictEnter;
  window.__predictExit  = predictExit;

  /* ---------- 手绘捕获 ---------- */
  function bindCanvasEvents(){
    cvs.addEventListener('pointerdown', e=>{
      if(S.predict.phase !== 'draw') return;
      const rect = cvs.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const tol = (e.pointerType === 'touch') ? 60 : 45;
      const idx = pickElement(mx, my, tol);
      if(idx < 0) return;
      e.preventDefault();
      cvs.setPointerCapture(e.pointerId);
      S.predict.drawing = true;
      S.predict.activeRes = idx;
      S.predict.strokes[idx] = [];   // 同杆重画 = 覆盖
      addPoint(idx, mx, my);
      redrawOverlay();
    });
    cvs.addEventListener('pointermove', e=>{
      if(!S.predict.drawing || S.predict.phase !== 'draw') return;
      const rect = cvs.getBoundingClientRect();
      addPoint(S.predict.activeRes, e.clientX - rect.left, e.clientY - rect.top);
      redrawOverlay();
    });
    const finish = ()=>{
      if(!S.predict.drawing) return;
      S.predict.drawing = false;
      const pts = S.predict.strokes[S.predict.activeRes] || [];
      if(pts.length < 2) delete S.predict.strokes[S.predict.activeRes];
      S.predict.activeRes = -1;
      redrawOverlay();
    };
    cvs.addEventListener('pointerup', finish);
    cvs.addEventListener('pointercancel', finish);
  }
  function addPoint(idx, mx, my){
    const g = elemScreenGeom(MODEL.results[idx]);
    let t = ((mx-g.A[0])*g.ux + (my-g.A[1])*g.uy) / g.len;
    t = Math.max(0, Math.min(1, t));
    const ax = g.A[0] + g.ux*t*g.len, ay = g.A[1] + g.uy*t*g.len;
    const vPx = (mx-ax)*g.nsx + (my-ay)*g.nsy;   // 投影到正弯矩法向
    const pts = S.predict.strokes[idx];
    /* 按 t 有序插入，允许来回描 */
    const pt = { t, vr: vPx / g.len };
    let i = pts.length;
    while(i > 0 && pts[i-1].t > t) i--;
    pts.splice(i, 0, pt);
  }

  /* ---------- 绘制 ---------- */
  function redrawOverlay(){
    if(!cvs || !MODEL) return;
    const {ctx, W, H} = setupCanvas(cvs);
    toS = makeTransform(MODEL, W, H, { padL: 70, padT: 90, padR: 70, padB: 36 }).toS;

    if(S.predict.phase === 'draw'){
      /* 不透明背景盖住真实曲线 */
      ctx.fillStyle = S.lightBg ? '#ffffff' : '#1e293b';
      ctx.fillRect(0, 0, W, H);
      drawGrid(ctx, W, H);
      drawHUD(ctx, W, H, 'PREDICT · M');
      /* 骨架 + 支座 + 可画杆件的淡色轴线 */
      drawFrameLines(ctx, MODEL, toS, S.lightBg ? '#94a3b8' : '#475569', 1.5, false, false);
      drawSupports(ctx, MODEL, toS, MODEL.p.betaF, false);
      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(251,191,36,0.25)';
      ctx.lineWidth = 5;
      for(const idx of drawableResults()){
        const g = elemScreenGeom(MODEL.results[idx]);
        ctx.beginPath(); ctx.moveTo(g.A[0], g.A[1]); ctx.lineTo(g.B[0], g.B[1]); ctx.stroke();
      }
      ctx.restore();
    }
    /* reveal 阶段画布透明，真实曲线从下方 cvForce 透出 */

    /* 用户笔画：琥珀色实线 */
    ctx.save();
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(251,191,36,0.45)';
    ctx.shadowBlur = 4;
    for(const key of Object.keys(S.predict.strokes)){
      const idx = +key;
      const pts = S.predict.strokes[key];
      if(!pts || pts.length < 2 || !MODEL.results[idx]) continue;
      const g = elemScreenGeom(MODEL.results[idx]);
      ctx.beginPath();
      pts.forEach((p, i)=>{
        const ax = g.A[0] + g.ux*p.t*g.len, ay = g.A[1] + g.uy*p.t*g.len;
        const x = ax + g.nsx*p.vr*g.len, y = ay + g.nsy*p.vr*g.len;
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- 特征提取与宽松评分 ---------- */
  function resampleStroke(pts){
    const out = new Array(NP + 1);
    for(let k = 0; k <= NP; k++){
      const t = k / NP;
      let i = 0;
      while(i < pts.length - 1 && pts[i+1].t < t) i++;
      const a = pts[i], b = pts[Math.min(i+1, pts.length-1)];
      if(t <= pts[0].t) out[k] = pts[0].vr;
      else if(t >= pts[pts.length-1].t) out[k] = pts[pts.length-1].vr;
      else {
        const span = (b.t - a.t) || 1e-9;
        out[k] = a.vr + (b.vr - a.vr) * (t - a.t) / span;
      }
    }
    return out;
  }
  function extractFeatures(vals){
    let maxAbs = 0;
    for(const v of vals) maxAbs = Math.max(maxAbs, Math.abs(v));
    if(maxAbs < 1e-9) return { flat: true, seq: [], infl: [], peaks: [] };
    const dead = 0.06 * maxAbs;
    /* 符号区段序列（去零 → 压缩连续重复） */
    const seq = [];
    let last = 0;
    for(const v of vals){
      const s = v > dead ? 1 : (v < -dead ? -1 : 0);
      if(s !== 0 && s !== last){ seq.push(s); last = s; }
    }
    /* 反弯点：相邻采样符号翻转处线性插值（归一化坐标） */
    const infl = [];
    for(let k = 0; k < vals.length - 1; k++){
      const a = vals[k], b = vals[k+1];
      if(Math.abs(a) < dead*0.5 || Math.abs(b) < dead*0.5) continue;
      if((a > 0) !== (b > 0)){
        infl.push((k + Math.abs(a)/(Math.abs(a)+Math.abs(b))) / NP);
      }
    }
    /* 区段峰值 */
    const bounds = [0, ...infl, 1];
    const peaks = [];
    for(let s = 0; s < bounds.length - 1; s++){
      const k0 = Math.round(bounds[s]*NP), k1 = Math.round(bounds[s+1]*NP);
      let pk = 0, pkT = (bounds[s]+bounds[s+1])/2;
      for(let k = k0; k <= k1; k++){
        if(Math.abs(vals[k]) > Math.abs(pk)){ pk = vals[k]; pkT = k/NP; }
      }
      if(Math.abs(pk) > dead) peaks.push({ v: pk, t: pkT });
    }
    return { flat: false, seq, infl, peaks, maxAbs };
  }
  function editDist(a, b){
    const m = a.length, n = b.length;
    if(!m) return n; if(!n) return m;
    const dp = Array.from({length: m+1}, (_,i)=>[i, ...new Array(n).fill(0)]);
    for(let j = 0; j <= n; j++) dp[0][j] = j;
    for(let i = 1; i <= m; i++)
      for(let j = 1; j <= n; j++)
        dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1] + (a[i-1]===b[j-1]?0:1));
    return dp[m][n];
  }
  function scoreOneElement(userFeat, trueFeat, elLabel){
    const comments = [];
    if(trueFeat.flat) return null;  // 真实弯矩≈0 的杆不参与评分
    if(userFeat.flat){
      comments.push(elLabel + '：几乎画成了直线——这根杆其实有明显弯矩。');
      return { total: 0, comments };
    }
    /* ① 符号区段序列 50 分 */
    const dist = editDist(userFeat.seq, trueFeat.seq);
    const signSim = Math.max(0, 1 - dist / Math.max(userFeat.seq.length, trueFeat.seq.length));
    const signScore = 50 * signSim;
    if(signSim < 0.5) comments.push(elLabel + '：弯矩正负区段与真实解差异较大。');

    /* ② 反弯点 30 分（数量 + 位置，±0.15 容差） */
    const tI = trueFeat.infl, uI = userFeat.infl.slice();
    let matched = 0;
    for(const ti of tI){
      let bi = -1, bd = 0.15;
      for(let j = 0; j < uI.length; j++){
        const d = Math.abs(uI[j] - ti);
        if(d < bd){ bd = d; bi = j; }
      }
      if(bi >= 0){ matched++; uI.splice(bi, 1); }
    }
    const inflScore = (tI.length + userFeat.infl.length)
      ? 30 * (2*matched) / (tI.length + userFeat.infl.length) : 30;
    if(tI.length !== userFeat.infl.length)
      comments.push(elLabel + '：反弯点数量对不上——你画了 ' + userFeat.infl.length + ' 个，实际 ' + tI.length + ' 个。');
    else if(tI.length > 0 && matched < tI.length)
      comments.push(elLabel + '：反弯点位置有偏差（容差 ±15% 杆长）。');

    /* ③ 峰值 20 分：主峰符号 10 + 次峰/主峰相对比例 10 */
    let peakScore = 0;
    const tP = trueFeat.peaks.slice().sort((a,b)=>Math.abs(b.v)-Math.abs(a.v));
    const uP = userFeat.peaks.slice().sort((a,b)=>Math.abs(b.v)-Math.abs(a.v));
    if(tP.length && uP.length){
      if((tP[0].v > 0) === (uP[0].v > 0)) peakScore += 10;
      else comments.push(elLabel + '：主峰符号画反了——先判断哪侧受拉。');
      if(tP.length >= 2 && uP.length >= 2){
        const rt = Math.abs(tP[1].v)/Math.abs(tP[0].v);
        const ru = Math.abs(uP[1].v)/Math.abs(uP[0].v);
        const err = Math.abs(rt - ru);
        peakScore += err < 0.3 ? 10 : 10 * Math.max(0, 1 - err/0.6);
      } else peakScore += 10; // 单峰对单峰，比例项不扣分
    }
    const total = Math.round(signScore + inflScore + peakScore);
    if(total >= 85) comments.push(elLabel + '：形状判断到位！');
    return { total, comments };
  }

  /* ---------- 揭晓 ---------- */
  function reveal(){
    if(S.predict.phase !== 'draw') return;
    const drawnKeys = Object.keys(S.predict.strokes).filter(k => (S.predict.strokes[k]||[]).length >= 8);
    if(!drawnKeys.length){
      if(typeof showToast === 'function') showToast('还没有有效笔画：请至少沿一根杆件完整描一遍（≥8 个采样点）。');
      return;
    }
    /* 逐杆评分 */
    const per = [];
    const allComments = [];
    for(const key of drawnKeys){
      const idx = +key;
      const res = MODEL.results[idx];
      const userFeat = extractFeatures(resampleStroke(S.predict.strokes[key]));
      const trueVals = [];
      for(let k = 0; k <= NP; k++) trueVals.push(internalAt(res, res.el.L*k/NP, 'M'));
      const trueFeat = extractFeatures(trueVals);
      const elLabel = (res.el.kind === 'col' ? '柱' : '梁') + ' E' + (idx+1);
      const r = scoreOneElement(userFeat, trueFeat, elLabel);
      if(r){ per.push(r.total); allComments.push(...r.comments); }
    }
    /* 漏画关键杆提示：真实峰值超过全局 30% 但未画的杆 */
    let gMax = 0;
    const trueMaxByIdx = {};
    for(const idx of drawableResults()){
      const res = MODEL.results[idx];
      let m = 0;
      for(let k = 0; k <= NP; k++) m = Math.max(m, Math.abs(internalAt(res, res.el.L*k/NP, 'M')));
      trueMaxByIdx[idx] = m; gMax = Math.max(gMax, m);
    }
    const missed = drawableResults().filter(idx =>
      !drawnKeys.includes(String(idx)) && gMax > 0 && trueMaxByIdx[idx] > 0.3*gMax);
    if(missed.length) allComments.push('有 ' + missed.length + ' 根重要杆件没画（弯矩超过全结构 30%）——概念上要"每杆都过一遍"。');

    const total = per.length ? Math.round(per.reduce((a,b)=>a+b,0)/per.length) : 0;
    const stars = total >= 85 ? 3 : (total >= 60 ? 2 : (total >= 35 ? 1 : 0));
    S.predict.score = { total, stars, comments: allComments };
    S.predict.phase = 'reveal';

    /* 隐藏提示，显示评分面板；画布转透明透出真实曲线 */
    if(hintEl) hintEl.style.display = 'none';
    redrawOverlay();
    showPanel();

    const bar = wrap.querySelector('.prdBar');
    if(bar){
      bar.querySelector('#prdSubmit').style.display = 'none';
      bar.querySelector('#prdClear').style.display = 'none';
      /* 加「再试一次」 */
      if(!bar.querySelector('#prdRetry')){
        const retry = document.createElement('button');
        retry.id = 'prdRetry';
        retry.className = 'prdBtn prdPrimary';
        retry.textContent = '↻ 再试一次';
        retry.addEventListener('click', ()=>{
          S.predict.phase = 'draw';
          S.predict.strokes = {};
          S.predict.score = null;
          if(hintEl) hintEl.style.display = '';
          if(panel) panel.style.display = 'none';
          bar.querySelector('#prdSubmit').style.display = '';
          bar.querySelector('#prdClear').style.display = '';
          retry.remove();
          redrawOverlay();
        });
        bar.insertBefore(retry, bar.firstChild);
      }
    }
  }
  function showPanel(){
    if(!panel || !S.predict.score) return;
    const sc = S.predict.score;
    const starStr = '★'.repeat(sc.stars) + '<span style="opacity:.25">' + '★'.repeat(3-sc.stars) + '</span>';
    let lvTeachBtn = '';
    if(S.predict.levelId && typeof LEVELS !== 'undefined'){
      const lv = LEVELS.find(l=>l.id===S.predict.levelId);
      if(lv) lvTeachBtn = '<button type="button" class="prdBtn" id="prdTeach" style="margin-top:8px;">📖 查看本关讲解</button>';
    }
    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:baseline;">' +
        '<b style="color:#f8fafc;">概念评分</b>' +
        '<span class="prdStars">' + starStr + '</span>' +
      '</div>' +
      '<div style="font-size:26px;font-weight:700;color:#fbbf24;margin:2px 0 8px;">' + sc.total + '<span style="font-size:12px;color:#94a3b8;font-weight:400;"> / 100 · 只评形状不评数值</span></div>' +
      (sc.comments.length
        ? '<div style="border-top:1px solid rgba(148,163,184,0.15);padding-top:8px;">' +
          sc.comments.map(c=>'<div style="margin:3px 0;">· ' + c + '</div>').join('') + '</div>'
        : '<div style="color:#4ade80;">完美，没有可挑的毛病。</div>') +
      '<div style="margin-top:8px;font-size:10.5px;color:#94a3b8;">琥珀色 = 你的预测；下方透出的彩色 = 真实解。</div>' +
      lvTeachBtn;
    panel.style.display = 'block';
    const tb = panel.querySelector('#prdTeach');
    if(tb) tb.addEventListener('click', ()=>{
      const lv = LEVELS.find(l=>l.id===S.predict.levelId);
      if(lv && typeof showToast === 'function') showToast('<b>🎯 ' + lv.title + '</b><br>' + lv.teach, 0, true);
    });
  }

  /* Esc 退出 */
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && S.predict.phase !== 'idle') predictExit();
  });

  /* 自由模式入口：内力图工具条加「先猜」按钮 */
  const segView = document.getElementById('segView');
  if(segView){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btnPredict';
    btn.title = '先猜后算：先徒手画弯矩图形状，再揭晓真实解并评分';
    btn.textContent = '✏️ 先猜';
    btn.addEventListener('click', ()=> predictEnter());
    segView.appendChild(btn);
  }
})();
