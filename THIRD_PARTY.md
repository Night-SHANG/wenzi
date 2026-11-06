# 第三方来源与当前采用范围

## 实际运行依赖

| 包 | 固定版本 | 包内声明许可 | 用途 |
| --- | --- | --- | --- |
| ajv | 8.17.1 | MIT | JSON Schema 校验 |
| semver | 7.8.5 | ISC | 模块能力版本范围 |

依赖树与完整版本、下载地址及 integrity 记录在 package-lock.json。分发包包含实际运行依赖自身的 LICENSE 文件。Ajv 的传递依赖包括 fast-deep-equal、fast-uri、json-schema-traverse、require-from-string，分别以包中许可为准。

开发依赖：TypeScript 5.9.3（Apache-2.0）、@types/node 24.0.0（MIT）、@types/semver 7.7.0（MIT）；不需要把编译器放进最终运行时。

官方来源：[Ajv](https://github.com/ajv-validator/ajv)、[node-semver](https://github.com/npm/node-semver)、[TypeScript](https://github.com/microsoft/TypeScript)、[DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)。

## 已研究但本批没有复制进来的游戏源码

| 项目 | 已研究职责 | 来源 |
| --- | --- | --- |
| CDDA | 容器约束、收纳、行动时间单位 | https://github.com/CleverRaven/Cataclysm-DDA |
| Wesnoth | 移动、命中、抗性、交战配置 | https://github.com/wesnoth/wesnoth |
| Widelands | 配方、需求、生产过程 | https://github.com/widelands/widelands |
| micropolisJS | 税收、预算、维护效能 | https://github.com/graememcc/micropolisJS |

发现入口为 [bobeff/open-source-games](https://github.com/bobeff/open-source-games)。实际文件、来源提交与许可记录在 [项目源码研究页](https://app.notion.com/p/410fbd029cd281eabb8bdcbeaa233a40)。这些研究是模块职责拆解的参考，不代表整个原游戏已完成接入。本批游戏样例独立编写，不使用这些项目的代码文件、美术、故事文本或成套数据。

随机样例使用常见 xorshift32 形式，具体算法和 seed 归一语义在 random.ts 中明确；它用于可复现验证，不用于密码学。

## 主项目发布许可

主工程目前是用户的独立开发工程，package.json 标记 private / UNLICENSED；尚未替用户选择对外开源许可。此标记不改变上面第三方依赖的许可。后续确实移植其他来源的源码时，要按具体文件重新记录组合和分发条件。
