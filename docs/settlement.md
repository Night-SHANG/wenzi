# 河岸城镇 v0.9

这是可单独运行的纯经营装配。21个实例由63个内置定义中选择组成；世界没有经验、角色生命或战斗模块。两个工坊复用同一个 `crafting.single` 定义，分别绑定商店与玩家的库存和配方。准确公开接口见 [设计契约](superpowers/specs/2026-11-07-settlement-design.md)，实际验证见 [进度](settlement-progress.md)。

## 开始游玩

```bash
node dist/cli/index.js demo settlement
node dist/cli/index.js play settlement
node dist/cli/index.js demo settlement-continuous
```

`demo` 实际执行包里的32个命令并显示结果；`play` 从初始配置开始。默认每次 `clock advance {"steps":1}` 推进10秒，每天60秒，每周3天。周内前两天在日内 `[10,50)` 秒营业，第三天休息。动作本身不自动消耗时间。

初始你有2币，商店有4币和1份种子。固定买种价格2币，商店收购芜菁价格2币。种下1份种子，等待20秒后收获3份芜菁：卖回1份供商店制种，剩余2份供你的厨房制作餐食。制种和做饭分别需要10秒，交1份餐食得到1份凭证；凭证是任务规则产生的奖励物品，不是新增货币。

首轮可以逐行输入：

```text
do quests accept {"quest":"delivery"}
do clock advance {"steps":1}
do shop buy {"item":"seed","quantity":1}
do location move {"to":"river"}
do crops plant {"plot":"box","crop":"turnip"}
do clock advance {"steps":2}
do crops harvest {"plot":"box"}
do location move {"to":"market"}
do shop sell {"item":"turnip","quantity":1}
do seedworks start {"recipe":"press"}
do kitchen start {"recipe":"cook"}
do clock advance {"steps":1}
do seedworks collect {}
do kitchen collect {}
do quests turnIn {"quest":"delivery"}
save riverside.save.json
```

种植箱是便携容器，基础种植能力没有隐含地点限制。集市是交易、工坊开始/领取和订单接取/交付地点；取消制作可在别处尝试，仍需库存容得下退料。商店关门只影响买卖，工坊与作物继续按模拟时间发展。

## 编码前手算与实际验收终点

| 检查点 | 模拟秒 | 玩家/商店币 | 资源结果 |
| --- | ---: | --- | --- |
| 初始，先接订单 | 0 | 2 / 4 | 商店种子1，玩家空包；距开门10秒 |
| 买种并种下 | 10 | 0 / 6 | 商店种子0，种植箱活动 |
| 收获、卖1份芜菁、两工坊开工 | 30 | 2 / 4 | 玩家投入芜菁2做饭，商店投入芜菁1制种；两个订单完成于40 |
| 两边领取并交餐食 | 40 | 2 / 4 | 商店种子1，玩家凭证1；生产资源恢复初始 |
| 第二次收获回市 | 60 | 0 / 6 | 日内0秒，商店闭店；再等10秒才能卖作物 |
| 再卖作物、双工坊制作领取、交单 | 80 | 2 / 4 | 商店种子1，玩家凭证2；成交4次、订单完成2次 |
| 休息日 | 150 | 2 / 4 | 闭店，距下次开门40秒；钱货不变 |
| 新一周开门 | 190 | 2 / 4 | 两工坊空闲，无活动地块/订单，供下一轮继续 |

总货币始终6。作物与产物经过声明的生产/消费关系变化，不能把不同物品的数量简单相加当作守恒量。商店库存来自真实容器，钱包来自真实账户，开门不会补货。世界演示不用 `inventory.add`、`wallet.credit` 或经验调试命令。

## 哪些部分可以独立更换

| 模块定义 | 公开能力与状态归属 |
| --- | --- |
| `wallet.accounts` | `wallet`：多个账户的余额、转账、作者增减款；商店不保存第二份coins |
| `shops.catalog` | `shop-rule`：地点、容器、账户、报价基数和目标库存；不保存货架进度 |
| `trade-price.fixed` / `trade-price.stock` | `trade-price`：纯报价策略；相同空状态可准确迁移 |
| `commerce.shop` | `commerce`：当前报价与原子买卖，只保存成功成交次数 |
| `calendar.cyclic` | `calendar`：绑定时钟的天数、周内位置和日内秒数投影，不另存时间 |
| `availability.always` / `availability.schedule` | `availability`：常开或按日/窗口开放，空状态策略可替换 |
| `view.settlement.text` | `text-view`：公开查询的组合表现，显示真实交易与种植/订单提示 |
| `view.workshop.text` | `text-view`：一个实例组合一座工坊，可串联更多实例；不推进制作 |

库存、容量、时钟、生长、种植、地点、配方、制作和任务全部直接复用已有定义。三层视图的链是 `seedworks-view → kitchen-view → settlement-view`；工坊各自显式绑定 `crafting` 与 `recipes`。删除视图只影响显示，公开命令仍可继续经营。

库存分档价以每单位对应的库存档位计费：买入时库存高于 `targetStock` 的单位按基价，其余按两倍；卖入时填补目标库存缺口的单位按两倍，其余按基价。一次批量跨门槛按各档单位求总价，使用常数次BigInt运算，不按数量逐个循环。它是独立本地规则，不声称来自FLARE现成库存价格算法。

营业窗口采用左闭右开：开门时刻允许交易，闭店时刻拒绝。允许无序输入和相邻窗口，相邻时间段连续营业；重叠/重复日期/超出一天的窗口拒绝。跨午夜用两段明确配置，跨周首尾相邻也按连续开放处理。每周全时开放时，`closesInSeconds` 为null。

## 报价、容量与失败

`shop quote {"side":"buy","item":"seed","quantity":1}` 是纯查询：返回真实库存、双方余额、总价和拒绝原因。普通原因依序为闭店、地点不符、货不足、付款方钱不足；未知商品、不支持的方向或畸形提供者则是错误。`available` 只表示这些前置条件满足，实际交货还要检查容量、溢出和提供者返回是否真实。

成交重新报价，先转账再交货，并读回核验双方钱货。背包或商店满仓、只写一边的提供者、谎报返回或后续验证失败，宿主撤销全部状态、事件、版本号与命令回执。腾出容量后再试只结算一次。工坊领取/退料失败仍保留已经支付的订单，时间流逝也不会丢掉产物。

`actions` 是作者工具，含直接增减物品/资金等能力。当前是可信本地模块平台，公开作者命令不是网络玩家权限模型。

## 保存、改装与作者补丁

在种植或两个工坊制作中都可保存。`load riverside.save.json` 恢复；`swap settlement-continuous` 把同一 `world.settlement` 改用连续时钟，累计秒、钱货、作物基线、已支付订单和任务继续保留。之后用 `do clock advance {"seconds":10}`。CLI退出不自动保存。

已开工的配方投入、产出和完成时刻已经冻结；更改或删除当前配方不重新解释它，但当前新目录仍需自身有效。变更营业表只决定新交易，不暂停、免费完成或退款生产。改变钱包配置的初始钱数也不会覆盖既有余额。

```bash
node dist/cli/index.js fork settlement --id author.my-town --out my-town.json
node dist/cli/index.js patch my-town.json --patch examples/settlement-authoring.patch.json --out cheaper-seed-town.json --run-demo
node dist/cli/index.js play cheaper-seed-town.json
```

示例补丁先核对目录实例ID，再把买种价2改为1；两轮后玩家4币、商店2币，总货币仍6，凭证仍2。优惠改变资金分布，不能据两轮成功推断无限轮都可交易：商人最终可能没有足够钱收货。作者可以继续独立改价格、配方、目标库存、营业日历、任务和资金来源规则。

`quests.journal` 定义版本升级到1.2.0，能力仍为1.0.0；零经验任务不再强制接入成长系统，任何当前或已接取冻结的正经验承诺仍要求真实progression。准确1.0/1.1存档保留接取条款与完成记录，未知历史拒绝猜测迁移。

旧 `market.fixed` 的私有小数coins与新整数账户没有自动转换；旧库存增加容器也没有自动补造历史。新经营世界使用独立身份，不能通过一次swap把其他世界的钱货默默重置。应保留原世界或编写明确的作者迁移器。

本版没有自动NPC生产、离线补算、真实帧时钟、网络多人、正式图形UI或长期平衡验收。新系统仍按同一公开模块契约扩展，不受当前示例种类限制。
