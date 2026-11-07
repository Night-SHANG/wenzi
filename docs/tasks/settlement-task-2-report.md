# Task 2 — 有限商店交易实现报告

记录：2026-11-07 13:35 北京时间（UTC+08:00）。Dispatch base `e3ee6ba`，分支 `feat/settlement-economy`。状态：DONE，交主代理整合和独立审查；没有已知阻塞接口。

## 范围和接口

仅写 `src/modules/commerce.ts`、`tests/commerce.test.ts` 和本报告。没有 stage/commit，没有改 host、contracts、旧世界、依赖或其他 owner 文件，没有 spawn。阅读了 AGENTS、binding spec、计划、任务 brief 和 `docs/settlement-source-research.md`；直接复用现有 inventory/capacity/宿主事务，不复制 FLARE/Widelands 源码。

导出 `commerceModule`，定义 `commerce.shop@1.0.0` / stateVersion1，提供 `commerce@1.0.0`。配置精确 `{shop,customerContainer,customerAccount}`，状态精确 `{trades}`。依赖 inventory/wallet/shop-rule/trade-price/availability，location 可选；导入 Task1 的 `readWalletBalance`、`readShop` 与 Task3 的 `readAvailability` 及公共类型。

实现 quote/status/buy/sell；quote 为纯读，重新读取当前条款与状态；状态只记录成功交易命令次数。正常闭店/地点不符/库存不足/资金不足按 CLOSED、WRONG_LOCATION、INSUFFICIENT_STOCK、INSUFFICIENT_FUNDS 顺序形成 reasons，不阻断装配。禁用方向 status 显示 null，直接请求拒绝。

目录裁定已向 Root 确认：每次读检查整个 list 的身份唯一性及每行 get 的字段/条款一致性，拒绝隐藏 get-only 当前商店；仅当前店核验实际库存容器、账户、商品和地点引用，以允许不同 commerce 实例显式绑定独立资源域。其他目录店仍验证完整定义，不能把当前实例的资源域套到全目录。

成交先计算所有安全整数结果（BigInt 中间运算），再真实 wallet.transfer，检查双方返回身份/余额、transferred 和实际余额；随后真实 inventory.transfer，检查 transferred 及双方实际数量；交货后再次核验双方余额。最后才写 trades 和 emit commerce.traded。嵌套错误不捕获，因此容量失败、谎报、未写入及外层晚失败由宿主撤销全部状态/事件/receipt/revision。

## 实际 RED / GREEN

命令均在仓库根目录执行。

1. `node --test tests/commerce.test.ts`：第一次退出1，commerce.ts 尚不存在，ERR_MODULE_NOT_FOUND。该次只证明导入入口未实现，不把它当行为 RED。
2. 加入最小可装配 commerce manifest 和 NOT_IMPLEMENTED 操作后再跑同命令：23 tests，10 pass / 13 fail，退出1。成功买卖、ordered refusals、容量晚失败、外层晚失败、重放恢复、引用校验、严格 schemas、安全整数和双商店隔离均出现真实断言/NOT_IMPLEMENTED 失败。初始只断言“应失败”的10项通过不能证明故障检测，因此后续增强了 wallet/inventory 故障项的正常 quote 前置断言及精确错误码。
3. 实现 commerce 后同命令：23/23，退出0。
4. 加入边界身份、其他店独立资源域以及真实 Task1/3 provider 组合，增强故障错误码后同命令：26/26，退出0。
5. 自审补足库存只扣源/只加目标的分别读回案例后，最终同命令：**28/28，0 fail，退出0，duration 4927.592335ms**。

最终静态检查命令：

```bash
./node_modules/.bin/tsc --noEmit --target ES2023 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --verbatimModuleSyntax --erasableSyntaxOnly --rewriteRelativeImportExtensions --skipLibCheck src/modules/commerce.ts
```

执行两次均退出0，末次在最终28项运行后执行。该检查覆盖 commerce 及其导入依赖的 TS，不是全仓 `npm run typecheck`，也不把 Node 类型擦除运行说成 typecheck。没有运行全量 suite/preflight/build/compiled smoke：按明确任务分工留 Root 统一执行。

## 测试覆盖和自审

- 真实 inventory.basic + capacity.slots，买 seed1 付2使余额2/4→0/6、seed商店/玩家1/0→0/1；卖 turnip1 使余额回2/4、货进入商店；成功次数及事件金额精确。
- quote/status 全快照不变；正常不可用可装配；disabled/null、未知商品和坏价格回显拒绝。
- 玩家满包和商人满仓都在付款后的真实交货阶段失败，完整 snapshot 相等；腾出容量后使用原失败 commandID 重试只收费一次。
- 钱包 no-write、wrong-from、wrong-to余额、wrong-amount、单边写入；库存 no-write、source-only、target-only、wrong-amount、写入并emit后主动失败；全部完整 snapshot 回滚。
- 外层 sequence 在先写自身状态/emit后，调用成功买卖再失败；完整 snapshot（含状态、revision、eventSequence、receipts）回滚。
- commandID重放及restore后重放不再付款；不同输入冲突拒绝；改配置初始余额不覆盖已有真实余额。
- 目录删除、重复、隐藏get-only、list/get不同条款、错误身份/空offers、当前引用缺失、同账户/容器拒绝。
- malformed price/availability/count/balance拒绝；严格输入/config/state unknown fields，非法数量与超长身份拒绝。
- MAX_SAFE_INTEGER 数量和金额成功精确搬运；收款余额/目标库存/trades溢出拒绝，状态不变。
- 128码点Unicode商品/商店、toString/hasOwnProperty容器和账户，正常交易。
- 两个显式绑定不同 inventory/wallet 的商店互不污染；其他目录店不要求本资源域持有其商品/地点/账户。
- 最终真实 wallet.accounts、shops.catalog、trade-price.fixed、availability.always、inventory.basic 组合买卖守恒，只产生 commerce.traded 事件。

代码自审：无私有钱包/库存读取、无重复钱货状态、无免费补货、无时间推进、无数量级循环；外部 query 的消费字段均经 reader/显式检查，只有受 schema 保护的本模块 config/input 使用类型断言。供给目录采用 own-key访问；购物状态只写 trades；正常不可用不提升为 validate 错误。未知历史没有自定义迁移，交由既有宿主默认严格身份/版本语义处理。

## Concerns / 后续边界

没有已知实现阻塞。跨全部现有世界的回归、最终全仓typecheck/build/smoke及正式审查由 Root 完成，本报告不代称通过。fixtures专门模拟公共提供者坏返回与跨模块事务，另有真实provider组合用例；未把fixtures的通过替代完整经营世界验收。
