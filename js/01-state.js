"use strict";

/* =====================================================================
   1. 状态
   ===================================================================== */
const E_CONC = 3.0e7;
const E_STEEL = 2.06e8;

/* 常用型钢截面库 (国标 GB/T 11263) 
   单位统一转为: A (m^2), I (m^4), h (m), b (m) */
const HW_DB = {
  'HW200x200': { A: 63.53e-4, Ix: 4720e-8,  Iy: 1600e-8,  h: 0.200, b: 0.200 },
  'HW250x250': { A: 92.18e-4, Ix: 10800e-8, Iy: 3650e-8,  h: 0.250, b: 0.250 },
  'HW300x300': { A: 119.8e-4, Ix: 20500e-8, Iy: 6760e-8,  h: 0.300, b: 0.300 },
  'HW350x350': { A: 173.9e-4, Ix: 40300e-8, Iy: 13600e-8, h: 0.350, b: 0.350 },
  'HW400x400': { A: 218.7e-4, Ix: 66600e-8, Iy: 22400e-8, h: 0.400, b: 0.400 }
};

const HN_DB = {
  'HN200x100': { A: 26.67e-4, Ix: 1810e-8,  h: 0.200, b: 0.100 },
  'HN250x125': { A: 36.97e-4, Ix: 3540e-8,  h: 0.250, b: 0.125 },
  'HN300x150': { A: 46.78e-4, Ix: 7210e-8,  h: 0.300, b: 0.150 },
  'HN350x175': { A: 63.14e-4, Ix: 13600e-8, h: 0.350, b: 0.175 },
  'HN400x200': { A: 83.37e-4, Ix: 22700e-8, h: 0.400, b: 0.200 },
  'HN450x200': { A: 95.43e-4, Ix: 32800e-8, h: 0.450, b: 0.200 },
  'HN500x200': { A: 107.3e-4, Ix: 45500e-8, h: 0.500, b: 0.200 },
  'HN600x200': { A: 131.7e-4, Ix: 77600e-8, h: 0.600, b: 0.200 },
  'HN700x300': { A: 231.5e-4, Ix: 201000e-8,h: 0.700, b: 0.300 }
};

/* 统一获取当前截面特性的工具函数 */
function getSecProps(p) {
  let res = { Ac:0, Ic:0, Ab:0, Ib:0, bcM:0, hcM:0, bbM:0, hbM:0 };
  
  // 柱
  if (p.colSecType === 'HW') {
    const hw = HW_DB[p.colHW] || HW_DB['HW300x300'];
    res.Ac = hw.A;
    res.Ic = (p.colAxis === 'weak') ? hw.Iy : hw.Ix;
    res.bcM = hw.b;
    res.hcM = hw.h;
  } else {
    const bcM = Math.max(300, Number(p.bc)) / 1000;
    const hcM = Math.max(300, Number(p.hc)) / 1000;
    res.bcM = bcM; res.hcM = hcM;
    res.Ic = bcM * Math.pow(hcM, 3) / 12;
    res.Ac = bcM * hcM;
  }

  // 梁
  if (p.beamSecType === 'HN') {
    const hn = HN_DB[p.beamHN] || HN_DB['HN400x200'];
    res.Ab = hn.A;
    res.Ib = hn.Ix;
    res.bbM = hn.b;
    res.hbM = hn.h;
  } else {
    const bbM = Math.max(200, Number(p.bb)) / 1000;
    const hbM = Math.max(400, Number(p.hb)) / 1000;
    res.bbM = bbM; res.hbM = hbM;
    res.Ib = bbM * Math.pow(hbM, 3) / 12;
    res.Ab = bbM * hbM;
  }

  return res;
}

// 全局版本号：优先读取 index.html 头部注入的 window.APP_VERSION
const APP_VERSION = window.APP_VERSION || 'v0.1.9.5';

// ⚠️ 重要：线上部署地址。本地 file:// 打开时，分享二维码指向这里。
// 如果你更换了 GitHub 仓库名或部署到自定义域名，请务必同步修改此处的 URL，否则本地生成的分享二维码会失效。
// 上线前请确认下方地址与你的实际部署路径一致！
const PROD_URL = 'https://z1118pm-blip.github.io/structural-tool/'; // 请按实际情况修改

/* 转动约束的统一判定阈值：
   >= BETA_FIXED 视为固定/刚接，<= BETA_HINGE 视为铰接，中间为弹性/半刚接。
   原先 colKeff、支座绘制、analyze 三处各写各的阈值（0.999/0.001、0.99/0.01），
   同一 β 值在不同面板可能落到不同档位，这里统一。 */
const BETA_FIXED = 0.99;
const BETA_HINGE = 0.01;

const S = {
  /* 拓扑：默认 1 层 1 跨无悬挑，界面最简，便于新用户先看清单跨框架。
     自检卡与分享链接会显式覆盖，不受此默认值影响。 */
  nBay:1, nLev:1, hasCant:false,
  /* 几何（L3/h3 预置，第 2 步启用） */
  L1:6, L2:6, L3:6,
  h1:4, h2:4, h3:4,
  Lc:1.5,
  /* 截面 */
  colSecType: 'rect', colHW: 'HW300x300', colAxis: 'strong',
  beamSecType: 'rect', beamHN: 'HN400x200',
  bc:400, hc:400, bb:250, hb:500,
  /* 荷载（q3/qc3/H3 预置，第 2 步启用） */
  q1:0, q2:0, q3:0,
  /* 默认跨中集中力（kN）。作用于该层所有跨的跨中，可被 pLoadMap 覆盖 */
  P1:0, P2:0, P3:0,
  /* 逐跨集中力覆盖：键 "层-跨"，值 { P: 0, a: 3 }（a为距左端距离，单位m） */
  pLoadMap:{},
  qc1:0, qc2:0, qc3:0,
  /* 逐跨竖向荷载覆盖：键 "层-跨"（如 "1-2"），值 = 该跨荷载 kN/m。
     空对象时行为与 v0.1.6 完全等价（回退到 q1/q2/q3 标量）。
     不属于 UI 控件，由 07-run.js 的逐跨滑块写入。 */
  qSpanMap:{},
  H1:0, H2:0, H3:0,
  Hmode:'none',
  /* 温度荷载：tempAll 为全结构均匀升温，tempGrad 为截面单侧温差，tempT0 为合拢/安装温度 */
  tempAll:0, tempGrad:0, tempT0:20,
  settleDy:0, settleCol:0,
  /* 每柱独立支座定义：{ '0': { type:'fixed'|'pin'|'roller'|'spring', dy:0, rot:0 }, ... }
     - type 为 'spring' 或缺失时回退到 betaF 全局判定；
     - dy 单位 mm，正=沉降向下，负=上抬向上（抗浮）；
     - rot 单位 rad，正=逆时针，用于模拟基础转动造成的柱底强迫转角。 */
  supportMap:{},
  /* 移动荷载：单跨竖向集中力、单跨内从左到右循环 */
  movingLoad:{ enabled:false, lev:1, bay:1, P:0, t:0.5, playing:false, speed:1, rafId:null, t0:0 },
  axialMode:'real',
  frameMat:'conc',
  braceMat:'steel',
  As:2000,
  braceI:30,           /* 支撑回转半径 i (mm)，长细比 λ = μL/i 由杆长实时计算 */
  braceTensionMap:{},
  braceMap:{},
  removeBeamMap:{},     /* 逐跨移除梁：键 "层-跨"，值为 true 表示该梁被移除（用于模拟穿层柱） */
  brushBrace:'none',
  forceType:'M',
  probe: { elIndex: null, xRatio: 0.5 }, /* 截面探针：锁定单元索引与沿杆件比例位置 */
  r:1.0,
  betaF:1.0,
  betaJ:1.0,
  mScale:1.0,
  dScale:30,
  elFilter:'all',
  showVals:false,
  showIds:false,
  showAntiPts:true,
  showPDelta:true,
  displayMode:'all',
  highlight:null,
  lightBg:false,
  uiLegend: { base: '冻结基线', current: '当前工况' }, // 用于变形图对比时的图例文字
  sweep:{
    active:false,
    param:'bc',
    playing:false,
    loop:true,
    rafId:null,
    t0:0,
    startVal:0,
    span:0,
    durMul:1
  },
  rec:{
    active:false,
    cancel:false,
    chunks:[],
    recorder:null,
    mime:'',
    scope:'force'
  }
};