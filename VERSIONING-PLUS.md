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

## 应用内更新提示

设置 › 版本与更新会比较当前 Plus 版本与本仓库最新 Release。安装包未签名、也没有嵌入升级公钥，
所以不会自动安装，只会提示并链接到 Release 页面下载。
