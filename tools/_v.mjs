import fs from "node:fs";
const lines = fs.readFileSync("phone/小手机脚本.js", "utf8").split("\r\n");
// 找 CSS 区间
const start = lines.findIndex(l => l.includes("<style id=\"mobile-phone-styles\">")) + 1;
const end = lines.findIndex(l => l.trim() === "</style>");
let d = 0;
const report = [];
for (let i = start; i < end; i++) {
  const before = d;
  for (const ch of lines[i]) { if (ch === "{") d++; else if (ch === "}") d--; }
  if (/^\s*\.(custom-confirm|confirm-)/.test(lines[i]) && before !== 0) report.push(`第 ${i + 1} 行仍在 @media 内: ${lines[i].trim()}`);
}
console.log(report.length ? report.join("\n") : "  OK：所有 .confirm-* / .custom-confirm-* 规则都在顶层");
console.log("  CSS 区间括号收支:", d === 0 ? "平衡" : "不平衡(" + d + ")");
const names = {};
for (const l of lines) { const m = l.match(/@keyframes\s+([\w-]+)/); if (m) names[m[1]] = (names[m[1]] || 0) + 1; }
const dup = Object.entries(names).filter(([, n]) => n > 1);
console.log("  @keyframes 重名:", dup.length ? dup.map(([k, n]) => k + "x" + n).join(", ") : "无");
console.log("  @keyframes 总数:", Object.keys(names).length);
