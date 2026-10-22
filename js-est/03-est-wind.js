"use strict";

// GB50009-2012 表 8.2.1 风压高度变化系数（线性插值）
const MUZ_TABLE = {
  A: [[5,1.09],[10,1.28],[15,1.42],[20,1.52],[30,1.67],[40,1.79],[50,1.89],[60,1.97],[80,2.11],[100,2.23],[150,2.46],[200,2.64]],
  B: [[5,1.00],[10,1.00],[15,1.13],[20,1.23],[30,1.39],[40,1.52],[50,1.62],[60,1.71],[80,1.87],[100,2.00],[150,2.25],[200,2.46]],
  C: [[5,0.65],[10,0.65],[15,0.65],[20,0.74],[30,0.88],[40,1.00],[50,1.10],[60,1.20],[80,1.36],[100,1.50],[150,1.79],[200,2.03]],
  D: [[5,0.51],[10,0.51],[15,0.51],[20,0.51],[30,0.51],[40,0.60],[50,0.69],[60,0.77],[80,0.91],[100,1.04],[150,1.26],[200,1.43]]
};

function getMuz(terrain, z) {
  const tbl = MUZ_TABLE[terrain] || MUZ_TABLE.B;
  const zz = Math.max(5, Math.min(200, z));
  for (let i = 1; i < tbl.length; i++) {
    if (zz <= tbl[i][0]) {
      const [z0, m0] = tbl[i - 1];
      const [z1, m1] = tbl[i];
      return m0 + (m1 - m0) * (zz - z0) / (z1 - z0);
    }
  }
  return tbl[tbl.length - 1][1];
}

function calcWind() {
  const H = EST.nLev * EST.h;
  // 估算用简化值：GB50009 表 8.3.1 项 30 矩形平面 μs 随 H/B 变化，
  // 此处按总高粗取：H≤24m 取 1.3，H>24m 取 1.4（偏保守），精确设计应按 H/B 逐方向取值
  const mus = H <= 24 ? 1.3 : 1.4;
  const bz = H <= 30 ? 1.0 : Math.min(1.8, 1.0 + (H - 30) / 100 * 0.6);
  const muzOverflow = H > 200 ? `⚠️ 总高 ${H.toFixed(1)} m 超出 200 m，μz 按 200 m 封顶，结果偏小。` : '';

  const calcDir = (B_width, dirName) => {
    let forces = [];
    let Vw = 0;
    for (let i = 1; i <= EST.nLev; i++) {
      const z = i * EST.h;
      const muz = getMuz(EST.terrain, z);
      const wk_i = bz * mus * muz * EST.w0;
      const Fi = wk_i * B_width * EST.h;
      forces.push(Fi);
      Vw += Fi;
    }
    // 10 m 高度参考风压（含体型系数 μs；βz 按 30m 以下取 1.0）
    const wk_ref = mus * getMuz(EST.terrain, 10) * EST.w0;
    
    const html = `
      <b>1. 迎风面与计算高度</b><br>
      迎风面宽度 = ${B_width.toFixed(1)} m (${dirName}向)<br>
      总高 H = ${H.toFixed(1)} m<br><br>
      <b>2. 风压高度变化系数 μz</b><br>
      根据 ${EST.terrain} 类地面粗糙度，按 GB50009-2012 表 8.2.1 线性插值；<br>
      顶层(z=${H.toFixed(1)}m) μz = ${getMuz(EST.terrain, H).toFixed(2)}<br><br>
      <b>3. 风压标准值与总剪力</b><br>
      体型系数 μs：总高 ${H.toFixed(1)}m ${H <= 24 ? '≤' : '>'} 24m，取 ${mus}<br>
      wk(z) = βz × μs × μz × w0 = ${bz.toFixed(2)} × ${mus} × μz × ${EST.w0}<br>
      10 m 高度参考风压 wk(10m) = <b>${wk_ref.toFixed(3)} kN/m²</b><br>
      Vw = Σ(Fi) = <b>${Vw.toFixed(1)} kN</b>
      ${muzOverflow ? `<br><span style="color:#facc15;">${muzOverflow}</span>` : ''}
    `;
    return { Vw, forces, html };
  };

  return {
    X: calcDir(EST.B, 'X'),
    Y: calcDir(EST.L, 'Y')
  };
}