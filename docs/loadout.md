# 边境行者：装备、技能与状态效果

工程版本0.7.0-alpha.1。这一世界在现有小镇冒险上组合装备、技能与状态效果。宿主没有新玩法分支；十个新增定义与原有库存、时间、经验、生命、遭遇、任务、制作、交易共用公共能力。

## 运行完整路线

首次从源码运行：`npm ci`、`npm run build`。随后：

```bash
node dist/cli/index.js demo loadout
node dist/cli/index.js play loadout
node dist/cli/index.js demo loadout-continuous
```

`demo` 自动执行48个动作；`play` 从初始世界开始。文字视图显示装备槽位、属性来源、效果剩余时间和技能条件，并给出可复制的完整 `do {...}` 命令。`look` 查看状态，`actions` 查看作者动作，`save 文件名` 保存，`load 文件名` 载入，`exit` 退出。

路线依次完成：穿剑甲、换猎刀再换回训练剑；采木料/石料/芦苇、制作工具包、交付补给；接巡林任务，以“破势”加普通攻击完成第一只灰狼，等待冷却后用“破势”一击击败第二只；回镇交任务并恢复；去采石场用“破势→重击→普通攻击”击败袭击者，领取并交任务；恢复、出售战利品，最后推进时间让振奋消失。

这条路线的数值可以独立核算：第一场狼战，基础攻击4、训练剑+2、振奋+2、破势额外+3，打掉11生命，狼剩1。灰狼反击5，基础防御1和皮甲+1使玩家只受3伤；下一次普通攻击结束战斗，不再反击。升级后第二次破势足以一击获胜。

袭击者有24生命、防御1、攻击8。当时基础攻击6、剑+2、振奋+2；破势造成12伤害，重击造成11，最后普通攻击结束战斗。前两次各受到5点反击伤害，26生命降到16；领取奖励、交付任务后升到3级，第二份草药剂将生命恢复到34。

最终：总经验105、等级3、生命34/34、金币16、模拟时间90秒，攻击10、防御4；三颗火花石全部消耗，剑甲仍装备，猎刀在背包，振奋已消失；灰狼完成2次、袭击者1次，三项任务各交付1次。12个基础世界都保留；旧 campaign 的46动作路线及其22/34生命结果不变。

消耗品用完后仍可继续玩：再接一次巡林，使用已解锁且无消耗的重击，每只灰狼一击解决，两次之间推进10秒。交付后总经验145，巡林完成2次、灰狼战绩4次。内容可以继续扩展，示例的有限装备和敌人不限制模块种类。

## 十个新增定义

| 定义 | 提供能力 | 独立职责 |
| --- | --- | --- |
| equipment.catalog | equipment-rule | 装备名称、槽位、属性修改与标签目录 |
| equipment.slots | equipment | 拥有已装备物品，交换/卸下通过库存事务 |
| effects.catalog | effect-rule | 效果名称、持续秒数与修改值 |
| effect-duration.refresh | effect-duration | 刷新截止时间，并保留已有更长剩余时间 |
| effect-duration.extend | effect-duration | 在尚未到期的截止时间后追加持续时间 |
| effects.timed | effects | 冻结活动效果、绝对截止时间和观察到的时间基线 |
| attributes.additive | attributes | 查询时合并基础、装备、效果，提供分解与有效值 |
| skills.catalog | skill-rule | 技能等级、装备标签、消耗、效果、攻击加成与冷却 |
| skills.combat | skills | 校验当前资格，事务调用消耗/效果/战斗，保存冷却 |
| view.loadout.text | text-view | 组合已有视图，展示来源分解与实际绑定操作 |

内置目录共42个定义；每个新装配有29个实例。两个持续时间实现都注册，但世界只选择其中一个。新增模块仍可从世界中移除、替换或组合成其他玩法；删除已有实例须遵守宿主明确的 `allowRemoved` 规则。

## 公开接口

| 能力 | 命令 | 查询 |
| --- | --- | --- |
| equipment-rule | 无 | get({item})、list({})→{items} |
| equipment | equip({item,slot})、unequip({slot}) | status({})→{slots,modifiers,tags}；list({})→{items} |
| effect-rule | 无 | get({effect})、list({})→{effects} |
| effect-duration | 无 | resolve({now,durationSeconds,currentExpiresAt})→{expiresAt} |
| effects | apply({effect})、remove({effect}) | status({})→{now,effects,modifiers} |
| attributes | 无 | status({})→{base,equipment,effects,values} |
| skill-rule | 无 | get({skill})、list({})→{skills} |
| skills | use({skill}) | list({})→{skills}，含known/available/reasons/remainingSeconds |
| encounters 1.1 | 原动作及strike({attackBonus}) | 保留原status/list/describe/records |

完整配置和字段 schema 可通过 `describe 定义ID --json` 获取。声明相同能力名不等于拥有相同语义；替换者需要遵守字段、单位、版本与错误契约。装备标签和槽位名是内容ID，不是宿主枚举。

属性是安全整数，修改值允许为负；所有求和中间结果与最终值都检查安全范围，最终值不得为负。当前 additive 配置 `keys:["attack","defense"]`，只允许修改这两项；基础其他字段仍保留，maxHp 来自原成长规则。这样效果到期不会造成隐藏生命或卡住时钟。需要最大生命增益的世界应配套实现明确的生命上限协调规则，不能只添加一个数值而忽略当前生命状态。

效果秒数和冷却秒数使用累计模拟时间，允许可表示的小数；物品数量、等级和次数仍为整数。正时长溢出或小到无法改变时间戳时明确拒绝。

## 物品归属与失败处理

装备中的一件物品由 equipment 实例持有，背包只保存未装备数量。装备不是指向背包某个计数的指针，所以出售、制作消耗背包物品不会把已经穿戴的物品偷偷删掉。

交换先从背包移除新物品，再把旧物品放回，最后保存新槽位；完整事务仍要满足最终容量约束。满背包可交换同等占用的物品；卸下需要实际放得下，失败则装备和背包都保持原样。查询的 equippable 表示数量和槽位资格，不承诺任意外部容量策略都允许最终交换。

技能每次使用都重新检查已知列表、当前等级、当前装备标签、实际资源、活动战斗和冷却。成功时扣除材料，先施加自身效果，再让同一个遭遇模块结算攻击和反击，最后记录冷却。效果因此影响本次攻击和本次反击。任何步骤拒绝，连同先前已经写入的材料、效果、敌我生命和冷却一起回滚。技能模块不拥有第二份敌人生命或经验。

战斗最后一击不反击，胜利保留待领取状态，背包满仍可之后重试领取，任务使用已领取战绩；这些原有规则保持不变。作者CLI也暴露库存和经验调试命令，当前并未实现服务器权限或反作弊。

## 时间与效果替换

技能和普通攻击不会自动推进模拟时间。`loadout` 的 `clock advance {"steps":1}` 推进10秒；`loadout-continuous` 使用 `clock advance {"seconds":10}`。两个世界保持相同世界/实例身份，活动战斗中也可 `swap loadout-continuous`，保留已有进度。

效果在 `now < expiresAt` 时有效，恰好等于时立即失效。查询只读；绑定时钟推进后的事件会清理过期记录，并保存已观察时间，避免清空效果后换到过去时钟。其他时钟发来的同名事件不会改变它。

每个效果ID最多一份，不叠加强度。重新施加采用当前目录的名称和修改值，并由独立时长策略计算新截止时间。持续20秒的效果在0秒施加、10秒再次施加：refresh 得到30秒截止，extend 得到40秒。替换策略时不改写已有截止时间；只有下次施加才采用新策略。

## 冻结条款、存档与兼容

已装备条款、已施加效果的参数和截止时间、已经开始的技能冷却都保存实际生效事实。目录修改不会重新解释它们。删除装备目录项后，仍可卸下已有装备；库存必须仍认识这个物品。删除效果目录项后，已有效果继续到期；当前技能若仍引用被删效果则会因悬空引用拒绝装配。删除技能条目不会删除旧冷却，但该技能不能继续施展。

当前目录也独立检查引用、get/list一致性、唯一ID和数值，不因为已有冻结状态而跳过坏配置。外部能力坏返回、倒退时钟、不兼容状态都会明确失败，保留原世界。

`encounters.duel` 与 `view.campaign.text` 升到1.1.0，并准确接受各自1.0.0/stateVersion1状态；战斗保留原内容，视图只接受原空对象。两种时长策略只互相接受1.0.0/stateVersion1空对象。没有把未知历史清空或猜测为默认值的通用迁移。

## 作者扩展与验证范围

```bash
node dist/cli/index.js fork loadout --id author.my-adventure --out my-world.json
node dist/cli/index.js describe skills.catalog --json
node dist/cli/index.js validate my-world.json --run-demo --json
node dist/cli/index.js play my-world.json
```

可分别改装备目录、槽位、允许修改的属性、技能资格和资源消耗，或替换效果时长/伤害公式。通用JSON提示支持空格、引号和Unicode实例ID。去掉三个文字视图后，整个规则流程仍可执行；换界面不需要重写战斗状态。

本批实现单角色、单对手决斗中的自身增益与攻击技能。队伍、多目标、持续伤害、效果叠层、最大生命增益、装备容量贡献、复杂技能树和实时输入仍须相应的模块契约与内容，不以当前样例冒充完成。正式视觉UI、联机与大规模性能验证也不在本批交付范围。数值为演示配置，尚未完成长期平衡试玩。

固定来源和适配差异见 [THIRD_PARTY.md](../THIRD_PARTY.md)；实际验证结果见 [loadout-progress.md](loadout-progress.md)，具体设计与决策见 [设计](superpowers/specs/2026-11-07-loadout-design.md)和[执行记录](tasks/loadout-decisions.md)。
