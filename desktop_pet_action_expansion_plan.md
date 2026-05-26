# 桌宠动作系统落地方案

## 0. 目标说明

当前桌宠已经具备一套可运行的基础动作状态，包括站立、坐姿、阅读、编程、思考、睡眠、提醒、成功、错误等。但现阶段存在三个问题：

1. 动作目录已经开始增多，后续继续扩展容易混乱。
2. 主状态虽然齐全，但缺少交互反馈，用户感知提升不够明显。
3. 现有状态已经能跑，目录迁移时不能破坏当前可用版本。

因此本方案改为“一次性整理到新目录 + 路径同步改造 + 关键链路保护”的方式。不再长期保留旧目录与新目录并行，也不设计复杂的新旧映射版本。P0 的核心任务是：**先备份，再迁移，再改路径，再回归测试**。

---

# 1. 总体原则

## 1.1 不做长期双目录

不采用：

```text
states/                 # 旧目录长期保留
assets/actions_v2/      # 新目录慢慢迁移
config/action_map.json  # 长期维护新旧映射
```

原因：这种方式短期看稳，长期会增加维护成本。后续每加一个动作都要考虑旧目录、新目录、映射、fallback，容易把工程弄成“路径毛线团”。🧶

本方案采用：

```text
assets/actions/         # 唯一动作资源目录
config/action_registry.json  # 唯一状态注册表
```

旧 `states/` 只作为迁移前备份，不作为运行时依赖。

## 1.2 先备份，后迁移

迁移前必须先做 Git 提交或物理备份。

允许：

- 创建新目录结构
- 将旧动作整体迁移到新目录
- 修改代码里的资源路径
- 建立统一状态注册表
- 写验证脚本
- 跑完整回归测试

不允许：

- 未备份就移动目录
- 未改加载逻辑就删除旧目录
- 未测试就替换关键睡眠链路
- 一边迁移一边生成大量新动作

## 1.3 路径整理一次做干净

后续代码里不要再直接写死：

```text
states/coding
states/sleep
states/duck_sit_idle
```

统一改为读取注册表：

```text
state_id: coding
path: assets/actions/states/coding/base
```

这不是为了兼容旧目录，而是为了让新目录成为唯一标准。后续动作资源路径变化，只改注册表，不在代码里到处找路径。

## 1.4 阅读作为独立主状态

阅读不再放在 `idle` 下面，也不再视为 `idle` 的一个变体。阅读是和 `idle`、`coding`、`thinking`、`sleep` 同级的主动作。

统一口径：

```text
idle：站立空闲/待机主状态。当前 idle 本质就是站立状态，不再额外建立 stand 主状态。
reading：读书/看资料主状态
coding：编程主状态
thinking：思考主状态
sleep：睡眠主状态
duck_sit：鸭子坐/坐姿主状态组
```

因此旧目录 `states/idle_reading` 在迁移后进入：

```text
assets/actions/states/reading/base
```

后续新增读书动作，例如翻页、犯困、点头、划重点，也都放在：

```text
assets/actions/states/reading/
```

## 1.5 不建立 stand 主状态

当前 `idle` 已经承担“站立待机”的语义，因此新目录里不再新增：

```text
assets/actions/states/stand/base
```

后续状态口径统一为：

```text
idle = 站立空闲主状态
reading/coding/thinking = 从 idle 进入的工作类主状态
duck_sit = 坐姿主状态组
sleep = 睡眠主状态
```

保留现有过渡目录名中的 `stand_to_xxx`、`xxx_to_stand`，因为它们是现有动作资产名称，P0 阶段只复制迁移，不重新生成、不重命名帧资源、不改动画内容。代码层面可以把这些 transition 理解为：

```text
stand_to_coding = idle_to_coding 的现有资源名
coding_to_stand = coding_to_idle 的现有资源名
stand_to_reading = idle_to_reading 的现有资源名
reading_to_stand = reading_to_idle 的现有资源名
```

也就是说：**状态语义上不再有 stand 主状态，但现有过渡动作文件名可以保留**。这样既不会破坏已验证资源，也避免后续多一个没必要的主状态。

## 1.6 已有动作只复制，不重新生成

P0 阶段处理现有动作的规则非常明确：

```text
只复制
不重新生成
不重新抠图
不压缩重采样
不改帧序列
不改透明通道
不调整尺寸和锚点
```

已有动作迁移本质是“搬家”，不是“翻新”。新动作从 P1 开始再生产，现有动作一律保持原样，避免把已经能跑的链路炼成一锅像素汤。🍲

## 1.7 交互优先于微动作

原方案把 idle/coding 微动作放在 P1，把交互放在 P2。现在调整：

```text
P0：目录迁移与路径改造
P1：用户交互动作
P2：主状态随机微动作
P3：事件与任务反馈
P4：状态机升级
P5：资产生产规范
```

原因：桌宠的感官提升最快来自“它会回应我”，而不是“它自己多播放几个动作”。

优先做：

```text
鼠标靠近会看你
点击头部会反应
拖拽会挣扎或晕一下
放下后能恢复
```

这几个一做出来，桌宠会立刻从“动画播放器”变成“屏幕小住户”。

---

# 2. 目标目录结构

最终形成以下结构：

```text
project_root/
  assets/
    actions/
      states/                     # 主状态循环动作
        idle/                      # 站立空闲主状态，不再单独建立 stand 主状态
          base/
          hair/
          yawn/
        duck_sit/
          base/
          finger_lip/
          head_hair/
          idle/
          stretch/
        coding/
          base/
        reading/                  # 阅读是独立主状态，不挂在 idle 下
          base/
          flip_page/
          sleepy/
          nod/
        thinking/
          base/
        sleep/
          base/
      transitions/                # 状态切换动作
        coding_to_stand/
        duck_sit_to_sleep/
        duck_sit_to_stand/
        reading_to_stand/
        sleep_to_stand/
        stand_to_coding/
        stand_to_duck_sit/
        stand_to_reading/
        stand_to_thinking/
        thinking_to_stand/
      interactions/               # 用户交互动作，优先级提高
        mouse_hover_look/
        mouse_leave_back/
        click_head_happy/
        click_body_confused/
        drag_start_lift/
        dragging_struggle/
        drag_end_dizzy/
      events/                     # 事件触发动作
        success/
        error/
        reminder/
      fallback/                   # 异常兜底动作
        idle/
        error/
  config/
    action_registry.json          # 状态注册表，唯一运行时路径来源
    interaction_rules.json        # 交互触发规则
    transition_rules.json         # 状态切换规则
    action_priority.json          # 动作优先级和随机权重
  tools/
    audit_actions.py              # 动作资源检查脚本
    migrate_states_to_actions.py  # 一次性迁移脚本
    verify_action_paths.py        # 路径可用性检查
  docs/
    action_inventory.md           # 动作资产台账
    action_state_machine.md       # 状态机说明
```

---

# 3. 旧目录到新目录迁移规则

## 3.1 当前目录初步归类

根据当前截图，现有动作可以先归为以下几类。

### 主状态类

```text
idle -> idle/base，也就是站立空闲主状态
idle_hair -> idle/hair
idle_yawn -> idle/yawn
idle_reading -> reading/base
coding -> coding/base
sleep -> sleep/base
thinking -> thinking/base
```

说明：`idle_reading` 虽然旧名字带 `idle`，但迁移后归入独立主状态 `reading`。当前 `idle` 本身就是站立待机，因此不再新增 `stand/base` 主状态。

### 坐姿类

```text
duck_sit_idle
duck_sit_stretch
duck_sit_finger_lip
duck_sit_head_hair
```

### 过渡类

```text
coding_to_stand
stand_to_coding
stand_to_reading
reading_to_stand
stand_to_thinking
thinking_to_stand
stand_to_duck_sit
duck_sit_to_stand
duck_sit_to_sleep
sleep_to_stand
```

### 事件类

```text
success
error
reminder
```

## 3.2 推荐迁移对应关系

| 旧目录 | 新目录 | 类型 | 保护级别 |
|---|---|---|---|
| `states/idle` | `assets/actions/states/idle/base` | 站立空闲主状态 | 高 |
| `states/idle_hair` | `assets/actions/states/idle/hair` | 空闲状态变体 | 中 |
| `states/idle_yawn` | `assets/actions/states/idle/yawn` | 空闲状态变体 | 中 |
| `states/idle_reading` | `assets/actions/states/reading/base` | 阅读主状态 | 高 |
| `states/coding` | `assets/actions/states/coding/base` | 主状态 | 高 |
| `states/thinking` | `assets/actions/states/thinking/base` | 主状态 | 高 |
| `states/sleep` | `assets/actions/states/sleep/base` | 主状态 | 最高 |
| `states/duck_sit_idle` | `assets/actions/states/duck_sit/idle` | 坐姿状态 | 最高 |
| `states/duck_sit_stretch` | `assets/actions/states/duck_sit/stretch` | 坐姿变体 | 高 |
| `states/duck_sit_finger_lip` | `assets/actions/states/duck_sit/finger_lip` | 坐姿变体 | 中 |
| `states/duck_sit_head_hair` | `assets/actions/states/duck_sit/head_hair` | 坐姿变体 | 中 |
| `states/coding_to_stand` | `assets/actions/transitions/coding_to_stand` | 过渡 | 高 |
| `states/stand_to_coding` | `assets/actions/transitions/stand_to_coding` | 过渡 | 高 |
| `states/stand_to_reading` | `assets/actions/transitions/stand_to_reading` | 过渡 | 高 |
| `states/reading_to_stand` | `assets/actions/transitions/reading_to_stand` | 过渡 | 高 |
| `states/stand_to_thinking` | `assets/actions/transitions/stand_to_thinking` | 过渡 | 高 |
| `states/thinking_to_stand` | `assets/actions/transitions/thinking_to_stand` | 过渡 | 高 |
| `states/stand_to_duck_sit` | `assets/actions/transitions/stand_to_duck_sit` | 过渡 | 最高 |
| `states/duck_sit_to_stand` | `assets/actions/transitions/duck_sit_to_stand` | 过渡 | 最高 |
| `states/duck_sit_to_sleep` | `assets/actions/transitions/duck_sit_to_sleep` | 过渡 | 最高 |
| `states/sleep_to_stand` | `assets/actions/transitions/sleep_to_stand` | 过渡 | 最高 |
| `states/success` | `assets/actions/events/success` | 事件 | 中 |
| `states/error` | `assets/actions/events/error` | 事件 | 中 |
| `states/reminder` | `assets/actions/events/reminder` | 事件 | 中 |

## 3.3 迁移后旧目录处理

迁移完成并测试通过后，旧 `states/` 不再作为运行目录。

推荐处理方式：

```text
1. 迁移前：states/ 正常存在
2. 迁移中：复制 states/ 到 assets/actions/，不要立即删除
3. 路径改造完成后：运行系统只读 assets/actions/
4. 回归测试通过后：把 states/ 移到 backup/states_legacy_YYYYMMDD/
5. 确认稳定后：可在下一版本删除 backup 或保留归档
```

注意：这里的 backup 不参与运行，不是双目录架构。

---

# 4. P0：目录迁移与路径改造

## 优先级：最高

P0 是整个方案最关键的一步。它不是为了做新动作，而是为了把动作资产整理成一个长期可维护的结构。

## 4.1 P0 目标

1. 备份当前可运行版本。
2. 盘点现有所有动作目录。
3. 创建唯一新目录 `assets/actions/`。
4. 将旧 `states/` 下动作迁移到新目录。
5. 创建 `action_registry.json`，作为唯一运行时路径来源。
6. 修改代码中的动作加载路径。
7. 跑完整回归测试。
8. 测试通过后，将旧 `states/` 移入备份，不再运行依赖。

## 4.2 P0 保护清单

以下动作迁移时必须只复制，不重生成、不压缩、不改帧、不替换。实际上，**P0 阶段所有已有动作都只复制**，其中下面这些属于重点保护对象：

```text
sleep
duck_sit_to_sleep
sleep_to_stand
duck_sit_to_stand
stand_to_duck_sit
duck_sit_idle
reading
```

原因：这些动作已经经过测试或与睡眠、坐姿、阅读主链路强绑定，属于当前桌宠体验的关键路径。迁移可以做，但资源内容不能改。

## 4.3 P0 命名口径

P0 后的主状态命名以 `idle` 为站立空闲状态，不再引入 `stand` 主状态。

```text
idle = 站立空闲
reading = 阅读
coding = 编程
thinking = 思考
sleep = 睡眠
duck_sit = 鸭子坐/坐姿
```

但现有过渡资源名保持不动：

```text
stand_to_coding
coding_to_stand
stand_to_reading
reading_to_stand
stand_to_thinking
thinking_to_stand
stand_to_duck_sit
duck_sit_to_stand
```

原因：这些是已经存在的动作目录，P0 的目标是迁移和改路径，不是重做动作资产。后续如果代码里需要更清晰的语义，可以在状态机内部把它们解释成 `idle_to_xxx` 或 `xxx_to_idle`，但资源目录名先保持现状。

## 4.4 P0 实施步骤

### Step 1：冻结当前稳定状态

优先使用 Git：

```bash
git add .
git commit -m "backup: freeze current desktop pet action states before migration"
git tag pet-actions-legacy-stable-v1
```

如果暂时不用 Git，也至少复制一份：

```text
backup/states_legacy_YYYYMMDD_HHMM/
```

### Step 2：生成动作资产台账

输出 `docs/action_inventory.md`。

表头建议：

```text
动作ID | 旧路径 | 新路径 | 类型 | 是否关键链路 | 是否保护 | 当前可用性 | 备注
```

示例：

```text
sleep | states/sleep | assets/actions/states/sleep/base | 主状态 | 是 | 是 | 可用 | 睡眠状态，只迁移不改内容
reading | states/idle_reading | assets/actions/states/reading/base | 主状态 | 是 | 是 | 可用 | 阅读作为独立主状态，不放在 idle 下
duck_sit_to_sleep | states/duck_sit_to_sleep | assets/actions/transitions/duck_sit_to_sleep | 过渡 | 是 | 是 | 可用 | 坐姿到睡眠关键链路
coding | states/coding | assets/actions/states/coding/base | 主状态 | 是 | 否 | 可用 | 后续可增加互动和变体
success | states/success | assets/actions/events/success | 事件 | 否 | 否 | 可用 | 后续接任务完成触发
```

### Step 3：创建新目录结构

创建：

```text
assets/actions/states/
assets/actions/transitions/
assets/actions/interactions/
assets/actions/events/
assets/actions/fallback/
config/
tools/
docs/
```

### Step 4：迁移动作资源

按迁移表把旧动作复制到新位置。

这里明确采用复制，不采用重新生成：

```text
copy states/sleep -> assets/actions/states/sleep/base
copy states/idle -> assets/actions/states/idle/base
copy states/idle_reading -> assets/actions/states/reading/base
copy states/duck_sit_to_sleep -> assets/actions/transitions/duck_sit_to_sleep
copy states/success -> assets/actions/events/success
```

复制完成后先不删旧目录，等代码路径和测试完成后再归档旧目录。

禁止在 P0 顺手做这些事：

```text
重新生成现有动作
重新抠图现有动作
重新命名现有帧文件
改变帧率
改变尺寸
改变透明背景处理方式
```

### Step 5：创建 action_registry.json

示例：

```json
{
  "states": {
    "idle": {
      "path": "assets/actions/states/idle/base",
      "type": "loop",
      "priority": "P0",
      "return_to": "idle"
    },
    "reading": {
      "path": "assets/actions/states/reading/base",
      "type": "loop",
      "priority": "P0",
      "return_to": "reading",
      "protect": true
    },
    "coding": {
      "path": "assets/actions/states/coding/base",
      "type": "loop",
      "priority": "P0",
      "return_to": "coding"
    },
    "sleep": {
      "path": "assets/actions/states/sleep/base",
      "type": "loop",
      "priority": "P0",
      "return_to": "sleep",
      "protect": true
    },
    "duck_sit_idle": {
      "path": "assets/actions/states/duck_sit/idle",
      "type": "loop",
      "priority": "P0",
      "return_to": "duck_sit_idle",
      "protect": true
    }
  },
  "transitions": {
    "stand_to_reading": {
      "path": "assets/actions/transitions/stand_to_reading",
      "type": "once",
      "priority": "P0"
    },
    "reading_to_stand": {
      "path": "assets/actions/transitions/reading_to_stand",
      "type": "once",
      "priority": "P0"
    },
    "stand_to_duck_sit": {
      "path": "assets/actions/transitions/stand_to_duck_sit",
      "type": "once",
      "priority": "P0",
      "protect": true
    },
    "duck_sit_to_sleep": {
      "path": "assets/actions/transitions/duck_sit_to_sleep",
      "type": "once",
      "priority": "P0",
      "protect": true
    },
    "sleep_to_stand": {
      "path": "assets/actions/transitions/sleep_to_stand",
      "type": "once",
      "priority": "P0",
      "protect": true
    }
  },
  "events": {
    "success": {
      "path": "assets/actions/events/success",
      "type": "once",
      "priority": "P3"
    },
    "error": {
      "path": "assets/actions/events/error",
      "type": "once",
      "priority": "P3"
    },
    "reminder": {
      "path": "assets/actions/events/reminder",
      "type": "once",
      "priority": "P3"
    }
  },
  "interactions": {}
}
```

## 4.5 路径改造要求

把代码中所有硬编码旧路径替换为注册表读取。

不推荐：

```python
path = f"states/{state_name}"
```

推荐：

```python
path = registry.get_action_path(action_id)
```

最低要求：

```text
状态机只认 action_id，不直接关心目录
资源加载器从 action_registry.json 获取 path
找不到动作时进入 assets/actions/fallback/idle
```

## 4.6 旧路径清理规则

代码改造完成后，必须搜索旧路径引用：

```bash
grep -R "states/" .
grep -R "states\\" .
```

目标：

```text
运行时代码中不再出现 states/ 硬编码路径
文档、备份说明、迁移脚本中允许出现 states/
```

## 4.7 P0 回归测试链路

至少测试：

```text
idle -> stand_to_coding -> coding -> coding_to_stand
stand -> stand_to_reading -> reading -> reading_to_stand
stand -> stand_to_thinking -> thinking -> thinking_to_stand
stand -> stand_to_duck_sit -> duck_sit_idle -> duck_sit_to_sleep -> sleep -> sleep_to_stand
success
error
reminder
```

重点看：

```text
是否能加载新路径
是否仍然透明背景正常
是否帧序列顺序正常
是否阅读主链路正常
是否关键睡眠链路正常
是否旧路径删除后仍能运行
```

## 4.8 P0 验收标准

P0 完成的标志：

1. `assets/actions/` 成为唯一运行时动作目录。
2. 原有动作全部完成迁移。
3. `reading` 作为独立主状态存在，不挂在 `idle` 下。
4. 运行时代码不再依赖旧 `states/`。
5. 关键保护动作内容没有被改动。
6. 所有主状态和过渡状态能通过 `action_registry.json` 找到。
7. 删除或移走旧 `states/` 后，桌宠仍能正常运行。
8. 有 fallback 机制，路径错误时不会直接崩溃。

---

# 5. P1：用户交互动作

## 优先级：高，优先于微动作

P1 的目标是让桌宠从“自己播放”变成“会回应用户”。这是当前感官提升最快的部分。

## 5.1 P1-A 第一批必做交互

```text
mouse_hover_look
mouse_leave_back
click_head_happy
click_body_confused
drag_start_lift
drag_end_dizzy
```

这 6 个动作优先级最高。

原因：

```text
鼠标靠近：用户立即感到它注意到了自己
点击头部：建立最直接的互动反馈
点击身体：增加一点差异化反应
拖拽开始：让移动窗口不再只是移动图片
拖拽结束：形成完整反馈闭环
```

## 5.2 P1-B 第二批增强交互

```text
dragging_struggle
click_head_shy
click_head_annoyed
mouse_hover_wave
long_hover_confused
```

这些可以在基础交互稳定后再补。

## 5.3 交互触发规则

建议建立 `config/interaction_rules.json`。

示例：

```json
{
  "mouse_hover": {
    "action": "mouse_hover_look",
    "cooldown_sec": 8,
    "interrupt_level": "low",
    "return_to_previous": true
  },
  "mouse_leave": {
    "action": "mouse_leave_back",
    "cooldown_sec": 3,
    "interrupt_level": "low",
    "return_to_previous": true
  },
  "click_head": {
    "action": "click_head_happy",
    "cooldown_sec": 3,
    "interrupt_level": "medium",
    "return_to_previous": true
  },
  "click_body": {
    "action": "click_body_confused",
    "cooldown_sec": 3,
    "interrupt_level": "medium",
    "return_to_previous": true
  },
  "drag_start": {
    "action": "drag_start_lift",
    "cooldown_sec": 0,
    "interrupt_level": "high",
    "return_to_previous": false
  },
  "drag_end": {
    "action": "drag_end_dizzy",
    "cooldown_sec": 0,
    "interrupt_level": "high",
    "return_to": "idle"
  }
}
```

## 5.4 交互动作注册表示例

`action_registry.json` 中增加：

```json
{
  "interactions": {
    "mouse_hover_look": {
      "path": "assets/actions/interactions/mouse_hover_look",
      "type": "once",
      "priority": "P1-A",
      "return_to_previous": true
    },
    "click_head_happy": {
      "path": "assets/actions/interactions/click_head_happy",
      "type": "once",
      "priority": "P1-A",
      "return_to_previous": true
    },
    "drag_start_lift": {
      "path": "assets/actions/interactions/drag_start_lift",
      "type": "once",
      "priority": "P1-A",
      "return_to_previous": false
    },
    "drag_end_dizzy": {
      "path": "assets/actions/interactions/drag_end_dizzy",
      "type": "once",
      "priority": "P1-A",
      "return_to": "idle"
    }
  }
}
```

## 5.5 交互防抖规则

互动动作必须加冷却时间。

建议：

```text
click 类：3 秒冷却
hover 类：8-10 秒冷却
drag 类：同一拖拽周期只触发一次 start 和 end
```

同时要限制打断：

```text
sleep 状态下：hover 不打断，click 可以轻微反应，drag 可以打断
关键 transition 播放中：普通 hover 不打断
error/reminder 事件播放中：click 不打断
```

## 5.6 P1 验收标准

1. 鼠标靠近时有反馈。
2. 鼠标离开时能恢复。
3. 点击头部有反馈。
4. 点击身体有不同反馈。
5. 拖拽开始和放下都有反馈。
6. 高频点击不会导致状态机混乱。
7. 交互动作结束后能回到原状态或默认状态。
8. sleep、transition、event 等特殊状态不会被低优先级交互乱打断。

---

# 6. P2：主状态随机微动作扩展

## 优先级：中高

P2 的目标是解决“长时间观看时单调”的问题。在 P1 交互闭环完成后，再补主状态内部小动作。

## 6.1 P2 优先动作

### idle 组

```text
idle_blink
idle_look_around
idle_wave
idle_yawn
```

优先级：P2-A

### reading 组

```text
reading_flip_page
reading_sleepy
reading_nod
reading_mark_keypoint
```

优先级：P2-A

说明：阅读是独立主状态，读书相关变体全部放在 `assets/actions/states/reading/` 下。

### coding 组

```text
coding_focus
coding_bug_confused
coding_tired_collapse
coding_fix_success
```

优先级：P2-A

### thinking 组

```text
thinking_question
thinking_idea
thinking_write_note
```

优先级：P2-B

### sleep 组

```text
sleep_breathe
sleep_turn_over
sleep_bubble
```

优先级：P2-C

睡眠链路仍然敏感，先扩低风险变体，不改主睡眠 base。

## 6.2 随机策略

每个主状态采用 base loop + 随机插入动作：

```text
reading/base 循环播放
每隔 20-60 秒随机触发一次 reading 变体
变体播放结束后回到 reading/base
```

推荐随机权重：

```json
{
  "reading": {
    "base": 70,
    "flip_page": 12,
    "nod": 8,
    "sleepy": 6,
    "mark_keypoint": 4
  },
  "coding": {
    "base": 70,
    "focus": 15,
    "bug_confused": 8,
    "tired_collapse": 5,
    "fix_success": 2
  }
}
```

## 6.3 P2 验收标准

1. idle 至少有 3 个可随机触发微动作。
2. reading 至少有 3 个可随机触发微动作。
3. coding 至少有 3 个可随机触发微动作。
4. 所有微动作播放完能回到原主状态。
5. 不影响 P1 交互动作。
6. 随机触发频率可配置。

---

# 7. P3：事件与任务反馈动作

## 优先级：中高

P3 把现有的 `success`、`error`、`reminder` 真正接入事件系统。

## 7.1 事件动作清单

```text
event_success_small
event_success_big
event_error_panic
event_error_smoke
event_reminder_soft
event_reminder_urgent
event_break_time
event_hourly_stretch
```

## 7.2 适用场景

```text
任务完成：success_small 或 success_big
程序报错：error_panic 或 error_smoke
定时提醒：reminder_soft
重要提醒：reminder_urgent
久坐：break_time
整点：hourly_stretch
```

## 7.3 P3 验收标准

1. success/error/reminder 不再只是孤立素材，而能被外部事件触发。
2. 同一事件可以配置不同强度动画。
3. 事件动画优先级高于普通随机微动作和普通 hover。
4. 事件结束后回到触发前状态。

---

# 8. P4：状态机升级

## 优先级：中

P4 的目标是让动作切换更自然，避免状态之间硬切。

## 8.1 状态优先级

推荐优先级从高到低：

```text
系统保护状态：dragging / error critical
事件状态：success / reminder / error
用户强交互：drag / click
用户弱交互：hover / mouse_leave
主动任务状态：coding / reading / thinking
低活跃状态：idle / duck_sit / sleep
fallback 状态：fallback_idle
```

## 8.2 状态切换规则

示例：

```json
{
  "from": "coding",
  "to": "sleep",
  "transition": "coding_to_stand -> stand_to_duck_sit -> duck_sit_to_sleep",
  "fallback": "coding_to_stand -> idle -> sleep"
}
```

阅读相关切换应统一使用独立状态名：

```json
{
  "from": "stand",
  "to": "reading",
  "transition": "stand_to_reading",
  "fallback": "idle -> reading"
}
```

## 8.3 P4 验收标准

1. 状态切换不依赖硬编码路径。
2. `reading` 是独立主状态，不依赖 `idle_reading` 命名。
3. 没有专用过渡时可以走 fallback 过渡。
4. 高优先级事件可以打断低优先级状态。
5. 睡眠、拖拽、错误等特殊状态有保护逻辑。

---

# 9. P5：动作资产生产规范

## 优先级：中

P5 解决后续持续生产动作时的统一标准问题。

## 9.1 单个动作目录标准

每个动作目录建议包含：

```text
action_name/
  frames/
    0001.png
    0002.png
    0003.png
  meta.json
  preview.gif
  source.txt
```

如果当前项目已经直接把帧图放在动作目录下，也可以暂时保留。但新增动作建议逐步统一到 `frames/` 结构。

## 9.2 meta.json 标准

```json
{
  "action_id": "click_head_happy",
  "type": "interaction",
  "base_state": "any",
  "loop": false,
  "fps": 12,
  "duration_sec": 1.8,
  "return_to_previous": true,
  "transparent": true,
  "safe_to_interrupt": false,
  "priority": "P1-A",
  "notes": "点击头部后开心反馈，播放结束回到原状态"
}
```

阅读动作示例：

```json
{
  "action_id": "reading_flip_page",
  "type": "state_variant",
  "base_state": "reading",
  "loop": false,
  "fps": 12,
  "duration_sec": 1.5,
  "return_to": "reading",
  "transparent": true,
  "safe_to_interrupt": true,
  "priority": "P2-A",
  "notes": "阅读状态下翻页，播放结束回到 reading/base"
}
```

## 9.3 画面规范

统一要求：

```text
背景：透明背景优先；如必须抠图，优先纯绿或纯白稳定背景
尺寸：保持当前桌宠主尺寸，不随动作跳变
主体位置：脚底或身体锚点尽量一致
帧率：建议 12fps，必要时 8-16fps
动作长度：交互动作 1-3 秒，微动作 0.8-2 秒，事件动作 2-4 秒，过渡动作 1-3 秒
命名：小写英文 + 下划线
```

---

# 10. 推荐优先级总表

| 阶段 | 优先级 | 核心目标 | 是否改路径 | 是否新增动作 | 风险 |
|---|---:|---|---|---|---|
| P0 | 最高 | 新目录迁移、路径改造、保护现有状态 | 是，一次做干净 | 不新增或极少新增 | 中高 |
| P1 | 高 | 增加点击、悬停、拖拽反馈 | 放入唯一新目录 | 是 | 中 |
| P2 | 中高 | 增加 reading/idle/coding 等主状态随机微动作 | 放入唯一新目录 | 是 | 低 |
| P3 | 中高 | 接入成功、错误、提醒事件 | 放入唯一新目录 | 是 | 中 |
| P4 | 中 | 状态机升级，支持优先级和 fallback | 改逻辑 | 少量 | 中高 |
| P5 | 中 | 资产生产规范化 | 不强制 | 持续 | 低 |

---

# 11. 建议实际执行顺序

## 第 1 天：备份、盘点、迁移准备

1. Git 提交当前稳定状态。
2. 打 tag：`pet-actions-legacy-stable-v1`。
3. 自动扫描 `states/` 目录。
4. 生成 `docs/action_inventory.md`。
5. 标记保护动作。
6. 创建 `assets/actions/` 新目录。
7. 明确 `states/idle_reading` 迁移后对应 `reading` 主状态。
8. 明确 `states/idle` 迁移后对应 `idle` 站立空闲主状态，不再建立 `stand/base`。
9. 明确所有已有动作 P0 只复制，不重新生成。

## 第 2 天：完成目录迁移

1. 按迁移表复制所有动作到 `assets/actions/`。
2. 创建 `config/action_registry.json`。
3. 创建路径验证脚本。
4. 确认所有新路径都存在。
5. 暂不删除旧 `states/`。

## 第 3 天：改加载路径

1. 新增 `ActionRegistry` 或等价加载模块。
2. 将状态机加载逻辑从旧路径切到新路径。
3. 搜索并清理运行时代码中的 `states/` 引用。
4. 将代码里的 `idle_reading` 语义改为 `reading`。
5. 跑完整回归测试。

## 第 4 天：旧目录归档

1. 确认新路径运行正常。
2. 将旧 `states/` 移入 `backup/states_legacy_YYYYMMDD/`。
3. 再次启动桌宠验证。
4. 若删除旧路径后仍正常运行，P0 完成。

## 第 5-6 天：做第一批交互动作

优先做：

```text
mouse_hover_look
mouse_leave_back
click_head_happy
click_body_confused
drag_start_lift
drag_end_dizzy
```

并接入：

```text
interaction_rules.json
交互冷却时间
打断优先级
return_to_previous
```

## 第 7 天：交互回归和体验调整

重点测试：

```text
高频点击
鼠标反复进出
拖拽过程中松手
睡眠时点击/拖拽
事件播放时点击
过渡播放时 hover
阅读状态下 hover/click/drag 是否能正确恢复
```

---

# 12. 第一批最值得做的动作

## P1-A 交互必做

```text
mouse_hover_look
mouse_leave_back
click_head_happy
click_body_confused
drag_start_lift
drag_end_dizzy
```

## P1-B 交互增强

```text
dragging_struggle
click_head_shy
click_head_annoyed
mouse_hover_wave
long_hover_confused
```

## P2-A 微动作必做

```text
idle_blink
idle_look_around
idle_wave
reading_flip_page
reading_nod
reading_sleepy
coding_bug_confused
coding_tired_collapse
coding_fix_success
```

## P3-A 事件核心

```text
event_success_small
event_error_panic
event_reminder_soft
```

---

# 13. 风险点与规避

## 13.1 路径迁移导致状态找不到

规避：

```text
迁移前打 tag。
先复制，不直接删除。
代码切到新路径后再归档旧目录。
用 verify_action_paths.py 检查 registry 里的所有路径。
```

## 13.2 冻结动作被覆盖

规避：

```text
对 sleep、duck_sit_to_sleep、sleep_to_stand、reading 等关键动作加 protect 标记。
迁移脚本遇到 protect=true 时只复制不覆盖。
```

## 13.3 阅读状态仍被当成 idle 变体

规避：

```text
目录层面：states/idle_reading 迁移到 assets/actions/states/reading/base。
状态机层面：统一使用 reading action_id。
过渡层面：stand_to_reading / reading_to_stand 直接进入或退出 reading。
命名层面：后续不再新增 idle_reading_xxx。
```

## 13.4 交互动作打断状态机

规避：

```text
交互必须区分 weak / medium / high interrupt_level。
hover 不打断 transition、event、sleep。
click 可以打断普通 idle/coding/reading，但不打断关键 transition。
drag 优先级最高，但结束后必须 return_to idle 或 previous_state。
```

## 13.5 高频点击导致抽搐

规避：

```text
click 类 3 秒冷却。
hover 类 8-10 秒冷却。
同一动画播放中不重复入队相同交互。
```

## 13.6 素材风格不统一

规避：

```text
统一尺寸、锚点、帧率、透明背景处理方式。
每个动作输出 preview.gif 做人工审核。
```

---

# 14. 最小闭环版本定义

如果只做一个最小但有效的升级版本，建议做到这里即可：

```text
P0 完成：assets/actions 成为唯一动作目录，旧 states 不再参与运行，reading 成为独立主状态
P1 完成：hover、click、drag 三类交互闭环
P2 完成：idle、reading、coding 各 2-3 个随机微动作
P3 完成：success/error/reminder 接入事件触发
```

这个版本完成后，桌宠会从“固定动作播放器”升级为“有基础回应、有路径秩序、有扩展空间的桌面伙伴”。

---

# 15. 当前建议结论

下一步应该先做 P0，但 P0 不再走双目录长期兼容方案，而是：

```text
备份当前稳定状态
创建 assets/actions 唯一新目录
迁移全部现有动作
将 states/idle 迁移为 assets/actions/states/idle/base
将 states/idle_reading 迁移为 assets/actions/states/reading/base
不建立 stand/base 主状态
保留现有 stand_to_xxx / xxx_to_stand 过渡资源名
建立 action_registry.json
修改加载路径
回归测试关键链路
移走旧 states 目录
```

最重要的边界是：**目前已有动作全部只复制，不重新生成**。这次 P0 是目录和路径治理，不是素材重做。等 P0 稳定后，再进入 P1 做交互动作，因为交互是最能让用户感到“它活了”的部分：鼠标一靠近它抬头，点一下它有反应，拖一下它会晕乎乎地回到原位。这个提升比多加十个 idle 小循环更明显。🪄

