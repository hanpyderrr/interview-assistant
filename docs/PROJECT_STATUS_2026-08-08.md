# Interview Assistant 项目总结

更新时间：2026-08-08

## 一、项目目标

这是一个面试辅助 Electron 应用，核心链路是：

```text
系统音频/麦克风
  -> 本地语音转文字
  -> 面试问题确认与题库检索
  -> AI 流式生成建议答案
  -> 候选人回答转写并作为后续上下文
```

主要使用场景是嵌入式软件工程师面试，重点覆盖 C/C++、Linux 内核裁剪、Buildroot、驱动、SPI、CRC32、半包/粘包等技术主题。

## 二、当前技术架构

### 语音转文字

- 实时模型：`Xenova/whisper-tiny`
- 运行方式：Electron 本地 `LocalWhisperSTT`
- 推理线程：Whisper worker，使用 ONNX/DML + CPU 回退
- 分段：VAD + LocalAgreement-2；项目中也保留 Meetily VAD 试验路径
- 通道：系统音频和麦克风分开处理
- 事件：partial/final/reset，携带 `sessionId`、`sequence`、`segmentId`、`audioStartMs`、`audioEndMs`

### 问题与答案

- renderer 维护 interviewer 和 candidate 两条 transcript
- interviewer final 进入 `questionSettler`
- 当前有 partial 预热、题库检索预热、候选答案流和 Provider deadline
- 答案历史由 `answerHistoryReducer` 管理，支持手动选择历史问题
- 当前每个 `enqueueAnswer` 会创建新的 answer ID

### 相关入口

- `src/interview-console/InterviewConsole.tsx`
- `src/interview-console/questionTiming.ts`
- `src/interview-console/interviewContext.ts`
- `src/interview-console/answerHistory.ts`
- `electron/audio/LocalWhisperSTT.ts`
- `electron/audio/whisper/whisperWorker.ts`
- `electron/main.ts`
- `electron/preload.ts`

## 三、已完成的主要工作

- 修复并验证本地 Whisper 启动、worker 生命周期和音频事件传递。
- 增加中文语言映射，运行时语言配置为 `chinese`。
- 增加 partial 事件契约和 partial 预热，避免只等 final 才开始检索。
- 增加候选人麦克风转写，并把候选人回答加入后续答案上下文。
- 增加答案历史和手动选择，降低快速连续问题互相覆盖的影响。
- 增加 Provider 超时、本地题库兜底和 generation/stream 迟到事件保护。
- 增加技术术语纠错计划，重点解决 `SBI -> SPI`，并保护 `PUSBI`、`SPIBus` 等边界词。
- 完成多条桌面音频和 Electron/CDP 回放验证，基础的“转写 -> 检索 -> 答案”链路可运行。
- 未打包 EXE，打包工作仍暂停。

## 四、当前已确认的问题

用户复现的一段话包含 SPI、CRC32、半包/粘包等多个技术点，中间约停顿 1 秒，但应用生成了多个独立问题和答案。

CC 根因分析结论：

1. `InterviewConsole.tsx` 在 final 到达时用 renderer 的 `Date.now()` 设置 settle deadline，测量的是事件到达间隔，不是实际音频间隔。
2. 普通问题默认 2500ms；只有识别到多问题文本标记后才会扩展到 5000ms。
3. Whisper worker 通过 FIFO 队列串行推理，真实音频间隔约 1 秒，后续 final 仍可能延迟超过 2.5/5 秒才到 renderer。
4. 一旦 `questionSettler.drain()` 完成，当前代码没有把后续 final 追加回已生成或已完成的答案的路径。
5. `splitSettledInterviewQuestion` 对完整的 SPI/CRC32/半包/粘包复现句不会拆成多个 clause，因此不是这次问题的直接根因。

之前的修复覆盖了 pending 阶段的合并、明显“第二个/第三个”标记拆分和历史答案保存，但没有覆盖“旧问题已经 drain 后，迟到 final 仍属于同一轮”的情况。

## 五、Phase 18 执行方案

完整计划文件：

`docs/superpowers/plans/2026-08-08-question-round-aggregation.md`

执行顺序固定如下，每一步完成后都要先测试，再交 CC 审核通过：

1. **诊断遥测**：记录音频时间、worker 队列/推理时间、main emit、renderer receive、round 决策、answer/attempt/stream ID；只保留脱敏数据，最多 200 条。
2. **失败测试**：先写并确认 RED，覆盖短音频间隔但晚到、2.5 秒预热、post-drain 复用 answer ID、5 秒边界、reset/candidate 边界、旧 stream 过滤和原始 transcript 保留。
3. **纯 round coordinator**：2.5 秒启动 provisional 生成；真实音频间隔小于 5 秒继续合并；达到 5 秒新建 round；缺少音频元数据时才用到达时间兜底。
4. **renderer/answer-history 接线**：同轮追加时保留当前草稿、取消旧 generation、用合并问题重新生成、原地更新同一个 answer ID，并拒绝迟到事件。
5. **阶段验证**：运行定向测试、脚本测试、类型检查、构建，并进行真实 Electron/CDP 回放；比较答案数量、问题合并、延迟、错误率和检索命中。

本次用户要求是先执行前五条并由用户验证，因此完成第 5 步后暂停，不自动进入后续调优。

## 六、验收标准

- 三段连续短间隔问题：只保留一个 answer ID 和一个历史条目，问题文本包含三个技术点。
- 真实音频间隔达到或超过 5 秒：创建新的 answer ID。
- 2.5 秒时必须启动一次 provisional prewarm/answer，不因等待 5 秒而牺牲首屏速度。
- reset、session 变化、候选人 final 后不会把旧问题和新问题错误合并。
- 旧 stream 的 token/done/error 不得覆盖新答案。
- 原始 transcript、segment metadata 和候选人上下文不被覆盖。
- 既有十条延迟基线音频的事件完整率保持 100%，Provider 错误数不高于基线，首字延迟 p95 回归不超过 250ms，检索命中不低于基线。

## 七、当前执行状态

- Phase 18 计划已完成 CC 最终审核：`VERDICT: APPROVED`。
- 本轮在开始第 1 步实现前被用户要求暂停并先整理总结。
- 本轮尚未新增 Phase 18 业务代码、遥测代码或 round coordinator 代码。
- 工作区存在此前用户和历史任务留下的未提交改动，未回滚、未覆盖、未提交。

## 八、知识库说明

GitHub 仓库不包含当前使用者的个人知识库。克隆项目后，请参考 `knowledge_source/README.md` 和 `knowledge_source/embedded_kb.example.jsonl`，自行创建 `knowledge_source/embedded_kb.jsonl`。该文件已被 `.gitignore` 排除，避免个人简历、题库答案或公司资料被误上传。

CC 审核原始记录：

`docs/agent-work/AI_CODEX_RESULT.md`
