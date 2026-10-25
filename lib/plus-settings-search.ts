import type { SettingsSection } from "./settings-navigation";

/**
 * Plus 1.8: Settings as a full page (after PI-Desktop) groups its sections in
 * the left column and filters them with a search box. Matching is per section:
 * the label, its one-line description and these extra words in the three
 * interface languages, so "主题" or "api key" finds the page that holds it.
 */
export const SETTINGS_NAV_GROUPS: { id: "preferences" | "agent"; sections: SettingsSection[] }[] = [
  { id: "preferences", sections: ["general", "appearance"] },
  { id: "agent", sections: ["models", "skills", "agents", "plugins", "mcp"] },
];

const SETTINGS_KEYWORDS: Partial<Record<SettingsSection, string>> = {
  general: "language 语言 語言 update 更新 version 版本 powershell bash shell sound 提示音 提示音 thinking 思考 work details 工作详情 工作詳情 enter 发送 傳送 diff 对比 quote 引用 artifact 预览 預覽 chats 对话 對話 prompt optimize 优化 優化 tray 托盘 autostart 开机 開機",
  appearance: "theme 主题 主題 font 字体 字體 color 颜色 顏色 配色 width 宽度 寬度 size 字号 字號 dark 深色 light 浅色 淺色 css",
  models: "model 模型 provider 服务商 服務商 api key 密钥 金鑰 base url price 价格 價格 cost context 上下文 oauth login 登录 登入 image 图像 圖像 classifier 分类 分類",
  skills: "skill 技能 skills.sh",
  agents: "subagent sub-agent 子代理 agent 智能体 智慧體 profile",
  plugins: "plugin 插件 外掛 extension 扩展 擴充 package 包 npm git pi.dev marketplace 市场 市集 发现 發現",
  mcp: "mcp server 服务器 伺服器 tool 工具 trust 信任",
};

/** The sections whose label, description or keywords contain every word of `query`. */
export function matchSettingsSections<T extends { id: SettingsSection; label: string; description?: string }>(
  sections: T[],
  query: string,
): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return sections;
  return sections.filter((section) => {
    const haystack = `${section.label} ${section.description ?? ""} ${SETTINGS_KEYWORDS[section.id] ?? ""}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
