/**
 * dsh-tool-progress —— Host 半端。
 *
 * 这个插件要做的事全在浏览器里（读 Chat 快照里那条 tool-call 节点的三个阶段，
 * 画成一条会呼吸的进度条），Host 端不需要注册 Service、Tool 或路由。
 * 保留 apply() 是为了让清单页有一个合法的可激活插件条目。
 */
export function apply() {}
