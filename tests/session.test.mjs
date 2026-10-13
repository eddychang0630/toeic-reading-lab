import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionClock} from '../session.mjs';
test('a timed challenge expires exactly at its deadline, even before an interval runs',()=>{const s={startedAt:1000,deadline:721000,timed:true};assert.equal(sessionClock(s,720999).expired,false);assert.equal(sessionClock(s,721000).expired,true);});
test('returning after an hour still records only the twelve minute challenge duration',()=>{const s={startedAt:1000,deadline:721000,timed:true};assert.deepEqual(sessionClock(s,3601000),{expired:true,seconds:720,remaining:0});});
test('practice without a deadline measures elapsed time and never expires',()=>{assert.deepEqual(sessionClock({startedAt:1000,timed:false},61000),{expired:false,seconds:60,remaining:null});});
test('a clock before the start does not show negative elapsed time',()=>{assert.equal(sessionClock({startedAt:1000,timed:false},500).seconds,0);});
