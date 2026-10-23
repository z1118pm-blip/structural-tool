"use strict";

/* =====================================================================
   8. 内力图（M / N / V）
   ===================================================================== */
const THEME = {
  dark: {
    bg:'#1e293b', frame:'#cbd5e1', frameThin:'#94a3b8', frameGhost:'#475569',
    node:'#e2e8f0', nodeBlue:'#7dd3fc', support:'#94a3b8', supportFill:'#1e293b',
    udl:'#f87171', udlLabel:'#fca5a5', udlLabelBg:'rgba(17,24,39,0.8)',
    hArrow:'#38bdf8', hLabel:'#7dd3fc', deformCurve:'#38bdf8',
    freezeLine:'rgba(148,163,184,0.55)', antiCurve:'#f8fafc'
  },
  light: {
    bg:'#ffffff', frame:'#334155', frameThin:'#64748b', frameGhost:'#cbd5e1',
    node:'#475569', nodeBlue:'#0284c7', support:'#475569', supportFill:'#ffffff',
    udl:'#dc2626', udlLabel:'#dc2626', udlLabelBg:'rgba(255,255,255,0.90)',
    hArrow:'#0284c7', hLabel:'#0369a1', deformCurve:'#0284c7',
    freezeLine:'rgba(71,85,105,0.55)', antiCurve:'#0f172a'
  }
};
function theme(){ return S.lightBg ? THEME.light : THEME.dark; }

const FORCE_STYLE = {
  M: { ref: 200, unit: 'kN·m', tag: '弯矩图 M', lbl: '|M|max',
       col:  { color:'#f97316', fill:'rgba(249,115,22,0.32)' },
       beam: { color:'#fde68a', fill:'rgba(253,230,138,0.30)' } },
  N: { ref: 500, unit: 'kN', tag: '轴力图 N', lbl: '|N|max',
       col:  { color:'#a855f7', fill:'rgba(168,85,247,0.30)' },
       beam: { color:'#fbcfe8', fill:'rgba(251,207,232,0.28)' } },
  V: { ref: 200, unit: 'kN', tag: '剪力图 V', lbl: '|V|max',
       col:  { color:'#22d3ee', fill:'rgba(34,211,238,0.28)' },
       beam: { color:'#4ade80', fill:'rgba(74,222,128,0.28)' } },
  R: { ref: 200, unit: 'kN', tag: '支座反力图 R', lbl: '|R|max',
       col:  { color:'#10b981', fill:'rgba(16,185,129,0.32)' },
       beam: { color:'#10b981', fill:'rgba(16,185,129,0.30)' } },
};
const FORCE_STYLE_LIGHT = {
  M: { ref: 200, unit: 'kN·m', tag: '弯矩图 M', lbl: '|M|max',
       col:  { color:'#ea580c', fill:'rgba(234,88,12,0.26)' },
       beam: { color:'#ca8a04', fill:'rgba(202,138,4,0.24)' } },
  N: { ref: 500, unit: 'kN', tag: '轴力图 N', lbl: '|N|max',
       col:  { color:'#7c3aed', fill:'rgba(124,58,237,0.24)' },
       beam: { color:'#be185d', fill:'rgba(190,24,93,0.22)' } },
  V: { ref: 200, unit: 'kN', tag: '剪力图 V', lbl: '|V|max',
       col:  { color:'#0891b2', fill:'rgba(8,145,178,0.24)' },
       beam: { color:'#15803d', fill:'rgba(21,128,61,0.24)' } },
  R: { ref: 200, unit: 'kN', tag: '支座反力图 R', lbl: '|R|max',
       col:  { color:'#059669', fill:'rgba(5,150,105,0.26)' },
       beam: { color:'#059669', fill:'rgba(5,150,105,0.24)' } },
};
function forceStyleOf(type, kind){
  const s = S.lightBg ? FORCE_STYLE_LIGHT[type] : FORCE_STYLE[type];
  return (kind === 'col') ? s.col : s.beam;
}

function drawInternal(canvas, model, dprOverride){
  const type = model.p.forceType;
  const FSTYLE = S.lightBg ? FORCE_STYLE_LIGHT[type] : FORCE_STYLE[type];
  const T = theme();
  const filter = model.p.elFilter;
  const {ctx,W,H} = setupCanvas(canvas, dprOverride);
  const padB = type === 'R' ? 80 : 36; // R 图底部留出更大空间画弯矩
  const {toS} = makeTransform(model, W, H, { padL: 120, padT: 100, padR: 60, padB });

  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx, W, H);
  drawHUD(ctx, W, H, 'INTERNAL FORCE · ' + type);

  const NP = 61;
  const targetPx = Math.min(W,H)*0.055;

  /* ======== 拦截死胡同组合 ======== */
  if(filter === 'brace' && type !== 'N') {
    ctx.save();
    ctx.fillStyle = T.frame;
    ctx.font = 'bold 14px "JetBrains Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('支撑为二力杆，仅提供轴力图 (N) 计算', W/2, H/2);
    ctx.restore();
    drawFrameLines(ctx, model, toS, T.frameThin, 1.5, false, false);
    return; 
  }

  /* ======== 反力图专属渲染 ======== */
  if(type === 'R'){
    /* R 图不支持冻结对比：支座反力是标量，画成虚线叠加在弯矩图上会与当前值混在一起，
       反而干扰判读。若存在 BASE，只提示一句，不做任何虚线绘制。 */
    if(BASE){
      ctx.save();
      ctx.font = '10px ui-sans-serif,system-ui,sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = S.lightBg ? 'rgba(100,116,139,0.75)' : 'rgba(148,163,184,0.75)';
      ctx.fillText('注：R 图不支持冻结对比', 14, 104);
      ctx.restore();
    }
    ctx.font = 'bold 11px ui-sans-serif,system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    
    let maxRx = 0, maxRy = 0, maxMR = 0;
    for(let c=0; c<model.nCol; c++){
      const nd = model.nid(c, 0);
      maxRx = Math.max(maxRx, Math.abs(model.R[nd*3]));
      maxRy = Math.max(maxRy, Math.abs(model.R[nd*3+1]));
      maxMR = Math.max(maxMR, Math.abs(model.R[nd*3+2]));
    }
    const maxVal = Math.max(maxRx, maxRy, 1e-6); 
    const Lbase = Math.min(W,H) * 0.12;
    const rGreen = S.lightBg ? '#059669' : '#10b981';

    for(let c=0; c<model.nCol; c++){
      const nd = model.nid(c, 0);
      const node = model.nodes[nd];
      const [sx, sy] = toS(node.x, node.y);
      const rx = model.R[nd*3], ry = model.R[nd*3+1], m = model.R[nd*3+2];

      // 画轴力/剪力反力箭头
      const drawArrow = (val, isX) => {
        if (Math.abs(val) < 0.05) return;
        ctx.save();
        const len = Math.max(4, (Math.abs(val)/maxVal)*Lbase);
        const dir = Math.sign(val);
        ctx.beginPath();
        if (isX) {
          ctx.moveTo(sx, sy); ctx.lineTo(sx + dir*len, sy);
          ctx.lineTo(sx + dir*(len-8), sy - 4); ctx.moveTo(sx + dir*len, sy); ctx.lineTo(sx + dir*(len-8), sy + 4);
        } else {
          ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - dir*len);
          ctx.lineTo(sx - 4, sy - dir*(len-8)); ctx.moveTo(sx, sy - dir*len); ctx.lineTo(sx + 4, sy - dir*(len-8));
        }
        ctx.strokeStyle = rGreen; ctx.lineWidth = 2; ctx.stroke();
        
        // 标签
        const txt = val.toFixed(1);
        const tw = ctx.measureText(txt).width;
        const tx = isX ? sx + dir*(len+14) : sx + 18;
        const ty = isX ? sy - 14 : sy - dir*(len+14);
        ctx.fillStyle = T.bg; ctx.fillRect(tx - tw/2 - 3, ty - 7, tw + 6, 14);
        ctx.fillStyle = rGreen; ctx.fillText(txt, tx, ty);
        ctx.restore();
      };
      drawArrow(rx, true);
      drawArrow(ry, false);

      // 画弯矩反力（支座下方的 270° 大圆弧箭头）
      if (Math.abs(m) > 1e-4) {
        /* 圆弧半径按 |m|/maxMR 缩放，避免数值变化时视觉不变（如支座沉降自检看不出弯矩增长）。 */
        const r = 8 + Math.min(10, (Math.abs(m) / Math.max(maxMR, 1e-6)) * 10);
        const cx = sx, cy = sy + 22; // 圆心下移
        
        const startA = -Math.PI/2; // 12点钟起点
        const anticlockwise = (m > 0); // 正值逆时针，负值顺时针
        const endA = anticlockwise ? (startA - Math.PI * 1.5) : (startA + Math.PI * 1.5);
        
        ctx.beginPath();
        ctx.arc(cx, cy, r, startA, endA, anticlockwise);
        ctx.strokeStyle = rGreen; ctx.lineWidth = 2; ctx.stroke();
        
        // 画箭头
        const tipX = cx + r * Math.cos(endA);
        const tipY = cy + r * Math.sin(endA);
        const angle = anticlockwise ? (endA - Math.PI/2) : (endA + Math.PI/2);
        
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - 7 * Math.cos(angle - 0.5), tipY - 7 * Math.sin(angle - 0.5));
        ctx.lineTo(tipX - 7 * Math.cos(angle + 0.5), tipY - 7 * Math.sin(angle + 0.5));
        ctx.fillStyle = rGreen; ctx.fill();
        
        // 弯矩数值放到圆弧正下方
        const txt = m.toFixed(1);
        const tw = ctx.measureText(txt).width;
        ctx.fillStyle = T.bg; ctx.fillRect(cx - tw/2 - 3, cy + r + 4, tw + 6, 14);
        ctx.fillStyle = rGreen; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, cx, cy + r + 11);
      }
    }

    // 左上角汇总数据（精准放置在标题正下方，避开重叠）
    let sumRx = 0, sumRy = 0;
    for(let c=0; c<model.nCol; c++){
      const nd = model.nid(c, 0);
      sumRx += model.R[nd*3]; sumRy += model.R[nd*3+1];
    }
    const sumTxt = `ΣRx = ${sumRx.toFixed(1)} kN    ΣRy = ${sumRy.toFixed(1)} kN`;
    ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
    const stw = ctx.measureText(sumTxt).width;
    
    // 定位在 x=14, y=76（正好是 DOM 标题下方的留白区）
    const sumBg  = S.lightBg ? 'rgba(255,255,255,0.92)' : 'rgba(15,23,42,0.85)';
    const sumBd  = S.lightBg ? 'rgba(5,150,105,0.55)'   : 'rgba(16,185,129,0.4)';
    const sumTxtColor = S.lightBg ? '#059669'           : '#10b981';

    ctx.fillStyle = sumBg;
    ctx.fillRect(14, 76, stw + 20, 22);
    ctx.strokeStyle = sumBd; ctx.lineWidth = 1;
    ctx.strokeRect(14, 76, stw + 20, 22);
    
    ctx.fillStyle = sumTxtColor; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(sumTxt, 24, 87);

    drawFrameLines(ctx, model, toS, T.frameThin, 1.5, false, false);
    drawSupports(ctx, model, toS, model.p.betaF, false);
    
    ctx.fillStyle=T.node;
    for(const n of model.nodes){
      if(n.y === 0) continue;
      const [sx,sy]=toS(n.x,n.y);
      ctx.fillRect(sx-1.5, sy-1.5, 3, 3);
    }
    if(model.p.showIds) drawIds(ctx, model, toS);
    /* 恢复 textAlign / textBaseline，避免状态泄漏到下一次绘制 */
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    return; 
  }
  /* ======== 反力图结束 ======== */

  /* 冻结基线用当前 type 重画：对比的是"同一内力分量在参数变化前后的差异"，
     而不是"冻结那一刻的图"。若需固定为冻结时的 type，应在 BASE 中存 forceType
     并在此处判断——当前保持结果集语义，不改行为。 */
  if(BASE){
    ctx.save();
    ctx.strokeStyle = T.freezeLine;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5,4]);
    for(const res of BASE.results){
      const el = res.el;
      if(filter === 'col'  && el.kind !== 'col')  continue;
      if(filter === 'beam' && el.kind !== 'beam') continue;
      if(filter === 'brace' && el.kind !== 'brace') continue;
      if(el.kind === 'brace' && type !== 'N') continue;
      const ni = BASE.nodes[el.i], nj = BASE.nodes[el.j];
      const nx = -el.sn, ny = -el.cs;
      const base = [], curve = [];
      /* BASE 虚线的支撑轴力也必须按 5 倍放大，与当前实线比例一致，
         否则冻结对比时支撑虚线被压扁到几乎不可见。 */
      const refDiv = (el.kind === 'brace') ? (FSTYLE.ref / 5) : FSTYLE.ref;
      for(let k=0;k<=NP;k++){
        const x = el.L*k/NP;
        const val = internalAt(res, x, type);
        const xi = x/el.L;
        const bx = ni.x + (nj.x-ni.x)*xi, by = ni.y + (nj.y-ni.y)*xi;
        const [sx,sy] = toS(bx,by);
        base.push([sx, sy]);
        const off = -(val/refDiv)*targetPx*model.p.mScale;
        curve.push([sx + nx*off, sy + ny*off]);
      }
      ctx.beginPath();
      ctx.moveTo(curve[0][0], curve[0][1]);
      for(let k=1;k<curve.length;k++) ctx.lineTo(curve[k][0], curve[k][1]);
      for(let k=base.length-1;k>=0;k--) ctx.lineTo(base[k][0], base[k][1]);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  for(let e=0;e<model.results.length;e++){
    const res = model.results[e];
    const el  = res.el;
    if(filter === 'col'  && el.kind !== 'col')  continue;
    if(filter === 'beam' && el.kind !== 'beam') continue;
    if(filter === 'brace' && el.kind !== 'brace') continue;
    if(el.kind === 'brace' && type !== 'N') continue; // 支撑不画 M/V
    const st  = forceStyleOf(type, el.kind);
    const ni  = model.nodes[el.i], nj = model.nodes[el.j];
    const nx = -el.sn, ny = -el.cs;
    const base  = [], curve = [];
    // 如果是斜撑，强制放大其显示比例，避免被柱子的巨大轴力压得看不见
    const refDiv = (el.kind === 'brace') ? (FSTYLE.ref / 5) : FSTYLE.ref;
    for(let k=0;k<=NP;k++){
      const x = el.L*k/NP;
      const val = internalAt(res, x, type);
      const xi = x/el.L;
      const bx = ni.x + (nj.x-ni.x)*xi, by = ni.y + (nj.y-ni.y)*xi;
      const [sx,sy] = toS(bx,by);
      base.push([sx,sy]);
      const off = -(val/refDiv)*targetPx*model.p.mScale;
      curve.push([sx + nx*off, sy + ny*off]);
    }
    ctx.beginPath();
    ctx.moveTo(curve[0][0], curve[0][1]);
    for(let k=1;k<curve.length;k++) ctx.lineTo(curve[k][0], curve[k][1]);
    for(let k=base.length-1;k>=0;k--) ctx.lineTo(base[k][0], base[k][1]);
    ctx.closePath();
    const grad = ctx.createLinearGradient(curve[0][0], curve[0][1], curve[curve.length-1][0], curve[curve.length-1][1]);
    const baseRGB = st.color;
    grad.addColorStop(0,   baseRGB + '44');
    grad.addColorStop(0.5, baseRGB + '11');
    grad.addColorStop(1,   baseRGB + '44');
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(curve[0][0], curve[0][1]);
    for(let k=1;k<curve.length;k++) ctx.lineTo(curve[k][0], curve[k][1]);
    ctx.strokeStyle = st.color; ctx.lineWidth = 1.7; ctx.lineJoin = 'round'; ctx.stroke();
  }

  drawFrameLines(ctx, model, toS, T.frameThin, 1.5, false, false);
  drawSupports(ctx, model, toS, model.p.betaF, false);

  if(model.p.showVals){
    ctx.font = 'bold 10.5px ui-sans-serif,system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const NZ = 0.05;
    const drawnBraceLabels = new Set();
    for(const res of model.results){
      const el = res.el;
      if(filter === 'col'  && el.kind !== 'col')  continue;
      if(filter === 'beam' && el.kind !== 'beam') continue;
      if(filter === 'brace' && el.kind !== 'brace') continue;
      ctx.fillStyle = forceStyleOf(type, el.kind).color;
      const v0 = internalAt(res, 0, type), vL = internalAt(res, el.L, type);
      const ni = model.nodes[el.i], nj = model.nodes[el.j];
      const [ix, iy] = toS(ni.x, ni.y), [jx, jy] = toS(nj.x, nj.y);
      const dxu = jx - ix, dyu = jy - iy;
      const Lu = Math.hypot(dxu, dyu) || 1;
      const ux = dxu/Lu, uy = dyu/Lu;
      if(el.kind === 'brace'){
        /* X 撑两根斜杆中点完全重合，用 Set 去重避免文字叠在一起。 */
        const midX = (ix + jx) / 2, midY = (iy + jy) / 2;
        const posKey = Math.round(midX) + '_' + Math.round(midY);
        if(drawnBraceLabels.has(posKey)) continue;
        drawnBraceLabels.add(posKey);
        const vMid = axialAt(res, el.L / 2);
        if(Math.abs(vMid) > NZ){
          const txt = vMid.toFixed(1);
          const tw = ctx.measureText(txt).width;
          ctx.fillStyle = T.bg;
          ctx.fillRect(midX - tw/2 - 3, midY - 7.5, tw + 6, 15);
          ctx.fillStyle = forceStyleOf(type, el.kind).color;
          ctx.fillText(txt, midX, midY);
        }
        continue;
      }
      if(el.kind === 'col'){
        let side;
        if(ni.col === 0) side = -1; // 最左柱：文字移到外侧(左)
        else if(ni.col === model.nCol - 1) side = 1; // 最右柱：文字移到外侧(右)
        else side = (ni.col % 2 === 1) ? -1 : 1; // 中间柱：交替左右
        /* 偏移随 mScale 对数增长，避免 mScale 放大时曲线穿过文字。 */
        const off = 28 + 12 * Math.log2(Math.max(1, model.p.mScale));
        if(Math.abs(v0) > NZ) ctx.fillText(v0.toFixed(1), ix + side*off, iy + 12); // 底端向下错
        if(Math.abs(vL) > NZ) ctx.fillText(vL.toFixed(1), jx + side*off, jy - 12); // 顶端向上错，避开梁
      } else {
        const nx = -el.sn, ny = -el.cs;
        const paintTag = (v, xScreen, yScreen, inwardX) => {
          if(Math.abs(v) <= NZ) return;
          const off = -(v / FSTYLE.ref) * targetPx * model.p.mScale;
          const cx  = xScreen + nx * off, cy  = yScreen + ny * off;
          const sgn = (v >= 0) ? -1 : 1; 
          const lx  = cx + ux * inwardX + nx * sgn * 12;
          const ly  = cy + uy * inwardX + ny * sgn * 12;
          const txt = v.toFixed(1);
          const tw  = ctx.measureText(txt).width;
          ctx.fillStyle = T.bg; ctx.fillRect(lx - tw/2 - 3, ly - 7.5, tw + 6, 15);
          ctx.fillStyle = forceStyleOf(type, el.kind).color; ctx.fillText(txt, lx, ly);
        };
        paintTag(v0, ix, iy,  35); paintTag(vL, jx, jy, -35);
        if(type === 'M' && Math.abs(el.w) > 1e-12){
          const xs = -res.f[1] / el.w;
          if(xs > 0.05*el.L && xs < 0.95*el.L){
            const vm = momentAt(res, xs);
            if(Math.abs(vm) > NZ){
              const xi = xs / el.L;
              const bx = ni.x + (nj.x-ni.x)*xi, by = ni.y + (nj.y-ni.y)*xi;
              const [bsx, bsy] = toS(bx, by);
              const off = -(vm / FSTYLE.ref) * targetPx * model.p.mScale;
              const cxs = bsx + nx*off, cys = bsy + ny*off;
              const sgn = (vm >= 0) ? -1 : 1;
              const lx  = cxs + nx*sgn*12, ly  = cys + ny*sgn*12;
              const txt = vm.toFixed(1);
              const tw  = ctx.measureText(txt).width;
              ctx.fillStyle = T.bg; ctx.fillRect(lx - tw/2 - 3, ly - 7.5, tw + 6, 15);
              ctx.fillStyle = forceStyleOf(type, el.kind).color; ctx.fillText(txt, lx, ly);
            }
          }
        }
      }
    }
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }

  /* 支撑专属线色（去除了文字标注，避免重叠） */
  for(const res of model.results) {
    const el = res.el;
    if(el.kind !== 'brace') continue;
    if(filter !== 'all' && filter !== 'brace') continue;
    const ni = model.nodes[el.i], nj = model.nodes[el.j];
    const [ax, ay] = toS(ni.x, ni.y);
    const [bx, by] = toS(nj.x, nj.y);
    
    // 画一根青色的线，压住原本灰色的轮廓
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.stroke();
  }

  /* N 图：受压支撑超过欧拉临界力时标红 + ⚠ */
  if(type === 'N' && model.p.braceI && model.p.braceMap){
    const E_brace = (model.p.braceMat === 'steel') ? E_STEEL : E_CONC;
    const As_m2 = (model.p.As || 2000) / 1e6;
    const i_m = (model.p.braceI || 30) / 1000;
    for(const res of model.results){
      const el = res.el;
      if(el.kind !== 'brace') continue;
      if(filter !== 'all' && filter !== 'brace') continue;
      if(model.inactiveBraces && model.inactiveBraces.has(el.braceUid)) continue;
      const lam = el.L / i_m;
      const Ncr = Math.PI * Math.PI * E_brace * As_m2 / (lam * lam);
      const N = axialAt(res, el.L/2);
      if(N < 0 && Math.abs(N) > Ncr){
        const ni = model.nodes[el.i], nj = model.nodes[el.j];
        const [ax,ay] = toS(ni.x, ni.y);
        const [bx,by] = toS(nj.x, nj.y);
        ctx.save();
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
        const mx = (ax+bx)/2, my = (ay+by)/2;
        ctx.font = 'bold 14px ui-sans-serif,system-ui,sans-serif';
        ctx.fillStyle = '#ef4444';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⚠', mx, my - 14);
        ctx.restore();
      }
    }
  }

  /* 反弯点标注（仅弯矩图，且受独立开关控制） */
  if(type === 'M' && model.p.showAntiPts){
    ctx.strokeStyle = T.antiCurve;
    ctx.lineWidth = 1.6;
    for(const res of model.results){
      const el = res.el;
      if(filter === 'col'  && el.kind !== 'col')  continue;
      if(filter === 'beam' && el.kind !== 'beam') continue;
      if(filter === 'brace' && el.kind !== 'brace') continue;
      const N = NP;
      let Mscale = 0;
      for(let k=0;k<=N;k++) Mscale = Math.max(Mscale, Math.abs(internalAt(res, el.L*k/N, 'M')));
      if(Mscale < 1e-9) continue;
      const TOL = Mscale * 1e-3;
      const M0 = internalAt(res, 0, 'M'), ML = internalAt(res, el.L, 'M');
      const kStart = Math.abs(M0) < TOL ? 3 : 0, kEnd = Math.abs(ML) < TOL ? N-3 : N;
      if(kStart >= kEnd) continue;
      let prevV = internalAt(res, el.L*kStart/N, 'M'), prevX = el.L*kStart/N;
      for(let k=kStart+1;k<=kEnd;k++){
        const x = el.L*k/N, v = internalAt(res, x, 'M');
                let isCross = false;
        if ((prevV > 0 && v <= 0) || (prevV < 0 && v >= 0)) isCross = true;
        /* 删除 `else if (v === 0)`：v===0 且 prevV!==0 已被上面条件覆盖；
           prevV===0 && v===0 不应算穿越，否则后面插值除零产生 NaN。 */
        if (k > kStart && isCross) {
          const xz = prevX + (x-prevX) * (-prevV)/(v-prevV);
          const xi = xz/el.L;
          const ni = model.nodes[el.i], nj = model.nodes[el.j];
          const bx = ni.x + (nj.x-ni.x)*xi, by = ni.y + (nj.y-ni.y)*xi;
          const [sx,sy] = toS(bx,by);
          ctx.beginPath(); ctx.arc(sx,sy,3.2,0,Math.PI*2); ctx.stroke();
          /* 反弯点位置数值：柱标 x/h（从柱底），梁标 x/L（从左端）；悬挑与支撑跳过 */
          if(el.kind !== 'brace' && !el.isCant){
            const unit = (el.kind === 'col') ? 'h' : 'L';
            /* 打断梁子段：xi 是子段内比例，需加上整跨偏移后归一化到整跨。 */
            const xRatioFull = (el.startOffset != null && el.spanL)
              ? (el.startOffset + xz) / el.spanL
              : xi;
            const txt  = xRatioFull.toFixed(2) + unit;
            ctx.font = 'bold 9.5px "JetBrains Mono", ui-monospace, monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const tw = ctx.measureText(txt).width;
            let lx, ly;
            if(el.kind === 'col'){
              lx = sx + 18; ly = sy;          /* 柱：文字放右侧 */
            } else {
              lx = sx;      ly = sy - 13;     /* 梁：文字放上方 */
            }
            ctx.fillStyle = T.bg;
            ctx.fillRect(lx - tw/2 - 3, ly - 7, tw + 6, 14);
            ctx.fillStyle = T.antiCurve;
            ctx.fillText(txt, lx, ly);
            ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
          }
        }
        prevV = v; prevX = x;
      }
    }
  }

  if(model.p.highlight){
    ctx.save();
    ctx.strokeStyle = T.hArrow; ctx.lineWidth = 3.5;
    ctx.shadowColor = T.hArrow; ctx.shadowBlur = 12; ctx.lineCap = 'round';
    for(const el of model.els){
      if(!isElemHighlighted(el, model.p.highlight, model)) continue;
      const a = model.nodes[el.i], b = model.nodes[el.j];
      const [ax,ay] = toS(a.x,a.y), [bx,by] = toS(b.x,b.y);
      ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
    }
    ctx.restore();
  }

  ctx.fillStyle=T.node;
  for(const n of model.nodes){
    if(n.y === 0) continue;
    const [sx,sy]=toS(n.x,n.y);
    ctx.fillRect(sx-1.5, sy-1.5, 3, 3);
  }

  for(const el of model.els){
    const isBrace = (el.kind === 'brace');
    const a = model.nodes[el.i], b = model.nodes[el.j];
    const [ax, ay] = toS(a.x, a.y);
    const [bx, by] = toS(b.x, b.y);
    if(isBrace){
      /* 支撑：两端强制铰接 */
      drawBeamEndConn(ctx, ax, ay, bx, by, 'hinge', T);
      drawBeamEndConn(ctx, bx, by, ax, ay, 'hinge', T);
      continue;
    }
        if(el.kind === 'beam' && !el.isCant && model.p.betaJ < BETA_FIXED){
      /* 纯铰（βj ≤ 0.01）画空心圆；半刚接（0.01 < βj < 0.99）画弹簧折线。
         集中力打断点（isSub 节点）是梁内部节点，不是梁端，跳过该端符号。 */
      const sym = (model.p.betaJ <= BETA_HINGE) ? 'hinge' : 'spring';
      if(!a.isSub) drawBeamEndConn(ctx, ax, ay, bx, by, sym, T);
      if(!b.isSub) drawBeamEndConn(ctx, bx, by, ax, ay, sym, T);
    }
  }
  if(model.p.showIds) drawIds(ctx, model, toS);

  /* ======== 探针高亮与选中标记 ======== */
  const drawProbeMarker = (elIdx, xr, isHover) => {
    const res = model.results[elIdx];
    if(!res) return;
    const el = res.el;
    const ni = model.nodes[el.i], nj = model.nodes[el.j];
    const [ax, ay] = toS(ni.x, ni.y);
    const [ex, ey] = toS(nj.x, nj.y);
    /* xr 统一存整跨比例；对打断梁子段需反算到子段局部比例再定位。 */
    const xrLocal = (el.startOffset != null && el.spanL)
      ? Math.max(0, Math.min(1, (xr * el.spanL - el.startOffset) / el.L))
      : Math.max(0, Math.min(1, xr));
    const bx = ni.x + (nj.x - ni.x) * xrLocal;
    const by = ni.y + (nj.y - ni.y) * xrLocal;
    const [sx, sy] = toS(bx, by);

    ctx.save();
    if(isHover) {
      // 悬停：整杆泛光 + 青色小圆圈
      ctx.strokeStyle = 'rgba(56,189,248,0.8)';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 12;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
      
      ctx.fillStyle = 'rgba(56,189,248,0.9)';
      ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI*2); ctx.stroke();
    } else {
      // 选中：紫色高亮 + 十字靶心
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = 15;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
      
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#a855f7';
      ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI*2); ctx.stroke();
      // 十字准星
      ctx.beginPath();
      ctx.moveTo(sx - 12, sy); ctx.lineTo(sx + 12, sy);
      ctx.moveTo(sx, sy - 12); ctx.lineTo(sx, sy + 12);
      ctx.stroke();
    }
    ctx.restore();
  };

  if(typeof PROBE_HOVER !== 'undefined' && PROBE_HOVER && PROBE_HOVER.elIndex !== -1) {
    drawProbeMarker(PROBE_HOVER.elIndex, PROBE_HOVER.xRatio, true);
  }
  if(model.p.probe && model.p.probe.elIndex !== null) {
    drawProbeMarker(model.p.probe.elIndex, model.p.probe.xRatio, false);
  }
  /* ======== 探针标记结束 ======== */
}