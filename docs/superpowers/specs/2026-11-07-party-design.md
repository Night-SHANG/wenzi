# v0.8 队伍、伙伴与多目标战斗设计

记录：2026-11-07 12:26 北京时间（UTC+08:00）。基础版本：main beec605beb8915d53bf4513a52f0dc79ef0d0606。执行分支：feat/party-battles。

## 意图与选择

继续用户已授权的成批并行开发，在同一文字世界中招募伙伴、编组、选择多个敌人、按可替换顺序轮流行动、失败撤退、领取奖励和恢复后继续任务。全部现有和未来能力仍按模块装配；没有新增宿主玩法分支。此批为 CLI/文字视图与规则开发，正式图形界面仍遵循视觉样板确认流程。

已检查现有 tactics.grid、encounters.duel、skills、quests、vitals、inventory、time 与模块宿主。格战模块保存固定棋盘单位及自己的生命，直接套用会复制冒险角色生命，并把坐标/移动强加给队伍遭遇；保留它独立运行。把旧 encounters 1.x 的 enemyHp 偷换为数组会破坏现有消费者；采用新 party-battle 与窄 combat-action / encounter-records 能力。旧决斗与旧世界保持原语义，通过可选会话锁与共享奖励函数复用成熟代码。

现有事务、背包、成长、生命、装备、效果、恢复、伤害公式、模拟时钟、作者工具直接复用。队伍的领队仍引用原 vitals/attributes；伙伴健康只存于 party.roster；敌人健康只存于 battles.party。模块不得通过旁路读取/写入另一实例私有状态。

成熟源码研究记录在 THIRD_PARTY.md 和 docs/party.md，须来自实际固定版本的主源文件与许可证；不能把本工程的事务和时钟语义归因于上游。无新增依赖，不复制上游代码、文本或成套数值。选择为本次工程判断，非用户逐项指定。

## 正常、失败与长期路径

正常：装备领队 → 招募两名伙伴 → 选择出战名单 → 接补给任务 → 采集制作交付 → 接队伍巡查 → 前往林地 → 开始双敌遭遇 → 领队指定目标施放技能 → 伙伴依次攻击 → 敌人自动按策略行动 → 胜利领取 → 回镇交付/选择受伤队员饮药 → 更换名单 → 再战。

失败：未招募/重复招募、超员或未知队员不改状态；倒下单位不能行动，错误行动者/错误目标不消耗技能物品或冷却；后续 AI、伤害、生命、奖励提供者失败整次命令回滚。全队倒下保留 defeat，恢复不会自动把终局改成 active。满包领奖保持胜利等待重试，领取才加胜场与经验。撤退丢弃奖励并进入冷却；双方战斗不能占用同一会话。战斗动作不暗中推进时间。

长期：伙伴已招募条款、敌人及奖励、当前回合顺序、技能截止时间冻结；改目录不改已有事实。当前目录仍独立校验。查询只读；中途保存、恢复、更换时钟和策略后可继续。替换顺序策略只影响下回合，替换目标策略影响下次 AI 选择。旧存档严格版本迁移，未知历史拒绝，不猜测、不清空。冷却/生命/奖励/回合安全数值与 Unicode ID 边界均有行为验证。

## 全局契约

- Node >=24.12.0，现有 TypeScript/Ajv/semver/fast-json-patch；不改 src/engine 或 src/contracts.ts。
- ID 为 1–128 Unicode 码点，支持普通自有对象键、空格与引号；用已有 idSchema/isId/own 等公共助手。计数为非负安全整数；正值明确声明；时间为 0..MAX_SAFE_INTEGER 的有限模拟秒。
- 配置/state/命令 schema 拒绝未知字段，外部能力返回值按消费字段、身份、重复、范围与跨字段关系校验。get/list 必须一致。读写后返回与实际查询一致，不能只信成功返回。
- 每个独立策略提供独立版本化能力；任何拒绝不得提交部分状态、事件、回执或 revision。所有新定义版本1.0.0/stateVersion1。
- Root 独占索引与提交；三个实现者仅改自己的文件，使用普通公开契约 fixture 解耦，不等候他人实现；Root 负责真实组合与全局门禁。

## Task 1：伙伴、队伍与会话所有权

### battle-session.exclusive — sessionModule

文件 battle-session.ts；capability `battle-session@1.0.0`；config `{}`，state `{owner:null|string}`。`status({})->{owner}`；`acquire({owner})` 仅在空闲成功，任何已占用（包括同 owner）拒绝；`release({owner})` 只允许准确当前 owner。两命令返回 `{owner}`。这是可信本地模块协调协议，不是身份认证。状态没有时间或世界私有引用。

### companions.catalog — companionRulesModule

文件 companion-rules.ts；cap `companion-rule@1.0.0`。config `{companions:Record<id,{name,maxHp,attack,defense,speed}>}`；maxHp/attack 为正安全整数，defense/speed 为非负安全整数，name 非空。stateless。`get({member})->{id,...terms}`；`list({})->{companions:[...]}`。导出 `CompanionDefinition`、`readCompanion(ctx,value,expectedId?)` 供本任务复用。

### party.roster — partyModule

文件 party.ts；cap `party@1.0.0`；requires companion-rule/vitals/progression/battle-session，optional attributes（均^1.0.0）。config `{leader:{id,name,speed},capacity}`，capacity 为最多出战伙伴数的非负安全整数；领队不计入 capacity。state `{members:Record<id,{id,name,maxHp,attack,defense,speed,hp}>,active:string[]}`，初始空。领队 ID 不得与当前或已招募伙伴 ID 相同。

`recruit({member})` 空闲时从当前目录冻结完整伙伴条款，以满生命加入后备，只能招募一次。`setActive({members:string[]})` 空闲时选择已招募、不重复且不超容量的伙伴，保留给定顺序；空数组有效。两命令返回 status。战斗会话被占用时禁止这两种名单变更，即使 pending victory/defeat；不限制正常生命恢复。

`status({})->{leader:string,capacity:number,active:string[],members:PartyMember[]}`。active 始终 `[leader,...state.active]`。成员列表先领队，再当前目录与已招募伙伴并集，每 ID 只出现一次。`PartyMember={id,name,maxHp,hp,attack,defense,speed,isLeader:boolean,recruited:boolean,active:boolean}`。领队 hp/maxHp 查询原 vitals，attack/defense 优先 attributes.values，否则 progression.values；不复制这些状态。领队 recruited/active 永远 true。未招募目录项 hp=0,recruited/active=false（明确不是可战斗伙伴）。已招募项使用冻结条款与持续 hp，目录删除也保留。`member({member})->PartyMember` 与 status 同一事实，未知 ID 拒绝。

`damage({member,amount>0})` / `heal({member,amount>0})->{id,hp,maxHp}`：只接受领队或已招募伙伴。领队委托原 vitals，检查前后与返回；伙伴仅修改自身 hp，伤害下限0，恢复上限maxHp，满血恢复拒绝。冻结伙伴允许战后继续受伤、换到后备与再次出战，不重新满血。不得提供释放后重招免费恢复通道。

导出 `PartyMember`、`readPartyMember(ctx,value,expectedId?)`、`readPartyStatus(ctx)`（后者通过 party 能力读取并校验完整状态；不调用自己）。状态/成员读取函数应明确 leader、active 与 flags 的一致性，安全数值、唯一性。

### vitals.party-member — partyVitalsModule

文件 party-vitals.ts；caps `vitals@1.0.0`,`vitals-selection@1.0.0`；requires party。config `{initialMember:id}`，state `{member:id}`。查询目标必须已经招募（领队有效）；`status({})->{hp,maxHp}`；`selection({})->{member,name}`；`select({member})->{member,name}` 选择任一已招募队员，包括后备；`damage({amount})`/`heal({amount})` 委托 party 并核验实际结果，返回原 vitals 形状。只保存选择，不保存健康。这样 recovery.items 可以原样消耗真实物品恢复任意队员。显式绑定避免把 party 的领队 vitals 反向绑定到适配器造成环。

## Task 2：遭遇内容与可替换策略

### squads.catalog — squadRulesModule

文件 squad-rules.ts；cap `squad-rule@1.0.0`；config `{encounters:Record<id,{name,location,enemies:EnemyDefinition[],loot:Record<item,positiveCount>,experience:count,cooldownSeconds:seconds}>}`。EnemyDefinition `{id,name,maxHp>0,attack>0,defense>=0,speed>=0}`；至少一个敌人，同一遭遇内部 ID 唯一。允许敌人与我方 ID 相同，不能靠字符串拼接区分阵营。`get({encounter})->{id,...terms}`；`list({})->{encounters:[...]}`。导出 `SquadDefinition`、`EnemyDefinition`、`readSquad(ctx,value,expectedId?)`。纯目录；地点/物品引用由消费者校验。

### initiative.listed / initiative.speed — initiativeListedModule / initiativeSpeedModule

文件 initiative.ts；cap `initiative@1.0.0`；config/state `{}`。`order({actors:InitiativeActor[]})->{order:ActorRef[]}`。
`ActorRef={side:'party'|'enemy',id}`，`InitiativeActor={...ActorRef,speed:count}`。输入非空、每 (side,id) 唯一。listed 保留输入顺序；speed 按 speed 降序，平局保留输入顺序。返回必须是输入的准确完整排列。导出 ActorRef/InitiativeActor。两策略仅显式接受彼此准确1.0.0/stateVersion1/空对象的迁移；当前队列不重排。

### targeting.first / targeting.lowest-hp — targetFirstModule / targetLowestHpModule

文件 targeting.ts；cap `targeting@1.0.0`；config/state `{}`。`choose({candidates:[{id,hp,maxHp}]})->{target:id}`，非空、ID唯一、0<hp<=maxHp。first 取给定第一项，lowest-hp 取当前绝对 hp 最低，平局保留输入顺序。不是按血量百分比。两策略精确空状态互换迁移；不得选候选之外目标。

## Task 3：队伍战斗与旧决斗接合

### battles.party — partyBattleModule

文件 party-battle.ts；caps `party-battle@1.0.0`,`combat-action@1.0.0`,`encounter-records@1.0.0`。requires party/squad-rule/initiative/targeting/combat-rule/location/inventory/progression/time/battle-session。config `{container}`。

state `{battle:null|Battle,cooldowns:Record<encounter,{startedAt,readyAt}>,wins:Record<encounter,count>}`。Battle `{encounter,name,location,allies:string[],enemies:Array<EnemyDefinition & {hp}>,loot,experience,cooldownSeconds,startedAt,phase:'active'|'victory'|'defeat',round:positiveCount,queue:ActorRef[],cursor:count}`。allies 冻结 party.active 的有序 ID，仅保存 ID，不保存我方生命或属性。敌人、奖励及冷却条款全部冻结；当前目录仍独立有效。

`start({encounter})->status`：无未结束遭遇、正确地点、当前名单至少一人存活、遭遇冷却到期；acquire 会话 owner=ctx.self，并验证查询。冻结战斗，round=1，向 initiative 传我方按名单顺序+敌方按目录顺序的所有参与者（含倒下者）；queue 必须是准确完整排列。开始后自动执行队头敌人并跳过倒下单位，停在活着的我方行动者或终局。每次命令都必须把队列推进到可操作状态。

`attack({actor,target})->status` 与 `strike({actor,target,attackBonus:count})->status` 共用结算。actor 必须准确当前我方活着行动者，target 是存活敌人 ID。当前我方攻击/防御每次读 party.member；攻击+bonus 检查安全整数；damage 使用已有 combat-rule.damage。敌方攻击只在敌方自己的队列位置发生，绝不旧式每次攻击都反击。敌人 choose 从冻结 allies 中当前活着者选择，按 allies 顺序提供；damage 委托 party.damage 并核验前后返回与真实查询。击杀者/被击杀者队列项只跳过，不重复行动。

当前 queue 到末尾仍未终局则 round 安全+1，按当前 initiative 生成新队列。queue 每轮包含所有冻结参与者，所以倒下后在自己位置之前复活可本轮行动，过了位置则等下轮；不主动插队。替换策略不改变已存 queue。每个命令最多处理完当前轮剩余敌人与下一轮我方之前敌人，所有我方倒下立即 defeat，全部敌方倒下立即 victory；不能无界空转。终局保持至 claim/retreat，随后恢复生命不重开战斗。

`claim({})->status`：仅 victory 且回到冻结地点。沿用真实 inventory/progression 奖励事务；全部成功才 wins+1，记录当前时刻开始的冻结冷却并 release 准确 owner。失败保留完整 pending victory。`retreat({})->status` 任意非 idle phase 放弃奖励并开始同样冷却/释放会话。绑定 location.moved 事件在 active 拒绝移动，其他来源忽略。active 恢复/校验必须仍在冻结地点、名单完全相同、会话 owner 准确、双方有存活者且 cursor 指向活我方；terminal 不要求我方生命保持当时值。所有 phase 的 queue 仍是冻结全体参与者准确排列，cursor 不超长度。时钟不得倒退、溢出或使正冷却无法表示。

`status({})->{phase:'idle'|Battle.phase,battle:null|Battle,current:ActorRef|null}`，非 active current=null。
`list({})->{encounters:[...SquadDefinition,available:boolean,remainingSeconds:number]}`；available 包括空闲会话、可战斗名单、当前位置、冷却。
`describe({encounter})->SquadDefinition`；`records({})->{wins}`。

### 窄能力

`encounter-records` 只承诺 records({})->{wins} 与 describe({encounter})->{id,...}，不承诺单敌战斗形状。

`combat-action` 只承诺 `actionStatus({})->{phase,canAct:boolean,targets:[{id,name,hp,maxHp}]}` 与 `performStrike({attackBonus:count,target?:id})->同形状`。当前活着领队轮到行动时 canAct=true；targets 为当前存活敌人，idle 时为空；victory 为空；defeat 可保留存活敌人。必须提供 target，除非恰好只有一个存活敌人可省略。performStrike 委托同一个内部 strike，用 party.status.leader 作为 actor，不建立第二战斗状态。伙伴通过普通 attack/strike 行动，本批技能属于领队。

### 复用旧奖励与决斗

提取 adventure-rewards.ts：共享真实库存/经验读取与 grantAdventureRewards(ctx,{container,loot,experience})，核验每步返回和实际查询。由 encounters.duel 与 battles.party 调用；没有第二份 XP、库存或奖励数据库。

encounters.duel 升级定义1.2.0（encounters cap仍1.1.0），新增 optional battle-session^1.0.0。绑定时 start acquire，finish release，所有非 idle 状态必须持有自己的 owner；其他既有攻击/技能/奖励语义保持。准确接收本定义1.0.0或1.1.0/stateVersion1迁移。未绑定时旧世界行为不变。向已有非 idle 旧世界直接添加空会话失败关闭，需先结束旧战斗；不跨模块猜测锁拥有者。两个控制器可在同一世界使用同一会话，不能同时开始。

## Task 4：现有消费者、世界、视图与交付

Root 修改 skills.combat→1.1.0（skills cap1.1.0）。旧 encounters^1.1.0 改 optional，新增 optional combat-action^1.0.0；至少有一者。config 增加可选 battleSource（auto / encounters / combat-action，默认auto）。auto 仅在恰有一个来源时选它，两者都绑定则拒绝歧义；显式选择必须存在对应绑定。use 输入增加可选 target；新路径在消耗前验证 canAct/目标；仍扣成本→施加领队效果→performStrike→写冷却，全事务。返回 battle 为所用协议的返回状态；list 在新路径的每一个 skills 行增加 targets 数组（不是 envelope），availability 反映领队行动资格。旧路径返回与行为保持，显式 target 在旧路径须匹配当前 encounter 后按原 strike 执行。准确接收同定义1.0.0/stateVersion1，保留冷却。将当前多步长行展开，处理既有可读性建议。

quests.journal→1.1.0（quests cap1.0.0），增加 optional encounter-records，config 增加可选 victorySource（auto / encounters / encounter-records，默认auto），需要胜场时 auto 只选择唯一来源，两者存在则拒绝；显式选择必须绑定对应来源；其余接取/基线/领奖完全不变。准确旧1.0.0/stateVersion1迁移。明确一份任务日志绑定一个战绩来源，不合并或猜测同名 ID。

view.party.text→partyViewModule，纯文字组合 view.frontier.text。requires text-view/party/party-battle/progression/quests/recovery/vitals-selection。显示已招募/后备/出战、所有真实生命、当前行动者、回合与目标、自动敌人动作提示、任务、冷却、恢复对象与 select→use 操作。所有提示由 boundActionCommand 按真实实例 ID 生成，外部返回按实际消费字段验证，不硬编码实例名。view.loadout.text→1.1.0，显式旧空状态迁移，新技能 targets 在逐目标提示中带入，旧世界提示保持。

新增 worlds/party.json 和 party-continuous.json，共享 world.party 身份和相同动作语义，仅时钟类型/advance 参数不同。复用 loadout 的实际生产任务基础，删旧遭遇目录/旧决斗/campaign视图，加入9实例（会话、伙伴目录、队伍、生命选择适配、群敌目录、行动顺序、选目标、队伍战斗、队伍视图）；loadout视图组合队伍视图。预计35实例、53内置定义、14世界；以实际目录核验为准。恢复只保留一个 recovery.items，绑定队员生命适配器，party 的领队 vitals 显式绑定原生命池。

场景数值与完整动作由 Root 在集成前手算并写 docs/party.md，测试固定字面结果，不能用实现自身生成预期。演示必须含两名不同伙伴、名单切换、双目标、领队技能、伙伴行动、AI、任务与实际物品恢复、战后继续循环。测试覆盖中途存档/换钟、策略替换、旧版迁移、错误外部能力、满包领奖、倒下跳过/全败、重复调用去重、非 ASCII 提示与真实作者 patch/fork/validate。保留所有12既有世界结果。

补充实施顺序：主持模块在 acquire、跨能力 HP 变更、release 前后必须按宿主嵌套事务语义写入正确自己的阶段状态。跨模块 validate 在整次事务末端运行；查询不能误读自己尚未写入的 detached state。所有我方均倒下时先决定 defeat；队列为空/耗尽只能在仍有双方存活时产生下一轮。初始名单与 frozen allies 在 active 时必须完全一致。

发布版本0.8.0-alpha.1。三条实现线独立规格/质量审查，Root 集成与 fresh 全分支审查合并；完整 Preflight、build、compiled smoke、实际独立解压/哈希/指纹/Git恢复验证。最终完整源码与必要证据提交，expected main=beec605...、force=false；更新 main 后立即告知，不轮询新CI。同步 Notion 母页、当前12、验证04、全局索引并将11标历史。保存源分支与提交映射，不额外创建 Release 或删除用户产物。

## 本批边界

伙伴属性是招募时冻结值，尚无伙伴个人升级/装备/效果或技能树；领队原技能完整保留。没有捕捉、经验分配策略、阵型距离、持续伤害、联机、实时帧、图形界面或不可信代码隔离。示例平衡需长期试玩。行为边界必须随文档交付，不能把扩展能力描述为已实现全部玩法。
