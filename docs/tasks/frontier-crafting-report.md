# Task 2 实现报告

记录：2026-11-07 00:19 北京时间（UTC+08:00），由 clock 工具的 2026-11-06 16:19:16 UTC 转换。

## 范围与实现

仅创建任务所有权内的以下代码文件，另写本报告；未暂存、提交、切换分支或推送：

- `src/modules/recipes.ts`：`recipes.catalog`，配方 schema、独立 get/list、自有键查询。
- `src/modules/crafting.ts`：`crafting.single`，可选地点依赖、单订单 start/collect/cancel/status、冻结批量投入/产出/开始和完成时间、真实库存事务、配方/库存/地点外部查询返回值校验。
- `tests/crafting.test.ts`：25 个真实宿主行为测试。主路径使用现有 inventory/capacity/time；外部 fixture 仅通过公开 ModuleDefinition 能力边界提供配方、地点、时钟及畸形响应，不断言 mock 调用。

共享时间适配直接导入 Task 1 的 `readSimulationTime`，未复制实现或新增时钟权威。模块定义、能力版本为 1.0.0，apiVersion/stateVersion 均为 1。

## RED / GREEN 证据

1. 先写 20 个制作测试，再执行 `node --test tests/crafting.test.ts`。
   - 2026-11-07 00:16 北京时间，退出 1；0 pass / 1 fail。
   - 实际失败：`ERR_MODULE_NOT_FOUND`，尚不存在的 `src/modules/recipes.ts` 导致测试文件加载失败。
   - 这是真实记录的缺失功能 RED，但属于导入错误，尚未进入行为断言；不将它描述为 20 个行为断言失败。
2. 实现两个模块、消费 Task 1 时间适配后执行相同命令。
   - 退出 0；20 pass / 0 fail，约 13.18 秒。
3. `npm run typecheck`：退出 0，无 TypeScript 诊断。npm 输出已存在的 `Unknown env config "http-proxy"` 警告。
4. 扩展外部库存/地点返回值、冻结订单双向检查、空闲配方/时钟校验与嵌套倒退取消检查后，再执行 `node --test tests/crafting.test.ts`。
   - 退出 0；25 pass / 0 fail / 0 skipped，约 16.14 秒。
5. 对三个新文件逐个执行 `git diff --no-index --check /dev/null <file>`，无空白错误输出；新文件比较的 diff 退出码为 1，未将其冒报为普通命令退出 0。

按 root 明确分工未重复执行整库测试或 Preflight；root 在全部所有者完成后执行一次集成 Preflight。本报告不声称全套测试已经通过。

## 已验证行为

- wood:4、配方 wood:2→plank:2、20 秒；第二次开始、提前领取及重复领取保持事务前快照；两批消耗 4、40 秒后产出 4。
- 后续输入不足撤销之前的输入扣除；多产物后项容量不足撤销前项产物；多投入退款后项容量不足撤销前项退款，订单保持可领取/可取消。
- start/collect 遵守非空地点限制，完成订单在异地也可取消；省略/空地点配置不需要地点提供者。
- 修改配方仍领取旧产物或退还旧投入；删除配方同样可领取或取消；恢复与时钟策略替换保留订单。冻结物品删除、容器无效、订单时间不合法、恢复时钟早于起点均拒绝。
- 配方名称/投入/产出/时长、批次数量、乘法溢出、时间累加溢出与精度损失都受校验；可正常使用小数秒。
- 外部 recipes get/list、inventory list/count、location describe/current 的必要返回字段与数值错误不能产生有效订单。
- 显式绑定时钟不受第二个时钟推进影响；无事件的畸形/倒退时钟更新被事务拒绝。
- 嵌套先推进后开工使用真实开始时间；同一事务内推进、领取、再次开工、推进、领取不会重复计算早先时间；取消不能借嵌套时钟倒退抹去订单基线。
- `toString`、`hasOwnProperty` 等合法自有键可以作为配方/物品 ID；缺少的原型同名配方不会被当作已存在。

## 自检与待办

已自行复核 owned 文件的 schema、公开能力边界、冻结状态、库存写入顺序和错误回滚，未发现待修复代码问题。没有修改 engine、contracts、registry、view 或其他所有者文件。

验证限制：最初 RED 是预期的缺模块导入错误，非已运行的失败行为断言；全量测试与集成检查由 root 执行。请 root 的 fresh review 重点核查外部提供者必要字段范围和共享时间适配集成。

## 修复轮次 1/5：活动订单期间的配方目录校验（review I1 / 指派 C1）

记录：2026-11-07 00:26 北京时间（UTC+08:00），clock 返回 2026-11-06 16:26:44 UTC。

已核对 reviewer 的实际代码路径：旧 `validate` 仅空闲时检查当前目录，活动订单可接受含未知物品的新配方，清空订单时才触发失败。按 root 澄清后的契约修复：当前目录始终检查，冻结订单另行检查，不要求原配方继续存在。因此无效重配会立即拒绝，原世界订单仍可正常取消或领取；删除原合法配方的既有行为继续有效。

本轮只修改 `src/modules/crafting.ts`、`tests/crafting.test.ts` 并追加本报告。

- RED（先加回归、尚未改生产实现）：`node --test --test-name-pattern='active paid jobs reject invalid catalog' tests/crafting.test.ts`，退出 1，1 test / 0 pass / 1 fail。实际断言失败为 `AssertionError: Missing expected exception.`，证明旧实现接受无效重配。
- GREEN（随后将目录验证移出 job 的 else 分支）：`node --test tests/crafting.test.ts`，退出 0，26 test / 26 pass / 0 fail / 0 skipped，约 17.92 秒。
- 新回归分别验证取消和领取路径：活动订单期间增加 `outputs:{missing:1}` 的无关配方，重配抛 `UNKNOWN_ITEM`，原世界完整快照保持不变；之后仍能退款或在 20 秒完成后领取。
- 已查看本轮完整 owned diff，并运行 `git diff --check -- src/modules/crafting.ts tests/crafting.test.ts`，无错误。既有配方编辑/删除、冻结退款/产物及 restore 测试全部继续通过。
- 按 root 要求未重复整套测试或 typecheck；未暂存、提交、切分支、推送或生成 reviewer。无新增已知 concern，等待 root fresh re-review。
