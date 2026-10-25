"use strict";

/* =====================================================================
   ParametricGenerator：p → Model
   ---------------------------------------------------------------------
   这是 02-solver.js 中 analyze() 前 8 步（坐标、节点、单元、荷载、
   支座、约束）的等价抽取。solve(Model) 下一轮实现后，
   analyze(p) 将改为 solve(parametricGenerator(p))。

   本轮目标：parametricGenerator 输出的 Model 与现有 analyze(p)
   内部生成的 nodes/els 结构一一对应，供人工对比验证。
   ===================================================================== */

/* 常量 E_STEEL / E_CONC / BETA_HINGE / BETA_FIXED 由 01-state.js 全局提供 */

/* 若通过 <script> 加载 02-model.js，以下 require 分支在 Node.js 生效 */
const _M = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./02-model.js")
  : { createModel, addNode, addElement, validateModel, resetIdCounter };

function parametricGenerator(p) {
  const { createModel, addNode, addElement, validateModel, resetIdCounter } = _M;
  resetIdCounter();
  const model = createModel();
  model.meta.p = p;

  /* ---- 参数解析与范围检查 ---- */
  const nBay = Number(p.nBay) | 0;
  const nLev = Number(p.nLev) | 0;
  const nCol = nBay + 1;

  if (nBay < 1 || nBay > 4)  throw new Error(`跨数 ${nBay} 超出 [1, 4]`);
  if (nLev < 1 || nLev > 10) throw new Error(`层数 ${nLev} 超出 [1, 10]`);

  /* ---- 坐标累加（数字校验在 Number，坐标写入 addNode 会再次校验） ---- */
  const X = [0];
  for (let i = 0; i < nBay; i++) X.push(X[i] + Number(p["L" + (i + 1)]));
  const Y = [0];
  for (let i = 0; i < nLev; i++) Y.push(Y[i] + Number(p["h" + (i + 1)]));

  /* ---- 节点：主结构 ---- */
  const nodeGrid = [];
  for (let c = 0; c < nCol; c++) {
    nodeGrid.push([]);
    for (let lv = 0; lv <= nLev; lv++) {
      nodeGrid[c].push(addNode(model, X[c], Y[lv]));
    }
  }

  /* ---- 节点：右侧悬挑 ---- */
  let cantNodes = null;
  if (p.hasCant) {
    const Lc = Number(p.Lc);
    if (!(Lc > 1e-9)) throw new Error("悬挑长度必须为正");
    cantNodes = [];
    for (let lv = 1; lv <= nLev; lv++) {
      cantNodes.push(addNode(model, X[nBay] + Lc, Y[lv], "cant"));
    }
  }

  /* ---- 截面特性 ---- */
  const E_frame = (p.frameMat === "steel") ? E_STEEL : E_CONC;
  const E_brace = (p.braceMat === "steel") ? E_STEEL : E_CONC;

  const bcM = Number(p.bc) / 1000, hcM = Number(p.hc) / 1000;
  const bbM = Number(p.bb) / 1000, hbM = Number(p.hb) / 1000;
  if (![bcM, hcM, bbM, hbM].every(v => Number.isFinite(v) && v > 0)) {
    throw new Error("截面尺寸必须为正");
  }

  const Ic = bcM * Math.pow(hcM, 3) / 12;
  const Ib = bbM * Math.pow(hbM, 3) / 12;
  const Ac = bcM * hcM;
  const Ab = bbM * hbM;

  const axialBoost = (p.axialMode === "rigid") ? 1e6 : 1;

  const AsParsed = parseFloat(p.As);
  const AsVal = (Number.isFinite(AsParsed) && AsParsed > 0) ? AsParsed : 2000;

  const isMidCol = (c) => (c > 0 && c < nBay);

  /* ---- 柱 ---- */
  for (let c = 0; c < nCol; c++) {
    const kc = isMidCol(c) ? (Number(p.r) || 1.0) : 1.0;
    for (let lv = 0; lv < nLev; lv++) {
      const i = nodeGrid[c][lv], j = nodeGrid[c][lv + 1];
      const dx = j.x - i.x, dy = j.y - i.y;
      const L = Math.hypot(dx, dy);
      addElement(model, {
        type: "col",
        i: i.id, j: j.id,
        L, cs: dx / L, sn: dy / L,
        section: { E: E_frame, A: Ac * kc, I: Ic * kc, axialBoost },
        releaseI: { type: "fixed", k: 0 },
        releaseJ: { type: "fixed", k: 0 },
        loads: [],
        _meta: { kind: "col", lev: lv + 1, col: c },
      });
    }
  }

  /* ---- 半刚接参数（与原 analyze 一致） ---- */
  const betaJ = Number(p.betaJ);
  let alphaJ = 0;
  let beamHinge = false;
  if (betaJ < BETA_FIXED) {
    if (betaJ <= BETA_HINGE) {
      beamHinge = true;
      alphaJ = Infinity;
    } else {
      alphaJ = (1 - betaJ) / (4 * betaJ);
    }
  }

  const mkRelease = (alpha, hinge) => {
    if (hinge) return { type: "free", k: Infinity };
    if (!Number.isFinite(alpha)) return { type: "free", k: Infinity };
    if (alpha === 0) return { type: "fixed", k: 0 };
    return { type: "spring", k: alpha };
  };

  /* ---- 梁：逐跨荷载覆盖 + 集中力打断 ---- */
  const qSpanMap = (p.qSpanMap && typeof p.qSpanMap === "object") ? p.qSpanMap : {};
  const pLoadMap = (p.pLoadMap && typeof p.pLoadMap === "object") ? p.pLoadMap : {};
  const movingLoad = p.movingLoad || {};

  for (let lv = 1; lv <= nLev; lv++) {
    const qDefault = Number(p["q" + lv]) || 0;
    const pDefault = Number(p["P" + lv]) || 0;

    for (let c = 0; c < nBay; c++) {
      const spanKey = lv + "-" + (c + 1);

      const q = Object.prototype.hasOwnProperty.call(qSpanMap, spanKey)
        ? (parseFloat(qSpanMap[spanKey]) || 0)
        : qDefault;

      const i = nodeGrid[c][lv];
      const j = nodeGrid[c + 1][lv];
      const dx = j.x - i.x, dy = j.y - i.y;
      const L = Math.hypot(dx, dy);

      /* 解析集中力（movingLoad 优先级最高） */
      let P = pDefault;
      let a = L / 2;
      const isMovingTarget = movingLoad.enabled
        && Number(movingLoad.lev) === lv
        && Number(movingLoad.bay) === c + 1;

      if (isMovingTarget) {
        P = parseFloat(movingLoad.P) || 0;
        const t = (movingLoad.t != null) ? Number(movingLoad.t) : 0.5;
        a = Math.max(0.001, Math.min(L - 0.001, t * L));
      } else if (pLoadMap[spanKey]) {
        if (pLoadMap[spanKey].P != null) P = parseFloat(pLoadMap[spanKey].P) || 0;
        if (pLoadMap[spanKey].a != null) a = parseFloat(pLoadMap[spanKey].a);
      }

      if (Math.abs(P) > 1e-12) {
        if (!isFinite(a)) a = L / 2;
        const aEps = Math.min(0.001, L * 0.001);
        a = Math.max(aEps, Math.min(L - aEps, a));

        /* 打断：中间节点 + 两个子单元 + 中间节点集中力 */
        const midNode = addNode(model,
          i.x + dx * a / L,
          i.y + dy * a / L,
          "sub");

        const alphaLeft  = Number.isFinite(alphaJ) ? alphaJ * L / a       : alphaJ;
        const alphaRight = Number.isFinite(alphaJ) ? alphaJ * L / (L - a) : alphaJ;

        addElement(model, {
          type: "beam",
          i: i.id, j: midNode.id,
          L: a, cs: dx / L, sn: dy / L,
          section: { E: E_frame, A: Ab, I: Ib, axialBoost },
          releaseI: mkRelease(alphaLeft,  beamHinge),
          releaseJ: { type: "fixed", k: 0 },   /* 内部节点：强制刚接 */
          loads: [
            { type: "udl", w: -q },
            /* 温度荷载由下方统一追加，此处留空 */
          ],
          _meta: { kind: "beam", lev: lv, bay: c + 1,
                   startOffset: 0, spanL: L },
        });

        addElement(model, {
          type: "beam",
          i: midNode.id, j: j.id,
          L: L - a, cs: dx / L, sn: dy / L,
          section: { E: E_frame, A: Ab, I: Ib, axialBoost },
          releaseI: { type: "fixed", k: 0 },   /* 内部节点：强制刚接 */
          releaseJ: mkRelease(alphaRight, beamHinge),
          loads: [{ type: "udl", w: -q }],
          _meta: { kind: "beam", lev: lv, bay: c + 1,
                   startOffset: a, spanL: L },
        });

        /* 集中力施加在中间节点 */
        model.nodeLoads.push({ node: midNode.id, Fx: 0, Fy: -P, Mz: 0 });
      } else {
        addElement(model, {
          type: "beam",
          i: i.id, j: j.id,
          L, cs: dx / L, sn: dy / L,
          section: { E: E_frame, A: Ab, I: Ib, axialBoost },
          releaseI: mkRelease(alphaJ, beamHinge),
          releaseJ: mkRelease(alphaJ, beamHinge),
          loads: [{ type: "udl", w: -q }],
          _meta: { kind: "beam", lev: lv, bay: c + 1 },
        });
      }
    }
  }

  /* ---- 斜撑 ---- */
  if (p.braceMap) {
    const tensionMap = (p.braceTensionMap && typeof p.braceTensionMap === "object")
      ? p.braceTensionMap : {};

    for (let lv = 1; lv <= nLev; lv++) {
      for (let c = 0; c < nBay; c++) {
        const gridKey = lv + "-" + (c + 1);
        const type = p.braceMap[gridKey];
        if (!type || type === "none") continue;
        const tensionOnly = !!tensionMap[gridKey];

        const lb = nodeGrid[c][lv - 1];
        const rb = nodeGrid[c + 1][lv - 1];
        const lt = nodeGrid[c][lv];
        const rt = nodeGrid[c + 1][lv];

        const addBrace = (i, j, dir) => {
          const dx = j.x - i.x, dy = j.y - i.y;
          const L = Math.hypot(dx, dy);
          addElement(model, {
            type: "brace",
            i: i.id, j: j.id,
            L, cs: dx / L, sn: dy / L,
            section: { E: E_brace, A: AsVal / 1e6, I: 0, axialBoost: 1 },
            releaseI: { type: "free", k: Infinity },
            releaseJ: { type: "free", k: Infinity },
            loads: [],
            _meta: { kind: "brace", lev: lv, bay: c + 1,
                     braceUid: gridKey + "-" + dir, tensionOnly },
          });
        };

        if (type === "X")      { addBrace(lb, rt, "d1"); addBrace(rb, lt, "d2"); }
        else if (type === "/") { addBrace(lb, rt, "d1"); }
        else if (type === "\\"){ addBrace(rb, lt, "d2"); }
      }
    }
  }

  /* ---- 悬挑梁 ---- */
  if (p.hasCant && cantNodes) {
    for (let lv = 1; lv <= nLev; lv++) {
      const q = Number(p["qc" + lv]) || 0;
      const i = nodeGrid[nBay][lv];
      const j = cantNodes[lv - 1];
      const dx = j.x - i.x, dy = j.y - i.y;
      const L = Math.hypot(dx, dy);
      addElement(model, {
        type: "beam",
        i: i.id, j: j.id,
        L, cs: dx / L, sn: dy / L,
        section: { E: E_frame, A: Ab, I: Ib, axialBoost },
        releaseI: { type: "fixed", k: 0 },
        releaseJ: { type: "fixed", k: 0 },
        loads: [{ type: "udl", w: -q }],
        _meta: { kind: "beam", isCant: true, lev: lv },
      });
    }
  }

  /* ---- 温度梯度：按单元记录 gradFactor + endI/endJ（真端标记） ---- */
  if (Math.abs(Number(p.tempGrad) || 0) > 1e-9) {
    const alphaT = 1.0e-5;
    for (const el of model.elements) {
      const meta = el._meta;
      if (!meta || meta.kind === "brace" || meta.isCant || el.type === "brace") continue;

      let gf = 0;
      if (meta.kind === "col") {
        if (meta.col === 0) gf = 1.0;
        else if (meta.col === nBay) gf = -1.0;
      } else if (meta.kind === "beam" && meta.lev === nLev) {
        gf = 1.0;
      }
      if (gf === 0) continue;

      const h = (meta.kind === "col")
        ? (Number(p.hc) / 1000)
        : (Number(p.hb) / 1000);

      /* 判断是否真端：打断梁只有柱侧端是真端 */
      let endI = true, endJ = true;
      if (meta.startOffset != null && meta.spanL != null) {
        endI = (meta.startOffset === 0);
        endJ = Math.abs(meta.startOffset + el.L - meta.spanL) < 1e-9;
      }

      el.loads.push({
        type: "temp",
        grad: Number(p.tempGrad),
        h, alphaT, gradFactor: gf,
        endI, endJ,
      });
    }
  }

  /* ---- 均匀温度 ---- */
  if (Math.abs(Number(p.tempAll) || 0) > 1e-9) {
    for (const el of model.elements) {
      const meta = el._meta;
      if (!meta || meta.kind === "brace" || el.type === "brace") continue;
      el.loads.push({ type: "temp_uniform", dT: Number(p.tempAll) });
    }
  }

  /* ---- 支座 ---- */
  const supportMapSolver = (p.supportMap && typeof p.supportMap === "object") ? p.supportMap : {};
  const betaF = Number(p.betaF);

  const getSupportType = (c) => {
    const entry = supportMapSolver[String(c)];
    if (entry && entry.type) {
      if (["fixed", "pin", "roller", "spring"].includes(entry.type)) return entry.type;
    }
    if (betaF >= BETA_FIXED) return "fixed";
    if (betaF <= BETA_HINGE) return "pin";
    return "spring";
  };

  const hFloor1 = Y[1] - Y[0];

  for (let c = 0; c < nCol; c++) {
    const n = nodeGrid[c][0];
    const supType = getSupportType(c);
    const entry = supportMapSolver[String(c)] || {};

    const sup = { node: n.id, ux: "free", uy: "free", rz: "free" };

    if (supType === "roller") {
      sup.uy = "fixed";
    } else {
      sup.ux = "fixed";
      sup.uy = "fixed";

      if (supType === "fixed") {
        sup.rz = "fixed";
      } else if (supType === "spring") {
        const entryBeta = (entry.betaF != null) ? Number(entry.betaF) : betaF;
        if (!(entryBeta > BETA_HINGE && entryBeta < BETA_FIXED)) {
          throw new Error(
            `柱 ${c} 设为弹簧支座，但 betaF=${entryBeta} 不在开区间 ` +
            `(${BETA_HINGE}, ${BETA_FIXED})，无法确定弹簧刚度`
          );
        }
        const kc = isMidCol(c) ? (Number(p.r) || 1.0) : 1.0;
        const EIcol = E_frame * Ic * kc;
        const Rf = (4 * EIcol / hFloor1) * entryBeta / (1 - entryBeta);
        sup.rz = "spring";
        sup.kRz = Rf;
      }
      /* pin：rz 保持 free */
    }

    /* 强迫位移 */
    if (entry.dy != null && Math.abs(Number(entry.dy)) > 1e-6) {
      sup.prescribed = sup.prescribed || {};
      sup.prescribed.uy = -Number(entry.dy) * 1e-3;
    }
    if (entry.rot != null && Math.abs(Number(entry.rot)) > 1e-9) {
      sup.prescribed = sup.prescribed || {};
      sup.prescribed.rz = Number(entry.rot);
    }

    model.supports.push(sup);
  }

  /* ---- 旧 settleDy 兼容 ---- */
  const settleDyVal = parseFloat(p.settleDy) || 0;
  if (Math.abs(settleDyVal) > 1e-6) {
    const sc = Math.max(0, Math.min(nCol - 1, Number(p.settleCol) | 0));
    const entry = supportMapSolver[String(sc)];
    const alreadyHasDy = entry && entry.dy != null;
    if (!alreadyHasDy) {
      const sup = model.supports.find(s => s.node === nodeGrid[sc][0].id);
      if (sup) {
        sup.prescribed = sup.prescribed || {};
        sup.prescribed.uy = -settleDyVal * 1e-3;
      }
    }
  }

  /* ---- 水平力 ---- */
  for (let lv = 1; lv <= nLev; lv++) {
    const H = Number(p["H" + lv]) || 0;
    if (Math.abs(H) <= 1e-12) continue;
    const topNode = nodeGrid[0][lv];
    model.nodeLoads.push({ node: topNode.id, Fx: H, Fy: 0, Mz: 0 });
  }

  /* ---- 刚性楼板：diaphragm 约束 ---- */
  if (p.Hmode === "rigid") {
    for (let lv = 1; lv <= nLev; lv++) {
      const nodesInLevel = [];
      for (let c = 0; c <= nBay; c++) nodesInLevel.push(nodeGrid[c][lv].id);
      model.constraints.push({
        type: "diaphragm",
        nodes: nodesInLevel,
        dof: "ux",
        master: nodeGrid[0][lv].id,
      });
    }
  }

  validateModel(model);
  return model;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parametricGenerator };
}