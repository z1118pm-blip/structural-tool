"use strict";

/* =====================================================================
   9. 变形图
   ===================================================================== */
function drawDeform(canvas, model, dprOverride){
  const T = theme();
  const {ctx,W,H} = setupCanvas(canvas, dprOverride);
  // 全屏变形图顶部浮层已变薄，恢复正常的 140 留白，避免图形悬空过低
  const pad = {padL: 70, padT: 90, padR: 70, padB: 20};
  const {toS} = makeTransform(model, W, H, pad);

  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx, W, H);
  drawHUD(ctx, W, H, 'DEFORMED SHAPE', false);
  
  /* 读 model.isDeformFail（由 updateReadout 在 drawDeform 之前设置） */
  if(model.isDeformFail) {
    ctx.save();
    const txt = '⚠️ 受弯挠度超出规范限值 (SLS)';
    ctx.font = 'bold 14px "JetBrains Mono", sans-serif';
    const tw = ctx.measureText(txt).width;
    const bh = 34;
    const bw = tw + 40;
    const bx = W/2 - bw/2;
    const by = H - 65; /* 稍微抬高，避免和底部状态栏贴太近 */
    
    ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 8); else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = '#f87171';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, W/2, by + bh/2);
    ctx.restore();
  }

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
  drawFrameLines(ctx, model, toS, T.frame, 1.5, true, false);

    // 绘制冻结基准的变形图（虚线）
  if(BASE){
    ctx.save();
    
    // 新增：先把旧框架的杆件用浅灰色虚线画出来（便于对比被抽掉的梁）
    ctx.strokeStyle = T.frameGhost;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    for(const el of BASE.els){
      const a = BASE.nodes[el.i], b = BASE.nodes[el.j];
      if(!a || !b) continue;
      const [ax,ay] = toS(a.x, a.y);
      const [bx,by] = toS(b.x, b.y);
      ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
    }

    // 然后正常画旧框架的变形曲线
    ctx.strokeStyle = T.freezeLine;
    ctx.lineWidth = 2.0; // 加粗到 2.0
    ctx.setLineDash([6,3]); // 虚线更紧凑，避免在长柱子上显得稀碎
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
      // 如果变形极小（空载），把蓝线画细一点，避免盖住灰色骨架
      const hasDef = Math.abs(model.U[el.i*3]) > 1e-6 || Math.abs(model.U[el.i*3+1]) > 1e-6 || 
                     Math.abs(model.U[el.j*3]) > 1e-6 || Math.abs(model.U[el.j*3+1]) > 1e-6;
      ctx.lineWidth = hasDef ? elemLineWidth(el, model) * 0.6 : 1.5;
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
  drawSupports(ctx, model, toS, model.p.betaF, true, F, W, H);

  /* 绘制虚线/实线对比图例（仅当处于冻结对比模式时显示） */
  if(BASE){
    ctx.save();
    ctx.font = '11px ui-sans-serif,system-ui,sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const ly = H - 24;
    
    const curTxt = (S.uiLegend && S.uiLegend.current) ? S.uiLegend.current : '当前工况';
    const baseTxt = (S.uiLegend && S.uiLegend.base) ? S.uiLegend.base : '冻结基线';

    // 1. 当前实线图例
    ctx.strokeStyle = T.deformCurve;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(20, ly); ctx.lineTo(36, ly); ctx.stroke();
    ctx.fillStyle = T.frameThin;
    ctx.fillText(curTxt, 44, ly);
    
    // 根据第一段文字宽度，动态计算第二段图例的起始位置
    const curWidth = ctx.measureText(curTxt).width;
    const nextX = 44 + curWidth + 24;

    // 2. 冻结基线虚线图例
    ctx.strokeStyle = T.freezeLine;
    ctx.lineWidth = 2.0;
    ctx.setLineDash([6, 3]);
    ctx.beginPath(); ctx.moveTo(nextX, ly); ctx.lineTo(nextX + 16, ly); ctx.stroke();
    ctx.fillStyle = T.frameThin;
    ctx.fillText(baseTxt, nextX + 24, ly);
    
    ctx.restore();
  }
}