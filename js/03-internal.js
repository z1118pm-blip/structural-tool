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
  const ti  = ul[2], tj = ul[5]; // 提取节点转角

  /* 二力杆（支撑）EI=0：位移沿杆轴线性插值，无弯曲挠度 */
  if(!(EI > 0)){
    const vly = (1-xi)*vi + xi*vj;
    return [cs*ulx - sn*vly, sn*ulx + cs*vly];
  }

  /* 使用标准的 Hermite 形函数插值，确保节点处的转角严格等于求解出的节点转角。
     对于半刚接、悬挑、温度等工况，节点转角已由整体求解器精确算出，
     直接通过形函数插值即可保证变形曲线在节点处切向连续（满足刚接夹角不变）。 */
  const N1 = 1 - 3*xi*xi + 2*xi*xi*xi;
  const N2 = L*(xi - 2*xi*xi + xi*xi*xi);
  const N3 = 3*xi*xi - 2*xi*xi*xi;
  const N4 = L*(-xi*xi + xi*xi*xi);
  
  let vly = N1*vi + N2*ti + N3*vj + N4*tj;

  // 附加挠度：两端固定梁在均布荷载下的特解。
  // 悬挑梁（一端自由）的端点位移/转角已由整体求解精确给出，
  // Hermite 插值端点精确，中间段误差可接受，不再叠加这个不成立的固端项。
  if (w !== 0 && !el.isCant) {
    vly += (w * x*x * (L-x)*(L-x)) / (24 * EI);
  }
  /* 温度梯度特解：截面内外温差使杆产生均匀曲率 κ = α·ΔT/h，
     变形近似为抛物线 v(x) = κ/2 · x·(L−x)，两端位移为零。
     注意：只有「结构外围构件」才承受截面温差，内部构件 tempGradEff 未定义，附加项自动为 0。 */
  if (!el.isCant && el.kind !== 'brace' && el.tempGradEff) {
    vly += el.tempGradEff * x * (L - x) / 2;
  }

  return [cs*ulx - sn*vly, sn*ulx + cs*vly];
}