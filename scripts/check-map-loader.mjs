/**
 * 《地图加载 - 临江市》离线自检。
 * 模拟酒馆的 EJS 环境（getMessageVar / getWorldInfo / lodash），跑几组位置看输出。
 * 用法：node scripts/check-map-loader.mjs [节点名或区域字符串]
 */
import fs from 'node:fs';
import ejs from 'ejs';
import _ from 'lodash';

const loader = fs.readFileSync('世界书/地图加载', 'utf8');
const staticData = fs.readFileSync('世界书/地图静态资料', 'utf8');

/** 和 酒馆变量/变量初始化 保持一致，改那份就改这份 */
const 基础变量 = {
  世界信息: {
    年历: '2026年4月1日',
    时间: { 时钟: '08:00', 时段: '朝' },
    位置: { 区域: '鼓岭区 · 梧桐里花园洋房', 场所: '客厅', 私密度: 4 }
  },
  玩家信息: {
    体力: 100,
    金钱: 20000,
    同行: null,
    工作: { 职业: '便利店店员', 地点: '明湖区 · 罗森24h便利店', 日收入: 215, 今日已上班: false },
    居住地: '鼓岭区 · 梧桐里花园洋房',
    房产: {}
  },
  系统配置: {}
};

async function render(变量) {
  const stat = _.merge(_.cloneDeep(基础变量), 变量 || {});
  const ctx = {
    _,
    getMessageVar: (key, opt) => (key === 'stat_data' ? stat : (opt && opt.defaults)),
    getWorldInfo: async (name) => (String(name).startsWith('地图静态资料') ? staticData : ''),
    console
  };
  return ejs.render(loader, ctx, { async: true, rmWhitespace: false });
}

const 用例 = [
  ['开局：梧桐里，工作在明湖便利店', {}],
  ['山里：青屏山古木栈道，深夜', {
    世界信息: { 时间: { 时钟: '23:40', 时段: '深夜' }, 位置: { 区域: '青屏山风景区 · 青屏山古木栈道', 场所: '观景崖边', 私密度: 4 } },
    玩家信息: { 体力: 35 }
  }],
  ['江北：浦江老街自建房', {
    世界信息: { 位置: { 区域: '雨石与浦江区 · 浦江老街自建房', 场所: '院子', 私密度: 3 } },
    玩家信息: { 居住地: '雨石与浦江区 · 浦江老街自建房', 工作: { 职业: '研创园行政助理', 地点: '雨石与浦江区 · 浦江研创园', 日收入: 280, 今日已上班: false } }
  }],
  // 节点重构V3 之前的旧名字：正文/存档里可能还留着，加载器必须能兜回去
  ['遗留旧名（云庭公寓 / 梧桐里，V3 已改名）', {
    世界信息: { 位置: { 区域: '鼓岭区 · 云庭公寓', 场所: '客厅', 私密度: 5 } },
    玩家信息: { 居住地: '鼓岭区 · 梧桐里' }
  }],
  ['换房档：住进明湖澜庭，跨区上班', {
    世界信息: { 位置: { 区域: '明湖区 · 明湖澜庭', 场所: '客厅', 私密度: 4 } },
    玩家信息: {
      金钱: 180000,
      居住地: '明湖区 · 明湖澜庭',
      工作: { 职业: '录音棚助理', 地点: '西洲区 · 极光专业声学工坊', 日收入: 245, 今日已上班: false }
    }
  }],
  ['完全对不上的区域名', {
    世界信息: { 位置: { 区域: '临江市 · 某个不存在的地方', 场所: '街边', 私密度: 2 } }
  }],
  ['无业 + 体力见底', {
    玩家信息: { 体力: 12, 工作: { 职业: null, 地点: null, 日收入: 0, 今日已上班: false } }
  }],
  // 只开朝昼的节点，在夜里去：验证时段列表带分隔符，且闭门警告能触发
  ['闭门：夜里去只开朝昼的市民中心', {
    世界信息: {
      时间: { 时钟: '21:10', 时段: '夜' },
      位置: { 区域: '明湖区 · 明湖市民中心', 场所: '大厅', 私密度: 2 }
    }
  }],
  ['玩家自建节点：海风旧仓库', {
    世界信息: { 位置: { 区域: '西洲区 · 海风旧仓库', 场所: '二层办公室', 私密度: 4 } },
    系统配置: { 地图: { 版本: 1, 自建节点: {
      usr_test: {
        名称: '海风旧仓库', 别名: ['旧仓库'], 区域: '西洲区', 底板: 'xizhou', 区内坐标: [0.4, 0.6],
        锚点: 'xz_warehouse', 锚点名称: '西洲仓储超市', 接驳距离: 0.35, 类型: 'living', 私密度: 4,
        开放时段: ['朝', '昼', '暮', '夜', '深夜'], 功能: { 可约会: true, 可采集: false, 可工作: false, 有商店: false },
        简介: '被玩家整理过的临江旧仓库。', 看点: '可以临时休息和存放物品。', 特殊: ['卷帘门可从内部反锁']
      }
    } } }
  }],
  ['开关关掉：应当一个字都不输出', { 系统配置: { 地图加载: '关' } }]
];

const only = process.argv[2];
let 失败 = 0;
const 报告 = [];
for (const [标题, 变量] of 用例) {
  if (only && !标题.includes(only)) continue;
  报告.push('='.repeat(72), '▌ ' + 标题, '='.repeat(72));
  try {
    const out = await render(变量);
    const 正文 = out.replace(/\n{3,}/g, '\n\n').trim();
    报告.push(正文, '');
    console.log(`OK  ${标题}  —  ${正文.split('\n').length} 行 / ${正文.length} 字`);
  } catch (e) {
    失败++;
    报告.push('!! 渲染失败: ' + (e && e.stack ? e.stack : e), '');
    console.log(`FAIL ${标题}: ${e && e.message}`);
  }
}
// 静态资料条目缺失时不能炸，也不能默默输出空壳
报告.push('='.repeat(72), '▌ 静态资料条目缺失', '='.repeat(72));
try {
  const stat = _.cloneDeep(基础变量);
  const out = await ejs.render(loader, {
    _,
    getMessageVar: () => stat,
    getWorldInfo: async () => '',
    console: { log: () => {} }
  }, { async: true });
  报告.push(out.trim(), '');
  const ok = out.includes('地图静态资料未加载');
  console.log(`${ok ? 'OK  ' : 'FAIL'} 静态资料条目缺失时给出明确提示`);
  if (!ok) 失败++;
} catch (e) {
  失败++;
  console.log('FAIL 静态资料缺失时抛异常: ' + (e && e.message));
}

fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/map-loader-check.txt', 报告.join('\n'), 'utf8');
console.log('\n完整输出 → artifacts/map-loader-check.txt');
console.log('\n' + (失败 ? `!! ${失败} 个用例渲染失败` : '全部用例渲染通过'));
process.exit(失败 ? 1 : 0);
