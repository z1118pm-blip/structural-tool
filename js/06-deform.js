"use strict";

/* =====================================================================
   9. 变形图
   ===================================================================== */
function drawDeform(canvas, model, dprOverride){
  const T = theme();
  const {ctx,W,H} = setupCanvas(canvas, dprOverride);
  const pad = (model.p.displayMode === 'deform')
    ? {padL: 56, padT: 100, padR: 80, padB: 42}
    : {padL: 170, padT: 100, padR: 60, padB: 36};
  const {toS, sc} = makeTransform(model, W, H, pad);

  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx, W, H);
  drawHUD(ctx, W, H, 'DEFORMED SHAPE');

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
  ctx.strokeStyle = T.deformCurve;
  ctx.lineJoin = 'round'; ctx.lineCap  = 'round';
  for(let e=0;e<curves.length;e++){
    const pts = curves[e];
    const el  = model.results[e].el;
    ctx.lineWidth = elemLineWidth(el, model) * 0.6;
    ctx.beginPath();
    for(let k=0;k<pts.length;k++){
      const p = pts[k];
      const [sx,sy] = toS(p.bx + F*p.dx, p.by + F*p.dy);
      if(k===0) ctx.moveTo(sx,sy); else ctx.lineTo(sx,sy);
    }
    ctx.stroke();
  }

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
      ctx.strokeStyle = 'rgba(56,189,248,0.62)';
      ctx.fillStyle   = 'rgba(56,189,248,0.62)';
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
    ctx.beginPath(); ctx.arc(sx,sy,2.8,0,Math.PI*2); ctx.fill();
  }
  if(model.p.showIds) drawIds(ctx, model, toS);
  drawSupports(ctx, model, toS, model.p.betaF);
}