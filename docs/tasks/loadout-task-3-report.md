# v0.7 Task 3：技能与唯一战斗权威

记录：2026-11-07 11:44 北京时间（UTC+08:00）。按 task-3-brief、完整 binding design 和计划 Global Constraints 实现；读取 test-driven-development 与 writing-good-tests。

## 交付文件

- 新增 `src/modules/skill-rules.ts`：skills.catalog、skillRulesModule、独立技能目录与对外条款读取校验。
- 新增 `src/modules/skills.ts`：skills.combat、skillsModule；实时资格、材料支付、先效果后 strike、冻结技能冷却和只读可用原因。
- 修改 `src/modules/encounters.ts`：定义/能力1.1.0、optional attributes、共享 attack/strike 结算、严格同定义1.0.0/stateVersion1迁移。
- 新增 `tests/skills.test.ts`；修改 `tests/encounters.test.ts`。
- 本报告 `docs/tasks/loadout-task-3-report.md`。

没有修改宿主、公共契约、生命池、注册目录、世界、共享文档或包版本；没有暂存/提交。没有运行全局测试、typecheck、build 或 Preflight。

## 实际 RED/GREEN

1. `node --test tests/encounters.test.ts`：首次22通过、3失败；失败为缺少 strike、未声明 attributes 绑定、迁移后仍无 strike。这是实现前观察到的真实能力缺失。
2. 添加共享 strike、可选属性与迁移后，首次组合命令 `node --test tests/skills.test.ts tests/encounters.test.ts` 的遭遇25项通过；技能测试存在括号语法错误。此语法错误不计作行为 RED，随后修复。
3. `node --test tests/skills.test.ts`：最小导出脚手架下0通过、9失败。可观察 RED 包括 use 返回 UNIMPLEMENTED、缺少引用/目录校验导致预期异常未发生；两个列表用例因空列表访问失败，单独不作为有效行为 RED。
4. 实现目录与技能后，`node --test tests/skills.test.ts`：9通过、0失败。
5. 追加独立属性提供者不依赖基础攻击/防御的回归，`node --test --test-name-pattern='attributes provider can' tests/encounters.test.ts`：0通过、1失败，旧 progression 战斗字段校验仍拒绝装配。修正后基础成长只校验成长字段和数值映射，战斗字段由当前所选属性来源校验。
6. 最终 `node --test tests/skills.test.ts tests/encounters.test.ts`：**37通过、0失败、0跳过**，实际耗时31231.265951ms。包括26遭遇测试和11技能测试。

## 行为与独立预期

真实库存、成长、生命、时钟和遭遇参与技能测试。并行开发中的装备/效果/属性用普通 ModuleDefinition 提供完整公开结果，不向生产代码加入测试专用路径。基本攻击6，效果后攻击8/防御3，技能bonus3；100HP敌人降到89，角色30HP降到28，spark3降到2，时间保持0，冷却结束时间10。

实测标签丢失、等级不足、未知技能、无材料、无活动战斗和冷却拒绝；0秒立即复用，9.5+0.5秒恰好就绪。旧冷却在目录改为100秒或删除技能后仍保留原readyAt10；保存恢复、step换continuous、倒退时钟、溢出及亚精度正冷却均覆盖。

失败快照逐项比较，包含库存、敌人HP、角色HP、效果、技能冷却和宿主版本/事件。效果命令写后拒绝、出招提供者写后拒绝、真实遭遇完成伤害后代理返回坏结果、真实库存扣款后代理返回错误数量均完整回滚。正冷却时间戳计算放在strike之后，溢出也会回滚已完成的出招。

目录外部返回覆盖重复ID、get/list不一致、等级/标签/费用/奖励攻击/秒数/效果字段异常；当前技能引用的库存与效果存在性独立校验；requiredTags/effect非空要求相应optional能力。toString/valueOf与128个astral码点ID成功执行与恢复。

## 自查与交接

- attack与strike同一结算函数，仅玩家攻击叠加bonus；末击不反击、失败/胜利待领取、经验发放、战绩和移动规则保持现有权威。
- optional attributes实际绑定时，基础progression不必含attack/defense；经验依旧仅由progression消费与授予。
- 技能不推进时钟；不保存敌人/玩家生命、经验或物品；查询不写状态。
- 当前目录独立校验，旧冷却不要求仍在known或当前目录，允许目录删除后保留既成事实；use仍明确拒绝已删除技能。
- 本阶段未运行全局类型检查；由root统一集成真实装备/效果/属性提供者并执行全局门禁。正式整批审查由root安排。
