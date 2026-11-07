# Task 1 报告：账户、商店目录、可替换定价

日期：2026-11-07，北京时间（UTC+08:00）。工作分支 `feat/settlement-economy`，dispatch base `e3ee6ba`。

## 交付范围

仅创建本 lane 的四个实现/测试文件及本报告：

- `src/modules/wallet.ts`：`walletModule`、`WalletBalance`、`readWalletBalance(ctx,value,expectedAccount)`；配置初始化真实有限账户；credit/debit/双向transfer与纯余额/目录查询；准确账户集合验证；修改初始金额不覆盖已有资金；无额外事件。
- `src/modules/shop-rules.ts`：`shopRulesModule`、`OfferDefinition`、含 `id` 的 `ShopDefinition`、`offerSchema`、`readOffer`、`readShop`；至少一个非空方向、每店非空offer；完整字段与外部读回结构验证；目录不持有库存/资金。
- `src/modules/trade-price.ts`：`priceFixedModule` / `priceStockModule`；空配置/状态；固定总价与库存分档总价；BigInt精确计算、常数次算术、最终JSON安全整数；严格准确身份/版本/格式/空状态迁移。
- `tests/economy-rules.test.ts`：14个focused测试。复用真实宿主、恢复与重装配路径，未引入依赖或修改宿主/旧模块。

已读 `AGENTS.md`、Task1 brief、binding spec Global/Task1/Task2、源码研究、README、作者指南和既有capacity/inventory/recipes/market/时间/制作与宿主公共契约。采用 test-driven-development 技能；依本次lane明确约束，仅运行focused验证，全局suite/build/preflight/smoke由root独占。

## 实际 RED / GREEN

1. 实现前先创建测试，运行 `node --test tests/economy-rules.test.ts`，exit 1：12 tests，11 failed / 1 passed。失败为明确特性断言 `wallet.accounts is implemented`，三个新模块尚未存在。此轮有一个负例测试由于setup缺模块而被 `assert.rejects` 接收，属于短路通过，**不将其视为有效负例验证**。实现后已将临时动态加载及缺模块捕获改为普通静态import，消除该短路路径。
2. 创建三个生产文件后运行相同命令，exit 0：12/12 passed，0 failed。
3. 自审补充严格外部JSON结构与非JSON历史测试。运行相同命令，exit 1：14 tests，13 passed / 1 failed。真实行为失败为 `price migration rejects non-JSON objects masquerading as empty history` 的 `Missing expected exception`：原先仅用 `Object.keys` 判断为空，直接调用migrate可接收Date/隐藏属性/Symbol属性对象。
4. 迁移增加plain/null prototype检查并以 `Reflect.ownKeys` 要求精确为空。最终运行 `node --test tests/economy-rules.test.ts`，exit 0：**14/14 passed，0 failed，0 skipped**，约2.3秒。

## 额外实际检查

- 运行 `./node_modules/.bin/tsc --noEmit --target ES2023 --module NodeNext --strict --noUncheckedIndexedAccess --allowImportingTsExtensions --skipLibCheck src/modules/wallet.ts src/modules/shop-rules.ts src/modules/trade-price.ts`，exit 0，无输出。这是这三个新生产文件及其导入依赖的focused类型检查，不是全库typecheck。
- 运行 `git diff --check -- src/modules/wallet.ts src/modules/shop-rules.ts src/modules/trade-price.ts tests/economy-rules.test.ts`，exit 0，无输出。四个文件在当时均为untracked，此命令不能据此证明新文件的diff格式检查完成。
- 未运行全量suite、项目typecheck、build、preflight、compiled smoke，未stage、commit或spawn agent。

## 覆盖与自审

- 钱包真实初始a2/b4 → 付款2后a0/b6 → 反向付款2后a2/b4；credit/debit返回精确余额；transfer不发事件。
- 非法amount、未知及继承账户、from==to、资金不足、credit/target overflow均失败，并比较完整snapshot不变。
- 快照恢复与配置初始金额修改保留玩家实际资金；增加账户或存档账户集合不符明确拒绝。
- 商店list/get一致且返回独立数据，允许禁用单个方向，拒绝空offers/禁用双向/非法数量/未知字段；外部readers检查精确字段、账户/商店身份与安全整数，不把未知外部值直接cast成有效条款。
- 128个astral Unicode码点ID接受、129个拒绝；自有`toString`/`hasOwnProperty`键可用，缺失继承键不可用；保留宿主对`__proto__`等危险JSON键的既有拒绝边界。
- reader对继承、隐藏、访问器、Symbol字段拒绝，访问器没有执行；readShop拒绝只有继承offer的隐藏目录。
- fixed buy3×3=9；stock target2/stock4买3=12；stock1卖3=4；相同基础价跨门槛往返总价一致；库存不足买单仍可纯估价；禁用方向拒绝。
- 最大安全数量不按单位循环；BigInt只在查询内部使用，输出total为number；超过MAX_SAFE_INTEGER的最终总价明确拒绝。
- 两价格策略准确v1空状态可双向迁移；未知身份/版本/stateVersion/非空及非JSON伪空历史拒绝。

自审未发现未解决的Task1接口或行为问题。已向Task2确认 `ShopDefinition` 包含id且读回helper已落地。后续跨lane组合和全局门禁仍待root执行，不据focused结果声称整个版本完成。
