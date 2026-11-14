// tools/check-syntax.js — 零依赖提交前自检
// 用法：node tools/check-syntax.js
// 1) 对 js/ 与 tools/ 下全部 .js 跑 node --check
// 2) index.html 的 <div> 开闭计数平衡
// 3) index.html scriptFiles 引用的 js 文件存在性
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let fail = 0;

// 1) node --check 批量校验
for (const dir of ['js', 'tools']) {
  const dirPath = path.join(root, dir);
  if (!fs.existsSync(dirPath)) continue;
  for (const f of fs.readdirSync(dirPath)) {
    if (!f.endsWith('.js')) continue;
    const p = path.join(dirPath, f);
    try {
      execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' });
    } catch (e) {
      console.error(`[SYNTAX FAIL] ${dir}/${f}`);
      if (e.stderr) console.error(String(e.stderr));
      fail = 1;
    }
  }
}

// 2) index.html 的 div 平衡（朴素计数，防手写标签不闭合）
const htmlPath = path.join(root, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const openDiv = (html.match(/<div\b/gi) || []).length;
const closeDiv = (html.match(/<\/div>/gi) || []).length;
if (openDiv !== closeDiv) {
  console.error(`[HTML] <div> 不平衡: open=${openDiv} close=${closeDiv}`);
  fail = 1;
}

// 3) scriptFiles 引用的 js 文件存在性
const m = html.match(/scriptFiles\s*=\s*\[([\s\S]*?)\]/);
if (!m) {
  console.error('[HTML] 未找到 scriptFiles 数组');
  fail = 1;
} else {
  for (const mm of m[1].matchAll(/'((?:js|tools)\/[^']+)'/g)) {
    if (!fs.existsSync(path.join(root, mm[1]))) {
      console.error(`[HTML] scriptFiles 引用缺失: ${mm[1]}`);
      fail = 1;
    }
  }
}

console.log(fail ? '自检失败' : '自检通过');
process.exit(fail);
