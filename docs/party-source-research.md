# v0.8 队伍与多目标回合战：固定源码研究

研究时间：2026-11-07 12:32:16（北京时间 UTC+8）  
研究范围：仅 **Tuxemon** 一个玩法上游；目录站只用于发现路径核对。本记录不修改生产代码、主文档或项目许可证，不提交 Git。缓存只用于研究和逐行复核。

## 结论与采用边界

Tuxemon 是本批次足够具体的成熟玩法参考：它将持久队伍、当前上场单位、按单位引用保存的行动队列、战斗阶段、经验分配及逃跑公式分开。适合参考其职责划分和边界案例，**不适合把 Python 游戏对象与状态机直接装入当前 TypeScript 引擎**。

建议本项目独立实现：队伍模块拥有伙伴及其持久 HP；战斗模块保存参战身份和行动状态，通过公开能力修改持久 HP；目标合法性、目标范围展开、失效目标处理、行动顺序、敌方决策、伤害、奖励、撤退与时间成本分别由可替换策略提供。已有引擎负责跨模块原子事务。这里的能力协议、事务保证及具体默认规则属于本项目，不是 Tuxemon 已提供的接口。

最重要的源代码区别：

- **队伍与场上单位是两层结构；HP 属于 Monster 实例。** 上场列表和队列引用这些实例，不另外保存一份战斗 HP。
- **行动队列在 KO 时删除“由该单位发起”或“以该单位为目标”的行动。** 该路径没有自动选择另一个活目标；换人则有单独的目标引用替换逻辑。
- **排序并非简单的原始速度降序。** 类别优先级、招式修正后的速度、入队时的随机平局值共同决定顺序；队列从末尾取行动，每次行动后再次排序。
- **经验在击倒处理阶段直接发放；训练师战的金额先随击倒累计，胜利时才入钱包。** 它不是当前本项目已有的“胜利后另行领取奖励”机制。
- **逃跑提供具名公式分支，但该处分派是硬编码。** 可以选择公式不等于整个规则已通过公共能力插件化。

## 版本、许可证与发现路径

### 玩法上游

- 仓库：[Tuxemon/Tuxemon](https://github.com/Tuxemon/Tuxemon)
- 查询时默认分支：`development`
- 本次通过 GitHub 当前分支提交接口核实并固定：**`9e6258ff726b786040a267e8bdbbf037b560285e`**
- 提交时间：`2026-09-28T17:01:39Z`
- 提交标题：`Bring in 0.5 release branch changes (#3632)`
- [固定提交](https://github.com/Tuxemon/Tuxemon/commit/9e6258ff726b786040a267e8bdbbf037b560285e)
- 已读取完整 [LICENSE](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/LICENSE)，内容为 GNU GPL version 3；所检 Python 文件顶部均标注 `SPDX-License-Identifier: GPL-3.0`。本记录采用 **GPL-3.0** 的原始标记，不自行扩大为 “or later”。
- 原始源码及许可证缓存位于 `artifacts/squad-source-cache-v08/tuxemon/`。缓存目录包含研究用 GPL 源文件，不代表生产模块已采用这些实现。

### 目录路径核对

[bobeff/open-source-games](https://github.com/bobeff/open-source-games) 查询时 HEAD 为 **`3a9ab8fc892a2cdadf8989a72ba7624a11e39cec`**，提交时间 `2026-02-25T20:22:58Z`。固定 [README](https://github.com/bobeff/open-source-games/blob/3a9ab8fc892a2cdadf8989a72ba7624a11e39cec/README.md) 的 blob 为 `0a54e0898d52ffa31f83f843b66aee458c5a49b8`。

该 README 包含 The Battle for Wesnoth 条目及源码链接，**未检出 Tuxemon**。因此 Tuxemon 应记作本轮补充定向研究对象，不应写成“从当前 bobeff 目录发现的条目”。本批次没有再扩展第二个玩法上游；既有 Wesnoth 记录仍由原记录负责。

## 源码证据与精确语义

以下链接全部固定到上述 Tuxemon 提交。函数行为来自实际代码；注释与行为不一致处，以代码为准。

### 1. 持久队伍、拥有者与 HP

| 证据 | 源码行为 | 本项目可借鉴之处 |
| --- | --- | --- |
| [`entity/party.py`：PartyHandler](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/entity/party.py#L23-L71) | 持有 `_monsters`、`_owner`、`_party_limit`、储存盒引用；路由策略通过 `RoutingPolicyRegistry.get(...)` 选择。 | 名单管理、容量和超额处置可拆分；默认容量不是引擎常量。 |
| [`party.py`：增删换队](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/entity/party.py#L178-L280) | 加入或替换时设置 Monster 的 owner；移除或清空时解除 owner；能够按实例 UUID 查找。 | 实例身份与模板身份分开；名单模块负责成员关系。 |
| [`monster.py`：持久字段](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/monster/monster.py#L67-L81) | `_persist_simple` 包含 `"current_hp": int`，并允许保存其零值。 | HP 只有一个持久权威，不在名单与战斗之间复制可写值。 |
| [`monster.py`：KO 定义](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/monster/monster.py#L383-L427) | `is_fainted` 返回 `self.current_hp <= 0`；owner 由对象字段保存。 | KO 判断可由规则能力封装，所有命令共享同一判断。 |
| [`field_monsters.py`](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/field_monsters.py) | 保存每个 NPC 的上场 Monster 列表；`active_monsters` 展平现存引用，本身不按 HP 再过滤。 | “名单里”“上场”“仍存活”是不同条件，不能把函数名等同于完整合法性保证。 |
| [`session.py`：场上、板凳与胜负人数](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/session.py#L90-L167) | 上场单位来自 field；bench 是整个活队伍减去场上集合；remaining_players 依据整个队伍是否全倒下。 | 替补存在时，场上一时清空不能直接等同整队失败。 |

短摘录：

```python
# monster.py
@property
def is_fainted(self) -> bool:
    return self.current_hp <= 0
```

[`monster.py` 的 end_combat](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/monster/monster.py#L772-L799) 清除临时属性、蓄力、锁定与冷却等状态，并处理不跨战斗保留的状态；倒下者 HP 保持 0。**这里不是战斗结束统一回满 HP。** 本项目若设计自动疗伤、营地恢复或撤退后惩罚，必须单独归属于本地策略。

### 2. 目标选择和范围展开

[`session.py` 的目标映射](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/session.py#L169-L241) 明确区分六类目标：

| 类型 | 实际解析 |
| --- | --- |
| `enemy_monster` | 传入的单个 target |
| `enemy_team` | target 所在一方的当前场上单位 |
| `enemy_trainer` | target 拥有者的整个存活队伍，包括未上场成员 |
| `own_monster` | user 自身 |
| `own_team` | user 所在一方的当前场上单位 |
| `own_trainer` | user 拥有者的整个存活队伍，包括未上场成员 |

`get_targets` 用 set 合并目标再转成 list；不可把返回顺序当稳定契约。另一个 `get_target_monsters` 验证目标类型枚举并拼接各类列表，**本身不去重**。这两者是可研究的目标解析 API；本次未完整追踪所有 EffectProcessor 子效果的调用图，不能宣称任意招式都自动获得相同范围和去重保证。

[`combat_menus.py` 的实际玩家路径](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/states/combat_menus.py#L568-L591)：多个对手且 `technique.targets_enemy()` 为真时才弹出敌方目标选择，否则自身目标用 user，其余默认第一个对手。另一段 [目标菜单构造](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/states/combat_menus.py#L662-L741) 直接依赖场上 Monster、sprite 和菜单项；部分 bypass 行为也默认取第一个对手。

[`technique.py`](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/technique/technique.py#L247-L275) 中 `targets_enemy()` 检查 `enemy_monster` 标志或效果参数；`use()` 进入效果处理并触发冷却。它不是宿主可直接调用的纯目标合法性插件。

AI 也不是单一“打最近敌人”：[`ai/decision_strategy.py`](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/ai/decision_strategy.py#L31-L226) 对候选 `(technique, opponent)` 进行配置评分，没配置时随机选候选；训练师策略还会先判断治疗物品。`choose_best_scored_move` 的注释说非正分时随机退回，但实现保留评分最高的候选，只在没有 best_action 时随机；不要照抄注释描述。

**本地适配建议：** 在动作规划与执行时都使用同一目标合法性能力；范围展开、稳定排序、重复目标消除、目标失效后的取消或重选分别成为明确规则。不要因“有多个敌人”就把上游菜单的第一目标回退固化进引擎。

### 3. 行动队列、顺序和 KO 跳过

[`action_queue.py`](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/action_queue.py) 的 `EnqueuedAction` 保存 user、method、target 引用，创建时生成 `random.random()` 的 `sub_priority`。存在本轮主队列、未来回合 pending 队列以及随队列删除的 history；不能把这里的 history 当本项目所需的持久战斗日志。

[排序实现](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/action_queue.py#L172-L185) 对 key `(-primary_order, speed, tie_breaker)` **升序排序**，执行时从末尾 pop，所以结果是：类别索引小者优先，然后速度大者优先，然后随机平局值大者优先。

[`sort_manager.py`](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/sort_manager.py) 从配置取类别顺序；Monster 的招式速度经 [`formula.speed_monster`](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/formula.py#L678-L701) 计算，包含基础速度、招式 speed 修正、最小值和 dodge 修正。物品/状态等路径会使用不同速度处理。

[`combat_state.py` L371–379](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/states/combat_state.py#L371-L379) 每完成一次行动又排序一次剩余队列，并通过状态任务安排 HP 检查与动画。它不是本项目的同步、纯数据回合结算循环。

KO 的关键真实行为：

- [`action_queue.py` 的 remove_monster_actions](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/action_queue.py#L262-L284) 同时过滤主队列、pending 和 history；只要 **actor 或 target** 是该单位就删除。
- pending 的自动清理还会移除过期回合、已倒下 actor 或已倒下 target；并非只跳过 KO 单位自己的出手。
- [`combat_state.py` 的 check_party_hp / handle_monster_defeat](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/states/combat_state.py#L986-L1046) 是 KO 检测到队列清理的实际连接点。遍历复制的列表，避免多单位同时倒下时漏掉下一项。
- [换人目标重定向](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/action_queue.py#L202-L206) 是另外的 old→new 引用替换，处理的是主队列；不能推断 pending 也自动重定向。
- [`perform_action` 的分派](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/states/combat_state.py#L594-L634) 按 method 类型执行，没有在该分派层统一检查最新 HP 和所有目标条件。各效果是否另外验证需要分别确认。

因此，本项目加入“每次执行前重新检查 actor/target、跳过并记录原因”的同步保证，是合理的**本地加强**，不可写成直接复用了上游既有通用保证。若允许重选存活目标，也应清楚标注为本地可插拔政策。

### 4. 回合阶段和整队胜负

[`machine.py` 的阶段推进](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/machine.py#L60-L142) 从 DECISION 收集场上单位的决策，经过 PRE_ACTION、ACTION、POST_ACTION、RESOLVE_MATCH；行动队列空后才能走向本轮结算。蓄力/锁定等可以免除本轮重新决策；NPC 物品行动占用一个尚未覆盖的单位回合，并不为整个队伍免费增加行动。

胜负判断使用整个队伍的 remaining_players：0 为平局、1 为逃跑或获胜、更多则继续 housekeeping。[`session.py` L75–78](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/session.py#L75-L78) 约束 **恰好两个训练师**。多单位不等于任意阵营战；本项目若支持多个阵营、中立单位、助战或不同败北条件，必须设计自己的协议。

### 5. 经验、金钱和领取时点

[`reward_system.py` L71–107](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/reward_system.py#L71-L107) 默认从 damage tracker 读取攻击过败者的 winners；没有 winners 时返回空奖励。经验分配涉及参战者、未参战队友与持有物奖励规则。训练师战的 purse 在每个败者处理时计算一次。

[`reward_system.py` L117–189](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/reward_system.py#L117-L189) 会调用 `give_experience(...)`，同时处理招式学习、训练点等变化。虽然方法名含 calculate，其实现不是纯奖励预览。默认参战者发奖路径会跳过非玩家拥有或已倒下的 winner；未参战分配是另外一条路径，不能把这条过滤推断为所有路径共有。

实际时间链：

1. [`handle_monster_defeat`](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/states/combat_state.py#L1034-L1046) 清理行动后调用经验/金钱奖励处理。
2. [`award_experience_and_money`](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/states/combat_state.py#L880-L898) 调用 RewardSystem；XP 在上述逻辑中修改，金额加入 `session.prize_money`。
3. [`combat/utils.py` 的 _handle_win](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/utils.py#L201-L239) 在训练师战且玩家胜利时，对 prize 扣分成并 `add_money(remaining)`。**现金入账在胜利，不是在每次击倒。**

这条已检查路径没有本项目既有的独立 `claimRewards` 命令，也不是将所有奖励延迟到玩家手动领取。本项目的“多敌人奖励只汇总一次、胜利后可领取一次、撤退/败北不给战利品、发放失败全量回滚”等约束需要由本地状态、奖励策略与事务共同实现；不得归功于上游代码。

经验与金额有明确策略类型可参考：[experience_strategies.py](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/experience_strategies.py)、[money_strategies.py](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/money_strategies.py)。借鉴策略分离即可；本批次没有建议复制任何 XP/金币平衡公式或物品规则。

### 6. 逃跑和主动放弃

[`combat_menus.py` L165–193](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/states/combat_menus.py#L165-L193) 区分训练师战 `menu_forfeit` 和野外战 `menu_run`。野外逃跑先验证招式可用性，成功入队后仍作为行动执行。

[`core/effects/run.py` L39–91](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/core/effects/run.py#L39-L91) 读取双方各自配置的逃跑方法；失败增加 run_attempts，成功设置 run 标志、结果和消息，移除玩家/NPC，再调用 session.reset。

[`formula.py` L630–675](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/formula.py#L630-L675) 提供：

- `default`：概率为 `0.4 + 0.15 * (attempts + user.level - target.level)`，该函数没有显式 clamp。
- `relative`：依据等级差、对手 melee/ranged/dodge 均值和自身速度计算，再限制在 0–1。
- `always` / `never`：固定结果。
- 其他名称抛错；分派是 `if` 分支，不是可注册逃跑策略接口。

[`session.reset`](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/session.py#L676-L691) 会清理 players、变量、队列、累计奖金和场上列表。因此本次静态证据不足以保证所有 UI 阶段与所有 run/forfeit 配置的最终事件顺序；本记录不宣称已运行 Tuxemon 或完整证明其逃跑结果链。能直接确认的是公式分派、尝试计数和清理函数本身。

本地撤退是否必成功、是否花时间、是否保留受伤、是否触发敌方追击、战利品是否归零，均应由明确的独立政策定义。不要把本项目任意一种默认值误写为 Tuxemon 的通用规则。

## 直接复用评估

| 维度 | 实际障碍 | 结论 |
| --- | --- | --- |
| 语言与运行时 | Python 对象图、Monster/NPC 实例、Pygame 状态及动画任务、client/combat_session、全局事件总线与配置。 | 不是可直接 import 的 TypeScript 纯规则库。 |
| 状态所有权 | 原代码通过实例引用直接修改 HP、XP、owner、场上队列和玩家钱包。 | 本项目必须经模块能力与统一事务操作，不能照搬共享可变对象。 |
| 策略接口 | 部分职责已有策略类或 registry，但目标菜单、两方约束、阶段推进、逃跑分派仍包含具体游戏假设。 | 借鉴分层，独立设计版本化公共能力；“所有规则可替换”是本地目标。 |
| 随机与重放 | 队列平局与决策调用 Python random，某些目标集合转 list。 | 稳定 ID 顺序、注入 RNG、存档后重放若需要，必须本地实现。 |
| 事务 | 本次检查路径跨对象即时修改，并通过 UI 任务安排检查与清理。 | 未发现对应当前宿主嵌套原子事务的可直接复用协议；不能宣称 upstream 保证全量回滚。 |
| 许可证 | GPL-3.0 源码。当前项目 private/UNLICENSED。 | 不复制或逐行移植实现进生产代码；若未来要代码级采用，需要明确来源、保留通知并认真处理 GPL 兼容与发布义务，不能因换语言而忽略。 |

本轮建议是**玩法机制和架构参考 + 独立实现**，不是直接代码再分发。研究缓存保留原许可证和各源文件版权/SPDX 标记；正文短摘录仅用于说明证据。

## 与当前仓库的接口边界

已读取 `AGENTS.md`、`THIRD_PARTY.md`、`src/modules/encounters.ts` 及 `src/engine/index.ts`。当前 encounter 示例具有单敌人冻结战斗状态、分离的胜利奖励领取、移动守卫和冷却；HP、背包、成长及时间由外部能力协作。引擎会复制事务状态、执行嵌套命令与事件、校验全部模块状态后提交，失败不提交。

这形成可以保留的宿主边界：

| 独立职责 | 推荐责任 | 不应隐藏在引擎中的默认假设 |
| --- | --- | --- |
| 队伍/伙伴状态 | 名单、实例 ID、招募/离队、伙伴持久 HP 与成长写入 | 固定伙伴数、免费招募、自动复活 |
| 参战编成 | 从名单和遭遇模板得到战斗参与者、阵营、上场位置 | 所有伙伴必上场、只许两个单位 |
| 目标政策 | 合法对象、范围展开、重复处理、失效目标行为 | 默认第一敌人、KO 自动转火 |
| 行动顺序 | 优先级、速度、平局、每轮或每步重算 | 引擎内固定先手或随机源 |
| 敌方/伙伴决策 | 从可用动作和合法目标提出决策 | 固定打最低 HP 或固定普通攻击 |
| 结算政策 | 伤害、胜负、奖励估值/领取、撤退 | 所有战斗同一公式、败者必无奖励 |
| 时间成本 | 战斗动作、撤退、招募/恢复的秒数与推进 | 把 Tuxemon 的 turn/动画秒数当世界时间 |
| 引擎事务 | 统一提交/回滚、状态校验、嵌套能力调用 | 将具体玩法规则写回 `src/engine` |

应在 v0.8 的来源说明中明确：事务回滚、动作秒数、JSON 内容加载、存档迁移、能力版本、奖励一次领取、稳定排序和失败时不推进时间等，全部来自本项目已有宿主或本轮独立设计；**不能写成 Tuxemon 源码已经实现这些保证**。

## 研究验证范围

完成了当前分支 commit freshness 查询、固定 SHA 文件读取、许可证读取、调用点和队列方向交叉核对；没有运行上游游戏、没有导入上游依赖、没有复制资源/美术/剧情/完整玩法数据到生产代码。本文是静态源码研究记录，不替代本项目实现后对多人战斗、同时 KO、失效目标、重复领取和事务失败的验证。
