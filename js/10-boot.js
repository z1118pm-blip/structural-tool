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
  'mid-support-ql2-trap': { category: '📐 杆件与截面行为', level: 'L2', action: 'play', title: '中间支座弯矩 ≠ ql²/12', desc: '单层两跨 · 满跨均布。扫掠柱截面 hc（柱越细，约束越弱）。看中支座负弯矩如何始终大于 ql²/12——因为真实框架的边柱会转动，无法提供理想固结。' },
  'colbase-hinge': { category: '🌪️ 抗侧力与二阶效应', level: 'L1', action: 'play', title: '柱脚弯矩释放', desc: '两层两跨 · 二层水平力。扫掠柱脚 β_f (1→0)，看柱脚弯矩逐渐释放减小、底层侧移随之增大。' },
  'strong-beam': { category: '📐 杆件与截面行为', level: 'L2', action: 'play', title: '梁刚度与反弯点', desc: '单层单跨 · 水平力。扫掠梁高 h_b (400→900)，看梁刚度变大如何使柱反弯点下移。' },
  'load-moment': { category: '📐 杆件与截面行为', level: 'L1', action: 'play', title: '跨中与支座弯矩', desc: '单层单跨 · 满跨均布。扫掠荷载 q_1 (0→100)，观察跨中正弯矩与支座负弯矩线性增长。' },
  'frame-action': { category: '🏢 整体受力与变形', level: 'L2', action: 'play', title: '框架作用传递', desc: '两层两跨 · 满跨均布。扫掠梁端 β_j (0→1)，看中柱轴力如何随梁约束的增强而增大。' },
  'cant-tension': { category: '🏢 整体受力与变形', level: 'L2', action: 'play', title: '悬挑偏心拉力', desc: '单层单跨+悬挑 · 无水平力。扫掠悬挑荷载 q_c1 (0→100)，看悬挑倾覆力矩导致的柱拉力。' },
  'weak-story': { category: '🏢 整体受力与变形', level: 'L2', action: 'play', title: '层刚度变化与变形集中', desc: '两层两跨 · 水平力。扫掠二层层高 h_2 (2.5→7)，层高增大使二层线刚度降低，看层间位移角（变形）如何向该层集中。' },
  'asym-sway': { category: '🏢 整体受力与变形', level: 'L2', action: 'play', title: '不对称侧移', desc: '单层两跨 · 竖向均布。扫掠左跨长 L_1 (3→12)，看单侧竖向荷载偏心引起的框架侧移。' },
  'cant-sway': { category: '🏢 整体受力与变形', level: 'L2', action: 'play', title: '悬挑重力侧移', desc: '两层两跨+悬挑 · 无水平力。扫掠悬挑荷载 q_c1 (0→100)，看纯重力偏心侧移（放大显示）。' },
  'dstiff-alloc': { category: '🌪️ 抗侧力与二阶效应', level: 'L2', action: 'play', title: '刚性楼板内柱分配', desc: '两层三跨 · 二层水平力，刚性楼板。扫掠内柱刚度比 r (0.25→4)，看内柱刚度变大时，如何通过楼板自动分走更多剪力。' },
  'dstiff-beam': { category: '🌪️ 抗侧力与二阶效应', level: 'L2', action: 'play', title: '刚性楼板梁约束影响', desc: '单层两跨 · 水平力，刚性楼板。扫掠梁端转动 β_j (0→1)，看梁的转动约束如何减小整体侧移，并观察边柱与中柱反弯点高度的动态演化。' },
  'pdelta': { category: '🌪️ 抗侧力与二阶效应', level: 'L3', action: 'play', title: 'P-Δ 二阶效应', desc: '两层单跨 · 极柔框架（层高8m、梁铰接、高轴压比），开启P-Δ。扫掠一层均布 q_1 (0→100)，看竖向荷载的叠加如何使 B 值从安全区急剧飙升，直接逼近失稳。' },
  'brace-stiffness': { category: '🧱 特殊构件与边界', level: 'L2', action: 'play', title: '支撑截面积与侧向刚度', desc: '单层单跨 · X 撑 · 水平力。扫掠支撑截面积 As (100→5000)，看支撑变粗后侧移显著减小、柱端弯矩被分走。若想观察支撑轴力，请手动切到 N 图。' },
  'brace-tension-only': { category: '🧱 特殊构件与边界', level: 'L2', action: 'play', title: '仅受拉支撑的单向工作', desc: '单层单跨 · X 撑（该格开启仅受拉）· 水平力。扫掠 H₁ (0→100)，N 图上始终只有受拉那根斜杆有数值，受压杆自动退出。' },
  'brace-angle': { category: '🧱 特殊构件与边界', level: 'L3', action: 'play', title: '支撑角度与侧向刚度', desc: '单层单跨 · X 撑 · 水平力。扫掠左跨 L₁ (3→12)，紧盯着变形图。你会看到侧移先减小后增大，最大侧向刚度（侧移最小）出现在 θ ≈ 35.3°，而非直觉上的 45°。' },
  'settlement': { category: '🧱 特殊构件与边界', level: 'L1', action: 'play', title: '支座沉降的附加内力', desc: '两层两跨 · 无外荷载、无水平力。扫掠左柱沉降 (0→100mm)，看超静定结构在"什么都没加"的情况下，M 图从零逐渐出现、反力重新分配、结构整体倾斜。' },
  'cant-L2': { category: '📐 杆件与截面行为', level: 'L1', action: 'play', title: '悬挑长度平方效应', desc: '单层单跨+悬挑 · 均布荷载。扫掠悬挑长度 L_c (0.5→4)，看悬挑根部弯矩呈平方级增长（M ∝ L_c²），以及悬挑端挠度呈四次方级剧增（Δ ∝ L_c⁴）。' },
  'col-h3': { category: '📐 杆件与截面行为', level: 'L1', action: 'play', title: '柱截面三次方效应', desc: '单层单跨 · 水平力。扫掠柱高 h_c (300→800)，专注看侧移随 h_c 增大而急剧减小（I_c ∝ h_c³）。' },
  'anti-rho': { category: '🌪️ 抗侧力与二阶效应', level: 'L2', action: 'play', title: '反弯点 vs 刚度比联动', desc: '两层两跨 · 纯水平力。扫掠梁高 h_b (400→900)，注意看「反弯点 vs 刚度比」小图。梁高增加使梁线刚度上升，各柱反弯点逐渐向跨中（x/h=0.5）靠拢。' },
  'brace-dir-L': { category: '🧱 特殊构件与边界', level: 'L2', action: 'compare', title: '单撑的方向不对称性', desc: '单层单跨 · 水平力向右 · 仅受拉。对比 ╱ 撑（基线，受拉正常工作）与 ╲ 撑（当前，受压直接退出）。体会柔性单撑体系“只能单向抗侧”的致命弱点。' },
  'brace-rigid-vs-tension': { category: '🧱 特殊构件与边界', level: 'L2', action: 'compare', title: '刚性撑 vs 柔性仅受拉撑', desc: '单层单跨 · 水平力向右 · ╲ 撑受压。对比普通刚性撑（紫虚线，受压照常抗侧）与仅受拉柔性撑（实线，受压退出罢工）。体会支撑设计中的“屈曲校核”与“仅受拉”的本质区别。' },
  'stiffness-jump-mid-braced': { category: '🏢 整体受力与变形', level: 'L2', action: 'play', title: '刚度突变 · 仅中间层设支撑', desc: '三层两跨 · 仅第2层两跨设 X 撑，上下层无撑。扫掠 H₃，看侧移呈中间平推、上下错位的变形。顶层推力使第3层产生相对错位，层间位移角在此集中放大。' },
  'weak-story-mid-unbraced': { category: '🏢 整体受力与变形', level: 'L2', action: 'play', title: '软弱层 · 仅中间层无支撑', desc: '三层两跨 · 第1、3层两跨设 X 撑，唯独第2层裸框架。扫掠 H₃，看顶层水平力如何全部由中间层承担，层间位移角向第2层急剧集中——这就是"软弱层"的力学本质。' },
  'load-baseline': { category: '🔥 综合演练与概念', level: 'L1', action: 'freeze', title: '满跨布置基线', desc: '单层三跨 · 满跨均布。加载满跨工况并自动冻结为灰色基线，供后续「中跨加载 / 相邻两跨加载」对比；也可单独查看满跨时的弯矩包络。' },
  'load-mid-span': { category: '🔥 综合演练与概念', level: 'L2', action: 'compare', title: '中跨加载（不利布置）', desc: '单层三跨 · 仅中跨加载。自动冻结满跨基线后加载中跨工况，看中跨跨中正弯矩如何增大、边跨是否出现反号弯矩。' },
  'load-adj-span': { category: '🔥 综合演练与概念', level: 'L2', action: 'compare', title: '相邻两跨加载（不利布置）', desc: '单层三跨 · 左+中两跨加载。自动冻结满跨基线后加载相邻工况，看中间支座负弯矩如何达到最大（支座配筋控制工况）。' },
  'pdelta-h1': { category: '🌪️ 抗侧力与二阶效应', level: 'L3', action: 'play', title: 'P-Δ 层高敏感性', desc: '两层单跨 · 柔性框架 · 开启P-Δ。扫掠一层的 h₁ (2.5→7)，看层高增加时侧向刚度骤减，失稳临界力随之下降，导致 B 值急剧放大并逼近失稳。' },
  'pdelta-vs-pdelta': { category: '🌪️ 抗侧力与二阶效应', level: 'L3', action: 'toast', title: 'P-δ 与 P-Δ 的区别', desc: '本工具只计算 P-Δ（结构侧移引起的二阶效应），不计算 P-δ（构件自身挠曲）。<br><br><svg viewBox="0 0 240 120" style="width:100%;height:auto;margin:6px 0;background:#0f172a;border-radius:4px;display:block;"><text x="60" y="12" fill="#94a3b8" font-size="9" text-anchor="middle">P-Δ</text><line x1="20" y1="100" x2="100" y2="100" stroke="#475569" stroke-width="2"/><line x1="20" y1="100" x2="20" y2="30" stroke="#475569" stroke-width="1.5" stroke-dasharray="2,2"/><line x1="100" y1="100" x2="100" y2="30" stroke="#475569" stroke-width="1.5" stroke-dasharray="2,2"/><line x1="20" y1="100" x2="35" y2="30" stroke="#38bdf8" stroke-width="2"/><line x1="100" y1="100" x2="115" y2="30" stroke="#38bdf8" stroke-width="2"/><line x1="35" y1="30" x2="115" y2="30" stroke="#38bdf8" stroke-width="2"/><text x="125" y="40" fill="#f87171" font-size="8">δ_top</text><text x="180" y="12" fill="#94a3b8" font-size="9" text-anchor="middle">P-δ</text><line x1="140" y1="100" x2="220" y2="100" stroke="#475569" stroke-width="2"/><line x1="140" y1="100" x2="140" y2="30" stroke="#475569" stroke-width="1.5" stroke-dasharray="2,2"/><line x1="220" y1="100" x2="220" y2="30" stroke="#475569" stroke-width="1.5" stroke-dasharray="2,2"/><path d="M 140 100 Q 155 65 140 30" stroke="#38bdf8" stroke-width="2" fill="none"/><path d="M 220 100 Q 235 65 220 30" stroke="#38bdf8" stroke-width="2" fill="none"/><line x1="140" y1="30" x2="220" y2="30" stroke="#38bdf8" stroke-width="2"/><text x="160" y="70" fill="#fbbf24" font-size="8">δ_local</text></svg>P-Δ：整体侧移，节点位移放大；P-δ：柱中部挠曲，构件局部放大。' },
  'p-moment': { category: '📐 杆件与截面行为', level: 'L1', action: 'play', title: '集中力弯矩尖角', desc: '单层单跨 · 跨中集中力。扫掠 P₁ (0→200)，观察集中力作用点处弯矩图的"尖角"，以及跨中正弯矩的线性增长。' },
  'temp-axial': { category: '🧱 特殊构件与边界', level: 'L1', action: 'play', title: '均匀升温的轴力', desc: '单层两跨 · 无外荷载。扫掠均匀升温 ΔT (0→50℃)，看超静定框架因膨胀受阻产生的内部轴力。' },
  'uniform-temp-moment': { category: '🧱 特殊构件与边界', level: 'L2', action: 'play', title: '均匀升温的弯矩', desc: '两层两跨 · 无外荷载。扫掠整体温升 ΔT (0→50℃)，看梁膨胀推动边柱侧移产生的柱端弯矩。均匀升温以轴力为主，弯矩是约束侧移的副产品——切到 N 图对比内力分布。' },
  'gradient-temp-moment': { category: '🧱 特殊构件与边界', level: 'L1', action: 'play', title: '非均匀升温的弯矩', desc: '单层单跨 · 无外荷载。扫掠结构内外温差 ΔT (0→30℃)，看边柱和顶层边梁的均匀曲率如何产生"两端同号"的固端弯矩——与均布荷载的异号弯矩形成鲜明对比。' },
  'remove-beam-pierce': { category: '🌪️ 抗侧力与二阶效应', level: 'L2', action: 'play', title: '穿层柱模拟', desc: '两层两跨 · 水平力。仅移除第1层左跨梁，左侧边柱形成穿层柱。同时显示弯矩与变形，观察底层侧移放大，以及跃层柱弯矩被其它柱吸收的现象。' },

  'beam-inflection-vs-col': { category: '📐 杆件与截面行为', level: 'L2', action: 'play', title: '柱刚度对梁反弯点的影响', desc: '单层单跨 · 竖向均布荷载。扫掠边柱高 hc (300→800)。柱越细，对梁端约束越弱（趋近铰接），反弯点靠近支座；柱越粗，约束越强（趋近固接），反弯点向跨中移动。' },
  'inflection-point-theory': { category: '📐 杆件与截面行为', level: 'L2', action: 'play', title: '水平力下的反弯点偏移', desc: '单层单跨 · 纯水平力。扫掠梁高 hb (400→900)，观察柱反弯点 x/h 的演变。理论精确解为 y/h = (1+3k)/(1+6k)。梁越刚，反弯点向 0.5h 靠拢。' },
  'load-path-layers': { category: '🏢 整体受力与变形', level: 'L2', action: 'play', title: '竖向荷载的跨层传递与衰减', desc: '三层两跨 · 仅底层受载。扫掠一层荷载 q1，观察一层巨大的弯矩如何向上传递，并在三层急剧衰减。' },
  'lateral-path-layers': { category: '🌪️ 抗侧力与二阶效应', level: 'L2', action: 'play', title: '底层水平荷载的悬臂效应', desc: '三层两跨 · 仅底层受水平力。扫掠 H1 (0→50)，观察水平力如何像“推倒积木”一样向上传递。' },
  'support-uplift': { category: '🧱 特殊构件与边界', level: 'L1', action: 'play', title: '支座上移 (抗浮)', desc: '两层两跨 · 无外荷载。扫掠左柱竖向位移 (0→-100mm)，模拟地下水浮力导致的基础上抬。观察框架整体上拱以及梁柱内力的反向重分布。' },
  'support-rotation': { category: '🧱 特殊构件与边界', level: 'L2', action: 'play', title: '基础强迫扭转', desc: '两层两跨 · 无外荷载。扫掠柱底真实强迫转角（0→10 mrad，约0.57°），模拟基础局部不均匀沉降产生的强制扭动。观察柱底巨大的抗弯弯矩以及框架被强行带偏的侧移。' },
  'overturning-pier': { category: '🏢 整体受力与变形', level: 'L2', action: 'play', title: '柱脚刚度与倾覆力矩', desc: '单层单跨 · 纯水平力。扫掠柱脚 β_f (0→1)，看倾覆力矩如何分配。刚接时柱脚弯矩吃掉大部分倾覆力矩，轴力小；铰接时柱脚弯矩为0，倾覆力矩100%转化为两侧柱子的拉压轴力。' },
  'axial-hinge': { category: '📐 杆件与截面行为', level: 'L3', action: 'toast', title: '为什么手算反弯点是 0.33h，软件却是 0.30h？', desc: '单层单跨 · 强柱弱梁 · 竖向荷载。老教材认为反弯点在 0.33h，但这建立在“无侧移”假定上。本工况考虑真实轴向变形，微小侧移导致反弯点偏移。切换“忽略轴向变形”即可见证奇迹。' },
  /* ==================== 新增：材质 / 型钢 / 支座 / 荷载 / 支撑 / 楼板 / 二阶 / 陷阱 ==================== */
  'mat-conc-vs-steel': { category: '📐 杆件与截面行为', level: 'L1', action: 'compare', title: '混凝土 vs 钢材：材料刚度', desc: '截面尺寸完全一样，只把材料从“混凝土 C30”换成“钢材 Q355”。看侧移直接缩小约 6.87 倍——这就是钢结构纤细的力学根源。' },
  'hw-strong-vs-weak': { category: '📐 杆件与截面行为', level: 'L1', action: 'compare', title: 'H 型钢柱强轴 vs 弱轴', desc: '同一根 HW300x300，绕杆轴旋转 90°，平面内刚度直接从强轴（Ix）变为弱轴（Iy）。观察侧移翻三倍的直观差异。' },
  'bc-linear-effect': { category: '📐 杆件与截面行为', level: 'L1', action: 'play', title: '柱宽 bc 的线性效应', desc: '单层单跨 · 水平力。扫掠 bc (300→800)，侧移线性下降。对照「柱截面三次方效应」：hc 是三次方。' },
  'bb-linear-effect': { category: '📐 杆件与截面行为', level: 'L1', action: 'play', title: '梁宽 bb 的线性效应', desc: '单层单跨 · 满跨均布。扫掠 bb (200→500)，侧移/挠度线性下降。对照「梁高 hb 的三次方效应」：hb 是三次方。' },
  'hb-linear-effect': { category: '📐 杆件与截面行为', level: 'L1', action: 'play', title: '梁高 hb 的三次方效应', desc: '单层单跨 · 满跨均布。扫掠 hb (400→900)，侧移/挠度急剧减小（I ∝ hb³）。对照「梁宽 bb 的线性效应」：bb 是线性。' },
  'mixed-supports-horizontal': { category: '🧱 特殊构件与边界', level: 'L2', action: 'play', title: '混合支座的水平力分配', desc: '单层两跨 · 左固、中铰、右滚。扫掠 H₁ (0→50)，看水平力如何全部分配给固接和铰接柱。滚轴柱完全“摆烂”，不参与抗侧。' },
  'mixed-supports-settlement': { category: '🧱 特殊构件与边界', level: 'L3', action: 'play', title: '差异沉降：固接 vs 约束释放', desc: '单层两跨 · 左固、中铰、右滚。扫掠左柱沉降。盯住支座！左侧固接柱提供了强大的抗转约束，被迫下沉瞬间激起巨大的次弯矩“暴击”；而右侧的铰接与滚轴柱释放了约束，容许框架局部自由变形，内力几乎毫无波澜。' },
  'sls-deflection': { category: '📐 杆件与截面行为', level: 'L1', action: 'play', title: '梁挠度超限与 SLS 报警', desc: '12m 跨大梁 · 60kN/m。扫掠梁高 hb (400→900)，看受弯挠度如何从严重超限（红字报警）减小直至安全。' },

  'pin-vs-fixed-base-sway': { category: '🧱 特殊构件与边界', level: 'L2', action: 'compare', title: '柱脚固接 vs 铰接：侧移对比', desc: '两层两跨 · 水平力。固接（紫虚线）vs 铰接（实线），侧移差 3~4 倍。' },
  'moving-load-influence': { category: '🔥 综合演练与概念', level: 'L2', action: 'play', title: '移动荷载与影响线', desc: '单层三跨 · 80kN 移动集中力。自动播放，用截面探针观察 M 值随位置变化——影响线本质。' },
  'moving-load-first-span': { category: '🔥 综合演练与概念', level: 'L2', action: 'play', title: '移动荷载（边跨对比）', desc: '单层三跨 · 80kN 移动集中力在第一跨移动。对比中跨移动，观察边跨与中跨弯矩包络的差异。' },
  'partial-vs-full-load': { category: '🔥 综合演练与概念', level: 'L2', action: 'compare', title: '隔跨加载 vs 满跨加载', desc: '三层三跨。满跨加载（紫虚线）时支座负弯矩最大；隔跨加载（实线，1/3跨受载）时跨中正弯矩显著增大。观察两类内力的控制工况差异。' },
  'cant-load-vs-span-load': { category: '🏢 整体受力与变形', level: 'L2', action: 'compare', title: '悬挑荷载 vs 跨内荷载', desc: '同样 30kN/m：跨内荷载由两柱共担；悬挑荷载全传给悬挑侧柱还带倾覆力矩。' },

  'brace-slim-buckling': { category: '🧱 特殊构件与边界', level: 'L2', action: 'play', title: '支撑长细比与受压屈曲报警', desc: '单层单跨 · X 撑（普通）。扫掠支撑回转半径 i (10→100mm)，长细比 λ 随之变化。当受压斜杆的轴力 |N| 大于临界力 N_cr 时，N 图该杆标红并显示警告。' },

  'remove-beam-rigid-trap': { category: '🌪️ 抗侧力与二阶效应', level: 'L3', action: 'compare', title: '刚性楼板下抽梁的陷阱', desc: '同样的抽梁工况：无楼板穿层柱侧移巨大；刚性楼板"隔空传力"把侧移压得很小。但这是假的。' },
  'remove-beam-multi': { category: '🏢 整体受力与变形', level: 'L3', action: 'compare', title: '连续抽梁 vs 单跨抽梁', desc: '连续抽梁让中间柱顶部两侧同时失去约束，计算长度翻倍。"连续削弱"比"分散削弱"更危险。' }
};

/* 自检卡片的 Tag 筛选字典（按工程痛点重构） */
const SELF_TEST_TAGS_MAP = {
  'moment-redist': ['内力/反弯点'],
  'mid-support-ql2-trap': ['内力/反弯点', '体系/概念'],
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
  'brace-rigid-vs-tension': ['支撑系统'],
  'stiffness-jump-mid-braced': ['支撑系统', '变形/侧移'],
  'weak-story-mid-unbraced': ['支撑系统', '变形/侧移'],
  'load-baseline': ['不利布置'],
  'load-mid-span': ['不利布置'],
  'load-adj-span': ['不利布置'],
  'pdelta-h1': ['二阶效应'],
  'pdelta-vs-pdelta': ['二阶效应'],
  'p-moment': ['内力/反弯点'],
  'temp-axial': ['边界/非荷载'],
  'uniform-temp-moment': ['边界/非荷载', '内力/反弯点'],
  'gradient-temp-moment': ['边界/非荷载', '内力/反弯点'],
  'remove-beam-pierce': ['变形/侧移'],

  'beam-inflection-vs-col': ['内力/反弯点'],
  'inflection-point-theory': ['内力/反弯点'],
  'load-path-layers': ['内力/反弯点', '变形/侧移'],
  'lateral-path-layers': ['变形/侧移'],
  'support-uplift': ['边界/非荷载'],
  'support-rotation': ['边界/非荷载', '变形/侧移'],
  'overturning-pier': ['内力/反弯点', '边界/非荷载'],
  'axial-hinge': ['内力/反弯点'],
  /* ==================== 新增标签 ==================== */
  'mat-conc-vs-steel': ['变形/侧移', '体系/概念'],
  'hw-strong-vs-weak': ['变形/侧移'],
  'bc-linear-effect': ['变形/侧移'],
  'bb-linear-effect': ['变形/侧移'],
  'hb-linear-effect': ['变形/侧移', '内力/反弯点'],
  'mixed-supports-horizontal': ['边界/非荷载', '变形/侧移'],
  'mixed-supports-settlement': ['边界/非荷载', '内力/反弯点'],
  'sls-deflection': ['变形/侧移'],

  'pin-vs-fixed-base-sway': ['边界/非荷载', '变形/侧移'],
  'moving-load-influence': ['不利布置', '内力/反弯点'],
  'moving-load-first-span': ['不利布置', '内力/反弯点'],
  'partial-vs-full-load': ['不利布置', '内力/反弯点'],
  'cant-load-vs-span-load': ['内力/反弯点', '变形/侧移'],

  'brace-slim-buckling': ['支撑系统'],

  'remove-beam-rigid-trap': ['变形/侧移']
};

const SELF_TEST_CASES = [
  {
    id: 'mid-support-ql2-trap',
    sweep: 'hc',
    sweepRange: [300, 800],
    state: {
      nBay: 2, nLev: 1, hasCant: false,
      L1: 10, L2: 10, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5,
      bc: 400, hc: 300, bb: 250, hb: 500, r: 1,
      q1: 100, q2: 0, q3: 0,
      qc1: 0, qc2: 0, qc3: 0,
      H1: 0, H2: 0, H3: 0, Hmode: 'none',
      betaF: 1, betaJ: 1,
      forceType: 'M', elFilter: 'all',
      showVals: true, showAntiPts: false, showPDelta: false,
      displayMode: 'force', mScale: 0.5, dScale: 30
    },
    toast: '⚠️ 你看到的 970 ≠ 833，因为中间支座<b>不是固结</b>。<br><br>ql²/12=833 只是「边柱无限刚」的特例。真实框架里，边柱会转动，中支座负弯矩被放大：<br><br><b>M_B = ql²/12 × (3ρ+2)/(2(ρ+1))</b><br><br>• 柱无限刚（ρ→0）→ 833（永远达不到）<br>• 柱铰接（ρ→∞）→ 1250（ql²/8）<br><br>扫掠柱截面高度 h_c：柱越细，边柱转得越多，中支座负弯矩越大（h_c=300 → 约 1057）；柱越粗，越接近 833（h_c=800 → 约 857）。<br><br><b>盯住中间支座两侧梁端的数值</b>，同时看右面板 ρ 的同步变化。<br><br>注：柱脚刚度 β_f=1 管的是<b>柱脚</b>，不是中支座。中支座是梁-柱-梁三杆交汇节点，它的转动由柱的抗弯刚度决定。'
  },
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
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 30, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 10, dScale: 300 },
    toast: '两层两跨 · 二层水平力。扫掠柱脚 β_f (1→0)，看柱脚弯矩逐渐释放减小、底层侧移随之增大。**进阶**：对比「梁端弯矩释放」卡——柱脚刚度和梁端刚度在概念上等价，都是"转动约束"。'
  },
  {
    id: 'axial-hinge',
    sweep: null,
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 800, hc: 800, bb: 200, hb: 400, r: 1, q1: 100, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', axialMode: 'real', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 1, dScale: 30 },
    toast: '很多工程师认为竖向荷载下反弯点必然是 0.33h。但在本工况中，由于强柱弱梁（柱 800×800，梁 200×400），且考虑梁的轴向变形，竖向荷载引起了极微小的侧移，反弯点偏移到了约 0.30h。请点击左侧【模型】Tab，切换至【忽略（刚性）】轴向变形，看看反弯点是不是瞬间跳回了 0.33h？<br><br>**这就是为什么分层法要做"无侧移"假定**——所有位移法手算表格的结论，都建立在"节点无相对侧移"这个前提上。'
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
    state: { nBay: 2, nLev: 1, hasCant: false, L1: 3, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 200 }
  },
  {
    id: 'cant-sway',
    sweep: 'qc1',
    state: { nBay: 2, nLev: 2, hasCant: true, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 2.0, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 50, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 150 }
  },
  {
    id: 'dstiff-alloc',
    sweep: 'r',
    state: { nBay: 3, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 0.25, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 60, H3: 0, Hmode: 'rigid', betaF: 1, betaJ: 1, forceType: 'V', elFilter: 'col', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 10, dScale: 300 },
    toast: '两层三跨 · 刚性楼板 · 二层水平力。扫掠内柱刚度比 r (0.25→4)，看刚性楼板如何按柱刚度自动分配剪力：内柱 r 越大，分走的剪力越多。'
  },
  {
    id: 'dstiff-beam',
    sweep: 'betaJ',
    state: { nBay: 2, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'rigid', betaF: 1, betaJ: 0, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 10, dScale: 300 }
  },
  {
    id: 'pdelta',
    sweep: 'q1',
    state: { nBay: 1, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 8, h2: 8, h3: 4, Lc: 1.5, bc: 300, hc: 300, bb: 250, hb: 500, r: 1, q1: 0, q2: 80, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 5, H2: 5, H3: 0, Hmode: 'none', betaF: 1, betaJ: 0, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: true, displayMode: 'deform', mScale: 1, dScale: 15 }
  },
  {
    id: 'brace-stiffness',
    sweep: 'As',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 100, braceOnlyTension: false, braceMap: {'1-1':'X'}, braceTensionMap: {}, brushBrace: 'X', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 5, dScale: 300 }
  },
  {
    id: 'brace-tension-only',
    sweep: 'H1',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceOnlyTension: false, braceMap: {'1-1':'X'}, braceTensionMap: {'1-1':true}, brushBrace: 'X', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'brace', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 50 }
  },
  {
    id: 'brace-angle',
    sweep: 'L1',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 3, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceOnlyTension: false, braceMap: {'1-1':'X'}, braceTensionMap: {}, brushBrace: 'X', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'brace', showVals: true, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 8, dScale: 100 },
    toast: '扫掠跨长 L₁，紧盯着<b>变形图</b>！<br><br>侧移最小（刚度最大）的位置，不是直觉上的 45°，而是数学上的 <b>θ ≈ 35.3°</b>（此时跨长约 5.7m）。<br><br>为什么？支撑提供的水平刚度 K ∝ cos²θ / L。<br>• 当支撑太陡（θ 接近 90°），支撑本身太长，EA/L 太小，软绵绵的；<br>• 当支撑太扁（θ 接近 0°），cos²θ 接近 0，水平方向用不上力。<br><br>两者相互制约，极值点恰好落在 35.3°。这就是为什么工程中布置支撑，不要迷信 45°，35° 左右才是最刚的“黄金倾角”。'
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
    sweepRange: [0, 10],
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', supportMap: {'0': {rot: 0}}, frameMat: 'conc', braceMat: 'steel', As: 2000, braceOnlyTension: false, braceMap: {}, braceTensionMap: {}, brushBrace: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 0.6, dScale: 10 },
    toast: '强迫左柱底发生旋转，模拟基础局部不均匀沉降或地基倾斜引起的强迫转角。扫掠真实强迫转角（0→10 mrad，即约0.57°）。为了让肉眼看清，图形上的支座倾斜被视觉放大了50余倍。看极微小转角如何产生巨大的附加弯矩和框架侧移。'
  },

  /* ===== 新增卡（v0.1.6 功能扩充）===== */

  /* ⑰ 悬挑长度平方效应：与 ⑥ 的"线性荷载"对照，看 M ∝ L_c² */
  {
    id: 'cant-L2',
    sweep: 'Lc',
    state: { nBay: 1, nLev: 1, hasCant: true, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 0.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 30, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 1.0, dScale: 50 }
  },

  {
    id: 'col-h3',
    sweep: 'hc',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 300, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 7, dScale: 80 }
  },
  {
    id: 'bc-linear-effect',
    sweep: 'bc',
    sweepRange: [300, 800],
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 300, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 5, dScale: 100 },
    toast: '柱宽 b_c 对侧移是线性的（I ∝ b_c）。刚看过的上一张卡是柱高 h_c（三次方）。**加高比加宽划算得多**——这就是柱截面设计的铁律，也是"为什么柱子总是窄而高"的量化回答。'
  },

  /* ⑳ 三层薄弱层转移：⑦ 的纵向延伸，填补三层拓扑零覆盖 */


  /* ㉑a ╱ 单撑仅受拉：把"方向决定拉压"从 X 撑中剥离 */
  {
    id: 'brace-dir-L',
    sweep: null,
    prelude: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 80, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceMap: {'1-1':'/'}, braceTensionMap: {'1-1':true}, brushBrace: '/', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'brace', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 50 },
    preludeFreeze: true,
    legendBase: '╱ 撑受拉 (基线)',
    legendCurrent: '╲ 撑受压 (退出)',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 80, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceMap: {'1-1':'\\'}, braceTensionMap: {'1-1':true}, brushBrace: '\\', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'brace', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 50 },
    toast: '水平力向右推时，╱ 撑受拉，安全且发力（灰虚线基线）；╲ 撑受压，因为开启了「仅受拉」，直接被剔除退出（实线）。这就是柔性单撑无法双向抗侧的力学本质。'
  },
  {
    id: 'brace-rigid-vs-tension',
    sweep: null,
    prelude: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 80, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceMap: {'1-1':'\\'}, braceTensionMap: {}, brushBrace: '\\', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'brace', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 50 },
    preludeFreeze: true,
    legendBase: '普通刚性撑受压 (基线)',
    legendCurrent: '仅受拉撑受压 (退出)',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 80, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceMap: {'1-1':'\\'}, braceTensionMap: {'1-1':true}, brushBrace: '\\', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'brace', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 50 },
    toast: '同样的 ╲ 撑、同样的向右水平力（撑处于受压状态）：<br>紫虚线是“普通刚性撑”，虽然受压，但抗压刚度依然存在，把框架牢牢拉住；<br>实线是“仅受拉柔性撑”，一受压直接罢工退出，侧移剧增。<br>这就是为什么 X 撑可以双向工作，而拉杆必须开启“仅受拉”。'
  },

  /* ===== 新增：三层刚度突变 / 软弱层 ===== */
  {
    id: 'stiffness-jump-mid-braced',
    sweep: 'H3',
    state: {
      nBay: 2, nLev: 3, hasCant: false,
      L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5,
      bc: 400, hc: 400, bb: 250, hb: 500, r: 1,
      q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0,
      H1: 0, H2: 0, H3: 0, Hmode: 'none',
      frameMat: 'conc', braceMat: 'steel', As: 2000,
      braceMap: { '2-1': 'X', '2-2': 'X' },
      braceTensionMap: {},
      brushBrace: 'X',
      betaF: 1, betaJ: 1,
      forceType: 'M', elFilter: 'all',
      showVals: false, showIds: false, showPDelta: false,
      displayMode: 'deform', mScale: 1, dScale: 250
    },
    toast: '仅第2层设支撑：上下层柔性、中间层刚性，侧移形成中间平推、上下错位的变形。扫掠 H₃ 看整体侧移；切到变形图观察顶层相对错位及层间位移角的分布变化。'
  },
  {
    id: 'weak-story-mid-unbraced',
    sweep: 'H3',
    state: {
      nBay: 2, nLev: 3, hasCant: false,
      L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5,
      bc: 400, hc: 400, bb: 250, hb: 500, r: 1,
      q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0,
      H1: 0, H2: 0, H3: 0, Hmode: 'none',
      frameMat: 'conc', braceMat: 'steel', As: 2000,
      braceMap: { '1-1': 'X', '1-2': 'X', '3-1': 'X', '3-2': 'X' },
      braceTensionMap: {},
      brushBrace: 'X',
      betaF: 1, betaJ: 1,
      forceType: 'M', elFilter: 'all',
      showVals: false, showIds: false, showPDelta: false,
      displayMode: 'deform', mScale: 1, dScale: 250
    },
    toast: '仅第2层无支撑：上下层有撑、中间层裸框架。扫掠 H₃（顶层水平力），看层间位移角如何向第2层集中——这就是"软弱层"的力学本质。'
  },

  /* “强柱弱梁”卡片已移除 */

  /* ㉔a 满跨布置基线（静态卡 + 自动冻结） */
  {
    id: 'load-baseline',
    sweep: null,
    freezeAfter: true,
    state: { nBay: 3, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, qSpanMap: {}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 2, dScale: 50 },
    toast: '已加载满跨布置并冻结为紫色虚线基线。可直接查看满跨弯矩，或点后续的「不利布置」卡片进行对比。'
  },

  /* ㉔b 中跨加载：prelude 自动加载满跨 + 冻结，再加载中跨工况 */
  {
    id: 'load-mid-span',
    sweep: null,
    prelude: { nBay: 3, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, qSpanMap: {}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, displayMode: 'force', mScale: 2, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 3, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, qSpanMap: {'1-1':0, '1-2':20, '1-3':0}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 2, dScale: 50 },
    toast: '紫虚线 = 满跨基线；实线 = 仅中跨加载。注意中跨跨中正弯矩增大，边跨可能上拱（反号弯矩）。'
  },

  /* ㉔c 相邻两跨加载：与 ㉔b 同一 prelude，看支座负弯矩控制工况 */
  {
    id: 'load-adj-span',
    sweep: null,
    prelude: { nBay: 3, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, qSpanMap: {}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, displayMode: 'force', mScale: 2, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 3, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, qSpanMap: {'1-1':20, '1-2':20, '1-3':0}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 2, dScale: 50 },
    toast: '紫虚线 = 满跨基线；实线 = 左+中两跨加载。注意中间支座负弯矩达到最大（支座配筋控制工况）。'
  },
  /* ===== 二阶段新增：P-Δ、集中力、温度 ===== */
  {
    id: 'pdelta-h1',
    sweep: 'h1',
    state: { nBay: 1, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 2.5, h2: 6, h3: 4, Lc: 1.5, bc: 250, hc: 250, bb: 250, hb: 500, r: 1, q1: 60, q2: 100, q3: 0, qc1: 0, qc2: 0, qc3: 0, P1:0, P2:0, P3:0, pLoadMap:{}, H1: 5, H2: 5, H3: 0, Hmode: 'none', betaF: 1, betaJ: 0, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: true, displayMode: 'deform', mScale: 1, dScale: 20 }
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
    state: { nBay: 2, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, P1:0, P2:0, P3:0, pLoadMap:{}, H1: 0, H2: 0, H3: 0, Hmode: 'none', tempAll: 0, tempGrad: 0, betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 10, dScale: 50 }
  },
  {
    id: 'uniform-temp-moment',
    sweep: 'tempAll',
    sweepRange: [0, 50],
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, P1:0, P2:0, P3:0, pLoadMap:{}, H1: 0, H2: 0, H3: 0, Hmode: 'none', tempAll: 0, tempGrad: 0, tempT0: 20, betaF: 1, betaJ: 1, axialMode: 'real', forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 10, dScale: 30 },
    toast: '均匀升温会让整个框架试图膨胀。超静定约束阻止了自由变形，于是梁柱内部产生了内力。<br><br>重点关注：在这种温度工况下，<b>轴力（N）才是真正的主导内力</b>。点击下方 <b>N</b> 按钮切到轴力图，你会看到整个框架都处于受压（或受拉）状态，内力分布非常饱满。<br><br>而 M 图上看到的柱端弯矩，实际上是框架整体侧移受阻产生的<b>附加次弯矩</b>。比起轴力，它只是约束的副产品。'
  },
  {
    id: 'gradient-temp-moment',
    sweep: 'tempGrad',
    sweepRange: [0, 30],
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, P1:0, P2:0, P3:0, pLoadMap:{}, H1: 0, H2: 0, H3: 0, Hmode: 'none', tempAll: 0, tempGrad: 0, tempT0: 20, betaF: 1, betaJ: 1, axialMode: 'real', forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 8, dScale: 30 },
    toast: '截面内外温差（ΔT = 室外 − 室内）让边柱和顶层边梁产生<b>均匀曲率</b>。当两端固接时，固端弯矩是<b>同号</b>的——盯住柱顶和柱底，M 图在柱子两侧朝同一个方向，这是"温差弯曲"独有的指纹。<br><br>对比一下：均布荷载的弯矩在梁两端是<b>异号</b>的（一端顺时针、一端逆时针）。两者视觉上一眼可辨。<br><br><b>💡 概念延伸</b>：温差本身<b>不直接产生轴力</b>，它只产生弯曲。但在超静定框架里，弯曲变形会受到节点约束，从而通过变形协调<b>间接诱发</b>出微小的轴力。由于本工况是单跨框架，这种协调约束很弱，产生的轴力极小（N图上看不见），故本工具以弯矩呈现为主。<br><br>注意：内部梁柱和悬挑梁不受截面温差影响（两侧都在室内或室外）。'
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
      forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: true, 
      displayMode: 'all', mScale: 3, dScale: 300, 
      removeBeamMap: {'1-1': true} 
    },
    toast: '注意看：底层左跨梁被移除，左侧边柱形成“穿层柱”。在变形图中，底层侧移显著放大；在弯矩图中，你会发现尽管这根柱子底层受弯，但其顶部的弯矩会通过第二层梁传递并重新分配给右侧的完整框架，这就是“跃层柱弯矩被其它柱吸收”的直观体现。'
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
  /* ==================== 新增 v0.1.9.3：扩充自检卡 ==================== */

  /* ========== L1 卡（6 张） ========== */
  {
    id: 'mat-conc-vs-steel',
    sweep: null,
    prelude: { nBay: 1, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 30, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 200 },
    preludeFreeze: true,
    legendBase: '混凝土 C30 (虚)',
    legendCurrent: '钢材 Q355 (实)',
    state: { nBay: 1, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 50, H2: 30, H3: 0, Hmode: 'none', frameMat: 'steel', braceMat: 'steel', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 200 },
    toast: '截面尺寸一模一样，只把材料从“混凝土 C30”换成“钢材 Q355”，侧移直接缩小近 7 倍（钢材的弹性模量是混凝土的 6.87 倍）。这就是为什么钢结构可以做得很纤细，而混凝土必须靠截面堆刚度。'
  },
  {
    id: 'hw-strong-vs-weak',
    sweep: null,
    prelude: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, colSecType: 'HW', colHW: 'HW300x300', colAxis: 'strong', bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 30, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 10 },
    preludeFreeze: true,
    legendBase: '强轴 (虚)',
    legendCurrent: '弱轴 (实)',
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, colSecType: 'HW', colHW: 'HW300x300', colAxis: 'weak', bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 30, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 10 },
    toast: 'HW300x300 的 Iy/Ix ≈ 6760/20500 ≈ 0.33。同一根型钢柱，截面尺寸没有任何改变，仅仅是将截面绕自身轴线旋转了 90°。当弱轴迎战水平力时，平面内抗弯刚度直接降至原来的 1/3，侧移随之放大 3 倍。在力学上，截面的“方向”本身就是一种“刚度”。'
  },
  /* 旧的 bc-linear-effect 已移至 col-h3 之后，此处删除 */
  {
    id: 'bb-linear-effect',
    sweep: 'bb',
    sweepRange: [200, 500],
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 200, hb: 600, r: 1, q1: 30, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 3, dScale: 300 },
    toast: '梁宽 b_b 对梁刚度是线性的，梁高 h_b 是三次方。梁设计要"加高不加宽"——这就是为什么梁的截面总是窄而高，也是"为什么梁高不能随便砍"的量化依据。'
  },
  {
    id: 'hb-linear-effect',
    sweep: 'hb',
    sweepRange: [400, 900],
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 400, r: 1, q1: 30, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 3, dScale: 300 },
    toast: '梁高 h_b 从 400 扫掠到 900，你会发现变形急剧减小（I ∝ h_b³）。这就是"为什么梁高不能随便砍"的量化依据——截面高度稍微降一点，刚度就会呈三次方暴跌。'
  },
  {
    id: 'mixed-supports-horizontal',
    sweep: 'H1',
    sweepRange: [0, 50],
    state: { nBay: 2, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', supportMap: { '0': { type: 'fixed' }, '1': { type: 'pin' }, '2': { type: 'roller' } }, betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 5, dScale: 100 },
    toast: '💡 左柱固接（有柱脚弯矩），中柱铰接（柱脚 M=0），右柱滚轴（可以左右滑动，完全不受力）。随着 H₁ 增加，看右侧滚轴柱是如何“置身事外”的，水平力全被左柱和中柱吃走。'
  },
  {
    id: 'mixed-supports-settlement',
    sweep: 'settleDy',
    sweepRange: [0, 50],
    state: { nBay: 2, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', supportMap: { '0': { type: 'fixed', dy: 0 }, '1': { type: 'pin' }, '2': { type: 'roller' } }, betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'all', mScale: 1, dScale: 10 },
    toast: '💡 强迫左柱沉降。因为左柱脚是固接的，提供了转动约束，它一被迫下沉，立刻在梁端和柱脚激起巨大的抗弯次内力（M 图瞬间爆发）。反观右侧的铰接柱和滚轴柱，因为转动约束被释放，容许产生局部的刚体位移与转动，无法“憋”出次弯矩。**次内力的产生，根本上取决于多余约束的存在与强弱。**'
  },
  {
    id: 'sls-deflection',
    sweep: 'hb',
    sweepRange: [400, 900],
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 12, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 400, r: 1, q1: 60, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 20 },
    toast: '12m 跨的大梁，荷载很大。初始 400 高时挠度严重超 1/200（状态栏 DEFORM·超限亮起，r-maxDy 标红）。随着梁高 hb 增加，看挠度如何呈三次方骤降，什么时候变回绿色的 OK。'
  },

  /* ========== L2 卡（11 张） ========== */

  {
    id: 'pin-vs-fixed-base-sway',
    sweep: null,
    prelude: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 60, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 150 },
    preludeFreeze: true,
    legendBase: '柱脚固接 (紫虚)',
    legendCurrent: '柱脚铰接 (实)',
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 60, H2: 0, H3: 0, Hmode: 'none', betaF: 0, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 150 },
    toast: '柱脚从固接（紫虚线）变铰接（实线），侧移放大 3~4 倍，柱脚弯矩归零。柱脚刚度的选择在"弯矩小"和"侧移小"之间权衡——不是越刚越好。'
  },
  {
    id: 'moving-load-influence',
    sweep: null,
    autoPlayMovingLoad: true,
    state: { nBay: 3, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, P1: 0, P2: 0, P3: 0, movingLoad: { enabled: true, lev: 1, bay: 2, P: 80, t: 0.5, speed: 1 }, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 50 },
    toast: '已自动播放 80kN 移动集中力。请在内力图上点击任意截面（截面探针），盯住 M 值——它随荷载位置变化，这就是**影响线**的本质。活荷载不利布置的力学依据。'
  },
  {
    id: 'moving-load-first-span',
    sweep: null,
    autoPlayMovingLoad: true,
    state: { nBay: 3, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, P1: 0, P2: 0, P3: 0, movingLoad: { enabled: true, lev: 1, bay: 1, P: 80, t: 0.5, speed: 1 }, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 3, dScale: 50 },
    toast: '已自动播放 80kN 移动集中力（第一跨）。请在内力图上点击第一跨的截面（截面探针）。你会发现，当集中力移动时，边跨的跨中弯矩就像一个三角形，最大值出现在荷载刚好压在跨中时。'
  },
  {
    id: 'partial-vs-full-load',
    sweep: null,
    prelude: { nBay: 3, nLev: 3, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 20, q2: 20, q3: 20, qc1: 0, qc2: 0, qc3: 0, qSpanMap: {}, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 6, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 3, nLev: 3, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, qSpanMap: { '1-1': 20, '1-3': 20, '2-1': 20, '2-3': 20, '3-1': 20, '3-3': 20 }, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 6, dScale: 50 },
    toast: '💡 <b>满跨 vs 隔跨：各有所长</b><br>紫虚线（满跨）时，中间支座相邻两跨同时受载，两侧梁端共同作用，对节点的转动约束达到最强，使得负弯矩达到峰值——这是<b>支座配筋</b>的控制工况。<br>实线（隔跨，仅1、3跨受载）时，支座负弯矩虽减小，但受载跨的跨中正弯矩被显著放大——这是<b>跨中配筋</b>的控制工况。'
  },
  {
    id: 'cant-load-vs-span-load',
    sweep: null,
    prelude: { nBay: 1, nLev: 1, hasCant: true, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 3.0, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 10, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, axialMode: 'rigid', forceType: 'N', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 5, dScale: 50 },
    preludeFreeze: true,
    state: { nBay: 1, nLev: 1, hasCant: true, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 3.0, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 30, qc2: 0, qc3: 0, H1: 0, H2: 0, H3: 0, Hmode: 'none', betaF: 1, betaJ: 1, axialMode: 'rigid', forceType: 'N', elFilter: 'all', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 5, dScale: 50 },
    toast: '💡 <b>总重力相近条件下的降维打击：</b><br>跨内荷载（紫虚线）被两根柱温柔地平摊；而悬挑荷载（实线）不仅全部压在悬挑侧柱，更通过 3.0m 的力臂产生了巨大倾覆力矩，硬生生把另一侧柱拔成了<b>受拉状态</b>（N图显示为蓝色或负值）。悬挑的“偏心”效应，远比同等的跨内荷载致命！'
  },

  {
    id: 'brace-slim-buckling',
    sweep: 'braceI',
    sweepRange: [10, 100],
    state: { nBay: 1, nLev: 1, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 80, H2: 0, H3: 0, Hmode: 'none', frameMat: 'conc', braceMat: 'steel', As: 2000, braceI: 10, braceMap: { '1-1': 'X' }, braceTensionMap: {}, brushBrace: 'X', betaF: 1, betaJ: 1, forceType: 'N', elFilter: 'brace', showVals: true, showIds: false, showPDelta: false, displayMode: 'force', mScale: 5, dScale: 50 },
    toast: '扫掠支撑回转半径 i (10→100mm)，长细比 λ 随之变化。受压斜杆的 |N| 一旦超过临界力 N_cr，N 图该杆标红并提示超限。右侧面板的“受压支撑校核”也会亮红。这就是规范限制支撑长细比（λ）的力学依据。'
  },





  /* ========== L3 卡（10 张） ========== */
  {
    id: 'remove-beam-rigid-trap',
    sweep: null,
    prelude: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 100, H3: 0, Hmode: 'none', removeBeamMap: { '1-1': true, '2-1': true }, betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 10 },
    preludeFreeze: true,
    state: { nBay: 2, nLev: 2, hasCant: false, L1: 6, L2: 6, L3: 6, h1: 4, h2: 4, h3: 4, Lc: 1.5, bc: 400, hc: 400, bb: 250, hb: 500, r: 1, q1: 0, q2: 0, q3: 0, qc1: 0, qc2: 0, qc3: 0, H1: 0, H2: 100, H3: 0, Hmode: 'rigid', removeBeamMap: { '1-1': true, '2-1': true }, betaF: 1, betaJ: 1, forceType: 'M', elFilter: 'all', showVals: false, showIds: false, showPDelta: false, displayMode: 'deform', mScale: 1, dScale: 10 },
    toast: '同样的抽梁工况：无楼板（紫虚线）→ 穿层柱侧移巨大；刚性楼板（实线）→ 侧移被压得很小。**但这是假的**——楼板能传力，但穿层柱的计算长度、稳定、二阶效应一样没变。真实工程必须做楼板真实刚度分析。'
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

  /* 0. 先高亮当前卡片（含纯概念卡），保证点击有视觉反馈。
     原先这段位于 pureConcept 拦截之后，导致纯概念卡点击无高亮。 */
  document.querySelectorAll('.selfTestCard').forEach(c => {
    c.classList.toggle('active', c.dataset.selftest === caseId);
  });



  /* 1. 拦截纯概念卡（清空扫掠状态，并彻底重置模型） */
  if (tc.pureConcept) {
    /* 停止正在播放的扫掠 */
    if(S.sweep.playing) sweepStop();

    /* 关闭扫掠条 */
    const bar = document.getElementById('sweepBar');
    if(bar) bar.classList.remove('on');
    const btnBar = document.getElementById('btn-sweep');
    if(btnBar) btnBar.classList.remove('on');

    /* 应用空状态 {}，这会自动重置模型到默认 1跨1层，并清空所有冻结基线和扫掠残留 */
    if(typeof applyStateFromObj === 'function') {
      applyStateFromObj(tc.state || {});
    }

    if (tc.toast) showToast(tc.toast, 15000, true);
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
     prelude 与主 state 的拓扑必须一致，否则 run() 会因 geoChanged 清空 BASE。 */
  // 重置图例文字为默认值
  S.uiLegend = {
    base: tc.legendBase || '冻结基线',
    current: tc.legendCurrent || '当前工况'
  };
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
  const isLoadParam  = ['q1','q2','q3','qc1','qc2','qc3','H1','H2','H3','P1','P2','P3','tempAll','tempGrad','settleDy','supportRot0','betaF','betaJ'].includes(tc.sweep);

  const openDetails = (id) => { const el = document.getElementById(id); if(el) el.open = true; };

  // 如果是移动荷载卡片，强制切换左侧到「荷载」Tab 并展开面板，且自动滚动到该面板
  if (tc.id === 'moving-load-influence' || tc.id === 'moving-load-first-span') {
    const tabBtn = document.querySelector('#tabBar button[data-tab="load"]');
    if (tabBtn) tabBtn.click();
    openDetails('details-load-moving');
    
    // 新增：延迟 100ms 等待面板展开和 Tab 切换完成，然后平滑滚动到移动荷载面板
    setTimeout(() => {
      const panel = document.getElementById('details-load-moving');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);

  } else {
    if (isModelParam) {
      if (tc.sweep === 'As' || tc.sweep === 'braceI') openDetails('details-model-brace');
      else if (tc.sweep === 'bc' || tc.sweep === 'hc' || tc.sweep === 'bb' || tc.sweep === 'hb' || tc.sweep === 'r') openDetails('details-model-mat');
      else openDetails('details-model-topo');
    } else if (isLoadParam) {
      if (['tempAll','tempGrad','settleDy','supportRot0'].includes(tc.sweep)) openDetails('details-load-other');
      else if (['H1','H2','H3'].includes(tc.sweep)) openDetails('details-load-horz');
      else openDetails('details-load-vert');
    }
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

  /* 3.6 静态卡片：关闭扫掠条、不播放，只弹 toast 提示观察要点 */
  if(!tc.sweep){
    const bar    = document.getElementById('sweepBar');
    const btnBar = document.getElementById('btn-sweep');
    if(bar)    bar.classList.remove('on');
    if(btnBar) btnBar.classList.remove('on');
    if(tc.toast) showToast(tc.toast, 15000, true);

    /* 新增：如果卡片要求自动播放移动荷载，则延迟 300ms 启动 */
    if(tc.autoPlayMovingLoad && typeof movingLoadPlay === 'function') {
      setTimeout(() => {
        if (!S.movingLoad.playing) movingLoadPlay();
      }, 300);
    }
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
      const param = S.sweep.param;
      const initEl = document.getElementById(param);
      const isProxy = (param === 'settleDy' || param === 'supportRot0');
      if(isProxy && tc.sweepRange && tc.sweepRange[0] != null){
        /* settleDy / supportRot0 没有对应的 DOM input，
           走 sweepSetValue 的代理分支，直接跳到 sweepRange 起点，
           避免 sweepReset() 先设到极值（-100 / -30°）造成启动闪现。 */
        sweepSetValue(param, tc.sweepRange[0]);
        run();
      } else if(initEl && tc.state && tc.state[param] != null){
        sweepSetValue(param, tc.state[param]);
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

  let html = `
    <div style="position: sticky; top: -14px; z-index: 10; background: #0a101c; padding-top: 14px; padding-bottom: 8px; border-bottom: 1px solid rgba(148,163,184,0.08);">
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="text" id="stSearchInput" placeholder="🔍 搜索卡片标题 / 关键词…" style="flex:1; box-sizing:border-box; padding:6px 10px; font-size:12px; font-family:inherit; background:rgba(30,41,59,0.5); border:1px solid transparent; color:#f8fafc; border-radius:6px; outline:none; transition:all 0.2s;" autocomplete="off" onfocus="this.style.borderColor='rgba(56,189,248,0.5)'; this.style.background='rgba(30,41,59,0.8)'" onblur="this.style.borderColor='transparent'; this.style.background='rgba(30,41,59,0.5)'">
        <button id="btnToggleAllST" style="background:transparent; border:1px solid rgba(148,163,184,0.2); color:#94a3b8; border-radius:6px; padding:0 10px; height:30px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:11.5px; font-weight:600; white-space:nowrap; outline:none; transition:all 0.2s;" onmouseover="this.style.color='#38bdf8';this.style.borderColor='rgba(56,189,248,0.4)'" onmouseout="this.style.color='#94a3b8';this.style.borderColor='rgba(148,163,184,0.2)'" title="展开/收起全部">展开全部 ▾</button>
      </div>
    </div>
  `;

  // 按分类分组
  const groups = {};
  for (const caseObj of SELF_TEST_CASES) {
    const ui = SELF_TEST_UI_CONFIG[caseObj.id];
    if (!ui) continue;
    if (!groups[ui.category]) groups[ui.category] = [];
    groups[ui.category].push({ caseObj, ui });
  }

  // 对每个分类下的卡片，强制按 L1 -> L2 -> L3 排序
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

  const iconMap = {
    '📐 杆件与截面行为': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:-2px;"><path d="M21 3H3v18h18V3z"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>',
    '🏢 整体受力与变形': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:-2px;"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>',
    '🌪️ 抗侧力与二阶效应': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:-2px;"><path d="M14 4v10H2"/><path d="M18 8v10H6"/><path d="M2 22l4-4"/><path d="M6 22l4-4"/></svg>',
    '🧱 特殊构件与边界': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:-2px;"><path d="M2 22h20"/><path d="M12 22V2"/><path d="M5 22l7-10 7 10"/><path d="M9 22l3-4 3 4"/></svg>',
    '🔥 综合演练与概念': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:-2px;"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>'
  };

  for (const catName of catOrder) {
    if (!groups[catName]) continue;
    const iconSvg = iconMap[catName] || '';
    const plainText = catName.replace(/[^\u4e00-\u9fa5a-zA-Z]/g, ''); // 去掉 Emoji，只留文字
    
    html += `<details class="stCatGroup">`;
    html += `<summary><span style="display:flex; align-items:center; gap:8px;">${iconSvg}${plainText}</span></summary>`;
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

      const levelTitle = ui.level === 'L1' ? 'L1 基础：认识现象' : (ui.level === 'L2' ? 'L2 进阶：理解规律' : 'L3 高阶：深究本质');

      html += `
        <div class="selfTestCard" data-selftest="${caseObj.id}" data-tags="${tagsStr}">
          <div class="stcTitle" style="display:flex; justify-content:space-between; align-items:center;">
            <span class="stc-title-text">
              <span class="st-num">${globalCnt}</span> 
              <span class="stc-title-main">${ui.title}</span>
            </span>
            <span title="${levelTitle}" style="font-size:9px; padding:1px 4px; border-radius:3px; background:rgba(255,255,255,0.05); color:${lvColor}; border:1px solid ${lvColor}44; font-weight:600; cursor:help;">${ui.level}</span>
          </div>
          <div class="stcDesc">${ui.desc}</div>
          <span class="stcAction">${actionText}</span>
        </div>
      `;
    }
    html += `</div></details>`;
  }

  container.innerHTML = html;

  const searchInput = document.getElementById('stSearchInput');
  
  // ===== 绑定一键展开/收起（合并为动态开关） =====
  const btnToggle = document.getElementById('btnToggleAllST');
  
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
      visibleGroups.forEach(d => d.open = !anyOpen);
      updateToggleText();
    });
  }

  // ===== 绑定搜索框：实时过滤卡片 =====
  if(searchInput){
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
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