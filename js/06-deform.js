"use strict";

/* =====================================================================
   9. 变形图
   ===================================================================== */
function drawDeform(canvas, model, dprOverride){
  const T = theme();
  const {ctx,W,H} = setupCanvas(canvas, dprOverride);
  // 统一 pad 与受力图一致（120,100,60,36），使得两张图的结构比例完全一样大
  const pad = {padL: 120, padT: 100, padR: 60, padB: 36};
  const {toS} = makeTransform(model, W, H, pad);

  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx, W, H);
  drawHUD(ctx, W, H, 'DEFORMED SHAPE', false);

  const NP = 26;
  const curves = [];
  for(const res of model.results){
    const el = res.el;
    const ni = model.nodes[el.i], nj = model.nodes[el.j];
    const pts = [];
    for(let k=0;k<=NP;k++){
      const xi = k/NP;
      const x  = xi*el.L;
      const bx = ni.x + (nj.x-ni.x)*xi;
      const by = ni.y + (nj.y-ni.y)*xi;
      const [dx,dy] = elemDisp(res, x);
      pts.push({bx,by,dx,dy});
    }
    curves.push(pts);
  }

  const F = model.p.dScale;
  drawFrameLines(ctx, model, toS, T.frameGhost, 1.5, true, false);

  // 绘制冻结基准的变形图（虚线）
  if(BASE){
    ctx.save();
    ctx.strokeStyle = T.freezeLine;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5,4]);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for(const res of BASE.results){
      const el = res.el;
      const ni = BASE.nodes[el.i], nj = BASE.nodes[el.j];
      ctx.beginPath();
      for(let k=0; k<=NP; k++){
        const xi = k/NP;
        const x = xi * el.L;
        const bx = ni.x + (nj.x - ni.x) * xi;
        const by = ni.y + (nj.y - ni.y) * xi;
        const [dx, dy] = elemDisp(res, x);
        const [sx, sy] = toS(bx + F * dx, by + F * dy);
        if(k===0) ctx.moveTo(sx,sy); else ctx.lineTo(sx,sy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // 绘制当前变形图（实线）
  ctx.lineJoin = 'round'; ctx.lineCap  = 'round';
  for(let e=0;e<curves.length;e++){
    const pts = curves[e];
    const res = model.results[e];
    const el  = res.el;

    // 检查支撑是否失效：显式读取求解器的 inactiveBraces，
    // 避免普通支撑轴力恰好为 0 时被误判为「已失效」而画成灰色虚线
    const isDeadBrace = (el.kind === 'brace') && !!(model.inactiveBraces && model.inactiveBraces.has(el.braceUid));
    
    if(isDeadBrace) {
      ctx.strokeStyle = T.frameGhost;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.5;
    } else {
      ctx.strokeStyle = T.deformCurve;
      ctx.setLineDash([]);
      ctx.lineWidth = elemLineWidth(el, model) * 0.6;
    }

    ctx.beginPath();
    for(let k=0;k<pts.length;k++){
      const p = pts[k];
      const [sx,sy] = toS(p.bx + F*p.dx, p.by + F*p.dy);
      if(k===0) ctx.moveTo(sx,sy); else ctx.lineTo(sx,sy);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.fillStyle=T.nodeBlue;
  for(let idx=0; idx<model.nodes.length; idx++){
    const n = model.nodes[idx];
    if(n.y === 0) continue;
    const ux = model.U[idx*3], uy = model.U[idx*3+1];
    const [px,py] = toS(n.x, n.y);
    const [sx,sy] = toS(n.x + F*ux, n.y + F*uy);
    const ddx = sx - px, ddy = sy - py;
    const dlen = Math.hypot(ddx, ddy);
    if(dlen > 3){
      ctx.strokeStyle = T.deformCurve;
      ctx.fillStyle   = T.deformCurve;
      ctx.lineWidth   = 1.1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke();
      const ang = Math.atan2(ddy, ddx);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - 6*Math.cos(ang - 0.4), sy - 6*Math.sin(ang - 0.4));
      ctx.lineTo(sx - 6*Math.cos(ang + 0.4), sy - 6*Math.sin(ang + 0.4));
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = T.nodeBlue;
    ctx.fillRect(sx-2, sy-2, 4, 4);
  }
  /* 与荷载简图 / 内力图保持一致：支撑画铰，半刚接梁画弹簧；端点跟随变形后位置，
     避免 dScale 放大时符号悬空、与变形后梁脱离 */
  for(const el of model.els){
    const isBrace = (el.kind === 'brace');
    const a = model.nodes[el.i], b = model.nodes[el.j];
    const uax = model.U[el.i*3], uay = model.U[el.i*3+1];
    const ubx = model.U[el.j*3], uby = model.U[el.j*3+1];
    const [ax, ay] = toS(a.x + F*uax, a.y + F*uay);
    const [bx, by] = toS(b.x + F*ubx, b.y + F*uby);
    if(isBrace){
      drawBeamEndConn(ctx, ax, ay, bx, by, 'hinge', T);
      drawBeamEndConn(ctx, bx, by, ax, ay, 'hinge', T);
      continue;
    }
    if(el.kind === 'beam' && !el.isCant && model.p.betaJ < BETA_FIXED){
      /* 集中力打断点（isSub 节点）是梁内部节点，不是梁端，跳过该端符号 */
      const sym = (model.p.betaJ <= BETA_HINGE) ? 'hinge' : 'spring';
      if(!a.isSub) drawBeamEndConn(ctx, ax, ay, bx, by, sym, T);
      if(!b.isSub) drawBeamEndConn(ctx, bx, by, ax, ay, sym, T);
    }
  }

  if(model.p.showIds) drawIds(ctx, model, toS);
  drawSupports(ctx, model, toS, model.p.betaF, true, F);
}