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
   弯曲挠度由 EI·v'' = M(x) 双重积分得到（用端点位移 vi/vj 定常数），
   而不是 Hermite 形函数 + 固端特解 —— 后者对半刚接 (βj<1) 和悬挑都不成立。
   内力 M(x) = -f[2] + f[1]·x + w·x²/2 取自单元端力 res.f，已含半刚接修正。 */
function elemDisp(res, x){
  const {el, ug, f} = res;
  const {L,cs,sn,EI,w}=el;
  const ul = matVec(Tmat(el), ug);
  const xi = x/L;

  const ulx = (1-xi)*ul[0] + xi*ul[3];
  const vi  = ul[1], vj = ul[4];

  /* 二力杆（支撑）EI=0：位移沿杆轴线性插值，无弯曲挠度 */
  if(!(EI > 0)){
    const vly = (1-xi)*vi + xi*vj;
    return [cs*ulx - sn*vly, sn*ulx + cs*vly];
  }

  /* 双重积分结果：
       v(x) = vi + (vj-vi)·ξ + c·[ f[2]/2 − f[1]L(1+ξ)/6 − wL²(1+ξ+ξ²)/24 ]
     其中 c = L²ξ(1-ξ)/EI。固端梁退化时等于标准解 w·x²(L-x)²/(24EI)。 */
  const c = L*L*xi*(1-xi)/EI;
  const vly = vi + (vj-vi)*xi
            + c * ( f[2]/2
                  - f[1]*L*(1+xi)/6
                  - w*L*L*(1+xi+xi*xi)/24 );

  return [cs*ulx - sn*vly, sn*ulx + cs*vly];
}