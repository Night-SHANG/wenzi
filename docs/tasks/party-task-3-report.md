# Task 3 implementation report

记录：2026-11-07 12:43:01 北京时间（UTC+08:00）

状态：DONE，交由 Root 集成与独立审查；没有暂存或提交。

## 文件与接口

- 新建 `src/modules/party-battle.ts`：`partyBattleModule` / `battles.party@1.0.0`，公开 `party-battle`、`combat-action`、`encounter-records` 三个 1.0.0 能力。
- 新建 `src/modules/adventure-rewards.ts`：共享 `grantAdventureRewards` 与库存/成长读取校验；领奖通过原 inventory/progression 能力执行，并核对每一步返回值与实际查询。
- 修改 `src/modules/encounters.ts`：定义版本 1.2.0，原 encounters 能力仍为 1.1.0；可选会话绑定；精确接收 1.0.0 / 1.1.0、stateVersion1 的本定义历史；共享真实奖励转移。
- 新建 `tests/party-battle.test.ts`：18 个公开协议组合测试。
- 修改 `tests/encounters.test.ts`：既有 26 个回归保留，新增 4 个会话、迁移、奖励实际写入回归，总计 30 个。
- 本报告是第六个 Task3 文件。未修改 engine、contracts、索引、world、其他生产者文件或 Root 消费者文件。

## 实现说明

队伍战斗只冻结 allies ID、敌人条款/HP、奖励条款、队列与游标；我方 HP、攻击、防御每次经 Task1 公共 reader 与 member/status 一致性检查读取。敌人严格在自己的队列位置行动；行动推进有当前轮与下一轮前缀的有限上界；每个成功战斗命令以活我方回合或终局结束。全队倒下才 defeat，领队倒下仍可由伙伴继续；终局治疗不自动重新开战。双方相同 ID 按 side 分开校验。

初始/每轮队列均核验完整唯一排列；保存的队列不随策略替换重排。目标候选按冻结 allies 顺序读取最新存活 HP。队员伤害同时检查命令返回与真实 member/status。当前内容目录每次独立检查 list/get 一致性，已有战斗允许目录删除并继续使用冻结内容。start/describe 也必须能在当前目录找到目标，避免隐藏的 get-only 遭遇。

会话在所有非空战斗阶段保留 ctx.self 所有权。acquire 前先写入战斗，release 前写入 idle；跨能力 HP 变更之前写入 detached 本地状态，使嵌套查询看到最后的事务写入。任何后续策略、HP、奖励、冷却或 release 失败都依赖已有宿主事务整体回滚。未增加新的事务、库存、成长或生命数据库。

Root 传达的领队 attack=0 契约澄清已落实：不额外施加正攻击限制；安全整数总攻击交给既有 combat-rule。伙伴/敌人目录仍由各自 reader 限制正攻击。

## 实际 RED / GREEN

1. 新会话/迁移测试先运行 `node --test tests/encounters.test.ts`：26 pass / 3 fail。新增失败分别为未声明 battle-session 绑定、未声明会话支持、定义仍为1.1.0，说明新增行为尚未实现。运行耗时 29844.981792 ms。
2. 新队伍测试先运行 `node --test tests/party-battle.test.ts`：0 pass / 9 fail，均为明确断言 `partyBattleModule must be exported`，模块尚不存在。耗时 282.447144 ms。
3. 实现后首次组合 GREEN：`node --test tests/party-battle.test.ts tests/encounters.test.ts`，38 pass / 0 fail，34595.536447 ms。
4. 补充边界覆盖后 party 独立回归：15 pass / 0 fail，13196.959902 ms；补充实际写入与 availability 后组合回归：47 pass / 0 fail，31477.317099 ms。
5. 自审发现 get-only 目录缺口后先加定向回归：`node --test --test-name-pattern='hidden get-only' tests/party-battle.test.ts`，0 pass / 1 fail；实际收到成功 start，违反预期拒绝。改为经完整目录解析后相同命令 1 pass / 0 fail，659.101899 ms。
6. 最终修改后的指定完整 focused 命令：`node --test tests/party-battle.test.ts tests/encounters.test.ts`，**48 pass / 0 fail / 0 skipped**，**30747.949392 ms**，exit 0。
7. `git diff --check` 针对 Task3 tracked 文件检查通过。新增文件另行自审，无额外依赖。

## 覆盖与自审

验证了双敌/双队员数值顺序、错误行动者与目标、没有旧式即时反击、自动敌人行动、KO跳过、回合更新、领队KO继续、全败与治疗不重开、领队-only窄技能能力与唯一目标省略、满包/经验溢出重试、完整快照回滚、会话独占、决斗/第二队伍互斥、失败release、返回成功但不实际写入的HP/XP/库存提供者、当前队列保留与下回合策略生效、复活前后位置差异、移动来源过滤、active/pending存档恢复、时钟替换、冻结内容删除后领奖、时间精度/溢出、回合/胜次/攻击溢出、名单/阶段/所有者/队列/生命恢复校验、普通自有键与空格/引号/冒号/128码点astral ID、同ID跨阵营。

自审修复了新目录的隐藏 get-only 查询缺口，并以独立 RED/GREEN 证明。没有发现未解决的 Task3 阻塞项。敌人 HP 归属 battle，伙伴 HP 归属 party，领队 HP 继续由 party 委托原 vitals；会话所有权检查和奖励阶段检查没有创建旁路状态。

测试使用普通 ModuleDefinition fixture 提供 Task1/2 公开协议，并使用真实宿主、inventory、capacity、location、time、combat-rule 和旧 duel；真实生产 party/session/squad/initiative/targeting 的整体组合由 Root 完成。未运行全局测试、typecheck、build 或 smoke，遵循 Root 明确的职责划分。最终尚需 Root 的真实组合、全局门禁与独立审查；本报告不将 focused 结果表述为全库通过。

## 来源与范围

已读取 `artifacts/squad-source-research-v08.md`：Tuxemon 固定提交 `9e6258ff726b786040a267e8bdbbf037b560285e` 仅为职责划分参考；本实现没有复制上游源码、资源或数值，也没有引入依赖。直接复用现有宿主事务、库存容量、经验、生命能力、伤害公式与模拟时间。奖励延后领取、会话所有权、冻结JSON状态和原子回滚属于本项目契约，未归因于上游。

## 集成修复循环第 1 轮：list 返回的 TypeScript 序列化边界

记录：2026-11-07 12:53:34 北京时间（UTC+08:00）

Root 首次完整 Preflight 报告 383/383 行为测试及 14 个世界实际运行与恢复通过，6 个 gates 中 5 个通过；唯一已知失败为 `src/modules/party-battle.ts(261,34)` 的 TS2322。该完整 Preflight 为 Root 执行，本轮没有重跑全量测试。

根因：`list` 返回值由 TypeScript 推断出 `SquadDefinition` 中的 `EnemyDefinition[]` 接口类型；接口没有字符串索引签名，因此无法直接赋给公共 `JsonValue`，尽管目录 reader 已构造并校验纯 JSON 内容。此前 Node 类型擦除行为测试没有覆盖这一静态类型门禁。

修复：只将 `party-battle.ts` 的 `list` 返回对象包入现有 `json(...)` helper，与同模块的 `describe`/`status` 序列化边界一致。没有修改运行时数据结构、规则、schema 或返回字段。Root 在 Preflight 完成后明确 GO，才执行此次写入。

真实验证：运行 Root 委托的精确命令 `node node_modules/typescript/bin/tsc --noEmit`，**exit 0，标准输出与错误输出均为空**。本轮仅修改该生产文件及本报告；没有 stage、commit、全量行为测试或 Root 集成文件改动。
