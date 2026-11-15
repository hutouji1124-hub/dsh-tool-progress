# 推广素材

给发布到各平台时直接用。**别全文照抄** —— 平台会判重，而且不同社区口味不一样。

---

## 一句话版本（放简介/签名）

> DSH 插件：把「正在调用工具」变成看得懂的进度条 —— 调什么、为了什么、跑多久了、哪一步最费时。

---

## V2EX / 掘金 发帖版

**标题**（选一个）：
- 我给 DeepSeek Harness 写了个进度条插件，解决「不知道它在干嘛」
- DSH 插件分享：让工具调用有个能看懂的进度
- 写了个小插件，把 AI 干活的过程可视化了一点点

**正文**：

> 用 DSH（DeepSeek Harness）的时候一直有个小别扭：
>
> 界面上会显示「正在调用工具 · bash」，但它只告诉你**在用哪个工具**，不告诉你在做什么、跑了多久、是不是卡住了。尤其是它调用了一个很慢的命令时，你只能干等。
>
> 所以我写了个插件，在输入框上方加一行：
>
> ```
> ● 进行中 · 第 4 次调用   终端命令 npm run build   49s   ▸
> ```
>
> 点开能看到本轮最费时的调用是哪些（甘特图，长度 = 耗时），一眼知道时间花在哪。
>
> 几个设计上的取舍，可能比功能本身更值得说：
>
> **1. 主标题说「回合」，不是「最后一次调用」**
> 早期版本我用的是最后一次工具调用的状态，结果出现过一个很蠢的现象：一次工具跑完、模型还在想下一步时，它显示「已完成」，而整个回合其实还在跑。后来改成判断回合有没有 `turn/end`。
>
> **2. 不编百分比**
> 一开始想做过进度条百分比，后来发现没有确定的量可以算 —— 「已完成 138/139」说的是调用次数，不是活干了多少。标成百分比就是误导，干脆砍掉。
>
> **3. 异常检测宁可漏报**
> 做过「比平时久」的检测，第一版拿纯中位数比：一轮里前几次 bash 都是 20ms 的 ls，接着启动个浏览器花了 10s，结果报「慢 175 倍」。那不是异常，是两种完全不同的活。后来加了三个门槛才敢用。
>
> **4. 失败必须给原因，且不猜**
> 有 error 文本就给，没有就只写「失败」，不去编一个可能的原因。
>
> 默认态是一枚 25px 的胶囊 —— 大部分时间你不需要看它，只在它不对劲的时候才占你注意力。
>
> 仓库：https://github.com/hutouji1124-hub/dsh-tool-progress
>
> 说明：只在 macOS + DSH 1.6.97 上验证过，其他环境没测。装不上或者报错欢迎留言。

---

## X / Twitter 版（英文）

> Wrote a small plugin for DeepSeek Harness: a readable progress pill for tool calls.
>
> Before: `calling tool · bash` — no idea what it's doing or how long.
> Now: `● Running · call 4   bash npm run build   49s`
>
> Click to expand a gantt of the slowest calls this turn.
>
> Design notes worth mentioning:
> - The headline describes the **turn**, not the last call. A finished call used to make a live turn look "done".
> - No percentages. "138/139 calls" is not "138/139 of the work".
> - Failure reasons are shown when available, never guessed.
>
> https://github.com/hutouji1124-hub/dsh-tool-progress

---

## Reddit r/LocalLLaMA 版

**Title**: I built a progress indicator for DeepSeek Harness tool calls

> DSH shows "calling tool · bash" while the agent works. That tells you *what* tool, but not *what for*, *how long*, or *whether it's stuck*.
>
> So I added one line above the composer:
>
> `● Running · call 4   bash npm run build   49s   ▸`
>
> Expand it for a gantt of the slowest calls this turn.
>
> Some decisions that took more thought than the feature itself:
>
> **Turn vs. call semantics.** My first version reported the last tool call's state. When a call finished and the model was still thinking, it showed "done" at 22 seconds into a live turn. Now the headline reads the turn's own `turn/end` event; if that's absent, it says running. No timeout heuristics — I'd rather be slow to settle than guess wrong.
>
> **No percentages.** There's no honest denominator for "how much work is done". Call counts aren't progress.
>
> **False-positive suppression.** My "slower than usual" check compared against a raw median and flagged "175× slower" when a 10s browser launch followed a few 20ms `ls` calls. Added floors: baseline must be ≥1s, current ≥3s, ≥3 samples, ratio capped at 9×.
>
> Repo: https://github.com/hutouji1124-hub/dsh-tool-progress
>
> Caveat: only tested on macOS + DSH 1.6.97. Issues welcome.

---

## 提交到聚合仓库（这是真正的流量入口）

按价值排序：

| 仓库 | star | 怎么提交 |
| --- | --- | --- |
| `awesome-dsh-plugin/awesome-dsh-plugin` | 24k | 提 PR，在 README 对应分类加一行 |
| `dsh-market/dsh-market` | 12k | 提 PR 或按其 CONTRIBUTING 提 issue |
| `zhu1090093659/dsh-web` | 10k | 提 PR |

**PR 标题**：`Add dsh-tool-progress: turn-level progress pill for tool calls`

**PR 内容**（一行式）：

```markdown
- [dsh-tool-progress](https://github.com/hutouji1124-hub/dsh-tool-progress) — Turns the flat "calling tool" line into a readable progress pill: which tool, what for, how long, and a gantt of the slowest calls this turn.
```

---

## 发布节奏建议

1. **先把 INSTALL.md 和 GIF 推上去**（没这个，来了也装不上）
2. **提 awesome-dsh-plugin 的 PR**（等 review，通常几天）
3. **再发 V2EX 或掘金**（有 PR 背书更好看）
4. **Reddit / X 最后**（英文受众，对"我踩了什么坑"最买账）

别一天全发完。**分开发，每次都能触达一批新的人。**

---

## 不要做的事

- ❌ 刷 star。一旦被发现，仓库信誉归零
- ❌ 群里群发链接。会被人当广告
- ❌ 说这是「必备插件」。它解决的是轻微烦躁，不是刚需，夸大反而招黑
- ❌ 一次发五个平台用同一段文案。会被判重复内容
