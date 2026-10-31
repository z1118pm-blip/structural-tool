"use strict";

/* =====================================================================
   5. 内力与位移插值
   ===================================================================== */
function momentAt(res, x){
  const {el,f}=res;
  return -f[2] + f[1]*x + el.w*x*x/2;
}
function shearAt(res, x){
  const {el,f}=res;
  return f[1] + el.w*x;
}
function axialAt(res, x){
  return -res.f[0];
}
function internalAt(res, x, type){
  if(type === 'N') return axialAt(res, x);
  if(type === 'V') return shearAt(res, x);
  return momentAt(res, x);
}

/* （已移除未使用的 stressAt 函数，截面应力计算统一由 07-run.js 的 drawProbeCanvas 处理） */

/* 单元内部任意点的位移。
   当前实现：Hermite 形函数（端点位移 + 端点转角，由整体求解精确给出）
   + 均布荷载固端特解附加项。端点处位移/转角严格等于求解值，
   因此刚接节点变形后夹角严格保持 90°。
   注意：
   - 附加项 w·x²·(L−x)²/(24EI) 仅对两端有转动约束的跨内梁成立；
     悬挑梁（一端自由）跳过附加项，仅用 Hermite 插值。
   - 半刚接梁 (βj<1) 的附加项系数未按端部柔度修正，
     中间段存在小幅近似误差（端点仍精确）。 */
function elemDisp(res, x){
  const {el, ug, f} = res;
  const {L,cs,sn,EI,w}=el;
  const ul = matVec(Tmat(el), ug);
  const xi = x/L;

  const ulx = (1-xi)*ul[0] + xi*ul[3];
  const vi  = ul[1], vj = ul[4];
  let ti  = ul[2], tj = ul[5]; // 提取节点转角

  /* 二力杆（支撑）EI=0：位移沿杆轴线性插值，无弯曲挠度 */
  if(!(EI > 0)){
    const vly = (1-xi)*vi + xi*vj;
    return [cs*ulx - sn*vly, sn*ulx + cs*vly];
  }

  /* 完全铰接梁：弯曲刚度已被移除，节点转角不再代表该梁真实端转角。
     改用「端点弦线 + 简支梁均布特解 + 温度自由曲率」。 */
  /* 完全铰接梁：弯曲刚度已移除。同时兼容大 α 近似铰接
     （α ≥ 1e3，对应 β ≤ 2.5e-4，弯曲刚度已可忽略，
     generator 中 β_j=0 时 alphaJ=1e4 走此分支）。 */
  const _alI0 = (el.alphaI != null) ? el.alphaI : (el.alpha || 0);
  const _alJ0 = (el.alphaJ != null) ? el.alphaJ : (el.alpha || 0);
  if(el.kind === 'beam' && (el.hinge || (_alI0 >= 1e3 && _alJ0 >= 1e3))){
    const vUDL = (w !== 0)
      ? w * x * (L*L*L - 2*L*x*x + x*x*x) / (24 * EI)
      : 0;
    /* κ = -tempGradEff（由 localEqLoad 推出 M(0) = -baseT），
       正确挠度满足 v'' = κ → v = +0.5·tempGradEff·x(L-x)（向上拱）。 */
    const vTempH = 0.5 * (el.tempGradEff || 0) * x * (L - x);
    const vly = (1-xi)*vi + xi*vj + vUDL + vTempH;
    return [cs*ulx - sn*vly, sn*ulx + cs*vly];
  }

  /* 核心修复：半刚接梁的端部转角修正。
     彻底废弃基于内力 f 的数值反推（在柔度 alpha 极大时会产生浮点灾难）。
     改用刚度折减比例，在「节点实际转角」和「无弯曲的弦线斜率」之间进行平滑过渡：
     1. 柔度 alpha=0 (刚接) 时，因子为 1，真实转角 = 节点转角。
     2. 柔度 alpha->∞ (铰接) 时，因子为 0，真实转角 = 弦线斜率（直线）。
     从数学上保证整个过渡过程绝对平滑，彻底消除突变。 */
  if (el.kind === 'beam') {
    const alI = (el.alphaI != null) ? el.alphaI : (el.alpha || 0);
    const alJ = (el.alphaJ != null) ? el.alphaJ : (el.alpha || 0);
    
    /* 通过端部弹簧协调关系恢复梁自身端转角：
       M_i = k_spring_i · (θ_node_i − θ_beam_i)，k_spring_i = EI / (L·αI)
       ⇒ θ_beam_i = θ_node_i − M_i · αI · L / EI
       端点弯矩由求解器精确给出（f[2]/f[5]），不再使用经验折减。
       大柔度（α ≥ 1e3，近似铰接）直接取弦线，避免 0·∞。 */
    const theta_chord = (vj - vi) / L;
    if (alI > 0) {
      ti = (alI >= 1e3) ? theta_chord : (ti - f[2] * alI * L / EI);
    }
    if (alJ > 0) {
      tj = (alJ >= 1e3) ? theta_chord : (tj - f[5] * alJ * L / EI);
    }
  }

  /* 使用修正后的真实梁端转角进行 Hermite 插值，确保节点处位移与弹簧相对转角解耦 */
  const N1 = 1 - 3*xi*xi + 2*xi*xi*xi;
  const N2 = L*(xi - 2*xi*xi + xi*xi*xi);
  const N3 = 3*xi*xi - 2*xi*xi*xi;
  const N4 = L*(-xi*xi + xi*xi*xi);
  
  let vly = N1*vi + N2*ti + N3*vj + N4*tj;

  // 附加挠度：两端固定梁特解 v_add = w·x²(L-x)²/(24EI)。
  // 对任意边界条件，Hermite(精确端点) + 该特解 = 精确解（齐次解由 Hermite 捕捉，
  // 特解负责非齐次项）。悬挑梁 alphaI=alphaJ=0，端点由求解器精确给出，
  // 因此 H+A 严格等于悬臂梁精确挠度，不是近似。
  if (w !== 0) {
    /* 悬挑梁同样需要该特解：Hermite（端点精确）+ 该特解 = 真实四次挠度。
       原 !el.isCant 排除是错误，端点已由求解器精确给出，不会重复叠加。 */
    vly += (w * x*x * (L-x)*(L-x)) / (24 * EI);
  }
  /* 温度梯度特解：截面内外温差使杆产生均匀曲率 κ = α·ΔT/h。
     附加项必须满足 v(0)=v'(0)=v(L)=v'(L)=0（端点位移和转角均为零），
     否则会在 Hermite 插值已经严格保证的端点转角上叠加额外转角，
     导致相邻梁柱在节点处出现切线折角，与刚接节点假定不一致。
     采用 κ·x²(L−x)²/(24L²) 形式：端点函数值与一阶导数严格为 0，
     二阶导数在端点处为 κ/6（因包含了刚端约束），变形曲线平滑且不影响求解器端点结果。 */
  /* 温度梯度特解：不再叠加附加项。
     端点位移和转角已由整体求解器精确给出，Hermite 插值在均匀曲率下是精确的
     （两端铰接、两端固接均成立）。原附加项 κ·x²(L−x)²/(24L²) 会在两端固接梁上
     叠加出虚假挠曲（真实位移应为 0），在完全铰接梁上产生不符合物理的弯曲，故删除。 */

  return [cs*ulx - sn*vly, sn*ulx + cs*vly];
}