# v0.6 探索、战斗、任务与成长整批设计

记录：2026-11-07 00:54 北京时间（UTC+08:00）。基线 main e3b09d81c5edb1d5cae87f91a02db25be51c0848。用户要求继续持续开发、利用并行代理完成整批可运行功能，不在小步骤之间停下来要求确认。

## 目标与边界

在现有探索生产循环上完成可重复遭遇、战斗、战利品、经验成长、生命恢复、任务链及交付。核心宿主仍只处理通用协议。全部现有和未来系统、规则、数据、内容、表现、界面与操作都遵守模块化；本批样例不限定范围。新能力与既有经营、战棋、叙事配置共存。

保持 TypeScript、Node.js >=24.12.0、现有锁定依赖；不添加运行依赖。单宿主可信模块适用，正式视觉界面、实时键鼠射击、多人及不可信代码沙箱不在本批。这里的确定性单人决斗是新的可替换玩法策略，不暗中修改 tactics.grid 的固定棋盘生命周期。

## 复用依据

直接复用当前 inventory、capacity、location、time、recipes、crafting、market、原子事务、作者工具、保存恢复及内容指纹验证。tactics.grid 目前只有固定棋盘的 move/attack/endTurn，校验依赖固定初始名单，不能由外部模块写其状态变成重复遭遇。

实际核验 Wesnoth 670e500946c82679efada285300caba38857bfc5 的 src/units/unit.hpp 与 CDDA 06be12f9884d82d387cb6b38dc549eca71c3835a 的 src/mission.cpp：吸收经验阈值/溢出、任务接取计数基线、完成判断与交付分开等职责。使用总经验和有限阈值数组适配，经验不因跨级丢失；任务领取的原子性由本项目宿主保证。没有复制这些 C++ 实现、原游戏数据或数值。

## 公开能力

所有新定义 version=1.0.0、apiVersion=1、stateVersion=1，能力版本 1.0.0。所有实例只写自身状态，嵌套调用加入宿主事务；不能用隐藏全局状态或第二套物品/金币账目。计数为非负安全整数，正数操作不能为零；ID 遵守现有 idSchema 并支持特殊对象键。任意外部能力返回都要核验消费字段、身份和数值，不能仅用 TypeScript 类型断言。

### 成长、生命与恢复（四个定义）

- progression.curve 提供 progression-rule；配置 levels:[{experience,values}]，experience 首项为0、以后严格增加，1～1000项，values 为非负安全整数映射。resolve({experience}) 返回 {experience,level,floorExperience,nextExperience,values}；level 从1开始，nextExperience 顶级为null。保存总经验，不循环反复扣阈值。
- progression.track 提供 progression，依赖 progression-rule；配置 {initialExperience}，状态 {experience}。gain({amount}) 增加正安全整数经验；status({}) 返回上述解析结果。超出安全范围或坏规则返回使整个操作失败。更换有效曲线按总经验重新求值。
- vitals.pool 提供 vitals，依赖 progression；配置 {initialHp}，状态 {hp}。status({}) 返回 {hp,maxHp}，maxHp 取 progression.status.values.maxHp，必须正安全整数。damage({amount})、heal({amount}) 返回新 status；伤害与治疗截到0和上限；已经满血时治疗失败、不消耗资源；0生命可治疗。升级增加上限不会自动回血；新曲线把上限降到现有生命以下时拒绝装配。
- recovery.items 提供 recovery，依赖 inventory、vitals 及 optional location；配置 {container,remedies:{id:{name,item,healing,locations}}}。healing 正整数；locations 唯一 ID 数组，空数组不限地点。use({remedy}) 在允许地点消耗物品1个并治疗，同一事务；list({}) 返回 {remedies:[{id,name,item,healing,locations}]}。当前所有恢复物品及非空地点引用必须验证。

### 遭遇与战斗（三个定义）

- encounters.catalog 提供 encounter-rule，配置 {encounters:{id:{name,location,enemy:{maxHp,attack,defense},loot,experience,cooldownSeconds}}}。maxHp/attack 正整数，defense/experience 非负整数；loot 正整数映射可为空；cooldownSeconds 非负安全数值。get({encounter}) 返回 {id,...definition}，list({}) 返回 {encounters:[...]}。
- combat.difference 提供 combat-rule，无状态无配置；damage({attack,defense}) 查询返回 {damage:max(1,attack-defense)}，输入为非负安全整数。伤害规则独立于生命和战利品。
- encounters.duel 提供 encounters，依赖 encounter-rule、combat-rule、location、inventory、progression、vitals、time；配置 {container}。状态 {battle:null|FrozenBattle,cooldowns:{id:{startedAt,readyAt}},wins:{id:count}}。冻结字段为 encounter,name,location,enemyMaxHp,enemyHp,enemyAttack,enemyDefense,loot,experience,cooldownSeconds,startedAt,phase(active|victory|defeat)。
- start({encounter}) 要求无当前战斗、当前地点匹配、角色存活和冷却结束；冻结敌人、奖励与冷却。attack({}) 用当前 progression.values.attack/defense 与独立伤害规则结算一次玩家攻击；敌人存活才反击，伤害扣现有 vitals；终局不可再攻击。攻击与反击同一事务。玩家攻击必须正整数，防御非负。
- 胜利只保留待领取战利品，不立即塞入背包。claim({}) 只在胜利且位于冻结地点时将所有物品与经验发放、增加 wins[encounter]、写入冷却并清空 battle。任一步失败保留完整胜利状态，可以腾出背包后重试。无待领取战斗时重复领取失败。经验0跳过gain。
- retreat({}) 可从任意位置放弃任意阶段，不给奖励、不增加 wins，写入同样冷却并清空 battle。冷却以实际领取/放弃时的累计模拟秒数为起点，正时长无法推进时间或溢出时失败；0冷却允许 readyAt==startedAt。
- active 阶段通过 source-filtered location.moved 事件拒绝移动，移动事务回滚；victory/defeat 可移动。终局 phase 不因后来治疗重新激活；active 要求敌人和玩家存活，victory 要求敌人生命0，defeat 保留敌人且可治疗后放弃。
- status({}) 返回 {battle,phase:idle|active|victory|defeat}；records({}) 返回 {wins}；describe({encounter}) 返回当前目录定义；list({}) 返回 {encounters:[{...definition,available,remainingSeconds}]}。available 同时考虑位置、生命、战斗空闲和冷却。
- 当前目录在每次 validate 中独立验证，冻结战斗不再查旧目录 ID；旧配置有效修改/删除后仍按冻结战斗领取或放弃。冻结地点/物品仍必须存在。冷却记录与 wins 可保留已删除的旧 ID。时间不能倒退到保存的 startedAt 之前。规则查询与显示无副作用。

### 任务（两个定义）

- quests.catalog 提供 quest-rule，配置 {quests:{id:{name,description,prerequisites,delivery,victories,rewards,experience,locations,repeatable}}}。prerequisites/locations 唯一 ID 数组；物品与胜利目标是正整数映射；experience 非负整数；至少一个 delivery 或 victories 目标。前置任务必须存在且无环。get({quest}) 返回 {id,...definition}，list({}) 返回 {quests:[...]}。
- quests.journal 提供 quests，依赖 quest-rule、inventory、progression、optional location、optional encounters；配置 {container}。状态 {active:{id:{definition:FrozenQuest,baselineWins}},completed:{id:count}}。FrozenQuest 包含 id 与全部配置字段。带地点条件需 location，带胜利目标需 encounters。
- accept({quest}) 在允许地点接取；所有前置 completed>0；同任务不能同时重复接取，非重复任务完成后不可再接。保存当前有效定义与每个胜利目标的 encounters.records.wins 基线；目标计数使用领取战利品后累计完成的遭遇，不把接取前胜利算入新任务。
- turnIn({quest}) 对冻结任务重新校验位置、当前交付库存、当前wins与基线差；依次扣除交付物、发放奖励物与经验、记录 completed 次数并移除 active，同一事务。奖励满包、经验溢出或后续物品失败不能丢材料、误完成或重复奖励。物品收集读取当前库存；完成条件达成不自动消耗或发奖。
- abandon({quest}) 只移除 active，不发奖，可在任意位置。当前目录有效修改或删除不改变已接任务；当前目录本身仍独立验证。冻结任务引用的物品/地点须存在；冻结胜利目标只读累计 records，允许旧遭遇已移除，未达标时仍可放弃。累计计数低于接取基线时拒绝，以防错误更换计数提供者。
- list({}) 返回 {quests:[{id,name,description,status,ready,completed,remainingDelivery,remainingVictories,rewards,experience,locations}]}，status 为 available|locked|active|ready|completed。集合包括当前目录、active 和 completed 中的旧 ID；旧完成且已删配置用 ID 作名字、空目标奖励，保留 completed 数。repeatable 已完成且未 active 可再接，不用历史完成次数让新任务自动满足。

### 输入、视图与组合世界

修复 v0.5 三项已知问题：全部外部采集地点字段先验证再筛选；通用 CLI 支持 do 后接完整 Command JSON，保留既有 token 形式；--json 早期参数错误输出结构化 JSON。通用格式化函数为新旧视图生成可执行提示，合法空白/引号 ID 可寻址。frontier 视图补丁版本1.0.1并显式迁移1.0.0的空状态。

view.campaign.text 是第十个新定义，提供 text-view，显式绑定已有 frontier 视图的 text-view 能力，并追加 progression、vitals、recovery、encounters、quests 的只读展示和动态命令。不同实例、内容 ID 由实际绑定和查询取得。移除该视图后玩法照常运行。正式浏览器视觉未引入。

campaign 与 campaign-continuous 共享 world.campaign 和全部实例 ID，只替换 step/continuous 时钟及推进参数。复用 frontier 内容，添加 tonic/pelt/ore/badge/medal 与药剂配方（reed2→tonic1，10秒）。成长阈值0/20/60，maxHp20/26/34，attack4/6/8，defense1/2/3；药剂恢复20。狼在forest：HP12、攻击5、防御0、pelt1、经验10、冷却10秒；袭击者在quarry：HP24、攻击8、防御1、ore2、经验25、冷却30秒。

任务 supply：交付toolkit1，奖励tonic2、经验10，可重复；patrol：前置supply，接取后领取2次wolf胜利，奖励badge1、经验20，可重复；guard：前置patrol，接取后领取1次raider胜利，奖励medal1、经验30，不可重复。三者都在town接取/交付。pelt卖3、ore卖5。完整示范先完成工具交付，巡林两次，恢复生命，清剿袭击者，交任务、恢复、出售pelt2与ore2；预期总经验105、等级3、生命22/34、金币16、模拟时间60秒，任务各完成1次，无活动战斗或订单。

## 验收与连续执行

三个并行所有者分别负责成长/生命、遭遇战斗、任务；根负责输入、视图、世界、真实 CLI、版本与交付。各模块范围行为测试和独立审查之后，由根一次统一 Preflight/构建/编译后游玩/独立包验证；不重复同一大套检查。覆盖失败完整快照、保存恢复、替换、异常外部提供者、特殊 ID、奖励重试、计数基线和真实通用 CLI。

已有用户授权覆盖本批可逆实现、根集成及测试后发布。只在整批通过后更新 main，预期旧 SHA、非强制；立即简报触发，不主动查询新 CI。用户最新要求持续推进优先，不重复询问执行方式或设计确认；重要决定记入 ledger。
