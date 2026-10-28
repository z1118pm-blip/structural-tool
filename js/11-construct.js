"use strict";

/* =====================================================================
   11. 支撑网格画笔绑定
   ===================================================================== */
const BRACE_MAP = { none: "none", X: "X", L: "/", R: "\\" };

function renderBraceGrid() {
  const wrap = document.getElementById('braceGridWrap');
  if(!wrap) return;
  
  let html = '';
  // 从上往下渲染，符合楼层习惯
  for(let lv = S.nLev; lv >= 1; lv--) { 
    html += '<div class="braceGridRow">';
    html += `<div class="braceGridLabel">${lv}层</div>`;
    for(let c = 1; c <= S.nBay; c++) {
      const key = lv + '-' + c;
      const val = S.braceMap[key] || 'none';
      const txt = val === 'X' ? 'X' : (val === '/' ? '╱' : (val === '\\' ? '╲' : '—'));
      const isOn = val !== 'none' ? ' on' : '';
      const hasBrace = val !== 'none';
      const isTension = hasBrace && !!S.braceTensionMap[key];
      const tCls = 'braceGridT' + (hasBrace ? '' : ' is-hidden') + (isTension ? ' on' : '');
      const tTitle = hasBrace ? (isTension ? '点击关闭该格「仅受拉」' : '点击开启该格「仅受拉」') : '';
      html += `<div class="braceGridCell${isOn}" data-key="${key}">` +
              `<span class="braceGridMark">${txt}</span>` +
              `<span class="${tCls}" data-key="${key}" title="${tTitle}">T</span>` +
              `</div>`;
    }
    html += '</div>';
  }
  wrap.innerHTML = html;

  /* 事件委托：只绑一次，后续 innerHTML 重建不需要重新绑监听器。 */
  if (!wrap._delegated) {
    wrap._delegated = true;
    wrap.addEventListener('click', (e) => {
      /* 录制期间锁定支撑网格，防止误触触发 run() 污染录制画面 */
      if (S.rec && S.rec.active) return;
      const cell = e.target.closest('.braceGridCell');
      if (!cell) return;
      const key = cell.dataset.key;
      // 点击 T 角标：只切换该格「仅受拉」，不改支撑形式
      if(e.target.classList.contains('braceGridT')) {
        e.stopPropagation();
        const val = S.braceMap[key] || 'none';
        if(val === 'none') return;
        if(S.braceTensionMap[key]) delete S.braceTensionMap[key];
        else S.braceTensionMap[key] = true;
        renderBraceGrid();
        if(typeof updateSweepOptions === 'function') updateSweepOptions();
        run();
        return;
      }
      // 点击格子本体：按当前画笔切换支撑形式
      const curVal = S.braceMap[key] || 'none';
      if(curVal === S.brushBrace) {
        delete S.braceMap[key]; // 相同则取消
        delete S.braceTensionMap[key];
      } else if (S.brushBrace === 'none') {
        delete S.braceMap[key];
        delete S.braceTensionMap[key];
      } else {
        S.braceMap[key] = S.brushBrace;
      }
      renderBraceGrid();
      if(typeof updateSweepOptions === 'function') updateSweepOptions();
      run();
    });
  }

  // 同步「全部仅受拉」批量按钮的文案与状态
  if(typeof window.refreshBraceTensionBtn === 'function') window.refreshBraceTensionBtn();
}

(function bindBraceTopo() {
  const seg = document.getElementById("segBraceTopo");
  if (seg) {
    seg.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        seg.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
        btn.classList.add("on");
        S.brushBrace = BRACE_MAP[btn.dataset.brace] || "none";
      });
    });
  }

  // 监听拓扑变化，清理越界数据并重绘
  window.addEventListener('structura-topo-change', () => {
    for(const k of Object.keys(S.braceMap)) {
      const [lv, c] = k.split('-').map(Number);
      if(lv > S.nLev || c > S.nBay) delete S.braceMap[k];
    }
    // 同步清理越界 / 已无支撑格的仅受拉标记
    for(const k of Object.keys(S.braceTensionMap)) {
      const [lv, c] = k.split('-').map(Number);
      const hasBrace = S.braceMap[k] && S.braceMap[k] !== 'none';
      if(lv > S.nLev || c > S.nBay || !hasBrace) delete S.braceTensionMap[k];
    }
    renderBraceGrid();
  });

  // 初始化
  renderBraceGrid();
})();

/* =====================================================================
   梁系移除网格画笔绑定（穿层柱模拟）
   ===================================================================== */
function renderRemoveBeamGrid() {
  const wrap = document.getElementById('removeBeamGridWrap');
  if(!wrap) return;
  
  let html = '';
  for(let lv = S.nLev; lv >= 1; lv--) { 
    html += '<div class="braceGridRow">';
    html += `<div class="braceGridLabel">${lv}层</div>`;
    for(let c = 1; c <= S.nBay; c++) {
      const key = lv + '-' + c;
      const isRemoved = !!S.removeBeamMap[key];
      const txt = isRemoved ? '✕' : '━';
      const colorStyle = isRemoved ? 'color: #f43f5e !important; border-color: rgba(244,63,94,0.5) !important; background: rgba(244,63,94,0.1) !important;' : '';
      html += `<div class="braceGridCell" data-key="${key}" style="${colorStyle}">` +
              `<span class="braceGridMark">${txt}</span>` +
              `</div>`;
    }
    html += '</div>';
  }
  wrap.innerHTML = html;

  if (!wrap._delegated) {
    wrap._delegated = true;
    wrap.addEventListener('click', (e) => {
      if (S.rec && S.rec.active) return;
      const cell = e.target.closest('.braceGridCell');
      if (!cell) return;
      const key = cell.dataset.key;
      
      if (S.removeBeamMap[key]) {
        delete S.removeBeamMap[key];
      } else {
        S.removeBeamMap[key] = true;
      }
      
      renderRemoveBeamGrid();
      if (typeof applyTopoState === 'function') applyTopoState(); // 联动禁用荷载输入
      if (typeof renderSpanEditors === 'function') renderSpanEditors();
      if (typeof renderPSpanEditors === 'function') renderPSpanEditors();
      if(typeof scheduleRender === 'function') scheduleRender(); else run();
    });
  }
}

(function bindRemoveBeamGrid() {
  window.addEventListener('structura-topo-change', () => {
    for(const k of Object.keys(S.removeBeamMap)) {
      const [lv, c] = k.split('-').map(Number);
      if(lv > S.nLev || c > S.nBay) delete S.removeBeamMap[k];
    }
    renderRemoveBeamGrid();
  });
  if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderRemoveBeamGrid);
  } else {
    renderRemoveBeamGrid();
  }
})();