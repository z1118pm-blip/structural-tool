"use strict";

let MODEL = null;
let BASE  = null;   // 冻结的基准结果（对比模式）

function getMaxInternal(model, type, filter){
  if(type === 'R'){
    let maxR = 0;
    for(let c=0; c<model.nCol; c++){
      const nd = model.nid(c, 0);
      /* 仅统计水平/竖向反力（kN）；弯矩反力为 kN·m，量纲不同，
         不参与 |R|max 计算，否则标签单位与实际最大箭头长度不匹配。 */
      maxR = Math.max(maxR, Math.abs(model.R[nd*3]), Math.abs(model.R[nd*3+1]));
    }
    return maxR;
  }

  let maxF = 0;
  for(const res of model.results){
    const el = res.el;
    if(filter === 'col'  && el.kind !== 'col')  continue;
    if(filter === 'beam' && el.kind !== 'beam') continue;
    if(filter === 'brace' && el.kind !== 'brace') continue;
    const NP = 61;
    for(let k=0;k<=NP;k++){
      const v = Math.abs(internalAt(res, el.L*k/NP, type));
      if(v > maxF) maxF = v;
    }
  }
  return maxF;
}

function updateReadout(model, skipAux){
  const p = model.p;
  
  // 增加辅助函数，仅在文本内容发生变化时才更新 DOM，防止高频扫掠时重排闪烁
  const setTxt = (id, v) => {
    const el = document.getElementById(id);
    if(el && el.textContent !== v) el.textContent = v;
  };

  let colTxt = p.colSecType === 'HW' ? `${p.colHW}(${p.colAxis==='strong'?'强':'弱'}轴)` : `${Math.round(p.bc)}×${Math.round(p.hc)}`;
  let beamTxt = p.beamSecType === 'HN' ? p.beamHN : `${Math.round(p.bb)}×${Math.round(p.hb)}`;
  setTxt('r-colsec', `柱 ${colTxt} · 梁 ${beamTxt}`);
  setTxt('r-kmid', p.r.toFixed(2));
  
  /* 支撑截面积显示（有支撑时才显示） */
  const hasBrace = Object.keys(p.braceMap || {}).some(k => p.braceMap[k] && p.braceMap[k] !== 'none');
  const rowBraceSec = document.getElementById('row-bracesec');
  if(rowBraceSec) {
    rowBraceSec.style.display = hasBrace ? '' : 'none';
    if(hasBrace) setTxt('r-bracesec', Math.round(p.As) + ' mm²');
  }

  {
    const box = document.getElementById('r-rhoBox');
    if(box){
      if(box.children.length !== model.nLev){
        let html = '';
        for(let lv=1; lv<=model.nLev; lv++){
          html += `<div class="rRow"><span class="lbl">${lv} 层</span><span class="val" id="rho-val-${lv}">—</span></div>`;
        }
        box.innerHTML = html;
      }
      for(let lv=1; lv<=model.nLev; lv++){
        const row = model.rho[lv-1] || [];
        const vals = row.map(v => v === null ? '<span style="color:#f43f5e">无梁</span>' : v.toFixed(2)).join(' / ');
        const valEl = document.getElementById('rho-val-' + lv);
        if(valEl && valEl.innerHTML !== vals) valEl.innerHTML = vals;
      }

      /* ===== 林同炎概念：刚度匹配与体系判断 ===== */
      let sumRho = 0, countRho = 0;
      let hasRemovedBeam = false;
      for (const row of model.rho) {
        for (const val of row) { 
          if (val === null) { hasRemovedBeam = true; continue; }
          sumRho += val; countRho++; 
        }
      }
      const avgRho = countRho > 0 ? (sumRho / countRho) : 1;
      
      let sysType = "—";
      let sysDesc = "—";
      let sysColor = "#cbd5e1";
      
      if (hasRemovedBeam) {
        sysType = "局部穿层/抽梁体系";
        sysDesc = "存在梁被移除的楼层，该处柱计算长度增加，侧向刚度局部削弱。";
        sysColor = "#f43f5e";
      } else if (p.betaJ <= BETA_HINGE) {
        sysType = "铰接排架体系";
        sysDesc = "梁端不传弯矩，侧向刚度完全依赖支撑或柱脚固接。";
        sysColor = "#f87171";
      } else if (p.betaJ < BETA_FIXED) {
        sysType = "半刚接框架";
        sysDesc = "节点传递部分弯矩，侧向刚度介于刚接与排架之间。";
        sysColor = "#fbbf24";
      } else {
        if (avgRho < 0.5) {
          sysType = "强柱弱梁 (弯曲型)";
          sysDesc = "柱线刚度占优，整体侧移由柱轴向变形主导。";
          sysColor = "#38bdf8";
        } else if (avgRho <= 2.0) {
          sysType = "典型刚接框架 (剪切型)";
          sysDesc = "梁柱刚度匹配，整体侧移由梁柱弯曲变形主导。";
          sysColor = "#4ade80";
        } else {
          sysType = "强梁弱柱 (剪切型)";
          sysDesc = "梁线刚度显著偏大，地震下需警惕柱端过早形成塑性铰。";
          sysColor = "#f87171";
        }
      }

      setTxt('r-systemType', sysType);
      const sysEl = document.getElementById('r-systemType');
      if (sysEl) sysEl.style.color = sysColor;
      setTxt('r-systemDesc', sysDesc);
      /* ======================================= */
    }
  }

  let maxDx = 0, maxRigidDy = 0;
  let maxBendDy = 0;
  let maxDyRatio = 0;
  
  for(const res of model.results){
    const el = res.el;
    if (el.kind === 'brace') continue; // 支撑不参与竖向挠度判定
    
    const N = 26;
    const uyi = res.ug[1];
    const uyj = res.ug[4];
    
    for(let k=0;k<=N;k++){
      const xi = k / N;
      const x = el.L * xi;
      const [dx, dy] = elemDisp(res, x);
      
      // 1. 记录最大侧移与最大绝对竖向刚体位移
      if(Math.abs(dx) > Math.abs(maxDx)) maxDx = dx;
      if(Math.abs(dy) > Math.abs(maxRigidDy)) maxRigidDy = dy;
      
      // 2. 剥离刚体位移，计算真实受弯挠度（仅针对梁）
      if (el.kind === 'beam') {
        let dy_chord;
        if (el.isCant) {
          // 悬挑梁：弦线取根部切线（全局转角逆时针为正，沿 +x 方向位移为 +theta * x）
          const theta_i = res.ug[2];
          dy_chord = uyi + theta_i * x;
        } else {
          if (el.startOffset != null && el.spanL != null && model.nid) {
            // 集中力打断梁：使用整跨真实端点的弦线
            const nodeL = model.nid(el.bay - 1, el.lev);
            const nodeR = model.nid(el.bay, el.lev);
            const uy_global_i = model.U[nodeL * 3 + 1];
            const uy_global_j = model.U[nodeR * 3 + 1];
            const xRatioFull = (el.startOffset + x) / el.spanL;
            dy_chord = (1 - xRatioFull) * uy_global_i + xRatioFull * uy_global_j;
          } else {
            // 跨内完整梁：弦线取两端节点刚体插值
            dy_chord = (1 - xi) * uyi + xi * uyj;
          }
        }
        const dy_bend = Math.abs(dy - dy_chord);
        
        if (dy_bend > maxBendDy) maxBendDy = dy_bend;
        const L_check = (el.spanL != null) ? el.spanL : el.L;
        const ratio = dy_bend / L_check;
        if (ratio > maxDyRatio) maxDyRatio = ratio;
      }
    }
  }
  
  setTxt('r-maxDx', (Math.abs(maxDx) * 1000).toFixed(2) + ' mm');
  
  const rigidDyMm = Math.abs(maxRigidDy) * 1000;
  setTxt('r-rigidDy', rigidDyMm.toFixed(2) + ' mm');
  
  /* 使用剥离后的“最大受弯挠度”进行跨比判定 (SLS) */
  const bendDyMm = Math.abs(maxBendDy) * 1000;
  const dyLimit = 1 / 200;
  model.isDeformFail = (maxDyRatio > dyLimit);
  model.dyRatioValue = maxDyRatio;
  
  const elDy = document.getElementById('r-maxDy');
  if(elDy) {
    if(maxDyRatio > dyLimit) {
      elDy.innerHTML = `<span style="background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.6); padding:1px 6px; border-radius:4px; color:#f87171;">${bendDyMm.toFixed(2)} mm ⚠️超限</span>`;
      elDy.style.color = '#f87171';
      elDy.title = `挠跨比 1/${Math.round(1/maxDyRatio)}，已超规范限值 1/200`;
    } else {
      elDy.textContent = `${bendDyMm.toFixed(2)} mm`;
      elDy.style.color = ''; 
      elDy.title = maxDyRatio > 1e-9 ? `挠跨比 1/${Math.round(1/maxDyRatio)}` : '挠跨比 ≈ 0';
    }
  }

  /* 逐层收集层间位移角最大值（与 maxDrift 口径一致），挂到 model 上供变形图小图使用 */
  const floorDrifts = new Float64Array(model.nLev + 1);
  let maxDrift = 0, driftFloor = 0;
  for(let c=0;c<model.nCol;c++){
    for(let lv=1; lv<=model.nLev; lv++){
      const uLo = model.U[model.nid(c, lv-1)*3];
      const uHi = model.U[model.nid(c, lv)*3];
      const hlv = p['h'+lv];
      const d = Math.abs(uHi - uLo) / hlv;
      if(d > floorDrifts[lv]) floorDrifts[lv] = d;
      if(d > maxDrift){ maxDrift = d; driftFloor = lv; }
    }
  }
  /* model.floorDrifts 已删除：无下游读取，本地 floorDrifts 仅供下方 DOM 列表使用 */
  {
    // 生成带虚线引导和对齐的动态逐层列表
    const listEl = document.getElementById('r-drift-list');
    if(listEl){
      const expectedRows = model.nLev;
      const actualRows = listEl.querySelectorAll('[id^="drift-row-"]').length;
      if(!listEl.querySelector('.drift-header') || actualRows !== expectedRows){
        let html = `<div class="drift-header" style="color:#94a3b8; font-weight:600; margin-bottom:2px;">层间位移角 θ</div>`;
        for(let lv=1; lv<=model.nLev; lv++){
          html += `<div style="display:flex; align-items:baseline; color:#e2e8f0;" id="drift-row-${lv}">
            <span class="drift-lv" style="color:#94a3b8; font-weight:400; width:26px;">${lv}层</span>
            <span class="drift-line" style="flex:1; border-bottom:1px dashed #475569; margin:0 6px; position:relative; top:-3px; opacity:0.7;"></span>
            <span class="drift-val" style="font-weight:600;">—</span>
          </div>`;
        }
        listEl.innerHTML = html;
      }
      
      for(let lv=1; lv<=model.nLev; lv++){
        const d = floorDrifts[lv];
        let vTxt = '≈0';
        if (d > 1e-6) {
           const denom = Math.round(1 / d);
           vTxt = denom > 999999 ? '≈0' : `1/${denom}`;
        }
        const isWorst = (lv === driftFloor && maxDrift > 1e-6);
        const color = isWorst ? '#f97316' : '#e2e8f0';
        const dotColor = isWorst ? '#f97316' : '#475569';
        
        const rowEl = document.getElementById('drift-row-' + lv);
        if(rowEl){
          rowEl.style.color = color;
          const lvEl = rowEl.querySelector('.drift-lv');
          if(lvEl) lvEl.style.fontWeight = isWorst ? '600' : '400';
          const lineEl = rowEl.querySelector('.drift-line');
          if(lineEl) lineEl.style.borderBottomColor = dotColor;
          const valEl = rowEl.querySelector('.drift-val');
          if(valEl) {
            const targetTxt = vTxt + (isWorst ? ' (最大)' : '');
            if(valEl.textContent !== targetTxt) valEl.textContent = targetTxt;
          }
        }
      }
    }
  }

  let totalH = 0;
  for(let lv=1; lv<=model.nLev; lv++) totalH += p['H'+lv];
  let uTopAvg = 0;
  for(let c=0;c<model.nCol;c++) uTopAvg += model.U[model.nid(c, model.nLev)*3];
  uTopAvg /= model.nCol;
  setTxt('r-K', (totalH > 0 && Math.abs(uTopAvg) > 1e-12)
    ? (totalH / Math.abs(uTopAvg)).toFixed(1) + ' kN/m'
    : '—（无水平力）');

  /* ============ 刚度贡献分解 ============ */
  /* 口径与 r-K 一致：三个 K 均用当前工况 uTopAvg 反算。
     去支撑 / 去梁 = 浅覆盖参数临时重算，不碰主求解器。
     扫掠中跳过（额外 2 次 analyze 会拖慢帧率），sweepStop 后自动补算。 */
  {
    const kAllEl = document.getElementById('r-Kall');
    const kNbEl  = document.getElementById('r-Knobrace');
    const kNmEl  = document.getElementById('r-Knobeam');
    if(kAllEl && kNbEl && kNmEl){
      if(!(totalH > 0) || Math.abs(uTopAvg) <= 1e-12){
        setTxt('r-Kall', '—（无水平力）');
        setTxt('r-Knobrace', '—');
        setTxt('r-Knobeam', '—');
      } else if(skipAux){
        setTxt('r-Kall', '—（播放中）');
        setTxt('r-Knobrace', '—');
        setTxt('r-Knobeam', '—');
      } else if(S.sweep && S.sweep.playing){
        setTxt('r-Kall', '—（扫掠中）');
        setTxt('r-Knobrace', '—');
        setTxt('r-Knobeam', '—');
      } else if(S._lastSliderInput && performance.now() - S._lastSliderInput < 200){
        /* 滑块拖动中：跳过刚度分解（额外 2 次 analyze 会拖慢帧率），
           拖动停止 200ms 后的 run() 会自动补算。 */
        setTxt('r-Kall', '—（拖动中）');
        setTxt('r-Knobrace', '—');
        setTxt('r-Knobeam', '—');
      } else {
        const K_all = totalH / Math.abs(uTopAvg);
        setTxt('r-Kall', K_all.toFixed(1) + ' kN/m');

        /* hasBrace 已在函数顶部计算，直接复用，避免重复遍历 */
        const cacheKey = [
          p.nBay, p.nLev, p.hasCant,
          p.L1, p.L2, p.L3, p.h1, p.h2, p.h3, p.Lc,
          p.colSecType, p.colHW, p.colAxis, p.beamSecType, p.beamHN,
          p.bc, p.hc, p.bb, p.hb, p.r, p.betaF, p.betaJ,
          p.H1, p.H2, p.H3, p.Hmode,
          p.q1, p.q2, p.q3, p.qc1, p.qc2, p.qc3,
          p.P1, p.P2, p.P3,
          JSON.stringify(p.qSpanMap || {}),
          JSON.stringify(p.pLoadMap || {}),
          p.tempAll, p.tempGrad,
          p.settleDy, p.settleCol,
          p.frameMat, p.braceMat, p.As, p.braceI, p.axialMode,
          JSON.stringify(p.braceMap || {}),
          JSON.stringify(p.braceTensionMap || {}),
          JSON.stringify(p.supportMap || {}),
          JSON.stringify(p.removeBeamMap || {}),
          JSON.stringify(p.movingLoad || {})
        ].join('|');

        let K_nobrace, K_nobeam, errNB = null, errNM = null;
        const cached = S._stiffDecompCache;
        if(cached && cached.key === cacheKey){
          K_nobrace = cached.K_nobrace;
          K_nobeam  = cached.K_nobeam;
          errNB     = cached.errNB;
          errNM     = cached.errNM;
        } else {
          if(hasBrace){
            try{
              /* 求“去支撑刚度”时，需清除非荷载作用产生的初始侧移，否则刚度会被严重污染 */
              /* 去支撑求解：保留支座类型（含弹簧 betaF），只清强迫位移；
                 禁用移动荷载以免混入跨内集中力。 */
              const _nbSM = {};
              for(const kk of Object.keys(p.supportMap || {})){
                const ee = p.supportMap[kk] || {};
                _nbSM[kk] = {};
                if(ee.type && ee.type !== 'auto') _nbSM[kk].type = ee.type;
                if(ee.betaF != null) _nbSM[kk].betaF = ee.betaF;
              }
              const pPureNB = { ...p, braceMap: {}, braceTensionMap: {}, settleDy: 0, settleCol: 0, tempAll: 0, tempGrad: 0, q1:0, q2:0, q3:0, qc1:0, qc2:0, qc3:0, qSpanMap:{}, supportMap: _nbSM, movingLoad: { ...(p.movingLoad || {}), enabled:false, playing:false, P:0 } };
              const mNB = analyze(pPureNB);
              let uAvg = 0;
              for(let c=0;c<mNB.nCol;c++) uAvg += mNB.U[mNB.nid(c, mNB.nLev)*3];
              uAvg /= mNB.nCol;
              K_nobrace = Math.abs(uAvg) > 1e-12 ? totalH / Math.abs(uAvg) : null;
            }catch(e){ K_nobrace = null; errNB = e.message; }
          } else {
            K_nobrace = null;
          }
          try{
            let anyTension = false;
            for(const k of Object.keys(p.braceMap)){
              if(p.braceMap[k] && p.braceMap[k] !== 'none' && p.braceTensionMap[k]){
                anyTension = true; break;
              }
            }
            /* 求“去梁刚度”时，必须临时清空集中力，否则会触发 solver 的“全铰接+集中力=机构”的安全拦截 */
            const _nbSM2 = {};
            for(const kk of Object.keys(p.supportMap || {})){
              const ee = p.supportMap[kk] || {};
              _nbSM2[kk] = {};
              if(ee.type && ee.type !== 'auto') _nbSM2[kk].type = ee.type;
              if(ee.betaF != null) _nbSM2[kk].betaF = ee.betaF;
            }
            const pPureStiff = { ...p, betaJ: 0, settleDy: 0, settleCol: 0, tempAll: 0, tempGrad: 0, P1: 0, P2: 0, P3: 0, pLoadMap: {}, q1:0, q2:0, q3:0, qc1:0, qc2:0, qc3:0, qSpanMap:{}, supportMap: _nbSM2, movingLoad: { ...(p.movingLoad || {}), enabled:false, playing:false, P:0 } };
            const mNM = anyTension ? analyzeTensionOnly(pPureStiff) : analyze(pPureStiff);
            let uAvg = 0;
            for(let c=0;c<mNM.nCol;c++) uAvg += mNM.U[mNM.nid(c, mNM.nLev)*3];
            uAvg /= mNM.nCol;
            K_nobeam = Math.abs(uAvg) > 1e-12 ? totalH / Math.abs(uAvg) : null;
          }catch(e){ K_nobeam = null; errNM = e.message; }

          S._stiffDecompCache = { key: cacheKey, K_nobrace, K_nobeam, errNB, errNM };
        }

        if(!hasBrace){
          setTxt('r-Knobrace', '—（无支撑）');
        } else if(errNB){
          const isInst = errNB.includes('奇异') || errNB.includes('失稳') || errNB.includes('回代失败');
          setTxt('r-Knobrace', isInst ? '失稳' : '异常');
        } else if(K_nobrace === null){
          setTxt('r-Knobrace', '—');
        } else {
          const drop = (K_all - K_nobrace) / K_all * 100;
          setTxt('r-Knobrace', `${K_nobrace.toFixed(1)} kN/m  (↓${drop.toFixed(0)}%)`);
        }

        if(errNM){
          const isInst = errNM.includes('奇异') || errNM.includes('失稳') || errNM.includes('回代失败');
          setTxt('r-Knobeam', isInst ? '失稳' : '异常');
        } else if(K_nobeam === null){
          setTxt('r-Knobeam', '—');
        } else {
          const drop = (K_all - K_nobeam) / K_all * 100;
          setTxt('r-Knobeam', `${K_nobeam.toFixed(1)} kN/m  (↓${drop.toFixed(0)}%)`);
        }
      }
    }
  }

  const rowPD = document.getElementById('rowPD');
  if(p.showPDelta && rowPD){
    rowPD.style.display = '';
    let sumRy = 0;
    for(let c=0;c<model.nCol;c++) sumRy += model.R[model.nid(c,0)*3 + 1];
    let hTot = 0;
    for(let lv=1; lv<=model.nLev; lv++) hTot += p['h'+lv];
    if(totalH > 0 && Math.abs(uTopAvg) > 1e-10 && Math.abs(sumRy) > 1e-6){
/* 借用当前模型，临时去掉所有竖向荷载，只施加水平力，求“纯侧移” */
  /* (注：Hmode 现已统一为 none/rigid，不再受 D 值法影响) */
      // 性能优化：纯水平力工况的 uPure 仅与几何/刚度有关，与竖向荷载无关。
      // 缓存于 MODEL 上，避免扫掠或录制时每帧重复求解。
      /* P-Δ 纯水平工况：保留支座类型（含弹簧 betaF），剥离所有强迫位移，
         并显式禁用移动荷载——否则 movingLoad 会覆盖 P1/P2/P3 混入跨内集中力，
         使 uPure 被污染、Ncr 偏小、B 值虚高。 */
      const _pureSM = {};
      for(const kk of Object.keys(p.supportMap || {})){
        const ee = p.supportMap[kk] || {};
        _pureSM[kk] = {};
        if(ee.type && ee.type !== 'auto') _pureSM[kk].type = ee.type;
        if(ee.betaF != null) _pureSM[kk].betaF = ee.betaF;
      }
      const pPureKey = [
        p.nBay, p.nLev, p.hasCant,
        p.L1, p.L2, p.L3, p.h1, p.h2, p.h3, p.Lc,
        p.colSecType, p.colHW, p.colAxis, p.beamSecType, p.beamHN,
        p.bc, p.hc, p.bb, p.hb, p.r, p.betaF, p.betaJ,
        p.H1, p.H2, p.H3, p.Hmode,
        p.frameMat, p.braceMat, p.As, p.braceI, p.axialMode,
        JSON.stringify(p.braceMap || {}),
        JSON.stringify(p.braceTensionMap || {}),
        JSON.stringify(p.removeBeamMap || {}),
        JSON.stringify(_pureSM)
      ].join('|');
      let uPure;
      if (S._uPureCache && S._uPureCache.key === pPureKey) {
        uPure = S._uPureCache.value;
      } else if(skipAux || (S.sweep && S.sweep.playing) || (S._lastSliderInput && performance.now() - S._lastSliderInput < 200)){
        /* 扫掠/拖动中跳过纯侧向刚度反算，避免逐帧额外 analyze 拖慢帧率；
           扫掠结束后 sweepStop 会触发 scheduleRender() 补算到准确值 */
        uPure = Math.abs(uTopAvg) || 1e-9;
      } else {
      const pPure = { ...p, q1:0, q2:0, q3:0, qc1:0, qc2:0, qc3:0,
                      qSpanMap:{}, P1:0, P2:0, P3:0, pLoadMap:{},
                      tempAll:0, tempGrad:0,
                      settleDy:0, settleCol:0,
                      supportMap: _pureSM,
                      movingLoad: { ...(p.movingLoad || {}), enabled:false, playing:false, P:0 } };
      /* 统一用倒三角分布重新施加水平力，消除 H1/H2/H3 分布差异对 Ncr 反推的干扰。
         Ncr = totalH * hTot / uPure 的隐含假定是倒三角加载。 */
      {
        let _sH = 0;
        for(let _lv=1; _lv<=p.nLev; _lv++) _sH += _lv;
        for(let _lv=1; _lv<=p.nLev; _lv++){
          pPure['H'+_lv] = totalH * _lv / _sH;
        }
      }
        try {
          let anyTension = false;
          for(const k of Object.keys(pPure.braceMap)){
            if(pPure.braceMap[k] && pPure.braceMap[k] !== 'none' && pPure.braceTensionMap[k]){
              anyTension = true; break;
            }
          }
          const mPure = anyTension ? analyzeTensionOnly(pPure) : analyze(pPure);
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

      /* 动态更新总重力与临界力显示 */
      const sumRy_kN = Math.abs(sumRy).toFixed(0);
      const nCr_kN = Number.isFinite(Ncr) ? Ncr.toFixed(0) : '∞';
      setTxt('r-totalN', `${sumRy_kN} kN`);
      setTxt('r-Ncr', `${nCr_kN} kN`);

      /* B 和 ratio 均用原始值显示，不用 toFixed 后的 ratio 重算 B，
         避免接近失稳时 B 显示误差被放大到 100%+，
         也避免 ratio 四舍五入到 1.000 误报"已失稳"。 */
      let bTxt = '', bColor = '#38bdf8', descTxt = '';
      const ratioTxt = ratio > 9.999 ? '>9.999' : ratio.toFixed(3);
      
      if(ratio >= 1){
         bTxt = '⚠ 已失稳'; bColor = '#ef4444';
         descTxt = `轴力已超临界力 (ΣN/ΣN_cr=${ratioTxt})`;
      } else if (1 - ratio < 1e-4) {
         bTxt = '极度危险'; bColor = '#ef4444';
         descTxt = `轴力逼近临界力 100% (ΣN/ΣN_cr=${ratioTxt})`;
      } else if (B < 1.05) {
         bTxt = '≈ 1.00 倍';
         descTxt = '无二阶放大效应';
      } else {
         const bNum = B > 10 ? B.toFixed(1) : B.toFixed(2);
         const pct = (ratio * 100).toFixed(0);
         let status = '';
         if (ratio > 0.9) status = '，余量极小⚠️';
         else if (ratio > 0.75) status = '，余量较小';
         else status = '，较为安全';

         bTxt = `${bNum} 倍`;
         bColor = B < 5 ? '#fbbf24' : '#ef4444';
         
         // 上面已经计算了并显示了 nCr 和 sumRy，这里文字精简为解释原理
         descTxt = `右图（一阶结果）的侧移、弯矩及剪力需放大 ${bNum} 倍。<br>
         <span style="font-size:10px;color:#94a3b8;display:block;margin-top:4px;line-height:1.4;">
         二阶效应会自我放大：侧移越大，附加弯矩越大，进而导致更大的侧移。当前重力已达临界力的 ${pct}%，结构正在逼近失稳。
         </span>`;
      }
      
      const pdEl = document.getElementById('r-pd');
      if (pdEl) {
        if (pdEl.textContent !== bTxt) pdEl.textContent = bTxt;
        pdEl.style.color = bColor;
      }
      const pdDescEl = document.getElementById('r-pd-desc');
      if (pdDescEl) {
        if (pdDescEl.innerHTML !== descTxt) pdDescEl.innerHTML = descTxt;
        pdDescEl.style.display = descTxt ? 'block' : 'none';
      }
    } else {
      setTxt('r-pd', '—（无水平力或无轴力）');
    }
  } else if(rowPD) {
    rowPD.style.display = 'none';
  }

    /* 受压支撑欧拉临界力粗估 */
  {
    const hasBraceNow = hasBrace;
    const braceChkRow = document.getElementById('row-braceChk');
    const braceWrap = document.getElementById('ssbBraceWrap');
    if(braceChkRow) braceChkRow.style.display = hasBraceNow ? '' : 'none';
    if(braceWrap) braceWrap.style.display = hasBraceNow ? '' : 'none';
    if(hasBraceNow){
      const E_brace = (p.braceMat === 'steel') ? E_STEEL : E_CONC;
      const As_m2 = (p.As || 2000) / 1e6;
      const i_m = (p.braceI || 30) / 1000;
      const failures = [];
      let lamMin = Infinity, lamMax = -Infinity, ncrMin = Infinity, braceCount = 0;
      for(const res of model.results){
        const el = res.el;
        if(el.kind !== 'brace') continue;
        if(model.inactiveBraces && model.inactiveBraces.has(el.braceUid)) continue;
        const lam = el.L / i_m;
        const Ncr = Math.PI * Math.PI * E_brace * As_m2 / (lam * lam);  // kN
        braceCount++;
        if(lam < lamMin) lamMin = lam;
        if(lam > lamMax) lamMax = lam;
        if(Ncr < ncrMin) ncrMin = Ncr;
        const N = axialAt(res, el.L/2);
        if(N < 0 && Math.abs(N) > Ncr){
          failures.push({ lev: el.lev, bay: el.bay, ratio: Math.abs(N) / Ncr });
        }
      }
      const listEl = document.getElementById('r-braceChkList');
      if(listEl){
        const lamTxt = (braceCount === 0) ? '—'
                     : (lamMin === lamMax ? lamMin.toFixed(0) : `${lamMin.toFixed(0)}~${lamMax.toFixed(0)}`);
        const ncrTxt = Number.isFinite(ncrMin) ? ncrMin.toFixed(0) : '—';
        if(failures.length === 0){
          listEl.innerHTML = `<span style="color:#4ade80">✓ 全部通过 · λ = ${lamTxt} · N<sub>cr,min</sub> = ${ncrTxt} kN</span>`;
        } else {
          let html = `<div style="color:#fbbf24;margin-bottom:3px">λ = ${lamTxt} · N<sub>cr,min</sub> = ${ncrTxt} kN · 超限 ${failures.length} 根</div>`;
          for(const f of failures.slice(0, 5)){
            html += `<div style="display:flex;justify-content:space-between;color:#fbbf24">
              <span>${f.lev}层-${f.bay}跨</span>
              <span>|N|/N<sub>cr</sub> = ${f.ratio.toFixed(2)}</span>
            </div>`;
          }
          if(failures.length > 5) html += `<div style="color:#94a3b8">…还有 ${failures.length-5} 根</div>`;
          listEl.innerHTML = html;
        }
      }
      const braceEl = document.getElementById('ssbBrace');
      if(braceEl){
        if(failures.length === 0){
          braceEl.textContent = 'OK'; braceEl.classList.add('ok');
        } else {
          braceEl.textContent = 'CHECK'; braceEl.classList.remove('ok');
        }
      }
    }
  }


  function allocStr(level){
    const nCol = model.nCol;
    const vals = new Array(nCol).fill(0);
    for(const res of model.results){
      const el = res.el;
      if(el.kind === 'col' && el.lev === level){
        vals[el.col] = Math.abs(res.f[1]);
      }
    }
    let sum = 0;
    for(const v of vals) sum += v;
    if(sum < 1e-8) return vals.map(() => '0%').join(' / ');
    return vals.map(v => (v/sum*100).toFixed(0) + '%').join(' / ');
  }
  setTxt('r-alloc1', allocStr(1));
  if (model.nLev >= 2) setTxt('r-alloc2', allocStr(2));
  if (model.nLev >= 3) setTxt('r-alloc3', allocStr(3));

  /* 支座反力已移至内力图 R 标签，此处不再更新 DOM */

  /* ΣV 按实际跨荷载累加（el.qSpan 由 02-solver.js 写入，含 qSpanMap 覆盖回退），
     逐跨指定后不再按标量 × 总跨长估算。 */
  let sumV = 0, sumH = 0;
  for(let lv=1; lv<=model.nLev; lv++){
    for(const el of model.els){
      if(el.kind === 'beam' && !el.isCant && el.lev === lv){
        sumV += (el.qSpan != null ? el.qSpan : p['q'+lv]) * el.L;
      }
    }
    if(p.hasCant) sumV += p['qc'+lv] * p.Lc;
    sumH += p['H'+lv];
  }
  // 补充累加集中力（只累加一次，避免 ΣV 翻倍）
  for(let i=0; i<model.nodes.length; i++){
    if(model.nodes[i].pLoad) sumV += model.nodes[i].pLoad;
  }
  setTxt('loadSum', `ΣV = ${sumV.toFixed(1)} kN · ΣH = ${sumH.toFixed(1)} kN`);

  /* 左侧残差 UI 已移除，仅通过右下角状态栏状态展示 */
}

function drawProbeCanvas(model){
  const cv = document.getElementById('cvProbe');
  if(!cv) return;
  const W = cv.clientWidth, H = cv.clientHeight;
  if(W < 10 || H < 10) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const infoEl = document.getElementById('r-probeInfo');
  const btnClear = document.getElementById('btnProbeClear');

  if(!S.probe || S.probe.elIndex === null || S.probe.elIndex < 0 || S.probe.elIndex >= model.els.length){
    if(infoEl) { infoEl.textContent = '在右侧内力图上点击任意杆件以分析截面应力。'; infoEl.style.color = '#64748b'; }
    if(btnClear) btnClear.style.display = 'none';
    // 绘制极简的十字靶心图标
    ctx.strokeStyle = 'rgba(100,116,139,0.25)';
    ctx.lineWidth = 1.5;
    const cx = W / 2, cy = H / 2 - 14;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy); ctx.lineTo(cx - 8, cy);
    ctx.moveTo(cx + 8, cy); ctx.lineTo(cx + 24, cy);
    ctx.moveTo(cx, cy - 24); ctx.lineTo(cx, cy - 8);
    ctx.moveTo(cx, cy + 8); ctx.lineTo(cx, cy + 24);
    ctx.stroke();
    
    ctx.fillStyle = '#64748b';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('点击右侧内力图选中杆件', W/2, H/2 + 20);
    return;
  }

  const res = model.results[S.probe.elIndex];
  if(!res || !res.el){
    if(infoEl) { infoEl.textContent = '在右侧内力图上点击任意杆件以分析截面应力。'; infoEl.style.color = '#64748b'; }
    if(btnClear) btnClear.style.display = 'none';
    return;
  }
  
  if(btnClear) btnClear.style.display = 'inline-block';

  const el = res.el;
  /* S.probe.xRatio 现在统一存“整跨比例”；对打断梁子段需反算局部比例。 */
  const xRatioLocal = (el.startOffset != null && el.spanL)
    ? (S.probe.xRatio * el.spanL - el.startOffset) / el.L
    : S.probe.xRatio;
  const xRatioClamped = Math.max(0, Math.min(1, xRatioLocal));
  const x = el.L * xRatioClamped;
  const N = axialAt(res, x);
  const M = momentAt(res, x);

  if(el.kind === 'brace') {
    const isInactive = model.inactiveBraces && model.inactiveBraces.has(el.braceUid);
    if(isInactive){
      /* 失效支撑：明确提示已退出工作，避免用户误以为轴力恒为 0 是计算错误。 */
      if(infoEl) { infoEl.textContent = '该支撑在「仅受拉」迭代中已退出工作，轴力 N=0'; infoEl.style.color = '#94a3b8'; }
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(W/2, 30); ctx.lineTo(W/2, H-30); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('已退出工作', W/2, H/2);
      return;
    }
    if(infoEl) { infoEl.textContent = '支撑为二力杆，全截面均匀受拉/压'; infoEl.style.color = '#38bdf8'; }
    ctx.strokeStyle = N > 0 ? '#38bdf8' : '#ef4444';
    ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(W/2, 30); ctx.lineTo(W/2, H-30); ctx.stroke();
    
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillStyle = N > 0 ? '#38bdf8' : '#ef4444';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((N > 0 ? '+' : '') + N.toFixed(1) + ' kN', W/2, H/2);
    return;
  }

  const sec = getSecProps(model.p);
  const A = (el.kind === 'col') ? sec.Ac : sec.Ab;
  const I = (el.kind === 'col') ? sec.Ic : sec.Ib;
  let b, h;
  if(el.kind === 'col') { b = sec.bcM * 1000; h = sec.hcM * 1000; }
  else                  { b = sec.bbM * 1000; h = sec.hbM * 1000; }
  const Wsec = I / (h / 2000); // 真实截面模量 (m^3)
  
  const sigTop = (N / A) - (M / Wsec);
  const sigBot = (N / A) + (M / Wsec);
  const sigMax = Math.max(Math.abs(sigTop), Math.abs(sigBot), 1e-6);

  /* === 布局：限制最大跨度，并整体居中 === */
  const cy = H / 2;
  const drawH = 80;  // 截面高度
  const drawW = 30;  // 截面宽度
  
  const maxSpanRight = 60; // 应力图最大跨度
  
  // 计算整体宽度：截面宽 + 间距 + 应力图最大跨度 + 右侧留给文字的空间(约65px)
  const totalW = drawW + 12 + maxSpanRight + 65;
  // 计算起始位置，使整个图形居中
  const secLeft = Math.max(10, (W - totalW) / 2); 
  
  const zeroX = secLeft + drawW + 12; // 基准线紧贴截面右侧
  const yTop = cy - drawH / 2;
  const yBot = cy + drawH / 2;

  const scale = maxSpanRight / sigMax;

  const xTop = zeroX + Math.abs(sigTop) * scale;
  const xBot = zeroX + Math.abs(sigBot) * scale;

  /* 1. 画截面矩形 */
  ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1.5;
  ctx.strokeRect(secLeft, yTop, drawW, drawH);
  ctx.fillStyle = 'rgba(100,116,139,0.1)';
  ctx.fillRect(secLeft, yTop, drawW, drawH);

  /* 2. 画应力包络图 */
  const yZero = (sigTop * sigBot < 0) 
    ? yTop + drawH * Math.abs(sigTop) / (Math.abs(sigTop) + Math.abs(sigBot)) 
    : null;

  if (yZero !== null) {
    const isTopComp = sigTop < 0;
    
    // 上半部
    ctx.beginPath();
    ctx.moveTo(zeroX, yTop);
    ctx.lineTo(xTop, yTop);
    ctx.lineTo(zeroX, yZero);
    ctx.closePath();
    ctx.fillStyle = isTopComp ? 'rgba(239,68,68,0.2)' : 'rgba(56,189,248,0.2)';
    ctx.fill();
    ctx.strokeStyle = isTopComp ? '#ef4444' : '#38bdf8';
    ctx.stroke();

    // 下半部
    ctx.beginPath();
    ctx.moveTo(zeroX, yZero);
    ctx.lineTo(xBot, yBot);
    ctx.lineTo(zeroX, yBot);
    ctx.closePath();
    ctx.fillStyle = isTopComp ? 'rgba(56,189,248,0.2)' : 'rgba(239,68,68,0.2)';
    ctx.fill();
    ctx.strokeStyle = isTopComp ? '#38bdf8' : '#ef4444';
    ctx.stroke();
  } else {
    const isTens = sigTop > 0;
    ctx.beginPath();
    ctx.moveTo(zeroX, yTop);
    ctx.lineTo(xTop, yTop);
    ctx.lineTo(xBot, yBot);
    ctx.lineTo(zeroX, yBot);
    ctx.closePath();
    ctx.fillStyle = isTens ? 'rgba(56,189,248,0.2)' : 'rgba(239,68,68,0.2)';
    ctx.fill();
    ctx.strokeStyle = isTens ? '#38bdf8' : '#ef4444';
    ctx.stroke();
  }

  /* 3. 画基准线 */
  ctx.strokeStyle = '#475569'; ctx.lineWidth = 1;
  ctx.beginPath(); 
  ctx.moveTo(zeroX, yTop - 10); 
  ctx.lineTo(zeroX, yBot + 10); 
  ctx.stroke();

  /* 4. 画箭头（动态插值，保证不超出包络线） */
  const drawArrow = (y) => {
    let val;
    if (yZero !== null) {
      if (y <= yZero) val = sigTop * (yZero - y) / (yZero - yTop);
      else val = sigBot * (y - yZero) / (yBot - yZero);
    } else {
      val = sigTop + (sigBot - sigTop) * (y - yTop) / drawH;
    }

    if (Math.abs(val) < 0.1) return;

    const edgeX = zeroX + Math.abs(val) * scale;
    const isTens = val > 0;
    const color = isTens ? '#38bdf8' : '#ef4444';

    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
    const headLen = 4;

    if (isTens) {
      // 受拉：从零线向右画，箭头向右
      ctx.beginPath(); ctx.moveTo(zeroX, y); ctx.lineTo(edgeX, y); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(edgeX, y);
      ctx.lineTo(edgeX - headLen * Math.cos(0.5), y - headLen * Math.sin(0.5));
      ctx.lineTo(edgeX - headLen * Math.cos(0.5), y + headLen * Math.sin(0.5));
      ctx.fill();
    } else {
      // 受压：从右侧向左画，箭头向左（指向基准线）
      ctx.beginPath(); ctx.moveTo(edgeX, y); ctx.lineTo(zeroX, y); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(zeroX, y);
      ctx.lineTo(zeroX + headLen * Math.cos(0.5), y - headLen * Math.sin(0.5));
      ctx.lineTo(zeroX + headLen * Math.cos(0.5), y + headLen * Math.sin(0.5));
      ctx.fill();
    }
  };

  // 画 5 个箭头：分布更均匀
  drawArrow(yTop);
  drawArrow(yTop + drawH * 0.25);
  drawArrow(cy);
  drawArrow(yBot - drawH * 0.25);
  drawArrow(yBot);

  /* 5. 标注数值 */
  const drawLabel = (val, y) => {
    if (Math.abs(val) < 0.1) return;
    ctx.font = 'bold 10.5px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    const valMPa = (val / 1000).toFixed(2);
    const txt = (val > 0 ? '+' : '') + valMPa + ' MPa';
    
    const edgeX = zeroX + Math.abs(val) * scale;
    ctx.textAlign = 'left';
    const tx = edgeX + 8;
    ctx.fillStyle = val > 0 ? '#38bdf8' : '#ef4444';
    ctx.fillText(txt, tx, y);
  };

  drawLabel(sigTop, yTop);
  drawLabel(sigBot, yBot);

  /* 6. 写信息 */
  if(infoEl) {
    infoEl.style.color = '#cbd5e1';
    const where = el.kind === 'col' ? '柱' : '梁';
    const pos = el.kind === 'col' ? `x/h=${S.probe.xRatio.toFixed(2)}` : `x/L=${S.probe.xRatio.toFixed(2)}`;
    infoEl.innerHTML = `<b>${where} ${pos}</b> · N=${N.toFixed(1)} kN · M=${M.toFixed(1)} kN·m`;
  }
}

function drawAntiRhoCanvas(model){
  const renderTo = (id) => {
  const cv = document.getElementById(id);
  if(!cv || !cv.offsetParent && id === 'cvAntiRhoFloat') return;
  const W = cv.clientWidth, H = cv.clientHeight;
  if(W < 10 || H < 10) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const padL = 42, padR = 14, padT = 16, padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  if(plotW < 10 || plotH < 10) return;

  const logMin = -1, logMax = 1;
  const xOf = rho => {
    const v = Math.max(0.1, Math.min(10, rho));
    return padL + (Math.log10(v) - logMin) / (logMax - logMin) * plotW;
  };
  const yOf = xr => padT + (1 - Math.max(0, Math.min(1, xr))) * plotH;

  /* 网格 */
  ctx.strokeStyle = 'rgba(100,116,139,0.4)';
  ctx.lineWidth = 0.5;
  for(const v of [0.1, 0.5, 1, 5, 10]){
    const x = xOf(v);
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
  }
  for(const v of [0, 0.25, 0.5, 0.75, 1]){
    const y = yOf(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
  }

  /* 参考线 x/h = 0.5 */
  ctx.strokeStyle = '#64748b';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(padL, yOf(0.5)); ctx.lineTo(padL + plotW, yOf(0.5));
  ctx.stroke();
  ctx.setLineDash([]);

  /* 轴标签 */
  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px "JetBrains Mono",ui-monospace,monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for(const v of [0.1, 1, 10]){
    ctx.fillText(v.toString(), xOf(v), padT + plotH + 4);
  }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for(const v of [0, 0.5, 1]){
      ctx.fillText(v.toString(), padL - 4, yOf(v));
    }

    /* 绘制坐标轴标题 */
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 10px ui-sans-serif,system-ui,sans-serif';
    // Y轴标题：左上角
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('x/h', 6, 4);
    // X轴标题：右下角
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('ρ', W - 6, H - 4);

  /* 各柱反弯点 */
  const NP = 61;
  const p = model.p;
  for(const res of model.results){
    const el = res.el;
    if(el.kind !== 'col') continue;
    let found = null;
    let prevM = momentAt(res, 0);
    for(let k=1;k<=NP;k++){
      const x = el.L*k/NP;
      const M = momentAt(res, x);
      if((prevM > 0 && M <= 0) || (prevM < 0 && M >= 0)){
        const xPrev = el.L*(k-1)/NP;
        const denom = Math.abs(prevM) + Math.abs(M);
        const xz = denom > 1e-12 ? xPrev + (x - xPrev) * Math.abs(prevM) / denom : xPrev;
        const xr = xz / el.L;
        if(xr > 0.05 && xr < 0.95){ found = xr; break; }
      }
      prevM = M;
    }
    if(found == null) continue;
    const lev = el.lev;
    let rho;
    if(el.col === 0){
      rho = model.rho[lev-1] ? model.rho[lev-1][0] : null;
    } else if(el.col === model.nBay){
      rho = model.rho[lev-1] ? model.rho[lev-1][model.nBay-1] : null;
    } else {
      /* 中柱：取左右跨 rho 平均，避免强行归到右跨造成小图误导。 */
      const row = model.rho[lev-1] || [];
      const left = row[el.col - 1];
      const right = row[el.col];
      rho = (left != null && right != null) ? (left + right) / 2 : (left != null ? left : right);
    }
    if(rho == null || !isFinite(rho)) continue;
    const px = xOf(rho), py = yOf(found);
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1; ctx.stroke();
  }
  }; // end renderTo

  renderTo('cvAntiRho');
  renderTo('cvAntiRhoFloat');
}

function run(opts){
  const skipAux = !!(opts && opts.skipAux);
  if(BASE){
    const p0 = BASE.p;
    const geoChanged = (
      p0.nBay !== S.nBay || p0.nLev !== S.nLev
      || !!p0.hasCant !== !!S.hasCant
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
  let _showBadge = false;
  // 扫掠播放或高频拖拽时不显示求解徽章，避免高频闪烁
  if(_badge && !(S.sweep && S.sweep.playing) && !(S._lastSliderInput && performance.now() - S._lastSliderInput < 200)) {
    _badge.classList.add('on');
    _showBadge = true;
  }
  try{
    const _solveT0 = performance.now();
    /* 只要有任意一格支撑开启了「仅受拉」，就走非线性迭代；
       solver 内部只对 tensionOnly 的支撑做失效判定，普通支撑照常受压工作。 */
    let anyTension = false;
    for(const k of Object.keys(S.braceMap)){
      if(S.braceMap[k] && S.braceMap[k] !== 'none' && S.braceTensionMap[k]){
        anyTension = true;
        break;
      }
    }
    if (anyTension) {
      MODEL = analyzeTensionOnly(S);
    } else {
      MODEL = analyze(S);
    }
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
    for(const id of ['r-colsec','r-bracesec','r-kmid','r-maxDx','r-rigidDy','r-maxDy','r-K','r-Kall','r-Knobrace','r-Knobeam','r-alloc1','r-alloc2','r-alloc3','r-pd']){
      const el = document.getElementById(id);
      if(el) el.textContent = '—';
    }
    for(const id of ['ssbNodes','ssbElems','ssbDof','ssbTime','ssbResid']){
      const el = document.getElementById(id);
      if(el) el.textContent = '—';
    }
    const rhoBox = document.getElementById('r-rhoBox');
    if(rhoBox) rhoBox.innerHTML = '';
    const driftList = document.getElementById('r-drift-list');
    if(driftList) driftList.innerHTML = '';
    /* r-resid 已从 HTML 移除（残差移至状态栏），此处不再引用 */
    const statusEl = document.getElementById('ssbStatus');
    if(statusEl){
      statusEl.textContent = 'FAIL';
      statusEl.classList.remove('ok');
    }
    const badge = document.getElementById('solveBadge');
    if(badge) badge.classList.remove('on');
    return;
  }

  /* 拓扑变化或集中力打断后单元数可能变化，探针索引可能越界或指向错误子单元。
     除了越界检测，还需检测单元总数变化（拓扑改变但总数未越界的场景）。 */
  if(S.probe && S.probe.elIndex != null){
    if(S.probe.elIndex >= MODEL.els.length ||
       (S._lastModelElCount != null && S._lastModelElCount !== MODEL.els.length)){
      S.probe = { elIndex: null, xRatio: 0.5 };
    }
  }
  S._lastModelElCount = MODEL.els.length;

  MODEL.maxF = getMaxInternal(MODEL, MODEL.p.forceType, MODEL.p.elFilter);

  {
    const style = FORCE_STYLE[MODEL.p.forceType];
    const tagEl = document.getElementById('tagForce');
    if(tagEl){
      if (MODEL.p.forceType === 'R') {
        let maxRx = 0, maxRy = 0, maxMR = 0;
        for(let c=0; c<MODEL.nCol; c++){
          const nd = MODEL.nid(c, 0);
          maxRx = Math.max(maxRx, Math.abs(MODEL.R[nd*3]));
          maxRy = Math.max(maxRy, Math.abs(MODEL.R[nd*3+1]));
          maxMR = Math.max(maxMR, Math.abs(MODEL.R[nd*3+2]));
        }
        const maxR_force = Math.max(maxRx, maxRy);
        tagEl.textContent = `支座反力图 R · 平动 |R|max = ${maxR_force.toFixed(1)} kN · 弯矩 |M|max = ${maxMR.toFixed(1)} kN·m`;
      } else if(MODEL.maxF > 1e-6){
        tagEl.textContent =
          `${style.tag} · ${style.lbl} = ${MODEL.maxF.toFixed(1)} ${style.unit}`;
      } else {
        tagEl.textContent = style.tag;
      }
    }
  }

  /* 先更新读数（含 isDeformFail / dyRatioValue / r-maxDy），再绘图；
     否则 drawInternal 读到新 MODEL 的 isDeformFail=undefined，
     drawDeform 读到上一轮的 r-maxDy。 */
  updateReadout(MODEL, skipAux);
  drawLoadDiagram(document.getElementById('cvLoad'), MODEL);
  if (document.getElementById('cvForce').offsetParent !== null) drawInternal(document.getElementById('cvForce'), MODEL);
  if (document.getElementById('cvD').offsetParent !== null) drawDeform(document.getElementById('cvD'), MODEL);
  updateStatusBar(MODEL);
  drawAntiRhoCanvas(MODEL);
  drawProbeCanvas(MODEL);
  if(_showBadge && _badge) requestAnimationFrame(()=> _badge.classList.remove('on'));
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
  set('ssbResid', isFinite(resid) ? resid.toExponential(1) : 'NaN');
  
  const statusEl = document.getElementById('ssbStatus');
  if(statusEl){
    if (!isFinite(resid)) {
      statusEl.textContent = 'FAIL·NaN';
      statusEl.classList.remove('ok');
      statusEl.title = '计算矩阵出现非法值 (NaN)，请检查输入或重置。';
      return;
    }
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
    if(m.tensionConverged === false){
      statusEl.textContent = 'NC·未收敛';
      statusEl.classList.remove('ok');
      statusEl.title = '仅受拉支撑迭代 15 次仍未收敛，当前结果可能不是稳定平衡解';
    } else {
      /* 增加整体变形超限检查 */
      const isDeformFail = !!m.isDeformFail;

      if (isDeformFail) {
        statusEl.textContent = 'DEFORM·超限';
        statusEl.classList.remove('ok');
        statusEl.style.color = '#facc15'; // 用黄色警告
        statusEl.title = '结构变形已超规范限值，请检查截面尺寸';
      } else {
        statusEl.textContent = ok ? 'OK' : 'CHECK';
        statusEl.classList.toggle('ok', ok);
        statusEl.style.color = ''; // 恢复默认
        statusEl.title = '';
      }
    }
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
  dis('P2', S.nLev < 2);
  dis('P3', S.nLev < 3);
  
  // 根据 removeBeamMap 联动禁用荷载控件
  for(let lv=1; lv<=S.nLev; lv++) {
    let allRemoved = true;
    for(let c=1; c<=S.nBay; c++) {
      if(!S.removeBeamMap[lv + '-' + c]) { allRemoved = false; break; }
    }
    if(allRemoved) {
      dis('q' + lv, true);
      dis('P' + lv, true);
    } else {
      if(lv <= S.nLev) {
        dis('q' + lv, false);
        dis('P' + lv, false);
      }
    }
  }

  const hide = (id, on) => {
    const el = document.getElementById(id);
    if(el) el.style.display = on ? 'none' : '';
  };
  hide('row-alloc2', S.nLev < 2);
  hide('row-alloc3', S.nLev < 3);
  hide('row-P2', S.nLev < 2);
  hide('row-P3', S.nLev < 3);

  /* 拓扑变化时，清空探针，防止索引残留导致靶心乱飘 */
  if (typeof S.probe !== 'undefined') S.probe = { elIndex: null, xRatio: 0.5 };
  
  /* 清理越界的逐跨荷载数据，防止 3跨改1跨 时残留幽灵荷载 */
  if (S.qSpanMap) {
    for(const k in S.qSpanMap) {
      const parts = k.split('-');
      if (parseInt(parts[0]) > S.nLev || parseInt(parts[1]) > S.nBay) delete S.qSpanMap[k];
    }
  }
  if (S.pLoadMap) {
    for(const k in S.pLoadMap) {
      const parts = k.split('-');
      if (parseInt(parts[0]) > S.nLev || parseInt(parts[1]) > S.nBay) delete S.pLoadMap[k];
    }
  }
  if (S.braceMap) {
    for(const k in S.braceMap) {
      const parts = k.split('-');
      if (parseInt(parts[0]) > S.nLev || parseInt(parts[1]) > S.nBay) delete S.braceMap[k];
    }
  }
  if (S.braceTensionMap) {
    for(const k in S.braceTensionMap) {
      const parts = k.split('-');
      if (parseInt(parts[0]) > S.nLev || parseInt(parts[1]) > S.nBay) delete S.braceTensionMap[k];
    }
  }

  if (S.supportMap) {
    for(const k in S.supportMap) {
      const c = Number(k);
      if(!Number.isInteger(c) || c < 0 || c > S.nBay) delete S.supportMap[k];
    }
  }

  if (S.removeBeamMap) {
    for(const k in S.removeBeamMap) {
      const parts = k.split('-');
      if (parseInt(parts[0]) > S.nLev || parseInt(parts[1]) > S.nBay) delete S.removeBeamMap[k];
    }
  }

  try{ window.dispatchEvent(new CustomEvent('structura-topo-change')); } catch(e){}
  updateSweepOptions();
}

function updateSweepOptions(){
  const sel = document.getElementById('sweepParam');
  if(!sel) return;

  const _anyBeamAlive = (lv) => {
    for(let c = 1; c <= S.nBay; c++){
      if(!S.removeBeamMap || !S.removeBeamMap[lv + '-' + c]) return true;
    }
    return false;
  };
  const req = {
    L2: ()=>S.nBay  >= 2,
    L3: ()=>S.nBay  >= 3,
    h2: ()=>S.nLev  >= 2,
    h3: ()=>S.nLev  >= 3,
    Lc: ()=>S.hasCant,
    q1: ()=>_anyBeamAlive(1),
    q2: ()=>S.nLev >= 2 && _anyBeamAlive(2),
    q3: ()=>S.nLev >= 3 && _anyBeamAlive(3),
    qc1:()=>S.hasCant,
    qc2:()=>S.hasCant && S.nLev >= 2,
    qc3:()=>S.hasCant && S.nLev >= 3,
    H2: ()=>S.nLev  >= 2,
    H3: ()=>S.nLev  >= 3,
    P1: ()=>_anyBeamAlive(1),
    P2: ()=>S.nLev >= 2 && _anyBeamAlive(2),
    P3: ()=>S.nLev >= 3 && _anyBeamAlive(3),
    As: ()=>Object.keys(S.braceMap || {}).some(k => S.braceMap[k] && S.braceMap[k] !== 'none'),
    braceI: ()=>Object.keys(S.braceMap || {}).some(k => S.braceMap[k] && S.braceMap[k] !== 'none')
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

/* 沉降位置下拉：按当前 nBay 动态生成选项（左柱 / 中柱 / 右柱） */


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
    /* 模态框打开时，1/2/3 不应穿透切换底层 Tab。 */
    if(document.querySelector('.modal.open')) return;
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
  if(hl === 'As' || hl === 'braceI') return el.kind === 'brace';
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
  mScale: v=>v.toFixed(2), dScale: v=>v.toFixed(0),
  As: v=>v.toFixed(0)+' mm²',
  braceI: v=>v.toFixed(0)+' mm',
  P1: v=>v.toFixed(0)+' kN', P2: v=>v.toFixed(0)+' kN', P3: v=>v.toFixed(0)+' kN',
  tempAll: v=>v.toFixed(0)+' ℃', tempGrad: v=>v.toFixed(0)+' ℃', tempT0: v=>v.toFixed(0)+' ℃',
  settleDy: v=>v.toFixed(0)+' mm'
};

let hlTimer = null;
const DRAW_ONLY = new Set(['mScale', 'dScale']);
function redrawOnly(key){
  if(!MODEL) return;
  if(key === 'mScale' || key === 'force') drawInternal(document.getElementById('cvForce'), MODEL);
  else if(key === 'dScale')               drawDeform(document.getElementById('cvD'), MODEL);
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
    S._lastSliderInput = performance.now();
    const v = parseFloat(el.value);
    if(!isFinite(v)) return;
    S[key] = v;
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

    // 移除全局 dragRaf 的抢占，改用防抖/节流或直接同步渲染
    if(typeof scheduleRender === 'function') scheduleRender(); else run();

    /* 保险：最后一次 input 后 200ms 内若已跑过 run()，
       updateReadout 会因 _lastSliderInput 仍在 200ms 窗口内而跳过刚度分解；
       之后无定时器再触发 run()，会永久卡在“—（拖动中）”。
       这里补一个 220ms 的保险定时器，确保拖动停止后补算一次完整读数。 */
    if(S._stiffDecompTimer) clearTimeout(S._stiffDecompTimer);
    S._stiffDecompTimer = setTimeout(()=>{
      S._stiffDecompTimer = null;
      if(typeof scheduleRender === 'function') scheduleRender(); else run();
    }, 220);

    /* P2-22：拖动主滑块时同步扫掠进度条，避免下次播放起点与用户预期不符。 */
    if(key === S.sweep.param){
      const progEl = document.getElementById('sweepProgress');
      const progOut = document.getElementById('v-sweepProgress');
      const pEl = document.getElementById(key);
      if(progEl && pEl){
        progEl.min = pEl.min;
        progEl.max = pEl.max;
        progEl.step = pEl.step;
        progEl.value = pEl.value;
        updateRangeProgress(progEl);
      }
      if(progOut && fmtMap[key]) progOut.textContent = fmtMap[key](parseFloat(pEl.value));
    }

    /* P2-30：拖动跨长时修正该跨上 pLoadMap.a，防止越界被 solver 静默钳制到端点。 */
    if(key === 'L1' || key === 'L2' || key === 'L3'){
      const col = parseInt(key[1]);
      const L = S[key];
      for(const kk of Object.keys(S.pLoadMap || {})){
        const parts = kk.split('-');
        if(parseInt(parts[1]) === col){
          const obj = S.pLoadMap[kk];
          if(obj && (obj.a == null || obj.a >= L)) obj.a = L / 2;
        }
      }
      if(typeof renderPSpanEditors === 'function') renderPSpanEditors();
    }
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
bindRange('As','As', v=>v.toFixed(0)+' mm²');
bindRange('braceI','braceI', v=>v.toFixed(0)+' mm');


/* 动态 UI 注入、集中力/温度滑块绑定、逐跨编辑器渲染等逻辑，
   已全部抽离至 07b-ui-builder.js 中。 */



function renderSupportMapPanel(){
  const wrap = document.getElementById('supportMapPanel');
  if(!wrap) return;
  const nCol = (S.nBay || 1) + 1;
  let html = '';
  for(let c = 0; c < nCol; c++){
    const key = String(c);
    const entry = (S.supportMap && S.supportMap[key]) || {};
    const type = entry.type || 'auto';
    const dy = entry.dy || 0;
    const rot = entry.rot || 0;
    let label;
    if(c === 0) label = '左柱';
    else if(c === nCol - 1) label = '右柱';
    else if(c === 1 && nCol === 3) label = '中柱';
    else label = (c + 1) + '号柱';
    
    html += `
      <div class="ctrl">
        <div class="head"><span>${label} · 支座类型</span></div>
        <select class="sweepSel supportTypeSel" data-col="${c}">
          <option value="auto"${type === 'auto' ? ' selected' : ''}>跟随 βf（默认）</option>
          <option value="fixed"${type === 'fixed' ? ' selected' : ''}>固接</option>
          <option value="pin"${type === 'pin' ? ' selected' : ''}>铰接</option>
          <option value="roller"${type === 'roller' ? ' selected' : ''}>滚轴（仅竖向约束）</option>
        </select>
      </div>
      <div class="ctrl">
        <div class="head"><span>${label} · 竖向位移 (mm)</span><b id="v-support-dy-${c}">${dy.toFixed(0)}</b></div>
        <input type="range" class="supportDyRange" data-col="${c}" min="-100" max="100" step="1" value="${dy}">
      </div>
      <div class="ctrl">
        <div class="head"><span>${label} · 强迫转角</span><b id="v-support-rot-${c}">${(rot * 1000).toFixed(2)} mrad (${(rot * 180 / Math.PI).toFixed(2)}°)</b></div>
        <input type="range" class="supportRotRange" data-col="${c}" min="-10" max="10" step="0.1" value="${(rot * 1000).toFixed(1)}">
      </div>
    `;
  }
  wrap.innerHTML = html;
  
  wrap.querySelectorAll('.supportTypeSel').forEach(sel => {
    sel.addEventListener('change', () => {
      if(S.sweep && S.sweep.playing) sweepStop();
      const c = sel.dataset.col;
      const v = sel.value;
      if(!S.supportMap) S.supportMap = {};
      if(!S.supportMap[c]) S.supportMap[c] = {};
      if(v === 'auto') delete S.supportMap[c].type;
      else S.supportMap[c].type = v;
      run();
    });
  });
  
  wrap.querySelectorAll('.supportDyRange').forEach(inp => {
    updateRangeProgress(inp);
    inp.addEventListener('input', () => {
      if(S.sweep && S.sweep.playing) sweepStop();
      const c = inp.dataset.col;
      const v = parseFloat(inp.value);
      if(!isFinite(v)) return;
      if(!S.supportMap) S.supportMap = {};
      if(!S.supportMap[c]) S.supportMap[c] = {};
      S.supportMap[c].dy = v;
      const out = document.getElementById('v-support-dy-' + c);
      if(out) out.textContent = v.toFixed(0);
      updateRangeProgress(inp);
      if(dragRaf) return;
      dragRaf = requestAnimationFrame(()=>{ dragRaf = null; run(); });
    });
  });
  
  wrap.querySelectorAll('.supportRotRange').forEach(inp => {
    updateRangeProgress(inp);
    inp.addEventListener('input', () => {
      if(S.sweep && S.sweep.playing) sweepStop();
      const c = inp.dataset.col;
      const vMrad = parseFloat(inp.value);
      if(!isFinite(vMrad)) return;
      const vRad = vMrad / 1000;
      if(!S.supportMap) S.supportMap = {};
      if(!S.supportMap[c]) S.supportMap[c] = {};
      S.supportMap[c].rot = vRad;
      const out = document.getElementById('v-support-rot-' + c);
      if(out) out.textContent = vMrad.toFixed(2) + ' mrad (' + (vRad * 180 / Math.PI).toFixed(2) + '°)';
      updateRangeProgress(inp);
      if(dragRaf) return;
      dragRaf = requestAnimationFrame(()=>{ dragRaf = null; run(); });
    });
  });
}

renderSupportMapPanel();
window.addEventListener('structura-topo-change', renderSupportMapPanel);

let movingLoadRaf = null;

function updateMovingLoadBtn() {
  const btn = document.getElementById('btnMovingLoadPlay');
  const btnStop = document.getElementById('btnMovingLoadStop');
  if (!btn || !btnStop) return;
  if (S.movingLoad.playing) {
    btn.textContent = '■ 暂停';
    btn.classList.add('playing');
    btnStop.style.display = 'block';
  } else {
    btn.textContent = '▶ 播放';
    btn.classList.remove('playing');
    btnStop.style.display = 'none';
  }
}

function movingLoadStop() {
  S.movingLoad.playing = false;
  if (movingLoadRaf) {
    cancelAnimationFrame(movingLoadRaf);
    movingLoadRaf = null;
  }
  updateMovingLoadBtn();
  if(typeof scheduleRender === 'function') scheduleRender(); else run();
}

function movingLoadPlay() {
  if (S.movingLoad.playing) return;
  if (S.movingLoad.P > 0) S.movingLoad.enabled = true;
  if (S.sweep.playing) sweepStop();
  S.movingLoad.playing = true;
  S.movingLoad.t0 = performance.now();
  S.movingLoad.startT = S.movingLoad.t;
  if (S.movingLoad.t >= 0.999) S.movingLoad.t = 0;

  const tick = (now) => {
    if (!S.movingLoad.playing) return;
    const elapsed = (now - S.movingLoad.t0) / 1000;
    // 将基础系数从 0.5 降到 0.15（默认 1x 速度下，走完一跨约需 6.6 秒）
    let t = S.movingLoad.startT + elapsed * 0.15 * (S.movingLoad.speed || 1);
    t = t % 1;
    S.movingLoad.t = t;
    const input = document.getElementById('movingLoadT');
    const out = document.getElementById('v-movingLoadT');
    if (input) { input.value = t; updateRangeProgress(input); }
    if (out) out.textContent = (t * 100).toFixed(0) + '%';
    run({ skipAux: true });
    movingLoadRaf = requestAnimationFrame(tick);
  };
  movingLoadRaf = requestAnimationFrame(tick);
  updateMovingLoadBtn();
}

function renderMovingLoadUI() {
  const wrap = document.getElementById('details-load-moving');
  if (!wrap) return;
  if (S.movingLoad) {
    S.movingLoad.lev = Math.max(1, Math.min(S.nLev, S.movingLoad.lev || 1));
    S.movingLoad.bay = Math.max(1, Math.min(S.nBay, S.movingLoad.bay || 1));
  }

  const levSel = document.getElementById('movingLoadLev');
  const baySel = document.getElementById('movingLoadBay');
  if (levSel && levSel.options.length !== S.nLev) {
    let html = '';
    for (let i = 1; i <= S.nLev; i++) html += `<option value="${i}">第 ${i} 层</option>`;
    levSel.innerHTML = html;
  }
  if (baySel && baySel.options.length !== S.nBay) {
    let html = '';
    for (let i = 1; i <= S.nBay; i++) html += `<option value="${i}">第 ${i} 跨</option>`;
    baySel.innerHTML = html;
  }

  if (levSel) levSel.value = S.movingLoad.lev;
  if (baySel) baySel.value = S.movingLoad.bay;
  const pEl = document.getElementById('movingLoadP');
  if (pEl) {
    pEl.value = S.movingLoad.P;
    document.getElementById('v-movingLoadP').textContent = S.movingLoad.P + ' kN';
    updateRangeProgress(pEl);
  }
  const tEl = document.getElementById('movingLoadT');
  if (tEl) {
    tEl.value = S.movingLoad.t;
    document.getElementById('v-movingLoadT').textContent = (S.movingLoad.t * 100).toFixed(0) + '%';
    updateRangeProgress(tEl);
  }
  
  // 新增：初始化速度滑块
  const speedEl = document.getElementById('movingLoadSpeed');
  if (speedEl) {
    const spd = S.movingLoad.speed || 1;
    speedEl.value = spd;
    const outSpd = document.getElementById('v-movingLoadSpeed');
    if(outSpd) outSpd.textContent = spd.toFixed(1) + 'x';
    updateRangeProgress(speedEl);
  }
  updateMovingLoadBtn();

  const btnPlay = document.getElementById('btnMovingLoadPlay');
  const btnStop = document.getElementById('btnMovingLoadStop');
  if (btnPlay && !btnPlay._bound) {
    btnPlay._bound = true;
    btnPlay.addEventListener('click', () => {
      if (S.movingLoad.playing) movingLoadStop();
      else movingLoadPlay();
    });
    btnStop.addEventListener('click', () => movingLoadStop());
    document.getElementById('movingLoadLev').addEventListener('change', (e) => {
      S.movingLoad.lev = parseInt(e.target.value);
      run();
    });
    document.getElementById('movingLoadBay').addEventListener('change', (e) => {
      S.movingLoad.bay = parseInt(e.target.value);
      run();
    });
    document.getElementById('movingLoadP').addEventListener('input', (e) => {
      S.movingLoad.P = parseFloat(e.target.value);
      S.movingLoad.enabled = S.movingLoad.P > 0;
      document.getElementById('v-movingLoadP').textContent = S.movingLoad.P + ' kN';
      updateRangeProgress(e.target);
      if (S.movingLoad.playing) return;
      run();
    });
    document.getElementById('movingLoadT').addEventListener('input', (e) => {
      S.movingLoad.t = parseFloat(e.target.value);
      document.getElementById('v-movingLoadT').textContent = (S.movingLoad.t * 100).toFixed(0) + '%';
      updateRangeProgress(e.target);
      if (S.movingLoad.playing) return;
      run();
    });
    // 新增：速度滑块事件
    document.getElementById('movingLoadSpeed').addEventListener('input', (e) => {
      S.movingLoad.speed = parseFloat(e.target.value);
      document.getElementById('v-movingLoadSpeed').textContent = S.movingLoad.speed.toFixed(1) + 'x';
      updateRangeProgress(e.target);
      // 注意：如果是播放状态，无需手动 run()，tick 动画会自动读取新速度
    });
  }
}

window.addEventListener('structura-topo-change', renderMovingLoadUI);
renderMovingLoadUI();

(function bindFrameMat() {
  const seg = document.getElementById('segFrameMat');
  if(!seg) return;
  seg.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      S.frameMat = btn.dataset.mat;
      run();
    });
  });
})();

(function bindBraceMat() {
  const seg = document.getElementById('segBraceMat');
  if(!seg) return;
  seg.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      S.braceMat = btn.dataset.mat;
      run();
    });
  });
})();

(function bindBraceTension() {
  const btn = document.getElementById('btnBraceTension');
  if(!btn) return;
  const refreshBtn = () => {
    const keys = Object.keys(S.braceMap).filter(k => S.braceMap[k] && S.braceMap[k] !== 'none');
    if(keys.length === 0){
      btn.classList.remove('on');
      btn.textContent = '无支撑';
      btn.disabled = true;
      btn.title = '请先在下方网格中布置支撑';
      return;
    }
    const allTension = keys.every(k => S.braceTensionMap[k]);
    btn.classList.toggle('on', allTension);
    btn.textContent = allTension ? '全部普通' : '全部仅受拉';
    btn.disabled = false;
    btn.title = '';
  };
  window.refreshBraceTensionBtn = refreshBtn;

  btn.addEventListener('click', () => {
    const keys = Object.keys(S.braceMap).filter(k => S.braceMap[k] && S.braceMap[k] !== 'none');
    const allTension = keys.length > 0 && keys.every(k => S.braceTensionMap[k]);
    if(allTension){
      S.braceTensionMap = {};
    } else {
      S.braceTensionMap = {};
      for(const k of keys) S.braceTensionMap[k] = true;
    }
    if(typeof renderBraceGrid === 'function') renderBraceGrid();
    refreshBtn();
    requestAnimationFrame(() => {
      try { run(); } catch(e) { console.error('[braceTension]', e); }
    });
  });

  refreshBtn();
})();