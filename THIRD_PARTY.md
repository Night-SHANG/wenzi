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

## 主项目发布许可

主工程目前是用户的独立开发工程，package.json 标记 private / UNLICENSED；尚未替用户选择对外开源许可。此标记不改变上面第三方依赖的许可。后续确实移植其他来源的源码时，要按具体文件重新记录组合和分发条件。
