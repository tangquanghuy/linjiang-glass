/**
 * 酒馆变量/变量初始化 用的 YAML 子集很窄：两空格缩进的嵌套映射、`- ` 标量列表、
 * 以及 {} / [] / '' / 数字 / false 这几种标量。为几个测试脚本装 js-yaml 不值得，
 * 就地解这一小块。值里可能含冒号（时钟: 08:00、档期: 晚间主档 20:00–23:30），
 * 所以按第一个「冒号+空格」切，不是按最后一个。
 *
 * 原来这段抄在 check-live-room.cjs 里，check-room-heat.cjs 也要用，所以提出来共用。
 */
function parseMiniYaml(text) {
  const scalar = (raw) => {
    const v = String(raw).trim();
    if (v === '{}') return {};
    if (v === '[]') return [];
    if (v === "''" || v === '""') return '';
    if (v === 'null' || v === '~') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return v.replace(/^['"]|['"]$/g, '');
  };
  const lines = text.split(/\r?\n/)
    .filter(l => l.trim() && !/^\s*#/.test(l))
    .map(l => ({ indent: l.match(/^ */)[0].length, body: l.trim() }));

  let i = 0;
  function block(indent) {
    // 列表还是映射，看第一行是不是以 "- " 开头
    if (i < lines.length && lines[i].indent === indent && lines[i].body.startsWith('- ')) {
      const arr = [];
      while (i < lines.length && lines[i].indent === indent && lines[i].body.startsWith('- ')) {
        arr.push(scalar(lines[i].body.slice(2)));
        i += 1;
      }
      return arr;
    }
    const obj = {};
    while (i < lines.length && lines[i].indent === indent) {
      const { body } = lines[i];
      const at = body.indexOf(': ');
      if (at < 0 && body.endsWith(':')) {
        const key = scalar(body.slice(0, -1));
        i += 1;
        obj[key] = (i < lines.length && lines[i].indent > indent) ? block(lines[i].indent) : {};
      } else if (at >= 0) {
        obj[scalar(body.slice(0, at))] = scalar(body.slice(at + 2));
        i += 1;
      } else {
        i += 1;
      }
    }
    return obj;
  }
  return block(0);
}

module.exports = { parseMiniYaml };
