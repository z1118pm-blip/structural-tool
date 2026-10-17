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
  }
];

function runSelfTest(caseId){
  const tc = SELF_TEST_CASES.find(c => c.id === caseId);
  if(!tc) return;

  /* 1. 关闭使用说明模态框 */
  const helpModal = document.getElementById('modalHelp');
  if(helpModal) helpModal.classList.remove('open');

  /* 2. 停止可能正在播放的扫掠 */
  if(S.sweep.playing) sweepStop();

  /* 3. 应用预设状态（内部同步 UI 控件、分段按钮，并调用 run()） */
  if(!applyStateFromObj(tc.state)) return;

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
      sweepReset();
      sweepPlay(true);
    });
  });
}

(function bindSelfTest(){
  document.querySelectorAll('.selfTestCard[data-selftest]').forEach(card=>{
    card.addEventListener('click', ()=>{
      runSelfTest(card.dataset.selftest);
    });
  });

  /* 已删除：一键自检按钮及监听，因默认即打开自检Tab */
})();