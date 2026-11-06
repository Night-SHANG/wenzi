# v0.4 世界创作与仓库接入

记录：2026-11-06 23:33 北京时间（UTC+08:00）。工程版本：0.4.0-alpha.1。

本页保留 v0.4 历史。该版已进入 GitHub main（f86be17），Actions run 42246209860 的 Linux/Windows 两组均成功；后续 v0.5 探索与生产进展见 [frontier-progress.md](frontier-progress.md)。

仓库由用户指定：[Night-SHANG/wenzi](https://github.com/Night-SHANG/wenzi)。此前 v0.3 工程与 Git 历史保留，本轮沿用同一独立模块宿主继续扩展。所有现有和未来能力仍需模块化。

## 当前实现

- 模块元数据目录和共享结构解析接口完成：ModuleRegistry.catalog、parseWorldDefinition、parseCommand。
- 世界包的复制、JSON Patch 修改、语义检查和暂存导出完成；配置修改不改动已有游戏存档格式。
- 作者命令行完成：modules、describe、fork、patch、validate/check；内置及外部模组均使用同一流程。
- 模块、包与命令的结构继续由原权威校验器负责；没有新增玩法类型枚举或第二套依赖解析器。
- 104 项行为测试、6/6 Preflight、严格类型检查、构建及 9 组构建产物运行通过。
- 两项模块审查及最终工程审查通过；JSON Patch 数组移动问题已修复并复审通过。最终审查无 Critical/Important，保留一项非阻断的命令参数错误格式改进。

## 执行记录

- 基线：6617a6f1ff1e02e9602da07af77b9548381dea75。
- 元数据与结构解析：87d7a875df2911464373787c7211d210c9cee59f。
- 世界创作与导出：bbf88dbc2a4b245aecea3934780364857b0ca3b0。
- 移动语义兼容修复：3ea09809f1a2ec116b9fc0059f17eeacba1f5b6b。
- CLI 与工程整合的最终提交以 Git HEAD 和仓库操作记录为准，避免在提交自身内伪造自引用 SHA。

根协调记录和测试证据见 `docs/tasks/authoring-integration-report.md`，范围与接口见本轮 spec/plan。最终分支审查报告在交付完成后归入同一 docs/tasks 目录。

仓库接入采用已连接的 GitHub 插件：命令行没有 GitHub 登录凭据。按原有提交顺序导入精确文件树，原始 SHA 写入新提交的 Source-Commit 说明；连接器重建的 GitHub 提交 ID 会不同。导入规则见 `docs/source-history.md`。只有全部源树逐一匹配后才更新 main。

已知小项：CLI 在严格参数解析之前发生的未知选项/缺失值错误仍可能输出纯文本 stderr，即使带 --json；退出码仍为 1。有效命令的结构化检查结果和执行错误不受影响。后续可补参数解析前的 JSON 模式识别，当前不影响数据保护或创作闭环。

## 后续范围

继续发展世界创作体验、关键视觉样板、正式文字界面、可持续游玩的示范世界和成熟游戏规则接入。当前没有图形编辑器、模块下载分发、即时输入/射击、多人或容量测试结果。GitHub Actions 使用 Linux/Windows 矩阵，真实远端结果必须以具体 commit 的运行状态为准。
