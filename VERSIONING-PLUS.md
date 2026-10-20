# Pi Agent Plus 版本与分支管理

## 分支

| 分支 | 用途 |
|---|---|
| `plus`（默认分支） | Plus 的开发主线，所有改动都提交到这里 |
| `main` | 保持与 fork 时的上游一致，不在这里开发 |
| `upstream` 远程 | `https://github.com/abcwyc/pi-agent-desktop`，只读，push 已禁用 |

不会自动与上游同步。需要上游的某个修复时，手动挑选：

```bash
git fetch upstream
git log --oneline plus..upstream/main      # 看上游新增了什么
git cherry-pick <commit>                    # 只拿需要的提交
```

上游样式文件（`app/globals.css`、`app/settings.css`、`app/native-theme.css`）保持不改，Plus 的样式都在
`app/plus.css` 和 `app/plus-theme.css`，这样挑选上游提交时冲突最少。

## 版本号

Plus 使用自己的语义化版本，写在 `plus-version.json`：

- `version`：Plus 版本（`MAJOR.MINOR.PATCH`）。新功能升 MINOR，只修 bug 升 PATCH。
- `upstream`：所基于的上游 pi-agent-desktop 版本（仅作记录；界面显示读取 `src-tauri/pi-agent-desktop-package.json`）。

## 发布流程

1. 改 `plus-version.json` 的 `version`，在 `CHANGELOG-PLUS.md` 顶部写好这一版的条目（`## [X.Y.Z] - 日期`）。
2. 提交并推送到 `plus`。
3. 打标签并推送：

   ```bash
   git tag -a vX.Y.Z -m "Pi Agent Plus X.Y.Z"
   git push origin vX.Y.Z
   ```

4. GitHub Actions（`Plus Windows build`）会构建安装包，并创建 Release `vX.Y.Z`，附带安装包和这一版的更新日志。
   标签与 `plus-version.json` 不一致时构建会失败。

平时推送到 `plus` 也会构建，版本为 `X.Y.Z-dev.<运行编号>`，安装包在 Actions 的 Artifacts 里，不会发布 Release。

## 测试版（与正式版并存）

正式版正在使用时（比如 Agent 本身就跑在 Plus 里），不能覆盖安装去验证新版本。这时打一个测试版：

```bash
gh workflow run plus-windows-build.yml -R fish9988/pi-agent-desktop-more --ref plus -f flavor=test
```

测试版叫「Pi Agent Plus Test」，标识 `com.fish9988.pi-agent-plus-test`、程序 `pi-agent-plus-test.exe`、端口 38591、
设置文件 `plus-prefs.test.json`，没有自动升级。安装包在 Actions 的 Artifacts 里，装到 `D:\Pi Agent Plus Test` 即可，
和正式版互不覆盖。会话、模型、主题文件仍与正式版共用 `~/.pi`，不要在两个程序里同时运行同一个会话。

## 应用内一键升级

从 1.4.0 起，设置 › 版本与更新里的“升级”按钮会直接下载并安装新版，然后自动重启。

- 打标签构建时，GitHub Actions 用本仓库自己的升级私钥（仓库 Secrets：`TAURI_SIGNING_PRIVATE_KEY` 和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`）给安装包签名，并在 Release 里附上 `latest.json`。
- 对应的公钥写在 `src-tauri/tauri.conf.json`，每次构建都编进程序。程序只接受用这把私钥签过的安装包，所以只会升级到本仓库的 Release，不会被上游版本覆盖。
- 私钥和密码的备份在本机 `C:\pi-project\plus-keys\`（不在仓库里）。**丢了就没法再发能自动升级的版本**，请另外备份一份；万一丢失，只能换新密钥，并手动安装一次换了公钥的新版本。
- 这里的签名只用于升级校验，不是 Windows 代码签名证书，第一次手动安装时 SmartScreen 仍可能提示。

## 跟进上游（每周自动报告，不自动合并）

两个上游：

| 名称 | 仓库 | 说明 |
|---|---|---|
| pi-agent-desktop | abcwyc/pi-agent-desktop | 本 fork 的直接上游（桌面壳） |
| pi-web | agegr/pi-web | 桌面版内置的网页界面，Plus 大部分代码来自它 |

流程：

1. **自动报告**：`Upstream watch` 工作流每周一 09:00（北京时间）运行，也可以在 Actions 页面手动点 “Run workflow”。
   它读取 `.github/upstream-reviewed.json` 里记录的“已看过到哪个提交”，列出之后的所有新提交，按“修复 / 新功能 / 其他”分组，
   发成一个带 `upstream` 标签的 Issue（已有未关闭的报告就更新它，不会越堆越多）。工作流只读：不改代码、不推送、不开 PR。
   本地也能看同样的报告：`node scripts/upstream-report.mjs`。
2. **挑选**：在 Issue 里勾选想要的提交，或者直接告诉 Agent “把 xxx 合进来”。
3. **合并**：在 `plus` 分支上逐个 `git cherry-pick <提交>`，解决冲突，跑测试，推送；需要发版就按上面的发布流程打标签。
   上游的修改如果和 Plus 改过的地方冲突太多，就参考它的思路在 Plus 里重写。
4. **标记已看过**：处理完后运行 `node scripts/upstream-reviewed.mjs`（把指针移到上游当前最新提交；也可以 `pi-web=<提交>` 只移到某一个），
   提交这个文件并关闭 Issue。下周的报告就只包含之后的新提交。

为什么不直接整体合并：Plus 基于 pi-web 0.10.0，pi-web 已经到 0.12.x。2026-10-20 试合并 0.12.2 时有 111 个文件冲突、改动约 5 万行，
整体合并风险太大，所以逐条挑选（例如安全修复 cf3ebfba、1ddaf11f 已经单独移植）。
