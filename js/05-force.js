"use strict";

/* =====================================================================
   8. 内力图（M / N / V）
   ===================================================================== */
const THEME = {
  dark: {
    bg:'#0b1220', frame:'#cbd5e1', frameThin:'#94a3b8', frameGhost:'#475569',
    node:'#e2e8f0', nodeBlue:'#7dd3fc', support:'#94a3b8', supportFill:'#0b1220',
    udl:'#f87171', udlLabel:'#fca5a5', udlLabelBg:'rgba(11,18,32,0.78)',
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
       beam: { color:'#4ade80', fill:'rgba(74,222,128,0.28)' } }
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
       beam: { color:'#15803d', fill:'rgba(21,128,61,0.24)' } }
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
  const {toS} = makeTransform(model, W, H, { padL: 120, padT: 100, padR: 60, padB: 36 });

  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx, W, H);
  drawHUD(ctx, W, H, 'INTERNAL FORCE · ' + type);

  const NP = 61;
  const targetPx = Math.min(W,H)*0.055;

  if(BASE){
    ctx.save();
    ctx.strokeStyle = T.freezeLine;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5,4]);
    for(const res of BASE.results){
      const el = res.el;
      if(filter === 'col'  && el.kind !== 'col')  continue;
      if(filter === 'beam' && el.kind !== 'beam') continue;
      const ni = BASE.nodes[el.i], nj = BASE.nodes[el.j];
      const nx = -el.sn, ny = -el.cs;
      const base = [], curve = [];
      for(let k=0;k<=NP;k++){
        const x = el.L*k/NP;
        const val = internalAt(res, x, type);
        const xi = x/el.L;
        const bx = ni.x + (nj.x-ni.x)*xi, by = ni.y + (nj.y-ni.y)*xi;
        const [sx,sy] = toS(bx,by);
        base.push([sx, sy]);
        const off = -(val/FSTYLE.ref)*targetPx*model.p.mScale;
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
    const st  = forceStyleOf(type, el.kind);
    const ni  = model.nodes[el.i], nj = model.nodes[el.j];
    const nx = -el.sn, ny = -el.cs;
    const base  = [], curve = [];
    for(let k=0;k<=NP;k++){
      const x = el.L*k/NP;
      const val = internalAt(res, x, type);
      const xi = x/el.L;
      const bx = ni.x + (nj.x-ni.x)*xi, by = ni.y + (nj.y-ni.y)*xi;
      const [sx,sy] = toS(bx,by);
      base.push([sx,sy]);
      const off = -(val/FSTYLE.ref)*targetPx*model.p.mScale;
      curve.push([sx + nx*off, sy + ny*off]);
    }
    ctx.beginPath();
    ctx.moveTo(curve[0][0], curve[0][1]);
    for(let k=1;k<curve.length;k++) ctx.lineTo(curve[k][0], curve[k][1]);
    for(let k=base.length-1;k>=0;k--) ctx.lineTo(base[k][0], base[k][1]);
    ctx.closePath();
    const grad = ctx.createLinearGradient(curve[0][0], curve[0][1], curve[curve.length-1][0], curve[curve.length-1][1]);
    const baseRGB = st.color;
    grad.addColorStop(0,   baseRGB + '99');
    grad.addColorStop(0.5, baseRGB + '44');
    grad.addColorStop(1,   baseRGB + '99');
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(curve[0][0], curve[0][1]);
    for(let k=1;k<curve.length;k++) ctx.lineTo(curve[k][0], curve[k][1]);
    ctx.strokeStyle = st.color; ctx.lineWidth = 1.7; ctx.lineJoin = 'round'; ctx.stroke();
  }

  drawFrameLines(ctx, model, toS, T.frameThin, 1.5, false, false);
  drawSupports(ctx, model, toS, model.p.betaF);

  if(model.p.showVals){
    ctx.font = 'bold 10.5px ui-sans-serif,system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const NZ = 0.05;
    for(const res of model.results){
      const el = res.el;
      if(filter === 'col'  && el.kind !== 'col')  continue;
      if(filter === 'beam' && el.kind !== 'beam') continue;
      ctx.fillStyle = forceStyleOf(type, el.kind).color;
      const v0 = internalAt(res, 0, type), vL = internalAt(res, el.L, type);
      const ni = model.nodes[el.i], nj = model.nodes[el.j];
      const [ix, iy] = toS(ni.x, ni.y), [jx, jy] = toS(nj.x, nj.y);
      const dxu = jx - ix, dyu = jy - iy;
      const Lu = Math.hypot(dxu, dyu) || 1;
      const ux = dxu/Lu, uy = dyu/Lu;
      if(el.kind === 'col'){
        let side;
        if(ni.col === 0) side = 1;
        else if(ni.col === model.nCol - 1) side = -1;
        else side = (ni.col % 2 === 1) ? 1 : -1;
        const off = 22;
        if(Math.abs(v0) > NZ) ctx.fillText(v0.toFixed(1), ix + side*off, iy);
        if(Math.abs(vL) > NZ) ctx.fillText(vL.toFixed(1), jx + side*off, jy + 8);
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

  /* 反弯点标注（仅弯矩图） */
  if(type === 'M'){
    ctx.strokeStyle = T.antiCurve;
    ctx.lineWidth = 1.6;
    for(const res of model.results){
      const el = res.el;
      if(filter === 'col'  && el.kind !== 'col')  continue;
      if(filter === 'beam' && el.kind !== 'beam') continue;
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
        else if (v === 0) isCross = true;
        if (k > kStart && isCross) {
          const xz = prevX + (x-prevX) * (-prevV)/(v-prevV);
          const xi = xz/el.L;
          const ni = model.nodes[el.i], nj = model.nodes[el.j];
          const bx = ni.x + (nj.x-ni.x)*xi, by = ni.y + (nj.y-ni.y)*xi;
          const [sx,sy] = toS(bx,by);
          ctx.beginPath(); ctx.arc(sx,sy,3.2,0,Math.PI*2); ctx.stroke();
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
    ctx.beginPath(); ctx.arc(sx,sy,2.0,0,Math.PI*2); ctx.fill();
  }

  if(model.p.betaJ < BETA_FIXED){
    const t   = 1 - model.p.betaJ;
    const R   = 3 + t*2, lw  = 1.0 + t*0.8;
    const seen = new Set();
    for(const el of model.els){
      if(el.kind !== 'beam' || el.isCant) continue;
      for(const nidx of [el.i, el.j]){
        if(seen.has(nidx)) continue; seen.add(nidx);
        const node = model.nodes[nidx];
        const [hx, hy] = toS(node.x, node.y);
        ctx.beginPath(); ctx.arc(hx, hy, R, 0, Math.PI*2);
        ctx.fillStyle   = T.bg; ctx.fill();
        ctx.strokeStyle = T.hArrow; ctx.lineWidth = lw; ctx.stroke();
      }
    }
  }
  if(model.p.showIds) drawIds(ctx, model, toS);
}