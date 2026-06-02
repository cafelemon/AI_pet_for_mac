#!/usr/bin/env python3
"""Export, inspect, validate and install local Desktop AI Companion profiles."""

from __future__ import annotations

import argparse
import json
import shutil
import stat
import tempfile
import uuid
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PROFILE_CONFIG_PATH = ROOT / "data" / "config" / "pet_profiles.config.json"
PACKAGE_MANIFEST_NAME = "profile.package.json"
SCHEMA_VERSION = 1
MAX_FILES = 4000
MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024
BLOCKED_SUFFIXES = {
    ".app",
    ".bat",
    ".cmd",
    ".com",
    ".dll",
    ".dylib",
    ".exe",
    ".js",
    ".mjs",
    ".node",
    ".ps1",
    ".sh",
}
ENTRYPOINT_KEYS = (
    "companionConfig",
    "statesConfig",
    "actionRegistry",
    "motionCatalog",
    "motionSources",
)
PROFILE_ENTRYPOINT_MAP = {
    "companionConfig": "companionConfigPath",
    "statesConfig": "statesConfigPath",
    "actionRegistry": "actionRegistryPath",
    "interactionRules": "interactionRulesPath",
    "motionCatalog": "motionCatalogPath",
    "motionSources": "motionSourcesPath",
    "profileCapabilityManifest": "profileManifestPath",
}


class PackageError(ValueError):
    """Raised for a rejected profile package."""


def read_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise PackageError(f"Invalid JSON file: {path}") from error
    if not isinstance(payload, dict):
        raise PackageError(f"Expected a JSON object: {path}")
    return payload


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def safe_relative_path(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise PackageError(f"{label} must be a non-empty relative path")
    if "\\" in value or "://" in value:
        raise PackageError(f"{label} must use a local POSIX relative path")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
        raise PackageError(f"{label} escapes the package root")
    if path.suffix.lower() in BLOCKED_SUFFIXES:
        raise PackageError(f"{label} uses a blocked executable suffix")
    return path.as_posix()


def safe_profile_id(value: Any) -> str:
    if not isinstance(value, str) or not value:
        raise PackageError("profileId is required")
    if not all(character.isalnum() or character in "_-" for character in value):
        raise PackageError("profileId may contain only letters, numbers, underscore and hyphen")
    return value


def package_manifest_path(profile: dict[str, Any]) -> Path:
    configured = profile.get("packageManifestPath")
    if not isinstance(configured, str):
        raise PackageError(f"Profile {profile.get('id')} is missing packageManifestPath")
    return ROOT / safe_relative_path(configured, "packageManifestPath")


def load_builtin_profiles() -> dict[str, dict[str, Any]]:
    config = read_json(PROFILE_CONFIG_PATH)
    profiles = config.get("profiles")
    if not isinstance(profiles, dict):
        raise PackageError("pet_profiles.config.json is missing profiles")
    return {str(profile_id): dict(profile) for profile_id, profile in profiles.items() if isinstance(profile, dict)}


def load_package_manifest(raw: dict[str, Any]) -> dict[str, Any]:
    if raw.get("schemaVersion") != SCHEMA_VERSION:
        raise PackageError(f"Unsupported profile package schema: {raw.get('schemaVersion')}")
    safe_profile_id(raw.get("profileId"))
    for key in ("profileVersion", "label", "description", "requiredAction", "assetsRoot", "qaSummaryPath"):
        if not isinstance(raw.get(key), str) or not raw[key]:
            raise PackageError(f"{key} is required")
    safe_relative_path(raw["assetsRoot"], "assetsRoot")
    safe_relative_path(raw["qaSummaryPath"], "qaSummaryPath")
    entrypoints = raw.get("entrypoints")
    if not isinstance(entrypoints, dict):
        raise PackageError("entrypoints must be an object")
    for key in ENTRYPOINT_KEYS:
        safe_relative_path(entrypoints.get(key), f"entrypoints.{key}")
    for key in ("interactionRules", "profileCapabilityManifest"):
        if key in entrypoints:
            safe_relative_path(entrypoints[key], f"entrypoints.{key}")
    for key in ("missingSourceActions", "needsReplacementActions"):
        if not isinstance(raw.get(key), list) or not all(isinstance(value, str) for value in raw[key]):
            raise PackageError(f"{key} must be a string array")
    distribution = raw.get("distribution")
    if not isinstance(distribution, dict):
        raise PackageError("distribution must be an object")
    for key in ("publishable", "license", "provenance"):
        if key not in distribution:
            raise PackageError(f"distribution.{key} is required")
    return raw


def zip_members(archive: zipfile.ZipFile) -> dict[str, zipfile.ZipInfo]:
    members: dict[str, zipfile.ZipInfo] = {}
    total_size = 0
    for info in archive.infolist():
        if info.is_dir():
            continue
        name = safe_relative_path(info.filename, "zip member")
        mode = info.external_attr >> 16
        if stat.S_ISLNK(mode):
            raise PackageError(f"Symbolic links are not allowed: {name}")
        total_size += info.file_size
        if total_size > MAX_UNCOMPRESSED_BYTES:
            raise PackageError("Profile package exceeds the uncompressed size limit")
        if len(members) >= MAX_FILES:
            raise PackageError("Profile package exceeds the file count limit")
        if name in members:
            raise PackageError(f"Duplicate zip member: {name}")
        members[name] = info
    return members


def parse_member_json(archive: zipfile.ZipFile, members: dict[str, zipfile.ZipInfo], name: str) -> dict[str, Any]:
    if name not in members:
        raise PackageError(f"Missing package file: {name}")
    try:
        payload = json.loads(archive.read(members[name]).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PackageError(f"Invalid JSON package file: {name}") from error
    if not isinstance(payload, dict):
        raise PackageError(f"Expected JSON object in package file: {name}")
    return payload


def validate_archive(package_path: Path) -> dict[str, Any]:
    if not package_path.is_file():
        raise PackageError(f"Profile package not found: {package_path}")
    try:
        with zipfile.ZipFile(package_path) as archive:
            members = zip_members(archive)
            manifest = load_package_manifest(parse_member_json(archive, members, PACKAGE_MANIFEST_NAME))
            entrypoints = manifest["entrypoints"]
            for key in ENTRYPOINT_KEYS:
                parse_member_json(archive, members, entrypoints[key])
            for key in ("interactionRules", "profileCapabilityManifest"):
                if key in entrypoints:
                    parse_member_json(archive, members, entrypoints[key])
            parse_member_json(archive, members, manifest["qaSummaryPath"])
            registry = parse_member_json(archive, members, entrypoints["actionRegistry"])
            actions = registry.get("actions")
            if not isinstance(actions, dict):
                raise PackageError("Action registry is missing actions")
            required_action = actions.get(manifest["requiredAction"])
            if not isinstance(required_action, dict):
                raise PackageError(f"Required action is missing: {manifest['requiredAction']}")
            for field in ("webmPath", "fallbackPath"):
                asset_path = safe_relative_path(required_action.get(field), f"requiredAction.{field}")
                if asset_path not in members:
                    raise PackageError(f"Required action asset is missing: {asset_path}")
            for action_id, action in actions.items():
                if not isinstance(action, dict):
                    raise PackageError(f"Invalid action registry entry: {action_id}")
                for field in ("path", "sourceDir", "webmPath", "fallbackPath"):
                    safe_relative_path(action.get(field), f"actions.{action_id}.{field}")
                source_paths = action.get("sourceVideoPaths", [])
                if not isinstance(source_paths, list):
                    raise PackageError(f"actions.{action_id}.sourceVideoPaths must be an array")
                for index, source_path in enumerate(source_paths):
                    safe_relative_path(source_path, f"actions.{action_id}.sourceVideoPaths[{index}]")
            return {
                "ok": True,
                "profileId": manifest["profileId"],
                "profileVersion": manifest["profileVersion"],
                "label": manifest["label"],
                "fileCount": len(members),
                "missingSourceActions": manifest["missingSourceActions"],
                "needsReplacementActions": manifest["needsReplacementActions"],
                "warnings": package_warnings(manifest),
            }
    except zipfile.BadZipFile as error:
        raise PackageError(f"Invalid zip archive: {package_path}") from error


def package_warnings(manifest: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    missing = manifest.get("missingSourceActions", [])
    replacement = manifest.get("needsReplacementActions", [])
    if missing:
        warnings.append(f"{len(missing)} 个动作缺 source 视频")
    if replacement:
        warnings.append(f"{len(replacement)} 个动作等待替换视频")
    return warnings


def profile_export_files(profile: dict[str, Any], manifest: dict[str, Any], include_source: bool) -> set[str]:
    files = {safe_relative_path(value, f"entrypoints.{key}") for key, value in manifest["entrypoints"].items()}
    registry_path = ROOT / manifest["entrypoints"]["actionRegistry"]
    registry = read_json(registry_path)
    actions = registry.get("actions")
    if not isinstance(actions, dict):
        raise PackageError("Action registry is missing actions")
    for action in actions.values():
        if not isinstance(action, dict):
            continue
        for key in ("webmPath", "fallbackPath"):
            relative_path = safe_relative_path(action.get(key), f"actions.{key}")
            if (ROOT / relative_path).is_file():
                files.add(relative_path)
        if include_source:
            for source_path in action.get("sourceVideoPaths", []):
                relative_path = safe_relative_path(source_path, "sourceVideoPaths")
                if (ROOT / relative_path).is_file():
                    files.add(relative_path)
    return files


def export_profile(profile_id: str, output: Path | None, include_source: bool) -> dict[str, Any]:
    profiles = load_builtin_profiles()
    if profile_id not in profiles:
        raise PackageError(f"Unknown built-in profile: {profile_id}")
    profile = profiles[profile_id]
    manifest = load_package_manifest(read_json(package_manifest_path(profile)))
    if manifest["profileId"] != profile_id:
        raise PackageError("Package manifest profileId does not match built-in profile")
    output_path = output or ROOT / "dist" / "profiles" / f"{profile_id}-{manifest['profileVersion']}.companion-profile.zip"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    qa_summary = {
        "profileId": profile_id,
        "profileVersion": manifest["profileVersion"],
        "missingSourceActions": manifest["missingSourceActions"],
        "needsReplacementActions": manifest["needsReplacementActions"],
        "notes": "Detailed QA remains in the source repository; this package contains runtime assets only.",
    }
    files = profile_export_files(profile, manifest, include_source)
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(PACKAGE_MANIFEST_NAME, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        archive.writestr(manifest["qaSummaryPath"], json.dumps(qa_summary, ensure_ascii=False, indent=2) + "\n")
        for relative_path in sorted(files):
            archive.write(ROOT / relative_path, relative_path)
    result = validate_archive(output_path)
    result["packagePath"] = str(output_path)
    result["includeSource"] = include_source
    return result


def install_profile(package_path: Path, install_root: Path, reserved_profiles: set[str]) -> dict[str, Any]:
    validation = validate_archive(package_path)
    profile_id = validation["profileId"]
    if profile_id in reserved_profiles:
        raise PackageError(f"Built-in profile cannot be overwritten: {profile_id}")
    install_root.mkdir(parents=True, exist_ok=True)
    target = install_root / profile_id
    temp_target = install_root / f".{profile_id}.tmp-{uuid.uuid4().hex}"
    backup = install_root / f".{profile_id}.backup-{uuid.uuid4().hex}"
    try:
        with zipfile.ZipFile(package_path) as archive:
            members = zip_members(archive)
            temp_target.mkdir(parents=True)
            for name, info in members.items():
                destination = temp_target / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info) as source, destination.open("wb") as output:
                    shutil.copyfileobj(source, output)
        if target.exists():
            target.rename(backup)
        temp_target.rename(target)
        shutil.rmtree(backup, ignore_errors=True)
    except Exception:
        shutil.rmtree(temp_target, ignore_errors=True)
        if backup.exists() and not target.exists():
            backup.rename(target)
        raise
    validation["installedPath"] = str(target)
    return validation


def inspect_package(package_path: Path) -> dict[str, Any]:
    validation = validate_archive(package_path)
    with zipfile.ZipFile(package_path) as archive:
        manifest = load_package_manifest(json.loads(archive.read(PACKAGE_MANIFEST_NAME).decode("utf-8")))
    return {**validation, "manifest": manifest}


def print_result(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    export_parser = subparsers.add_parser("export", help="Export a built-in profile package.")
    export_parser.add_argument("--profile", required=True)
    export_parser.add_argument("--output", type=Path)
    export_parser.add_argument("--include-source", action="store_true")

    for command in ("validate", "inspect"):
        command_parser = subparsers.add_parser(command, help=f"{command.title()} a profile package.")
        command_parser.add_argument("--package", required=True, type=Path)

    install_parser = subparsers.add_parser("install", help="Validate and install a local profile package.")
    install_parser.add_argument("--package", required=True, type=Path)
    install_parser.add_argument("--install-root", required=True, type=Path)
    install_parser.add_argument("--reserved-profile", action="append", default=[])
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.command == "export":
            print_result(export_profile(args.profile, args.output, args.include_source))
        elif args.command == "validate":
            print_result(validate_archive(args.package))
        elif args.command == "inspect":
            print_result(inspect_package(args.package))
        else:
            print_result(install_profile(args.package, args.install_root, set(args.reserved_profile)))
    except PackageError as error:
        print_result({"ok": False, "error": str(error)})
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
