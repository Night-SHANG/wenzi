# Task2 独立规格与质量审查

审查对象edcbfae..b9b1015；独立review_effects_v07。本文归档完整结论、发现与证据范围，压缩过程性措辞。

**规格通过；质量Approved。Critical0、Important0、Minor0。**

- 四实现文件/两测试/五exports均符合设计（effect-rules.ts:6、effect-duration.ts:25–26、effects.ts:71、attributes.ts:30）。
- refresh先验证now+duration的精度再保留更长旧deadline；extend也验证保留deadline后的加法。两策略仅接受准确双定义ID/1.0.0/stateVersion1空对象迁移（effect-duration.ts:9–18）。
- 当前目录独立规范化、list/get比对、重复ID拒绝；冻结名称/修改/开始/截止不要求当前目录继续存在，重新施加采用新条款（effects.ts:18、29、42、82）。
- 状态observedAt/active与查询shape一致；等号到期、查询不清理、命令清理、time事件来源过滤明确（effects.ts:51、67、73、79、92）。
- 时钟基线取observedAt与所有startedAt最大值；带符号汇总每步检查；外部时长错误/不前进/缩短旧时长均拒绝（effects.ts:42、56、81）。
- 属性保留基础字段、可选装备与效果独立可缺、省略字段以0为基础、key授权包含0修改、每步安全整数和最终非负、不保存总值或写经验（attributes.ts:5、10、18、31）。

优点：目录使用Map和own避免继承名混淆；写状态前构造并校验pruned候选，跨调用失败仍依赖原事务；字面预期refresh30/extend40、攻击8/防御2独立可算；null坏返回的fixture不被空值回退掩盖（effects.test.ts:40、attributes.test.ts:15–27、47）。

具体风险核查仅查看capacity.ts:4、13、15（有限小数秒/own）、simulation-time.ts:5（单位和倒退）与contracts.ts:77（迁移签名）。没有重跑已记录25/25测试；无警告/跳过。缺失的截断diff仅从同一package补读。无文件/Git修改或子代理。真实装备/技能组合、注册与消费者仍须root集成门禁，报告明确边界。
