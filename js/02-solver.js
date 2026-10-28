"use strict";

/* =====================================================================
   2. 线性代数
   ===================================================================== */
const zeros = (n,m) => Array.from({length:n}, () => new Float64Array(m));

function matMul(A,B){
  const n=A.length, k=B.length, m=B[0].length;
  const C=zeros(n,m);
  for(let i=0;i<n;i++){
    for(let p=0;p<k;p++){
      const a=A[i][p]; if(a===0) continue;
      for(let j=0;j<m;j++) C[i][j]+=a*B[p][j];
    }
  }
  return C;
}
function transpose(A){
  const n=A.length, m=A[0].length, B=zeros(m,n);
  for(let i=0;i<n;i++) for(let j=0;j<m;j++) B[j][i]=A[i][j];
  return B;
}
function matVec(A,v){
  const n=A.length, m=v.length, r=new Float64Array(n);
  for(let i=0;i<n;i++){
    let s=0;
    for(let j=0;j<m;j++) s+=A[i][j]*v[j];
    r[i]=s;
  }
  return r;
}

/* =====================================================================
   3. 单元矩阵
   ===================================================================== */
function localK(el){
  const {EA,EI,L}=el;
  const a=EA/L;

  /* 支撑：纯轴向，无弯曲刚度 */
  if(el.kind === 'brace'){
    return [
      [ a, 0, 0, -a, 0, 0],
      [ 0, 0, 0,  0, 0, 0],
      [ 0, 0, 0,  0, 0, 0],
      [-a, 0, 0,  a, 0, 0],
      [ 0, 0, 0,  0, 0, 0],
      [ 0, 0, 0,  0, 0, 0]
    ];
  }

  /* 梁两端完全铰接：只保留轴向 */
  if(el.kind === 'beam' && el.hinge){
    return [
      [ a, 0, 0, -a, 0, 0],
      [ 0, 0, 0,  0, 0, 0],
      [ 0, 0, 0,  0, 0, 0],
      [-a, 0, 0,  a, 0, 0],
      [ 0, 0, 0,  0, 0, 0],
      [ 0, 0, 0,  0, 0, 0]
    ];
  }

  /* 梁/柱：两端可独立指定柔度 alphaI / alphaJ（未指定时回退到 el.alpha） */
  const alI = (el.alphaI != null) ? el.alphaI : (el.alpha || 0);
  const alJ = (el.alphaJ != null) ? el.alphaJ : (el.alpha || 0);

  /* 标准刚接（两端柔度均为 0）：沿用原公式 */
  if(alI === 0 && alJ === 0){
    const b = 12*EI/(L*L*L);
    const c = 6*EI/(L*L);
    const d = 4*EI/L;
    const e = 2*EI/L;
    return [
      [ a,  0,  0, -a,  0,  0],
      [ 0,  b,  c,  0, -b,  c],
      [ 0,  c,  d,  0, -c,  e],
      [-a,  0,  0,  a,  0,  0],
      [ 0, -b, -c,  0,  b, -c],
      [ 0,  c,  e,  0, -c,  d]
    ];
  }

  /* Monforton-Wu 两端半刚接修正刚度：
     Δ = (1+4αI)(1+4αJ) − 4αIαJ
     αI=αJ=α 时退化为原单端公式（k_vv=12EI/L³/(1+6α)，k_vθ=6EI/L²·(1+2α)/Δ 等）。
     集中力打断梁时，打断点那一端传 alpha=0（刚接），
     只有与柱相连的梁端才保留真实半刚接 alphaJ。 */
  const D  = (1 + 4*alI)*(1 + 4*alJ) - 4*alI*alJ;
  const b  = 12*EI/(L*L*L) * (1 + alI + alJ) / D;
  const c1 = 6*EI/(L*L) * (1 + 2*alJ) / D;   // k23：i 端横向 ↔ i 端转角
  const c2 = 6*EI/(L*L) * (1 + 2*alI) / D;   // k26：i 端横向 ↔ j 端转角
  const d1 = 4*EI/L * (1 + 3*alJ) / D;        // k33：i 端转角自项
  const d2 = 4*EI/L * (1 + 3*alI) / D;        // k66：j 端转角自项
  const e  = 2*EI/L / D;                       // k36：i-j 转角耦合

  return [
    [ a,  0,   0,  -a,  0,   0 ],
    [ 0,  b,  c1,   0, -b,  c2],
    [ 0, c1,  d1,   0,-c1,   e],
    [-a,  0,   0,   a,  0,   0 ],
    [ 0, -b, -c1,   0,  b, -c2],
    [ 0, c2,   e,   0,-c2,  d2]
  ];
}
function Tmat(el){
  const {cs,sn}=el;
  return [
    [ cs, sn, 0,   0,  0, 0],
    [-sn, cs, 0,   0,  0, 0],
    [  0,  0, 1,   0,  0, 0],
    [  0,  0, 0,  cs, sn, 0],
    [  0,  0, 0, -sn, cs, 0],
    [  0,  0, 0,   0,  0, 1]
  ];
}
function globalK(el){
  const T=Tmat(el);
  return matMul(matMul(transpose(T), localK(el)), T);
}
function localEqLoad(el, p){
  const {w,L}=el;
  let pFeI =  w*L*L/12;   // i 端固端弯矩（均布荷载，向下为正）
  let pFeJ = -w*L*L/12;   // j 端固端弯矩（标准对称梁为负）
  let pFeTI = 0;          // i 端温度梯度固端弯矩
  let pFeTJ = 0;          // j 端温度梯度固端弯矩
  let pFeN = 0;           // 温度产生的固端轴力

  if(el.kind === 'beam'){
    if(el.hinge){
      pFeI = 0; pFeJ = 0;
    } else {
      const alI = (el.alphaI != null) ? el.alphaI : (el.alpha || 0);
      const alJ = (el.alphaJ != null) ? el.alphaJ : (el.alpha || 0);
      if(alI === 0 && alJ === 0){
        /* 标准刚接：保持默认值 */
      } else {
        /* Monforton-Wu 两端半刚接固端弯矩：
           FEM_i =  wL²/12 · (1+6αJ)/Δ
           FEM_j = -wL²/12 · (1+6αI)/Δ
           αI=αJ=α 时退化为原 (1+6α)/(1+8α+12α²) 公式 */
        const D = (1 + 4*alI)*(1 + 4*alJ) - 4*alI*alJ;
        pFeI =  (w*L*L/12) * (1 + 6*alJ) / D;
        pFeJ = -(w*L*L/12) * (1 + 6*alI) / D;
      }
    }
  }

  /* 温度荷载计算 (仅针对梁柱，支撑不承受温度) */
  if(p && el.kind !== 'brace'){
    const alpha = 1.0e-5;
    const tempAll = p.tempAll || 0;
    const tempGrad = p.tempGrad || 0;
    /* 优先用真实截面高度（含 HW/HN 型钢），不要用矩形参数 p.hc/p.hb 重算。 */
    const h = el.secH || el.h || ((el.kind === 'col') ? (p.hc/1000) : (p.hb/1000));

    /* 均匀升温：产生固端轴力。
       不能用 el.EA（axialMode='rigid' 时含 1e6 放大），否则温度轴力被错误放大。
       用真实截面刚度重算。
       注意：集中力打断梁的两个子单元必须使用原梁真实 EA，不能按子段长度缩放。
       子段两端固端轴力方向相反，打断节点处会自动抵消；若缩放 EA，则两段在
       打断节点处净固端轴力 = EA·α·ΔT·(2a/L−1)，集中力偏离跨中时不再为零，
       会向中间节点注入虚构的固端轴力，污染整根梁的温度轴力分配。
       悬挑梁也没有 el.bay，若沿用旧逻辑会错误回退到 p.L1 触发缩放。 */
    {
      /* 用真实截面面积（含 HW/HN 型钢），不要用矩形参数 p.bc/hc/bb/hb 重算。
         flat.secA 由 solve() 从 getSecProps(p) 写入，兜底回退到矩形面积。 */
      const E_frame_real = (p.frameMat === 'steel') ? E_STEEL : E_CONC;
      const bcM = p.bc/1000, hcM = p.hc/1000;
      const bbM = p.bb/1000, hbM = p.hb/1000;
      const Ac = bcM*hcM, Ab = bbM*hbM;
      let realEA;
      if(el.kind === 'col'){
        const kc = (el.col > 0 && el.col < p.nBay) ? (p.r || 1.0) : 1.0;
        realEA = E_frame_real * (el.secA || Ac) * kc;
      } else {
        realEA = E_frame_real * (el.secA || Ab);
      }
      pFeN = -realEA * alpha * tempAll;
    }

    /* ===== 精准识别“结构外围构件”以施加截面内外温差 =====
       - 左柱：左侧为室外，系数 1.0
       - 右柱：右侧为室外，局部坐标反向，系数 -1.0
       - 中柱：两侧均为室内，系数 0
       - 顶层跨内梁：上侧为室外，系数 1.0
       - 悬挑梁 / 内部梁：上下均在室外或室内，系数 0
    */
    let gradFactor = 0;
    if (el.kind === 'col') {
      if (el.col === 0) gradFactor = 1.0;
      else if (el.col === p.nBay) gradFactor = -1.0;
    } else if (el.kind === 'beam' && !el.isCant) {
      if (el.lev === p.nLev) gradFactor = 1.0;
    }

    if (gradFactor !== 0) {
      if (el.kind === 'beam') {
        if (el.hinge) {
          pFeTI = 0; pFeTJ = 0;
        } else {
          /* 【修复 A1 & A4】梁端热梯度产生同号的固端弯矩（产生均匀曲率）。
             均匀曲率的半刚接固端弯矩释放系数为 (1+2α)/Δ，而非均布荷载的 (1+6α)/Δ。 */
          /* 温度梯度为均匀曲率 κ = α·ΔT/h。打断梁两侧子单元共享打断点，
             两个子单元在打断点处都应携带固端弯矩 baseT，节点处自然抵消。
             不能只在"真实端"施加，否则打断点两侧丢失固端弯矩，弯矩图 ≈ 0。
             对半刚接真实端，固端弯矩按 (1+3α)/DT 折减；打断点内部刚接（α=0）不折减。 */
          const baseT = (el.EI * alpha * tempGrad * gradFactor / h);
          const alI = (el.alphaI != null) ? el.alphaI : (el.alpha || 0);
          const alJ = (el.alphaJ != null) ? el.alphaJ : (el.alpha || 0);
          const alI_t = (el.origAlpha != null) ? el.origAlpha : alI;
          const alJ_t = (el.origAlpha != null) ? el.origAlpha : alJ;
          if(alI_t === 0 && alJ_t === 0){
            pFeTI = baseT;
            pFeTJ = baseT;
          } else {
            /* 均匀曲率下温度梯度的半刚接固端力，不能套用均布荷载的 (1+2α)/D。
               经极限校准的近似公式，满足：
                 αI=αJ=0（完全固接）→ 系数 1，M_i=M_j=-EIκ（截面弯矩同号）
                 αI=0, αJ→∞（i 固 j 铰）→ pFeTI 系数 1.5，M_i=-1.5EIκ，pFeTJ→0
                 αI=αJ→∞（两端铰接）→ 系数→0
               严格解需按 Monforton-Wu 修正形函数积分，此式在已知极限下正确，
               有限 αI≠αJ 情形需数值回归。 */
            const DT = (1 + 2*alI_t) * (1 + 2*alJ_t);
            pFeTI = baseT * (1 + 3*alJ_t) / DT;
            pFeTJ = baseT * (1 + 3*alI_t) / DT;
          }
        }
      } else {
        pFeTI = (el.EI * alpha * tempGrad * gradFactor / h);
        pFeTJ = pFeTI;
      }
    } else {
      pFeTI = 0; pFeTJ = 0;
    }
  }

  /* 局部等效节点力 [Fx_i, Fy_i, M_i, Fx_j, Fy_j, M_j]
     i 端弯矩 = pFeI − pFeTI，j 端弯矩 = pFeJ + pFeTJ。
     对称情况（αI=αJ）退化为原 [pFeN, wL/2, pFe−pFeT, −pFeN, wL/2, −pFe+pFeT]。 */
  let Vi = w*L/2, Vj = w*L/2;
  if(el.kind === 'beam' && !el.hinge && w !== 0){
    const alIq = (el.alphaI != null) ? el.alphaI : (el.alpha || 0);
    const alJq = (el.alphaJ != null) ? el.alphaJ : (el.alpha || 0);
    if(alIq > 0 || alJq > 0){
      const Dq = (1 + 4*alIq)*(1 + 4*alJq) - 4*alIq*alJq;
      Vi = w*L/2 * (1 + 3*alIq + 5*alJq + 12*alIq*alJq) / Dq;
      Vj = w*L/2 * (1 + 5*alIq + 3*alJq + 12*alIq*alJq) / Dq;
    }
  }
  /* 温度梯度：当两端柔度不等时 pFeTI ≠ pFeTJ，固端弯矩自身不满足力矩平衡，
     必须配套端剪力使力系自平衡。固接/铰接/对称柔度时增量为零，无副作用。 */
  const vTempJ = (pFeTI - pFeTJ) / L;
  Vi -= vTempJ;
  Vj += vTempJ;
  /* 半刚接不等柔度时 pFeI + pFeJ ≠ 0，补充端剪力使力系严格平衡 */
  const vFW = (pFeI + pFeJ) / L;
  Vi -= vFW;
  Vj += vFW;
  return [pFeN, Vi, pFeI - pFeTI, -pFeN, Vj, pFeJ + pFeTJ];
}
function globalEqLoad(el, p){
  return matVec(transpose(Tmat(el)), localEqLoad(el, p));
}

/* =====================================================================
   4. 建模 + 求解
   ===================================================================== */
/* 已删除：colKeff 端点转动弹簧模型已废弃。 */

/* 已删除：computeHShare（D 值法分配）。
   现已由刚性楼板约束（Hmode='rigid'）或真实自由度（Hmode='none'）接管，
   FEM 内部自动分配。 */

/* =====================================================================
   solve(Model, opts)：吃结构化 Model，输出计算结果集
   ---------------------------------------------------------------------
   建模由 parametricGenerator 负责，solve 只做 Model → 数值。
   analyze(p) 退化为 solve(parametricGenerator(p))。

   注意：02-model.js 的 newId() 被 addNode 和 addElement 共享，
   导致节点 ID 不等于其在数组中的位置（尤其是集中力打断产生子节点时）。
   本函数开头通过 id2idx 映射，将所有 ID 转换为数组索引，供下游使用。
   ===================================================================== */
function solve(model, opts = {}) {
  const inactiveBraces = opts.inactiveBraces || new Set();
  const p = model.meta.p || {};
  const nBay = Math.max(1, Number(p.nBay) || 1);
  const nLev = Math.max(1, Number(p.nLev) || 1);
  const nCol = nBay + 1;

  /* ---- 1. 节点：从 Model.nodes 拷贝并保留 solve 需要的字段 ---- */
  /* 构建实体 ID 到数组索引的映射。因为 02-model.js 的 newId()
     被 addNode 和 addElement 共享，导致节点 ID 不再严格等于其在数组中的位置。
     旧 analyze 里 el.i 和 el.j 就是数组下标，这里必须转回下标供后续矩阵计算。 */
  const id2idx = new Map();
  const nodes = model.nodes.map((n, i) => {
    id2idx.set(n.id, i);
    const out = { x: n.x, y: n.y };
    if (n.col != null) out.col = n.col;
    if (n.lev != null) out.lev = n.lev;
    if (n.cant) out.cant = true;
    if (n.isSub) out.isSub = true;
    if (n.pLoad != null) out.pLoad = n.pLoad;
    return out;
  });

  const nid = (c, lv) => c * (nLev + 1) + lv;

  /* ---- 1.5 截面（前置，供 flat 化与支座共同使用） ---- */
  const sec = getSecProps(p);

  /* ---- 2. 单元：Model.elements → 扁平 els（旧 analyze 风格） ---- */
  const alphaFromRelease = (r) => {
    if (!r) return 0;
    if (r.type === 'fixed') return 0;
    if (r.type === 'free') return 1e4;
    if (r.type === 'spring') return Number.isFinite(r.k) ? r.k : 1e4;
    return 0;
  };

  const els = model.elements.map(el => {
    const sec = el.section || {};
    const EA = (sec.E || 0) * (sec.A || 0) * (sec.axialBoost || 1);
    const EI = (sec.E || 0) * (sec.I || 0);
    const loads = el.loads || [];
    const udl = loads.find(l => l.type === 'udl');
    const w = udl ? Number(udl.w) || 0 : 0;
    const meta = el._meta || {};
    const kind = meta.kind || el.type;

    const flat = {
      i: id2idx.get(el.i), j: id2idx.get(el.j), L: el.L, cs: el.cs, sn: el.sn,
      EA, EI, w, q: -w, qSpan: -w,
      kind,
      alphaI: alphaFromRelease(el.releaseI),
      alphaJ: alphaFromRelease(el.releaseJ),
      /* el.hinge 当前恒为 false。generator 中 βj≤BETA_HINGE 时走 alphaJ=1e4
         的半刚接公式近似铰接（残余弯矩 ~0.005% 工程可忽略）。
         localK/localEqLoad 的 hinge 分支为预留接口，不触发。 */
      hinge: false,
      lev: meta.lev,
      bay: meta.bay,
      isCant: !!meta.isCant,
      startOffset: meta.startOffset,
      spanL: meta.spanL,
      origAlpha: meta.origAlpha,
      braceUid: meta.braceUid,
      tensionOnly: !!meta.tensionOnly,
      col: meta.col,
      /* 真实截面面积/高度（含 HW/HN 型钢），仅供温度路径使用，
         不受 axialBoost 影响。 */
      secA: (kind === 'col') ? sec.Ac : sec.Ab,
      secH: (kind === 'col') ? sec.hcM : sec.hbM,
    };

    const tempLoad = loads.find(l => l.type === 'temp');
    if (tempLoad) {
      const grad = Number(tempLoad.grad) || 0;
      const alphaT = Number(tempLoad.alphaT) || 1e-5;
      const gf = Number(tempLoad.gradFactor) || 0;
      const h = Number(tempLoad.h) || 1;
      if (gf !== 0 && h > 0) flat.tempGradEff = grad * alphaT * gf / h;
    }

    return flat;
  });

  /* ---- 3. K、F 组装 ---- */
  const ndof = nodes.length * 3;
  const K = zeros(ndof, ndof);
  const F = new Float64Array(ndof);

  for (const el of els) {
    if (el.kind === 'brace' && inactiveBraces.has(el.braceUid)) continue;
    const kg = globalK(el);
    const d = [el.i*3, el.i*3+1, el.i*3+2, el.j*3, el.j*3+1, el.j*3+2];
    for (let a = 0; a < 6; a++)
      for (let b = 0; b < 6; b++)
        K[d[a]][d[b]] += kg[a][b];
    const pg = globalEqLoad(el, p);
    for (let a = 0; a < 6; a++) F[d[a]] += pg[a];
  }

  for (let idx = 0; idx < nodes.length; idx++) {
    if (nodes[idx].pLoad) F[idx*3+1] -= nodes[idx].pLoad;
  }

  for (let lv = 1; lv <= nLev; lv++) {
    const H = Number(p['H'+lv]) || 0;
    if (Math.abs(H) > 1e-12) F[nid(0, lv)*3] += H;
  }

  /* ---- 4. 支座：从 Model.supports 恢复 fixed / rotSpring / fixedDisp ---- */
  const fixed = new Set();
  const rotSpring = new Float64Array(ndof);
  const fixedDisp = new Map();
  const hFloor1 = (nodes.length > nid(0,1)) ? (nodes[nid(0,1)].y - nodes[nid(0,0)].y) : 0;

  const E_frame = (p.frameMat === 'steel') ? E_STEEL : E_CONC;
  /* sec 已在 solve 开头前置声明，此处不再重复 getSecProps。 */
  const Ic = sec.Ic;
  const EIc = E_frame * Ic;
  const isMidCol = (c) => (c > 0 && c < nBay);

  const supportById = new Map();
  for (const s of model.supports) supportById.set(s.node, s);

  let anyHorizSupport = false;
  for (let c = 0; c < nCol; c++) {
    const n = nid(c, 0);            // 这是数组索引
    const nId = model.nodes[n].id;  // 真实 ID
    const thz = n*3 + 2;
    const sup = supportById.get(nId);
    if (!sup) continue;

    let supType;
    if (sup.ux === 'free' && sup.uy === 'fixed') supType = 'roller';
    else if (sup.ux === 'fixed' && sup.uy === 'fixed' && sup.rz === 'fixed') supType = 'fixed';
    else if (sup.ux === 'fixed' && sup.uy === 'fixed' && sup.rz === 'free') supType = 'pin';
    else if (sup.ux === 'fixed' && sup.uy === 'fixed' && sup.rz === 'spring') supType = 'spring';
    else supType = 'fixed';

    if (supType === 'roller') {
      fixed.add(n*3+1);
    } else {
      fixed.add(n*3);
      fixed.add(n*3+1);
      anyHorizSupport = true;

      if (supType === 'fixed') {
        fixed.add(thz);
      } else if (supType === 'spring') {
        const kRz = Number(sup.kRz);
        if (Number.isFinite(kRz) && kRz > 0) {
          rotSpring[thz] = kRz;
        } else if (hFloor1 > 0) {
          const entry = (p.supportMap || {})[String(c)] || {};
          const entryBeta = (entry.betaF != null) ? Number(entry.betaF) : Number(p.betaF);
          if (entryBeta > BETA_HINGE && entryBeta < BETA_FIXED) {
            const kc = isMidCol(c) ? (Number(p.r) || 1.0) : 1.0;
            rotSpring[thz] = (4 * EIc * kc / hFloor1) * entryBeta / (1 - entryBeta);
          }
        }
      }
    }

    if (sup.prescribed) {
      if (sup.prescribed.uy != null && Math.abs(sup.prescribed.uy) > 1e-12) {
        fixedDisp.set(n*3+1, Number(sup.prescribed.uy));
      }
      if (sup.prescribed.rz != null && Math.abs(sup.prescribed.rz) > 1e-12) {
        fixedDisp.set(n*3+2, Number(sup.prescribed.rz));
        fixed.add(thz);
        rotSpring[thz] = 0;
      }
    }
  }

  if (!anyHorizSupport && nCol > 0) {
    throw new Error('所有柱底均为滚轴支座，水平方向无约束，结构为机构。请至少设置一根柱为固接或铰接以提供水平约束。');
  }

  for (let i = 0; i < ndof; i++) {
    if (rotSpring[i] > 0) K[i][i] += rotSpring[i];
  }

  const hasSettlement = fixedDisp.size > 0;

  /* ---- 5. 刚性楼板：从 Model.constraints 恢复 reduce ---- */
  const reduce = new Int32Array(ndof);
  for (let i = 0; i < ndof; i++) reduce[i] = i;

  for (const c of model.constraints) {
    if (c.type !== 'diaphragm') continue;
    const masterIdx = id2idx.get(c.master);
    const masterUx = masterIdx * 3;
    for (const nidVal of c.nodes) {
      const idx = id2idx.get(nidVal);
      reduce[idx * 3] = masterUx;
    }
  }

  if (p.Hmode === 'rigid') {
    const K_r = zeros(ndof, ndof);
    const F_r = new Float64Array(ndof);
    for (let i = 0; i < ndof; i++) {
      const ri = reduce[i];
      F_r[ri] += F[i];
      for (let j = 0; j < ndof; j++) {
        K_r[ri][reduce[j]] += K[i][j];
      }
    }
    for (let i = 0; i < ndof; i++) {
      for (let j = 0; j < ndof; j++) K[i][j] = K_r[i][j];
      F[i] = F_r[i];
    }
  }

  const fixedR = new Set();
  for (const i of fixed) fixedR.add(reduce[i]);

  const free = [];
  for (let i = 0; i < ndof; i++) if (!fixedR.has(i) && reduce[i] === i) free.push(i);

  /* ---- 6. 高斯消元（Jacobi 缩放） ---- */
  const nf = free.length;
  const A = zeros(nf, nf + 1);
  const scaleD = new Float64Array(nf);

  for (let a = 0; a < nf; a++) {
    const ia = free[a];
    const kii = Math.abs(K[ia][ia]);
    scaleD[a] = kii > 1e-12 ? 1 / Math.sqrt(kii) : 1;
  }

  for (let a = 0; a < nf; a++) {
    const ia = free[a];
    const da = scaleD[a];
    for (let b = 0; b < nf; b++) {
      A[a][b] = K[ia][free[b]] * da * scaleD[b];
    }
    let rhs = F[ia];
    if (hasSettlement) {
      for (const [cdof, cval] of fixedDisp) {
        rhs -= K[ia][reduce[cdof]] * cval;
      }
    }
    A[a][nf] = rhs * da;
  }

  for (let col = 0; col < nf; col++) {
    let piv = col;
    for (let r = col + 1; r < nf; r++)
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (piv !== col) { const t = A[piv]; A[piv] = A[col]; A[col] = t; }
    const pv = A[col][col];
    if (Math.abs(pv) < 1e-14) {
      throw new Error('刚度矩阵奇异：结构缺乏侧向刚度（如全铰接框架未设支撑），或为几何可变体系。');
    }
    for (let r = col + 1; r < nf; r++) {
      const f = A[r][col] / pv;
      if (f === 0) continue;
      for (let cc = col; cc <= nf; cc++) A[r][cc] -= f * A[col][cc];
    }
  }

  const Ys = new Float64Array(nf);
  for (let a = nf - 1; a >= 0; a--) {
    if (Math.abs(A[a][a]) < 1e-14) {
      throw new Error('回代失败：对角元近零。');
    }
    let s = A[a][nf];
    for (let b = a + 1; b < nf; b++) s -= A[a][b] * Ys[b];
    Ys[a] = s / A[a][a];
  }

  const U = new Float64Array(ndof);
  for (let a = 0; a < nf; a++) {
    U[free[a]] = Ys[a] * scaleD[a];
  }
  for (const [cdof, cval] of fixedDisp) {
    U[reduce[cdof]] = cval;
  }

  let hasLateralForce = false;
  for (let lv = 1; lv <= nLev; lv++) {
    if (Math.abs(Number(p['H'+lv]) || 0) > 1e-12) hasLateralForce = true;
  }
  if (!hasLateralForce && !hasSettlement) {
    for (let i = 0; i < ndof; i += 3) {
      if (Math.abs(U[i]) < 1e-7) U[i] = 0;
    }
  }

  if (p.Hmode === 'rigid') {
    for (let i = 0; i < ndof; i++) {
      if (reduce[i] !== i) U[i] = U[reduce[i]];
    }
  }

  /* ---- 7. 杆端力 ---- */
  const results = els.map(el => {
    const d = [el.i*3, el.i*3+1, el.i*3+2, el.j*3, el.j*3+1, el.j*3+2];
    const ug = new Float64Array(6);
    for (let a = 0; a < 6; a++) ug[a] = U[d[a]];
    const ul = matVec(Tmat(el), ug);
    const ku = matVec(localK(el), ul);
    const pl = localEqLoad(el, p);
    const f = new Float64Array(6);
    for (let a = 0; a < 6; a++) f[a] = ku[a] - pl[a];

    let forceToReturn = f;
    if (el.kind === 'brace' && inactiveBraces.has(el.braceUid)) {
      forceToReturn = new Float64Array(6);
    }
    return { el, f: forceToReturn, ug, _real_f: f };
  });

  /* ---- 8. 反力与残差 ---- */
  const KU = matVec(K, U);
  const R = new Float64Array(ndof);
  for (let i = 0; i < ndof; i++) R[i] = KU[i] - F[i];
  for (let i = 0; i < ndof; i++) {
    if (rotSpring[i] > 0) R[i] -= rotSpring[i] * U[i];
  }

  let Rx = 0, Ry = 0;
  for (let c = 0; c < nCol; c++) {
    const n = nid(c, 0);
    Rx += R[n*3];
    Ry += R[n*3+1];
  }

  let appliedFx = 0, appliedFy = 0;
  for (const el of els) {
    if (el.kind === 'brace') continue;
    const pg = globalEqLoad(el, p);
    appliedFx += pg[0] + pg[3];
    appliedFy += pg[1] + pg[4];
  }
  for (let idx = 0; idx < nodes.length; idx++) {
    if (nodes[idx].pLoad) appliedFy -= nodes[idx].pLoad;
  }
  for (let lv = 1; lv <= nLev; lv++) appliedFx += Number(p['H'+lv]) || 0;

  const residX = appliedFx + Rx;
  const residY = appliedFy + Ry;

  /* ---- 9. rho：逐层逐跨 ---- */
  const Ib = sec.Ib; // sec 已在支座计算处声明，这里直接复用，避免重复 const 报错
  const EIb = E_frame * Ib;

  const X = [], Y = [];
  for (let c = 0; c < nCol; c++) X.push(nodes[nid(c, 0)].x);
  for (let lv = 0; lv <= nLev; lv++) Y.push(nodes[nid(0, lv)].y);

  const rho = [];
  for (let lv = 1; lv <= nLev; lv++) {
    const hlv = Y[lv] - Y[lv-1];
    const row = [];
    for (let c = 0; c < nBay; c++) {
      const Lc = X[c+1] - X[c];
      const kcL = isMidCol(c) ? (Number(p.r) || 1.0) : 1.0;
      const kcR = isMidCol(c+1) ? (Number(p.r) || 1.0) : 1.0;
      const EIcAvg = EIc * (kcL + kcR) / 2;
      const spanKey = lv + '-' + (c + 1);
      if (p.removeBeamMap && p.removeBeamMap[spanKey]) {
        row.push(null);
      } else {
        row.push((EIb / Lc) / (EIcAvg / hlv));
      }
    }
    rho.push(row);
  }

  return {
    nodes, els, U, results, p, R,
    residX, residY,
    nBay, nLev, nCol, nid, rho,
    nFree: nf,
    inactiveBraces,
  };
}

/* =====================================================================
   analyze(p)：胶水层。建模交给 parametricGenerator，求解交给 solve。
   ===================================================================== */
function analyze(p, opts = {}){
  return solve(parametricGenerator(p), opts);
}

function analyzeTensionOnly(p) {
  let inactiveBraces = new Set();
  let m = null;
  let converged = false;
  const hasTemp = Math.abs(p.tempAll || 0) > 1e-6 || Math.abs(p.tempGrad || 0) > 1e-6;

  const seenFingerprints = new Set();
  for(let iter=0; iter<15; iter++) {
    try {
      m = analyze(p, { inactiveBraces });
    } catch(err) {
      if(inactiveBraces.size > 0) {
        if (hasTemp) {
           throw new Error('温度工况下，仅受拉支撑发生刚度奇异（可能是温度膨胀导致全截面受压而退出）。建议关闭该格「仅受拉」或减小温差。');
        }
        throw new Error('仅受拉支撑全部退出（已失效 ' + inactiveBraces.size + ' 根），结构可能失稳：' + err.message);
      }
      throw err;
    }
    let changed = false;
    let nextInactiveBraces = new Set();
    
    for(const res of m.results) {
      if(res.el.kind === 'brace' && res.el.tensionOnly) {
        const key = res.el.braceUid;
        const axialN = -res._real_f[0]; // 用真实受力判断
        
        if(axialN < -1e-4) {
          nextInactiveBraces.add(key);
          if(!inactiveBraces.has(key)) changed = true;
        } else {
          if(inactiveBraces.has(key)) changed = true; // 重新受拉，被激活
        }
      }
    }
    
    // 【修复 A5】优先判断收敛：若前后两次迭代的失效集合完全相同，说明已达平衡，直接收敛。
    if(!changed){ 
      converged = true; 
      break; 
    }
    
    // 振荡检测：若状态发生了改变（changed为true），且与历史某次完全相同，说明在两点间反复横跳。
    const fp = [...nextInactiveBraces].sort().join('|');
    if(seenFingerprints.has(fp)){
      console.warn(hasTemp ? '温度工况下仅受拉支撑振荡' : '仅受拉支撑迭代出现振荡，输出最后一轮近似解。');
      converged = false; // 标记为未收敛
      break;             // 跳出循环
    }
    seenFingerprints.add(fp);
    
    inactiveBraces = nextInactiveBraces;
  }
  if(m) m.tensionConverged = converged;
  return m;
}