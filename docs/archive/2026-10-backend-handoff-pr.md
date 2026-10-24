# 统一已上线的罢工后端与证据契约，建立 Claude/Codex 交接规则

罢工公告此前可能漏掉综合交通事件，或把未知地区、线路和航空范围扩成确定信息。本分支整理已上线的修复与验证证据，让 main、后端和 Claude 的前端/Ask 功能使用同一份可审查的数据契约。

目标分支：main；来源分支：codex/strike-evidence-handoff。main 较旧，因此此 PR 包括原 codex/英语功能测试 已完成的修复序列，不只是最后一轮地理匹配改动。Claude 的自然语言查询和 /lab 不包含在本 PR。

## 核心改动与文件

- lib/strikeSync.ts、strikeNormalization.ts、strikeTiming.ts：官方公告身份、状态与消失记录对账、精确时段和服务起止端点；独立地区识别，不将 Italia/Tutte 或未知信息直接扩为全国。
- lib/strikeEnrichment.ts、strikeSources.ts、strikeEvidence.ts、strikeScope.ts：实际抓取官方及报道来源，按日期/工会限制文章证据；区分航空范围，逐字段保留来源、置信度、未知和冲突。
- lib/strikeQuery.ts、API/日历与同步健康：失败不能伪装成无罢工；保留可观察的同步状态、日历转义及适当缓存。
- components/utils.ts、StrikeCard.tsx：聚合重复公告并保留底层事件；时间轴、未知线路、保障来源说明、底部来源与时段差异。货运不进入旅客卡片。
- AGENTS.md、CLAUDE.md、AI_HANDOFF.md：沿用 Claude 361f3ed 的协作文档，补充本次公共数据契约、实际生产版本和交接约束。

## API / schema / 核心逻辑影响

- timing_evidence.fields 与聚合 API 新增 scopeType、guaranteeSource、guaranteedServiceWindow、lineScope、field_evidence；strike_events 保留。前端与 /api/ask 必须正确处理 UNKNOWN 和语义端点。
- 航空聚合按 scope 与涉事航司分组，不能只按 AIRPORT 合成全机场；未知线路不能当全部线路，常规保护不能当所有班次正常。
- 相对 main 的历史迁移包含 20261003190000_strike_sources_and_sync_runs、20261004134223_sync_reconciliation_and_feedback、20261004142222_external_strike_timing；已应用于生产。最后一轮字段证据使用既有 JSON 列，无额外迁移。
- app/actions.ts 的累计差异是此前反馈输入校验、限流与错误脱敏；本轮没有改“我受影响了”的计数逻辑。相对旧 main 的历史分支还包含更早的展示/语言改动，应按提交历史区分。

## 验证

发布代码 e4ed9d7 已在 theitalystrike.com 上线；115/115 发布分支测试通过，TypeScript 和构建通过；共享工作区包含 Claude Ask 测试时为121/121。20城市生产页面、API、日历检查通过。最终同步 a27b67bb-15bb-4fdb-9e96-151e8635b605 成功。详情和截图见 docs/archive/2026-10-v1.5-evidence-audit.md 及 docs/verification/2026-10-v1.5-*。此次协作文档修改检查通过，无运行时代码变更。

## 未完成与 Claude 特别 review

- 官方二次核验仍有限：2条未来记录有运营商匹配、9条有报道补充、20条MIT单源；两条托斯卡纳TPL缺钟点，部分官网拒绝自动抓取。不要描述为全部官方核实。
- Claude df13f07 基于 e4ed9d7；整合 Ask 时保留其 Rome 日期工具及 Dashboard 改动。本分支没有触碰其 /lab 未提交文件。
- 请重点检查 Ask 对 UNKNOWN 线路、航空 scope、保障来源及多条 strike_events 的判断，避免把新后端的保守信息在 UI/问答里重新扩成确定信息。
- main 尚需受审合并；本PR不自动合并或再次发布。每日cron的未来实际运行仍需后续运行证据。
