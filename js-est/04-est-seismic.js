"use strict";

/* ===== 烈度 → αmax 映射 ===== */
const ALPHA_MAP = {
  '6': { max: 0.04, isMid: false },
  '7-0.10': { max: 0.08, isMid: false },
  '7-0.15': { max: 0.12, isMid: false },
  '8-0.20': { max: 0.16, isMid: false },
  '8-0.30': { max: 0.24, isMid: false },
  '9': { max: 0.32, isMid: false },
  '6-mid': { max: 0.12, isMid: true },
  '7-mid': { max: 0.23, isMid: true },
  '7-0.15-mid': { max: 0.34, isMid: true },
  '8-mid': { max: 0.45, isMid: true },
  '8-0.30-mid': { max: 0.68, isMid: true },
  '9-mid': { max: 0.90, isMid: true }
};

/* ===== 结构类型配置（计算与 UI 共享）===== */
const STRUCT_CFG = {
  frame:      { name: '框架结构',   p: 1,    C: 0.020, psiT: 0.65, useT: true },
  frameShear: { name: '框架-剪力墙', p: 1,    C: 0.018, psiT: 0.75, useT: true },
  wall:       { name: '剪力墙结构', p: 1,    C: 0.015, psiT: 0.95, useT: true },
  masonry:    { name: '砌体结构',   p: 0,    C: 0,     psiT: 0,    useT: false },
  steel:      { name: '钢结构',     p: 0.75, C: 0.085, psiT: 0.90, useT: true }
};

/* ===== 场地类别 + 设计地震分组 → Tg（GB50011 表5.1.4-2）===== */
const TG_TABLE = {
  I0:  { '1': 0.20, '2': 0.25, '3': 0.30 },
  I1:  { '1': 0.25, '2': 0.30, '3': 0.35 },
  II:  { '1': 0.35, '2': 0.40, '3': 0.45 },
  III: { '1': 0.45, '2': 0.55, '3': 0.65 },
  IV:  { '1': 0.65, '2': 0.75, '3': 0.90 }
};

/* ===== 砌体结构层数/高度限值（常规约束，仅供提示）===== */
const MASONRY_LIMIT = {
  '6':      { n: 7, h: 21 },
  '7-0.10': { n: 7, h: 21 },
  '7-0.15': { n: 6, h: 18 },
  '8-0.20': { n: 6, h: 18 },
  '8-0.30': { n: 5, h: 15 },
  '9':      { n: 4, h: 12 }
};

const INTENSITY_TEXT_MAP = {
  '6': '6度(0.05g)', '7-0.10': '7度(0.10g)', '7-0.15': '7度半(0.15g)',
  '8-0.20': '8度(0.20g)', '8-0.30': '8度半(0.30g)', '9': '9度(0.40g)',
  '6-mid': '6度中震(0.12g)', '7-mid': '7度中震(0.23g)', '7-0.15-mid': '7度半中震(0.34g)',
  '8-mid': '8度中震(0.45g)', '8-0.30-mid': '8度半中震(0.68g)', '9-mid': '9度中震(0.90g)'
};

/* ===== 反应谱：由周期求 α（ζ=0.05，γ=0.9，η₁=0.02，η₂=1.0）===== */
function calcAlpha(T, Tg, alpha_max) {
  const gamma = 0.9, eta1 = 0.02, eta2 = 1.0;
  if (!Number.isFinite(T)) {
    console.warn('[calcAlpha] 周期 T 非法（NaN / Infinity），已按 0 处理，结果仅供量级参考。');
  }
  const T_safe = Number.isFinite(T) ? T : 0;
  const T_use = Math.min(Math.max(T_safe, 0), 6);
  if (T_use < 0.1) return (0.45 + (eta2 - 0.45) * T_use / 0.1) * alpha_max;
  if (T_use <= Tg) return eta2 * alpha_max;
  if (T_use <= 5 * Tg) return Math.pow(Tg / T_use, gamma) * eta2 * alpha_max;
  return Math.max(0, (eta2 * Math.pow(0.2, gamma) - eta1 * (T_use - 5 * Tg))) * alpha_max;
}

function calcSeismic(Geq) {
  const current = ALPHA_MAP[EST.intensity] || ALPHA_MAP['7-0.10'];
  const alpha_max = current.max;
  const isMid = current.isMid;
  const intensityText = INTENSITY_TEXT_MAP[EST.intensity] || EST.intensity;
  const structType = EST.structType || 'frame';
  const cfg = STRUCT_CFG[structType] || STRUCT_CFG.frame;
  const H = EST.nLev * EST.h;

  /* ---------- 砌体结构：底部剪力法，α₁ = αmax ---------- */
  if (structType === 'masonry') {
    const alpha_1 = alpha_max;
    const FEk = alpha_1 * Geq;
    let warning = '';
    // 砌体：刚度大、周期短，不判定 ΔFn，按倒三角直接分配
    let sumH = 0;
    for (let i = 1; i <= EST.nLev; i++) sumH += i;
    const forces = [];
    for (let i = 1; i <= EST.nLev; i++) forces.push(FEk * i / sumH);
    let sumFi = 0;
    for (let i = 0; i < forces.length; i++) sumFi += forces[i];
    // 中震键（如 7-mid）在 MASONRY_LIMIT 里无对应项，统一剥掉 -mid 后查基础烈度限值
    const baseIntensity = EST.intensity.replace('-mid', '');
    // 兼容 '7-mid' -> '7-0.10'，'8-mid' -> '8-0.20'，因为 MASONRY_LIMIT 的键名带小数点
    let limitKey = baseIntensity;
    if (baseIntensity === '7') limitKey = '7-0.10';
    if (baseIntensity === '8') limitKey = '8-0.20';
    const limit = MASONRY_LIMIT[limitKey] || MASONRY_LIMIT[baseIntensity];
    const warnings = [];
    if (isMid) {
      warnings.push('⚠️ 砌体结构通常不采用中震性能化设计，结果仅供概念参考。');
    }
    if (limit && (EST.nLev > limit.n || H > limit.h)) {
      warnings.push(`⚠️ 砌体结构 ${intensityText} 限值：≤${limit.n}层、≤${limit.h}m。当前 ${EST.nLev}层 / ${H.toFixed(1)}m 已超限，结果仅供量级参考。`);
    }
    if (warnings.length) warning = warnings.join('<br>');
    const html = `
      <b>1. 砌体结构地震作用（底部剪力法）</b><br>
      ${intensityText}，αmax 取 <b>${alpha_max}</b><br>
      砌体房屋刚度大、基本周期短，按底部剪力法直接取 α₁ = αmax<br>
      Geq 按 GB50011 5.2.1 多质点体系取 0.85 × GE；单层砌体不折减。<br>
      ${warning ? `<br><span style="color:#facc15;">${warning}</span><br>` : ''}
      <br><b>2. 底部总剪力 FEk</b><br>
      等效总重力荷载 Geq = ${Geq.toFixed(1)} kN<br>
      FEk = α₁ × Geq = ${alpha_1.toFixed(3)} × ${Geq.toFixed(1)} = <b>${FEk.toFixed(1)} kN</b><br><br>

      <b>3. 逐层地震作用分配（倒三角）</b><br>
      砌体结构刚度大、基本周期短，不判定顶部附加力 ΔFn（取 0）；<br>
      假定各层重力相同，Fi = FEk × i / Σj，Σj = ${sumH}<br>
      <table style="border-collapse:collapse; width:100%; font-size:12px; margin:6px 0;">
        <thead>
          <tr style="background:rgba(248,113,113,0.08);">
            <th style="border:1px solid #334155; padding:4px 6px; text-align:center;">层</th>
            <th style="border:1px solid #334155; padding:4px 6px; text-align:center;">Hi (m)</th>
            <th style="border:1px solid #334155; padding:4px 6px; text-align:center;">i / Σj</th>
            <th style="border:1px solid #334155; padding:4px 6px; text-align:center;">Fi (kN)</th>
          </tr>
        </thead>
        <tbody>
          ${forces.map((fi, idx) => {
            const i = idx + 1;
            return `<tr>
              <td style="border:1px solid #334155; padding:4px 6px; text-align:center;">${i}F</td>
              <td style="border:1px solid #334155; padding:4px 6px; text-align:center;">${(i * EST.h).toFixed(1)}</td>
              <td style="border:1px solid #334155; padding:4px 6px; text-align:center;">${(i / sumH).toFixed(4)}</td>
              <td style="border:1px solid #334155; padding:4px 6px; text-align:center;">${fi.toFixed(1)}</td>
            </tr>`;
          }).join('')}
          <tr style="background:rgba(248,113,113,0.05); font-weight:700;">
            <td colspan="3" style="border:1px solid #334155; padding:4px 6px; text-align:right;">ΣFi</td>
            <td style="border:1px solid #334155; padding:4px 6px; text-align:center;">${sumFi.toFixed(1)}</td>
          </tr>
        </tbody>
      </table>
    `;
    return { FEk, alpha_1, alpha_max, T1: 0, T_calc: 0, Tg: 0, H, structType, warning, html, forces, deltaFn: 0, deltaN: 0, baseFi: FEk, sumH };
  }

  /* ---------- 框架/框剪/剪力墙/钢结构：周期 → 折减 → 反应谱 ---------- */
  // 依据结构类型推导合法区间，与 UI 滑块保持一致；越界仅钳制 + console 警告，不再静默替换
  const C_MIN = cfg.p === 0.75 ? 0.075 : 0.008;
  const C_MAX = cfg.p === 0.75 ? 0.100 : 0.025;
  const cRaw = parseFloat(EST.C_period);
  let C = Number.isFinite(cRaw) ? cRaw : cfg.C;
  const cClamped = Math.max(C_MIN, Math.min(C_MAX, C));
  if (Math.abs(cClamped - C) > 1e-9) {
    console.warn('[calcSeismic] C_period 越界已钳制:', C, '->', cClamped, '(区间', C_MIN, '~', C_MAX, ')');
  }
  C = cClamped;

  const psiRaw = parseFloat(EST.psiT);
  const psiT = Math.max(0.5, Math.min(1.0, Number.isFinite(psiRaw) ? psiRaw : cfg.psiT));
  const T1 = C * Math.pow(H, cfg.p);
  const T_calc = T1 * psiT;

  const siteClass = EST.siteClass || 'II';
  const seismicGroup = EST.seismicGroup || '2';
  const Tg = (TG_TABLE[siteClass] && TG_TABLE[siteClass][seismicGroup]) || 0.40;

  const alpha_1 = calcAlpha(T_calc, Tg, alpha_max);
  const FEk = alpha_1 * Geq;

  // 逐层地震力分配（GB50011 5.2.1），与计算书、图表同源
  let deltaFn = 0;
  let deltaN = 0;
  const T1v = T_calc || T1 || 0;
  if (T1v > 1.4 * Tg && Tg > 0) {
    // GB50011-2010 表 5.2.1：δn 按 Tg 三档计算，不再统一封顶 0.15
    let deltaNBase;
    if (Tg <= 0.35)      deltaNBase = 0.08 * T1v + 0.07;
    else if (Tg <= 0.55) deltaNBase = 0.08 * T1v + 0.01;
    else                 deltaNBase = 0.08 * T1v - 0.02;
    deltaN = Math.max(0, deltaNBase);
    deltaFn = deltaN * FEk;
  }
  const baseFi = Math.max(0, FEk - deltaFn);
  let sumH = 0;
  for (let i = 1; i <= EST.nLev; i++) sumH += i;
  const forces = [];
  for (let i = 1; i <= EST.nLev; i++) {
    let fi = baseFi * (i / sumH);
    if (i === EST.nLev) fi += deltaFn;
    forces.push(fi);
  }
  let sumFi = 0;
  for (let i = 0; i < forces.length; i++) sumFi += forces[i];

  const periodFormula = cfg.p === 1
    ? `T₁ = C × H = ${C.toFixed(3)} × ${H.toFixed(1)} = ${T1.toFixed(3)} s`
    : `T₁ = C × H^${cfg.p} = ${C.toFixed(3)} × ${H.toFixed(1)}^${cfg.p} = ${T1.toFixed(3)} s`;

  let spectrumDesc = '上升段';
  if (T_calc >= 0.1 && T_calc <= Tg) spectrumDesc = '平台段';
  else if (T_calc > Tg && T_calc <= 5 * Tg) spectrumDesc = '曲线下降段';
  else if (T_calc > 5 * Tg) spectrumDesc = '直线下降段';

  const html = `
    <b>1. 结构基本周期估算</b><br>
    结构类型：${cfg.name}，总高 H = ${H.toFixed(1)} m<br>
    ${periodFormula}<br>
    周期折减系数 ψ_T = ${psiT.toFixed(2)}<br>
    折减后周期 T_calc = T₁ × ψ_T = ${T1.toFixed(3)} × ${psiT.toFixed(2)} = <b>${T_calc.toFixed(3)} s</b><br><br>

    <b>2. 特征周期 Tg</b><br>
    场地类别 ${siteClass} 类，设计地震分组 第${seismicGroup}组<br>
    查表得 Tg = <b>${Tg.toFixed(2)} s</b><br><br>

    <b>3. 地震影响系数 α₁</b><br>
    ${intensityText}，αmax = <b>${alpha_max}</b><br>
    T_calc = ${T_calc.toFixed(3)} s 位于 <b>${spectrumDesc}</b><br>
    按 GB50011 反应谱计算（ζ=0.05）：α₁ = <b>${alpha_1.toFixed(4)}</b><br>
    ${T_calc > 6 ? '<span style="color:#facc15;">⚠️ T_calc > 6 s，α 按 T=6 s 封顶计算，结果偏大。</span><br>' : ''}
    ${alpha_1 < 1e-6 ? '<span style="color:#facc15;">⚠️ α₁ ≈ 0，周期极长，请检查 C 与 ψ_T 输入。</span><br>' : ''}<br>

    <b>4. 底部总剪力 FEk</b><br>
    等效总重力荷载 Geq = ${Geq.toFixed(1)} kN<br>
    FEk = α₁ × Geq = ${alpha_1.toFixed(3)} × ${Geq.toFixed(1)} = <b>${FEk.toFixed(1)} kN</b><br><br>

    <b>5. 顶部附加地震作用 ΔFn 判定</b><br>
    T_calc = ${T_calc.toFixed(3)} s，Tg = ${Tg.toFixed(2)} s，1.4Tg = ${(1.4 * Tg).toFixed(2)} s<br>
    ${T1v > 1.4 * Tg && Tg > 0
      ? `T_calc > 1.4Tg，需计入顶部附加力：按 GB50011 表 5.2.1 依 Tg 分档，Tg = ${Tg.toFixed(2)} s 属${Tg <= 0.35 ? '第一档(≤0.35，δn=0.08T+0.07)' : Tg <= 0.55 ? '第二档(0.35~0.55，δn=0.08T+0.01)' : '第三档(>0.55，δn=0.08T-0.02)'}，δn = <b>${deltaN.toFixed(3)}</b><br>ΔFn = δn × FEk = ${deltaN.toFixed(3)} × ${FEk.toFixed(1)} = <b>${deltaFn.toFixed(1)} kN</b>`
      : `T_calc ≤ 1.4Tg（或 Tg 无效），不计顶部附加力，ΔFn = 0`}<br><br>

    <b>6. 逐层地震作用分配（倒三角，GB50011 5.2.1）</b><br>
    假定各层重力荷载代表值相同，则 GiHi / ΣGjHj = i / Σj，其中 Σj = 1+2+…+${EST.nLev} = ${sumH}<br>
    Fi = (FEk − ΔFn) × i / Σj，顶层再叠加 ΔFn<br>
    <table style="border-collapse:collapse; width:100%; font-size:12px; margin:6px 0;">
      <thead>
        <tr style="background:rgba(248,113,113,0.08);">
          <th style="border:1px solid #334155; padding:4px 6px; text-align:center;">层</th>
          <th style="border:1px solid #334155; padding:4px 6px; text-align:center;">Hi (m)</th>
          <th style="border:1px solid #334155; padding:4px 6px; text-align:center;">i / Σj</th>
          <th style="border:1px solid #334155; padding:4px 6px; text-align:center;">Fi (kN)</th>
          <th style="border:1px solid #334155; padding:4px 6px; text-align:center;">备注</th>
        </tr>
      </thead>
      <tbody>
        ${forces.map((fi, idx) => {
          const i = idx + 1;
          const note = (i === EST.nLev && deltaFn > 0) ? '含 ΔFn' : '';
          return `<tr>
            <td style="border:1px solid #334155; padding:4px 6px; text-align:center;">${i}F</td>
            <td style="border:1px solid #334155; padding:4px 6px; text-align:center;">${(i * EST.h).toFixed(1)}</td>
            <td style="border:1px solid #334155; padding:4px 6px; text-align:center;">${(i / sumH).toFixed(4)}</td>
            <td style="border:1px solid #334155; padding:4px 6px; text-align:center;">${fi.toFixed(1)}</td>
            <td style="border:1px solid #334155; padding:4px 6px; text-align:center;">${note}</td>
          </tr>`;
        }).join('')}
        <tr style="background:rgba(248,113,113,0.05); font-weight:700;">
          <td colspan="3" style="border:1px solid #334155; padding:4px 6px; text-align:right;">ΣFi</td>
          <td style="border:1px solid #334155; padding:4px 6px; text-align:center;">${sumFi.toFixed(1)}</td>
          <td style="border:1px solid #334155; padding:4px 6px; text-align:center;">校验 ≈ FEk</td>
        </tr>
      </tbody>
    </table>
    <span style="color:#64748b; font-size:11px;">注：ΣFi 与 FEk 的微小差异来自逐层四舍五入；图表使用的逐层力与本表同源。</span>
  `;

  return { FEk, alpha_1, alpha_max, T1, T_calc, Tg, H, structType, warning: '', html, forces, deltaFn, deltaN, baseFi, sumH };
}