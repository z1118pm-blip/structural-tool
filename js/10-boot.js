"use strict";

let rafId = null;
function scheduleRender(){
  if(rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(()=>{ rafId=null; run(); });
}
window.addEventListener('resize', scheduleRender);

if(window.ResizeObserver){
  const ro = new ResizeObserver(scheduleRender);
  ro.observe(document.getElementById('stage'));
  ro.observe(document.getElementById('leftCol'));
  for(const id of ['chartForce','chartDeform','chartLoad','readout']){
    const el = document.getElementById(id);
    if(el) ro.observe(el);
  }
}

applyTopoState();

// 自动注入全局版本号
if (typeof APP_VERSION !== 'undefined') {
  const elBrand = document.getElementById('ui-ver-brand');
  const elStatus = document.getElementById('ui-ver-status');
  if (elBrand) elBrand.textContent = APP_VERSION;
  if (elStatus) elStatus.textContent = APP_VERSION;
}

(function boot(){
  const m = location.hash.match(/^#st=(.+)$/);
  if(m){
    const obj = decodeState(m[1]);
    if(obj && applyStateFromObj(obj)){
      /* 分享链接打开时，自动切回「模型」标签页 */
      const btn = document.querySelector('#tabBar button[data-tab="model"]');
      if(btn) btn.click();
      return;
    }
  }
  run();
})();

/* updateTabInd 的 resize 监听已在 07-run.js 的 bindTabs() 中绑定（带 rAF 防抖），
   此处只做首帧初始化，不重复绑定。 */
requestAnimationFrame(()=>{
  updateTabInd();
});

/* =====================================================================
   力学自检场景：一键加载预设工况并自动播放参数扫掠
   ===================================================================== */
const SELF_TEST_CASES = [
  {
    id: 'moment-redist',
    sweep: 'betaJ',
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 20, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 5, dScale: 30 }
  },
  {
    id: 'anti-rho',
    sweep: 'hb',
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 150, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 30, H2: 30, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'all', mScale: 1, dScale: 30 },
    toast: '纯水平力工况下，扫掠梁高 hb 时，请留意「反弯点 x/h vs ρ」小图。随着梁高增加（ρ 变大），梁对柱的转动约束增强，各柱反弯点会非常规整地向虚线 x/h=0.5 靠拢。'
  },
  {
    id: 'colbase-hinge',
    sweep: 'betaF',
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 30, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 10, dScale: 300 }
  },
  {
    id: 'strong-beam',
    sweep: 'hb',
        state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 50, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 40, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 7, dScale: 30 }
  },
  {
    id: 'load-moment',
    sweep: 'q1',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 1, dScale: 30 }
  },
  {
    id: 'frame-action',
    sweep: 'betaJ',
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 20, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 0, forceType: 'N', elFilter: 'col', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 6, dScale: 30 }
  },
  {
    id: 'cant-tension',
    sweep: 'qc1',
    state: { nBay: 1, nLev: 1, hasCant: true, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 2.0, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 10, dScale: 300 }
  },
  {
    id: 'weak-story',
    sweep: 'h2',
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 2.5, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 30, H2: 30, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 30 }
  },
  {
    id: 'asym-sway',
    sweep: 'L1',
    state: { nBay: 2, nLev: 1, hasCant: false, L1: 3, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 100 }
  },
  {
    id: 'cant-sway',
    sweep: 'qc1',
    state: { nBay: 2, nLev: 2, hasCant: true, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 2.0, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 300 }
  },
  {
    id: 'dstiff-alloc',
    sweep: 'r',
    state: { nBay: 3, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 0.25, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 60, H2: 0, H3: 0, Hmode: 'rigid', betaF: 1, betaJ: 1, forceType: 'V', elFilter: 'col', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 10, dScale: 300 }
  },
  {
    id: 'dstiff-beam',
    sweep: 'betaJ',
    state: { nBay: 2, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'rigid', betaF: 1, betaJ: 0, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 10, dScale: 300 }
  },
  {
    id: 'pdelta',
    sweep: 'q1',
    state: { nBay: 1, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 6, h2: 6, h3: 4, Lc: 1.5, bc: 250, hc: 250, bb: 250, hb: 500, r: 1, q1: 0, q2: 20, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 3, H2: 3, H3: 0, Hmode: 'none', betaF: 1, betaJ: 0, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: true, displayMode: 'deform', mScale: 1, dScale: 5 }
  },
  {
    id: 'brace-stiffness',
    sweep: 'As',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 100, braceOnlyTension: false, braceMap: {'1-1':'X'}, braceTensionMap: {}, brushBrace: 'X', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 5, dScale: 300 }
  },
  {
    id: 'brace-tension-only',
    sweep: 'H1',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceOnlyTension: false, braceMap: {'1-1':'X'}, braceTensionMap: {'1-1':true}, brushBrace: 'X', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'brace', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 100 }
  },
  {
    id: 'brace-angle',
    sweep: 'L1',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 3, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceOnlyTension: false, braceMap: {'1-1':'X'}, braceTensionMap: {}, brushBrace: 'X', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'brace', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 8, dScale: 100 }
  },
  {
    id: 'settlement',
    sweep: 'settleDy',
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', settleDy: 0, settleCol: 0, frameMat: 'conc', braceMat: 'steel', As: 2000, braceOnlyTension: false, braceMap: {}, braceTensionMap: {}, brushBrace: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 0.6, dScale: 10 }
  },

  {
    id: 'system-stiffness-match',
    sweep: 'betaJ',
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'all', mScale: 5, dScale: 100 },
    toast: '扫掠梁端刚度 β_j。注意看右侧读数面板的「体系判定」：从刚接的剪切型框架，退化为半刚接，最终变为完全铰接的排架体系。同时观察结构侧移的剧增。'
  },
  /* ===== 新增卡（v0.1.6 功能扩充）===== */

  /* ⑰ 悬挑长度平方效应：与 ⑥ 的"线性荷载"对照，看 M ∝ L_c² */
  {
    id: 'cant-L2',
    sweep: 'Lc',
    state: { nBay: 1, nLev: 1, hasCant: true, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 0.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 30, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 1.0, dScale: 100 }
  },

  /* ⑱ 柱截面三次方效应：与 ③ 的"梁高"对照，看侧移 ∝ 1/h_c³ */
  {
    id: 'col-h3',
    sweep: 'hc',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 200, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 10, dScale: 300 }
  },

  /* ⑳ 三层薄弱层转移：⑦ 的纵向延伸，填补三层拓扑零覆盖 */


  /* ㉑a ╱ 单撑仅受拉：把"方向决定拉压"从 X 撑中剥离 */
  {
    id: 'brace-dir-L',
    sweep: 'H1',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceOnlyTension: false, braceMap: {'1-1':'/'}, braceTensionMap: {'1-1':true}, brushBrace: '/', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'brace', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 100 }
  },

  /* “强柱弱梁”卡片已移除 */

  /* ㉔a 满跨布置基线（静态卡 + 自动冻结） */
  {
    id: 'load-baseline',
    sweep: null,
    freezeAfter: true,
    state: { nBay: 3, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, qSpanMap: {}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 2, dScale: 100 },
    toast: '已加载满跨布置并冻结为灰色虚线基线。可直接查看满跨弯矩，或点后续的「不利布置」卡片进行对比。'
  },

  /* ㉔b 中跨加载：prelude 自动加载满跨 + 冻结，再加载中跨工况 */
  {
    id: 'load-mid-span',
    sweep: null,
    prelude: { nBay: 3, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, qSpanMap: {}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, displayMode: 'force', mScale: 2, dScale: 100 },
    preludeFreeze: true,
    state: { nBay: 3, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, qSpanMap: {'1-1':0, '1-2':20, '1-3':0}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 2, dScale: 100 },
    toast: '灰色虚线 = 满跨基线；实线 = 仅中跨加载。注意中跨跨中正弯矩增大，边跨可能上拱（反号弯矩）。'
  },

  /* ㉔c 相邻两跨加载：与 ㉔b 同一 prelude，看支座负弯矩控制工况 */
  {
    id: 'load-adj-span',
    sweep: null,
    prelude: { nBay: 3, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, qSpanMap: {}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, displayMode: 'force', mScale: 2, dScale: 100 },
    preludeFreeze: true,
    state: { nBay: 3, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, qSpanMap: {'1-1':20, '1-2':20, '1-3':0}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 2, dScale: 100 },
    toast: '灰色虚线 = 满跨基线；实线 = 左+中两跨加载。注意中间支座负弯矩达到最大（支座配筋控制工况）。'
  },
  /* ===== 二阶段新增：P-Δ、集中力、温度 ===== */
  {
    id: 'pdelta-h1',
    sweep: 'h1',
    state: { nBay: 1, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 2.5, h2: 6, h3: 4, Lc: 1.5, bc: 250, hc: 250, bb: 250, hb: 500, r: 1, q1: 0, q2: 20, q3: 0, qc1: 0, qc2: 0, qc3: 0, P1:0, P2:0, P3:0, pLoadMap:{}, H1: 3, H2: 3, H3: 0, Hmode: 'none', betaF: 1, betaJ: 0, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: true, displayMode: 'deform', mScale: 1, dScale: 5 }
  },
  /* ㉕ P-δ vs P-Δ 概念卡（静态，无数值） */
  {
    id: 'pdelta-vs-pdelta',
    sweep: null,
    state: { nBay: 1, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 6, h2: 6, h3: 4, Lc: 1.5, bc: 250, hc: 250, bb: 250, hb: 500, r: 1, q1: 0, q2: 50, q3: 0, qc1: 0, qc2: 0, qc3: 0, P1:0, P2:0, P3:0, pLoadMap:{}, H1: 3, H2: 3, H3: 0, Hmode: 'none', betaF: 1, betaJ: 0, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: true, displayMode: 'deform', mScale: 1, dScale: 5 },
    toast: '本工具只计算 P-Δ（结构侧移引起），不计算 P-δ（构件自身挠曲）。P-δ 在高轴压比细长柱中才显著；若需精确二阶分析，应使用带几何刚度的专用软件。'
  },
  {
    id: 'p-moment',
    sweep: 'P1',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, P1: 0, P2: 0, P3: 0, pLoadMap: {}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 2, dScale: 100 }
  },
  {
    id: 'temp-axial',
    sweep: 'tempAll',
    state: { nBay: 2, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, P1:0, P2:0, P3:0, pLoadMap:{}, H1: 0, H2: 0, H3: 0, Hmode: 'none', tempAll: 0, tempGrad: 0, betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 5, dScale: 100 }
  },
  {
    id: 'temp-grad',
    sweep: 'tempGrad',
    state: { nBay: 2, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, P1:0, P2:0, P3:0, pLoadMap:{}, H1: 0, H2: 0, H3: 0, Hmode: 'none', tempAll: 0, tempGrad: 0, betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 5, dScale: 100 }
  }
];

/* 轻量提示 toast：用于静态自检卡（sweep:null）向用户解释观察要点。
   复用单个 DOM，避免多次创建。 */
function showToast(msg, duration){
  let t = document.getElementById('stToast');
  if(!t){
    t = document.createElement('div');
    t.id = 'stToast';
    t.className = 'stToast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('on'), duration || 10000);
}

/* 把当前 MODEL 冻结为对比基线，统一处理深拷贝与按钮状态，
   供 runSelfTest 的 preludeFreeze / freezeAfter 分支与用户点「冻结」按钮复用。 */
function _freezeCurrentModel(){
  if(!MODEL) return;
  BASE = {
    nodes: MODEL.nodes, els: MODEL.els,
    results: MODEL.results, U: MODEL.U,
    p: { ...MODEL.p,
         braceMap: { ...MODEL.p.braceMap },
         braceTensionMap: { ...MODEL.p.braceTensionMap },
         qSpanMap: { ...(MODEL.p.qSpanMap || {}) },
         pLoadMap: { ...(MODEL.p.pLoadMap || {}) } }
  };
  const btnFz  = document.getElementById('btnFreeze');
  if(btnFz)  btnFz.classList.add('on');
  const btnFzD = document.getElementById('btnFreezeDeform');
  if(btnFzD) btnFzD.classList.add('on');
}

function runSelfTest(caseId){
  const tc = SELF_TEST_CASES.find(c => c.id === caseId);
  if(!tc) return;

  /* 1. 关闭使用说明模态框 */
  const helpModal = document.getElementById('modalHelp');
  if(helpModal) helpModal.classList.remove('open');

  /* 2. 停止可能正在播放的扫掠 */
  if(S.sweep.playing) sweepStop();

  /* 2.0 自动关闭可能残留的浮窗 */
  const floatAnti = document.getElementById('floatAntiRhoWrap');
  if(floatAnti) floatAnti.hidden = true;

  /* 2.1 清空用户此前手动冻结的基线，避免同拓扑自检场景带着无关灰线 */
  BASE = null;
  const _fz  = document.getElementById('btnFreeze');
  if(_fz)  _fz.classList.remove('on');
  const _fzD = document.getElementById('btnFreezeDeform');
  if(_fzD) _fzD.classList.remove('on');

  /* 2.5 清空可能残留的状态：支撑、逐跨荷载、沉降、材质、刚度。
     不重置的话，用户此前布置的支撑 / 逐跨覆盖会被带入自检场景，导致与卡片描述不符。 */
  S.braceMap = {};
  S.braceTensionMap = {};
  S.qSpanMap = {};
  S.pLoadMap = {};
  S.P1 = 0; S.P2 = 0; S.P3 = 0;
  S.tempAll = 0; S.tempGrad = 0; S.tempT0 = 20;
  S.brushBrace = 'none';
  S.settleDy = 0;
  S.settleCol = 0;
  S.frameMat = 'conc';
  S.braceMat = 'steel';
  S.axialMode = 'real';
  S.As = 2000;
  S.betaF = 1.0;
  S.betaJ = 1.0;
  /* 与 btn-reset 保持一致：清缓存，避免跨场景残影 */
  S._uPureCache = null;
  S._stiffDecompCache = null;
  /* 同步重置动态注入的 P/temp 滑块 */
  /* tempT0 默认 20℃，其余为 0；不能一律置 0，且必须同步 S，避免 UI 与计算脱节 */
  const selfTestDefaults = { P1:0, P2:0, P3:0, tempAll:0, tempGrad:0, tempT0:20 };
  Object.keys(selfTestDefaults).forEach(id => {
    const el = document.getElementById(id);
    if(el){
      const v = selfTestDefaults[id];
      el.value = v;
      S[id] = v;
      const out = document.getElementById('v-'+id);
      if(out) out.textContent = id === 'tempT0' ? v.toFixed(0)+' ℃' : (fmtMap[id] ? fmtMap[id](v) : v);
      updateRangeProgress(el);
    }
  });
  if(typeof renderPSpanEditors === 'function') renderPSpanEditors();
  if(typeof renderBraceGrid === 'function') renderBraceGrid();
  if(typeof renderSpanEditors === 'function') renderSpanEditors();

  /* 2.6 prelude：先加载一个工况、可选冻结为基线，再加载主工况。
     专供 ㉔b/㉔c 使用：先算满跨、冻结为灰色基线，再算不利布置、与基线对比。
     prelude 与主 state 的拓扑必须一致，否则 run() 会因 geoChanged 清空 BASE。 */
  if(tc.prelude){
    if(!applyStateFromObj(tc.prelude)) return;
    if(tc.preludeFreeze) _freezeCurrentModel();
  }

  /* 3. 应用预设状态 */
  if(!applyStateFromObj(tc.state)) return;

  /* 3.1 自动导航：打开对应的 Tab 和折叠面板 */
  const isModelParam = ['L1','L2','L3','h1','h2','h3','Lc','bc','hc','bb','hb','r','As','braceI'].includes(tc.sweep);
  const isLoadParam  = ['q1','q2','q3','qc1','qc2','qc3','H1','H2','H3','P1','P2','P3','tempAll','tempGrad','settleDy','betaF','betaJ'].includes(tc.sweep);
  
  const openDetails = (id) => { const el = document.getElementById(id); if(el) el.open = true; };

  if (isModelParam) {
    const btn = document.querySelector('#tabBar button[data-tab="model"]');
    if(btn) btn.click();
    if (tc.sweep === 'As' || tc.sweep === 'braceI') openDetails('details-model-brace');
    else if (tc.sweep === 'bc' || tc.sweep === 'hc' || tc.sweep === 'bb' || tc.sweep === 'hb' || tc.sweep === 'r') openDetails('details-model-mat');
    else openDetails('details-model-topo');
  } else if (isLoadParam) {
    const btn = document.querySelector('#tabBar button[data-tab="load"]');
    if(btn) btn.click();
    if (['tempAll','tempGrad','settleDy'].includes(tc.sweep)) openDetails('details-load-other');
    else if (['H1','H2','H3'].includes(tc.sweep)) openDetails('details-load-horz');
    else openDetails('details-load-vert');
  }

  /* 3.5 freezeAfter：本次加载后立即冻结（㉔a 使用） */
  if(tc.freezeAfter){
    _freezeCurrentModel();
    run();   // 让虚线基线立即出现
  }

  /* 3.55 针对反弯点自检卡，自动弹出悬浮窗并放置在弯矩图左侧 */
  if(tc.id === 'anti-rho'){
    requestAnimationFrame(() => {
      const chartForce = document.getElementById('chartForce');
      if(chartForce) {
        const rect = chartForce.getBoundingClientRect();
        // 放在弯矩图左侧（减去浮窗宽度 280 和一点间距）
        const targetX = Math.max(20, rect.left - 290);
        const targetY = Math.max(80, rect.top + 10);
        if(typeof window.openAntiRhoFloat === 'function') {
          window.openAntiRhoFloat(targetX, targetY);
        }
      }
    });
  }

  /* 3.6 静态卡片：不打开扫掠条、不播放，只弹 toast 提示观察要点 */
  if(!tc.sweep){
    if(tc.toast) showToast(tc.toast);
    return;
  }

  /* 4. 确保扫掠条打开 */
  const bar    = document.getElementById('sweepBar');
  const btnBar = document.getElementById('btn-sweep');
  const sel    = document.getElementById('sweepParam');
  if(bar)    bar.classList.add('on');
  if(btnBar) btnBar.classList.add('on');

  /* 5. 设置目标扫掠参数 */
  if(sel && tc.sweep){
    S.sweep.param = tc.sweep;
    sel.value     = tc.sweep;
  }

  /* 6. 自检播放放慢两倍（单程 3s → 12s），便于观察连续变化。 */
  S.sweep.durMul = 4;

  /* 7. 等 UI 布局稳定后，重置到最小值并开始循环播放 */
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      /* 自检扫掠从卡片预设的初始值开始，而不是 slider 的 min。
         例如 tempAll 的 min=-30，但卡片描述是"0→50℃"，应从 0 开始。 */
      const initEl = document.getElementById(S.sweep.param);
      if(initEl && tc.state && tc.state[S.sweep.param] != null){
        sweepSetValue(S.sweep.param, tc.state[S.sweep.param]);
        run();
      } else {
        sweepReset();
      }
      sweepPlay(true);
    });
  });
}

(function bindSelfTest(){
  const panel = document.querySelector('.tabPanel[data-tab="selftest"] .group');
  if(panel){
    const nodes = Array.from(panel.children);
    let currentDetails = null;
    let currentContent = null;
    
    // 1. 动态折叠：把已有卡片塞进 <details>
    nodes.forEach(node => {
      if(node.classList.contains('selfTestCategory')) {
        currentDetails = document.createElement('details');
        currentDetails.className = 'stCatGroup';
        
        const summary = document.createElement('summary');
        summary.className = 'selfTestCategory';
        summary.textContent = node.textContent;
        
        currentContent = document.createElement('div');
        currentContent.className = 'stCatContent';
        
        currentDetails.appendChild(summary);
        currentDetails.appendChild(currentContent);
        panel.appendChild(currentDetails);
        
        node.remove();
      } else if (node.classList.contains('selfTestCard')) {
        // 剔除废弃的 ㉑b 冗余卡片
        if(node.getAttribute('data-selftest') === 'brace-dir-R') {
          node.remove();
          return;
        }
        if(currentContent) {
          currentContent.appendChild(node);
        }
      }
    });

    // 2. 动态注入 HTML 里还没加的新卡片，自动归类
    const addNewCard = (catName, html) => {
      const details = [...panel.querySelectorAll('.stCatGroup')].find(d => d.querySelector('summary').textContent.includes(catName));
      if(details) {
        const content = details.querySelector('.stCatContent');
        content.insertAdjacentHTML('beforeend', html);
      }
    };

    addNewCard('A. 弯矩与刚度', `<div class="selfTestCard" data-selftest="system-stiffness-match"><div class="stcTitle">体系刚度匹配与演化</div><div class="stcDesc">两层两跨 · 水平力。扫掠梁端刚度 β_j (0→1)，观察右侧「体系判定」从"铰接排架"逐渐变为"典型刚接框架"，理解林同炎对刚度匹配的定性判断。</div><span class="stcAction">▶ 播放</span></div>`);
    addNewCard('A. 弯矩与刚度', `<div class="selfTestCard" data-selftest="p-moment"><div class="stcTitle">集中力弯矩尖角</div><div class="stcDesc">单层单跨 · 跨中集中力。扫掠 P₁ (0→200)，观察集中力作用点处弯矩图的"尖角"，以及跨中正弯矩的线性增长。</div><span class="stcAction">▶ 播放</span></div>`);
    addNewCard('A. 弯矩与刚度', `<div class="selfTestCard" data-selftest="anti-rho"><div class="stcTitle">反弯点 vs ρ 联动</div><div class="stcDesc">两层两跨 · 纯水平力。扫掠梁高 h<sub>b</sub>，注意看「反弯点 x/h vs ρ」小图（可点击⤢浮动拖到图旁）。梁高增加使梁线刚度上升，各柱反弯点逐渐向 x/h=0.5 靠拢。</div><span class="stcAction">▶ 播放</span></div>`);
    addNewCard('D. 水平力与二阶', `<div class="selfTestCard" data-selftest="pdelta-h1"><div class="stcTitle">P-Δ 层高敏感性</div><div class="stcDesc">两层单跨 · 柔性框架 · 开启P-Δ。扫掠一层的 h₁ (2.5→7)，看层高增加时 N_cr 平方级下降，导致 B 值急剧放大并逼近失稳。</div><span class="stcAction">▶ 播放</span></div>`);
    addNewCard('D. 水平力与二阶', `<div class="selfTestCard" data-selftest="pdelta-vs-pdelta">
      <div class="stcTitle">P-δ 与 P-Δ 的区别</div>
      <div class="stcDesc">本工具只计算 P-Δ（结构侧移引起的二阶效应），不计算 P-δ（构件自身挠曲）。
      <svg viewBox="0 0 240 120" style="width:100%;height:auto;margin:6px 0;background:#0f172a;border-radius:4px;display:block;">
        <text x="60" y="12" fill="#94a3b8" font-size="9" text-anchor="middle">P-Δ</text>
        <line x1="20" y1="100" x2="100" y2="100" stroke="#475569" stroke-width="2"/>
        <line x1="20" y1="100" x2="20" y2="30" stroke="#475569" stroke-width="1.5" stroke-dasharray="2,2"/>
        <line x1="100" y1="100" x2="100" y2="30" stroke="#475569" stroke-width="1.5" stroke-dasharray="2,2"/>
        <line x1="20" y1="100" x2="35" y2="30" stroke="#38bdf8" stroke-width="2"/>
        <line x1="100" y1="100" x2="115" y2="30" stroke="#38bdf8" stroke-width="2"/>
        <line x1="35" y1="30" x2="115" y2="30" stroke="#38bdf8" stroke-width="2"/>
        <text x="125" y="40" fill="#f87171" font-size="8">δ_top</text>
        <text x="180" y="12" fill="#94a3b8" font-size="9" text-anchor="middle">P-δ</text>
        <line x1="140" y1="100" x2="220" y2="100" stroke="#475569" stroke-width="2"/>
        <line x1="140" y1="100" x2="140" y2="30" stroke="#475569" stroke-width="1.5" stroke-dasharray="2,2"/>
        <line x1="220" y1="100" x2="220" y2="30" stroke="#475569" stroke-width="1.5" stroke-dasharray="2,2"/>
        <path d="M 140 100 Q 155 65 140 30" stroke="#38bdf8" stroke-width="2" fill="none"/>
        <path d="M 220 100 Q 235 65 220 30" stroke="#38bdf8" stroke-width="2" fill="none"/>
        <line x1="140" y1="30" x2="220" y2="30" stroke="#38bdf8" stroke-width="2"/>
        <text x="160" y="70" fill="#fbbf24" font-size="8">δ_local</text>
      </svg>
      P-Δ：整体侧移，节点位移放大；P-δ：柱中部挠曲，构件局部放大。</div>
      <span class="stcAction">▶ 加载</span>
    </div>`);
    addNewCard('F. 非荷载作用', `<div class="selfTestCard" data-selftest="temp-axial"><div class="stcTitle">均匀升温的轴力</div><div class="stcDesc">单层两跨 · 无外荷载。扫掠均匀升温 ΔT (0→50℃)，看超静定框架因膨胀受阻产生的内部轴力。</div><span class="stcAction">▶ 播放</span></div>`);
    addNewCard('F. 非荷载作用', `<div class="selfTestCard" data-selftest="temp-grad"><div class="stcTitle">单侧温差的反弯点</div><div class="stcDesc">单层两跨 · 无外荷载。扫掠截面温差 ΔT，看梁柱因温度梯度产生弯曲，及框架侧移带来的二阶附加内力。</div><span class="stcAction">▶ 播放</span></div>`);

    // 3. 统一重排所有卡片的序号（从 ① 开始按大类递增）
    panel.querySelectorAll('.stCatGroup').forEach(det => {
      let cnt = 0;
      det.querySelectorAll('.selfTestCard').forEach(card => {
        cnt++;
        const titleEl = card.querySelector('.stcTitle');
        if(titleEl) {
          let txt = titleEl.textContent;
          // 剥离原本可能带有的数字/带圈序号（例如 "① ", "㉔a "），只留文字
          const match = txt.match(/^[①-⑳㉑-㉟\d]+\s*[a-z]?\s*(.*)$/);
          if(match) txt = match[1];
          
          const circles = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳','㉑','㉒','㉓','㉔','㉕','㉖','㉗','㉘','㉙','㉚'];
          const displayNum = circles[cnt-1] || cnt;
          titleEl.textContent = displayNum + ' ' + txt;
        }
      });
    });
  }

  // 4. 绑定点击事件
  document.querySelectorAll('.selfTestCard[data-selftest]').forEach(card=>{
    card.addEventListener('click', ()=>{
      runSelfTest(card.dataset.selftest);
    });
  });
})();

/* =====================================================================
   折叠面板状态记忆
   ===================================================================== */
(function bindDetailsMemory(){
  const detailsEls = document.querySelectorAll('.tabDetails');
  if(!detailsEls.length) return;
  
  let savedState = {};
  try {
    savedState = JSON.parse(localStorage.getItem('structura-details-state') || '{}');
  } catch(e) {}
  
  // 恢复状态
  detailsEls.forEach(el => {
    if (el.id && typeof savedState[el.id] === 'boolean') {
      el.open = savedState[el.id];
    }
  });

  // 监听变化并保存
  detailsEls.forEach(el => {
    el.addEventListener('toggle', () => {
      if(el.id) {
        savedState[el.id] = el.open;
        try {
          localStorage.setItem('structura-details-state', JSON.stringify(savedState));
        } catch(e) {}
      }
    });
  });
})();