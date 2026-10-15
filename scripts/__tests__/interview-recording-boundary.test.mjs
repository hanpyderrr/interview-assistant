import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildInterviewConsolePrompt} from '../../src/interview-console/interviewPrompt.ts';

const source = fs.readFileSync(new URL('../../electron/ipcHandlers.ts', import.meta.url), 'utf8');
const declaration = source.match(/const callerComposedInterview =[^\n]+\n\s*const recordedMessage =[^\n]+/)[0];
const start = source.indexOf('// Capture already records audio questions.');
const recording = source.slice(start, source.indexOf('// Mirror to phone', start));
function record(message, options) {
  const turns = [];
  const persistedQuestion = new Function('intelligenceManager', 'message', 'options', `${declaration}\n${recording}\nreturn recordedMessage;`)({addTranscript:turn=>turns.push(turn)}, message, options);
  return {turns, persistedQuestion};
}

test('compiled interview prompts do not become candidate speech or saved question text',()=>{
 const question='SPI的工作方式是什么？';
 const prompt=buildInterviewConsolePrompt(question,'合成测试资料');
 assert.deepEqual(record(prompt,{skipSystemPrompt:true,ignoreKnowledgeMode:true,interviewQuestion:question}),{turns:[],persistedQuestion:question});
});

test('ordinary manual chat remains in the transcript',()=>{
 const result=record('普通聊天问题',undefined);
 assert.equal(result.turns.length,1);assert.equal(result.turns[0].text,'普通聊天问题');assert.equal(result.persistedQuestion,'普通聊天问题');
});

test('manual interview testing cannot write completed replies into regular meeting memory',()=>{
 const manualDeclaration=source.match(/const manualInterviewTest =[^\n]+/)[0];
 const finalGuard=source.match(/if \((fullResponse\.trim\(\)\.length > 0[\s\S]*?sessionWriteDecision\.blockedFromSessionTracker)\) \{/)[1];
 const canWrite=new Function('message','options','fullResponse','blockedFromSessionTracker','sessionWriteDecision',`${declaration}\n${manualDeclaration}\nreturn (${finalGuard});`);
 const options={skipSystemPrompt:true,ignoreKnowledgeMode:true,interviewTest:true,interviewQuestion:'合成测试问题'};
 assert.equal(canWrite('编译提示词',options,'合成回答',false,{blockedFromSessionTracker:false}),false);
 assert.equal(canWrite('普通语音面试',{...options,interviewTest:false},'合成回答',false,{blockedFromSessionTracker:false}),true);
 assert.equal(canWrite('普通聊天',undefined,'合成回答',false,{blockedFromSessionTracker:false}),true);
 assert.equal(canWrite('失败回答',undefined,'合成回答',false,{blockedFromSessionTracker:true}),false);
});
