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
const SELF_TEST_UI_CONFIG = {
  'moment-redist': { category: '📐 杆件与截面行为', level: 'L1', action: 'play', title: '梁端弯矩释放', desc: '两层两跨 · 满跨均布。扫掠梁端 β_j (1→0)，看梁端弯矩逐渐释放减小、跨中正弯矩随之增大。' },
  'colbase-hinge': { category: '🌪️ 抗侧力与二阶效应', level: 'L1', action: 'play', title: '柱脚弯矩释放', desc: '两层两跨 · 一层水平力。扫掠柱脚 β_f (1→0)，看柱脚弯矩逐渐释放减小、底层侧移随之增大。' },
  'strong-beam': { category: '📐 杆件与截面行为', level: 'L2', action: 'play', title: '梁刚度与反弯点', desc: '单层单跨 · 水平力。扫掠梁高 h_b (400→900)，看梁刚度变大如何使柱反弯点下移。' },
  'load-moment': { category: '📐 杆件与截面行为', level: 'L1', action: 'play', title: '跨中与支座弯矩', desc: '单层单跨 · 满跨均布。扫掠荷载 q_1 (0→100)，观察跨中正弯矩与支座负弯矩线性增长。' },
  'frame-action': { category: '🏢 整体受力与变形', level: 'L2', action: 'play', title: '框架作用传递', desc: '两层两跨 · 满跨均布。扫掠梁端 β_j (0→1)，看中柱轴力如何随梁约束的增强而增大。' },
  'cant-tension': { category: '🏢 整体受力与变形', level: 'L2', action: 'play', title: '悬挑偏心拉力', desc: '单层单跨+悬挑 · 无水平力。扫掠悬挑荷载 q_c1 (0→100)，看悬挑倾覆力矩导致的柱拉力。' },
  'weak-story': { category: '🏢 整体受力与变形', level: 'L1', action: 'play', title: '层刚度变化与变形集中', desc: '两层两跨 · 水平力。扫掠二层层高 h_2 (2.5→7)，层高增大使二层线刚度降低，看层间位移角（变形）如何向该层集中。' },
  'asym-sway': { category: '🏢 整体受力与变形', level: 'L2', action: 'play', title: '不对称侧移', desc: '单层两跨 · 竖向均布。扫掠左跨长 L_1 (3→12)，看单侧竖向荷载偏心引起的框架侧移。' },
  'cant-sway': { category: '🏢 整体受力与变形', level: 'L2', action: 'play', title: '悬挑重力侧移', desc: '两层两跨+悬挑 · 无水平力。扫掠悬挑荷载 q_c1 (0→100)，看纯重力偏心侧移（放大显示）。' },
  'dstiff-alloc': { category: '🌪️ 抗侧力与二阶效应', level: 'L2', action: 'play', title: '刚性楼板内柱分配', desc: '两层三跨 · 水平力，刚性楼板。扫掠内柱刚度比 r (0.25→4)，看内柱刚度变大时，如何通过楼板自动分走更多剪力。' },
  'dstiff-beam': { category: '🌪️ 抗侧力与二阶效应', level: 'L2', action: 'play', title: '刚性楼板梁约束影响', desc: '单层两跨 · 水平力，刚性楼板。扫掠梁端转动 β_j (0→1)，看梁的转动约束如何减小整体侧移，并使柱反弯点向跨中移动。' },
  'pdelta': { category: '🌪️ 抗侧力与二阶效应', level: 'L3', action: 'play', title: 'P-Δ 二阶效应', desc: '两层单跨 · 柔性框架（层高6m、梁铰接），开启P-Δ。扫掠均布 q_1 (0→100)，看竖向荷载如何使 B 值急剧放大并逼近失稳。' },
  'brace-stiffness': { category: '🧱 特殊构件与边界', level: 'L2', action: 'play', title: '支撑截面积与侧向刚度', desc: '单层单跨 · X 撑 · 水平力。扫掠支撑截面积 As (100→5000)，看支撑变粗后侧移显著减小、支撑轴力增大、柱端弯矩被分走。' },
  'brace-tension-only': { category: '🧱 特殊构件与边界', level: 'L2', action: 'play', title: '仅受拉支撑的单向工作', desc: '单层单跨 · X 撑（该格开启仅受拉）· 水平力。扫掠 H₁ (0→100)，N 图上始终只有受拉那根斜杆有数值，受压杆自动退出。' },
  'brace-angle': { category: '🧱 特殊构件与边界', level: 'L2', action: 'play', title: '支撑角度与轴力分配', desc: '单层单跨 · X 撑 · 水平力。扫掠左跨 L₁ (3→12)，倾角变小使斜杆轴力减小；在截面积不变的纯线弹性假定下，整体侧向刚度的理论极值在 θ ≈ 35.3°（L₁ ≈ 5.7m），而非直觉上的 45°。' },
  'settlement': { category: '🧱 特殊构件与边界', level: 'L1', action: 'play', title: '支座沉降的附加内力', desc: '两层两跨 · 无外荷载、无水平力。扫掠左柱沉降 (0→100mm)，看超静定结构在"什么都没加"的情况下，M 图从零逐渐出现、反力重新分配、结构整体倾斜。' },
  'cant-L2': { category: '📐 杆件与截面行为', level: 'L1', action: 'play', title: '悬挑长度平方效应', desc: '单层单跨+悬挑 · 均布荷载。扫掠悬挑长度 L_c (0.5→4)，看悬挑根部弯矩呈平方级增长（M ∝ L_c²），以及悬挑端挠度呈四次方级剧增（Δ ∝ L_c⁴）。' },
  'col-h3': { category: '📐 杆件与截面行为', level: 'L1', action: 'play', title: '柱截面三次方效应', desc: '单层单跨 · 水平力。扫掠柱高 h_c (300→800)，看侧移随 h_c 增大急剧减小（I_c ∝ h_c³），柱端弯矩被吸引增大。' },
  'anti-rho': { category: '🌪️ 抗侧力与二阶效应', level: 'L2', action: 'play', title: '反弯点 vs ρ 联动', desc: '两层两跨 · 纯水平力。扫掠梁高 h_b (400→900)，注意看「反弯点 x/h vs ρ」小图。梁高增加使梁线刚度上升，各柱反弯点逐渐向 x/h=0.5 靠拢。' },
  'brace-dir-L': { category: '🧱 特殊构件与边界', level: 'L2', action: 'play', title: '╱ 单撑仅受拉', desc: '单层单跨 · ╱ 单撑 · 仅受拉 · 水平力。扫掠 H₁ (0→100)，观察该方向斜撑是受拉（N 有数值）还是受压（自动退出、N=0）。' },
  'stiffness-jump-mid-braced': { category: '🏢 整体受力与变形', level: 'L2', action: 'play', title: '刚度突变 · 仅中间层设支撑', desc: '三层两跨 · 仅第2层两跨设 X 撑，上下层无撑。扫掠 H₁，看侧移沿高度呈"沙漏"分布：上下层柔、中间层刚，层间位移角在第1、3层放大。' },
  'weak-story-mid-unbraced': { category: '🏢 整体受力与变形', level: 'L2', action: 'play', title: '软弱层 · 仅中间层无支撑', desc: '三层两跨 · 第1、3层两跨设 X 撑，唯独第2层裸框架。扫掠 H₁，看层间位移角如何向第2层集中——这就是"软弱层"的力学本质，也是抗震设计中最危险的竖向刚度突变。' },
  'load-baseline': { category: '🔥 综合演练与概念', level: 'L1', action: 'freeze', title: '满跨布置基线', desc: '单层三跨 · 满跨均布。加载满跨工况并自动冻结为灰色基线，供后续「中跨加载 / 相邻两跨加载」对比；也可单独查看满跨时的弯矩包络。' },
  'load-mid-span': { category: '🔥 综合演练与概念', level: 'L2', action: 'compare', title: '中跨加载（不利布置）', desc: '单层三跨 · 仅中跨加载。自动冻结满跨基线后加载中跨工况，看中跨跨中正弯矩如何增大、边跨是否出现反号弯矩。' },
  'load-adj-span': { category: '🔥 综合演练与概念', level: 'L2', action: 'compare', title: '相邻两跨加载（不利布置）', desc: '单层三跨 · 左+中两跨加载。自动冻结满跨基线后加载相邻工况，看中间支座负弯矩如何达到最大（支座配筋控制工况）。' },
  'pdelta-h1': { category: '🌪️ 抗侧力与二阶效应', level: 'L3', action: 'play', title: 'P-Δ 层高敏感性', desc: '两层单跨 · 柔性框架 · 开启P-Δ。扫掠一层的 h₁ (2.5→7)，看层高增加时 N_cr 平方级下降，导致 B 值急剧放大并逼近失稳。' },
  'pdelta-vs-pdelta': { category: '🌪️ 抗侧力与二阶效应', level: 'L1', action: 'toast', title: 'P-δ 与 P-Δ 的区别', desc: '本工具只计算 P-Δ（结构侧移引起的二阶效应），不计算 P-δ（构件自身挠曲）。<br><br><svg viewBox="0 0 240 120" style="width:100%;height:auto;margin:6px 0;background:#0f172a;border-radius:4px;display:block;"><text x="60" y="12" fill="#94a3b8" font-size="9" text-anchor="middle">P-Δ</text><line x1="20" y1="100" x2="100" y2="100" stroke="#475569" stroke-width="2"/><line x1="20" y1="100" x2="20" y2="30" stroke="#475569" stroke-width="1.5" stroke-dasharray="2,2"/><line x1="100" y1="100" x2="100" y2="30" stroke="#475569" stroke-width="1.5" stroke-dasharray="2,2"/><line x1="20" y1="100" x2="35" y2="30" stroke="#38bdf8" stroke-width="2"/><line x1="100" y1="100" x2="115" y2="30" stroke="#38bdf8" stroke-width="2"/><line x1="35" y1="30" x2="115" y2="30" stroke="#38bdf8" stroke-width="2"/><text x="125" y="40" fill="#f87171" font-size="8">δ_top</text><text x="180" y="12" fill="#94a3b8" font-size="9" text-anchor="middle">P-δ</text><line x1="140" y1="100" x2="220" y2="100" stroke="#475569" stroke-width="2"/><line x1="140" y1="100" x2="140" y2="30" stroke="#475569" stroke-width="1.5" stroke-dasharray="2,2"/><line x1="220" y1="100" x2="220" y2="30" stroke="#475569" stroke-width="1.5" stroke-dasharray="2,2"/><path d="M 140 100 Q 155 65 140 30" stroke="#38bdf8" stroke-width="2" fill="none"/><path d="M 220 100 Q 235 65 220 30" stroke="#38bdf8" stroke-width="2" fill="none"/><line x1="140" y1="30" x2="220" y2="30" stroke="#38bdf8" stroke-width="2"/><text x="160" y="70" fill="#fbbf24" font-size="8">δ_local</text></svg>P-Δ：整体侧移，节点位移放大；P-δ：柱中部挠曲，构件局部放大。' },
  'p-moment': { category: '📐 杆件与截面行为', level: 'L1', action: 'play', title: '集中力弯矩尖角', desc: '单层单跨 · 跨中集中力。扫掠 P₁ (0→200)，观察集中力作用点处弯矩图的"尖角"，以及跨中正弯矩的线性增长。' },
  'temp-axial': { category: '🧱 特殊构件与边界', level: 'L1', action: 'play', title: '均匀升温的轴力', desc: '单层两跨 · 无外荷载。扫掠均匀升温 ΔT (0→50℃)，看超静定框架因膨胀受阻产生的内部轴力。' },
  'remove-beam-pierce': { category: '🌪️ 抗侧力与二阶效应', level: 'L2', action: 'play', title: '穿层柱模拟', desc: '两层两跨 · 水平力。移除第1、2层左跨梁，左侧边柱失去侧向约束（计算长度增加），变形图呈现明显的“穿孔”侧移。' },
  'temp-grad': { category: '🧱 特殊构件与边界', level: 'L1', action: 'play', title: '单侧温差的反弯点', desc: '单层两跨 · 无外荷载。扫掠截面温差 ΔT，看梁柱因温度梯度产生弯曲；本工具不做二阶内力放大，图中为一阶线弹性结果。' },
  'beam-inflection-vs-col': { category: '📐 杆件与截面行为', level: 'L2', action: 'play', title: '柱刚度对梁反弯点的影响', desc: '单层单跨 · 竖向均布荷载。扫掠边柱高 hc (300→800)。柱越细，对梁端约束越弱（趋近铰接），反弯点靠近支座；柱越粗，约束越强（趋近固接），反弯点向跨中移动。' },
  'inflection-point-theory': { category: '📐 杆件与截面行为', level: 'L3', action: 'play', title: '水平力下的反弯点偏移', desc: '单层单跨 · 纯水平力。扫掠梁高 hb (400→900)，观察柱反弯点 x/h 的演变。理论精确解为 y/h = (1+3k)/(1+6k)。梁越刚，反弯点向 0.5h 靠拢。' },
  'load-path-layers': { category: '🏢 整体受力与变形', level: 'L2', action: 'play', title: '竖向荷载的跨层传递与衰减', desc: '三层两跨 · 仅底层受载。扫掠一层荷载 q1，观察一层巨大的弯矩如何向上传递，并在三层急剧衰减。' },
  'lateral-path-layers': { category: '🌪️ 抗侧力与二阶效应', level: 'L2', action: 'play', title: '底层水平荷载的悬臂效应', desc: '三层两跨 · 仅底层受水平力。扫掠 H1 (0→50)，观察水平力如何像“推倒积木”一样向上传递。' },
  'gravity-lateral-superposition': { category: '🔥 综合演练与概念', level: 'L2', action: 'compare', title: '重力与侧向力叠加 (含 P-Δ)', desc: '两层单跨 · 重力工况打底 · 开启P-Δ。扫掠水平力 H1，看结构内力在纯重力基线上的线性叠加；B 值仅作二阶效应量级提示，内力/位移图仍为一阶线弹性结果。' },
  'support-uplift': { category: '🧱 特殊构件与边界', level: 'L1', action: 'play', title: '支座上移 (抗浮)', desc: '两层两跨 · 无外荷载。扫掠左柱竖向位移 (0→-100mm)，模拟地下水浮力导致的基础上抬。观察框架整体上拱以及梁柱内力的反向重分布。' },
  'support-rotation': { category: '🧱 特殊构件与边界', level: 'L1', action: 'play', title: '基础强迫扭转', desc: '两层两跨 · 无外荷载。扫掠柱底强迫转角（显示 0°→30°，实际 0→0.01 rad，视觉放大），模拟基础局部不均匀沉降产生的强制扭动。观察柱底巨大的抗弯弯矩以及框架被强行带偏的侧移。' },
  'system-stiffness-match': { category: '🔥 综合演练与概念', level: 'L3', action: 'play', title: '体系刚度匹配与演化', desc: '两层两跨 · 水平力。扫掠梁端刚度 β_j (0→1)，观察右侧「体系判定」从"铰接排架"逐渐变为"典型刚接框架"，理解林同炎对刚度匹配的定性判断。' },
  'overturning-pier': { category: '🏢 整体受力与变形', level: 'L2', action: 'play', title: '柱脚刚度与倾覆力矩', desc: '单层单跨 · 纯水平力。扫掠柱脚 β_f (0→1)，看倾覆力矩如何分配。刚接时柱脚弯矩吃掉大部分倾覆力矩，轴力小；铰接时柱脚弯矩为0，倾覆力矩100%转化为两侧柱子的拉压轴力。' },
  'axial-hinge': { category: '📐 杆件与截面行为', level: 'L3', action: 'toast', title: '形常数的陷阱（轴向变形）', desc: '单层单跨 · 强柱弱梁 · 竖向荷载。形常数推导反弯点为 0.33h，但这建立在无侧移假定上。本工况考虑梁的轴向变形，微小侧移导致反弯点偏移至 0.30h。切换“忽略轴向变形”验证 0.33h。' },
  'concept-human-vs-ai': { category: '🔥 综合演练与概念', level: 'L1', action: 'toast', title: '理念：工程师的最后主战场', desc: 'AI 时代，结构工程师的核心价值在于“判断对错与承担责任”。软件可以算得很快，但判断对错永远属于人。' },
  'concept-strong-col-weak-beam': { category: '🔥 综合演练与概念', level: 'L1', action: 'toast', title: '强柱弱梁 (Strong-Column/Weak-Beam)', desc: '抗震设计的核心概念。保证框架在地震下，塑性铰优先在梁端形成（耗能），而非柱端（引发楼层倒塌）。' },

  /* ==================== 新增：材质 / 型钢 / 支座 / 荷载 / 支撑 / 楼板 / 二阶 / 陷阱 ==================== */
  'mat-conc-vs-steel': { category: '📐 杆件与截面行为', level: 'L1', action: 'compare', title: '混凝土 vs 钢材：材料刚度', desc: '同一几何，只把 frameMat 从 C30 换到 Q355。看侧移缩小 6.87 倍——钢结构纤细的力学根源。' },
  'hw-strong-vs-weak': { category: '📐 杆件与截面行为', level: 'L1', action: 'compare', title: 'H 型钢柱强轴 vs 弱轴', desc: 'HW300x300 摆错 90°：Iy/Ix≈0.33，侧移翻三倍。施工图必须标注强轴方向的原因。' },
  'bc-linear-effect': { category: '📐 杆件与截面行为', level: 'L1', action: 'play', title: '柱宽 bc 的线性效应', desc: '单层单跨 · 水平力。扫掠 bc (300→800)，侧移线性下降。对照 col-h3：hc 是三次方。' },
  'bb-linear-effect': { category: '📐 杆件与截面行为', level: 'L1', action: 'play', title: '梁宽 bb 的线性效应', desc: '单层单跨 · 满跨均布。扫掠 bb (200→500)。对照 strong-beam：hb 是三次方。' },
  'support-type-mixed': { category: '🧱 特殊构件与边界', level: 'L1', action: 'toast', title: '支座类型：固 / 铰 / 滚轴', desc: '三根柱三种支座。滚轴柱不参与抗侧，水平力由固接柱和铰接柱分摊。' },
  'sls-deflection': { category: '📐 杆件与截面行为', level: 'L1', action: 'toast', title: '梁挠度超限与 SLS 报警', desc: '12m 跨、400 高小梁 · 60kN/m。受弯挠度超 1/200，状态栏 DEFORM·超限亮起，r-maxDy 标红。' },
  'hn-vs-rect': { category: '📐 杆件与截面行为', level: 'L2', action: 'compare', title: 'HN 型钢梁 vs 矩形混凝土梁', desc: '同高度 600mm：型钢与混凝土的 I 差 2~3 倍。选型不能按"同高度"估算。' },
  'pin-vs-fixed-base-sway': { category: '🧱 特殊构件与边界', level: 'L2', action: 'compare', title: '柱脚固接 vs 铰接：侧移对比', desc: '两层两跨 · 水平力。固接（灰虚线）vs 铰接（实线），侧移差 3~4 倍。' },
  'moving-load-influence': { category: '🔥 综合演练与概念', level: 'L2', action: 'toast', title: '移动荷载与影响线', desc: '单层三跨 · 80kN 移动集中力。手动点 ▶ 播放，用截面探针观察 M 值随位置变化——影响线本质。' },
  'partial-vs-full-load': { category: '🔥 综合演练与概念', level: 'L2', action: 'compare', title: '隔跨加载 vs 满跨加载', desc: '三层三跨。边跨加载（实线）时中间支座负弯矩增大——这是支座配筋的控制工况；满跨基线（灰虚线）用于对比。' },
  'cant-load-vs-span-load': { category: '🏢 整体受力与变形', level: 'L2', action: 'compare', title: '悬挑荷载 vs 跨内荷载', desc: '同样 30kN/m：跨内荷载由两柱共担；悬挑荷载全传给悬挑侧柱还带倾覆力矩。' },
  'temp-uniform-vs-grad': { category: '🧱 特殊构件与边界', level: 'L2', action: 'compare', title: '均匀温升 vs 温度梯度', desc: '均匀温升产生轴力，温度梯度产生弯曲。默认 N 图下均匀温升有值、梯度≈0；请手动切到 M 图看梯度弯曲。两种温度效应的力学机制不同。' },
  'brace-slim-buckling': { category: '🧱 特殊构件与边界', level: 'L2', action: 'play', title: '支撑长细比与受压屈曲报警', desc: '单层单跨 · X 撑（普通）。扫掠 braceI (10→100)，λ 变化。受压斜杆 |N|>N_cr 时 N 图标红 + ⚠。' },
  'brace-single-vs-X': { category: '🧱 特殊构件与边界', level: 'L2', action: 'compare', title: '单撑 vs X 撑', desc: '单撑在反向荷载下失效；X 撑双向对称，永远一根拉一根压。' },
  'rigid-floor-vs-none': { category: '🏢 整体受力与变形', level: 'L2', action: 'compare', title: '刚性楼板 vs 无楼板：剪力分配', desc: '三层三跨 · r=4 · 水平力。刚性楼板内柱按刚度分走大头；无楼板时水平力几乎全由左柱吃。' },

  'rho-vs-story-drift': { category: '🌪️ 抗侧力与二阶效应', level: 'L2', action: 'play', title: 'ρ 与层间位移角分布', desc: '三层三跨 · 刚性楼板。扫掠 r (0.25→4)，看层间位移角沿高度重新分布——软弱层形成的根源。' },
  'support-rotation-rigid': { category: '🧱 特殊构件与边界', level: 'L3', action: 'play', title: '强迫转角 × 刚性楼板', desc: '扫掠左柱强迫转角（显示 0°→30°，实际 0→0.01 rad，视觉放大），刚性楼板强制同层水平位移相等，把强迫转角引起的侧移耦合到整层，附加弯矩成倍增长。' },
  'temp-grad-direction': { category: '🧱 特殊构件与边界', level: 'L3', action: 'compare', title: '温度梯度方向：室外热 vs 室外冷', desc: '南方（夏季外热）与北方（冬季外冷）的温度效应反号，边柱弯曲方向反转。' },
  'rot-vs-settle': { category: '🧱 特殊构件与边界', level: 'L3', action: 'compare', title: '强迫转角 vs 强迫沉降', desc: '对比强迫转角与强迫沉降的柱底弯矩。谁更危险取决于 θ 与 Δ/h 的相对大小；本组输入下沉降弯矩反而更大，说明不能一概而论。' },
  'h-inverted-triangle': { category: '🌪️ 抗侧力与二阶效应', level: 'L3', action: 'compare', title: '倒三角 vs 均匀分布水平力', desc: '均匀分布 → 近似直线侧移；倒三角 → 曲线侧移。地震近倒三角、风荷载近均匀。' },
  'brace-tension-vs-buckling': { category: '🧱 特殊构件与边界', level: 'L3', action: 'compare', title: '仅受拉 vs 屈曲报警：两种失效', desc: '"仅受拉"是承载力设计（静默退出）；"屈曲校核"是稳定验算（杆件报警）。两个不同层面。' },
  'brace-pdelta-stiffness': { category: '🌪️ 抗侧力与二阶效应', level: 'L3', action: 'play', title: '支撑对 P-Δ 稳定安全度的贡献', desc: '两层单跨 · 细柱大竖向荷载。扫掠 As (100→5000)，B 值从危险区回落到 ~1.0x。' },
  'remove-beam-rigid-trap': { category: '🌪️ 抗侧力与二阶效应', level: 'L3', action: 'compare', title: '刚性楼板下抽梁的陷阱', desc: '同样的抽梁工况：无楼板穿层柱侧移巨大；刚性楼板"隔空传力"把侧移压得很小。但这是假的。' },
  'remove-beam-multi': { category: '🏢 整体受力与变形', level: 'L3', action: 'compare', title: '连续抽梁 vs 单跨抽梁', desc: '连续抽梁让中间柱顶部两侧同时失去约束，计算长度翻倍。"连续削弱"比"分散削弱"更危险。' },
  'pdelta-braced-vs-unbraced': { category: '🌪️ 抗侧力与二阶效应', level: 'L3', action: 'compare', title: '支撑对 P-Δ 的隐形贡献', desc: '无支撑 → B 值爆炸接近失稳；有 X 撑 → B≈1.05。支撑的"隐形价值"是提高 N_cr。' },
  'pdelta-cantilever': { category: '🌪️ 抗侧力与二阶效应', level: 'L3', action: 'play', title: '悬挑结构对 P-Δ 的放大', desc: '单层单跨 + 悬挑。扫掠 qc1 (0→100)，悬挑竖向力通过倾覆力矩产生侧移；已叠加 0.1 kN 微小水平力以便显示 B 值。大悬挑必须严格限制侧移。' },
  'temp-lateral-superposition': { category: '🔥 综合演练与概念', level: 'L3', action: 'play', title: '温度 + 水平力的线性叠加', desc: '灰虚线 = 纯温度弯矩。扫掠 H1，看实线如何在灰线上加出侧移弯矩——线弹性叠加原理的实证。' },
  'trap-rigid-floor-and-brace': { category: '🌪️ 抗侧力与二阶效应', level: 'L3', action: 'compare', title: '刚性楼板 + 支撑的"叠加假象"', desc: '刚性楼板下各柱位移平均，但支撑的轴力不会因此变小。默认显示变形图；请切到 N 图观察支撑轴力。"侧移小了"≠"支撑受力小了"。' },
  'trap-PDelta-and-rigid-floor': { category: '🌪️ 抗侧力与二阶效应', level: 'L3', action: 'compare', title: 'P-Δ + 刚性楼板：B 值被低估', desc: '刚性楼板强制 u_top 均匀，N_cr 反推偏大，B 值被低估。柔性楼盖的高层更危险。' },
  'mechanism-concept': { category: '🔥 综合演练与概念', level: 'L1', action: 'toast', title: '机构与几何可变体系', desc: '全铰接 + 无支撑 + 水平力 = 机构。刚度矩阵奇异，solve() 抛错。这不是 bug，是力学真理。' },
  'software-boundary': { category: '🔥 综合演练与概念', level: 'L3', action: 'toast', title: '工具的能力边界', desc: '能算：线弹性静力 / 二阶粗估 / 仅受拉非线性 / 强迫位移。不能算：动力、扭转、P-δ、节点域、屈曲后。' }
};

/* 自检卡片的 Tag 筛选字典（按工程痛点重构） */
const SELF_TEST_TAGS_MAP = {
  'moment-redist': ['内力/反弯点'],
  'colbase-hinge': ['内力/反弯点', '变形/侧移'],
  'strong-beam': ['内力/反弯点'],
  'load-moment': ['内力/反弯点'],
  'frame-action': ['内力/反弯点', '支撑系统'],
  'cant-tension': ['内力/反弯点'],
  'weak-story': ['变形/侧移'],
  'asym-sway': ['变形/侧移'],
  'cant-sway': ['变形/侧移'],
  'dstiff-alloc': ['变形/侧移'],
  'dstiff-beam': ['变形/侧移'],
  'pdelta': ['二阶效应'],
  'brace-stiffness': ['支撑系统', '变形/侧移'],
  'brace-tension-only': ['支撑系统'],
  'brace-angle': ['支撑系统'],
  'settlement': ['边界/非荷载'],
  'cant-L2': ['变形/侧移'],
  'col-h3': ['变形/侧移'],
  'anti-rho': ['内力/反弯点', '变形/侧移'],
  'brace-dir-L': ['支撑系统'],
  'stiffness-jump-mid-braced': ['支撑系统', '变形/侧移'],
  'weak-story-mid-unbraced': ['支撑系统', '变形/侧移'],
  'load-baseline': ['不利布置'],
  'load-mid-span': ['不利布置'],
  'load-adj-span': ['不利布置'],
  'pdelta-h1': ['二阶效应'],
  'pdelta-vs-pdelta': ['二阶效应'],
  'p-moment': ['内力/反弯点'],
  'temp-axial': ['边界/非荷载'],
  'remove-beam-pierce': ['变形/侧移'],
  'temp-grad': ['边界/非荷载', '内力/反弯点'],
  'beam-inflection-vs-col': ['内力/反弯点'],
  'inflection-point-theory': ['内力/反弯点'],
  'load-path-layers': ['内力/反弯点', '变形/侧移'],
  'lateral-path-layers': ['变形/侧移'],
  'gravity-lateral-superposition': ['二阶效应', '变形/侧移'],
  'support-uplift': ['边界/非荷载'],
  'support-rotation': ['边界/非荷载', '变形/侧移'],
  'system-stiffness-match': ['体系/概念', '变形/侧移'],
  'overturning-pier': ['内力/反弯点', '边界/非荷载'],
  'axial-hinge': ['内力/反弯点'],
  'concept-human-vs-ai': ['体系/概念'],
  'concept-strong-col-weak-beam': ['体系/概念', '内力/反弯点'],
  /* ==================== 新增标签 ==================== */
  'mat-conc-vs-steel': ['变形/侧移', '体系/概念'],
  'hw-strong-vs-weak': ['变形/侧移'],
  'bc-linear-effect': ['变形/侧移'],
  'bb-linear-effect': ['内力/反弯点'],
  'support-type-mixed': ['边界/非荷载', '变形/侧移'],
  'sls-deflection': ['变形/侧移'],
  'hn-vs-rect': ['内力/反弯点'],
  'pin-vs-fixed-base-sway': ['边界/非荷载', '变形/侧移'],
  'moving-load-influence': ['不利布置', '内力/反弯点'],
  'partial-vs-full-load': ['不利布置', '内力/反弯点'],
  'cant-load-vs-span-load': ['内力/反弯点', '变形/侧移'],
  'temp-uniform-vs-grad': ['边界/非荷载', '内力/反弯点'],
  'brace-slim-buckling': ['支撑系统'],
  'brace-single-vs-X': ['支撑系统'],
  'rigid-floor-vs-none': ['变形/侧移'],
  'rho-vs-story-drift': ['变形/侧移', '内力/反弯点'],
  'support-rotation-rigid': ['边界/非荷载', '变形/侧移'],
  'temp-grad-direction': ['边界/非荷载'],
  'rot-vs-settle': ['边界/非荷载'],
  'h-inverted-triangle': ['变形/侧移', '二阶效应'],
  'brace-tension-vs-buckling': ['支撑系统'],
  'brace-pdelta-stiffness': ['支撑系统', '二阶效应'],
  'remove-beam-rigid-trap': ['变形/侧移'],
  'pdelta-braced-vs-unbraced': ['二阶效应', '支撑系统'],
  'pdelta-cantilever': ['二阶效应', '变形/侧移'],
  'temp-lateral-superposition': ['边界/非荷载', '内力/反弯点'],
  'trap-rigid-floor-and-brace': ['变形/侧移', '支撑系统'],
  'trap-PDelta-and-rigid-floor': ['二阶效应', '变形/侧移'],
  'mechanism-concept': ['体系/概念'],
  'software-boundary': ['体系/概念']
};

const SELF_TEST_CASES = [
  {
    id: 'moment-redist',
    sweep: 'betaJ',
    sweepRange: [1, 0],
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 20, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 5, dScale: 30 }
  },
  {
    id: 'anti-rho',
    sweep: 'hb',
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 400, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 30, H2: 30, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'all', mScale: 1, dScale: 30 },
    toast: '纯水平力工况下，扫掠梁高 hb 时，请留意「反弯点 x/h vs ρ」小图。随着梁高增加（ρ 变大），梁对柱的转动约束增强，各柱反弯点会非常规整地向虚线 x/h=0.5 靠拢。'
  },
  {
    id: 'colbase-hinge',
    sweep: 'betaF',
    sweepRange: [1, 0],
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 30, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 10, dScale: 50 },
    toast: '两层两跨 · 一层水平力。扫掠柱脚 β_f (0→1)，看柱脚弯矩逐渐产生、底层侧移随之减小。**进阶**：对比「梁端 β_j」扫掠（moment-redist 卡）——柱脚刚度和梁端刚度在概念上等价，都是"转动约束"。'
  },
  {
    id: 'axial-hinge',
    sweep: null,
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 800, hc: 800, bb: 200, hb: 400, r: 1, q1: 100, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', axialMode: 'real', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 1, dScale: 30 },
    toast: '很多工程师认为竖向荷载下反弯点必然是 0.33h。但在本工况中，由于强柱弱梁（柱 800×800，梁 200×400），且考虑梁的轴向变形，竖向荷载引起了极微小的侧移，反弯点偏移到了约 0.30h。请点击左侧【模型】Tab，切换至【忽略（刚性）】轴向变形，看看反弯点是不是瞬间跳回了 0.33h？<br><br>**这就是为什么分层法要做"无侧移"假定**——形常数表的所有结论，都建立在"节点无相对侧移"这个前提上。'
  },
  {
    id: 'strong-beam',
    sweep: 'hb',
        state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 400, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 40, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 7, dScale: 30 }
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
    state: { nBay: 1, nLev: 1, hasCant: true, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 2.0, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 10, dScale: 50 }
  },
  {
    id: 'overturning-pier',
    sweep: 'betaF',
    sweepRange: [0, 1],
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 100, H2: 0, H3: 0, Hmode: 'none', betaF: 0, betaJ: 1, forceType: 'N', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 8, dScale: 50 },
    toast: '💡 力学秘籍：水平力 H×h 会产生倾覆力矩。整体平衡公式：M_倾覆 = M_柱脚 + N×L。\n当 βf=1.0（刚接）时，柱脚弯矩吃掉大部分弯矩，轴力仅为 27.6 kN；\n当 βf=0.0（铰接）时，柱脚弯矩为 0，倾覆力矩只能靠两侧柱子的拉压来抵抗，轴力瞬间飙升至 66.7 kN！'
  },
  {
    id: 'weak-story',
    sweep: 'h2',
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 2.5, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 30, H2: 30, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 30 },
    toast: '两层两跨 · 水平力。扫掠二层层高 h₂ (2.5→7)，层高增大使二层线刚度降低，看层间位移角如何向该层集中。**进阶**：把 h₂ 拖回 2.5，再去「模型」Tab 把一层层高 h₁ 也调成 2.5——薄弱层会"卡"在两层之间来回转移。'
  },
  {
    id: 'asym-sway',
    sweep: 'L1',
    state: { nBay: 2, nLev: 1, hasCant: false, L1: 3, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 50 }
  },
  {
    id: 'cant-sway',
    sweep: 'qc1',
    state: { nBay: 2, nLev: 2, hasCant: true, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 2.0, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 50 }
  },
  {
    id: 'dstiff-alloc',
    sweep: 'r',
    state: { nBay: 3, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 0.25, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 60, H2: 0, H3: 0, Hmode: 'rigid', betaF: 1, betaJ: 1, forceType: 'V', elFilter: 'col', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 10, dScale: 50 },
    toast: '两层三跨 · 刚性楼板 · 水平力。扫掠内柱刚度比 r (0.25→4)，看刚性楼板如何按柱刚度自动分配剪力：内柱 r 越大，分走的剪力越多。**进阶**：去「荷载」Tab 把「施加方式」切到「无楼板」，再重新扫一遍——你会发现分配机制完全变了：水平力几乎全由左柱吃。'
  },
  {
    id: 'dstiff-beam',
    sweep: 'betaJ',
    state: { nBay: 2, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'rigid', betaF: 1, betaJ: 0, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 10, dScale: 50 }
  },
  {
    id: 'pdelta',
    sweep: 'q1',
    state: { nBay: 1, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 6, h2: 6, h3: 4, Lc: 1.5, bc: 300, hc: 300, bb: 250, hb: 500, r: 1, q1: 0, q2: 20, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 3, H2: 3, H3: 0, Hmode: 'none', betaF: 1, betaJ: 0, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: true, displayMode: 'deform', mScale: 1, dScale: 5 }
  },
  {
    id: 'brace-stiffness',
    sweep: 'As',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 100, braceOnlyTension: false, braceMap: {'1-1':'X'}, braceTensionMap: {}, brushBrace: 'X', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 5, dScale: 50 }
  },
  {
    id: 'brace-tension-only',
    sweep: 'H1',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceOnlyTension: false, braceMap: {'1-1':'X'}, braceTensionMap: {'1-1':true}, brushBrace: 'X', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'brace', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 50 }
  },
  {
    id: 'brace-angle',
    sweep: 'L1',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 3, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceOnlyTension: false, braceMap: {'1-1':'X'}, braceTensionMap: {}, brushBrace: 'X', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'brace', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 8, dScale: 50 }
  },
  {
    id: 'settlement',
    sweep: 'settleDy',
    sweepRange: [0, 100],
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', supportMap: {'0': {dy: 0}}, frameMat: 'conc', braceMat: 'steel', As: 2000, braceOnlyTension: false, braceMap: {}, braceTensionMap: {}, brushBrace: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 0.6, dScale: 10 },
    toast: '两层两跨 · 无外荷载。扫掠左柱沉降 (0→100mm)，看超静定结构在"什么都没加"的情况下，M 图从零逐渐出现、反力重新分配、结构整体倾斜。'
  },
  {
    id: 'support-uplift',
    sweep: 'settleDy',
    sweepRange: [0, -100],
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', supportMap: {'0': {dy: 0}}, frameMat: 'conc', braceMat: 'steel', As: 2000, braceOnlyTension: false, braceMap: {}, braceTensionMap: {}, brushBrace: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 0.6, dScale: 10 },
    toast: '地下水位上升导致基础上浮。扫掠左柱竖向位移 (0→-100mm)，看框架被整体"顶"起后的上拱变形，以及梁柱内力从零出现的反向弯矩（模拟抗浮锚杆受力）。'
  },
  {
    id: 'support-rotation',
    sweep: 'supportRot0',
    sweepRange: [0, 30],
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', supportMap: {'0': {rot: 0}}, frameMat: 'conc', braceMat: 'steel', As: 2000, braceOnlyTension: false, braceMap: {}, braceTensionMap: {}, brushBrace: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 0.6, dScale: 10 },
    toast: '强迫左柱底发生旋转，模拟基础局部不均匀沉降或地基倾斜引起的强迫转角。扫掠显示角度 0°→30°（实际强迫转角 0→0.01 rad，视觉放大），看柱子被迫扭曲时产生的巨大附加弯矩和框架侧移。'
  },

  {
    id: 'system-stiffness-match',
    sweep: 'betaJ',
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'all', mScale: 5, dScale: 50 },
    toast: '扫掠梁端刚度 β_j（0→1）。注意看右侧读数面板的「体系判定」：从完全铰接的排架体系，逐渐增强为半刚接，最终变为典型刚接框架。同时观察结构侧移的减小。<br><br>**ρ 和 β_j 是两个独立的"刚度匹配旋钮"**：ρ 调"梁柱相对刚度"，β_j 调"节点转动约束"。林同炎的刚度匹配判断，要同时看这两个。'
  },
  /* ===== 新增卡（v0.1.6 功能扩充）===== */

  /* ⑰ 悬挑长度平方效应：与 ⑥ 的"线性荷载"对照，看 M ∝ L_c² */
  {
    id: 'cant-L2',
    sweep: 'Lc',
    state: { nBay: 1, nLev: 1, hasCant: true, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 0.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 30, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 1.0, dScale: 50 }
  },

  /* ⑱ 柱截面三次方效应：与 ③ 的"梁高"对照，看侧移 ∝ 1/h_c³ */
  {
    id: 'col-h3',
    sweep: 'hc',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 300, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 10, dScale: 50 }
  },

  /* ⑳ 三层薄弱层转移：⑦ 的纵向延伸，填补三层拓扑零覆盖 */


  /* ㉑a ╱ 单撑仅受拉：把"方向决定拉压"从 X 撑中剥离 */
  {
    id: 'brace-dir-L',
    sweep: 'H1',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceOnlyTension: false, braceMap: {'1-1':'/'}, braceTensionMap: {'1-1':true}, brushBrace: '/', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'brace', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 50 }
  },

  /* ===== 新增：三层刚度突变 / 软弱层 ===== */
  {
    id: 'stiffness-jump-mid-braced',
    sweep: 'H1',
    state: {
      nBay: 2, nLev: 3, hasCant: false,
      L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5,
      bc: 400, hc: 400, bb: 250, hb: 500, r: 1,
      q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0,
      H1: 0, H2: 30, H3: 30, Hmode: 'none',
      frameMat: 'conc', braceMat: 'steel', As: 2000,
      braceMap: { '2-1': 'X', '2-2': 'X' },
      braceTensionMap: {},
      brushBrace: 'X',
      betaF: 1, betaJ: 1,
      forceType: 'M', elFilter: 'all',
      showVals: false, showIds: false, showPDelta: false,
      displayMode: 'deform', mScale: 1, dScale: 50
    },
    toast: '仅第2层设支撑：上下层柔性、中间层刚性，侧移沿高度呈"沙漏"分布。扫掠 H₁ 看整体侧移；切到变形图观察层间位移角在第1、3层放大。'
  },
  {
    id: 'weak-story-mid-unbraced',
    sweep: 'H1',
    state: {
      nBay: 2, nLev: 3, hasCant: false,
      L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5,
      bc: 400, hc: 400, bb: 250, hb: 500, r: 1,
      q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0,
      H1: 0, H2: 30, H3: 30, Hmode: 'none',
      frameMat: 'conc', braceMat: 'steel', As: 2000,
      braceMap: { '1-1': 'X', '1-2': 'X', '3-1': 'X', '3-2': 'X' },
      braceTensionMap: {},
      brushBrace: 'X',
      betaF: 1, betaJ: 1,
      forceType: 'M', elFilter: 'all',
      showVals: false, showIds: false, showPDelta: false,
      displayMode: 'deform', mScale: 1, dScale: 50
    },
    toast: '仅第2层无支撑：上下层有撑、中间层裸框架。扫掠 H₁，看层间位移角如何向第2层集中——这就是"软弱层"的力学本质。'
  },

  /* “强柱弱梁”卡片已移除 */

  /* ㉔a 满跨布置基线（静态卡 + 自动冻结） */
  {
    id: 'load-baseline',
    sweep: null,
    freezeAfter: true,
    state: { nBay: 3, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, qSpanMap: {}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 2, dScale: 50 },
    toast: '已加载满跨布置并冻结为灰色虚线基线。可直接查看满跨弯矩，或点后续的「不利布置」卡片进行对比。'
  },

  /* ㉔b 中跨加载：prelude 自动加载满跨 + 冻结，再加载中跨工况 */
  {
    id: 'load-mid-span',
    sweep: null,
    prelude: { nBay: 3, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, qSpanMap: {}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, displayMode: 'force', mScale: 2, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 3, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, qSpanMap: {'1-1':0, '1-2':20, '1-3':0}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 2, dScale: 50 },
    toast: '灰色虚线 = 满跨基线；实线 = 仅中跨加载。注意中跨跨中正弯矩增大，边跨可能上拱（反号弯矩）。'
  },

  /* ㉔c 相邻两跨加载：与 ㉔b 同一 prelude，看支座负弯矩控制工况 */
  {
    id: 'load-adj-span',
    sweep: null,
    prelude: { nBay: 3, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, qSpanMap: {}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, displayMode: 'force', mScale: 2, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 3, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, qSpanMap: {'1-1':20, '1-2':20, '1-3':0}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 2, dScale: 50 },
    toast: '灰色虚线 = 满跨基线；实线 = 左+中两跨加载。注意中间支座负弯矩达到最大（支座配筋控制工况）。'
  },
  /* ===== 二阶段新增：P-Δ、集中力、温度 ===== */
  {
    id: 'pdelta-h1',
    sweep: 'h1',
    state: { nBay: 1, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 2.5, h2: 6, h3: 4, Lc: 1.5, bc: 300, hc: 300, bb: 250, hb: 500, r: 1, q1: 0, q2: 20, q3: 0, qc1: 0, qc2: 0, qc3: 0, P1:0, P2:0, P3:0, pLoadMap:{}, H1: 3, H2: 3, H3: 0, Hmode: 'none', betaF: 1, betaJ: 0, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: true, displayMode: 'deform', mScale: 1, dScale: 5 }
  },
  /* ㉕ P-δ vs P-Δ 概念卡（静态，无数值） */
  {
    id: 'pdelta-vs-pdelta',
    pureConcept: true,
    sweep: null,
    state: {},
    toast: '本工具只计算 P-Δ（结构侧移引起），不计算 P-δ（构件自身挠曲）。P-δ 在高轴压比细长柱中才显著；若需精确二阶分析，应使用带几何刚度的专用软件。'
  },
  {
    id: 'p-moment',
    sweep: 'P1',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, P1: 0, P2: 0, P3: 0, pLoadMap: {}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 2, dScale: 50 }
  },
  {
    id: 'temp-axial',
    sweep: 'tempAll',
    sweepRange: [0, 50], // 指定扫掠区间
    state: { nBay: 2, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, P1:0, P2:0, P3:0, pLoadMap:{}, H1: 0, H2: 0, H3: 0, Hmode: 'none', tempAll: 0, tempGrad: 0, betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 5, dScale: 50 }
  },
  {
    id: 'remove-beam-pierce',
    sweep: 'H2',
    state: { 
      nBay: 2, nLev: 2, hasCant: false, 
      L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, 
      bc: 400, hc: 400, bb: 250, hb: 500, r: 1, 
      q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, 
      P1:0, P2:0, P3:0, pLoadMap:{}, 
      H1: 0, H2: 100, H3: 0, 
      Hmode: 'none', tempAll: 0, tempGrad: 0, 
      betaF: 1, betaJ: 1, 
      forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: true, 
      displayMode: 'deform', mScale: 1, dScale: 20, 
      removeBeamMap: {'1-1': true, '2-1': true} 
    },
    toast: '注意看：左跨1、2层的梁被抽空，左侧边柱变成了无侧向约束的穿层柱。在无楼板假设下，顶部水平力完全由这根柔弱的单柱承担，产生了极大的侧向变形。'
  },
  {
    id: 'temp-grad',
    sweep: 'tempGrad',
    sweepRange: [0, 30], // 指定扫掠区间
    state: { nBay: 2, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, P1:0, P2:0, P3:0, pLoadMap:{}, H1: 0, H2: 0, H3: 0, Hmode: 'none', tempAll: 0, tempGrad: 0, betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false,     displayMode: 'all', mScale: 5, dScale: 50 }
  },
  {
    id: 'beam-inflection-vs-col',
    sweep: 'hc',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 300, hc: 300, bb: 250, hb: 600, r: 1, q1: 30, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, showAntiPts: true, displayMode: 'force', mScale: 2, dScale: 30 },
    toast: '注意看梁上的反弯点位置（带 x/L 标注）。随着柱高 hc 激增，柱的抗弯刚度呈三次方放大，对梁端的转动约束从弱变强。梁反弯点会从靠近支座处（约 0.13L）明显向跨中极限位置（0.21L）移动！'
  },
  {
    id: 'inflection-point-theory',
    sweep: 'hb',
    sweepRange: [400, 900],
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 400, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, showAntiPts: true, displayMode: 'force', mScale: 8, dScale: 50 },
    toast: '💡 理论秘籍：很多手算教材认为水平力下柱反弯点在 0.5h，但这建立在“梁刚度无限大（无转角）”的假定上。精确公式：y/h = (1+3k)/(1+6k)（k为梁柱线刚度比ρ）。请盯住柱上的 x/h 标注：随着梁高 hb 扫掠至 1000，k 激增，反弯点会肉眼可见地从 0.6h 以上回落到 0.51h 左右，逐渐逼近理论假定！'
  },
  {
    id: 'load-path-layers',
    sweep: 'q1',
    state: { nBay: 2, nLev: 3, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, displayMode: 'force', mScale: 2, dScale: 30 },
    toast: '💡 注意看：一层梁柱弯矩巨大，二层由于节点刚接被“牵连”产生反向弯矩，到了三层，弯矩已经微乎其微！这正是结构手算中“分层法”能成立的力学本质：局部竖向荷载的影响随层数迅速衰减。你可以拖动右侧的【缩放】滑块，放大看看顶层的微小变形。'
  },
  {
    id: 'lateral-path-layers',
    sweep: 'H1',
    sweepRange: [0, 50],
    state: { nBay: 2, nLev: 3, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, displayMode: 'force', mScale: 8, dScale: 50 },
    toast: '💡 底层受到水平力，整栋楼就像一根悬臂杆。注意看 M 图：底层的柱弯矩最大；而顶层的梁柱虽然没直接受外力，但为了“拉住”下面的楼层，依然产生了明显的反弯和弯矩。这就是框架的抗侧整体性，每一层都在出力！'
  },
  {
    id: 'gravity-lateral-superposition',
    sweep: 'H1',
    sweepRange: [0, 50],
    prelude: { nBay: 1, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 20, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showPDelta: true, displayMode: 'all', mScale: 2, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 1, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 20, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showPDelta: true, displayMode: 'all', mScale: 2, dScale: 50 },
    toast: '已加载重力荷载并冻结基线（灰线）。现在扫掠 H1，看附加的水平力如何让结构发生侧移。P-Δ 的 B 值仅作二阶效应量级提示；本工具不把 B 乘回内力/位移，图上仍是一阶线弹性结果。'
  },
  /* ===== 新增纯概念卡（不触发计算，仅做理念宣贯）===== */
  {
    id: 'concept-human-vs-ai',
    pureConcept: true,
    sweep: null,
    state: {},
    toast: '随着 AI 技术的狂飙突进，AI 快速完成建模、出图已是可望且可即的现实。在这个时代，结构工程师的核心价值究竟何在？\n\n答案在于：精准判断 AI 生成的结构方案，引导 AI 进行迭代优化，并为最终的结构安全兜底负责。这将成为结构工程师不可替代的最后主战场。\n\n软件可以算得很快，但判断对错与承担责任，永远属于人。'
  },
  {
    id: 'concept-strong-col-weak-beam',
    pureConcept: true,
    sweep: null,
    state: {},
    toast: '强柱弱梁（Strong Column, Weak Beam）是抗震设计的核心概念。\n\n它要求框架在水平地震作用下，塑性铰优先在梁端形成（耗能），而不是在柱端形成（引发楼层倒塌）。\n\n在本工具中，你可以扫掠「内柱刚度比 r」或观察ρ值（梁柱线刚度比）。若 ρ 过大（强梁弱柱），在水平力下柱端弯矩极大，极易成为薄弱环节。'
  },

  /* ==================== 新增 v0.1.9.3：扩充自检卡 ==================== */

  /* ========== L1 卡（6 张） ========== */
  {
    id: 'mat-conc-vs-steel',
    sweep: null,
    prelude: { nBay: 1, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 30, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 200 },
    preludeFreeze: true,
    state: { nBay: 1, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 30, H3: 0, Hmode: 'none', frameMat: 'steel', braceMat: 'steel', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 200 },
    toast: '截面尺寸一模一样，只把材料从 C30 换成 Q355，侧移直接缩小近 7 倍（E_steel / E_conc = 2.06e8 / 3.0e7 ≈ 6.87）。这就是为什么钢结构可以做得很纤细，而混凝土必须靠截面堆刚度。'
  },
  {
    id: 'hw-strong-vs-weak',
    sweep: null,
    prelude: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, colSecType: 'HW', colHW: 'HW300x300', colAxis: 'strong', bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 30, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 10 },
    preludeFreeze: true,
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, colSecType: 'HW', colHW: 'HW300x300', colAxis: 'weak', bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 30, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 10 },
    toast: 'HW300x300 的 Iy/Ix ≈ 6760/20500 ≈ 0.33。同一根工字柱摆错 90°，平面内刚度掉到 1/3，侧移翻三倍。这就是施工图必须标注"强轴方向"的原因。'
  },
  {
    id: 'bc-linear-effect',
    sweep: 'bc',
    sweepRange: [300, 800],
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 300, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 5, dScale: 50 },
    toast: 'bc 对侧移是线性的（I ∝ bc）。对照 col-h3 卡：hc 是三次方。**加高比加宽划算得多**——这就是柱截面设计的铁律，也是"为什么柱子总是窄而高"的量化回答。'
  },
  {
    id: 'bb-linear-effect',
    sweep: 'bb',
    sweepRange: [200, 500],
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 200, hb: 600, r: 1, q1: 30, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 50 },
    toast: 'bb 对梁刚度是线性的，hb 是三次方。梁设计要"加高不加宽"——这就是为什么梁的截面总是窄而高，也是"为什么梁高不能随便砍"的量化依据。'
  },
  {
    id: 'support-type-mixed',
    sweep: null,
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 30, H2: 30, H3: 0, Hmode: 'none', supportMap: { '0': { type: 'fixed' }, '1': { type: 'pin' }, '2': { type: 'roller' } }, betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 5, dScale: 50 },
    toast: '三根柱三种支座：左柱固接（有柱脚弯矩）、中柱铰接（柱脚 M=0）、右柱滚轴（不约束水平，不参与抗侧）。观察 M 图和 R 图——水平力全被固接柱和铰接柱吃掉。去「荷载」Tab 逐柱切换支座类型，看内力怎么重新分配。'
  },
  {
    id: 'sls-deflection',
    sweep: null,
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 12, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 400, r: 1, q1: 60, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 15 },
    toast: '12m 跨、400 高的小梁，受弯挠度已超 1/200。看底部状态栏 DEFORM·超限、右面板 r-maxDy 标红。去「模型」Tab 把梁高调到 900，看警告什么时候消失——v ∝ 1/h³，梁高翻倍挠度掉到 1/8。'
  },

  /* ========== L2 卡（11 张） ========== */
  {
    id: 'hn-vs-rect',
    sweep: null,
    prelude: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, beamSecType: 'rect', bb: 250, hb: 600, bc: 400, hc: 400, r: 1, q1: 30, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, beamSecType: 'HN', beamHN: 'HN600x200', bb: 250, hb: 600, bc: 400, hc: 400, r: 1, q1: 30, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 50 },
    toast: '同高度 600mm：HN600x200 与 250×600 矩形梁的 I 相差 2~3 倍。型钢梁自重轻，但刚度不能按"同高度"估算——腹板厚度、翼缘面积才是关键。这就是为什么型钢梁选型不能只看"高"，要查表。'
  },
  {
    id: 'pin-vs-fixed-base-sway',
    sweep: null,
    prelude: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 60, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 60, H2: 0, H3: 0, Hmode: 'none', betaF: 0, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 50 },
    toast: '柱脚从固接（灰虚线）变铰接（实线），侧移放大 3~4 倍，柱脚弯矩归零。柱脚刚度的选择在"弯矩小"和"侧移小"之间权衡——不是越刚越好。'
  },
  {
    id: 'moving-load-influence',
    sweep: null,
    state: { nBay: 3, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, P1: 0, P2: 0, P3: 0, movingLoad: { enabled: true, lev: 1, bay: 2, P: 80, t: 0.5, speed: 1 }, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 50 },
    toast: '点「荷载」Tab 里的 ▶ 播放，让 80kN 集中力在中间跨来回移动。然后在内力图上点任意截面（截面探针），盯住 M 值——它随荷载位置变化，这就是**影响线**的本质。活荷载不利布置的力学依据。'
  },
  {
    id: 'partial-vs-full-load',
    sweep: null,
    prelude: { nBay: 3, nLev: 3, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 20, q3: 20, qc1: 0, qc2: 0, qc3: 0, qSpanMap: {}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 2, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 3, nLev: 3, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, qSpanMap: { '1-1': 20, '1-3': 20, '2-1': 20, '2-3': 20, '3-1': 20, '3-3': 20 }, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 2, dScale: 50 },
    toast: '满跨加载（灰虚线）vs 边跨加载（实线）。注意：边跨加载时，中间支座负弯矩比满跨时更大——这是支座配筋的控制工况。不利布置要针对“你要控制的内力”来选，不是固定一种工况。'
  },
  {
    id: 'cant-load-vs-span-load',
    sweep: null,
    prelude: { nBay: 1, nLev: 1, hasCant: true, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 2.0, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 30, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 5, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 1, nLev: 1, hasCant: true, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 2.0, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 30, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 5, dScale: 50 },
    toast: '同样 30kN/m：跨内荷载（灰虚线）由两根柱共同承担；悬挑荷载（实线）全部传给悬挑侧柱，还带倾覆力矩。悬挑的"偏心"效应比跨内荷载危险得多。'
  },
  {
    id: 'temp-uniform-vs-grad',
    sweep: null,
    prelude: { nBay: 2, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', tempAll: 30, tempGrad: 0, betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 5, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 2, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', tempAll: 0, tempGrad: 30, betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 5, dScale: 50 },
    toast: '均匀温升（灰虚线）产生轴力（N 图有值，M 图≈0）；温度梯度（实线）产生弯曲（M 图有值，N 图≈0）。**两种温度效应的力学机制完全不同**——这是温度验算必须分开做的原因。'
  },
  {
    id: 'brace-slim-buckling',
    sweep: 'braceI',
    sweepRange: [10, 100],
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 80, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceI: 10, braceMap: { '1-1': 'X' }, braceTensionMap: {}, brushBrace: 'X', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'brace', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 5, dScale: 50 },
    toast: '扫掠支撑回转半径 i (10→100)，λ=L/i 变化。受压斜杆的 |N| 一旦超过 N_cr = π²EA/λ²，N 图该杆标红 + ⚠，右面板"受压支撑校核"亮红，状态栏 BRACE 从 OK 变 CHECK。这就是规范限制支撑长细比的力学依据。'
  },
  {
    id: 'brace-single-vs-X',
    sweep: null,
    prelude: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceMap: { '1-1': '/' }, braceTensionMap: {}, brushBrace: '/', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'brace', showVals: true, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 3, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceMap: { '1-1': 'X' }, braceTensionMap: {}, brushBrace: 'X', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'brace', showVals: true, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 3, dScale: 50 },
    toast: '单撑（灰虚线）在 +H 下受拉，但反向荷载下会受压屈曲退出；X 撑（实线）两根，永远一根拉一根压，双向对称。这就是 X 撑胜过单撑的核心原因。'
  },
  {
    id: 'rigid-floor-vs-none',
    sweep: null,
    prelude: { nBay: 3, nLev: 3, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 4, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 60, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'V', elFilter: 'col', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 3, nLev: 3, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 4, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 60, H2: 0, H3: 0, Hmode: 'rigid', betaF: 1, betaJ: 1, forceType: 'V', elFilter: 'col', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 50 },
    toast: '同一结构、同一力，只切换楼板假设：无楼板（灰虚线）剪力几乎全由左柱吃；刚性楼板（实线）按柱刚度分配，内柱 r=4 分走大头。右面板 r-alloc1 的百分比对比一目了然。'
  },

  {
    id: 'rho-vs-story-drift',
    sweep: 'r',
    sweepRange: [0.25, 4],
    state: { nBay: 3, nLev: 3, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 0.25, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 60, H2: 0, H3: 0, Hmode: 'rigid', betaF: 1, betaJ: 1, forceType: 'V', elFilter: 'col', showVals: true, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 50 },
    toast: 'r 增大时，内柱分走更多剪力，但层间位移角沿高度重新分布：某层可能变大、某层可能变小。**ρ 不只影响总侧移，更影响侧移沿高度的分布**——这就是软弱层形成的根源。盯住右面板的"层间位移角"逐层列表。'
  },

  /* ========== L3 卡（13 张） ========== */
  {
    id: 'support-rotation-rigid',
    sweep: 'supportRot0',
    sweepRange: [0, 30],
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'rigid', supportMap: { '0': { rot: 0 } }, betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 2, dScale: 30 },
    toast: '一根柱基础强迫转动，刚性楼板强制同层水平位移相等，其余柱被"带着走"。对比 support-rotation 卡（无楼板）——**同样的强迫转角，刚性楼板让附加弯矩成倍增长**。这就是为什么基础不均匀沉降在现浇楼盖里是"系统灾害"。'
  },
  {
    id: 'temp-grad-direction',
    sweep: null,
    prelude: { nBay: 2, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', tempAll: 0, tempGrad: 30, betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 5, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 2, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', tempAll: 0, tempGrad: -30, betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 5, dScale: 50 },
    toast: '室外热（灰虚线）vs 室外冷（实线）：边柱弯曲方向反转，反弯点位置变化。**南方（夏季外热）与北方（冬季外冷）的温度效应反号**——这是温度设计必须分地区的原因。'
  },
  {
    id: 'rot-vs-settle',
    sweep: null,
    prelude: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', supportMap: { '0': { rot: 0.005 } }, betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 2, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', supportMap: { '0': { dy: 50 } }, betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 2, dScale: 50 },
    toast: '强迫转角（灰虚线）vs 强迫沉降（实线）。本组输入下（θ=0.005 rad、Δ=50mm），按单柱公式 M_rot=4EIθ/h≈0.005EI、M_settle=6EIΔ/h²≈0.019EI，沉降弯矩反而更大。**基础倾斜与沉降谁更危险，取决于 θ 与 Δ/h 的相对大小**；工程上规范对倾斜更敏感，是因为微小倾斜即可产生可观转角，而不是因为单位转角的弯矩一定更大。'
  },
  {
    id: 'h-inverted-triangle',
    sweep: null,
    prelude: { nBay: 2, nLev: 3, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 20, H2: 20, H3: 20, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 2, nLev: 3, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 10, H2: 20, H3: 30, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 50 },
    toast: '均匀分布（灰虚线）→ 近似直线侧移；倒三角分布（实线）→ 曲线侧移，顶部变形更大。**地震作用近似倒三角、风荷载近均匀**——分布假设影响分析结果。'
  },
  {
    id: 'brace-tension-vs-buckling',
    sweep: null,
    prelude: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 80, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceI: 30, braceMap: { '1-1': 'X' }, braceTensionMap: { '1-1': true }, brushBrace: 'X', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'brace', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 80, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceI: 10, braceMap: { '1-1': 'X' }, braceTensionMap: {}, brushBrace: 'X', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'brace', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 50 },
    toast: '左侧（灰虚线）是"仅受拉"——受压杆静默退出；右侧（实线）是"普通细支撑"——受压杆还在但屈曲报警。**"仅受拉"是承载力设计，"屈曲校核"是稳定验算**——两个不同层面的失效，不能混为一谈。'
  },
  {
    id: 'brace-pdelta-stiffness',
    sweep: 'As',
    sweepRange: [100, 5000],
    state: { nBay: 1, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 6, h2: 6, h3: 4, Lc: 1.5, bc: 300, hc: 300, bb: 250, hb: 500, r: 1, q1: 40, q2: 40, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 5, H2: 5, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 100, braceI: 30, braceMap: { '1-1': 'X', '2-1': 'X' }, braceTensionMap: {}, brushBrace: 'X', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: true, displayMode: 'deform', mScale: 1, dScale: 50 },
    toast: '竖向荷载不变，只把支撑从 100mm² 加到 5000mm²：B 值从危险区一路回落到接近 1.0x。**支撑不只是"抗侧"，它把结构的"稳定安全度"整个抬上去**——高轴压比的大跨/高层里这是救命的设计逻辑。盯住右面板 P-Δ 那一行。'
  },
  {
    id: 'remove-beam-rigid-trap',
    sweep: null,
    prelude: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 100, H3: 0, Hmode: 'none', removeBeamMap: { '1-1': true, '2-1': true }, betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 100, H3: 0, Hmode: 'rigid', removeBeamMap: { '1-1': true, '2-1': true }, betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 50 },
    toast: '同样的抽梁工况：无楼板（灰虚线）→ 穿层柱侧移巨大；刚性楼板（实线）→ 侧移被压得很小。**但这是假的**——楼板能传力，但穿层柱的计算长度、稳定、二阶效应一样没变。真实工程必须做楼板真实刚度分析。'
  },

  {
    id: 'pdelta-braced-vs-unbraced',
    sweep: null,
    prelude: { nBay: 1, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 6, h2: 6, h3: 4, Lc: 1.5, bc: 300, hc: 300, bb: 250, hb: 500, r: 1, q1: 50, q2: 50, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 5, H2: 5, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', braceMap: {}, braceTensionMap: {}, betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: true, displayMode: 'deform', mScale: 1, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 1, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 6, h2: 6, h3: 4, Lc: 1.5, bc: 300, hc: 300, bb: 250, hb: 500, r: 1, q1: 50, q2: 50, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 5, H2: 5, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceMap: { '1-1': 'X', '2-1': 'X' }, braceTensionMap: {}, brushBrace: 'X', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: true, displayMode: 'deform', mScale: 1, dScale: 50 },
    toast: '无支撑（灰虚线）→ B 值爆炸接近失稳；有 X 撑（实线）→ B≈1.05。**支撑的"隐形价值"是提高 N_cr**——不是抗侧那么简单。'
  },
  {
    id: 'pdelta-cantilever',
    sweep: 'qc1',
    sweepRange: [0, 100],
    state: { nBay: 1, nLev: 1, hasCant: true, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 3.0, bc: 300, hc: 300, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0.5, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: true, displayMode: 'deform', mScale: 1, dScale: 50 },
    toast: '悬挑端的竖向力通过倾覆力矩使框架侧移，P-Δ 放大侧移 → 更大倾覆 → 更大 P-Δ（正反馈）。**大悬挑必须严格限制侧移**——这是"自我放大"机制，与轴压杆的"二阶效应放大"是同一个数学结构。'
  },
  {
    id: 'temp-lateral-superposition',
    sweep: 'H1',
    sweepRange: [0, 50],
    prelude: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', tempAll: 0, tempGrad: 20, betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 5, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', tempAll: 0, tempGrad: 20, betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 5, dScale: 50 },
    toast: '灰虚线 = 纯温度工况的弯矩（H1=0）。扫掠 H1，看实线如何在灰线上"加"出一个越来越大的侧移弯矩——**每一根杆件的 M(x) 严格等于温度解 + 水平力解**。这就是为什么线弹性工具敢说"结果可叠加"。'
  },
  {
    id: 'trap-rigid-floor-and-brace',
    sweep: null,
    prelude: { nBay: 3, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 60, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceMap: { '1-1': 'X', '1-2': 'X', '2-1': 'X', '2-2': 'X' }, braceTensionMap: {}, brushBrace: 'X', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 3, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 60, H2: 0, H3: 0, Hmode: 'rigid', frameMat: 'conc', braceMat: 'steel', As: 2000, braceMap: { '1-1': 'X', '1-2': 'X', '2-1': 'X', '2-2': 'X' }, braceTensionMap: {}, brushBrace: 'X', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 50 },
    toast: '同样有支撑、同样 H1：无楼板（灰虚线）→ 各柱水平位移不同，支撑分工不均；刚性楼板（实线）→ 位移被强制平均，但**支撑的轴力不会因此变小**。"侧移小了"≠"支撑受力小了"——验算支撑时必须用真实支撑轴力，不能因为侧移小就放松。'
  },
  {
    id: 'trap-PDelta-and-rigid-floor',
    sweep: null,
    prelude: { nBay: 3, nLev: 3, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 30, q2: 30, q3: 30, qc1: 0, qc2: 0, qc3: 0, H1: 30, H2: 30, H3: 30, Hmode: 'none', betaF: 1, betaJ: 0.3, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: true, displayMode: 'deform', mScale: 1, dScale: 30 },
    preludeFreeze: true,
    state: { nBay: 3, nLev: 3, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 30, q2: 30, q3: 30, qc1: 0, qc2: 0, qc3: 0, H1: 30, H2: 30, H3: 30, Hmode: 'rigid', betaF: 1, betaJ: 0.3, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: true, displayMode: 'deform', mScale: 1, dScale: 30 },
    toast: '刚性楼板强制 u_top 均匀 → N_cr 反推偏大 → B 值被低估。**"刚性楼板假设"会掩盖 P-Δ 危险性**——柔性楼盖的高层比刚性楼盖更危险。对比右面板 B 值：无楼板 vs 刚性楼板。'
  },

  /* ========== 纯概念卡（2 张） ========== */
  {
    id: 'mechanism-concept',
    pureConcept: true,
    sweep: null,
    state: {},
    toast: '全铰接框架 + 无支撑 + 水平力 = 机构（几何可变体系）。此时刚度矩阵奇异，solve() 会抛错。**这不是 bug，是力学真理**：没有弯曲刚度、没有支撑、没有固接柱脚，框架就没有任何抵抗侧移的路径。<br><br>这解释了为什么：<br>① 排架必须设支撑或依靠柱脚固接；<br>② 装配式框架的节点刚度不能随便打折；<br>③ 抗震规范要求框架必须有"多道防线"。<br><br>**软件可以算得很快，但"结构是不是机构"这种判断，永远属于人。**'
  },
  {
    id: 'software-boundary',
    pureConcept: true,
    sweep: null,
    state: {},
    toast: '本工具的**能力边界**：<br>✅ 能算：线弹性静力、二阶效应粗估、仅受拉支撑非线性、支座沉降/强迫转角、温度效应<br>❌ 不能算：动力反应谱/时程、扭转、P-δ（构件自身屈曲）、节点域剪切、材料非线性、屈曲后承载力、拱效应、变截面<br><br>**软件可以算得很快，但"什么是它能算的、什么是它算不准的"，判断永远属于人。**'
  }
];

/* 轻量提示 toast：用于静态自检卡（sweep:null）向用户解释观察要点。
   复用单个 DOM，避免多次创建。 */
function showToast(msg, duration, persistent){
  let t = document.getElementById('stToast');
  if(!t){
    t = document.createElement('div');
    t.id = 'stToast';
    t.className = 'stToast';
    document.body.appendChild(t);
    /* 点击 toast 本体可关闭（仅持久化模式下真正生效） */
    t.addEventListener('click', ()=> t.classList.remove('on'));
  }

  // 初始化内部结构：内容容器 + 右上角关闭按钮
  if (!t.querySelector('.stToastContent')) {
    t.innerHTML = ''; 
    const content = document.createElement('div');
    content.className = 'stToastContent';
    t.appendChild(content);
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'stToastClose';
    closeBtn.innerHTML = '×';
    closeBtn.title = '关闭';
    // 使用 pointer-events: auto 确保即使外层是 pointer-events: none 也能点击关闭
    closeBtn.style.cssText = 'pointer-events: auto; position:absolute; top:6px; right:8px; background:none; border:none; color:#64748b; font-size:18px; cursor:pointer; padding:0; line-height:1; outline:none; z-index:10; transition:color 0.2s;';
    closeBtn.addEventListener('mouseenter', () => closeBtn.style.color = '#f8fafc');
    closeBtn.addEventListener('mouseleave', () => closeBtn.style.color = '#64748b');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止冒泡
      t.classList.remove('on');
    });
    t.appendChild(closeBtn);
  }

  const cw = t.querySelector('.stToastContent');
  /* 含 < 或 > 时按 HTML 渲染（支持 <br>、<b> 等），否则按纯文本（更安全） */
  if (typeof msg === 'string' && /[<>]/.test(msg)) cw.innerHTML = msg;
  else cw.textContent = msg;

  // 右侧留出按钮空间，防止文字与关闭按钮重叠
  t.style.paddingRight = '32px';
  t.style.pointerEvents = persistent ? 'auto' : 'none';
  t.style.cursor = persistent ? 'pointer' : 'default';
  t.style.textAlign = persistent ? 'left' : 'center';
  t.classList.add('on');
  clearTimeout(t._timer);
  if (!persistent) {
    t._timer = setTimeout(()=>t.classList.remove('on'), duration || 10000);
  }
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
         qSpanMap: JSON.parse(JSON.stringify(MODEL.p.qSpanMap || {})),
         pLoadMap: JSON.parse(JSON.stringify(MODEL.p.pLoadMap || {})),
         supportMap: JSON.parse(JSON.stringify(MODEL.p.supportMap || {})),
         removeBeamMap: JSON.parse(JSON.stringify(MODEL.p.removeBeamMap || {})) }
  };
  const btnFz  = document.getElementById('btnFreeze');
  if(btnFz)  btnFz.classList.add('on');
  const btnFzD = document.getElementById('btnFreezeDeform');
  if(btnFzD) btnFzD.classList.add('on');
}

function runSelfTest(caseId){
  const tc = SELF_TEST_CASES.find(c => c.id === caseId);
  if(!tc){
    if(typeof showToast === 'function') showToast('未找到自检工况：' + caseId);
    return;
  }

  /* 1. 拦截纯概念卡（不重置工况、不进行任何计算） */
  if (tc.pureConcept) {
    if (tc.toast) showToast(tc.toast, 15000);
    return;
  }

  /* 2. 主动清除之前可能残留的 Toast 提示 */
  const existingToast = document.getElementById('stToast');
  if(existingToast) existingToast.classList.remove('on');

  /* 3. 关闭所有模态框（帮助 / 分享 / 打赏），避免遮挡自检画面 */
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));

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
  if (typeof movingLoadStop === 'function') movingLoadStop();
  S.braceMap = {};
  S.braceTensionMap = {};
  S.removeBeamMap = {};
  S.qSpanMap = {};
  S.pLoadMap = {};
  S.supportMap = {};
  S.P1 = 0; S.P2 = 0; S.P3 = 0;
  S.tempAll = 0; S.tempGrad = 0; S.tempT0 = 20;
  S.brushBrace = 'none';
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
  if(typeof renderSupportMapPanel === 'function') renderSupportMapPanel();

  /* 2.6 prelude：先加载一个工况、可选冻结为基线，再加载主工况。
     专供 ㉔b/㉔c 使用：先算满跨、冻结为灰色基线，再算不利布置、与基线对比。
     prelude 与主 state 的拓扑必须一致，否则 run() 会因 geoChanged 清空 BASE。 */
  if(tc.prelude){
    if(!applyStateFromObj(tc.prelude)) return;
    if(tc.preludeFreeze) _freezeCurrentModel();
  }

  /* 3. 应用预设状态 */
  if(!applyStateFromObj(tc.state)) return;

  /* 3.1 静默展开对应的折叠面板（不切换 Tab，用户希望停留在「自检」Tab）
     说明：原先这里会 tabBtn.click() 强制切到「模型 / 荷载」Tab，用户反馈体验不好。
     现在只把 <details> 打开（open=true），切 Tab 时面板已经是展开的。 */
  const isModelParam = ['L1','L2','L3','h1','h2','h3','Lc','bc','hc','bb','hb','r','As','braceI'].includes(tc.sweep);
  const isLoadParam  = ['q1','q2','q3','qc1','qc2','qc3','H1','H2','H3','P1','P2','P3','tempAll','tempGrad','settleDy','betaF','betaJ'].includes(tc.sweep);

  const openDetails = (id) => { const el = document.getElementById(id); if(el) el.open = true; };

  if (isModelParam) {
    if (tc.sweep === 'As' || tc.sweep === 'braceI') openDetails('details-model-brace');
    else if (tc.sweep === 'bc' || tc.sweep === 'hc' || tc.sweep === 'bb' || tc.sweep === 'hb' || tc.sweep === 'r') openDetails('details-model-mat');
    else openDetails('details-model-topo');
  } else if (isLoadParam) {
    if (['tempAll','tempGrad','settleDy','supportRot0'].includes(tc.sweep)) openDetails('details-load-other');
    else if (['H1','H2','H3'].includes(tc.sweep)) openDetails('details-load-horz');
    else openDetails('details-load-vert');
  }

  /* 3.5 freezeAfter：本次加载后立即冻结（㉔a 使用） */
  if(tc.freezeAfter){
    _freezeCurrentModel();
    run();   // 让虚线基线立即出现
  }

  /* 3.55 针对反弯点自检卡，自动弹出悬浮窗并放置在弯矩图左侧 */
  if(tc.id === 'anti-rho' || tc.id === 'inflection-point-theory'){
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
      // 将卡片的 sweepRange 传递给 sweepPlay
      sweepPlay(true, tc.sweepRange);
    });
  });
}

(function bindSelfTest(){
  const container = document.getElementById('selfTestContainer');
  if(!container) return;

  // 收集所有出现过的 Tag 并去重
  const allTagsSet = new Set();
  for (const tags of Object.values(SELF_TEST_TAGS_MAP)) {
    tags.forEach(t => allTagsSet.add(t));
  }
  const allTags = ['全部', ...Array.from(allTagsSet)];

  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <div class="gtitle" style="margin-bottom:0;">一键力学自检</div>
      <span id="btnToggleAllST" style="font-size:11px; color:#38bdf8; cursor:pointer; opacity:0.8; transition:opacity 0.2s; user-select:none;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8">展开全部 ▾</span>
    </div>
    <div style="margin-bottom:8px;">
      <input type="text" id="stSearchInput" placeholder="🔍 搜索卡片标题 / 关键词…" style="width:100%; box-sizing:border-box; padding:6px 10px; font-size:12px; font-family:inherit; background:#0f172a; border:1px solid #334155; color:#f8fafc; border-radius:6px; outline:none;" autocomplete="off">
    </div>
    <div class="selfTestHint" style="margin-bottom:10px; padding:6px 10px; display:flex; justify-content:space-between; align-items:center;">
      <span>点击加载工况并播放。通过下方标签或搜索筛选。</span>
      <span style="font-size:10px; color:#38bdf8; cursor:help; opacity:0.8; border-bottom:1px dashed #38bdf8;" title="L1 = 基础（认识现象，如：弯矩释放）&#10;L2 = 进阶（理解规律，如：反弯点偏移）&#10;L3 = 高阶（深究本质，如：二阶效应与形常数陷阱）">L1~L3 含义 ⓘ</span>
    </div>
  `;

  // 渲染 Tag 筛选栏
  html += `<div class="stTagBar">`;
  for (const tag of allTags) {
    html += `<button type="button" class="stTagBtn ${tag === '全部' ? 'on' : ''}" data-tag="${tag}">${tag}</button>`;
  }
  html += `</div>`;

  // 按分类分组
  const groups = {};
  for (const caseObj of SELF_TEST_CASES) {
    const ui = SELF_TEST_UI_CONFIG[caseObj.id];
    if (!ui) continue;
    if (!groups[ui.category]) groups[ui.category] = [];
    groups[ui.category].push({ caseObj, ui });
  }

  // 核心修复：对每个分类下的卡片，强制按 L1 -> L2 -> L3 排序
  for (const cat in groups) {
    groups[cat].sort((a, b) => a.ui.level.localeCompare(b.ui.level));
  }

  const catOrder = [
    '📐 杆件与截面行为',
    '🏢 整体受力与变形',
    '🌪️ 抗侧力与二阶效应',
    '🧱 特殊构件与边界',
    '🔥 综合演练与概念'
  ];

  let globalCnt = 0; // 全局递增编号计数器



  for (const catName of catOrder) {
    if (!groups[catName]) continue;
    // 修改为默认全折叠
    html += `<details class="stCatGroup">`;
    html += `<summary class="selfTestCategory">${catName}</summary>`;
    html += `<div class="stCatContent">`;
    
    for (const { caseObj, ui } of groups[catName]) {
      globalCnt++;
      let actionText = '▶ 播放';
      if (ui.action === 'freeze') actionText = '📷 加载并冻结';
      else if (ui.action === 'toast') actionText = '💡 提示';
      else if (ui.action === 'compare') actionText = '📷 对比';

      let lvColor = '#38bdf8';
      if (ui.level === 'L2') lvColor = '#fbbf24';
      if (ui.level === 'L3') lvColor = '#f87171';

      const tags = SELF_TEST_TAGS_MAP[caseObj.id] || [];
      const tagsStr = tags.join(',');

      html += `
        <div class="selfTestCard" data-selftest="${caseObj.id}" data-tags="${tagsStr}">
          <div class="stcTitle" style="display:flex; justify-content:space-between; align-items:center;">
            <span style="display:flex; align-items:center;">
              <span class="st-num">${globalCnt}</span> 
              <span>${ui.title}</span>
            </span>
            <span style="font-size:9px; padding:1px 4px; border-radius:3px; background:rgba(255,255,255,0.05); color:${lvColor}; border:1px solid ${lvColor}44; font-weight:600;">${ui.level}</span>
          </div>
          <div class="stcDesc">${ui.desc}</div>
          <span class="stcAction">${actionText}</span>
        </div>
      `;
    }
    html += `</div></details>`;
  }

  container.innerHTML = html;

  // ===== 绑定 Tag 筛选逻辑 =====
  const tagBtns = container.querySelectorAll('.stTagBtn');
  const detailsGroups = container.querySelectorAll('.stCatGroup');
  const searchInput = document.getElementById('stSearchInput');
  
  tagBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // 切换按钮高亮
      tagBtns.forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      if(searchInput) searchInput.value = '';

      const selectedTag = btn.dataset.tag;

      detailsGroups.forEach(group => {
        let hasVisibleCard = false;
        const cards = group.querySelectorAll('.selfTestCard');
        
        cards.forEach(card => {
          const cardTags = card.dataset.tags ? card.dataset.tags.split(',') : [];
          // 如果是“全部”或者卡片包含选中的 Tag，则显示
          if (selectedTag === '全部' || cardTags.includes(selectedTag)) {
            card.style.display = 'flex'; // 恢复默认 flex
            hasVisibleCard = true;
          } else {
            card.style.display = 'none';
          }
        });

        // 如果该分类下有可见卡片，显示分类；如果正在筛选，自动展开该分类
        if (hasVisibleCard) {
          group.style.display = '';
          if (selectedTag !== '全部') {
            group.open = true;
          } else {
            group.open = false; // 恢复“全部”时默认折叠
          }
        } else {
          group.style.display = 'none';
        }
      });
      // 筛选完毕，同步更新右上角的文字状态
      updateToggleText();
    });
  });

  // ===== 绑定一键展开/收起（合并为动态开关） =====
  const btnToggle = document.getElementById('btnToggleAllST');
  
  // 辅助函数：根据当前是否有展开的项，动态更新按钮文字
  const updateToggleText = () => {
    if (!btnToggle) return;
    const visibleGroups = Array.from(container.querySelectorAll('.stCatGroup')).filter(g => g.style.display !== 'none');
    const anyOpen = visibleGroups.some(g => g.open);
    btnToggle.textContent = anyOpen ? '收起全部 ▴' : '展开全部 ▾';
  };

  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      const visibleGroups = Array.from(container.querySelectorAll('.stCatGroup')).filter(g => g.style.display !== 'none');
      const anyOpen = visibleGroups.some(g => g.open);
      // 如果当前有展开的，就全部收起；反之全部展开
      visibleGroups.forEach(d => d.open = !anyOpen);
      updateToggleText();
    });
  }

  // ===== 绑定搜索框：实时过滤卡片 =====
  if(searchInput){
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      /* 搜索时忽略 Tag 筛选：把 Tag 高亮重置到"全部"，避免两套过滤互相干扰 */
      if(q){
        tagBtns.forEach(b => b.classList.toggle('on', b.dataset.tag === '全部'));
      }
      const groups = container.querySelectorAll('.stCatGroup');
      groups.forEach(group => {
        let hasVisible = false;
        group.querySelectorAll('.selfTestCard').forEach(card => {
          if(!q){
            card.style.display = 'flex';
            hasVisible = true;
          } else {
            const title = (card.querySelector('.stcTitle') || {}).textContent || '';
            const desc  = (card.querySelector('.stcDesc')  || {}).textContent || '';
            const hay   = (title + ' ' + desc).toLowerCase();
            if(hay.includes(q)){
              card.style.display = 'flex';
              hasVisible = true;
            } else {
              card.style.display = 'none';
            }
          }
        });
        group.style.display = hasVisible ? '' : 'none';
        if(q && hasVisible) group.open = true;
      });
      if(btnToggle) {
        btnToggle.textContent = q ? '收起全部 ▴' : '展开全部 ▾';
      }
    });
  }

  // ===== 绑定卡片点击事件 =====
  container.querySelectorAll('.selfTestCard[data-selftest]').forEach(card => {
    card.addEventListener('click', () => {
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