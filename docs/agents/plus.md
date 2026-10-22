# Pi Agent Plus 开发手册（长期知识）

> 本文件是 Plus 分支的“常识层”：环境、命令、代码地图、规则、发布与上游跟进。
> 当前进度、待办和交接信息在 [plus-status.md](plus-status.md)，每次工作结束都要更新它。
> 用户用中文交流，回复用中文。

## 1. 项目是什么

- **Pi Agent Plus**：用户 fish9988 的个人桌面版，**只做 Windows、只给自己用**。
- 仓库 `C:\pi-project\pi-agent-desktop-more` = GitHub `fish9988/pi-agent-desktop-more`，工作分支和默认分支都是 **`plus`**。
- 来源：`abcwyc/pi-agent-desktop`（= `agegr/pi-web` 0.10.0 + Tauri 2 外壳）。和 pi-web 的 merge-base 是 `6fcd7d44`（v0.10.0）。
- **完全独立**，有自己的名字、标识（`com.fish9988.pi-agent-plus`）、端口、程序名（`pi-agent-plus.exe`）和更新签名钥匙，只从 fish9988 的 Release 升级。
- **不同步上游，也不自动更新上游代码。** 上游改动只**手工挑拣/移植**，每周的自动报告只负责列出改动（见 §8）。
- 版本号独立：`plus-version.json` 的 `version` 是 Plus 版本（显示为 v1.5.0）；`upstream` 记录基于的 Pi Agent 版本（0.7.5）。

## 2. 用户机器上的运行环境（务必先读）

| 东西 | 位置 / 值 |
|---|---|
| **用户日常用的正式版** | `D:\Pi Agent Plus`，端口 **38571**。**本 Agent 对话很可能就跑在它里面。** |
| 测试版（与正式版并存） | `D:\Pi Agent Plus Test`，端口 **38591**，程序 `pi-agent-plus-test.exe`，设置文件 `plus-prefs.test.json` |
| 开发服务器 | `127.0.0.1:30141`（`next dev`） |
| 会话、模型、主题等数据 | `~/.pi/agent/`（所有安装共用） |
| Plus 的设置镜像 | `~/.pi/agent/desktop/plus-prefs.json`（测试版用 `plus-prefs.test.json`） |
| 用户主题 | `~/.pi/agent/desktop/plus-themes/*.css` |
| 优化提示词设置 | `~/.pi/agent/desktop/plus-prompt-optimizer.json` |
| 截图 / Playwright 脚本 | `C:\pi-project\plus-shots\` |
| 研究用的其它仓库 | `C:\pi-project\research\`（opencode、PI-Desktop 等） |
| 更新签名密钥 | `C:\pi-project\plus-keys\`（不在仓库里；GitHub secrets 已配置好） |

**正式版的禁止事项：**
- 不要结束 `D:\Pi Agent Plus` 的任何进程。
- 不要覆盖安装到 D:\Pi Agent Plus。
- 不要改动 `plus-prefs.json`。

要验证新版本，用测试版（§7.3），或者让用户自己在应用里点「更新」（会重启程序，Agent 正在运行时别点）。

## 3. 开发环境的坑

- **Agent 的 shell 继承了桌面程序的环境**：`NODE_ENV=production`、`__NEXT_PRIVATE_*`、`PORT` 等变量都是桌面程序带来的。PATH 里的 `node` 也是 `D:\Pi Agent Plus\resources\node\node.exe`。
  - 跑 npm、eslint 或测试之前，先执行 `$env:NODE_ENV="development"`。
- 启动开发服务器（日志写到 `%TEMP%\plus-dev.log`）：
  ```powershell
  cmd /c "set __NEXT_PRIVATE_ORIGIN=&& set __NEXT_PRIVATE_STANDALONE_CONFIG=&& set PI_WEB_PARENT_PID=&& set PORT=&& set NEXT_DEPLOYMENT_ID=&& set NODE_ENV=development&& npx next dev -H 127.0.0.1 -p 30141" > $env:TEMP\plus-dev.log 2>&1
  ```
  - 用 `Start-Process` 或后台方式启动。
  - 想看测试版的效果，再加 `set NEXT_PUBLIC_PLUS_FLAVOR=test&&`。
- 停止开发服务器：只结束命令行里同时含 `next` 和 `30141` 的 node 进程：
  ```powershell
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? { $_.CommandLine -match 'next' -and $_.CommandLine -match '30141' } | % { Stop-Process -Id $_.ProcessId -Force }
  ```
  **不要**按名字结束所有 node 进程，那样会把正式版也杀掉。
- **本机没有 Rust 和 Visual Studio**。Tauri 和 Rust 部分只能靠 GitHub Actions 编译，改 `src-tauri/` 时要格外小心语法。
- **不要在开发时运行 `next build`**，它会污染 `.next/`。
- `next dev` 每次启动都会往 `AGENTS.md` 末尾追加一段 “This is NOT the Next.js you know”。提交前检查，删掉这段。
- 客户端组件**不能 import 用到 `node:fs` 的模块**，否则 Turbopack 会 panic。共享的常量和类型要拆到 `*-shared.ts`（例如 `lib/prompt-optimizer-shared.ts`）。
- 文件是 **CRLF** 换行。大段修改可以用临时 Node 脚本：
  - 写一个 `edit(path, [[old, new], ...])`，要求每个 old 恰好匹配一次。
  - 读入后先转成 LF 处理，写回时恢复 CRLF。
  - 路径里有 `[id]` 时，PowerShell 要用 `-LiteralPath`。
- GitHub CLI 不在 PATH 里：`$env:Path += ";C:\Program Files\GitHub CLI"`。

## 4. 检查与测试

```powershell
cd C:\pi-project\pi-agent-desktop-more; $env:NODE_ENV="development"
npx tsc --noEmit -p tsconfig.json
npx eslint components lib hooks app scripts --quiet
```

- **完整的 `npm test` 会卡住**，只跑相关的测试文件：
  ```powershell
  node --experimental-strip-types --test --test-concurrency=4 <files...>
  ```
- 1.5.0 发布时用的文件集合，跑出来是 625 项全部通过：
  ```powershell
  $files = @(Get-ChildItem components -Filter *.test.mjs | ? { $_.Name -match 'ChatAppearance|SettingsPanel|ChatWindow|ChatInput|MessageView|FileExplorer|AppUpdates|ConversationNavigator|MarkdownBody|MermaidBlock|ExtensionWidgets|ExtensionStatus' } | % FullName) + @(Get-ChildItem lib,hooks -Filter *.test.mjs | ? { $_.Name -match 'message-display|branding|session-title|plus-features|app-updates|session-timing|rpc-manager|session-stats|markdown-blocks|highlight-queue|streaming-message|useAgentSession|session-view-cache|session-reader|settings-navigation|turn-written' } | % FullName) + @("scripts\upstream-css-baseline.test.mjs","app\css-variables.test.mjs")
  node --experimental-strip-types --test --test-concurrency=4 @files 2>&1 | Select-String '^not ok|^# (pass|fail)'
  ```
- **上游的很多测试是对源码文本做正则断言。** 把代码挪到别的文件或改写之后，相应的测试要同步改，并在测试里留注释说明 Plus 改了什么。不要直接删断言。
- Plus 自己的逻辑测试集中在 `lib/plus-features.test.mjs`，用 jiti 导入 TS。新增纯逻辑时在这里补测试。
- 浏览器验证用 Playwright 加系统自带的 Edge：
  - 启动参数：`chromium.launch({ channel: 'msedge', headless: true })`，从仓库的 `node_modules/playwright` 引入。
  - 测滚动条时加 `ignoreDefaultArgs: ['--hide-scrollbars']`。
  - 打开设置：点侧栏底部的 `.sidebar-footer-settings`（1.7 起设置从侧栏顶部挪到了底部）。打开外观页：点 `.settings-section-tab` 里的「外观」。
  - 测试用的长会话：`?session=01a14f88-25cf-77da-b684-c2e5c1e8e659`。
  - 需要真实跑 Agent 时，在 `C:\pi-project\plus-shots` 里新建会话做小任务，验证完用 `DELETE /api/sessions/<id>`（带 `Origin` 头）删掉。
- 检查已安装的程序：设置环境变量 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9334` 后启动程序，再用 `chromium.connectOverCDP('http://127.0.0.1:9334')` 连上去。测试版用 9334；正式版以前用过 9333。

## 5. Plus 代码地图

| 功能 | 文件 |
|---|---|
| 品牌、版本、测试版 | `lib/branding.ts`（`PRODUCT_NAME`、`APP_VERSION` 来自 `plus-version.json`、`PLUS_TEST_FLAVOR`）、`plus-version.json` |
| 端口与外壳 | `src-tauri/src/lib.rs`（`desktop_server_port()`，编译期变量 `PI_PLUS_SERVER_PORT`；`choose_port` 最多等 4 秒）、`shell/window.rs`、`shell/platform_tray.rs`（名字取自 `package_info().name`） |
| 设置镜像（localStorage ↔ 文件） | `lib/plus-prefs.ts`（`PLUS_PREFS_SEED_SCRIPT` 放在 `<head>` 最前面）、`app/api/plus-prefs/route.ts` |
| 主题系统 | `lib/plus-theme.ts`（设置、字体栈、初始化脚本）、`lib/plus-theme-catalog.ts`（调色板转 CSS 变量、内置主题、`compileThemeCss`）、`lib/plus-user-themes.ts` 加 `app/api/plus-themes/**`、`lib/plus-theme-import.ts`（导入 VS Code 主题）、`lib/plus-theme-gallery-opencode.ts`（由 `scripts/build-theme-gallery.mjs` 生成）、`hooks/usePlusTheme.ts`、`components/PlusAppearanceRuntime.tsx`、`PlusThemeEditor.tsx`、`PlusThemeGallery.tsx` |
| 字体 | `lib/system-fonts.ts` 加 `/api/system-fonts`、`components/FontPicker.tsx`（角色：ui、chat、chatBold、code） |
| 外观设置页 | `components/AppearanceSettingsPage.tsx`、`AppearancePreview.tsx`（用真实组件渲染示例对话）、`PlusAppearanceSettings.tsx`、`lib/settings-navigation.ts`（分区 `appearance`） |
| 聊天宽度与字号 | `hooks/useChatAppearance.ts`（`terminalFontSize()` 让终端跟随聊天字号，移植 pi-web #1329）、`components/ChatColumnResizeHandles.tsx` |
| 工作过程 | `lib/work-details.ts` 加 `hooks/useWorkDetails.ts`（四档：精简、标准、详细、完整）、`components/WorkGroups.tsx`、**时间线** `lib/work-timeline.ts` 加 `components/WorkTimeline.tsx`（只在精简、标准档使用） |
| 流式渲染（移植 pi-web #1191） | `lib/streaming-message.ts`（`createStreamingStore`）、`hooks/useStreamingSelector.ts`、`components/LiveStream.tsx`；`useAgentSession` 返回 `streamingStore` |
| Markdown 与高亮性能（移植 #1176、#1181） | `lib/markdown-blocks.ts`、`lib/highlight-queue.ts`、`components/MarkdownBody.tsx`、`MermaidBlock.tsx` 里的 `CodeBlock` |
| 输入框下方的扩展标签 | `components/ComposerExtensionsChip.tsx`（通过 `ChatInput` 的 `controlsAddon` 放入） |
| 优化提示词（✨） | `components/PromptOptimizeButton.tsx`、`lib/prompt-optimizer*.ts`、`app/api/prompt-optimize/**`、`PromptOptimizerSettingsSection.tsx` |
| 对话内搜索（Ctrl+F） | `components/ChatFindBar.tsx` |
| 文件树的增删改 | `components/FileTreeOps.tsx`、`lib/file-ops.ts`、`/api/file-ops`（删除进回收站） |
| 回复底部的用量 | `MessageView.tsx` 里的 `formatUsageCompact`，鼠标悬停时显示完整明细 |
| 上游跟进 | `scripts/upstream-report.mjs`、`scripts/upstream-reviewed.mjs`、`.github/upstream-reviewed.json`、`.github/workflows/upstream-watch.yml` |

## 6. 样式与界面规则

- **Plus 的 CSS 只写在 `app/plus.css` 和 `app/plus-theme.css`。** 它们在 `layout.tsx` 里最后引入。
- `globals.css` 和 `settings.css` 必须与上游**逐字节一致**，`scripts/upstream-css-baseline.test.mjs` 会检查。`native-theme.css` 属于 abcwyc 那一层，尽量也别动。
- 主题负责整个外观：
  - 调色板主题一律基于 `clean`。
  - 引擎规则写在 `plus-theme.css` 里，用 `:where(html[data-plus-style="clean"])`。
  - 语法高亮颜色映射到 `--plus-syn-*`。
  - custom.css 只是可选的叠加层（`customCssOverlay`，默认关闭）。
- **设计阶梯（1.7 起）**：字号 12/13/14/16/20、圆角 4/8/12、间距 4 的倍数，CSS 用 `--plus-fs-*`、`--plus-r-*`、`--plus-s*`，组件行内样式用 `lib/plus-design-scale.ts` 的 `scaleVar()`。`lib/plus-design-scale.test.mjs` 是只降不升的棘轮：新代码不要再写阶梯外的字号和圆角；迁移一批后把基线调低。
- **重设计层**：`plus-theme.css` 末尾的 "Redesign layer" 按步骤分组（外壳、消息、输入框、运行、扩展面板），覆盖前面的引擎规则。外壳只在 ≥769px 生效；新元素（改动卡目录、运行中按钮、扩展面板外框、ANSI 色）的基础样式在 `plus.css`，对所有主题生效。
- 弹层统一使用 zIndex 2400，否则会被设置窗口挡住。
- 动效都要用 `prefers-reduced-motion` 包起来。
- 文案走 i18n。三个语言文件 `lib/i18n/messages/{en,zh-CN,zh-TW}.ts` 都要加，新键插在 `"plus.appearanceTitle"` 前面。
- 用户偏好：
  - **改界面前先给效果预览**，用截图或 artifact。
  - 喜欢实时预览，不要“悬停预览”。
  - 喜欢 Georgia 配 Noto Serif SC 的衬线搭配，喜欢舒适、低疲劳的对比度。
  - 当前用户设置（以 `plus-prefs.json` 为准）：主题是 carbonfox 调色板，界面字体是 HarmonyOS Sans SC。

## 7. 构建、发布、验证

详细流程见仓库根目录的 [VERSIONING-PLUS.md](../../VERSIONING-PLUS.md)。下面是速记。

### 7.1 CI（`.github/workflows/plus-windows-build.yml`）
- 推送到 `plus`：构建 `-dev.N` 版本的 artifact。只改 `*.md` 或 `docs/**` 时不触发。
- 推送 tag `vX.Y.Z`：构建并发布 Release，附带 `latest.json` 和签名，应用内的「更新」读的就是它。**tag 必须与 `plus-version.json` 一致。**
- 手动触发并选 `flavor=test`：构建测试版（`<版本>-test.<run>`，端口 38591，独立的标识和设置文件，没有更新功能）。
- 一次构建大约 8–14 分钟。可以用 `gh run watch <id> -R fish9988/pi-agent-desktop-more --exit-status --interval 30` 等结果。
- 上游留下的 `ci.yml`、`release.yml` 等工作流对 `plus` 没有作用，忽略即可。

### 7.2 发版步骤
1. 跑 tsc、eslint 和相关测试，全部通过。
2. 版本号规则：新功能升 MINOR，修复升 PATCH。修改 `plus-version.json`。
3. 在 `CHANGELOG-PLUS.md` 最上面加 `## [X.Y.Z] - 日期`，用中文写面向用户的说明。
4. 提交并推送 `plus`，然后 `git tag -a vX.Y.Z -m "Pi Agent Plus X.Y.Z"` 并推送 tag，等 CI 完成。
5. 确认 Release 里有 `latest.json` 和 `Pi-Agent-Plus_X.Y.Z_x64-setup.exe`，然后告诉用户到「设置 › 常规 › 版本与更新 › 更新」升级。

### 7.3 用测试版验证（不碰正式版）
```powershell
$env:Path += ";C:\Program Files\GitHub CLI"
gh workflow run plus-windows-build.yml -R fish9988/pi-agent-desktop-more --ref plus -f flavor=test
# 完成后下载 artifact，静默安装到单独的目录
gh run download <runId> -R fish9988/pi-agent-desktop-more -D C:\pi-project\plus-builds\test-x
Start-Process "<…>\Pi Agent Plus Test_*_x64-setup.exe" -ArgumentList '/S','/D=D:\Pi Agent Plus Test' -Wait
```
验证完只结束 `D:\Pi Agent Plus Test\*` 下的进程。注意：测试版和正式版共用 `~/.pi` 里的会话，两个程序不要同时打开同一个会话。

## 8. 跟进上游

- 远程仓库：
  - `origin`：fish9988，可以推送。
  - `upstream`：abcwyc，推送已禁用。
  - `piweb`：agegr/pi-web，推送已禁用。v0.12.2 是 `b017cd48`。
- **不整体合并。** 试合 pi-web 0.12.2 时有 111 个文件冲突、约 5 万行，所以只 cherry-pick 或者手工移植。
- 每周一 01:00 UTC，`upstream-watch.yml` 会把新提交汇总成 Issue（#1 是第一份）。用户选好要哪些后，移植完运行 `node scripts/upstream-reviewed.mjs` 记为已看。
- 已移植的：
  - pi-web #1176、#1181、#1191（性能），#1334、#1345、cf3ebfba（预览密钥轮换），1ddaf11f（#1039）。
  - 1.6.0（周报 #1）：#1307、#1319、#1323、#1287、#1318、42909b6d、#1304、#1331、#1288、#1308、#1280、#1329、#1306。
- 移植前先**实测**：把上游的触发条件喂给 Plus 自己的代码，确认问题真的存在再移植。上游自带的测试多是源码文本断言，在 Plus 上失败不代表有 bug。
- 周报 #1 里判定为不需要的：#1303、#1310、#1313（Plus 已有自己的做法），#1309、#1311（Plus 没有对应界面），#1292（只影响多个浏览器标签页），手机/e2e/Homebrew 相关提交。
  - pi-web 5a2f991b（#1307 子目录后仍能打开仓库根会话）、bc762a3e（#1319「在此提问」光标留在引用末尾）、7c0778a8（#1318 改过名/自动生成标题的会话搜索）、35af7102（#1329 终端跟随聊天字号）、42909b6d（.agents/skills 归到 skills.sh 分组）。
  - abcwyc #127。
- 已决定不移植：#1183（代码语言按需加载）。Plus 本来就静态注册了 33 种语言，用不上。
- 暂缓：#1324（工具参数按行显示，会和工作时间线冲突，需要先出预览）、1280e4f6（模型页文案精简）。
- abcwyc 那一层的规则（上游合并哨兵、拒绝过的 UI 等）见 `AGENTS.md` 后半部分和 `docs/agents/fork-*.md`，仍然有效。

## 9. Plus 硬规则（违反过就出过问题）

1. 不覆盖、不结束、不改动 `D:\Pi Agent Plus` 及其设置。验证一律用测试版或开发服务器。
2. 不把上游当成同步源：不加自动同步，不整体 merge。
3. 上游的 CSS 文件逐字节不动，Plus 的样式写进 `plus*.css`。
4. 客户端代码不引用 `node:fs` 系的模块。
5. tag 必须等于 `plus-version.json`；每次发版都写 CHANGELOG-PLUS.md。
6. 改源码要同步改对应的源码文本测试。不靠删断言让测试变绿。
7. 签名私钥和密码绝不进仓库，也不打印出来。
8. 结束一次工作前更新 [plus-status.md](plus-status.md)。
