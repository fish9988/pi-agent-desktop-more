# Bundled interface fonts

The Claude-style interface uses three open-licensed variable fonts, renamed so the
CSS never depends on a system-installed copy:

| Family | File | Origin | Licence |
| --- | --- | --- | --- |
| `Pi Sans` | `PiSansVariable.woff2` | Inter Variable (rsms/inter) | SIL OFL 1.1 |
| `Pi Serif` | `PiSerifVariable.woff2` | Noto Serif variable (Google) | SIL OFL 1.1 |
| `Pi Mono` | `PiMonoVariable.ttf`, `PiMonoItalicVariable.ttf` | JetBrains Mono variable | SIL OFL 1.1 |

They stand in for Anthropic's proprietary Styrene / Copernicus / Anthropic Mono, which
are not redistributable. Text rendered in `Pi Serif` is the assistant prose, `Pi Sans`
is the chrome, `Pi Mono` is code and every terminal surface.
