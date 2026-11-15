/**
 * dsh-tool-progress —— 浏览器半端（v2：降噪 + 异常检测）。
 *
 * 设计前提（v1 的问题）：v1 每回合都占着输入框上方一整块 70px 卡片，
 * 而用户 85% 的时间其实什么都不用管 —— 结果就是装上三天就被无视。
 *
 * v2 的取舍：默认只给一枚细胶囊（约 22px），只有检测到真的不对劲才升到全尺寸。
 *   观望（常态）→ 一行：● 终端命令 npm run build  1m12s
 *   出事（异常）→ 自动展开：具体哪不对劲 + 最近几次调用 + 可折叠
 *   复盘（收尾）→ 胶囊里 ✓ 已完成 · N 次调用；点开是横向甘特，一眼看出谁最贵
 *
 * 数据仍然全部来自 Chat 快照里已投影好的节点，不新建事件源、不轮询 Host。
 * 所有"久不久"的判断都以**本回合同工具的历史中位数**为基准；
 * 样本不足三个时不判久 —— 宁可不说，也不编一个"比平时久"。
 */
window.__ModuleLoader__.load({
  id: 'dsh-tool-progress',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    //#region 文案
    const DICT = {
      zh: {
        thinking: '正在思考',
        turnRunning: '进行中 · 第 {n} 次调用',
        turnRunningThinking: '进行中 · 正在思考',
        turnDone: '已完成 · {n} 次调用',
        turnStillRunning: '回合进行中',
        noCalls: '尚未调用工具，模型正在生成',
        preparing: '生成参数',
        running: '执行中',
        returned: '已返回',
        done: '已完成',
        failed: '失败',
        interrupted: '被中断',
        why: '目的：',
        whyUnknown: '这一轮还没留下可辨认的推理说明，只有调用本身。',
        detail: '展开',
        hide: '收起',
        calls: '调用',
        slow: '比同回合同工具平时久约 {n} 倍',
        advice_stuck: '继续等，不是死机',
        advice_repeat: '考虑打断，换个说法',
        advice_failures: '查环境，改参数解决不了',
        advice_slow: '看一眼是不是命令本身变重了',
        repeat: '连续 {n} 次调用同一目标，可能在原地打转',
        repeatTarget: '连续 {n} 次 {tool} 同一目标',
        failures: '连续 {n} 次失败',
        generating: '模型在生成长参数，不是工具卡了',
        generatingShort: '参数生成偏久',
        parallel: '并发 {n}',
        retries: '重试 {n}',
        subcalls: '含 {n} 个子调用',
        gantt: '本轮最费时的调用（长度 = 耗时）',
        ganttPartial: '本轮最费时的调用（长度 = 耗时·另有 {n} 次较短调用未显示）',
        justDone: '已完成'
      },
      en: {
        thinking: 'Thinking',
        turnRunning: 'Running · call {n}',
        turnRunningThinking: 'Running · thinking',
        turnDone: 'Done · {n} calls',
        turnStillRunning: 'turn still running',
        noCalls: 'no tool call yet — the model is writing',
        preparing: 'Preparing',
        running: 'Running',
        returned: 'Returned',
        done: 'Done',
        failed: 'Failed',
        interrupted: 'Interrupted',
        why: 'Purpose:',
        whyUnknown: 'No readable reasoning for this round — only the call itself.',
        detail: 'Details',
        hide: 'Less',
        calls: 'calls',
        slow: 'About {n}× slower than this tool usually takes in this turn',
        advice_stuck: 'Keep waiting — this is not a hang',
        advice_repeat: 'Consider interrupting and restating',
        advice_failures: 'Check the environment, not the arguments',
        advice_slow: 'Worth a look — the command itself may be heavier',
        repeat: '{n} calls in a row on the same target — possibly going in circles',
        repeatTarget: '{n} × {tool} on the same target',
        failures: '{n} consecutive failures',
        generating: 'The model is generating long arguments, not the tool hanging',
        generatingShort: 'arguments still generating',
        parallel: '{n} parallel',
        retries: '{n} retries',
        subcalls: '{n} nested',
        gantt: 'Slowest calls this turn (length = duration)',
        ganttPartial: 'Slowest calls this turn (length = duration; {n} shorter ones hidden)',
        justDone: 'Done'
      }
    };
    /**
     * 语言解析顺序：Harness 自己的 locale（ctx.locale）→ navigator → zh。
     *
     * 踩过的坑：初版只看 navigator.language，而 DSH Desktop 的渲染进程以
     * --lang=en-US 启动，拿到的永远是英文，界面明明在中文语境里却显示
     * "Thinking" / "Done"。语言必须由宿主说了算，不能猜浏览器。
     */
    function langOf(id) {
      const value = String(id || '').toLowerCase();
      if (value === '') return '';
      if (value.startsWith('zh')) return 'zh';
      if (value.startsWith('en')) return 'en';
      return '';
    }

    function navigatorLang() {
      const raw = (typeof navigator !== 'undefined' && (navigator.language || (navigator.languages || [])[0])) || '';
      return langOf(raw) || 'zh';
    }

    function translate(lang, key, vars) {
      const table = DICT[lang] || DICT.zh;
      const template = table[key] ?? DICT.zh[key] ?? key;
      if (!vars) return template;
      return template.replace(/\{(\w+)\}/g, (whole, name) => (vars[name] === undefined ? whole : String(vars[name])));
    }
    //#endregion

    //#region 工具名 → 人话
    const LABELS = {
      bash: '终端命令',
      pwsh: 'PowerShell 命令',
      read: '读取文件',
      write: '写入文件',
      edit: '修改文件',
      grep: '搜索内容',
      glob: '查找文件',
      web_search: '网页搜索',
      web_fetch: '抓取网页',
      read_image: '看图',
      subagent: '分派子任务',
      subagent_fork: '分派子任务',
      workflow: '批量编排',
      skill: '加载技能',
      todo_write: '更新任务清单',
      present: '交付文件',
      ask_user_question: '向你提问',
      terminal_open: '打开终端',
      terminal_read: '读终端',
      job_output: '读后台任务',
      list_agents: '查看子任务',
      send_message: '给子任务发消息',
      update_goal: '更新目标',
      create_goal: '建立目标',
      schedule_create: '排程'
    };
    /** 本插件在宿主 locale 注册表里的命名空间。 */
    const NS = 'tool-progress';
    const toolLabel = (name) => LABELS[name] || String(name || '工具调用');
    //#endregion

    //#region 取值
    const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

    /** Chat 快照里的节点表，顺序优先用 order，退回 values()。 */
    function nodeList(snapshot) {
      const store = snapshot && snapshot.nodes;
      if (!store) return [];
      const out = [];
      const order = Array.isArray(snapshot.order) ? snapshot.order : null;
      if (order !== null && typeof store.get === 'function') {
        for (const key of order) {
          const node = store.get(key);
          if (node !== undefined) out.push(node);
        }
        return out;
      }
      if (typeof store.values === 'function') {
        for (const node of store.values()) out.push(node);
      }
      return out;
    }

    /** 读一个参数：先问 PartialArguments，再退回 argsRaw / call.argsRaw。 */
    function argOf(root, key) {
      if (!root) return '';
      const args = root.args;
      if (args && typeof args.text === 'function') {
        try {
          const value = args.text(key);
          if (typeof value === 'string' && value !== '') return value;
        } catch {
          /* 参数还没成型，继续往下退 */
        }
      }
      for (const raw of [root.argsRaw, root.call && root.call.argsRaw]) {
        if (typeof raw !== 'string' || raw === '') continue;
        try {
          const parsed = JSON.parse(raw);
          const value = isObject(parsed) ? parsed[key] : undefined;
          if (typeof value === 'string' && value !== '') return value;
          if (Array.isArray(value) && value.length > 0) return value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(', ');
        } catch {
          /* 参数 JSON 还残缺，当作没有 */
        }
      }
      return '';
    }

    const basename = (value) => {
      if (typeof value !== 'string' || value === '') return '';
      const parts = value.split('/');
      return parts[parts.length - 1] || value;
    };

    const clip = (value, max) => {
      const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    };

    /** 这次调用在干什么 —— 一句话。 */
    function summarize(root, name) {
      const pick = (...keys) => {
        for (const key of keys) {
          const value = argOf(root, key);
          if (value) return value;
        }
        return '';
      };
      switch (name) {
        case 'bash':
        case 'pwsh':
          return pick('description') || pick('command');
        case 'read':
        case 'write':
        case 'edit':
          return basename(pick('file_path'));
        case 'grep':
        case 'glob':
          return pick('pattern');
        case 'web_search':
          return pick('query');
        case 'web_fetch':
          return pick('url');
        case 'subagent':
        case 'subagent_fork':
          return pick('description') || pick('prompt');
        case 'workflow':
          return pick('description');
        case 'skill':
          return pick('name');
        default:
          return pick('description', 'file_path', 'path', 'command', 'query', 'url', 'name', 'prompt');
      }
    }

    function errorTextOf(root) {
      if (!root || root.isError !== true) return '';
      const error = root.error;
      if (typeof error === 'string' && error !== '') return clip(error, 160);
      if (isObject(error) && typeof error.message === 'string' && error.message !== '') return clip(error.message, 160);
      const content = Array.isArray(root.content) ? root.content : [];
      for (let index = content.length - 1; index >= 0; index -= 1) {
        const part = content[index];
        if (part && part.type === 'text' && typeof part.text === 'string' && part.text.trim() !== '') {
          return clip(part.text, 160);
        }
      }
      return '';
    }

    /**
     * 从最近一条推理里取一句能说明意图的话。
     * 取"最后三分之一里最长的那句"，而不是最后一句 —— 推理常以半截碎片收尾。
     */
    function purposeOf(node) {
      const blocks = node && node.data && Array.isArray(node.data.blocks) ? node.data.blocks : null;
      if (!blocks) return '';
      for (let index = blocks.length - 1; index >= 0; index -= 1) {
        const block = blocks[index];
        if (!block || block.kind !== 'reasoning' || typeof block.text !== 'string') continue;
        const text = block.text
          .replace(/```[\s\S]*?```/g, ' ')
          .replace(/[*_`#>]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (text === '') continue;
        /* 按句末标点切句，然后从**句首**取一整句。
           以前是先截取尾部 60% 再切 —— 会导致半句话收尾：
           「，避免和宿主自己的 todo 冲突。」前面没有主语，读不出在说什么。
           句首干净的一句才配当"目的"。 */
        const sentences = text
          .split(/(?<=[。！？.!?])\s*/)
          .map((part) => part.trim())
          .filter((part) => part !== '');
        // 至少 12 个字，且不能以标点开头（那种是上一句的残余）
        const usable = sentences.filter((part) => part.length >= 12 && !/^[，,、；;：:）)】》]/.test(part));
        if (usable.length > 0) {
          // 取最后一句完整的，而不是最长的 —— 最后的句子最接近「现在为什么这么做」
          return clip(usable[usable.length - 1], 130);
        }
        return '';
      }
      return '';
    }

    function turnOf(node) {
      const location = node && node.location;
      if (!location) return null;
      if (location.kind === 'turn' || location.kind === 'step') return location.turn || null;
      return null;
    }

    /** 一次调用 → 展示模型。 */
    function readCall(node) {
      const root = node && node.data && node.data.root;
      if (!isObject(root)) return null;
      const settled = root.kind === 'tool-result';
      const name = String(root.name || (root.call && root.call.name) || '');
      const summary = clip(summarize(root, name), 72);
      const startedAt = settled ? (typeof root.callTime === 'number' ? root.callTime : undefined) : (typeof root.time === 'number' ? root.time : undefined);
      const endedAt = settled && typeof root.time === 'number' ? root.time : undefined;
      return {
        key: node.key,
        anchorSeq: node.anchorSeq,
        callId: root.callId,
        name,
        label: toolLabel(name),
        summary,
        // 同工具 + 同目标 = 一个"在哪儿做"的签名，用来数是不是在原地打转。
        signature: `${name}\u0000${summary}`,
        phase: settled ? 'returned' : (root.phase === 'preparing' ? 'preparing' : 'running'),
        startedAt,
        endedAt,
        isError: root.isError === true,
        errorText: errorTextOf(root),
        subCalls: Array.isArray(root.subCalls) ? root.subCalls.length : 0,
        purpose: ''
      };
    }

    function buildModel(snapshot) {
      const nodes = nodeList(snapshot);
      // 每个分支都返回完整形状：少一个字段就会在渲染里读成 undefined.length。
      if (nodes.length === 0) return { live: false, calls: [], running: [], current: null, turn: undefined, retries: 0, settled: 0, turnOpen: false };

      let turnNumber;
      let turnRecord = null;
      for (const node of nodes) {
        const turn = turnOf(node);
        if (turn && typeof turn.turn === 'number' && (turnNumber === undefined || turn.turn >= turnNumber)) {
          turnNumber = turn.turn;
          turnRecord = turn;
        }
      }

      const calls = [];
      let lastAssistant = null;
      let retries = 0;
      let pending = 0;

      for (const node of nodes) {
        if (!node) continue;
        const turn = turnOf(node);
        const turnId = turn && typeof turn.turn === 'number' ? turn.turn : undefined;
        /* 只收当前回合的节点。
           以前这里写的是 `turnId !== undefined && ...`，于是拿不到 turn 的节点会被无条件放行、
           混进当前回合 —— 表现为旧回合的失败把"失败"字样带到了这次成功的调用上
           （/tmp/wide.png 那次 isError=false，却被标成失败，就是这么来的）。 */
        if (turnId === undefined || turnId !== turnNumber) continue;
        if (node.kind === 'assistant-step') {
          lastAssistant = node;
          continue;
        }
        if (node.kind === 'model-retry') {
          retries += 1;
          continue;
        }
        if (node.kind !== 'tool-call') continue;
        const call = readCall(node);
        if (call === null) continue;
        call.purpose = purposeOf(lastAssistant);
        calls.push(call);
        if (call.endedAt === undefined) pending += 1;
      }

      const closedAt = turnRecord && turnRecord.end && typeof turnRecord.end.time === 'number' ? turnRecord.end.time : undefined;
      for (const call of calls) {
        if (call.endedAt === undefined && closedAt !== undefined) {
          call.interrupted = true;
          call.endedAt = closedAt;
        }
      }

      /* 取"真正最后发生的那次调用"。渲染顺序不等于发生顺序：
         合成节点、分组都可能让旧调用排在数组末尾。 */
      const current = calls.length === 0
        ? null
        : calls.reduce((latest, call) => (
            typeof call.anchorSeq === 'number' && (typeof latest.anchorSeq !== 'number' || call.anchorSeq > latest.anchorSeq)
              ? call
              : latest
          ), calls[0]);
      const running = calls.filter((call) => call.endedAt === undefined);
      const startAt = turnRecord && turnRecord.start && typeof turnRecord.start.time === 'number' ? turnRecord.start.time : undefined;

      /* 回合自己有没有结束 —— 这是"整体进行中"的唯一判据。
         试点：turn/end 事件存在 ⇒ 回合结束；不存在 ⇒ 还在跑。
         不设超时兜底：一直显示"进行中"，宁可慢一点收尾，也不猜"疑似停止"。 */
      const turnOpen = closedAt === undefined;

      return {
        live: pending > 0,
        calls,
        current,
        running,
        retries,
        turn: turnNumber,
        turnRecord,
        closedAt,
        startAt,
        turnOpen,
        settled: calls.filter((call) => call.endedAt !== undefined).length
      };
    }
    //#endregion

    //#region 时间与统计
    function fmtDuration(ms) {
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '';
      if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
      const seconds = ms / 1000;
      if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
      const minutes = Math.floor(seconds / 60);
      const rest = Math.round(seconds % 60);
      return `${minutes}m${String(rest).padStart(2, '0')}s`;
    }

    function durationOf(call, now) {
      if (call.startedAt === undefined) return undefined;
      const end = call.endedAt === undefined ? now : call.endedAt;
      const value = end - call.startedAt;
      return Number.isFinite(value) && value >= 0 ? value : undefined;
    }

    function median(values) {
      if (!values || values.length === 0) return undefined;
      const sorted = [...values].sort((left, right) => left - right);
      const mid = sorted.length >> 1;
      return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    function useTicker(active) {
      const [now, setNow] = React.useState(() => Date.now());
      React.useEffect(() => {
        if (!active) return undefined;
        const id = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(id);
      }, [active]);
      return now;
    }
    //#endregion

    //#region 异常检测
    /**
     * 只报四类，每条都必须有"凭什么是异常"的依据：
     *   stuck      参数生成超过 8 秒还没派发 —— 用户最容易误判成卡死的场景
     *   repeat     连续 ≥3 次同工具同目标 —— 原地打转
     *   slow       慢于本回合同工具中位数的 3 倍，且该工具已有 ≥3 个样本
     *   failures   尾部连续 ≥2 次失败
     * 没有依据就一个字都不说：宁可漏报，也不狼来了。
     */
    const STUCK_MS = 8000;
    const SLOW_RATIO = 3;
    const SLOW_MIN_SAMPLES = 3;
    /** 基准本身不到 1 秒就不比 —— 亚秒级工具快慢差别大，比出来全是假警报。 */
    const SLOW_BASE_FLOOR_MS = 1000;
    /** 这次不到 3 秒也不提 —— 几秒钟的事不值得占用户注意力。 */
    const SLOW_MIN_CURRENT_MS = 3000;

    /**
     * @param live - 是否有调用正在跑。运行时的三条（卡住/打转/慢）只在 live 时判，
     *   因为对一个已经收尾的回合说"可能在原地打转"没有意义；
     *   但"连续失败"不一样——失败已经发生了，用户正要复盘，正是最该告诉他的时候。
     *   （这条以前被一起挡在 live 后面，导致回合结束后连续失败完全不报。）
     */
    function detectAnomalies(model, now, lang, live) {
      const found = [];
      const calls = model.calls;
      if (calls.length === 0) return found;

      const current = model.current;
      const currentDuration = current === null ? undefined : durationOf(current, now);

      // 1) 参数生成卡住（只在运行时判）
      if (live && current !== null && current.endedAt === undefined && current.phase === 'preparing' && currentDuration !== undefined && currentDuration >= STUCK_MS) {
        found.push({ code: 'stuck', severity: 'info', text: translate(lang, 'generating'), advice: translate(lang, 'advice_stuck') });
      }

      // 2) 尾部连续同一目标
      if (calls.length >= 3) {
        const tail = calls[calls.length - 1];
        let repeats = 1;
        for (let index = calls.length - 2; index >= 0; index -= 1) {
          if (calls[index].signature !== tail.signature) break;
          repeats += 1;
        }
        if (repeats >= 3) {
          found.push({
            code: 'repeat',
            severity: 'warn',
            text: translate(lang, 'repeatTarget', { n: repeats, tool: tail.label }),
            detail: tail.summary,
            advice: translate(lang, 'advice_repeat')
          });
        }
      }

      // 3) 尾部连续失败
      let failures = 0;
      for (let index = calls.length - 1; index >= 0; index -= 1) {
        if (!calls[index].isError) break;
        failures += 1;
      }
      if (failures >= 2) {
        found.push({ code: 'failures', severity: 'error', text: translate(lang, 'failures', { n: failures }), advice: translate(lang, 'advice_failures') });
      }

      // 4) 慢了：拿本回合同工具的历史中位数当基准（只在运行时判）
      //
      // 基准必须够大才有意义。实测踩到的坑：一轮里前几次 bash 都是 20ms 的 ls，
      // 接着启动一次浏览器花了 10s —— 按纯中位数算就是"慢 175 倍"，
      // 但那不是异常，是两种完全不同的活。所以：
      //   基准 < 1s 不判（亚秒级工具本来就忽快忽慢，比不出"反常"）
      //   本次 < 3s 不判（几秒钟的事不值得提醒）
      //   比值再离谱也只报到 9 倍，别拿 175 这种数字吓人
      if (live && current !== null && current.endedAt === undefined && currentDuration !== undefined && current.name) {
        const history = calls
          .filter((call) => call !== current && call.name === current.name && call.endedAt !== undefined)
          .map((call) => durationOf(call, now))
          .filter((value) => typeof value === 'number' && value > 0);
        const base = median(history);
        if (
          base !== undefined &&
          history.length >= SLOW_MIN_SAMPLES &&
          base >= SLOW_BASE_FLOOR_MS &&
          currentDuration >= SLOW_MIN_CURRENT_MS &&
          currentDuration > base * SLOW_RATIO
        ) {
          const ratio = Math.min(9, Math.max(2, Math.round(currentDuration / base)));
          found.push({ code: 'slow', severity: 'warn', text: translate(lang, 'slow', { n: ratio }), advice: translate(lang, 'advice_slow') });
        }
      }

      return found;
    }
    //#endregion

    const EMPTY_MODEL = { live: false, calls: [], running: [], current: null, turn: undefined, retries: 0, settled: 0 };
    const FALLBACK_SNAPSHOT = { nodes: null, order: [] };
    const noopHook = (selector) => selector(FALLBACK_SNAPSHOT);

    /** 调用结束后这一行还留多久，供回看；过期即自动收起。 */
    const KEEP_MS = 10 * 60 * 1000;

    function Dot({ state }) {
      return h('span', { className: 'dtp-dot', 'data-state': state, 'aria-hidden': true });
    }

    /** 默认态：一枚细胶囊，高度约 22px，不占地方。 */
    function Pill({ state, headline, summary, time, hint, open, onToggle, hasDetail }) {
      return h(
        'div',
        { className: 'dtp-pill', 'data-state': state },
        h(Dot, { state }),
        h('span', { className: 'dtp-pill-title' }, headline),
        summary ? h('span', { className: 'dtp-pill-summary', title: summary }, summary) : null,
        time ? h('span', { className: 'dtp-pill-time' }, time) : null,
        hint ? h('span', { className: 'dtp-pill-hint', 'data-severity': hint.severity }, hint.text) : null,
        hasDetail
          ? h(
              'button',
              {
                type: 'button',
                className: 'dtp-pill-toggle',
                'aria-expanded': open ? 'true' : 'false',
                onClick: onToggle
              },
              open ? '▾' : '▸'
            )
          : null
      );
    }

    /** 出事时才展开的整块卡片。 */
    function AlertCard({ lang, state, headline, summary, time, anomalies, open, onToggle, children }) {
      const worst = anomalies.some((item) => item.severity === 'error') ? 'error' : 'warn';
      return h(
        'div',
        { className: 'dtp-alert', 'data-state': state, 'data-severity': worst },
        h(
          'div',
          { className: 'dtp-alert-head' },
          h(Dot, { state }),
          h('span', { className: 'dtp-alert-title' }, headline),
          summary ? h('span', { className: 'dtp-pill-summary', title: summary }, summary) : null,
          time ? h('span', { className: 'dtp-pill-time' }, time) : null,
          h(
            'button',
            {
              type: 'button',
              className: 'dtp-pill-toggle',
              'aria-expanded': open ? 'true' : 'false',
              onClick: onToggle
            },
            open ? translate(lang, 'hide') : translate(lang, 'detail')
          )
        ),
        h(
          'ul',
          { className: 'dtp-reasons' },
          anomalies.map((item) =>
            h(
              'li',
              { key: item.code, className: 'dtp-reason', 'data-severity': item.severity },
              h('span', { className: 'dtp-reason-text' }, item.text),
              item.advice ? h('span', { className: 'dtp-reason-advice' }, item.advice) : null,
              item.detail ? h('span', { className: 'dtp-reason-detail', title: item.detail }, item.detail) : null
            )
          )
        ),
        open ? children : null
      );
    }

    /**
     * 甘特：长度 = 耗时，一眼看出谁最贵。
     *
     * 只放"最贵的 8 条"而不是全部 —— 一次回合可能有上百次调用，
     * 全画出来就是一面墙，反而看不出"哪一步最费时间"这个唯一目的。
     * 取耗时前 8，再按发生顺序还原，读起来既不丢上下文也不会淹掉重点。
     */
    const GANTT_MAX_ROWS = 8;

    function Gantt({ lang, calls, now, purpose }) {
      const withTime = calls.map((call, order) => ({ call, order, value: durationOf(call, now) ?? 0 }));
      const expensive = [...withTime]
        .sort((left, right) => right.value - left.value)
        .slice(0, GANTT_MAX_ROWS)
        .sort((left, right) => left.order - right.order);
      const rows = expensive.map((entry) => entry.call);
      const durations = expensive.map((entry) => entry.value);
      const max = durations.reduce((best, value) => Math.max(best, value), 0) || 1;
      const hidden = calls.length - rows.length;
      return h(
        'div',
        { className: 'dtp-gantt' },
        purpose ? h('p', { className: 'dtp-why' }, h('b', null, translate(lang, 'why')), purpose) : null,
        h('p', { className: 'dtp-gantt-cap' }, hidden > 0 ? translate(lang, 'ganttPartial', { n: hidden }) : translate(lang, 'gantt')),
        h(
          'div',
          { className: 'dtp-gantt-rows' },
          rows.map((call, index) => {
            const value = durations[index];
            const state = call.endedAt === undefined ? 'running' : call.isError ? 'error' : 'ok';
            const width = Math.max(3, Math.round((value / max) * 100));
            return h(
              'div',
              { key: call.key, className: 'dtp-grow', 'data-state': state },
              h(
                'span',
                { className: 'dtp-grow-label', title: `${call.label} · ${call.summary}` },
                h('span', { className: 'dtp-grow-what' }, call.summary || call.label),
                call.summary ? h('span', { className: 'dtp-grow-tool' }, call.label) : null
              ),
              h(
                'span',
                { className: 'dtp-grow-track' },
                h('span', { className: 'dtp-grow-bar', style: { width: `${width}%` } })
              ),
              h('span', { className: 'dtp-grow-time' }, fmtDuration(value)),
              call.errorText ? h('span', { className: 'dtp-grow-error', title: call.errorText }, call.errorText) : null
            );
          })
        )
      );
    }

    function ToolProgressRow(props) {
      const useChat = typeof props.useChat === 'function' ? props.useChat : noopHook;
      const useSession = typeof props.useSession === 'function' ? props.useSession : noopHook;
      /* 文案来源：
         registration 声明了 locale 命名空间后，宿主会注入 t(face binds it)。
         宿主的 t 知道当前语言，所以它优先；拿不到时退回自己的字典 + navigator。
         这一步就是修 "界面中文却显示 Thinking/Done" 的根因。 */
      const hostT = typeof props.t === 'function' ? props.t : null;
      const lang = langOf(props.activeLocale) || langOf(props.localeId) || navigatorLang();
      const tr = hostT
        ? (key, vars) => {
            const text = hostT(key, vars);
            // 宿主的 t 在键缺失时会回显 key 本身；那种情况退回本地字典。
            return typeof text === 'string' && text !== key ? text : translate(lang, key, vars);
          }
        : (key, vars) => translate(lang, key, vars);

      // 快照对象本身由 store 缓存，返回它而不是新对象，才符合 useSyncExternalStore 的约定。
      const snapshot = useChat((value) => value || null);
      const sessionRunning = useSession((value) => (value && value.running === true ? true : false));

      // 快照是别的包投影出来的结构；任何一次形状变化都只让这一行自己隐身，
      // 不要把异常抛进槽位里把整块输入区拖崩。
      const model = React.useMemo(() => {
        try {
          return buildModel(snapshot);
        } catch (error) {
          console.error('[dsh-tool-progress] 读取快照失败，本轮不显示进度：', error);
          return EMPTY_MODEL;
        }
      }, [snapshot]);

      const current = model.current;
      const active = model.live || (current !== null && current.endedAt === undefined);
      const lastEndedAt = current !== null && current.endedAt !== undefined ? current.endedAt : undefined;
      /* 计时的开关。只在"真在跑"或"刚结束那一小段"里走秒：
         打开一个几小时前的老会话时不该还在每 500ms 重渲染一次。 */
      const keepAlive = sessionRunning || (lastEndedAt !== undefined && Date.now() - lastEndedAt < KEEP_MS);
      const now = useTicker(keepAlive);
      const recentlyClosed = lastEndedAt !== undefined && now - lastEndedAt < KEEP_MS;
      const [open, setOpen] = React.useState(false);
      // 用户手动收起过告警：同一个告警签名不要反复弹回来。
      const [dismissed, setDismissed] = React.useState('');

      const anomalies = React.useMemo(() => {
        try {
          return detectAnomalies(model, now, lang, active);
        } catch {
          return [];
        }
      }, [model, now, active, lang]);

      if (!model.calls.length && !sessionRunning) return null;
      if (!active && !sessionRunning && !recentlyClosed) return null;

      const total = model.calls.length;
      const done = model.settled;
      // 只用 code 做签名。文本里带倍率/次数，会随秒数变——拿它当签名等于永远收不起来。
      const signature = anomalies.map((item) => item.code).sort().join('|');
      const promoted = anomalies.length > 0 && signature !== dismissed;
      const expanded = open || promoted;

      /* 圆点与标题必须同源。
         以前圆点看"最后一次调用"、标题扫"整个回合"，于是出现过"绿点 + 失败"。
         现在统一以"回合状态"为主，调用级信息降为副标题。 */
      const turnFailed = model.calls.some((call) => call.isError);
      const turnOpen = model.turnOpen === true;

      const state = turnOpen ? (turnFailed ? 'error' : 'running') : turnFailed ? 'error' : 'ok';

      // 回合总用时：结束用 closedAt，进行中用 now
      const turnElapsedMs = model.startAt === undefined
        ? undefined
        : (model.closedAt === undefined ? now : model.closedAt) - model.startAt;
      const turnElapsed = turnElapsedMs === undefined ? '' : fmtDuration(turnElapsedMs);

      /* 主标题：回合在干什么。
         进行中 → "进行中 · 第 N 次调用"；结束 → "已完成 · N 次调用"；有失败 → "失败"。 */
      const callCount = total === 0 ? 0 : total;
      const headline = turnOpen
        ? (callCount === 0
            ? tr('turnRunningThinking')
            : tr('turnRunning', { n: callCount }))
        : turnFailed
          ? tr('failed')
          : tr('turnDone', { n: callCount });

      /* 副标题：这次/上次调用具体在做什么。
         失败时优先给原因，其次给"工具 · 目标"。 */
      const failedCall = turnFailed ? [...model.calls].reverse().find((call) => call.isError) : null;
      const summary = failedCall !== null && failedCall !== undefined
        ? (failedCall.errorText || `${failedCall.label} ${failedCall.summary}`.trim())
        : current !== null
          ? `${current.label}${current.summary ? ` ${current.summary}` : ''}${current.endedAt === undefined ? '' : ` ${fmtDuration(durationOf(current, now) ?? 0)}`}`
          : '';

      const timeText = turnElapsed;

      const toggle = () => {
        // 自动弹开的告警，点一下的语义是"我知道了，收起来"，不是再展开一次。
        if (promoted) {
          setDismissed(signature);
          setOpen(false);
          return;
        }
        setOpen((value) => !value);
      };

      // 一个工具都没调用：只说明它在生成，不假装有进度。
      if (total === 0) {
        return h(Pill, {
          state: 'running',
          headline: tr('turnRunningThinking'),
          summary: tr('noCalls'),
          time: model.startAt === undefined ? '' : fmtDuration(now - model.startAt),
          hint: null,
          open: false,
          onToggle: () => {},
          hasDetail: false
        });
      }

      const detail = h(Gantt, {
        lang,
        calls: model.calls,
        now,
        purpose: current !== null ? current.purpose : ''
      });

      const meta = h(
        'div',
        { className: 'dtp-meta' },
        h('span', null, `${tr('calls')} ${total}`),
        model.running.length > 1 ? h('span', null, tr('parallel', { n: model.running.length })) : null,
        model.retries > 0 ? h('span', null, tr('retries', { n: model.retries })) : null,
        current !== null && current.subCalls > 0 ? h('span', null, tr('subcalls', { n: current.subCalls })) : null,
        turnOpen ? h('span', null, tr('turnStillRunning')) : null
      );

      if (promoted) {
        return h(
          'div',
          { className: 'dtp-wrap' },
          h(
            AlertCard,
            {
              lang,
              state,
              headline,
              summary,
              time: timeText,
              anomalies,
              open: expanded,
              onToggle: toggle
            },
            h('div', { className: 'dtp-alert-body' }, meta, detail)
          )
        );
      }

      return h(
        'div',
        { className: 'dtp-wrap' },
        h(Pill, {
          state,
          headline,
          summary,
          time: timeText,
          hint: anomalies.length > 0 ? anomalies[0] : null,
          open: expanded,
          onToggle: toggle,
          hasDetail: true
        }),
        expanded ? h('div', { className: 'dtp-panel' }, meta, detail) : null
      );
    }

    const CSS = `
.dtp-wrap{display:flex;flex-direction:column;gap:6px;align-items:flex-start;min-width:0;max-width:100%}
.dtp-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary)}
.dtp-dot[data-state="running"]{background:var(--dsw-alias-label-primary);animation:dtp-pulse 1.4s ease-in-out infinite}
.dtp-dot[data-state="ok"]{background:var(--dsw-alias-state-success-primary)}
.dtp-dot[data-state="error"]{background:var(--dsw-alias-state-error-primary)}
@keyframes dtp-pulse{0%,100%{opacity:.35;transform:scale(.85)}50%{opacity:1;transform:scale(1.15)}}

/* 默认态：细胶囊，只有内容高度，不铺满 */
.dtp-pill{display:inline-flex;align-items:center;gap:7px;max-width:100%;min-width:0;padding:3px 10px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:0.5px solid var(--dsw-alias-border-l2);font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary);box-sizing:border-box}
.dtp-pill[data-state="running"]{border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent)}
.dtp-pill[data-state="error"]{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,transparent)}
.dtp-pill-title{color:var(--dsw-alias-label-primary);font-weight:600;flex:none}
.dtp-pill-summary{color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:28ch;flex:0 1 auto;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.dtp-pill-time{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;flex:none}
.dtp-pill-hint{flex:none;color:var(--dsw-alias-state-warn-primary);border-left:0.5px solid var(--dsw-alias-border-l2);padding-left:7px}
.dtp-pill-hint[data-severity="error"]{color:var(--dsw-alias-state-error-primary)}
.dtp-pill-toggle{flex:none;border:0;background:0 0;color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer;padding:0 2px;border-radius:6px;line-height:1}
.dtp-pill-toggle:hover{text-decoration:underline}

/* 出事态：整块卡片 + 原因 */
.dtp-alert{display:flex;flex-direction:column;gap:6px;width:100%;min-width:0;box-sizing:border-box;padding:8px 11px;border-radius:12px;background:var(--dsw-alias-bg-layer-1);border:0.5px solid var(--dsw-alias-border-l1);font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.dtp-alert[data-severity="warn"]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 45%,var(--dsw-alias-border-l1))}
.dtp-alert[data-severity="error"]{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,var(--dsw-alias-border-l1))}
.dtp-alert-head{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.dtp-alert-title{color:var(--dsw-alias-label-primary);font-weight:600;flex:none}
.dtp-reasons{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px}
.dtp-reason{display:flex;align-items:baseline;gap:8px;min-width:0}
.dtp-reason::before{content:"";width:5px;height:5px;border-radius:50%;flex:none;background:var(--dsw-alias-state-warn-primary);transform:translateY(-2px)}
.dtp-reason[data-severity="error"]::before{background:var(--dsw-alias-state-error-primary)}
.dtp-reason[data-severity="info"]::before{background:var(--dsw-alias-state-idle-primary)}
.dtp-reason-text{color:var(--dsw-alias-label-primary);flex:none}
.dtp-reason-advice{color:var(--dsw-alias-brand-primary);font-weight:600;flex:none;border-left:0.5px solid var(--dsw-alias-border-l2);padding-left:8px}
.dtp-reason-detail{color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.dtp-alert-body{display:flex;flex-direction:column;gap:6px;border-top:0.5px solid var(--dsw-alias-border-l1);padding-top:6px;margin-top:2px}

/* 展开面板 */
.dtp-panel{display:flex;flex-direction:column;gap:6px;width:100%;min-width:0;box-sizing:border-box;padding:8px 11px;border-radius:12px;background:var(--dsw-alias-bg-layer-1);font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.dtp-meta{display:flex;flex-wrap:wrap;gap:10px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}

/* 甘特 */
.dtp-gantt{display:flex;flex-direction:column;gap:4px;min-width:0}
.dtp-gantt-cap{margin:0;color:var(--dsw-alias-label-tertiary);font-size:11px}
.dtp-gantt-rows{display:flex;flex-direction:column;gap:3px}
.dtp-grow{display:grid;grid-template-columns:16em minmax(60px,1fr) 3.6em;align-items:center;gap:10px;min-width:0}
.dtp-grow-label{display:flex;flex-direction:column;gap:1px;min-width:0;overflow:hidden;line-height:1.35}
.dtp-grow-what{color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}
.dtp-grow-tool{color:var(--dsw-alias-label-tertiary);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dtp-grow-track{position:relative;height:8px;border-radius:99px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);overflow:hidden;min-width:0}
.dtp-grow-bar{display:block;height:100%;border-radius:99px;background:var(--dsw-alias-state-success-primary);transition:width .3s ease}
.dtp-grow[data-state="running"] .dtp-grow-bar{background:var(--dsw-alias-label-primary);animation:dtp-breathe 1.4s ease-in-out infinite}
.dtp-grow[data-state="error"] .dtp-grow-bar{background:var(--dsw-alias-state-error-primary)}
.dtp-grow-time{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
.dtp-grow-error{grid-column:2 / -1;color:var(--dsw-alias-state-error-primary);font-size:11px;white-space:normal;word-break:break-word}
@keyframes dtp-breathe{0%,100%{opacity:.45}50%{opacity:1}}

.dtp-why{margin:0;color:var(--dsw-alias-label-secondary);line-height:1.6;overflow-wrap:anywhere}
.dtp-why b{color:var(--dsw-alias-label-primary);font-weight:600}

@media (prefers-reduced-motion: reduce){
  .dtp-dot,.dtp-grow-bar{animation:none}
  .dtp-grow-bar{transition:none}
}
`;

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style');
          style.setAttribute('data-plugin-css', 'dsh-tool-progress');
          style.textContent = CSS;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'dsh-tool-progress: 样式');

        const slots = ctx.slots || (typeof ctx.get === 'function' ? ctx.get('slots') : undefined);
        if (!slots) return;

        /* 把文案注册进宿主的 locale 表。
           这一步不是为了"多语言好看"，是为了让宿主的 t 知道当前语言 ——
           自己猜 navigator 会被 Electron 的 --lang=en-US 带偏。 */
        const locale = typeof ctx.get === 'function' ? ctx.get('locale') : ctx.locale;
        if (locale && typeof locale.register === 'function') {
          const flat = (table) => {
            const out = {};
            for (const [key, value] of Object.entries(table)) {
              if (typeof value === 'string') out[key] = value;
            }
            return out;
          };
          for (const id of ['zh', 'en']) {
            ctx.effect(
              () => locale.register(NS, id, flat(DICT[id])),
              `dsh-tool-progress: 字典 ${id}`
            );
          }
        }

        try {
          slots.inject('conversation.input.dock', () =>
            slots.register(
              {
                name: 'conversation.input.dock',
                id: 'tool-progress',
                order: 15,
                // 声明命名空间后，宿主会注入感知当前语言的 t
                locale: NS
              },
              ToolProgressRow
            )
          );
        } catch (error) {
          console.error('[dsh-tool-progress] 注册进度条失败：', error);
        }
      }
    };
  }
});
