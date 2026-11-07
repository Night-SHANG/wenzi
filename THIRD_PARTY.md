# 第三方来源与当前采用范围

## 实际运行依赖

| 包 | 固定版本 | 包内声明许可 | 用途 |
| --- | --- | --- | --- |
| ajv | 8.17.1 | MIT | JSON Schema 校验 |
| semver | 7.8.5 | ISC | 模块能力版本范围 |
| fast-json-patch | 3.1.1 | MIT | 世界 JSON 补丁的实际修改操作 |

依赖树与完整版本、下载地址及 integrity 记录在 package-lock.json。分发包包含实际运行依赖自身的 LICENSE 文件。Ajv 的传递依赖包括 fast-deep-equal、fast-uri、json-schema-traverse、require-from-string，分别以包中许可为准。

开发依赖：TypeScript 5.9.3（Apache-2.0）、@types/node 24.0.0（MIT）、@types/semver 7.7.0（MIT）；不需要把编译器放进最终运行时。

官方来源：[Ajv](https://github.com/ajv-validator/ajv)、[node-semver](https://github.com/npm/node-semver)、[fast-json-patch 3.1.1](https://github.com/Starcounter-Jack/JSON-Patch/tree/3.1.1)、[TypeScript](https://github.com/microsoft/TypeScript)、[DefinitelyTyped](https://github.com/DefinitelyTyped)。

## JSON Patch 接入决定

fast-json-patch 3.1.1 无运行时依赖，其来源 tag 对应提交 `9d313ac01916e525e9204074f06e5295edec491b`。这是已有成熟标准的实现，发布年代较早，不据此声称近期活跃维护。使用默认导入兼容当前 NodeNext/ESM 项目，保留其 MIT LICENSE.txt。

薄适配位于 `src/authoring/patch.ts`。来源阅读和实际样例发现继承属性查找、32 位数组索引转换、不合法转义、补丁值引用共享、test 对象含自身 hasOwnProperty 字段，以及 move 目标在数组删除后改变位置的边界。因此适配层检查六种标准操作、指针、实际数组边界和自身属性，使用项目已有 canonical 比较 test，并把 move 的删除/添加依次交给来源库执行。所有实际修改仍由来源库完成；完整世界合法性由本项目宿主负责。

语义依据：[RFC 6902](https://www.rfc-editor.org/rfc/rfc6902)、[RFC 6901](https://www.rfc-editor.org/rfc/rfc6901)、[来源 core.ts](https://github.com/Starcounter-Jack/JSON-Patch/blob/3.1.1/src/core.ts)。这些兼容问题有对应回归测试，不能仅以库已安装认定接入正确。

## 已研究但本批没有复制进来的游戏源码

| 项目 | 已研究职责 | 来源 |
| --- | --- | --- |
| CDDA | 容器约束、收纳、行动时间单位 | https://github.com/CleverRaven/Cataclysm-DDA |
| Wesnoth | 移动、命中、抗性、交战配置 | https://github.com/wesnoth/wesnoth |
| Widelands | 配方、需求、生产过程 | https://github.com/widelands/widelands |
| micropolisJS | 税收、预算、维护效能 | https://github.com/graememcc/micropolisJS |

发现入口为 [bobeff/open-source-games](https://github.com/bobeff/open-source-games)。实际文件、来源提交与许可记录在 [项目源码研究页](https://app.notion.com/p/410fbd029cd281eabb8bdcbeaa233a40)。这些研究是模块职责拆解的参考，不代表整个原游戏已完成接入。本批游戏样例独立编写，不使用这些项目的代码文件、美术、故事文本或成套数据。

随机样例使用常见 xorshift32 形式，具体算法和 seed 归一语义在 random.ts 中明确；它用于可复现验证，不用于密码学。

## v0.5 探索生产采用范围

生产配方针对性核查固定到 Widelands `29753773d9c130e2a6a835ee6a14ad2bf317371d` 的 [bakery/init.lua](https://github.com/widelands/widelands/blob/29753773d9c130e2a6a835ee6a14ad2bf317371d/data/tribes/buildings/productionsites/empire/bakery/init.lua) 与 [production_program.cc](https://github.com/widelands/widelands/blob/29753773d9c130e2a6a835ee6a14ad2bf317371d/src/logic/map_objects/tribes/production_program.cc)。采用其“声明投入/产出/时长、消耗不足不部分扣料”的职责与失败语义作为参考；实际原子操作复用本项目已有宿主和库存代码。来源生产实现依赖其 Game、ProductionSite、InputQueue、工人和物流系统，本轮不直接移植，不导入另一套状态权威。

来源 [README](https://github.com/widelands/widelands/blob/29753773d9c130e2a6a835ee6a14ad2bf317371d/README.md) 声明 GPL v2+。新增模块为本项目独立实现，没有复制/翻译上述代码、配方数据集、素材或游戏数值；没有新增第三方依赖。详见 [探索生产指南](docs/frontier.md)。

## v0.6 任务冒险采用范围

本批的具体阅读固定到以下提交，避免把变化中的默认分支当成稳定来源。只借鉴职责和状态语义，新增模块为本项目独立 TypeScript 实现；没有复制或翻译来源代码、任务文本、单位配置、素材或成套数值，也没有新增第三方依赖。

| 来源 | 固定文件 | 用于核对的行为 | 本项目的适配 |
| --- | --- | --- | --- |
| Wesnoth `670e500946c82679efada285300caba38857bfc5` | [unit.hpp](https://github.com/wesnoth/wesnoth/blob/670e500946c82679efada285300caba38857bfc5/src/units/unit.hpp)、[advancement.cpp](https://github.com/wesnoth/wesnoth/blob/670e500946c82679efada285300caba38857bfc5/src/actions/advancement.cpp) | 经验阈值、升级资格、多次升级后的经验保留 | progression.track 保存累计经验，progression.curve 解析有界阈值表；不移植原单位转换、升级选项或自动恢复语义 |
| CDDA `06be12f9884d82d387cb6b38dc549eca71c3835a` | [mission.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/06be12f9884d82d387cb6b38dc549eca71c3835a/src/mission.cpp)、[npctalk_funcs.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/06be12f9884d82d387cb6b38dc549eca71c3835a/src/npctalk_funcs.cpp) | 接取任务时记录累计击杀基线、检查当前库存、完成与清理职责 | quests.journal 记录已领取胜利的基线，冻结目标/奖励，交付时查询真实库存；扣料、奖励、经验和完成次数复用本项目宿主事务 |

Wesnoth 的上述文件头与 [COPYING](https://github.com/wesnoth/wesnoth/blob/670e500946c82679efada285300caba38857bfc5/COPYING) 声明 GPL-2.0-or-later。CDDA 的 [LICENSE.txt](https://github.com/CleverRaven/Cataclysm-DDA/blob/06be12f9884d82d387cb6b38dc549eca71c3835a/LICENSE.txt) 声明主项目 CC-BY-SA-3.0，并另列第三方组件。这里记录实际研究来源的许可，不声称这些项目的代码已进入本工程。

来源任务流程不提供本项目的跨模块原子事务保证。当前战斗领取与任务交付的完整回滚由已实现的通用宿主负责；物品、经验、生命和时间仍各自只有一个绑定能力提供者持有权威状态。详见 [任务冒险指南](docs/campaign.md)。

## v0.7 装备、技能与状态效果采用范围

本批针对既有模块继续查阅成熟实现，未引入新运行依赖。以下源码按固定提交实际核查，新增 TypeScript 模块独立实现；没有复制或翻译来源源码、游戏文本、配置数据集、素材或成套数值。

| 来源与固定提交 | 实际文件与行为 | 本工程采用及明确差异 |
| --- | --- | --- |
| CDDA `06be12f9884d82d387cb6b38dc549eca71c3835a` | [character_attire.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/06be12f9884d82d387cb6b38dc549eca71c3835a/src/character_attire.cpp) 检查装备冲突与数量限制；[creature.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/06be12f9884d82d387cb6b38dc549eca71c3835a/src/creature.cpp) 按效果ID和身体部位查找，独立处理时长与强度 | 借鉴资格校验与效果事实的职责划分。当前每效果ID一份，不实现身体部位或强度叠层；装备物品与背包分清归属，容量失败回滚由本工程库存/宿主负责 |
| CDDA 同提交 | [effect.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/06be12f9884d82d387cb6b38dc549eca71c3835a/src/effect.cpp) 的decay先检查时长<=0，否则减一回合 | 本工程使用累计模拟秒和绝对expiresAt，恰好等于即失效；不能宣称等同来源回合边界 |
| FLARE `f9a17a266293a897a1d7eae2d54408b0de39af27` | [StatBlock.cpp](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/StatBlock.cpp) 的canUsePower检查资源、状态与装备标签；[Avatar.cpp](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/Avatar.cpp) 分别维护技能冷却 | 当前技能模块实时查询等级/装备标签/库存，并记录每技能的模拟秒冷却；不引入Avatar、动画帧、碰撞、UI或另一套资源状态 |
| FLARE 同提交 | [EffectManager.cpp](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/EffectManager.cpp) 汇总有效实例；非堆叠效果比较时长/强度，有限堆叠会淘汰旧实例 | 采用“实例事实→重新计算属性”职责，refresh/extend独立为可替换策略；不声称完整复刻FLARE叠层/护盾规则 |

关键失败语义已经交叉核对：FLARE的Avatar在调用activate后设置冷却，而 [PowerManager.cpp](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/PowerManager.cpp) 的activate可能因资源或目标条件返回false。调用点没有使用这个返回值，因此不能把“失败施法不耗冷却”归因于FLARE。本项目通过已有跨模块事务，把物品消耗、效果、战斗和冷却全部回滚，是独立适配的行为。

CDDA主项目许可仍为上述CC-BY-SA-3.0。FLARE的实际文件头声明GPL-3.0-or-later，[COPYING](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/COPYING) 提供GPL v3正文。这是来源许可记录，不表示其代码已进入本工程。CDDA来自原bobeff发现入口；FLARE为本批补充核对的实现，没有把它误称为当前列表中的条目。

具体能力、状态归属、时间边界与失败路径见 [装备技能指南](docs/loadout.md)。

## v0.8 队伍与多目标战斗采用范围

本轮实际核查 Tuxemon/Tuxemon 的固定提交 `9e6258ff726b786040a267e8bdbbf037b560285e`（所查development提交时间2026-09-28T17:01:39Z），原文件头标记GPL-3.0，[LICENSE](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/LICENSE)为GPL v3正文。这里只记录实际文件许可，不自行扩写为or-later。其Python/Pygame/client、全局事件及共享对象引用不适合直接装入本项目JSON状态/能力事务；本批独立实现TypeScript，没有复制来源源码、文本、素材或成套数值，没有新增依赖。研究缓存未收入发布源码或运行包。

| 实际源文件 | 核查结果 | 本项目采用与差异 |
| --- | --- | --- |
| [party.py](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/entity/party.py)、[monster.py](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/monster/monster.py)、[field_monsters.py](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/field_monsters.py) | 持久名单、上场Monster引用与自身current_hp分开；结束战斗不等于统一满血 | 领队HP继续用原vitals；伙伴HP只在party；战斗只保存我方ID，后备不治愈 |
| [action_queue.py](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/action_queue.py)、[sort_manager.py](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/sort_manager.py) | 类别、修正速度和随机平局排序后从末尾取行动；每次行动后重排；KO移除actor或target相关动作 | 本地可选名单或速度顺序，平局稳定，当前轮队列冻结，执行前按真实HP跳过；并非复刻上游随机/动态排序 |
| [session.py](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/session.py) | 区分上场目标与整个存活队伍，部分API集合去重且不保证稳定顺序 | 当前仅显式单敌目标；敌方候选为冻结出战名单中现存活队员，目标策略独立且返回重验 |
| [reward_system.py](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/reward_system.py)、[utils.py](https://github.com/Tuxemon/Tuxemon/blob/9e6258ff726b786040a267e8bdbbf037b560285e/tuxemon/combat/utils.py) | 击倒阶段发经验，训练师金额累计后在获胜时入钱包 | 保留本地胜利后显式claim；物品/经验/胜场/冷却/会话同一事务，不能把失败全回滚归因于上游 |

核查 [bobeff固定README](https://github.com/bobeff/open-source-games/blob/3a9ab8fc892a2cdadf8989a72ba7624a11e39cec/README.md)未找到Tuxemon，故记录为补充定向研究对象，未误称来自该目录条目。原Wesnoth等发现路径保持。完整研究、函数边界与证据限制见 [队伍源码研究](docs/party-source-research.md)。

## v0.9 商店与城镇经营采用范围

在已有固定来源上继续核查 FLARE `f9a17a266293a897a1d7eae2d54408b0de39af27` 的 [ItemManager.cpp](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/ItemManager.cpp)、[MenuInventory.cpp](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/MenuInventory.cpp)、[ItemStorage.cpp](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/ItemStorage.cpp)、[MenuVendor.cpp](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/MenuVendor.cpp)、[MenuManager.cpp](https://github.com/flareteam/flare-engine/blob/f9a17a266293a897a1d7eae2d54408b0de39af27/src/MenuManager.cpp)、MenuItemStorage/NPC调用与COPYING。文件头GPL-3.0-or-later，COPYING为GPL v3正文。Widelands固定提交 `29753773d9c130e2a6a835ee6a14ad2bf317371d` 的production_program.cc与bakery配方再核先检查全部消耗、等待和产出职责；文件头与README为GPL-2.0-or-later/GPL v2+。

FLARE已读路径的货币是库存物品，卖货收入没有从有限商人账户扣除；部分库存失败使用drop/补偿而非全事务回滚，Craft页面也不是本版商店有时长的库存生产。故只参考其价格/目录/库存职责，没有移植上述源码或原游戏数据。独立账户、精确库存分档总价、周期日历、营业表和本项目跨模块原子交易不能冒称上游现成实现。实际生产、库存、种植与宿主事务直接复用本仓库已有模块。

本批未增加依赖，未复制或翻译来源代码、素材和成套数值。源码研究原件保留在本地研究缓存，发布包不包含这些外部文件。12个固定源码/许可文件的读取范围、函数边界及差异见 [经营源码研究](docs/settlement-source-research.md)；这里记录研究来源许可，不构成对未来复制代码的重新授权。

## 主项目发布许可

主工程目前是用户的独立开发工程，package.json 标记 private / UNLICENSED；尚未替用户选择对外开源许可。此标记不改变上面第三方依赖的许可。后续确实移植其他来源的源码时，要按具体文件重新记录组合和分发条件。
