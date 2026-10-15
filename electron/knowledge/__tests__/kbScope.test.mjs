import test from 'node:test';
import assert from 'node:assert/strict';
import { createKbRetriever } from '../kbRetriever.ts';
const entries = [
 {id:'tof',title:'项目难题',content:'TOF激光故障',keywords:['项目','难题'],project_ids:['tof'],target_roles:['embedded_linux']},
 {id:'ai',title:'项目难题',content:'PlanKiller模型超时',keywords:['项目','难题'],project_ids:['plankiller'],target_roles:['ai_agent']},
 {id:'mixed',title:'项目难题',content:'两项目经验汇总',keywords:['项目','难题'],project_ids:['tof','plankiller'],target_roles:['embedded_linux','ai_agent']},
 {id:'generic',title:'项目难题',content:'通用建议',keywords:['项目','难题'],project_ids:[],target_roles:['ai_agent']},
];
const kb = createKbRetriever({readFile:()=>entries.map(x=>JSON.stringify(x)).join('\n'),stat:()=>({mtimeMs:1,size:1})});
test('project restriction excludes other projects, generic and portfolio rows',()=>{
 assert.deepEqual(kb.retrieve('项目难题','test',5,{projectIds:['plankiller']}).matches.map(x=>x.entry.id),['ai']);
});
test('role preference keeps other projects available',()=>{
 const hits=kb.retrieve('项目难题','test',5,{role:'ai_agent'}).matches;
 assert.ok(hits.some(x=>x.entry.id==='tof')); assert.ok(hits.findIndex(x=>x.entry.id==='ai') < hits.findIndex(x=>x.entry.id==='tof'));
});
test('missing project evidence cannot fall back to another project',()=>{
 assert.equal(kb.retrieve('项目难题','test',5,{projectIds:['genealogy_agent']}).matches.length,0);
});
test('invalid scope fails closed',()=>{
 assert.throws(()=>kb.retrieve('项目难题','test',5,{projectIds:['unknown']}),/scope/i);
 assert.throws(()=>kb.retrieve('项目难题','test',5,{role:'random'}),/scope/i);
});
