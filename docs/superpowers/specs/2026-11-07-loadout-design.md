# v0.7 装备、技能与状态效果

记录：2026-11-07 11:34 北京时间（UTC+08:00）。基线 main d744c2442b34fd1c789a50e6c7b60cd871642989。

## 目标与取舍

把装备交换、装备资格、临时状态、派生属性和技能冷却接入真实小镇冒险。全部为普通模块，宿主与公共契约不增加玩法分支。新装配复用现有库存、时间、地点、经验、生命、战斗、任务和交易；文字视图继续组合，没有正式图形界面变更。

比较了两种属性接法：兼容 progression 的装饰器可以少改消费者，但混合经验与装备职责；本批选择独立 attributes 能力，encounters 与 campaign 视图增加可选依赖，旧世界继续从 progression 取属性。XP 只有 progression.track 一份；生命只有 vitals.pool 一份；敌人生命与胜负只有 encounters.duel 一份。

本批 attributes.additive 的 config.keys 指定可修改字段，示范为 attack/defense；maxHp 不列入其中，非法修改明确拒绝。生命上限继续由基础成长提供，避免过期生命增益让现有生命池拒绝推进时间。其他字段/生命规则可由别的普通模块契约实现；这不是宿主的固定字段名单。装备容量贡献、持续伤害、叠层强度和任意目标技能也不混入本批契约。

## 全局契约

- 沿用 capacity.ts 的 schema、安全数值与 own 辅助；ID 长度按 Unicode 码点（1–128），宿主保留键规则不变。自有 toString/valueOf 等普通键合法。
- 数量/等级/属性为安全整数；modifier 为带符号安全整数。加法中间结果也不得溢出。最终属性非负，战斗要求 attack > 0。秒数为 [0, MAX_SAFE_INTEGER] 有限数，可以有小数，使用 readSimulationTime；正时长必须让时间戳严格前进。
- 外部能力返回值按被消费字段验证，列表 ID 唯一，get/list 条款一致；当前目录和冻结事实分别校验。查询只读。
- 物品支付、装备交换、效果施加、战斗与技能冷却共享宿主事务，失败完整回滚。可信作者调试动作不是服务器权限或反作弊机制。
- 时间显式推进；攻击/技能不自动推钟。time.step 的 steps 与 continuous 的 seconds 不混用。绑定时钟早于保存的时间基线须明确拒绝。
- 当前目录更改影响下次新操作，已装备条款、已施加效果和已开始冷却保存实际生效事实。未知旧版本不猜测迁移。

## 装备：两个定义（Task 1）

`equipment.catalog`，导出 equipmentRulesModule，提供 equipment-rule@1.0.0；config `{items: Record<itemId, {name, slot, modifiers: Record<key, signedInteger>, tags: string[]}>}`。无状态；get({item}) 返回 `{id,...definition}`；list({}) 返回 `{items:[{id,...definition}]}`。slot 和 tag 都是 ID，tags 唯一。

`equipment.slots`，导出 equipmentModule，提供 equipment@1.0.0；requires equipment-rule/inventory@^1.0.0。config `{container, slots: string[]}`，非空唯一 slots。state `{slots: Record<slot, null | {id,name,slot,modifiers,tags}>}`，与配置槽位集合严格一致。

- equip({item,slot})：验证目录/库存/目标槽位；已经装备同一物品到同一槽位时拒绝。先移除背包中 incoming 1，再返还 outgoing 1，最后记录新冻结条款。满背包也可正确交换；最终容量不够则整个交换回滚。
- unequip({slot})：返还已装备物品1，再清空；背包不足时保留原装备。空槽拒绝。
- status({}) → `{slots:[{slot,item:null|frozen}],modifiers: Record<key,signedInteger>,tags:string[]}`，汇总属性/标签，不缓存派生值。
- list({}) → `{items:[{id,name,slot,modifiers,tags,quantity,equippable}]}`，quantity 为当前背包数量；equippable 表示槽位属于本配置且数量>0且该槽位不是同一物品，不预言外部容量策略一定允许交换。
- 冻结物品可以在目录删除后卸下，但库存仍须认识它；当前目录里的物品也必须被库存认识。可在当前战斗中换装，影响下一击；技能资格重新查询当前标签。

## 效果与属性：五个定义（Task 2）

`effects.catalog`，导出 effectRulesModule，提供 effect-rule；config `{effects: Record<id,{name,durationSeconds,modifiers}>}`，durationSeconds 严格正；get({effect}) 与 list({})→`{effects:[{id,...definition}]}`。

`effect-duration.refresh` / `effect-duration.extend`，分别导出 effectRefreshModule / effectExtendModule，提供 effect-duration。无配置/状态。resolve({now,durationSeconds,currentExpiresAt:null|number}) → `{expiresAt}`。

- refresh 为 max(now+durationSeconds, currentExpiresAt 或0)，保持更长的已有剩余时间。
- extend 为 max(now, currentExpiresAt 或now)+durationSeconds。
- 两者独立可替换；currentExpiresAt 可以是过去时间。拒绝溢出与正时长精度消失；刷新也要验证 now+duration 本身能前进，不能用长旧时长掩盖精度错误。

`effects.timed`，导出 effectsModule，提供 effects；requires effect-rule/effect-duration/time。config `{}`；state `{observedAt:0,active:Record<id,{id,name,modifiers,startedAt,expiresAt}>}`。

- apply({effect})：读取当前目录；同 ID 的现有效果若尚未到期，则交给 duration 策略延长/刷新；重新施加采用当前目录的 name/modifiers，重置 startedAt=now，并保存结果。每 ID 最多一个实例，不叠加强度。
- remove({effect})：删除一个仍有效实例，缺少或已经过期则拒绝。
- status({}) → `{now,effects:[{id,name,modifiers,startedAt,expiresAt,remainingSeconds}],modifiers}`，仅列 now < expiresAt 的实例，等于到期时间即失效；查询不清理写状态。
- 命令与绑定 time.advanced 事件清理已过期实例，更新 observedAt。只处理 event.source===ctx.provider('time')。任何操作/校验以 observedAt 与活动记录的 startedAt 为最早时间，防止换钟倒退。当前目录删除不影响已施加效果到期。
- 状态校验不要求冻结 ID 仍在目录，但要求记录自身数值/ID一致；当前目录始终独立校验。duration 提供者返回错误会使整个施加/技能回滚。

`attributes.additive`，导出 attributesModule，提供 attributes；requires progression，optional equipment/effects；config `{keys:string[]}` 唯一且可为空，state `{}`。

- status({}) → `{base:Record<key,nonnegativeInteger>,equipment:Record<key,signedInteger>,effects:Record<key,signedInteger>,values:Record<key,nonnegativeInteger>}`。
- base 来自 progression.status.values，保留全部基础字段。将装备/效果修改逐字段相加；新字段基础为0。每个 modifier key 必须在 config.keys，否则 INVALID_ATTRIBUTE_MODIFIER。计算安全且最终非负；不保存总值，查询和 validate 都检验组合。
- 可完全没有装备/效果，或只有其中一项。经验记录独立，不能调用 gain 或写基础值。新提供者可替换总和策略，现有消费者只读 values。

## 技能与现有战斗：Task 3

`skills.catalog`，导出 skillRulesModule，提供 skill-rule；config `{skills:Record<id,{name,minLevel,requiredTags:string[],costs:Record<itemId,positiveInteger>,cooldownSeconds,attackBonus,effect:null|string}>}`。minLevel>0；attackBonus 非负安全整数；cooldownSeconds 非负秒；requiredTags 唯一。get({skill})、list({})→`{skills:[{id,...definition}]}`。

`skills.combat`，导出 skillsModule，提供 skills；requires skill-rule, inventory, progression, encounters@^1.1.0,time；optional equipment/effects。config `{container,known:string[]}` 唯一。state `{cooldowns:Record<id,{startedAt,readyAt}>}`。known 是本实现的配置解锁列表，其他学习规则可提供不同 skills 实现。

- use({skill})：必须已知且当前目录存在；检查等级、全部装备标签、冷却与当前 active 战斗。验证所有消耗物品与可选效果；依次扣库存，若有 effect 则先施加到自己，再调用 encounters.strike({attackBonus})，最后保存 cooldown。效果影响本次出招与反击。返回 `{skill,readyAt,battle}`，battle 为本次 strike 返回对象。
- 任何下游拒绝均无消耗/生命/敌人/效果/冷却变化。技能不推进时钟。0秒冷却可立即再次使用；正冷却必须实际前进。已记录 readyAt 不随目录改动改变。
- list({}) → `{skills:[{id,name,minLevel,requiredTags,costs,cooldownSeconds,attackBonus,effect,known,available,remainingSeconds,reasons:string[]}]}`。available 同时考虑已知/等级/标签/资源/冷却/active战斗，reasons 为可显示中文文字；不承诺下游任意外部规则一定成功。合法 known ID 若被当前目录删除，允许旧冷却保存，但 use 明确拒绝。当前目录始终验证物品/效果引用；有 requiredTags/effect 则必须提供对应可选能力。
- 当前库存、等级、标签和效果目录通过公开能力读取。effects.status 不提供目录，因此验证效果引用须额外 optional effect-rule；世界显式绑定；有 effect 必须同时有 effects 与 effect-rule。

`encounters.duel` 版本与 encounters 能力升级1.1.0，stateVersion保持1；增加 optional attributes@^1.0.0。战斗攻击/防御从 attributes.status.values（有绑定时）或 progression.status.values（旧世界）读；经验仍由 progression 读取/授予。新增 strike({attackBonus})，与 attack({}) 共享一个结算函数；只有玩家攻击加 bonus，不影响敌人攻击。参数非负安全整数，总攻击防溢出。所有胜负/终击不反击/待领取/奖励/移动/冷却不变。显式迁移只接受同定义1.0.0/stateVersion1原状态，再由 schema/validate 校验；保留活动/胜利/失败和累计战绩。

## 装配与呈现：Task 4

新增 `loadout` 与 `loadout-continuous`，复用 campaign 的20个实例，加装备目录/装备、效果目录/时长策略/效果、属性、技能目录/技能、新视图，共29个实例。时长策略默认 refresh，另一个普通提供者 extend 可作者替换。提供定义总数42，基础世界配置12个。

`view.campaign.text` 版本1.1.0，新增 optional attributes；显示有效 attack/defense，但等级/经验和生命仍来自原提供者。显式迁移只接受同定义1.0.0/stateVersion1的空状态；其他不兼容状态拒绝。

`view.loadout.text`，导出 loadoutViewModule，提供 text-view，requires text-view/equipment/effects/attributes/skills，config `{title}`，无状态。先组合原 campaign 视图，再显示槽位、背包可装备物、基础/装备/效果分解、效果剩余秒数和技能可用原因。提示由 boundActionCommand 按实际绑定生成。时间说明明确：技能/普通攻击不自动推进模拟时钟。

`src/modules/loadout.ts` 导出 loadoutModules 并由内置目录注册。CLI 不增加技能专属分支，作者发现/复制/补丁/校验继续使用通用流程。

初始演示数据（独立手算，不从实现推导）：在 campaign 原有物品之外加训练剑1（hand，attack+2，tag blade）、猎刀1（hand，attack+1，tag blade）、皮甲1（body，defense+1）、火花石3。振奋效果 duration20，attack+2；破势技能 minLevel1，requiredTags[blade]，costs火花石1，cooldown10，attackBonus3，effect振奋。技能列表另含重击 minLevel2，无消耗、无效果、bonus2、cooldown10。

完整路线保留原采集制作和三项任务：前期装备剑/甲；狼战第一次用破势（有效攻击8+bonus3，对12HP狼造成11，再受3伤），普通攻击结束；等10秒第二次破势一击胜利（等级2有效攻击10+3）；再等10秒使技能就绪，回镇交巡查、恢复、接守卫；袭击者第一击破势（有效攻击10+3-防御2=11），随后普通攻击两次（各8）结束。以原 raider HP/attack 为准，若手算发现当前原配置不符，则在实施前把完整字面路线与预期写入 Task4 测试并记录调整。

正常路径：物品从背包转入装备→效果与装备增加实际战斗数值→技能消费一次资源并击败敌人→领取原有奖励与任务→到期数值还原→保存恢复可继续。失败路径：满背包卸装、缺少标签/等级/材料/冷却、效果策略或战斗拒绝，完整状态不变。长期路径：换装备/规则目录只影响下次新动作，已有冻结装备/效果/冷却保留；更换两种时钟保留累计秒数；保存活动战斗、效果和冷却再恢复后结果一致。

## 来源与验证

实际调查 CDDA 06be12f9884d82d387cb6b38dc549eca71c3835a（装备限制、效果重施/到期）与 FLARE f9a17a266293a897a1d7eae2d54408b0de39af27（装备标签、技能条件、独立冷却、效果汇总）。不是直接复制/翻译代码、素材或数值。FLARE 调用 activate 后设置冷却且忽略失败返回；本工程的失败全回滚是现有宿主提供的独立语义。CDDA 检查后递减回合效果；本工程明确采用绝对模拟秒和到期等号失效。

针对性行为测试覆盖物品守恒、满包交换/卸装回滚、外部能力坏返回、策略替换、技能失败全回滚、有效伤害/反击、等级/标签资格、精确到期、小数秒/溢出/倒退、冻结目录、保存恢复/旧版迁移、Unicode/普通原型同名键、真实作者修改与CLI提示。所有旧世界保留回归。集成完成后实际 Preflight、build、compiled smoke、独立解压/哈希/Git bundle 验证；最后 expected-SHA 非强制发布，不查询新CI。
