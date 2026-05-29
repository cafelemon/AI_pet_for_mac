# Acceptance Checklist

更新时间：2026-05-29

## V1.0.0 文档冻结验收

- [ ] 根版本号为 `1.0.0`。
- [ ] `README.md` 指向当前 docs 体系。
- [ ] `docs/00_overview.md` 说明当前冻结基线。
- [ ] `docs/01_prd.md` 说明产品目标、AI/Agent 方向、分发与开源预留。
- [ ] `docs/02_roadmap.md` 包含 `V1.1.0` AI/Agent 接入版本。
- [ ] `docs/03_architecture.md` 描述当前架构与目标协议架构。
- [ ] `docs/05_ai_coding_agent_guide.md` 能指导下一个 AI coding agent 接手。
- [ ] `docs/07_name_rule.md` 定义 `MAJOR.MINOR.PATCH` 规则。
- [ ] `docs/08_decisions.md` 记录 V1 冻结与未来方向决策。

## 当前运行时验收

建议命令：

```bash
npm run typecheck
npm run build
python3 scripts/verify_action_registry_runtime.py
python3 scripts/asset_check.py --strict --webm-strict
python3 scripts/pb2_video_pipeline.py check --skip-missing
npm run motion:progress
```

通过标准：

- TypeScript 无类型错误。
- Electron build 成功。
- registry/runtime contract 通过。
- 已完成 runtime actions 的 WebM/keyframe/source 路径完整。
- 缺失的 P1-A 和桥接动作只以 placeholder 形式存在，不被误判为 runtime ready。
- `docs/generated/profiles/legacy_real/action_progress.md` 与当前配置一致。

## 新动作接入验收

- [ ] source video 放入 progress doc 指定路径。
- [ ] `motion_sources.config.json` provider/matte/crop 信息正确。
- [ ] `motion_catalog.config.json` 包含 stage/category/playback/runtime 标记。
- [ ] `action_registry.config.json` 有 action path、webmPath、fallbackPath。
- [ ] `states.config.json` 包含需要的时长和播放规则。
- [ ] 生成 keyframe 与透明 WebM。
- [ ] `python3 scripts/asset_check.py --strict --webm-strict` 通过。
- [ ] `npm run motion:progress` 后 progress doc 更新。

## V1.1.0 AI/Agent 接入验收

- [ ] 有本地 protocol/discovery 设计文档或 schema。
- [ ] 有 `status`、`react`、`say`、`profile.list` 的 contract tests。
- [ ] `say` 有 message validator。
- [ ] 拒绝路径、URL、密钥、代码块、日志堆栈和长工具输出。
- [ ] `react` 只能触发白名单 reaction/action。
- [ ] Codex 或 MCP 至少跑通一个端到端 demo。
- [ ] 控制中心能显示 AI/Agent 接入状态。

## 分发/开源预留验收

- [ ] 新增 profile 或素材时记录 license/provenance。
- [ ] 不把私有素材与未来开源核心强耦合。
- [ ] 不硬编码用户本机绝对路径作为运行时依赖。
- [ ] 新增权限时记录用途和关闭方式。
- [ ] 新增网络能力时记录数据流向和隐私影响。
