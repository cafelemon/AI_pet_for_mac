---
name: white-bg-video-matting
description: Convert already-generated white-background pet MP4 or MOV videos into transparent VP9 WebM assets with AI matting instead of naive white-key removal. Use when Codex needs to preserve people, cups, cushions, desks, chairs, shoes, hair edges, and other light-colored props while exporting transparent desk-pet animations and QA previews.
---

# white-bg-video-matting

## 用途

用于把白底桌宠视频转换成透明背景 WebM，适合人物、杯子软垫、桌椅、电脑等前景道具需要一起保留的桌宠素材。

优先使用本 skill 处理已经生成好的白底 MP4 / MOV / WebM。不要重新生成视频，也不要退化成简单按白色抠图，因为浅色道具、皮肤高光、半透明丝袜和发丝边缘会被误伤。

## 适用场景

- 白底 MP4/MOV 桌宠视频；
- 已经生成好的视频，不想重新生成；
- 需要导出透明 WebM 给 Electron 桌宠使用；
- 背景接近白色，但前景中有浅色道具，不能简单扣白。

## 不适用场景

- 复杂真实背景视频；
- 前景和背景高度混杂；
- 需要逐帧商业级精修的影视级素材；
- 透明边缘要求极高且不允许任何白边的素材。

## 推荐流程

先用单个视频测试，再批处理：

1. 单视频处理；
2. 查看 QA 预览；
3. 调整 `alpha-expand` / `alpha-blur` / `erode-size`；
4. 满意后批量处理。

## 工作流

1. 用 `ffprobe` 读取输入视频信息并写入 `report.json`。
2. 用 `ffmpeg` 按指定 `fps` 和 `height` 拆分 PNG 帧。
3. 复用一个 `rembg` session，对每帧执行 AI matting。
4. 对 alpha 做轻微膨胀与羽化，避免人物和道具被吃掉。
5. 对半透明边缘做保守 defringe，降低白边污染，但不要主动抹掉主体颜色。
6. 输出透明 PNG 帧，再用 `ffmpeg` 编码为 VP9 alpha WebM。
7. 生成 QA 预览：
   - 黑底预览 `qa/preview_black.mp4`
   - 灰底预览 `qa/preview_gray.mp4`
   - 棋盘格拼图 `qa/preview_grid.jpg`
   - 抽样帧 `qa/sample_frames/`
8. 处理完成后输出 `report.json`；默认清理中间帧，保留 QA 和报告。

## 输入输出

输入：

- `--input`：白底 `.mp4` / `.mov` / `.webm`

输出：

- 透明 WebM：用户指定的 `--output`
- 中间工作目录：默认 `输入文件旁/.matting_work/<视频名>/`
- 处理报告：`workdir/report.json`
- QA 预览：`workdir/qa/*`

## 常用命令

单视频：

```bash
cd skills/white-bg-video-matting
python matting_video.py \
  --input ~/Downloads/sleep.mp4 \
  --output ~/Downloads/sleep_alpha.webm \
  --height 768 \
  --fps 24 \
  --crf 22 \
  --alpha-expand 3 \
  --alpha-blur 0.6 \
  --erode-size 5 \
  --make-preview true
```

批处理：

```bash
cd skills/white-bg-video-matting
python batch_matte.py \
  --input-dir assets/mp4 \
  --output-dir assets/webm \
  --fps 24 \
  --height 768 \
  --crf 22
```

只做依赖检查和参数检查：

```bash
python matting_video.py \
  --input ~/Downloads/sleep.mp4 \
  --output ~/Downloads/sleep_alpha.webm \
  --dry-run
```

## 调参建议

- 白边明显：提高 `alpha-blur`，并温和提高 `defringe-strength`。
- 主体被吃掉：增加 `alpha-expand`，降低 `erode-size`。
- 背景残留多：降低 `alpha-expand`，略提高 `erode-size`。
- 杯子软垫被抠掉：增加 `alpha-expand`，降低 `erode-size`，必要时接受小舞台卡片模式。
- 人物边缘太硬：提高 `alpha-blur`。
- 透明 WebM 颜色变淡：先检查播放器 / 前端对 VP9 alpha 的兼容性，不要第一时间怀疑 matting。

## 输出文件

- `output_alpha.webm`
- `report.json`
- `qa/preview_black.mp4`
- `qa/preview_gray.mp4`
- `qa/preview_grid.jpg`
- `qa/sample_frames/first.png`
- `qa/sample_frames/middle.png`
- `qa/sample_frames/last.png`

## 故障排查

- `ffmpeg not found` 或 `ffprobe not found`
  - 先安装：`brew install ffmpeg`
- `output directory is not writable`
  - 换到可写目录，或先手动创建输出目录
- 首次运行 `rembg` 很慢
  - 这是正常的，通常是模型初始化或下载过程
- `webm` 能播放但没有透明
  - 用 `ffprobe` 检查输出像素格式是否为 `yuva420p`
  - 再确认播放器本身支持 VP9 alpha
- 浅色道具被吃掉
  - 降低 `erode-size`，提高 `alpha-expand`
  - 如果仍不稳定，优先保留带底座的小舞台模式

## 资源

- 主实现：`matting_video.py`
- 批处理入口：`batch_matte.py`
- 安装脚本：`scripts/install.sh`
- 单视频测试脚本：`scripts/test_one.sh`
- QA 拼图辅助：`scripts/preview_grid.sh`
- 使用示例：`README.md`
- 素材建议：`examples/README.md`
