# v0.9 城镇经营与可替换交易规则

记录：2026-11-07，北京时间（UTC+08）。基线 `cb414feef8ede9f7486e1be68cc90c1160cd2134`。用户已要求连续成批并行开发，省去重复方案/执行确认；以下具体切分为本批工程裁定，非声称用户逐项指定。所有现有与未来内容、规则、状态、表现与操作均可模块化。

## 目标、复用与选择

把真实有限的商人库存、资金、定价和营业时间接入现有种植、工坊、库存、地点和任务，交付没有生命/战斗/经验模块的纯经营世界。完整闭环为买种→种植→收获→卖回一份作物→商店工坊制种补货；剩余两份作物由玩家工坊制成餐食交重复订单。不是按开门或时间跳跃免费刷新钱货。

选择：独立账户与有限商店能力，直接复用多个 crafting.single 和 inventory 多容器。未选：扩大 market.fixed 私有币并假装可无损换账本（破坏旧状态单位）；新写自动生产调度（已有制作够用，且会带来步长依赖和历史时间库存问题）；搬整套FLARE商店（实际来源没有有限现金及本项目跨模块回滚）。成熟源码的针对性研究见 artifacts/economy-source-research-v09.md；新增模块为独立TS适配，库存/制作/种植和事务直接复用已有实现。

不改 src/engine、src/contracts.ts、已有固定依赖或旧14世界初始数据。所有新定义 version1.0.0/stateVersion1。货币为非负安全整数的最小单位 coins；商品数量同样安全整数。ID为1–128 Unicode码点，使用own-key访问；查询纯读。异常返回、容量、金额溢出和晚失败回滚完整快照。公开schema拒绝未知字段。代码模块为可信本地装载，钱包credit/debit是作者能力而非服务器授权模型。

## Task1：账户、商店目录和定价策略

文件 wallet.ts、shop-rules.ts、trade-price.ts，测试 economy-rules.test.ts。导出 walletModule、shopRulesModule、priceFixedModule、priceStockModule。

### wallet.accounts / wallet@1

配置 `{accounts: Record<ID,{name:string,coins:Count}>}`，状态 `{balances:Record<ID,Count>}`，初始从配置复制；配置与状态账户集合严格相同。改变配置初始金额不重置已有余额。没有追加账户/旧market迁移的隐式语义。

- balance({account}) → `{account,coins}`；list({}) → `{accounts:[{id,name,coins}]}`。
- credit/debit({account,amount:PositiveCount}) → balance；debit不足拒绝，credit溢出拒绝。
- transfer({from,to,amount}) → `{from:{account,coins},to:{account,coins},transferred:amount}`。拒绝相同账户；同时计算后写入，资金守恒；不发额外事件。
- 导出 WalletBalance、readWalletBalance(ctx,value,expectedAccount) 校验精确账户和coins（不把未经校验的外部值cast成有效数据）。

### shops.catalog / shop-rule@1

配置 `{shops:Record<ID,{name,location:ID|null,container:ID,account:ID,offers:Record<ItemID,Offer>}>}`。Offer=`{buy:PositiveCount|null,sell:PositiveCount|null,targetStock:PositiveCount}`，至少支持一个方向；buy意为玩家向商店购买，sell意为玩家向商店出售。报价基数不由目录推断平衡，不强制buy>=sell。每店至少一个offer。

- get({shop}) → `{id,...definition}`；list({}) → `{shops:[...]}`；状态{}。
- 导出 OfferDefinition、ShopDefinition、offerSchema、readOffer(ctx,value)、readShop(ctx,value,expectedId?)。精确校验所有消费字段；不能接受隐藏get-only/重复目录身份（目录与get一致由消费者检查）。目录只存条款，无库存和资金。

### trade-price.fixed / trade-price.stock / trade-price@1

配置/状态均{}；query quote({item,side:'buy'|'sell',quantity:PositiveCount,stock:Count,offer:Offer}) → `{item,side,quantity,total:PositiveCount}`。返回回显参数；不支持的方向拒绝。准确空1.0.0/state1的两策略可相互迁移，其余历史拒绝。

fixed：total=base×quantity。stock：库存紧张的每个单位价格为2×base，其他单位为base，批量跨门槛按各单位档位求和，禁止按数量逐个循环。buy的普通单位数=min(quantity,max(stock-targetStock,0))，其余紧张；sell的紧张单位数=min(quantity,max(targetStock-stock,0))，其余普通。因此买看移除前库存，卖看加入后库存，往返对应同一档位。total=base×(quantity+紧张单位数)。用BigInt或等价精确运算避免中间舍入/溢出，输出仍是安全整数JSON。允许给库存不足的buy估价，由commerce标记不可执行；不得虚拟扣库存。例：base buy3/sell1、target2、stock4买3→12；stock1卖3→4。

## Task2：有限商店交易

文件 commerce.ts，测试 commerce.test.ts。导出 commerceModule，定义 commerce.shop / commerce@1。

配置 `{shop:ID,customerContainer:ID,customerAccount:ID}`；状态 `{trades:Count}` 初始0，只记录成功交易命令次数，所有钱货仍在wallet/inventory。requires inventory,wallet,shop-rule,trade-price,availability 均^1，location可选。玩家与商店容器、账户均必须不同；不同商店实例可显式共享同一仓库/账户。location非null才要求location并核验describe。

实际调用：inventory.list/count/transfer沿现有接口；wallet.balance/transfer按Task1；shop-rule.list/get一致；availability.status按Task3；trade-price.quote按Task1（回显及总价必须精确合法）。每个当前offer在双方容器中都必须存在物品定义；两账户存在。目录list/get全部行核对身份与条款一致，但只校验当前店的库存/钱包/地点引用，允许共享目录跨独立资源域；当前店删除或坏引用不可用；本模块没有未完成报价订单或冻结钱货。

- quote({side,item,quantity}) → `{shop,item,side,quantity,total,stock,owned,customerCoins,merchantCoins,open,available,reasons:string[]}`。stock为商店当前数量，owned为玩家数量。unknown item/unsupported direction/坏提供者拒绝；正常闭店、地点不符、库存不足、付款方余额不足返回available=false，reasons依次为 CLOSED、WRONG_LOCATION、INSUFFICIENT_STOCK、INSUFFICIENT_FUNDS 中适用项。available仅指这些前置条件；最终容量/计数/返回一致性仍由实际事务验证。报价不保留、不锁定；成交重新读取当前条款与状态。
- buy/sell({item,quantity}) 在不可执行时fail('TRADE_UNAVAILABLE',reasons文本)，成功时先wallet.transfer付款，再inventory.transfer交货，检查两个返回及双方前后余额/物品数量；晚容量错误、假返回、不写入均整体回滚。成功trades+1、emit commerce.traded `{shop,item,side,quantity,total}`，返回 `{shop,item,side,quantity,total,stock,owned,customerCoins,merchantCoins,trades}`（这些为成交后值）。禁止吞掉嵌套失败。
- status({}) → `{shop,name,location,container,account,customerContainer,customerAccount,trades,customerCoins,merchantCoins,availability,offers:[{item,stock,owned,buy:Quote|null,sell:Quote|null}]}`。每边quote为数量1，禁用方向null；不持有另一份资金/物品。
- 需要格式/当前引用检查和安全整数边界，不能在validate阶段以普通资金不足/闭店拒绝整个世界。不增加时钟事件或免费补货。

## Task3：周期日历与营业策略

文件 calendar.ts、availability.ts，测试 calendar.test.ts。导出 calendarModule、availabilityAlwaysModule、availabilityScheduleModule；公共 CalendarStatus/readCalendar(ctx,value) 和 AvailabilityStatus/readAvailability(ctx,value) 供消费者复用。

### calendar.cyclic / calendar@1

requires time@^1。配置 `{secondsPerDay:PositiveCount,daysPerWeek:PositiveCount}`，要求乘积≤MAX_SAFE_INTEGER；状态{}。now({}) → `{elapsedSeconds,dayIndex,dayOfWeek,secondOfDay,secondsPerDay,daysPerWeek}`，dayIndex=floor(elapsedSeconds/secondsPerDay)，dayOfWeek=dayIndex%daysPerWeek，secondOfDay=elapsedSeconds%secondsPerDay。累计秒允许有限非负小数（沿旧time语义），各索引安全整数；readCalendar验证字段关系与范围。日历纯投影，不另存或推进时间，不宣称独立记录所有历史倒退。

### availability.always / availability.schedule / availability@1

always配置/状态{}，不要求calendar；status({}) → `{open:true,opensInSeconds:0,closesInSeconds:null}`。

schedule requires calendar@^1；配置 `{days:number[],windows:[{start:number,end:number}]}`，days为唯一非负安全整数，处于[0,daysPerWeek)，1–128项；windows为1–128项，有限非负模拟秒，0≤start<end≤secondsPerDay，允许配置无序但拒绝重叠；相邻窗按连续区间计算。窗口 `[start,end)`，跨午夜由作者拆分两段。状态{}。status返回同上三字段：open时opens=0，closes为距离真正闭店的正秒数；全周期一直开放closes=null。closed时opens为到下次开门的正秒数，closes=null。周末与跨周期首尾相邻窗口要合并连续营业语义；复杂度按配置窗口数而非经过的秒数/天数增长。

readAvailability检查open为boolean；open⇒opens0、closes正数或null；closed⇒opens正数、closesnull。两策略仅接受对方/本定义准确1.0.0/state1空状态迁移，不接受未知身份或非空状态。变更营业表影响下次新交易，不改变已支付crafting订单；关门不暂停时间、种植、领取或退款。日历参数变化属于作者显式改世界时间解释，不隐式冻结旧营业计划。

## Task4：纯经营组合、兼容消费者和交付

Root：修改quests.ts，新增 settlement-view.ts、workshop-view.ts、text-view-data.ts小型共享读取辅助、settlement.ts聚合，以及settlement-world/consumers/views测试；注册catalog；worlds/settlement.json与settlement-continuous.json；更新编译smoke、版本0.9.0-alpha.1、README/作者指南/来源与追踪记录。旧party测试仅随当前定义版本和全局目录数量更新期望。世界JSON、组合测试与CLI smoke由独立lane写入，Root保持统一集成和提交。

quests.journal → definition1.2.0（capability quests仍1.0.0，state1）；progression变optional。绑定了就继续验证status；任一当前目录或已接取冻结条款experience>0时必须有有效progression。无经验任务允许无成长模块，turnIn既有付款/奖励/经验事务保留。准确迁移本定义1.0.0或1.1.0/state1，未知历史拒绝。当前目录编辑成0不能掩盖已接取非0承诺。

新增view.settlement.text（settlementViewModule）无状态，配置 `{title,container,account,plot,crop}`，requires inventory,wallet,time,calendar,planting,commerce,quests,location；显示地点出口、日历/营业/双方钱货/交易报价、可执行买卖/种植收获/订单提示。真实binding，不读任何私有状态。库存、日历、报价、任务等消费字段需验证；不可执行报价显示原因，不把capacity前置可行性当保证。种植配置为便携种植箱，沿planting基本能力，无隐含地块地点限制。

新增view.workshop.text（workshopViewModule）无状态，配置 `{title}`，requires text-view,crafting,recipes；组合前级视图、公开配方和当前制作状态，生成真实绑定的start/collect/cancel提示；每个实例绑定一座工坊，两个包装可串联，禁止按固定ID读别的实例。现有crafting承接实际地点/材料/容量验证，视图提示不伪称绕过它。

新定义合计10（账户1、商店目录1、价格2、交易1、日历1、营业2、视图2），累计63定义；两个新world使总数16。新装配预计21实例，实际数量用注册/JSON检查确认，不盲填。旧14世界与结果不改。

## 编码前闭环推演

初始玩家2币、商人4币，总6；玩家空包，商店seed1/turnip0；作物20秒、产量3；固定买种2、卖作物2。商店recipe turnip1→seed1需10秒，玩家recipe turnip2→meal1需10秒。重复订单交meal1得voucher1，experience0，无progression/vitals/battle。day60秒、week3天、days[0,1]营业[10,50)；step每步10秒。

第一轮：t0接单；t10开门买种（钱0/6，商店seed0）→去河岸种植→t30收获3→回市场卖1（钱2/4，商店turnip1，玩家turnip2）→两工坊分别消费自己的库存，订单均ready40→t40分别领取种子/餐食→交付餐食得voucher1。第二轮t40再次买种/种植，t60收获回市，此刻闭店；t70开门卖作物并启动两工坊，t80领取交付，voucher2，所有生产资源和双方钱恢复初始。t150为休息日dayIndex2/second30，下一开门t190；再推进到190，余额仍2/4、商店seed1/turnip0、玩家voucher2、trades4、任务completed2、两订单空、无地块。供下一轮继续循环，没有credit/add/gain调试注入。

失败/长期推演：无货无钱、闭店、错误地点、满背包/商店满仓、产物领取/取消满仓均保留原快照或已付订单；打开容量后重试只结算一次。活动种植+双工坊+任务/钱包/货架保存后换钟，结果一致。多时钟绑定只响应各自来源；日历相同累计秒下按不同步数推进结果相同。换价格策略影响后续报价/成交；改配方不改已付订单；只关营业不冻结订单。旧market私有小数coins和旧inventory新增容器不自动迁入新经济世界，明确采用新world身份，避免重复资金/丢库存。

## 验证与交付边界

各owner只跑focused并记录真实RED/GREEN，不跑全局门禁；Root负责完整Preflight/build/compiled smoke。测试真实钱货守恒、晚失败全回滚、畸形提供者、特殊Unicode身份、严格迁移、两个商店/工坊隔离、无视图继续和作者patch实际结果。编译smoke保留原28组，加入两个world与作者/活动存档/任意ID三组，预计33组，以实际执行为准。

最终fresh独立审查后封存源码，打包并独立验证解压运行、完整条目/哈希、双指纹、Git bundle与全部tracked源码。以expected cb414fe、force=false按既有授权更新main；立即报告，不轮询新CI。Notion专题13与母页/04/索引/旧12同步。外部交付哈希和映射留在包外实际记录，保留源分支，不创建Release。正式视觉、自动NPC/离线生产、多人与容量验收不属于本批实现声明。
