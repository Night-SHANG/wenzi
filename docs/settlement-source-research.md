# v0.9 纯城镇经营：定向源码核查

记录：2026-11-07 13:21 北京时间（UTC+08:00）。本轮只研究，不修改 tracked 文件、不引入依赖、不运行全库测试。已读本仓库 AGENTS.md、THIRD_PARTY.md、README.md、docs/frontier.md、docs/source-history.md 和现有生产/种植/市场/库存/宿主相关实现。此为既有 FLARE/Widelands 研究的定向延续。

## 结论与采用边界

FLARE 可参考“物品价格与 NPC 倍率、有限售货堆叠、售出物品进入回购区”的职责拆分，但**没有在本轮已读交易路径中实现有限商人现金，也不提供本项目所需的跨模块失败全回滚**。其货币实际是背包物品，不能直接当成新 wallet 账户实现。生产继续采用已实现的 `inventory.basic` 多容器 + `crafting.single` + `planting.basic`；Widelands 只补核配方/先核消耗语义。新模块独立 TypeScript 适配，不复制、翻译整个引擎、源码片段、素材或成套数值。

本报告的日历、营业、独立账户、库存价格与原子交易为本项目拟定职责，不能称为已从上游取得的现成实现。没有把外部版权文件或研究缓存编入运行包。

## 固定来源与实际调用证据

原文完整缓存在 `artifacts/economy-source-cache-v09/`，`manifest.json` 记录逐文件 URL、SHA-256、字节数和取得方法。读取工具是 GitHub connector 的 `mcp__codex_apps__github_fetch`，使用明确提交的 raw URL；不是二手文章。先读取 FLARE 固定提交的 `src` 目录以定位文件，此后只取下表的针对性文件。

FLARE 固定提交：`f9a17a266293a897a1d7eae2d54408b0de39af27`。

| 文件/固定链接 | 实际读到的函数与语义 |
| --- | --- |
| [ItemManager.cpp L1796–1836](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/ItemManager.cpp#L1796-L1836) | `Item::getPrice` 先取 `price.get()` 整数，零直接返回；先乘全局 buy 倍率，`use_vendor_ratio` 为真时再乘 NPC 非零 buy 倍率或全局回退，逐步转 int，最终至少 1。不能简化成“原价只乘一次 NPC 倍率”。`getSellPrice` 按新回购/旧回购选择显式 price_sell 或基于不启用 NPC buy 分支的价格乘 sell 倍率，最终至少 1。无库存量输入，不能称为库存定价。 |
| [MenuInventory.cpp L1049–1164](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/MenuInventory.cpp#L1049-L1164) | `addCurrency` 把 currency_id 当普通 CARRIED 物品添加；`removeCurrency` 从该容器移除。`buy` 查询真实背包货币是否够 `单价×quantity`，先 add/drop 商品，再扣货币；没有按 add/drop 返回结果撤销。`sell` 禁止卖货币、零基础价格和任务物品，随后直接 addCurrency 收入，没有商人账户扣款。 |
| [MenuInventory.cpp L879–947](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/MenuInventory.cpp#L879-L947)；[ItemStorage.cpp L142–253](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/ItemStorage.cpp#L142-L253) | `add` 可先放下部分再把剩余送入 drop_stack，返回 false 也不撤回先前堆叠；ItemStorage::add 返回放不下的余量。`remove` 循环扣堆叠，直到后来找不到才返回 false，并非该底层函数自身先核足全部数量。不能拿这些函数当本项目容量失败原子库。 |
| [MenuItemStorage.cpp L127–173](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/MenuItemStorage.cpp#L127-L173)；[MenuManager.cpp L1013–1044](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/MenuManager.cpp#L1013-L1044) | 普通 click 从售货堆叠扣出物品；数量选择器分支推迟扣除。调用链为 vendor.click → inv.buy；买不起返回 false 时，调用者从 drop_stack 取回并 vendor.itemReturn，属于显式补偿，不是统一事务。 |
| [MenuManager.cpp L1101–1119](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/MenuManager.cpp#L1101-L1119)；[MenuVendor.cpp L290–302](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/MenuVendor.cpp#L290-L302) | 卖出经 inv.sell 后才 vendor.add 进入 SELL 回购区；调用点明写有限 vendor currency 留待将来。回购区满时清掉首个堆叠腾位，不是拒绝整笔交易。这与本项目真实商店容量、有限商人现金不适配。 |
| [NPC.cpp L244–301](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/NPC.cpp#L244-L301)；[L434–455](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/NPC.cpp#L434-L455)；[NPC.h](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/NPC.h) | load 时按 constant/status/random_stock 声明填库存，quantity 是实际堆叠数；NPC 有 stock/craft_stock，最大 stock=80。所读 vendor 字段没有独立余额。不能把 load 生成库存作为本项目每期开门免费补货。 |
| [MenuVendor.cpp L311–377](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/MenuVendor.cpp#L311-L377)；[NPC.cpp L759–767](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/NPC.cpp#L759-L767) | saveInventory 把售货量写回 NPC，注释限于至少离开地图前；setNPC 处理地图加载后回购清空/失去原价回购资格。checkVendor 只检查 vendor 标志和 campaign status。所读路径未有周期日历/营业时段，也不能推出磁盘持久性或全引擎永不补货。 |
| [MenuVendor.cpp L155–159](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/MenuVendor.cpp#L155-L159)；[MenuInventory.cpp L1081–1114](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/MenuInventory.cpp#L1081-L1114)；[ItemManager.cpp L1839–1857](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/ItemManager.cpp#L1839-L1857) | Craft 页是可重复选择的配方展示，不扣该页库存；getCraftCount 由玩家 CARRIED/EQUIPMENT 材料数量求最小可做批次。buy 的 craft 分支立即给产物再扣玩家材料，没有这里要求的模拟时长/商人库存生产。 |

**时间证据限制：**FLARE 所读买卖调用同步完成，没有在这些调用中推进日历/模拟时间；库存初始化绑定 NPC::load，而非已证明的日周期。本项目营业时段应是查询绑定累计模拟秒计算的纯规则，明确 `[open, close)` 边界、跨日与跨周期行为；查询不开门补货、不转账、不推进生产。工坊仍按本项目 startedAt/readyAt 完成；关门是否允许工坊开始/领取应显式声明，不能隐含停钟。

## Widelands：只复核已有生产来源

固定提交：`29753773d9c130e2a6a835ee6a14ad2bf317371d`。

- [bakery/init.lua](https://github.com/widelands/widelands/blob/29753773d9c130e2a6a835ee6a14ad2bf317371d/data/tribes/buildings/productionsites/empire/bakery/init.lua#L58-L77)：water/flour 输入缓冲 amount=6；consume 各一次默认一单位。随后 sleep 20.4 秒、动画 10 秒、produce 面包，注释总周期 34 秒还含 3.6 秒；不能只抄 sleep 或动画时长作为完整生产周期。
- [production_program.cc L1231–1352](https://github.com/widelands/widelands/blob/29753773d9c130e2a6a835ee6a14ad2bf317371d/src/logic/map_objects/tribes/production_program.cc#L1231-L1352)：ActConsume::execute 先用局部 consumption_quantities/剩余需求计算；缺料则 program_end(kFailed)，在该分支前不 set_filled；满足全部才扣队列。该保证限本次 consume 动作，不能扩大成价格/跨商店/跨账户/整条多时段生产流程事务。替代材料匹配也不是通用最优约束求解器。
- [同文件 ActProduce](https://github.com/widelands/widelands/blob/29753773d9c130e2a6a835ee6a14ad2bf317371d/src/logic/map_objects/tribes/production_program.cc#L1383-L1390)：依赖 ProductionSite、worker/task、物流；无需迁入第二套生产权威。

## 本工程采用差异与资源账

| 职责 | v0.9 拟采用；真实状态唯一来源 |
| --- | --- |
| wallet | 单独账户模块；玩家/商人余额是真实有界数值，转账足额检查、算术安全和双方余额同事务。市场不另存 coins。旧 market.fixed 继续独立兼容，不能把其单向生成收入冒充有限交易。 |
| shop | 编排 buyer/seller 绑定账户、商品来源/目标容器、报价、营业查询。买卖仅 transfer 同一库存提供者中的真实物品，不能另建 stock 副本；缺货/缺钱/容量/关门/外部提供者异常均应失败全回滚。 |
| price | 固定价与库存价分别是可替换纯策略。库存价读取交易执行前真实库存，按公开公式给安全整数单价/总价；报告没有为它虚构 FLARE 库存价格算法。一次交易冻结一次当前报价，不在扣货后再次取价。 |
| calendar/opening | 从同一 time.now 累计模拟秒派生周期位置；周期配置与营业策略可换，不持有另一套时间。恢复/换钟保留累计秒语义，校验非法/倒退/溢出时间。 |
| production | `inventory.basic` 的多容器/transfer；已有 `crafting.single` 实例配置商店容器，配方 1作物→1种子；玩家 `planting.basic` 1种子→3作物。不得把 shop craft 当玩家配方或来源无限展示库存。 |
| order | 交付从玩家真实库存扣 2作物，若需记录接收去向则转入订单容器；奖励有明确来源/规则。任务/交付机制与商店分开，不用完成计数冒充库存。 |

建议用于验收的一轮账：初始玩家2币、商人0币、shop种子1、shop作物0、玩家作物0。

| 成功步骤 | 玩家币 | 商人币 | 玩家种子/作物 | shop种子/作物 |
| --- | ---: | ---: | --- | --- |
| 买1种子（2币） | 0 | 2 | 1 / 0 | 0 / 0 |
| 播种、成熟收3作物 | 0 | 2 | 0 / 3 | 0 / 0 |
| 卖1作物（2币） | 2 | 0 | 0 / 2 | 0 / 1 |
| 商店工坊开工 | 2 | 0 | 0 / 2 | 0 / 0，订单持有已消耗1作物的冻结事实 |
| 到期领取1种子 | 2 | 0 | 0 / 2 | 1 / 0 |
| 玩家交2作物 | 2 | 0 | 0 / 0 | 1 / 0 |

工坊消耗的是刚卖入商店的那1作物；不能再扣玩家背包，否则只剩1作物，路线不成立。总货币始终2；再买种子才把钱转回商人。产物来自有时长的显式配方，不是营业/查询/恢复触发的免费补货。订单奖励若增加金币，必须另列来源，不混入这张守恒账。

失败整体回滚的依据是本项目 `src/engine/index.ts` dispatch：复制 states、嵌套 call 共享 transaction，事件与全部 validate 完成后才替换 states/revision/eventSequence/receipts；catch 不提交。实际验收还应覆盖后一个 wallet/inventory/规则调用失败时撤销先前写入，商人现金不足、商品不足、买卖双方容量失败、满容器成品领取与退款失败，以及存档/换规则。这里是职责与必要案例，**没有运行这些 v0.9 未实现测试，也没有声称已通过**。

## 许可与分发边界

实际核查 [FLARE COPYING](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/COPYING) GPL v3 正文及上述源文件头：GPL-3.0-or-later。[Widelands README](https://github.com/widelands/widelands/blob/29753773d9c130e2a6a835ee6a14ad2bf317371d/README.md#L14-L16) 写 GPL v2+、素材各自授权；production_program.cc 文件头也为 GPL-2.0-or-later。缓存保留原版权/许可声明。这里只记录来源和行为研究，不把“独立 TS 适配”写成已获得重许可；今后如复制/翻译具体受保护表达，须重新评估适用许可与分发义务。
