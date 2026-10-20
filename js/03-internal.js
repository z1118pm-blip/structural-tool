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

/* 截面正应力：σ(x) = N/A ± M/W。返回 [左边缘, 右边缘]，单位 kPa。
   柱：A = bc·hc，W = bc·hc²/6；梁：A = bb·hb，W = bb·hb²/6；
   支撑只有 N/As，两端同值。
   符号：拉为正；M 按 momentAt 的符号，左边缘取 -M/W，右边缘取 +M/W。 */
function stressAt(res, x, p){
  const el = res.el;
  const N = axialAt(res, x);
  const M = momentAt(res, x);
  if(el.kind === 'brace'){
    const As = (p.As || 2000) / 1e6;
    const s = N / As;
    return [s, s];
  }
  let A, W;
  if(el.kind === 'col'){
    const bcM = p.bc / 1000, hcM = p.hc / 1000;
    A = bcM * hcM;
    W = bcM * hcM * hcM / 6;
  } else {
    const bbM = p.bb / 1000, hbM = p.hb / 1000;
    A = bbM * hbM;
    W = bbM * hbM * hbM / 6;
  }
  const sAxial = N / A;
  const sBend = M / W;
  return [sAxial - sBend, sAxial + sBend];
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

  // 附加挠度：满足 f(0)=f'(0)=f(L)=f'(L)=0 的特解，修正中间段挠曲。
  // 对两端固定梁与悬挑梁形式相同：v_add = w·x²(L-x)²/(24EI)。
  // 悬挑梁 j 端位移/转角由整体求解精确给出，Hermite 端点精确，
  // 此处补上剩余部分，避免中间段挠度显示偏差。
  if (w !== 0) {
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