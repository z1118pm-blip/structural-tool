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
  let b=12*EI/(L*L*L);
  let c=6*EI/(L*L);
  let d=4*EI/L;
  let e=2*EI/L;

  if(el.kind === 'beam'){
    if(el.hinge){
      /* 两端完全铰接：弯曲刚度项全为 0，只剩轴向 */
      b = 0; c = 0; d = 0; e = 0;
    } else if(el.alpha > 0){
      const al = el.alpha;
      const D  = 1 + 8*al + 12*al*al;
      b = 12*EI/(L*L*L) / (1 + 6*al);
      c = 6*EI/(L*L) * (1 + 2*al) / D;
      d = (4*EI/L) * (1 + 3*al) / D;
      e = (2*EI/L) / D;
    }
  }

  return [
    [ a,  0,  0, -a,  0,  0],
    [ 0,  b,  c,  0, -b,  c],
    [ 0,  c,  d,  0, -c,  e],
    [-a,  0,  0,  a,  0,  0],
    [ 0, -b, -c,  0,  b, -c],
    [ 0,  c,  e,  0, -c,  d]
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
function localEqLoad(el){
  const {w,L}=el;
  let pFe = w*L*L/12;

  if(el.kind === 'beam'){
    if(el.hinge){
      /* 两端铰接：固端弯矩为 0，均布荷载全部转为节点力 */
      pFe = 0;
    } else if(el.alpha > 0){
      const al = el.alpha;
      const D  = 1 + 8*al + 12*al*al;
      pFe = (w*L*L/12) * (1 + 6*al) / D;
    }
  }

  return [0, w*L/2, pFe, 0, w*L/2, -pFe];
}
function globalEqLoad(el){
  return matVec(transpose(Tmat(el)), localEqLoad(el));
}

/* =====================================================================
   4. 建模 + 求解
   ===================================================================== */
/* 已删除：colKeff 端点转动弹簧模型已废弃。
   水平力分配现统一采用规范 D 值法 α_c 公式（见 computeHShare），
   以与帮助文档第七节、D 值法规范一致。 */

/* 水平力按柱分配的权重（未归一化）。
   返回长度为 nCol 的数组。三处调用方（求解 / 荷载图 / 读数面板）
   共用这一份逻辑，改分配规则时只需改这里。

   - Hmode='left'：全部给左柱 → [1, 0, 0, ...]
   - Hmode='dstiff'：权重 = 规范 D 值法 α_c 计算出的柱侧移刚度 D。
     底层严格区分柱脚固接/铰接两套 K 值并按 β_f 插值；
     一般层使用 K/(2+K)。边柱与内柱的 Σi_b、i_c 均逐柱计算。 */
function computeHShare(p, nCol, level){
  if(p.Hmode === 'left'){
    const w = new Array(nCol).fill(0);
    w[0] = 1;
    return w;
  }
  const bcM = p.bc/1000, hcM = p.hc/1000;
  const bbM = p.bb/1000, hbM = p.hb/1000;
  const Ic = bcM * Math.pow(hcM, 3) / 12;
  const Ib = bbM * Math.pow(hbM, 3) / 12;
  const EIc = E_CONC * Ic;
  const EIb = E_CONC * Ib;

  const h = p['h' + level];
  const w = [];

  /* β_j 启发式折减：β_j < 1 时 K ← K·β_j。
     ⚠ 这不是标准半刚接 D 值修正，仅保证 β_j→0 时侧移刚度下降；
     无严格推导，文档"已知近似"已注明。 */
  const bjRed = (p.betaJ < BETA_FIXED) ? p.betaJ : 1.0;

  for (let c = 0; c < nCol; c++) {
    const kc = (c > 0 && c < nCol - 1) ? p.r : 1.0;
    const ic = (EIc * kc) / h;

    let sum_ib = 0;
    if (c > 0) sum_ib += EIb / p['L' + c];
    if (c < nCol - 1) sum_ib += EIb / p['L' + (c + 1)];

    let alpha = 0;
    if (level === 1) {
      /* 底层：柱脚固接 / 铰接两套 K 与 α_c，按 β_f 线性插值。
         旧实现底层 K 始终用固接公式 sum_ib/ic，却代入铰接 α_c，
         β_f=0 时 D 高估约 38%，内柱份额偏差约 2.5 个百分点。 */
      const Kfix = Math.max((sum_ib / ic)     * bjRed, 1e-4);
      const aFix = (0.5 + Kfix) / (2 + Kfix);
      const aHin = (0.5 * Kfix) / (1 + 2 * Kfix);
      alpha = aHin + (aFix - aHin) * p.betaF;
    } else {
      /* 一般层：K = Σi_b/(2i_c)，α_c = K/(2+K) */
      const K = Math.max((sum_ib / (2 * ic)) * bjRed, 1e-4);
      alpha = K / (2 + K);
    }
    /* α_c 下限 0.05：防止 K→0 时 D→0 导致除零，
       ⚠ 无严格依据，文档"已知近似"已注明。 */
    alpha = Math.max(alpha, 0.05);

    const D = alpha * (12 * EIc * kc) / (h * h * h);
    w.push(D);
  }
  return w;
}

function analyze(p){
  const nBay = p.nBay;
  const nLev = p.nLev;
  const nCol = nBay + 1;                    // 柱列数 = 跨数 + 1

  /* ---- 坐标累加 ---- */
  const X = [0];
  for(let i=0;i<nBay;i++) X.push(X[i] + p['L'+(i+1)]);
  const Y = [0];
  for(let i=0;i<nLev;i++) Y.push(Y[i] + p['h'+(i+1)]);

  /* ---- 节点：主结构 + 可选右侧悬挑 ---- */
  const nodes = [];
  for(let c=0;c<nCol;c++)
    for(let lv=0;lv<=nLev;lv++)
      nodes.push({x:X[c], y:Y[lv], col:c, lev:lv});
  if(p.hasCant){
    for(let lv=1;lv<=nLev;lv++)
      nodes.push({x:X[nBay]+p.Lc, y:Y[lv], col:nBay, lev:lv, cant:true});
  }

  /* 编号：nid(c,lv) 主结构；cantNid(lv) 悬挑端（挂在末尾） */
  const nid = (c,lv) => c*(nLev+1) + lv;
  const cantNid = (lv) => nCol*(nLev+1) + (lv-1);

  /* ---- 截面特性 ---- */
  const bcM=p.bc/1000, hcM=p.hc/1000;
  const bbM=p.bb/1000, hbM=p.hb/1000;
  const Ic = bcM*Math.pow(hcM,3)/12;
  const Ib = bbM*Math.pow(hbM,3)/12;
  const Ac = bcM*hcM;
  const Ab = bbM*hbM;
  const EIc = E_CONC*Ic;
  const EIb = E_CONC*Ib;
  const EAc = E_CONC*Ac;
  const EAb = E_CONC*Ab;

  const els=[];
  const isMidCol = (c) => (c>0 && c<nBay);   // 内柱判定：0 < c < nBay

  /* ---- 柱：nCol 列 × nLev 根 ---- */
  for(let c=0;c<nCol;c++){
    const kc = isMidCol(c) ? p.r : 1.0;
    const EAcc = EAc * kc;
    const EIcc = EIc * kc;
    for(let lv=0;lv<nLev;lv++){
      const i=nid(c,lv), j=nid(c,lv+1);
      const dx=nodes[j].x-nodes[i].x, dy=nodes[j].y-nodes[i].y;
      const L=Math.hypot(dx,dy);
      els.push({i,j,L,cs:dx/L,sn:dy/L,EA:EAcc,EI:EIcc,w:0,q:0,kind:'col',lev:lv+1,col:c});
    }
  }

  /* ---- 半刚接 / 完全铰接参数 ----
     - betaJ >= BETA_FIXED：alphaJ = 0，标准刚接梁单元；
     - betaJ 在中间区间：alphaJ = (1-betaJ)/(4·betaJ)，标准半刚接；
     - betaJ <= BETA_HINGE：走显式铰接分支，梁的弯曲刚度项全部置 0。
       旧代码用 alphaJ = 1e6 近似无穷大，会让 D = 1 + 8α + 12α² ≈ 1.2e13，
       矩阵条件数急剧恶化；这里改成真正的铰接单元，数值上干净得多。 */
  let alphaJ = 0;
  let beamHinge = false;
  if(p.betaJ < BETA_FIXED){
    if(p.betaJ <= BETA_HINGE){
      beamHinge = true;
    } else {
      alphaJ = (1 - p.betaJ) / (4 * p.betaJ);
    }
  }

  /* ---- 跨内梁：nLev 层 × nBay 跨 ---- */
  for(let lv=1;lv<=nLev;lv++){
    const q = p['q'+lv];
    for(let c=0;c<nBay;c++){
      const i=nid(c,lv), j=nid(c+1,lv);
      const dx=nodes[j].x-nodes[i].x, dy=nodes[j].y-nodes[i].y;
      const L=Math.hypot(dx,dy);
      els.push({i,j,L,cs:dx/L,sn:dy/L,EA:EAb,EI:EIb,w:-q,q,
                kind:'beam',alpha:alphaJ,hinge:beamHinge,lev:lv,bay:c+1});
    }
  }

  /* ---- 悬挑梁：仅右侧，nLev 根 ---- */
  if(p.hasCant){
    for(let lv=1;lv<=nLev;lv++){
      const q = p['qc'+lv];
      const i = nid(nBay,lv);
      const j = cantNid(lv);
      const dx=nodes[j].x-nodes[i].x, dy=nodes[j].y-nodes[i].y;
      const L=Math.hypot(dx,dy);
      els.push({i,j,L,cs:dx/L,sn:dy/L,EA:EAb,EI:EIb,w:-q,q,
                kind:'beam',isCant:true,alpha:0,lev:lv});
    }
  }

  const ndof = nodes.length*3;
  const K = zeros(ndof,ndof);
  const F = new Float64Array(ndof);

  for(const el of els){
    const kg = globalK(el);
    const d=[el.i*3, el.i*3+1, el.i*3+2, el.j*3, el.j*3+1, el.j*3+2];
    for(let a=0;a<6;a++)
      for(let b=0;b<6;b++)
        K[d[a]][d[b]] += kg[a][b];

    const pg = globalEqLoad(el);
    for(let a=0;a<6;a++) F[d[a]] += pg[a];
  }

  /* ---- 水平力施加（nCol 柱通用） ---- */
  function applyFloorH(level, H){
    if(H <= 0) return;
    /* computeHShare 保证 sum > 0：
       left 模式 sum = 1；dstiff 模式 sum ≥ cE 或均分时 = nCol。
       不再需要 sum 兜底分支。 */
    const w = computeHShare(p, nCol, level);
    let sum = 0;
    for(const v of w) sum += v;
    for(let c=0;c<nCol;c++) F[nid(c, level)*3] += H * w[c] / sum;
  }
  for(let lv=1;lv<=nLev;lv++) applyFloorH(lv, p['H'+lv]);

  /* ---- 柱脚：nCol 个 ---- */
  const fixed=new Set();
  const rotSpring = new Float64Array(ndof);
  const hFloor1 = Y[1] - Y[0];
  for(let c=0;c<nCol;c++){
    const n = nid(c,0);
    fixed.add(n*3);
    fixed.add(n*3+1);
    const thz = n*3 + 2;
    if(p.betaF >= BETA_FIXED){
      fixed.add(thz);
    } else if(p.betaF > BETA_HINGE){
      const kc = isMidCol(c) ? p.r : 1.0;
      const EIcol = EIc * kc;
      const Rf = (4*EIcol/hFloor1) * p.betaF / (1 - p.betaF);
      rotSpring[thz] = Rf;
    }
  }
  for(let i=0;i<ndof;i++){
    if(rotSpring[i] > 0) K[i][i] += rotSpring[i];
  }

/* =====================================================================
   【核心修复：消除数值虚假侧移 - 求解前约束】
   单跨无悬挑且无水平力时，利用对称性将各层水平位移直接设为已知边界条件(0)，
   避免全铰接时侧向刚度阵为0导致的矩阵奇异崩溃。
   ===================================================================== */
let sumH = 0;
for(let lv=1; lv<=nLev; lv++) sumH += p['H'+lv];

if (Math.abs(sumH) < 1e-12 && nBay === 1 && !p.hasCant) {
  for(let lv=1; lv<=nLev; lv++){
    fixed.add(nid(0, lv)*3);
    fixed.add(nid(1, lv)*3);
  }
}

const free=[];
for(let i=0;i<ndof;i++) if(!fixed.has(i)) free.push(i);

  /* ---- 高斯消元（引入 Jacobi 矩阵对称缩放，消除截面刚度悬殊带来的数值病态） ---- */
  const nf=free.length;
  const A=zeros(nf,nf+1);
  const scaleD = new Float64Array(nf);
  
  // 提取各自由度的对角刚度，计算缩放因子
  for(let a=0;a<nf;a++){
    const ia = free[a];
    const kii = Math.abs(K[ia][ia]);
    scaleD[a] = kii > 1e-12 ? 1 / Math.sqrt(kii) : 1;
  }

  // 组装缩放后的方程 K' U' = F'
  for(let a=0;a<nf;a++){
    const ia = free[a];
    const da = scaleD[a];
    for(let b=0;b<nf;b++){
      A[a][b] = K[ia][free[b]] * da * scaleD[b];
    }
    A[a][nf] = F[ia] * da;
  }

  for(let col=0;col<nf;col++){
    let piv=col;
    for(let r=col+1;r<nf;r++)
      if(Math.abs(A[r][col])>Math.abs(A[piv][col])) piv=r;
    if(piv!==col){ const t=A[piv]; A[piv]=A[col]; A[col]=t; }
    const pv=A[col][col];
    if(Math.abs(pv)<1e-14){
      throw new Error('刚度矩阵奇异：结构缺乏侧向刚度（如全铰接框架未设支撑），或为几何可变体系。');
    }
    for(let r=col+1;r<nf;r++){
      const f=A[r][col]/pv;
      if(f===0) continue;
      for(let cc=col;cc<=nf;cc++) A[r][cc]-=f*A[col][cc];
    }
  }
  
  // 回代求解缩放的位移 Ys
  const Ys=new Float64Array(nf);
  for(let a=nf-1;a>=0;a--){
    if(Math.abs(A[a][a])<1e-14){
      throw new Error('回代失败：对角元近零。');
    }
    let s=A[a][nf];
    for(let b=a+1;b<nf;b++) s-=A[a][b]*Ys[b];
    Ys[a]=s/A[a][a];
  }

  // 还原真实位移 U
  const U=new Float64Array(ndof);
  for(let a=0;a<nf;a++){
    U[free[a]] = Ys[a] * scaleD[a];
  }

  // 过滤纯竖向荷载在多跨对称结构下产生的极微小浮点侧移噪声（阈值 1e-7 米，即 0.0001 毫米）
  let hasLateralForce = false;
  for(let lv=1; lv<=nLev; lv++) { if(p['H'+lv] > 0) hasLateralForce = true; }
  if (!hasLateralForce) {
    for(let i=0; i<ndof; i+=3) {
      if (Math.abs(U[i]) < 1e-7) U[i] = 0;
    }
  }

  /* 已删除：单跨纯竖向荷载的"求解后虚假侧移修正"。
     实际约束已在求解前 fixed.add 完成（各层柱顶水平位移固定为 0），
     求解后 U 在这些自由度上精确为 0，此处修正冗余；
     且原代码只修顶层，nLev>1 时下面各层未对称化，逻辑不完整。
     保留 fixed.add 即可，无需事后修正。 */

  /* ---- 杆端力 ---- */
  const results = els.map(el=>{
    const d=[el.i*3, el.i*3+1, el.i*3+2, el.j*3, el.j*3+1, el.j*3+2];
    const ug=new Float64Array(6);
    for(let a=0;a<6;a++) ug[a]=U[d[a]];
    const ul = matVec(Tmat(el), ug);
    const ku = matVec(localK(el), ul);
    const pl = localEqLoad(el);
    const f  = new Float64Array(6);
    for(let a=0;a<6;a++) f[a]=ku[a]-pl[a];
    return {el, f, ug};
  });

  /* ---- 反力 ---- */
  const KU = matVec(K, U);
  const R  = new Float64Array(ndof);
  for(let i=0;i<ndof;i++) R[i] = KU[i] - F[i];
  for(let i=0;i<ndof;i++){
    if(rotSpring[i] > 0) R[i] -= rotSpring[i] * U[i];
  }

  /* ---- 平衡残差 ---- */
  let Rx=0, Ry=0;
  for(let c=0;c<nCol;c++){
    const n = nid(c,0);
    Rx += R[n*3];
    Ry += R[n*3+1];
  }
  let appliedFx = 0;
  for(let lv=1;lv<=nLev;lv++) appliedFx += p['H'+lv];
  let appliedFy = 0;
  for(let lv=1;lv<=nLev;lv++){
    const q = p['q'+lv];
    for(let c=0;c<nBay;c++) appliedFy -= q * (X[c+1]-X[c]);
    if(p.hasCant) appliedFy -= p['qc'+lv] * p.Lc;
  }
  const residX = appliedFx + Rx;
  const residY = appliedFy + Ry;

  /* ---- ρ：逐层逐跨 ---- */
  const rho = [];
  for(let lv=1;lv<=nLev;lv++){
    const hlv = Y[lv] - Y[lv-1];
    const row = [];
    for(let c=0;c<nBay;c++){
      const Lc = X[c+1] - X[c];
      row.push((EIb / Lc) / (EIc / hlv));
    }
    rho.push(row);
  }
  return {nodes, els, U, results, p, R, residX, residY,
          nBay, nLev, nCol, nid, rho, nFree: nf};
}