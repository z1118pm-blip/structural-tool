"use strict";

let MODEL = null;
let BASE  = null;   // 冻结的基准结果（对比模式）

function getMaxInternal(model, type, filter){
  if(type === 'R'){
    let maxR = 0;
    for(let c=0; c<model.nCol; c++){
      const nd = model.nid(c, 0);
      maxR = Math.max(maxR, Math.abs(model.R[nd*3]), Math.abs(model.R[nd*3+1]), Math.abs(model.R[nd*3+2]));
    }
    return maxR;
  }
  let maxF = 0;
  for(const res of model.results){
    const el = res.el;
    if(filter === 'col'  && el.kind !== 'col')  continue;
    if(filter === 'beam' && el.kind !== 'beam') continue;
    const NP = 61;
    for(let k=0;k<=NP;k++){
      const v = Math.abs(internalAt(res, el.L*k/NP, type));
      if(v > maxF) maxF = v;
    }
  }
  return maxF;
}

function updateReadout(model){
  const p = model.p;
  
  // 增加辅助函数，仅在文本内容发生变化时才更新 DOM，防止高频扫掠时重排闪烁
  const setTxt = (id, v) => {
    const el = document.getElementById(id);
    if(el && el.textContent !== v) el.textContent = v;
  };

  setTxt('r-colsec', `柱 ${Math.round(p.bc)}×${Math.round(p.hc)} · 梁 ${Math.round(p.bb)}×${Math.round(p.hb)}`);
  setTxt('r-kmid', p.r.toFixed(2));

  {
    const box = document.getElementById('r-rhoBox');
    if(box){
      let html = '';
      for(let lv=1; lv<=model.nLev; lv++){
        const row = model.rho[lv-1] || [];
        const vals = row.map(v => v.toFixed(2)).join(' / ');
        html += `<div class="rRow"><span class="lbl">${lv} 层</span><span class="val">${vals}</span></div>`;
      }
      if(box.innerHTML !== html) box.innerHTML = html;
    }
  }

  let maxD = 0;
  for(const res of model.results){
    const el = res.el;
    const N = 26;
    for(let k=0;k<=N;k++){
      const x = el.L * k / N;
      const [dx, dy] = elemDisp(res, x);
      const d = Math.hypot(dx, dy);
      if(d > maxD) maxD = d;
    }
  }
  setTxt('r-maxD', (maxD * 1000).toFixed(3) + ' mm');

  let maxDrift = 0, driftFloor = 0;
  for(let c=0;c<model.nCol;c++){
    for(let lv=1; lv<=model.nLev; lv++){
      const uLo = model.U[model.nid(c, lv-1)*3];
      const uHi = model.U[model.nid(c, lv)*3];
      const hlv = p['h'+lv];
      const d = Math.abs(uHi - uLo) / hlv;
      if(d > maxDrift){ maxDrift = d; driftFloor = lv; }
    }
  }
  {
    let driftTxt;
    if(maxDrift > 0){
      const denom = 1 / maxDrift;
      driftTxt = denom > 1e6
        ? '1/∞（可忽略）'
        : `1/${Math.round(denom)}（${driftFloor}层）`;
    } else {
      driftTxt = '1/∞（无水平力）';
    }
    setTxt('r-drift', driftTxt);
  }

  let totalH = 0;
  for(let lv=1; lv<=model.nLev; lv++) totalH += p['H'+lv];
  let uTopAvg = 0;
  for(let c=0;c<model.nCol;c++) uTopAvg += model.U[model.nid(c, model.nLev)*3];
  uTopAvg /= model.nCol;
  setTxt('r-K', (totalH > 0 && Math.abs(uTopAvg) > 1e-12)
    ? (totalH / Math.abs(uTopAvg)).toFixed(1) + ' kN/m'
    : '—（无水平力）');

  const rowPD = document.getElementById('rowPD');
  if(p.showPDelta){
    rowPD.style.display = '';
    let sumRy = 0;
    for(let c=0;c<model.nCol;c++) sumRy += model.R[model.nid(c,0)*3 + 1];
    let hTot = 0;
    for(let lv=1; lv<=model.nLev; lv++) hTot += p['h'+lv];
    if(totalH > 0 && Math.abs(uTopAvg) > 1e-10 && Math.abs(sumRy) > 1e-6){
      // 借用当前模型，临时去掉所有竖向荷载，只施加水平力，求“纯侧移”
      // 性能优化：纯水平力工况的 uPure 仅与几何/刚度有关，与竖向荷载无关。
      // 缓存于 MODEL 上，避免扫掠或录制时每帧重复求解。
      const pPureKey = [
        p.nBay, p.nLev, p.hasCant,
        p.L1, p.L2, p.L3, p.h1, p.h2, p.h3, p.Lc,
        p.bc, p.hc, p.bb, p.hb, p.r, p.betaF, p.betaJ,
        p.H1, p.H2, p.H3, p.Hmode
      ].join('|');
      let uPure;
      if (S._uPureCache && S._uPureCache.key === pPureKey) {
        uPure = S._uPureCache.value;
      } else {
        const pPure = { ...p, q1:0, q2:0, q3:0, qc1:0, qc2:0, qc3:0 };
        try {
          const mPure = analyze(pPure);
          let uMax = 0;
          for(let c=0; c<model.nCol; c++){
            const u = Math.abs(mPure.U[model.nid(c, model.nLev)*3]);
            if(u > uMax) uMax = u;
          }
          uPure = uMax || Math.abs(uTopAvg);
        } catch(e) {
          uPure = Math.abs(uTopAvg);
        }
        S._uPureCache = { key: pPureKey, value: uPure };
      }
      
      const Ncr = totalH * hTot / Math.abs(uPure || uTopAvg);
      const ratio = Math.abs(sumRy) / Ncr;
      const B = 1 / (1 - ratio);

      /* B 和 ratio 均用原始值显示，不用 toFixed 后的 ratio 重算 B，
         避免接近失稳时 B 显示误差被放大到 100%+，
         也避免 ratio 四舍五入到 1.000 误报"已失稳"。 */
      let sign = '', bTxt, ratioTxt;
      if(ratio >= 1){
        sign = '⚠ ';
        bTxt = '>1000（已超限）';
        ratioTxt = ratio > 9.999 ? '>9.999' : ratio.toFixed(3);
      } else if(1 - ratio < 1e-4){
        bTxt = B > 10000 ? '>10000' : B.toFixed(0);
        ratioTxt = '≈1.000';
      } else if(B < 10){
        bTxt = B.toFixed(3);
        ratioTxt = ratio.toFixed(3);
      } else {
        bTxt = B.toFixed(2);
        ratioTxt = ratio.toFixed(3);
      }
      setTxt('r-pd', `${sign}${bTxt}  (ΣN/ΣN_cr = ${ratioTxt})`);
    } else {
      setTxt('r-pd', '—（无水平力或无轴力）');
    }
  } else {
    rowPD.style.display = 'none';
  }

  function allocStr(level){
    const nCol = model.nCol;
    const w = computeHShare(p, nCol, level);
    let sum = 0;
    for(const v of w) sum += v;
    return w.map(v => (v/sum*100).toFixed(0) + '%').join(' / ');
  }
  setTxt('r-alloc1', allocStr(1));
  if (model.nLev >= 2) setTxt('r-alloc2', allocStr(2));
  if (model.nLev >= 3) setTxt('r-alloc3', allocStr(3));

  /* 支座反力已移至内力图 R 标签，此处不再更新 DOM */

  let sumV = 0, sumH = 0;
  let baySum = 0;
  for(let c=0;c<model.nBay;c++) baySum += p['L'+(c+1)];
  for(let lv=1; lv<=model.nLev; lv++){
    sumV += p['q'+lv] * baySum;
    if(p.hasCant) sumV += p['qc'+lv] * p.Lc;
    sumH += p['H'+lv];
  }
  setTxt('loadSum', `ΣV = ${sumV.toFixed(1)} kN · ΣH = ${sumH.toFixed(1)} kN`);

  /* 左侧残差 UI 已移除，仅通过右下角状态栏状态展示 */
}

function run(){
  if(BASE){
    const p0 = BASE.p;
    const geoChanged = (
      p0.nBay !== S.nBay || p0.nLev !== S.nLev || p0.hasCant !== S.hasCant ||
      p0.L1 !== S.L1 || p0.L2 !== S.L2 || p0.L3 !== S.L3 ||
      p0.h1 !== S.h1 || p0.h2 !== S.h2 || p0.h3 !== S.h3 ||
      p0.Lc !== S.Lc
    );
    if(geoChanged){
      BASE = null;
      const btnFz = document.getElementById('btnFreeze');
      if(btnFz) btnFz.classList.remove('on');
      const btnFzD = document.getElementById('btnFreezeDeform');
      if(btnFzD) btnFzD.classList.remove('on');
    }
  }
  const _badge = document.getElementById('solveBadge');
  if(_badge) _badge.classList.add('on');
  try{
    const _solveT0 = performance.now();
    MODEL = analyze(S);
    MODEL.solveTime = performance.now() - _solveT0;
  }catch(err){
    console.error(err);
    MODEL = null;
    for(const id of ['cvLoad','cvForce','cvD']){
      const cv = document.getElementById(id);
      const ctx = cv.getContext('2d');
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,cv.width,cv.height);
      ctx.fillStyle = '#dc2626';
      ctx.font = 'bold 15px ui-sans-serif,system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('计算失败：' + err.message, cv.width/2, cv.height/2);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
    for(const id of ['r-colsec','r-kmid','r-maxD','r-drift','r-K','r-alloc1','r-alloc2','r-alloc3','r-pd']){
      const el = document.getElementById(id);
      if(el) el.textContent = '—';
    }
    const rhoBox = document.getElementById('r-rhoBox');
    if(rhoBox) rhoBox.innerHTML = '';
    const rf = document.getElementById('r-resid');
    if(rf) rf.textContent = '计算失败：' + err.message;
    const statusEl = document.getElementById('ssbStatus');
    if(statusEl){
      statusEl.textContent = 'FAIL';
      statusEl.classList.remove('ok');
    }
    const badge = document.getElementById('solveBadge');
    if(badge) badge.classList.remove('on');
    return;
  }

  MODEL.maxF = getMaxInternal(MODEL, S.forceType, S.elFilter);

  {
    const style = FORCE_STYLE[S.forceType];
    const tagEl = document.getElementById('tagForce');
    if(tagEl){
      if(MODEL.maxF > 1e-6){
        tagEl.textContent =
          `${style.tag} · ${style.lbl} = ${MODEL.maxF.toFixed(1)} ${style.unit}`;
      } else {
        tagEl.textContent = style.tag;
      }
    }
  }

  drawLoadDiagram(document.getElementById('cvLoad'), MODEL);
  drawInternal(document.getElementById('cvForce'), MODEL);
  drawDeform(document.getElementById('cvD'), MODEL);
  updateReadout(MODEL);
  updateStatusBar(MODEL);
  if(_badge) requestAnimationFrame(()=> _badge.classList.remove('on'));
}

function updateStatusBar(m){
  if(!m) return;
  const set = (id, v) => {
    const el = document.getElementById(id);
    if(el && el.textContent !== v) el.textContent = v;
  };
  set('ssbNodes', m.nodes.length);
  set('ssbElems', m.els.length);
  set('ssbDof',   (m.nFree != null ? m.nFree : m.U.length) + ' / ' + m.U.length);
  set('ssbTime',  (m.solveTime||0).toFixed(2) + ' ms');
  const resid = Math.max(Math.abs(m.residX), Math.abs(m.residY));
  set('ssbResid', resid.toExponential(1));
  const statusEl = document.getElementById('ssbStatus');
  if(statusEl){
    /* 相对残差：以柱脚反力量级为参考，避免小荷载误报 / 大荷载过严 */
    let refMag = 0;
    for(let c=0;c<m.nCol;c++){
      const nd = m.nid(c,0);
      refMag += Math.abs(m.R[nd*3]) + Math.abs(m.R[nd*3+1]);
    }
    const rawRefMag = refMag;
    refMag = Math.max(refMag, 1e-3); // 提升下限，避免极微小噪声被放大
    // 如果完全无荷载，直接判 OK；否则用相对残差判断
    const isZeroLoad = rawRefMag < 1e-3 && resid < 1e-6;
    const ok = isZeroLoad || (resid / refMag) < 1e-8;
    statusEl.textContent = ok ? 'OK' : 'CHECK';
    statusEl.classList.toggle('ok', ok);
  }
}

function applyTopoState(){
  const dis = (id, d) => {
    const el = document.getElementById('row-'+id);
    if(el) el.classList.toggle('is-disabled', !!d);
  };
  dis('L2', S.nBay < 2);
  dis('L3', S.nBay < 3);
  dis('h2', S.nLev < 2);
  dis('h3', S.nLev < 3);
  dis('Lc', !S.hasCant);
  dis('q2', S.nLev < 2);
  dis('q3', S.nLev < 3);
  dis('qc1', !S.hasCant);
  dis('qc2', !S.hasCant || S.nLev < 2);
  dis('qc3', !S.hasCant || S.nLev < 3);
  dis('H2', S.nLev < 2);
  dis('H3', S.nLev < 3);
  const hide = (id, on) => {
    const el = document.getElementById(id);
    if(el) el.style.display = on ? 'none' : '';
  };
  hide('row-alloc2', S.nLev < 2);
  hide('row-alloc3', S.nLev < 3);
  hide('row-R2', S.nBay < 2);
  hide('row-R3', S.nBay < 3);

  updateSweepOptions();
}

function updateSweepOptions(){
  const sel = document.getElementById('sweepParam');
  if(!sel) return;

  const req = {
    L2: ()=>S.nBay  >= 2,
    L3: ()=>S.nBay  >= 3,
    h2: ()=>S.nLev  >= 2,
    h3: ()=>S.nLev  >= 3,
    Lc: ()=>S.hasCant,
    q2: ()=>S.nLev  >= 2,
    q3: ()=>S.nLev  >= 3,
    qc1:()=>S.hasCant,
    qc2:()=>S.hasCant && S.nLev >= 2,
    qc3:()=>S.hasCant && S.nLev >= 3,
    H2: ()=>S.nLev  >= 2,
    H3: ()=>S.nLev  >= 3
  };

  let firstVisible = null;
  sel.querySelectorAll('option').forEach(opt=>{
    const f  = req[opt.value];
    const ok = f ? f() : true;
    opt.hidden   = !ok;
    opt.disabled = !ok;
    if(ok && !firstVisible) firstVisible = opt.value;
  });

  sel.querySelectorAll('optgroup').forEach(g=>{
    const any = [...g.querySelectorAll('option')].some(o=>!o.hidden);
    g.hidden = !any;
    g.style.display = any ? '' : 'none';
  });

  const cur = sel.querySelector(`option[value="${S.sweep.param}"]`);
  if((!cur || cur.hidden) && firstVisible){
    if(S.sweep.playing) sweepStop();
    S.sweep.param = firstVisible;
    sel.value     = firstVisible;
    const bar = document.getElementById('sweepBar');
    if(bar && bar.classList.contains('on')){
      const el = document.getElementById(firstVisible);
      if(el) sweepSetValue(firstVisible, parseFloat(el.min));
    }
  }
}

/* 已删除：updateModelSummary —— msTop / msSpans / msHeights 等摘要卡元素已从 HTML 移除，此函数为死代码 */

function updateTabInd(){
  const bar = document.getElementById('tabBar');
  const ind = document.getElementById('tabInd');
  if(!bar || !ind) return;
  const btns = bar.querySelectorAll('button[data-tab]');
  const idx = [...btns].findIndex(b => b.classList.contains('on'));
  if(idx < 0) return;
  const cs   = getComputedStyle(bar);
  const padL = parseFloat(cs.paddingLeft)  || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  const w    = (bar.clientWidth - padL - padR) / btns.length;
  ind.style.width = w + 'px';
  ind.style.transform = `translateX(${padL + idx * w}px)`;
}

(function bindTabs(){
  const bar = document.getElementById('tabBar');
  if(!bar) return;
  const btns = bar.querySelectorAll('button[data-tab]');
  const panels = document.querySelectorAll('.tabPanel');
  btns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const tab = btn.dataset.tab;
      btns.forEach(b => b.classList.toggle('on', b === btn));
      panels.forEach(p => p.classList.toggle('on', p.dataset.tab === tab));
      updateTabInd();
    });
  });
  window.addEventListener('resize', ()=>{ requestAnimationFrame(updateTabInd); });
})();

(function bindTabKeys(){
  const order = ['selftest','model','load'];
  document.addEventListener('keydown', e=>{
    const t = e.target;
    if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const idx = parseInt(e.key) - 1;
    if(idx >= 0 && idx < order.length){
      const bar = document.getElementById('tabBar');
      const btn = bar && bar.querySelector(`button[data-tab="${order[idx]}"]`);
      if(btn) btn.click();
    }
  });
})();

function isElemHighlighted(el, hl, model){
  if(!hl) return false;
  if(hl === 'bc' || hl === 'hc') return el.kind === 'col';
  if(hl === 'bb' || hl === 'hb') return el.kind === 'beam';
  if(hl === 'r')                 return el.kind === 'col' && el.col > 0 && el.col < model.nBay;
  if(hl === 'Lc')                return !!el.isCant;
  if(/^L[123]$/.test(hl))        return el.kind === 'beam' && !el.isCant && el.bay === parseInt(hl[1]);
  if(/^h[123]$/.test(hl))        return el.kind === 'col'  && el.lev === parseInt(hl[1]);
  if(/^q[123]$/.test(hl))        return el.kind === 'beam' && !el.isCant && el.lev === parseInt(hl[1]);
  if(/^qc[123]$/.test(hl))       return !!el.isCant && el.lev === parseInt(hl[2]);
  if(/^H[123]$/.test(hl))        return el.kind === 'col'  && el.lev === parseInt(hl[1]);
  if(hl === 'betaF')             return el.kind === 'col'  && el.lev === 1;
  if(hl === 'betaJ')             return el.kind === 'beam';
  return false;
}

(function bindTopo(){
  const bind = (segId, key, parse) => {
    const seg = document.getElementById(segId);
    if(!seg) return;
    seg.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        seg.querySelectorAll('button').forEach(b=>b.classList.remove('on'));
        btn.classList.add('on');
        S[key] = parse(btn.dataset);
        applyTopoState();
        run();
      });
    });
  };
  bind('segBay',  'nBay',    d=>parseInt(d.bay));
  bind('segLev',  'nLev',    d=>parseInt(d.lev));
  bind('segCant', 'hasCant', d=>d.cant === '1');
})();

function updateRangeProgress(el){
  const min = parseFloat(el.min);
  const max = parseFloat(el.max);
  const v   = parseFloat(el.value);
  if(!isFinite(min) || !isFinite(max) || max === min) return;
  const p = ((v - min) / (max - min)) * 100;
  el.style.setProperty('--p', p.toFixed(2) + '%');
}

const fmtMap = {
  L1: v=>v.toFixed(1)+' m',  L2: v=>v.toFixed(1)+' m',  L3: v=>v.toFixed(1)+' m',
  h1: v=>v.toFixed(1)+' m',  h2: v=>v.toFixed(1)+' m',  h3: v=>v.toFixed(1)+' m',
  Lc: v=>v.toFixed(1)+' m',
  bc: v=>v.toFixed(0)+' mm', hc: v=>v.toFixed(0)+' mm',
  bb: v=>v.toFixed(0)+' mm', hb: v=>v.toFixed(0)+' mm',
  q1: v=>v.toFixed(1)+' kN/m', q2: v=>v.toFixed(1)+' kN/m', q3: v=>v.toFixed(1)+' kN/m',
  qc1: v=>v.toFixed(1)+' kN/m', qc2: v=>v.toFixed(1)+' kN/m', qc3: v=>v.toFixed(1)+' kN/m',
  H1: v=>v.toFixed(1)+' kN',   H2: v=>v.toFixed(1)+' kN',   H3: v=>v.toFixed(1)+' kN',
  r: v=>v.toFixed(2),
  betaF: v=>v.toFixed(2),
  betaJ: v=>v.toFixed(2),
  betaF_d: v=>v.toFixed(2),
  betaJ_d: v=>v.toFixed(2),
  mScale: v=>v.toFixed(2), dScale: v=>v.toFixed(0)
};

let hlTimer = null;
const DRAW_ONLY = new Set(['mScale', 'dScale']);
function redrawOnly(key){
  if(!MODEL) return;
  if(key === 'mScale')       drawInternal(document.getElementById('cvForce'), MODEL);
  else if(key === 'dScale')  drawDeform(document.getElementById('cvD'), MODEL);
}

let dragRaf = null;

/* β 系列镜像滑块双向同步（07-run.js 的 bindRange 手动拖动也生效，
   不再只依赖 sweepSetValue / applyStateFromObj 里的手写同步）。 */
function syncMirror(id, key, v, fmt){
  if(key !== 'betaF' && key !== 'betaJ') return;
  const mirrorId = id.endsWith('_d') ? id.slice(0, -2) : id + '_d';
  const mirrorEl = document.getElementById(mirrorId);
  if(!mirrorEl) return;
  if(Math.abs(parseFloat(mirrorEl.value) - v) < 1e-9) return;
  mirrorEl.value = v;
  const mirrorOut = document.getElementById('v-' + mirrorId);
  if(mirrorOut) mirrorOut.textContent = fmt(v);
  updateRangeProgress(mirrorEl);
}

function bindRange(id, key, fmt){
  const el  = document.getElementById(id);
  const out = document.getElementById('v-'+id);
  if(!el || !out) return;
  updateRangeProgress(el);
  el.addEventListener('input', ()=>{
    if(S.sweep && S.sweep.playing) sweepStop();
    S[key] = parseFloat(el.value);
    out.textContent = fmt(S[key]);
    updateRangeProgress(el);
    syncMirror(id, key, S[key], fmt);

    if(DRAW_ONLY.has(key)){
      redrawOnly(key);
      return;
    }
    S.highlight = key;
    if(hlTimer) clearTimeout(hlTimer);
    hlTimer = setTimeout(()=>{
      if(S.highlight === key) S.highlight = null;
      hlTimer = null;
      run();
    }, 500);

    if(dragRaf) return;
    dragRaf = requestAnimationFrame(()=>{
      dragRaf = null;
      run();
    });
  });
  S[key] = parseFloat(el.value);
  out.textContent = fmt(S[key]);
}

bindRange('L1','L1', v=>v.toFixed(1)+' m');
bindRange('L2','L2', v=>v.toFixed(1)+' m');
bindRange('L3','L3', v=>v.toFixed(1)+' m');
bindRange('h1','h1', v=>v.toFixed(1)+' m');
bindRange('h2','h2', v=>v.toFixed(1)+' m');
bindRange('h3','h3', v=>v.toFixed(1)+' m');
bindRange('Lc','Lc', v=>v.toFixed(1)+' m');
bindRange('bc','bc', v=>v.toFixed(0)+' mm');
bindRange('hc','hc', v=>v.toFixed(0)+' mm');
bindRange('bb','bb', v=>v.toFixed(0)+' mm');
bindRange('hb','hb', v=>v.toFixed(0)+' mm');
bindRange('q1','q1', v=>v.toFixed(1)+' kN/m');
bindRange('q2','q2', v=>v.toFixed(1)+' kN/m');
bindRange('q3','q3', v=>v.toFixed(1)+' kN/m');
bindRange('qc1','qc1', v=>v.toFixed(1)+' kN/m');
bindRange('qc2','qc2', v=>v.toFixed(1)+' kN/m');
bindRange('qc3','qc3', v=>v.toFixed(1)+' kN/m');
bindRange('H1','H1', v=>v.toFixed(1)+' kN');
bindRange('H2','H2', v=>v.toFixed(1)+' kN');
bindRange('H3','H3', v=>v.toFixed(1)+' kN');
bindRange('r','r', v=>v.toFixed(2));
bindRange('betaF','betaF', v=>v.toFixed(2));
bindRange('betaJ','betaJ', v=>v.toFixed(2));
bindRange('mScale','mScale', v=>v.toFixed(2));
bindRange('dScale','dScale', v=>v.toFixed(0));
bindRange('betaF_d','betaF', v=>v.toFixed(2));
bindRange('betaJ_d','betaJ', v=>v.toFixed(2));