import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schemaPath = new URL('../\u9152\u9986\u53d8\u91cf/mvuzod.js', import.meta.url);
const schema = readFileSync(schemaPath, 'utf8');
const stepsMatch = schema.match(/const DEV_TIER_STEPS = (\[[^;]+\]);/);
assert.ok(stepsMatch, 'MVU schema is missing DEV_TIER_STEPS');
const steps = JSON.parse(stepsMatch[1]);
assert.deepEqual(steps, [40, 80, 130, 190, 260]);
assert.match(schema, /const devProposalCeiling = tier =>[\s\S]*?return need \|\| 0;/,
  'Schema must preserve the exact promotion threshold for the auxiliary pass');
assert.doesNotMatch(schema, /devProposalCeiling[\s\S]{0,180}need\s*-\s*1/,
  'Schema proposal ceiling must not clip tier 0 back to 39');

await import(`../public/shell/aux-shell.js?development-check=${Date.now()}`);
const aux = globalThis.LinjiangAux;
assert.equal(typeof aux?.handleVariableUpdate, 'function', 'auxiliary shell did not expose handleVariableUpdate');

const K = {
  tier: '\u6863\u4f4d', progress: '\u8fdb\u5ea6', update: '\u53ef\u66f4\u65b0', note: '\u8bc4\u8bed',
  world: '\u4e16\u754c\u4fe1\u606f', calendar: '\u5e74\u5386', time: '\u65f6\u95f4', clock: '\u65f6\u949f',
  period: '\u65f6\u6bb5', noon: '\u663c', location: '\u4f4d\u7f6e', player: '\u73a9\u5bb6\u4fe1\u606f',
  objects: '\u5bf9\u8c61\u4fe1\u606f', development: '\u5f00\u53d1\u5ea6', oral: '\u53e3\u8154',
  chest: '\u80f8', vagina: '\u5c0f\u7a74', anus: '\u809b\u95e8', physiology: '\u751f\u7406',
  status: '\u5f02\u5e38\u72b6\u6001', stream: '\u76f4\u64ad', config: '\u7cfb\u7edf\u914d\u7f6e',
  progressControl: '\u8fdb\u5c55\u63a7\u5236', controlObjects: '\u5bf9\u8c61', daily: '\u5f53\u65e5\u7d2f\u8ba1\u8fdb\u5ea6',
  lastUpdate: '\u4e0a\u6b21\u66f4\u65b0\u65f6\u95f4', lastTierDate: '\u4e0a\u6b21\u5347\u6863\u65e5\u671f',
};
const DATE = '2026\u5e744\u67082\u65e5';
const part = (tier, progress) => ({ [K.tier]: tier, [K.progress]: progress, [K.update]: true, [K.note]: '' });
const development = (tier, progress) => ({
  [K.oral]: part(tier, progress), [K.chest]: part(0, 0),
  [K.vagina]: part(0, 0), [K.anus]: part(0, 0),
});
const snapshot = (tier, progress, control = null) => ({ stat_data: {
  [K.world]: { [K.calendar]: DATE, [K.time]: { [K.clock]: '12:00', [K.period]: K.noon }, [K.location]: {} },
  [K.player]: {},
  [K.objects]: { TEST: { [K.development]: development(tier, progress), [K.physiology]: { [K.status]: {} }, [K.stream]: {} } },
  [K.config]: control ? { [K.progressControl]: { [K.controlObjects]: { TEST: { [K.development]: { [K.oral]: control } } } } } : {},
} });
const schemaProposal = (tier, requested) => Math.min(Math.max(0, Math.floor(requested)), steps[tier] || 0);
const run = ({ tier, oldProgress, requested, control = null }) => {
  const before = snapshot(tier, oldProgress, control);
  const after = structuredClone(before);
  after.stat_data[K.objects].TEST[K.development][K.oral][K.progress] = schemaProposal(tier, requested);
  aux.handleVariableUpdate(after, before);
  return after.stat_data[K.objects].TEST[K.development][K.oral];
};

assert.equal(schemaProposal(0, 500), 40, 'tier 0 proposal should preserve 40, not collapse to 39');
for (let tier = 0; tier < steps.length; tier += 1) {
  const need = steps[tier];
  const promoted = run({ tier, oldProgress: need - 1, requested: need });
  assert.deepEqual(
    Object.fromEntries(Object.entries(promoted).filter(([key]) => [K.tier, K.progress].includes(key))),
    { [K.tier]: tier + 1, [K.progress]: 0 },
    `tier ${tier} must promote when ${need - 1} reaches ${need}`,
  );
}
assert.deepEqual(
  Object.fromEntries(Object.entries(run({ tier: 0, oldProgress: 20, requested: 500 })).filter(([key]) => [K.tier, K.progress].includes(key))),
  { [K.tier]: 1, [K.progress]: 0 },
  'large model proposals must still obey the 20-point turn cap and promote only one tier',
);
assert.equal(run({ tier: 0, oldProgress: 0, requested: 20 })[K.progress], 20,
  'ordinary progress below the threshold must remain unchanged');

console.log('development progress regression: every threshold promotes (including 39 -> 40) OK');

