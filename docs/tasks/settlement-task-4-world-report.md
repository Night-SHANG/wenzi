# Task 4 integration lane — settlement worlds and compiled smoke

记录：2026-11-07，北京时间（UTC+08:00）。分支 `feat/settlement-economy`。状态：DONE，交 Root 执行全局门禁；本 lane 无未解决接口阻塞。

## Scope and assembly

仅创建/修改分派的五个文件：

- `worlds/settlement.json`
- `worlds/settlement-continuous.json`
- `tests/settlement-world.test.ts`
- `scripts/smoke-built.mjs`
- 本报告

读取 AGENTS.md、binding spec、Task4计划、Task1/2/3报告、既有 party 集成测试、compiled CLI smoke 与真实 inventory/crafting/recipes/planting/quests 接口。没有改任何生产模块、catalog、contracts、engine、package、旧14world；没有 stage/commit、subagent、全局 suite/typecheck/preflight/build 或 compiled smoke。

两份 JSON 各为21实例、32条demo命令。使用真实有限钱包2/4币、商店seed1、玩家空包，slots6/2；seed/turnip/meal/voucher均有正物理元数据。两个 recipes.catalog 与两个 crafting.single 分别显式绑定 supplier/player 容器；所有存在的required/optional依赖都有显式bindings。视图入口 `seedworks-view` → `kitchen-view` → `settlement-view`，每个wrapper显式绑定自己的crafting与recipes，无自动歧义或viewcycle。

商店 riverside 位于market，market↔river；便携box不添加既有planting之外的地点限制。calendar60秒/天、3天/周，days[0,1]、windows[10,50)；固定seed buy2/sell1、turnip buy3/sell2；turnip20秒yield3。商店press消耗turnip1产seed1、厨房cook消耗turnip2产meal1，均10秒；重复delivery交meal1得voucher1、experience0。step时钟每步10秒，continuous demo严格按相同累计秒换算，没有add/credit/gain调试命令。

## Literal hand calculation and result

初始玩家2/商店4，总6币。t10买种→0/6；t30收获3，卖1→2/4，商店工坊消费商店的1个turnip补seed，玩家厨房消费自己的2个turnip做meal，t40领取交单得voucher1。第二轮t40再买种→0/6；t60收获但商店闭门；t70开门卖1→2/4并开双工坊，t80领取交单得voucher2。t150休息日，opensInSeconds40；t190重新开门。最终实际断言：玩家2/商店4、总6，supplier seed1/turnip0，player seed0/turnip0/meal0/voucher2，trades4、completed{delivery:2}、active{}、两job null、plots[]。

## Actual RED / GREEN evidence

1. 在创建任何world JSON之前，先写完整 `tests/settlement-world.test.ts`，运行 `node --test tests/settlement-world.test.ts`：exit1，**9 tests / 0 pass / 9 fail**，约1.25秒。第一项为真实目录计数断言53≠63，其余八项因settlement JSON尚不存在而ENOENT。此轮是缺少装配产物的RED，**不是完整经济行为断言的RED**；不夸大其证据。
2. 创建两份JSON，待Root注册63定义并提供两视图后运行相同focused命令：exit1，**8 pass / 1 fail**，约24.77秒。真实循环、存档换钟、两个策略替换、真实容量晚失败、冻结订单、无视图继续、作者patch均通过；任意ID测试因测试预期遗漏视图明确输出的`batches:1`而找不到start hint。这是测试假设错误，生产实现没有因此修改。
3. 修正hint预期为实际`{recipe,batches:1}`，补充冻结订单期间强制营业策略改为闭门、领取仍成功且新买单拒绝的全快照检查。再运行相同命令：exit0，**9 tests / 9 pass / 0 fail / 0 skipped**，duration **26422.276438ms**。
4. `node --check scripts/smoke-built.mjs`：exit0，无输出；这只是smoke脚本语法检查，不能据此声称compiled smoke通过。

Node类型擦除执行不是TypeScript静态验证。本lane没有运行typecheck；全库静态与编译验证由Root统一完成。

## Focused coverage

- 实际63定义/16world，两份21实例/32cmd组成；两时钟最终逐项固定数字检查，t60闭店、t150休息日、t190开门，日历字段精确；render/status/quote/calendar/hours/quests查询均比较完整snapshot纯读，restore完整相等。
- 仅测试副本额外初始seed1，在demo第11条后t30种extra box，checkpoint同时持有两已支付job、未完成种植、active delivery及钱货。restore后替换step→continuous继续到190，21实例的所有owned state逐个与直接step运行相等；extra box成熟，原世界和restored源快照均不变。
- fixed→stock在玩家有足够资金的真实世界中令下一seed买价2→4，成交后玩家2/商店8，seed确实转移；替换前后钱货原样，源世界不变。
- schedule→always在t0由CLOSED变可交易，下一买单实际支付2并转移seed；替换保留钱货，源世界不变。
- 真实customer slots0和supplier slots1分别令付款后的inventory.transfer因CAPACITY_EXCEEDED晚失败；quote原本available，完整snapshot（含资金/库存/trades/receipts/events/revision）回滚。修复容量后原command ID重试只成交一次，再replay完整snapshot不变；两种余额都按真实方向检查。
- 已支付双工坊在当前配方更改产物/时长或删除后保留冻结job；营业days改[2]即刻闭店，t40仍按原条款领取seed1/meal1，voucher0。此刻新buy明确TRADE_UNAVAILABLE且全快照不变；当前catalog若引用不存在物品，仍拒绝reconfigure，不以冻结job掩盖坏目录。
- 删除全部三个views及entry后跑完demo并继续第三轮，voucher3、余额2/4、supplier seed1/turnip0、trades6、delivery3。
- 全部21实例改为带Unicode/空白/双引号/emoji的ID，重写每一个binding、entry及demo target；从实际render抽取、parseActionCommand解析并dispatch商店buy/sell、两工坊各自start/collect，完整第二轮仍成功且资金/凭证/trades正确。
- 作者JSON Patch把seed buy2→1，经真实inspect(runDemo)和完整demo后玩家4/商店2、总6、voucher2，其余固定终态一致，原包不变。

没有复制commerce.test已有的lying-provider fixtures；本lane覆盖真实provider组合与晚容量失败。Root另有malformed-view reader测试，不重复其职责。

## Compiled smoke delivery and remaining gate

保留原有28组，现有world枚举自动加入settlement与continuous两组；额外三组：authored-settlement、interactive-settlement-active-save-load、interactive-settlement-arbitrary-ids。脚本明确断言16world、63定义、最终33组；没有删除旧组。两新world逐项核对32commands/21instances/最终钱货、任务、双job和plots。作者组使用真实fork/patch/validate/demo CLI；active组是仅测试副本额外seed并于t30保存双job+extra crop+quest，续跑、load、再续跑后完整snapshot相等；任意ID组实际CLI play带引号Unicode IDs并检查两工坊和经济终态。

compiled smoke未在本lane执行。Root必须在源码整合完成后运行build与该脚本，实际确认33组及旧回归。focused GREEN和脚本语法检查不能替代这些门禁。
