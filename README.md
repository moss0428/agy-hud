# Agy HUD

用于 **Antigravity CLI (`agy`)** 的精致终端状态栏插件，零外部依赖（仅需 Node.js >= 18）。采用 TrueColor 柔和暗色系配色、亚格平滑进度条（`▏▎▍▌▋▊▉`）、几何状态图标，以及右侧全透明背景彩色像素画 **`Google`** 标志。

## 功能特性

1. **第 1 行｜多额度池 5h / 周额度与重置倒计时（支持多窗口自动同步）**：
   - 自动分组渲染 `quota` 中的全部额度池（如 `✦ Gemini`、`◈ Claude/GPT`、`◆ Argon` 及其他自定义池子），5h 与周额度各自显示嵌入式数值进度条与重置倒计时（如 `↻3h45m`、`↻5d8h`、`↻<1m`）。
   - 显示剩余额度百分比，余量 `< 30%` 琥珀黄、`< 10%` 绯红。
   - 内置**多窗口额度自动同步**（按登录邮箱隔离，同一重置周期内自动取各窗口最新消耗后的余量，跨周期自动失效），多个 `agy` 窗口无需手动 `/usage` 也能保持额度一致。
2. **第 2 行｜当前会话上下文占比 + 活跃子代理数 + 进行中后台任务数 + 模型与思考强度 + 彩色像素 `Google`**：
   - 左侧使用动态象限仪表图标（`○ ◔ ◑ ◕ ●`）+ 亚格平滑进度条展示 `context_window.used_percentage` 与精简 token 用量（如 `188k/1M`，可通过 `AGY_HUD_SHOW_TOKENS=0` 隐藏）。
   - 上下文颜色阈值：`< 70%` 翡翠绿、`>= 70%` 琥珀黄、`>= 90%` 绯红。
   - 中间同屏显示活跃子代理数（`◇` / `❖ 子代理`）与进行中后台任务数（`▹` / `▸ 后台任务`）；为 `0` 时保持低饱和度灰蓝，大于 `0` 时切换为高亮胶囊徽章。
   - 后台任务后展示当前会话使用的**模型名称与思考强度**（如 `✦ Gemini 4 Neon · High`、`◈ Claude Opus 4.6 · Max`），自动识别模型系列与强度分级着色（可通过 `AGY_HUD_SHOW_MODEL=0` 隐藏）。
   - 右侧占满整体 **3 行高度**展示**全透明背景 `27×6` TrueColor 彩色像素 `Google`**：严格采用 Google 品牌四原色与终端默认透明背景（`\x1b[49m`），不留黑底；窄终端或无间隙模式下自动回退为精简单行彩色 `Google`（可通过 `AGY_HUD_BRAND=mini` 强制单行或 `off` 关闭）。

## 安装与启用

### 1. 安装插件

```bash
git clone https://github.com/moss0428/agy-hud.git
cd agy-hud
agy plugin install .
```

### 2. 预览效果

```bash
node ~/.gemini/config/plugins/agy-hud/scripts/statusline.mjs --demo
```

### 3. 启用状态栏

在终端执行以下命令写入 `~/.gemini/antigravity-cli/settings.json`：

```bash
# 默认叠加在内置状态栏下方（推荐）
node ~/.gemini/config/plugins/agy-hud/scripts/install.mjs

# 或者完全替换内置状态栏
node ~/.gemini/config/plugins/agy-hud/scripts/install.mjs --replace
```

也可直接在 `agy` 会话中输入 `/statusline node ~/.gemini/config/plugins/agy-hud/scripts/statusline.mjs` 启用，或输入 `/statusline delete` 恢复默认。

## 环境变量配置

- `NO_COLOR=1`：关闭 ANSI 颜色，降级为纯文本 ASCII 进度条与纯文本 `Google`。
- `AGY_HUD_SHOW_TOKENS=0`：隐藏第 2 行进度条右侧的 token 用量摘要。
- `AGY_HUD_SHOW_MODEL=0`：隐藏第 2 行后台任务后的当前模型与强度显示。
- `AGY_HUD_BAR_WIDTH_QUOTA=8`：自定义额度进度条宽度（默认 `8`）。
- `AGY_HUD_BAR_WIDTH_CONTEXT=16`：自定义上下文进度条宽度（默认 `16`）。
- `AGY_HUD_BRAND=pixel`：控制右侧品牌标志，支持 `pixel`（占满 3 行的彩色像素 `Google`，默认）、`mini`（精简单行彩色 `Google`）或 `off`（关闭）。
- `AGY_HUD_QUOTA_SYNC=0`：关闭多窗口额度自动同步缓存。
- `AGY_HUD_LINE_GAP=1`：控制两行进度条之间的垂直空行间距（`0`–`3`，默认 `1` 行）。

## 校验与测试

```bash
npm test
agy plugin validate --strict .
```
