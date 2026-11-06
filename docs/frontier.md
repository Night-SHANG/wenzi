# 探索与生产：模块作者和游玩指南

代码版本：0.5.0-alpha.1。此世界把地点、采集、配方和制作组合到已有库存、时间、交易与存档上。它是一条可以重复的文字玩法流程；数值用于验证与体验，尚未经过正式平衡。

## 直接运行

从源码使用时先 `npm ci`、`npm run build`。需要 Node.js 24.12.0 或更新版本。

```bash
node dist/cli/index.js demo frontier
node dist/cli/index.js play frontier
```

`demo` 自动执行一次完整循环并打印结果；`play` 接收下面的交互命令。界面会列出当前道路、采集点、配方、工坊进度和库存。地图数据定义哪些道路可走，不能从林地直接走到没有相连道路的采石场。

```text
do location move {"to":"forest"}
do gathering gather {"site":"wood"}
do location move {"to":"town"}
do location move {"to":"quarry"}
do gathering gather {"site":"stone"}
do location move {"to":"town"}
do location move {"to":"river"}
do gathering gather {"site":"reed"}
do location move {"to":"town"}
do workshop start {"recipe":"plank"}
do clock advance {"steps":2}
do workshop collect {}
do workshop start {"recipe":"toolkit"}
do clock advance {"steps":3}
do workshop collect {}
do market sell {"item":"toolkit","quantity":1}
save frontier.save.json
```

完成后金币为 **18**，余下木料 1、石料 1、芦苇 2，没有未领取订单，模拟时间为 **50 秒**。回到林地可以再次采集，开始下一轮。移动和采集不自动推进时间；时间通过当前时钟模块的 `advance` 显式推进。退出不会自动保存，使用 `load frontier.save.json` 恢复。

### 不用等到完成才能保存或换规则

开工后推进一步，保存再恢复，剩余时间仍为 10 秒。也可以在交互中：

```text
swap frontier-continuous
do clock advance {"seconds":10}
do workshop collect {}
```

两个世界配置使用同一 world ID 和模块实例 ID，所以能在保留进度时更换时钟。原来的阶段时钟使用 `steps`，连续时钟使用 `seconds`；制作和采集只读取两者共同的累计模拟秒数，不假定推进命令相同。所谓连续时间仍是显式模拟秒数，未连接真实帧循环。

## 每一部分都能独立扩展

| 定义 | 能力 | 自己负责的状态与数据 |
| --- | --- | --- |
| location.nodes | location | 节点、道路与描述；当前位置、已访问地点 |
| gathering.rules | gather-rule | 可替换的采集物品、数量与冷却规则；无游戏进度 |
| gathering.cooldown | gathering | 地点与规则的绑定；已开始的采集冷却 |
| recipes.catalog | recipes | 可替换的配方、投入、产出、时长；无订单 |
| crafting.single | crafting | 一个进行中或待领取的订单 |
| view.frontier.text | text-view | 独立文字呈现与操作提示；无游戏状态 |

这些模块和已有库存、容量、时钟、交易都通过普通公开能力装配。宿主和命令行没有新增“探索游戏”类型分支。测试也会移除文字视图，继续运行相同资源循环；位置模块可单独使用，制作模块在不设置地点限制时无需位置系统。以上是本轮实现样例，扩展类型没有白名单。

采集规则与采集进度分开，配方与制作进度分开。作者可以提供新的兼容规则模块，让同一状态模块消费不同算法；也可以把单订单制作替换成其他并行策略。能力名相同不等于语义相同，仍需匹配版本、数据形状、时间单位与状态迁移。

## 作者使用的操作契约

| 能力 | 命令 | 查询 |
| --- | --- | --- |
| location | move({to}) | current({})、describe({location}) |
| gather-rule | 无 | get({rule})、list({}) |
| gathering | gather({site}) | sites({}) |
| recipes | 无 | get({recipe})、list({}) |
| crafting | start({recipe,batches?})、collect({})、cancel({}) | status({}) |

`batches` 默认 1，必须为正安全整数。数量按批次相乘，时间也按批次相乘；例如两批木板消耗木料 4，40 秒后产出木板 4。计算超出安全范围时拒绝，不能通过巨大批量绕过材料或时间限制。

地点配置使用有向出口数组。采集站点配置只绑定 `location` 与 `rule`，产物和冷却来自独立 `gather-rule` 提供者。配方的输入、输出都是物品 ID 到正整数数量的映射；当前不支持替代材料求解或零成本配方。

`crafting.single` 配置包含 `container`，可选 `locations`。不设置或设置为空表示不限制地点；非空时开工与领取必须在这些地点，取消可以在任意地点进行。本示范世界只允许在 town 开工和领取。

### 修改已经在运行的世界

开工时会把已乘以批次数的投入、产出、开始和完成时间保存在订单里。修改或删除配方不会追溯改变已经支付的订单。正在冷却的资源点同样保存原来的结束时间，规则修改影响下一次成功采集。

如果修改会使已有地点、冷却、容器或冻结物品失去有效引用，重装或恢复会拒绝，旧世界保留。新定义当前为 1.0.0、stateVersion 1；后续代码身份或状态格式变化仍需明确迁移，不能自动猜测历史。

世界创作沿用已有命令：

```bash
node dist/cli/index.js describe crafting.single
node dist/cli/index.js fork frontier --id author.my-frontier --out my-frontier.json
node dist/cli/index.js validate my-frontier.json --run-demo --json
node dist/cli/index.js play my-frontier.json
```

修改用普通 JSON 或已有 `patch` 命令完成。示范动作也属于作者数据：若改变配方耗时或材料，须同时调整示范动作，否则 `--run-demo` 会准确指出失败，而非偷偷补齐资源。详见 [作者指南](authoring.md)。

## 失败与恢复规则

- 未到采集点、资源尚未恢复或库存放不下时，采集整体失败；物品、冷却、事件与版本号不部分提交。
- 不能同时开启两个订单；材料不足时不会留下扣了一半材料的状态。
- 时间未到不能领取。成品不自动入库，背包满时可以先处理物品再领取，订单不会丢失，时间仍可继续推进。
- 领取多个产物或取消退还多种材料时，任何一项失败都会撤销之前的写入。退款放不下时订单保留。
- 查询与文字呈现不会自动采集、收货或推进时间。
- 只读取绑定时钟，其他时间域的推进不影响订单和冷却。损坏、倒退、溢出或精度无法表示的时间会明确拒绝。

仍只运行可信本地模块；世界 JSON 不自动下载或执行外部脚本。当前不是服务器权限或反作弊系统。

## 成熟来源与实际复用

本轮实际复用的是本项目已有的宿主事务、库存/容量、时间、市场、校验、存档和创作工具。地点沿用现有叙事模块验证节点 ID 与出口引用的模式。没有建立第二套背包、时钟、金币或存档框架。

生产规则参考 Widelands 固定提交 `29753773d9c130e2a6a835ee6a14ad2bf317371d`：

- [面包房配方](https://github.com/widelands/widelands/blob/29753773d9c130e2a6a835ee6a14ad2bf317371d/data/tribes/buildings/productionsites/empire/bakery/init.lua)：条件、消耗、等待与产出分开声明。输入缓冲容量与单次消耗数量是不同概念。
- [生产动作实现](https://github.com/widelands/widelands/blob/29753773d9c130e2a6a835ee6a14ad2bf317371d/src/logic/map_objects/tribes/production_program.cc)：先核全部消耗需求，不足时不扣除材料，再提交实际消耗。它依赖原游戏的生产场所、输入队列、工人和物流，不能作为独立 TypeScript 库直接嵌入。
- [来源许可说明](https://github.com/widelands/widelands/blob/29753773d9c130e2a6a835ee6a14ad2bf317371d/README.md)：项目声明 GPL v2+，部分素材另有许可。本轮仅参考职责与失败语义，没有复制或翻译其实现、配方集、数值或素材。

这里的冷却、制作时长和价格由本项目单独配置。没有把来源游戏的缓冲容量当成配方数量，也没有把动画时间误当完整生产周期。来源与实际采用范围继续记录在 [THIRD_PARTY.md](../THIRD_PARTY.md)。

## 仍需继续的内容

这是一条可重复的探索生产流程；还没有完整城镇任务、角色成长、生态模拟、随机事件、战斗关联、实时射击、多人或可视化编辑器。正式图形界面仍需先确认视觉样板。数值与乐趣需要后续真实游玩评价，工程测试不能替代体验判断。
