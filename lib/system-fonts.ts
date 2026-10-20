import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** One installed font family. `name` is the CSS family name (English). */
export interface SystemFont {
  name: string;
  /** Localised family names, when the font has them (e.g. 微软雅黑). */
  zh?: string;
  tw?: string;
  /** Heuristic: the family name says it is a monospace / code font. */
  mono?: boolean;
}

const MONO_HINT = /\b(mono|code|consol|courier|terminal|fixed|menlo|inconsolata|hack|fira code|jetbrains|cascadia|sarasa (?:mono|term|fixed)|nerd font|\bnf\b)/i;

// WPF knows TrueType collections (msyh.ttc -> "Microsoft YaHei") and the
// localised names; GDI+ adds weight-named families (e.g. "Cascadia Code
// Light"). Both include per-user fonts. Output is name|zh-cn|zh-tw lines.
const WINDOWS_SCRIPT = [
  "[Console]::OutputEncoding=[Text.Encoding]::UTF8",
  "$names=@{}",
  "try { Add-Type -AssemblyName PresentationCore; $en=[System.Windows.Markup.XmlLanguage]::GetLanguage('en-us'); $zh=[System.Windows.Markup.XmlLanguage]::GetLanguage('zh-cn'); $tw=[System.Windows.Markup.XmlLanguage]::GetLanguage('zh-tw'); foreach($f in [System.Windows.Media.Fonts]::SystemFontFamilies){ $n=$f.FamilyNames; $e=$n[$en]; if(-not $e){ $e=($f.Source -split '#')[-1] }; $names[$e]=\"$e|$($n[$zh])|$($n[$tw])\" } } catch {}",
  "try { Add-Type -AssemblyName System.Drawing; foreach($f in (New-Object System.Drawing.Text.InstalledFontCollection).Families){ $e=$f.GetName(0); if(-not $names.ContainsKey($e)){ $names[$e]=\"$e||\" } } } catch {}",
  "$names.Values",
].join("; ");

export function parseWindowsFontLines(stdout: string): SystemFont[] {
  const fonts = new Map<string, SystemFont>();
  for (const line of stdout.split(/\r?\n/)) {
    const [name, zh, tw] = line.split("|").map((part) => part?.trim() ?? "");
    if (!name || name.startsWith("@")) continue;
    const font: SystemFont = { name };
    if (zh && zh !== name) font.zh = zh;
    if (tw && tw !== name) font.tw = tw;
    if (MONO_HINT.test(name)) font.mono = true;
    fonts.set(name.toLowerCase(), font);
  }
  return [...fonts.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
}

async function listWindowsFonts(): Promise<SystemFont[]> {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    // -EncodedCommand sidesteps Windows command-line quoting of the script.
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(WINDOWS_SCRIPT, "utf16le").toString("base64")],
    { windowsHide: true, timeout: 30_000, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" },
  );
  return parseWindowsFontLines(stdout);
}

async function listFontconfigFonts(): Promise<SystemFont[]> {
  const { stdout } = await execFileAsync("fc-list", [":", "family", "spacing"], { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
  const fonts = new Map<string, SystemFont>();
  for (const line of stdout.split(/\r?\n/)) {
    const [familyPart, spacingPart] = line.split(":");
    const families = (familyPart ?? "").split(",").map((part) => part.trim()).filter(Boolean);
    if (families.length === 0) continue;
    const name = families[0];
    const font: SystemFont = fonts.get(name.toLowerCase()) ?? { name };
    if (/spacing=(100|90)/.test(spacingPart ?? "") || MONO_HINT.test(name)) font.mono = true;
    fonts.set(name.toLowerCase(), font);
  }
  return [...fonts.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
}

declare global {
  var __plusSystemFonts: Promise<SystemFont[]> | undefined;
}

/** Installed font families, cached for the server's lifetime unless refreshed. */
export function listSystemFonts(refresh = false): Promise<SystemFont[]> {
  if (!refresh && globalThis.__plusSystemFonts) return globalThis.__plusSystemFonts;
  const pending = (process.platform === "win32" ? listWindowsFonts() : listFontconfigFonts())
    .catch((error) => {
      globalThis.__plusSystemFonts = undefined;
      throw error;
    });
  globalThis.__plusSystemFonts = pending;
  return pending;
}
