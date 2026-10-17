"use strict";

/* =====================================================================
   6. 画布工具
   ===================================================================== */
function setupCanvas(canvas, overrideDPR){
  let dpr = overrideDPR || window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const W = Math.max(120, rect.width);
  const H = Math.max(120, rect.height);
  if(S.rec && S.rec.active){
    dpr = Math.min(dpr, 1920 / W, 1080 / H);
  }
  canvas.width  = Math.round(W*dpr);
  canvas.height = Math.round(H*dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return {ctx,W,H};
}

function drawGrid(ctx, W, H){
  ctx.save();
  const step = 24;
  ctx.strokeStyle = S.lightBg ? 'rgba(100,116,139,0.10)' : 'rgba(56,189,248,0.045)';
  ctx.lineWidth = 0.5;
  for(let x=0; x<=W; x+=step){
    ctx.beginPath(); ctx.moveTo(x+0.5, 0); ctx.lineTo(x+0.5, H); ctx.stroke();
  }
  for(let y=0; y<=H; y+=step){
    ctx.beginPath(); ctx.moveTo(0, y+0.5); ctx.lineTo(W, y+0.5); ctx.stroke();
  }
  ctx.strokeStyle = S.lightBg ? 'rgba(100,116,139,0.18)' : 'rgba(56,189,248,0.09)';
  for(let x=0; x<=W; x+=step*5){
    ctx.beginPath(); ctx.moveTo(x+0.5, 0); ctx.lineTo(x+0.5, H); ctx.stroke();
  }
  for(let y=0; y<=H; y+=step*5){
    ctx.beginPath(); ctx.moveTo(0, y+0.5); ctx.lineTo(W, y+0.5); ctx.stroke();
  }
  ctx.restore();
}

function drawHUD(ctx, W, H, label, showSolver, topOffset){
  ctx.save();
  ctx.strokeStyle = S.lightBg ? 'rgba(71,85,105,0.55)' : 'rgba(56,189,248,0.55)';
  ctx.lineWidth = 1.2;
  const L = 14, M = 10;
  const corners = [
    [M, M, 1, 1], [W-M, M, -1, 1],
    [M, H-M, 1, -1], [W-M, H-M, -1, -1]
  ];
  for(const [x,y,dx,dy] of corners){
    ctx.beginPath();
    ctx.moveTo(x+dx*L, y); ctx.lineTo(x, y); ctx.lineTo(x, y+dy*L);
    ctx.stroke();
  }
  const ty = M + 4 + (topOffset || 0);
  ctx.font = '9.5px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillStyle = S.lightBg ? 'rgba(51,65,85,0.85)' : 'rgba(125,211,252,0.70)';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('◆ ' + (label||'STATIC / LINEAR-ELASTIC'), M+4, ty);
  if(showSolver !== false){
    ctx.textAlign = 'right';
    ctx.fillText('SOLVER: MDOF-DIRECT · CONVERGED', W-M-4, ty);
  }
  ctx.restore();
}

function drawIds(ctx, model, toS){
  ctx.save();
  ctx.font = 'bold 10.5px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(125,211,252,0.85)';
  for(let idx=0; idx<model.nodes.length; idx++){
    const n = model.nodes[idx];
    const [sx,sy] = toS(n.x, n.y);
    ctx.fillText('N'+(idx+1), sx + 12, sy - 11);
  }
  ctx.fillStyle = 'rgba(74,222,128,0.85)';
  for(let idx=0; idx<model.els.length; idx++){
    const el = model.els[idx];
    const ni = model.nodes[el.i], nj = model.nodes[el.j];
    const [ax,ay] = toS(ni.x, ni.y);
    const [bx,by] = toS(nj.x, nj.y);
    const mx = (ax+bx)/2, my = (ay+by)/2;
    const dx = bx-ax, dy = by-ay;
    const len = Math.hypot(dx,dy) || 1;
    const nx = -dy/len * 14, ny = dx/len * 14;
    ctx.fillText('E'+(idx+1), mx + nx, my + ny);
  }
  ctx.restore();
}

function makeTransform(model, W, H, pad){
  let padL, padR, padT, padB;
  if(typeof pad === 'number'){
    padL = padR = padT = padB = pad;
  }else{
    padL = pad.padL ?? 74;
    padR = pad.padR ?? 74;
    padT = pad.padT ?? 74;
    padB = pad.padB ?? 74;
  }
  const xs = model.nodes.map(n=>n.x);
  const ys = model.nodes.map(n=>n.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const availW = W - padL - padR;
  const availH = H - padT - padB;
  const sc = Math.min(availW/(x1-x0||1), availH/(y1-y0||1));
  const dw = (x1-x0)*sc, dh = (y1-y0)*sc;
  const left   = padL + (availW - dw)/2;
  const bottom = H - padB - (availH - dh)/2;
  const toS = (x,y) => [ left + (x-x0)*sc , bottom - (y-y0)*sc ];
  return {toS, sc, x0, y0};
}

function elemLineWidth(el, model){
  if(!model.p) return 3;
  if(el.kind === 'col'){
    return Math.max(3.5, Math.min(9, 2.5 + model.p.hc/130));
  } else {
    return Math.max(3.5, Math.min(9, 2.5 + model.p.hb/130));
  }
}

function drawFrameLines(ctx, model, toS, color, lwBase, dashed, useSectionWidth){
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  if(dashed) ctx.setLineDash([5,4]);
  for(const el of model.els){
    ctx.lineWidth = useSectionWidth ? elemLineWidth(el, model) : lwBase;
    const a = model.nodes[el.i], b = model.nodes[el.j];
    const [ax,ay] = toS(a.x,a.y);
    const [bx,by] = toS(b.x,b.y);
    ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
  }
  ctx.restore();
}

function drawSupports(ctx, model, toS, base){
  const T = theme();
  const nCol = model.nCol || 3;
  const nLev = model.nLev || 2;
  const colW = 2.5;
  for(let c=0;c<nCol;c++){
    const n = model.nodes[c*(nLev+1)];
    const [sx,sy] = toS(n.x, n.y);
    const topY = (base >= BETA_FIXED) ? sy + 9
               : (base <= BETA_HINGE) ? sy + 11
               :                        sy + 4;
    ctx.strokeStyle = T.support;
    ctx.lineWidth   = colW;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx, topY);
    ctx.stroke();
    ctx.strokeStyle = T.support;
    ctx.lineWidth = 1.6;
    if(base >= BETA_FIXED){
      ctx.beginPath(); ctx.moveTo(sx-11, sy+9); ctx.lineTo(sx+11, sy+9); ctx.stroke();
      for(let k=-9;k<=9;k+=6){
        ctx.beginPath(); ctx.moveTo(sx+k, sy+9); ctx.lineTo(sx+k-5, sy+16); ctx.stroke();
      }
    } else if(base <= BETA_HINGE){
      ctx.beginPath(); ctx.moveTo(sx-11, sy+11); ctx.lineTo(sx+11, sy+11); ctx.stroke();
      for(let k=-9;k<=9;k+=6){
        ctx.beginPath(); ctx.moveTo(sx+k, sy+11); ctx.lineTo(sx+k-5, sy+18); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, Math.PI*2);
      ctx.fillStyle = T.supportFill; ctx.fill();
      ctx.strokeStyle = T.support; ctx.lineWidth = 1.6; ctx.stroke();
    } else {
      const y0 = sy + 4;
      const yBottom = sy + 22;
      ctx.beginPath();
      ctx.moveTo(sx, y0);
      const nZig = 5;
      const yStep = (yBottom - y0) / nZig;
      for(let k=0;k<nZig;k++){
        const yy1 = y0 + yStep*(k+0.5);
        const yy2 = y0 + yStep*(k+1);
        const xoff = (k%2 === 0) ? 5 : -5;
        ctx.lineTo(sx + xoff, yy1);
        if(k < nZig-1) ctx.lineTo(sx - xoff, yy2);
        else ctx.lineTo(sx, yy2);
      }
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx-11, yBottom+2); ctx.lineTo(sx+11, yBottom+2); ctx.stroke();
      for(let k=-9;k<=9;k+=6){
        ctx.beginPath(); ctx.moveTo(sx+k, yBottom+2); ctx.lineTo(sx+k-5, yBottom+9); ctx.stroke();
      }
    }
  }
}

function drawLoadDiagram(canvas, model, dprOverride){
  const {ctx,W,H} = setupCanvas(canvas, dprOverride);
  const pH = model.p;
  const hasH = (pH.H1 + pH.H2 + pH.H3) > 0;
  const showDim = W >= 300;
  const {toS} = makeTransform(model, W, H, {
    padL: showDim ? (hasH ? 82 : 74) : (hasH ? 60 : 44),
    padR: showDim ? 60 : 44,
    padT: 52,
    padB: showDim ? 62 : 32
  });
  const T = theme();
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx, W, H);
  drawHUD(ctx, W, H, 'LOAD DIAGRAM', false);
  drawFrameLines(ctx, model, toS, T.frame, 2.5, false, false);
  drawSupports(ctx, model, toS, model.p.betaF);
  ctx.fillStyle=T.node;
  for(const n of model.nodes){
    if(Math.abs(n.y) < 1e-9) continue;
    const [sx,sy]=toS(n.x,n.y);
    ctx.beginPath(); ctx.arc(sx,sy,2.6,0,Math.PI*2); ctx.fill();
  }
  if(model.p.betaJ < BETA_FIXED){
    const t   = 1 - model.p.betaJ;
    const R   = 3 + t*1.5;
    const lw  = 1.0 + t*0.8;
    for(const el of model.els){
      if(el.kind !== 'beam' || el.isCant) continue;
      const a = model.nodes[el.i], b = model.nodes[el.j];
      const [ax, ay] = toS(a.x, a.y);
      const [bx, by] = toS(b.x, b.y);
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const nx = (bx - ax) / len, ny = (by - ay) / len;
      const off = R + 3; // 缩短偏移距离，让铰符号更贴近节点

      // 左端铰
      ctx.beginPath(); ctx.arc(ax + nx*off, ay + ny*off, R, 0, Math.PI*2);
      ctx.fillStyle   = T.bg; ctx.fill();
      ctx.strokeStyle = T.hArrow; ctx.lineWidth = lw; ctx.stroke();

      // 右端铰
      ctx.beginPath(); ctx.arc(bx - nx*off, by - ny*off, R, 0, Math.PI*2);
      ctx.fillStyle   = T.bg; ctx.fill();
      ctx.strokeStyle = T.hArrow; ctx.lineWidth = lw; ctx.stroke();
    }
  }
  const p = model.p;
  for(const el of model.els){
    if(el.kind !== 'beam') continue;
    const lv = el.lev;
    let q = 0, showLabel = false, labelTxt = '';
    if(el.isCant){
      q = p['qc'+lv]; labelTxt = q.toFixed(1); showLabel = true;
    } else {
      q = p['q'+lv]; showLabel = (el.bay === 1);
    }
    if(q <= 0) continue;
    const placeAbove = true;
    let labelMidY = null;
    if(lv < model.nLev){
      const [ , yBeam ] = toS(model.nodes[el.i].x, model.nodes[el.i].y);
      const [ , yUp   ] = toS(model.nodes[el.i].x, model.nodes[el.i].y + p['h'+(lv+1)]);
      labelMidY = (yBeam + yUp) / 2;
    }
    drawUDL(ctx, toS, model.nodes[el.i], model.nodes[el.j], q, showLabel, labelTxt, placeAbove, labelMidY);
  }
  function drawFloorH(level, H){
    if(H <= 0) return;
    const nCol = model.nCol, nid = model.nid;
    const w = computeHShare(p, nCol, level);
    let sum = 0;
    for(const v of w) sum += v;
    for(let c=0;c<nCol;c++){
      const Hc = H * w[c] / sum;
      if(Hc <= 0) continue;
      const lbl = (p.Hmode === 'left')
        ? (c === 0 ? H.toFixed(1) : '')
        : Hc.toFixed(1);
      drawHF(ctx, toS, model.nodes[nid(c, level)], Hc, lbl);
    }
  }
  for(let lv=1; lv<=model.nLev; lv++) drawFloorH(lv, p['H'+lv]);
  if(showDim){
    drawDims(ctx, model, toS, T);
    drawSectionInfo(ctx, model, W, T);
  }
  if(p.showIds) drawIds(ctx, model, toS);
}

function drawDimLine(ctx, x1, y1, x2, y2, label, color, dir){
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = 0.9; ctx.setLineDash([]);
  if(dir === 'h'){
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1 - 4); ctx.lineTo(x1, y1 + 4);
    ctx.moveTo(x2, y2 - 4); ctx.lineTo(x2, y2 + 4);
    ctx.stroke();
    ctx.font = '10.5px ui-sans-serif,system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(label, (x1 + x2) / 2, y1 - 6);
  } else {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1 - 4, y1); ctx.lineTo(x1 + 4, y1);
    ctx.moveTo(x2 - 4, y2); ctx.lineTo(x2 + 4, y2);
    ctx.stroke();
    ctx.save();
    ctx.translate(x1 - 8, (y1 + y2) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = '10.5px ui-sans-serif,system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

function drawDims(ctx, model, toS, T){
  const p   = model.p;
  const nBay = model.nBay, nLev = model.nLev, nCol = model.nCol;
  const [, yBase] = toS(0, 0);
  const dimY = yBase + 30;
  const xCols = [];
  for(let c=0; c<nCol; c++){
    const n = model.nodes[c*(nLev+1)];
    xCols.push(toS(n.x, n.y)[0]);
  }
  for(let c=0; c<nBay; c++){
    drawDimLine(ctx, xCols[c], dimY, xCols[c+1], dimY, p['L'+(c+1)].toFixed(1), T.frameThin, 'h');
  }
  if(p.hasCant){
    const nCant = model.nodes.find(n => n.cant);
    if(nCant) drawDimLine(ctx, xCols[nBay], dimY, toS(nCant.x, nCant.y)[0], dimY, p.Lc.toFixed(1), T.frameThin, 'h');
  }
  const dimX = xCols[0] - 48;
  const yLev = [];
  for(let lv=0; lv<=nLev; lv++) yLev.push(toS(model.nodes[lv].x, model.nodes[lv].y)[1]);
  for(let lv=1; lv<=nLev; lv++){
    drawDimLine(ctx, dimX, yLev[lv], dimX, yLev[lv-1], p['h'+lv].toFixed(1), T.frameThin, 'v');
  }
}

function drawSectionInfo(ctx, model, W, T){
  const p = model.p;
  ctx.save();
  ctx.font = '11px ui-sans-serif,system-ui,sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillStyle = T.frameThin;
  ctx.fillText(`柱 ${Math.round(p.bc)}×${Math.round(p.hc)}`, W - 14, 14);
  ctx.fillText(`梁 ${Math.round(p.bb)}×${Math.round(p.hb)}`, W - 14, 30);
  ctx.restore();
}

function drawUDL(ctx, toS, ni, nj, q, showLabel, labelTxt, placeAbove, labelMidY){
  const T = theme();
  const [x1,y1] = toS(ni.x, ni.y);
  const [x2,y2] = toS(nj.x, nj.y);
  const arrowLen = 16 + Math.min(20, q/25);
  const screenLen = Math.hypot(x2-x1, y2-y1);
  const N = Math.max(2, Math.min(12, Math.round(screenLen / 30)));
  ctx.strokeStyle = T.udl; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(x1, y1 - arrowLen); ctx.lineTo(x2, y2 - arrowLen); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1 - arrowLen); ctx.lineTo(x1, y1 - 3);
  ctx.moveTo(x2, y2 - arrowLen); ctx.lineTo(x2, y2 - 3);
  ctx.stroke();
  for(let k=0;k<N;k++){
    const t = (k + 0.5)/N;
    const bx = x1 + (x2-x1)*t;
    const by = y1 + (y2-y1)*t;
    ctx.beginPath(); ctx.moveTo(bx, by - arrowLen); ctx.lineTo(bx, by - 5);
    ctx.strokeStyle = T.udl; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx - 3.5, by - 9); ctx.lineTo(bx, by - 2.5); ctx.lineTo(bx + 3.5, by - 9);
    ctx.closePath(); ctx.fillStyle = T.udl; ctx.fill();
  }
  if(showLabel){
    const mx = (x1+x2)/2;
    const txt = labelTxt || q.toFixed(1);
    ctx.font = 'bold 11px ui-sans-serif,system-ui,sans-serif';
    ctx.textAlign = 'center';
    if(placeAbove){
      const my = (labelMidY != null) ? labelMidY - 12 : (y1+y2)/2 - arrowLen - 12;
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(txt).width;
      ctx.fillStyle = T.udlLabelBg; ctx.fillRect(mx - w/2 - 4, my - 8, w + 8, 16);
      ctx.fillStyle = T.udlLabel; ctx.fillText(txt, mx, my);
    } else {
      const my = (y1+y2)/2 + 14;
      ctx.textBaseline = 'top';
      const w = ctx.measureText(txt).width;
      ctx.fillStyle = T.udlLabelBg; ctx.fillRect(mx - w/2 - 4, my - 2, w + 8, 15);
      ctx.fillStyle = T.udlLabel; ctx.fillText(txt, mx, my);
    }
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }
}

function drawHF(ctx, toS, node, H, label){
  const T = theme();
  const [sx, sy] = toS(node.x, node.y);
  const arrowLen = Math.min(72, 34 + H/22);
  const tipX  = sx, tailX = sx - arrowLen;
  ctx.beginPath(); ctx.moveTo(tailX, sy); ctx.lineTo(tipX, sy);
  ctx.strokeStyle = T.hArrow; ctx.lineWidth = 2; ctx.stroke();
  const headLen = 10;
  ctx.beginPath();
  ctx.moveTo(tipX, sy); ctx.lineTo(tipX - headLen, sy - 4.5); ctx.lineTo(tipX - headLen, sy + 4.5);
  ctx.closePath(); ctx.fillStyle = T.hArrow; ctx.fill();
  if(label){
    const midX = (tailX + tipX)/2;
    ctx.fillStyle = T.hLabel;
    ctx.font = 'bold 11px ui-sans-serif,system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(label, midX, sy - 6);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }
}