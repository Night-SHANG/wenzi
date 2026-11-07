# Task 2 implementation report

记录：2026-11-07 12:38 北京时间（UTC+08:00）。工作目录 `/workspace/scratch/a43d3bcc68b1/text-world`，分支 `feat/party-battles`。任务基线 `8444ddcea75e7e85947593676e1d65d187236577`。

## Scope and interfaces

仅创建以下 Task 2 文件，未暂存、提交或修改其他实现者/Root 的文件：

- `src/modules/squad-rules.ts`：`squadRulesModule`、`EnemyDefinition`、`SquadDefinition`、`readSquad(ctx,value,expectedId?)`。
- `src/modules/initiative.ts`：`initiativeListedModule`、`initiativeSpeedModule`、`ActorRef`、`InitiativeActor`。
- `src/modules/targeting.ts`：`targetFirstModule`、`targetLowestHpModule`。
- `tests/battle-policies.test.ts`：10 个真实宿主行为测试。
- 本报告。

五个定义均为 version `1.0.0` / stateVersion `1`；所有 state 为严格空对象。能力及输入输出字段完全遵循绑定规格。已经通知 Root 公共类型和实现可供并发调用。没有修改宿主、公共 contracts、注册表、worlds、共享文档，也没有增加依赖。

## Behavior implemented

目录要求至少一个敌人，每个遭遇内部敌人 ID 唯一；配置拒绝未知字段，数值使用已有安全计数/模拟秒 schema。`validate` 经公共 `readSquad` 再检查跨字段和身份不变量。get 使用已有 `own`，list 使用自有项枚举；两者返回相同条款，查询不改状态。目录仅提供内容，不要求或操作 location/inventory。

`readSquad` 独立检查外部返回的完整公共形状、预期遭遇 ID、重复敌人、正 maxHp/attack、非负 defense/speed、正战利品数量、安全经验、有限安全模拟秒，并复制敌人/战利品数据。当前 schema 复用 capacity.ts 的公共助手；运行时谓词复用 encounter-rules.ts 的 isObject/isId/isCount/isSeconds。

行动顺序分别保持输入或按速度降序；速度相同显式使用原索引排序。身份始终通过阵营各自的 Set 处理，不拼接 side/id，同 ID 可分属双方。输入必须非空且同阵营 ID 唯一，返回每个输入 actor 的准确完整 `{side,id}`。

选目标输入必须非空、ID 唯一且 `0 < hp <= maxHp`。first 保持第一项；lowest-hp 比较绝对 HP，严格小于才换目标，因此平局保持输入顺序。两种策略均只能返回输入候选之一。

两个策略族各自只接受自己/对应实现的准确 `1.0.0`、stateVersion `1`、空对象历史。未知模块、版本、格式、null、数组及非空对象均拒绝；没有重排任何消费方已经保存的队列的行为。

## RED / GREEN evidence

先写测试，再建立仅暴露冻结接口的空实现脚手架（order 返回 `[]`，choose 返回空 ID，目录返回空对象，未含行为实现），使测试以缺少行为的断言失败，避免把找不到模块当成 RED。

1. RED：`node --test tests/battle-policies.test.ts`，退出码 **1**；**10 tests / 0 pass / 10 fail**，0 skipped，0 cancelled；runner duration **668.113354 ms**。失败为真实输出与手工字面预期不同或 `Missing expected exception`，不是解析/导入错误。
2. 实现后首次 GREEN：同一命令，退出码 **0**；**10 tests / 10 pass / 0 fail**，0 skipped，0 cancelled；runner duration **4055.78261 ms**。
3. 自查移除未使用的测试类型 import 后最终 GREEN：同一命令，退出码 **0**；**10 tests / 10 pass / 0 fail**，0 skipped，0 cancelled；runner duration **3662.898604 ms**。
4. 对四个源码/测试文件分别执行 `git diff --no-index --check /dev/null <file>`；均无空白错误输出。命令退出码为 **1**，源于新增文件与 `/dev/null` 存在差异；未将其写成退出码0检查。

依据任务明确分工，未运行全局 tests、typecheck、build 或 Preflight，Root 负责这些门禁；本报告不宣称全分支通过。

## Coverage and self-review

10 个顶层测试覆盖：listed/speed 字面顺序、稳定同速、同 ID 双阵营；空/重复/非法阵营/未知字段/非法安全整数；first/lowest-hp 在两种排列中的字面目标（含绝对值与百分比的区别及平局）；死亡/超上限/重复/空/缺字段候选；真实 reconfigure 双向替换与 restore；未知历史拒绝；目录 get/list/read 一致性和查询纯净；空/重复敌人及奖励/属性/时钟范围；独立公共 reader 对外部坏形状的拒绝；128 个 Unicode 码点接受及129拒绝、自有 toString 与含空格/引号 ID、继承键不被误读；非空 config/state 拒绝。

逐项对照 task brief 和完整规格自查。没有发现未解决的任务内缺陷。手工检视排序反向/平局变化、百分比选敌、漏掉重复检查、放宽迁移、移除目录边界检查等常见错误，现有测试均有对应可观察断言。测试不依赖注册表和其他并发实现的文件，没有假成功能力，也没有在生产代码添加测试专用入口。

## Research and boundaries

使用 Root 已核对的固定版本 Tuxemon 队列/排序/party 与许可证研究；本任务未复制上游源码、数值或素材，未添加上游依赖。本项目稳定平局和显式模拟时间由本次规格决定，不归因于上游。

策略本身无战斗状态，已保存队列在替换后的保留由 Task 3 消费方负责；本任务验证策略替换接受/拒绝语义及无状态事实。当前目录被改动后如何保留战斗冻结条款，也由 Task 3 负责。全局编译、真实世界组合和独立审查仍待 Root 门禁，不能从本文件的10项通过推断。
