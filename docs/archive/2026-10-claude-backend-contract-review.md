# Claude 最新实现与后端契约评审

评审对象：Claude `claude/redesign-lab` 最近 v5–v10 的交接说明、设计文档、提交以及 2026-10-05 的当前未提交代码。评审开始于 `7ceb87c` 及其未提交修改，结束前 Claude 已提交 v10 `88be100`。新提交和最新交接文档也已复核；关键风险仍存在，文件摘要已刷新为 v10。另一个工作区只读，未覆盖或提交其修改；本 PR 从已上线后端 `458d734` 建立独立分支。

这不是对 Claude 视觉方向的重做。以下只评审数据准确性、来源、接口、可靠性与费用。

## 上线新版前优先处理

### P0：Ask 与翻译没有使用共享费用上限

`lib/ask/jev.ts:17–31` 和 `lib/lab/translate.ts:22–48` 直接调用 OpenRouter，未预留/结算数据库预算。每个 Ask 最多理解一次加八个候选判断；翻译缓存按整批文本组合，而不是每条文本，组合变化会把旧文本也重新发出。七天缓存和前端每天五次不能保证全站每月 3 元。服务端限流是实例内 Map；客户端任意设置 `x-ask-refine: 1` 即绕过每天的新问题计数，仍会执行付费判断。

需要：Ask、翻译与语义 QA 共用原子月预算；付费前预留，异常保留预留或按可核实账单结算，余额耗尽走现有规则/原文降级。追问资格由服务端校验，而非信任一个 header。翻译缓存用原文 hash+模型/提示版本+语言，校验日期、时间、线路标记，翻译不能改变事实。当前 USD0.20 cap **只涵盖后台 semantic QA**；没有证据证明这些新调用已受该 cap 保护。这次评审没有付费调用，也没有上线 Ask/翻译。

### P1：计划罢工被写成实时“停运”，保障中的状态也会错

`lib/lab/model.ts:154–169` 仅按计划窗口返回“停运中”“15:00 恢复”。它没有读实时服务状态，也不检查 guarantees。实测 GEST 10 月 10 日 07:00 在官方保障内，仍返回“停运中 · 24:00 恢复”。ATM 10 月 9 日 09:00 返回“停运中 · 15:00 恢复 · 18:00 再次停运”。[ATM 当次公告](https://www.atm.it/it/ViaggiaConNoi/InfoTraffico/Pagine/Sciopero9ottobre.aspx) 表述的是可能不保障，没有保证整网停运或某刻全网恢复。

需要：状态按取消→明确保障→计划影响→未知处理；计划窗口说“可能受影响／处于罢工时段”。只有 fresh、active、明确 STRIKE 的官方实时证据才能说某服务已停运；仍不能扩大到未指定线路。`LabStrikeCard.tsx:191` 的区间空隙“恢复运行”也不能凭补集推断；没有保障证据时只说“不在已公布罢工时段内”。同一原则用于 FS Security/RFI 等间接影响，不能因人员罢工窗口宣称列车停运。

### P1：/lab 与 Ask 仍消费旧线路和保障字段，并丢掉规则来源

`app/lab/page.tsx:125–137` 和 `lib/ask/pipeline.ts:240–242` 只取 numeric guarantee_windows / affected_lines，旧类型仅支持 ALL_LINES。当前后端的 ATM/Arriva 已是 ALL_OPERATOR_LINES，新卡片却不能展示命名运营商范围；ATM service-start–08:45 也会丢失。`components/lab/LabAsk.tsx:54` 进一步将所有非空保障硬编码为 OFFICIAL_STRIKE_NOTICE，将 AIR Campania 等 OPERATOR_RULE 错装成当次官方确认。

需要：合入 #4/#5 的兼容契约，使用 `lineScopeEvidence`、`guaranteeEvidenceWindows`、实际 `guaranteeSource/guaranteeType/guaranteePolicy` 和排除线路；引用 `lib/strikeCardEvidence`。Ask 的每个 individual event 从自己字段取证，不能复制包含其他运营商的整卡线路范围。不要把静态 GTFS 变成实际运行判断。

### P1：M4 末班时间被套到整个地铁事件

v10 `lib/lab/serviceHours.ts:9–20` 仅凭 MILANO+SUBWAY 返回 00:30；`LabStrikeCard.tsx:140/179` 将符号末班改成次日 00:30 主时间。[所引官方网页](https://www.atm.it/it/AtmNews/AtmInforma/Pagine/M4informazionisulserviziopasseggeribis.aspx) 专门描述 M4、约 00:30，并非所有 ATM 线路／站点／日期的共同末班。注释自己还承认 M5 不同。

需要：主字段保持“运营结束”。只有确定线路、日期、方向/站点且对应有效运行表支持时，才另列参考末班；标明约数/计划，不覆盖罢工语义终点，不将一条线路推广全网。

### P1：Ask 截断或不支持的城市可能得到“无影响”结论

`pipeline.ts:369` 只判断前八条；随后 `:440` 没有 matches 就 clear，没有说明剩余候选未检查。第九条相关事件可能被漏掉。成本限制合理，但未审部分应保留确定性候选、未知状态或分页，不得默认为无影响。已经明确提及的运营商/线路应先由代码筛选排序。

`parseQuery('10月15日Foggia公交有罢工吗？')` 的 cities 返回空列表，而 pipeline 默认使用当前页面城市。Foggia 在 MIT 有明确事件，但不是本站支持城市；需要显式报告未支持地点，不能默默回答米兰结果。规则 date parser 也应拒绝非法日期，避免将 31/02 等当作合法检索范围。

### P2：反馈成功响应与实际保存不一致

v10 `app/api/ask/feedback/route.ts:41–43` 写入报错后只记录日志，仍返回 `{ok:true}`。生产只读查询 `ask_feedback` 得到 PGRST205（表不在 Data API schema cache）；v10 的 AI_HANDOFF 现已提出建表 SQL，但仍未提供迁移文件或生产表；它也注明 route 还在发送 JSON 字符串。建表时需要改为结构化 JSONB 入库，而非只新增一张表。

需要：提交 service-only、RLS、显式授权的迁移和共享限流；限制请求体大小，保存结构化白名单而非任意未校验 trace；写入失败返回明确失败，保留允许重试的客户端状态。日志应可诊断，不把临时 log 声称长期存储。未创建生产表或写入测试反馈。

## 本 PR 已修复的两项后端请求

### 汇总的来源可信度

旧 aggregateStrikes 只要 sources 里出现一条 reported，就把官方采用时段也降为 reported。生产库的 ATM bus/metro 两卡本地复算证明旧值 reported，新值 official，时段不变。

新 `aggregateTimingConfidence` 按每个事件实际采用的 timing evidence 评估；保留媒体链接和所有差异。报告事件只有与官方采用时段完全一致才可得到共同官方支持；独立报道时段、未公布报道时段、显式冲突仍保留较低/冲突状态。仅有官方地理/保障链接不会把报道时段升为 official。取消事件不会拖低活跃事实。

Claude 建议的“any official quote outranks reported”不够严格：引用可能只是保障/地区，不证实时段。合入本 PR 后应移除 `LabStrikeCard:130` 的 `quotes.some(q=>q.official)` workaround，以后端 timing confidence 或具体字段为准。

### 精简官方登记记录

`readCityStrikes` 在已有分页查询中取 raw_payload，服务端白名单转为 `official_record`，丢弃整份 raw_payload。每个 `strike_events[i].official_record` 包含 unions/workforce/sector/relevance/region/province/area/mode/proclaimed/url/windows。数据缓存版本 v4。没有迁移或第二次逐 ID 查询。

`OfficialStrikeRecord.windows` 只来自原 MIT modalita 的确定性时钟解析；不复制运营商补充后的 e.windows。未知/符号文字保留在 mode，不能造时钟。原 Tutte、省/地区原文保持；公告日期有效才标准化。

Claude 原 `recordsFor` 将 e.windows 放进 MIT 注册条，可能把 ATM 补充时段错误归给只写 VARIE MODALITA 的 MIT。合入后直接消费 official_record， operational hours 继续读 event.windows。整卡不能以第一条登记记录代替全部事件，官方记录放各事件中。

## 对其他交接请求的判断

- 手绘保存仍是 localStorage stub。公开展示前的默认未批准、服务端坐标/颜色/点数校验、每设备每事件保存和限流方案方向合理，但需要单独 API/schema PR；这次未为了评审创建整套图库/审核系统。现有受影响计数不动。
- 新版依赖/墙面实现正在变动；未移除、覆盖或锁定 Claude 的 package 文件。v10 已去掉 three 并改为像素墙，依赖回到 v7；其 AI_HANDOFF 的 production sha/ledger/当前 backend branch 仍落后，事实以本工作区最新手册和 PR #4/#5/#6 为准。文档不是线上部署证明。
- v10 请求按 IP 分配涂鸦颜色、画布改为 240×140。IP 的 HMAC 可避免公开原 IP，但同 Wi-Fi/NAT 用户会同色、网络变化会换色；不能把它当人或设备身份。颜色归属与现有 device/strike key、限流桶分别设计，明确目标后再接入。坐标校验须更新为新尺寸；前端 palette/滴流字段也要随契约一并校验。
- v10 的明确 M1 问题不让模型扩为 BUS 是正确修正。但机场 trip 仍先花钱判断接驳交通，再因 named-mode 过滤掉；应在判断前决定是否展示接驳风险。相同 union rows 可以共享审核/展示，但不能仅凭 provider+时段把不同来源、保障、范围差异丢掉。合并应保留事件出处和共同保障，再减少重复判断。
- 保留已有 scopeType/indirect/geography 契约和 Rome 日期 helper 的方向正确；不要因新视觉模型丢失 unsupported location、置信度或来源状态。

## 验证与发布状态

171 项回归、TypeScript、相关 ESLint、构建通过。新版本本地 production server HTTP 验证 ATM 两卡 official、四个 individual official_record、无 raw_payload 泄漏、登记原文与运营时段分离。读取真实生产库复算、公开正式版 20 城页面/API/日历及 20 回归通过；新后端也执行了对应本地 HTTP 检查。评审复现不调用模型、不写业务数据。

此 PR 的两项后端改动尚未部署；当前正式版仍是 b52dcee，Claude /lab 和 Ask 未由本任务发布。审查结论针对记录的代码快照，不能当作其随后未提交版本已完成全面验证。

证据：docs/verification/2026-10-claude-review-{snapshot,reproductions,database-checks,http-checks,local-checks,current-production}.json。跨模块接口和待接入事项同步到 AI_HANDOFF.md。
