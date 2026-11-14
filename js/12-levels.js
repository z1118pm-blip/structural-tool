"use strict";

/* =====================================================================
   12. 概念关卡库
   与「自检」的区别：自检是面向开发者的回归验证场景；关卡是面向学习者的
   概念训练路径——每关带教学目标、验收点与讲解，部分关卡可发起「先猜后算」。
   关卡 state 为 SHARE_KEYS 的差量子集：applyStateFromObj 会先把所有可分享
   字段重置为默认值，因此只需写与默认不同的字段。
   ===================================================================== */

const LEVEL_CATEGORIES = {
  boundary: { name: '边界与约束', icon: '⚓', order: 1 },
  rho:      { name: '线刚度比 ρ', icon: '📐', order: 2 },
  brace:    { name: '支撑与抗侧', icon: '🧱', order: 3 },
  counter:  { name: '反直觉工况', icon: '🔥', order: 4 }
};

const LEVELS = [
  /* ==================== ① 边界与约束 ==================== */
  {
    id: 'bd-colbase-fixed-pin', category: 'boundary', difficulty: 'L1',
    title: '柱脚：刚接 vs 铰接',
    goal: '理解柱脚转动约束如何分配倾覆力矩、影响侧移',
    state: { H1: 30, forceType: 'M', showVals: true, displayMode: 'all', mScale: 7, dScale: 100 },
    sweep: { param: 'betaF', range: [1, 0] },
    predict: { target: 'M', hint: '单层单跨、顶部水平力。请画出弯矩图形状——注意柱脚刚接时柱脚有没有弯矩。' },
    checks: [
      'βf=1 时柱脚弯矩显著，柱中部附近出现反弯点',
      'βf→0 时柱脚弯矩归零，倾覆力矩转由两侧柱轴力偶承担（切 N 图看）',
      '柱脚铰接后侧移明显增大'
    ],
    teach: '水平力 H 产生倾覆力矩 M=H·h，它有两个出口：<b>柱脚弯矩</b>与<b>柱轴力拉压偶</b>。柱脚刚接时弯矩出口通畅，轴力小；铰接时弯矩出口被焊死，倾覆力矩 100% 挤进轴力通道——轴力飙升、侧移放大。<br><br>这就是为什么排架（铰接柱脚）要比刚架"胖"得多。'
  },
  {
    id: 'bd-beam-end-release', category: 'boundary', difficulty: 'L1',
    title: '梁端弯矩释放',
    goal: '理解节点转动约束与弯矩重分配：释放不会消失，只会转移',
    state: { nBay: 2, nLev: 2, q1: 20, q2: 20, forceType: 'M', showVals: true, displayMode: 'force', mScale: 5 },
    sweep: { param: 'betaJ', range: [1, 0] },
    predict: { target: 'M', hint: '两层两跨、满跨均布荷载。请画出弯矩图形状——梁端刚接时负弯矩在梁端还是跨中？' },
    checks: [
      'βj=1 时梁端负弯矩大、跨中正弯矩小',
      'βj→0 时梁端弯矩归零、跨中正弯矩增大趋近 ql²/8',
      '柱内弯矩同步减小'
    ],
    teach: '梁端转动约束 βj 从 1 放到 0，梁端负弯矩被"释放"——但弯矩不会凭空消失，它转移到了跨中。<b>释放的是约束，转移的是内力。</b>概念上 βj 与柱脚 βf 完全等价：都是转动弹簧。<br><br>工程对应：钢结构梁端螺栓连接接近半刚接，按刚接设计会低估跨中弯矩。'
  },
  {
    id: 'bd-semi-rigid', category: 'boundary', difficulty: 'L2',
    title: '半刚接是连续谱，不是开关',
    goal: '理解 β∈(0,1) 是连续转动弹簧，而非"刚接/铰接"二值',
    freezePrelude: { state: { H1: 30, betaF: 1, betaJ: 1, forceType: 'M', displayMode: 'force', mScale: 7 } },
    state: { H1: 30, betaF: 0.5, betaJ: 0.5, forceType: 'M', displayMode: 'force', mScale: 7 },
    checks: [
      '实线（β=0.5）的弯矩介于刚接虚线与铰接极限之间',
      '手动把 β 滑块从 0.5 拖到 0 和 1，曲线连续渐变无跳变'
    ],
    teach: '紫色虚线是 β=1 刚接基线，实线是 β=0.5 半刚接。β 是 0~1 的<b>连续转动弹簧刚度</b>，不是开关。真实节点（螺栓端板、榫卯、装配式套筒）都落在这个连续谱中间——"刚接假定"只是谱的一个端点。<br><br>试着拖动左下角 βf / βj 滑块，感受内力随约束刚度的连续流动。'
  },
  {
    id: 'bd-mixed-supports', category: 'boundary', difficulty: 'L2',
    title: '混合支座：水平力按刚度分配',
    goal: '理解水平力在各柱间按抗侧刚度分配，滚轴柱不参与抗侧',
    state: { nBay: 2, H1: 30, supportMap: { '1': { type: 'pin' }, '2': { type: 'roller' } }, forceType: 'M', showVals: true, displayMode: 'all', mScale: 7, dScale: 150 },
    sweep: { param: 'H1', range: [0, 50] },
    checks: [
      '左柱（固接）弯矩最大，承担最多水平力',
      '中柱（铰接）次之',
      '右柱（滚轴）弯矩恒为零——它"摆烂"不抗侧'
    ],
    teach: '三根柱子支座不同：左固接、中铰接、右滚轴。水平力不会平均分配，而是<b>按各柱的抗侧刚度分配</b>。滚轴柱水平方向无约束，完全退出抗侧。<br><br>工程对应：抗震缝两侧的框架、带摇摆柱的厂房，都要算清楚"谁在抗侧"。'
  },

  /* ==================== ② 线刚度比 ρ ==================== */
  {
    id: 'rho-strong-col-weak-beam', category: 'rho', difficulty: 'L1',
    title: '强柱弱梁 vs 强梁弱柱',
    goal: '理解梁柱线刚度比 ρ 决定反弯点位置与破坏机制',
    state: { H1: 40, forceType: 'M', showVals: true, showAntiPts: true, displayMode: 'force', mScale: 7 },
    sweep: { param: 'hc', range: [300, 800] },
    predict: { target: 'M', hint: '单层单跨、水平力。请画出柱和梁的弯矩图形状，并标出你估计的柱反弯点位置。' },
    checks: [
      '柱越粗（hc 大），柱反弯点越偏离柱中点',
      '柱反弯点位置由梁柱线刚度比决定，与荷载大小无关'
    ],
    teach: 'ρ = (EI_b/L) / (EI_c/h) 是梁柱线刚度比。柱越弱（ρ 大），梁对柱的约束越强，柱反弯点越靠上；柱越强（ρ 小），反弯点越靠下。<br><br><b>"强柱弱梁"</b>的抗震设计理念，本质就是控制 ρ，让塑性铰出在梁上而不是柱上。扫掠柱高 hc，盯住反弯点标注的移动。'
  },
  {
    id: 'rho-inflection-theory', category: 'rho', difficulty: 'L2',
    title: '反弯点位置公式验证',
    goal: '用数值结果验证手算反弯点公式 y/h=(1+3k)/(1+6k)',
    state: { H1: 40, hb: 400, forceType: 'M', showAntiPts: true, showVals: false, displayMode: 'force', mScale: 7 },
    sweep: { param: 'hb', range: [400, 900] },
    checks: [
      '梁越高（线刚度越大），柱反弯点越向 0.5h 靠拢',
      '反弯点位置变化是连续渐近的，永远达不到理想 0.5h'
    ],
    teach: '单层框架受水平力，柱反弯点高度有理论解：<b>y/h = (1+3k)/(1+6k)</b>（k 为梁柱线刚度比）。梁无限刚时 k→∞，y/h→0.5（反弯点法中柱反弯点在柱中假定）。<br><br>扫掠梁高 hb 验证：任何有限刚度的梁，反弯点都在 0.5h 上方——手算近似永远偏不安全一侧。'
  },
  {
    id: 'rho-story-height', category: 'rho', difficulty: 'L2',
    title: '层高增大：梁端趋近简支',
    goal: '理解层高通过降低柱线刚度，间接削弱对梁端的约束',
    state: { q1: 60, forceType: 'M', showVals: true, displayMode: 'force', mScale: 2 },
    sweep: { param: 'h1', range: [2.5, 7] },
    checks: [
      '层高越大，梁端负弯矩越小、跨中正弯矩越大',
      '极限状态趋向简支梁弯矩图（抛物线，端部为零）'
    ],
    teach: '层高 h₁ 增大 → 柱线刚度 EI_c/h₁ 降低 → 柱对梁端的转动约束变弱 → 梁端负弯矩减小、跨中弯矩增大，弯矩图向简支梁靠拢。<br><br><b>梁端的"固结"不是绝对的</b>，它由柱的相对刚度提供。大层高门厅的边梁，跨中弯矩会比标准层大得多。'
  },
  {
    id: 'rho-inner-col-alloc', category: 'rho', difficulty: 'L2',
    title: '刚性楼板下的剪力分配',
    goal: '理解刚性楼板强制各柱同侧移，剪力按柱刚度分配',
    state: { nBay: 3, nLev: 2, H2: 60, Hmode: 'rigid', forceType: 'V', elFilter: 'col', showVals: true, displayMode: 'all', mScale: 10, dScale: 300 },
    sweep: { param: 'r', range: [0.25, 4] },
    checks: [
      '内柱刚度比 r 越大，内柱分担的剪力越多',
      '同一层各柱顶侧移相等（刚性楼板的含义）'
    ],
    teach: '刚性楼板假定同层各柱顶侧移相等，于是层剪力<b>按各柱侧移刚度自动分配</b>——这就是 D 值法的物理基础。扫掠内柱刚度比 r：r 越大，内柱分走的剪力越多。<br><br>工程对应：框架-剪力墙结构中，墙分走绝大部分剪力，靠的就是刚度悬殊。'
  },

  /* ==================== ③ 支撑与抗侧 ==================== */
  {
    id: 'br-x-vs-none', category: 'brace', difficulty: 'L1',
    title: '无撑 vs X 撑：数量级差异',
    goal: '直观感受支撑对侧向刚度的数量级提升',
    freezePrelude: { state: { H1: 30, displayMode: 'deform', dScale: 100 } },
    state: { H1: 30, braceMap: { '1-1': 'X' }, displayMode: 'deform', dScale: 100 },
    predict: { target: 'M', hint: '单层单跨带 X 撑、水平力。加了支撑后柱的弯矩图会变成什么样？先猜再揭晓。' },
    checks: [
      '实线（有撑）侧移比虚线（无撑）小一个数量级',
      '切到 M 图：柱端弯矩被支撑大幅分走'
    ],
    teach: '紫色虚线是无撑纯框架，实线是加 X 撑。<b>框架靠弯曲抗侧，支撑靠轴向抗侧</b>——轴向变形远比弯曲变形"硬"，所以侧移直接掉一个数量级。<br><br>这就是高层必须用支撑/剪力墙/筒体的原因：纯框架抗侧是"穷人方案"。'
  },
  {
    id: 'br-single-dir', category: 'brace', difficulty: 'L2',
    title: '仅受拉单撑的方向不对称',
    goal: '理解柔性单撑只能单向抗侧：方向反了就退出',
    freezePrelude: { state: { H1: 30, braceMap: { '1-1': '/' }, braceTensionMap: { '1-1': true }, forceType: 'N', showVals: true, displayMode: 'force', mScale: 3 } },
    state: { H1: 30, braceMap: { '1-1': '\\' }, braceTensionMap: { '1-1': true }, forceType: 'N', showVals: true, displayMode: 'force', mScale: 3 },
    checks: [
      '虚线 ╱ 撑受拉，有轴力、正常工作',
      '实线 ╲ 撑受压，轴力为零（退出工作）',
      '实线工况的侧移回到无撑水平'
    ],
    teach: '同一水平力，虚线 ╱ 撑恰好受拉，正常工作；实线 ╲ 撑受压——柔性杆件（钢索、圆钢拉条）<b>受压即屈曲退出</b>，轴力归零。<br><br>所以仅受拉支撑必须成对交叉布置（X 撑），或者按双向荷载分别验算。抗震设计里这叫"支撑布置的方向性"。'
  },
  {
    id: 'br-tension-only', category: 'brace', difficulty: 'L2',
    title: '仅受拉 X 撑的非线性迭代',
    goal: '理解受压杆退出是迭代收敛的非线性过程',
    state: { H1: 30, braceMap: { '1-1': 'X' }, braceTensionMap: { '1-1': true }, forceType: 'N', showVals: true, displayMode: 'force', mScale: 3 },
    sweep: { param: 'H1', range: [0, 100] },
    checks: [
      '任意时刻 N 图上只有一根斜杆有轴力（受拉那根）',
      '受压杆轴力恒为零，不是"算出来很小"而是被移除'
    ],
    teach: 'X 撑两杆一拉一压。仅受拉假定下，求解器每轮迭代把受压杆从刚度矩阵中剔除，重算至收敛——这是<b>非线性分析</b>，不是一次线性求解。<br><br>扫掠 H₁ 观察：荷载反向时（把 H₁ 扫回负方向试试），工作的杆会交换。'
  },
  {
    id: 'br-area-stiffness', category: 'brace', difficulty: 'L2',
    title: '支撑截面积与侧向刚度',
    goal: '理解支撑刚度的渐近特性：加到一定量后收益递减',
    state: { H1: 30, braceMap: { '1-1': 'X' }, displayMode: 'deform', dScale: 100 },
    sweep: { param: 'As', range: [100, 5000] },
    checks: [
      '侧移随 As 增大而减小',
      'As 很大后侧移趋于极限（框架+刚性杆的串联刚度），再加粗无效'
    ],
    teach: '支撑与框架是<b>并联</b>抗侧，但支撑自身轴向刚度 EA/L 随 As 线性增长，而总侧移是"支撑+框架"的组合——As 到一定程度后，变形由框架的弯曲刚度兜底，继续加粗支撑收益递减。<br><br>概念：<b>刚度链里最软的一环决定整体</b>。'
  },
  {
    id: 'br-angle-optimum', category: 'brace', difficulty: 'L3',
    title: '支撑最优角度 ≈35°，不是 45°',
    goal: '打破"45° 最优"的直觉，理解角度-长度-刚度的耦合',
    state: { H1: 30, braceMap: { '1-1': 'X' }, displayMode: 'deform', dScale: 100 },
    sweep: { param: 'L1', range: [3, 12] },
    checks: [
      '侧移先减小后增大，存在最优角度',
      '最优出现在 θ≈35°（跨高比 L/h≈1.4）附近，而非 45°'
    ],
    teach: '支撑水平分刚度 ∝ cos²θ·sinθ·(EA/h)：角度大则水平分量小，角度小则杆长拉长、轴向刚度降。两者耦合的结果是<b>最优角约 35°</b>（对常用截面）。<br><br>扫掠左跨 L₁（改变支撑角度），盯住变形图找侧移最小点。结构概念里充满了这类"直觉错、算才对"的反例。'
  },

  /* ==================== ④ 反直觉工况 ==================== */
  {
    id: 'ct-settlement', category: 'counter', difficulty: 'L1',
    title: '支座沉降：没加荷载也有内力',
    goal: '理解超静定结构中强迫位移产生次内力',
    state: { nBay: 2, nLev: 2, supportMap: { '0': { dy: 0 } }, forceType: 'M', showVals: true, displayMode: 'all', mScale: 0.6, dScale: 10 },
    sweep: { param: 'settleDy', range: [0, 100] },
    predict: { target: 'M', hint: '两层两跨、左柱下沉。一毛钱荷载都没加——会有弯矩图吗？什么形状？先画出来。' },
    checks: [
      '沉降从 0 增大时，M 图从零"长"出来',
      '梁柱节点处弯矩最大，内力沿高度衰减',
      '静定结构（如三根简支梁）沉降不产生内力——超静定才会'
    ],
    teach: '超静定结构的支座沉降是<b>强迫位移</b>：多余约束阻止结构自由跟随沉降，于是"憋"出内力。荷载为零，内力不为零——这是超静定与静定的本质区别。<br><br>工程对应：软土地区不均匀沉降是框架开裂的头号原因之一；反过来说，主动施加强迫位移（预应力、支座顶升）也能反向利用这个机理调内力。'
  },
  {
    id: 'ct-temp-gradient', category: 'counter', difficulty: 'L2',
    title: '温度梯度：两端同号的固端弯矩',
    goal: '区分温度梯度弯矩（同号）与荷载弯矩（异号）',
    state: { tempGrad: 15, forceType: 'M', showVals: true, displayMode: 'force', mScale: 3 },
    sweep: { param: 'tempGrad', range: [0, 30] },
    predict: { target: 'M', hint: '单层单跨、梁内外温差。梁弯矩图是两端同号还是异号？画出来再揭晓。' },
    checks: [
      '梁弯矩两端同号（都是同侧受拉）——与均布荷载的异号端弯矩截然不同',
      '弯矩沿梁近似均匀分布（纯弯曲特征）'
    ],
    teach: '温度梯度让梁产生<b>均匀曲率</b> α·ΔT/h。超静定约束不让它自由弯曲，产生的固端弯矩两端<b>同号</b>——而均布荷载的固端弯矩两端异号。<br><br>看弯矩图形状就能反推作用类型，这是"读图"的基本功。日照温差对长连桥、超长框架的影响就用这个机理估算。'
  },
  {
    id: 'ct-temp-uniform-axial', category: 'counter', difficulty: 'L1',
    title: '均匀升温：膨胀受阻的轴压力',
    goal: '理解均匀升温在超静定框架中产生轴力而非弯矩为主',
    state: { nBay: 2, tempAll: 30, forceType: 'N', showVals: true, displayMode: 'force', mScale: 6 },
    sweep: { param: 'tempAll', range: [0, 50] },
    checks: [
      '梁内出现均匀轴压力（膨胀被柱顶住）',
      '切 M 图对比：弯矩只是约束侧移的副产品，量级小'
    ],
    teach: '均匀升温 α·ΔT·L 的自由膨胀被两端柱约束，梁内憋出<b>均匀轴压力</b>。均匀升温的主力是轴力，弯矩只是"柱被顶弯"的副产品。<br><br>工程对应：超长结构（>55m 混凝土框架）必须考虑温度作用，这就是规范设温度缝间距的力学根源。'
  },
  {
    id: 'ct-uplift', category: 'counter', difficulty: 'L2',
    title: '支座上抬：负沉降的反向内力',
    goal: '理解强迫位移的方向性：上抬=反向次内力（抗浮机理）',
    state: { nBay: 2, nLev: 2, supportMap: { '0': { dy: 0 } }, forceType: 'M', showVals: true, displayMode: 'all', mScale: 0.6, dScale: 10 },
    sweep: { param: 'settleDy', range: [0, -100] },
    checks: [
      '上抬（dy<0）产生的弯矩与下沉完全反号',
      '框架整体上拱，边柱可能受拉'
    ],
    teach: '把沉降扫到负值 = 支座上抬。次内力与下沉<b>完全反号</b>——这就是地下水位上升时基础抗浮的力学图像：浮力把中间柱顶起，框架上拱。<br><br>同一个机理，符号相反。概念过关的标志之一：给出"位移方向"，你能直接说出内力方向，不用算。'
  },
  {
    id: 'ct-gravity-sway', category: 'counter', difficulty: 'L2',
    title: '竖向荷载也能引起侧移',
    goal: '打破"竖向荷载只产生竖向变形"的直觉',
    state: { nBay: 2, L1: 10, L2: 4, q1: 60, forceType: 'M', showVals: true, displayMode: 'deform', dScale: 300 },
    predict: { target: 'M', hint: '两跨不对称（10m+4m）、仅左跨满布竖向荷载。没有水平力——弯矩图对称吗？先画。' },
    checks: [
      '纯竖向荷载下出现肉眼可见的水平侧移（变形图已放大）',
      '不对称结构 + 不对称荷载 → 节点不平衡弯矩 → 侧移'
    ],
    teach: '左跨 10m、右跨 4m，只在左跨加竖向荷载。<b>没有任何水平力，框架却明显侧移</b>——中柱节点两侧梁端弯矩不平衡，柱子被"推"向一侧。<br><br>这就是为什么手算分层法必须先验"无侧移假定"：不对称工况下这个假定不成立，手算要加侧移修正。'
  }
];

/* ---------- 关卡加载 ---------- */
function runLevel(levelId, opts){
  const lv = LEVELS.find(l => l.id === levelId);
  if(!lv){
    if(typeof showToast === 'function') showToast('未找到关卡：' + levelId);
    return;
  }
  opts = opts || {};

  /* 0. 退出可能激活的先猜后算模式 */
  if(typeof window.__predictExit === 'function') window.__predictExit();

  /* 1. 高亮当前卡片 */
  document.querySelectorAll('.levelCard').forEach(c => {
    c.classList.toggle('active', c.dataset.level === levelId);
  });

  /* 2. 清残留：toast / 弹窗 / 扫掠 / 浮窗 / 冻结基线 */
  const existingToast = document.getElementById('stToast');
  if(existingToast) existingToast.classList.remove('on');
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  if(S.sweep.playing && typeof sweepStop === 'function') sweepStop();
  const floatAnti = document.getElementById('floatAntiRhoWrap');
  if(floatAnti) floatAnti.hidden = true;
  BASE = null;
  const _fz  = document.getElementById('btnFreeze');
  if(_fz)  _fz.classList.remove('on');
  const _fzD = document.getElementById('btnFreezeDeform');
  if(_fzD) _fzD.classList.remove('on');

  /* 3. 图例文字 */
  S.uiLegend = { base: '冻结基线', current: '当前工况' };

  /* 4. 可选对比基线：先加载 prelude 并冻结 */
  if(lv.freezePrelude){
    if(!applyStateFromObj(lv.freezePrelude.state)) return;
    _freezeCurrentModel();
  }

  /* 5. 加载关卡主工况（内部已重置全部 SHARE_KEYS 并 run()） */
  if(!applyStateFromObj(lv.state)) return;
  S.activeLevelId = levelId;

  /* 6. 讲解 toast：教学目标 + 讲解 + 验收点（持久显示，点击关闭） */
  {
    let msg = '<b>🎯 ' + lv.title + '</b><br>' + lv.teach;
    if(lv.checks && lv.checks.length){
      msg += '<br><br><b>验收点：</b><br>' + lv.checks.map((c,i)=> (i+1)+'. '+c).join('<br>');
    }
    if(typeof showToast === 'function') showToast(msg, 0, true);
  }

  /* 7. 扫掠自动演示（先猜后算发起时跳过，避免与手绘冲突） */
  if(lv.sweep && !opts.skipSweep){
    const bar    = document.getElementById('sweepBar');
    const btnBar = document.getElementById('btn-sweep');
    const sel    = document.getElementById('sweepParam');
    if(bar)    bar.classList.add('on');
    if(btnBar) btnBar.classList.add('on');
    if(sel){
      S.sweep.param = lv.sweep.param;
      sel.value     = lv.sweep.param;
    }
    S.sweep.durMul = 4;
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        /* 关卡状态已是最新；若 phase 已被切走（用户秒关）则放弃播放 */
        const param = S.sweep.param;
        const isProxy = (param === 'settleDy' || param === 'supportRot0');
        if(isProxy){
          sweepSetValue(param, lv.sweep.range[0]);
          run();
        } else {
          const initEl = document.getElementById(param);
          if(initEl && lv.state && lv.state[param] != null){
            sweepSetValue(param, lv.state[param]);
            run();
          } else if(typeof sweepReset === 'function'){
            sweepReset();
          }
        }
        sweepPlay(true, lv.sweep.range);
      });
    });
  } else {
    const bar    = document.getElementById('sweepBar');
    const btnBar = document.getElementById('btn-sweep');
    if(bar)    bar.classList.remove('on');
    if(btnBar) btnBar.classList.remove('on');
  }
}

/* ---------- 关卡弹窗 UI ---------- */
(function bindLevels(){
  /* 动态注入弹窗 DOM（复用 .modal 体系，不动 index.html） */
  document.body.insertAdjacentHTML('beforeend', `
<div class="modal" id="modalLevels">
  <div class="modalCard" id="modalLevelsCard">
    <div class="modalHead">
      <h2>🎯 概念关卡</h2>
      <button class="modalClose" id="btnLevelsClose" title="关闭">×</button>
    </div>
    <div class="lvSub">
      关卡 = 教学路径：每关带<b>目标 · 讲解 · 验收点</b>，部分关卡可发起 <b>✏️ 先猜后算</b>（先画弯矩图形状，再与真实解对比评分）。<br>
      与左侧「自检」Tab 的区别：自检是面向开发者的回归验证场景，关卡是面向学习者的概念训练。
    </div>
    <div class="modalBody" id="levelsBody" style="flex:1 1 auto;overflow-y:auto;padding:14px 22px 22px;">
      <div id="levelsContainer"></div>
    </div>
  </div>
</div>`);

  const modal   = document.getElementById('modalLevels');
  const btnOpen = document.getElementById('btn-levels');
  const btnClose= document.getElementById('btnLevelsClose');
  const container = document.getElementById('levelsContainer');
  if(!modal || !container) return;

  /* 渲染分组卡片（模式参照 bindSelfTest） */
  let html = `
    <div style="position:sticky;top:-14px;z-index:10;background:#1e293b;padding-top:4px;padding-bottom:8px;border-bottom:1px solid rgba(148,163,184,0.08);">
      <input type="text" id="lvSearchInput" placeholder="🔍 搜索关卡标题 / 目标…" autocomplete="off"
        style="width:100%;box-sizing:border-box;padding:6px 10px;font-size:12px;font-family:inherit;background:rgba(15,23,42,0.6);border:1px solid transparent;color:#f8fafc;border-radius:6px;outline:none;">
    </div>`;

  const catKeys = Object.keys(LEVEL_CATEGORIES).sort((a,b)=> LEVEL_CATEGORIES[a].order - LEVEL_CATEGORIES[b].order);
  let cnt = 0;
  for(const catKey of catKeys){
    const cat = LEVEL_CATEGORIES[catKey];
    const list = LEVELS.filter(l => l.category === catKey);
    if(!list.length) continue;
    html += `<details class="stCatGroup" open><summary><span style="display:flex;align-items:center;gap:8px;">${cat.icon} ${cat.name}</span></summary><div class="stCatContent">`;
    for(const lv of list){
      cnt++;
      const lvColor = lv.difficulty === 'L2' ? '#fbbf24' : (lv.difficulty === 'L3' ? '#f87171' : '#38bdf8');
      const lvTitle = lv.difficulty === 'L1' ? 'L1 认识现象' : (lv.difficulty === 'L2' ? 'L2 理解规律' : 'L3 深究本质');
      html += `
        <div class="selfTestCard levelCard" data-level="${lv.id}">
          <div class="stcTitle" style="display:flex;justify-content:space-between;align-items:center;">
            <span class="stc-title-text">
              <span class="st-num">${cnt}</span>
              <span class="stc-title-main">${lv.title}</span>
            </span>
            <span title="${lvTitle}" style="font-size:9px;padding:1px 4px;border-radius:3px;background:rgba(255,255,255,0.05);color:${lvColor};border:1px solid ${lvColor}44;font-weight:600;cursor:help;">${lv.difficulty}</span>
          </div>
          <div class="stcDesc">${lv.goal}</div>
          <div class="lvBtns">
            <button type="button" class="lvBtnGo" data-go="${lv.id}">▶ 进入关卡</button>
            ${lv.predict ? `<button type="button" class="lvBtnPredict" data-predict="${lv.id}" title="先徒手画弯矩图形状，再揭晓真实解答并评分">✏️ 先猜后算</button>` : ''}
          </div>
        </div>`;
    }
    html += `</div></details>`;
  }
  container.innerHTML = html;

  /* 卡片交互 */
  container.querySelectorAll('.lvBtnGo').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      runLevel(btn.dataset.go);
    });
  });
  container.querySelectorAll('.lvBtnPredict').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      const id = btn.dataset.predict;
      runLevel(id, { skipSweep: true });
      if(typeof window.__predictEnter === 'function'){
        setTimeout(()=> window.__predictEnter({ levelId: id }), 350);
      } else {
        if(typeof showToast === 'function') showToast('先猜后算模块未加载。');
      }
    });
  });
  container.querySelectorAll('.levelCard').forEach(card=>{
    card.addEventListener('click', ()=> runLevel(card.dataset.level));
  });

  /* 搜索过滤 */
  const searchInput = document.getElementById('lvSearchInput');
  if(searchInput){
    searchInput.addEventListener('input', ()=>{
      const q = searchInput.value.trim().toLowerCase();
      container.querySelectorAll('.stCatGroup').forEach(group=>{
        let hasVisible = false;
        group.querySelectorAll('.levelCard').forEach(card=>{
          const hay = card.textContent.toLowerCase();
          const hit = !q || hay.includes(q);
          card.style.display = hit ? 'flex' : 'none';
          if(hit) hasVisible = true;
        });
        group.style.display = hasVisible ? '' : 'none';
        if(q && hasVisible) group.open = true;
      });
    });
  }

  /* 开关绑定（与 bindHelp 同模式） */
  const open  = ()=> modal.classList.add('open');
  const close = ()=> modal.classList.remove('open');
  if(btnOpen) btnOpen.addEventListener('click', open);
  if(btnClose) btnClose.addEventListener('click', close);
  modal.addEventListener('click', e=>{ if(e.target === modal) close(); });
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && modal.classList.contains('open')) close();
  });
})();
