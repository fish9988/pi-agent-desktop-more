# Pi Agent Plus 更新日志

Pi Agent Plus 是 [abcwyc/pi-agent-desktop](https://github.com/abcwyc/pi-agent-desktop) 的个人二次开发版（仅 Windows），
与官方版可同时安装、互不覆盖。版本规则见 [VERSIONING-PLUS.md](./VERSIONING-PLUS.md)。

## [1.24.0] - 2026-11-03

打造**「Pi 原生 + DSH 全栈」双轨插件架构（Dual-Plugin Engine）**，彻底突破 `pi-web` 仅支持后端 TUI 扩展的局限，原生兼容 `@deepseek-ai/ds-harness`（DSH / Cordis）双入口全栈 GUI 插件，并修复输入框左侧弹出菜单裁切、侧栏搜索聚焦与非 Pi 原生假按钮问题。

### 一、 「Pi 原生 + DSH 全栈」双轨插件引擎

- **DSH 后端 Host 运行时与 API 路由网关（`lib/dsh-plugin-host.ts`、`app/api/dsh-plugins/**`）**：
  - 自动扫描并发现 `~/.pi/agent/dsh-plugins/node_modules` 与本机 `~/.dsh/profiles/desktop/node_modules` 下安装的 DSH 插件（如 `dsh-supermemory`、`dsh-image-studio`、`dsh-exa-search`、`dsh-skill-mcp-panel`、`dsh-rewind-plugin` 等），持久化启用状态与独立配置至 `~/.pi/agent/desktop/dsh-plugins.json`，并自动兼容读取 `~/.dsh/.credentials.yaml` 凭据库引用；
  - 完整实现 Cordis 风格 `ctx` 宿主接口：`ctx.tools.register`（自动将 Schemastery / JSON Schema 转为 TypeBox 注入 `AgentSession`）、`ctx.systemPrompt.section`（动态追加系统提示词分段）、`ctx.on("agent/pre-step" | "agent/turn-stopping")`（回合前后生命周期钩子）、`ctx.connection.fetch.register` & `ctx.webServer.register`（通过 `/api/dsh-plugins/rpc/[...slug]` 暴露插件专属 HTTP/RPC 路由）及 `ctx.effect` 停用清理。
- **DSH 前端 Client 运行时、AMD/CJS 沙箱与 React 插槽系统（`lib/dsh-plugin-client.tsx`）**：
  - 新增 `/api/dsh-plugins/client/[name]` 路由与浏览器端 AMD `define(...)` / CommonJS 模块沙箱，向插件 `lib/client.js` 注入宿主 `react`、`react-dom`、`react/jsx-runtime` 与 `@deepseek-ai/dsh-client-ui-primitives` 组件原语（`Tooltip`、`Switch`、`DisclosureRow`、`Menu`、`Toast` 等），自动重写插件 `fetch("/api/...")` 请求至本地 RPC 网关；
  - 自动注入 `--dsw-alias-*` / `--dsw-specific-*` 主题令牌桥接层，使 DSH 插件自带样式在 Pi Agent Plus 的浅色与深色主题下均拥有原生边框、卡片层级与陶烬橙主按钮；
  - 实装响应式 `useDshPluginSlots` 与 `<DshPluginSlot />`（含独立 ErrorBoundary 隔离），支持 `plugins.item`（插件管理台页面）、`tool.call.toolview`（`MessageView.tsx` 工具调用自定义 React 卡片，如 `image_generate` / `image_upscale`）与 `conversation.session.header.utilities`（顶栏右侧插槽），关闭插件时自动卸载全部 `<style>` 与插槽，零残留热插拔。
- **设置 › 插件双轨管理台（`components/PluginsConfig.tsx`）**：
  - 在「已安装」页顶部新增「**DSH 全栈插件（前端 UI + 工具网关）**」专区，展示插件能力标签（`前端界面 (Client UI)`、`工具 ×N`、`RPC 路由 ×N`）、一键开关与「配置界面」入口；
  - 点击已启用的 DSH 插件直接挂载其 `plugins.item` React 管理台（实测 `dsh-supermemory` 记忆库管理与检索测试、`dsh-image-studio` 生图/图库/超分工作台、`dsh-exa-search` 搜索配置均在窗口内完整交互运行）。

### 二、 界面去伪存真与弹出菜单裁切修复

- **修复输入框左侧弹出菜单被侧栏裁切一半的 Bug（`components/ChatInput.tsx`、`app/plus-theme.css`）**：修复 `完全权限`（`.composer-tool-menu`）、`⚡ 快捷短语`（`.composer-quick-phrases-menu`）与 `⚙ 自动化` 挪至底栏左侧后仍按 `right: 0` 向左展开导致左半边飞入侧栏被裁切的问题，统一改为向右展开；同时修复右侧 `High` 思考菜单（`.composer-run-menu`）靠右对齐防溢出。
- **移除非 Pi 原生假按钮并补齐真实交互（`components/AppShell.tsx`、`components/SessionSidebar.tsx`、`components/MessageView.tsx`）**：
  - 移除顶栏硬塞的 `智能体团队 / 创造模式` 假按钮、右上角重复的彩色文件夹按钮、侧栏顶部 `应用 / 编辑` 假菜单与消息底栏无后端的 `👍 / 👎 / 分享` 图标，顶栏恢复展示真实的会话名、项目路径胶囊、Git 分支、子代理切换与运行计时；
  - 修复点击侧栏「工作区」放大镜按钮或按 `Ctrl+K` 因 `visibility: hidden` 无法聚焦搜索框的问题；保留非空纯对话分组（`对话 (N)`）与折叠项目的会话计数徽章；提升发送按钮启用态（陶烬橙实心高亮）与禁用态对比度。

## [1.23.0] - 2026-11-03

完整移植 `Nwflower/dsh-claude-style`（Claude Code Desktop 深度定制主题与交互），在保留 Pi Agent Plus 原有全部功能与扩展入口的基础上，1:1 复刻 Claude Code Desktop 的界面骨架、色板材质、像素小螃蟹桌宠与切缝饼图。

### 一、 外壳、左侧栏与无界通顶顶栏

- **无界通顶画布与精确色板（`lib/plus-theme-catalog.ts`、`app/plus-theme.css`）**：`clean`（Claude Code · 桌面）主题升级为 `#ffffff` 纯白画布 + `#fafafa` 浅灰侧栏（深色 `#191919` / `#1f1f1f`）、`#d97757` 陶烬橙强调色、`#943333` 暖红行内代码胶囊与 `#f4f4f4` 表头圆角表格；左侧栏 1px 细分割线通顶到底，主对话区与顶栏融为同一张无框画布。
- **左侧栏 Claude 品牌行与五合一导航区（`components/SessionSidebar.tsx`、`components/AppShell.tsx`）**：
  - 顶栏左侧提供折叠按钮与 `应用 / 编辑` 快捷入口；
  - 下方 `✳ Claude` 官方星芒 + 衬线词标与搜索框共享同一网格槽位，鼠标悬停、按 `Ctrl+K` 或输入关键词时丝滑切换为搜索框；
  - 内置 `+ 新会话`（圆形 `+` 徽章）、`🧩 插件`、`📄 Skill / MCP`、`🕓 自动化任务`、`⋯ 更多`（直达 MCP 服务器、模型与服务商、智能体团队、外观与常规设置）五项导航行；
  - `工作区` 分组配备搜索、双滑块视图过滤与新建项目文件夹按钮，项目子会话行采用空心圆点 `○` + 右侧常驻相对时间（悬停切换为 `⋯` 操作菜单），选中态为柔和圆角胶囊；
  - 侧边栏底部固定个人画像（`海里的鱼 ⌄`，自动向上弹出防越界）与设置、深浅色切换按钮。
- **双行会话顶栏与右侧项目文件夹下拉（`components/AppShell.tsx`）**：顶栏左侧第一行显示会话标题（自动省略防碰撞），第二行常驻 `👥 智能体团队` 与 `☁ 创造模式` 快捷入口；右侧配备彩色文件夹切换按钮、历史、更多菜单与右侧面板开关。

### 二、 输入卡片、像素小螃蟹 Clawd 与双扇区切缝饼图

- **像素小螃蟹桌宠 Clawd（`components/ComposerMascot.tsx`、`lib/crab-sheets.ts`）**：完整移植 `dsh-claude-style` 的 19 套预留边距精灵表与双层墨色遮罩，站在输入框右上沿；实时跟随会话状态（空闲呼吸、东张西望、招手、掏笔记本敲键盘、思考泡泡、打字、指挥子代理、上下文压缩、报错摇晃、完成欢呼、60 秒静置入睡与唤醒），支持左戳、右戳、双击敲电脑、四连击挠痒与拖拽提溜交互。
- **单行自适应输入卡与底栏重排（`components/ChatInput.tsx`、`components/ModelSelector.tsx`）**：输入框默认收紧为单行卡片，右侧内置 `↵` 回车发送键（运行中切换为停止键），工具控制栏独立排布于卡片正下方：左侧为 `完全权限`（工具预设）+ `+` 附件 + 扩展与快捷短语，右侧为 `模型名 · 服务商` + 随档位着色的推理强度（`High` 陶烬橙）+ 上下文用量饼图。
- **双扇区切缝上下文饼图（`components/ContextUsageRing.tsx`）**：移植 `context-meter-pie.ts` 的双 SVG 遮罩切缝算法，小占比扇区自动外推突出，配合绿/黄/红三段语义色与百分比读数常驻显示。

### 三、 极简思考折叠、消息底栏与右缘刻度导航

- **无框思考折叠与圆角表格材质（`components/MessageView.tsx`、`app/plus-theme.css`）**：思考与工作过程触发行去除厚重外框，改为清爽行内折叠；Markdown 表格去除斑马纹，采用 `#f4f4f4` 表头与 1px 细分割线。
- **Claude 风格消息底栏与右缘横线刻度（`components/MessageView.tsx`、`components/ConversationNavigator.tsx`）**：助手回复底部依次排列复制、点赞/点踩、分享、圆柱图标 + `用量 XXK tok`（悬停展开完整输入/输出/缓存/速率明细）与时间戳；右侧对话导航改为极简水平短横线刻度（当前回合加长加深，悬停才浮现列表按钮）。

## [1.22.0] - 2026-11-03

全量移植上游三仓（`@earendil-works/pi` 1.5.0、`agegr/pi-web` v0.13~0.14.1、`abcwyc/pi-agent-desktop` v0.7.8~0.8.1）的核心更新，落地 GitHub 社区高赞工程功能（快捷短语、精选插件汉化、自包含主题 HTML 导出、公式 LaTeX 还原），并一口气清掉人类视角全流程实测抓出的全部界面崩坏、交互卡点与未汉化死角。

### 一、 聊天、虚拟化与阅读体验

- **双向虚拟窗口与向上翻页防抢滚轮**：`lib/message-index.ts` 支持全量/未挂载条目的几何估算与高度缓存，`ChatWindow.tsx` 接入双向虚拟窗口（自动卸载远离视口的 DOM 节点）；翻页后的锚点保持一旦检测到用户主动滚轮/拖拽立即让出控制权，且在请求飞行期锁定折叠组高度差，消除 `-44px` 跳动与“滚轮被往回拽”的手感。
- **修复回答底部分支切换 `‹ 2/2 ›` 报错与 `custom` 节点断链**：移除 `forwardBranchData` 冗余状态回写链路，修复点击分支分页器触发 `Maximum update depth exceeded` 及 `pointerdown` 抢占 `loadContext` 请求的问题；兼容 `plan-mode-state` 等 `custom` 叶节点的压缩分支锚点解析。
- **问题导航与查找栏支持未加载历史**：修复右上角「全部提问」按钮悬停弹出后点击左键反而关闭的问题；当大会话尚未加载全部历史（`hasMore=true`）时，问题导航与 `Ctrl+F` 查找栏均提供「加载更早历史」按钮，不再静默漏检。
- **公式复制还原 `$LaTeX$` 源码 & `svg` 代码块直接预览**：复制含 KaTeX 公式的正文时自动提取 `<annotation>` 中的 `$...$` / `$$...$$` 源码，告别粘出两遍乱码；`$$` 块级公式支持悬停一键复制源码；`` ```svg `` 代码块直接渲染为安全图片预览（支持源码切换、缩放与下载）；超 30 行代码块支持折叠展开与折行开关，行号防选中。
- **划词纯引用块 & 自包含主题 HTML 导出**：划词提问直接插入干净的 `> 选中文本` 引用块；导出会话 HTML 时内联当前 Plus 主题配色变量并将思考与工具调用打包为可交互折叠的 `<details>`。

### 二、 输入框、模型选择与侧边栏

- **图片原图直传 SDK & 超限提示**：取消前端硬编码 1024px / JPEG 0.85 画布压缩，原图直接交给 Pi SDK 按模型上限处理，高分屏代码截图与图表不再模糊；粘贴或选择 >10MB 或超 4 张图片时弹出明确提示，不再静默丢弃。
- **新增 `⚡ 快捷短语`（`QuickPhrasesButton`）**：输入框底部工具栏新增快捷短语按钮，内置 8 条高频工程指令，支持自定义添加与删除（持久化至 `plus-prefs`），点击即通过原生撤销栈插入光标处。
- **聊天模型选择器 `常用 / 全部` 一键切换**：启用常用模型范围（Scoped）时，下拉框顶部支持一键或按 `Tab` 键切换到全量模型。
- **输入框细节打磨**：`/` 斜杠命令菜单不再劫持 `←`/`→` 左右方向键，优先按命令名匹配并剥离 `skill:` 前缀；切会话时自动重置半屏长文展开态；长文附件「转回正文」保留 `Ctrl+Z` 撤销栈；`✨ 优化提示词` 热区放大至 `26×26px` 且空输入时半透明可见。
- **侧边栏与顶栏统计面板优化**：会话行与项目行支持鼠标右键直接弹出操作菜单；点击未手动命名的会话「重命名」时自动预填当前显示标题；会话删除确认条改为紧凑双行完整显示名称；顶栏运行态显示实时秒表（`运行中 · 12s`），子任务按钮显示完成进度；顶栏「会话统计」面板中「会话与文件」卡片跨满整行，完整显示 Session ID 不截断；修复首屏侧栏缓存 Hydration Mismatch。

### 三、 右侧文件面板、改动卡直达对比与内置终端

- **改动卡直达 `对比 (Diff)` 与「查看全部改动」**：每行改动文件右侧新增「对比」按钮直达 Diff 视图，卡片头部新增「查看全部改动」一键展开右侧 Git 变更区；已被后续操作删除的临时文件自动标注「已不存在」。
- **修复 `.svg` / `.csv` / `.tsv` 源码与预览单向死胡同**：切到 `源码` 后顶栏保留 `预览` 切换按钮并正确解析 SVG 文本；源码与视频查看器顶栏补齐「用默认应用打开 / 在资源管理器中显示」；文件树顶部新增「新建文件 / 新建文件夹」按钮，Git 变更区支持「列表 / 树状」视图切换。
- **终端面板顶栏 Shell / WSL 快速切换器**：终端顶栏直接提供 `跟随默认 / PowerShell / CMD / Git Bash / WSL` 下拉切换并立即重启生效，终端底色自动跟随当前主题代码块配色。

### 四、 设置窗口布局、插件市场精选汉化与全局快捷键

- **修复设置窗口 5 大布局与遮挡问题**：①「并排（Docked）」模式下自动降级为单列，消除单字竖排与 28px 下拉框；②「外观」页在默认浮动窗口下零横向溢出（`scrollWidth <= clientWidth`），右侧实时预览卡完整显示；③「全局界面实时预览」浮窗顶部固定 Sticky 退出控制栏；④ 最小化后的设置浮条移至左下角侧栏上方，不再遮挡输入框右上角按钮；⑤ 字体选择器按 `Esc` 仅收起下拉框，不误关设置窗口。
- **全局快捷键补齐与右上角防误触**：实装 `Ctrl+K` 聚焦侧栏会话搜索；修复焦点在输入框时 `Ctrl+\` 无法开关右侧面板的问题；右侧面板收起按钮改用侧栏收起图标并与桌面端系统窗口 `×` 按钮加竖线分隔。
- **插件市场精选汉化与全局汉化收口**：过滤 `@agimon-ai/po-*` 等内部拆包，内置 18 款精选 `pi-package` 插件中文简介与 5 大分类胶囊；全面汉化文件查看器、模型页（`默认/禁用/自定义`、`+ 添加请求头`、OAuth 引导、统一“服务商”与“Pi Agent Plus”）及思考/工具预设菜单；棘轮收紧至 `PLUS_CSS_LITERAL_FONTS = 0`、`PLUS_CSS_OFF_SCALE_FONT = 0`、`COMPONENT_INLINE_LITERAL_COLOURS = 5`、`COMPONENT_OFF_SCALE_FONT = 9`。

### 五、 底层 SDK 1.5.0、WSL Agent `bash` 与后端/Tauri 加固

- **升级 `@earendil-works/pi-*` 至 `1.5.0`、Next.js 至 `16.4.4`、undici 至 `8.12.3`**：流式大工具调用增量解析、Windows 盘符大小写不敏感修复、中文 `tool_search` 分词、修复 DeepSeek V4.1 Flash `prompt_cache_retention` 报错。
- **Agent `bash` 工具打通 WSL + `PI_*` 变量透传**：开启 WSL 命令执行时，Agent 自身的 `bash` 工具同步走 `wsl.exe` 并通过 `WSLENV` 自动透传 `PI_SESSION_ID`、`PI_SESSION_FILE/p`、`PI_MODEL` 等会话变量。
- **Windows 缓存清理保护与 WebView2 崩溃自愈**：修复 Windows 清缓存误删 `EBWebView`、`logs` 与 `plus-prefs` 的问题；订阅 WebView2 `ProcessFailed` 在渲染/GPU 进程崩溃黑屏时自动恢复。
- **后端内存、缓存与安全加固**：会话列表 `firstMessage` 截断至 200 字；闲置热会话上限（最多 4 个或 256MB）；配置文件 `replaceFileAtomicSync` 原子写入；`/api/files` 拦截 `~/.ssh`、`auth.json` 等敏感凭据；扩展模型运行时 1 小时共享缓存与 `/api/models` 秒回旧缓存后台刷新；保持 `<tools>` 顺序稳定防止大模型 Prompt Cache 失效；新增桌面端崩溃诊断页 `AppErrorView`。

## [1.21.0] - 2026-11-02

会话统计换成 DSH 那种卡片式（用户指定参照）：每组一个小卡片，头部是图标 + 标题 + 汇总值，下面一条细线，再往下是「标签 → 右对齐数值」的行。

- 数值改成完整数字（`426,084,910 tok`）而不是 `4.26 亿`，靠 `tabular-nums` 对齐；原来的四块大数字标题块、纯文字段落全部取消。
- 卡片：Token 用量（缓存命中 / 未缓存输入 / 缓存读取 / 输出 / 上下文）、会话统计（活跃时长 / 平均每轮 / 消息 / 工具调用）、花费（总费用 + 按模型排序与占比条）、缓存（状态一句话 + 预计可省）、会话与文件（路径、ID、分支，仍可拷贝）。
- 宽度自适配：宽面板（顶栏下拉）按 `minmax(280px, 1fr)` 自动分栏，窄窗口折成一列，摘要值自动落到标题下一行。
- 中文时长改成 `118小时32分` / `4分59秒`，英文仍是 `8m 2s`。
- 没有加「输出速度（tok/s）」：活跃时长包含工具执行时间，算出来会低到 3 tok/s，宁可少一行也不显示假数字。

## [1.20.0] - 2026-11-02

一次性清掉 `docs/agents/plus-status.md` 里攒的待办：消息列表虚拟化前置、分支切换下沉到回答、查找/导航定位提速、会话读取再提速、设置页搜索、WSL 终端后端、工具参数按行、外链与拖放兜底、测试债。

### 对话

- **虚拟化前置三件**（真正接虚拟列表前必须做完的）：关掉浏览器原生滚动锚定（`overflow-anchor: none`）；把 `content-visibility` 的 240px 高度估算从“所有消息”收窄到代码块/折叠组，并给已挂载消息加 `ResizeObserver` 高度补偿（在视口上方展开折叠组时不再跳动）；**翻页恢复改成按 entryId + 偏移**，并在恢复后最多 1.5s 内继续“按住”那条消息。实测连续 8 次翻页，视口顶部那条消息的偏移差 6 次 ≤ 0.5px、2 次 −44px（翻页请求飞行中折叠组占位符收缩导致），改动前是 300–650px。
- **每条回答 footer 上的 `‹ 2/3 ›` 分支切换**：`lib/branch-decisions.ts` 只把“同一位置下有多个对话分支”当决策点（工具调用扇出、custom 记录不算），当前分支带数字，点击左右箭头直接切；顶栏面板保留为高级地图。
- **查找栏与会话导航不再每帧扫 DOM**：新增 `lib/message-index.ts`（entryId/位置/回合的稀疏索引 + `offsetTop` 链，200ms 懒重建、resize 立即重建）。导航条 40 次滚动从 **7421 次 `getBoundingClientRect` 降到 0**，查找栏每次按键的 DOM 查询降到 0；查找落点与高亮计数逐项比对无变化。

### 服务端

- **详情接口首屏同步计算**从 13.8ms 最坏阻塞降到 3.4–4.2ms（tree/stats/统计改为可让出的生成器驱动 + 派生结果缓存），暖详情 14.5ms → 4.7–5.6ms。顺手修掉两个真 bug：`PI_WEB_PERF=1` 时 payload 被 `JSON.stringify` 两次；派生缓存键漏了 session id，两个“未落盘的 live 会话”会互相拿到对方的 tree/stats。
- **超大单行**：≥8MiB 的行改为协作式扫描，32MB 纯文本行 67–81ms 阻塞降到 8.9–12.8ms——代价是对超过 2MiB 的**文本**字段截断并插入明确标记（图片、thinking、需要保留的 `details` 一律不裁）。
- **>1GB 会话**不再回退同步解析（流式读取取消上限）。
- **窗口载荷落盘缓存**：按文件指纹 + 窗口参数存 `~/.pi/agent/cache/session-context/`（128 个 / 64MiB，先写临时文件再 rename，长度校验）。应用重启后打开 69MB 会话 244–267ms → **12.8–23.5ms**。

### 设置与终端

- **设置页搜索**：Ctrl/Cmd+F（面板内）、↑/↓/Enter 直达、Esc 两段式（先清搜索再关面板），命中项自动展开折叠块并高亮 2 秒；索引从界面本身扫出来（新增设置行不需要再改清单）。
- **WSL 终端后端**：设置里可切“使用 WSL 后端”（发行版下拉，默认跟随 WSL 默认）与“在 WSL 中运行终端命令”（`!` 命令）；Windows 路径自动换算成 `/mnt/c/…`，`\\wsl.localhost\…` 也能识别；终端标题显示 `WSL · 发行版`。六种失败（wsl.exe 不存在、发行版未安装、UNC 路径、目录不可达…）都降级回原生命令行并在面板里说明原因。真机实测：列表 81ms、预检 183ms（缓存后 0ms）、`!` 命令 190–208ms、node-pty 首字节 90ms。Agent 自己的 `bash` 工具仍走原生。

### 外链与拖放

- 按住 Ctrl/Shift/Alt 点外链、以及把 `.html` 文件或链接**拖进窗口**，都不再把应用顶掉：桌面端 guard 现在同时接管修饰键点击和 document 级 `dragover`/`drop`，拖到聊天区/输入框的附件拖放完全不受影响（有契约测试钉住 `.chat-window` 这个放行凭据）。
- 桌面端的「设置独立窗口」按钮隐藏：`window.open` 在 Tauri 里只会交给系统浏览器（丢掉桌面令牌），应用内的浮动/并排模式已覆盖同样需求。

### 工具与测试

- **工具调用参数按行显示**（#1324）：常用工具的参数顺序固定，长值截断并保留 `title`，对象/数组压成一行；流式原始 JSON、diff、文件正文视图保持不变。
- **测试债**：修掉 4 个长期失败的测试（artifacts 哨兵搬家、运行结束刷新文件树、列表 gzip 断言、`AppShell` 的 CRLF 敏感）。
- **`npm test` 不再挂死**：根因是三个 MCP 集成测试在 `t.after` 里 fire-and-forget 地 destroy 之后立刻删临时目录（Windows 上 EBUSY），fixture 子进程泄漏导致 node 永不退出。现在真正 `shutdown()` + 带重试的 `rm`，整套 3375 项 **105 秒**跑完（另有 `--test-force-exit` 兜底）。
- `demo/` 同步了外链兜底这一层（整仓同步仍欠着：见 `plus-status`）。

### 仍然存在的边界

- 还没有真正接虚拟列表（前置已完成，下一步是 `react-virtuoso` + entryId→offsetTop 索引）；
- iframe 内的拖放、以及折叠且条件渲染的设置项（搜索只索引到展开按钮）仍未覆盖；
- 终端设置那段文案仍用 `isZh` 的双语写法（zh-TW 会看到简体），`模型页文案 1280e4f6` 未做。

## [1.19.2] - 2026-11-02

继续修「向上滚动加载更早消息」，这版解决的是「拉了一页之后位置归零、看起来没加载」：

- **阅读位置的恢复之前会被跳过。** 恢复滚动位置的那个 effect 依赖 `visibleCount`，但 `visibleCount` 往往已经比消息数大（早前拉过页或搜索过），`Math.max` 算出来没变化 → effect 不跑 → 新页插到上面之后列表停在「新页的顶部」，看上去就像什么都没发生。现在：
  - `visibleCount` 在 render 阶段就跟着 `messages.length` 长（否则那一页在提交时已经被切掉了）；
  - 恢复位置改成 `useLayoutEffect`、依赖 `messages.length`，在 paint 之前就把锚点摆回去。

- 与 1.19.1 一起生效的前两处（若你还没装）：加载满两页就永久停（判据改成“这页到底带回消息没有”）、以及停在 `scrollTop = 0` 时滚轮不产生 scroll 事件（现在 `wheel` 本身也能触发）；服务端 `hasMore` 不再把 `tool-selection` / `model_change` / `session_info` 这类渲染不出来的簿记算成“还有历史”。

实测（同一个 293 条消息、分支上 35 个用户回合的会话）：连续 5 轮向上滑动 → **14 次分页**、内容高度 1832 → 44749px、提示行仍按真实剩余情况保留；连滑 10 个会话无空白、无控制台错误。

遗留：一页落地后视口停在「新页与旧内容的分界」（也就是你原来读的那条消息仍在屏幕顶部），而不是“精确锁在同一条消息上”——超出这个分界需要你继续往上滑，但每次滑都会真的有新内容。

## [1.19.1] - 2026-11-02

修「向上滚动加载更早消息」的最后一层问题——这个功能前两版还在「滚得动/滚不动」之间随机。两个真原因，一个是前端的，一个是服务端的。

### 1. 加载满两页之后就彻底停了（前端）

1.18.0 加了个“拉一页没变高就不再试”的保护，判据是 `scrollHeight` 有没长大。但这个判断跑在 `loadContext` 自己的微任务里，**React 还没 commit 那次 prepend**，所以看到的永远是旧高度——**两个完全成功的页也会被记成“没变高”**，然后计数器到达 2，这个会话的向上加载就永久关掉了。提示行还在，怎么滚都没反应。

现在判据是“这一页到底有没有带回消息”（`page.messages.length`），带回就归零，只有真的空页才计数。实测同一个 293 条消息的会话：以前 2 页后就死，现在连续拉了 **16 页**直到真正的开头。

### 2. 停在最顶上时，滚轮根本不产生 scroll 事件（前端）

`scrollTop` 已经是 0 时，再往上滚没有可滚动区间，浏览器**不会派发 scroll 事件**，而唯一的触发条件就是“滚到顶的 scroll”。所以停在顶部的状态（如恢复位置后、或上一页刚落地）就是死局。现在 `wheel` 本身也是触发条件（`deltaY < 0` 且已在顶部，rAF 节流）。

### 3. 上面只剩元数据却声称“还有更早的消息”（服务端）

`hasMore` 原来是 `sliced[0]?.parentId` 存在就算 true。但会话文件里最上面往往是 `pi-web:tool-selection` 这类 custom 记录、`model_change`、`session_info`——它们有父节点，却**渲染不出任何东西**。于是窗口其实已经是开头了，界面却还显示“向上滚动以加载更早的消息”，点/滚之后回来一页 0 条消息，什么也没变。

现在 `hasMore` 要求「真正上方还有能渲染的条目」（`restsOnMoreHistory`）：只有簿记条目的窗口一律报 false，提示行消失，不再骗人。

### 验证

新增两条服务端语义测试（簿记不算历史）+ 改写前端两条（空页才计数、轮滚在顶部也能触发）。生产构建实测：293 条消息的会话从 32 条拉到 136 条、连续 16 次分页、提示行直到真正的开头才消失；停在 `scrollTop = 0` 时单次向上轮滚能正常拉页。95 项相关测试全绿。

## [1.19.0] - 2026-11-02

一个大版本：**会话读取不再阻塞事件循环**、**切会话不再白屏**、**外链不再顶掉应用**，以及三处界面改造（分支控件、会话统计、会话恢复）。

### 1. 数据通路：读取会话不再卡住整个服务

之前打开一个 69 MB / 4786 条的会话，服务端会同步读文件 + 逐行 `JSON.parse`，300–400 ms 内事件循环完全阻塞——SSE、状态查询、其他会话的请求全部排队，这就是“UI 偶发卡死”。

- `lib/session-slim-load.ts`：1 MB 分块读、按 Buffer 拼行，约每 1 ms `setImmediate` 让出一次；新增 `openSlimSessionManagerAsync()`。
- `lib/session-reader.ts`：新增 `openSessionManagerAsync()`，与同步版共用同一份 `__piSmCache`；同一文件并发的首次打开会合并成一次解析；任何异常回退同步路径。
- `app/api/sessions/**`（详情 / 分页 / 参考 / 图片 / thinking）与列表预热全部改用异步打开。
- `lib/session-context-cache.ts`（新）：按 `文件路径 + size:mtime + leafId + before + tail/…` 缓存**已序列化好的** context 响应体（LRU 24 条 / 16 MB，单条 4 MB 封顶），`lib/json-response.ts` 命中时直接复用 body，不再重复 `JSON.stringify`。

实测（69.5 MiB / 4786 条）：

| 指标 | 之前 | 之后 |
| --- | --- | --- |
| 事件循环最长连续阻塞 | 296–403 ms | **9–10 ms** |
| 首次打开（解析） | 305–410 ms | 199–229 ms |
| 已缓存 manager 打开 | — | 0.3–0.5 ms |
| 同一窗口重复 `/context` | 每次重新序列化 | **1–2 ms**（命中） |
| 上一页 | 重新解析 | 6 ms |

### 2. 切换会话后的空白

上一版修的是“被污染的视图快照”，这次找到另一个真正让人看到白屏的机制：

**恢复滚动位置时，整个消息区被设成 `visibility: hidden`**，等“定位到上次看到的那条消息”完成才显示；而定位本身会向服务端翻页（最多 2 页）。所以每次切到一个有滚动记录的会话，就可能先白 1–3 秒。现在不再隐藏，直接用（一次滚动跳动比白屏代价小），定位过程保留 2.5 秒上限。

配套的不变量：

- `loadContext` 不再允许出现“消息为空但声称还有更早历史”（那会把提示行变成死路）；
- hook 里加了一条不变量：`messages` 为空时强制 `hasEarlierMessages = false`、游标清空；
- 真会话读不到任何消息时，**自动重试一次**并显示「没有读取到会话内容 / 重新加载会话」，下面一行是当时的内部状态（session / entries / hasMore / cursor / loading），以后再出问题可以直接看出是哪一种。

### 3. 点一下变成一整页网页

在 Tauri/WebView2 里，没被拦截的 `<a target="_blank">` 会让内嵌 webview 直接导航，把整个应用顶掉。

- `lib/desktop-native.ts` 新增 `installExternalLinkGuard()`：document capture 阶段拦住 `http(s)`/`mailto:`，**同步** `preventDefault()`（导航一定被取消），真正打开放到微任务里（此时 React 的 `onClick` 已跑完，已处理的链接不会再打开一次）。`AppShell` 只装一次。
- 7 处裸链收敛到 `handleExternalLinkClick`：Plugins / Skills / Models（OAuth 链接与 `window.open`）/ SettingsUi 的来源目录 / MCP 登录页 / frontmatter 链接 / **FileViewer 里 markdown 预览的外部链接**（之前也会顶掉 UI）。

### 4. 分支控件：只在真的有分支时出现，且看得懂

原来的问题：桌面端顶栏**无条件**渲染分支控件，点开是一个和窗口一样宽的面板，里面列的是树节点的原始 entry，标签是 `+423 继续`、`custom` 这种——工具调用的扇出（一次回答派多个工具）也被当成“分支”。

- `hasNavigableBranches()`：只有“同一个位置下有两个以上**对话消息**分支”才算分支，工具调用扇出、custom 记录不算；面板列不出东西时控件直接不显示；
- 面板锚到按钮本身（不再跟顶栏一样宽），宽度上限 420px；
- 顶部加一行说明：同一段对话的不同版本（重新回答 / 编辑后重发 / 分叉），点一行切换；
- 当前分支加「当前」标签；空状态一定有文字（之前会出现一个空白面板）。

### 5. 会话统计面板重做

`components/SessionStatsPanel.tsx` 之前是**死代码**——真正渲染的是 `AppShell.tsx` 里 209 行内联 JSX。现在：

- 内联 JSX 换成 `<SessionStatsPanel />`，死代码里的重复实现删掉；
- 新 `lib/metrics-format.ts`：`1,234,567 → 1.23M`、`0.0099 → <$0.01`、`34.25%`、`2h 14m`，**精确值全部保留在 `title`**；
- 层级：四个头条数字（总 token / 总费用 / 活跃时长 / 消息）→ `Token 与费用` → `按模型的花费`（按费用降序 + 归一化细条 + 零费用折叠）→ `消息` → `缓存` → `会话与文件`；
- 路径前面省略（保留文件名）、ID 尾部省略、复制按钮保留；
- `waiting for first request` 这类内部字符串不再出现，换成人话（未启用 / 正在预热 / 运行期间已预热）。

### 验证

368 项相关测试通过；生产构建后在真实数据上扫描 18 个会话切换（0 空白）+ 向上滚动翻页（75 → 144 条）+ 统计面板 1440/900 宽均无横向溢出。新增测试：`lib/session-context-cache.test.mjs`、`app/api/sessions/context-route-cache.test.mjs`、`components/SessionStatsPanel.test.mjs`、`components/external-link-guard.test.mjs`、`hooks/useAgentSession.blank-view.test.mjs`，以及 `BranchNavigator.test.mjs` 里三条分支判定用例。

## [1.18.2] - 2026-11-02

修两个问题：**切换会话后偶发空白**（只剩一行「向上滚动以加载更早的消息」），以及**有那一行时滚不动**。

### 空白的原因
`useAgentSession` 里有个“秒开”优化：读到会话时，如果磁盘未变（`snapshotRevision` 相同）就保留“你已经翻出来的窗口”，不重置历史。问题在于**切换会话会先把视图清空**（`setMessages([])`），于是重读回填时“保留已有窗口”保到了一片空白——而 `setMessages` 在 `revisionUnchanged` 分支里根本不会被调用。更糟的是它随后把这片空窗口写进了 `session-view-cache`，还带着 `hasMore: true`——之后每次打开这个会话都会直接回放这个“空但还有历史”的快照。

修法：
- “保留已有窗口”加前置条件：`messagesRef.current.length > 0` **且**当前 `data` 确实属于这个会话；空窗口时走正常回填；
- 空窗口一律不写缓存（`persistedMessages.length > 0`）；
- 读到空快照视为没有快照并删掉它（自动清掉已被污染的缓存）；
- 再加两道兜底：真会话渲染不出任何消息时，自动重试一次并显示「重新加载会话」；恢复滚动位置如果卡在分页请求上，2.5 秒后强制显示（之前那个状态下消息区是 `visibility: hidden`，直接白屏）。

### “有标志但滚不动”的原因
- 窗口比视口矮时**根本没有可滚动区域**，而“滚到顶”是唯一的触发条件——所以永远触发不了，只能点那行字（现在它本来就是按钮）。修法：读者有过手势后，如果内容不够高就自动再拉一页，直到填满视口（有“拉一页没变高就停”的保护）；
- 另一种死局是“还有历史但游标为空”（就是上面那个被污染的快照）：现在点那行会直接重读会话，而不是默默 return。

### 其他
- 修了 `components/ChatWindow.render-cache.test.mjs` 一个早就失效的断言（它按上游的 `const rendered: ReactNode[]` 找代码，而 fork 的类型是 `Array<ReactNode | (() => ReactNode)>`），现在按形状匹配；
- 新增 `hooks/useAgentSession.blank-view.test.mjs`（6 项）把上面每一条钉住。

## [1.18.1] - 2026-11-02

修 1.18.0 的回归：**向上滚动加载更早消息失效**（滚到顶后卡片显示「向上滚动以加载更早的消息」，但怎么滚都没反应）。

原因：1.18.0 为了让“打开就自动刷历史”停手，加了一个“必须用户真的滚过”的门槛；但这个门槛是监听滚动容器的，而那个容器在首屏渲染完成前并不存在，监听器根本没挂上；另一方面哨兵（列表顶部那行提示）的 IntersectionObserver 只在**进入/离开视口的那一刻**回调，打开时就已可见、之后再滚也不会再回调——两个原因重叠，结果就是完全静默。

修复（`components/ChatWindow.tsx`）：
- 手势/滚动监听改挂到 `document` 捕获阶段（`scroll` 不冒泡，但捕获能收到），容器后挂载也不会丢；
- **滚到顶部（`scrollTop ≤ 24`）就拉上一页**，不再依赖哨兵回调；
- 那一行提示本身变成可点按钮「向上滚动以加载更早的消息」（pill 样式，悬停/键盘焦点都有反馈），滚不动也能点；
- 拉页后的锚点回位会产生自己的 scroll 事件，加 600ms 窗口把它忽略掉，避免自己刷自己；保留“没变高只重试一次”与“最多一次一页”的保护。

实测同一个 353 条消息的会话：滚到顶依次拉 3 页，渲染条目 28 → 101 → 125，无多余请求；按钮点击一次也能拉一页。补了 `components/ChatWindow.older-history.test.mjs`，把“监听器不能挂在容器上”“必须有滚动到顶的触发”“两条路径共用一次请求”钉住。

## [1.18.0] - 2026-11-02

基于 Pi Agent 0.7.5（底层 Pi SDK 1.4.0）。会话压缩卡片可折叠；首次打开会话从 4 秒降到秒级以内（实测重载 0.6 秒、会话之间切换 17 毫秒），并去掉了会在后台狂刷数 MB 历史的翻页循环——这是「UI 偶尔卡死」的元凶；设置窗口收起后可以随时恢复，不再像关掉一样。

### 1. 会话压缩卡片可收起（`components/MessageView.tsx`、`app/plus.css`）
- 「compaction / 会话已压缩」卡片默认折成一行动条：左边 `compaction` 标签 +「会话已压缩」+ 去掉 Markdown 标记的一行摘要预览 + 时间，右侧箭头提示可展开；
- 点击整行展开/收起，展开/收起状态会记住（下次开自动保持你上次的选择）；折叠时不再把大段摘要顶在两条对话中间。

### 2. 打开会话明显提速（`components/ChatWindow.tsx`、`components/SessionSidebar.tsx`、`lib/session-reader.ts`）
实测同一台机器、同一个 4784 条 / 69MB 的历史会话：

| 场景 | 之前 | 现在 |
| --- | --- | --- |
| 首次打开（服务刚起） | 4.1 秒 | 1.5 秒（第二次起 0.6 秒） |
| 刷新页面 | 6.1 秒，18 次翻页请求约 5MB | 0.6 秒，零翻页请求 |
| 会话之间来回切 | — | 17 毫秒 |
| 首屏 DOM 节点 | 4618 | 666 |

具体改了四处：
- **去掉「打开就自动翻页」的循环**：消息列表顶部的哨兵一旦进入视口就抓上一页，而首屏/恢复滚动时它本来就在视口里，于是对长会话连续拉了十几页（实测 18 次 `/context`、约 5MB），既慢又卡。现在只有你真的滚动/点按过对话之后才会加载更早的消息；另外加了一条保护：翻一页没让内容变高就不再自动翻。
- **滚动位置恢复有了上限**：原来会一直往前翻页直到找到上次的锚点，现在最多翻 2 页，找不到就停在最新一屏（长会话不再为了“回到原位”而下载几 MB）。
- **单页大小封顶**：给「整回合补齐」加了 320 条的上限，一个超长 agent 回合不会再让一页变成 1MB。
- **侧栏会话列表瞬时出屏**：启动时直接用上一次的 `localStorage` 快照画出项目/会话树，再用真实列表覆盖；顺手修了快照导致的一个坑——深链接打开一个不在快照里的旧会话时，不会再被误判成“会话不存在”而停在空白页。
- **会话文件缓存上限从 64MB 提到 128MB**，本机那个 69MB 的最大会话不再每次打开都重新解析一遍。

### 3. 设置窗口收起后可随时恢复（`lib/plus-settings-window.ts`、`components/PlusSettingsWindowBar.tsx`）
- 收起状态原来只存在窗口栏自己的 state 里：收起后侧栏「设置」、`Ctrl+,`、原生菜单都只是把「同一个已打开的设置」重新设一遍，React 直接跳过，所以你看到的是“点缩小就消失，再点设置没反应”；
- 现在收起状态放到一个共享的小 store 里：**点角落小窗本身、点小窗里的「展开」、点侧栏设置、按 `Ctrl+,`** 任意一种都能恢复；
- 收起后是一个 392×42 的圆角小窗（“设置 · 已收起（点一下恢复）” + 展开 + 关闭），并且**上移到输入框上方**，不再盖住发送按钮，收起期间可以继续对话；
- 收起时焦点会落到「展开」上，键盘 Tab/Enter 也能恢复；切「并排」模式会自动展开（否则角落小窗和并排布局自相矛盾）。

### 4. 同时修掉的细节
- 折叠设置窗口不再与右侧并排模式的边距规则打架（收起时对话立即拿回全部宽度）；
- 会话列表首屏快照从 120 条提到 400 条，旧会话更容易被直接命中；
- 补了 `lib/plus-settings-window.test.mjs`，把「每条进入设置的路径都会展开」钉住。

## [1.17.0] - 2026-11-01

基于 Pi Agent 0.7.5（底层 Pi SDK 1.4.0）。修复顶栏子任务面板点击被窗口拖拽劫持导致无法切换的 Bug 并全面增强交互；为所有项目会话菜单补齐「置顶会话 / 导出 HTML / 定位文件」；大幅提速应用冷启动与超大会话首次加载；并将右侧文件预览扩展至全套 Office（`.docx` / `.doc` / `.xlsx` / `.xls` / `.pptx` / `.csv`）及增强版 PNG / SVG / HTML 预览。

### 1. 修复顶栏 `Agents` 子任务无法点击切换 & UI 交互升级（`components/AgentSessionPanel.tsx`、`components/AppShell.tsx`）
- **根因修复**：顶栏下拉面板挂载在 `.app-topbar`（`data-tauri-drag-region`）内，而子任务行使用 `<div role="option">`，此前在 Windows Tauri 下点击会被 `useWindowDrag` 误识别为拖拽系统窗口而吞掉 `click` 事件；现已标记 `data-no-drag` 并隔离 `mousedown` 冒泡，单击任意子任务即可秒切。
- **交互增强**：新增悬停高亮底色、图标圆角容器、当前会话胶囊徽标、悬停右侧 **「查看 →」** 引导，以及一键 **「复制 `#ID` 引用」** 快捷按钮。

### 2. 项目会话 `···` 菜单补齐「置顶会话」等完整操作（`components/SessionSidebar.tsx`）
- **全项目通用「置顶会话 / 取消置顶」**：项目分组与时间线视图下的所有会话现均支持置顶，置顶会话自动排在所属项目最顶部并显示图钉标记，折叠预览时也始终保持可见；
- **菜单新增实用项**：补齐 **「导出为 HTML」** 与 **「在资源管理器中定位」**（一键打开 `.jsonl` 所在目录）。

### 3. 应用打开速度与大体积会话初次加载大幅提速（`components/SessionSidebar.tsx`、`lib/session-data-cache.ts`、`lib/session-reader.ts`、`lib/session-slim-load.ts`）
- **0ms 首屏会话树快照**：侧边栏冷启动直接从 `localStorage` 快照渲染项目与会话列表，消除启动白屏等待，并合并消除初始 SSE 重复拉取风暴；
- **修复悬停死缓存并打通 `session-view-cache`**：修复旧版 `prefetchSessionData` 未带 `tree=summary` 导致每次滑过/点击都在服务端重复序列化几十 MB 全量会话树的严重性能损耗；现改为 160ms 防抖预热并直接写入 `session-view-cache`，悬停后再点会话 **0ms 秒开**；
- **大文件加载瘦身 75%+**：将字节级裁剪器 `SLIM_LOAD_MIN_FILE_BYTES` 门槛从 `16MB` 降至 `2MB`，并在历史消息传输中剔除无用的巨型 Base64 `thinkingSignature` 与 `diagnostics` 字段，单次会话加载体积直降 70%~80%。

### 4. 右侧文件预览全面支持 Office 全家桶及增强版 PNG / SVG / HTML（`lib/office-preview.ts`、`lib/file-types.ts`、`components/FileViewer.tsx`、`app/api/files/[...path]/route.ts`）
- **新增 Excel / 表格多工作表预览（`.xlsx` / `.xls` / `.ods` / `.csv` / `.tsv`）**：原生解析新老 Excel 工作簿，支持顶栏多 Sheet 工作表切换、冻结行列标头（`A, B, C...`）；`.csv` / `.tsv` 支持一键切换 `Preview（表格）` 与 `Source（源码）`；
- **新增老版 Word `.doc` 与 PowerPoint `.pptx` 预览**：支持直接阅读二进制 `.doc` 文档正文与表格，以及 `.pptx` 分页幻灯片（含内嵌图片与演讲者备注），加上原有 `.docx` 与 `.pdf`，实现 Office 文档全覆盖；
- **增强 PNG / 图片与 SVG 预览**：图片上限从 10MB 提升至 **50MB**，工具栏新增 `- / Fit / +` 缩放与 **「棋盘 / 白底 / 暗底」** 背景切换；`.svg` 新增 **`Source / Preview`** 源码切换，并支持自动识别 `<symbol>` 图标集（Sprite）平铺展示所有内部图标；
- **智能 HTML 预览**：带脚本的 HTML 页面默认在安全隔离沙箱（`srcDoc` `allow-scripts`）中直接运行渲染，不再因脚本拦截而空白报错。

## [1.16.0] - 2026-10-28

基于 Pi Agent 0.7.5（底层 Pi SDK 1.4.0）。重构「设置」打开逻辑：取消整页替代主界面的显示方式，升级为 **非模态可拖拽设置窗口 + 右侧并排分屏 + 弹出独立系统窗口** 三合一窗口化架构，实现一边调整各项设置、一边实时查看并操作正在进行的对话与任务。

### 「设置」升级为非阻塞多模式独立窗口（`components/PlusSettingsWindowBar.tsx`、`components/SettingsPanel.tsx`、`app/plus-theme.css`）
- **默认「非模态可拖拽浮动窗口」**：
  - 点击「设置」不再隐藏或替换主界面，底部的对话流、流式输出、运行中的子代理及侧边栏保持 100% 实时可见且可直接滚动/交互；
  - 按住设置窗口顶部标题栏即可在屏幕内自由拖拽位置（双击标题栏归位）。
- **一键切换「右侧并排（Dock Right）」分屏模式**：
  - 点击设置窗口顶栏的 **「并排」** 按钮，设置窗口自动停靠在右侧，左侧主对话区自动收缩让出空间，左右并排、零遮挡地边看任务边改配置（偏好自动记忆）。
- **一键弹出「独立系统窗口（Pop Out）」与「迷你折叠条（`—`）」**：
  - 点击顶栏 **「独立窗口」** 按钮，即可将设置面板弹出为一个完全独立的操作系统级窗口（支持拖到副屏或通过任务栏切换）；
  - 点击 **`—`** 可将设置窗口收起为右下角迷你悬浮条，随时一键展开。

## [1.15.1] - 2026-10-28

基于 Pi Agent 0.7.5（底层 Pi SDK 1.4.0）。在侧边栏会话 `···` 菜单中新增 **「复制会话 ID」**、**「复制跨对话引用 (`#ID`)」** 以及底部可点击的 `ID` 信息栏，并支持在任意其他对话中直接粘贴 `#<会话ID>`（或 8 位以上前缀）自动注入该会话的完整对话记录。

### 侧边栏会话菜单新增 Session ID 复制与跨对话读取
- **侧栏会话 `···` 菜单增强**（`components/SessionSidebar.tsx`）：
  - 新增 **「复制会话 ID」**：一键复制当前会话完整 UUID（如 `01a1795e-45ab-752a-84ca-886edf7f60ca`）；
  - 新增 **「复制跨对话引用 (`#ID`)」**：一键复制 `#01a1795e-...` 引用标记；
  - 菜单底部信息区新增显示 **`ID: 01a1795e…f60ca`**（点击同样可一键复制完整 ID）。
- **支持通过 `#<会话ID>` 跨对话直接读取上下文**（`lib/session-reference.ts`、`lib/session-reference.test.mjs`）：
  - 在任意其他对话（包括无文件工具的纯「对话」模式或不同项目的会话）中输入或粘贴 `#<完整UUID>` 或 `#<8位以上ID前缀>`（如 `参考 #01a1795e 里的方案继续写`），发送时会自动拉取目标会话的完整记录并以 `<referenced-session>` 块注入给大模型，无需手动找 `.jsonl` 文件路径。

## [1.15.0] - 2026-10-28

基于 Pi Agent 0.7.5（底层 Pi SDK 1.4.0）。完整移植 `abcwyc/pi-agent-desktop` 与 `agegr/pi-web` 近期 8 项核心改进：内置终端默认 Shell 选择（Windows 自动优先 PowerShell 7）、上下文压缩期间消息自动入队与 `/compact` 防锁死、子代理模型/思考深度展示、聊天底部子代理实时运行状态与整组任务收官通知、用户消息「原文 / 渲染」切换、AI 回复生成速度 `tok/s` 统计，以及长队列防遮挡保护。

### 上游精选 8 项功能与稳定性移植
1. **流式 Markdown 增量块缓存优化**（`components/MarkdownBody.tsx`、`abcwyc` `108dd60f`）：在流式分块缓存（`splitMarkdownBlocks`）基础上跳过无 `:::artifact` 块的正则扫描，进一步降低流式渲染开销。
2. **「设置 › 常规 › 内置终端」默认 Shell 选择 + Windows ConPTY 信号修复**（`lib/terminal-shells.ts`、`lib/terminal-settings.ts`、`lib/terminal-manager.ts`、`app/api/terminal/settings/route.ts`、`components/TerminalSettingsSection.tsx`、`abcwyc` PR #166）：
   - Windows 自动按 `PowerShell 7 (pwsh)` → `Windows PowerShell` → `CMD` 优先级探测，并支持检测 `Git Bash`；可在「设置 › 常规」自由切换默认终端 Shell；
   - 修复 Windows 关闭内置终端时向 ConPTY 传入不支持的 POSIX `SIGKILL` 信号的问题。
3. **上下文压缩期间支持发消息排队 + 修复 `/compact` 锁死输入框**（`lib/rpc-manager.ts`、`hooks/useAgentSession.ts`、`pi-web` PR #1426）：
   - 当会话正在执行手动或自动压缩时，新发送的提示词自动进入 `ComposerQueue` 排队并在 `compaction_end` 时自动唤醒按序投递，不再报错退回；
   - `/compact` 命令改为异步后台执行，不再阻塞 `runBuiltinCommand` 导致输入框 `<fieldset>` 在整个压缩期间被禁用锁死。
4. **聊天底部显示运行中子代理状态 + 整组子代理全部结束后再发完成通知**（`components/ChatWindow.tsx`、`components/AppShell.tsx`、`pi-web` PR #1418 & #1437）：
   - 当后台有子代理正在运行时，聊天区底部实时展示 `有 N 个子代理正在运行（任务1、任务2…）`；
   - 主会话阶段性暂停但后台子代理仍在运行时，不再提前误发完成提示音与系统通知，等整组子代理及主会话最终汇总全部完成后再统一通知。
5. **顶栏子代理下拉面板显示「实际模型 · 思考深度」**（`lib/session-reader.ts`、`lib/types.ts`、`components/AgentSessionPanel.tsx`、`pi-web` PR #1440）：
   - 在顶栏子代理列表第 2 行直接展示 `代理类型 · 实际模型 · 思考深度 · 相对时间`，悬停可查看完整 `provider/modelId`。
6. **单条用户消息支持切换「原文 / 渲染」视图**（`components/MessageView.tsx`、`pi-web` PR #1420）：
   - 用户消息底部新增「原文 / 渲染」切换按钮，一键查看未经 Markdown/HTML 过滤的原始文本（完整保留 `<TableOperator ... />` 等标签与模板表达式）。
7. **AI 回复底栏用量新增平均输出速度（`tok/s`）**（`components/MessageView.tsx`、`pi-web` PR #1417）：
   - 根据回合耗时与输出 Token 自动计算并展示平均生成速度（如 `52.4 tok/s`），鼠标悬停底栏即可查看完整输入/输出/缓存/花费/速度明细。
8. **待发消息队列高度上限保护**（`app/plus-theme.css`、`pi-web` PR #1429）：
   - 限制 `.composer-outbox` 最大高度为 `min(180px, 25dvh)` 并支持内部滚动，防止排队消息过多时将输入框挤出屏幕。

## [1.14.0] - 2026-10-28

基于 Pi Agent 0.7.5（底层 Pi SDK 1.4.0）。将内置「陶土 · Claude」主题全面升级为 **Cherry Studio V2 仿 Claude 主题**；在聊天输入框右上角新增悬停显隐的 **「展开长文编辑框 (`⤢`)」** 按钮；将左上角品牌图标替换为可自定义的 **个人画像（支持上传本地照片与 6 款精选插画头像）与用户昵称**。

### 适配 Cherry Studio V2 仿 Claude 主题（替换内置 `claude` 主题）
- **原汁原味移植 Cherry Studio V2 色彩与字体排版**（`lib/plus-theme-catalog.ts`、`app/plus-theme.css`）：
  - 浅色模式采用 `#faf9f5` 暖白主画布、`#f5f0e8` 侧栏与代码块、`#efe9de` 用户消息气泡与行内代码底色、`#cc785c` 经典陶土橙主色（Hover `#a9583e`）；
  - 深色模式采用 `#181715` 暖炭黑底、`#1f1e1b` 工作台、`#252320` 卡片浮层与 `#e8a48c` 暖陶土行内代码；
  - 字体栈升级为 `Styrene / Inter` UI 字体 + `Tiempos Text / Noto Serif SC` 16px 衬线正文与标题 + `JetBrains Mono` 等宽代码字体；
  - 同步引入 Cherry Studio V2 的 Markdown 细节：链接底部 1px 渐变下划线（Hover 加粗为 2px）、2px 陶土橙左边框暖底引用块（`blockquote`）、陶土橙有序/无序列表序号（`li::marker`）。

### 输入框右上角悬停「展开长文编辑框 (`⤢`)」按钮
- **对标 Cherry Studio 输入框右上角交互**（`components/ChatInput.tsx`、`app/plus-theme.css`）：
  - 鼠标移入或聚焦聊天输入框时，右上角平滑浮现 `26×26px` 圆角展开按钮（`⤢`）；
  - 点击即可一键将输入框展开为半屏沉浸式长文编辑器（`min(46vh, 380px)`），再次点击（`⤡`）或发送消息后自动收起。

### 左上角个人画像与昵称（支持上传照片 & 6 款精选插画头像）
- **移除左上角应用标题与 π 图标，升级为个人专属画像栏**（`components/UserProfileControl.tsx`、`components/AppShell.tsx`）：
  - 侧边栏左上角直接展示你的**个人头像 + 昵称 + 可选状态签名**；
  - 点击即可打开个人画像卡片：支持**上传任意本地照片**（自动居中裁剪压缩持久化保存），或一键切换 **6 款内置艺术插画头像**（暖阳橘猫、落日远山、水墨松竹、星际旅人、元气柴犬、森系青年），随时修改显示昵称与签名。

## [1.13.2] - 2026-10-28

基于 Pi Agent 0.7.5（底层 Pi SDK 1.4.0）。通过 Chrome DevTools Protocol 追踪定位并彻底根治含大量公式/代码的长对话中**输入框打字卡顿**问题（在 50,448 个 DOM 节点、713 个 KaTeX 公式的 Transformer 会话中，单字输入耗时从 **350~770ms** 降至 **11~14ms**，样式重算耗时降低 **317 倍**）。

### 彻底根治长对话打字卡顿（单字延迟从 770ms 降至 11ms）
- **消除根容器 `.app-shell:has(...)` 引发的全树样式失效**（`app/plus-theme.css`、`components/SettingsPanel.tsx`）：
  - CDP `StyleInvalidatorInvalidationTracking` 追踪发现：每敲击一个字符，`.app-shell:has(.app-sidebar.sidebar-closed)` 都会使整个 `<div class="app-shell">` 下全部 `50,448` 个 DOM 节点（`98,923` 个样式节点）失效重算（单次 `UpdateLayoutTree` 高达 `368ms`）；
  - 现已将 `.app-shell:has(...)` 全部替换为兄弟选择器 `.app-sidebar.sidebar-closed ~ div .app-content-layer` 与 `html[data-plus-settings-open="1"]`，彻底切断输入框变更向全局 DOM 树的样式传染。
- **消息回合级 `content-visibility: auto` 视口裁剪**（`app/plus-theme.css`）：
  - 为 `.chat-scroll-container [data-entry-id]` 及 `.katex-display`、`table`、`pre` 开启 `content-visibility: auto`，使滚出视口的历史公式与长文完全跳过 Blink 样式重算与布局。
- **消除输入框每次按键的双重同步 `scrollHeight` 布局抖动**（`components/ChatInput.tsx`）：
  - 移除与 `useLayoutEffect(resizeTextarea)` 重复执行的 `onInput={handleInput}`；
  - 优化 `resizeTextarea`：单行短文本与常规追加输入时不再每次先将 `height` 设为 `"auto"` 再同步读取 `scrollHeight`（消除每敲一字触发 4 次 `style` 属性变更与 2 次强制同步布局）。

## [1.13.1] - 2026-10-27

基于 Pi Agent 0.7.5（底层 Pi SDK 1.4.0）。彻底解决切换主题卡顿 10–20 秒与长对话渲染卡顿问题（实测 1000+ 消息会话切换主题仅需 76~200ms）；打通 Tauri WebView2 底层「硬件加速」命令行开关；移除左上角多余的「纸枢」小徽章并修复侧栏原生滚动条箭头问题。

### 彻底解决切换主题 10–20 秒卡顿与长对话渲染卡顿
- **移除全局通配符过渡与通配滚动条规则**（`app/plus.css`、`app/plus-theme.css`、`components/PlusAppearanceRuntime.tsx`）：
  - 移除切换主题时挂在 `<html>` 上的 `html.plus-theme-transition *, *::before, *::after { transition: ... !important }`（该规则在千条消息的长对话中会同时触发 10 万+ 个 CSS 属性动画与 `color-mix()` 逐帧重算，导致主线程卡死 10–20 秒）；
  - 移除 `html[data-plus-style="clean"] * { scrollbar-color: ... }` 全局通配符规则，恢复精细的 `::-webkit-scrollbar` 胶囊滚动条，同时消除了切换其他主题时左侧栏出现 Windows 原生带上下三角箭头粗滚动条的问题。
- **长对话虚拟化延迟构建与 CSS 视口隔离**（`components/ChatWindow.tsx`、`app/plus-theme.css`、`lib/plus-theme.ts`）：
  - `ChatWindow` 对滑出当前可见窗口（`startIndex` 之前）的历史回合改用惰性 Thunk 延迟求值，避免每次重渲染时对整场千条历史消息重复执行 `summarizeWorkActivities`、`getTurnWrittenFiles` 与 VDOM 构建，CPU 开销降低 90%；
  - 打开全屏设置页时自动对背后的主工作区启用 `content-visibility: hidden`，对长对话中的代码块与已折叠工具组启用 `content-visibility: auto`，并将默认主题的 `backdrop-filter` 设为 `none`（仅在自定义开启毛玻璃时启用），实测 1,012 条消息会话下切换主题耗时降至 **76ms ~ 200ms**。
- **主题画廊 0ms 本地即时编译应用**（`components/PlusAppearanceSettings.tsx`）：点击画廊主题时直接在前端内存调用 `compileUserThemeCss` 即刻生效，不再等待后端接口往返。

### 真正打通 WebView2 底层「硬件加速」开关
- **选项更名为「硬件加速」并接入 Tauri Rust 启动参数**（`src-tauri/src/native_prefs.rs`、`src-tauri/src/shell/window.rs`、`components/desktop/DesktopAppSection.tsx`）：
  - 核实原前端 CSS 层面的 GPU 开关在移除 `transform` 后已无实际作用；现将其正式重命名为 **「硬件加速」**，通过 Tauri IPC `set_hardware_acceleration` 持久化至 `ui-prefs.json`；
  - Windows WebView2 创建窗口时读取该配置：开启时传入 `--enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist` 强制启用 GPU 光栅化与零拷贝合成；关闭时传入 `--disable-gpu --disable-gpu-compositing` 切换为软件渲染。

### 移除左上角多余的「纸枢」徽章
- 移除左上角 `Pi Atelier` 旁固定显示「纸枢」的 `.sidebar-brand-badge` 小标签（`components/AppShell.tsx`、`app/plus.css`），切换任何主题都保持干净统一。

## [1.13.0] - 2026-10-27

基于 Pi Agent 0.7.5（底层 Pi SDK 1.4.0）。新增对标 Claude 的**长文本粘贴自动转为文件附件（`.md` / `.txt`）**功能，并在「设置 › 常规 › 对话」中提供可配置的行数阈值与一键自定义。

### 长文本粘贴自动转附件（Claude 风格 `PASTED` 卡片体验）
- **智能拦截与双阈值判定**（`lib/chat-attachments.ts`、`components/ChatInput.tsx`）：
  - 在聊天输入框中粘贴达到或超过设定行数（默认 **30 行**）的长提示词、代码片段或报错日志时，自动拦截并转为文本文件附件（保留输入框已有文本与光标位置，不再把输入框撑满）；
  - 内置单行超长文本兜底阈值（`max(1800, 阈值 × 100)` 字符），即使粘贴未换行的压缩 JSON / 超长段落也会自动转为附件。
- **智能识别 `.md` / `.txt` 后缀与可读标题摘要**：
  - 自动检测 Markdown 语法特征（标题、代码围栏、链接、表格、任务列表），智能选用 `.md` 或 `.txt` 后缀；
  - 自动提取首行有效标题摘要生成可读文件名（如 `pasted-1-系统架构设计方案.md`、`pasted-2.txt`）。
- **附件卡片点击预览 + 一键「转回正文」双向可逆**（`components/ChatInput.tsx`、`app/plus-theme.css`）：
  - 输入框上方的附件芯片显示文件名、行数与字节大小（如 `42 行 · 1.8 KB`）；
  - 点击芯片即可展开内联全文预览面板；
  - 芯片与预览栏均提供 **「转回输入框正文」** 按钮，随时可一键将附件内容还原回输入框内直接编辑。
- **「设置 › 常规 › 对话」新增可配置行数阈值**（`components/PasteAttachmentSettingRow.tsx`、`components/SettingsPanel.tsx`）：
  - 提供 **关闭 / 15 行 / 30 行（默认） / 50 行 / 100 行** 快捷档位按钮，以及右侧自定义行数输入框（`0 ~ 1000` 行，持久化存储于 `localStorage`）。

## [1.12.1] - 2026-10-27

基于 Pi Agent 0.7.5（底层 Pi SDK 1.4.0）。彻底解决右侧文件树在后台流式输出期间等待 78 秒的饥饿循环与竞态问题，实现文件树 `localStorage` 快照 0ms 首帧秒开；修复模型选择器偏移/截断与会话信息弹窗越界问题，并通过 Playwright 真实浏览器截图验证。

### 彻底根治文件树 78 秒慢加载与实现 0ms 首帧秒开
- **消除活跃对话流式输出期间的会话扫描饥饿循环**（`lib/session-reader.ts`）：修复 `listAllSessions()` 在模型流式输出频繁触发 `invalidateSessionListCache()` 时无限递归重扫 `.jsonl` 文件直至回合结束（耗时数十秒）的问题，增加重试上限并立即写入缓存快照。
- **冷启动鉴权改走轻量摘要扫描 & 跳过巨型工具结果 JSON 解析**（`lib/file-access.ts`、`lib/session-list-scanner.ts`）：`getAllowedFileRoots()` 冷启动时改调仅读取首行的 `listSessionSummaries()`，且增量扫描器跳过对超大 `toolResult` 行的 `JSON.parse`。
- **文件树 `localStorage` 快照缓存 + 预加载 + 消除 StrictMode 竞态**（`components/FileExplorer.tsx`、`components/AppShell.tsx`）：
  - 移除 `FileExplorer` 的 `next/dynamic` 异步分包延迟，改为同步直装并在确定项目路径时立即后台预取根目录；
  - 将最近访问的 20 个目录结构持久化缓存于 `localStorage`（`stale-while-revalidate`），打开右侧栏或重启应用时 **0ms 首帧直接渲染目录树**，后台静默刷新；
  - 修复 `FileExplorer` 在 `refreshKey` 变动时提前将 `loading` 置为 `false` 导致闪现空白或「未找到文件」的竞态；接通顶栏「筛选文件...」输入框实时过滤。

### 修复模型选择器偏移/截断与会话统计弹窗越界
- **根治 `position: fixed` 包含块偏移**（`app/plus-theme.css`）：将毛玻璃 `backdrop-filter` 移至无子节点的 `.app-shell::before` 背景伪元素上，移除 `.chat-window`、`.chat-composer-frame`、`.app-topbar`、`.session-sidebar` 容器自身的 `backdrop-filter` 与 `transform`，彻底解决容器内所有 `position: fixed` 弹窗（模型选择器、会话信息、分支导航等）向右下偏移或被 `overflow: hidden` 裁剪的根因。
- **模型选择器 Portal 化与自适应翻转**（`components/ModelSelector.tsx`）：将模型下拉菜单通过 `createPortal` 挂载至 `document.body`，当输入框靠近窗口上方（如新会话）时自动向下翻转展开并严格限制最大高度，彻底杜绝只露出底部几个模型的情况。
- **会话信息弹窗自适应右侧边栏宽度**（`components/AppShell.tsx`）：监听右侧面板与文件树开关/宽度变化，实时重算顶栏浮层宽度，并采用三档响应式网格（宽屏三栏 / 右侧栏展开时双栏 / 窄屏单栏），右侧 Token 数据永不越界截断。

## [1.12.0] - 2026-10-27

基于 Pi Agent 0.7.5（底层 Pi SDK 1.4.0）。大幅提升右侧文件树目录与文件加载速度、新增 GPU 硬件合成加速开关、新增免失焦系统通知与测试按钮、重构左侧边栏项目行细节，并将聊天输入框默认高度扩展为舒适的多行尺寸。

### 极速文件树加载与 GPU 硬件合成加速
- **目录与文件加载速度飞跃**：
  - 服务端对 `resolveRealRoots` 增加 `WeakMap` 缓存（消除每次 `/api/files` 请求重复执行 20+ 次同步 `realpathSync` 磁盘查询），将允许目录缓存 TTL 提升至 30s；
  - 对 `lib/file-tree-visibility.ts` 的 Git 忽略检查增加内存缓存，并跳过对 `node_modules` / `.next` / `target` 等重型目录的二次 `git ls-files` 子进程调用；
  - 客户端 `FileExplorer` 增加目录缓存、并发去重与**鼠标悬停预加载**，修复 `ImageViewer` 连接监听时重复拉取图片的开销。
- **「GPU 硬件合成加速与极速目录预加载」设置项**：在「设置 › 常规 › 桌面应用」中新增开关（默认开启），开启后为侧边栏、对话滚动区、右侧面板与文件查看器启用 GPU 硬件复合层加速（`translateZ(0)` / `will-change`）。

### 免失焦系统通知与提示音测试
- **「窗口聚焦时也弹出系统通知（免失焦通知）」设置项**：
  - 在「设置 › 常规 › 桌面应用」中新增开关（默认开启）：无需将窗口切到后台，当前正在查看的对话或后台任务完成时，均立即弹出 Windows 系统横幅通知并播放双音完成提示音；关闭后则恢复仅在窗口失焦时通知。
  - 新增 **「测试通知与提示音」** 按钮，可一键当场验证 Windows 系统通知弹窗与完成提示音。

### 左侧边栏与聊天输入框体验打磨
- **左侧边栏精修**：
  - 修复鼠标悬停项目行时右侧 `+` / `···` 按钮与会话数量胶囊重叠的问题（悬停时自动让出槽位并显示浮起操作胶囊）；
  - 未激活项目文件夹采用温润低饱和纸面方章，仅当前激活项目点亮为朱砂实心印章（告别一整排刺眼同色红框），展开的子会话采用清晰的左侧树状引导线，「对话」与「项目」分区之间增加细腻分割线。
- **聊天输入框默认加高**：将底部聊天输入框默认最小高度从单行（`24px`）提升至舒适的三行高度（`68px`，可通过 `--plus-composer-min-height` 自定义）。

## [1.11.0] - 2026-10-27

基于 Pi Agent 0.7.5（底层 Pi SDK 1.4.0）。全新品牌升级为 **Pi Atelier · 纸枢**，精简 5 款精选主题并统一 Plus 唯一底层，重构 Apple/Google 现代简约风外观设置，内置「自定义 CSS 工作台 + 全局界面实时预览浮窗 + 壁纸/毛玻璃引擎」，并新增图片点击全屏放大查看器。

### 品牌与侧边栏项目树重塑
- **新品牌展示名「Pi Atelier · 纸枢」与朱砂印章 π 徽标**：左上角告别灰框蓝字 `π`，升级为朱砂印章 SVG 几何 `π` 徽标 + `Pi Atelier` + `纸枢` 徽标（安装包与自动更新链路保持 `Pi Agent Plus` 完全兼容）。
- **侧边栏项目列表视觉升级**：项目文件夹图标升级为温润的朱砂/强调色圆角方章徽标（激活项目高亮为实心印章），展开的项目组拥有细腻的纸面卡片底色与描边，会话数量升级为胶囊徽标。

### 5 款精选主题与唯一 Plus 分层底层
- **统一唯一底层（Plus 分层）**：移除繁琐的底层切换，全局统一采用 Plus 三层纸面分层底层，保留 5 款代表性精选主题：
  1. **纸枢 · Kami（默认）**：手造暖棉纸 + 朱砂与橄榄墨，彻底消除正文中突兀的蓝色行内代码与蓝色圆点；
  2. **澄明 · Pure Slate**：现代极简中性灰与冷白；
  3. **陶土 · Claude**：经典暖羊皮纸与赤陶橙；
  4. **极客 · GitHub**：高对比度工程配色；
  5. **极夜 · Nord**：北极冰川冷蓝灰护眼色。
- **修复自定义强调色污染行内代码**：切换主题时自动恢复该主题原生强调色，且行内代码颜色独立于强调色，不再被旧的蓝色强调色覆盖。

### Apple / Google 现代简约外观设置与「自定义 CSS 工作台 + 全局界面实时预览」
- **现代分组卡片式外观设置**：借鉴 macOS Sequoia 与 Google Material 3 的圆角分组卡片（Studio Cards）重构外观设置页。
- **「开启全局界面预览」浮窗模式**：点击后设置窗口自动收起为右下角半透明毛玻璃悬浮调色台，100% 显露背后的真实主界面（侧边栏、顶栏、聊天区、代码块与输入框），边看全局真实界面边调主题与 CSS。
- **全方位自定义 CSS 设计接口与 6 款一键特效预设**：
  - 预留 `--plus-inline-code` / `--plus-inline-code-bg` / `--plus-inline-code-border`（行内代码配色）、`--plus-marker`（列表圆点）、`--plus-heading-color`（标题颜色）、`--plus-user-bar-color`（提问卡竖条）、`--plus-bg-image`（背景壁纸）、`--plus-glass-blur` / `--plus-surface-alpha`（全界面亚克力毛玻璃特效）等丰富接口；
  - 内置「朱砂墨韵代码」「翡翠松林代码」「杂志大标题排版」「亚克力毛玻璃」「流光壁纸 + 毛玻璃」「宽屏沉浸布局」6 个一键预设芯片；
  - 项目内新增完整编写指南 [`docs/CUSTOM-CSS.md`](./docs/CUSTOM-CSS.md)。

### 侧边栏图片点击全屏放大查看器（Image Lightbox）
- 在侧边栏打开图片文件时，直接点击图片或点击工具栏右上角「全屏放大预览」按钮，即可弹出全屏独立看图窗口，支持滚轮无级缩放（25% ~ 500%）、鼠标拖拽平移、顺时针旋转、一键还原 100% 以及直接调用系统看图软件打开。

## [1.10.0] - 2026-10-27

基于 Pi Agent 0.7.5（底层 Pi SDK 1.4.0）。借鉴《纸枢 · Kami》与 DeepSeek Harness 重构顶栏子代理切换器与聊天区视觉，完整保留侧边栏与输入框全部原有功能。

### 顶栏子代理下拉切换器（参考 DeepSeek Harness）
- **子任务移至顶部标题栏**：当会话派发了子代理时，顶部标题栏旁直接显示 **`[子任务 N ▾]`** 下拉按钮（有子代理运行中时带动态呼吸点与运行计数），点击即可在下拉菜单中查看并切换进入任意子代理，或对运行中的子代理执行引导/停止。
- **子代理内一键返回主会话**：处于子代理会话时，顶部标题栏自动显示 **`[← 主会话]`** 按钮与兄弟子代理下拉框，可一键返回主会话或平级切换。
- **侧边栏不再展开子任务树**：左侧边栏保持纯净的「对话」与「项目」列表（主会话行仍聚合显示子代理的运行转圈与选中态），不再因展开子任务而挤占侧边栏空间；侧边栏原有的新建、定时任务、搜索、项目与工作树等全部功能原样保留。

### 《纸枢 · Kami》主题与聊天区视觉升级
- **新增内置主题「纸枢 · Kami」**：源自 OpenDesign `atelier-zero` 手造暖棉纸配色（`#efe7d2` 棉纸画布、`#f7f1de` 骨白卡片、`#15140f` 浓墨正文、`#c44d36` 朱砂印章、`#52662c` 橄榄绿），全界面无刺眼纯白与死黑，并附带配套暗夜墨玉深色模式。
- **聊天区卡片与输入舱精修**：
  - 用户提问升级为带左侧强调色竖条与微投影的题签卡片；
  - 工作过程时间线增加细腻的纸面胶囊边框与底色；
  - 改动文件卡（`TurnWrittenFiles`）顶栏升级为 `PLATE` 校样版分层底色；
  - 输入框底部控制栏增加分层托盘底色与细分割线，同时**完整保留原有的圆形发送图标、附件、模型、思考强度、扩展、润色、上下文圆环、工具预设和自动化按钮**。

### 更新检测修复
- **GitHub API 限流自动降级**：当共享代理 IP 触发 `api.github.com` 匿名限流（HTTP 403/429）时，「设置 › 常规 › 版本与更新」自动改读 GitHub Release CDN 的 `latest.json`，彻底解决代理限流导致检测不到新版本的问题。

## [1.9.1] - 2026-10-27

基于 Pi Agent 0.7.5（底层 Pi SDK 升级至 1.4.0）。放开「对话」模式的插件工具权限，并移植上游周报 #2 的性能与稳定性改进。

### 「对话」模式默认支持已安装插件
- 侧栏上方的非项目「对话（Chats）」现在**默认放开所有你安装的插件工具与 MCP 工具**（包括 `pi-web-access` 联网搜索与网页抓取、`pi-supermemory-dsh` 长期记忆检索与保存、`pi-mcp-adapter` 批量脚本等），无需再去「设置 › 常规 › 对话」里手动填写内部工具名。
- 修复 `pi-web-access` 动态工具激活导致「对话」模式首轮无法调用 `web_search` 的问题，新建对话第一轮即可直接联网检索。
- 项目专用的终端和文件修改工具（`bash`、`powershell`、`edit`、`write`、`grep`、`find`、`ls`）以及子智能体工具在「对话」中仍保持禁用，不自动创建磁盘文件夹。

### 性能与体验（上游周报 #2）
- **升级底层 Pi SDK 至 1.4.0**：上下文自动压缩和分支摘要改用模型自身的输出上限，彻底解决长推理模型（DeepSeek、Claude 高思考等）压缩时因固定输出长度限制而截断失败的问题；Codemode 支持多脚本/子任务并发排队。
- **超大会话极速加载**：≥16 MB 的 `.jsonl` 会话文件在读取时直接跳过界面不使用的 `toolResult.details` 大字段（只读不改磁盘文件），大幅缩短百兆级长会话的打开耗时。
- **`write` 工具展开直接显示文件内容**：展开已完成的 `write` 工具调用时直接渲染可读的文件正文，不再显示带 `\n` 转义的 JSON 字符串。
- **活跃时间实时递增**：会话运行期间状态轮询增量计算活跃时间，长任务进行中「会话信息」里的活跃时长保持实时刷新。

### 稳定性修复
- **Windows 启动等待放宽与诊断弹窗**：内置服务启动超时从 30 秒放宽至 90 秒（开机自启 180 秒）；万一启动失败，会在日志中附上 `server.log` 尾部并弹出提示框，不再触发无声崩溃。
- **模型配置修复**：在「设置 › 模型」中删除曾改名的自定义服务商时同步清理重命名记录，避免误改启用列表；保存 `models.json` 时保留符号链接。
- **Git 工作树缓存防污染**：`git` 进程被中断或临时失败时不再把错误结果写入项目根缓存。

## [1.9.0] - 2026-10-26

基于 Pi Agent 0.7.5。「Plus 分层」从一个主题变成**默认底层**，其他主题叠在它上面，只改颜色和字体。

### 主题叠加在 Plus 上
- 打开软件默认就是 Plus 的样子。选别的主题时，布局、间距、圆角保持 Plus 的，**只换颜色和字体**；主题没写的地方用 Plus 的值。
- 大多数主题自己没带字体，所以现在切过去正文仍是霞鹜新致宋（16px、行高 1.85）；Claude 陶土这类带了字体的主题用它自己的。你在外观页自己选的字体优先级最高。
- 圆角统一是 Plus 的，主题里原来的圆角（GitHub 6、Catppuccin 11 等）不再生效，主题编辑器里的圆角滑块去掉了。
- **层次兜底**：主题的窗口底色、内容面板、卡片三层颜色太接近时，自动往黑或白推开一档，色相不变，内容面板始终是主题自己的阅读底色。88 套配色（内置和主题库的浅色、深色）里有 37 套被微调，例如 GitHub 浅色的卡片和面板原来完全同色。
- 外观页新增「底层」：**Plus 分层（默认）/ 原生布局**。选「原生布局」就是官方 Pi Agent 原样，下面只能选为原生写的 CSS 主题，其余主题变灰；切回 Plus 时回到你之前用的主题。
- 内置主题卡片里不再有「原生」，「Plus 分层」标「默认」。

### 侧栏
- 只有子 Agent 的会话**默认折叠**，不再自动展开；子 Agent 在运行时，父会话行尾照常显示转圈。打开某个子 Agent 会话时，它所在的组会自动展开。

### 其他
- 各处错误、警告、成功提示的颜色改为跟随主题（之前是写死的红、黄、绿）。
- 已经选了其他主题的用户，升级后会看到 Plus 的字体、圆角和层次，颜色不变。
## [1.8.0] - 2026-10-25

基于 Pi Agent 0.7.5。设置界面参考 PI-Desktop 重做。

### 设置改成整页
- 「Plus 分层」等简洁风格主题下，设置铺满整个窗口，不再是叠在对话上的弹窗。左边是「返回」、**搜索设置**和分组导航（偏好：常规、外观；智能体：模型、技能、子代理、插件、MCP），右边是一块圆角面板，顶部写着当前页的名字和一句说明。
- 搜索框按页面名、说明和关键词筛选，例如输入「主题」「api key」「powershell」都能找到对应的页；按 Enter 打开第一个结果。第一次按 Esc 清空搜索，再按一次关闭设置。
- 设置页自带窗口的拖动区和最小化、最大化、关闭按钮。「原生」主题仍然是原来的弹窗。

### 插件页
- 已安装的插件改成**卡片**：显示首字母头像、插件名（不再是一长串安装来源）、来源类型（npm / Git / 本地文件夹）和版本、简介，以及**能力标签**。扩展会在智能体里运行代码，所以标成醒目的「运行代码」；技能、提示词、主题显示数量。卡片右下角直接开关，点卡片打开详情。
- 新增「**发现**」页：列出 pi.dev 上的插件（数据来自 npm 的 `pi-package` 关键词），默认按每周下载量排序，也可以搜索；已经装过的标「已安装」。安装要再点一次「确认安装」，提示会运行第三方代码，装到全局。
- 顶部可以筛选已安装的插件；「从来源安装」仍然可以填 npm 包名、git 地址或本地路径。

### 模型页
- 模型和服务商详情的标题显示名字本身，下面一行写「模型 · 服务商」或「服务商 · N 个模型」。
- 左侧列表：服务商后面显示模型数；模型后面的「T」换成图片输入和推理两个小图标，悬停有说明。
- 字段改成中文（模型 ID、显示名称）；Base URL、API Key、Headers 的说明翻译成中文；不再在每个输入框下面重复「已保存在此模型条目中」。
- 「移除 / 删除」改成不抢眼的红字按钮。

### 修复
- 代码字体里的中文会被拉开（「已 安 装」「未 提 供」「环 境 变 量」），版本号、未填写的价格和输入框提示改用界面字体显示。
## [1.7.1] - 2026-10-22

基于 Pi Agent 0.7.5。1.7.0 只做了重设计的配色和分层，很多效果图里的结构没做；这一版对照效果图逐处补齐。

### 侧栏
- 顶部是「π Pi Agent Plus」和收起按钮；**设置挪到底部**，和版本号、浅色/深色切换按钮放在一行。
- 搜索框写「搜索会话」，**Ctrl+K** 直接跳到搜索框（按 Enter 搜全文照旧）。
- 子 Agent 会话收进一行「子任务 N」，点开后用竖线串起来；有子任务在运行或被选中时自动展开。
- 运行中的转圈和未读的点挪到行尾；对话有气泡图标；项目右边显示会话数；「再显示 5 条」改成「还有 N 个会话」。
- 新建会话按钮带 `Ctrl N` 提示；只有当前打开的会话有底色和蓝色竖条。

### 对话
- 正文默认宽度改为 760px，大约每行 44 个字（你自己调过的宽度不受影响）。
- 回复底部一行写「● 模型 · 用量 · 时间」，复制按钮在最右；模型名只在生成过程中出现在回复上方。
- 改动卡里文件前面是彩色的类型标（RS、TSX、TS、PS1 等）。
- 问题导航刻度挪到面板右边。
- 运行斜杠命令时显示「正在运行 /命令名」，扩展面板在等你操作时加上「等你在下方面板里选择」；扩展面板标题后面写「扩展 · /命令名」。

### 标题栏与输入框
- 标题栏右边的「完整历史 / 分支 / 更多」改成图标按钮；会话运行中时标题后面有「运行中」标签。
- 输入框：附件按钮在工具行最左，发送键在工具行最右；工具行是「模型（带色点）· 思考 · 高 · 扩展 N ······ 上下文 · 工具预设 · 会话设置 · 发送」，项目名不再重复显示（标题栏已有）。
- 占位文字「给 Pi 发消息，@ 引用文件，/ 使用命令」；纯聊天里不提 @ 文件。
- 「原生」主题保持上游的输入框布局。

## [1.7.0] - 2026-10-22

基于 Pi Agent 0.7.5。本版是界面重设计的第一批：Windows 风格的外壳，加上以阅读为先的正文。

### 新增
- **新的默认主题「Plus 分层」**：窗口底色、内容面板、卡片三层底色分明，浅色模式也有清楚的色差；正文用霞鹜新致宋＋（16px、行高 1.85），粗体和标题用思源宋体。已经选过主题的不受影响，可以在「设置 › 外观」里切换。
- **两层外壳**：侧栏和标题栏在窗口底色上，对话和右侧面板各是一块圆角面板。标题栏一行显示会话名、项目和 git 分支。
- **运行中也能直接选发送方式**：Agent 在干活时输入框里有字，会并排出现「引导」（这一步做完就插进去）、「后续消息」（这一轮结束再发）和单独的停止键。回车照旧发后续消息。
- **改动卡写明文件在哪**：每个文件后面显示相对项目的目录，项目外的文件标「项目外」。
- **扩展面板换了外框**：标题显示面板自己的名字（例如「Smart Compact」），贴在输入框上方弹出，获得焦点时有描边和「按键发给面板」提示，收起、关闭都是图标按钮。

### 改进
- 输入框的模型、思考、扩展等按钮收进输入框卡片里；上下文用量改成小饼图加百分比，原来的圆环像在加载。
- 发送键改为圆形，没内容时是灰色。
- 侧栏里运行中的会话转圈改为灰色，蓝色只表示有未读回复；只有当前打开的会话左侧有蓝色竖条。
- 工作过程改成平的一行，运行中前面有跳动的蓝点。
- 代码块、用户气泡、回复底部那行统一了圆角和颜色。
- 扩展面板和扩展状态里的终端颜色跟随主题，深色主题下不再出现看不见的黑字。

## [1.6.1] - 2026-10-21

基于 Pi Agent 0.7.5。

### 修复
- **文件树的下载按钮点了没反应**：桌面版的网页视图会忽略普通的下载链接，现在点击会弹出「另存为」窗口，和文件预览页的下载按钮一样。
- **「在资源管理器中显示」跳不到对应目录**：之前传给资源管理器的是正斜杠路径（`C:/...`），资源管理器认不出，就打开了桌面并选中「文档」；路径带空格时也会失败。现在会打开文件所在的文件夹并选中该文件。打开项目文件夹的功能也一起修了。

## [1.6.0] - 2026-10-21

基于 Pi Agent 0.7.5。本版从 pi-web 上游周报（Issue #1）里挑出在 Plus 上实测确实存在的问题和功能，逐条移植。

### 修复
- **先点子目录、再点仓库根目录的会话，聊天会被关掉**：现在保持打开（pi-web #1307）。
- **「在此提问」**插入引用后，光标停在引用末尾，不再跳到最前面（#1319）。
- **Markdown 页内链接**：标题自动带锚点，`[跳到](#某个标题)`、脚注和它的返回链接都能在当前页跳到位，不再新开窗口；外部链接照旧在浏览器打开（#1323）。
- **改了模型设置，已打开的会话也能用上**：在「模型」里改了某个模型（接口类型、Base URL、上下文长度等）保存后，在会话里重新点一下这个模型就生效，不用再重开会话；重新选同一个模型也不会把思考强度从 high 打回 low（#1287）。
- **会话搜索**能搜到改过名或自动生成的标题（只匹配到标题时，点击直接打开会话）（#1318）。
- 用新版 skills.sh 装到 `.agents/skills` 的技能，在技能页正确归到 skills.sh 分组并带链接（42909b6d）。
- diff 有多段改动时，段与段之间显示「⋯ N 行未改动」，不再看起来像连在一起（#1304）。

### 新增
- 自定义的 Claude 模型（anthropic-messages 接口）可以在「兼容性」里打开 **自适应思考**；经中转时不开可能返回空思考块、看起来像卡住（#1331）。
- 模型可以单独设置 **Base URL**，覆盖服务商的地址（#1288）。
- 模型选择器和「添加服务商」可以按服务商名搜索，比如输入 `cpa` 列出 cpa 的全部模型，也支持 `服务商/模型` 写法（#1308）。
- 回复里的 `![](xxx.wav)`、`![](xxx.mp4)` 等音频、视频直接显示播放器（#1280）。
- 终端字号跟随聊天字号（默认 13px，滑块调大调小时一起变）（#1329）。

### 改进
- 运行中的状态轮询不再每次下载整段系统提示词：项目的 AGENTS.md 越大越明显，实测一次读取从约 325 KB 降到不到 1 KB（#1306）。

## [1.5.0] - 2026-10-21

基于 Pi Agent 0.7.5。

### 新增
- **工作过程时间线**（精简 / 标准档）：每一步一行——「运行 · npx tsc」「读取 · src/a.ts」「编辑 · plus.css +12 −3」，自动去掉 `cd 项目目录;`、`$env:…;` 这类前缀，路径显示为相对项目的路径；思考显示为一行浅灰字；连续的读取/搜索合成一行「读取了 6 个文件，搜索了 2 次」；失败只用红点标出，运行中显示转圈。点任意一行展开详情。详细 / 完整档仍是原来的卡片。
- **设置 › 外观** 独立成页：明暗模式、主题、强调色、字体、聊天宽度与字号、custom.css 都在这里；右侧是用真实聊天组件渲染的**实时预览**（用户消息、工作时间线、标题、粗体、列表、引用、表格、代码块、输入框），改什么立刻看到。
- **粗体与标题字体**：聊天字体只有常规体时（如霞鹜新致宋），粗体、标题和表头改用这个字体的真粗体。
- 测试版打包：可以打出独立的「Pi Agent Plus Test」（独立标识、端口 38591、独立设置文件），与正式版并存，用来验证新版本而不影响日常使用。

### 改进
- 输入框下面的两行合成一行：扩展状态和扩展小部件收进控制栏里的一个小标签（显示数量），点开查看详情。
- 回复下方的统计默认只显示费用（如 `$0.04`），鼠标移到该行时展开完整的 token 明细。
- 轻微动效：工作详情展开、时间线新行、流式回复出现时有短暂淡入；切换主题、强调色或明暗时颜色平滑过渡。系统开启“减少动态效果”时全部关闭。
- **性能（移植 pi-web 0.12）**：流式回复时由独立的 store 驱动，每个片段只重新渲染正在生成的部分，聊天窗口和输入框不再跟着重绘（#1191）；长回复按 Markdown 块增量解析（#1176）；大段代码在空闲时分批上色，打开长会话更快（#1181）；工具结果图片长期缓存；会话列表和会话缓存的若干计算更省。
## [1.4.1] - 2026-10-20

基于 Pi Agent 0.7.5。

- 用于验证应用内一键升级（1.4.0 → 1.4.1），没有功能变化。

## [1.4.0] - 2026-10-20

基于 Pi Agent 0.7.5。

### 新增
- **应用内一键升级**：设置 › 版本与更新 › “升级”会下载本仓库的新版、校验签名、安装并重启。升级包用 Plus 自己的密钥签名，只认本仓库的 Release。
- **设置不再因端口变化而“丢失”**：主题、字体、宽度、语言、侧栏状态等偏好同时保存在 `~/.pi/agent/desktop/plus-prefs.json`，启动时先恢复。端口被占用时也会先等几秒再换端口。
- **提示词优化设置**（设置 › 常规 › 提示词优化）：指定使用的模型和思考强度、整理风格（按需 / 简洁 / 结构化）、是否参考当前对话，以及自己的额外要求。
- **主题库**：收录 OpenCode 的 32 套主题（Dracula、One Dark、Tokyo Night、Catppuccin、Kanagawa、Everforest、Night Owl、Monokai、Material、Ayu、Synthwave '84 等，多数有浅色 + 深色），点一下即安装应用，可再编辑。
- **导入 VS Code 主题**：“导入…”现在也接受 VS Code 配色主题的 .json（主题插件里的文件），自动转换成调色板主题，含代码高亮色。
- **对话大纲增强**：大纲上方的列表按钮，悬停即显示全部提问，点击跳转；跳转后目标消息会闪一下高亮。
- 每周自动生成上游更新报告（GitHub Issue），只报告、不自动合并，详见 VERSIONING-PLUS.md。

### 改进
- 内置主题精简为 6 个（简洁、原生、Claude 陶土、GitHub、护眼绿、石墨黑白）；北极、Solarized、Catppuccin、东京之夜、玫瑰松、Gruvbox 改由主题库提供（正在使用的不受影响）。
- 输入框里的补全、插入引用和“优化提示词”现在都可以用 Ctrl+Z 撤销（上游 #127）。
- 会话信息里的“活跃时间”在运行中持续更新，不再停在打开时的值（pi-web #1334）。
- 扩展命令（不调用模型）不再触发“会话完成”通知（pi-web #1345）。

### 修复
- 聊天区滚动条拖到输入框高度时点不中。
- 安全：每次启动重新生成 Next.js 预览密钥，防止用公开的安装包里的值绕过本地接口校验（移植自 pi-web cf3ebfba）。
- 安全：git diff 接口不再能通过目录联接读到项目外文件；覆盖上传失败时不再删掉原文件（移植自 pi-web 1ddaf11f）。
## [1.3.0] - 2026-10-20

基于 Pi Agent 0.7.5。

### 新增
- **优化提示词**：输入框里有文字时，发送按钮左边出现一个 ✨ 按钮，用当前选中的模型把随手写的话整理成清晰的提示词（保持原语言，不丢细节、不编造路径等具体信息；在进行中的对话里会参考前文把“那个问题”之类说清楚）。优化后按钮变成 ↶，点一下恢复原文；提示条里也有“撤销优化”。

### 修复
- **思考块左边线等处不管什么主题都是橙色**：custom.css 在启动时已开始加载，1.2.0 只关了 `<link>` 的 disabled，没关掉已加载的样式表，结果它仍叠在所有主题上。现在样式表本身也会被关闭，之后热重载也保持关闭。
## [1.2.0] - 2026-10-20

基于 Pi Agent 0.7.5。

### 修复
- **换了主题仍残留旧样式**：之前 custom.css 默认对所有主题叠加，你的 Claude custom.css（陶土色列表符号、米色表头、衬线标题、思考块橙边等）会盖在任何主题上。现在 custom.css 默认不叠加（旧设置不迁移），需要时在“在主题上叠加 custom.css”里手动打开，或用“从 custom.css 导入”把它变成独立主题。

### 改进
- **主题引擎重写**：每个主题都覆盖整个界面，包括侧栏、顶栏、用户气泡、回复正文字体与行距、标题、列表符号、引用、表格、分隔线、行内代码、代码块与标题栏、代码语法高亮、思考块、工具卡片（成功/失败/中止）、diff、本轮改动文件、Artifact 卡片、输入框和发送按钮、按钮/开关/滑块/复选框、菜单、对话框、遮罩、导航器。
- **12 套内置主题全部更新**：每套都配了专属的语法高亮色、按钮色、列表符号色、代码标题栏色和圆角；Claude 陶土完整复刻原 custom.css（衬线阅读、斜体思考）。
- **主题工具**：新增“新建主题”与调色板编辑器，按浅色/深色分别调颜色（背景、文字、强调、按钮、代码、状态共 22 项）、15 种代码高亮色（带预览）、回复字体/标题字体/字号/行距/圆角/斜体思考，并可追加额外 CSS；改动实时预览到整个窗口，可切换预览浅色/深色，Ctrl+S 保存。
- 旧的 CSS 主题可一键“转为调色板主题”。
- 自定义强调色现在同时作用于按钮、开关、列表符号和行内代码。
## [1.1.0] - 2026-10-20

基于 Pi Agent 0.7.5。

### 新增
- **主题系统**：内置 12 套主题（简洁、原生、Claude 陶土、GitHub、北极 Nord、Solarized、Catppuccin、东京之夜、玫瑰松、Gruvbox 复古、护眼绿、石墨黑白），每套都有浅色和深色。
- **主题导入与管理**：导入任意 CSS 作为新主题；一键把现有 custom.css 转为主题；内置主题可“复制为自定义主题”作为模板；主题可编辑（实时预览）、导出、删除、改名、切换基础布局。主题文件保存在 `~/.pi/agent/desktop/plus-themes/`，外部编辑保存后即时生效。
- **字体**：界面字体、聊天字体、代码字体分开设置，可从 Windows 已安装的全部字体中搜索选择（含中文字体名，逐项用字体本身预览）。
- **文件树操作**：右键菜单支持新建文件/文件夹、重命名（F2）、创建副本、复制路径/相对路径、在资源管理器中显示、删除（Del，移到回收站）。
- 设置页显示 Plus 版本及其基于的上游版本。

### 改进
- 字体选择器和工作详情菜单不再被设置窗口遮挡。

## [1.0.0] - 2026-10-20

基于 Pi Agent 0.7.5。首个 Plus 版本。

### 新增
- 独立安装：应用名 Pi Agent Plus、独立标识与端口，可与官方版同时运行；版本检查指向本仓库，不会被官方版覆盖。
- 工作详情分级（精简 / 标准 / 详细 / 完整）与“何时收起”，参考 DeepSeek Harness；运行中的工具调用收成一行实时状态，可随时展开/收起，带全部展开/收起。
- 对话内查找（Ctrl+F），可搜到已收起的思考、工具参数和输出。
- 简洁界面风格、强调色、界面字体；custom.css 热重载与内置 CSS 编辑器。
- 聊天宽度支持 px / %，可在聊天区边缘直接拖动调整。

### 修复
- “生成标题”时灵时不灵：给不可关闭思考的模型留足输出额度，空回复自动重试，仍失败则用首条提问作标题，并始终用当前对话的模型。
- 对话导航器的预览卡片点不到（上游 #130 未真正修复）。
