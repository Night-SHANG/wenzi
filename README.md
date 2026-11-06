# 模块化文字世界

**0.4.0-alpha.1 · 可运行开发工程**

这是独立的文字世界项目，与词条无限组合游戏分开。全部现有和未来系统、规则、内容、数据、表现与操作都按模块组织。仓库中的经营、战棋和叙事只是架构验证样例，不限制未来玩法。

当前可运行模块宿主、16 个内置模块定义、6 个世界配置和一个从外部文件加载的作者模块。作者可发现模块、复制世界、用标准 JSON Patch 修改装配、校验后导出并运行。界面使用独立文字视图与命令行适配器；正式游戏 UI 和完整玩法仍在继续开发。

源码仓库：[Night-SHANG/wenzi](https://github.com/Night-SHANG/wenzi)。当前 CI：[Modular runtime checks](https://github.com/Night-SHANG/wenzi/actions/workflows/preflight.yml)。仓库公开不代表主项目已选择开源授权协议；依赖许可见 `THIRD_PARTY.md`。

## 快速运行

运行需要 **Node.js 24.12.0 或更新版本**。已验证本地环境为 Linux、Node.js 24.22.1。源码开发和完整验证另外需要 Git、Python 3.11 或更新版本。首次从仓库开始：

```bash
git clone https://github.com/Night-SHANG/wenzi.git
cd wenzi
npm ci
npm run preflight
npm run build
```

完成构建后，或使用包含 `dist` 与运行依赖的已构建工程包时：

```bash
node dist/cli/index.js list
node dist/cli/index.js demo farm
node dist/cli/index.js demo tactics
node dist/cli/index.js demo story
node dist/cli/index.js play farm
```

Windows 可以在本目录打开终端执行相同命令，也提供 `run-demo.cmd` 和 `play-farm.cmd`。尚未在用户 Windows 真机验收。

重新验证与生成本地工程包：

```bash
npm run preflight
npm run build
node scripts/smoke-built.mjs
python scripts/package.py
```

Node 的类型擦除只负责运行 TypeScript；`npm run typecheck` 才检查类型。

## 创建自己的世界

下面流程使用同一宿主和普通 JSON 文件。路径包含空格时加引号：

```bash
node dist/cli/index.js modules
node dist/cli/index.js describe inventory.basic
node dist/cli/index.js fork farm --id author.my-farm --title 我的农田 --out my-farm.json
node dist/cli/index.js patch my-farm.json --patch examples/farm-authoring.patch.json --out edited-farm.json --run-demo
node dist/cli/index.js validate edited-farm.json --run-demo --json
node dist/cli/index.js play edited-farm.json
```

示例补丁将容量策略换成重量、容积、长度约束，并分别修改世界标题和文字视图标题。两种标题属于不同配置，工具不会根据名字猜测它们必须联动。模块目录包含能力、依赖、配置和操作 schema；外部 `--plugin` 模块使用同一目录和创作流程。

`validate`（别名 `check`）检查包结构、依赖装配、文字视图及存档恢复；只有带 `--run-demo` 时才执行并报告示范动作。`fork`、`patch` 在校验成功后才写输出，默认拒绝覆盖已有文件；明确需要原地修改时使用 `--overwrite`。检查产生的游戏状态不会写回世界的初始配置。

JSON Patch 支持 `add/remove/replace/move/copy/test`。建议在按数组位置修改模块前，用 `test` 检查目标实例 ID；版本变化导致位置不符时整批修改会失败，原文件保留。详细数据语义、公开 API 和外部模组例子见 `docs/authoring.md`。

## 现在能验证什么

| 世界配置 | 已有规则 | 验证目的 |
| --- | --- | --- |
| farm | 播种、生长、收获、出售、共享库存 | 多模块组成一个资源循环 |
| farm-physical | 同一世界使用重量、容积与长度约束 | 更换容量能力，保留其他系统 |
| farm-continuous | 按模拟秒推进 | 同一生长规则可使用不同时间模块 |
| farm-greenhouse | 独立生长规则配置 | 替换生长能力而不改宿主 |
| tactics | 格子移动、命中、伤害、双方回合、终局 | 宿主不要求经营、背包或时间模块 |
| story | 叙事节点、选择、终点 | 宿主不要求角色、战斗或时间模块 |

示例数值是作者测试配置，未进行正式平衡。连续时间模块接收显式秒数，尚未绑定真实帧循环。战棋双方可手动操作，尚无 AI、寻路或地形效果。

## 实际操作一轮

运行 `node dist/cli/index.js play farm` 后，逐行输入：

```text
do crops plant {"plot":"field-1","crop":"turnip"}
do clock advance {"steps":2}
do crops harvest {"plot":"field-1"}
do market sell {"item":"turnip","quantity":2}
save my-world.save.json
```

结果：消耗一个种子；两天后收获三枚芜菁；出售两枚获得 10 金币，库存剩一枚芜菁。`actions` 显示当前装配真正提供的动作及参数；`look` 显示文字视图；`load my-world.save.json` 恢复；`exit` 退出。

作物未成熟、库存不足或容器放不下时，动作失败并保留原状态。命令行退出不会自动保存，需使用 `save`。存储失败会显示错误，只有文件成功写入后才显示“已保存”。

## 在进度中更换模块

先在 farm 播种，再推进一天，然后输入：

```text
swap farm-continuous
do clock advance {"seconds":86400}
do crops harvest {"plot":"field-1"}
swap farm-physical
```

更换发生在新实例上；成功后 CLI 才切换。当前进度、物品和适用状态保留。迁移、依赖或容量校验失败时，旧实例继续可用。更换不等于任意不同语义都能自动兼容；能力版本、语义和状态迁移须相符。

代码 API 删除已有实例时必须在 `allowRemoved` 明确列出；CLI 的 `swap` 不自动丢弃实例。更换装配会清空有限命令回执，作者应开启新的命令 ID 会话。

## 新模块没有预设类型名单

`examples/custom-module.mjs` 是一个独立研究进度模块，宿主没有“研究系统”分支。它通过公开 manifest、commands、queries 注册：

```bash
node dist/cli/index.js demo examples/custom-world.json --plugin examples/custom-module.mjs
```

`--plugin` 可以重复使用。代码来自显式指定的可信本地文件，可以访问 Node 的能力；**当前没有不可信代码沙箱**。只导入世界 JSON 不会自动从网络下载或执行模块代码。

作者流程见 [docs/authoring.md](docs/authoring.md)。公共类型位于 `src/contracts.ts`，构建后的声明位于 `dist/contracts.d.ts`。所有内置系统也使用同样的公开接口。

## 工程结构

| 位置 | 职责 |
| --- | --- |
| src/contracts.ts | 模块、能力、命令、事件、状态与存档契约 |
| src/engine | 注册、依赖装配、单宿主事务、查询、事件队列、存档与迁移 |
| src/modules | 可替换的规则与文字视图定义 |
| src/adapters | 文字输出、文件和内存存储适配 |
| src/authoring | 世界包解析、复制、标准补丁与独立运行检查 |
| src/catalog.ts | 方便使用的内置目录，宿主不依赖它 |
| worlds | 数据形式的世界装配与示范动作 |
| examples | 外部作者模块及对应世界 |
| tests | 行为、异常、迁移、组合与 CLI 测试 |
| scripts | 可在本地运行的 Preflight 与检查 |

## 已实现的边界

核心认识版本化能力与 JSON 状态，不内置血量、时间或库存。能力按实例绑定；多个提供者存在时要明确选择。命令可嵌套调用其他能力，所有写入共享同一次事务；事件也在提交前处理。失败回滚整个事务。每个模块只能通过上下文写自己的状态，查询和读取返回独立副本。

存档保存世界配置、模块准确版本、状态格式、逻辑版本、事件序号和最近 128 条成功命令回执。重复命令 ID 在回执保留期内可重放结果；同一 ID 对应不同输入会拒绝。已过保留期、无 ID 或更换装配后的命令不具备这个去重保证。调用深度 64、每次事务事件数 1024，用于终止组合错误。

代码、模块身份或状态格式变化时需要显式迁移，迁移后再次校验。种植格式 v2 保存时间基准；缺少历史基准的旧版非空种植状态会拒绝自动迁移，以免猜测生长历史。保留原版本或编写有充分信息的迁移器后再处理。

## 尚未完成

正式浏览器视觉界面、可视化模组编辑器、模块下载与分发、不可信代码隔离、服务器权限模型、跨服事务、联机/MMORPG、实时枪战、空间流式加载与大规模性能验证，都还没有实现。当前保存文件没有加密签名；它是本地作者数据格式，不是反作弊机制。技术验证不证明长期玩法乐趣或产品完成。

成熟游戏的具体源码研究已保留，但尚未移植 CDDA、Wesnoth、Widelands 或 micropolisJS 的规则。核心基础校验直接复用 Ajv、semver，世界修改复用 fast-json-patch；游戏样例独立编写，用于验证承接规则所需的模块边界。详见 [THIRD_PARTY.md](THIRD_PARTY.md)。

本地实际检查结果在 `artifacts/`，工程包包含 `verification/`。CI 配置覆盖 Linux 和 Windows，实际结果以对应提交的 Actions 状态为准；提交或本地检查通过不等于远端 CI 已通过。设计与执行记录见 `docs/`。
