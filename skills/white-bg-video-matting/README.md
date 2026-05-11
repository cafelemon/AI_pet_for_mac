# white-bg-video-matting

本地 Skill 和配套脚本，用于把已经生成好的白底桌宠视频转换成透明背景 WebM。核心思路是先拆帧，再用 `rembg` 的 AI matting 做前景分割，随后做轻微 alpha 修边与保守 defringe，最后编码成带 alpha 的 VP9 WebM，并自动输出 QA 预览与 `report.json`。

## 目录

```text
skills/white-bg-video-matting/
├── SKILL.md
├── README.md
├── requirements.txt
├── matting_video.py
├── batch_matte.py
├── config.example.json
├── agents/openai.yaml
├── scripts/
│   ├── install.sh
│   ├── test_one.sh
│   └── preview_grid.sh
└── examples/
    └── README.md
```

## 安装

```bash
cd skills/white-bg-video-matting
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

如果本机没有 `ffmpeg` / `ffprobe`：

```bash
brew install ffmpeg
```

也可以直接运行：

```bash
bash scripts/install.sh
```

## 单视频处理

```bash
python matting_video.py \
  --input ~/Downloads/sleep.mp4 \
  --output ~/Downloads/sleep_alpha.webm \
  --height 768 \
  --fps 24 \
  --crf 22
```

## 批处理

```bash
python batch_matte.py \
  --input-dir assets/mp4 \
  --output-dir assets/webm \
  --height 768 \
  --fps 24 \
  --crf 22
```

## 输出内容

- 透明 WebM：`output_alpha.webm`
- 单视频报告：`workdir/report.json`
- QA 目录：`workdir/qa/`
- 批处理报告：`output-dir/batch_report.json`

## 说明

- 默认模型为 `isnet-general-use`，优先稳妥保主体而不是激进去边。
- 默认 `workdir` 在输入视频旁边创建：`.matting_work/<视频名>/`
- 输出 WebM 使用 VP9 + `yuva420p` + `-auto-alt-ref 0`，以保留 alpha。
- 默认 `keep-frames=false`，处理成功后会清理中间帧，但保留 `qa/` 和 `report.json`。
