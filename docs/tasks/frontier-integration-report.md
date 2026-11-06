# v0.5 根整合与验证报告

记录：2026-11-07 00:39 北京时间（UTC+08:00）。基线 f86be17cf09323923b0fe747e6d766a292ad360b，分支 feat/frontier-loop。

## 实现

根负责独立文字视图、六模块汇总及内置目录注册、frontier/continuous 世界、真实游玩和作者工具集成、包版本、来源记录与文档。核心宿主、公共底层契约、CLI 实现未改动；没有新增依赖。新生产/采集规则分别由两个并行所有者完成，范围审查后各修复一项 Important 并通过复审。

文字视图通过 capability 绑定查到动作实例 ID，通过查询获得道路、采集点和配方 ID；规则移除视图后仍可完整运行。外部市场数字异常不会悄悄显示成合法状态。消费时间使用同一模块公共适配器，未绑定真实墙钟。

## 根负责部分的 RED/GREEN

1. 在增加世界和目录接线前写 `tests/frontier.test.ts` 并运行 `node --test tests/frontier.test.ts`：5 项失败，均为明确断言 `frontier must be a discoverable world`，不是拼写错误。
2. 加入视图、世界和目录后，`node --test tests/frontier.test.ts tests/release-evidence.test.ts`：8/8 通过，含 5 个探索集成行为与 3 个真实发布证据检查。
3. 新增外部市场负金币渲染边界测试；`node --test --test-name-pattern='malformed external market' tests/frontier.test.ts` 实际失败，`Missing expected exception`。增加数值和必要字段验证后 `node --test tests/frontier.test.ts`：6/6 通过；typecheck 通过。
4. 现有作者目录测试从固定数量改为验证新能力可发现，避免把扩展数量写成契约。release-evidence 的小型 CLI 协议 fixture 仅用于真实打包指纹/过期拒绝测试，补齐新增 smoke 路由；它不作为玩法正确性证据，真实编译后 CLI 另行运行。

## 统一检查

- `env -u npm_config_http_proxy -u NPM_CONFIG_HTTP_PROXY npm run preflight`：退出 0，154 tests / 154 pass / 0 fail / 0 skipped；6/6 项通过，严格 TypeScript 检查与全部 8 世界运行恢复通过。
- `env -u npm_config_http_proxy -u NPM_CONFIG_HTTP_PROXY npm run build`：退出 0，构建成功。
- `node scripts/smoke-built.mjs`：退出 0，13 组通过。基本世界名单从 CLI list 自动发现，不再遗漏新增配置；所有操作在独立临时工作目录运行。
- 实际交互 play frontier 完成 16 次示范动作，保存到含空格路径；再移动/采集，载入前存档，重新保存后与原快照完整一致。未出现操作失败文本。
- 改写探索世界经 fork/patch/demo 后得到 18 金币、木料 2，与补丁把采集数量从 3 改成 4 的独立预期一致。

首次单独 typecheck 输出过既有 npm `Unknown env config "http-proxy"` 环境警告；整合验证仅对当前检查进程去掉该配置变量，没有修改项目网络或依赖设置。最终统一日志没有这条噪声。

证据：`artifacts/frontier-preflight.log`、`frontier-build.log`、`frontier-built-smoke.log`、`preflight.json`、`built-smoke.json`。两份内容指纹见 `docs/frontier-progress.md`；它们覆盖对应源代码/配置/脚本/依赖或构建产物，不包含文档和 Git 元数据。检查后未改动对应输入。

## 已完成范围审查

- [探索实现报告](frontier-exploration-report.md)、[探索初审与复审](frontier-exploration-review.md)：外部 location.describe 与库存引用响应形状、身份校验已修复，18 项范围测试通过，复审无新增问题。
- [制作实现报告](frontier-crafting-report.md)、[制作初审与复审](frontier-crafting-review.md)：当前配方目录与冻结订单独立验证，坏配方配置不再延迟到领取/退款时阻塞；26 项范围测试通过，删除原配方仍可完成旧订单。
- 制作实现者如实记录首次 RED 是缺模块导入失败，没有宣称 20 条行为断言当时已执行失败；新增修复回归确实观察了行为断言失败。

## 交付边界

最终整批 fresh review 已在根整合提交 2e5e696 后完成，Task 3 规范、质量和整批源码均获 alpha 发布通过，无 Critical/Important 未决项。完整报告见 [frontier-final-review.md](frontier-final-review.md)。保留外部采集地点错误被过滤、含空白实例 ID 的提示无法被通用 CLI 解析，以及已有早期参数错误不遵循 --json 三项 Minor；均未导致状态修改或内置世界运行失败，不扩大本批去改通用 CLI。

独立工程包验证在最终文档归档后执行，结果补存交付记录；此报告不预先宣称打包核验通过。源码通过 GitHub 连接器导入精确 tree，使用预期 main SHA 与非强制更新；新 CI 不主动轮询。

这批没有发布 Stable/Release、移植完整第三方游戏、实现正式图形 UI 或验证 Windows 真机。上一版 Linux/Windows 托管 run 42246209860 成功只记为基线事实。未清理用户工件或 Git 分支。
