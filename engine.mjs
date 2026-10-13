/** Create independent browser-local learning data. */
export function blankState() {
  return {
    version: 1,
    settings: { fontSize: 18, theme: 'light', dailyGoal: 10, targetScore: 850 },
    records: {},
    activities: {},
    learned: [],
    bookmarks: [],
    vocabKnown: [],
    lastChapter: 'ch1',
    sessions: [],
  };
}

const MAX_COUNT = 1_000_000;
const MAX_TIME = 8_640_000_000_000_000;
const BLOCKED_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const MODES = new Set(['daily', 'mixed', 'chapter', 'wrong', 'review', 'bookmarked', 'timed']);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const isId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value)
  && !BLOCKED_IDS.has(value);
const isChoice = value => Number.isInteger(value) && value >= 0 && value <= 3;
const integer = (value, fallback, min = 0, max = MAX_COUNT) => Number.isFinite(value)
  ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;

function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function idList(value, allowed) {
  return Array.isArray(value)
    ? [...new Set(value.filter(id => isId(id) && (!allowed || allowed.has(id))))] : [];
}

function normalizeRecord(value) {
  if (!isObject(value) || typeof value.firstCorrect !== 'boolean'
    || !isChoice(value.firstChoice) || !isChoice(value.lastChoice)
    || ![5, 6, 7].includes(value.part) || !isId(value.chapter)
    || !['attempts', 'correctStreak', 'dueAt', 'lastAt', 'totalMs'].every(key => Number.isFinite(value[key]))
    || value.attempts < 1) return null;
  const attempts = integer(value.attempts, 1, 1);
  return {
    firstCorrect: value.firstCorrect,
    firstChoice: value.firstChoice,
    lastChoice: value.lastChoice,
    attempts,
    correctStreak: integer(value.correctStreak, 0, 0, attempts),
    dueAt: integer(value.dueAt, 0, 0, MAX_TIME),
    lastAt: integer(value.lastAt, 0, 0, MAX_TIME),
    totalMs: integer(value.totalMs, 0, 0, Number.MAX_SAFE_INTEGER),
    part: value.part,
    chapter: value.chapter,
  };
}

/** Validate imported JSON and construct only the supported, independent fields. */
export function normalizeState(input, questionIds, vocabularyIds) {
  const state = blankState();
  if (!isObject(input)) return state;
  const allowedQuestions = Array.isArray(questionIds) ? new Set(questionIds.filter(isId)) : null;
  const allowedVocabulary = Array.isArray(vocabularyIds) ? new Set(vocabularyIds.filter(isId)) : null;
  if (isObject(input.settings)) {
    state.settings = {
      fontSize: integer(input.settings.fontSize, 18, 16, 28),
      theme: input.settings.theme === 'dark' ? 'dark' : 'light',
      dailyGoal: integer(input.settings.dailyGoal, 10, 1, 100),
      targetScore: integer(input.settings.targetScore, 850, 10, 990),
    };
  }
  if (isObject(input.records)) {
    for (const [id, value] of Object.entries(input.records)) {
      if (!isId(id) || (allowedQuestions && !allowedQuestions.has(id))) continue;
      const record = normalizeRecord(value);
      if (record) state.records[id] = record;
    }
  }
  if (isObject(input.activities)) {
    for (const [date, count] of Object.entries(input.activities)) {
      if (isDateKey(date) && Number.isFinite(count) && count >= 1) state.activities[date] = integer(count, 0);
    }
  }
  state.learned = idList(input.learned);
  state.bookmarks = idList(input.bookmarks, allowedQuestions);
  state.vocabKnown = idList(input.vocabKnown, allowedVocabulary);
  state.lastChapter = isId(input.lastChapter) ? input.lastChapter : 'ch1';
  if (Array.isArray(input.sessions)) {
    for (const item of input.sessions) {
      if (!isObject(item) || !isId(item.id) || !isDateKey(item.date) || !MODES.has(item.mode)
        || !['count', 'correct', 'seconds'].every(key => Number.isFinite(item[key]))) continue;
      const count = integer(item.count, 0);
      state.sessions.push({
        id: item.id, date: item.date, count,
        correct: integer(item.correct, 0, 0, count),
        seconds: integer(item.seconds, 0, 0, Number.MAX_SAFE_INTEGER), mode: item.mode,
      });
    }
  }
  return state;
}

/** Calendar date in the device's timezone, including after local midnight. */
export function localDateKey(timestamp = Date.now()) {
  const date = new Date(Number.isFinite(timestamp) && Math.abs(timestamp) <= MAX_TIME ? timestamp : Date.now());
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const DAY = 86_400_000;
const REVIEW_DAYS = [1, 3, 7, 14, 30];
const isQuestion = question => isObject(question) && isId(question.id) && isId(question.chapter)
  && [5, 6, 7].includes(question.part) && isChoice(question.answer);
const safeTime = now => integer(now, Date.now(), 0, MAX_TIME);
const percentage = (correct, answered) => answered ? Math.round(correct * 100 / answered) : 0;
const isWrong = (record, question) => Boolean(record && record.lastChoice !== question.answer);
const isDue = (record, question, now) => Boolean(record && ((!record.firstCorrect && record.dueAt <= now) || isWrong(record, question)));

function questionBank(questions) {
  const seen = new Set();
  return Array.isArray(questions) ? questions.filter(question => {
    if (!isQuestion(question) || seen.has(question.id)) return false;
    seen.add(question.id);
    return true;
  }) : [];
}

/** Record an attempt without changing the first attempt or the caller's state. */
export function recordAnswer(state, question, choice, now = Date.now(), elapsedMs = 0) {
  if (!isChoice(choice)) throw new RangeError('Answer choice must be an integer from 0 to 3.');
  if (!isQuestion(question)) throw new TypeError('Question metadata is invalid.');
  const next = normalizeState(state);
  const previous = next.records[question.id];
  const correct = choice === question.answer;
  const time = safeTime(now);
  const attempts = Math.min(MAX_COUNT, (previous?.attempts || 0) + 1);
  const correctStreak = correct ? Math.min(attempts, (previous?.correctStreak || 0) + 1) : 0;
  const delay = correct ? REVIEW_DAYS[Math.min(correctStreak - 1, REVIEW_DAYS.length - 1)] * DAY : 0;
  next.records[question.id] = {
    firstCorrect: previous ? previous.firstCorrect : correct,
    firstChoice: previous ? previous.firstChoice : choice,
    lastChoice: choice,
    attempts,
    correctStreak,
    dueAt: Math.min(MAX_TIME, time + delay),
    lastAt: time,
    totalMs: Math.min(Number.MAX_SAFE_INTEGER, (previous?.totalMs || 0) + integer(elapsedMs, 0, 0, Number.MAX_SAFE_INTEGER)),
    part: question.part,
    chapter: question.chapter,
  };
  const date = localDateKey(time);
  next.activities[date] = Math.min(MAX_COUNT, (next.activities[date] || 0) + 1);
  next.lastChapter = question.chapter;
  return next;
}

function currentStreak(activities, now) {
  const day = new Date(now);
  // Noon and setDate preserve consecutive calendar days through DST changes.
  day.setHours(12, 0, 0, 0);
  if (!activities[localDateKey(day.getTime())]) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (activities[localDateKey(day.getTime())]) {
    streak += 1;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

/** First-attempt performance and current review workload, with local-day activity. */
export function summarize(state, questions, now = Date.now()) {
  const data = normalizeState(state);
  const bank = questionBank(questions);
  const time = safeTime(now);
  const result = {
    answered: 0, firstCorrect: 0, accuracy: 0,
    today: data.activities[localDateKey(time)] || 0,
    streak: currentStreak(data.activities, time), due: 0, wrong: 0,
    byPart: {
      5: { answered: 0, correct: 0, accuracy: 0 },
      6: { answered: 0, correct: 0, accuracy: 0 },
      7: { answered: 0, correct: 0, accuracy: 0 },
    },
    weakChapters: [],
  };
  const chapters = new Map();
  for (const question of bank) {
    const record = data.records[question.id];
    if (!record) continue;
    result.answered += 1;
    result.firstCorrect += Number(record.firstCorrect);
    result.wrong += Number(isWrong(record, question));
    result.due += Number(isDue(record, question, time));
    const part = result.byPart[question.part];
    part.answered += 1;
    part.correct += Number(record.firstCorrect);
    if (!chapters.has(question.chapter)) chapters.set(question.chapter, { id: question.chapter, answered: 0, correct: 0, accuracy: 0 });
    const chapter = chapters.get(question.chapter);
    chapter.answered += 1;
    chapter.correct += Number(record.firstCorrect);
  }
  result.accuracy = percentage(result.firstCorrect, result.answered);
  for (const part of Object.values(result.byPart)) part.accuracy = percentage(part.correct, part.answered);
  result.weakChapters = [...chapters.values()].map(chapter => ({ ...chapter, accuracy: percentage(chapter.correct, chapter.answered) }))
    .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered || a.id.localeCompare(b.id));
  return result;
}

/** Select practice seeds, expanding every selected reading set in source order. */
export function selectPractice(questions, state, { mode = 'daily', count = 10, chapter = '', part = 0, now = Date.now() } = {}) {
  const bank = questionBank(questions);
  const limit = integer(count, 0, 0, bank.length);
  if (!limit) return [];
  const data = normalizeState(state);
  const time = safeTime(now);
  const bookmarks = new Set(data.bookmarks);
  let eligible = bank.filter(question => (!chapter || question.chapter === chapter) && (!part || question.part === part));
  if (mode === 'wrong') eligible = eligible.filter(question => isWrong(data.records[question.id], question));
  if (mode === 'review') eligible = eligible.filter(question => isDue(data.records[question.id], question, time));
  if (mode === 'bookmarked') eligible = eligible.filter(question => bookmarks.has(question.id));
  if (mode === 'daily') {
    const chapterStats = new Map(summarize(data, bank, time).weakChapters.map(item => [item.id, item.accuracy]));
    eligible.sort((a, b) => {
      const aRecord = data.records[a.id];
      const bRecord = data.records[b.id];
      if (!aRecord || !bRecord) return Number(Boolean(aRecord)) - Number(Boolean(bRecord));
      return (chapterStats.get(a.chapter) ?? 100) - (chapterStats.get(b.chapter) ?? 100)
        || Number(isWrong(bRecord, b)) - Number(isWrong(aRecord, a))
        || aRecord.lastAt - bRecord.lastAt;
    });
  } else if (mode === 'review') {
    eligible.sort((a, b) => data.records[a.id].dueAt - data.records[b.id].dueAt);
  } else if (mode === 'mixed' || mode === 'timed') {
    for (let index = eligible.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [eligible[index], eligible[other]] = [eligible[other], eligible[index]];
    }
  }
  const groups = new Map();
  for (const question of bank) {
    if (typeof question.setId !== 'string' || !question.setId.trim()) continue;
    if (!groups.has(question.setId)) groups.set(question.setId, []);
    groups.get(question.setId).push(question);
  }
  const selected = [];
  const selectedIds = new Set();
  const includeSet = seed => {
    if (!seed || selectedIds.has(seed.id)) return;
    for (const question of groups.get(seed.setId) || [seed]) {
      if (selectedIds.has(question.id)) continue;
      selectedIds.add(question.id);
      selected.push(question);
    }
  };
  if (mode === 'daily' && !chapter && !part && new Set(eligible.map(question => question.part)).size > 1) {
    // Reserve reading before filling the remaining places, so a large grammar
    // bank cannot delay all reading practice until its questions are exhausted.
    const pools = new Map([5, 6, 7].map(value => [value, eligible.filter(question => question.part === value)]));
    const grammarSeeds = limit > 1 ? Math.max(1, Math.round(limit * .3)) : 0;
    for (const seed of pools.get(5).slice(0, grammarSeeds)) includeSet(seed);
    if (limit >= 3) includeSet(pools.get(6)[0]);
    includeSet(pools.get(7)[0]);
    // Short or absent pools transfer their unused places to reading first.
    for (const seed of [...pools.get(7), ...pools.get(6), ...pools.get(5)]) {
      if (selected.length >= limit) break;
      includeSet(seed);
    }
    return selected;
  }
  for (const seed of eligible) {
    includeSet(seed);
    if (selected.length >= limit) break;
  }
  return selected;
}
