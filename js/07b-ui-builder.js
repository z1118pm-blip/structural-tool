"use strict";

/* =====================================================================
   07b-ui-builder.js：动态 UI 注入与部分控件绑定
   ---------------------------------------------------------------------
   将原本堆积在 07-run.js 中的大段 DOM 构建逻辑剥离至此，
   保持主调度器 07-run.js 的纯粹性。
   ===================================================================== */

/* =====================================================================
   动态注入集中荷载 UI（避免修改 index.html 大段结构）
   ===================================================================== */
(function injectPLoadUI(){
  const rowQ1 = document.getElementById('row-q1');
  if(!rowQ1) return;
  
  let html = '';
  for(let lv=1; lv<=3; lv++){
    html += `<div class="ctrl" id="row-P${lv}">
      <div class="head"><span>${lv}层集中力 P<sub>${lv}</sub>（跨中）</span><b id="v-P${lv}">0 kN</b></div>
      <input type="range" id="P${lv}" min="0" max="200" step="5" value="0">
      <div class="spanEditRow">
        <button type="button" class="spanEditToggle" data-lev="${lv}" data-type="P">按跨指定 ▾</button>
      </div>
      <div class="spanEditBox" id="pSpanBox${lv}" hidden></div>
    </div>`;
  }
  
  const vertDetails = document.getElementById('details-load-vert');
  if(vertDetails) {
    const targetGroup = [...vertDetails.querySelectorAll('.group')].find(g => g.querySelector('.gtitle') && g.querySelector('.gtitle').textContent.includes('右侧悬挑均布'));
    if(targetGroup) targetGroup.insertAdjacentHTML('beforebegin', html);
  }
})();

/* 动态注入温度荷载 UI */
(function injectTempUI(){
  const rowQ3 = document.getElementById('row-q3');
  if(!rowQ3) return;
  
  const html = `
    <div class="group" id="group-temp">
      <div class="gtitle">非荷载作用 · 温度</div>
      <div class="ctrl" id="row-tempT0">
        <div class="head"><span>合拢/安装温度 T₀</span><b id="v-tempT0">20 ℃</b></div>
        <input type="range" id="tempT0" min="-20" max="50" step="1" value="20">
      </div>
      <div class="ctrl" id="row-tempAll">
        <div class="head"><span>构件整体温升 ΔT</span><b id="v-tempAll">0 ℃</b></div>
        <input type="range" id="tempAll" min="-30" max="50" step="1" value="0">
      </div>
      <div class="ctrl" id="row-tempGrad">
        <div class="head"><span>结构内外温差 ΔT (室外-室内)</span><b id="v-tempGrad">0 ℃</b></div>
        <input type="range" id="tempGrad" min="-30" max="30" step="1" value="0">
      </div>
      <div class="hint">整体温升使框架产生轴力重分布；结构内外温差仅作用于边柱及顶层边梁（产生弯曲）。内部构件及悬挑梁不受截面温差影响。</div>
    </div>`;
  
  const otherDetails = document.getElementById('details-load-other');
  if(otherDetails) {
    const content = otherDetails.querySelector('.groupContent');
    if(content) content.insertAdjacentHTML('afterbegin', html);
    
    const pDeltaGroup = [...document.querySelectorAll('.tabPanel[data-tab="load"] .group')].find(g => g.querySelector('.gtitle') && g.querySelector('.gtitle').textContent.includes('二阶效应'));
    const horzDetails = document.getElementById('details-load-horz');
    if (pDeltaGroup && horzDetails) {
      const horzContent = horzDetails.querySelector('.groupContent');
      if(horzContent) horzContent.appendChild(pDeltaGroup);
    }
  }
  
  const bindT = (id, fmt) => {
    const el = document.getElementById(id);
    const out = document.getElementById('v-'+id);
    if(!el || !out) return;
    updateRangeProgress(el);
    el.addEventListener('input', ()=>{
      if(S.sweep && S.sweep.playing) sweepStop();
      const v = parseFloat(el.value);
      if(!isFinite(v)) return;
      S[id] = v;
      out.textContent = fmt(S[id]);
      updateRangeProgress(el);
      if(dragRaf) return;
      dragRaf = requestAnimationFrame(()=>{ dragRaf = null; run(); });
    });
    S[id] = parseFloat(el.value);
    out.textContent = fmt(S[id]);
    updateRangeProgress(el);
  };
  
  bindT('tempT0', v=>v.toFixed(0)+' ℃');
  bindT('tempAll', v=>v.toFixed(0)+' ℃');
  bindT('tempGrad', v=>v.toFixed(0)+' ℃');

  for(let lv=1; lv<=3; lv++){
    const el = document.getElementById('P'+lv);
    const out = document.getElementById('v-P'+lv);
    if(!el || !out) continue;
    
    el.addEventListener('input', ()=>{
      if(S.sweep && S.sweep.playing) sweepStop();
      const v = parseFloat(el.value);
      if(!isFinite(v)) return;
      S['P'+lv] = v;
      out.textContent = S['P'+lv].toFixed(0) + ' kN';
      updateRangeProgress(el);
      
      let changed = false;
      for(const k in S.pLoadMap){
        if(k.startsWith(lv + '-')){ delete S.pLoadMap[k]; changed = true; }
      }
      if(changed) renderPSpanEditors(lv);
      
      if(dragRaf) return;
      dragRaf = requestAnimationFrame(()=>{ dragRaf = null; run(); });
    });
    S['P'+lv] = parseFloat(el.value);
    out.textContent = S['P'+lv].toFixed(0) + ' kN';
    updateRangeProgress(el);
  }
})();

function renderPSpanEditors(onlyLev){
  for(let lv=1; lv<=S.nLev; lv++){
    if(onlyLev && lv !== onlyLev) continue;
    const box = document.getElementById('pSpanBox' + lv);
    if(!box || box.hidden) continue;
    let html = '';
    for(let c=1; c<=S.nBay; c++){
      const key = lv + '-' + c;
      const mapObj = S.pLoadMap[key] || {};
      const P = mapObj.P != null ? mapObj.P : (S['P'+lv] || 0);
      let a = mapObj.a != null ? mapObj.a : (S['L'+c] / 2);
      a = Math.max(0.01, Math.min(S['L'+c] - 0.01, a));
      if (mapObj.a != null && mapObj.a !== a) {
        S.pLoadMap[key].a = a;
      }
      const dot = mapObj.P != null ? ' <span style="color:#f97316">●</span>' : '';
      
      html += `<div class="ctrl spanEditItem">
        <div class="head"><span>第 ${c} 跨 P (位置 a)${dot}</span><b id="v-P-${key}">${P.toFixed(0)} kN / ${a.toFixed(1)} m</b></div>
        <input type="range" class="pSpanEditRangeP" min="0" max="200" step="5" value="${P}" data-spankey="${key}" data-sub="P">
        <div style="height:4px"></div>
        <input type="range" class="pSpanEditRangeA" min="${(0.1*S['L'+c]).toFixed(2)}" max="${(0.9*S['L'+c]).toFixed(2)}" step="0.01" value="${a}" data-spankey="${key}" data-sub="a">
      </div>`;
    }
    html += `<button type="button" class="spanEditClear" data-lev="${lv}" data-type="P">清除本层覆盖</button>`;
    box.innerHTML = html;
    if(S.rec && S.rec.active){
      box.querySelectorAll('input[type=range]').forEach(inp => { inp.disabled = true; });
    }

    box.querySelectorAll('input[type=range]').forEach(inp=>{
      const key = inp.dataset.spankey;
      const sub = inp.dataset.sub;
      updateRangeProgress(inp);
      
      inp.addEventListener('input', ()=>{
        if(S.sweep && S.sweep.playing) sweepStop();
        const v = parseFloat(inp.value);
        if(!S.pLoadMap[key]) S.pLoadMap[key] = { P: S['P'+parseInt(key.split('-')[0])] || 0, a: S['L'+parseInt(key.split('-')[1])]/2 };
        S.pLoadMap[key][sub] = v;
        
        const out = document.getElementById('v-P-' + key);
        if(out) out.textContent = S.pLoadMap[key].P.toFixed(0) + ' kN / ' + S.pLoadMap[key].a.toFixed(1) + ' m';
        updateRangeProgress(inp);
        
        if(dragRaf) return;
        dragRaf = requestAnimationFrame(()=>{ dragRaf = null; run(); });
      });
    });

    const clr = box.querySelector('.spanEditClear');
    if(clr) clr.addEventListener('click', ()=>{
      const lv2 = parseInt(clr.dataset.lev);
      for(const k in S.pLoadMap){
        if(k.startsWith(lv2 + '-')) delete S.pLoadMap[k];
      }
      renderPSpanEditors(lv2);
      run();
    });
  }
}

(function bindSpanEditors2(){
  document.querySelectorAll('.spanEditToggle[data-type="P"]').forEach(btn=>{
    const lev = parseInt(btn.dataset.lev);
    const type = btn.dataset.type || 'q';
    const boxId = type === 'P' ? 'pSpanBox' + lev : 'qSpanBox' + lev;
    const box = document.getElementById(boxId);
    if(!box) return;
    btn.addEventListener('click', ()=>{
      const open = box.hidden;
      box.hidden = !open;
      btn.classList.toggle('on', open);
      btn.textContent = open ? '收起 ▴' : '按跨指定 ▾';
      if(open) {
        if(type === 'P') renderPSpanEditors(lev);
        else renderSpanEditors(lev);
      }
    });
  });
})();

function renderSpanEditors(onlyLev){
  for(let lv=1; lv<=S.nLev; lv++){
    if(onlyLev && lv !== onlyLev) continue;
    const box = document.getElementById('qSpanBox' + lv);
    if(!box || box.hidden) continue;
    let html = '';
    for(let c=1; c<=S.nBay; c++){
      const key = lv + '-' + c;
      const has = Object.prototype.hasOwnProperty.call(S.qSpanMap, key);
      const v = has ? S.qSpanMap[key] : (S['q'+lv] || 0);
      const dot = has ? ' <span style="color:#f97316">●</span>' : '';
      html += `<div class="ctrl spanEditItem">
        <div class="head"><span>第 ${c} 跨${dot}</span><b id="v-${key}">${v.toFixed(1)} kN/m</b></div>
        <input type="range" class="spanEditRange" min="0" max="100" step="0.5" value="${v}" data-spankey="${key}">
      </div>`;
    }
    html += `<button type="button" class="spanEditClear" data-lev="${lv}">清除本层覆盖</button>`;
    box.innerHTML = html;
    if(S.rec && S.rec.active){
      box.querySelectorAll('input[type=range]').forEach(inp => { inp.disabled = true; });
    }

    box.querySelectorAll('.spanEditRange').forEach(inp=>{
      const spanKey = inp.dataset.spankey;
      updateRangeProgress(inp);
      inp.addEventListener('input', ()=>{
        if(S.sweep && S.sweep.playing) sweepStop();
        const v = parseFloat(inp.value);
        S.qSpanMap[spanKey] = v;
        const out = document.getElementById('v-' + spanKey);
        if(out) out.textContent = v.toFixed(1) + ' kN/m';
        updateRangeProgress(inp);
        if(dragRaf) return;
        dragRaf = requestAnimationFrame(()=>{
          dragRaf = null;
          run();
        });
      });
    });

    const clr = box.querySelector('.spanEditClear');
    if(clr) clr.addEventListener('click', ()=>{
      const lv2 = parseInt(clr.dataset.lev);
      for(const k in S.qSpanMap){
        if(k.startsWith(lv2 + '-')) delete S.qSpanMap[k];
      }
      renderSpanEditors(lv2);
      run();
    });
  }
}

(function bindSpanEditors(){
  document.querySelectorAll('.spanEditToggle:not([data-type="P"])').forEach(btn=>{
    const lev = parseInt(btn.dataset.lev);
    const box = document.getElementById('qSpanBox' + lev);
    if(!box) return;
    btn.addEventListener('click', ()=>{
      const open = box.hidden;
      box.hidden = !open;
      btn.classList.toggle('on', open);
      btn.textContent = open ? '收起 ▴' : '按跨指定 ▾';
      if(open) renderSpanEditors(lev);
    });
  });

  ['q1','q2','q3'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener('input', ()=>{
      const lev = parseInt(id[1]);
      let changed = false;
      for(const k in S.qSpanMap){
        if(k.startsWith(lev + '-')){ delete S.qSpanMap[k]; changed = true; }
      }
      if(changed && typeof renderSpanEditors === 'function') renderSpanEditors(lev);
    });
  });

  window.addEventListener('structura-topo-change', ()=>{
    for(const k of Object.keys(S.qSpanMap)){
      const parts = k.split('-');
      const lv = parseInt(parts[0]), c = parseInt(parts[1]);
      if(lv > S.nLev || c > S.nBay) delete S.qSpanMap[k];
    }
    for(const k of Object.keys(S.pLoadMap)){
      const parts = k.split('-');
      const lv = parseInt(parts[0]), c = parseInt(parts[1]);
      if(lv > S.nLev || c > S.nBay) delete S.pLoadMap[k];
    }
    if(typeof renderSpanEditors === 'function') renderSpanEditors();
    if(typeof renderPSpanEditors === 'function') renderPSpanEditors();
  });
})();