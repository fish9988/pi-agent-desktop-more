# Pi Agent Plus 当前状态与交接

> 每次工作结束（或上下文快满、要换会话时）更新本文件。长期知识写在 [plus.md](plus.md)。
> 新会话接手的顺序：`AGENTS.md` 开头的 Plus 部分 → `plus.md` → 本文件 → `git log --oneline -10` → `CHANGELOG-PLUS.md` 的最新条目。

_最后更新：2026-10-27_

## 当前状态

- 上一版 v1.6.1：修复文件树下载按钮无反应、「在资源管理器中显示」打开错目录（正斜杠路径 + Rust 引号问题，改用 `raw_arg`）。v1.6.0 是上游周报 #1 的移植。
- 用户的正式版 `D:\Pi Agent Plus` 是 **1.5.0**，用户会自己点「更新」升级到 1.6.0。
- 测试版 `D:\Pi Agent Plus Test` 是 1.7.0-test.23（`plus-prefs.test.json` 里主题选了「Plus 分层」、深色），没在运行。
- **最新发布：v1.9.1**（2026-10-27）：「对话」模式默认放开所有已安装插件工具、修复 `pi-web-access` 首轮联网检索，并移植上游周报 #2 的 8 项更新（Pi SDK 1.4.0、超大会话裁剪加载、Windows 启动超时 90s/180s 与失败弹窗、`write` 工具可读文本等），见下方「上游周报 #2 与对话插件权限放开（1.9.1）」。上一版 v1.9.0（2026-10-26）：Plus 成为默认底层、主题只改颜色和字体，见下方「主题分层（1.9.0）」。上一版 v1.8.0（2026-10-25）：设置参考 PI-Desktop 重做，见下方「设置整页（1.8.0）」。上一版 v1.7.1（2026-10-22，6dbc3ce5）：补齐效果图（见下方「补齐效果图」）；测试版 1.7.1-test.27 已装到测试目录验证。上一版 v1.7.0（a7b505a8）：界面重设计第一批，Release 带签名的 `latest.json`；测试版 1.7.0-test.23 已装到 `D:\Pi Agent Plus Test` 并验证过。第二批（侧栏细调、11px→12px）和补齐效果图的 1.7.1 已提交，见下方。
- 上游周报 #2（2026-10-27）已移植并标记为已看（`.github/upstream-reviewed.json` 指向 pi-web `e533d9b3`、abcwyc `56691c5a`）。

## 上游周报 #2 与对话插件权限放开（1.9.1，2026-10-27）

- **非项目「对话（Chats）」默认放开所有已安装插件工具**（`lib/chat-workspace-policy.ts`、`lib/chat-workspace-policy.test.mjs`）：
  1. `isChatToolAllowed` 改为**默认放行所有用户安装的插件（Extensions）与 MCP 工具**（例如 `pi-web-access` 联网搜索、`pi-supermemory-dsh` 的 `memory_search/save/forget`、`pi-mcp-adapter` 的 `mcpScript` 以及未来新装插件的工具），仅拦截项目专用的编码/终端工具（`bash`、`powershell`、`edit`、`write`、`grep`、`find`、`ls`）和子智能体委派工具（`Agent`、`get_subagent_result`、`steer_subagent`、`subagent`），无需再去「设置 › 常规 › 对话」手填工具名。
  2. 针对 `pi-web-access` 默认动态激活（`session_start` 把 `web_search` 替换为 `web_enable`），在 `createChatWorkspaceExtension` 的 `session_start` 与 `before_agent_start` 中对已注册的 `CHAT_WEB_TOOL_NAMES` 主动保持激活，新建「对话」第一轮即可直接联网检索。
- **上游周报 #2 移植（8 项）**：
  1. 升级 `@earendil-works/pi-*` SDK 至 `1.4.0`（`de1fdb52`）：自动压缩与分支摘要不再受固定输出 token 限制，Codemode 支持并发排队。
  2. 超大会话（≥16 MB）快速裁剪加载（`d5603b53`，`lib/session-slim-load.ts` + `lib/session-reader.ts`）：字节层跳过 UI 不使用的 `toolResult.details`。
  3. Windows 启动超时放宽至 90s（开机自启 180s）、探测失败原因记录及启动失败弹窗提示且不再触发 Tauri panic（`7db02104`、`d5a779c3`，`src-tauri/src/lib.rs`）。
  4. `write` 工具调用展开时直接渲染可读文件内容而非 JSON 转义串（`4fefc02e` / pi-web #1024，`components/MessageView.tsx`）。
  5. worktree 项目缓存不再因 `git` 进程被杀或临时失败而写入假项目根（`0fcc497a` / #1339，`lib/worktree.ts`）。
  6. 删除改名后的自定义服务商时同步清理挂起的重命名记录（`3edded3c` / #1342，`components/models-config-helpers.ts`、`components/ModelsConfig.tsx`）。
  7. 保存 `models.json` 时通过 `realpathSync()` 穿透写入以保留符号链接（`f7f8f450` / #1336，`lib/models-config-store.ts`）。
  8. `get_state` 增量计算会话活跃时间（`71ee20c5` / #1340，`lib/session-timing.ts`、`lib/rpc-manager.ts`、`hooks/useAgentSession.ts`）。
- **周报 #2 跳过项**：`6e418d26` + `30fe5584`（给每个非项目对话建 `~/.pi/agent/chats/<id>` 文件夹及单聊开电脑权限开关，用户确认保持现有轻量对话模式）。

## 主题分层（1.9.0，2026-10-26）

- 用户定的规则写在 `plus.md` §6：Plus 是底层，主题只改颜色和字体；“换主题时它该不该变”决定样式归底层还是变量。
- 实现：`lib/plus-theme-catalog.ts` 的 `BASE_THEME`、`mergePalette`、`layeredPalette`、`resolveThemeDefinition`；`compileThemeCss` 先解析再编译；`builtinThemesCss` 先输出底层（`BASE_LIGHT_SELECTOR`），native 底层的主题不输出。内置主题去掉了 radius。
- 外观页：`PlusAppearanceSettings.tsx` 的「底层」分段（`chooseBase`，localStorage `plus-last-clean-theme` 记住切回 Plus 时用的主题），另一底层的卡片 `is-off` 变灰。
- 侧栏：`SessionSidebar.tsx` 的 `SessionFamilyItem`，只有子 Agent 的会话初始折叠，只有选中子 Agent 时展开（运行中不再自动展开）。
- 棘轮：`lib/plus-theme-layering.test.mjs`（plus CSS 写死颜色 14、写死字体 46，组件行内写死颜色 16；CSS 里不许出现 `data-plus-theme=`；所有主题的层次与文字对比度）。组件里的状态色已批量换成 `var(--danger/--warning/--success)`（脚本 `C:\pi-project\plus-shots\tokenize-colors.mjs`）；`TerminalPanel` 的 xterm 配色必须是真实色值，故意没换。
- 截图：`C:\pi-project\plus-shots\theme-stack-shots.mjs`（GitHub 浅色、Claude、Aura 深色、Carbonfox 深色、外观页；主题库主题在页面里注入，不写 ~/.pi）。
- 没做：主题字段在编辑器里仍然要填全（合并逻辑支持只写差异，但调色板编辑器、文件校验还要求完整配色）；写死字体 46 处、CSS 写死颜色 14 处还没清。
## 设置整页（1.8.0，2026-10-25）

- 用户要求“PI-Desktop 基本可以借鉴，直接全部改完发版”。参考图在 `C:\pi-project\research\PI-Desktop\docs\image\readme\`（plugins_zh.png、addmodel_zh.png）。
- **滚动位置**：用户试过“点会话跳到最新消息”后决定**保留上游的“记住每个会话滚动位置”**，那个改动已撤回，不要再做。
- 外壳：`SettingsPanel.tsx` 在 clean 风格下（`usePlusStyle() === "clean"`）给遮罩加 `.is-plus-page`，并多渲染搜索框、分组标题、页头、`.plus-settings-titlebar`（拖动区 + `WindowControls`，因为整页盖住了应用标题栏）。样式在 `plus-theme.css` 末尾「step 7」，只在 ≥769px 生效；native 风格仍是原弹窗。分组和搜索词表在 `lib/plus-settings-search.ts`，新增分区要加进 `SETTINGS_NAV_GROUPS`，否则导航里看不到（`plus-features.test.mjs` 会报）。
- 插件：`PluginsConfig.tsx` 改成卡片（`InstalledPluginCard`、`StandaloneExtensionCard`）+ 详情视图（返回「全部插件」）+ `DiscoverPanel`；样式在 `plus.css`（对所有主题生效）。发现页走 `/api/plugins/catalog`（`lib/plugin-catalog.ts`，npm search `keywords:pi-package`，无查询按周下载排序、有查询保持相关度），安装固定装到全局，需二次确认。相关源码断言测试（SettingsUi / SettingsPanel / ModelsConfig）已按新结构改写并留注释。
- 模型：详情标题、服务商模型数、能力图标、`plus.models.*` 文案；`models-spec-hint` 在值已保存时不显示。
- 根因记录：用户的代码字体是 Maple Mono NF CN，CJK 按两列宽排，所以等宽字体里的中文看起来被拉开。中文提示不要用 `var(--font-mono)`。
- 验证：开发服务器 + Playwright 截图（`C:\pi-project\plus-shots\settings-shots.mjs`、`settings-flows.mjs`、`settings-variants.mjs`，后者拦截了所有写插件/模型的请求）。没在打包后的桌面程序里点过窗口按钮和拖动区；手机宽度没截到图。
- 测试：相关 130 个测试文件 1252 过，7 个失败都是改动前就有的（FileViewer 4、FileTreeResizer、artifacts 哨兵、restored-wiring 第 5 项）。
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
| 1.6.1 | 文件树下载按钮、在资源管理器中显示 |
| 1.9.1 | 「对话」模式默认放开已安装插件工具、修复 `pi-web-access` 首轮联网检索；上游周报 #2（Pi SDK 1.4.0、超大会话裁剪加载、Windows 启动超时 90s/180s 与失败弹窗、write 工具可读文本、活跃时间增量计算、服务商重命名清理、models.json 软链接保留、worktree 缓存防污染） |
| 1.9.0 | Plus 默认底层 + 主题叠加（颜色/字体）、层次兜底、外观页「底层」、只有子 Agent 的会话默认折叠、状态色跟随主题 |
| 1.8.0 | 设置整页（返回、搜索、分组导航、页头）、插件卡片与能力标签、插件「发现」页（npm pi-package）、模型页标题/图标/中文说明、代码字体中文被拉开的修复 |
| 1.7.0 | 界面重设计第一批：默认主题「Plus 分层」、两层外壳、输入框收进一张卡片、运行中的引导/后续消息/停止、改动卡目录、扩展面板外框、设计阶梯 |
| 1.6.0 | 上游周报 #1：子目录→根目录会话不再被关、在此提问光标、页内锚点、模型改动对已开会话生效、标题搜索、.agents/skills 分组、diff 省略行；Claude 自适应思考、单模型 Base URL、按服务商搜模型、内联音视频、终端字号跟随；状态轮询不带系统提示词 |

## 界面重设计（2026-10-22 开工，目标 1.7.0）

- 效果图：`.design/ui-demo/index.html`（已在 `.git/info/exclude`，不进仓库），三个场景：对话、扩展面板、运行中；预览条切换，`?theme=&scn=chat|ext|run&anno=1`。截图脚本 `C:\pi-project\plus-shots\ui-demo-shot.mjs`。
- 方向：Fluent 2 外壳 + 阅读优先正文；用户认定 Plus 和 Codex 桌面版同类（Agent 干活、人把关），不照搬 Cursor/Windsurf 的编辑器式设计。Gemini 评审的取舍记在效果图说明抽屉里。
- 分 6 步，每步和效果图对照截图：
  1. [x] 主题和设计规范：内置主题 `plus`（「Plus 分层」，效果图配色，正文霞鹜新致宋＋ 16px/1.85，粗体和标题思源宋体）；主题新增 `typography.bold`（→ `--plus-bold-font`，用户选了聊天字体时让位）；阶梯变量 `--plus-fs-1..5`、`--plus-r-ctl/card/overlay`、`--plus-s1..6`、`--plus-dur-1/2`、`--plus-stroke(-strong)`，TS 镜像 `lib/plus-design-scale.ts`（`scaleVar()`）；`lib/plus-design-scale.test.mjs` 校对两边并做"只降不升"的棘轮（Plus CSS 非阶梯字号 30、圆角 21；组件行内非阶梯字号 186）。**默认主题已改为 `plus`**（`DEFAULT_THEME_ID`，排在主题列表第一），只影响没选过主题的人。
  2. [x] 外壳：桌面宽度（≥769px）下侧栏、标题栏在窗口底色上，中间内容（`.app-content-layer`，AppShell 新加的类名）和打开的右侧面板都是圆角 12 的面板，间距 8；标题栏一行：会话名 + 项目标签 + 分支标签（`selectedSession.branch`）。窄窗口和 native 主题不变。侧栏行样式、新建会话按钮还没按效果图改。
  3. [x] 消息：用户气泡（右下角收尖）、回复底部信息行、代码块（标题条 + 等宽小字语言名）、改动卡（每行加相对项目的目录，项目外文件加「项目外」标签：`writtenFileLocation()` in `lib/turn-written-files.ts`，`TurnWrittenFiles` 新增 `cwd` 属性）。
  4. [x] 输入框：工具行收进同一张卡片（ChatInput 新类名 `.chat-composer-frame`，bash/steer 的描边提示移到外框）；上下文改为饼图加百分比（`ContextUsageRing`，灰色，≥90% 变红）；发送键圆形，空时灰；运行中有字时出现「引导」「后续消息」（回车行为不变，仍是后续消息优先）和单独的停止键（`showRunChoices`）。
  5. [x] 运行中：工作过程改为平的一行，运行中加跳动蓝点；侧栏运行中转圈改灰、子任务图标改灰（蓝色只表示未读）；选中会话左侧蓝色竖条。
  6. [x] 扩展面板外框：标题取面板第一行（`lib/custom-panel-title.ts`，例如「Smart Compact · 扩展面板」），贴在输入框上方，焦点时描边 +「按键发给面板」，收起/关闭为图标按钮，终端区用代码块底色；`AnsiText` 改用类名，16 色映射到主题色（`app/plus.css` 的 `.ansi-*`），256 色/真彩色仍内联。
- 已真机验证（开发服务器 + 临时会话，验证后已删除）：运行中的三个按钮、工作过程蓝点、侧栏灰色转圈、`/smart-compact` 真实面板。脚本：`C:\pi-project\plus-shots\run-shot.mjs`。
- 和效果图不同、有意保留的：回车在运行中仍发「后续消息」（效果图假设是「引导」）；回复的模型名仍在回复上方，没有挪到底部信息行；斜杠命令仍会显示成用户气泡（改它要动消息流，另议）；子任务卡（对话里的聚合卡）和侧栏「4/4 完成」需要子任务结束状态的数据，没做。
- **第二批（a7b505a8 之后，已提交未发版）**：侧栏按效果图细调（新建会话改为带 `Ctrl N` 的卡片按钮 `.sidebar-new-kbd`；行统一 4px 圆角；选中行浅灰底不再带阴影；会话时间只在悬停时显示；分组标题 12px 弱化；蓝色竖条只标真正打开的那一行，靠 `.session-tree-item[data-current]`，父会话的整组高亮保留）。组件行内 `fontSize: 11` 全部改成 12（120 处，20 个文件），棘轮基线 186 → 66，剩下的主要是 10px 徽章，需要逐个看。
- 没做的：Fluent 图标替换（236 个手写 SVG，要新增 `@fluentui/react-icons`，先出预览再做）；10px 徽章和 15/18/19px 零星字号。
- 测试：全部组件测试 1021 过，7 个失败都是改动前就有的（FileViewer 4 项 CRLF、`FileTreeResizer` 第 3 项、artifacts 哨兵、restored-wiring 第 5 项）。
- 预览不碰用户设置：`C:\pi-project\plus-shots\app-shot.mjs <名字> <会话id> <dark|light> plus` 和 `app-views.mjs`（新建页、右侧面板、窄窗口）在页面里临时把主题设成 `plus`，拦截所有 `/api/plus-prefs` 写请求。注意用户主题的样式 `#plus-user-theme` 用 `html[data-plus-theme]:root` 选择器，不移除会盖住内置主题。
- **读截图判断深浅色不可靠**（缩略图会把深色看成浅色），颜色以 System.Drawing 取像素为准。

### 补齐效果图（1.7.1，2026-10-22）

用户指出 1.7.0 和效果图差很多：我之前只按"这一步要改的"看截图，没有和效果图整张并排比。教训：**每块做完都用 `C:\pi-project\plus-shots\compare.ps1 -Mock <效果图> -App <截图> -Out <输出> -Label <说明>` 拼上下对照图逐处核对**。1.7.1 补齐了 13 处（见 CHANGELOG），新增：`hooks/usePlusStyle.ts`（clean / native，输入框新布局只在 clean 下启用）、`lib/model-dot.ts`、`lib/file-type-badge.ts`、`lib/chat-phase-label.ts` 的 `lastSlashCommand`、侧栏 `footer` 属性和 Ctrl+K、`CHAT_CONTENT_WIDTH_DEFAULT` 760。
- 仍和效果图不同：改动卡没有「查看全部改动」（Plus 没有全部改动的视图，右侧 diff 标签在上游就被注释掉了，要做得新做 diff 面板）；回复底部没有「重试 / 分支」（助手回复本来没有这两个功能）；对话里的子任务汇总卡和侧栏「4/4 完成」（缺子任务成败数据）；标题栏「运行中」不带计时（拿不到这一轮的开始时间）；斜杠命令仍显示为用户气泡。
- 开发服务器坑：运行中做 `git stash` 会把 Turbopack 路由表弄坏（多个 API 404、Next 提示 1 Issue），停掉服务、删 `.next/dev` 重启即可。**别按 ExecutablePath 统计正式版进程**：开发服务器用的是正式版自带的 node.exe；看 `pi-agent-plus.exe` 和 `desktop-server.cjs` 两个进程，正式版端口可能是 38572。

## 待办 / 候选

- [ ] **WSL 支持**（用户 2026-10-21 提出，参考 Codex）：方案已给用户，等确认。要点见下方「WSL 调研」。
- [ ] 暂缓的上游项：#1324 工具参数按行显示（先出预览）、1280e4f6 模型页文案。
- [ ] 1.5.0 / 1.6.0 的使用反馈（时间线、外观页预览、扩展标签）。
- [ ] 设置页搜索（老点子，未做）。
- [ ] `components/AppShell.file-viewer-state.test.mjs` 4 项在本机工作区（CRLF）上失败，改动前就如此：测试用 `\n` 在源码里找文本。CI 上是 LF，应该能过；要么让测试先把 CRLF 换成 LF。
- [ ] 两个历史遗留的失败测试（1.6.0 之前就失败，与本次无关）：`components/fork-extractions.test.mjs` 的 artifacts 哨兵（`useArtifactPublisher(` 标记）、`components/restored-wiring.test.mjs` 第 5 项（运行结束刷新右侧文件树）。值得查一下是测试过时还是功能丢了。
- [ ] 不做的事：会话标题的悬停提示、主题卡片的悬停预览、#1183。

## WSL 调研（2026-10-21，实测）

- 机器：WSL2 Ubuntu-24.04（默认发行版），**没有** `C:\Windows\System32\bash.exe`；WSL 里没有 node（`pi` 通过 interop 找到的是 Windows 的）。Git Bash 在 `C:\Program Files\Git\bin\bash.exe`；pwsh 7 是商店版（PATH 里的 `WindowsApps\pwsh.exe`）。
- 用 Node `spawn("wsl.exe", ["--cd", <Windows 路径或 \\wsl.localhost UNC>, "--exec", "bash", "-lc", cmd])`：引号、中文、退出码都正确，`/mnt/c/...` 自动换算；每条约 115–170 ms；`taskkill /T` 结束 wsl.exe 时 Linux 里的子进程也会退出；WSL 里能调 `powershell.exe`（约 360 ms）。
- **性能**：在 WSL 里对 `/mnt/c` 上的本仓库跑 `git status` 要 6.1 s，Windows 原生 75 ms。Windows 盘上的项目不适合用 WSL 跑命令；放在 `~/` 里的 Linux 项目才合适。
- pi 的 bash 工具支持传入自定义 `operations`（`createBashToolDefinition(cwd, { operations })`），可以用一个内置扩展把 `bash` 换成走 `wsl.exe` 的版本；`shellPath` 只能指向接受 `-c` 的 bash，不能直接指向 `wsl.exe`。
- Codex 的做法：「Agent 环境」（Windows 原生 / WSL，全局，改完要重启）和「集成终端」（PowerShell / CMD / Git Bash / WSL）分开设置；社区要求按项目设置（openai/codex#17173）。

## Shell 评测（2026-10-21）

- `C:\pi-project\shell-bench\`：Opus 5.5 / Sonnet 5.5 / Gemini 4 Argon / DeepSeek V4.1 Flash × PowerShell 7 / Git Bash / WSL × 8 个任务 × 2 次 = 192 次。成功率几乎一样，没有 shell 语法错误；WSL 费用比 PS7 少 0–28%（DeepSeek 最多）。结论：Windows 默认 PS7 即可，WSL 选项只对 Linux 项目有价值，优先级下调。`wsl-bash.ts` 可作 WSL 扩展原型。

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

- **不要同时开两个会话改这个仓库。** 2026-10-22 发版期间另一个会话同时做了第二批，两边各写了一节侧栏样式，后来合并成一节（`plus-theme.css` 的 `sidebar (redesign batch 2)`，只在 ≥769px 生效）。
