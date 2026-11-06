# 模块作者指南

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
