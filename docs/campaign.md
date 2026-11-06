# 边境小镇：任务、战斗与成长

工程版本 0.6.0-alpha.1。这个世界把探索生产和任务冒险组合在同一个通用宿主中，展示十个新增模块如何与既有库存、时间、地点、制作和市场配合。它是可继续游玩的示范，不限定模组能够制作的游戏类型。

## 直接开始

需要 Node.js 24.12.0 或更新版本。从仓库开始先 `npm ci`、`npm run build`；已构建工程包可直接运行：

```bash
node dist/cli/index.js demo campaign
node dist/cli/index.js play campaign
```

`demo` 自动执行46个动作，覆盖三项任务、两次灰狼遭遇、一次袭击者遭遇、两次恢复和交易。`play` 从初始状态开始，文字界面按实际绑定给出操作提示；复制整条 `do {...}` 即可执行。输入 `look` 看当前状态，`actions` 看所有作者动作，`save 文件名` 保存，`load 文件名` 恢复，`exit` 退出。

### 完整游玩路线

1. 在镇口接取“镇口补给”。到林地采木料、采石场采石料、河滩采芦苇，再回镇。
2. 制作木板：木料2→木板2，20秒；领取后制作工具包：木板2+石料1+芦苇1→工具包1，30秒。显式推进时钟后领取。
3. 交付工具包，获得草药剂2和经验10。接取“林地巡查”，到林地开始灰狼遭遇。
4. 攻击三次打倒第一只灰狼，再领取狼皮和经验。杀敌的最后一击不会受到反击；胜利不会自动把战利品塞进背包。
5. 推进10秒，开始第二次灰狼遭遇。第一次奖励使角色升到2级，第二次只需两次攻击。领取后回镇交任务，获得徽记和经验。
6. 使用草药剂恢复生命，接取“守住采石场”。去采石场挑战袭击者，攻击五次获胜并领取矿石和经验。
7. 回镇交付任务，再恢复一次，出售狼皮2和矿石2。示范结束时总经验105、等级3、生命22/34、金币16、模拟时间60秒，并持有巡林徽记和守卫勋章。

准确动作序列保存在 `worlds/campaign.json` 的 demo 中。前半段采集制作操作与 [frontier.md](frontier.md) 一致，但这次工具包交给任务，不出售。关键新操作为：

```text
do quests accept {"quest":"supply"}
do quests turnIn {"quest":"supply"}
do quests accept {"quest":"patrol"}
do encounters start {"encounter":"wolf"}
do encounters attack {}
do encounters claim {}
do clock advance {"steps":1}
do recovery use {"remedy":"tonic"}
```

这些是分阶段操作示例，不是可从初始状态直接依次粘贴的完整脚本。地点、材料、胜利或冷却不满足时会说明原因并保留原状态。

镇口补给与林地巡查可以重复接取；新巡查从接取时的战绩开始计算。已有狼皮或历史胜利不会替代新一轮要求。草药剂也可用芦苇2制作，耗时10秒。资源恢复、生产、恢复生命、重复遭遇和任务可继续组成循环。

## 十个独立模块

| 定义 | 能力 | 状态和职责 |
| --- | --- | --- |
| progression.curve | progression-rule | 无进度状态；总经验阈值与属性配置 |
| progression.track | progression | 只保存总经验；等级与属性由绑定曲线推导 |
| vitals.pool | vitals | 当前生命；上限来自成长能力 |
| recovery.items | recovery | 恢复用品规则；通过库存和生命能力执行 |
| encounters.catalog | encounter-rule | 敌人、地点、奖励和冷却内容 |
| combat.difference | combat-rule | 独立伤害公式：max(1,攻击−防御) |
| encounters.duel | encounters | 当前决斗、冻结奖励、冷却和累计已领取胜利 |
| quests.catalog | quest-rule | 任务、前置关系、目标、奖励与交付地点 |
| quests.journal | quests | 已接任务的冻结条款、计数基线、完成次数 |
| view.campaign.text | text-view | 组合基础文字视图，展示任务、战斗和成长 |

内置定义总数32；基础世界配置总数10。世界只通过 JSON 选择并绑定能力，没有新增引擎玩法分支。模块内部需要独立替换的规则继续独立：例如改变升级曲线或伤害算法，无需让库存认识“经验”或“战斗”。

## 接口与单位

| 能力 | 命令 | 查询 |
| --- | --- | --- |
| progression-rule | 无 | resolve({experience}) |
| progression | gain({amount}) | status({}) |
| vitals | damage({amount})、heal({amount}) | status({}) |
| recovery | use({remedy}) | list({}) |
| encounter-rule | 无 | get({encounter})、list({}) |
| combat-rule | 无 | damage({attack,defense}) |
| encounters | start({encounter})、attack({})、claim({})、retreat({}) | status({})、list({})、describe({encounter})、records({}) |
| quest-rule | 无 | get({quest})、list({}) |
| quests | accept({quest})、turnIn({quest})、abandon({quest}) | list({}) |

经验、生命、攻击、防御、物品与完成次数使用安全整数；冷却使用绑定时间能力的累计模拟秒数。攻击、移动和采集不会自行推进时钟。`campaign-continuous` 用 `advance({seconds})`，普通 `campaign` 用 `advance({steps})`，每步10秒。它们共享世界和实例身份，可保留正在进行的战斗、任务和冷却进行替换。

当前角色曲线为总经验0/20/60对应1/2/3级，生命上限20/26/34、攻击4/6/8、防御1/2/3。经验可一次跨越多个等级，保持总量；顶级仍累计经验。升级增加生命上限但不自动恢复当前生命。曲线中的 values 是普通属性映射，其他成长规则可提供不同字段；需要消费某属性的模块必须声明相应语义。

## 胜利、失败与存档

开始战斗会冻结敌人、地点、奖励、冷却与开始时间。此后编辑或删除原遭遇配置不会改写这一场战斗。正在战斗时，绑定地点的移动会被拒绝并回滚；战斗终局允许移动，领取仍须回到冻结地点。

胜利保留待领取状态。背包不足时 claim 失败，但不会撤销胜利；可以出售或转移已有物品后回来领取。多项战利品和经验全部成功后才增加累计胜利、设置冷却并清空战斗。重复领取不会再次发奖。放弃战斗不获得奖励，同样开始冷却。

落败保留终局，可回镇用已有或新制作的药剂恢复，再放弃这场遭遇。恢复生命不会让已结束战斗重新开始。满血时使用恢复品失败，不扣物品。

任务接取时冻结要求和奖励；物品目标读取交付时真实库存，遭遇目标记录接取时的累计胜利基线。达到目标只表示可交付；当前位置也满足才显示“可交付”。交付的扣料、发物品、经验与完成记录共用一个事务，失败全量回滚。目录里删除了任务仍可按已接条款完成或放弃；若旧遭遇被删除导致目标无法继续，可放弃该任务。

当前目录也要独立校验。冻结旧任务或战斗不意味着可以装入未知物品、坏地点、循环前置或异常外部能力。更换不兼容提供者会明确失败并保留原世界；不会用默认值抹掉旧状态。

既有 gathering.cooldown、crafting.single、view.frontier.text 升至1.0.1，明确接受各自1.0.0/stateVersion1的兼容状态迁移。已支付的制作订单和采集冷却保留原数据；迁移后仍经过当前 schema 与业务约束校验，不猜测缺失或异常历史。

## 制作自己的冒险

```bash
node dist/cli/index.js describe quests.journal
node dist/cli/index.js fork campaign --id author.my-campaign --out my-campaign.json
node dist/cli/index.js validate my-campaign.json --run-demo --json
node dist/cli/index.js play my-campaign.json
```

可以编辑任务目录、遭遇奖励、配方和成长曲线；改变示例数值后也要相应检查 demo 是否仍可完成。绑定同名能力时必须保持单位和结果语义。示例采用一名角色的一场决斗与单个制作订单；队伍、网格战斗、技能选择或多人同步应各自提供合适的模块契约与视图。

通用 JSON 命令支持含空格、引号和 Unicode 的实例 ID，128字符上限按 Unicode 码点计算；世界模块仍遵守宿主对 `__proto__`、`prototype`、`constructor` 的保留键限制。正式玩家界面会选择展示玩法动作，当前 `actions` 是作者运行工具，包含直接改物品、经验等调试能力。

## 来源与实际范围

经验资格与溢出职责参考 Wesnoth 固定源码；任务接取基线、当前库存条件和交付职责参考 CDDA 固定源码。源码位置、版本与许可区分见 [THIRD_PARTY.md](../THIRD_PARTY.md)。实现直接复用本项目现有宿主与公共模块，没有移植原游戏的 C++ 全局引擎、素材或成套数值。

本批是本地可信模块的文字运行世界。正式浏览器界面、完整城镇社会/经济、队伍与装备、复杂技能、实时输入、网络与性能容量验证仍待实现。工程检查只证明具体行为和恢复边界，不替代长期乐趣与数值平衡试玩。
