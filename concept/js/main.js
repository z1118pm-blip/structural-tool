(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const format = value => Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 });

  // One shared catalogue keeps every chapter header compact as the course grows.
  const courseSections = [
    { file: 'chapters/chapter2-section1.html', title: '整体受力与平衡', note: '支承、荷载分配、抗倾覆与扭转' },
    { file: 'chapters/chapter2-section2.html', title: '风荷载与地震作用估算', note: '楼层水平力、基底剪力与倾覆力矩' },
    { file: 'chapters/chapter2-section3.html', title: '高宽比与倾覆', note: '反力偏心、基底接触与参数影响' },
    { file: 'chapters/chapter2-section4.html', title: '承载力与刚度', note: '抗倾覆、弹性侧移与支承平面效率' },
    { file: 'chapters/chapter2-section5.html', title: '对称与非对称', note: '竖向偏心、刚度中心与整体扭转' },
    { file: 'chapters/chapter3-section2.html', title: '总体系分析的整体与局部问题', note: '实体薄片、抗剪力偶与截面几何' }
  ];
  $$('[data-course-menu]').forEach(mount => {
    const root = mount.dataset.root || './';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'course-menu-toggle';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'courseCatalogue');
    button.innerHTML = '<span>课程目录</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6L8 11L13 6"/></svg>';

    const panel = document.createElement('div');
    panel.className = 'course-menu-panel';
    panel.id = 'courseCatalogue';
    panel.hidden = true;
    panel.setAttribute('aria-label', '课程章节');
    const heading = document.createElement('div');
    heading.className = 'course-menu-heading';
    heading.innerHTML = `<strong>课程目录</strong><span>${courseSections.length} 节 · 持续扩展</span>`;
    const list = document.createElement('div');
    list.className = 'course-menu-list';
    courseSections.forEach((section, index) => {
      if (index === 0 || index === 5) {
        const groupTitle = document.createElement('h3');
        groupTitle.className = 'course-menu-group-title';
        groupTitle.textContent = index === 0 ? '把建筑看作总结构体系' : '整体性及主要分体系的相互关系';
        list.append(groupTitle);
      }
      const link = document.createElement('a');
      link.href = root + section.file;
      const current = window.location.pathname.endsWith('/' + section.file);
      if (current) link.setAttribute('aria-current', 'page');
      const copy = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = section.title;
      const note = document.createElement('small');
      note.textContent = section.note;
      copy.append(title, note);
      link.append(copy);
      if (current) {
        const marker = document.createElement('span');
        marker.className = 'current-lesson';
        marker.textContent = '当前学习';
        link.append(marker);
      }
      list.append(link);
    });
    panel.append(heading, list);
    mount.append(button, panel);

    const close = (restoreFocus = false) => {
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      if (restoreFocus) button.focus();
    };
    button.addEventListener('click', () => {
      const open = panel.hidden;
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', event => {
      if (!mount.contains(event.target)) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) close(true);
    });
  });

  const topNav = $('.top-nav');
  if (topNav) {
    const aboutOpen = document.createElement('button');
    aboutOpen.type = 'button';
    aboutOpen.className = 'about-open';
    aboutOpen.textContent = '致读者';
    aboutOpen.setAttribute('aria-haspopup', 'dialog');
    aboutOpen.setAttribute('aria-controls', 'aboutDialog');

    const aboutDialog = document.createElement('dialog');
    aboutDialog.className = 'support-dialog about-dialog';
    aboutDialog.id = 'aboutDialog';
    aboutDialog.setAttribute('aria-labelledby', 'about-dialog-title');
    aboutDialog.innerHTML = `
      <div class="support-dialog-heading"><h2 id="about-dialog-title">致读者</h2><button type="button" data-about-close aria-label="关闭致读者">×</button></div>
      <div class="about-dialog-copy about-reader">
        <h3>结构工程师的最后主战场</h3>
        <p>随着 AI 技术快速演进，AI 完成建模、出图正逐步成为现实。在这个时代，结构工程师的核心价值究竟何在？</p>
        <p>答案在于：精准判断 AI 生成的结构方案，引导 AI 进行迭代优化，并为最终的结构安全兜底负责。这将成为结构工程师不可替代的最后主战场。</p>
        <p>制作本网站的初衷，正是为了帮助广大结构工程师跟随林同炎大师的步伐，不断完善概念设计能力。</p>
        <blockquote><p>因为软件可以算得很快，但判断对错与承担责任，永远属于人。</p></blockquote>
        <div class="reader-support">
          <div><h3>支持本站</h3><p>如果这些内容对你有帮助，欢迎自愿赞赏。你的支持会鼓励我持续完善课程内容与交互实验。</p><p>微信扫码赞赏，金额随意。</p></div>
          <img src="${topNav.closest('header').querySelector('[data-root]')?.dataset.root || './'}assets/images/wechat-reward.png" alt="Zhao | Struct. E. 的微信赞赏码" width="180" height="180" loading="lazy">
        </div>
      </div>`;
    topNav.append(aboutOpen);
    document.body.append(aboutDialog);

    aboutOpen.addEventListener('click', () => {
      aboutDialog.showModal();
      document.body.classList.add('about-dialog-open');
    });
    $('[data-about-close]', aboutDialog).addEventListener('click', () => aboutDialog.close());
    aboutDialog.addEventListener('click', event => {
      if (event.target !== aboutDialog) return;
      const bounds = aboutDialog.getBoundingClientRect();
      const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
      if (outside) aboutDialog.close();
    });
    aboutDialog.addEventListener('close', () => {
      document.body.classList.remove('about-dialog-open');
      aboutOpen.focus();
    });
  }

  $$('[data-copy-email]').forEach(button => {
    const email = 'Zhao_Struct_E@163.com';
    button.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(email);
        } else {
          const field = document.createElement('textarea');
          field.value = email;
          field.style.position = 'fixed';
          field.style.opacity = '0';
          document.body.append(field);
          field.select();
          if (!document.execCommand('copy')) throw new Error('Copy unavailable');
          field.remove();
        }
        button.textContent = '邮箱已复制';
        button.classList.add('is-copied');
      } catch {
        button.textContent = email;
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(button);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      window.setTimeout(() => {
        button.textContent = email;
        button.classList.remove('is-copied');
      }, 2000);
    });
  });

  // Inline local SVGs so individual force arrows and dashed deformation layers can move.
  $$('[data-svg-src]').forEach(mount => {
    fetch(mount.dataset.svgSrc)
      .then(response => {
        if (!response.ok) throw new Error('SVG unavailable');
        return response.text();
      })
      .then(markup => {
        mount.innerHTML = markup;
        mount.dispatchEvent(new Event('vectorready', { bubbles: true }));
      })
      .catch(() => { /* The local SVG image remains as a static fallback. */ });
  });

  const progress = $('.reading-progress span');
  const updateProgress = () => {
    if (!progress) return;
    const available = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = available > 0 ? Math.min(1, Math.max(0, window.scrollY / available)) : 1;
    progress.style.transform = `scaleX(${ratio})`;
  };
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();

  $$('[data-open-demo]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    const target = new URL(link.getAttribute('href'), window.location.href);
    target.searchParams.set('demo', link.dataset.openDemo);
    window.location.href = target.href;
  }));

  const tabs = $$('.demo-tab');
  const panels = $$('.demo-panel');
  function activateDemo(name, focusTab = false) {
    const selected = tabs.find(tab => tab.dataset.demo === name) || tabs[0];
    if (!selected) return;
    tabs.forEach(tab => {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach(panel => {
      const active = panel.id === selected.getAttribute('aria-controls');
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
    if (focusTab) selected.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateDemo(tab.dataset.demo));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      activateDemo(tabs[next].dataset.demo, true);
    });
  });
  if (tabs.length) activateDemo(new URLSearchParams(location.search).get('demo') || 'footprint');

  const floorRange = $('#floorRange');
  if (floorRange) {
    const deadRange = $('#deadRange');
    const columnButtons = $$('[data-column-units]');
    let selectedUnits = 4;
    const updateLoads = () => {
      const floors = Number(floorRange.value);
      const q = Number(deadRange.value);
      const total = q * 900 * floors;
      const perUnit = total / 32;
      $('#floorOutput').textContent = `${floors} 层`;
      $('#deadOutput').textContent = `${q.toFixed(1)} kN/m²`;
      $('#totalLoad').textContent = `${format(total)} kN`;
      $('#unitLoad').textContent = `${format(perUnit)} kN`;
      $('#columnResult').textContent = `已选中柱：${selectedUnits} 面积单位，估算柱荷载 ${format(perUnit * selectedUnits)} kN`;
    };
    columnButtons.forEach(button => button.addEventListener('click', () => {
      selectedUnits = Number(button.dataset.columnUnits);
      columnButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      updateLoads();
    }));
    floorRange.addEventListener('input', updateLoads);
    deadRange.addEventListener('input', updateLoads);
    updateLoads();
  }

  const horizontalRange = $('#horizontalRange');
  if (horizontalRange) {
    const updateOverturn = () => {
      const H = Number(horizontalRange.value);
      const moment = H * 15;
      const e = moment / 43200;
      const ratio = e / 15;
      $('#horizontalOutput').textContent = `${format(H)} kN`;
      $('#momentValue').textContent = `${format(moment)} kN·m`;
      $('#eccentricityValue').textContent = `${e.toFixed(2)} m`;
      const panel = $('#overturnPanel');
      panel.dataset.zero = String(H === 0);
      panel.style.setProperty('--overturn-angle', `${Math.min(2.5, ratio * 9).toFixed(2)}deg`);
      const reaction = $('.overturn-reaction');
      // The support width d = 15 m is drawn as 150 SVG units; e uses the same scale.
      const reactionOffset = Math.min(e * (150 / 15), 75);
      if (reaction) reaction.style.transform = `translateX(${reactionOffset.toFixed(1)}px)`;
      const reactionGuide = $('.overturn-reaction-guide');
      if (reactionGuide) reactionGuide.style.transform = `translateX(${reactionOffset.toFixed(1)}px)`;
      const reactionLabel = $('.overturn-reaction-label');
      if (reactionLabel) reactionLabel.style.transform = `translateX(${reactionOffset.toFixed(1)}px)`;
      const eDimension = $('.overturn-e-dimension');
      if (eDimension) eDimension.setAttribute('d', `M1195 490h${reactionOffset.toFixed(1)}`);
      const eLabel = $('.overturn-e-label');
      if (eLabel) eLabel.setAttribute('x', String(1195 + reactionOffset / 2));
      const status = $('#overturnStatus');
      const playButton = $('#playOverturn');
      if (H === 0) {
        panel.classList.remove('is-playing');
        playButton.disabled = true;
        playButton.setAttribute('aria-pressed', 'false');
        playButton.textContent = '水平作用为零，无动画';
        playButton.title = '将水平合力调为非零后即可播放';
      } else {
        playButton.disabled = false;
        playButton.title = '';
        if (!panel.classList.contains('is-playing')) playButton.textContent = '播放受力动画';
      }
      if (ratio <= 1 / 6 + 1e-9) {
        status.dataset.level = 'safe';
        status.textContent = `e/d = ${ratio.toFixed(3)}，反力位于 d/6 范围内，概念阶段较充裕。`;
      } else if (ratio < 0.5 - 1e-9) {
        status.dataset.level = 'warning';
        status.textContent = `e/d = ${ratio.toFixed(3)}，已超出 d/6，但仍未超过 d/2；需进一步检查支承反力分布。`;
      } else if (Math.abs(ratio - 0.5) <= 1e-9) {
        status.dataset.level = 'warning';
        status.textContent = `e/d = ${ratio.toFixed(3)}，反力恰好到达支承边缘；这是仅靠重力维持平衡的临界状态。`;
      } else {
        status.dataset.level = 'danger';
        status.textContent = `e/d = ${ratio.toFixed(3)}，所需反力位置越出支承宽度；图示停在支承边缘，单靠重力已无法维持整体抗倾覆平衡。`;
      }
    };
    document.addEventListener('vectorready', event => {
      if (event.target.id === 'overturnFigure') updateOverturn();
    });
    horizontalRange.addEventListener('input', updateOverturn);
    updateOverturn();
    $('#playOverturn').addEventListener('click', event => {
      if (Number(horizontalRange.value) === 0) return;
      const playing = $('#overturnPanel').classList.toggle('is-playing');
      event.currentTarget.setAttribute('aria-pressed', String(playing));
      event.currentTarget.textContent = playing ? '暂停受力动画' : '播放受力动画';
    });
    $('#resetOverturn').addEventListener('click', () => {
      horizontalRange.value = '2400';
      $('#overturnPanel').classList.remove('is-playing');
      $('#playOverturn').setAttribute('aria-pressed', 'false');
      $('#playOverturn').textContent = '播放受力动画';
      updateOverturn();
    });
  }

  const torsionRange = $('#torsionRange');
  if (torsionRange) {
    const panel = $('#torsionPanel');
    const playButton = $('#playTorsion');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const NS = 'http://www.w3.org/2000/svg';
    let modelSvg = null;
    let solidGroup = null;
    let referenceGroup = null;
    let forcePath = null;
    let forceLabel = null;
    let reactionPath = null;
    let reactionLabel = null;
    let eDimension3d = null;
    let eLabel3d = null;
    let rightAngle3d = null;
    let frame = 0;
    let playing = false;
    let phase = 0;
    let lastTime = 0;

    // A real 3D model: a full-height main prism and an upper cantilever prism.
    // All dimensions are model units; beta is the fixed 180-degree default yaw.
    const beta = Math.PI;
    const surfaces = [
      { axis: 'x', at: -55, r: [-52.5, 52.5], z: [0, 250], n: [-1, 0], fill: '#e6e4dc' },
      { axis: 'x', at: 55, r: [-52.5, 52.5], z: [0, 160], n: [1, 0], fill: '#f7f5ef' },
      { axis: 'y', at: -52.5, r: [-55, 55], z: [0, 250], n: [0, -1], fill: '#f7f5ef' },
      { axis: 'y', at: 52.5, r: [-55, 55], z: [0, 250], n: [0, 1], fill: '#e6e4dc' },
      { axis: 'x', at: 165, r: [-52.5, 52.5], z: [160, 250], n: [1, 0], fill: '#f7f5ef' },
      { axis: 'y', at: -52.5, r: [55, 165], z: [160, 250], n: [0, -1], fill: '#f7f5ef' },
      { axis: 'y', at: 52.5, r: [55, 165], z: [160, 250], n: [0, 1], fill: '#e6e4dc' },
      { horizontal: true, x: [-55, 55], y: [-52.5, 52.5], z: 250, top: true, fill: '#fdfcf9' },
      { horizontal: true, x: [55, 165], y: [-52.5, 52.5], z: 250, top: true, fill: '#fdfcf9' },
      { horizontal: true, x: [55, 165], y: [-52.5, 52.5], z: 160, top: false, fill: '#d8d6ce' }
    ];
    const rotate = (x, y, angle) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
    const project = (x, y, z, extraAngle) => {
      const [X, Y] = rotate(x, y, beta + extraAngle);
      return { x: 375 + X - Y, y: 460 + (X + Y) * 0.5 - z, X, Y, z };
    };
    const projectedDirection = (x, y) => {
      const origin = project(0, 0, 0, 0);
      const end = project(x, y, 0, 0);
      const dx = end.x - origin.x;
      const dy = end.y - origin.y;
      const length = Math.hypot(dx, dy);
      return { x: dx / length, y: dy / length };
    };
    const hDirection = projectedDirection(0, 1);
    const rDirection = { x: -hDirection.x, y: -hDirection.y };
    const eNormal = { x: -hDirection.y, y: hDirection.x };
    const arrowFromPoint = (point, direction, length, tipOffset) => {
      const start = { x: point.x - direction.x * length, y: point.y - direction.y * length };
      const end = { x: point.x - direction.x * tipOffset, y: point.y - direction.y * tipOffset };
      return { start, end, d: `M${start.x.toFixed(2)} ${start.y.toFixed(2)}L${end.x.toFixed(2)} ${end.y.toFixed(2)}` };
    };
    const pointsAttribute = points => points.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
    const polygon = (parent, points, attrs) => {
      const element = document.createElementNS(NS, 'polygon');
      element.setAttribute('points', pointsAttribute(points));
      Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
      parent.appendChild(element);
    };
    const verticalPoints = (surface, z0, z1, extraAngle) => {
      const [r0, r1] = surface.r;
      const coordinates = surface.axis === 'x'
        ? [[surface.at, r0], [surface.at, r1], [surface.at, r1], [surface.at, r0]]
        : [[r0, surface.at], [r1, surface.at], [r1, surface.at], [r0, surface.at]];
      const heights = [z0, z0, z1, z1];
      return coordinates.map(([x, y], index) => project(x, y, heights[index], extraAngle * heights[index] / 250));
    };
    const horizontalPoints = (surface, extraAngle) => [
      [surface.x[0], surface.y[0]], [surface.x[1], surface.y[0]],
      [surface.x[1], surface.y[1]], [surface.x[0], surface.y[1]]
    ].map(([x, y]) => project(x, y, surface.z, extraAngle * surface.z / 250));
    const verticalVisible = (surface, z, extraAngle) => {
      const angle = beta + extraAngle * z / 250;
      const [nx, ny] = rotate(surface.n[0], surface.n[1], angle);
      return nx + ny > 0.001;
    };
    const twistSolid = angle => {
      if (!solidGroup) return;
      const pieces = [];
      surfaces.forEach(surface => {
        if (surface.horizontal) {
          if (!surface.top) return;
          const points = horizontalPoints(surface, angle);
          const depth = points.reduce((sum, point) => sum + point.X + point.Y + point.z * 0.3, 0) / points.length;
          pieces.push({ points, fill: surface.fill, depth });
          return;
        }
        const divisions = 14;
        for (let index = 0; index < divisions; index += 1) {
          const z0 = surface.z[0] + (surface.z[1] - surface.z[0]) * index / divisions;
          const z1 = surface.z[0] + (surface.z[1] - surface.z[0]) * (index + 1) / divisions;
          const mid = (z0 + z1) / 2;
          if (!verticalVisible(surface, mid, angle)) continue;
          const points = verticalPoints(surface, z0, z1, angle);
          const depth = points.reduce((sum, point) => sum + point.X + point.Y + point.z * 0.3, 0) / points.length;
          pieces.push({ points, fill: surface.fill, depth });
        }
      });
      pieces.sort((a, b) => a.depth - b.depth);
      solidGroup.replaceChildren();
      pieces.forEach(piece => polygon(solidGroup, piece.points, { fill: piece.fill, stroke: piece.fill, 'stroke-width': 0.5, 'stroke-linejoin': 'round' }));
      // Only exterior edges are stroked; subdivision edges remain invisible.
      surfaces.forEach((surface, index) => {
        if (surface.horizontal && !surface.top) return;
        if (!surface.horizontal && !verticalVisible(surface, (surface.z[0] + surface.z[1]) / 2, angle)) return;
        const points = surface.horizontal
          ? horizontalPoints(surface, angle)
          : verticalPoints(surface, surface.z[0], surface.z[1], angle);
        if (![2, 3, 5, 6, 7, 8].includes(index)) {
          polygon(solidGroup, points, { fill: 'none', stroke: '#242522', 'stroke-width': 2.4, 'stroke-linejoin': 'round' });
          return;
        }
        const path = document.createElementNS(NS, 'path');
        const move = point => `M${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
        const line = point => `L${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
        let d;
        if (index === 7) d = `${move(points[0])}${line(points[1])}${move(points[2])}${line(points[3])}${line(points[0])}`;
        else if (index === 2 || index === 3) {
          const joint = project(55, surface.at, 160, angle * 160 / 250);
          d = `${move(points[0])}${line(points[1])}${line(joint)}${move(points[2])}${line(points[3])}${line(points[0])}`;
        } else d = `${move(points[0])}${line(points[1])}${line(points[2])}${line(points[3])}`;
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#242522');
        path.setAttribute('stroke-width', '2.4');
        solidGroup.appendChild(path);
      });

      // H is the resultant horizontal seismic action at the cantilever midpoint.
      // Its direction stays fixed in the global reference frame; R is parallel and opposite.
      const eccentricity = Number(torsionRange.value);
      const hBasePoint = project(-107.5, -112.5, 310, angle * 310 / 250);
      const hPoint = {
        x: hBasePoint.x - eccentricity * 19.375,
        y: hBasePoint.y - eccentricity * 8.75
      };
      const hArrow = arrowFromPoint(hPoint, hDirection, 145, 65);
      forcePath.setAttribute('d', hArrow.d);
      forceLabel.setAttribute('x', String(hArrow.start.x - 25));
      forceLabel.setAttribute('y', String(hArrow.start.y - 20));

      const rPoint = project(0, 0, 0, 0);
      const rArrow = arrowFromPoint(rPoint, rDirection, 85, 10);
      reactionPath.setAttribute('d', rArrow.d);
      reactionLabel.setAttribute('x', String(rArrow.start.x + 8));
      reactionLabel.setAttribute('y', String(rArrow.start.y + 22));

      // Draw e as the perpendicular connector between the two parallel action lines.
      const hAnchor = hArrow.start;
      const along = (hAnchor.x - rPoint.x) * hDirection.x + (hAnchor.y - rPoint.y) * hDirection.y;
      const rAnchor = { x: rPoint.x + along * hDirection.x, y: rPoint.y + along * hDirection.y };
      eDimension3d.setAttribute('d', `M${hAnchor.x.toFixed(2)} ${hAnchor.y.toFixed(2)}L${rAnchor.x.toFixed(2)} ${rAnchor.y.toFixed(2)}`);
      eDimension3d.style.display = Number(torsionRange.value) === 0 ? 'none' : '';
      eLabel3d.setAttribute('x', String((hAnchor.x + rAnchor.x) / 2 - 34));
      eLabel3d.setAttribute('y', String((hAnchor.y + rAnchor.y) / 2 - 12));
      eLabel3d.style.display = Number(torsionRange.value) === 0 ? 'none' : '';
      const corner = { x: hAnchor.x + hDirection.x * 16, y: hAnchor.y + hDirection.y * 16 };
      const cornerOuter = { x: corner.x + eNormal.x * 16, y: corner.y + eNormal.y * 16 };
      const normalEnd = { x: hAnchor.x + eNormal.x * 16, y: hAnchor.y + eNormal.y * 16 };
      rightAngle3d.setAttribute('d', `M${corner.x.toFixed(2)} ${corner.y.toFixed(2)}L${cornerOuter.x.toFixed(2)} ${cornerOuter.y.toFixed(2)}L${normalEnd.x.toFixed(2)} ${normalEnd.y.toFixed(2)}`);
      rightAngle3d.style.display = Number(torsionRange.value) === 0 ? 'none' : '';
    };
    const currentAngle = () => Number(torsionRange.value) / 5 * 14 * Math.PI / 180;
    const stopTorsion = () => {
      playing = false;
      cancelAnimationFrame(frame);
      panel.classList.remove('is-playing');
      playButton.setAttribute('aria-pressed', 'false');
      playButton.textContent = '播放扭转动画';
    };
    const animateTorsion = time => {
      if (!playing) return;
      if (!lastTime) lastTime = time;
      phase += (time - lastTime) / 1800 * Math.PI * 2;
      lastTime = time;
      twistSolid(currentAngle() * Math.sin(phase));
      frame = requestAnimationFrame(animateTorsion);
    };
    const updateTorsion = () => {
      const e = Number(torsionRange.value);
      $('#torsionOutput').textContent = `${e.toFixed(1)} m`;
      $('#torqueValue').textContent = `${format(Math.abs(1000 * e))} kN·m`;
      $('#torsionStatus').textContent = e === 0 ? '力与抗力共线，平面扭矩为零；仍需检查其他方向的偏心。' : '力与抗力不共线，整体需抵抗图示方向的扭矩。';
      panel.dataset.direction = 'positive';
      panel.dataset.zero = String(e === 0);
      if (e === 0) stopTorsion();
      playButton.disabled = e === 0 || reduceMotion.matches;
      playButton.title = e === 0 ? '将平面偏心距调为非零后即可播放' : reduceMotion.matches ? '系统已启用减少动态效果' : '';
      if (e === 0) playButton.textContent = '偏心为零，无扭转动画';
      else if (reduceMotion.matches) playButton.textContent = '已减少动态效果';
      else if (!playing) playButton.textContent = '播放扭转动画';
      if (!playing) twistSolid(0);
      const forceX = 975 - e * 18.5625;
      const planH = $('.torsion-plan-h');
      if (planH) planH.setAttribute('d', `M${forceX} 400V330`);
      const planR = $('.torsion-plan-r');
      if (planR) planR.setAttribute('d', 'M975 320V390');
      const hGuide = $('.torsion-h-guide');
      if (hGuide) hGuide.setAttribute('d', `M${forceX} 270V450`);
      const rGuide = $('.torsion-r-guide');
      if (rGuide) rGuide.setAttribute('d', 'M975 270V450');
      const hLabel = $('.torsion-plan-h-label');
      if (hLabel) {
        hLabel.setAttribute('x', String(forceX - 25));
        hLabel.setAttribute('y', '320');
      }
      const eDimension = $('.torsion-e-dimension');
      if (eDimension) {
        eDimension.setAttribute('d', `M${forceX} 455H975`);
        eDimension.style.display = e === 0 ? 'none' : '';
      }
      const rightAngle = $('.torsion-right-angle');
      if (rightAngle) {
        rightAngle.innerHTML = `<path d="M${forceX} 433.5H${forceX + 18}V455"/><path d="M975 433.5H957V455"/>`;
        rightAngle.style.display = e === 0 ? 'none' : '';
      }
      const eLabel = $('.torsion-e-label');
      if (eLabel) {
        eLabel.textContent = `e＝${e.toFixed(1)} m`;
        eLabel.setAttribute('x', String((forceX + 975) / 2));
        eLabel.setAttribute('y', '485');
        eLabel.setAttribute('text-anchor', 'middle');
        eLabel.style.display = e === 0 ? 'none' : '';
      }
      const momentNote = $('.torsion-moment-note');
      if (momentNote) momentNote.textContent = e === 0 ? '力与抗力共线，扭矩为零' : '力与抗力不共线，形成扭矩';
    };
    document.addEventListener('vectorready', event => {
      if (event.target.id !== 'torsionFigure') return;
      modelSvg = event.target.querySelector('svg');
      solidGroup = modelSvg.querySelector('.torsion-solid');
      referenceGroup = modelSvg.querySelector('.torsion-reference');
      forcePath = modelSvg.querySelector('.torsion-force path');
      forceLabel = modelSvg.querySelector('.torsion-h-label-3d');
      reactionPath = modelSvg.querySelector('.torsion-r-3d');
      reactionLabel = modelSvg.querySelector('.torsion-r-label-3d');
      eDimension3d = modelSvg.querySelector('.torsion-e-dimension-3d');
      eLabel3d = modelSvg.querySelector('.torsion-e-label-3d');
      rightAngle3d = modelSvg.querySelector('.torsion-right-angle-3d');
      referenceGroup.replaceChildren();
      updateTorsion();
    });
    torsionRange.addEventListener('input', updateTorsion);
    reduceMotion.addEventListener('change', () => { stopTorsion(); updateTorsion(); });
    playButton.addEventListener('click', () => {
      if (playing) {
        stopTorsion();
        return;
      }
      if (Number(torsionRange.value) === 0 || reduceMotion.matches) {
        twistSolid(0);
        return;
      }
      playing = true;
      lastTime = 0;
      panel.classList.add('is-playing');
      playButton.setAttribute('aria-pressed', 'true');
      playButton.textContent = '暂停扭转动画';
      frame = requestAnimationFrame(animateTorsion);
    });
    $('#resetTorsion').addEventListener('click', () => {
      stopTorsion();
      phase = 0;
      torsionRange.value = '2.5';
      updateTorsion();
    });
    updateTorsion();
  }
})();


// Rectangular-building wind and seismic estimation lesson.
(() => {
  'use strict';
  const lesson = document.querySelector('#lateralLesson');
  if (!lesson) return;

  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const number = value => Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
  const node = (tag, attrs = {}, text = '') => {
    const element = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
    if (text) element.textContent = text;
    return element;
  };
  const add = (parent, tag, attrs, text) => {
    const element = node(tag, attrs, text);
    parent.appendChild(element);
    return element;
  };
  const addLine = (parent, x1, y1, x2, y2, className) => add(parent, 'line', { x1, y1, x2, y2, class: className || '' });
  const addText = (parent, x, y, text, className = '') => add(parent, 'text', { x, y, class: className }, text);
  const marker = (svg, id, color) => {
    let defs = svg.querySelector('defs');
    if (!defs) defs = add(svg, 'defs');
    const mark = add(defs, 'marker', { id, markerWidth: 9, markerHeight: 9, refX: 8, refY: 4.5, orient: 'auto-start-reverse' });
    add(mark, 'path', { d: 'M0 0L9 4.5 0 9Z', fill: color });
  };

  function sharedGeometry() {
    return {
      n: Number($('sharedFloors').value),
      h: Number($('sharedStorey').value),
      Bx: Number($('sharedWidthX').value),
      By: Number($('sharedWidthY').value)
    };
  }
  function windValues() {
    const geometry = sharedGeometry();
    const direction = $('windDirection').value;
    const structureType = $('structureType').value;
    const vibrationWidth = direction === 'x' ? geometry.Bx : geometry.By;
    const H = geometry.n * geometry.h;
    const B = direction === 'x' ? geometry.By : geometry.Bx;
    const T0 = structureType === 'shearWall'
      ? 0.03 + 0.03 * H / Math.cbrt(vibrationWidth)
      : 0.25 + 0.53e-3 * H ** 2 / Math.cbrt(vibrationWidth);
    const psiT = Number($('periodReduction').value);
    return {
      ...geometry,
      direction,
      B,
      D: vibrationWidth,
      muS: H > 45 && vibrationWidth / B <= 1 ? 1.4 : 1.3,
      w0: Number($('windPressure').value),
      structureType,
      vibrationWidth,
      T0,
      psiT,
      T1: T0 * psiT
    };
  }
  function quakeValues() {
    const geometry = sharedGeometry();
    const q = Number($('areaLoad').value);
    return {
      ...geometry,
      q,
      G: q * geometry.Bx * geometry.By,
      alpha: Number($('quakeAlpha').value),
      T1: Number($('quakePeriod').value),
      Tg: Number($('characteristicPeriod').value)
    };
  }
  const windHeightCoefficients = [
    [5, 1.00], [10, 1.00], [15, 1.13], [20, 1.23], [30, 1.39],
    [40, 1.52], [50, 1.62], [60, 1.71], [70, 1.79], [80, 1.87],
    [90, 1.93], [100, 2.00], [150, 2.25], [200, 2.46], [250, 2.63],
    [300, 2.77], [350, 2.91], [400, 2.91], [450, 2.91], [500, 2.91], [550, 2.91]
  ];
  function windHeightCoefficient(z) {
    if (z <= 5) return 1;
    for (let index = 1; index < windHeightCoefficients.length; index += 1) {
      const [upperZ, upperMu] = windHeightCoefficients[index];
      if (z <= upperZ) {
        const [lowerZ, lowerMu] = windHeightCoefficients[index - 1];
        return lowerMu + (upperMu - lowerMu) * (z - lowerZ) / (upperZ - lowerZ);
      }
    }
    return 2.91;
  }
  const frameShearModes = [0, 0.02, 0.08, 0.17, 0.27, 0.38, 0.45, 0.67, 0.74, 0.86, 1];
  function windModeShape(z, H, structureType) {
    const ratio = z / H;
    if (structureType === 'frame') return Math.sin(Math.PI * ratio / 2);
    if (structureType === 'shearWall') return Math.tan(Math.PI / 4 * ratio ** 0.7);
    const position = Math.min(ratio, 1) * 10;
    const lower = Math.floor(position);
    const upper = Math.min(lower + 1, 10);
    return frameShearModes[lower] + (frameShearModes[upper] - frameShearModes[lower]) * (position - lower);
  }
  function calculateWind() {
    const { Bx, By, B, D, muS, direction, n, h, w0, T0, T1, psiT, structureType, vibrationWidth } = windValues();
    const H = n * h;
    const correlationB = Math.min(B, 2 * H);
    const rhoX = 10 * Math.sqrt(correlationB + 50 * Math.exp(-correlationB / 50) - 50) / correlationB;
    const rhoZ = 10 * Math.sqrt(H + 60 * Math.exp(-H / 60) - 60) / H;
    const x1 = 30 / T1 / Math.sqrt(w0);
    const R = Math.sqrt(Math.PI * x1 ** 2 / (6 * 0.05 * (1 + x1 ** 2) ** (4 / 3)));
    const floors = Array.from({ length: n }, (_, index) => {
      const level = index + 1;
      const z = (index + 0.5) * h;
      const mu = windHeightCoefficient(z);
      const phi = windModeShape(z, H, structureType);
      const background = 0.670 * H ** 0.187 * rhoX * rhoZ * phi / mu;
      const beta = 1 + 2 * 2.5 * 0.14 * background * Math.sqrt(1 + R ** 2);
      const pressure = beta * w0 * mu * muS;
      const F = pressure * B * h;
      return { level, Hi: z, z, mu, phi, background, beta, pressure, F };
    });
    const V = floors.reduce((sum, floor) => sum + floor.F, 0);
    const M = floors.reduce((sum, floor) => sum + floor.F * floor.Hi, 0);
    return { Bx, By, B, D, muS, direction, n, h, w0, T0, T1, psiT, structureType, vibrationWidth, H, correlationB, rhoX, rhoZ, x1, R, floors, V, M, resultant: M / V };
  }
  function calculateQuake() {
    const { Bx, By, n, h, q, G, alpha, T1, Tg } = quakeValues();
    const H = n * h;
    const equivalentG = 0.85 * n * G;
    const V = alpha * equivalentG;
    const delta = T1 <= 1.4 * Tg ? 0 : Tg <= 0.35 ? 0.08 * T1 + 0.07 : Tg <= 0.55 ? 0.08 * T1 + 0.01 : 0.08 * T1 - 0.02;
    const additionalTop = delta * V;
    const weightedHeight = Array.from({ length: n }, (_, index) => G * (index + 1) * h).reduce((a, b) => a + b, 0);
    const floors = Array.from({ length: n }, (_, index) => {
      const level = index + 1;
      const Hi = level * h;
      const regularF = V * G * Hi / weightedHeight * (1 - delta);
      const additionalF = level === n ? additionalTop : 0;
      return { level, Hi, regularF, additionalF, F: regularF + additionalF };
    });
    const M = floors.reduce((sum, floor) => sum + floor.F * floor.Hi, 0);
    return { Bx, By, n, h, q, G, alpha, T1, Tg, equivalentG, delta, additionalTop, H, floors, V, M, resultant: M / V };
  }

  function drawBuilding(svg, data, options) {
    const { x, width, mode, compact = false } = options;
    const base = 425;
    const top = 70;
    const right = x + width;
    const maxForce = Math.max(...data.floors.map(floor => floor.F));
    const maxArrow = compact ? 72 : 120;
    const redMarker = compact ? 'smallRedArrow' : `${mode}RedArrow`;
    const greenMarker = compact ? 'smallGreenArrow' : `${mode}GreenArrow`;
    const group = add(svg, 'g', { class: `load-model load-model-${mode}` });
    add(group, 'rect', { x, y: top, width, height: base - top, class: 'lateral-building' });
    data.floors.forEach(floor => {
      const floorY = base - (floor.level / data.n) * (base - top);
      const actionY = base - (floor.Hi / data.H) * (base - top);
      addLine(group, x, floorY, right, floorY, 'lateral-floor');
      const length = 25 + maxArrow * floor.F / maxForce;
      const arrowClass = mode === 'wind' ? 'action-arrow wind-force' : 'action-arrow quake-force';
      if (mode === 'wind') {
        addLine(group, x - 14 - length, actionY, x - 14, actionY, arrowClass).setAttribute('marker-end', `url(#${redMarker})`);
      } else {
        const massX = x + width / 2;
        add(group, 'circle', { cx: massX, cy: actionY, r: compact ? 3 : 4, class: 'floor-mass' });
        addLine(group, massX, actionY, massX + length, actionY, arrowClass).setAttribute('marker-end', `url(#${redMarker})`);
      }
    });
    add(group, 'rect', { x: x - 12, y: base, width: width + 24, height: 18, class: 'lateral-foundation' });
    addLine(group, x - 35, base, x - 12, base, 'lateral-ground');
    addLine(group, right + 12, base, right + 35, base, 'lateral-ground');
    for (let tick = x - 30; tick < x - 12; tick += 12) addLine(group, tick, base + 4, tick - 10, base + 18, 'lateral-soil');
    for (let tick = right + 18; tick < right + 35; tick += 12) addLine(group, tick, base + 4, tick - 10, base + 18, 'lateral-soil');
    for (let tick = x; tick < right + 12; tick += 14) addLine(group, tick, base + 30, tick + 12, base + 18, 'lateral-soil');
    const reactionY = base + 50;
    addLine(group, x - 8, reactionY, x - (compact ? 64 : 105), reactionY, 'reaction-arrow').setAttribute('marker-end', `url(#${greenMarker})`);
    addText(group, x - (compact ? 66 : 104), reactionY + 22, `${mode === 'wind' ? 'Vw' : 'VE'} = ${number(data.V)} kN`, 'reaction-label');
    if (!compact) {
      addText(group, x + width / 2, 46, mode === 'wind' ? '风荷载 Fw,i' : '地震作用 Fi', 'diagram-title').setAttribute('text-anchor', 'middle');
      addText(group, x + width / 2, 515, `H = ${data.H.toFixed(1)} m　·　${data.n} 层`, 'diagram-subtitle').setAttribute('text-anchor', 'middle');
      addLine(group, x - 4, top - 10, right + 4, top - 10, 'building-top-line');
      addText(group, x + width / 2, 540, `合力高度 H̄ = ${data.resultant.toFixed(1)} m`, 'resultant-label').setAttribute('text-anchor', 'middle');
    } else {
      addText(group, x + width / 2, 46, mode === 'wind' ? '风荷载' : '地震作用', 'diagram-title').setAttribute('text-anchor', 'middle');
      addText(group, x + width / 2, 515, `V = ${number(data.V)} kN`, 'diagram-subtitle').setAttribute('text-anchor', 'middle');
      addText(group, x + width / 2, 538, `H̄ = ${data.resultant.toFixed(1)} m`, 'resultant-label').setAttribute('text-anchor', 'middle');
    }
  }

  function drawWindPlan(svg, data) {
    const centerX = 590;
    const centerY = 255;
    const scale = 120 / Math.max(data.Bx, data.By);
    const planWidth = data.Bx * scale;
    const planHeight = data.By * scale;
    const left = centerX - planWidth / 2;
    const right = centerX + planWidth / 2;
    const top = centerY - planHeight / 2;
    const bottom = centerY + planHeight / 2;
    addText(svg, centerX, 90, '建筑平面与风向', 'diagram-title').setAttribute('text-anchor', 'middle');
    add(svg, 'rect', { x: left, y: top, width: planWidth, height: planHeight, class: 'lateral-building' });
    if (data.direction === 'x') {
      addText(svg, left - 55, centerY - 30, '沿 X 向', 'force-value').setAttribute('text-anchor', 'middle');
      addLine(svg, left - 65, centerY, left - 14, centerY, 'action-arrow').setAttribute('marker-end', 'url(#windRedArrow)');
      addLine(svg, left, top, left, bottom, 'windward-edge');
      const dimensionX = right + 24;
      addLine(svg, right + 8, top, dimensionX, top, 'aspect-dimension');
      addLine(svg, right + 8, bottom, dimensionX, bottom, 'aspect-dimension');
      addLine(svg, dimensionX, top, dimensionX, bottom, 'aspect-dimension').setAttribute('marker-start', 'url(#windDimension)');
      svg.lastChild.setAttribute('marker-end', 'url(#windDimension)');
      addText(svg, dimensionX + 20, centerY, `By = ${data.B} m`, 'diagram-subtitle').setAttribute('text-anchor', 'middle');
      svg.lastChild.setAttribute('transform', `rotate(-90 ${dimensionX + 20} ${centerY})`);
    } else {
      addText(svg, centerX - 30, top - 42, '沿 Y 向', 'force-value').setAttribute('text-anchor', 'middle');
      addLine(svg, centerX, top - 55, centerX, top - 14, 'action-arrow').setAttribute('marker-end', 'url(#windRedArrow)');
      addLine(svg, left, top, right, top, 'windward-edge');
      const dimensionY = bottom + 24;
      addLine(svg, left, bottom + 8, left, dimensionY, 'aspect-dimension');
      addLine(svg, right, bottom + 8, right, dimensionY, 'aspect-dimension');
      addLine(svg, left, dimensionY, right, dimensionY, 'aspect-dimension').setAttribute('marker-start', 'url(#windDimension)');
      svg.lastChild.setAttribute('marker-end', 'url(#windDimension)');
      addText(svg, centerX, dimensionY + 24, `Bx = ${data.B} m`, 'diagram-subtitle').setAttribute('text-anchor', 'middle');
    }
    addText(svg, centerX, 395, '每层迎风面积 = B × h', 'resultant-label').setAttribute('text-anchor', 'middle');
  }

  function renderWind(data) {
    const svg = $('windDiagram');
    svg.replaceChildren();
    marker(svg, 'windRedArrow', '#a34c3f');
    marker(svg, 'windGreenArrow', '#537567');
    marker(svg, 'windDimension', '#6f726b');
    drawBuilding(svg, data, { x: 270, width: 140, mode: 'wind' });
    drawWindPlan(svg, data);
  }
  function renderQuake(data) {
    const svg = $('seismicDiagram');
    svg.replaceChildren();
    marker(svg, 'seismicRedArrow', '#a34c3f');
    marker(svg, 'seismicGreenArrow', '#537567');
    drawBuilding(svg, data, { x: 250, width: 150, mode: 'seismic' });
  }
  function renderCompare(wind, quake) {
    const svg = $('compareDiagram');
    svg.replaceChildren();
    marker(svg, 'smallRedArrow', '#a34c3f');
    marker(svg, 'smallGreenArrow', '#537567');
    drawBuilding(svg, wind, { x: 145, width: 100, mode: 'wind', compact: true });
    drawBuilding(svg, quake, { x: 430, width: 100, mode: 'seismic', compact: true });
  }

  const calculationDialog = $('calculationDialog');
  const calculationReport = $('calculationReport');
  if (calculationDialog && calculationReport) {
    const reportNumber = (value, digits = 3) => Number(value).toFixed(digits);
    const parameterRows = rows => `<dl class="report-parameters">${rows.map(([name, value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
    const reportTable = (headers, rows) => `<div class="report-table-wrap"><table><thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${value}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const checks = data => `<p class="report-check">平衡核对：ΣF = ${reportNumber(data.V)} kN；Σ(F·H) = ${reportNumber(data.M)} kN·m；H̄ = M/V = ${reportNumber(data.resultant)} m。上述结果与逐层求和一致。</p>`;
    let reportName = '';

    function windReport(data) {
      const modeText = {
        frame: '框架采用剪切型教学近似 φ1(z) = sin[πz/(2H)]',
        frameShear: '框剪按 GB 50009 附录 G 表 G.0.3 的第一振型系数线性插值',
        shearWall: '剪力墙采用弯剪型近似 φ1(z) = tan[π(z/H)^0.7/4]'
      }[data.structureType];
      const common = [
        ['建筑层数 n', `${data.n} 层`], ['层高 h', `${reportNumber(data.h, 1)} m`],
        ['总高度 H', `${reportNumber(data.H, 1)} m`], ['平面尺寸 Bx × By', `${data.Bx} m × ${data.By} m`],
        ['风向', data.direction === 'x' ? '沿 X 向' : '沿 Y 向'], ['迎风面宽度 B', `${data.B} m`],
        ['顺风向进深 D', `${data.D} m`], ['深宽比 D/B', reportNumber(data.D / data.B)],
        ['基本风压 w0', `${reportNumber(data.w0, 2)} kN/m²`], ['结构类型', { frame: '钢筋混凝土框架', frameShear: '钢筋混凝土框架-剪力墙', shearWall: '钢筋混凝土剪力墙' }[data.structureType]],
        ['振动方向宽度 B', `${data.vibrationWidth} m`], ['周期折减系数 ψT', reportNumber(data.psiT, 2)],
        ['估算周期 T0', `${reportNumber(data.T0)} s`], ['折减后基本自振周期 T1', `${reportNumber(data.T1)} s`],
        ['体型系数 μs', reportNumber(data.muS, 2)], ['ρx 计算宽度 min(B, 2H)', `${reportNumber(data.correlationB, 1)} m`],
        ['阻尼比 ζ1', '0.05']
      ];
      const dynamic = [['g / I10', '2.5 / 0.14'], ['k / a1 / kw', '0.670 / 0.187 / 1.0'], ['ρx / ρz', `${reportNumber(data.rhoX)} / ${reportNumber(data.rhoZ)}`], ['x1 / R', `${reportNumber(data.x1)} / ${reportNumber(data.R)}`]];
      const rows = data.floors.map(floor => [floor.level, reportNumber(floor.Hi, 1), reportNumber(floor.mu), reportNumber(floor.phi), reportNumber(floor.background), reportNumber(floor.beta), reportNumber(floor.pressure), reportNumber(floor.F), reportNumber(floor.F * floor.Hi)]);
      return `<h3>风荷载估算计算书</h3><p class="report-time">参数快照：${new Date().toLocaleString('zh-CN')}</p><h4>1. 计算依据与假定</h4><p>主体风荷载按 GB 50009 式 8.1.1-1 计算，风振系数按式 8.4.3～8.4.7 及附录 G 计算。采用 B 类地面粗糙度，仅考虑顺风向第一振型；${modeText}。各受风段按中点风压乘以 Bh，并将集中力作用于该段中点。当 B＞2H 时，ρx 的计算宽度按 2H 截取，作为教学模型的边界处理。</p><h4>2. 输入参数</h4>${parameterRows(common)}<h4>3. 风振参数</h4>${parameterRows(dynamic)}<p>βz = 1 + 2gI10Bz√(1+R²)；Bz = kH<sup>a1</sup>ρxρzφ1(z)/μz；R² = πx1²/[6ζ1(1+x1²)<sup>4/3</sup>]；x1 = 30/(T1√(kww0))。</p><h4>4. 逐层计算</h4><p>zi = (i−1/2)h；Fw,i = βz,i w0 μz,i μs B h；Mi = Fw,i zi。力单位为 kN，力矩单位为 kN·m。</p>${reportTable(['层', 'zi(m)', 'μz', 'φ1', 'Bz', 'βz', 'wi(kN/m²)', 'Fw,i(kN)', 'Mi(kN·m)'], rows)}<h4>5. 汇总与平衡核对</h4>${parameterRows([['基底剪力 Vw = ΣFw,i', `${reportNumber(data.V)} kN`], ['倾覆力矩 Mw = ΣMi', `${reportNumber(data.M)} kN·m`], ['合力高度 H̄ = Mw/Vw', `${reportNumber(data.resultant)} m`]])}${checks(data)}<p class="report-disclaimer">本计算书对应上述教学模型和参数快照，不替代实际工程的动力分析、风荷载确定及设计验算。</p>`;
    }

    function quakeReport(data) {
      const weightedHeight = data.floors.reduce((sum, floor) => sum + data.G * floor.Hi, 0);
      const rows = data.floors.map(floor => [floor.level, reportNumber(floor.Hi, 1), reportNumber(data.G), reportNumber(data.G * floor.Hi), reportNumber(data.G * floor.Hi / weightedHeight), reportNumber(floor.regularF), reportNumber(floor.additionalF), reportNumber(floor.F), reportNumber(floor.F * floor.Hi)]);
      const scopeNote = data.H > 40 ? '<p class="report-check">适用性提示：当前建筑高度超过 40 m，超出底部剪力法通常适用范围；本结果仅作概念演示，实际工程宜采用振型分解反应谱法。</p>' : '';
      return `<h3>地震作用估算计算书</h3><p class="report-time">参数快照：${new Date().toLocaleString('zh-CN')}</p><h4>1. 计算依据与假定</h4><p>参照 GB/T 50011 底部剪力法，按等效总重力荷载求基底剪力，再按楼层重量与高度分配，并计入顶部附加作用。模型假定各层等重、等高，结构规则且以剪切变形为主；α1 由用户直接输入，实际工程应按烈度、场地、设计分组、结构周期和阻尼确定。</p>${scopeNote}<h4>2. 输入参数</h4>${parameterRows([['建筑层数 n', `${data.n} 层`], ['层高 h', `${reportNumber(data.h, 1)} m`], ['总高度 H', `${reportNumber(data.H, 1)} m`], ['平面尺寸 Bx × By', `${data.Bx} m × ${data.By} m`], ['单位面积重力荷载代表值 q', `${data.q} kN/m²`], ['基本自振周期 T1', `${reportNumber(data.T1, 2)} s`], ['场地特征周期 Tg', `${reportNumber(data.Tg, 2)} s`], ['地震影响系数 α1', reportNumber(data.alpha)]])}<h4>3. 总剪力与分配系数</h4><p>每层重量 Gi = qBxBy = ${reportNumber(data.G)} kN；总重量 ΣGi = ${reportNumber(data.n * data.G)} kN；等效总重力荷载 Geq = 0.85ΣGi = ${reportNumber(data.equivalentG)} kN。</p><p>基底剪力 VE = α1Geq = ${reportNumber(data.V)} kN；δn = ${reportNumber(data.delta)}；顶部附加作用 ΔFn = δnVE = ${reportNumber(data.additionalTop)} kN。</p><p>Σ(GiHi) = ${reportNumber(weightedHeight)} kN·m；规则分配 Fi = VE(1−δn)GiHi/Σ(GjHj)，顶层总作用另加 ΔFn。</p><h4>4. 逐层计算</h4>${reportTable(['层', 'Hi(m)', 'Gi(kN)', 'GiHi(kN·m)', '高度分配比例', '规则分配 Fi(kN)', '顶部附加 ΔFi(kN)', '合计 Fi(kN)', 'Mi(kN·m)'], rows)}<h4>5. 汇总与平衡核对</h4>${parameterRows([['基底剪力 VE = ΣFi', `${reportNumber(data.V)} kN`], ['倾覆力矩 ME = ΣMi', `${reportNumber(data.M)} kN·m`], ['合力高度 H̄ = ME/VE', `${reportNumber(data.resultant)} m`]])}${checks(data)}<p class="report-disclaimer">本计算书对应上述教学模型和参数快照，不包含楼层最小剪重比等全部规范验算，不替代实际工程设计。</p>`;
    }

    $$('[data-report-open]').forEach(button => button.addEventListener('click', () => {
      reportName = button.dataset.reportOpen;
      calculationDialog.showModal();
      try {
        calculationReport.innerHTML = reportName === 'wind' ? windReport(calculateWind()) : quakeReport(calculateQuake());
      } catch (error) {
        calculationReport.textContent = `计算书生成失败：${error.message}`;
      }
      document.body.classList.add('calculation-dialog-open');
    }));
    $('closeCalculation').addEventListener('click', () => calculationDialog.close());
    calculationDialog.addEventListener('close', () => document.body.classList.remove('calculation-dialog-open'));
    calculationDialog.addEventListener('click', event => {
      if (event.target !== calculationDialog) return;
      const bounds = calculationDialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) calculationDialog.close();
    });
    const reportDocument = () => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${reportName === 'wind' ? '风荷载' : '地震作用'}估算计算书</title><style>body{max-width:1200px;margin:40px auto;padding:0 24px;color:#292923;font:14px/1.7 sans-serif}h3{font-size:26px}h4{margin:28px 0 12px;font-size:18px}.report-time,.report-disclaimer{color:#666}.report-parameters{display:grid;grid-template-columns:repeat(2,1fr);gap:0 28px}.report-parameters div{display:flex;justify-content:space-between;gap:16px;padding:6px 0;border-bottom:1px solid #ddd}.report-table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;white-space:nowrap}th,td{padding:8px;border:1px solid #bbb;text-align:right}th:first-child,td:first-child{text-align:center}.report-check{padding:12px;background:#f2f1eb;font-weight:700}@media print{body{margin:0}.report-parameters{font-size:11px}table{font-size:10px}h4{break-after:avoid}tr{break-inside:avoid}}</style></head><body>${calculationReport.innerHTML}</body></html>`;
    $('exportCalculation').addEventListener('click', () => {
      const blob = new Blob([reportDocument()], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reportName === 'wind' ? '风荷载' : '地震作用'}估算计算书.html`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    $('printCalculation').addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.className = 'calculation-print-frame';
      document.body.append(frame);
      frame.contentDocument.open();
      frame.contentDocument.write(reportDocument());
      frame.contentDocument.close();
      frame.contentWindow.addEventListener('load', () => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        window.setTimeout(() => frame.remove(), 1000);
      }, { once: true });
    });
  }

  function updateLesson() {
    const wind = calculateWind();
    const quake = calculateQuake();
    $('sharedFloorsOutput').textContent = `${wind.n} 层`;
    $('sharedStoreyOutput').textContent = `${wind.h.toFixed(1)} m`;
    $('sharedWidthXOutput').textContent = `${wind.Bx} m`;
    $('sharedWidthYOutput').textContent = `${wind.By} m`;
    $('windPressureOutput').textContent = `${wind.w0.toFixed(2)} kN/m²`;
    $('windBasePeriod').textContent = `${wind.T0.toFixed(3)} s`;
    $('windPeriodOutput').textContent = `${wind.T1.toFixed(3)} s`;
    $('periodFormula').textContent = `${wind.structureType === 'shearWall' ? '剪力墙按 F.2.2-2：T0 = 0.03 + 0.03H/∛B' : '框架、框剪按 F.2.2-1：T0 = 0.25 + 0.53×10⁻³H²/∛B'}；B = ${wind.vibrationWidth} m（振动方向宽度），T1 = ψT·T0。`;
    $('windShear').textContent = `${number(wind.V)} kN`;
    $('windMoment').textContent = `${number(wind.M)} kN·m`;
    const topWind = wind.floors[wind.floors.length - 1];
    const correlationNote = wind.B > 2 * wind.H ? ` B > 2H，ρx 的计算宽度已按 ${wind.correlationB.toFixed(1)} m 截取。` : '';
    $('windStatus').dataset.level = correlationNote ? 'warning' : 'note';
    $('windStatus').textContent = `迎风面宽度 ${wind.B} m，μs = ${wind.muS.toFixed(2)}；顶层受风段中点 μz = ${topWind.mu.toFixed(3)}、βz = ${topWind.beta.toFixed(3)}，风荷载 ${number(topWind.F)} kN；合力位于基底以上 ${wind.resultant.toFixed(1)} m。${correlationNote}`;

    $('areaLoadOutput').textContent = `${quake.q} kN/m²`;
    $('quakePeriodOutput').textContent = `${quake.T1.toFixed(2)} s`;
    $('quakeAlphaOutput').textContent = `${quake.alpha.toFixed(3)}`;
    $('quakeShear').textContent = `${number(quake.V)} kN`;
    $('quakeMoment').textContent = `${number(quake.M)} kN·m`;
    const scopeNote = quake.H > 40 ? ` H = ${quake.H.toFixed(1)} m > 40 m，已超出底部剪力法通常适用范围；结果仅作概念演示，实际宜采用振型分解反应谱法。` : '';
    $('quakeStatus').dataset.level = scopeNote ? 'warning' : 'note';
    $('quakeStatus').textContent = `等效总重量 ${number(quake.equivalentG)} kN；δn = ${quake.delta.toFixed(3)}，顶部附加作用 ${number(quake.additionalTop)} kN；顶层总作用 ${number(quake.floors[quake.floors.length - 1].F)} kN；合力位于基底以上 ${quake.resultant.toFixed(1)} m。${scopeNote}`;

    $('compareWindShear').textContent = `${number(wind.V)} kN`;
    $('compareQuakeShear').textContent = `${number(quake.V)} kN`;
    $('compareWindHeight').textContent = `${wind.resultant.toFixed(1)} m`;
    $('compareQuakeHeight').textContent = `${quake.resultant.toFixed(1)} m`;
    const displayedWind = Math.round(wind.V);
    const displayedQuake = Math.round(quake.V);
    if (displayedWind === displayedQuake) {
      $('compareStatus').textContent = `按页面显示精度，两种作用的基底剪力相等，均为 ${number(displayedWind)} kN；还需结合合力高度比较倾覆效应。`;
    } else {
      const larger = displayedQuake > displayedWind ? '地震作用' : '风荷载';
      const ratio = Math.max(displayedWind, displayedQuake) / Math.min(displayedWind, displayedQuake);
      $('compareStatus').textContent = `当前参数下，${larger}的基底剪力较大，为另一种作用的 ${ratio.toFixed(2)} 倍；还需结合合力高度比较倾覆效应。`;
    }

    renderWind(wind);
    renderQuake(quake);
    renderCompare(wind, quake);
  }

  ['sharedFloors', 'sharedStorey', 'sharedWidthX', 'sharedWidthY', 'windDirection', 'windPressure', 'structureType', 'periodReduction', 'areaLoad', 'quakePeriod', 'characteristicPeriod', 'quakeAlpha'].forEach(id => {
    $(id).addEventListener('input', updateLesson);
  });

  $('resetLateral').addEventListener('click', () => {
    const defaults = { sharedFloors: 10, sharedStorey: 3.6, sharedWidthX: 30, sharedWidthY: 30, windDirection: 'x', windPressure: 0.5, structureType: 'frame', periodReduction: 1, areaLoad: 12, quakePeriod: 0.47, characteristicPeriod: 0.35, quakeAlpha: 0.08 };
    Object.entries(defaults).forEach(([id, value]) => { $(id).value = value; });
    updateLesson();
  });

  try {
    updateLesson();
  } catch (error) {
    $('windStatus').textContent = `初始化错误：${error.stack}`;
  }
})();


// Slenderness, overturning eccentricity and base-contact lesson.
(() => {
  'use strict';
  const lesson = document.querySelector('#slendernessLesson');
  if (!lesson) return;

  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const number = value => Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
  const make = (tag, attrs = {}, text = '') => {
    const element = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
    if (text) element.textContent = text;
    return element;
  };
  const add = (parent, tag, attrs, text) => {
    const element = make(tag, attrs, text);
    parent.appendChild(element);
    return element;
  };
  const line = (parent, x1, y1, x2, y2, className = '') => add(parent, 'line', { x1, y1, x2, y2, class: className });
  const text = (parent, x, y, value, className = '') => add(parent, 'text', { x, y, class: className }, value);
  function marker(svg, id, color) {
    const defs = add(svg, 'defs');
    const mark = add(defs, 'marker', { id, markerWidth: 9, markerHeight: 9, refX: 8, refY: 4.5, orient: 'auto-start-reverse' });
    add(mark, 'path', { d: 'M0 0L9 4.5 0 9Z', fill: color });
  }

  function calculate() {
    const B = Number($('aspectWidth').value);
    const H = Number($('aspectHeight').value);
    const W = Number($('aspectWeight').value);
    const V = Number($('aspectShear').value);
    const c = Number($('loadPattern').value);
    const Hbar = c * H;
    const M = V * Hbar;
    const e = M / W;
    const ratio = e / B;
    const lambda = H / B;
    const slope = V * c / W;
    const state = ratio <= 1 / 6 + 1e-9 ? 'full' : ratio < 0.5 - 1e-9 ? 'partial' : Math.abs(ratio - 0.5) <= 1e-9 ? 'edge' : 'unstable';
    const a = state === 'full' ? B : state === 'partial' ? 3 * (B / 2 - e) : 0;
    const qmax = state === 'full' ? W / B * (1 + 6 * ratio) : state === 'partial' ? 2 * W / a : null;
    const qmin = state === 'full' ? Math.max(0, W / B * (1 - 6 * ratio)) : state === 'partial' ? 0 : null;
    return { B, H, W, V, c, Hbar, M, e, ratio, lambda, slope, state, a, qmax, qmin };
  }

  function statusFor(data) {
    if (data.state === 'full') {
      const boundary = Math.abs(data.ratio - 1 / 6) <= 1e-9;
      return { level: 'safe', text: boundary ? `e/B = ${data.ratio.toFixed(3)} = 1/6，基底全接触，压力非负，左端恰好为零。` : `e/B = ${data.ratio.toFixed(3)} < 1/6，基底全接触，压力均为正值。` };
    }
    if (data.state === 'partial') return { level: 'warning', text: `1/6 < e/B = ${data.ratio.toFixed(3)} < 1/2，基底部分接触，接触宽度缩小为 ${data.a.toFixed(2)} m。` };
    if (data.state === 'edge') return { level: 'warning', text: `e/B = ${data.ratio.toFixed(3)} = 1/2，合力恰好到达支承边缘，接触宽度趋于零；当前有限接触宽度压力分布模型失效。` };
    return { level: 'danger', text: `e/B = ${data.ratio.toFixed(3)} > 1/2，合力越出支承范围，需要其他抗倾覆或锚固条件。` };
  }

  function drawAspect(data) {
    const svg = $('aspectDiagram');
    svg.replaceChildren();
    marker(svg, 'aspectRed', '#a34c3f');
    marker(svg, 'aspectGreen', '#537567');
    marker(svg, 'aspectBlack', '#373632');
    const scale = Math.min(4.2, 340 / data.H);
    const base = 420;
    const center = 375;
    const width = data.B * scale;
    const height = data.H * scale;
    const left = center - width / 2;
    const right = center + width / 2;
    const top = base - height;
    const building = add(svg, 'g', { class: 'aspect-building' });
    add(building, 'rect', { x: left, y: top, width, height, class: 'aspect-building-body' });
    for (let i = 1; i < 8; i++) line(building, left, top + height * i / 8, right, top + height * i / 8, 'aspect-floor');
    add(svg, 'rect', { x: left - 10, y: base, width: width + 20, height: 18, class: 'aspect-foundation' });
    line(svg, left - 35, base, left - 10, base, 'aspect-ground');
    line(svg, right + 10, base, right + 35, base, 'aspect-ground');
    for (let x = left - 28; x < left - 10; x += 12) line(svg, x, base + 4, x - 10, base + 18, 'aspect-soil');
    for (let x = right + 16; x < right + 35; x += 12) line(svg, x, base + 4, x - 10, base + 18, 'aspect-soil');

    const forceY = base - data.c * height;
    line(svg, left - 150, forceY, left - 12, forceY, 'aspect-action').setAttribute('marker-end', 'url(#aspectRed)');
    text(svg, left - 148, forceY - 16, `V = ${number(data.V)} kN`, 'aspect-action-label');
    const gravityY = top + height / 2;
    line(svg, center, gravityY - 38, center, gravityY + 42, 'aspect-weight').setAttribute('marker-end', 'url(#aspectBlack)');
    text(svg, center + 12, gravityY, 'W', 'aspect-weight-label');
    line(svg, left - 8, base + 32, left - 90, base + 32, 'aspect-resistance').setAttribute('marker-end', 'url(#aspectGreen)');
    text(svg, left - 88, base + 56, '基底剪力', 'aspect-resistance-label');

    if (data.state !== 'unstable') {
      const reactionX = center + data.e * scale;
      line(svg, reactionX, base + 70, reactionX, base + 20, 'aspect-resistance aspect-reaction').setAttribute('marker-end', 'url(#aspectGreen)');
      text(svg, reactionX + 12, base + 58, 'R = W', 'aspect-resistance-label');
      line(svg, center, 510, reactionX, 510, 'aspect-dimension');
      line(svg, center, 494, center, 518, 'aspect-dimension');
      line(svg, reactionX, 494, reactionX, 518, 'aspect-dimension');
      text(svg, (center + reactionX) / 2, 538, `e = ${data.e.toFixed(2)} m`, 'aspect-dimension-label').setAttribute('text-anchor', 'middle');
    } else {
      text(svg, right - 5, base - 48, '×', 'aspect-unstable-mark');
      text(svg, center, 492, 'R 越出支承范围：整体无法平衡', 'aspect-unstable-label').setAttribute('text-anchor', 'middle');
    }
    line(svg, left, top - 4, left, top - 38, 'aspect-dimension');
    line(svg, right, top - 4, right, top - 38, 'aspect-dimension');
    const bDimension = line(svg, left, top - 28, right, top - 28, 'aspect-dimension');
    bDimension.setAttribute('marker-start', 'url(#aspectBlack)');
    bDimension.setAttribute('marker-end', 'url(#aspectBlack)');
    text(svg, center, top - 36, `B = ${data.B} m`, 'aspect-dimension-label').setAttribute('text-anchor', 'middle');
    const dimensionX = right + 100;
    line(svg, right + 8, top, dimensionX + 8, top, 'aspect-dimension');
    line(svg, right + 8, base, dimensionX + 8, base, 'aspect-dimension');
    const hDimension = line(svg, dimensionX, top, dimensionX, base, 'aspect-dimension');
    hDimension.setAttribute('marker-start', 'url(#aspectBlack)');
    hDimension.setAttribute('marker-end', 'url(#aspectBlack)');
    text(svg, dimensionX + 12, top + height / 2, `H = ${data.H} m`, 'aspect-dimension-label');
    text(svg, 42, 48, `H/B = ${data.lambda.toFixed(2)}　·　H̄ = ${data.Hbar.toFixed(1)} m`, 'aspect-title');
  }

  function drawContact(data) {
    const svg = $('contactDiagram');
    svg.replaceChildren();
    marker(svg, 'contactGreen', '#537567');
    marker(svg, 'contactBlack', '#373632');
    const left = 150;
    const right = 570;
    const center = 360;
    const base = 230;
    const scale = (right - left) / data.B;
    add(svg, 'rect', { x: left, y: 75, width: right - left, height: base - 75, class: 'aspect-building-body' });
    add(svg, 'rect', { x: left - 8, y: base, width: right - left + 16, height: 18, class: 'aspect-foundation' });
    line(svg, left - 25, base, left - 8, base, 'aspect-ground');
    line(svg, right + 8, base, right + 25, base, 'aspect-ground');
    line(svg, left - 20, base + 4, left - 28, base + 18, 'aspect-soil');
    line(svg, right + 20, base + 4, right + 12, base + 18, 'aspect-soil');
    line(svg, center, 100, center, 174, 'aspect-weight').setAttribute('marker-end', 'url(#contactBlack)');
    text(svg, center + 14, 140, 'W', 'aspect-weight-label');

    if (data.state === 'full' || data.state === 'partial') {
      const reactionX = center + data.e * scale;
      const pressureTop = base + 25;
      const maxHeight = 130;
      if (data.state === 'full') {
        const leftHeight = maxHeight * data.qmin / data.qmax;
        add(svg, 'path', { d: `M${left} ${pressureTop}L${right} ${pressureTop}L${right} ${pressureTop + maxHeight}L${left} ${pressureTop + leftHeight}Z`, class: 'pressure-full' });
        for (let i = 0; i <= 6; i += 1) {
          const x = left + (right - left) * i / 6;
          const height = leftHeight + (maxHeight - leftHeight) * i / 6;
          if (height > 1e-9) line(svg, x, pressureTop + height, x, pressureTop, 'pressure-arrow').setAttribute('marker-end', 'url(#contactGreen)');
        }
        text(svg, left, pressureTop + leftHeight + 28, `qmin = ${number(data.qmin)} kN/m`, 'pressure-label').setAttribute('text-anchor', 'middle');
        text(svg, right, pressureTop + maxHeight + 28, `qmax = ${number(data.qmax)} kN/m`, 'pressure-label').setAttribute('text-anchor', 'middle');
      } else {
        const contactLeft = right - data.a * scale;
        add(svg, 'path', { d: `M${contactLeft} ${pressureTop}L${right} ${pressureTop}L${right} ${pressureTop + maxHeight}Z`, class: 'pressure-partial' });
        for (let i = 0; i <= 6; i += 1) {
          const x = contactLeft + (right - contactLeft) * i / 6;
          const height = maxHeight * i / 6;
          if (height > 3) line(svg, x, pressureTop + height, x, pressureTop, 'pressure-arrow').setAttribute('marker-end', 'url(#contactGreen)');
        }
        line(svg, left, pressureTop + 5, contactLeft, pressureTop + 5, 'no-contact-line');
        text(svg, (left + contactLeft) / 2, pressureTop + 38, '脱开区', 'no-contact-label').setAttribute('text-anchor', 'middle');
        text(svg, right, pressureTop + maxHeight + 28, `qmax = ${number(data.qmax)} kN/m`, 'pressure-label').setAttribute('text-anchor', 'middle');
        text(svg, contactLeft - 8, pressureTop + 62, 'q = 0', 'pressure-label').setAttribute('text-anchor', 'end');
      }
      line(svg, center, 470, reactionX, 470, 'aspect-dimension');
      text(svg, (center + reactionX) / 2, 496, `e = ${data.e.toFixed(2)} m`, 'aspect-dimension-label').setAttribute('text-anchor', 'middle');
      text(svg, center, 535, `接触宽度 a = ${data.a.toFixed(2)} m`, 'aspect-title').setAttribute('text-anchor', 'middle');
    } else {
      line(svg, left, 285, right, 285, 'no-contact-line');
      const atEdge = data.state === 'edge';
      text(svg, center, 355, atEdge ? '竖向合力恰好到达支承边缘' : '竖向合力已越出支承边缘', 'aspect-unstable-label').setAttribute('text-anchor', 'middle');
      text(svg, center, 390, atEdge ? '接触宽度趋于零，有限宽度压力模型失效' : '不能形成图示基底压力平衡', 'aspect-unstable-label').setAttribute('text-anchor', 'middle');
      if (atEdge) text(svg, center, 535, '接触宽度 a → 0 m', 'aspect-title').setAttribute('text-anchor', 'middle');
    }
    text(svg, 42, 45, data.state === 'full' ? '全接触：梯形压力分布' : data.state === 'partial' ? '部分接触：三角形压力分布' : data.state === 'edge' ? '支承边缘临界：压力模型失效' : '无法仅靠重力维持平衡', 'aspect-title');
  }

  function drawChart(data) {
    const svg = $('aspectChart');
    svg.replaceChildren();
    const left = 85, right = 675, top = 55, bottom = 450;
    const xMax = 9, yMax = 0.55;
    const x = value => left + value / xMax * (right - left);
    const y = value => bottom - value / yMax * (bottom - top);
    add(svg, 'rect', { x: left, y: y(1 / 6), width: right - left, height: bottom - y(1 / 6), class: 'chart-zone-safe' });
    add(svg, 'rect', { x: left, y: y(0.5), width: right - left, height: y(1 / 6) - y(0.5), class: 'chart-zone-warning' });
    add(svg, 'rect', { x: left, y: top, width: right - left, height: y(0.5) - top, class: 'chart-zone-danger' });
    line(svg, left, bottom, right, bottom, 'chart-axis');
    line(svg, left, bottom, left, top, 'chart-axis');
    for (let i = 0; i <= 9; i += 1.5) {
      line(svg, x(i), bottom, x(i), bottom + 7, 'chart-axis');
      text(svg, x(i), bottom + 28, i.toFixed(1), 'chart-tick').setAttribute('text-anchor', 'middle');
    }
    [0, 1 / 6, 0.5].forEach(value => {
      line(svg, left, y(value), right, y(value), value === 0 ? 'chart-axis' : 'chart-threshold');
      text(svg, left - 12, y(value) + 5, value === 0 ? '0' : value === 0.5 ? '1/2' : '1/6', 'chart-tick').setAttribute('text-anchor', 'end');
    });
    text(svg, right - 5, y(1 / 6) - 10, '全接触界限', 'chart-zone-label').setAttribute('text-anchor', 'end');
    text(svg, right - 5, y(0.5) - 10, '支承边缘界限', 'chart-zone-label').setAttribute('text-anchor', 'end');
    const endRatio = Math.min(xMax, yMax / data.slope);
    line(svg, x(0), y(0), x(endRatio), y(Math.min(yMax, data.slope * endRatio)), 'chart-current-line');
    const shownY = Math.min(data.ratio, yMax);
    line(svg, x(data.lambda), bottom, x(data.lambda), y(shownY), 'chart-guide');
    line(svg, left, y(shownY), x(data.lambda), y(shownY), 'chart-guide');
    add(svg, 'circle', { cx: x(data.lambda), cy: y(shownY), r: 7, class: 'chart-current-point' });
    text(svg, Math.min(x(data.lambda) + 12, right - 120), Math.max(y(shownY) - 14, top + 18), `当前 ${data.lambda.toFixed(2)}`, 'chart-current-label');
    text(svg, (left + right) / 2, 520, '高宽比 λ = H/B', 'chart-axis-label').setAttribute('text-anchor', 'middle');
    add(svg, 'text', { x: 25, y: (top + bottom) / 2, class: 'chart-axis-label', transform: `rotate(-90 25 ${(top + bottom) / 2})`, 'text-anchor': 'middle' }, '偏心比 e/B');
    text(svg, left, 32, `斜率 Vc/W = ${data.slope.toFixed(4)}`, 'aspect-title');
  }

  function update() {
    const data = calculate();
    $('aspectWidthOutput').textContent = `${data.B} m`;
    $('aspectHeightOutput').textContent = `${data.H} m`;
    $('aspectWeightOutput').textContent = `${number(data.W)} kN`;
    $('aspectShearOutput').textContent = `${number(data.V)} kN`;
    $('aspectRatio').textContent = data.lambda.toFixed(2);
    $('resultantHeight').textContent = `${data.Hbar.toFixed(1)} m`;
    $('aspectMoment').textContent = `${number(data.M)} kN·m`;
    $('aspectEccentricity').textContent = `${data.e.toFixed(2)} m`;
    const status = statusFor(data);
    $('aspectStatus').dataset.level = status.level;
    $('aspectStatus').textContent = `${status.text} 当前稳定力矩为 ${number(data.W * data.B / 2)} kN·m。`;
    $('contactRatio').textContent = data.ratio.toFixed(3);
    $('contactLength').textContent = data.state === 'unstable' ? '—' : data.state === 'edge' ? '→ 0 m' : `${data.a.toFixed(2)} m`;
    $('pressureMax').textContent = data.qmax === null ? '—' : `${number(data.qmax)} kN/m`;
    $('pressureMin').textContent = data.qmin === null ? '—' : `${number(data.qmin)} kN/m`;
    $('contactStatus').dataset.level = status.level;
    $('contactStatus').textContent = status.text;
    $('chartCurrentRatio').textContent = data.lambda.toFixed(2);
    $('chartCurrentEccentricity').textContent = data.ratio.toFixed(3);
    $('chartKernLimit').textContent = `H/B = ${(1 / 6 / data.slope).toFixed(2)}`;
    $('chartTipLimit').textContent = `H/B = ${(0.5 / data.slope).toFixed(2)}`;
    $('chartStatus').dataset.level = status.level;
    $('chartStatus').textContent = `${status.text} 增大 W 或减小 Vc 会降低曲线斜率。`;
    drawAspect(data);
    drawContact(data);
    drawChart(data);
  }

  ['aspectWidth', 'aspectHeight', 'aspectWeight', 'aspectShear'].forEach(id => $(id).addEventListener('input', update));
  $('loadPattern').addEventListener('change', update);
  $('resetAspect').addEventListener('click', () => {
    const defaults = { aspectWidth: 24, aspectHeight: 60, aspectWeight: 60000, aspectShear: 3000, loadPattern: 0.65 };
    Object.entries(defaults).forEach(([id, value]) => { $(id).value = value; });
    update();
  });
  update();
})();


// Overall capacity and stiffness: separate strength and deformation checks.
(() => {
  'use strict';
  const lesson = document.querySelector('#capacityLesson');
  if (!lesson) return;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const number = (value, digits = 0) => Number(value).toLocaleString('zh-CN', { maximumFractionDigits: digits });
  const make = (tag, attrs = {}, value = '') => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, val]) => el.setAttribute(key, String(val)));
    if (value) el.textContent = value;
    return el;
  };
  const add = (parent, tag, attrs, value) => { const el = make(tag, attrs, value); parent.appendChild(el); return el; };
  const line = (p, x1, y1, x2, y2, cls) => add(p, 'line', { x1, y1, x2, y2, class: cls });
  const text = (p, x, y, value, cls = 'capacity-label') => add(p, 'text', { x, y, class: cls }, value);
  function marker(svg, id, color) {
    const defs = add(svg, 'defs');
    const m = add(defs, 'marker', { id, markerWidth: 9, markerHeight: 9, refX: 8, refY: 4.5, orient: 'auto-start-reverse' });
    add(m, 'path', { d: 'M0 0L9 4.5 0 9Z', fill: color });
  }
  function responseData() {
    const H = Number($('capacityHeight').value), V = Number($('capacityShear').value);
    const E = Number($('capacityModulus').value), I = Number($('capacityInertia').value), MR = Number($('momentCapacity').value);
    const M = 2 * V * H / 3;
    const delta = 11 * V * H ** 3 / (60 * E * 1e6 * I);
    const k = V / delta;
    return { H, V, E, I, MR, M, delta, k, use: M / MR, ratio: delta / H, limit: H / 550 };
  }
  function drawResponse(d) {
    const svg = $('capacityDiagram'); svg.replaceChildren();
    marker(svg, 'capRed', '#a34c3f'); marker(svg, 'capGreen', '#537567'); marker(svg, 'capDim', '#6f726b');
    const base = 445, left = 280, width = 155, top = 105, right = left + width, center = left + width / 2;
    const visualShift = Math.min(155, 14 + d.delta * 680);
    add(svg, 'rect', { x: left, y: top, width, height: base - top, class: 'capacity-outline' });
    add(svg, 'path', { d: `M${left} ${base}Q${left + visualShift * .18} ${(base + top) / 2} ${left + visualShift} ${top}H${right + visualShift}Q${right + visualShift * .18} ${(base + top) / 2} ${right} ${base}Z`, class: 'capacity-deformed' });
    for (let i = 1; i < 7; i++) line(svg, left, top + (base - top) * i / 7, right, top + (base - top) * i / 7, 'capacity-floor');
    line(svg, center, 72, center, base + 25, 'capacity-centerline');
    add(svg, 'rect', { x: left - 12, y: base, width: width + 24, height: 20, class: 'capacity-outline' });
    line(svg, left - 38, base, left - 12, base, 'capacity-ground'); line(svg, right + 12, base, right + 38, base, 'capacity-ground');
    for (let x = left - 32; x < left - 12; x += 10) line(svg, x, base + 4, x - 9, base + 18, 'capacity-soil');
    for (let x = right + 18; x < right + 38; x += 10) line(svg, x, base + 4, x - 9, base + 18, 'capacity-soil');
    const resultantY = base - 2 * (base - top) / 3;
    line(svg, left - 125, resultantY, left - 12, resultantY, 'capacity-action').setAttribute('marker-end', 'url(#capRed)');
    text(svg, left - 123, resultantY - 17, `V = ${number(d.V)} kN`, 'capacity-force-label');
    line(svg, right + 8, resultantY, right + 78, resultantY, 'capacity-dimension');
    text(svg, right + 84, resultantY + 5, 'H̄ = 2H/3', 'capacity-small');
    line(svg, left - 18, base + 35, left - 115, base + 35, 'capacity-reaction').setAttribute('marker-end', 'url(#capGreen)');
    text(svg, left - 113, base + 62, '基底剪力', 'capacity-resistance-label');
    line(svg, center, top - 15, center, top - 48, 'capacity-dimension'); line(svg, center + visualShift, top - 15, center + visualShift, top - 48, 'capacity-dimension');
    line(svg, center, top - 36, center + visualShift, top - 36, 'capacity-dimension').setAttribute('marker-start', 'url(#capDim)'); svg.lastChild.setAttribute('marker-end', 'url(#capDim)');
    text(svg, center + visualShift / 2, top - 51, `Δ = ${number(d.delta * 1000, 1)} mm`, 'capacity-value').setAttribute('text-anchor', 'middle');
    text(svg, 44, 48, `等效侧向刚度 k = ${number(d.k)} kN/m`, 'capacity-title');
    text(svg, 44, 530, `抗倾覆力矩比 ${(d.use * 100).toFixed(0)}%　·　位移角 1/${number(1 / d.ratio)}`, 'capacity-value');
    text(svg, 44, 555, '虚线与填充轮廓仅用于放大显示变形趋势', 'capacity-small');
  }
  function updateResponse() {
    const d = responseData();
    $('capacityHeightOutput').textContent = `${d.H} m`; $('capacityShearOutput').textContent = `${number(d.V)} kN`;
    $('capacityModulusOutput').textContent = `${d.E} GPa`; $('capacityInertiaOutput').textContent = `${number(d.I)} m⁴`; $('momentCapacityOutput').textContent = `${number(d.MR)} kN·m`;
    $('capacityMoment').textContent = `${number(d.M)} kN·m`; $('capacityUtilisation').textContent = d.use.toFixed(2);
    $('capacityDrift').textContent = `${number(d.delta * 1000, 1)} mm`; $('capacityDriftRatio').textContent = `1/${number(1 / d.ratio)}`;
    const strength = $('strengthStatus'), stiffness = $('stiffnessStatus');
    strength.dataset.level = 'note';
    strength.textContent = d.use <= 1 ? `本项比较：M 未超过输入的 MR，M/MR = ${d.use.toFixed(2)} ≤ 1；仅比较所入力矩，不表示整体结构安全。` : `本项比较：M 已达到输入 MR 的 ${(d.use * 100).toFixed(0)}%；仅比较所入力矩，仍需检查其他承载能力。`;
    stiffness.dataset.level = d.delta <= d.limit ? 'safe' : 'warning';
    stiffness.textContent = d.delta <= d.limit ? `位移对照：Δ = ${number(d.delta * 1000, 1)} mm，低于教学参考值 ${number(d.limit * 1000, 1)} mm；这不是规范验收结论。` : `位移对照：当前 Δ 高于教学参考值 ${number(d.limit * 1000, 1)} mm；抗倾覆力矩与弹性侧移仍需分别判断。`;
    drawResponse(d);
  }
  function efficiencyData() {
    const B = Number($('efficiencyWidth').value), r = Number($('innerPosition').value), A = Number($('totalArea').value);
    const ideal = A * B ** 2 / 4;
    const actual = A / 4 * (2 * (B / 2) ** 2 + 2 * (r * B) ** 2);
    return { B, r, A, ideal, actual, eta: actual / ideal };
  }
  function drawEfficiency(d) {
    const svg = $('efficiencyDiagram'); svg.replaceChildren(); marker(svg, 'effGreen', '#537567'); marker(svg, 'effDim', '#6f726b');
    const center = 350, scale = 10, base = 420, top = 160;
    line(svg, center, 95, center, 500, 'capacity-centerline');
    text(svg, center + 10, 145, '中和轴', 'capacity-small');
    const positions = [-d.B / 2, -d.r * d.B, d.r * d.B, d.B / 2];
    positions.forEach((pos, index) => {
      const displayOffset = d.r === 0 && (index === 1 || index === 2) ? (index === 1 ? -15 : 15) : 0;
      const x = center + pos * scale + displayOffset;
      const outer = index === 0 || index === 3;
      const columnLabelY = outer ? base + 32 : base + 54;
      const leverY = outer ? 490 : 515;
      add(svg, 'rect', { x: x - 14, y: top, width: 28, height: base - top, class: 'efficiency-column' });
      const columnLabel = text(svg, x, columnLabelY, `A/4 · x${index + 1}`, 'capacity-small');
      columnLabel.setAttribute('text-anchor', d.r === 0 && index === 1 ? 'end' : d.r === 0 && index === 2 ? 'start' : 'middle');
      if (Math.abs(pos) > .1) {
        line(svg, center, leverY, center + pos * scale, leverY, 'efficiency-lever');
        text(svg, (center + center + pos * scale) / 2, leverY + 18, `${Math.abs(pos).toFixed(1)} m`, 'capacity-value').setAttribute('text-anchor', 'middle');
      }
    });
    if (d.r === 0) text(svg, center, 82, '内柱显示错位，仅用于表示两根柱实际重合；不参与计算', 'capacity-small').setAttribute('text-anchor', 'middle');
    const left = center - d.B / 2 * scale, right = center + d.B / 2 * scale;
    line(svg, left, top - 12, left, top - 50, 'capacity-dimension'); line(svg, right, top - 12, right, top - 50, 'capacity-dimension');
    line(svg, left, top - 38, right, top - 38, 'capacity-dimension').setAttribute('marker-start', 'url(#effDim)'); svg.lastChild.setAttribute('marker-end', 'url(#effDim)');
    text(svg, center, top - 54, `B = ${d.B} m`, 'capacity-value').setAttribute('text-anchor', 'middle');
    add(svg, 'rect', { x: left - 8, y: base, width: right - left + 16, height: 18, class: 'capacity-outline' });
    line(svg, left - 28, base, left - 8, base, 'capacity-ground'); line(svg, right + 8, base, right + 28, base, 'capacity-ground');
    text(svg, 42, 48, '材料相同，柱位不同，整体抗弯效率不同', 'capacity-title');
    add(svg, 'rect', { x: 570, y: 190, width: 125, height: 230, class: 'efficiency-bar-bg' });
    add(svg, 'rect', { x: 570, y: 420 - 230 * d.eta, width: 125, height: 230 * d.eta, class: 'efficiency-bar' });
    text(svg, 632, 160, `η = ${(d.eta * 100).toFixed(1)}%`, 'capacity-value').setAttribute('text-anchor', 'middle');
    text(svg, 632, 452, '当前 I / 参照 Iref', 'capacity-small').setAttribute('text-anchor', 'middle');
    text(svg, 42, 565, `I = ${number(d.actual)} m⁴　/　Iref = ${number(d.ideal)} m⁴`, 'capacity-value');
  }
  function updateEfficiency() {
    const d = efficiencyData();
    $('efficiencyWidthOutput').textContent = `${d.B} m`; $('innerPositionOutput').textContent = `${(d.r * d.B).toFixed(1)} m`; $('totalAreaOutput').textContent = `${d.A.toFixed(1)} m²`;
    $('layoutInertia').textContent = `${number(d.actual)} m⁴`; $('layoutEfficiency').textContent = `${(d.eta * 100).toFixed(1)}%`;
    $('idealInertia').textContent = `${number(d.ideal)} m⁴`; $('relativeStiffness').textContent = d.eta.toFixed(2);
    const status = $('efficiencyStatus'); status.dataset.level = 'note';
    const thresholdNote = d.eta >= .75 ? '高于本教学模型的 0.75 观察阈值' : d.eta >= .4 ? '位于本教学模型的 0.40—0.75 观察区间' : '低于本教学模型的 0.40 观察阈值';
    status.textContent = d.r === 0 ? `两根内柱实际位于中和轴，其整体抗弯贡献为零；两根外柱仍有贡献，因此 I/Iref = 50%，并非效率归零。${thresholdNote}，仅用于提示进一步比较。` : `内柱距中和轴 ${(d.r * d.B).toFixed(1)} m。位置贡献随距离平方增长，当前 I 为同面积全外置参照 Iref 的 ${(d.eta * 100).toFixed(1)}%；${thresholdNote}，并非安全或规范界限。`;
    drawEfficiency(d);
  }
  ['capacityHeight', 'capacityShear', 'capacityModulus', 'capacityInertia', 'momentCapacity'].forEach(id => $(id).addEventListener('input', updateResponse));
  ['efficiencyWidth', 'innerPosition', 'totalArea'].forEach(id => $(id).addEventListener('input', updateEfficiency));
  $('resetCapacity').addEventListener('click', () => { Object.entries({ capacityHeight: 60, capacityShear: 3000, capacityModulus: 30, capacityInertia: 12000, momentCapacity: 160000 }).forEach(([id, v]) => { $(id).value = v; }); updateResponse(); });
  $('resetEfficiency').addEventListener('click', () => { Object.entries({ efficiencyWidth: 24, innerPosition: .1667, totalArea: 8 }).forEach(([id, v]) => { $(id).value = v; }); updateEfficiency(); });
  updateResponse(); updateEfficiency();
})();

// Vertical and horizontal eccentricity: compare load and resistance centres.
(() => {
  'use strict';
  const lesson = document.querySelector('#symmetryLesson');
  if (!lesson) return;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const number = (value, digits = 0) => (Object.is(Number(value), -0) || Math.abs(Number(value)) < 1e-12 ? 0 : Number(value)).toLocaleString('zh-CN', { maximumFractionDigits: digits });
  const make = (tag, attrs = {}, value = '') => { const el = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v))); if (value) el.textContent = value; return el; };
  const add = (p, tag, attrs, value) => { const el = make(tag, attrs, value); p.appendChild(el); return el; };
  const line = (p, x1, y1, x2, y2, cls) => add(p, 'line', { x1, y1, x2, y2, class: cls });
  const text = (p, x, y, value, cls = 'symmetry-label') => add(p, 'text', { x, y, class: cls }, value);
  function marker(svg, id, color) { const defs = add(svg, 'defs'); const m = add(defs, 'marker', { id, markerWidth: 9, markerHeight: 9, refX: 8, refY: 4.5, orient: 'auto-start-reverse' }); add(m, 'path', { d: 'M0 0L9 4.5 0 9Z', fill: color }); }
  function verticalData() {
    const B = Number($('verticalWidth').value), W = Number($('verticalWeight').value), e = Number($('verticalEccentricity').value);
    const M = W * e; return { B, W, e, M, RL: W / 2 - M / B, RR: W / 2 + M / B };
  }
  function drawVertical(d) {
    const svg = $('verticalDiagram'); svg.replaceChildren(); marker(svg, 'vertGreen', '#537567'); marker(svg, 'vertRed', '#a34c3f'); marker(svg, 'vertDim', '#6f726b');
    const center = 355, scale = 12, base = 420, left = center - d.B / 2 * scale, right = center + d.B / 2 * scale, width = right - left;
    add(svg, 'rect', { x: left, y: 145, width, height: base - 145, class: 'symmetry-outline' });
    for (let i = 1; i < 6; i++) line(svg, left, 145 + (base - 145) * i / 6, right, 145 + (base - 145) * i / 6, 'capacity-floor');
    add(svg, 'rect', { x: left - 10, y: base, width: width + 20, height: 18, class: 'symmetry-outline' });
    line(svg, left - 32, base, left - 10, base, 'symmetry-ground'); line(svg, right + 10, base, right + 32, base, 'symmetry-ground');
    line(svg, center, 90, center, 520, 'symmetry-centerline'); text(svg, center - 10, 82, '支承中心', 'symmetry-small').setAttribute('text-anchor', 'middle');
    const loadX = center + d.e * scale;
    line(svg, loadX, 180, loadX, 285, 'symmetry-action').setAttribute('marker-end', 'url(#vertRed)'); text(svg, loadX + 14, 230, `W = ${number(d.W)} kN`, 'symmetry-force-label');
    const maxReaction = Math.max(Math.abs(d.RL), Math.abs(d.RR), 1);
    [[left, d.RL, 'RL'], [right, d.RR, 'RR']].forEach(([x, value, label]) => {
      const len = 30 + 70 * Math.abs(value) / maxReaction;
      if (Math.abs(value) < 1e-9) {
        text(svg, x, base + 82, `${label} = 0 kN`, 'symmetry-resistance-label').setAttribute('text-anchor', 'middle');
      } else if (value > 0) {
        line(svg, x, base + 35 + len, x, base + 25, 'symmetry-reaction').setAttribute('marker-end', 'url(#vertGreen)');
        text(svg, x, base + 52 + len, `${label} = ${number(value)} kN`, 'symmetry-resistance-label').setAttribute('text-anchor', 'middle');
      } else {
        line(svg, x, base + 25, x, base + 35 + len, 'symmetry-reaction').setAttribute('marker-end', 'url(#vertGreen)');
        text(svg, x, base + 52 + len, `${label} = ${number(value)} kN（抗拔）`, 'symmetry-resistance-label').setAttribute('text-anchor', 'middle');
      }
    });
    line(svg, center, 115, loadX, 115, 'symmetry-dimension').setAttribute('marker-start', 'url(#vertDim)'); if (d.e > 0) svg.lastChild.setAttribute('marker-end', 'url(#vertDim)');
    line(svg, center, 120, center, 140, 'symmetry-dimension'); line(svg, loadX, 120, loadX, 160, 'symmetry-dimension');
    text(svg, (center + loadX) / 2, 105, `ev = ${d.e.toFixed(1)} m`, 'symmetry-value').setAttribute('text-anchor', 'middle');
    text(svg, 40, 45, '重力作用线偏移，支承反力随之重分配', 'symmetry-title');
  }
  function updateVertical() {
    const d = verticalData();
    $('verticalWidthOutput').textContent = `${d.B} m`; $('verticalWeightOutput').textContent = `${number(d.W)} kN`; $('verticalEccentricityOutput').textContent = `${d.e.toFixed(1)} m`;
    $('verticalMoment').textContent = `${number(d.M)} kN·m`; $('verticalRatio').textContent = (d.e / d.B).toFixed(3);
    $('leftReaction').textContent = `${number(d.RL)} kN`; $('rightReaction').textContent = `${number(d.RR)} kN`;
    const status = $('verticalStatus');
    if (d.e === 0) { status.dataset.level = 'safe'; status.textContent = '重力通过支承中心，两侧反力相等，整体重力弯矩为零。'; }
    else if (Math.abs(d.RL) < 1e-9) { status.dataset.level = 'warning'; status.textContent = '左支承反力为零，全部重力由右支承承担；继续增大偏心将需要左侧抗拔。'; }
    else if (d.RL > 0) { status.dataset.level = 'note'; status.textContent = `右侧反力为左侧的 ${(d.RR / d.RL).toFixed(2)} 倍；两侧仍均为受压反力。${d.RL < d.W * .1 ? 'RL 低于 0.1W 是本教学模型的观察阈值，用于提示进一步检查，并非安全或规范界限。' : ''}`; }
    else { status.dataset.level = 'danger'; status.textContent = '左支承出现受拉需求，普通只承压支承无法维持图示平衡，需设置抗拔或调整方案。'; }
    drawVertical(d);
  }
  function planData() {
    const B = Number($('planWidth').value), H = Number($('planShear').value), xM = Number($('massOffset').value), s = Number($('rightStiffness').value) / 100;
    const xR = (2 * s - 1) * B / 2, e = xM - xR;
    const rawT = H * e, T = Math.abs(rawT) < 1e-12 ? 0 : rawT;
    return { B, H, xM, s, xR, e, T };
  }
  function drawPlan(d) {
    const svg = $('planDiagram'); svg.replaceChildren(); marker(svg, 'planRed', '#a34c3f'); marker(svg, 'planGreen', '#537567'); marker(svg, 'planDim', '#6f726b');
    const center = 355, scale = 12, left = center - d.B / 2 * scale, right = center + d.B / 2 * scale, top = 150, bottom = 420;
    add(svg, 'rect', { x: left, y: top, width: right - left, height: bottom - top, class: 'symmetry-outline' });
    line(svg, center, 95, center, 495, 'symmetry-centerline'); line(svg, left - 35, (top + bottom) / 2, right + 35, (top + bottom) / 2, 'symmetry-centerline');
    line(svg, left, top + 20, left, bottom - 20, 'stiffness-wall').style.opacity = String(.45 + (1 - d.s) * .7);
    line(svg, right, top + 20, right, bottom - 20, 'stiffness-wall').style.opacity = String(.45 + d.s * .7);
    text(svg, left, bottom + 32, `kL = ${((1 - d.s) * 100).toFixed(0)}%`, 'symmetry-resistance-label').setAttribute('text-anchor', 'middle');
    text(svg, right, bottom + 32, `kR = ${(d.s * 100).toFixed(0)}%`, 'symmetry-resistance-label').setAttribute('text-anchor', 'middle');
    const cmX = center + d.xM * scale, crX = center + d.xR * scale;
    add(svg, 'circle', { cx: cmX, cy: 245, r: 9, class: 'mass-center' }); text(svg, cmX + 14, 232, `CM  xM = ${d.xM.toFixed(1)} m`, 'symmetry-force-label');
    add(svg, 'circle', { cx: crX, cy: 335, r: 9, class: 'stiffness-center' }); text(svg, crX + 14, 360, `CR  xR = ${d.xR.toFixed(1)} m`, 'symmetry-resistance-label');
    if (d.H > 0) {
      line(svg, cmX, 165, cmX, 232, 'symmetry-action').setAttribute('marker-end', 'url(#planRed)');
      text(svg, cmX + 14, 183, `地震作用 H = ${number(d.H)} kN`, 'symmetry-force-label');
      line(svg, crX, 475, crX, 405, 'symmetry-reaction').setAttribute('marker-end', 'url(#planGreen)');
      text(svg, crX + 14, 465, '抗力合力 R', 'symmetry-resistance-label');
    }
    if (d.H > 0 && Math.abs(d.e) > .001) {
      line(svg, crX, 120, cmX, 120, 'symmetry-dimension').setAttribute('marker-start', 'url(#planDim)'); svg.lastChild.setAttribute('marker-end', 'url(#planDim)');
      line(svg, crX, 125, crX, 145, 'symmetry-dimension'); line(svg, cmX, 125, cmX, 145, 'symmetry-dimension');
      text(svg, (crX + cmX) / 2, 108, `ex = ${d.e.toFixed(1)} m`, 'symmetry-value').setAttribute('text-anchor', 'middle');
      const clockwise = d.e > 0;
      add(svg, 'path', { d: clockwise ? 'M145 410C75 385 65 295 120 250' : 'M120 250C65 295 75 385 145 410', class: 'torsion-arrow', 'marker-end': 'url(#planRed)' });
      text(svg, 55, 335, clockwise ? 'T（顺时针）' : 'T（逆时针）', 'symmetry-force-label');
    }
    text(svg, 38, 48, '水平作用通过 CM，抗力通过 CR', 'symmetry-title'); text(svg, 38, 540, `T = H·ex = ${number(d.T)} kN·m`, 'symmetry-value');
  }
  function updatePlan() {
    const d = planData();
    $('planWidthOutput').textContent = `${d.B} m`; $('planShearOutput').textContent = `${number(d.H)} kN`; $('massOffsetOutput').textContent = `${d.xM.toFixed(1)} m`; $('rightStiffnessOutput').textContent = `${(d.s * 100).toFixed(0)}%`;
    $('stiffnessCenter').textContent = `${d.xR.toFixed(1)} m`; $('planEccentricity').textContent = `${d.e.toFixed(1)} m`; $('planTorque').textContent = `${number(d.T)} kN·m`; $('planRatio').textContent = (Math.abs(d.e) / d.B).toFixed(3);
    const status = $('planStatus');
    if (d.H === 0) { status.dataset.level = 'safe'; status.textContent = '水平作用为零，当前扭矩为零；偏心几何关系仍需在加载工况中检查。'; }
    else if (Math.abs(d.e) < .001) { status.dataset.level = 'safe'; status.textContent = 'CM 与 CR 重合，本模型仅发生平动，整体扭矩为零。'; }
    else { status.dataset.level = 'note'; status.textContent = `CM 位于 CR ${d.e > 0 ? '右侧' : '左侧'}，形成${d.e > 0 ? '顺时针' : '逆时针'}扭矩；抗侧力设计需同时考虑平动与扭转。${Math.abs(d.e) / d.B > .2 ? '|ex|/B = 0.2 是本教学模型的观察阈值，用于提示进一步检查，并非安全或规范界限。' : ''}`; }
    drawPlan(d);
  }
  ['verticalWidth', 'verticalWeight', 'verticalEccentricity'].forEach(id => $(id).addEventListener('input', updateVertical));
  ['planWidth', 'planShear', 'massOffset', 'rightStiffness'].forEach(id => $(id).addEventListener('input', updatePlan));
  $('resetVertical').addEventListener('click', () => { Object.entries({ verticalWidth: 24, verticalWeight: 48000, verticalEccentricity: 2 }).forEach(([id, v]) => { $(id).value = v; }); updateVertical(); });
  $('resetPlan').addEventListener('click', () => { Object.entries({ planWidth: 24, planShear: 2400, massOffset: 3, rightStiffness: 65 }).forEach(([id, v]) => { $(id).value = v; }); updatePlan(); });
  updateVertical(); updatePlan();
})();



// Chapter 3.2: solid-form slices and section geometry.
(() => {
  'use strict';
  const lesson = document.querySelector('#solidLesson');
  if (!lesson) return;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const clean = value => Math.abs(value) < 1e-9 ? 0 : value;
  const num = (value, digits = 0) => clean(value).toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const signed = (value, digits = 0) => `${clean(value) > 0 ? '+' : ''}${num(value, digits)}`;
  const make = (tag, attrs = {}, value = '') => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, val]) => el.setAttribute(key, String(val)));
    if (value !== '') el.textContent = value;
    return el;
  };
  const add = (parent, tag, attrs, value) => { const el = make(tag, attrs, value); parent.appendChild(el); return el; };
  const line = (p, x1, y1, x2, y2, cls = 'guide') => add(p, 'line', { x1, y1, x2, y2, class: cls });
  const text = (p, x, y, value, cls = '') => add(p, 'text', { x, y, class: cls }, value);
  const center = (p, x, y, value, cls = '') => text(p, x, y, value, cls).setAttribute('text-anchor', 'middle');
  function marker(svg, id, color) {
    const defs = add(svg, 'defs');
    const m = add(defs, 'marker', { id, markerWidth: 9, markerHeight: 9, refX: 8, refY: 4.5, orient: 'auto-start-reverse' });
    add(m, 'path', { d: 'M0 0L9 4.5 0 9Z', fill: color });
  }
  function arrow(p, x1, y1, x2, y2, cls, id) {
    if (Math.hypot(x2 - x1, y2 - y1) < 1e-8) return;
    line(p, x1, y1, x2, y2, cls).setAttribute('marker-end', `url(#${id})`);
  }

  let loadType = 'point';
  function actionData() {
    const H = Number($('solidH').value), h = Number($('solidHeight').value);
    const z = Math.min(Number($('solidCut').value), h);
    const t = z / h;
    let V, M, resultant, base;
    if (loadType === 'point') { V = H; M = H * (h - z); resultant = h; base = H * h; }
    else if (loadType === 'uniform') { V = H * (1 - t); M = H * h * (1 - t) ** 2 / 2; resultant = h / 2; base = H * h / 2; }
    else { V = H * (1 - t ** 2); M = H * (2 * h / 3 - z + z ** 3 / (3 * h ** 2)); resultant = 2 * h / 3; base = 2 * H * h / 3; }
    return { H, h, z, t, V, M, resultant, base };
  }
  function drawActions(d) {
    const svg = $('actionsDiagram'); svg.replaceChildren();
    marker(svg, 'solidAction', '#a34c3f');
    const top = 70, base = 420, xs = [155, 390, 625], cut = base - d.t * (base - top);
    center(svg, 390, 30, '作用分布　→　截面剪力　→　倾覆力矩', 'value');
    xs.forEach((x, i) => {
      line(svg, x, top, x, base, 'guide');
      if (i === 0) line(svg, x - 90, base, x + 90, base, 'ground-line');
      center(svg, x, 465, ['水平作用', '剪力 V(z)', '弯矩 M(z)'][i], 'value');
    });
    if (d.H > 0) {
      if (loadType === 'point') arrow(svg, 55, top, 145, top, 'action', 'solidAction');
      else {
        const count = 7;
        for (let i = 0; i < count; i += 1) {
          const y = top + 20 + i * (base - top - 40) / (count - 1);
          const factor = loadType === 'triangle' ? 1 - i / (count - 1) * .75 : 1;
          arrow(svg, 145 - 75 * factor, y, 145, y, 'action', 'solidAction');
        }
      }
    } else center(svg, 390, 205, 'H = 0：当前无水平作用，V 与 M 均为零', 'small');
    line(svg, 70, cut, 710, cut, 'guide dash');
    text(svg, 72, cut - 10, `z = ${num(d.z, 1)} m`, 'small');
    const vScale = d.H ? Math.abs(d.V / d.H) : 0;
    if (d.H > 0) {
      let shearCurve = '';
      for (let i = 0; i <= 30; i += 1) {
        const t = i / 30;
        const v = loadType === 'point' ? 1 : loadType === 'uniform' ? 1 - t : 1 - t ** 2;
        const x = 390 + 115 * v, y = base - t * (base - top);
        shearCurve += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      add(svg, 'path', { d: `${shearCurve}L390 ${top}L390 ${base}Z`, class: 'compression' });
      if (vScale > 0) line(svg, 390, cut, 390 + 115 * vScale, cut, 'resistance');
    }
    line(svg, 390, base, 505, base, 'diagram-line');
    const mScale = d.base ? Math.abs(d.M / d.base) : 0;
    let curve = '';
    for (let i = 0; i <= 30; i += 1) {
      const t = i / 30, z = t * d.h;
      let m;
      if (loadType === 'point') m = d.H * (d.h - z);
      else if (loadType === 'uniform') m = d.H * d.h * (1 - t) ** 2 / 2;
      else m = d.H * (2 * d.h / 3 - z + z ** 3 / (3 * d.h ** 2));
      const x = 625 + (d.base ? 120 * m / d.base : 0), y = base - t * (base - top);
      curve += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    if (d.H > 0) add(svg, 'path', { d: `${curve}L625 ${base}Z`, class: 'compression' });
    add(svg, 'path', { d: curve, fill: 'none', stroke: '#537567', 'stroke-width': 3 });
    line(svg, 625, base, 745, base, 'diagram-line');
    if (mScale > 0) line(svg, 625, cut, 625 + 120 * mScale, cut, 'resistance');
    center(svg, 390, 495, `V = ${num(d.V)} kN　·　M = ${num(d.M)} kN·m`, 'value');
  }
  function updateActions() {
    const h = Number($('solidHeight').value); $('solidCut').max = h;
    if (Number($('solidCut').value) > h) $('solidCut').value = h;
    const d = actionData();
    $('solidHOutput').textContent = `${num(d.H)} kN`; $('solidHeightOutput').textContent = `${num(d.h)} m`; $('solidCutOutput').textContent = `${num(d.z, 1)} m`;
    $('solidV').textContent = `${num(d.V)} kN`; $('solidM').textContent = `${num(d.M)} kN·m`; $('solidBaseM').textContent = `${num(d.base)} kN·m`; $('solidResultant').textContent = d.H ? `${num(d.resultant, 1)} m` : '—';
    document.querySelectorAll('[data-load-type]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.loadType === loadType)));
    const names = { point: '顶部集中', uniform: '沿高均布', triangle: '倒三角' };
    $('actionsStatus').dataset.level = d.H === 0 ? 'note' : 'safe';
    $('actionsStatus').textContent = d.H === 0 ? '零作用工况：不绘制荷载或抗力箭头；改变截面位置也不会产生内力。' : `${names[loadType]}作用的合力距基础 ${num(d.resultant, 1)} m；同一 H 下，合力越高，基底弯矩越大。`;
    drawActions(d);
  }
  document.querySelectorAll('[data-load-type]').forEach(btn => btn.addEventListener('click', () => { loadType = btn.dataset.loadType; updateActions(); }));
  ['solidH', 'solidHeight', 'solidCut'].forEach(id => $(id).addEventListener('input', updateActions));
  $('resetActions').addEventListener('click', () => { loadType = 'point'; Object.entries({ solidH: 2400, solidHeight: 30, solidCut: 15 }).forEach(([id, v]) => { $(id).value = v; }); updateActions(); });

  let tensionCapable = false;
  function stressData() {
    const N = Number($('solidN').value), M = Number($('solidMoment').value), d = Number($('solidDepth').value), b = 1;
    const A = b * d, W = b * d ** 2 / 6;
    const axial = N / A / 1000, bending = M / W / 1000;
    const e = N ? M / N : null, kern = d / 6;
    const fullContact = (N === 0 && M === 0) || (N > 0 && Math.abs(M) <= N * kern + 1e-9);
    return { N, M, d, A, W, axial, bending, left: -axial + bending, right: -axial - bending, e, kern, fullContact, linearValid: tensionCapable || fullContact };
  }
  function drawStress(d) {
    const svg = $('stressDiagram'); svg.replaceChildren();
    marker(svg, 'stressAction', '#a34c3f'); marker(svg, 'stressDim', '#6f726b');
    const interfaceLeft = 195, interfaceRight = 565, interfaceMid = 380;
    add(svg, 'rect', { x: interfaceLeft, y: 62, width: interfaceRight - interfaceLeft, height: 22, class: 'outline' });
    text(svg, interfaceLeft - 12, 57, '左缘', 'value').setAttribute('text-anchor', 'end');
    text(svg, interfaceRight + 12, 57, '右缘', 'value');
    if (d.N > 0) arrow(svg, interfaceMid, 12, interfaceMid, 54, 'action', 'stressAction');
    text(svg, interfaceMid + 14, 30, d.N > 0 ? 'N' : 'N = 0', 'action-text');
    if (Math.abs(d.M) > 0) {
      const path = d.M > 0 ? 'M155 90Q100 60 155 30' : 'M155 30Q100 60 155 90';
      add(svg, 'path', { d: path, fill: 'none', stroke: '#a34c3f', 'stroke-width': 3, 'marker-end': 'url(#stressAction)' });
      text(svg, 116, 58, 'M', 'action-text');
    }
    line(svg, interfaceLeft, 88, interfaceLeft, 120, 'guide');
    line(svg, interfaceRight, 88, interfaceRight, 120, 'guide');
    line(svg, interfaceLeft, 112, interfaceRight, 112, 'guide').setAttribute('marker-start', 'url(#stressDim)');
    svg.lastChild.setAttribute('marker-end', 'url(#stressDim)');
    center(svg, interfaceMid, 106, `d = ${num(d.d)} m`, 'small');
    const direction = d.M > 0 ? 'M > 0：左缘拉、右缘压' : d.M < 0 ? 'M < 0：左缘压、右缘拉' : 'M = 0：无弯曲应力';
    center(svg, interfaceMid, 145, direction, 'small');
    center(svg, interfaceMid, 172, '三个图横轴均为左缘 → 右缘；向上为拉、向下为压，共用当前比例', 'small');

    const zero = 310, halfWidth = 85, amplitude = 90;
    const actualMax = Math.max(Math.abs(d.left), Math.abs(d.right), d.axial, Math.abs(d.bending));
    const scale = actualMax > 1e-9 ? amplitude / actualMax : 0;
    const charts = [
      { x: 140, title: '① 轴压 −N/A', left: -d.axial, right: -d.axial, valid: true },
      { x: 380, title: '② 弯曲 ±M/W', left: d.bending, right: -d.bending, valid: true },
      { x: 620, title: d.linearValid ? '③ 叠加结果' : '③ 叠加假定失效', left: d.left, right: d.right, valid: d.linearValid }
    ];
    const drawRegion = (chart, leftStress, rightStress) => {
      const left = chart.x - halfWidth, right = chart.x + halfWidth;
      const yLeft = zero - leftStress * scale, yRight = zero - rightStress * scale;
      if (Math.abs(leftStress) < 1e-9 && Math.abs(rightStress) < 1e-9) {
        center(svg, chart.x, zero - 12, '应力为零', 'small');
        return;
      }
      if (leftStress * rightStress < 0) {
        const xZero = left - leftStress * (right - left) / (rightStress - leftStress);
        add(svg, 'path', { d: `M${left} ${zero}L${left} ${yLeft}L${xZero} ${zero}Z`, class: leftStress > 0 ? 'tension' : 'compression' });
        add(svg, 'path', { d: `M${xZero} ${zero}L${right} ${yRight}L${right} ${zero}Z`, class: rightStress > 0 ? 'tension' : 'compression' });
        center(svg, xZero, zero - 10, 'σ=0', 'small');
      } else {
        const stress = Math.abs(leftStress) > 1e-9 ? leftStress : rightStress;
        add(svg, 'path', { d: `M${left} ${zero}L${left} ${yLeft}L${right} ${yRight}L${right} ${zero}Z`, class: stress > 0 ? 'tension' : 'compression' });
      }
      line(svg, left, yLeft, right, yRight, 'diagram-line');
    };
    charts.forEach((chart, index) => {
      const left = chart.x - halfWidth, right = chart.x + halfWidth;
      line(svg, left, zero, right, zero, 'diagram-line');
      if (!chart.valid) {
        center(svg, chart.x, zero - 60, '受拉侧张开', 'action-text');
        const base = zero + 35;
        line(svg, left, base, right, base, 'diagram-line');
        if (d.M >= 0) line(svg, left + 8, base - 28, right, base, 'action');
        else line(svg, left, base, right - 8, base - 28, 'action');
        center(svg, chart.x, base + 32, '改按实际接触区分析', 'small');
      } else {
        drawRegion(chart, chart.left, chart.right);
        if (index === 0) {
          center(svg, chart.x, 424, `${signed(chart.left, 2)} MPa（全截面）`, 'resistance-text');
        } else {
          const yLeft = zero - chart.left * scale, yRight = zero - chart.right * scale;
          center(svg, left, yLeft + (chart.left > 0 ? -10 : 20), `${signed(chart.left, 2)} MPa`, chart.left > 0 ? 'action-text' : 'resistance-text');
          center(svg, right, yRight + (chart.right > 0 ? -10 : 20), `${signed(chart.right, 2)} MPa`, chart.right > 0 ? 'action-text' : 'resistance-text');
        }
      }
      center(svg, chart.x, 458, chart.title, 'value');
    });
    center(svg, 260, 324, '+', 'equation-sign');
    center(svg, 500, 324, '=', 'equation-sign');
    center(svg, 380, 490, '红色：拉应力　绿色：压应力；顶部红色箭头表示外部作用', 'small');
    const modelNote = tensionCapable
      ? '连续界面：允许受拉；调参后图形重新归一化，精确值以数字为准'
      : d.linearValid
        ? `不能抗拉：全接触边界 |e| ≤ ${num(d.kern, 1)} m；调参后图形重新归一化`
        : '不能抗拉：前两图仅为代数分项，张开后的实际应力需按接触区另算';
    center(svg, 380, 518, modelNote, 'small');
  }
  function updateStress() {
    const d = stressData();
    $('solidNOutput').textContent = `${num(d.N)} kN`; $('solidMomentOutput').textContent = `${signed(d.M)} kN·m`; $('solidDepthOutput').textContent = `${num(d.d)} m`;
    $('axialStress').textContent = `${num(d.axial, 2)} MPa`; $('bendingStress').textContent = `${signed(d.bending, 2)} MPa`;
    $('edgeStress').textContent = d.linearValid ? `${signed(d.left, 2)} / ${signed(d.right, 2)} MPa` : '— / — MPa'; $('solidEccentricity').textContent = d.e === null ? '—（N=0）' : `${signed(d.e, 2)} m`;
    $('toggleTension').setAttribute('aria-pressed', String(tensionCapable)); $('toggleTension').textContent = tensionCapable ? '界面：可以抗拉' : '界面：不能抗拉';
    const status = $('stressStatus');
    if (d.N === 0 && d.M === 0) { status.dataset.level = 'note'; status.textContent = 'N 与 M 均为零，截面应力为零；不显示荷载箭头。'; }
    else if (d.N === 0 && !tensionCapable) { status.dataset.level = 'warning'; status.textContent = 'N = 0 时，不能抗拉的界面对任何非零 M 都无法维持全截面受压；边缘应力结果已隐藏。'; }
    else if (!tensionCapable && !d.fullContact) { status.dataset.level = 'warning'; status.textContent = `|e| = ${num(Math.abs(d.e), 2)} m 超过 d/6；受拉侧将张开，全截面线弹性结果失效，边缘应力已隐藏。`; }
    else if (!tensionCapable && Math.abs(Math.abs(d.e) - d.kern) < 1e-9) { status.dataset.level = 'note'; status.textContent = '正处于全截面受压边界：一侧边缘应力为零，但尚未受拉。'; }
    else { status.dataset.level = 'safe'; status.textContent = tensionCapable ? '按可抗拉连续截面叠加应力；正负弯矩会交换两侧拉压状态。' : '两侧均受压，当前满足不能抗拉界面的全接触条件；这不等同于完成抗剪或稳定验算。'; }
    drawStress(d);
  }
  ['solidN', 'solidMoment', 'solidDepth'].forEach(id => $(id).addEventListener('input', updateStress));
  $('toggleTension').addEventListener('click', () => { tensionCapable = !tensionCapable; updateStress(); });
  $('resetStress').addEventListener('click', () => { tensionCapable = false; Object.entries({ solidN: 48000, solidMoment: 72000, solidDepth: 24 }).forEach(([id, v]) => { $(id).value = v; }); updateStress(); });

  let showApprox = true;
  function sectionData() {
    const tf = Number($('flangeThickness').value), d = Number($('sectionDepth').value), M = Number($('sectionMoment').value);
    const bf = 300, area = 19600, hw = d - 2 * tf, Af = bf * tf, tw = (area - 2 * Af) / hw;
    const If = 2 * (bf * tf ** 3 / 12 + Af * (d / 2 - tf / 2) ** 2), Iw = tw * hw ** 3 / 12, I = If + Iw;
    const z = d - tf, Iapprox = 2 * Af * (z / 2) ** 2, Irect = area * d ** 2 / 12;
    return { tf, d, M, bf, area, hw, Af, tw, z, If, Iw, I, Iapprox, ratio: I / Irect, share: If / I, error: (Iapprox - I) / I * 100, stress: M * 1e6 * d / 2 / I, approxStress: M * 1e6 * d / 2 / Iapprox, couple: M / (z / 1000) };
  }
  function drawSection(d) {
    const svg = $('sectionDiagram'); svg.replaceChildren();
    const x = 90, top = 80, height = 300, scale = height / d.d, hwPx = d.hw * scale, tfPx = d.tf * scale, width = 180, webWidth = Math.max(3, d.tw / d.bf * width);
    add(svg, 'rect', { x, y: top, width, height: tfPx, class: 'diagram-fill' }); add(svg, 'rect', { x: x + width / 2 - webWidth / 2, y: top + tfPx, width: webWidth, height: hwPx, class: 'outline' }); add(svg, 'rect', { x, y: top + height - tfPx, width, height: tfPx, class: 'diagram-fill' });
    line(svg, 55, top + height / 2, 320, top + height / 2, 'guide dash');
    text(svg, 65, 55, `H 形：tw = ${num(d.tw, 1)} mm`, 'value');
    const rx = 390, rw = d.area / d.d / d.bf * width;
    add(svg, 'rect', { x: rx, y: top, width: rw, height, class: 'outline' }); text(svg, 365, 55, '同面积矩形', 'value');
    const bx = 555, by = 115, barH = 235;
    add(svg, 'rect', { x: bx, y: by, width: 55, height: barH, class: 'bar-bg' });
    add(svg, 'rect', { x: bx, y: by + barH * (1 - d.share), width: 55, height: barH * d.share, class: 'bar-flange' });
    add(svg, 'rect', { x: bx, y: by, width: 55, height: barH * (1 - d.share), class: 'bar-web' });
    text(svg, 630, 140, `腹板 ${num((1 - d.share) * 100, 1)}%`, 'small'); text(svg, 630, 260, `翼缘 ${num(d.share * 100, 1)}%`, 'resistance-text');
    center(svg, 582, 390, 'I 的组成', 'value');
    if (showApprox) {
      text(svg, 50, 425, `z = ${num(d.z)} mm　·　外缘应力近似 ${num(d.approxStress, 1)} MPa`, 'small');
      text(svg, 50, 455, `Iapprox = ${num(d.Iapprox / 1e8, 2)} ×10⁸ mm⁴　·　误差 ${signed(d.error, 1)}%`, 'value');
    } else text(svg, 50, 455, '翼缘近似已隐藏；图中与数值仍保留精确 I。', 'small');
    center(svg, 380, 495, `I = ${num(d.I / 1e8, 3)} ×10⁸ mm⁴　·　I/Irect = ${num(d.ratio, 2)}`, 'value');
  }
  function updateSection() {
    const d = sectionData();
    $('flangeThicknessOutput').textContent = `${num(d.tf)} mm`; $('sectionDepthOutput').textContent = `${num(d.d)} mm`; $('sectionMomentOutput').textContent = `${num(d.M)} kN·m`;
    $('sectionI').textContent = `${num(d.I / 1e8, 3)} ×10⁸ mm⁴`; $('sectionRatio').textContent = `${num(d.ratio, 2)} 倍`; $('flangeShare').textContent = `${num(d.share * 100, 1)}%`;
    $('approxError').textContent = `${signed(d.error, 1)}%`; $('sectionStress').textContent = `${num(d.stress, 1)} MPa`; $('sectionCouple').textContent = `${num(d.couple)} kN`;
    $('toggleApprox').setAttribute('aria-pressed', String(showApprox)); $('toggleApprox').textContent = showApprox ? '隐藏翼缘近似' : '显示翼缘近似';
    const ratio = 2 * d.Af / (d.tw * d.hw);
    $('sectionStatus').dataset.level = Math.abs(d.error) > 10 ? 'warning' : 'safe';
    $('sectionStatus').textContent = d.M === 0 ? `M = 0，边缘应力与力偶均为零；几何量仍保留。当前翼缘/腹板面积比为 ${num(ratio, 2)}。` : `翼缘/腹板面积比 ${num(ratio, 2)}；近似省略翼缘自身项和腹板项，低估 I 约 ${num(Math.abs(d.error), 1)}%。${Math.abs(d.error) > 10 ? '省略项影响较大，应使用精确分项式。' : '省略项影响较小，可用于本模型的初步比较。'}`;
    drawSection(d);
  }
  ['flangeThickness', 'sectionDepth', 'sectionMoment'].forEach(id => $(id).addEventListener('input', updateSection));
  $('toggleApprox').addEventListener('click', () => { showApprox = !showApprox; updateSection(); });
  $('resetSection').addEventListener('click', () => { showApprox = true; Object.entries({ flangeThickness: 20, sectionDepth: 800, sectionMoment: 240 }).forEach(([id, v]) => { $(id).value = v; }); updateSection(); });

  updateActions(); updateStress(); updateSection();
})();
