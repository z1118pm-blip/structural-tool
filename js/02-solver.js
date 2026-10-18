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
  } else if(el.kind === 'brace'){
    /* 斜撑：仅轴向刚度，无弯曲刚度 */
    b = 0; c = 0; d = 0; e = 0;
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
/* 已删除：colKeff 端点转动弹簧模型已废弃。 */

/* 已删除：computeHShare（D 值法分配）。
   现已由刚性楼板约束（Hmode='rigid'）或真实自由度（Hmode='none'）接管，
   FEM 内部自动分配。 */

function analyze(p, opts = {}){
  const inactiveBraces = opts.inactiveBraces || new Set();
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
  const E_frame = (p.frameMat === 'steel') ? E_STEEL : E_CONC;
  const E_brace = (p.braceMat === 'steel') ? E_STEEL : E_CONC;
  
  const bcM=p.bc/1000, hcM=p.hc/1000;
  const bbM=p.bb/1000, hbM=p.hb/1000;
  const Ic = bcM*Math.pow(hcM,3)/12;
  const Ib = bbM*Math.pow(hbM,3)/12;
  const Ac = bcM*hcM;
  const Ab = bbM*hbM;
  
  const EIc = E_frame*Ic;
  const EIb = E_frame*Ib;
  /* 轴向变形开关：'rigid' 时把梁柱轴向刚度相对放大 1e6 倍，
     使轴向变形远小于弯曲变形，模拟传统手算"轴向不可伸长"假定。
     注意：EI 不动（只锁轴向），支撑 EAs 不受影响。 */
  const axialBoost = (p.axialMode === 'rigid') ? 1e6 : 1;
  const EAc = E_frame*Ac*axialBoost;
  const EAb = E_frame*Ab*axialBoost;
  
  const EAs = E_brace * ((p.As || 2000) / 1000000); // mm² 转 m²

  let els=[];
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

  /* ---- 斜撑：按 p.braceMap 生成 ---- */
  /* 每格可独立开启「仅受拉」（p.braceTensionMap[lv-bay] = true）。
     X 撑同格两根统一跟随该格的仅受拉状态；失效判定仍按单根斜杆各自进行。 */
  if(p.braceMap){
    const tensionMap = (p.braceTensionMap && typeof p.braceTensionMap === 'object') ? p.braceTensionMap : {};
    for(let lv=1; lv<=nLev; lv++){
      for(let c=0; c<nBay; c++){
        const gridKey = lv + '-' + (c+1);
        const type = p.braceMap[gridKey];
        if(!type || type === 'none') continue;
        const tensionOnly = !!tensionMap[gridKey];
        const lb = nid(c, lv-1), rb = nid(c+1, lv-1);
        const lt = nid(c, lv),   rt = nid(c+1, lv);
        const addBrace = (i, j, dir) => {
          const dx=nodes[j].x-nodes[i].x, dy=nodes[j].y-nodes[i].y;
          const L=Math.hypot(dx,dy);
          els.push({i,j,L,cs:dx/L,sn:dy/L,EA:EAs,EI:0,w:0,q:0,
                    kind:'brace',lev:lv,bay:c+1,
                    braceUid: gridKey + '-' + dir,
                    tensionOnly});
        };
        if(type === 'X'){
          addBrace(lb, rt, 'd1');
          addBrace(rb, lt, 'd2');
        } else if(type === '/'){
          addBrace(lb, rt, 'd1');
        } else if(type === '\\'){
          addBrace(rb, lt, 'd2');
        }
      }
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
    /* 仅受拉迭代中已判定失效的支撑：不组装刚度、不贡献等效荷载 */
    if(el.kind === 'brace' && inactiveBraces.has(el.braceUid)) continue;
    const kg = globalK(el);
    const d=[el.i*3, el.i*3+1, el.i*3+2, el.j*3, el.j*3+1, el.j*3+2];
    for(let a=0;a<6;a++)
      for(let b=0;b<6;b++)
        K[d[a]][d[b]] += kg[a][b];

    const pg = globalEqLoad(el);
    for(let a=0;a<6;a++) F[d[a]] += pg[a];
  }

  /* ---- 水平力施加 ---- */
  /* rigidDiaphragm=false：按 D 值法分配（原逻辑，保留）；
     rigidDiaphragm=true ：力加左柱顶，由刚性楼板约束自动分配到各柱。 */
  function applyFloorH(level, H){
    if(H <= 0) return;
    /* 无论有无楼板，力都加在左柱顶。刚性楼板会通过约束自动分配。 */
    F[nid(0, level)*3] += H;
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
   支座沉降：非零已知位移（仅单柱竖向）
   - fixedDisp 记录 DOF 索引 → 位移值（米）
   - 组装 RHS 时减 K_fc·U_c，求解后把值写回 U
   - 有沉降时跳过"单跨对称约束"和"浮点噪声清理"，避免掩盖沉降效应
   ===================================================================== */
const fixedDisp = new Map();
const hasSettlement = (p.settleDy > 0);
if (hasSettlement) {
  const sc = Math.max(0, Math.min(nCol - 1, p.settleCol | 0));
  const nSettle = nid(sc, 0);
  fixedDisp.set(nSettle*3 + 1, -(p.settleDy | 0) * 1e-3);  // uy 向下为负
}

/* =====================================================================
   【核心修复：消除数值虚假侧移 - 求解前约束】
   单跨无悬挑且无水平力时，利用对称性将各层水平位移直接设为已知边界条件(0)，
   避免全铰接时侧向刚度阵为0导致的矩阵奇异崩溃。
   注意：有沉降时必须跳过，否则会吃掉沉降引起的不对称侧移。
   ===================================================================== */
let sumH = 0;
for(let lv=1; lv<=nLev; lv++) sumH += p['H'+lv];

if (Math.abs(sumH) < 1e-12 && nBay === 1 && !p.hasCant && !hasSettlement) {
  for(let lv=1; lv<=nLev; lv++){
    fixed.add(nid(0, lv)*3);
    fixed.add(nid(1, lv)*3);
  }
}

/* =====================================================================
   刚性楼板自由度缩并：同层各节点 ux 绑定到主节点（col=0 的 ux）
   - reduce[i] = i   表示 i 是独立/主 DOF
   - reduce[i] != i  表示 i 是从属 DOF，其位移等于主 DOF
   非 rigid 模式下 reduce 恒等，下游行为完全不变。
   ===================================================================== */
const reduce = new Int32Array(ndof);
for(let i=0;i<ndof;i++) reduce[i] = i;

if(p.Hmode === 'rigid'){
  const masterUx = new Int32Array(nLev+1).fill(-1);
  for(let lv=1; lv<=nLev; lv++) masterUx[lv] = nid(0, lv)*3;
  for(let idx=0; idx<nodes.length; idx++){
    const nd = nodes[idx];
    if(nd.lev < 1) continue;
    reduce[idx*3] = masterUx[nd.lev];
  }
  /* 缩并 K、F：所有贡献累加到主 DOF */
  const K_r = zeros(ndof, ndof);
  const F_r = new Float64Array(ndof);
  for(let i=0;i<ndof;i++){
    const ri = reduce[i];
    F_r[ri] += F[i];
    for(let j=0;j<ndof;j++){
      K_r[ri][reduce[j]] += K[i][j];
    }
  }
  for(let i=0;i<ndof;i++){
    for(let j=0;j<ndof;j++) K[i][j] = K_r[i][j];
    F[i] = F_r[i];
  }
}

/* fixed 集合转换到缩并后 DOF，自由 DOF 只保留主/独立 DOF */
const fixedR = new Set();
for(const i of fixed) fixedR.add(reduce[i]);

const free=[];
for(let i=0;i<ndof;i++) if(!fixedR.has(i) && reduce[i] === i) free.push(i);

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
    // 沉降产生的等效荷载：RHS -= K_fc · U_c
    // 按缩并后 DOF 映射，避免将来支持非柱脚沉降时索引错位（当前柱脚 uy 不参与缩并，映射为自身）
    let rhs = F[ia];
    if(hasSettlement){
      for(const [cdof, cval] of fixedDisp){
        rhs -= K[ia][reduce[cdof]] * cval;
      }
    }
    A[a][nf] = rhs * da;
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
  // 已知非零位移（支座沉降）写回 U（按缩并后 DOF 写入；从属 DOF 随后由刚性楼板循环统一继承）
  for(const [cdof, cval] of fixedDisp){
    U[reduce[cdof]] = cval;
  }
  // 过滤纯竖向荷载在多跨对称结构下产生的极微小浮点侧移噪声（阈值 1e-7 米，即 0.0001 毫米）
  // 先清理，再同步从属 DOF，保证刚性楼板约束一致性
  // 有沉降时不清理，避免抹掉沉降引起的结构倾斜
  let hasLateralForce = false;
  for(let lv=1; lv<=nLev; lv++) { if(p['H'+lv] > 0) hasLateralForce = true; }
  if (!hasLateralForce && !hasSettlement) {
    for(let i=0; i<ndof; i+=3) {
      if (Math.abs(U[i]) < 1e-7) U[i] = 0;
    }
  }

  /* 刚性楼板：从属 DOF 继承主 DOF 位移，U 长度和索引语义保持不变。
     放在浮点清理之后，避免清理主 DOF 后从属 DOF 残留微小值。 */
  if(p.Hmode === 'rigid'){
    for(let i=0;i<ndof;i++){
      if(reduce[i] !== i) U[i] = U[reduce[i]];
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
    /* 失效支撑：轴力按 0 输出，避免下一轮迭代反复抖动 */
    if(el.kind === 'brace' && inactiveBraces.has(el.braceUid)){
      return {el, f:new Float64Array(6), ug};
    }
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

function analyzeTensionOnly(p) {
  let inactiveBraces = new Set();
  let m = null;
  let converged = false;
  for(let iter=0; iter<10; iter++) {
    try {
      m = analyze(p, { inactiveBraces });
    } catch(err) {
      if(inactiveBraces.size > 0) {
        throw new Error('仅受拉支撑全部退出（已失效 ' + inactiveBraces.size + ' 根），结构可能失稳：' + err.message);
      }
      throw err;
    }
    let changed = false;
    for(const res of m.results) {
      if(res.el.kind === 'brace' && res.el.tensionOnly) {
        const key = res.el.braceUid;
        const axialN = -res.f[0]; // 提取轴力 N（拉为正，压为负）
        if(!inactiveBraces.has(key) && axialN < -1e-4) { // 若受压，标记失效
          inactiveBraces.add(key);
          changed = true;
        }
      }
    }
    if(!changed){ converged = true; break; }
  }
  if(m) m.tensionConverged = converged;
  return m;
}