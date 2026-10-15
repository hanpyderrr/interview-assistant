import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInterviewAnswerTopic} from '../answerTopicValidation.ts';
test('allows everyday project workload in a labeled HR answer',()=>{
 assert.equal(validateInterviewAnswerTopic({question:'你上学累不累，有什么心得？',answer:'参考表达（请按真实情况调整）：课业和项目都比较忙，我会拆小任务，安排休息。'}).ok,true);
});
test('still rejects concrete technical detours in HR answers',()=>{
 assert.equal(validateInterviewAnswerTopic({question:'你上学累不累？',answer:'参考表达：我在项目里处理SPI和PF32激光触发。'}).ok,false);
});
test('rejects renamed TOF facts in a genealogy answer',()=>{
 const result=validateInterviewAnswerTopic({question:'项目有什么难题？',answer:'族谱Agent通过Si5351A修复PF32外触发。',allowedProjectIds:['genealogy_agent']});
 assert.ok(result.violations.some(x=>x.code==='project_scope_leak'));
});
test('permits selected project and explicit multi-project comparison',()=>{
 assert.equal(validateInterviewAnswerTopic({question:'项目难题？',answer:'TOF项目处理PF32触发问题。',allowedProjectIds:['tof']}).ok,true);
 assert.equal(validateInterviewAnswerTopic({question:'比较TOF和族谱',answer:'TOF用PF32，族谱用OCR。',allowedProjectIds:['tof','genealogy_agent']}).ok,true);
});
