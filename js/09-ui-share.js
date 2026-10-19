"use strict";

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
      BASE = {
        nodes: MODEL.nodes, els: MODEL.els,
        results: MODEL.results, U: MODEL.U,
        p: { ...MODEL.p,
             braceMap: { ...MODEL.p.braceMap },
             braceTensionMap: { ...MODEL.p.braceTensionMap },
             qSpanMap: { ...(MODEL.p.qSpanMap || {}) },
             pLoadMap: { ...(MODEL.p.pLoadMap || {}) } }
      };
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

const SHARE_KEYS = [
  'nBay','nLev','hasCant',
  'L1','L2','L3','h1','h2','h3','Lc',
  'bc','hc','bb','hb','r',
  'q1','q2','q3','qSpanMap','P1','P2','P3','pLoadMap',
  'qc1','qc2','qc3','H1','H2','H3',
  'tempAll','tempGrad','tempT0',
  'Hmode','settleDy','settleCol','braceMap','braceTensionMap','brushBrace','betaF','betaJ',
  'frameMat','braceMat','As','axialMode',
  'mScale','dScale','forceType','elFilter','displayMode',
  'showVals','showIds','showAntiPts','showPDelta'
];

function encodeState(){
  const obj = {};
  const defaults = {
    nBay: 1, nLev: 1, hasCant: false,
    L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5,
    bc: 400, hc: 400, bb: 250, hb: 500, r: 1,
    q1: 0, q2: 0, q3: 0, qSpanMap: {},
    P1: 0, P2: 0, P3: 0, pLoadMap: {},
    qc1: 0, qc2: 0, qc3: 0,
    H1: 0, H2: 0, H3: 0, Hmode: 'none', settleDy: 0, settleCol: 0,
    tempAll: 0, tempGrad: 0, tempT0: 20,
    braceMap: {}, braceTensionMap: {}, brushBrace: 'none',
    betaF: 1, betaJ: 1, frameMat: 'conc', braceMat: 'steel',
    As: 2000, axialMode: 'real', mScale: 1, dScale: 30,
    forceType: 'M', elFilter: 'all', displayMode: 'all',
    showVals: false, showIds: false, showAntiPts: true, showPDelta: true
  };

  for(const k of SHARE_KEYS) {
    const def = defaults[k];
    const val = S[k];

    if (typeof def === 'object' && def !== null) {
      if (val && Object.keys(val).length > 0) {
        obj[k] = val;
      }
    } else {
      if (val !== def) {
        obj[k] = val;
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
  if(!S.hasCant){ obj.Lc = 1.5; obj.qc1 = 0; obj.qc2 = 0; obj.qc3 = 0; }
  if(!(obj.settleDy > 0)){ obj.settleDy = 0; obj.settleCol = 0; }
  try{
    return btoa(JSON.stringify(obj))
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
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while(b64.length % 4) b64 += '=';
    const obj = JSON.parse(atob(b64));
    if(!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    return obj;
  }catch(e){ return null; }
}

function applyStateFromObj(obj){
  if(!obj) return false;

  /* 先把所有可分享字段重置为默认值，防止分享链接省略默认值时，
     继承当前页面残留的支撑/荷载/显示开关等脏状态。 */
  const DEFAULTS = {
    nBay: 1, nLev: 1, hasCant: false,
    L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5,
    bc: 400, hc: 400, bb: 250, hb: 500, r: 1,
    q1: 0, q2: 0, q3: 0, qSpanMap: {},
    P1: 0, P2: 0, P3: 0, pLoadMap: {},
    qc1: 0, qc2: 0, qc3: 0,
    H1: 0, H2: 0, H3: 0, Hmode: 'none', settleDy: 0, settleCol: 0,
    tempAll: 0, tempGrad: 0, tempT0: 20,
    braceMap: {}, braceTensionMap: {}, brushBrace: 'none',
    betaF: 1, betaJ: 1, frameMat: 'conc', braceMat: 'steel',
    As: 2000, axialMode: 'real', mScale: 1, dScale: 30,
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
            if(lv >= 1 && lv <= S.nLev && c >= 1 && c <= S.nBay &&
               isFinite(P) && P >= 0 && P <= 200 &&
               isFinite(a) && a > 0 && a < Lmax){
              clean[kk] = { P, a };
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
      const n = parseFloat(v);
      if(!isFinite(n)) continue;
      const el = document.getElementById(k);
      if(el && el.type === 'range'){
        const lo = parseFloat(el.min), hi = parseFloat(el.max);
        S[k] = Math.max(lo, Math.min(hi, n));
      } else {
        S[k] = n;
      }
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

  /* settleCol 越界钳制到当前柱数范围；settleDy 钳制到 0–100 mm */
  if(typeof S.settleCol !== 'number' || isNaN(S.settleCol)){
    S.settleCol = 0;
  } else {
    S.settleCol = Math.max(0, Math.min(S.nBay, S.settleCol | 0));
  }
  if(typeof S.settleDy !== 'number' || isNaN(S.settleDy)){
    S.settleDy = 0;
  } else {
    S.settleDy = Math.max(0, Math.min(100, S.settleDy));
  }

  applyTopoState();

  // 逐跨滑块重渲染（分享链接可能携带 qSpanMap / pLoadMap）
  if(typeof renderSpanEditors === 'function') renderSpanEditors();
  if(typeof renderPSpanEditors === 'function') renderPSpanEditors();

  // 清理可能残留的扫掠慢放倍率和高亮状态（防止分享链接或自检后污染普通扫掠）
  S.sweep.durMul = 1;
  S.highlight = null;

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
   游戏入口（彩蛋）：左侧悬浮侧边按钮，独立标签页打开 game.html
   - 默认半隐藏，hover 滑出；录制中锁定（is-locked + click 拦截）
   - 扫掠播放中点击先 sweepStop()，避免后台 rAF 空转
   - 相对路径，file:// / https:// 均可用；rel=noopener 防 opener 污染
   - showToast 定义在 10-boot.js，但此处仅在 click 回调内引用（运行时），
     那时 10-boot.js 已加载完毕，不存在 undefined 风险
   ===================================================================== */
(function bindGameSideBtn(){
  const a = document.createElement('a');
  a.id = 'gameSideBtn';
  a.href = 'game.html';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = '应力释放 · 摸鱼彩蛋';

  const icon = document.createElement('span');
  icon.className = 'gsbIcon';
  icon.textContent = '🎮';
  const txt = document.createElement('span');
  txt.className = 'gsbText';
  txt.textContent = '摸鱼';
  a.appendChild(icon);
  a.appendChild(txt);

  a.addEventListener('click', (e) => {
    if (S.rec.active) {
      e.preventDefault();
      if (typeof showToast === 'function') {
        showToast('录制进行中，游戏入口已锁定。请先停止录制。');
      }
      return;
    }
    if (S.sweep.playing) sweepStop();
    // target="_blank" 默认行为放行，由浏览器开新标签
  });

  document.body.appendChild(a);
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
  S.frameMat = 'conc';
  S.braceMat = 'steel';
  S.axialMode = 'real';
  S.As = 2000;
  S.braceTensionMap = {};
  S.braceMap = {};
  S.qSpanMap = {};
  S.pLoadMap = {};
  S.P1 = 0; S.P2 = 0; S.P3 = 0;
  S.tempAll = 0; S.tempGrad = 0; S.tempT0 = 20;
  S.brushBrace = 'none';
  S.settleDy = 0;
  S.settleCol = 0;
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
  try{ window.dispatchEvent(new CustomEvent('structura-topo-change')); }catch(e){}
  
  // 重置所有新注入的滑块 UI
  ['P1','P2','P3','tempAll','tempGrad'].forEach(id => {
    const el = document.getElementById(id);
    if(el) {
      el.value = 0;
      const out = document.getElementById('v-'+id);
      if(out) out.textContent = id.startsWith('P') ? '0 kN' : '0 ℃';
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