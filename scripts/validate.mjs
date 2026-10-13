import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chapters,questions as original} from '../data/handbook.mjs';
import {readingSets,vocabulary,studyPlan} from '../data/reading.mjs';
const questions=[...original,...readingSets.flatMap(s=>s.questions)];
assert.equal(original.length,97);
assert.equal(new Set(questions.map(q=>q.id)).size,questions.length);
for(const q of questions){assert.equal(q.options.length,4,q.id);assert.ok(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<4,q.id);assert.ok(q.stem&&q.explanation,q.id);assert.ok([5,6,7].includes(q.part),q.id);if(q.part!==5)assert.ok(q.passage&&q.setId,q.id);}
for(const set of readingSets){assert.ok(set.questions.every(q=>q.setId===set.id&&q.passage===set.passage));if(set.part===6)assert.equal(set.questions.length,4);}
assert.equal(chapters.filter(c=>/^ch\d+$/.test(c.id)).length,15);
assert.ok(chapters.every(c=>!/<script|\bonclick\s*=|class="quiz"/i.test(c.html)));
assert.equal(studyPlan.length,28);
assert.ok(studyPlan.every(d=>d.chapter==='reading'||chapters.some(c=>c.id===d.chapter)));
assert.equal(new Set(vocabulary.map(v=>v.id)).size,vocabulary.length);
const sw=fs.readFileSync('sw.js','utf8');
const paths=[...sw.matchAll(/'\.\/([^']*)'/g)].map(m=>m[1]||'index.html');
for(const path of paths)assert.ok(fs.existsSync(path),`Missing offline asset: ${path}`);
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
for(const icon of manifest.icons)assert.ok(fs.existsSync(icon.src));
const internalLinks=[...new Set(chapters.flatMap(c=>[...c.html.matchAll(/href="(#[^"]+)"/g)].map(m=>m[1])))];
console.log(JSON.stringify({lessons:15,questions:questions.length,parts:Object.fromEntries([5,6,7].map(p=>[p,questions.filter(q=>q.part===p).length])),readingSets:readingSets.length+1,vocabulary:vocabulary.length,planDays:studyPlan.length,offlineAssets:paths.length,internalLinks}));
