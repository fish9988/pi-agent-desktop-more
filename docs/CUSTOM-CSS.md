# Pi Atelier · 纸枢（Pi Agent Plus）自定义 CSS 编写指南

本应用支持通过 **自定义 CSS** 深度定制全局视觉风格、色彩体系、行内代码与标题排版、UI 布局尺寸、背景壁纸以及亚克力毛玻璃特效。

## 1. 两种编辑与实时预览方式

1. **内置「自定义 CSS 工作台（Custom CSS Studio）」**（推荐）：
   - 打开 **「设置 › 外观 › 自定义 CSS 工作台」**；
   - 点击右上角 **「开启全局界面预览」**，设置窗口会自动收起为右下角半透明悬浮调色台，完整露出背后的主界面（侧边栏、顶栏、聊天区、代码块与输入框）；
   - 可直接点击 **6 款一键风格预设芯片**（朱砂墨韵代码、翡翠松林代码、杂志大标题排版、亚克力毛玻璃、流光壁纸 + 毛玻璃、宽屏沉浸布局），或在下方编辑框中编写任意 CSS，**输入即刻全局毫秒级生效**；
   - 点击 **「保存」**（或按 `Ctrl + S`）即可持久化写入 `~/.pi/agent/desktop/custom.css` 并自动开启自定义 CSS 覆盖。
2. **外部编辑器热重载**：
   - 使用 VS Code / Cursor 等外部编辑器直接编辑 `~/.pi/agent/desktop/custom.css`；
   - 应用在窗口可见时每秒自动检测文件指纹变化，保存后无需刷新窗口即可自动热更新。

---

## 2. 推荐的根选择器写法

为了让你的变量覆盖在 **所有 5 款内置主题（浅色与深色模式）** 下都能稳定生效，建议将 CSS 变量写在：

```css
/* 同时作用于浅色与深色模式 */
html[data-plus-theme]:root {
  /* 在此覆盖 CSS 变量 */
}

/* 仅针对深色模式微调 */
html.dark[data-plus-theme]:root {
  /* 在此覆盖深色模式下的 CSS 变量 */
}
```

---

## 3. 核心设计变量接口全表（Design Tokens）

### 3.1 强调色、行内代码、列表与标题色彩接口

| CSS 变量名 | 作用区域 | 示例值 |
| :--- | :--- | :--- |
| `--accent` | 全局主强调色（链接、激活态、品牌印章、徽标等） | `#c44d36`（朱砂） / `#2d6a4f`（翡翠） |
| `--plus-fill` | 主按钮、发送按钮、开关滑块填充色 | `#1c1a15` / `var(--accent)` |
| `--plus-fill-text` | 主按钮与发送按钮上的文字/图标颜色 | `#ffffff` |
| `--plus-inline-code` | **正文中行内代码（`` `code` ``）的文字颜色** | `#7a2716` |
| `--plus-inline-code-bg` | **正文中行内代码胶囊的背景色** | `rgba(196, 77, 54, 0.12)` |
| `--plus-inline-code-border` | **正文中行内代码胶囊的边框色** | `rgba(196, 77, 54, 0.28)` |
| `--plus-marker` | **Markdown 列表圆点（`•`）、有序编号与引用竖条颜色** | `#c44d36` |
| `--plus-heading-color` | **Markdown `H1` ~ `H6` 标题文字颜色** | `var(--accent)` 或 `#15140f` |
| `--plus-link-color` | **Markdown 超链接文字与下划线颜色** | `var(--accent)` |
| `--plus-user-bar-color` | **用户提问卡左侧强调竖条颜色** | `#c44d36` |

### 3.2 三层纸面/画布与文字颜色接口

| CSS 变量名 | 作用区域 | 说明 |
| :--- | :--- | :--- |
| `--bg` / `--bg-panel` | 第一层：窗口底层画布与左侧边栏背景 | 最深（浅色模式）或最暗（深色模式）的一层 |
| `--workbench-bg` | 第二层：中间主对话工作区背景 | 比 `--bg` 亮一阶的阅读画布 |
| `--surface` | 第三层：浮动卡片、输入框、下拉菜单、设置卡片背景 | 最高层级的卡片表面 |
| `--user-bg` | 用户提问气泡卡片背景色 | 默认与 `--surface` 协调 |
| `--text` | 主正文颜色 | 最高对比度墨色 |
| `--text-muted` | 次要正文与说明文字颜色 | 中等对比度 |
| `--text-dim` | 时间戳、路径、辅助元信息颜色 | 弱化信息 |
| `--plus-code-bg` / `--plus-code-header` | 代码块主体背景与代码块顶栏背景 | 独立控制多行代码框外观 |

### 3.3 背景壁纸与亚克力毛玻璃特效接口（Wallpaper & Frosted Glass）

| CSS 变量名 | 作用区域 | 示例值 |
| :--- | :--- | :--- |
| `--plus-bg-image` | 全局底层背景图片或多重渐变光影 | `url("https://...")` 或 `radial-gradient(...)` |
| `--plus-glass-blur` | 侧边栏、顶栏、对话区、卡片与输入框的毛玻璃模糊度 | `20px`（默认 `0px` 关闭） |
| `--plus-glass-saturation` | 毛玻璃色彩饱和度增益 | `160%`（默认 `100%`） |
| `--plus-surface-alpha` | 主对话区与卡片透出底层壁纸的透明比例 | `28%`（默认 `0%` 不透明） |

### 3.4 布局、间距与圆角阶梯接口

| CSS 变量名 | 作用区域 | 默认值与示例 |
| :--- | :--- | :--- |
| `--chat-content-max-width` | 聊天消息流与输入框的最大版心宽度 | 默认 `760px`，可设为 `980px` 或 `90%` |
| `--plus-r-ctl` | 小型控件、按钮、行内代码圆角 | 默认 `4px` |
| `--plus-r-card` | 消息卡、改动文件卡、项目组圆角 | 默认 `8px` |
| `--plus-r-overlay` | 主工作区大面板、输入舱、弹窗圆角 | 默认 `12px` |
| `--plus-reading-size` | AI 回复正文基准字号 | 默认 `16px` |
| `--plus-reading-leading` | AI 回复正文行高 | 默认 `1.85` |

---

## 4. 常用 UI 区域选择器速查表

如果你想针对某个具体模块精细调整布局或样式，可以直接使用以下选择器：

- **左上角品牌区**：`.sidebar-brand`、`.sidebar-brand-mark`（图标章）、`.sidebar-brand-name`（名称）、`.sidebar-brand-badge`（纸枢徽章）
- **左侧边栏项目列表**：
  - 项目分组容器：`.sidebar-project-tree-group`（激活态 `.is-active`，折叠态 `.is-collapsed`）
  - 文件夹图标徽标：`.sidebar-project-tree-folder`
  - 项目名称与右侧计数胶囊：`.sidebar-project-tree-name`、`.sidebar-project-tree-count`
- **顶部标题栏与子代理下拉切换器**：
  - 顶栏容器：`.app-topbar`、`.app-topbar-title`
  - 子代理下拉按钮：`.app-topbar-subagents`（运行中 `.is-running`，展开态 `.is-open`）
  - 返回主会话按钮：`.app-topbar-parent-button`
- **聊天消息流**：
  - 用户提问卡片：`.message-user-bubble`
  - AI 回复正文：`.message-assistant .markdown-body`
  - 行内代码：`.markdown-body :is(code:not(pre code), .markdown-inline-code)`
  - 工作过程时间线胶囊条：`.work-group-trigger`
  - 改动文件校样卡：`.turn-files-card`、`.turn-files-header`
- **底部输入框（Composer）**：
  - 输入框整体外框：`.chat-composer-frame`
  - 底部模型/工具控制托盘：`.chat-composer-controls`

---

## 5. 实用自定义 CSS 模板示例

### 示例 A：把正文中行内代码和列表圆点改为温润朱砂色（或任意颜色）

```css
html[data-plus-theme]:root {
  --plus-inline-code: #7a2716;
  --plus-inline-code-bg: color-mix(in srgb, #c44d36 13%, var(--surface));
  --plus-inline-code-border: color-mix(in srgb, #c44d36 26%, transparent);
  --plus-marker: #c44d36;
  --plus-user-bar-color: #c44d36;
}
```

### 示例 B：开启背景壁纸 + 全界面 macOS 亚克力毛玻璃特效

```css
html[data-plus-theme]:root {
  /* 可以使用本地/网络图片 url("...") 或渐变光影 */
  --plus-bg-image:
    radial-gradient(circle at 15% 18%, rgba(196, 77, 54, 0.22), transparent 45%),
    radial-gradient(circle at 85% 22%, rgba(233, 185, 74, 0.24), transparent 48%),
    radial-gradient(circle at 52% 88%, rgba(82, 102, 44, 0.18), transparent 52%);
  --plus-glass-blur: 22px;
  --plus-glass-saturation: 165%;
  --plus-surface-alpha: 32%;
}
```

### 示例 C：定制杂志风章节大标题与引用块

```css
html[data-plus-theme]:root {
  --plus-heading-color: var(--accent);
}
.markdown-body h1,
.markdown-body h2 {
  padding-bottom: 6px;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
}
```
