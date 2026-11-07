# 模块作者指南

## 世界作者：从发现模块到运行作品

构建后使用 `node dist/cli/index.js`，开发环境也可直接使用 `node src/cli/index.ts`。全部命令都沿用公开模块契约；新能力无需进入固定的玩法分类。

| 操作 | 命令 | 结果 |
| --- | --- | --- |
| 查看已注册模块 | `modules --json` | 模块 manifest、配置/状态 schema、命令/查询 schema、事件、迁移支持 |
| 查看一个模块 | `describe inventory.basic --json` | 指定模块的独立 JSON 描述；未注册时明确失败 |
| 派生世界 | `fork farm --id author.my-farm --out my-farm.json` | 复制初始配置，保留模块实例、绑定和演示；不复制某次游玩的进度 |
| 修改世界 | `patch my-farm.json --patch changes.json --out next.json` | 在副本上按顺序修改，再检查完整候选世界 |
| 检查世界 | `validate next.json --run-demo --json` | 结构、装配、文字视图、可选演示和存档恢复的实际结果 |
| 运行作品 | `play next.json` 或 `demo next.json` | 使用已有运行入口；无需另写一套游戏启动器 |

`check` 与 `validate` 完全同义。`--title`、`--world-version` 可用于 fork；未指定时保留原值。所有需要模块的命令支持重复 `--plugin path/to/module.mjs`。目录读取不会运行模块的 initialState、命令、查询或事件钩子，但显式加载代码文件本身仍是可信本地代码执行。

导出默认不覆盖已有路径。只有显式 `--overwrite` 才替换已有输出，也支持源路径与输出路径相同。结构、装配或补丁失败时不写文件；文件在同一目录暂存、同步后再发布。默认防覆盖使用文件硬链接发布，因此不支持硬链接的文件系统会明确报错并保留既有文件；显式覆盖使用重命名。没有声称跨文件系统事务或断电后的目录持久化保证。

## 世界包和补丁

WorldPackage 格式 1 只有 `format`、`world`、`demo` 三个顶层字段。`world` 和每个 demo 命令复用宿主结构校验；模组参数由各自 schema 和 validate 约束。未知顶层字段会拒绝，防止写错字段却被默默忽略。

补丁文件是 RFC 6902 操作数组，路径从整个世界包开始，例如：

```json
[
  { "op": "test", "path": "/world/modules/0/id", "value": "capacity" },
  { "op": "replace", "path": "/world/modules/0/module", "value": "capacity.physical" }
]
```

数组索引随前面的操作变化，因此建议先 test 实例 ID。对象中的 `/` 和 `~` 分别写作 `~1` 和 `~0`。数组末尾追加使用 `-`；move 的目标按删除源值后的文档解析。数据中的数字键仍可作为普通对象键。完整可运行示例在 `examples/farm-authoring.patch.json`。

适配器允许六种标准操作，并保留主项目的 JSON 限制：不读取继承属性，不允许 `__proto__`、`constructor`、`prototype` 路径或数据键，数组索引不能超过 2147483647。其他普通 JSON 键（例如自身的 `hasOwnProperty`）可正常处理。标准操作执行交给 fast-json-patch；输入、补丁值及执行候选均与调用者数据分离。一个后续 test 失败不会留下前半段修改。

默认检查不会运行 demo。带 `--run-demo` 时在临时世界执行每一步，检查最终文字视图，再验证快照恢复。失败报告包含阶段、错误码和可用的一基 demo 步骤；JSON Patch 操作错误使用从 0 开始的操作索引。检查不写存档，也不会把演示末尾状态变成作品初始状态。

外部模块也能派生和检查：

```bash
node dist/cli/index.js fork examples/custom-world.json --id author.my-research --out my-research.json --plugin examples/custom-module.mjs
node dist/cli/index.js validate my-research.json --run-demo --json --plugin examples/custom-module.mjs
node dist/cli/index.js play my-research.json --plugin examples/custom-module.mjs
```

## 可复用的作者 API

`ModuleRegistry.catalog()` 返回注册时捕获的模块描述副本。`parseWorldDefinition`、`parseCommand` 是宿主拥有的纯结构解析入口，不运行模块钩子。

`src/authoring/packages.ts` 导出 `parseWorldPackage`、`cloneWorldPackage`、`inspectWorldPackage`；`src/authoring/patch.ts` 导出 `patchWorldPackage`。parse/clone/patch 负责结构与数据变换，语义检查由 inspect 使用正式宿主完成。文件导出适配器 `writeWorldPackage` 负责字节发布；调用方必须先通过语义检查。CLI 已执行这条完整链路。后续可视化创作工具复用这些接口。

## 通用操作输入与组合文字界面

交互 CLI 支持完整 Command JSON，实例 ID 和操作名含空格、引号或中文时也可寻址：

```text
do {"target":"地图 \"节点\"","action":"move","input":{"to":"forest"}}
```

既有 `do location move {"to":"forest"}` 简写继续可用，包括以 `{` 开头的合法实例名。完整有效 JSON 优先采用 JSON 形式；仅 JSON 语法解析失败时才尝试旧简写，已解析但结构不合法的命令不会回退。通用文本适配器 `src/presentation/actions.ts` 复用宿主 `parseCommand`，只负责文本编码与解析，不执行玩法；`formatActionCommand` 和 `boundActionCommand` 生成与解析器一致的提示。JSON 形式拒绝未知命令字段、非对象 input 和不合法 JSON，未执行的输入不会修改世界。`--json` 的早期参数解析错误也采用结构化输出，`--` 之后的同名文字仍按位置参数处理。

`view.campaign.text` 通过明确绑定的 `text-view` 能力组合 `view.frontier.text`，再展示成长、生命、遭遇和任务。组合者无需读取另一个视图的私有实现或改动规则状态。由于两个实例均提供 text-view，必须明确指定基础视图绑定，避免歧义或自我调用。

探索视图升级到1.0.1并显式接受原1.0.0的空状态；这不是把任意旧状态清空的通用迁移。完整的新能力接口、冻结任务与战利品语义见 [campaign.md](campaign.md)。

v0.7 的 `view.loadout.text` 继续组合小镇视图并展示装备、属性来源、效果剩余秒数与技能可用原因。`view.campaign.text` 1.1.0 可绑定独立 attributes，未绑定时保持原成长属性；同样只接受准确的旧版空状态。`encounters.duel` 1.1.0 增加 strike 和可选 attributes，旧战斗/待领奖/冷却/战绩通过显式1.0.0迁移保留。两种 effect-duration 策略支持准确版本的空状态互换，不重算已有效果到期时间。

装备和技能创作示例：

```bash
node dist/cli/index.js describe equipment.slots --json
node dist/cli/index.js describe skills.catalog --json
node dist/cli/index.js fork loadout --id author.my-loadout --out my-loadout.json
node dist/cli/index.js validate my-loadout.json --run-demo --json
node dist/cli/index.js play my-loadout.json
```

可以修改槽位、装备条款、技能资格/消耗/冷却、效果目录和持续时间策略。当前 attributes.additive 的 keys 指定允许修改的属性；示范只有 attack/defense，非法 maxHp 修改会明确拒绝，不隐式改变生命上限。技能模块依赖 encounters@^1.1.0 的 strike 语义，不能把只同名的旧1.0.0能力当作等价替代。完整契约、时钟单位与已有状态处理见 [loadout.md](loadout.md)。

## 选择最小的独立职责

一个模块可以提供一项能力，也可以组合多个子模块。判断依据是能否独立替换或扩展，不要求把每个函数做成插件。任意新系统都适用这条原则，代码没有预先穷举玩法类型。

使用 `ModuleDefinition`：

```typescript
import type { ModuleDefinition } from '../contracts.ts';

export const example: ModuleDefinition = {
  manifest: {
    id: 'author.example', title: '示例', version: '1.0.0',
    apiVersion: 1, stateVersion: 1,
    provides: { 'author-capability': '1.0.0' }
  },
  initialState: () => ({ count: 0 }),
  commands: {
    increment: {
      schema: { type: 'object', additionalProperties: false },
      execute(ctx) {
        const state = ctx.state<{ count: number }>();
        ctx.write({ count: state.count + 1 });
        ctx.emit('example.changed', { count: state.count + 1 });
        return { count: state.count + 1 };
      }
    }
  }
};
```

完整的外部文件示例还包含配置、状态与命令参数 schema，以及独立文字查询。它可从 `--plugin` 加载。

## 声明与绑定

需要另一个能力时，在 manifest 中声明 `requires: { inventory: { version: '^1.0.0' } }`。世界实例填写 `bindings: { inventory: 'warehouse' }`，将该能力绑定到名为 warehouse 的实例。同一世界中的另一个模块可以绑定到 playerInventory。

唯一兼容提供者可以自动解析；多个兼容提供者需要明确指定。能力名称相同只是入口，还必须遵守同样的命令、查询、事件、单位和行为约定。新增语义可以扩展能力版本或增加适配模块，不能悄悄改写其他模块的私有状态。

## 状态与消息

- `ctx.state()`：取得本实例的独立状态副本；修改副本不会提交。
- `ctx.write(next)`：在当前事务中写本实例状态。
- `ctx.call(capability, command, input)`：调用已绑定提供者的命令，共用当前事务。
- `ctx.query(capability, query, input)`：通过公开查询读数据。
- `ctx.emit(type, payload)`：将事件排入事务队列，source 由宿主填写。
- `ctx.provider(capability)`：取得绑定实例 ID，用于核对事件来源。
- `ctx.fail(code, message)`：使事务失败；不能靠捕获嵌套错误保留部分写入。

命令、事件处理和 validate 均为同步函数。不要在钩子里使用异步写入、Date.now 或 Math.random 驱动确定性规则。时间和随机性使用独立能力来源；环境 IO 应置于宿主外的适配器中。

## 时间与事件顺序

嵌套命令立即调用，事件排队到最外层命令返回后再处理。因此依赖时间的模块必须保存时间基准，不能把后来收到的每个 delta 无条件分配给当前全部对象。播种、生成和完成检查应使用自己绑定的时间域；多个提供者并存时检查 event.source。

接口以模拟秒为示例单位，具体规则可以定义其他时间域，但转换必须显式。画面帧、行动次数、回合和世界一天不能隐式互换。

## 替换与保存

配置和状态是不同数据。配置在世界包中，状态由 `initialState` 初始化。为两者提供 JSON Schema，复杂跨能力不变量在纯 `validate` 中检查。

`restoreWorld` 和 `reconfigureWorld` 会检查模块身份、版本与 stateVersion。不同实现需要显式 `migrate(previous, config)`；迁移结果还会接受 schema 和 validate 检查。不要把无法解释的旧状态替换成默认值。

增加新实例会初始化它；删除旧实例需要 `allowRemoved`。CLI 只在新装配和文字视图均成功后切换当前实例。文件和内存存储通过 `SnapshotStorage` 接口替换。

## 参考能力语义

| 能力 | 单位与主要接口 |
| --- | --- |
| capacity | 重量 g、容积 ml、长度 mm；check 判断最终容器内容是否满足约束 |
| inventory | 数量为非负安全整数；add/remove/transfer 修改，list/count 查询 |
| time | 模拟秒；now 查询；推进后发布 time.advanced |
| growth-rule | progress 返回无量纲生长增量；种植负责累计与成熟 |
| planting | plant/harvest；plots 查询；库存通过绑定能力处理 |
| random | next 返回 [0,1) 的值，随机源自己保存状态 |
| text-view | render 返回 title 和 lines，不直接改变规则状态 |

这张表只描述当前样例，新增能力不需要修改宿主枚举或特殊分支。

## 接入外部成熟代码

先记录实际来源提交、文件和许可；识别输入、输出、单位、状态归属与原引擎依赖。能保留的实现放在适配器之后，耦合部分拆成显式能力。复制或移植源码的来源与许可必须保留，不因加上模块接口而改变。

至少准备：来源样例输入输出、拒绝和边界场景、保存恢复、与其他模块组合、替换实现后的语义对照。数值必须连同公式、时间尺度和资源循环迁移；一个成熟游戏的数字不直接构成另一个世界的平衡结论。


## v0.8 队伍、目标和兼容来源

新世界 `party` / `party-continuous` 使用同一 `world.party` 身份、35个实例与63个示范动作。`party.roster` 只保存伙伴冻结条款、生命和出战名单，领队继续读原 `vitals.pool` / `attributes.additive`。`vitals.party-member` 只保存恢复对象，现有 `recovery.items` 原样支付物品并治疗选中队员。创建装配时必须把 party 的 vitals 显式绑定原领队生命池，把 recovery 的 vitals 绑定队员选择适配器，避免循环或歧义。

```bash
node dist/cli/index.js describe party.roster --json
node dist/cli/index.js describe battles.party --json
node dist/cli/index.js fork party --id author.my-party --out my-party.json
node dist/cli/index.js validate my-party.json --run-demo --json
node dist/cli/index.js play my-party.json
```

`initiative.listed` 与 `initiative.speed`、`targeting.first` 与 `targeting.lowest-hp` 各自是独立能力。策略支持准确空状态迁移；换顺序只影响下一回合，换目标策略影响下次敌人行动。改顺序可能需要同时改 demo 中的 actor；validate --run-demo 会实际执行，错误的行动者会拒绝，而非替作者偷偷改脚本。世界 JSON 仅携带配置，不会下载或执行新代码。

群战没有假装提供旧 `encounters` 的单敌字段。它提供 `party-battle`、`combat-action` 和 `encounter-records`。skills1.1 增加可选 `battleSource`（auto/encounters/combat-action）；quests1.1 增加可选 `victorySource`（auto/encounters/encounter-records）。默认auto仅接受唯一来源；两者同时可用时要显式选协议，再通过 bindings 选准确实例。不同技能或任务日志可以使用不同来源；不把同名遭遇的胜场自动相加。

旧 skills1.0 的冷却、quests1.0 的接取基线与完成记录均有准确身份迁移；loadout文字视图1.1仅接受原1.0的空状态；duel1.2接受本定义1.0/1.1的stateVersion1。未知版本不清空、不猜测。旧世界不包含新能力，继续使用原行为。新能力详细输入/输出、技能targets逐行数据、冻结状态与失败语义见 [队伍设计](superpowers/specs/2026-11-07-party-design.md)。

同一组角色的 party、battles.party、可选 encounters.duel 必须明确共享一个 `battle-session.exclusive`。所有非空战斗阶段，包括胜利待领取和失败，都持有会话；错误释放会被战斗不变量拒绝并回滚。不同角色可以用不同会话，宿主不猜测作者是否错误地让两个会话共享同一生命池。向活动旧战斗增加空会话会拒绝；先结束再装配。移除持锁控制器前先完成/撤退；已经明确移除留下的孤立owner只能显式 release，不自动丢弃。

## v0.9 纯经营装配与独立工坊

`settlement` / `settlement-continuous` 使用同一 `world.settlement` 身份，每个21实例、32示范动作。钱包、商店内容、价格、交易、日历、营业策略和文字表现分别是公开能力；现有库存/制作/种植模块不需要为经营重写。所有准确字段与单位见 [经营契约](superpowers/specs/2026-11-07-settlement-design.md)，完整路线见 [河岸城镇](settlement.md)。

```bash
node dist/cli/index.js describe commerce.shop --json
node dist/cli/index.js describe availability.schedule --json
node dist/cli/index.js fork settlement --id author.my-town --out my-town.json
node dist/cli/index.js patch my-town.json --patch examples/settlement-authoring.patch.json --out cheaper-seed-town.json --run-demo
```

交易目录可由多个商店共享，每个 `commerce.shop` 仍显式绑定自身inventory/wallet/location资源域。整个目录的list/get条款必须一致，只有当前店的账户、容器、商品与地点要求存在于本实例的绑定域。钱货只能从这些真实提供者转移；报价不会锁定旧价格，实际成交重新查询。给库存不足的买单估价是合法的，但 `available=false`，命令拒绝。

`seedworks` 与 `kitchen` 是同一 `crafting.single` 定义的两份装配；前者读商店容器和留种配方，后者读玩家容器和餐食配方。二者共用权威时钟，但支付、订单和产物隔离。`view.workshop.text` 的每个实例只绑定一个工坊、一个配方目录和一个前级视图；标题配置标注本工坊，最终世界标题保留前级标题。视图生成真实绑定的JSON命令，支持含空格、引号和Unicode的实例名。

新 `wallet.accounts` 配置中的coins只初始化新世界，不重置存档余额；账户集合变化需要明确迁移。价格/营业策略的准确1.0/state1空状态可互换，未知版本或非空历史拒绝。营业时段只控制新交易，已付款制作继续计时与领取。日历可以重新解释累计秒的周期位置，不保存第二套时间。

任务日志升级至1.2.0：progression是可选绑定；若任何当前目录或已接取冻结条款承诺正经验，仍强制需要有效成长能力。把当前经验改成0或删除目录不能抹掉旧承诺。准确1.0/1.1任务状态升级保留完整历史。旧 `market.fixed` 与新增账户/库存域没有隐式跨世界迁移。
