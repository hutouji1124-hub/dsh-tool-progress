# 安装

> 这是一个 **DeepSeek Harness（DSH）的 Web UI 插件**，不是独立应用。
> 没有 DSH 的话它跑不起来。

## 前置条件

| 需要 | 说明 |
| --- | --- |
| **DeepSeek Harness** | 本插件挂在它的 Web UI 上，读 Chat 快照的节点结构 |
| **能打开 Web GUI** | 桌面版或 `dsh web` 都行 |
| **DSH 版本** | 开发与验证于 **1.6.97**。内部分结构变了插件可能失效 |

## 安装（两种方式）

### 方式 A：交给助手装（推荐）

把仓库克隆下来，然后让 DSH 里的助手执行：

```
plugin_manager
  action: install_bundle
  target: /你克隆到的绝对路径/dsh-tool-progress
```

`target` **必须是绝对路径**。

### 方式 B：用 dsh 命令行

```bash
git clone https://github.com/hutouji1124-hub/dsh-tool-progress.git
cd dsh-tool-progress
dsh plugin --profile desktop add link:$(pwd)
```

装完刷新页面（或重启 DSH）即可看到输入框上方多出一行。

## 装完应该看到什么

对话进行时，输入框上方出现一枚细胶囊：

```
● 进行中 · 第 4 次调用   终端命令 npm run build   49s   ▸
```

点右侧 `▸` 会展开甘特图，显示本轮最费时的调用。

## 卸载

```
plugin_manager
  action: remove_bundle
  target: dsh-tool-progress
```

## 排障

| 现象 | 可能原因 | 怎么办 |
| --- | --- | --- |
| 完全看不到任何东西 | 插件没激活 / 槽位不存在 | 确认 `plugin_manager list_plugins` 里有 `dsh-tool-progress` 且 `fiberPhase: active` |
| 页面报 `slot entry crashed` | 读快照时结构不匹配 | 打开控制台看 `[dsh-tool-progress]` 开头的错误，把报错提 issue |
| 显示英文但界面是中文 | 宿主 locale 与浏览器不一致 | 本插件优先用宿主 locale；若仍不对，说明版本差异，提 issue |
| 只有一行字没有胶囊 | CSS 没加载 | 检查页面里是否有 `<style data-plugin-css="dsh-tool-progress">` |
| 一直显示「进行中」 | 回合异常终止但没 emit `turn/end` | **这是有意为之**：本插件不做超时推测 |

## 已知限制

- 单次长命令**内部**的进展（比如 `npm install` 装到第几个包）拿不到 —— DSH 只记录调用开始与结果两条事件
- 「目的」那句话是从模型的推理里**启发式抽取**的，偶尔会取偏
- 没有失败重试/跳过按钮

## 兼容性

只在作者本机（macOS / DSH 1.6.97 / desktop profile）验证过。
其他平台和版本**未测试**。遇到问题欢迎提 issue，附上：

```
DSH 版本：
操作系统：
控制台里 [dsh-tool-progress] 开头的报错：
```
