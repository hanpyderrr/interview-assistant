# 面试助手故障排查记录

记录 PlanKiller / Natively 面试助手在本机(Windows 11)遇到的问题、根因与修复方法。更新日期：2026-08-12。

---

## 问题 1：面试助手打不开（portable 单文件 exe 静默退出）

### 现象
- 双击 `Natively 2.8.5.exe`（portable 便携版），进程短暂出现后**静默退出**，无任何窗口。
- Windows 事件日志无崩溃记录，无应用日志输出。

### 排查过程
1. **排除应用本身问题**：`tsc` 类型检查通过，node_modules 完整。
2. **验证 unpacked 版正常**：`release3/win-unpacked/Natively.exe` 启动后窗口正常显示（标题 "Natively"），证明应用代码没问题。
3. **定位 portable 失败点**：
   - portable exe 启动退出码为 **2**（NSIS 自解压错误）。
   - TEMP 目录里 portable 的解压临时目录**是空的**，自解压器在解压阶段失败，未产出可运行文件。
   - C 盘可用空间曾仅 **3.4GB**，portable 需解压 790MB 单文件 + 运行时空间，空间紧张是诱因之一。
4. **排除其他因素**：禁用 GPU 加速无效；绕过系统代理（Clash Verge 127.0.0.1:7897）仍退出。

### 根因
**portable 自解压单文件在部分 Windows 环境（无管理员权限 + 系统盘空间紧张）下无法正常解压运行**，静默失败。unpacked 版（解压后目录）无此问题。

### 解决方法
- **采用 unpacked 版运行**：直接使用 `release3/win-unpacked/Natively.exe`，并创建桌面快捷方式 `Natively 面试助手.lnk`。
- **清理 C 盘释放空间**：清理 npm-cache、pip cache、playwright 浏览器、临时文件，C 盘从 14GB → 18.7GB 可用。
- 可选：重新打 NSIS 安装版替代 portable（本机曾遇到 NSIS 打包卡死，见下）。

---

## 问题 2：一个问题被拆成多个问题（停顿 1 秒被分成多个问题框）

### 现象
- 面试时一句话内停顿约 1 秒，原来会合并为同一个问题，现在被拆成多个问题，且每个问题单独回答。
- 期望：5 秒内的停顿应合并到一个问题框。

### 排查过程
1. **确认实际运行产物**：桌面快捷方式明确指向 `release3/win-unpacked/Natively.exe`。旧包的 `app.asar` 同时包含 `dist/index.html` 和 `dist-electron/electron/main.js`，两者与当时磁盘构建文件的 SHA256 一致；前端 bundle 也包含 Phase 18 的 coordinator 逻辑。因此，“asar 缺入口并加载降级内容”不是本问题的根因。
2. **追踪真实事件链**：interviewer final 和 user final 都携带 session、顺序、renderer 接收时间及可用的音频区间进入 `questionRoundCoordinator`。旧实现收到任意 candidate/user final 后，会立即把当前轮次设为关闭。
3. **稳定复现串音路径**：面试官第一段 final 后，麦克风通道可能收到与面试官音频重叠的 candidate/user final（串音或噪声）。旧实现立即关闭 round；下一段 interviewer final 即使命中同一会话且音频停顿小于 5 秒，也会因为 `round-closed` 新建问题和答案。
4. **确认次要风险**：相邻 interviewer final 的音频元数据完整时，使用音频时钟判断 5 秒边界；元数据不完整时只能退回 renderer `arrival-gap`。事件晚到可能使 arrival gap 大于真实音频停顿，因此仍存在误拆风险，但它不是本次串音复现的首要根因。

### 根因
**candidate final 过早关闭 round**：旧 coordinator 把 candidate/user final 当成已经完成候选人回合的直接证据。串音或噪声产生的 user final 因此关闭当前问题，导致后续 interviewer final 命中 `round-closed`，被错误拆成新的问题和回答。

### 解决方法
1. candidate final 只记录为待确认的 candidate evidence，不再立即关闭 round；下一段 interviewer final 到达后才判断是否存在真实候选人回合。
2. 只有 candidate 音频区间完整、有效（`audioStartMs < audioEndMs`）、严格位于前后两段 interviewer 音频之间且不重叠时，才以 `candidate-turn` 新建轮次。重叠串音或缺少可比较音频元数据时不据此拆轮。
3. interviewer 自身音频停顿达到 5 秒时，`audio-gap` 优先于 `candidate-turn`；缺少音频元数据时保留现有 `arrival-gap` fallback。待确认 candidate evidence 最多保留最近 32 条，避免噪声导致无界增长。
4. candidate final 在 2.5 秒 provisional 生成之前到达时，仍会触发一次生成，但 round 保持打开；同轮后续 interviewer final 追加问题时复用原 `answerId` 并重启修订，不增加历史问题行。
5. 修复后的 unpacked 包已部署到 `release3/win-unpacked`；替换前的旧包保留在 `release3/win-unpacked.pre-candidate-boundary-fix`。桌面快捷方式继续指向新 unpacked 包。`release3/Natively 2.8.5.exe` portable 单文件仍是旧包，不包含本次修复，也不建议用于验证。

---

## 问题 3（附）：NSIS 安装版打包卡死

### 现象
- 尝试 `npx electron-builder --win nsis` 打 NSIS 安装版时，卡在 `searching for node modules` 阶段超过 10 分钟无输出，进程 CPU 持续增长但无产物。

### 根因
- node_modules 体积巨大（约 2.5GB），electron-builder 对依赖树做递归扫描时性能极差/卡死（`ELSPROBLEMS` + 大量 `duplicate dependency` 警告）。
- NSIS 目标会触发 winCodeSign 下载（含 macOS 符号链接，无管理员权限解压失败）。

### 解决方向
- 用 portable 专用配置 `electron-builder.win-portable.cjs`（`signAndEditExecutable: false`）绕开 winCodeSign 符号链接问题。
- 若要打 NSIS，可考虑精简 node_modules 或用 CI 环境。

---

## 经验总结（避免重犯）

1. **打包前必须先编译**：electron-builder 只是"打包"，不会替你编译。必须先 `npm run build` + `npm run build:electron`，确保 dist 和 dist-electron 存在且为最新。
2. **打包后必须验证 asar**：用 `@electron/asar` 列出包内容，确认 `dist/index.html` 和 `dist-electron/electron/main.js` 都在。
3. **portable 兼容性风险**：portable 单文件在无管理员权限 + 磁盘紧张时可能静默失败；优先用 unpacked 版或 NSIS 安装版。
4. **C 盘空间是隐藏依赖**：Electron 应用和打包都需要临时空间，定期清理 npm/pip/playwright 缓存。
