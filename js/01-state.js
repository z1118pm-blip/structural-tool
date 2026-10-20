"use strict";

/* =====================================================================
   1. 状态
   ===================================================================== */
const E_CONC = 3.0e7;
const E_STEEL = 2.06e8;

// 全局版本号：以后升级版本只需修改这里，全站自动联动
const APP_VERSION = 'v0.1.6.4';

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
  axialMode:'real',
  frameMat:'conc',
  braceMat:'steel',
  As:2000,
  braceI:30,           /* 支撑回转半径 i (mm)，长细比 λ = μL/i 由杆长实时计算 */
  braceTensionMap:{},
  braceMap:{},
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