"use strict";

/* =====================================================================
   1. 状态
   ===================================================================== */
const E_CONC = 3.0e7;

// 全局版本号：以后升级版本只需修改这里，全站自动联动
const APP_VERSION = 'v0.1.3';

// ⚠️ 重要：线上部署地址。本地 file:// 打开时，分享二维码指向这里。
// 如果你更换了 GitHub 仓库名或部署到自定义域名，请务必同步修改此处的 URL，否则本地生成的分享二维码会失效。
const PROD_URL = 'https://z1118pm-blip.github.io/structural-tool/';

/* 转动约束的统一判定阈值：
   >= BETA_FIXED 视为固定/刚接，<= BETA_HINGE 视为铰接，中间为弹性/半刚接。
   原先 colKeff、支座绘制、analyze 三处各写各的阈值（0.999/0.001、0.99/0.01），
   同一 β 值在不同面板可能落到不同档位，这里统一。 */
const BETA_FIXED = 0.99;
const BETA_HINGE = 0.01;

const S = {
  /* 拓扑 */
  nBay:2, nLev:2, hasCant:true,
  /* 几何（L3/h3 预置，第 2 步启用） */
  L1:6, L2:6, L3:6,
  h1:4, h2:4, h3:4,
  Lc:1.5,
  /* 截面 */
  bc:400, hc:400, bb:250, hb:500,
  /* 荷载（q3/qc3/H3 预置，第 2 步启用） */
  q1:0, q2:0, q3:0,
  qc1:0, qc2:0, qc3:0,
  H1:0, H2:0, H3:0,
  Hmode:'left',
  forceType:'M',
  r:1.0,
  betaF:1.0,
  betaJ:1.0,
  mScale:1.0,
  dScale:30,
  elFilter:'all',
  showVals:false,
  showIds:false,
  showPDelta:false,
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