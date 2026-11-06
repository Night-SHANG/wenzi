# v0.5 探索与生产组合设计

记录：2026-11-07 00:10 北京时间（UTC+08:00）。基线：`f86be17cf09323923b0fe747e6d766a292ad360b`。用户已指定独立仓库并要求继续自主推进。

## 目标与取舍

把已有宿主和创作工具用到一条可重复的真实流程：从镇口选择道路，采集不同地点的材料，回到工坊制作，领取并出售产品，保存后继续。所有玩法、数据和文字呈现通过普通模块接入，宿主不增加游戏类型分支。

采用沿用现有库存、容量、时间、交易、事务和存档实现的薄模块组合。两条备选是直接移植完整生存/经营引擎，以及先做浏览器编辑器；前者会带入另一套状态与时间权威，后者不能解决当前玩法组合缺口。本轮选择由实现者负责，依据已有研究与用户持续执行授权，不记作用户逐字段确认。

这是会继续维护的正式核心代码与示范数据，不做一次性原型。仍为 alpha 工程；数值仅用于可验证的资源循环。正式浏览器 UI、视觉编辑器、完整边境小镇、随机事件、战斗、多人、不可信脚本和性能容量不在此批次。

## 全局约束

- 全部现有和未来系统、规则、数据、内容、表现、界面与操作均模块化，具体样例不限定范围。
- 不修改 `src/engine`、`src/contracts.ts` 或为新世界增加 CLI 分支；通过公开 `ModuleDefinition` 与能力绑定接入。
- Node.js >=24.12.0，TypeScript 5.9.3；沿用 Ajv 8.17.1、semver 7.8.5、fast-json-patch 3.1.1，本轮不加依赖。
- 所有新增定义 version=1.0.0、apiVersion=1、stateVersion=1；声明的能力版本为 1.0.0，依赖范围为 ^1.0.0。
- 各模块只写自己的状态；库存增减、冷却和生产状态必须在已有宿主事务中原子提交。
- 时间只消费绑定提供者的 `time.now -> {elapsedSeconds}`，单位为模拟秒；不猜测 `advance` 的参数，不订阅无关时钟。
- 数量为正安全整数，时间为有限安全非负数；正时长相加后必须严格增加，溢出或精度丢失拒绝。复用 capacity.ts 的 schema、own、safeNumber、safeCount。
- 读取外部能力返回值时检查必要字段与数值，不把 TypeScript 断言当运行时校验。所有 ID 按自有属性查找，安全支持合法的原型同名键。
- 既有世界和存档格式保持可用；同版本配置更换保留状态，无法对应的已有状态明确拒绝。新模块不承诺自动跨代码版本迁移。
- 正式视觉界面仍先经过视觉样板确认；本轮扩展现有纯文字作者界面，不设新的视觉审批点。

## 模块与精确契约

### location.nodes / location

文件 `src/modules/location.ts` 导出 `locationModule`。配置 `{start,nodes}`，nodes 为 ID 到 `{name,description,exits:string[]}` 的映射。非空名称；start、每条有向出口都必须存在，出口唯一。状态 `{current,visited:string[]}`，初始化只访问 start。

- 命令 `move({to})`：只允许当前位置显式出口，写 current，首次访问才追加 visited，发出 `location.moved`，返回 current 的结果形状。
- 查询 `current({}) -> {id,name,description,exits:[{id,name}],visited:string[]}`。
- 查询 `describe({location}) -> {id,name,description,exits:string[]}`，用于其他模块验证地点引用。
- 不依赖库存、时钟或采集；移动不自动消耗时间。状态校验要求所有 visited/current 存在、visited 唯一且包含 current。更改节点配置不能删除仍被状态引用的节点。

### gathering.rules / gather-rule

文件 `src/modules/gathering-rules.ts` 导出 `gatheringRulesModule`。配置 `{rules:Record<id,{name,item,quantity,cooldownSeconds}>}`；quantity 为正安全整数，cooldownSeconds 必须大于 0。空状态。

- `get({rule}) -> {id,name,item,quantity,cooldownSeconds}`。
- `list({}) -> {rules:[上述对象]}`。
- 内容独立于采集状态。允许外部兼容模块提供同一能力，不依赖具体内置实现。

### gathering.cooldown / gathering

文件 `src/modules/gathering.ts` 导出 `gatheringModule`。依赖 location、gather-rule、inventory、time。配置 `{container,sites:Record<id,{location,rule}>}`。状态 `{cooldowns:Record<site,{gatheredAt,readyAt}>}`，初始为空；只记录已采集站点。

- `gather({site})`：确认站点存在、处于对应地点且冷却已结束；解析规则并检查结果及库存物品；调用 inventory.add，冻结新的 gatheredAt/readyAt，再发出 `gathering.gathered`。返回 `{site,item,quantity,readyAt}`。
- `sites({}) -> {sites:[{id,location,name,item,quantity,cooldownSeconds,readyAt,remainingSeconds,available}]}`；未采集 readyAt=0；available 同时要求位置正确和冷却结束。查询不修改状态。
- 冷却读取权威累计秒数，不逐 tick 积累。变更规则只影响下次采集，已经开始的 readyAt 保留。
- 校验所有站点的地点、规则、物品和容器引用；已有冷却必须对应站点，0<=gatheredAt<readyAt，当前绑定时钟不得早于 gatheredAt。失败或容量不足不消耗冷却，不改变库存。

### 公共模拟时间读取

`src/modules/simulation-time.ts` 导出 `readSimulationTime(context:ReadContext, notBefore=0):number`。仅校验并返回 time.now 的 elapsedSeconds；无效返回 `INVALID_CLOCK`，有效值小于基线返回 `CLOCK_BACKWARD`。这是游戏模块公共适配，不放入宿主，也不选择时钟提供者。由探索任务拥有，制作任务复用。

### recipes.catalog / recipes

文件 `src/modules/recipes.ts` 导出 `recipesModule`。配置 `{recipes:Record<id,{name,inputs:Record<item,quantity>,outputs:Record<item,quantity>,durationSeconds}>}`。inputs、outputs 都至少一项，quantity 正安全整数，durationSeconds>0。空状态。

- `get({recipe}) -> {id,name,inputs,outputs,durationSeconds}`。
- `list({}) -> {recipes:[上述对象]}`。
- 只解释配方数据，不持有库存或订单。制作消费者验证物品语义和外部配方提供者返回值。

### crafting.single / crafting

文件 `src/modules/crafting.ts` 导出 `craftingModule`。依赖 inventory、time、recipes；location 为可选依赖。配置 `{container,locations?:string[]}`，locations 唯一。未提供或为空表示无地点限制且可不装 location；非空必须绑定 location，并验证地点存在。

状态 `{job:null | {recipe,name,batches,inputs,outputs,startedAt,readyAt}}`。inputs/outputs 为已经乘以 batches 的冻结正整数计数映射，开始后不重新解释配方。只允许一个订单，该并发策略以后可整体替换。

- `start({recipe,batches?})`：batches 默认 1，为正安全整数；必须空闲并位于允许地点。解析配方，验证所有引用、批量乘法与总时长，逐项 inventory.remove，写入冻结订单，发出 `crafting.started`，返回 status。
- `collect({})`：必须存在已完成订单并位于允许地点；按冻结 outputs 逐项 inventory.add，全部成功才清空订单并发出 `crafting.collected`，返回 `{recipe,batches,outputs}`。背包满不阻止时间推进，成品保留待领取。
- `cancel({})`：任何地点可取消存在的订单，包括已完成但未领取的订单；按冻结 inputs 原数退款，全部成功才清空订单，发出 `crafting.cancelled`，返回 `{recipe,batches,refunded}`。退款放不下时保留订单和全部库存。
- `status({}) -> {job,ready,remainingSeconds}`；空闲为 `{job:null,ready:false,remainingSeconds:0}`，查询没有副作用。
- 时间与输入输出都在 start 冻结；修改或删除配方不能改动已经支付的订单。工坊配置和存档校验仍要求冻结物品存在、容器存在、0<=startedAt<readyAt、绑定时钟>=startedAt。没有订单时仍校验当前配方清单的所有物品引用。

### view.frontier.text / text-view

文件 `src/modules/frontier-view.ts` 导出 `frontierViewModule`。只查询 location、gathering、crafting、inventory、market、time，配置 `{title,container}`；空状态。render 返回现有 `{title,lines:string[]}`，展示当前地点与可达出口、此处采集点及冷却、物品、金币、订单与简短操作提示。完整动作 schema 继续由 CLI actions 提供。纯查询，不自动派发命令。

## 世界与文字推演

`worlds/frontier.json`：世界 ID `world.frontier`，四处节点 town/forest/quarry/river（镇口、林地、采石场、河滩）；所有道路由配置声明。原料 wood/stone/reed，产品 plank/toolkit，库存容器 player。时钟每步 10 秒。

采集：forest 的 wood 产出 3、冷却 30 秒；quarry 的 stone 产出 2、冷却 40 秒；river 的 reed 产出 3、冷却 20 秒。配方 plank 消耗 wood:2、产出 plank:2、20 秒；toolkit 消耗 plank:2/stone:1/reed:1、产出 toolkit:1、30 秒。工坊 start/collect 仅 town 可用；toolkit 出售价 18，初始 0 金币。

演示按有效道路采三种材料，回 town 制作并领取 plank，再制作并领取 toolkit，出售后得到 18 金币；余量 wood:1、stone:1、reed:2，elapsedSeconds=50，无未领取订单。资源冷却已结束，可以重复生产。`frontier-continuous.json` 保留同一 world ID、装配实例 ID 与规则，只将时钟换为 time.continuous，示例推进改为 20/30 秒；应取得相同资源结果。

正常路径：查看地点→移动→采集→回镇→开工→推进时间→领取→再加工→出售→保存恢复。失败路径：走不通、异地采集、冷却未结束、材料不足、批量溢出、工坊忙、未完成领取、产物放不下、退款放不下，均清晰失败并保持相应事务前快照。长期路径：采集再生、多个周期、途中存档恢复、更换时钟与规则、配方变化时冻结订单、外部规则提供者。

## 复用与验证

直接复用项目已验证的库存/容量/时间/市场、公共 schema、宿主事务、能力版本与绑定、存档、CLI 和世界作者工具。成熟游戏的配方/生产阶段设计作针对性参考，来源核查附在 `docs/frontier.md` 与 THIRD_PARTY；本轮不直接拷入不同许可证的完整游戏源码或游戏数值。

验证分为探索规则、制作规则和集成三组。先写可观察行为测试再实现；分别覆盖原子失败、引用完整性、时间边界和外部提供者。最终统一执行 Preflight、构建、独立目录已构建 CLI 运行和打包验证。上一基线 Actions run 42246209860 的 Linux/Windows 两组已成功；本次新提交后立即报告，不持续轮询。
