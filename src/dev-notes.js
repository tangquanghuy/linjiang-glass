import guideline from './dev-note-guideline.txt?raw';
import devMatrix from './dev-matrix.json';
import { characterDetails, DEV_PARTS } from './data.js';
import {
  requestDevelopmentNotesGeneration,
  requestDevelopmentNotesRestore,
} from './bridge.js';

const PART_KEY = Object.fromEntries(DEV_PARTS.map(([key, label]) => [key, label]));
const busy = new Set();

function detailOf(name) {
  const detail = characterDetails[name];
  if (!detail) throw new Error(`找不到目标对象：${name}`);
  return detail;
}

function tiersOf(name) {
  const detail = detailOf(name);
  return Object.fromEntries(DEV_PARTS.map(([key, label]) => [label, Number(detail.development[key]) || 0]));
}

function defaultsOf(name) {
  const detail = detailOf(name);
  const notes = {};
  DEV_PARTS.forEach(([key, label]) => {
    const tier = Number(detail.development[key]) || 0;
    const note = devMatrix[name]?.[key]?.[tier];
    if (note) notes[label] = note;
  });
  if (Object.keys(notes).length !== DEV_PARTS.length) throw new Error(`${name}没有完整的默认评语矩阵`);
  return notes;
}

function promptOf(name, tiers) {
  const tierText = Object.entries(tiers).map(([part, tier]) => `${part}：开发度${tier}`).join('\n');
  return `（以下是独立的身体部位开发度评语生成任务。暂停续写剧情，只返回指定格式。）

【目标对象姓名／绿灯世界书扫描关键词】${name}
【目标对象】${name}
请务必读取并遵循当前预设，以及由关键词“${name}”激活的目标对象世界书。所有评语只能写${name}，不得套用规范范例中的人物设定。

【当前开发档位】
${tierText}

【任务】
分别重写${name}当前档位的口腔、胸、小穴、肛门四条开发度评语。每条必须对应上方当前档位，并结合${name}的身份、性格、职业、直播人设和日常习惯。不要改变档位，不要续写剧情，不要解释创作过程。

【输出格式】
只输出以下标签和严格JSON。四个键必须齐全，值必须是字符串，不得附加其他字段或Markdown代码块。
<development_notes>
{
  "口腔": "80至180字评语",
  "胸": "80至180字评语",
  "小穴": "80至180字评语",
  "肛门": "80至180字评语"
}
</development_notes>

【完整写作指导规范】
${guideline}`;
}

function applyLocal(name, notes) {
  const detail = detailOf(name);
  detail.developmentNotes ||= {};
  DEV_PARTS.forEach(([key, label]) => {
    if (typeof notes?.[label] === 'string' && notes[label].trim()) {
      detail.developmentNotes[key] = notes[label].trim();
    }
  });
  document.querySelectorAll(`[data-dev-note-name="${name}"]`).forEach((box) => {
    const key = box.dataset.devNotePart;
    const label = PART_KEY[key];
    const note = notes?.[label];
    if (!note) return;
    const p = box.querySelector('p') || box.appendChild(document.createElement('p'));
    p.classList.remove('is-muted');
    p.textContent = note;
  });
  dispatchEvent(new CustomEvent('linjiang:development-notes', { detail: { name, notes } }));
}

function setBusy(name, value) {
  if (value) busy.add(name); else busy.delete(name);
  document.querySelectorAll(`[data-dev-notes-name="${name}"]`).forEach((button) => {
    button.disabled = value;
    if (value) button.dataset.busy = 'true'; else delete button.dataset.busy;
  });
}

export function developmentNotesBusy(name) {
  return busy.has(name);
}

export async function regenerateDevelopmentNotes(name) {
  if (busy.has(name)) return null;
  setBusy(name, true);
  try {
    const tiers = tiersOf(name);
    const result = await requestDevelopmentNotesGeneration({
      name,
      tiers,
      prompt: promptOf(name, tiers),
    });
    const notes = result?.notes || result;
    applyLocal(name, notes);
    return notes;
  } finally {
    setBusy(name, false);
  }
}

export async function restoreDefaultDevelopmentNotes(name) {
  if (busy.has(name)) return null;
  setBusy(name, true);
  try {
    const notes = defaultsOf(name);
    const result = await requestDevelopmentNotesRestore({ name, notes });
    const saved = result?.notes || notes;
    applyLocal(name, saved);
    return saved;
  } finally {
    setBusy(name, false);
  }
}
export async function handleDevelopmentNotesButton(button) {
  const name = button?.dataset?.devNotesName;
  if (!name || busy.has(name)) return;
  const action = button.dataset.devNotesAction;
  if (action === 'restore' && !confirm(`恢复${name}当前档位的默认评语？`)) return;
  const original = button.textContent;
  button.textContent = action === 'restore' ? '恢复中…' : '生成中…';
  try {
    if (action === 'restore') await restoreDefaultDevelopmentNotes(name);
    else await regenerateDevelopmentNotes(name);
    button.textContent = action === 'restore' ? '已恢复' : '已刷新';
  } catch (error) {
    console.error('[开发评语]', error);
    button.textContent = '操作失败';
    alert(error?.message || '部位开发评语操作失败');
  } finally {
    setTimeout(() => { button.textContent = original; }, 1200);
  }
}
