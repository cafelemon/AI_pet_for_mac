# Desktop AI Companion（桌面 AI 伴随体）落地方案规划书 V2

## 一、项目目标

构建一套可长期迭代的桌面 AI 伴随体系统。

本项目不再依赖 Codex 自带 Pet 小窗口作为主要渲染载体，而是独立实现高清桌面伴随体。Codex 联动作为核心插件能力之一接入，桌宠本体则独立支持高清真人角色展示、状态反馈、提醒、天气、交互和后续扩展。

核心目标：

- 高清真人桌宠渲染，保持原色、原质感、大尺寸显示
- Codex / Agent 状态联动，显示运行、等待授权、完成、失败、思考、睡眠等状态
- 虚拟背景特效与真实人像融合
- 天气 / 提醒 / 日程能力
- 状态气泡与任务反馈
- 关键帧素材管理与多阶段动画升级
- 插件化扩展
- 从 A 阶段关键帧底座，逐步升级到 B 阶段完整动态实现，再到 C 阶段高级优化
- 最终形成成熟 Desktop AI Companion 产品

---

## 二、核心设计定位

### 2.1 为什么不继续依赖 Codex Pet

Codex 自带 Pet 更适合像素宠物或小尺寸状态提示，不适合高清真人角色展示。其显示窗口尺寸、渲染比例、缩放效果和 UI 约束都会限制真人桌宠的表现力。

因此新的方向是：

```text
Codex = 状态来源 / Agent 事件来源
Desktop AI Companion = 独立高清渲染与交互层
```

### 2.2 桌宠产品定位

```text
桌面 AI Companion
= 高清真人角色
+ 虚拟特效与道具
+ 状态感知
+ Agent 联动
+ 天气提醒
+ 日程事项
+ 插件系统
+ 本地交互
```

它不是一个单纯的动画贴图，而是一个可扩展的桌面 AI 交互入口。

---

## 三、总体架构

```text
Desktop AI Companion
│
├── UI Render Layer
│   ├── Sequence Renderer（PNG/WebP）
│   ├── Video Renderer（Transparent WebM）
│   ├── Live2D / Spine Renderer
│   ├── Bubble Renderer
│   └── Effect Renderer（粒子 / 小阴云 / 问号 / 杯子 / 小道具）
│
├── State Layer
│   ├── idle
│   ├── coding
│   ├── thinking
│   ├── waiting_auth
│   ├── success
│   ├── error
│   ├── reminder
│   ├── sleep
│   └── weather
│
├── Asset Layer
│   ├── keyframes/
│   ├── sequences/
│   ├── webm/
│   ├── effects/
│   ├── props/
│   └── live2d/
│
├── Plugin Layer
│   ├── Codex Plugin
│   ├── Weather Plugin
│   ├── Reminder Plugin
│   ├── Calendar Plugin
│   ├── Feishu Plugin
│   └── Knowledge Plugin
│
├── Local Service Layer
│   ├── FastAPI
│   ├── Scheduler
│   ├── State Watcher
│   ├── WebSocket Push
│   └── Local Config Manager
│
└── Data Layer
    ├── SQLite
    ├── assets/
    ├── config/
    ├── logs/
    └── runtime_state/
```

---

## 四、技术栈规划

## 4.1 UI 层

| 模块 | 技术 |
|---|---|
| 桌宠窗口 | Electron |
| UI 框架 | React + TypeScript |
| 状态管理 | Zustand |
| 动画方案 A | PNG/WebP Sequence + 关键帧切换 |
| 动画方案 B | Transparent WebM |
| 动画方案 C | Live2D / Spine |
| 气泡与浮层 | React Component / CSS Animation |
| 粒子特效 | Canvas / CSS / PixiJS 可选 |
| UI 通信 | WebSocket |

## 4.2 后端层

| 模块 | 技术 |
|---|---|
| 本地服务 | FastAPI |
| 数据库 | SQLite |
| 定时任务 | APScheduler |
| 状态监听 | File Watcher |
| 插件系统 | Python Plugin Loader |
| 配置系统 | JSON / YAML |
| WebSocket | FastAPI WebSocket |

## 4.3 外部接口

| 模块 | 来源 |
|---|---|
| Codex Hooks | `~/.codex/hooks.json` |
| Codex 状态文件 | `~/.desktop-ai-companion/runtime_state/codex_state.json` |
| 天气 | 和风天气 / 高德天气 |
| 日程 | Google Calendar / 飞书日历 / 本地 ICS |
| 消息 | WebSocket |
| AI 能力 | OpenAI / Local LLM |

---

## 五、目录结构规划

新增 `assets/keyframes/`，用于放置 A 阶段关键帧图片。后续 B 阶段可从关键帧扩展为 WebM 或序列帧，C 阶段再升级到 Live2D / Spine。

```text
desktop-ai-companion/
│
├── app/
│   ├── electron/
│   │   ├── main.ts
│   │   ├── preload.ts
│   │   └── window.ts
│   │
│   ├── renderer/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Companion.tsx
│   │   │   ├── Bubble.tsx
│   │   │   ├── StatusPanel.tsx
│   │   │   └── ContextMenu.tsx
│   │   ├── stores/
│   │   │   └── companionStore.ts
│   │   └── adapters/
│   │       ├── SequenceRenderer.ts
│   │       ├── WebMRenderer.ts
│   │       └── Live2DRenderer.ts
│   │
│   └── ui/
│       ├── styles/
│       └── themes/
│
├── backend/
│   ├── api/
│   ├── plugins/
│   │   ├── codex_plugin.py
│   │   ├── weather_plugin.py
│   │   ├── reminder_plugin.py
│   │   └── calendar_plugin.py
│   ├── services/
│   ├── scheduler/
│   └── runtime/
│
├── assets/
│   ├── character/
│   │   ├── reference/
│   │   └── cutout/
│   │
│   ├── keyframes/
│   │   ├── idle/
│   │   ├── coding/
│   │   ├── thinking/
│   │   ├── success/
│   │   ├── error/
│   │   ├── reminder/
│   │   ├── sleep/
│   │   ├── idle_reading/
│   │   ├── idle_yawn/
│   │   └── idle_hair/
│   │
│   ├── states/
│   │   ├── idle/
│   │   ├── coding/
│   │   ├── thinking/
│   │   ├── success/
│   │   ├── error/
│   │   ├── reminder/
│   │   ├── sleep/
│   │   ├── idle_reading/
│   │   ├── idle_yawn/
│   │   └── idle_hair/
│   │
│   ├── effects/
│   │   ├── fireworks/
│   │   ├── rain_cloud/
│   │   ├── question_mark/
│   │   ├── sleep_zzz/
│   │   └── bubble_arrow/
│   │
│   ├── props/
│   │   ├── computer/
│   │   ├── cup_bed/
│   │   ├── book/
│   │   └── fan/
│   │
│   ├── webm/
│   └── live2d/
│
├── data/
│   ├── sqlite/
│   ├── config/
│   │   ├── companion.config.json
│   │   ├── states.config.json
│   │   └── plugins.config.json
│   ├── logs/
│   └── runtime_state/
│
├── scripts/
│   ├── install_codex_hooks.py
│   ├── build_keyframe_index.py
│   └── asset_check.py
│
├── docs/
│   ├── prompts/
│   ├── asset_spec.md
│   └── state_design.md
│
├── package.json
└── README.md
```

---

## 六、人物状态与动作设计

本项目采用“真实人像 + 虚拟背景特效 + 道具融合”的表现方式。人物主体保持真人质感，动作和背景元素可以带轻微虚拟化，以增强状态辨识度。

### 6.1 状态动作总表

| 状态 | 触发场景 | 动作设计 | 虚拟背景 / 道具 | 气泡文案 |
|---|---|---|---|---|
| idle / 平时站立 | 默认状态 | 平时自然站立，间隔触发小动作，如打哈欠、顺头发、侧坐看书 | 可无背景，也可有轻微桌面氛围 | 可为空 / “待机中” |
| coding / 工作中 | Codex 正在运行 | 坐在小电脑前敲代码，注意力集中 | 小电脑、键盘、代码光效 | “正在运行...” |
| error / 失败 | Codex 报错或任务失败 | 鸭子坐，情绪低落或微微沮丧 | 背景小阴云下雨 | “出问题了” |
| success / 成功 | 任务完成 | 高兴地跳起来 | 背景有小烟花粒子 | “完成啦！” |
| sleep / 睡眠 | 长时间无任务 / 长时间不动 | 躺在小杯子里面睡觉 | 小杯子床、Zzz 效果 | “休眠中...” |
| thinking / 思考中 | Codex 长时间分析 / 暂无工具调用 | 趴着，双手撑着头，两个脚丫子在身后晃动 | 头上有大大的问号 | “我在想...” |
| reminder / 提醒 | 日程 / 事项提醒 | 一个手叉腰，一个手指向提醒气泡 | 提醒气泡、箭头、高亮提示框 | “该处理提醒了” |

### 6.2 状态设计原则

1. **状态差异必须明显**：不能只靠微表情。动作轮廓、姿态、背景特效要一眼能看出来。
2. **真人主体保持真实**：人物脸、肤色、发型、旗袍服装和整体气质保持一致。
3. **虚拟元素服务状态表达**：小电脑、小阴云、烟花、问号、小杯子、提醒气泡都用于增强识别，不喧宾夺主。
4. **A 阶段只做关键帧底座**：每个状态先有 1 到 3 张关键帧，验证显示、切换、气泡和联动。
5. **B 阶段再做动态动作**：将关键帧扩展为 PNG/WebP 序列或透明 WebM。
6. **C 阶段做高级优化**：Live2D / Spine、鼠标视线跟随、实时表情、粒子系统、动作融合。

### 6.3 A 阶段关键帧清单

| 状态 | 文件建议 | 数量 | 优先级 | 说明 |
|---|---|---:|---|---|
| idle | `assets/keyframes/idle/idle_01.png` | 1-3 | P0 | 默认站立与小动作备用帧 |
| coding | `assets/keyframes/coding/coding_01.png` | 1-2 | P0 | 小电脑前敲代码 |
| thinking | `assets/keyframes/thinking/thinking_01.png` | 1-2 | P0 | 趴着思考，问号 |
| success | `assets/keyframes/success/success_01.png` | 1-2 | P0 | 跳起 + 小烟花 |
| error | `assets/keyframes/error/error_01.png` | 1-2 | P0 | 鸭子坐 + 小阴云下雨 |
| sleep | `assets/keyframes/sleep/sleep_01.png` | 1 | P1 | 小杯子睡觉 |
| reminder | `assets/keyframes/reminder/reminder_01.png` | 1 | P1 | 指向提醒气泡 |
| idle_reading | `assets/keyframes/idle_reading/idle_reading_01.png` | 1 | P1 | idle 小动作：坐姿阅读 |
| idle_yawn | `assets/keyframes/idle_yawn/idle_yawn_01.png` | 1 | P1 | idle 小动作：打哈欠 |
| idle_hair | `assets/keyframes/idle_hair/idle_hair_01.png` | 1 | P1 | idle 小动作：整理头发 |

---

## 七、状态系统设计

## 7.1 状态定义

| 状态 | 说明 |
|---|---|
| idle | 空闲，平时站立，偶尔触发小动作 |
| coding | 正在运行任务，小电脑前敲代码 |
| thinking | 长时间处理中，趴着思考，头上问号 |
| waiting_auth | 等待用户确认，提示用户授权 |
| success | 完成，跳起，小烟花粒子 |
| error | 错误，鸭子坐，小阴云下雨 |
| reminder | 提醒，指向提醒气泡 |
| sleep | 长时间无任务，躺在小杯子里睡觉 |
| weather | 天气提示，后续独立扩展 |

## 7.2 状态来源

| 来源 | 状态 |
|---|---|
| Codex PreToolUse | coding |
| Codex PostToolUse | success |
| PermissionRequest | waiting_auth |
| 长时间无工具调用，但仍在任务中 | thinking |
| 长时间无任务 / 无活动 | sleep |
| 异常日志 / 命令失败 | error |
| Scheduler | reminder |
| Weather Plugin | weather |
| 用户手动切换 | 任意状态 |

## 7.3 状态优先级

当多个状态同时触发时，优先级如下：

| 优先级 | 状态 | 说明 |
|---:|---|---|
| P0 | waiting_auth | 等待用户确认最高优先级 |
| P1 | error | 报错需要及时展示 |
| P2 | reminder | 到点提醒 |
| P3 | coding | 正在执行 |
| P4 | thinking | 长时间处理中 |
| P5 | success | 完成反馈，短时展示后回到 idle |
| P6 | weather | 天气提示 |
| P7 | sleep | 长时间无任务后进入 |
| P8 | idle | 默认状态 |

---

## 八、气泡系统设计

## 8.1 气泡优先级

| 优先级 | 类型 |
|---|---|
| P0 | waiting_auth |
| P1 | error |
| P2 | reminder |
| P3 | coding |
| P4 | thinking |
| P5 | success |
| P6 | weather |
| P7 | sleep |
| P8 | idle |

## 8.2 气泡样式

```text
- dark translucent background
- white text
- rounded corners
- fade animation
- top / side anchor
- auto hide
- 支持箭头指向
- reminder 状态支持高亮提醒框
```

## 8.3 气泡文案示例

| 状态 | 文案 |
|---|---|
| coding | 正在运行... |
| thinking | 我在想... |
| waiting_auth | 需要你确认一下 |
| success | 完成啦！ |
| error | 出问题了 |
| reminder | 该处理提醒了 |
| sleep | 我先睡一会儿... |
| weather | 今天可能下雨，记得带伞 |

---

## 九、插件化设计

## 9.1 插件接口规范

```python
class Plugin:
    name: str

    async def setup(self):
        pass

    async def tick(self):
        pass

    async def shutdown(self):
        pass
```

## 9.2 插件列表

| 插件 | 功能 |
|---|---|
| codex_plugin | Codex 状态监听 |
| weather_plugin | 天气获取 |
| reminder_plugin | 本地提醒 |
| calendar_plugin | 日程同步 |
| feishu_plugin | 飞书通知 |
| knowledge_plugin | 本地知识问答 |

---

## 十、Codex 联动设计

## 10.1 状态文件

Codex hooks 不直接控制前端，而是写入统一状态文件：

```text
~/.desktop-ai-companion/runtime_state/codex_state.json
```

示例：

```json
{
  "source": "codex",
  "state": "coding",
  "task": "正在修改 renderer.tsx",
  "message": "正在运行...",
  "timestamp": "2026-05-06 16:20:00"
}
```

## 10.2 Hooks 映射

| Codex 事件 | 输出状态 |
|---|---|
| PreToolUse | coding |
| PostToolUse | success |
| PermissionRequest | waiting_auth |
| Stop | idle |
| 命令失败 / stderr 异常 | error |
| 超过阈值无工具调用 | thinking |

## 10.3 长时间无任务规则

| 情况 | 状态 |
|---|---|
| 任务仍未结束，但长时间无工具调用 | thinking |
| 没有任务，超过指定时间无活动 | sleep |
| 用户重新触发任务 | coding |

---

## 十一、天气与提醒能力

## 11.1 天气模块

功能：

- 获取当前城市天气
- 降雨提醒
- 高温提醒
- 低温提醒
- 空气质量提醒
- 天气气泡
- 后续扩展天气状态动作

建议数据源：

- 高德天气
- 和风天气

## 11.2 提醒模块

本地 SQLite 表：

```text
reminders
  id
  title
  description
  remind_time
  repeat_rule
  priority
  status
  created_at
  updated_at
```

提醒类型：

- 一次性提醒
- 每日提醒
- 每周提醒
- 工作日提醒
- 倒计时提醒

触发后桌宠进入 `reminder` 状态，动作是一个手叉腰，一个手指向提醒气泡。

---

## 十二、阶段规划

# PA 系列（方案 A：关键帧 + PNG/WebP 序列帧）

A 阶段目标是先搭建底座，核心是“能跑、能显示、能切状态、能联动 Codex”，不追求完整连续动画。

---

# PA0：素材与关键帧规范阶段

## 目标

建立关键帧素材目录、命名规范、状态动作规范和素材检查流程。

## 功能

- 新增 `assets/keyframes/` 目录
- 建立状态子目录
- 每个状态至少准备 1 张关键帧
- 保留原始照片到 `assets/character/reference/pa0_raw/`
- 生成 `1536x1728` 透明 RGBA PNG 规范关键帧
- 建立素材命名规范
- 建立素材检查脚本
- 明确真人主体与虚拟特效分层策略

## 交付

- 关键帧目录结构
- 关键帧命名规范
- 透明规范关键帧与 QA 总览图
- 状态动作清单
- 素材检查脚本

---

# PA1：最小可用版本（MVP）

## 目标

实现可运行桌宠基础能力。

## 功能

- Electron 透明窗口
- 高清真人桌宠显示
- 原色显示，不进行灰化处理
- 可拖拽
- 永远置顶
- PNG/WebP 状态切换
- idle 状态
- 配置文件系统

## 技术

| 模块 | 技术 |
|---|---|
| UI | Electron + React |
| 动画 | PNG/WebP |
| 配置 | JSON |

## 交付

- 可运行桌宠
- 支持高清大尺寸显示
- 不依赖 Codex

---

# PA2：状态系统版本

## 目标

建立状态切换与基础反馈系统。

## 功能

- idle / coding / thinking / success / error / reminder / sleep 状态
- 状态动画切换
- 状态气泡
- 动作增强
- UI 缩放
- 鼠标穿透控制
- 手动状态测试面板

## 交付

- 桌宠具有明显状态差异
- 气泡提示可读
- 手动切换状态验证通过

---

# PA3：Codex 联动版本

## 目标

接入 Codex Hooks。

## 功能

- hooks.json 自动安装
- codex_state.json
- 实时状态监听
- thinking 超时检测
- waiting_auth 状态
- success / error 状态反馈
- Codex 当前任务气泡

## 交付

- Codex 状态实时联动
- 开发过程可视化

---

# PA4：提醒系统版本

## 目标

加入本地事项提醒。

## 功能

- SQLite reminders
- 定时提醒
- 重复提醒
- 提醒动画
- 到点气泡
- 提醒优先级
- 右键快速新建提醒

## 交付

- 本地提醒能力
- 基础时间管理能力

---

# PA5：天气系统版本

## 目标

加入天气感知。

## 功能

- 天气 API
- 天气气泡
- 天气状态动画
- 温度提醒
- 降雨提醒

## 交付

- 天气联动桌宠

---

# PA6：任务中心版本

## 目标

加入任务管理。

## 功能

- 今日任务
- 任务状态
- Codex 当前任务
- 卡住任务提醒
- 最近完成记录
- 任务浮窗

## 交付

- 轻量任务中心

---

# PA7：交互增强版本

## 目标

增强角色交互。

## 功能

- 点击互动
- 鼠标跟随
- 右键菜单
- 双击状态面板
- 拖拽记忆
- 桌面边缘吸附
- 鼠标靠近触发小动作

## 交付

- 高交互桌宠

---

# PA8：插件化版本

## 目标

实现能力插件化。

## 功能

- 插件 Loader
- 插件生命周期
- 插件热加载
- 插件配置系统

## 交付

- 桌宠平台化

---

# PB 系列（方案 B：Transparent WebM / 完整动态实现）

B 阶段目标是把 A 阶段关键帧底座升级为完整动态动作，状态表现更自然、更有辨识度。

---

# PB1：WebM 渲染升级

## 目标

升级渲染表现力。

## 功能

- Transparent WebM
- 视频循环系统
- 高清动态动作
- 动作缓动
- 多状态过渡

## 交付

- 高质量真人动态桌宠

---

# PB2：状态动作完整实现

## 功能

- idle：站立 + 打哈欠 / 顺头发 / 侧坐看书随机小动作
- coding：小电脑前敲代码循环动作
- thinking：趴着双手撑头，脚丫子晃动，头上问号动态变化
- error：鸭子坐，小阴云下雨循环
- success：跳起来，小烟花粒子爆开
- sleep：小杯子里睡觉，Zzz 漂浮
- reminder：手叉腰，手指向提醒气泡

## 交付

- 所有核心状态具有完整动态表现

---

# PB3：动态 UI 系统

## 功能

- 动态气泡
- 任务浮窗
- 状态面板
- 半透明信息层
- 粒子效果层
- 道具层

## 交付

- 高级桌面 AI UI

---

# PB4：素材生产管线

## 功能

- 关键帧到 WebM 的生产规范
- 背景透明化流程
- 状态动作 QA
- 帧率 / 尺寸 / 文件体积控制
- 批量导入工具

## 交付

- 可重复生产动态素材的资产管线

---

# PC 系列（方案 C：Live2D / Spine / 高级优化）

C 阶段目标是进一步优化表现力、交互性和可维护性。

---

# PC1：角色骨骼化

## 目标

建立 Live2D / Spine 模型。

## 功能

- 图层拆分
- 骨骼绑定
- 头发动态
- 身体参数
- 表情系统

## 交付

- 可参数驱动角色

---

# PC2：实时交互版本

## 功能

- 鼠标视线跟随
- 眨眼
- 呼吸
- 情绪状态
- 动态动作融合
- 点击反馈

## 交付

- 高拟真 AI Companion

---

# PC3：成熟产品版本

## 功能

- 多角色
- 多人格
- AI 对话
- 语音系统
- 本地知识问答
- Agent 可视化
- 多窗口联动
- 飞书 / 日程同步

## 交付

- 完整 Desktop AI Companion 产品

---

## 十三、当前推荐起步方案

当前建议按以下顺序推进：

```text
PA0 → PA1 → PA2 → PA3
```

优先完成：

- 关键帧素材目录与规范
- 高清真人桌宠大尺寸显示
- 原色显示，不灰化
- 状态气泡
- 手动状态切换
- Codex 状态联动

暂不优先：

- Live2D
- 语音
- 多角色
- 云同步
- 完整连续动画

---

## 十四、核心设计原则

```text
状态与渲染解耦
插件与主程序解耦
能力与角色素材解耦
关键帧与完整动画解耦
真实人物与虚拟特效分层
RendererAdapter 统一渲染接口
所有状态通过 StateManager 管理
```

---

## 十五、最终产品形态

```text
Desktop AI Companion
= 独立高清真人角色
+ 虚拟背景特效和道具
+ 状态感知
+ Codex / Agent 联动
+ 天气提醒
+ 日程事项
+ 插件系统
+ 本地交互
+ 后续 AI 能力扩展
```
