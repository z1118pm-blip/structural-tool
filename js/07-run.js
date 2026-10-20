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

function updateReadout(model){
  const p = model.p;
  
  // 增加辅助函数，仅在文本内容发生变化时才更新 DOM，防止高频扫掠时重排闪烁
  const setTxt = (id, v) => {
    const el = document.getElementById(id);
    if(el && el.textContent !== v) el.textContent = v;
  };

  setTxt('r-colsec', `柱 ${Math.round(p.bc)}×${Math.round(p.hc)} · 梁 ${Math.round(p.bb)}×${Math.round(p.hb)}`);
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
        const vals = row.map(v => v.toFixed(2)).join(' / ');
        const valEl = document.getElementById('rho-val-' + lv);
        if(valEl && valEl.textContent !== vals) valEl.textContent = vals;
      }

      /* ===== 林同炎概念：刚度匹配与体系判断 ===== */
      let sumRho = 0, countRho = 0;
      for (const row of model.rho) {
        for (const val of row) { sumRho += val; countRho++; }
      }
      const avgRho = countRho > 0 ? (sumRho / countRho) : 1;
      
      let sysType = "—";
      let sysDesc = "—";
      let sysColor = "#cbd5e1";
      
      if (p.betaJ <= BETA_HINGE) {
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

  let maxDx = 0, maxDy = 0;
  for(const res of model.results){
    const el = res.el;
    const N = 26;
    for(let k=0;k<=N;k++){
      const x = el.L * k / N;
      const [dx, dy] = elemDisp(res, x);
      if(Math.abs(dx) > Math.abs(maxDx)) maxDx = dx;
      if(Math.abs(dy) > Math.abs(maxDy)) maxDy = dy;
    }
  }
  setTxt('r-maxDx', (Math.abs(maxDx) * 1000).toFixed(2) + ' mm');
  setTxt('r-maxDy', (Math.abs(maxDy) * 1000).toFixed(2) + ' mm');

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
          JSON.stringify(p.braceTensionMap || {})
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
              const mNB = analyze({ ...p, braceMap: {}, braceTensionMap: {}, settleDy: 0, settleCol: 0 });
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
            const mNM = anyTension ? analyzeTensionOnly({ ...p, betaJ: 0, settleDy: 0, settleCol: 0 }) : analyze({ ...p, betaJ: 0, settleDy: 0, settleCol: 0 });
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
      const pPureKey = [
        p.nBay, p.nLev, p.hasCant,
        p.L1, p.L2, p.L3, p.h1, p.h2, p.h3, p.Lc,
        p.bc, p.hc, p.bb, p.hb, p.r, p.betaF, p.betaJ,
        p.H1, p.H2, p.H3, p.Hmode,
        p.frameMat, p.braceMat, p.As, p.axialMode,
        JSON.stringify(p.braceMap || {}),
        JSON.stringify(p.braceTensionMap || {})
      ].join('|');
      let uPure;
      if (S._uPureCache && S._uPureCache.key === pPureKey) {
        uPure = S._uPureCache.value;
      } else if((S.sweep && S.sweep.playing) || (S._lastSliderInput && performance.now() - S._lastSliderInput < 200)){
        /* 扫掠/拖动中跳过纯侧向刚度反算，避免逐帧额外 analyze 拖慢帧率；
           扫掠结束后 sweepStop 会触发 scheduleRender() 补算到准确值 */
        uPure = Math.abs(uTopAvg) || 1e-9;
      } else {
        const pPure = { ...p, q1:0, q2:0, q3:0, qc1:0, qc2:0, qc3:0,
                        qSpanMap:{}, P1:0, P2:0, P3:0, pLoadMap:{},
                        tempAll:0, tempGrad:0,
                        settleDy:0, settleCol:0 };
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
  } else if(rowPD) {
    rowPD.style.display = 'none';
  }

    /* 受压支撑欧拉临界力粗估 */
  {
    const hasBraceNow = Object.keys(p.braceMap || {}).some(k => p.braceMap[k] && p.braceMap[k] !== 'none');
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

  if(!S.probe || S.probe.elIndex === null || S.probe.elIndex >= model.els.length){
    if(infoEl) { infoEl.textContent = '在右侧内力图上点击任意杆件以分析截面应力。'; infoEl.style.color = '#64748b'; }
    if(btnClear) btnClear.style.display = 'none';
    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('未选中截面', W/2, H/2);
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
  const x = el.L * Math.max(0, Math.min(1, S.probe.xRatio));
  const N = axialAt(res, x);
  const M = momentAt(res, x);

  if(el.kind === 'brace') {
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

  let b, h;
  if(el.kind === 'col') { b = model.p.bc; h = model.p.hc; }
  else                  { b = model.p.bb; h = model.p.hb; }

  const A = (b/1000) * (h/1000);
  const Wsec = (b/1000) * Math.pow(h/1000, 2) / 6;
  
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
    const bayIdx = Math.min(el.col, model.nBay - 1);
    const rho = model.rho && model.rho[lev-1] ? model.rho[lev-1][bayIdx] : null;
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
    for(const id of ['r-colsec','r-bracesec','r-kmid','r-maxDx','r-maxDy','r-K','r-alloc1','r-alloc2','r-alloc3','r-pd']){
      const el = document.getElementById(id);
      if(el) el.textContent = '—';
    }
    const rhoBox = document.getElementById('r-rhoBox');
    if(rhoBox) rhoBox.innerHTML = '';
    const driftList = document.getElementById('r-drift-list');
    if(driftList) driftList.innerHTML = '';
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

  MODEL.maxF = getMaxInternal(MODEL, MODEL.p.forceType, MODEL.p.elFilter);

  {
    const style = FORCE_STYLE[MODEL.p.forceType];
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
  if (document.getElementById('cvForce').offsetParent !== null) drawInternal(document.getElementById('cvForce'), MODEL);
  if (document.getElementById('cvD').offsetParent !== null) drawDeform(document.getElementById('cvD'), MODEL);
  updateReadout(MODEL);
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
      statusEl.textContent = ok ? 'OK' : 'CHECK';
      statusEl.classList.toggle('ok', ok);
      statusEl.title = '';
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
  const hide = (id, on) => {
    const el = document.getElementById(id);
    if(el) el.style.display = on ? 'none' : '';
  };
  hide('row-alloc2', S.nLev < 2);
  hide('row-alloc3', S.nLev < 3);
  hide('row-P2', S.nLev < 2);
  hide('row-P3', S.nLev < 3);

  updateSettleColOptions();
  
  /* 拓扑变化时，清空探针，防止索引残留导致靶心乱飘 */
  if (typeof S.probe !== 'undefined') S.probe = { elIndex: null, xRatio: 0.5 };
  
  try{ window.dispatchEvent(new CustomEvent('structura-topo-change')); } catch(e){}
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
    H3: ()=>S.nLev  >= 3,
    P2: ()=>S.nLev >= 2,
    P3: ()=>S.nLev >= 3,
    As: ()=>Object.keys(S.braceMap || {}).some(k => S.braceMap[k] && S.braceMap[k] !== 'none')
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
function updateSettleColOptions(){
  const sel = document.getElementById('settleCol');
  if(!sel) return;
  const nCol = S.nBay + 1;
  let html = '';
  for(let c = 0; c < nCol; c++){
    let label;
    if(c === 0)            label = '左柱';
    else if(c === nCol - 1) label = '右柱';
    else if(c === 1 && nCol === 3) label = '中柱';
    else                   label = (c + 1) + '号柱';
    html += `<option value="${c}">${label}</option>`;
  }
  sel.innerHTML = html;
  const cur = Math.max(0, Math.min(nCol - 1, S.settleCol | 0));
  S.settleCol = cur;
  sel.value = String(cur);
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
bindRange('settleDy','settleDy', v=>v.toFixed(0)+' mm');

/* =====================================================================
   动态注入集中荷载 UI（避免修改 index.html 大段结构）
   ===================================================================== */
(function injectPLoadUI(){
  const rowQ1 = document.getElementById('row-q1');
  if(!rowQ1) return;
  
  let html = '';
  for(let lv=1; lv<=3; lv++){
    html += `<div class="ctrl" id="row-P${lv}">
      <div class="head"><span>${lv}层集中力 P<sub>${lv}</sub>（跨中）</span><b id="v-P${lv}">0 kN</b></div>
      <input type="range" id="P${lv}" min="0" max="200" step="5" value="0">
      <div class="spanEditRow">
        <button type="button" class="spanEditToggle" data-lev="${lv}" data-type="P">按跨指定 ▾</button>
      </div>
      <div class="spanEditBox" id="pSpanBox${lv}" hidden></div>
    </div>`;
  }
  
  // 插入到“竖向荷载” details 的 groupContent 内部，放在悬挑前面的位置
  const vertDetails = document.getElementById('details-load-vert');
  if(vertDetails) {
    const targetGroup = [...vertDetails.querySelectorAll('.group')].find(g => g.querySelector('.gtitle') && g.querySelector('.gtitle').textContent.includes('右侧悬挑均布'));
    if(targetGroup) targetGroup.insertAdjacentHTML('beforebegin', html);
  }
})();

/* 动态注入温度荷载 UI */
(function injectTempUI(){
  const rowQ3 = document.getElementById('row-q3');
  if(!rowQ3) return;
  
  const html = `
    <div class="group" id="group-temp">
      <div class="gtitle">非荷载作用 · 温度</div>
      <div class="ctrl" id="row-tempT0">
        <div class="head"><span>合拢/安装温度 T₀</span><b id="v-tempT0">20 ℃</b></div>
        <input type="range" id="tempT0" min="-20" max="50" step="1" value="20">
      </div>
      <div class="ctrl" id="row-tempAll">
        <div class="head"><span>构件整体温升 ΔT</span><b id="v-tempAll">0 ℃</b></div>
        <input type="range" id="tempAll" min="-30" max="50" step="1" value="0">
      </div>
      <div class="ctrl" id="row-tempGrad">
        <div class="head"><span>结构内外温差 ΔT (室外-室内)</span><b id="v-tempGrad">0 ℃</b></div>
        <input type="range" id="tempGrad" min="-30" max="30" step="1" value="0">
      </div>
      <div class="hint">整体温升使框架产生轴力重分布；结构内外温差仅作用于边柱及顶层边梁（产生弯曲）。内部构件及悬挑梁不受截面温差影响。</div>
    </div>`;
  
  // 插入到新建的“非荷载作用”面板中
  const otherDetails = document.getElementById('details-load-other');
  if(otherDetails) {
    const content = otherDetails.querySelector('.groupContent');
    if(content) content.insertAdjacentHTML('afterbegin', html); // 插到占位 div 前面
    
    // 把原有的“二阶效应”移动到“水平力与二阶”面板里
    const pDeltaGroup = [...document.querySelectorAll('.tabPanel[data-tab="load"] .group')].find(g => g.querySelector('.gtitle') && g.querySelector('.gtitle').textContent.includes('二阶效应'));
    const horzDetails = document.getElementById('details-load-horz');
    if (pDeltaGroup && horzDetails) {
      const horzContent = horzDetails.querySelector('.groupContent');
      if(horzContent) horzContent.appendChild(pDeltaGroup);
    }
  }
  
  const bindT = (id, fmt) => {
    const el = document.getElementById(id);
    const out = document.getElementById('v-'+id);
    if(!el || !out) return;
    updateRangeProgress(el);
    el.addEventListener('input', ()=>{
      if(S.sweep && S.sweep.playing) sweepStop();
      const v = parseFloat(el.value);
      if(!isFinite(v)) return;
      S[id] = v;
      out.textContent = fmt(S[id]);
      updateRangeProgress(el);
      if(dragRaf) return;
      dragRaf = requestAnimationFrame(()=>{ dragRaf = null; run(); });
    });
    S[id] = parseFloat(el.value);
    out.textContent = fmt(S[id]);
    updateRangeProgress(el);
  };
  
  bindT('tempT0', v=>v.toFixed(0)+' ℃');
  bindT('tempAll', v=>v.toFixed(0)+' ℃');
  bindT('tempGrad', v=>v.toFixed(0)+' ℃');

  // 绑定 P 滑块
  for(let lv=1; lv<=3; lv++){
    const el = document.getElementById('P'+lv);
    const out = document.getElementById('v-P'+lv);
    if(!el || !out) continue;
    
    el.addEventListener('input', ()=>{
      if(S.sweep && S.sweep.playing) sweepStop();
      const v = parseFloat(el.value);
      if(!isFinite(v)) return;
      S['P'+lv] = v;
      out.textContent = S['P'+lv].toFixed(0) + ' kN';
      updateRangeProgress(el);
      
      // 拖动统一 P 时，清除本层逐跨覆盖
      let changed = false;
      for(const k in S.pLoadMap){
        if(k.startsWith(lv + '-')){ delete S.pLoadMap[k]; changed = true; }
      }
      if(changed) renderPSpanEditors(lv);
      
      if(dragRaf) return;
      dragRaf = requestAnimationFrame(()=>{ dragRaf = null; run(); });
    });
    S['P'+lv] = parseFloat(el.value);
    out.textContent = S['P'+lv].toFixed(0) + ' kN';
    updateRangeProgress(el);
  }
})();

function renderPSpanEditors(onlyLev){
  for(let lv=1; lv<=S.nLev; lv++){
    if(onlyLev && lv !== onlyLev) continue;
    const box = document.getElementById('pSpanBox' + lv);
    if(!box || box.hidden) continue;
    let html = '';
    for(let c=1; c<=S.nBay; c++){
      const key = lv + '-' + c;
      const mapObj = S.pLoadMap[key] || {};
      const P = mapObj.P != null ? mapObj.P : (S['P'+lv] || 0);
      let a = mapObj.a != null ? mapObj.a : (S['L'+c] / 2);
      a = Math.max(0.5, Math.min(S['L'+c] - 0.5, a));
      // 同步修正内存中的非法状态，避免后续分享或重算时使用错误值
      if (mapObj.a != null && mapObj.a !== a) {
        S.pLoadMap[key].a = a;
      }
      const dot = mapObj.P != null ? ' <span style="color:#f97316">●</span>' : '';
      
      html += `<div class="ctrl spanEditItem">
        <div class="head"><span>第 ${c} 跨 P (位置 a)${dot}</span><b id="v-P-${key}">${P.toFixed(0)} kN / ${a.toFixed(1)} m</b></div>
        <input type="range" class="pSpanEditRangeP" min="0" max="200" step="5" value="${P}" data-spankey="${key}" data-sub="P">
        <div style="height:4px"></div>
        <input type="range" class="pSpanEditRangeA" min="0.5" max="${S['L'+c]-0.5}" step="0.1" value="${a}" data-spankey="${key}" data-sub="a">
      </div>`;
    }
    html += `<button type="button" class="spanEditClear" data-lev="${lv}" data-type="P">清除本层覆盖</button>`;
    box.innerHTML = html;
    if(S.rec && S.rec.active){
      box.querySelectorAll('input[type=range]').forEach(inp => { inp.disabled = true; });
    }

    box.querySelectorAll('input[type=range]').forEach(inp=>{
      const key = inp.dataset.spankey;
      const sub = inp.dataset.sub;
      updateRangeProgress(inp);
      
      inp.addEventListener('input', ()=>{
        if(S.sweep && S.sweep.playing) sweepStop();
        const v = parseFloat(inp.value);
        if(!S.pLoadMap[key]) S.pLoadMap[key] = { P: S['P'+parseInt(key.split('-')[0])] || 0, a: S['L'+parseInt(key.split('-')[1])]/2 };
        S.pLoadMap[key][sub] = v;
        
        const out = document.getElementById('v-P-' + key);
        if(out) out.textContent = S.pLoadMap[key].P.toFixed(0) + ' kN / ' + S.pLoadMap[key].a.toFixed(1) + ' m';
        updateRangeProgress(inp);
        
        if(dragRaf) return;
        dragRaf = requestAnimationFrame(()=>{ dragRaf = null; run(); });
      });
    });

    const clr = box.querySelector('.spanEditClear');
    if(clr) clr.addEventListener('click', ()=>{
      const lv2 = parseInt(clr.dataset.lev);
      for(const k in S.pLoadMap){
        if(k.startsWith(lv2 + '-')) delete S.pLoadMap[k];
      }
      renderPSpanEditors(lv2);
      run();
    });
  }
}

/* 重写 bindSpanEditors 的绑定逻辑以兼容 P 和 q */
(function bindSpanEditors2(){
  document.querySelectorAll('.spanEditToggle[data-type="P"]').forEach(btn=>{
    const lev = parseInt(btn.dataset.lev);
    const type = btn.dataset.type || 'q';
    const boxId = type === 'P' ? 'pSpanBox' + lev : 'qSpanBox' + lev;
    const box = document.getElementById(boxId);
    if(!box) return;
    btn.addEventListener('click', ()=>{
      const open = box.hidden;
      box.hidden = !open;
      btn.classList.toggle('on', open);
      btn.textContent = open ? '收起 ▴' : '按跨指定 ▾';
      if(open) {
        if(type === 'P') renderPSpanEditors(lev);
        else renderSpanEditors(lev);
      }
    });
  });
})();

/* =====================================================================
   逐跨竖向荷载编辑（qSpanMap）
   - 每层「按跨指定」按钮展开 nBay 个滑块；
   - 拖动逐跨滑块 → 写入 S.qSpanMap["层-跨"]，求解器优先使用；
   - 拖动统一值滑块 q1/q2/q3 → 清除该层所有覆盖，回到统一模式；
   - 扫掠 q1/q2/q3 时不清除覆盖（覆盖跨保持其值），hint 已说明。
   ===================================================================== */
function renderSpanEditors(onlyLev){
  for(let lv=1; lv<=S.nLev; lv++){
    if(onlyLev && lv !== onlyLev) continue;
    const box = document.getElementById('qSpanBox' + lv);
    if(!box || box.hidden) continue;
    let html = '';
    for(let c=1; c<=S.nBay; c++){
      const key = lv + '-' + c;
      const has = Object.prototype.hasOwnProperty.call(S.qSpanMap, key);
      const v = has ? S.qSpanMap[key] : (S['q'+lv] || 0);
      const dot = has ? ' <span style="color:#f97316">●</span>' : '';
      html += `<div class="ctrl spanEditItem">
        <div class="head"><span>第 ${c} 跨${dot}</span><b id="v-${key}">${v.toFixed(1)} kN/m</b></div>
        <input type="range" class="spanEditRange" min="0" max="100" step="0.5" value="${v}" data-spankey="${key}">
      </div>`;
    }
    html += `<button type="button" class="spanEditClear" data-lev="${lv}">清除本层覆盖</button>`;
    box.innerHTML = html;
    if(S.rec && S.rec.active){
      box.querySelectorAll('input[type=range]').forEach(inp => { inp.disabled = true; });
    }

    box.querySelectorAll('.spanEditRange').forEach(inp=>{
      const spanKey = inp.dataset.spankey;
      updateRangeProgress(inp);
      inp.addEventListener('input', ()=>{
        if(S.sweep && S.sweep.playing) sweepStop();
        const v = parseFloat(inp.value);
        S.qSpanMap[spanKey] = v;
        const out = document.getElementById('v-' + spanKey);
        if(out) out.textContent = v.toFixed(1) + ' kN/m';
        updateRangeProgress(inp);
        if(dragRaf) return;
        dragRaf = requestAnimationFrame(()=>{
          dragRaf = null;
          run();
        });
      });
    });

    const clr = box.querySelector('.spanEditClear');
    if(clr) clr.addEventListener('click', ()=>{
      const lv2 = parseInt(clr.dataset.lev);
      for(const k in S.qSpanMap){
        if(k.startsWith(lv2 + '-')) delete S.qSpanMap[k];
      }
      renderSpanEditors(lv2);
      run();
    });
  }
}

(function bindSpanEditors(){
  document.querySelectorAll('.spanEditToggle:not([data-type="P"])').forEach(btn=>{
    const lev = parseInt(btn.dataset.lev);
    const box = document.getElementById('qSpanBox' + lev);
    if(!box) return;
    btn.addEventListener('click', ()=>{
      const open = box.hidden;
      box.hidden = !open;
      btn.classList.toggle('on', open);
      btn.textContent = open ? '收起 ▴' : '按跨指定 ▾';
      if(open) renderSpanEditors(lev);
    });
  });

  /* 拖动统一值滑块 → 清除该层所有覆盖（语义：统一值与逐跨互斥） */
  ['q1','q2','q3'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener('input', ()=>{
      const lev = parseInt(id[1]);
      let changed = false;
      for(const k in S.qSpanMap){
        if(k.startsWith(lev + '-')){ delete S.qSpanMap[k]; changed = true; }
      }
      if(changed && typeof renderSpanEditors === 'function') renderSpanEditors(lev);
    });
  });

  /* 拓扑变化：清理越界键，重渲染已展开的层 */
  window.addEventListener('structura-topo-change', ()=>{
    for(const k of Object.keys(S.qSpanMap)){
      const parts = k.split('-');
      const lv = parseInt(parts[0]), c = parseInt(parts[1]);
      if(lv > S.nLev || c > S.nBay) delete S.qSpanMap[k];
    }
    for(const k of Object.keys(S.pLoadMap)){
      const parts = k.split('-');
      const lv = parseInt(parts[0]), c = parseInt(parts[1]);
      if(lv > S.nLev || c > S.nBay) delete S.pLoadMap[k];
    }
    if(typeof renderSpanEditors === 'function') renderSpanEditors();
    if(typeof renderPSpanEditors === 'function') renderPSpanEditors();
  });
})();

(function bindSettleCol(){
  const sel = document.getElementById('settleCol');
  if(!sel) return;
  sel.addEventListener('change', ()=>{
    S.settleCol = parseInt(sel.value, 10) || 0;
    run();
  });
})();

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
  /* 全局按钮改为批量操作：
     - 若当前已有支撑中「不是全部仅受拉」，点一下全部设为仅受拉；
     - 若已经全部仅受拉，再点一下全部取消。
     逐格微调仍通过网格上的 T 角标完成。 */
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
    // 先让按钮状态刷到屏幕上，再异步求解，避免求解耗时期间按钮文字还没变
    requestAnimationFrame(() => {
      try { run(); } catch(e) { console.error('[braceTension]', e); }
    });
  });

  refreshBtn();
})();