import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldAcceptQuestionFinal, isAnswerableInterviewQuestion} from '../questionTiming.ts';
import {createQuestionRoundCoordinator} from '../questionRoundCoordinator.ts';
import {classifyInterviewQuestion} from '../questionIntent.ts';
import {createAnswerPrewarmCache, hasIntroductionEvidence} from '../answerPrewarm.ts';
import {buildInterviewConsolePrompt} from '../interviewPrompt.ts';
import {createKbRetriever} from '../../../electron/knowledge/kbRetriever.ts';
const final=text=>({speaker:'interviewer',text,final:true,sessionId:1,arrivalMs:0});
test('notification, fillers and repeated recognition are never accepted as a fresh question',()=>{
 for(const text of ['叮咚','嗯','hello','滴滴滴','[音乐]','一一一一一一一一一一一一'])assert.equal(shouldAcceptQuestionFinal([],final(text)),false,text);
});
test('question gate keeps real short follow-ups and commands but waits for fragments',()=>{
 for(const text of ['为什么？','具体呢？','再说一下'])assert.equal(isAnswerableInterviewQuestion(text,true),true,text);
 for(const text of ['欢迎参加面试','下一节课我们介绍大模型','如果我们的','没有资源你会','我们聊一下SPI驱动，你怎么设计帧头和CRC32校验的，如果如果那个'])assert.equal(isAnswerableInterviewQuestion(text,false),false,text);
 for(const text of ['请简单介绍一下自己','聊一下SPI驱动','你上学累不累','How does SPI work?'])assert.equal(isAnswerableInterviewQuestion(text,false),true,text);
 assert.equal(isAnswerableInterviewQuestion('为什么？',false),false);
});
test('unready speech allocates no question; completed continuation becomes one question',()=>{
 let ids=0;const c=createQuestionRoundCoordinator({allocateAnswerId:()=>++ids,isQuestionReady:q=>isAnswerableInterviewQuestion(q,false)});
 c.acceptInterviewerFinal(final('没有资源你会'));assert.deepEqual(c.tick(4000).actions,[]);assert.equal(ids,0);
 c.acceptCandidateFinal({speaker:'user',text:'嗯',final:true,arrivalMs:4200});assert.equal(ids,0);
 c.acceptInterviewerFinal({...final('怎么开始'),arrivalMs:4500});assert.equal(c.tick(8000).actions.filter(x=>x.type==='generate').length,1);assert.equal(ids,1);
});
test('spoken self introduction and frame format questions route to usable evidence',()=>{
 assert.equal(classifyInterviewQuestion('请简单介绍一下自己').allowPersonalEvidence,true);
 assert.equal(classifyInterviewQuestion('字节序和帧头的CRC32怎么设计').allowTechnicalEvidence,true);
});
test('introduction retrieves personal material; HR feelings still do not retrieve technology',async()=>{
 const seen=[];const cache=createAnswerPrewarmCache(async(q,s)=>{seen.push(q);return {success:true,context:'资料',matches:[]}});
 await cache.retrieve('请简单介绍一下自己',{role:'ai_agent'});assert.equal(seen.length,1);
 await cache.retrieve('上学累不累，有什么心得？',{role:'ai_agent'});assert.equal(seen.length,1);
});
test('role preference ranks relevant main-direction evidence without excluding others',()=>{
 const entries=[{id:'ai',title:'项目介绍',content:'项目介绍',keywords:['项目'],target_roles:['ai_agent'],project_ids:['plankiller']},{id:'emb',title:'项目介绍',content:'项目介绍',keywords:['项目'],target_roles:['embedded_linux'],project_ids:['tof']}];
 const kb=createKbRetriever({readFile:()=>entries.map(x=>JSON.stringify(x)).join('\n'),stat:()=>null});
 for(const [role,first]of [['ai_agent','ai'],['embedded_linux','emb']]){const hits=kb.retrieve('项目介绍','x',5,{role}).matches;assert.equal(hits[0].entry.id,first);assert.equal(hits.length,2);}
 assert.deepEqual(kb.retrieve('项目介绍','x',5,{role:'ai_agent',projectIds:['tof']}).matches.map(x=>x.entry.id),['emb']);
});
test('current role removes stale identity instructions but retains style preferences',()=>{
 const p=buildInterviewConsolePrompt('请介绍自己','已确认个人资料','', 'student',false,'公司：旧公司。岗位：嵌入式工程师。默认主讲项目：TOF。优先围绕TOF回答；不要主动用PlanKiller。普通题用两三句。',{company:'示例公司',position:'AI工程师',role:'ai_agent',defaultProjectId:'plankiller'},{role:'ai_agent'});
 assert.ok(!p.includes('旧公司'));assert.ok(!p.includes('优先围绕TOF回答'));assert.ok(!p.includes('不要主动用PlanKiller'));assert.ok(p.includes('普通题用两三句'));assert.ok(p.includes('AI工程师'));
});


test('resume facts support introductions but cannot be used to invent HR feelings',async()=>{
 const {validateInterviewAnswerTopic}=await import('../answerTopicValidation.ts');
 const evidence={success:true,matches:[{source:'resume_fact'}]};
 assert.equal(hasIntroductionEvidence('请介绍一下自己',evidence),true);
 assert.equal(hasIntroductionEvidence('你上学累不累',evidence),false);
 assert.equal(validateInterviewAnswerTopic({question:'请介绍一下自己',answer:'我做过 RAG 项目，也写过嵌入式驱动。',hasRelevantPersonalEvidence:true}).ok,true);
 assert.equal(validateInterviewAnswerTopic({question:'先不聊技术，请介绍一下自己',answer:'我做过 RAG 项目。',hasRelevantPersonalEvidence:true}).ok,false);
 for(const q of ['总结一下SPI驱动','谈一下你的项目','SPI和I2C的区别'])assert.equal(isAnswerableInterviewQuestion(q),true,q);
});

test('a named technology outranks generic difficulty wording even across roles',()=>{
 const entries=[{id:'ai',title:'项目难点是什么',keywords:['难点'],content:'项目难点',target_roles:['ai_agent']},{id:'spi',title:'SPI驱动',keywords:['SPI'],content:'驱动调试',target_roles:['embedded_linux']}];
 const kb=createKbRetriever({readFile:()=>entries.map(x=>JSON.stringify(x)).join('\n'),stat:()=>null});
 assert.equal(kb.retrieve('SPI驱动的难点是什么','x',5,{role:'ai_agent'}).matches[0].entry.id,'spi');
 assert.equal(classifyInterviewQuestion('为什么？').intent,'follow_up');
});
