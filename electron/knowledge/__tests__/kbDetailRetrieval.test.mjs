import test from 'node:test';
import assert from 'node:assert/strict';
import { createKbRetriever, scoreEntries } from '../kbRetriever.ts';
import { searchKnowledgeBase } from '../../../scripts/interview-retriever.mjs';

const entries = [
 ...Array.from({length:6},(_,i)=>({id:`overview.${i}`,title:'主板连接与采集',keywords:['N97','RK3568','USB','SPI','连接','采集'],content:'N97 采集后通过 USB-SPI 适配器连接 RK3568。',project_ids:['tof']})),
 {id:'protocol',title:'TofFrame 版本',keywords:['TofFrame','v1','v2','CRC16-Modbus'],content:'v1 和 v2 均以 CRC16-Modbus 结尾，v2 增加强度数组。',project_ids:['tof']},
 {id:'foreign',title:'TofFrame',keywords:['TofFrame','CRC'],content:'这是其他项目的数据。',project_ids:['genealogy_agent']},
];
const kb=createKbRetriever({readFile:()=>entries.map(e=>JSON.stringify(e)).join('\n'),stat:()=>({size:1,mtimeMs:1})});

test('generic CRC and compound USB-SPI tokens match without merging board variants',()=>{
 const q='USB SPI CRC';
 assert.deepEqual(scoreEntries(q,entries).map(r=>r.entry.id),searchKnowledgeBase(q,entries).map(r=>r.entry.id));
 assert.ok(scoreEntries('CRC',[entries[6]]).length);
 assert.deepEqual(scoreEntries('RK3588',[{id:'other-board',keywords:[],content:'RK3568'}]),[]);
});

test('compound project questions reserve evidence for each ask and collapse duplicate bodies',()=>{
 const result=kb.retrieve('N97和RK3568的USB SPI连接和采集如何实现？另外TofFrame两个版本的CRC有何差异？','fixture',5,{projectIds:['tof']});
 assert.ok(result.matches.some(r=>r.entry.id==='protocol'));
 assert.equal(result.matches.filter(r=>r.entry.id.startsWith('overview')).length,1);
 assert.ok(!result.matches.some(r=>r.entry.id==='foreign'));
 assert.match(result.context,/v1 和 v2 均/);
});

test('version and API subjects outrank a project overview even in a single question',()=>{
 const rows=[{id:'overview',title:'单光子TOF项目校验方式',keywords:['单光子','TOF','项目','校验方式','不同'],content:'单光子TOF项目里会校验数据。',project_ids:['tof']},entries[6]];
 const scoped=createKbRetriever({readFile:()=>rows.map(e=>JSON.stringify(e)).join('\n'),stat:()=>({size:1,mtimeMs:1})});
 const result=scoped.retrieve('再回到单光子TOF项目，v1和v2的校验方式有什么不同？','fixture',1,{projectIds:['tof']});
 assert.equal(result.matches[0].entry.id,'protocol');
});

test('the selected project name is not a technical subject that suppresses a fault narrative',()=>{
 const rows=[{id:'overview',title:'TOF 项目',keywords:['TOF'],content:'N97架构概述。',project_ids:['tof']},{id:'fault',title:'真实联调故障排查与根因',keywords:['联调故障','排查工具','根因'],content:'记录了一次触发输出故障及波形验证。',project_ids:['tof']}];
 const scoped=createKbRetriever({readFile:()=>rows.map(e=>JSON.stringify(e)).join('\n'),stat:()=>({size:1,mtimeMs:1})});
 assert.equal(scoped.retrieve('TOF项目真实联调故障的排查工具和根因是什么？','fixture',1,{projectIds:['tof']}).matches[0].entry.id,'fault');
});

test('comma-separated technical subquestions each receive evidence',()=>{
 const rows=[
  {id:'routing',title:'SPI 主从',keywords:['SPI','主机','从机'],content:'SPI主从连接说明。',project_ids:['tof']},
  {id:'fields',title:'深度帧字段',keywords:['字段','深度数据'],content:'帧字段依次编码。',project_ids:['tof']},
  {id:'length',title:'如何知道一帧有多长',keywords:['一帧','多长'],content:'版本确定完整帧长。',project_ids:['tof']},
  {id:'retry',title:'链路确认和重传',keywords:['确认','重传'],content:'是否重传应由实际协议确定。',project_ids:['tof']},
 ];
 const scoped=createKbRetriever({readFile:()=>rows.map(e=>JSON.stringify(e)).join('\n'),stat:()=>({size:1,mtimeMs:1})});
 const result=scoped.retrieve('SPI谁是主机谁是从机？一帧深度数据有哪些字段，如何知道一帧有多长，当前链路有没有确认和重传？','fixture',4,{projectIds:['tof']});
 assert.deepEqual(new Set(result.matches.map(r=>r.entry.id)),new Set(['routing','fields','length','retry']));
});
