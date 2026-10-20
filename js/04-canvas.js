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
  
  // 统一重置文本和线条状态，防止上一个绘图函数的状态泄漏
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  ctx.setLineDash([]);
  
  return {ctx,W,H};
}

function drawGrid(ctx, W, H){
  ctx.save();
  const step = 24;
  ctx.strokeStyle = 'rgba(56,189,248,0.045)';
  ctx.lineWidth = 0.5;
  for(let x=0; x<=W; x+=step){
    ctx.beginPath(); ctx.moveTo(x+0.5, 0); ctx.lineTo(x+0.5, H); ctx.stroke();
  }
  for(let y=0; y<=H; y+=step){
    ctx.beginPath(); ctx.moveTo(0, y+0.5); ctx.lineTo(W, y+0.5); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(56,189,248,0.09)';
  for(let x=0; x<=W; x+=step*5){
    ctx.beginPath(); ctx.moveTo(x+0.5, 0); ctx.lineTo(x+0.5, H); ctx.stroke();
  }
  for(let y=0; y<=H; y+=step*5){
    ctx.beginPath(); ctx.moveTo(0, y+0.5); ctx.lineTo(W, y+0.5); ctx.stroke();
  }
  ctx.restore();
}

function drawHUD(ctx, W, H, label, topOffset){
  ctx.save();
  ctx.strokeStyle = 'rgba(56,189,248,0.55)';
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
  ctx.fillStyle = 'rgba(125,211,252,0.7)';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('◆ ' + (label||'STATIC / LINEAR-ELASTIC'), M+4, ty);
  /* 已删除：SOLVER 文字与右上角 DOM 按钮冲突，且底部状态栏已包含求解耗时，此处不再冗余绘制 */
  ctx.restore();
}

/* 梁端连接符号：纯铰画空心圆，半刚接画弹簧折线，刚接不画。
   供荷载简图 / 内力图 / 变形图三处共用，保证视觉一致。 */
function drawBeamEndConn(ctx, ax, ay, bx, by, kind, T){
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const nx = (bx - ax) / len, ny = (by - ay) / len;

  if(kind === 'hinge'){
    const R = 4.5;
    const off = R + 3;
    ctx.beginPath();
    ctx.arc(ax + nx*off, ay + ny*off, R, 0, Math.PI*2);
    ctx.fillStyle   = T.bg; ctx.fill();
    ctx.strokeStyle = T.hArrow; ctx.lineWidth = 1.6; ctx.stroke();
    return;
  }

  /* 半刚接：沿杆轴方向画一段锯齿弹簧，表示有限转动刚度 */
  const startOff = 3;
  const coilLen  = 12;
  const nCoils   = 3;
  const amp      = 3;
  const px = -ny, py = nx; // 杆轴垂直方向
  const sx = ax + nx*startOff, sy = ay + ny*startOff;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  for(let k=0; k<nCoils; k++){
    const t1 = (k + 0.25) / nCoils;
    const t2 = (k + 0.75) / nCoils;
    ctx.lineTo(sx + nx*coilLen*t1 + px*amp, sy + ny*coilLen*t1 + py*amp);
    ctx.lineTo(sx + nx*coilLen*t2 - px*amp, sy + ny*coilLen*t2 - py*amp);
  }
  ctx.lineTo(sx + nx*coilLen, sy + ny*coilLen);
  ctx.strokeStyle = T.hArrow; ctx.lineWidth = 1.4; ctx.stroke();
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
  const availW = Math.max(10, W - padL - padR);
  const availH = Math.max(10, H - padT - padB);
  let sc = Math.min(availW/Math.max(1e-6, x1-x0), availH/Math.max(1e-6, y1-y0));
  if (!isFinite(sc) || sc <= 0) sc = 1; // 增加 NaN 兜底
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
  } else if(el.kind === 'brace'){
    return 2.5;
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

function drawSingleSupport(ctx, sx, sy, base, T, colW) {
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

function drawSupports(ctx, model, toS, base, isDeform, deformF){
  const T = theme();
  const nCol = model.nCol || 3;
  const nLev = model.nLev || 2;
  const colW = 2.5;

  const hasSettle = (parseFloat(model.p.settleDy) > 1e-6);
  const settleCol = hasSettle ? Math.max(0, Math.min(nCol - 1, model.p.settleCol | 0)) : -1;

  for(let c=0;c<nCol;c++){
    const n = model.nodes[c*(nLev+1)];
    let sx, sy;
    
    if (isDeform) {
      // 变形图：支座跟随节点位移（按放大系数 F 放大）
      const ux = model.U[c*(nLev+1)*3];
      const uy = model.U[c*(nLev+1)*3+1];
      [sx, sy] = toS(n.x + (deformF || 0) * ux, n.y + (deformF || 0) * uy);
    } else {
      // 受力/荷载图：原位
      [sx, sy] = toS(n.x, n.y);
    }

    const isSettledCol = (c === settleCol);

    if (!isDeform && isSettledCol) {
      // 1. 画半透明虚线支座（原位）
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.setLineDash([3, 3]);
      drawSingleSupport(ctx, sx, sy, base, T, colW);
      ctx.restore();
      
      // 2. 计算下沉后的支座位置（向下偏移 20px）
      /* 下沉距离与沉降量成比例（1mm→0.6px，上限 60px），便于直观对比 */
      const dropPx = Math.min(60, Math.max(6, (model.p.settleDy || 0) * 0.6));
      const syDrop = sy + dropPx;
      
      // 3. 画红色虚线和箭头连接
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.fillStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      
      ctx.beginPath(); ctx.moveTo(sx - 8, sy + 2); ctx.lineTo(sx - 8, syDrop - 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx + 8, sy + 2); ctx.lineTo(sx + 8, syDrop - 2); ctx.stroke();
      
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(sx, sy + 2); ctx.lineTo(sx, syDrop - 5); ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(sx, syDrop);
      ctx.lineTo(sx - 4, syDrop - 6);
      ctx.lineTo(sx + 4, syDrop - 6);
      ctx.closePath();
      ctx.fill();
      
      // 添加文字标注
      ctx.font = 'bold 10.5px ui-sans-serif,system-ui,sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`↓ ${Math.round(model.p.settleDy)}mm`, sx + 14, (sy + syDrop)/2);
      ctx.restore();
      
      // 4. 在下方画实心新支座
      drawSingleSupport(ctx, sx, syDrop, base, T, colW);
    } else {
      // 正常画支座
      drawSingleSupport(ctx, sx, sy, base, T, colW);
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
    padT: 110, // 加大顶部留白，强制图形下移，避免与右上角文字重叠
    padB: showDim ? 62 : 32
  });
  const T = theme();
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx, W, H);
  drawHUD(ctx, W, H, 'LOAD DIAGRAM');

  // ===== 标注温度（极简排版，仅显示最终温度状态） =====
  const t0 = pH.tempT0 != null ? pH.tempT0 : 20;
  const tAll = pH.tempAll || 0;
  const tGrad = pH.tempGrad || 0;
  
  if (Math.abs(tAll) > 1e-3 || Math.abs(tGrad) > 1e-3) {
    const tOut = t0 + tAll + tGrad / 2;
    const tIn  = t0 + tAll - tGrad / 2;

    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    const rightX = W - 14;
    // 判断是否有支撑，如果有支撑，则温度文本下移避让“撑 As”那一行
    const hasBraceInLoad = Object.keys(pH.braceMap || {}).some(k => pH.braceMap[k] && pH.braceMap[k] !== 'none');
    let ty = hasBraceInLoad ? 64 : 50;

    // 若无截面温差，直接用一行显示整体温升
    if (Math.abs(tGrad) < 1e-3) {
      ctx.font = 'bold 11px ui-sans-serif,system-ui,sans-serif';
      ctx.fillStyle = tAll > 0 ? T.udl : T.hArrow;
      const sign = tAll > 0 ? '+' : '';
      ctx.fillText(`均匀温升: ${sign}${tAll.toFixed(1)} ℃`, rightX, ty);
    } else {
      // 有截面温差，显示室外/室内绝对温度
      ctx.font = 'bold 11px ui-sans-serif,system-ui,sans-serif';
      ctx.fillStyle = tOut > t0 ? T.udl : T.hArrow;
      ctx.fillText(`室外温度: ${tOut.toFixed(1)} ℃`, rightX, ty);
      
      ty += 18;
      ctx.fillStyle = tIn > t0 ? T.udl : T.hArrow;
      ctx.fillText(`室内温度: ${tIn.toFixed(1)} ℃`, rightX, ty);
    }
    ctx.restore();
  }
  // ========================================================

  drawFrameLines(ctx, model, toS, T.frame, 2.5, false, false);
  
  // 支撑用青色画出，与内力图保持一致
  for(const el of model.els){
    if(el.kind === 'brace'){
      const a = model.nodes[el.i], b = model.nodes[el.j];
      const [ax,ay] = toS(a.x,a.y);
      const [bx,by] = toS(b.x,b.y);
      ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by);
      ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.stroke();
    }
  }
  drawSupports(ctx, model, toS, model.p.betaF, false);
  ctx.fillStyle=T.node;
  for(const n of model.nodes){
    if(Math.abs(n.y) < 1e-9) continue;
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
  const p = model.p;
  for(const el of model.els){
    if(el.kind !== 'beam') continue;
    const lv = el.lev;
    let q = 0, showLabel = false, labelTxt = '';
    
    // 集中力打断梁后，右子单元的起点是集中力节点，只在左段画标签
    const isLeftSub = model.nodes[el.i] && model.nodes[el.i].pLoad;
    const skipLabel = isLeftSub;

    if(el.isCant){
      q = p['qc'+lv]; labelTxt = q.toFixed(1); showLabel = true;
    } else {
      q = (el.qSpan != null) ? el.qSpan : p['q'+lv];
      labelTxt = q.toFixed(1);
      showLabel = !skipLabel; // 只在一段的中间标注
    }
    if(q <= 0) continue;
    const placeAbove = true;
    let labelMidY = null;
    {
      const [ , yBeam ] = toS(model.nodes[el.i].x, model.nodes[el.i].y);
      let yUp;
      if(lv < model.nLev){
        yUp = toS(model.nodes[el.i].x, model.nodes[el.i].y + p['h'+(lv+1)])[1];
      } else {
        yUp = yBeam - 40;
      }
      labelMidY = (yBeam + yUp) / 2;
    }
    drawUDL(ctx, toS, model.nodes[el.i], model.nodes[el.j], q, showLabel, labelTxt, placeAbove, labelMidY);
  }
  /* 绘制集中力（求解器中已将其所在梁打断为子节点） */
  for(let i=0; i<model.nodes.length; i++){
    const n = model.nodes[i];
    if(n.pLoad) {
      const [sx, sy] = toS(n.x, n.y);
      const len = 20 + Math.min(30, n.pLoad / 10);
      ctx.strokeStyle = T.udl; ctx.fillStyle = T.udl; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx, sy - len); ctx.lineTo(sx, sy - 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx-5, sy-10); ctx.lineTo(sx+5, sy-10); ctx.closePath(); ctx.fill();
      
      const txt = n.pLoad.toFixed(1);
      ctx.font = 'bold 11px ui-sans-serif,system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = T.udlLabelBg; ctx.fillRect(sx - tw/2 - 4, sy - len - 18, tw + 8, 16);
      ctx.fillStyle = T.udlLabel; ctx.fillText(txt, sx, sy - len - 4);
    }
  }

  function drawFloorH(level, H){
    if(H <= 0) return;
    /* 力统一加在左柱顶，刚性楼板分配不改变力的作用点 */
    drawHF(ctx, toS, model.nodes[model.nid(0, level)], H, H.toFixed(1));
  }
  for(let lv=1; lv<=model.nLev; lv++) drawFloorH(lv, p['H'+lv]);

  /* 绘制支撑角度 */
  ctx.font = 'bold 10.5px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const drawnLabels = new Set();
  
  for(const el of model.els) {
    if(el.kind !== 'brace') continue;
    const ni = model.nodes[el.i], nj = model.nodes[el.j];
    const [ax, ay] = toS(ni.x, ni.y);
    const [bx, by] = toS(nj.x, nj.y);
    const midX = (ax + bx) / 2, midY = (ay + by) / 2;
    
    // X 撑去重：两根杆的中点坐标通常完全重合，只需绘制一次
    const key = Math.round(midX) + '_' + Math.round(midY);
    if(drawnLabels.has(key)) continue;
    drawnLabels.add(key);

    const angle = Math.abs(Math.atan2(by - ay, bx - ax) * 180 / Math.PI);
    const dispAngle = angle > 90 ? 180 - angle : angle;
    const txt = `${Math.round(dispAngle)}°`;
    
    // Halo 描边效果，代替死板的黑框
    ctx.strokeStyle = T.bg;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.strokeText(txt, midX, midY);
    
    ctx.fillStyle = T.nodeBlue;
    ctx.fillText(txt, midX, midY);
  }

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
    ctx.moveTo(x1 - 4, y1 + 4); ctx.lineTo(x1 + 4, y1 - 4);
    ctx.moveTo(x2 - 4, y2 + 4); ctx.lineTo(x2 + 4, y2 - 4);
    ctx.stroke();
    ctx.font = '10.5px ui-sans-serif,system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(label, (x1 + x2) / 2, y1 - 6);
  } else {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1 - 4, y1 + 4); ctx.lineTo(x1 + 4, y1 - 4);
    ctx.moveTo(x2 - 4, y2 + 4); ctx.lineTo(x2 + 4, y2 - 4);
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
  
  /* 有支撑时，第三行显示支撑截面积 */
  const hasBrace = Object.keys(p.braceMap || {}).some(k => p.braceMap[k] && p.braceMap[k] !== 'none');
  if(hasBrace){
    // 与前两行（y=14 / y=30）保持 16px 等距
    ctx.fillText(`撑 Aₛ ${Math.round(p.As)} mm²`, W - 14, 46);
  }
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