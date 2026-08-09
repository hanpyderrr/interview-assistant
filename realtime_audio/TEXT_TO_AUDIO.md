# 题目文字转音频

本模块使用 Windows SAPI5 和 `pyttsx3` 离线生成 WAV。中文语音使用系统中的 `Microsoft Huihui Desktop - Chinese (Simplified)`。

安装：

```powershell
python -m pip install pyttsx3
```

查看语音：

```powershell
python text_to_audio.py --list-voices
```

生成单题：

```powershell
python text_to_audio.py --text "请介绍一下你的项目" --output recordings\question.wav
```

批量测试题位于 `test_questions.txt`。本次已生成四个测试文件：

- `recordings/question-01.wav`：RK3568/Buildroot 系统架构
- `recordings/question-02.wav`：SPI 帧同步、解析和 CRC32
- `recordings/question-03.wav`：多进程、共享内存和 POSIX 信号量
- `recordings/question-04.wav`：5G ECM、TCP 心跳、超时和重连

生成的 WAV 会校验格式，可直接用于现有音频转写链路。
