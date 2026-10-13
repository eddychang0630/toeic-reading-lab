import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as engine from '../engine.mjs';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 13, 12).getTime();
const question = (id = 'q1', overrides = {}) => ({
  id, chapter: 'ch1', part: 5, stem: 'Choose a word.',
  options: ['A', 'B', 'C', 'D'], answer: 1, explanation: 'B is correct.',
  passage: '', passageTitle: '', setId: '', ...overrides,
});
const importedRecord = (overrides = {}) => ({
  firstCorrect: false, firstChoice: 0, lastChoice: 1, attempts: 2,
  correctStreak: 1, dueAt: NOW + DAY, lastAt: NOW, totalMs: 4000,
  part: 5, chapter: 'ch1', ...overrides,
});

test('missing or malformed imports become usable empty learning data', () => {
  assert.equal(typeof engine.normalizeState, 'function');
  for (const input of [null, undefined, [], 'bad', 8, { records: [], activities: [], settings: null }]) {
    assert.deepEqual(engine.normalizeState(input), engine.blankState());
  }
});

test('import accepts only known fields and clamps safe setting values', () => {
  assert.equal(typeof engine.normalizeState, 'function');
  const normalized = engine.normalizeState({
    version: 999, extra: '<script>',
    settings: { fontSize: 999, theme: 'dark', dailyGoal: -3, targetScore: 2000, surprise: true },
    learned: ['ch1', 'ch1', null, '__proto__'],
    lastChapter: 'ch7',
  });
  assert.deepEqual(normalized.settings, { fontSize: 28, theme: 'dark', dailyGoal: 1, targetScore: 990 });
  assert.deepEqual(normalized.learned, ['ch1']);
  assert.equal(normalized.version, 1);
  assert.equal(normalized.lastChapter, 'ch7');
  assert.equal('extra' in normalized, false);
  assert.deepEqual(engine.normalizeState({ settings: { theme: 'sepia', fontSize: 'large', dailyGoal: NaN } }).settings,
    { fontSize: 18, theme: 'light', dailyGoal: 10, targetScore: 850 });
});

test('import drops malformed records and filters deleted question and vocabulary IDs', () => {
  assert.equal(typeof engine.normalizeState, 'function');
  const input = {
    records: { q1: importedRecord(), q2: importedRecord({ firstChoice: 4 }), q3: importedRecord({ part: 8 }), removed: importedRecord() },
    bookmarks: ['q1', 'q1', 'removed'], vocabKnown: ['v1', 'v1', 'removed'],
  };
  const normalized = engine.normalizeState(input, ['q1', 'q2', 'q3'], ['v1']);
  assert.deepEqual(Object.keys(normalized.records), ['q1']);
  assert.deepEqual(normalized.bookmarks, ['q1']);
  assert.deepEqual(normalized.vocabKnown, ['v1']);
  assert.deepEqual(engine.normalizeState(input, [], []).records, {});
  assert.deepEqual(engine.normalizeState(input, [], []).bookmarks, []);
});

test('import strips prototype-pollution keys and inherited state', () => {
  assert.equal(typeof engine.normalizeState, 'function');
  const input = JSON.parse('{"__proto__":{"polluted":true},"records":{"__proto__":{},"constructor":{},"prototype":{}},"bookmarks":["__proto__","constructor","prototype"]}');
  const normalized = engine.normalizeState(input);
  assert.deepEqual(normalized.records, {});
  assert.deepEqual(normalized.bookmarks, []);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(engine.normalizeState(Object.create({ learned: ['ch9'] })), engine.blankState());
});

test('import rejects nonfinite record numbers and returns independent nested objects', () => {
  assert.equal(typeof engine.normalizeState, 'function');
  const input = {
    records: { q1: importedRecord({ attempts: 2.9, totalMs: -10, correctStreak: 99 }), q2: importedRecord({ dueAt: Infinity }) },
    settings: { fontSize: 17 }, learned: ['ch1'],
  };
  const before = structuredClone(input);
  const normalized = engine.normalizeState(input);
  assert.equal(normalized.records.q1.attempts, 2);
  assert.equal(normalized.records.q1.totalMs, 0);
  assert.equal(normalized.records.q1.correctStreak, 2);
  assert.equal(normalized.records.q2, undefined);
  normalized.records.q1.lastChoice = 0;
  normalized.settings.fontSize = 28;
  normalized.learned.push('ch2');
  assert.deepEqual(input, before);
});

test('import retains only valid calendar activities and complete safe session summaries', () => {
  assert.equal(typeof engine.normalizeState, 'function');
  const normalized = engine.normalizeState({
    activities: { '2026-10-13': 12.7, '2026-02-30': 4, '2024-02-29': 2, '2026-10-12': -2, nope: 8 },
    sessions: [
      { id: 's1', date: '2026-10-13', count: 10, correct: 20, seconds: 30.8, mode: 'timed', secret: 'strip' },
      { id: 's2', date: '2026-02-30', count: 1, correct: 1, seconds: 3, mode: 'daily' },
      { id: '__proto__', date: '2026-10-13', count: 1, correct: 1, seconds: 3, mode: 'daily' },
    ],
  });
  assert.deepEqual(normalized.activities, { '2026-10-13': 12, '2024-02-29': 2 });
  assert.deepEqual(normalized.sessions, [{ id: 's1', date: '2026-10-13', count: 10, correct: 10, seconds: 30, mode: 'timed' }]);
});

test('date keys use the learner timezone at midnight instead of UTC dates', () => {
  assert.equal(typeof engine.localDateKey, 'function');
  const url = new URL('../engine.mjs', import.meta.url).href;
  const result = execFileSync(process.execPath, ['--input-type=module', '-e',
    `import {localDateKey} from ${JSON.stringify(url)}; console.log(localDateKey(Date.parse('2026-10-12T16:05:00Z')));`],
  { env: { ...process.env, TZ: 'Asia/Taipei' }, encoding: 'utf8' });
  assert.equal(result.trim(), '2026-10-13');
});

test('a wrong first answer remains in first-attempt statistics after a correct retry', () => {
  assert.equal(typeof engine.recordAnswer, 'function');
  const original = engine.blankState();
  const wrong = engine.recordAnswer(original, question(), 0, NOW, 2000);
  assert.equal(wrong.records.q1.firstCorrect, false);
  assert.equal(wrong.records.q1.dueAt, NOW);
  const correct = engine.recordAnswer(wrong, question(), 1, NOW + 1000, 3000);
  assert.deepEqual(correct.records.q1, {
    firstCorrect: false, firstChoice: 0, lastChoice: 1, attempts: 2,
    correctStreak: 1, dueAt: NOW + 1000 + DAY, lastAt: NOW + 1000,
    totalMs: 5000, part: 5, chapter: 'ch1',
  });
  assert.equal(original.records.q1, undefined);
  assert.equal(wrong.records.q1.lastChoice, 0);
  assert.equal(correct.activities[engine.localDateKey(NOW)], 2);
});

test('consecutive correct answers schedule 1, 3, 7, 14 and 30 day reviews with a 30 day ceiling', () => {
  assert.equal(typeof engine.recordAnswer, 'function');
  let state = engine.blankState();
  for (const [index, days] of [1, 3, 7, 14, 30, 30].entries()) {
    const time = NOW + index * 1000;
    state = engine.recordAnswer(state, question(), 1, time);
    assert.equal(state.records.q1.dueAt, time + days * DAY);
    assert.equal(state.records.q1.correctStreak, index + 1);
  }
  assert.equal(state.records.q1.firstCorrect, true);
  state = engine.recordAnswer(state, question(), 3, NOW + 6000);
  assert.equal(state.records.q1.correctStreak, 0);
  assert.equal(state.records.q1.dueAt, NOW + 6000);
  state = engine.recordAnswer(state, question(), 1, NOW + 7000);
  assert.equal(state.records.q1.dueAt, NOW + 7000 + DAY);
  assert.equal(state.records.q1.firstChoice, 1);
});

test('answer recording rejects invalid choices and question metadata before changing data', () => {
  assert.equal(typeof engine.recordAnswer, 'function');
  const state = engine.blankState();
  for (const choice of [-1, 4, 1.5, '1', null, NaN]) {
    assert.throws(() => engine.recordAnswer(state, question(), choice, NOW), RangeError);
  }
  assert.throws(() => engine.recordAnswer(state, question('__proto__'), 1, NOW), TypeError);
  assert.throws(() => engine.recordAnswer(state, question('q1', { answer: 9 }), 1, NOW), TypeError);
  assert.deepEqual(state.records, {});
});

test('answer recording safely recovers corrupt state and ignores invalid elapsed time', () => {
  assert.equal(typeof engine.recordAnswer, 'function');
  const state = engine.recordAnswer({ records: 'bad' }, question('q7', { part: 7, chapter: 'reading' }), 1, NOW, -200);
  assert.equal(state.records.q7.totalMs, 0);
  assert.equal(state.records.q7.part, 7);
  assert.equal(state.lastChapter, 'reading');
  const next = engine.recordAnswer(state, question('q7', { part: 7, chapter: 'reading' }), 1, NOW, Infinity);
  assert.equal(next.records.q7.totalMs, 0);
});

test('summary counts unique first attempts separately from current wrong and due questions', () => {
  assert.equal(typeof engine.summarize, 'function');
  const questions = [question('a'), question('b', { part: 6, chapter: 'ch2' }), question('c', { part: 7, chapter: 'ch3' })];
  let state = engine.recordAnswer(engine.blankState(), questions[0], 0, NOW - DAY);
  state = engine.recordAnswer(state, questions[0], 1, NOW);
  state = engine.recordAnswer(state, questions[1], 1, NOW);
  state = engine.recordAnswer(state, questions[2], 0, NOW);
  const summary = engine.summarize(state, questions, NOW);
  assert.equal(summary.answered, 3);
  assert.equal(summary.firstCorrect, 1);
  assert.equal(summary.accuracy, 33);
  assert.equal(summary.today, 3);
  assert.equal(summary.wrong, 1);
  assert.equal(summary.due, 1);
  assert.deepEqual(summary.byPart, {
    5: { answered: 1, correct: 0, accuracy: 0 },
    6: { answered: 1, correct: 1, accuracy: 100 },
    7: { answered: 1, correct: 0, accuracy: 0 },
  });
  assert.deepEqual(summary.weakChapters, [
    { id: 'ch1', answered: 1, correct: 0, accuracy: 0 },
    { id: 'ch3', answered: 1, correct: 0, accuracy: 0 },
    { id: 'ch2', answered: 1, correct: 1, accuracy: 100 },
  ]);
  assert.equal(engine.summarize(state, questions, NOW + DAY).due, 2);
});

test('summary ignores removed records and avoids NaN for an empty question bank', () => {
  assert.equal(typeof engine.summarize, 'function');
  const state = engine.recordAnswer(engine.blankState(), question(), 1, NOW);
  const summary = engine.summarize(state, [], NOW);
  assert.equal(summary.answered, 0);
  assert.equal(summary.accuracy, 0);
  assert.equal(summary.wrong, 0);
  assert.equal(summary.due, 0);
  assert.deepEqual(summary.weakChapters, []);
  assert.equal(summary.byPart[7].accuracy, 0);
});

test('streak preserves yesterday until today ends and resets after a full missed day', () => {
  assert.equal(typeof engine.summarize, 'function');
  const state = engine.blankState();
  state.activities = { '2026-10-11': 1, '2026-10-12': 4, '2026-10-13': 1 };
  assert.equal(engine.summarize(state, [], NOW).streak, 3);
  delete state.activities['2026-10-13'];
  assert.equal(engine.summarize(state, [], NOW).streak, 2);
  delete state.activities['2026-10-12'];
  assert.equal(engine.summarize(state, [], NOW).streak, 0);
});

test('streak crosses daylight-saving transitions using local calendar days', () => {
  assert.equal(typeof engine.summarize, 'function');
  const url = new URL('../engine.mjs', import.meta.url).href;
  const result = execFileSync(process.execPath, ['--input-type=module', '-e',
    `import {blankState,summarize} from ${JSON.stringify(url)}; const s=blankState(); s.activities={'2026-03-07':1,'2026-03-08':1,'2026-03-09':1}; console.log(summarize(s,[],new Date(2026,2,9,0,15).getTime()).streak);`],
  { env: { ...process.env, TZ: 'America/New_York' }, encoding: 'utf8' });
  assert.equal(result.trim(), '3');
});

test('daily practice starts with unseen questions then prioritizes weaker chapters', () => {
  assert.equal(typeof engine.selectPractice, 'function');
  const bank = [question('a'), question('b', { chapter: 'ch2' }), question('c'), question('d')];
  let state = engine.recordAnswer(engine.blankState(), bank[0], 1, NOW);
  state = engine.recordAnswer(state, bank[1], 0, NOW);
  assert.deepEqual(engine.selectPractice(bank, state, { count: 3, now: NOW }).map(q => q.id), ['c', 'd', 'b']);
});

test('fresh daily practice includes all three Parts before exhausting the grammar bank', () => {
  const bank = [
    ...Array.from({ length: 20 }, (_, i) => question(`g${i}`)),
    ...['p6a', 'p6b', 'p6c', 'p6d'].map(id => question(id, { part: 6, chapter: 'ch14', setId: 'part6-set' })),
    ...['p7a', 'p7b', 'p7c', 'p7d', 'p7e'].map(id => question(id, { part: 7, chapter: 'reading', setId: 'part7-set' })),
  ];
  const selected = engine.selectPractice(bank, engine.blankState(), { count: 10 });
  assert.equal(selected.filter(q => q.part === 5).length, 3);
  assert.deepEqual(selected.filter(q => q.part === 6).map(q => q.id), ['p6a', 'p6b', 'p6c', 'p6d']);
  assert.deepEqual(selected.filter(q => q.part === 7).map(q => q.id), ['p7a', 'p7b', 'p7c', 'p7d', 'p7e']);
  assert.equal(selected.length, 12);
});

test('daily reading distribution prioritizes unseen questions within each Part', () => {
  const bank = [
    question('seen5'), question('new5a'), question('new5b'), question('new5c'),
    question('seen6', { part: 6, chapter: 'ch14', setId: 'old6' }),
    question('new6', { part: 6, chapter: 'ch14', setId: 'new6' }),
    question('seen7', { part: 7, chapter: 'reading', setId: 'old7' }),
    question('new7', { part: 7, chapter: 'reading', setId: 'new7' }),
  ];
  let state = engine.blankState();
  for (const q of bank.filter(q => q.id.startsWith('seen'))) state = engine.recordAnswer(state, q, 0, NOW);
  const selected = engine.selectPractice(bank, state, { count: 3, now: NOW });
  assert.deepEqual(selected.map(q => q.id), ['new5a', 'new6', 'new7']);
});

test('daily practice backfills an exhausted Part quota from the remaining questions', () => {
  const bank = [question('only5'), ...Array.from({ length: 15 }, (_, i) => question(`reading${i}`, { part: 7, chapter: 'reading' }))];
  const selected = engine.selectPractice(bank, engine.blankState(), { count: 10 });
  assert.equal(selected.length, 10);
  assert.equal(selected.filter(q => q.part === 5).length, 1);
  assert.equal(selected.filter(q => q.part === 7).length, 9);
  assert.equal(new Set(selected.map(q => q.id)).size, 10);
});

test('explicit daily chapter and Part filters retain their existing selection behavior', () => {
  const bank = [question('g1'), question('g2'), question('p6', { part: 6, chapter: 'ch14', setId: 'part6' }), question('p7', { part: 7, chapter: 'reading', setId: 'part7' })];
  assert.deepEqual(engine.selectPractice(bank, engine.blankState(), { part: 5, count: 10 }).map(q => q.id), ['g1', 'g2']);
  assert.deepEqual(engine.selectPractice(bank, engine.blankState(), { chapter: 'ch1', count: 10 }).map(q => q.id), ['g1', 'g2']);
});

test('chapter and part filters limit eligible questions without changing the bank', () => {
  assert.equal(typeof engine.selectPractice, 'function');
  const bank = [question('a'), question('b', { chapter: 'ch2' }), question('c', { part: 6 }), question('d', { part: 7 })];
  const snapshot = structuredClone(bank);
  assert.deepEqual(engine.selectPractice(bank, engine.blankState(), { mode: 'chapter', chapter: 'ch1', part: 5, count: 10 }).map(q => q.id), ['a']);
  assert.deepEqual(engine.selectPractice(bank, engine.blankState(), { mode: 'chapter', chapter: 'absent', count: 10 }), []);
  assert.deepEqual(bank, snapshot);
});

test('wrong mode uses the latest answer while review mode includes corrected mistakes only when due', () => {
  assert.equal(typeof engine.selectPractice, 'function');
  const bank = [question('a'), question('b'), question('c'), question('d')];
  let state = engine.recordAnswer(engine.blankState(), bank[0], 0, NOW);
  state = engine.recordAnswer(state, bank[0], 1, NOW);
  state = engine.recordAnswer(state, bank[1], 0, NOW);
  state = engine.recordAnswer(state, bank[2], 1, NOW - 2 * DAY);
  state = engine.recordAnswer(state, bank[3], 0, NOW - 2 * DAY);
  state = engine.recordAnswer(state, bank[3], 1, NOW - DAY);
  assert.deepEqual(engine.selectPractice(bank, state, { mode: 'wrong', now: NOW }).map(q => q.id), ['b']);
  assert.deepEqual(new Set(engine.selectPractice(bank, state, { mode: 'review', now: NOW }).map(q => q.id)), new Set(['b', 'd']));
  assert.deepEqual(new Set(engine.selectPractice(bank, state, { mode: 'review', now: NOW + DAY }).map(q => q.id)), new Set(['a', 'b', 'd']));
});

test('bookmarked practice selects exact saved IDs and ignores removed bookmarks', () => {
  assert.equal(typeof engine.selectPractice, 'function');
  const bank = [question('a'), question('b'), question('c')];
  const state = engine.blankState();
  state.bookmarks = ['c', 'removed'];
  assert.deepEqual(engine.selectPractice(bank, state, { mode: 'bookmarked' }).map(q => q.id), ['c']);
});

test('reading sets stay complete when a selected question is wrong or bookmarked', () => {
  assert.equal(typeof engine.selectPractice, 'function');
  const bank = [question('a'), ...['r1', 'r2', 'r3'].map(id => question(id, { part: 7, chapter: 'reading', setId: 'passage1' }))];
  const state = engine.recordAnswer(engine.blankState(), bank[2], 0, NOW);
  state.bookmarks = ['r2'];
  assert.deepEqual(engine.selectPractice(bank, state, { mode: 'wrong', count: 1, now: NOW }).map(q => q.id), ['r1', 'r2', 'r3']);
  assert.deepEqual(engine.selectPractice(bank, state, { mode: 'bookmarked', count: 1 }).map(q => q.id), ['r1', 'r2', 'r3']);
  assert.deepEqual(engine.selectPractice(bank, state, { count: 2 }).map(q => q.id), ['a', 'r1', 'r2', 'r3']);
});

test('mixed practice returns a nonmutating unique sample and respects part filters', () => {
  assert.equal(typeof engine.selectPractice, 'function');
  const bank = Array.from({ length: 20 }, (_, i) => question(`q${i}`, { part: i < 10 ? 5 : 7 }));
  const state = engine.blankState();
  const originalBank = structuredClone(bank);
  const originalState = structuredClone(state);
  const selected = engine.selectPractice(bank, state, { mode: 'mixed', part: 7, count: 4 });
  assert.equal(selected.length, 4);
  assert.equal(new Set(selected.map(q => q.id)).size, 4);
  assert.equal(selected.every(q => q.part === 7), true);
  assert.deepEqual(bank, originalBank);
  assert.deepEqual(state, originalState);
});

test('empty banks, invalid counts and malformed questions produce safe empty selections', () => {
  assert.equal(typeof engine.selectPractice, 'function');
  for (const count of [0, -1, NaN, Infinity]) {
    assert.deepEqual(engine.selectPractice([question()], engine.blankState(), { count }), []);
  }
  assert.deepEqual(engine.selectPractice([], null), []);
  assert.deepEqual(engine.selectPractice(null, null), []);
  assert.deepEqual(engine.selectPractice([null, question('__proto__'), question('bad', { answer: 9 })], null), []);
  assert.deepEqual(engine.selectPractice([question(), question()], null).map(q => q.id), ['q1']);
});

test('fresh state can be independently edited without sharing arrays or maps', async () => {
  await assert.doesNotReject(async () => {
    const { blankState } = await import('../engine.mjs');
    const first = blankState();
    const second = blankState();
    first.bookmarks.push('q1');
    first.settings.fontSize = 22;
    first.activities['2026-10-13'] = 1;
    assert.equal(second.version, 1);
    assert.deepEqual(second.settings, { fontSize: 18, theme: 'light', dailyGoal: 10, targetScore: 850 });
    assert.deepEqual(second.records, {});
    assert.deepEqual(second.activities, {});
    assert.deepEqual(second.bookmarks, []);
    assert.deepEqual(second.learned, []);
    assert.deepEqual(second.vocabKnown, []);
    assert.deepEqual(second.sessions, []);
    assert.equal(second.lastChapter, 'ch1');
  });
});
