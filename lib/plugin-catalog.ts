/**
 * Plus 1.8: Settings › Plugins › Discover. pi.dev/packages lists the npm
 * packages tagged `pi-package`, so the same list comes from npm's public
 * search API: no scraping, and the download counts npm already reports.
 * Shared by the route (server) and the panel (client); no node imports here.
 */

export interface PluginCatalogEntry {
  name: string;
  description: string;
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
      version: str(pkg.version),
      publisher: author,
      weeklyDownloads: typeof downloads === "number" && Number.isFinite(downloads) ? downloads : 0,
      updated: str((object as { updated?: unknown }).updated) || str(pkg.date),
      npmUrl: /^https:\/\//.test(str(links.npm)) ? str(links.npm) : `https://www.npmjs.com/package/${name}`,
      repoUrl: /^https:\/\//.test(repo) ? repo : "",
    });
  }
  return byDownloads ? entries.sort((a, b) => b.weeklyDownloads - a.weeklyDownloads) : entries;
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
