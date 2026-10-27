"use strict";

/* =====================================================================
   Model：任意拓扑建模的唯一数据源
   ---------------------------------------------------------------------
   - nodes:       [{ id, x, y, tag? }]               稳定 id，不随删除重编号
   - elements:    [{ id, type, i, j, L, cs, sn,
                     section:{E,A,I,axialBoost},
                     releaseI:{type,k}, releaseJ:{type,k},
                     loads:[...], _meta:{...} }]
   - nodeLoads:   [{ node, Fx, Fy, Mz }]
   - supports:    [{ node, ux, uy, rz,
                     kRz?, prescribed? }]
   - constraints: [{ type:'diaphragm', nodes:[], dof:'ux', master }]
   - meta:        { p }   仅供后处理显示，solve 不应依赖
   ---------------------------------------------------------------------
   release.type: 'fixed' | 'free' | 'spring'
   release.k   : 柔度 alpha（0=刚接，Infinity=铰接，中间=半刚接）
   loads.type  : 'udl' | 'point' | 'temp' | 'temp_uniform'
   ===================================================================== */

let _modelIdCounter = 0;
function resetIdCounter() { _modelIdCounter = 0; }
function newId() { return _modelIdCounter++; }

function createModel() {
  return {
    nodes: [],
    elements: [],
    /* 预留：节点集中力当前由 node.pLoad 携带，水平力由 p.H* 携带；
       nodeLoads 目前未被 solve 消费，仅为 Model 结构完整性保留。 */
    nodeLoads: [],
    supports: [],
    constraints: [],
    meta: {},
  };
}

function addNode(model, x, y, tag) {
  const n = { id: newId(), x: Number(x), y: Number(y) };
  if (tag) n.tag = tag;
  if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) {
    throw new Error(`节点坐标非法: (${x}, ${y})`);
  }
  model.nodes.push(n);
  return n;
}

function addElement(model, el) {
  const e = Object.assign({ id: newId() }, el);
  model.elements.push(e);
  return e;
}

function validateModel(model) {
  const nodeIds = new Set();
  for (const n of model.nodes) {
    if (nodeIds.has(n.id)) throw new Error(`Model 校验失败：节点 id ${n.id} 重复`);
    nodeIds.add(n.id);
  }

  const elIds = new Set();
  for (const el of model.elements) {
    if (elIds.has(el.id)) throw new Error(`Model 校验失败：单元 id ${el.id} 重复`);
    elIds.add(el.id);
    if (!nodeIds.has(el.i)) throw new Error(`单元 ${el.id} 的 i 节点 ${el.i} 不存在`);
    if (!nodeIds.has(el.j)) throw new Error(`单元 ${el.id} 的 j 节点 ${el.j} 不存在`);
    if (!(el.L > 0))        throw new Error(`单元 ${el.id} 长度非正`);
    if (!Number.isFinite(el.cs) || !Number.isFinite(el.sn)) {
      throw new Error(`单元 ${el.id} 方向余弦非法`);
    }
    if (!el.section) throw new Error(`单元 ${el.id} 缺少 section`);
    const s = el.section;
    if (![s.E, s.A, s.I, s.axialBoost].every(v => Number.isFinite(v))) {
      throw new Error(`单元 ${el.id} section 含非有限值`);
    }
  }

  for (const nl of model.nodeLoads) {
    if (!nodeIds.has(nl.node)) throw new Error(`节点荷载指向不存在的节点 ${nl.node}`);
    for (const k of ['Fx', 'Fy', 'Mz']) {
      if (!Number.isFinite(nl[k] || 0)) throw new Error(`节点 ${nl.node} 荷载 ${k} 非有限`);
    }
  }

  for (const s of model.supports) {
    if (!nodeIds.has(s.node)) throw new Error(`支座指向不存在的节点 ${s.node}`);
  }

  for (const c of model.constraints) {
    if (c.type === 'diaphragm') {
      for (const nid of c.nodes) {
        if (!nodeIds.has(nid)) throw new Error(`diaphragm 指向不存在的节点 ${nid}`);
      }
      if (!nodeIds.has(c.master)) throw new Error(`diaphragm 主节点 ${c.master} 不存在`);
    }
  }

  return true;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createModel, addNode, addElement, validateModel, resetIdCounter, newId };
}