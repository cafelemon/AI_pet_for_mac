# Desktop AI Companion PB3 动作补强整合方案

## 一、方案定位

PB3 的核心不是单纯“多做几个动作”，而是把桌宠从“状态图片播放器”升级为“有行为逻辑的桌面伴随体”。

当前 A 阶段已经完成关键帧素材池，PB 阶段开始进入 WebM / 视频动态化。PB3 作为动作补强阶段，主要解决三个问题：

1. **动作单调**：避免桌宠长时间只停留在一个静态或单循环状态。
2. **状态不够像活物**：通过随机待机动作、任务过渡动作、失败后鼓励动作等，提升陪伴感。
3. **Codex / Agent 场景表达不足**：让“运行中、检索中、等待确认、失败、完成、休眠”等状态有明显视觉反馈。

本方案保留原有核心动作，吸收新增动作体系，但不建议一次性全量制作 22 个动作，而是分批推进，避免视频素材、状态逻辑和工程复杂度同时爆炸。

---

## 二、当前素材与阶段判断

当前已具备 10 张 A 阶段关键帧素材：

| 序号 | 状态/用途 | 结论 |
|---|---|---|
| 1 | idle / 默认站立 | 可作为角色基准图 |
| 2 | success / 成功跳起 | 可用，后续可重做更克制版 |
| 3 | yawn / 打哈欠 | 可用 |
| 4 | hair / 顺头发 | 可用 |
| 5 | reading / 侧坐看书 | 可用 |
| 6 | reminder / 指向气泡 | 可用，右侧留白好 |
| 7 | coding / 敲代码 | 可用，适合工作状态 |
| 8 | thinking / 趴着思考 | 可用，问号辨识强 |
| 9 | error / 鸭子坐小阴云 | 可用，失败状态清晰 |
| 10 | sleep / 小杯子睡觉 | 可用，道具辨识强 |

当前可以进入 PB 阶段的视频化流程。CSS 伪动态已经具备，因此下一步重点是用图生视频生成 MP4，再转 WebM 并接入状态播放器。

---

## 三、PB 阶段总体路线

```text
A 阶段：关键帧 PNG
  ↓
PA+：PNG + CSS 伪动态
  ↓
PB1：核心循环状态 WebM
  ↓
PB2：核心反馈状态 WebM
  ↓
PB3：动作补强与行为逻辑
  ↓
PC：Live2D / Spine / 高级交互
```

本阶段建议先按以下节奏推进：

```text
PB1：idle / coding / sleep 三个核心循环视频
PB2：success / error / thinking / reminder / wave 补齐闭环
PB3.1：待机动作池
PB3.2：Codex 细状态动作
PB3.3：趣味互动动作
```

---

## 四、动作体系整合

### 4.1 动作总池

最终动作池可以保留 22 个动作，但执行时分批制作。

| 分类 | 动作名 | 用途 | 建议阶段 |
|---|---|---|---|
| 原有核心 | idle | 默认待机 | PB1 |
| 原有核心 | coding | Codex 正在运行 | PB1 |
| 原有核心 | sleep | 长时间无任务休眠 | PB1 |
| 原有核心 | success | 任务完成 | PB2 |
| 原有核心 | error | 任务失败 | PB2 |
| 原有核心 | thinking | 长时间分析 / 思考 | PB2 |
| 原有核心 | reminder | 日程或事项提醒 | PB2 |
| 待机小动作 | yawn | 待机打哈欠 | PB3.1 |
| 待机小动作 | hair | 待机顺头发 | PB3.1 |
| 待机小动作 | reading | 侧坐看书 | PB3.1 |
| 待机小动作 | bored | 无聊发呆 | PB3.1 |
| 生活互动 | stretch | 伸懒腰 | PB3.1 |
| 生活互动 | drink | 喝水 | PB3.1 |
| 趣味互动 | hide | 躲猫猫 | PB3.1 |
| 启动互动 | wave | 打招呼 | PB2 |
| 任务过渡 | loading | 加载中 | PB3.2 |
| 任务过渡 | search | 检索查找 | PB3.2 |
| 任务过渡 | explain | 讲解说明 | PB3.2 |
| 系统状态 | update | 版本更新 | PB3.2 |
| 情绪反馈 | shy | 害羞 | PB3.3 |
| 情绪反馈 | angry | 小生气 | PB3.3 |
| 情绪反馈 | cheer | 打气加油 | PB3.3 |
| 情绪反馈 | confused | 疑惑 | PB3.3 |
| 退出状态 | bye | 告别 | PB3.3 |
| 情绪增强 | happy | 单纯开心 | PB3.3 |

> 注：原规划中的“新增 15 个动作”方向可以保留，但在实现层面分阶段落地，不建议一次性全部生成和接入。

---

## 五、动作播放类型分类

不是所有视频都应该循环播放。桌宠行为逻辑里，必须区分循环状态、一次性反馈、过渡动作。

### 5.1 循环型动作

适合长时间播放，要求首尾帧自然衔接。

```text
idle
coding
sleep
thinking
bored
reading
drink
```

### 5.2 一次性反馈型动作

播放一次或短时间展示后，自动回到下一个状态。

```text
success
error
reminder
wave
bye
stretch
cheer
angry
shy
```

### 5.3 过渡型动作

用于状态之间的桥接，不应长期停留。

```text
loading
search
explain
update
confused
hide
```

### 5.4 状态配置示例

```json
{
  "success": {
    "asset": "assets/webm/success.webm",
    "playMode": "once",
    "nextState": "idle",
    "duration": 5,
    "fallback": "assets/keyframes/success/success_01.png"
  },
  "coding": {
    "asset": "assets/webm/coding.webm",
    "playMode": "loop",
    "fallback": "assets/keyframes/coding/coding_01.png"
  }
}
```

---

## 六、PB1：核心循环视频

PB1 只做最常驻、最值得视频化的 3 个状态。

### 6.1 idle.webm

用途：默认待机状态。

动作要求：

- 人物自然站立
- 非常轻微呼吸起伏
- 轻微眨眼
- 重心细微变化
- 固定镜头
- 适合无缝循环

建议规格：

```text
时长：4 秒
播放模式：loop
背景：纯浅色 / 简洁棚拍背景
```

### 6.2 coding.webm

用途：Codex 正在执行任务。

动作要求：

- 人物坐在小电脑前
- 身体微微前倾
- 双手自然敲键盘
- 表情专注
- 电脑道具简洁
- 固定镜头

建议规格：

```text
时长：5 秒
播放模式：loop
背景：纯浅色 / 简洁桌面背景
```

### 6.3 sleep.webm

用途：长时间无任务后休眠。

动作要求：

- 人物躺在小杯子软垫里
- 闭眼睡觉
- 轻微呼吸起伏
- Zzz 缓慢漂浮
- 固定镜头

建议规格：

```text
时长：6 秒
播放模式：loop
背景：纯浅色 / 简洁棚拍背景
```

---

## 七、PB2：核心反馈闭环

PB2 补齐完整 Agent 状态反馈。

### 7.1 success.webm

用途：任务完成。

建议动作：

- 轻轻跳起或踮脚庆祝
- 小幅举手
- 少量烟花或金色粒子
- 表情开心自然

播放建议：

```text
播放模式：once
播放后：happy 或 idle
```

注意：不建议让 success 无限循环。一直跳会显得打扰，应该播放一次后回到待机。

### 7.2 error.webm

用途：任务失败或报错。

建议动作：

- 鸭子坐或低落坐姿
- 轻微沮丧
- 头顶小阴云下小雨

播放建议：

```text
播放模式：once 或 short_loop
展示 5-10 秒后回到 idle / cheer
```

注意：error 不宜长时间停留，避免桌面情绪过压抑。

### 7.3 thinking.webm

用途：长时间分析 / 暂无工具调用。

建议动作：

- 趴着双手撑脸
- 脚在身后小幅晃动
- 问号上下浮动

播放建议：

```text
播放模式：loop
```

### 7.4 reminder.webm

用途：事项提醒 / 日程提醒。

建议动作：

- 一个手放腰侧
- 一个手指向提醒气泡区域
- 气泡由前端 UI 渲染，不建议写死在视频里

播放建议：

```text
播放模式：once 或 short_loop
前端叠加气泡
```

### 7.5 wave.webm

用途：启动桌宠 / 唤醒 / 用户点击。

建议动作：

- 单手小幅挥手
- 歪头微笑
- 不需要复杂特效

播放建议：

```text
播放模式：once
播放后：idle
```

---

## 八、PB3.1：待机动作池

目标：让桌宠在无任务状态下不单调，但不要过于频繁。

### 8.1 待机动作池

```text
idle
yawn
hair
reading
bored
stretch
drink
hide
```

### 8.2 随机触发规则

原方案中“每 3-5 秒随机切换 1 个动作”过于频繁，长期使用会显得打扰。

建议改为：

```text
idle 基础循环持续播放
无任务时，每 20-60 秒随机插入一个 idle_action
动作播放完自动回到 idle
同一动作不连续出现超过 2 次
用户点击桌宠时，优先触发 wave / shy / confused
```

### 8.3 待机动作说明

| 动作 | 描述 | 播放建议 |
|---|---|---|
| yawn | 轻轻打哈欠 | once |
| hair | 顺头发 | once |
| reading | 侧坐看书 | loop / short_loop |
| bored | 托腮发呆、晃脚 | loop |
| stretch | 伸懒腰 | once |
| drink | 喝水 | loop / once |
| hide | 躲猫猫 | once / short_loop |

---

## 九、PB3.2：Codex 细状态动作

目标：让 Codex / Agent 的不同工作阶段更有辨识度。

### 9.1 loading

触发：任务启动、Codex 开始运行前。

动作：

- 原地小幅悬浮或轻轻转身
- 周身代码数据流或环形进度条
- 表情专注

播放建议：

```text
playMode：loop
nextState：coding
```

### 9.2 search

触发：检索信息、查找内容、搜索文件。

动作：

- 踮脚抬头张望
- 小手搭在眉前
- 放大镜图标或搜索光效

播放建议：

```text
playMode：once / short_loop
nextState：coding
```

### 9.3 explain

触发：任务完成后补充说明、提醒后解释。

动作：

- 侧身抬手比划
- 旁边有文字气泡区域
- 气泡由前端生成

播放建议：

```text
playMode：once / short_loop
```

### 9.4 update

触发：桌宠版本更新、配置变更、系统升级。

动作：

- 身体轻微发光
- 环形进度光圈
- 小粒子刷新

播放建议：

```text
playMode：loop
完成后：happy → idle
```

---

## 十、PB3.3：趣味互动动作

目标：增强桌宠陪伴感和可玩性。

| 动作 | 触发场景 | 描述 | 播放建议 |
|---|---|---|---|
| shy | 用户点击或长时间注视 | 低头、小幅扭捏 | once |
| angry | 多次 error / 用户频繁打断 | 双手叉腰、轻微不满 | once |
| cheer | error 后重试 / 长时间工作 | 握拳鼓劲 | once |
| confused | 指令模糊 | 歪头疑惑、问号绕头 | once / short_loop |
| bye | 关闭桌宠 | 挥手告别 + 淡出 | once |
| happy | success 后衔接 | 小幅开心动作 | once / short_loop |

这些动作不是 PB 初期必需，可在系统稳定后逐步补充。

---

## 十一、动作联动逻辑

### 11.1 待机逻辑

```text
idle 持续循环
  ↓
20-60 秒无任务
  ↓
随机插入 yawn / hair / reading / bored / stretch / drink / hide
  ↓
动作结束
  ↓
回到 idle
```

### 11.2 任务启动逻辑

```text
用户发起任务
  ↓
wave（可选）
  ↓
loading
  ↓
coding
```

### 11.3 任务结束逻辑

```text
coding
  ↓
success / error
  ↓
success → happy / explain → idle
error → cheer / idle
```

### 11.4 长任务逻辑

```text
coding 持续超过 5 分钟
  ↓
随机插入 drink / stretch
  ↓
回到 coding
```

### 11.5 检索逻辑

```text
coding
  ↓
search
  ↓
coding / success
```

### 11.6 休眠与唤醒逻辑

```text
idle
  ↓
bored
  ↓
sleep
```

唤醒：

```text
sleep
  ↓
stretch
  ↓
wave
  ↓
idle / loading
```

### 11.7 提醒逻辑

```text
reminder
  ↓
explain（可选）
  ↓
idle
```

### 11.8 关闭逻辑

```text
用户关闭桌宠
  ↓
bye
  ↓
窗口淡出关闭
```

---

## 十二、视频生成规范

### 12.1 通用规格

```text
格式：先生成 MP4，再转 WebM
时长：4-6 秒
帧率：24fps 或 30fps
镜头：固定镜头
背景：纯浅色 / 简洁棚拍背景
人物：完整，不裁切头脚
动作：小幅微动，避免大幅度动作
用途：桌面 AI Companion 状态动画
```

### 12.2 动作幅度规范

- 常驻循环动作要小幅、稳定、可循环。
- 反馈动作可以稍明显，但不应长期循环。
- success、wave、bye、stretch 更适合一次性播放。
- coding、idle、sleep、thinking 更适合无缝循环。

### 12.3 特效规范

- 特效简约，不遮挡人物主体。
- 烟花、问号、雨云、Zzz 可以作为视频内特效，也可以前端叠加。
- 提醒气泡建议由前端 UI 生成，不写死在视频里。
- 天气、提醒、任务文案由 Bubble 系统渲染。

### 12.4 图生视频模型使用建议

| 工具 | 适合用途 |
|---|---|
| 豆包 / Seedance | 批量生成动作，速度快，适合多状态试错 |
| Kling | 流畅度更好，适合核心循环状态 |
| PixVerse | 可用于风格化或趣味动作 |

---

## 十三、WebM 转码与接入

### 13.1 普通 MP4 转 WebM

```bash
ffmpeg -i idle.mp4 -c:v libvpx-vp9 -b:v 0 -crf 28 -an idle.webm
```

### 13.2 透明 WebM

如果后续有 alpha 通道素材：

```bash
ffmpeg -i input.mov -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 output.webm
```

### 13.3 目录结构

```text
assets/webm/
├── idle.webm
├── coding.webm
├── sleep.webm
├── success.webm
├── error.webm
├── thinking.webm
├── reminder.webm
├── wave.webm
├── yawn.webm
├── hair.webm
├── reading.webm
└── ...
```

### 13.4 状态回退机制

每个 WebM 都应有 PNG fallback：

```json
{
  "idle": {
    "type": "webm",
    "src": "assets/webm/idle.webm",
    "loop": true,
    "fallback": "assets/keyframes/idle/idle_01.png"
  }
}
```

---

## 十四、第一批执行清单

### 第一批必做

```text
idle.webm
coding.webm
sleep.webm
success.webm
error.webm
```

### 第二批补齐闭环

```text
thinking.webm
reminder.webm
wave.webm
```

### 第三批待机动作池

```text
yawn.webm
hair.webm
reading.webm
bored.webm
stretch.webm
drink.webm
hide.webm
```

### 第四批 Codex 细状态

```text
loading.webm
search.webm
explain.webm
update.webm
```

### 第五批趣味互动

```text
shy.webm
angry.webm
cheer.webm
confused.webm
bye.webm
happy.webm
```

---

## 十五、当前最终建议

这份 PB3 动作补强方案可以作为长期动作规划保留，但执行必须分阶段：

```text
先闭环，再丰富；
先高频，再低频；
先循环状态，再一次性反馈；
先工程接入，再批量补动作。
```

当前最推荐的下一步：

1. 先生成 `idle / coding / sleep / success / error` 5 个 MP4。
2. 统一转 WebM。
3. 接入 Electron 状态播放器。
4. 配置 `playMode: loop / once` 和 fallback PNG。
5. 再补 `thinking / reminder / wave`，形成完整桌宠行为闭环。

这样既能快速看到动态效果，也不会被 22 个动作的制作量拖住主线。

