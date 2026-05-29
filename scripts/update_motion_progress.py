#!/usr/bin/env python3
"""Generate the motion progress table from local assets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import action_registry
import pet_profiles


ROOT = Path(__file__).resolve().parents[1]
ACTIVE_PROFILE_ID = pet_profiles.DEFAULT_PROFILE_ID


def load_actions() -> list[dict[str, object]]:
    catalog = json.loads(pet_profiles.motion_catalog_path(ACTIVE_PROFILE_ID).read_text(encoding="utf-8"))
    return list(catalog["actions"])


def load_source_config() -> dict[str, object]:
    sources_path = pet_profiles.motion_sources_path(ACTIVE_PROFILE_ID)
    if not sources_path.exists():
        return {
            "defaults": {
                "provider": "unknown",
                "sourceFile": None,
                "maskPreset": "none",
                "mattePreset": "white",
                "cropPreset": "none",
            },
            "sources": {},
        }
    return json.loads(sources_path.read_text(encoding="utf-8"))


def source_info(action_id: str) -> dict[str, str | None]:
    config = load_source_config()
    defaults = dict(config.get("defaults", {}))
    sources = config.get("sources", {})
    if isinstance(sources, dict):
        defaults.update(sources.get(action_id, {}))

    provider = defaults.get("provider") or "unknown"
    source_file = defaults.get("sourceFile")
    mask_preset = defaults.get("maskPreset") or "none"
    matte_preset = defaults.get("mattePreset") or "white"
    crop_preset = defaults.get("cropPreset") or "none"
    return {
        "provider": str(provider),
        "sourceFile": str(source_file) if source_file else None,
        "maskPreset": str(mask_preset),
        "mattePreset": str(matte_preset),
        "cropPreset": str(crop_preset),
    }


def source_path(action_id: str) -> Path:
    directory = source_dir(action_id)
    info = source_info(action_id)
    candidates: list[Path] = action_registry.source_video_paths(action_id)
    if info["sourceFile"]:
        candidates.append(directory / info["sourceFile"])
    candidates.extend(
        [
            directory / f"{action_id}_jimeng.mp4",
            directory / f"{action_id}_kling.mp4",
            directory / f"{action_id}_source.mp4",
        ]
    )
    candidates.extend(sorted(directory.glob("*.mp4")) if directory.exists() else [])

    seen: set[Path] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        if candidate.exists():
            return candidate

    if info["sourceFile"]:
        return directory / info["sourceFile"]
    return directory / f"{action_id}_source.mp4"


def source_dir(action_id: str) -> Path:
    return action_registry.source_dir(action_id)


def webm_path(action_id: str) -> Path:
    return action_registry.webm_path(action_id)


def keyframe_path(action_id: str) -> Path:
    return action_registry.fallback_path(action_id)


def ensure_source_dirs(actions: list[dict[str, object]]) -> None:
    for action in actions:
        action_id = str(action["id"])
        directory = source_dir(action_id)
        directory.mkdir(parents=True, exist_ok=True)
        (directory / ".gitkeep").touch()


def file_status(path: Path) -> str:
    return "yes" if path.exists() else "no"


def action_status(action_id: str) -> str:
    if webm_path(action_id).exists():
        return "done"
    if source_path(action_id).exists():
        return "source_ready"
    return "waiting_source"


def status_label(status: str) -> str:
    return {
        "done": "完成：WebM 已生成",
        "source_ready": "源视频已到位，待转 WebM",
        "waiting_source": "待补源视频",
    }[status]


def build_summary(actions: list[dict[str, object]]) -> dict[str, int]:
    summary = {"total": len(actions), "done": 0, "source_ready": 0, "waiting_source": 0}
    for action in actions:
        summary[action_status(str(action["id"]))] += 1
    return summary


def write_progress(actions: list[dict[str, object]]) -> None:
    summary = build_summary(actions)
    output_path = pet_profiles.action_progress_path(ACTIVE_PROFILE_ID)
    profile_flag = "" if ACTIVE_PROFILE_ID == pet_profiles.DEFAULT_PROFILE_ID else f" --profile {ACTIVE_PROFILE_ID}"
    rows = [
        "# Motion Action Progress",
        "",
        f"This table is generated for profile `{ACTIVE_PROFILE_ID}` from its motion catalog and local asset presence.",
        "",
        "## Summary",
        "",
        f"- Total planned actions: {summary['total']}",
        f"- WebM complete: {summary['done']}",
        f"- Source videos ready, pending WebM conversion: {summary['source_ready']}",
        f"- Waiting for source videos: {summary['waiting_source']}",
        "",
        "## Progress Table",
        "",
        "| Stage | Category | Action | Playback | Runtime wired | Provider | Mask preset | Matte preset | Crop preset | Keyframe | Source video | WebM | Status | Source path |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]

    for action in actions:
        action_id = str(action["id"])
        runtime = "yes" if action.get("runtime") else "no"
        status = action_status(action_id)
        source_meta = source_info(action_id)
        rows.append(
            "| "
            + " | ".join(
                [
                    str(action["stage"]),
                    str(action["category"]),
                    f"`{action_id}` ({action['label']})",
                    f"`{action['playback']}`",
                    runtime,
                    str(source_meta["provider"]),
                    f"`{source_meta['maskPreset']}`",
                    f"`{source_meta['mattePreset']}`",
                    f"`{source_meta['cropPreset']}`",
                    file_status(keyframe_path(action_id)),
                    file_status(source_path(action_id)),
                    file_status(webm_path(action_id)),
                    status_label(status),
                    f"`{source_path(action_id).relative_to(ROOT)}`",
                ]
            )
            + " |"
        )

    rows.extend(
        [
            "",
            "## Next Fill List",
            "",
            "Provide new source videos using the exact source path shown in the table. If the video is not from the current provider, update this profile's motion sources config first. After a video arrives, run:",
            "",
            "```bash",
            f"python3 scripts/update_motion_progress.py{profile_flag} --ensure-dirs",
            f"python3 scripts/pb2_video_pipeline.py check{profile_flag} --state <action>",
            f"python3 scripts/pb2_video_pipeline.py convert{profile_flag} --state <action>",
            "```",
            "",
            "Full WebM validation should wait until all required runtime actions have WebM outputs:",
            "",
            "```bash",
            f"python3 scripts/asset_check.py{profile_flag} --strict --webm-strict",
            "```",
        ]
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(rows) + "\n", encoding="utf-8")
    print(f"WROTE: {output_path.relative_to(ROOT)}")


def main() -> int:
    global ACTIVE_PROFILE_ID
    parser = argparse.ArgumentParser(description="Generate PB3 action progress markdown.")
    parser.add_argument("--profile", default=pet_profiles.DEFAULT_PROFILE_ID, help="Pet profile id.")
    parser.add_argument("--ensure-dirs", action="store_true", help="Create source directories and .gitkeep files.")
    args = parser.parse_args()

    pet_profiles.set_active_profile(args.profile)
    ACTIVE_PROFILE_ID = pet_profiles.active_profile_id()
    action_registry.set_profile(ACTIVE_PROFILE_ID)

    actions = load_actions()
    if args.ensure_dirs:
        ensure_source_dirs(actions)
    write_progress(actions)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
