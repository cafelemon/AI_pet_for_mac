# Process And Progress

更新时间：2026-05-29

## 工作流程

1. 先确认任务属于文档、运行时、动作资产、profile、AI/Agent 接入、分发/开源预留中的哪一类。
2. 修改前检查当前文件和 `git status --short`。
3. 对动作/素材改动，同步 registry、motion catalog、motion sources、states config 和 progress docs。
4. 对 AI/Agent 接入改动，先写协议 contract，再接 Electron/renderer。
5. 对分发/开源相关改动，记录 license/provenance、权限和隐私影响。
6. 完成后运行与改动范围匹配的验证命令。
7. 更新进度和决策记录。

## 当前状态：V1.0.0

日期：2026-05-29

已完成：

- 冻结当前项目状态为 `V1.0.0`。
- 根 npm 版本号更新为 `1.0.0`。
- 整合 docs 架构。
- 明确 `MAJOR.MINOR.PATCH` 版本规则。
- 明确 `V1.1.0` 是首个 AI/Agent 接入版本。
- 明确未来差异化从资产表现升级为 companion kernel。
- 为 macOS/App Store、开源平台、profile package 和插件系统预留边界。

## 当前待办

- 跑一次完整 `V1.0.0` 验收命令并记录结果。
- 为 `V1.1.0` 设计本地 companion protocol schema。
- 实现 message validator 草案。
- 设计 reaction -> action id 映射表。
- 梳理 profile package manifest 字段。
- 补齐 P1-A 用户交互 source videos。
- 继续推进 `guofeng_ai` profile 素材完整度。

## 过程记录模板

```text
日期：
版本：
类型：MAJOR / MINOR / PATCH / docs / asset / protocol
改动：
影响范围：
验证：
风险：
后续：
```

## 下一次推荐切入

建议优先进入 `V1.1.0` 的协议底座，而不是继续堆素材数量。原因是：素材优势已经形成当前体验壁垒，但长期差异化要来自 AI/Agent 接入、消息安全、状态语义和可扩展 companion kernel。
