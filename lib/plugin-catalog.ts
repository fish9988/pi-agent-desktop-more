/**
 * Plus 1.8: Settings › Plugins › Discover. pi.dev/packages lists the npm
 * packages tagged `pi-package`, so the same list comes from npm's public
 * search API: no scraping, and the download counts npm already reports.
 * Shared by the route (server) and the panel (client); no node imports here.
 */

export type PluginCatalogCategory =
  | "精选推荐"
  | "搜索与记忆"
  | "工作流与规划"
  | "代码与安全"
  | "用量与状态";

export const PLUGIN_CATALOG_CATEGORIES: readonly PluginCatalogCategory[] = [
  "精选推荐",
  "搜索与记忆",
  "工作流与规划",
  "代码与安全",
  "用量与状态",
] as const;

export interface CuratedPluginMeta {
  zhDescription: string;
  category: PluginCatalogCategory;
  featured?: boolean;
}

export const CURATED_PLUGINS: Readonly<Record<string, CuratedPluginMeta>> = {
  "billion-context": {
    zhDescription: "超长上下文智能压缩与检索增强，让百万级代码库对话保持清晰不遗忘",
    category: "搜索与记忆",
    featured: true,
  },
  "pi-mcp-adapter": {
    zhDescription: "将任意 MCP（Model Context Protocol）服务器无缝桥接为 Pi 原生工具",
    category: "精选推荐",
    featured: true,
  },
  "pi-web-access": {
    zhDescription: "赋予 Agent 实时联网搜索、网页抓取与文档阅读能力",
    category: "搜索与记忆",
    featured: true,
  },
  "cc-safety-net": {
    zhDescription: "危险命令与破坏性文件操作安全护栏，执行前自动拦截与二次确认",
    category: "代码与安全",
    featured: true,
  },
  "@plannotator/pi-extension": {
    zhDescription: "可视化架构规划与交互式批注审阅工作流扩展",
    category: "工作流与规划",
    featured: true,
  },
  "pi-lens": {
    zhDescription: "代码上下文透镜，快速透视符号定义、引用关系与依赖结构",
    category: "代码与安全",
    featured: true,
  },
  "@juicesharp/rpiv-ask-user-question": {
    zhDescription: "RPIV 交互式澄清提问工具，让 Agent 在需求模糊时主动向用户确认选项",
    category: "工作流与规划",
    featured: true,
  },
  "@juicesharp/rpiv-todo": {
    zhDescription: "RPIV 结构化任务清单与多步执行进度追踪器",
    category: "工作流与规划",
  },
  "pi-web-search": {
    zhDescription: "轻量级多引擎联网搜索扩展，支持快速检索最新技术文档与问答",
    category: "搜索与记忆",
  },
  "pi-memory": {
    zhDescription: "跨会话持久记忆库，自动沉淀项目规范、用户偏好与历史排错经验",
    category: "搜索与记忆",
    featured: true,
  },
  "@quintinshaw/pi-dynamic-workflows": {
    zhDescription: "动态多阶段工作流编排引擎，按任务复杂度自动切换规划与实现策略",
    category: "工作流与规划",
  },
  "pi-simplify": {
    zhDescription: "代码精简与重构助手，自动识别冗余逻辑并生成地道简洁的实现",
    category: "代码与安全",
  },
  "@narumitw/pi-usage": {
    zhDescription: "实时统计各模型服务商 Token 消耗、缓存命中率与费用明细",
    category: "用量与状态",
  },
  "pi-zhipu-usage": {
    zhDescription: "智谱 GLM 编码套餐与 API 额度实时用量监控面板",
    category: "用量与状态",
  },
  "pi-btw": {
    zhDescription: "不打断主线任务的轻量级侧边快问（By The Way）即时问答扩展",
    category: "工作流与规划",
  },
  "@sting8k/pi-vcc": {
    zhDescription: "会话级代码变更快照与版本对比控制（Version Control Companion）",
    category: "代码与安全",
  },
  "pi-context-view": {
    zhDescription: "可视化检视当前会话的上下文构成、系统提示词与 Token 占用分布",
    category: "用量与状态",
  },
  "pi-hashline-edit-pro": {
    zhDescription: "基于行哈希校验的高精度代码编辑工具，大幅降低大文件改写错位率",
    category: "代码与安全",
    featured: true,
  },
};

const NOISY_INTERNAL_PACKAGE_RE = /^@agimon-ai\/po-/i;

export function isNoisyCatalogPackage(name: string): boolean {
  return NOISY_INTERNAL_PACKAGE_RE.test(name);
}

export interface PluginCatalogEntry {
  name: string;
  description: string;
  zhDescription?: string;
  category?: PluginCatalogCategory;
  curated?: boolean;
  version: string;
  publisher: string;
  weeklyDownloads: number;
  updated: string;
  npmUrl: string;
  repoUrl: string;
}

export const CATALOG_MAX_QUERY = 100;
export const CATALOG_PAGE_SIZE = 60;

/** npm search URL for pi packages, optionally narrowed by free text. */
export function catalogSearchUrl(query: string, size = CATALOG_PAGE_SIZE): string {
  const text = ["keywords:pi-package", query.trim().slice(0, CATALOG_MAX_QUERY)].filter(Boolean).join(" ");
  const params = new URLSearchParams({ text, size: String(Math.min(250, Math.max(1, Math.floor(size)))) });
  return `https://registry.npmjs.org/-/v1/search?${params}`;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Normalizes npm's search response; malformed rows are dropped. Browsing (no query) lists the most downloaded first, a search keeps npm's relevance order. */
export function parseNpmSearch(json: unknown, byDownloads = true): PluginCatalogEntry[] {
  const objects = (json as { objects?: unknown })?.objects;
  if (!Array.isArray(objects)) return [];
  const entries: PluginCatalogEntry[] = [];
  for (const object of objects) {
    const pkg = (object as { package?: Record<string, unknown> })?.package;
    const name = str(pkg?.name);
    if (!pkg || !/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name)) continue;
    if (isNoisyCatalogPackage(name)) continue;
    const curatedMeta = CURATED_PLUGINS[name];
    const links = (pkg.links ?? {}) as Record<string, unknown>;
    const downloads = (object as { downloads?: { weekly?: unknown } }).downloads?.weekly;
    const repo = str(links.repository).replace(/^git\+/, "").replace(/\.git$/, "");
    // CI-published packages name the bot ("GitHub Actions"); the first maintainer is the author.
    const publisher = str((pkg.publisher as { username?: unknown } | undefined)?.username);
    const maintainer = Array.isArray(pkg.maintainers) ? str((pkg.maintainers[0] as { username?: unknown } | undefined)?.username) : "";
    const author = !publisher || /^github[ -]actions$/i.test(publisher) ? maintainer || publisher : publisher;
    entries.push({
      name,
      description: str(pkg.description).trim(),
      ...(curatedMeta ? {
        zhDescription: curatedMeta.zhDescription,
        category: curatedMeta.category,
        curated: true,
      } : {}),
      version: str(pkg.version),
      publisher: author,
      weeklyDownloads: typeof downloads === "number" && Number.isFinite(downloads) ? downloads : 0,
      updated: str((object as { updated?: unknown }).updated) || str(pkg.date),
      npmUrl: /^https:\/\//.test(str(links.npm)) ? str(links.npm) : `https://www.npmjs.com/package/${name}`,
      repoUrl: /^https:\/\//.test(repo) ? repo : "",
    });
  }
  return byDownloads
    ? entries.sort((a, b) => {
      if (Boolean(a.curated) !== Boolean(b.curated)) return a.curated ? -1 : 1;
      return b.weeklyDownloads - a.weeklyDownloads;
    })
    : entries;
}

/** 1234 → "1.2K"; used for download counts on the cards. */
export function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

/** What a plugin's source names: an npm package, a git repository, or a folder on this machine. */
export type PluginSourceKind = "npm" | "git" | "local";

export function pluginSourceKind(source: string): PluginSourceKind {
  if (source.startsWith("npm:")) return "npm";
  if (/^(git:|git\+|https?:\/\/|ssh:\/\/|git@)/.test(source)) return "git";
  return "local";
}

/** A readable name for an installed source: the package name, or the repo / folder's last segment. */
export function pluginDisplayName(source: string, packageName?: string | null): string {
  if (packageName) return packageName;
  if (source.startsWith("npm:")) return source.slice(4).replace(/@[^@/]+$/, "") || source;
  const trimmed = source.replace(/[\\/]+$/, "").replace(/\.git$/, "").replace(/#.*$/, "");
  const last = trimmed.split(/[\\/:]/).filter(Boolean).pop();
  return last || source;
}

/** The letter on a plugin's avatar: scope and a leading "pi-" are skipped. */
export function pluginInitial(name: string): string {
  const bare = name.replace(/^@[^/]+\//, "").replace(/^pi[-_]/i, "");
  return (Array.from(bare)[0] ?? "?").toUpperCase();
}

/** A stable hue for a plugin's avatar. */
export function pluginHue(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash % 360;
}
