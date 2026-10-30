"use strict";

let PROBE_HOVER = null;

(function bindProbeClear(){
  const btn = document.getElementById('btnProbeClear');
  if(btn) {
    btn.addEventListener('click', () => {
      S.probe = { elIndex: null, xRatio: 0.5 };
      PROBE_HOVER = null;
      run();
    });
  }
})();

(function bindElem(){
  const seg = document.getElementById('segElem');
  if(!seg) return;
  seg.querySelectorAll('button[data-filter]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      seg.querySelectorAll('button[data-filter]').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      S.elFilter = btn.dataset.filter;
      run();
    });
  });
})();

(function bindVals(){
  const btn = document.getElementById('btnVals');
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    S.showVals = !S.showVals;
    btn.classList.toggle('on', S.showVals);
    run();
  });
})();

(function bindIds(){
  const btn = document.getElementById('btnIds');
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    S.showIds = !S.showIds;
    btn.classList.toggle('on', S.showIds);
    run();
  });
})();

(function bindAntiPts(){
  const btn = document.getElementById('btnAntiPts');
  if(!btn) return;
  btn.classList.toggle('on', S.showAntiPts);
  btn.addEventListener('click', ()=>{
    S.showAntiPts = !S.showAntiPts;
    btn.classList.toggle('on', S.showAntiPts);
    run();
  });
})();

(function bindDisplayMode(){
  const seg = document.getElementById('segDisp');
  const stageEl = document.getElementById('stage');
  if(!seg || !stageEl) return;
  seg.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      seg.querySelectorAll('button').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      const mode = btn.dataset.disp;
      S.displayMode = mode;
      stageEl.classList.remove('mode-all','mode-force','mode-deform');
      stageEl.classList.add('mode-' + mode);
      scheduleRender();
    });
  });
})();

(function bindPDelta(){
  const btn = document.getElementById('btnPDelta');
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    S.showPDelta = !S.showPDelta;
    btn.classList.toggle('on', S.showPDelta);
    run();
  });
})();

(function bindFreeze(){
  const btn = document.getElementById('btnFreeze');
  const btnD = document.getElementById('btnFreezeDeform');
  if(!btn && !btnD) return;

  const toggleFreeze = ()=>{
    if(BASE){
      BASE = null;
      if(btn) btn.classList.remove('on');
      if(btnD) btnD.classList.remove('on');
    } else {
      if(!MODEL) return;
      /* R 图不绘制冻结虚线，冻结后切回 M 图会突现来路不明的虚线。
         R 图下拒绝冻结并提示。 */
      if(MODEL.p.forceType === 'R'){
        if(typeof showToast === 'function') showToast('反力图 R 不支持冻结对比，请先切到 M / N / V 图再冻结。');
        return;
      }
      /* 统一调用 _freezeCurrentModel（10-boot.js），它额外深拷贝
         supportMap / removeBeamMap，避免冻结后修改这两项时 BASE 与 S 同引用。 */
      _freezeCurrentModel();
      if(btn) btn.classList.add('on');
      if(btnD) btnD.classList.add('on');
    }
    run();
  };

  if(btn) btn.addEventListener('click', toggleFreeze);
  if(btnD) btnD.addEventListener('click', toggleFreeze);
})();

function exportCanvasPNG(canvasId, baseName){
  if(!MODEL) return;
  const srcCanvas = document.getElementById(canvasId);
  if(!srcCanvas || !srcCanvas.width) return;

  const rect = srcCanvas.getBoundingClientRect();
  if(rect.width < 1 || rect.height < 1){
    console.warn('[shot] 目标 canvas 当前不可见，已跳过导出。');
    return;
  }

  const tmp = document.createElement('canvas');
  tmp.style.cssText =
    `position:fixed;left:0;top:0;opacity:0;` +
    `width:${rect.width}px;height:${rect.height}px;` +
    `display:block;pointer-events:none;z-index:-1;`;
  document.body.appendChild(tmp);

  try{
    if(canvasId === 'cvForce')      drawInternal(tmp, MODEL, 2);
    else if(canvasId === 'cvD')     drawDeform(tmp, MODEL, 2);
    else if(canvasId === 'cvLoad')  drawLoadDiagram(tmp, MODEL, 2);
  }catch(e){
    console.error('[shot] 绘制失败：', e);
    document.body.removeChild(tmp);
    return;
  }

  tmp.toBlob(blob => {
    if(!blob){
      console.warn('[shot] toBlob 返回空，导出失败。');
      document.body.removeChild(tmp);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString()
                 .replace(/[:T]/g,'-').replace(/\..+$/,'');
    a.href = url;
    a.download = `${baseName}_${ts}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
    document.body.removeChild(tmp);
  }, 'image/png');
}

(function bindShot(){
  const b1 = document.getElementById('btnShotForce');
  const b2 = document.getElementById('btnShotDeform');
  if(b1) b1.addEventListener('click', ()=> exportCanvasPNG('cvForce', 'internal_diagram'));
  if(b2) b2.addEventListener('click', ()=> exportCanvasPNG('cvD',     'deformation'));
})();

(function bindHmode(){
  const seg = document.getElementById('segHmode');
  if(!seg) return;
  seg.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      seg.querySelectorAll('button').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      S.Hmode = btn.dataset.mode;
      run();
    });
  });
})();

/* 内力图探针拾取与悬停高亮 */
(function bindProbeClick(){
  const cv = document.getElementById('cvForce');
  if(!cv) return;

  const getClosest = (e) => {
    if(!MODEL) return null;
    const rect = cv.getBoundingClientRect();
    if(rect.width < 10 || rect.height < 10) return null;
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const padB = MODEL.p.forceType === 'R' ? 80 : 36;
    const {toS} = makeTransform(MODEL, rect.width, rect.height, { padL: 100, padT: 130, padR: 100, padB });
    
    let closest = null;
    let minDist = 45; // 容差 45px
    
    for(let i = 0; i < MODEL.els.length; i++){
      const el = MODEL.els[i];
      const ni = MODEL.nodes[el.i], nj = MODEL.nodes[el.j];
      const [ax, ay] = toS(ni.x, ni.y);
      const [bx, by] = toS(nj.x, nj.y);
      
      const dx = bx - ax, dy = by - ay;
      const len2 = dx*dx + dy*dy;
      if(len2 === 0) continue;
      
      let t = ((clickX - ax) * dx + (clickY - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      
      const px = ax + t * dx, py = ay + t * dy;
      const dist = Math.hypot(clickX - px, clickY - py);
      
      if(dist < minDist){
        minDist = dist;
        const el = MODEL.els[i];
        /* 打断梁子段：把子段内比例 t 换算成整跨比例，
           与 drawProbeCanvas / 反弯点标注统一口径。 */
        const xRatioFull = (el.startOffset != null && el.spanL)
          ? (el.startOffset + t * el.L) / el.spanL
          : t;
        closest = { elIndex: i, dist: dist, xRatio: xRatioFull };
      }
    }
    return closest;
  };

  cv.addEventListener('pointermove', (e) => {
    if(S.rec && S.rec.active) return;
    const h = getClosest(e);
    if(h) {
      /* 阈值从 0.005 放宽到 0.05，避免沿杆件缓慢移动时产生大量无意义重绘。 */
      if(!PROBE_HOVER || PROBE_HOVER.elIndex !== h.elIndex || Math.abs(PROBE_HOVER.xRatio - h.xRatio) > 0.05) {
        PROBE_HOVER = h;
        redrawOnly('force');
      }
    } else {
      if(PROBE_HOVER) {
        PROBE_HOVER = null;
        redrawOnly('force');
      }
    }
  });

  cv.addEventListener('pointerleave', () => {
    if(PROBE_HOVER) {
      PROBE_HOVER = null;
      redrawOnly('force');
    }
  });

  cv.addEventListener('click', (e) => {
    if(S.rec && S.rec.active) return;
    /* R 图不绘制探针，点击后切回 M 图会突现靶心。R 图下拒绝并提示。 */
    if(MODEL && MODEL.p.forceType === 'R'){
      if(typeof showToast === 'function') showToast('反力图 R 不支持截面探针，请先切到 M / N / V 图。');
      return;
    }
    const h = getClosest(e);
    if(h){
      S.probe = { elIndex: h.elIndex, xRatio: h.xRatio };
      PROBE_HOVER = null; // 点击后清空悬停，让选中的靶心接管
      run(); 
    }
  });
})();

(function bindForce(){
  const seg = document.getElementById('segForce');
  if(!seg) return;
  seg.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      seg.querySelectorAll('button').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      S.forceType = btn.dataset.force;
      run();
    });
  });
})();

(function bindAxial(){
  const seg = document.getElementById('segAxial');
  if(!seg) return;
  seg.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      seg.querySelectorAll('button').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      S.axialMode = btn.dataset.axial;
      run();
    });
  });
})();

(function bindHelp(){
  const modal = document.getElementById('modalHelp');
  const btnOpen = document.getElementById('btn-help');
  const btnClose = document.getElementById('btnHelpClose');
  if(!modal || !btnOpen) return;

  const open  = ()=> modal.classList.add('open');
  const close = ()=> modal.classList.remove('open');

  btnOpen.addEventListener('click', open);
  if(btnClose) btnClose.addEventListener('click', close);
  modal.addEventListener('click', e=>{ if(e.target === modal) close(); });
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && modal.classList.contains('open')) close();
  });
})();

(function bindTip(){
  const modal = document.getElementById('modalTip');
  const btnOpen = document.getElementById('btn-tip');
  const btnClose = document.getElementById('btnTipClose');
  if(!modal || !btnOpen) {
    // 【修改】由于UI中已移除打赏按钮，找不到是正常的，静默退出，不再打印警告
    return;
  }

  const open  = ()=> modal.classList.add('open');
  const close = ()=> modal.classList.remove('open');

  btnOpen.addEventListener('click', open);
  if(btnClose) btnClose.addEventListener('click', close);
  modal.addEventListener('click', e=>{ if(e.target === modal) close(); });
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && modal.classList.contains('open')) close();
  });
})();

const SHARE_KEYS = [
  'nBay','nLev','hasCant',
  'L1','L2','L3','h1','h2','h3','Lc',
  'colSecType','colHW','colAxis','beamSecType','beamHN',
  'bc','hc','bb','hb','r',
  'q1','q2','q3','qSpanMap','P1','P2','P3','pLoadMap',
  'qc1','qc2','qc3','H1','H2','H3',
  'tempAll','tempGrad','tempT0',
  'Hmode','supportMap','movingLoad','braceMap','braceTensionMap','removeBeamMap','brushBrace','betaF','betaJ',
  'frameMat','braceMat','As','braceI','axialMode',
  'mScale','dScale','forceType','elFilter','displayMode',
  'showVals','showIds','showAntiPts','showPDelta'
];

function encodeState(){
  const obj = {};
  const defaults = {
    nBay: 1, nLev: 1, hasCant: false,
    L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5,
    colSecType: 'rect', colHW: 'HW300x300', colAxis: 'strong',
    beamSecType: 'rect', beamHN: 'HN400x200',
    bc: 400, hc: 400, bb: 250, hb: 500, r: 1,
    q1: 0, q2: 0, q3: 0, qSpanMap: {},
    P1: 0, P2: 0, P3: 0, pLoadMap: {},
    qc1: 0, qc2: 0, qc3: 0,
    H1: 0, H2: 0, H3: 0, Hmode: 'none',
    tempAll: 0, tempGrad: 0, tempT0: 20,
    supportMap: {},
    movingLoad: { enabled: false, lev: 1, bay: 1, P: 0, t: 0.5, speed: 1 },
    braceMap: {}, braceTensionMap: {}, removeBeamMap: {}, brushBrace: 'none',
    betaF: 1, betaJ: 1,     frameMat: 'conc', braceMat: 'steel',
    As: 2000, braceI: 30, axialMode: 'real', mScale: 1, dScale: 30,
    forceType: 'M', elFilter: 'all', displayMode: 'all',
    showVals: false, showIds: false, showAntiPts: true, showPDelta: true
  };

  for(const k of SHARE_KEYS) {
    if (k === 'movingLoad') {
      if (S.movingLoad && (S.movingLoad.enabled || S.movingLoad.P > 0)) {
        obj[k] = {
          enabled: S.movingLoad.enabled,
          lev: S.movingLoad.lev,
          bay: S.movingLoad.bay,
          P: S.movingLoad.P,
          t: S.movingLoad.t,
          speed: S.movingLoad.speed
        };
      }
      continue;
    }
    const def = defaults[k];
    const val = S[k];

    if (typeof def === 'object' && def !== null) {
      if (val && Object.keys(val).length > 0) {
        obj[k] = val;
      }
    } else {
      /* 数值型 range 参数按滑块 step 对齐，避免扫掠到一半分享时
         带出 321.5 这类非法值，对方打开后被 applyStateFromObj 取整，
         出现“分享值 ≠ 打开值”。 */
      let outVal = val;
      if(typeof val === 'number' && typeof def === 'number'){
        const el = document.getElementById(k);
        if(el && el.type === 'range'){
          const lo = parseFloat(el.min), step = parseFloat(el.step);
          if(isFinite(lo) && isFinite(step) && step > 0){
            outVal = parseFloat((lo + Math.round((val - lo) / step) * step).toFixed(4));
          }
        }
      }
      if (outVal !== def) {
        obj[k] = outVal;
      }
    }
  }
  /* 拓扑无效的滑块值置为默认值，避免分享链接携带冗余参数、
     打开者看到禁用滑块却显示旧值的困惑 */
    if(S.nLev < 2){ obj.h2 = 4; obj.q2 = 0; obj.qc2 = 0; obj.H2 = 0; obj.P2 = 0; }
  if(S.nLev < 3){ obj.h3 = 4; obj.q3 = 0; obj.qc3 = 0; obj.H3 = 0; obj.P3 = 0; }
  /* pLoadMap 越界键剔除（与 qSpanMap 同步处理，避免分享链接携带无效跨） */
  if(obj.pLoadMap && typeof obj.pLoadMap === 'object'){
    const cleanP = {};
    for(const kk of Object.keys(obj.pLoadMap)){
      const parts = kk.split('-');
      const lv = parseInt(parts[0]), c = parseInt(parts[1]);
      if(lv >= 1 && lv <= S.nLev && c >= 1 && c <= S.nBay){
        cleanP[kk] = obj.pLoadMap[kk];
      }
    }
    if(Object.keys(cleanP).length > 0) obj.pLoadMap = cleanP;
    else delete obj.pLoadMap;
  }
  if(S.nBay < 2){ obj.L2 = 6; }
  if(S.nBay < 3){ obj.L3 = 6; }
  /* qSpanMap 越界键剔除，避免分享链接携带无效跨 */
  if(obj.qSpanMap && typeof obj.qSpanMap === 'object'){
    const clean = {};
    for(const kk of Object.keys(obj.qSpanMap)){
      const parts = kk.split('-');
      const lv = parseInt(parts[0]), c = parseInt(parts[1]);
      if(lv >= 1 && lv <= S.nLev && c >= 1 && c <= S.nBay){
        clean[kk] = obj.qSpanMap[kk];
      }
    }
    if(Object.keys(clean).length > 0) obj.qSpanMap = clean;
    else delete obj.qSpanMap;
  }
  /* removeBeamMap 越界键剔除（与 qSpanMap 同步，去掉对 11-construct 事件监听的隐式依赖） */
  if(obj.removeBeamMap && typeof obj.removeBeamMap === 'object'){
    const cleanRB = {};
    for(const kk of Object.keys(obj.removeBeamMap)){
      const parts = kk.split('-');
      const lv = parseInt(parts[0]), c = parseInt(parts[1]);
      if(lv >= 1 && lv <= S.nLev && c >= 1 && c <= S.nBay && obj.removeBeamMap[kk] === true){
        cleanRB[kk] = true;
      }
    }
    if(Object.keys(cleanRB).length > 0) obj.removeBeamMap = cleanRB;
    else delete obj.removeBeamMap;
  }
  if(!S.hasCant){ obj.Lc = 1.5; obj.qc1 = 0; obj.qc2 = 0; obj.qc3 = 0; }
  /* obj.settleDy/settleCol 不在 SHARE_KEYS 中，永远不存在；
     此行原为死代码，已删除。 */
  try{
    const jsonStr = JSON.stringify(obj);
    // 【修复】预编码非 ASCII 字符，防止 btoa 抛出 InvalidCharacterError
    const safeStr = encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g, function(match, p1) {
      return String.fromCharCode('0x' + p1);
    });
    return btoa(safeStr)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }catch(e){
    console.warn('[share] 状态编码失败：', e);
    return '';
  }
}

function decodeState(str){
  try{
    if(typeof str !== 'string' || str.length > 8000) return null; // 拦截超长恶意链接
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while(b64.length % 4) b64 += '=';
    const obj = JSON.parse(atob(b64));
    if(!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    return obj;
  }catch(e){ return null; }
}

function applyStateFromObj(obj){
  if(!obj) return false;
  if(typeof sweepStop === 'function') sweepStop();

  /* 先把所有可分享字段重置为默认值，防止分享链接省略默认值时，
     继承当前页面残留的支撑/荷载/显示开关等脏状态。 */
  const DEFAULTS = {
    nBay: 1, nLev: 1, hasCant: false,
    L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5,
    colSecType: 'rect', colHW: 'HW300x300', colAxis: 'strong',
    beamSecType: 'rect', beamHN: 'HN400x200',
    bc: 400, hc: 400, bb: 250, hb: 500, r: 1,
    q1: 0, q2: 0, q3: 0, qSpanMap: {},
    P1: 0, P2: 0, P3: 0, pLoadMap: {},
    qc1: 0, qc2: 0, qc3: 0,
    H1: 0, H2: 0, H3: 0, Hmode: 'none',
    tempAll: 0, tempGrad: 0, tempT0: 20,
    supportMap: {},
    braceMap: {}, braceTensionMap: {}, removeBeamMap: {}, brushBrace: 'none',
    betaF: 1, betaJ: 1,     frameMat: 'conc', braceMat: 'steel',
    As: 2000, braceI: 30, axialMode: 'real', mScale: 1, dScale: 30,
    forceType: 'M', elFilter: 'all', displayMode: 'all',
    showVals: false, showIds: false, showAntiPts: true, showPDelta: true
  };
  for (const k of SHARE_KEYS) {
    const def = DEFAULTS[k];
    if (def !== undefined) {
      S[k] = (typeof def === 'object' && def !== null)
        ? JSON.parse(JSON.stringify(def))
        : def;
    }
  }
  /* 强制重置 movingLoad，防止 DEFAULTS 遗漏导致状态残留 */
  if (typeof movingLoadStop === 'function') movingLoadStop();
S.movingLoad = { enabled: false, lev: 1, bay: 1, P: 0, t: 0.5, playing: false, speed: 1, rafId: null, t0: 0 };

  const nb = parseInt(obj.nBay);
  const nl = parseInt(obj.nLev);
  if(nb >= 1 && nb <= 3) S.nBay = nb;
  if(nl >= 1 && nl <= 3) S.nLev = nl;
  if(typeof obj.hasCant === 'boolean') S.hasCant = obj.hasCant;

  for(const k of SHARE_KEYS){
    if(k === 'nBay' || k === 'nLev' || k === 'hasCant') continue;
    if(!(k in obj)) continue;
    const v = obj[k];
    if(k === 'Hmode'){
      if(v === 'none' || v === 'rigid') S[k] = v;
      else if(v === 'left') S[k] = 'none';  // 兼容老链接
      else if(v === 'dstiff') S[k] = 'rigid'; // 兼容老链接
    } else if(k === 'colSecType'){
      if(v === 'rect' || v === 'HW') S[k] = v;
    } else if(k === 'beamSecType'){
      if(v === 'rect' || v === 'HN') S[k] = v;
    } else if(k === 'colHW' || k === 'beamHN'){
      if(typeof v === 'string' && v.length > 0) S[k] = v;
    } else if(k === 'colAxis'){
      if(v === 'strong' || v === 'weak') S[k] = v;
    } else if(k === 'forceType'){
      if(v === 'M' || v === 'N' || v === 'V' || v === 'R') S[k] = v;
    } else if(k === 'elFilter'){
      if(v === 'all' || v === 'col' || v === 'beam' || v === 'brace') S[k] = v;
    } else if(k === 'displayMode'){
      if(v === 'all' || v === 'force' || v === 'deform') S[k] = v;
    } else if(k === 'frameMat' || k === 'braceMat'){
      if(v === 'conc' || v === 'steel') S[k] = v;
    } else if(k === 'axialMode'){
      if(v === 'real' || v === 'rigid') S[k] = v;
    } else if(k === 'showVals' || k === 'showIds' || k === 'showPDelta' || k === 'showAntiPts'){
      if(typeof v === 'boolean') S[k] = v;
    } else if(k === 'braceMap'){
      /* 白名单过滤：只接受 "层-跨" 键 + X / ╱ / ╲ 值，防止 __proto__ 原型污染 */
      if(v && typeof v === 'object' && !Array.isArray(v)){
        const clean = {};
        for(const kk of Object.keys(v)){
          if(/^\d+-\d+$/.test(kk) && (v[kk] === 'X' || v[kk] === '/' || v[kk] === '\\')){
            const parts = kk.split('-');
            const lv = parseInt(parts[0]), c = parseInt(parts[1]);
            if(lv >= 1 && lv <= S.nLev && c >= 1 && c <= S.nBay){
              clean[kk] = v[kk];
            }
          }
        }
        S[k] = clean;
      }
    } else if(k === 'qSpanMap'){
      /* 逐跨荷载白名单：键 "层-跨"，值 0–100 的数字，防止原型污染 */
      if(v && typeof v === 'object' && !Array.isArray(v)){
        const clean = {};
        for(const kk of Object.keys(v)){
          if(/^\d+-\d+$/.test(kk)){
            const parts = kk.split('-');
            const lv = parseInt(parts[0]), c = parseInt(parts[1]);
            const n = parseFloat(v[kk]);
            if(lv >= 1 && lv <= S.nLev && c >= 1 && c <= S.nBay && isFinite(n) && n >= 0 && n <= 100){
              clean[kk] = n;
            }
          }
        }
        S[k] = clean;
      }
    } else if(k === 'pLoadMap'){
      /* 集中力逐跨白名单：键 "层-跨"，值 { P, a } */
      if(v && typeof v === 'object' && !Array.isArray(v)){
        const clean = {};
        for(const kk of Object.keys(v)){
          if(/^\d+-\d+$/.test(kk)){
            const parts = kk.split('-');
            const lv = parseInt(parts[0]), c = parseInt(parts[1]);
            const src = v[kk] || {};
            const P = parseFloat(src.P);
            const a = parseFloat(src.a);
            const Lmax = S['L' + c] || 12;
            /* 放宽到闭区间，与 solver 的 a ∈ (0.001, L-0.001) 钳制口径对齐；
               边界值由 solver 内部钳制，避免白名单静默拒收造成“分享丢失集中力”。 */
            if(lv >= 1 && lv <= S.nLev && c >= 1 && c <= S.nBay &&
               isFinite(P) && Math.abs(P) <= 200 &&
               isFinite(a) && a >= 0 && a <= Lmax){
              clean[kk] = { P, a };
            }
          }
        }
        S[k] = clean;
      }
    } else if(k === 'movingLoad'){
      if (v && typeof v === 'object') {
        const rawT = parseFloat(v.t);
        const restoredT = Number.isFinite(rawT) ? Math.max(0, Math.min(1, rawT)) : 0.5;
        S.movingLoad = {
          enabled: !!v.enabled,
          lev: Math.max(1, Math.min(S.nLev, parseInt(v.lev) || 1)),
          bay: Math.max(1, Math.min(S.nBay, parseInt(v.bay) || 1)),
          P: Math.max(0, Math.min(200, parseFloat(v.P) || 0)),
          t: restoredT,
          speed: Math.max(0.1, Math.min(10, parseFloat(v.speed) || 1)),
          playing: false,
          rafId: null,
          t0: 0
        };
      }
    } else if(k === 'supportMap'){
      /* 每柱独立支座白名单：键为柱列号字符串，值为 { type, dy, rot } */
      if(v && typeof v === 'object' && !Array.isArray(v)){
        const clean = {};
        for(const kk of Object.keys(v)){
          if(!/^\d+$/.test(kk)) continue;
          const col = parseInt(kk);
          if(col < 0 || col > S.nBay) continue;
          const e = v[kk];
          if(!e || typeof e !== 'object') continue;
          const entry = {};
          /* 废弃“局部弹簧”选项，旧链接若包含 spring，降级为默认跟随 */
          if(e.type && ['fixed','pin','roller'].includes(e.type)) entry.type = e.type;
          const dy = parseFloat(e.dy);
          if(isFinite(dy) && Math.abs(dy) <= 200) entry.dy = dy;
          const rot = parseFloat(e.rot);
          if(isFinite(rot) && Math.abs(rot) <= 0.1) entry.rot = rot;
          if(Object.keys(entry).length > 0) clean[kk] = entry;
        }
        S[k] = clean;
      }
    } else if(k === 'removeBeamMap'){
      if(v && typeof v === 'object' && !Array.isArray(v)){
        const clean = {};
        for(const kk of Object.keys(v)){
          if(/^\d+-\d+$/.test(kk) && v[kk] === true){
            const parts = kk.split('-');
            const lv = parseInt(parts[0]), c = parseInt(parts[1]);
            if(lv >= 1 && lv <= S.nLev && c >= 1 && c <= S.nBay){
              clean[kk] = true;
            }
          }
        }
        S[k] = clean;
      }
    } else if(k === 'braceTensionMap'){
      if(v && typeof v === 'object' && !Array.isArray(v)){
        const clean = {};
        for(const kk of Object.keys(v)){
          if(/^\d+-\d+$/.test(kk) && v[kk] === true){
            const parts = kk.split('-');
            const lv = parseInt(parts[0]), c = parseInt(parts[1]);
            if(lv >= 1 && lv <= S.nLev && c >= 1 && c <= S.nBay){
              clean[kk] = true;
            }
          }
        }
        S[k] = clean;
      }
    } else if(k === 'brushBrace'){
      if(v === 'none' || v === 'X' || v === '/' || v === '\\') S[k] = v;
    } else {
      let n = parseFloat(v);
      if(!isFinite(n)) continue;
      const el = document.getElementById(k);
      if(el && el.type === 'range'){
        const lo = parseFloat(el.min), hi = parseFloat(el.max);
        /* 对齐滑块步进，避免非步进值造成「显示值与实际计算值不一致」 */
        const step = parseFloat(el.step) || 0;
        if(step > 0){
          n = lo + Math.round((n - lo) / step) * step;
        }
        S[k] = Math.max(lo, Math.min(hi, n));
      } else {
        S[k] = n;
      }
    }
  }

  /* 老链接兼容：v0.1.6.3 之前用全局 braceLambda，现改为 braceI。
     若老链接携带 braceLambda 但无 braceI，用最大支撑杆长 L_max 反算等效 i = L_max/λ，
     使"最危险杆"的 λ 与老链接保持一致。 */
  if(obj.braceLambda != null && obj.braceI == null){
    let Lmax = 0;
    for(const k in S.braceMap){
      if(!S.braceMap[k] || S.braceMap[k] === 'none') continue;
      const parts = k.split('-');
      const lv = parseInt(parts[0]), c = parseInt(parts[1]);
      const Lb = S['L' + c] || 6;
      const hL = S['h' + lv] || 4;
      const L = Math.hypot(Lb, hL);
      if(L > Lmax) Lmax = L;
    }
    const lamOld = parseFloat(obj.braceLambda) || 80;
    if(Lmax > 0 && lamOld > 0){
      S.braceI = Math.max(10, Math.min(100, Math.round(Lmax * 1000 / lamOld)));
    }
  }

  /* 老链接兼容：以前只有全局 braceOnlyTension 开关，没有逐格 braceTensionMap。
     若老链接是 true 且未携带 braceTensionMap，把所有已有支撑格映射为仅受拉。 */
  if(!obj.braceTensionMap && obj.braceOnlyTension === true){
    S.braceTensionMap = {};
    for(const k in S.braceMap){
      if(S.braceMap[k] && S.braceMap[k] !== 'none') S.braceTensionMap[k] = true;
    }
  }

  document.querySelectorAll('#segBay button').forEach(b =>
    b.classList.toggle('on', parseInt(b.dataset.bay) === S.nBay));
  document.querySelectorAll('#segLev button').forEach(b =>
    b.classList.toggle('on', parseInt(b.dataset.lev) === S.nLev));
  document.querySelectorAll('#segCant button').forEach(b =>
    b.classList.toggle('on', (b.dataset.cant === '1') === S.hasCant));

  for(const k of SHARE_KEYS){
    const el = document.getElementById(k);
    if(el && el.type === 'range'){
      el.value = S[k];
      const out = document.getElementById('v-'+k);
      if(out && fmtMap[k]) out.textContent = fmtMap[k](parseFloat(S[k]));
      updateRangeProgress(el);
    }
    // 同步变形图的镜像滑块
    if (k === 'betaF' || k === 'betaJ') {
      const elD = document.getElementById(k + '_d');
      if (elD) {
        elD.value = S[k];
        const outD = document.getElementById('v-' + k + '_d');
        if (outD) outD.textContent = parseFloat(S[k]).toFixed(2);
        updateRangeProgress(elD);
      }
    }
  }

  document.querySelectorAll('#segHmode button').forEach(b =>
    b.classList.toggle('on', b.dataset.mode === S.Hmode));
  document.querySelectorAll('#segBraceTopo button').forEach(b => {
    const val = b.dataset.brace === 'none' ? 'none' : (b.dataset.brace === 'X' ? 'X' : (b.dataset.brace === 'L' ? '/' : '\\'));
    b.classList.toggle('on', val === S.brushBrace);
  });
  document.querySelectorAll('#segForce button').forEach(b =>
    b.classList.toggle('on', b.dataset.force === S.forceType));
  document.querySelectorAll('#segElem button').forEach(b =>
    b.classList.toggle('on', b.dataset.filter === S.elFilter));
  document.querySelectorAll('#segDisp button').forEach(b =>
    b.classList.toggle('on', b.dataset.disp === S.displayMode));

  document.querySelectorAll('#segFrameMat button').forEach(b =>
    b.classList.toggle('on', b.dataset.mat === S.frameMat));
  document.querySelectorAll('#segBraceMat button').forEach(b =>
    b.classList.toggle('on', b.dataset.mat === S.braceMat));
  document.querySelectorAll('#segAxial button').forEach(b =>
    b.classList.toggle('on', b.dataset.axial === S.axialMode));
  /* 「全部仅受拉」按钮状态由 renderBraceGrid → refreshBraceTensionBtn 统一管理（依据 braceTensionMap），此处不再单独 toggle，避免遗留 S.braceOnlyTension 造成瞬间误显 */

  {
    const btnV = document.getElementById('btnVals');
    if(btnV) btnV.classList.toggle('on', S.showVals);
    const btnIds = document.getElementById('btnIds');
    if(btnIds) btnIds.classList.toggle('on', S.showIds);
    const btnAntiPts = document.getElementById('btnAntiPts');
    if(btnAntiPts) btnAntiPts.classList.toggle('on', S.showAntiPts);
    const btnPD = document.getElementById('btnPDelta');
    if(btnPD) btnPD.classList.toggle('on', S.showPDelta);
  }

  {
    const stageEl = document.getElementById('stage');
    if(stageEl){
      stageEl.classList.remove('mode-all','mode-force','mode-deform');
      stageEl.classList.add('mode-' + S.displayMode);
    }
  }

  /* 兼容旧链接：若携带 settleDy/settleCol，自动转换到 supportMap */
  if(obj.settleDy !== undefined && obj.settleCol !== undefined) {
    const c = String(Math.max(0, parseInt(obj.settleCol) || 0));
    if(!S.supportMap) S.supportMap = {};
    if(!S.supportMap[c]) S.supportMap[c] = {};
    S.supportMap[c].dy = parseFloat(obj.settleDy) || 0;
  }

  applyTopoState();

  // 逐跨滑块重渲染（分享链接可能携带 qSpanMap / pLoadMap）
  if(typeof renderSpanEditors === 'function') renderSpanEditors();
  if(typeof renderPSpanEditors === 'function') renderPSpanEditors();

  // 清理可能残留的扫掠慢放倍率和高亮状态（防止分享链接或自检后污染普通扫掠）
  S.sweep.durMul = 1;
  S.highlight = null;
  S.probe = { elIndex: null, xRatio: 0.5 };
  S._uPureCache = null;
  S._stiffDecompCache = null;
  PROBE_HOVER = null;
  if(typeof syncSecTypeUI === 'function') syncSecTypeUI();

  run();
  return true;
}

/* PROD_URL 已移至 01-state.js，便于统一维护部署地址 */

function isLocalHost(){
  const host = location.hostname;
  return location.protocol === 'file:' ||
         host === 'localhost' ||
         host === '127.0.0.1' ||
         host === '';
}

function buildShareURL(){
  const hash = '#st=' + encodeState();
  const base = isLocalHost() ? PROD_URL : location.href.split('#')[0];
  return base + hash;
}

let currentShareURL = '';

function renderQRCode(container, url){
  if(!container) return;

  container.querySelectorAll('canvas, .shareQRLoading').forEach(el => el.remove());

  if(typeof qrcode !== 'function'){
    const tip = document.createElement('div');
    tip.className = 'shareQRLoading';
    tip.textContent = '二维码库未加载，请复制下方链接';
    container.appendChild(tip);
    return;
  }

  try{
    const qr = qrcode(0, 1); // 1 代表 ErrorCorrectLevel.L，容量更大，防止超长崩溃
    qr.addData(url);
    qr.make();

    const n   = qr.getModuleCount();
    const box = 236 - 28;
    const cell = Math.max(2, Math.floor(box / n));
    const side = cell * n;

    const canvas = document.createElement('canvas');
    canvas.width  = side;
    canvas.height = side;
    canvas.style.width  = side + 'px';
    canvas.style.height = side + 'px';
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, side, side);
    ctx.fillStyle = '#0f172a';
    for(let r = 0; r < n; r++){
      for(let c = 0; c < n; c++){
        if(qr.isDark(r, c)){
          ctx.fillRect(c * cell, r * cell, cell, cell);
        }
      }
    }
    container.appendChild(canvas);
  }catch(e){
    console.error('[share] 二维码生成失败：', e);
    const tip = document.createElement('div');
    tip.className = 'shareQRLoading';
    tip.textContent = '生成二维码失败，请复制下方链接';
    container.appendChild(tip);
  }
}

function downloadQRCode(){
  if(!currentShareURL) return;
  if(typeof qrcode !== 'function'){
    alert('二维码库未加载，无法下载。请检查网络，或直接复制下方的分享链接。');
    return;
  }
  try{
    const qr = qrcode(0, 1);
    qr.addData(currentShareURL);
    qr.make();
    const n      = qr.getModuleCount();
    const cell   = 8;
    const margin = 4 * cell;
    const side   = cell * n + margin * 2;

    const canvas = document.createElement('canvas');
    canvas.width  = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, side, side);
    ctx.fillStyle = '#0f172a';
    for(let r = 0; r < n; r++){
      for(let c = 0; c < n; c++){
        if(qr.isDark(r, c)){
          ctx.fillRect(margin + c * cell, margin + r * cell, cell, cell);
        }
      }
    }
    canvas.toBlob(blob => {
      if(!blob) return;
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString()
                   .replace(/[:T]/g,'-').replace(/\..+$/,'');
      a.href = u;
      a.download = `structura_qr_${ts}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(u), 2000);
    }, 'image/png');
  }catch(e){
    console.error('[share] 二维码下载失败：', e);
  }
}

function shareURL(){
  const url = buildShareURL();
  currentShareURL = url;

  const isLocal = isLocalHost();

  const modal     = document.getElementById('modalShare');
  const qrBox     = document.getElementById('shareQRBox');
  const urlField  = document.getElementById('shareURLField');
  const warnEl    = document.getElementById('shareLocalWarn');

  if(modal){
    try {
      renderQRCode(qrBox, url);
    } catch(e) {
      console.error('QR生成失败', e);
      if (qrBox) qrBox.innerHTML = '<div class="shareQRLoading">生成二维码失败，请复制下方链接</div>';
    }
    if(urlField){
      urlField.value = url;
      requestAnimationFrame(()=>{
        try{ urlField.select(); }catch(e){}
      });
    }
    if(warnEl){
      if(isLocal) warnEl.removeAttribute('hidden');
      else        warnEl.setAttribute('hidden', '');
    }
    modal.classList.add('open');
  }

  const btn = document.getElementById('btn-share');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(()=>{
      if(!btn) return;
      btn.classList.add('copied');
      const orig = btn.textContent;
      btn.textContent = '✓';
      setTimeout(()=>{
        btn.classList.remove('copied');
        btn.textContent = orig;
      }, 1200);
    }).catch(()=>{ /* 静默失败：模态框里有 URL 字段 */ });
  }
}

(function bindShare(){
  const btn      = document.getElementById('btn-share');
  const modal    = document.getElementById('modalShare');
  const btnClose = document.getElementById('btnShareClose');
  const btnCopy  = document.getElementById('btnShareCopy');
  const btnDl    = document.getElementById('btnShareDownload');
  const urlField = document.getElementById('shareURLField');

  if(btn) btn.addEventListener('click', shareURL);
  if(btnDl) btnDl.addEventListener('click', downloadQRCode);

  const close = ()=> modal && modal.classList.remove('open');
  if(btnClose) btnClose.addEventListener('click', close);
  if(modal){
    modal.addEventListener('click', e=>{
      if(e.target === modal) close();
    });
  }
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && modal && modal.classList.contains('open')) close();
  });

  if(btnCopy){
    btnCopy.addEventListener('click', ()=>{
      const url = urlField && urlField.value ? urlField.value : buildShareURL();
      const iconEl = btnCopy.querySelector('.btnShareCopyIcon');
      const txtEl  = btnCopy.querySelector('.btnShareCopyTxt');
      const done = ()=>{
        btnCopy.classList.add('copied');
        if(iconEl) iconEl.textContent = '✓';
        if(txtEl)  txtEl.textContent  = '';
        setTimeout(()=>{
          btnCopy.classList.remove('copied');
          if(iconEl) iconEl.textContent = '📋';
          if(txtEl)  txtEl.textContent  = '复制';
        }, 1200);
      };
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(url).then(done).catch(()=>{
          if(urlField){
            try{ urlField.select(); }catch(e){}
          }
        });
      } else if(urlField){
        try{ urlField.select(); }catch(e){}
      }
    });
  }
})();

/* =====================================================================
   反弯点悬浮窗逻辑
   ===================================================================== */
(function bindAntiRhoFloat(){
  const btnOpen = document.getElementById('btnFloatAntiRho');
  const btnClose = document.getElementById('btnFloatAntiRhoClose');
  const wrap = document.getElementById('floatAntiRhoWrap');
  const header = document.getElementById('floatAntiRhoHeader');
  if(!btnOpen || !wrap || !header) return;

  // 暴露给外部调用（如自检卡），支持传入 x, y 坐标
  window.openAntiRhoFloat = function(x, y) {
    wrap.hidden = false;
    if (x != null && y != null) {
      wrap.style.left = x + 'px';
      wrap.style.top = y + 'px';
      wrap.style.right = 'auto';
    }
    // 浮窗从 hidden 解锁后需要等浏览器完成一次布局，
    // 否则 cvAntiRhoFloat 的 clientWidth/Height 仍是 0，
    // 同步 run() 会被 renderTo 里的 W<10 判断提前 return，导致白框。
    if(typeof run === 'function'){
      requestAnimationFrame(()=>{ if(typeof run === 'function') run(); });
    }
  };

  btnOpen.addEventListener('click', () => {
    // 用户手动点浮动按钮时，如果没坐标，重置到默认右上角
    if (wrap.hidden) {
      wrap.style.right = '40px';
      wrap.style.left = 'auto';
      wrap.style.top = '120px';
    }
    window.openAntiRhoFloat();
  });

  if(btnClose) {
    btnClose.addEventListener('click', () => {
      wrap.hidden = true;
    });
  }

  /* 拖拽逻辑 */
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  header.addEventListener('mousedown', (e) => {
    if(e.target.tagName === 'BUTTON') return; // 点关闭按钮不拖拽
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    
    // 如果之前没设置过 left/top，先通过 getBoundingClientRect 初始化
    if(!wrap.style.left || !wrap.style.top) {
      const rect = wrap.getBoundingClientRect();
      wrap.style.left = rect.left + 'px';
      wrap.style.top = rect.top + 'px';
      wrap.style.right = 'auto'; // 移除 right 定位，改用 left
    }
    initialLeft = parseInt(wrap.style.left) || 0;
    initialTop = parseInt(wrap.style.top) || 0;
    
    e.preventDefault(); // 防止选中文本
  });

  window.addEventListener('mousemove', (e) => {
    if(!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    let newLeft = initialLeft + dx;
    let newTop = initialTop + dy;
    
    // 边界限制，防止拖出屏幕
    const maxLeft = window.innerWidth - wrap.offsetWidth;
    const maxTop = window.innerHeight - wrap.offsetHeight;
    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));
    
    wrap.style.left = newLeft + 'px';
    wrap.style.top = newTop + 'px';
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  /* 窗口 resize 后把浮窗重新钳制回可视区，避免拖到边缘后缩小窗口时飞出屏幕。 */
  window.addEventListener('resize', () => {
    if(!wrap || wrap.hidden) return;
    const rect = wrap.getBoundingClientRect();
    let left = rect.left, top = rect.top;
    const maxLeft = Math.max(0, window.innerWidth - wrap.offsetWidth);
    const maxTop  = Math.max(0, window.innerHeight - wrap.offsetHeight);
    left = Math.max(0, Math.min(left, maxLeft));
    top  = Math.max(0, Math.min(top, maxTop));
    wrap.style.left = left + 'px';
    wrap.style.top  = top + 'px';
    wrap.style.right = 'auto';
  });
})();

/* =====================================================================
   游戏入口（彩蛋）：左侧悬浮侧边按钮，独立标签页打开 game.html
   - 默认半隐藏，hover 滑出；录制中锁定（is-locked + click 拦截）
   - 扫掠播放中点击先 sweepStop()，避免后台 rAF 空转
   - 相对路径，file:// / https:// 均可用；rel=noopener 防 opener 污染
   - showToast 定义在 10-boot.js，但此处仅在 click 回调内引用（运行时），
     那时 10-boot.js 已加载完毕，不存在 undefined 风险
   ===================================================================== */
(function bindGameSideBtn(){
  const a = document.getElementById('gameSideBtn');
  if (!a) return;
  
  // 确保有 target 等属性（以防 HTML 漏写）
  a.target = '_blank';
  a.rel = 'noopener noreferrer';

  a.addEventListener('click', (e) => {
    if (S.rec.active) {
      e.preventDefault();
      if (typeof showToast === 'function') {
        showToast('录制进行中，游戏入口已锁定。请先停止录制。');
      }
      return;
    }
    if (S.sweep.playing) sweepStop();
  });
})();

const btnReset = document.getElementById('btn-reset');
if(btnReset) btnReset.addEventListener('click', ()=>{
  if(S.sweep.playing) sweepStop();
  S.highlight = null;
  S._uPureCache = null;
  S._stiffDecompCache = null;
  S.sweep.param = 'bc';
  S.sweep.durMul = 1;
  const _bar = document.getElementById('sweepBar');
  if(_bar) _bar.classList.remove('on');
  const _btnS = document.getElementById('btn-sweep');
  if(_btnS) _btnS.classList.remove('on');
  const _sel = document.getElementById('sweepParam');
  if(_sel) _sel.value = 'bc';
  document.querySelectorAll('input[type=range]').forEach(el=>{
    el.value = el.defaultValue;
    const v = parseFloat(el.value);
    // 仅写入 fmtMap 白名单中的真实参数，排除 _d 镜像滑块与 sweepProgress 等动态滑块，
    // 防止无关键污染 S 状态对象（影响分享 / 自检深拷贝）
    if(!el.id.endsWith('_d') && fmtMap[el.id]) S[el.id] = v;
    const out = document.getElementById('v-'+el.id);
    if(out && fmtMap[el.id]) out.textContent = fmtMap[el.id](v);
    updateRangeProgress(el);
  });
  S.nBay = 1;
  S.nLev = 1;
  S.hasCant = false;
  S.Hmode = 'none';
  S.colSecType = 'rect';
  S.colHW = 'HW300x300';
  S.colAxis = 'strong';
  S.beamSecType = 'rect';
  S.beamHN = 'HN400x200';
  S.frameMat = 'conc';
  S.braceMat = 'steel';
  S.axialMode = 'real';
  S.As = 2000;
  S.braceI = 30;
  S.braceTensionMap = {};
  S.braceMap = {};
  S.qSpanMap = {};
  S.pLoadMap = {};
  S.supportMap = {};
  S.removeBeamMap = {};
  S.movingLoad = { enabled: false, lev: 1, bay: 1, P: 0, t: 0.5, playing: false, speed: 1, rafId: null, t0: 0 };
  if(typeof movingLoadStop === 'function') movingLoadStop();
  if(typeof renderMovingLoadUI === 'function') renderMovingLoadUI();
  S.P1 = 0; S.P2 = 0; S.P3 = 0;
  S.tempAll = 0; S.tempGrad = 0; S.tempT0 = 20;
  S.brushBrace = 'none';
  const segFMR = document.getElementById('segFrameMat');
  if(segFMR) segFMR.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.mat === 'conc'));
  const segBMR = document.getElementById('segBraceMat');
  if(segBMR) segBMR.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.mat === 'steel'));
  const segAx = document.getElementById('segAxial');
  if(segAx) segAx.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.axial === 'real'));
  const btnBTR = document.getElementById('btnBraceTension');
  if(btnBTR) btnBTR.classList.remove('on');
  const segBraceTopo = document.getElementById('segBraceTopo');
  if(segBraceTopo) segBraceTopo.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.brace === 'none'));
  if(typeof renderBraceGrid === 'function') renderBraceGrid();
  if(typeof renderSpanEditors === 'function') renderSpanEditors();
  if(typeof renderPSpanEditors === 'function') renderPSpanEditors();
  if(typeof renderSupportMapPanel === 'function') renderSupportMapPanel();
  if(typeof renderRemoveBeamGrid === 'function') renderRemoveBeamGrid();
  try{ window.dispatchEvent(new CustomEvent('structura-topo-change')); }catch(e){}
  
  // 重置所有新注入的滑块 UI
  ['P1','P2','P3','tempAll','tempGrad','tempT0'].forEach(id => {
    const el = document.getElementById(id);
    if(el) {
      const isT0 = (id === 'tempT0');
      const v = isT0 ? 20 : 0;
      el.value = v;
      S[id] = v;
      const out = document.getElementById('v-'+id);
      if(out) out.textContent = isT0 ? '20 ℃' : (id.startsWith('P') ? '0 kN' : '0 ℃');
      updateRangeProgress(el);
    }
  });
  S.forceType = 'M';
  S.elFilter = 'all';
  S.showVals = false;
  S.showIds = false;
  S.showAntiPts = true;
  S.showPDelta = true;
  S.displayMode = 'all';
  BASE = null;
  const segBayR = document.getElementById('segBay');
  if(segBayR) segBayR.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.bay === '1'));
  const segLevR = document.getElementById('segLev');
  if(segLevR) segLevR.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.lev === '1'));
  const segCantR = document.getElementById('segCant');
  if(segCantR) segCantR.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.cant === '0'));
  const btnV = document.getElementById('btnVals');
  if(btnV) btnV.classList.remove('on');
  const btnIds = document.getElementById('btnIds');
  if(btnIds) btnIds.classList.remove('on');
  const btnAntiPts = document.getElementById('btnAntiPts');
  if(btnAntiPts) btnAntiPts.classList.add('on');
  const btnFz = document.getElementById('btnFreeze');
  if(btnFz) btnFz.classList.remove('on');
  const btnFzD = document.getElementById('btnFreezeDeform');
  if(btnFzD) btnFzD.classList.remove('on');
  const btnPD = document.getElementById('btnPDelta');
  if(btnPD) btnPD.classList.add('on');
  const stageEl = document.getElementById('stage');
  if(stageEl) stageEl.classList.remove('mode-force','mode-deform');
  const segD = document.getElementById('segDisp');
  if(segD) segD.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.disp === 'all'));
  const segH = document.getElementById('segHmode');
  if(segH) segH.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.mode === 'none'));
  const segF = document.getElementById('segForce');
  if(segF) segF.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.force === 'M'));
  const segE = document.getElementById('segElem');
  if(segE) segE.querySelectorAll('button[data-filter]').forEach(b=>b.classList.toggle('on', b.dataset.filter === 'all'));
  if(typeof syncSecTypeUI === 'function') syncSecTypeUI();
  applyTopoState();
  /* 重置后扫掠进度条需要与当前参数同步（因为 btn-reset 把 sweepProgress 重置为 0，
     但主参数比如 bc 的默认值是 400，进度条会与主滑块不一致） */
  if(typeof sweepSetValue === 'function'){
    const selEl = document.getElementById('sweepParam');
    if(selEl) S.sweep.param = selEl.value;
    const paramEl = document.getElementById(S.sweep.param);
    if(paramEl) sweepSetValue(S.sweep.param, parseFloat(paramEl.value));
  }
  if(location.hash){
    history.replaceState(null, '', location.pathname + location.search);
  }
  run();
});