"use strict";

function calcLoad() {
  const A = Math.max(1, EST.L * EST.B);
  const A_trib_raw = Math.max(0.1, EST.Lx * EST.Ly);
  let A_trib = A_trib_raw;
  let tribWarn = '';
  // A_trib 仅用于梁/墙折算的分母，不得大于单层面积，否则梁墙折算会被稀释。
  // 柱截面估算与 g_col 分母均按 A_trib_raw 反算。当 A_trib_raw > A 时：
  //   N_col ∝ A_trib_raw 线性放大 → col_side² ∝ A_trib_raw；
  //   g_col = col_side²·h·25 / A_trib_raw → 对 A_trib_raw 近似不变；
  //   Gk 中的柱重 = g_col × A ∝ A，与 A_trib_raw 无关。
  // 因此在 col_side 未被 300~1500mm 钳制时，Gk 中的柱重与“按 A_trib 反算”口径
  // 精确相等，不会放大小震 FEk；柱截面因 N_col 中梁墙项被 A_trib_raw/A_trib 放大
  // 而偏保守。切勿把 N_col 乘数改为 A_trib，那会破坏精确抵消并使 Gk 柱重偏大。
  // 唯一例外：col_side 被 1500mm 上限钳制时抵消失效，Gk 柱重将偏小，UI 会通过
  // colOverLimit 给出警告，此时应结合第一轮审查的“柱截面超限”问题一并复核。
  if (A_trib > A) {
    tribWarn = `⚠️ 柱网面积 ${A_trib_raw.toFixed(1)} m² > 单层面积 ${A.toFixed(1)} m²，梁墙折算已按单层面积封顶；请检查柱网 Lx/Ly 是否过大。`;
    A_trib = A;
  }
  const qk_area = Number.isFinite(EST.qk) ? EST.qk : 2.0;
  const qkHighWarn = qk_area > 5
    ? `⚠️ 活载 ${qk_area} kN/m² 偏高，GB50011 表 5.1.3 中书库/密集柜组合值系数应取 0.8，本工具统一按 0.5，地震力偏小。`
    : '';
  const structType = EST.structType || 'frame';

  // 1. 各类材料容重及计算常数
  const rho_conc = 25; // 混凝土 kN/m³
  const rho_mas = 18;  // 砌体 kN/m³
  const g_slab = (EST.tSlab / 1000) * rho_conc;
  const g_arch = EST.qArch;

  let g_detail = 0;
  let htmlDetail = '';
  let col_side = null;
  let col_side_calc = 0;

  // 2. 按结构类型进行细部累加
  if (structType === 'frame' || structType === 'frameShear') {
    const isFrameShear = structType === 'frameShear';
    // K_UNACCOUNTED = 1.05：考虑次梁、构造柱、楼梯等未细分恒载的放大
    const K_UNACCOUNTED = 1.05;
    
    // ===== 1. 梁折算（主梁 + 次梁） =====
    const bM = EST.bBeam / 1000;
    const hM = Math.max(0, EST.hBeam - EST.tSlab) / 1000;
    const lineLoadM = bM * hM * rho_conc;
    const lenM = EST.Lx + EST.Ly;
    
    let lenS = 0;
    let bS = 0, hS = 0, lineLoadS = 0;
    let secBeamDesc = '';
    if (EST.beamModel !== 'none') {
      bS = (EST.bSecBeam || 200) / 1000;
      hS = Math.max(0, (EST.hSecBeam || 500) - EST.tSlab) / 1000;
      lineLoadS = bS * hS * rho_conc;
      const spacing = EST.secBeamSpacing || 2.5;
      
      if (EST.beamModel === 'cross') {
        lenS = EST.Lx + EST.Ly;
        secBeamDesc = `十字次梁：X向1道 + Y向1道 = ${lenS.toFixed(1)}m`;
      } else if (EST.beamModel === 'single-X') {
        const n = Math.max(0, Math.round(EST.Ly / spacing) - 1);
        lenS = n * EST.Lx;
        secBeamDesc = `单向次梁(沿X向)：Ly=${EST.Ly}m，目标间距${spacing}m，算得内部 ${n} 根，总长 = ${n} × ${EST.Lx}m = ${lenS.toFixed(1)}m`;
      } else if (EST.beamModel === 'single-Y') {
        const n = Math.max(0, Math.round(EST.Lx / spacing) - 1);
        lenS = n * EST.Ly;
        secBeamDesc = `单向次梁(沿Y向)：Lx=${EST.Lx}m，目标间距${spacing}m，算得内部 ${n} 根，总长 = ${n} × ${EST.Ly}m = ${lenS.toFixed(1)}m`;
      } else if (EST.beamModel === 'grid') {
        const nX = Math.max(0, Math.round(EST.Ly / spacing) - 1);
        const nY = Math.max(0, Math.round(EST.Lx / spacing) - 1);
        lenS = nX * EST.Lx + nY * EST.Ly;
        secBeamDesc = `井字次梁：X向 ${nX} 根 + Y向 ${nY} 根，总长 = ${lenS.toFixed(1)}m`;
      }
    }
    
    const g_beam = (lineLoadM * lenM + lineLoadS * lenS) / A_trib;
    // 填充墙沿框架主梁布置（次梁上方默认不砌墙）。
    // 若某项目次梁上确有隔墙，可在此处改为 lenM + lenS，并在计算书中注明。
    const wallLineLen = lenM;
    
    // ===== 2. 填充墙折算（基于梁总长） =====
    const ratioWall = EST.wallRatio / 100;
    // 填充墙沿框架主梁布置，净高由主梁高决定（次梁上方默认不砌墙）
    const clearH = Math.max(0, EST.h - EST.hBeam / 1000);
    // 面荷载 = 墙厚×容重 + 双面抹灰(默认40厚×20容重=0.8)
    const faceLoad = (EST.tWall / 1000) * EST.qWallDensity + 0.8;
    // 实际线荷载
    const qWallLineTotal = faceLoad * clearH;
    const qWallLine = qWallLineTotal * ratioWall;
    const g_wall = (qWallLine * wallLineLen) / A_trib;

    let g_col = 0;
    let g_cw = 0;
    let N_col_display = 0;
    let A_col_req_display = 0;
    // K_COL_SELF_CONC = 1.10：近似计入混凝土柱自重对轴力的放大（免迭代），
    // 与钢柱 K_COL_SELF=1.10 口径保持一致，避免柱底轴力被系统性低估。
    const K_COL_SELF_CONC = 1.10;

    if (isFrameShear) {
      // 框剪：墙线载 = 墙厚 × 容重 × 层高；含墙率直接表达墙线长/面积
      const g_cw_line = (EST.cwThk / 1000) * rho_conc * EST.h;
      g_cw = g_cw_line * EST.cwRatio;

      // 柱截面估算（原“配柱”）：框剪结构竖向轴力由柱和墙按受荷面积分担。柱只承担本柱网的恒载与活载，不包含剪力墙自重（g_cw），也不因剪力墙存在而折减
      const fc = 14300;
      // 计入柱自重的放大系数（与钢柱 K_COL_SELF 同口径）
      N_col_display = (1.3 * (g_slab + g_arch + g_beam + g_wall) * K_UNACCOUNTED + 1.5 * qk_area) * A_trib_raw * EST.nLev * K_COL_SELF_CONC;
      A_col_req_display = N_col_display / (EST.muN * fc);
      col_side_calc = Math.sqrt(A_col_req_display) * 1000;
      // EST-05：判断是否被构造下限 300mm 钳制（取整后仍 < 300 才算被钳制）
      const colSideClampedByMin = Math.ceil(col_side_calc / 50) * 50 < 300;
      col_side = Math.max(300, Math.min(1500, Math.ceil(col_side_calc / 50) * 50));
      // 下限钳制且 A_trib_raw > A 时，改用 A 作分母，避免柱网越大柱重反而越小
      const gColDenom = (colSideClampedByMin && A_trib_raw > A) ? A : A_trib_raw;
      g_col = Math.pow(col_side / 1000, 2) * rho_conc * EST.h / gColDenom;
    } else {
      // 纯框架柱截面估算（fc 按 C30 取 14.3 MPa，见计算书说明）
      const fc = 14300;
      // 计入柱自重的放大系数
      N_col_display = (1.3 * (g_slab + g_arch + g_beam + g_wall) * K_UNACCOUNTED + 1.5 * qk_area) * A_trib_raw * EST.nLev * K_COL_SELF_CONC;
      A_col_req_display = N_col_display / (EST.muN * fc);
      col_side_calc = Math.sqrt(A_col_req_display) * 1000;
      const colSideClampedByMin = Math.ceil(col_side_calc / 50) * 50 < 300;
      col_side = Math.max(300, Math.min(1500, Math.ceil(col_side_calc / 50) * 50));
      const gColDenom = (colSideClampedByMin && A_trib_raw > A) ? A : A_trib_raw;
      g_col = Math.pow(col_side / 1000, 2) * rho_conc * EST.h / gColDenom;
    }

    g_detail = g_slab + g_arch + g_beam + g_wall + g_col + g_cw;
    let beamHtml = `<b>【梁折算】</b><br>`;
    beamHtml += `- 框架主梁（周边均摊）：<br>`;
    beamHtml += `&nbsp;&nbsp;截面净高 = ${(EST.hBeam/1000).toFixed(2)}m - ${(EST.tSlab/1000).toFixed(2)}m = ${hM.toFixed(2)}m<br>`;
    beamHtml += `&nbsp;&nbsp;线荷载 = ${bM.toFixed(2)}m × ${hM.toFixed(2)}m × 25 = ${lineLoadM.toFixed(2)} kN/m<br>`;
    beamHtml += `&nbsp;&nbsp;均摊长度 = ${EST.Lx}m + ${EST.Ly}m = ${lenM}m<br>`;
    if (lenS > 0) {
      beamHtml += `- 次梁：<br>`;
      beamHtml += `&nbsp;&nbsp;<span style="color:#4ade80;">布置逻辑 = ${secBeamDesc}</span><br>`;
      beamHtml += `&nbsp;&nbsp;截面净高 = ${(EST.hSecBeam/1000).toFixed(2)}m - ${(EST.tSlab/1000).toFixed(2)}m = ${hS.toFixed(2)}m<br>`;
      beamHtml += `&nbsp;&nbsp;线荷载 = ${bS.toFixed(2)}m × ${hS.toFixed(2)}m × 25 = ${lineLoadS.toFixed(2)} kN/m<br>`;
    }
    beamHtml += `- <b>梁折算合计：(${lineLoadM.toFixed(2)}×${lenM} + ${lineLoadS.toFixed(2)}×${lenS.toFixed(1)}) / ${A_trib.toFixed(1)}m² = ${g_beam.toFixed(2)} kN/m²</b><br>`;

    htmlDetail = `
      <b>【面荷载】</b><br>
      - 楼板自重：${(EST.tSlab/1000).toFixed(3)} m × 25 = ${g_slab.toFixed(2)} kN/m²<br>
      - 建筑做法：${g_arch.toFixed(2)} kN/m²<br><br>
      ${beamHtml}
      - 填充墙折算：<br>
      &nbsp;&nbsp;梁高取主梁高 ${(EST.hBeam/1000).toFixed(2)}m，墙净高 = 层高 ${EST.h}m - 主梁高 = ${clearH.toFixed(2)}m<br>
      &nbsp;&nbsp;面荷载(含双面抹灰) = 墙厚${(EST.tWall/1000).toFixed(2)}m × ${EST.qWallDensity}kN/m³ + 0.8 = ${faceLoad.toFixed(2)} kN/m²<br>
      &nbsp;&nbsp;线荷载 = ${faceLoad.toFixed(2)} kN/m² × 净高${clearH.toFixed(2)}m × 满载率 ${EST.wallRatio}% = ${qWallLine.toFixed(2)} kN/m<br>
      &nbsp;&nbsp;墙总长（仅框架主梁）= ${wallLineLen.toFixed(1)} m（次梁上方默认不砌墙）<br>
      &nbsp;&nbsp;<b>折算：(${qWallLine.toFixed(2)} × ${wallLineLen.toFixed(1)}) / ${A_trib.toFixed(1)} = ${g_wall.toFixed(2)} kN/m²</b><br>
      ${!isFrameShear ? `- 柱截面估算与柱折算：<br>&nbsp;&nbsp;单柱轴力 N = (1.3 × 恒载 + 1.5 × 活载) × 受荷面积 × 层数 = ${N_col_display.toFixed(1)} kN<br>&nbsp;&nbsp;按预估轴压比 μN = ${EST.muN.toFixed(2)}、C30 混凝土 fc = 14.3 MPa：<br>&nbsp;&nbsp;所需面积 Ac = N / (μN·fc) = ${N_col_display.toFixed(1)} / (${EST.muN.toFixed(2)} × 14.3) = ${(A_col_req_display * 1e6).toFixed(0)} mm²<br>&nbsp;&nbsp;估算边长 = √Ac = ${col_side_calc.toFixed(0)} mm，取整至 50mm 且限制在 300~1500mm，得 <b>${col_side}×${col_side} mm</b><br>&nbsp;&nbsp;单柱自重 = ${col_side/1000}m × ${col_side/1000}m × ${EST.h}m × 25 = ${(Math.pow(col_side/1000, 2) * rho_conc * EST.h).toFixed(1)} kN<br>&nbsp;&nbsp;<b>折算 = ${(Math.pow(col_side/1000, 2) * rho_conc * EST.h).toFixed(1)} / ${A_trib_raw.toFixed(1)} = ${g_col.toFixed(2)} kN/m²（按 C30）</b><br>&nbsp;&nbsp;<span style="color:#64748b;font-size:11px;">注：柱截面估算按 1.3恒+1.5活 组合，未考虑 GB50009 5.1.2 活载折减，结果偏安全；柱自重按 A_trib_raw 折算，不随梁墙分母封顶。</span><br>` : ''}
      ${isFrameShear ? `- 墙柱混合折算：墙 ${g_cw.toFixed(2)} / 柱 ${g_col.toFixed(2)} kN/m²（按实际受荷面积折算，C30）<br>&nbsp;&nbsp;<span style="color:#64748b;font-size:11px;">柱截面估算：N = ${N_col_display.toFixed(1)} kN，Ac = N/(μN·fc) = ${(A_col_req_display * 1e6).toFixed(0)} mm²，边长 ${col_side_calc.toFixed(0)} mm → 取 ${col_side} mm；未计入活载折减，结果偏安全。</span><br>` : ''}
    `;
  } 
  else if (structType === 'wall') {
    // 剪力墙：仅板 + 墙折算（墙线载 = 墙厚 × 容重 × 层高，再乘含墙率 m/m²）
    const g_cw_line = (EST.cwThk / 1000) * rho_conc * EST.h;
    const g_cw = g_cw_line * EST.cwRatio;
    g_detail = g_slab + g_arch + g_cw;
    htmlDetail = `
      - 楼板自重：${(EST.tSlab/1000).toFixed(3)} m × 25 = ${g_slab.toFixed(2)} kN/m²<br>
      - 建筑做法：${g_arch.toFixed(2)} kN/m²<br>
      - 剪力墙折算：墙厚 ${(EST.cwThk/1000).toFixed(2)} m × 层高 ${EST.h.toFixed(1)} m × 含墙率 ${EST.cwRatio} × 25 = ${g_cw.toFixed(2)} kN/m²<br>
    `;
  } 
  else if (structType === 'masonry') {
    // 砌体：仅板 + 砌体墙折算 + 抹灰（墙线载 = 墙厚 × 容重 × 层高，再乘含墙率）
    const g_mas = (EST.masThk / 1000) * rho_mas * EST.h * EST.masRatio;
    // 双面 20mm 抹灰面荷载 ≈ 0.8 kN/m²，需要乘层高和含墙率才能折算到建筑面积
    const g_plaster = 0.8 * EST.h * EST.masRatio;
    g_detail = g_slab + g_arch + g_mas + g_plaster;
    htmlDetail = `
      - 楼板自重：${(EST.tSlab/1000).toFixed(3)} m × 25 = ${g_slab.toFixed(2)} kN/m²<br>
      - 建筑做法：${g_arch.toFixed(2)} kN/m²<br>
      - 砌体墙折算：墙厚 ${(EST.masThk/1000).toFixed(2)} m × 层高 ${EST.h.toFixed(1)} m × 含墙率 ${EST.masRatio} × 18 = ${g_mas.toFixed(2)} kN/m²<br>
      - 墙面粉刷：抹灰面荷载 0.8 × 层高 ${EST.h.toFixed(1)} m × 含墙率 ${EST.masRatio} = ${g_plaster.toFixed(2)} kN/m²<br>
    `;
  } 
  else if (structType === 'steel') {
    // 型钢数据库 (kg/m)
    const H_BEAM_DB = {
      'HN200x100': 21.7, 'HN250x125': 29.7, 'HN300x150': 37.3, 
      'HN350x175': 50.0, 'HN400x200': 66.0, 'HN450x200': 76.5, 
      'HN500x200': 89.7, 'HN600x200': 106.0, 'HN700x300': 185.0
    };
    const mainBeamType = EST.steelBeamMain || 'HN400x200';
    const secBeamType = EST.steelBeamSec || 'HN300x150';
    const mainWeight = H_BEAM_DB[mainBeamType] || 66.0;
    const secWeight = H_BEAM_DB[secBeamType] || 37.3;
    
    // 梁长计算
    const lenM = EST.Lx + EST.Ly;
    let lenS = 0;
    let secBeamDesc = '';
    if (EST.beamModel !== 'none') {
      const spacing = EST.secBeamSpacing || 2.5;
      if (EST.beamModel === 'cross') {
        lenS = EST.Lx + EST.Ly;
        secBeamDesc = `十字次梁：X向1道 + Y向1道 = ${lenS.toFixed(1)}m`;
      } else if (EST.beamModel === 'single-X') {
        const n = Math.max(0, Math.round(EST.Ly / spacing) - 1);
        lenS = n * EST.Lx;
        secBeamDesc = `单向次梁(沿X向)：内部 ${n} 根，总长 = ${lenS.toFixed(1)}m`;
      } else if (EST.beamModel === 'single-Y') {
        const n = Math.max(0, Math.round(EST.Lx / spacing) - 1);
        lenS = n * EST.Ly;
        secBeamDesc = `单向次梁(沿Y向)：内部 ${n} 根，总长 = ${lenS.toFixed(1)}m`;
      } else if (EST.beamModel === 'grid') {
        const nX = Math.max(0, Math.round(EST.Ly / spacing) - 1);
        const nY = Math.max(0, Math.round(EST.Lx / spacing) - 1);
        lenS = nX * EST.Lx + nY * EST.Ly;
        secBeamDesc = `井字次梁：X向 ${nX} 根 + Y向 ${nY} 根，总长 = ${lenS.toFixed(1)}m`;
      }
    }
    
    // 梁重 (kN)
    const W_beam_main = lenM * mainWeight * 9.8 / 1000;
    const W_beam_sec = lenS * secWeight * 9.8 / 1000;
    const W_beam_total = W_beam_main + W_beam_sec;
    const g_beam = W_beam_total / A_trib;
    
    // 墙重
    const wallLineLen = lenM;
    const g_wall = EST.qWallSteel * wallLineLen / A_trib;
    
    // ===== 钢柱反算（强度 + 稳定 双控） =====
    // Q355 按壁厚分档：t ≤ 16mm 取 305 MPa，16 < t ≤ 40mm 取 295 MPa（GB50017 表 4.4.1）
    const fc_steel = (EST.steelColThk || 20) > 16 ? 295000 : 305000;
    // K_COL_SELF = 1.10：计入钢柱自重对轴力的放大（免迭代）
    const K_COL_SELF = 1.10;
    const N_col = (1.3 * (g_slab + g_arch + g_beam + g_wall) * 1.05 + 1.5 * qk_area)
                  * A_trib_raw * EST.nLev * K_COL_SELF;
    const A_req = N_col / (EST.muN * fc_steel); // 强度所需截面积 m²
    
    const t_m = Math.max(4, EST.steelColThk || 20) / 1000; // 壁厚 m，最小 4mm
    const l_0 = 1.25 * EST.h; // 计算长度，偏安全取 1.25 倍层高
    const lambda_limit = 120; // 容许长细比限值
    
    // 1. 强度控制要求的边长
    const a_strength = A_req / (4 * t_m) + t_m; 
    
    // 2. 稳定（长细比）控制要求的最小回转半径，箱形柱 i ≈ 0.289a
    const i_req = l_0 / lambda_limit;
    const a_stable = i_req / 0.289; 
    
    // 3. 综合确定最终边长（强度、稳定取大，向上取整，限定在 200~1500 之间）
    let a_calc = Math.max(a_strength, a_stable);
    let a = Math.ceil(a_calc * 1000 / 50) * 50;
    a = Math.max(200, Math.min(1500, a)); 
    
    col_side = a;
    // 箱形柱反算边长（强度 + 稳定双控的理论边长，未取整）
    col_side_calc = Math.max(a_strength, a_stable) * 1000;
    
    // 4. 验算宽厚比 (局部稳定) 与 长细比 (整体稳定)
    const ratio_bt = a / (t_m * 1000);
    const bt_warn = ratio_bt > 45 ? `<br><span style="color:#facc15;">⚠️ 宽厚比 a/t=${ratio_bt.toFixed(1)} > 45，壁板易局部屈曲，建议加大壁厚。</span>` : '';
    
    const i_actual = 0.289 * (a / 1000);
    const lambda_actual = l_0 / i_actual;
    const lambda_warn = lambda_actual > 120 ? `<br><span style="color:#facc15;">⚠️ 长细比 λ=${lambda_actual.toFixed(1)} > 120，请复核。</span>` : '';
    const control_type = (a_stable > a_strength) ? '由<strong>长细比（稳定）</strong>控制' : '由<strong>轴压比（强度）</strong>控制';
    
    const A_col_actual = 4 * t_m * ((a / 1000) - t_m);
    const rho_steel_kN = 7850 * 9.8 / 1000;   // ≈ 76.93 kN/m³
    // EST-05：钢柱被 200mm 构造下限钳制且 A_trib_raw > A 时，用 A 作分母
    const steelColClampedByMin = Math.ceil(a_calc * 1000 / 50) * 50 < 200;
    const gColDenomSteel = (steelColClampedByMin && A_trib_raw > A) ? A : A_trib_raw;
    const g_col = A_col_actual * rho_steel_kN * EST.h / gColDenomSteel;
    
    g_detail = g_slab + g_arch + g_beam + g_wall + g_col;
    const steelMass = (g_beam + g_col) * 1000 / 9.8;
    
    htmlDetail = `
      - 楼板自重：${(EST.tSlab/1000).toFixed(3)} m × 25 = ${g_slab.toFixed(2)} kN/m²<br>
      - 建筑做法：${g_arch.toFixed(2)} kN/m²<br>
      <b>【钢构件折算】</b><br>
      - 主梁：${mainBeamType} (${mainWeight} kg/m) × 均摊长度 ${lenM.toFixed(1)}m = ${W_beam_main.toFixed(2)} kN<br>
      ${lenS > 0 ? `- 次梁：${secBeamType} (${secWeight} kg/m) × 总长 ${lenS.toFixed(1)}m = ${W_beam_sec.toFixed(2)} kN<br>` : ''}
      - <b>梁折算合计 = ${g_beam.toFixed(2)} kN/m²</b><br>
      - 围护墙：${EST.qWallSteel} kN/m × ${wallLineLen.toFixed(1)}m / ${A_trib.toFixed(1)} = ${g_wall.toFixed(2)} kN/m²<br>
      - <b>钢柱折算（按 Q355）：</b><br>
      &nbsp;&nbsp;竖向轴力 N = ${N_col.toFixed(1)} kN，强度所需面积 = ${(A_req*1e6).toFixed(0)} mm²<br>
      &nbsp;&nbsp;<span style="color:#64748b;font-size:11px;">注：钢结构的 μN 表示强度利用率（应力/允许应力），非混凝土轴压比。</span><br>
      &nbsp;&nbsp;反算箱形柱：<b>${a}×${a}×${EST.steelColThk}</b> (实际面积 ${(A_col_actual*1e6).toFixed(0)} mm²)<br>
      &nbsp;&nbsp;<span style="color:#38bdf8;">截面尺寸${control_type}，λ=${lambda_actual.toFixed(1)}，a/t=${ratio_bt.toFixed(1)}</span><br>
      &nbsp;&nbsp;<b>折算 = ${g_col.toFixed(2)} kN/m²</b>${bt_warn}${lambda_warn}<br>
      <br><span style="color:#4ade80;">综合用钢量估算：${steelMass.toFixed(1)} kg/m²</span><br>
    `;
  }
  else {
    // 未知结构类型回退到宏观值，避免 Gk/GE/Geq/FEk 全为 0
    g_detail = EST.gkBase;
    htmlDetail = `⚠️ 未知结构类型 "${structType}"，回退到宏观基准值 ${EST.gkBase.toFixed(2)} kN/m²。`;
  }

  // 3. 决定最终 gk_area
  let gk_area = 0;
  let baseHtml = '';
  if (EST.useDetail) {
    // 数值保护：若细部累加结果非法，回退到宏观基准值
    if (!Number.isFinite(g_detail) || g_detail <= 0) {
      console.warn('[calcLoad] g_detail 非法:', g_detail, '→ 回退 gkBase');
      g_detail = EST.gkBase;
    }
    gk_area = g_detail;
    baseHtml = `<b>【细部累加结果】</b><br>${htmlDetail}`;
  } else {
    gk_area = EST.gkBase;
    baseHtml = `<b>【宏观经验值】</b><br>采用综合恒载基准值：${gk_area.toFixed(2)} kN/m²（按规范及经验取值）<br>
    <i style="color:#64748b; font-size:12px;">* 展开左侧“细部参数拆解”调整后，此处将按细部重算。</i>`;
  }

  const Gk = gk_area * A;
  const Qk = qk_area * A;
  const GE_total = (Gk + 0.5 * Qk) * EST.nLev;
  // GB50011 5.1.1：单质点取 GE，多质点才取 0.85
  const Geq = EST.nLev === 1 ? GE_total : 0.85 * GE_total;

  const geoWarn = [tribWarn, qkHighWarn].filter(Boolean).join('<br>');
  const html = `
    <b>1. 单层受荷面积与总层数</b><br>
    单层建筑面积 A = L × B = ${EST.L} × ${EST.B} = ${A} m²<br>
    柱网受荷面积 A_trib_raw = Lx × Ly = ${EST.Lx} × ${EST.Ly} = ${A_trib_raw.toFixed(1)} m²<br>
    梁墙折算分母 A_trib = min(A_trib_raw, A) = ${A_trib.toFixed(1)} m²；柱截面估算与柱自重仍按 A_trib_raw 反算<br>
    ${geoWarn ? `<span style="color:#facc15;">${geoWarn}</span><br>` : ''}<br>
    
    <b>2. 恒载面荷载标准值 gk 组成</b><br>
    ${baseHtml}<br>
    <b>合计 gk = ${gk_area.toFixed(2)} kN/m²</b><br><br>
    
    <b>3. 活载标准值 qk</b><br>
    根据用途取值 ${qk_area} kN/m²，Qk = ${qk_area} × ${A} = <b>${Qk.toFixed(1)} kN</b><br><br>
    
    <b>4. 重力荷载代表值 GE 与等效总重力荷载 Geq</b><br>
    Gk（单层恒载） = ${gk_area.toFixed(2)} × ${A} = ${Gk.toFixed(1)} kN<br>
    GE（全楼代表值） = (Gk + 0.5Qk) × ${EST.nLev} = <b>${GE_total.toFixed(1)} kN</b><br>
    Geq = ${EST.nLev === 1 ? 'GE（单质点，不折减）' : '0.85 × GE（多质点）'} = <b>${Geq.toFixed(1)} kN</b>
  `;

  const colOverLimit = col_side_calc !== null && col_side_calc > 1500;
  let col_str = col_side ? (col_side + '×' + col_side + ' mm') : '—';
  if (structType === 'steel') col_str = col_side ? `${col_side}×${col_side}×${EST.steelColThk}` : '—';
  // 校验尺口径：单位面积重力荷载标准值 = 恒载标准值 + 活载标准值（GB50011 5.1.3）
  const g_std = gk_area + qk_area;
  return { Gk, Qk, GE: GE_total, Geq, A, A_trib, A_trib_raw, g_detail, html, col_side, col_str, col_side_calc, gk_area, colOverLimit, g_std };
}