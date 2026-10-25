"use strict";
// 只有 select 下拉框单独维护，数值参数全部走滑块逻辑
const IDS = ['terrain', 'intensity', 'siteClass', 'seismicGroup'];

// 细部参数白名单：只有这些 ID 的变更才切换到细部模式
// 注意：muN（轴压比）不列入 DETAIL_IDS，因此调整 muN 不会主动把宏观模式切到细部模式；
// 但在细部模式已启用时，muN 会经 col_side → g_col → g_detail 改变 gk_area，
// 这属于柱自重的合理联动，并非“不改变荷载口径”。
const DETAIL_IDS = ['tSlab','qArch','Lx','Ly','bBeam','hBeam','tWall','qWallDensity','wallRatio',
  'cwThk','cwRatio','masThk','masRatio','qWallSteel',
  'bSecBeam','hSecBeam','secBeamSpacing','beamModel',
  'steelBeamMain','steelBeamSec','steelColThk'];

// 统一的 useDetail 状态机：基本参数（nLev/h/L/B/qk/w0/C_period/psiT）永不改变 useDetail
function updateUseDetailFlag(id) {
  const tag = document.getElementById('gk-tag');
  const gkBaseEl = document.getElementById('in-gkBase');
  const gkGroup = gkBaseEl ? gkBaseEl.closest('.slider-group') : null;
  
  const btnReset = document.getElementById('btn-gk-reset');
  
  if (id === 'gkBase') {
    EST.useDetail = false;
    if (tag) {
      tag.textContent = '依据规范默认';
      tag.style.color = '#38bdf8';
      tag.style.background = 'rgba(56,189,248,0.1)';
    }
    if (btnReset) btnReset.style.display = 'none';
    if (gkGroup) {
      gkGroup.classList.remove('disabled');
      const rangeEl = gkGroup.querySelector('input[type="range"]');
      if (rangeEl) rangeEl.removeAttribute('tabindex');
    }
  } else if (DETAIL_IDS.indexOf(id) !== -1) {
    EST.useDetail = true;
    if (tag) {
      tag.textContent = '当前按细部累加';
      tag.style.color = '#facc15';
      tag.style.background = 'rgba(250,204,21,0.1)';
    }
    if (btnReset) btnReset.style.display = 'block';
    if (gkGroup) {
      gkGroup.classList.add('disabled');
      // 禁用键盘聚焦 range，避免 Tab+方向键绕过 pointer-events
      const rangeEl = gkGroup.querySelector('input[type="range"]');
      if (rangeEl) rangeEl.setAttribute('tabindex', '-1');
    }
  }
  // 其他基本参数：不改变 useDetail
}

let lastLoadData = null, lastWindData = null, lastSeisData = null;
let forcesSeis = [];

window.switchPanelTab = function(tabId, btn) {
  if (!btn) return;
  const panel = btn.closest('#panel');
  if (panel) panel.querySelectorAll('.panel-tab').forEach(b => b.classList.remove('on'));
  else document.querySelectorAll('.panel-tab').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.querySelectorAll('.panel-tab-content').forEach(el => el.style.display = 'none');
  const target = document.getElementById('panel-tab-' + tabId);
  if (target) target.style.display = 'flex';
};
let currentTabWind = 'dist';
let currentTabSeis = 'dist';
let currentWindDirView = 'X';

let tabRafId = null;
function switchTab(type, view, btn) {
  if (!btn) return;
  if (!lastWindData || !lastSeisData) return; // 首帧防护
  
  // 仅清除"同维度"的兄弟 tab 高亮：方向组（dirX/dirY）与视图组（dist/shear）分开
  const isDir = (view === 'dirX' || view === 'dirY');
  const parent = btn.parentElement;
  if (parent) {
    parent.querySelectorAll('.chart-tab').forEach(b => {
      const isDirBtn = b.dataset.group === 'dir';
      if (isDir === isDirBtn) b.classList.remove('on');
    });
  }
  btn.classList.add('on');

  // 视图状态在同步阶段立即更新，避免 rAF 被取消导致状态丢失
  if (type === 'wind') {
    if (isDir) currentWindDirView = view === 'dirX' ? 'X' : 'Y';
    else currentTabWind = view;
  } else {
    currentTabSeis = view;
  }
  
  // 用 rAF 合并快速连点，仅负责绘制
  if (tabRafId) cancelAnimationFrame(tabRafId);
  tabRafId = requestAnimationFrame(() => {
    try {
      if (type === 'wind') {
        const forces = currentWindDirView === 'X' ? lastWindData.X.forces : lastWindData.Y.forces;
        renderPlan();
        renderElevation();
        renderLoadChart('svg-wind', forces, '#38bdf8', `风荷载 (${currentWindDirView}向)`, currentTabWind);
      } else {
        if (forcesSeis.length) renderLoadChart('svg-seismic', forcesSeis, '#f87171', '地震作用', currentTabSeis);
      }
    } finally {
      tabRafId = null;
    }
  });
}

/* ================= 画平面图 ================= */
function renderPlan() {
  const host = document.getElementById('svg-plan');
  if (!host) return;
  const W = 400, H = 300;
  const w = EST.L, bPlan = EST.B;
  // 加大边距：左侧留给风向箭头，右侧留给 B 尺寸标注
  const marginL = 80, marginR = 90, marginT = 80, marginB = 60;
  const scale = Math.min((W - marginL - marginR) / w, (H - marginT - marginB) / bPlan);
  const rw = w * scale, rh = bPlan * scale;
  
  // 重新居中计算 xy
  const x = marginL + (W - marginL - marginR - rw) / 2;
  const y = marginT + (H - marginT - marginB - rh) / 2;

  // 风向指示箭头（约定：箭头指向 = 风压作用方向 = 坐标系正向）
  let windArrow = '';
  if (currentWindDirView === 'X') {
    // X 向风：尖端抵住左边框 (x)
    windArrow = `
      <path d="M${x-50} ${y+rh/2} L${x-15} ${y+rh/2}" stroke="#38bdf8" stroke-width="3"/>
      <polygon points="${x-15},${y+rh/2-6} ${x-15},${y+rh/2+6} ${x},${y+rh/2}" fill="#38bdf8"/>
      <text x="${x-30}" y="${y+rh/2-12}" fill="#38bdf8" font-size="13" font-weight="bold" text-anchor="middle">X向风</text>
    `;
  } else {
    // Y 向风：尖端抵住下边框 (y+rh)
    const yTail = y + rh + 45;
    windArrow = `
      <path d="M${x+rw/2} ${yTail} L${x+rw/2} ${y+rh+15}" stroke="#38bdf8" stroke-width="3"/>
      <polygon points="${x+rw/2-6},${y+rh+15} ${x+rw/2+6},${y+rh+15} ${x+rw/2},${y+rh}" fill="#38bdf8"/>
      <text x="${x+rw/2-15}" y="${yTail-5}" fill="#38bdf8" font-size="13" font-weight="bold" text-anchor="end">Y向风</text>
    `;
  }

  let svg = `<svg viewBox="0 0 ${W} ${H}">
    <defs><pattern id="g1" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(56,189,248,0.05)" stroke-width="1"/></pattern></defs>
    <rect width="${W}" height="${H}" fill="url(#g1)" />
    <text x="${W/2}" y="24" fill="#cbd5e1" font-size="14" font-family="'JetBrains Mono', monospace" text-anchor="middle">平面布置 · ${currentWindDirView}向风，迎风面宽 ${currentWindDirView === 'X' ? 'B=' + bPlan : 'L=' + w} m</text>
    
    <rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="rgba(30,41,59,0.4)" stroke="#38bdf8" stroke-width="2" stroke-dasharray="6,4"/>
    <path d="M${x} ${y+rh/2} L${x+rw} ${y+rh/2}" stroke="#64748b" stroke-width="1.5"/>
    <path d="M${x+rw/2} ${y} L${x+rw/2} ${y+rh}" stroke="#64748b" stroke-width="1.5"/>
    
    ${windArrow}

    <!-- 标注受风面宽度：L在上，B在右侧 -->
    <text x="${x+rw/2}" y="${y-20}" fill="#7dd3fc" font-size="14" font-family="'JetBrains Mono', monospace" text-anchor="middle">L = ${w} m</text>
    <text x="${x+rw+20}" y="${y+rh/2}" fill="#7dd3fc" font-size="14" font-family="'JetBrains Mono', monospace" text-anchor="middle" transform="rotate(-90 ${x+rw+20} ${y+rh/2})">B = ${bPlan} m</text>

    <!-- 左下角 XY 坐标系指示器 -->
    <g transform="translate(40, ${H - 30})">
      <!-- X 轴 -->
      <line x1="0" y1="0" x2="30" y2="0" stroke="#38bdf8" stroke-width="1.5" />
      <polygon points="30,0 25,-3 25,3" fill="#38bdf8" />
      <text x="35" y="4" fill="#38bdf8" font-size="12" font-family="'JetBrains Mono', monospace" font-weight="bold">X</text>
      
      <!-- Y 轴 -->
      <line x1="0" y1="0" x2="0" y2="-30" stroke="#38bdf8" stroke-width="1.5" />
      <polygon points="0,-30 -3,-25 3,-25" fill="#38bdf8" />
      <text x="-4" y="-35" fill="#38bdf8" font-size="12" font-family="'JetBrains Mono', monospace" font-weight="bold" text-anchor="middle">Y</text>
    </g>
  </svg>`;
  host.innerHTML = svg;
}

/* ================= 画立面网格 ================= */
function renderElevation() {
  const host = document.getElementById('svg-elevation');
  if (!host) return;
  const W = 400, H = 300;
  const Ht = EST.nLev * EST.h;
  // 立面宽度取决于是风从哪个方向吹（受荷面宽度）
  const w = currentWindDirView === 'X' ? EST.B : EST.L; 
  const marginL = 70, marginR = 60, marginT = 40, marginB = 40;
  const scale = Math.min((W - marginL - marginR) / w, (H - marginT - marginB) / Ht);
  const rw = w * scale, rh = Ht * scale;
  const x = marginL + (W - marginL - marginR - rw) / 2, y = H - marginB - rh;

  let lines = '';
  // 目标主线条数 ≈ 10~12 条，按 round(nLev/target) 平滑过渡，避免跳跃
  const targetMajor = 10;
  const lineStep = Math.max(1, Math.round(EST.nLev / targetMajor));
  for(let i=0; i<=EST.nLev; i++) {
    const ly = y + rh - (rh / EST.nLev) * i;
    const major = (i % lineStep === 0) || i === EST.nLev;
    lines += `<line x1="${x}" y1="${ly}" x2="${x+rw}" y2="${ly}" stroke="#38bdf8" stroke-width="${major ? 1.5 : 0.8}" opacity="${major ? 0.6 : 0.18}"/>`;
    if (major && i > 0) {
      const fontSize = Math.min(10, Math.max(8, (rh / EST.nLev) * 0.45));
      lines += `<text x="${x + rw + 4}" y="${ly + fontSize * 0.35}" fill="#64748b" font-size="${fontSize}" font-family="'JetBrains Mono', monospace">${i}F</text>`;
    }
  }

  let svg = `<svg viewBox="0 0 ${W} ${H}">
    <defs><pattern id="g2" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(56,189,248,0.05)" stroke-width="1"/></pattern></defs>
    <rect width="${W}" height="${H}" fill="url(#g2)" />
    <text x="${W/2}" y="24" fill="#cbd5e1" font-size="14" font-family="'JetBrains Mono', monospace" text-anchor="middle">立面网格示意</text>
    
    <line x1="${x}" y1="${y+rh}" x2="${x}" y2="${y}" stroke="#cbd5e1" stroke-width="2" />
    <line x1="${x+rw}" y1="${y+rh}" x2="${x+rw}" y2="${y}" stroke="#cbd5e1" stroke-width="2" />
    ${lines}
    
    <!-- 高度标注 -->
    <text x="${x-20}" y="${y+rh/2}" fill="#7dd3fc" font-size="14" font-family="'JetBrains Mono', monospace" text-anchor="middle" transform="rotate(-90 ${x-20} ${y+rh/2})">H = ${Ht.toFixed(1)} m</text>
    
    <!-- 受荷宽度标注 -->
    <text x="${x+rw/2}" y="${y+rh+24}" fill="#7dd3fc" font-size="14" font-family="'JetBrains Mono', monospace" text-anchor="middle">受荷宽 = ${w} m</text>
  </svg>`;
  host.innerHTML = svg;
}

/* ================= 画荷载分布 / 剪力图 ================= */
function renderLoadChart(targetId, forces, color, title, view) {
  const host = document.getElementById(targetId);
  if (!host) return;
  if (!Array.isArray(forces) || forces.length === 0) {
    host.innerHTML = '';
    return;
  }
  forces = forces.map(v => Number.isFinite(v) ? v : 0);
  const W = 400, H = 300;
  const marginL = 70, marginR = 80, marginT = 50, marginB = 50;
  const plotW = W - marginL - marginR;
  const plotH = H - marginT - marginB;
  
  let values = [];
  let maxV = 1;
  if (view === 'dist') {
    values = [...forces];
    maxV = Math.max(1, ...values.map(v => Math.abs(v)));
  } else {
    let sum = 0;
    for (let i = forces.length - 1; i >= 0; i--) {
      sum += forces[i];
      values[i] = sum;
    }
    maxV = Math.max(1, ...values.map(v => Math.abs(v)));
  }

  const n = values.length;
  const stepY = plotH / n;
  const yBase = H - marginB;
  
  const xTicks = 4;
  let gridLines = '';
  let axisTexts = '';
  for (let i = 0; i <= xTicks; i++) {
    const tickVal = (maxV / xTicks) * i;
    const tickX = marginL + (plotW / xTicks) * i;
    gridLines += `<line x1="${tickX}" y1="${marginT}" x2="${tickX}" y2="${yBase}" stroke="#334155" stroke-dasharray="2,4" opacity="0.5"/>`;
    const txt = tickVal >= 10 ? Math.round(tickVal) : tickVal.toFixed(1);
    axisTexts += `<text x="${tickX}" y="${H - marginB + 20}" fill="#64748b" font-size="10" text-anchor="middle" font-family="'JetBrains Mono', monospace">${txt}</text>`;
  }

  let bars = '';
  let texts = '';
  
  for(let i=0; i<n; i++) {
    const val = values[i];
    const cy = yBase - stepY * (i + 0.5);
    const len = Math.max(1, Math.abs(val / maxV) * plotW);
    const barH = Math.min(24, Math.max(2, stepY * 0.7));
    
    bars += `<g>
      <title>${i+1}F: ${val.toFixed(1)} kN</title>
      <rect x="${marginL}" y="${cy - barH/2}" width="${len}" height="${barH}" fill="${color}" opacity="0.8" rx="2"/>
    </g>`;
    
    const isZero = Math.abs(val) < 0.05;
    const valText = maxV < 10 ? val.toFixed(1) : Math.round(val).toString();
    // 层间距过小时隐藏数值，避免 >40 层文字重叠
    const showValText = !isZero && stepY >= 10;
    if (showValText) {
      const isInside = len > 40;
      const txtX = isInside ? (marginL + len - 8) : (marginL + len + 8);
      const txtAnchor = isInside ? 'end' : 'start';
      const txtColor = isInside ? '#0f172a' : '#cbd5e1';
      const fontSize = Math.max(9, Math.min(13, stepY * 0.7));
      texts += `<text x="${txtX}" y="${cy + fontSize * 0.35}" fill="${txtColor}" font-size="${fontSize}" font-weight="900" text-anchor="${txtAnchor}" font-family="'JetBrains Mono', monospace" pointer-events="none">${valText}</text>`;
    }

    const labelStep = Math.max(1, Math.ceil(14 / Math.max(stepY, 1)));
    // 避免末尾两个标签重叠：i===n-2 时若非对齐点则跳过
    const isSecondLast = (i === n - 2);
    let showLabel = n <= 15 || stepY >= 14 || i === 0 || i === n - 1 || i % labelStep === 0;
    if (showLabel && isSecondLast && (n - 1) % labelStep !== 0) showLabel = false;
    if (showLabel) {
      const floorFontSize = Math.max(8, Math.min(11, stepY * 0.5));
      texts += `<text x="${marginL - 10}" y="${cy+4}" fill="#64748b" font-size="${floorFontSize}" text-anchor="end">${i+1}F</text>`;
    }
  }

  const labelTxt = view === 'dist' ? `${title} (kN)` : `${title} 层剪力 (kN)`;

  let svg = `<svg viewBox="0 0 ${W} ${H}">
    <defs><pattern id="g-${targetId}-${view}" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(56,189,248,0.05)" stroke-width="1"/></pattern></defs>
    <rect width="${W}" height="${H}" fill="url(#g-${targetId}-${view})" />
    
    ${gridLines}
    
    <line x1="${marginL}" y1="${marginT}" x2="${marginL}" y2="${yBase}" stroke="#64748b" stroke-width="1.5" />
    <line x1="${marginL}" y1="${yBase}" x2="${W - marginR}" y2="${yBase}" stroke="#64748b" stroke-width="1.5" />
    
    ${bars}
    ${texts}
    ${axisTexts}
    
    <text x="20" y="${H/2}" fill="${color}" font-size="13" font-family="'JetBrains Mono', monospace" font-weight="bold" text-anchor="middle" transform="rotate(-90 20 ${H/2})">${labelTxt}</text>
  </svg>`;
  host.innerHTML = svg;
}

/* ================= 主更新逻辑 ================= */
function updateEst() {
  // 参数读取：动态使用滑块当前 min/max/step（唯一事实来源），避免硬编码与 UI 脱节
  const readRange = (id, def, min, max) => {
    const el = document.getElementById('in-' + id);
    if (!el) return def;
    const rEl = document.getElementById('range-' + id);
    if (rEl) {
      const mn = parseFloat(rEl.min);
      const mx = parseFloat(rEl.max);
      if (Number.isFinite(mn)) min = mn;
      if (Number.isFinite(mx)) max = mx;
    }
    let v = parseFloat(el.value);
    if (!Number.isFinite(v)) return def;
    v = Math.max(min, Math.min(max, v));
    if (rEl) {
      const st = parseFloat(rEl.step);
      if (Number.isFinite(st) && st > 0) {
        v = Math.round((v - min) / st) * st + min;
        v = Math.max(min, Math.min(max, parseFloat(v.toFixed(6))));
      }
    }
    return v;
  };
  const readSelect = (id, def) => {
    const el = document.getElementById('in-' + id);
    return el && el.value !== '' ? el.value : def;
  };

  EST.nLev = Math.round(readRange('nLev', 5, 1, 50));
  EST.h = readRange('h', 3.6, 2, 6);
  EST.L = readRange('L', 30, 10, 100);
  EST.B = readRange('B', 15, 10, 100);
  EST.qk = readRange('qk', 2.0, 1.5, 10.0);
  
  EST.w0 = readRange('w0', 0.3, 0, 1.0);
  EST.terrain = readSelect('terrain', 'B');
  EST.intensity = readSelect('intensity', '7-0.10');

  EST.structType = readSelect('structType', 'frame');
  EST.siteClass = readSelect('siteClass', 'II');
  EST.seismicGroup = readSelect('seismicGroup', '2');
  EST.C_period = readRange('C_period', 0.020, 0.008, 0.025);
  EST.psiT = readRange('psiT', 0.65, 0.5, 1.0);
  
  EST.gkBase = readRange('gkBase', 11.0, 5.0, 30.0);
  EST.cwThk = readRange('cwThk', 200, 160, 400);
  EST.cwRatio = readRange('cwRatio', 0.15, 0.05, 0.30);
  EST.masThk = readRange('masThk', 240, 120, 370);
  EST.masRatio = readRange('masRatio', 0.30, 0.15, 0.45);
  const sbmEl = document.getElementById('in-steelBeamMain');
  if (sbmEl) EST.steelBeamMain = sbmEl.value;
  const sbsEl = document.getElementById('in-steelBeamSec');
  if (sbsEl) EST.steelBeamSec = sbsEl.value;
  EST.steelColThk = readRange('steelColThk', 20, 4, 40);
  EST.qWallSteel = readRange('qWallSteel', 3.0, 0, 8);
  
  EST.Lx = readRange('Lx', 8, 4, 15);
  EST.Ly = readRange('Ly', 8, 4, 15);
  EST.tSlab = readRange('tSlab', 100, 80, 200);
  EST.qArch = readRange('qArch', 1.5, 0.5, 3.0);
  EST.bBeam = readRange('bBeam', 250, 200, 400);
  EST.hBeam = readRange('hBeam', 600, 400, 1000);
  EST.tWall = readRange('tWall', 200, 100, 370);
  EST.qWallDensity = readRange('qWallDensity', 19.0, 5, 25);
  EST.wallRatio = readRange('wallRatio', 50, 0, 100);
  EST.muN = readRange('muN', 0.8, 0.5, 0.9);
  EST.bSecBeam = readRange('bSecBeam', 200, 150, 400);
  EST.hSecBeam = readRange('hSecBeam', 500, 300, 800);
  EST.secBeamSpacing = readRange('secBeamSpacing', 2.5, 1.5, 4.0);
  const bmEl = document.getElementById('in-beamModel');
  if (bmEl) EST.beamModel = bmEl.value;

  lastLoadData = calcLoad();
  
  // 细部模式下，gkBase 数字框与滑块同步到 g_detail（超出滑块范围时按滑块 min/max 钳制）
  if (EST.useDetail) {
    const displayGk = lastLoadData.g_detail.toFixed(1);
    const gkNum = document.getElementById('in-gkBase');
    const gkRange = document.getElementById('range-gkBase');
    if (gkNum) gkNum.value = displayGk;
    if (gkRange) {
      const mn = parseFloat(gkRange.min);
      const mx = parseFloat(gkRange.max);
      const v = Math.max(mn, Math.min(mx, parseFloat(displayGk)));
      gkRange.value = v;
      if (Number.isFinite(mn) && Number.isFinite(mx) && mx > mn) {
        const pct = ((v - mn) / (mx - mn)) * 100;
        gkRange.style.background = `linear-gradient(to right, #38bdf8 0%, #38bdf8 ${pct}%, #334155 ${pct}%, #334155 100%)`;
      }
    }
  }

  lastWindData = calcWind();
  lastSeisData = calcSeismic(lastLoadData.Geq);

  // 更新左侧数据（使用可选链防止空指针引发中断）
  const setTxt = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setTxt('r-gk', Math.round(lastLoadData.Gk) + ' kN');
  setTxt('r-qk', Math.round(lastLoadData.Qk) + ' kN');
  setTxt('r-GE', Math.round(lastLoadData.GE) + ' kN');
  setTxt('r-VwX', Math.round(lastWindData.X.Vw) + ' kN');
  setTxt('r-VwY', Math.round(lastWindData.Y.Vw) + ' kN');
  setTxt('r-FEk', Math.round(lastSeisData.FEk) + ' kN');
  const isFrame = EST.structType === 'frame' || EST.structType === 'frameShear';
  if ((isFrame || EST.structType === 'steel') && lastLoadData.col_str) {
    const isSteelWarn = (EST.structType === 'steel' && lastLoadData.colOverLimit);
    setTxt('r-colSize', lastLoadData.col_str + (isSteelWarn ? ' ⚠️' : ''));
    let colCalcTxt;
    const minConstruct = (EST.structType === 'steel') ? 200 : 300;
    if (lastLoadData.colOverLimit) colCalcTxt = '(超 1500，请复核)';
    else if (lastLoadData.col_side_calc < minConstruct) colCalcTxt = '(需' + Math.round(lastLoadData.col_side_calc) + ', 按构造≥' + minConstruct + ')';
    else colCalcTxt = '(需' + Math.round(lastLoadData.col_side_calc) + ', 取整至 ' + lastLoadData.col_side + ')';
    setTxt('r-colCalc', colCalcTxt);
  } else {
    setTxt('r-colSize', '—');
    setTxt('r-colCalc', '(不适用)');
  }

  const isMasonry = lastSeisData.structType === 'masonry';
  setTxt('r-T1', isMasonry ? '—' : (Number.isFinite(lastSeisData.T1) ? lastSeisData.T1.toFixed(3) + ' s' : '—'));
  setTxt('r-Tcalc', isMasonry ? '—' : (Number.isFinite(lastSeisData.T_calc) ? lastSeisData.T_calc.toFixed(3) + ' s' : '—'));
  setTxt('r-Tg', isMasonry ? '—' : (Number.isFinite(lastSeisData.Tg) ? lastSeisData.Tg.toFixed(2) + ' s' : '—'));
  setTxt('r-alpha1', Number.isFinite(lastSeisData.alpha_1)
    ? (lastSeisData.alpha_1 >= 0.001 ? lastSeisData.alpha_1.toFixed(3) : lastSeisData.alpha_1.toExponential(2))
    : '—');

  const warnEl = document.getElementById('masonry-warn');
  if (warnEl) {
    if (isMasonry && lastSeisData.warning) {
      warnEl.textContent = lastSeisData.warning;
      warnEl.style.display = 'block';
    } else {
      warnEl.style.display = 'none';
    }
  }
  
  const isSeisCtrlX = lastSeisData.FEk > lastWindData.X.Vw;
  const isSeisCtrlY = lastSeisData.FEk > lastWindData.Y.Vw;
  const ctrlElX = document.getElementById('r-control-x');
  if (ctrlElX) {
    ctrlElX.textContent = isSeisCtrlX ? '地震控制' : '风荷载控制';
    ctrlElX.style.color = isSeisCtrlX ? '#f87171' : '#4ade80';
  }
  const ctrlElY = document.getElementById('r-control-y');
  if (ctrlElY) {
    ctrlElY.textContent = isSeisCtrlY ? '地震控制' : '风荷载控制';
    ctrlElY.style.color = isSeisCtrlY ? '#f87171' : '#4ade80';
  }

  // 规范校验尺更新（按结构类型分档，口径 = 单位面积重力荷载标准值 = 恒+活）
  const gStd = lastLoadData.g_std;
  const gStdEl = document.getElementById('r-g-std');
  if (gStdEl) {
    const RANGE = {
      frame:      [12, 14],
      frameShear: [12, 14],
      wall:       [13, 16],
      masonry:    [12, 15],
      steel:      [7, 12],
    };
    const st = EST.structType || 'frame';
    const rng = RANGE[st] || [12, 14];
    const minV = rng[0];
    const maxV = rng[1];
    gStdEl.textContent = gStd.toFixed(1) + ' kN/m²（参考 ' + minV + '~' + maxV + '）';
    if (gStd >= minV && gStd <= maxV) {
      gStdEl.textContent += ' ✅ 在合理区间';
      gStdEl.style.color = '#4ade80';
    } else {
      gStdEl.textContent += (gStd > maxV ? ' ⚠️ 偏高' : ' ⚠️ 偏低');
      gStdEl.style.color = '#facc15';
    }
  }

  // 逐层地震力由 calcSeismic 统一计算并返回，UI 直接复用，避免图表与计算书口径漂移
  forcesSeis = Array.isArray(lastSeisData.forces) ? lastSeisData.forces.slice() : [];

  // 绘图
  renderPlan();
  renderElevation();
  renderLoadChart('svg-wind', lastWindData[currentWindDirView].forces, '#38bdf8', `风荷载 (${currentWindDirView}向)`, currentTabWind);
  renderLoadChart('svg-seismic', forcesSeis, '#f87171', '地震作用', currentTabSeis);
}

/* 详情模态框 */
window.showDetail = function(type) {
  if (!lastLoadData || !lastWindData || !lastSeisData) {
    alert('计算尚未完成，请稍后重试。');
    return;
  }
  const modal = document.getElementById('modal-detail');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  
  const exportBtn = `<div style="text-align:right; margin-bottom:12px;"><button type="button" onclick="exportWord()" style="background:rgba(56,189,248,0.1); border:1px solid #38bdf8; color:#38bdf8; padding:6px 12px; border-radius:4px; cursor:pointer;">📥 导出 Word</button></div>`;

  if (type === 'all') {
    title.textContent = '全量计算书 (重力 / 风 / 地震)';
    body.innerHTML = exportBtn + `
      <div style="margin-bottom:16px; padding-bottom:16px; border-bottom:1px dashed #334155;">
        <h4 style="color:#4ade80; margin-bottom:8px;">🏢 重力荷载估算</h4>
        ${lastLoadData.html}
      </div>
      <div style="margin-bottom:16px; padding-bottom:16px; border-bottom:1px dashed #334155;">
        <h4 style="color:#38bdf8; margin-bottom:8px;">🌬️ 风荷载估算 (X向)</h4>
        ${lastWindData.X.html}
        <br><h4 style="color:#38bdf8; margin-bottom:8px;">🌬️ 风荷载估算 (Y向)</h4>
        ${lastWindData.Y.html}
      </div>
      <div>
        <h4 style="color:#f87171; margin-bottom:8px;">🌍 地震作用估算</h4>
        ${lastSeisData.html}
      </div>
    `;
  } else if (type === 'load') {
    title.textContent = '重力荷载计算书';
    body.innerHTML = exportBtn + lastLoadData.html;
  } else if (type === 'horz') {
    title.textContent = '水平荷载计算书 (风 / 震)';
    body.innerHTML = exportBtn + `
      <div style="margin-bottom:16px; padding-bottom:16px; border-bottom:1px dashed #334155;">
        <h4 style="color:#38bdf8; margin-bottom:8px;">🌬️ 风荷载估算 (X向)</h4>
        ${lastWindData.X.html}
        <br><h4 style="color:#38bdf8; margin-bottom:8px;">🌬️ 风荷载估算 (Y向)</h4>
        ${lastWindData.Y.html}
      </div>
      <div>
        <h4 style="color:#f87171; margin-bottom:8px;">🌍 地震作用估算</h4>
        ${lastSeisData.html}
      </div>
    `;
  }
  modal.classList.add('open');
};

window.exportWord = function() {
  const content = document.getElementById('modal-body').innerHTML;
  // 去除导出按钮和可能引起乱码的特殊表情符号
  let cleanContent = content.replace(/<div style="text-align:right;[^>]*><button[^>]*>.*?<\/button><\/div>/, '');
  // 移除 BMP 外字符（emoji 等 surrogate pair）以及常见符号（⚠️/✅ 等），用 u 标志匹配真实码点
    // 仅移除补充符号平面中的 emoji 与变体选择符 FE0F；
  // 保留 \u2600-\u27BF 中的 ★☆☐ 等中文技术文档常用符号
  cleanContent = cleanContent.replace(/[\u{1F000}-\u{1FFFF}\u{FE0F}]/gu, '');
  
  const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>计算书</title><style>body { font-family: 'Microsoft YaHei', 'PingFang SC', SimSun, sans-serif; font-size: 14px; line-height: 1.6; } b { color: #000; } h4 { margin-top: 16px; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }</style></head><body>`;
  const footer = `</body></html>`;
  
  const html = header + cleanContent + footer;
  // 加入 \ufeff 作为 BOM 头，确保 Word 100% 识别为 UTF-8 编码
  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `结构量级估算书_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.doc`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
};

// 封装统一的 rAF 节流更新函数
let uiRafId = null;
function triggerUpdate() {
  if (uiRafId) return;
  uiRafId = requestAnimationFrame(() => {
    try {
      // 计算成功前清理旧错误横幅，避免恢复后仍显示
      const staleBanner = document.getElementById('est-error-banner');
      if (staleBanner) staleBanner.remove();
      updateEst();
    } catch (err) {
      console.error('[updateEst] 计算异常:', err);
      // 在结果区加错误横幅，避免数值静默停留旧值
      const host = document.getElementById('result');
      if (host) {
        let banner = document.getElementById('est-error-banner');
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'est-error-banner';
          banner.style.cssText = 'position:absolute; top:12px; left:50%; transform:translateX(-50%); background:rgba(248,113,113,0.15); border:1px solid #f87171; color:#fca5a5; padding:8px 16px; border-radius:6px; font-size:12px; z-index:100;';
          host.appendChild(banner);
        }
        banner.textContent = '⚠️ 计算异常，请刷新页面或检查参数：' + (err.message || err);
      }
    } finally {
      uiRafId = null;
    }
  });
}

// 仅针对基本参数下拉框绑定全局监听
IDS.forEach(id => {
  const el = document.getElementById('in-' + id);
  if (el) {
    el.addEventListener('input', triggerUpdate);
  }
});

// 梁系模型属于细部参数，需要单独绑定 useDetail 切换
const bmElGlobal = document.getElementById('in-beamModel');
if (bmElGlobal) {
  bmElGlobal.addEventListener('change', () => {
    updateUseDetailFlag('beamModel');
    triggerUpdate();
  });
}
['steelBeamMain', 'steelBeamSec'].forEach(id => {
  const el = document.getElementById('in-' + id);
  if (el) {
    el.addEventListener('change', () => {
      updateUseDetailFlag(id);
      triggerUpdate();
    });
  }
});

/* ================= 滑块双向绑定与样式同步逻辑 ================= */
let slidersInitialized = false;
function initSliders() {
  if (slidersInitialized) return;
  slidersInitialized = true;
  const params = [
    { id: 'w0', min: 0, max: 1.0, step: 0.05 },
    { id: 'C_period', min: 0.008, max: 0.025, step: 0.001 },
    { id: 'psiT', min: 0.5, max: 1.0, step: 0.05 },
    { id: 'gkBase', min: 5, max: 30, step: 0.5 },
    { id: 'cwThk', min: 160, max: 400, step: 10 },
    { id: 'cwRatio', min: 0.05, max: 0.30, step: 0.01 },
    { id: 'masThk', min: 120, max: 370, step: 10 },
    { id: 'masRatio', min: 0.15, max: 0.45, step: 0.01 },
    { id: 'steelColThk', min: 4, max: 40, step: 2 },
    { id: 'qWallSteel', min: 0, max: 8, step: 0.5 },
    { id: 'nLev', min: 1, max: 50, step: 1 },
    { id: 'h', min: 2, max: 6, step: 0.1 },
    { id: 'L', min: 10, max: 100, step: 1 },
    { id: 'B', min: 10, max: 100, step: 1 },
    { id: 'qk', min: 1.5, max: 10.0, step: 0.5 },
    { id: 'Lx', min: 4, max: 15, step: 0.1 },
    { id: 'Ly', min: 4, max: 15, step: 0.1 },
    { id: 'tSlab', min: 80, max: 200, step: 10 },
    { id: 'qArch', min: 0.5, max: 3.0, step: 0.1 },
    { id: 'bBeam', min: 200, max: 400, step: 50 },
    { id: 'hBeam', min: 400, max: 1000, step: 50 },
    { id: 'tWall', min: 100, max: 370, step: 10 },
    { id: 'qWallDensity', min: 5, max: 25, step: 0.5 },
    { id: 'wallRatio', min: 0, max: 100, step: 5 },
    { id: 'muN', min: 0.5, max: 0.9, step: 0.05 },
    { id: 'bSecBeam', min: 150, max: 400, step: 50 },
    { id: 'hSecBeam', min: 300, max: 800, step: 50 },
    { id: 'secBeamSpacing', min: 1.5, max: 4.0, step: 0.1 }
  ];

  params.forEach(p => {
    const numEl = document.getElementById('in-' + p.id);
    const rangeEl = document.getElementById('range-' + p.id);
    
    if (!numEl || !rangeEl) return;

    const clampStep = (raw) => {
      let mn = parseFloat(rangeEl.min);
      let mx = parseFloat(rangeEl.max);
      const st = parseFloat(rangeEl.step) || p.step || 1;
      if (!Number.isFinite(mn)) mn = p.min;
      if (!Number.isFinite(mx)) mx = p.max;
      let v = parseFloat(raw);
      if (!Number.isFinite(v)) v = mn;
      v = Math.max(mn, Math.min(mx, v));
      if (st) v = Math.round((v - mn) / st) * st + mn;
      return Math.max(mn, Math.min(mx, parseFloat(v.toFixed(6))));
    };

    // 动态更新轨道左侧亮蓝色的百分比
    const updateBg = (val) => {
      const mn = parseFloat(rangeEl.min);
      const mx = parseFloat(rangeEl.max);
      if (!Number.isFinite(mn) || !Number.isFinite(mx) || mx === mn) return;
      const pct = ((val - mn) / (mx - mn)) * 100;
      if (!Number.isFinite(pct)) return;
      rangeEl.style.background = `linear-gradient(to right, #38bdf8 0%, #38bdf8 ${pct}%, #334155 ${pct}%, #334155 100%)`;
    };

    // 初始化背景
    updateBg(parseFloat(numEl.value));

    // 1. 滑块拖动 -> 更新数字框、同步 useDetail、触发计算
    rangeEl.addEventListener('input', (e) => {
      const grp = numEl.closest('.slider-group');
      if (grp && grp.classList.contains('disabled')) return;
      numEl.value = e.target.value;
      updateBg(e.target.value);
      updateUseDetailFlag(p.id);
      triggerUpdate();
    });

    // 2. 数字框手动输入 -> 更新滑块、同步 useDetail、触发计算
    // 注意：gkBase 的 group 在细部模式下为 disabled，但允许输入以退出细部模式
    numEl.addEventListener('input', (e) => {
      const grp = numEl.closest('.slider-group');
      const isGkBase = (p.id === 'gkBase');
      if (grp && grp.classList.contains('disabled') && !isGkBase) return;
      if (e.target.value.trim() === '') {
        triggerUpdate();
        return;
      }
      const val = clampStep(e.target.value);
      rangeEl.value = val;
      updateBg(val);
      // 输入过程中仅同步滑块位置；模式切换与重算交给 blur / Enter，避免逐字符抖动
    });
    // 输入框取消浏览器自动恢复，避免刷新后与内部状态不一致
    numEl.setAttribute('autocomplete', 'off');
    
    // 3. 数字框失去焦点时，强制修正回合法范围并按 step 量化
    numEl.addEventListener('blur', (e) => {
      const grp = numEl.closest('.slider-group');
      const isGkBase = (p.id === 'gkBase');
      if (grp && grp.classList.contains('disabled') && !isGkBase) {
        e.target.value = rangeEl.value;
        return;
      }
      const val = clampStep(e.target.value);
      e.target.value = val;
      rangeEl.value = val;
      updateBg(val);
      updateUseDetailFlag(p.id);
      triggerUpdate();
    });
    // Enter 立即触发 blur，避免越界值在 UI 上停留
    numEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        numEl.blur();
      }
    });
  });
}

// 恢复 gkBase 到规范默认值
const btnGkReset = document.getElementById('btn-gk-reset');
if (btnGkReset) {
  btnGkReset.addEventListener('click', () => {
    const type = document.getElementById('in-structType').value;
    // 预留 steelRate 入口，当前 HTML 无该输入，显式传 NaN 让 calcDefaultGkBase 回退到经验值
    const tSlabV = parseFloat((document.getElementById('in-tSlab') || {}).value);
    const baseVal = calcDefaultGkBase(type, EST.nLev, NaN, tSlabV);
    
    const gkNum = document.getElementById('in-gkBase');
    const gkRange = document.getElementById('range-gkBase');
    if (gkNum && gkRange) {
      gkNum.value = baseVal.toFixed(1);
      gkRange.value = baseVal.toFixed(1);
      const mn = parseFloat(gkRange.min);
      const mx = parseFloat(gkRange.max);
      if (Number.isFinite(mn) && Number.isFinite(mx) && mx > mn) {
        const pct = ((baseVal - mn) / (mx - mn)) * 100;
        gkRange.style.background = `linear-gradient(to right, #38bdf8 0%, #38bdf8 ${pct}%, #334155 ${pct}%, #334155 100%)`;
      }
    }
    
    updateUseDetailFlag('gkBase');
    triggerUpdate();
  });
}

// 增加点击遮罩层关闭弹窗的交互
document.getElementById('modal-detail').addEventListener('click', function(e) {
  if (e.target === this) this.classList.remove('open');
});
document.getElementById('modal-usage').addEventListener('click', function(e) {
  if (e.target === this) this.classList.remove('open');
});
// ESC 关闭任意打开的模态框
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  }
});

/* ================= 结构类型联动 ================= */
function calcDefaultGkBase(type, nLev, steelRate, tSlab) {
  // nLev 当前未使用，保留参数位以备未来按层数细分基准值
  // gkBase 为纯恒载，需保证 gkBase + qk 落在高规 5.1.8 总重力区间
  let baseVal = 11.0; // 框架默认 11，配合活载 2.0 -> 总重力 13.0
  if (type === 'frameShear') baseVal = 11.0;
  else if (type === 'wall') baseVal = 12.0; // 剪力墙默认 12，配合活载 2.0 -> 总重力 14.0
  else if (type === 'masonry') baseVal = 12.0;
  else if (type === 'steel') {
    // steelRate 为预留参数入口；当前 HTML 未提供该输入，调用方显式传 NaN，回退到经验值。
    // 65 kg/m² 为“含梁柱的综合用钢量”经验值（范围 40~100），与细部模式
    // g_beam+g_col 折算的用钢量量级一致，切换宏观/细部模式时 gk 不应出现量级跳变。
    const DEFAULT_STEEL_RATE = 65;
    const steelRateSafe = Number.isFinite(steelRate) ? steelRate : DEFAULT_STEEL_RATE;
    const tSlabSafe = Number.isFinite(tSlab) ? tSlab : 100;
    // 钢结构：用钢量 + 板 + 做法 + 墙，纯恒载通常在 8 左右
    baseVal = steelRateSafe * 9.8 / 1000 + (tSlabSafe / 1000) * 25 + 1.5 + 1.5 + 1.0;
  }
  return Math.round(baseVal / 0.5) * 0.5;
}

function applyStructTypeDefaults() {
  const typeEl = document.getElementById('in-structType');
  if (!typeEl) return;
  const type = typeEl.value;
  // 先同步关键 DOM 到 EST，避免浏览器表单恢复后 EST.nLev 与 DOM 不一致
  const nLevEl = document.getElementById('in-nLev');
  if (nLevEl) {
    const v = parseInt(nLevEl.value, 10);
    if (Number.isFinite(v) && v > 0) EST.nLev = v;
  }
  const cfg = STRUCT_CFG[type] || STRUCT_CFG.frame;
  const isMasonry = type === 'masonry';
  const isSteel = type === 'steel';
  const isFrame = type === 'frame' || type === 'frameShear';
  const isWall = type === 'wall';

  const cGroup = document.getElementById('group-C_period');
  const pGroup = document.getElementById('group-psiT');
  if (cGroup) cGroup.style.display = isMasonry ? 'none' : '';
  if (pGroup) pGroup.style.display = isMasonry ? 'none' : '';

  // 砌体不使用周期估算，但需把滑块 min/max/value 复位到框架默认区间，
  // 避免从钢结构（0.075~0.100）切到砌体后残留脏区间被 readRange 读取，
  // 把 EST.C_period 钳制到错误范围。程序设 value 不触发 input 事件，不会引发重算。
  if (isMasonry) {
    const cRangeReset = document.getElementById('range-C_period');
    const cNumReset = document.getElementById('in-C_period');
    if (cRangeReset && cNumReset) {
      cRangeReset.min = 0.008; cRangeReset.max = 0.025; cRangeReset.step = 0.001;
      cNumReset.min = 0.008; cNumReset.max = 0.025; cNumReset.step = 0.001;
      cRangeReset.value = 0.020; cNumReset.value = '0.020';
    }
  }

  // 控制细部参数面板显隐
  const show = (id, cond) => { const el = document.getElementById(id); if(el) el.style.display = cond ? '' : 'none'; };
  const showEl = (id, cond) => { const el = document.getElementById(id); if(el) el.style.display = cond ? '' : 'none'; };
  
  show('group-plan', isFrame || isSteel);
  show('group-frame', isFrame || isSteel); // 梁/墙都在里面，共用容器
  show('group-col', isFrame || isSteel);   // 轴压比共用
  const muNLabel = document.getElementById('label-muN');
  if (muNLabel) muNLabel.textContent = isSteel ? '强度利用率 μ (钢结构)' : '预估轴压比（柱截面估算）';
  show('group-secBeam', isFrame || isSteel);
  show('group-cw', type === 'frameShear' || isWall);
  show('group-masonry', isMasonry);
  show('group-steel', isSteel);

  // 内部构件显隐
  showEl('col-bBeam', isFrame);
  showEl('col-hBeam', isFrame);
  showEl('col-steelBeamMain', isSteel);
  
  showEl('col-bSecBeam', isFrame);
  showEl('col-hSecBeam', isFrame);
  showEl('col-steelBeamSec', isSteel);
  
  showEl('col-tWall', isFrame);
  showEl('col-qWallDensity', isFrame);
  showEl('col-wallRatio', isFrame);
  showEl('group-steel-col', isSteel);

  // 自动更新 gkBase 宏观基准值及提示
  // 注意：gkBase 口径 = 单位面积重力荷载标准值（恒+活，GB50011 5.1.3）
  // 切换结构类型时退出细部模式
  EST.useDetail = false;
  // 框架 / 框剪：高规 5.1.8 综合值 12~14；剪力墙 13~16；砌体 12~15；钢结构 7~12（含组合楼板）
  const tSlabV = parseFloat((document.getElementById('in-tSlab') || {}).value);
  const baseVal = calcDefaultGkBase(type, EST.nLev, NaN, tSlabV);
  
  let hintText = '纯恒载：9~12（高规 5.1.8 总重力 12~14 扣除活载）';
  if (type === 'frameShear') { hintText = '纯恒载：9~12（高规 5.1.8 总重力 12~14 扣除活载）'; }
  else if (isWall) { hintText = '纯恒载：10~13（高规 5.1.8 总重力 13~16 扣除活载）'; }
  else if (isMasonry) { hintText = '纯恒载：9~12（砌体墙较重）'; }
  else if (isSteel) { hintText = '纯恒载：用钢量 + 组合楼板 + 建筑做法 + 围护墙'; }

  // 复用 updateUseDetailFlag('gkBase') 的清理逻辑（含 tag 复位、按钮隐藏、解除禁用），避免与函数内逻辑漂移
  updateUseDetailFlag('gkBase');
  const gkNum = document.getElementById('in-gkBase');
  const gkRange = document.getElementById('range-gkBase');
  if (gkNum && gkRange) {
    gkNum.value = baseVal.toFixed(1);
    gkRange.value = baseVal.toFixed(1);
    const mn = parseFloat(gkRange.min);
    const mx = parseFloat(gkRange.max);
    if (Number.isFinite(mn) && Number.isFinite(mx) && mx > mn) {
      const pct = ((baseVal - mn) / (mx - mn)) * 100;
      if (Number.isFinite(pct)) {
        gkRange.style.background = `linear-gradient(to right, #38bdf8 0%, #38bdf8 ${pct}%, #334155 ${pct}%, #334155 100%)`;
      }
    }
  }
  const gkHint = document.getElementById('gk-hint');
  if (gkHint) gkHint.textContent = hintText;

  const cRange = document.getElementById('range-C_period');
  const cNum = document.getElementById('in-C_period');
  const pRange = document.getElementById('range-psiT');
  const pNum = document.getElementById('in-psiT');
  const cLabel = document.getElementById('label-C_period');

  if (!isMasonry && cRange && cNum) {
    if (cfg.p === 1) {
      cRange.min = 0.008; cRange.max = 0.025; cRange.step = 0.001;
      cNum.min = 0.008; cNum.max = 0.025; cNum.step = 0.001;
    } else if (cfg.p === 0.75) {
      cRange.min = 0.075; cRange.max = 0.100; cRange.step = 0.001;
      cNum.min = 0.075; cNum.max = 0.100; cNum.step = 0.001;
    }
    cRange.value = cfg.C;
    cNum.value = cfg.C.toFixed(3);
    const pct = ((cfg.C - parseFloat(cRange.min)) / (parseFloat(cRange.max) - parseFloat(cRange.min))) * 100;
    cRange.style.background = `linear-gradient(to right, #38bdf8 0%, #38bdf8 ${pct}%, #334155 ${pct}%, #334155 100%)`;
    if (cLabel) cLabel.textContent = cfg.p === 0.75 ? '钢结构周期经验系数 C' : '周期估算系数 C';
  }

  if (!isMasonry && pRange && pNum) {
    pRange.value = cfg.psiT;
    pNum.value = cfg.psiT.toFixed(2);
    const pct = ((cfg.psiT - 0.5) / 0.5) * 100;
    pRange.style.background = `linear-gradient(to right, #38bdf8 0%, #38bdf8 ${pct}%, #334155 ${pct}%, #334155 100%)`;
  }

  triggerUpdate();
}

const structTypeEl = document.getElementById('in-structType');
if (structTypeEl) structTypeEl.addEventListener('change', applyStructTypeDefaults);

/* ================= 使用说明弹窗 Tab 切换 ================= */
window.switchUsageTab = function(tabId, btn) {
  if (!btn) return;
  document.querySelectorAll('.usage-tab').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  
  document.querySelectorAll('.usage-tab-content').forEach(el => el.style.display = 'none');
  const target = document.getElementById('usage-tab-' + tabId);
  if (target) target.style.display = 'block';
};

// 启动：先初始化滑块，再按当前结构类型同步面板与参数，最后计算
initSliders();
applyStructTypeDefaults();