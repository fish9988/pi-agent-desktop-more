# Pi Agent Plus 当前状态与交接

> 每次工作结束（或上下文快满、要换会话时）更新本文件。长期知识写在 [plus.md](plus.md)。
> 新会话接手的顺序：`AGENTS.md` 开头的 Plus 部分 → `plus.md` → 本文件 → `git log --oneline -10` → `CHANGELOG-PLUS.md` 的最新条目。

_最后更新：2026-10-21_

## 当前状态

- **最新发布：v1.6.0**（tag `v1.6.0`）：从上游周报 Issue #1 移植的 7 个修复、5 个功能和 1 个性能改进，详见 CHANGELOG-PLUS.md。
- 用户的正式版 `D:\Pi Agent Plus` 是 **1.5.0**，用户会自己点「更新」升级到 1.6.0。
- 测试版 `D:\Pi Agent Plus Test` 还是 1.5.0-test.16，没在运行。
- 上游周报 #1 已处理并标记为已看（`.github/upstream-reviewed.json` 指向 pi-web `7c0778a8`、abcwyc `d414e9db`）。

## 版本历史速览（详见 CHANGELOG-PLUS.md）

| 版本 | 要点 |
|---|---|
| 0.7.5-plus.1–3 | 改名并独立、修复标题生成、聊天宽度、工作详情分档、Ctrl+F、主题层、导航预览 |
| 1.1.0 | 12 个内置主题、主题导入和管理、三种字体角色、文件树操作、独立版本号 |
| 1.2.0 | 主题引擎（clean 基底加调色板 token）、调色板编辑器，custom.css 改为叠加层 |
| 1.3.0 | ✨ 优化提示词 |
| 1.4.0 | 应用内更新（签名）、设置镜像到文件、主题库（OpenCode 32 个）和 VS Code 主题导入、问题列表导航、若干上游修复、每周上游报告 |
| 1.4.1 | 用来验证应用内升级的版本；版本号显示完整的 vX.Y.Z |
| 1.5.0 | 工作时间线、外观独立成页并带实时预览、粗体与标题字体、输入框下扩展标签、只显示费用的用量行、轻动效、移植 pi-web 0.12 性能、测试版打包 |
| 1.6.0 | 上游周报 #1：子目录→根目录会话不再被关、在此提问光标、页内锚点、模型改动对已开会话生效、标题搜索、.agents/skills 分组、diff 省略行；Claude 自适应思考、单模型 Base URL、按服务商搜模型、内联音视频、终端字号跟随；状态轮询不带系统提示词 |

## 待办 / 候选

- [ ] **WSL 支持**（用户 2026-10-21 提出，参考 Codex）：方案已给用户，等确认。要点见下方「WSL 调研」。
- [ ] 暂缓的上游项：#1324 工具参数按行显示（先出预览）、1280e4f6 模型页文案。
- [ ] 1.5.0 / 1.6.0 的使用反馈（时间线、外观页预览、扩展标签）。
- [ ] 设置页搜索（老点子，未做）。
- [ ] 两个历史遗留的失败测试（1.6.0 之前就失败，与本次无关）：`components/fork-extractions.test.mjs` 的 artifacts 哨兵（`useArtifactPublisher(` 标记）、`components/restored-wiring.test.mjs` 第 5 项（运行结束刷新右侧文件树）。值得查一下是测试过时还是功能丢了。
- [ ] 不做的事：会话标题的悬停提示、主题卡片的悬停预览、#1183。

## WSL 调研（2026-10-21，实测）

- 机器：WSL2 Ubuntu-24.04（默认发行版），**没有** `C:\Windows\System32\bash.exe`；WSL 里没有 node（`pi` 通过 interop 找到的是 Windows 的）。Git Bash 在 `C:\Program Files\Git\bin\bash.exe`；pwsh 7 是商店版（PATH 里的 `WindowsApps\pwsh.exe`）。
- 用 Node `spawn("wsl.exe", ["--cd", <Windows 路径或 \\wsl.localhost UNC>, "--exec", "bash", "-lc", cmd])`：引号、中文、退出码都正确，`/mnt/c/...` 自动换算；每条约 115–170 ms；`taskkill /T` 结束 wsl.exe 时 Linux 里的子进程也会退出；WSL 里能调 `powershell.exe`（约 360 ms）。
- **性能**：在 WSL 里对 `/mnt/c` 上的本仓库跑 `git status` 要 6.1 s，Windows 原生 75 ms。Windows 盘上的项目不适合用 WSL 跑命令；放在 `~/` 里的 Linux 项目才合适。
- pi 的 bash 工具支持传入自定义 `operations`（`createBashToolDefinition(cwd, { operations })`），可以用一个内置扩展把 `bash` 换成走 `wsl.exe` 的版本；`shellPath` 只能指向接受 `-c` 的 bash，不能直接指向 `wsl.exe`。
- Codex 的做法：「Agent 环境」（Windows 原生 / WSL，全局，改完要重启）和「集成终端」（PowerShell / CMD / Git Bash / WSL）分开设置；社区要求按项目设置（openai/codex#17173）。

## 交接注意

- 本对话是在正式版 Plus 里运行的 Agent。新会话同样运行在 `D:\Pi Agent Plus` 里，规则不变：不碰它的进程、不覆盖安装、不改它的设置。
- 用户的模型：
  - 默认 `magpie` / `workbuddy/deepseek-v4.1-flash`（modelId 本身带 `workbuddy/` 前缀）。
  - 还有 `cpa`（claude-opus-5-5）和 `cpa-codex`。
- 用户在磁盘上的主题：
  - `customcss-d85554.css`（「我的 custom.css」）；
  - `theme-7d7216.css`（「护眼绿 副本」，旧的 CSS 格式）；
  - 用户自己做的 carbonfox 调色板主题，是当前主题。
- 并行移植的做法：每组一个 `git worktree`（`node_modules` 用目录联接指向主仓库），子 Agent 只在自己的工作区提交，主 Agent 审查后 cherry-pick 到 `plus`。子 Agent 偶尔会中途被中断，用 `resume` 接着做即可。
