#!/usr/bin/env python3
"""Contract checks for local profile package export, validation and install."""

from __future__ import annotations

import json
import stat
import tempfile
import zipfile
from pathlib import Path

import profile_package


def assert_rejected(callback, expected: str) -> None:
    try:
        callback()
    except profile_package.PackageError as error:
        assert expected in str(error), (expected, str(error))
        return
    raise AssertionError(f"Expected rejection containing: {expected}")


def rewrite_zip(source: Path, target: Path, transform) -> None:
    with zipfile.ZipFile(source) as input_archive, zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as output_archive:
        for info in input_archive.infolist():
            replacement = transform(info.filename, input_archive.read(info))
            if replacement is None:
                continue
            name, payload = replacement
            output_archive.writestr(name, payload)


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="companion-profile-contract-") as directory:
        temp = Path(directory)
        legacy_package = temp / "legacy.companion-profile.zip"
        guofeng_package = temp / "guofeng.companion-profile.zip"
        legacy = profile_package.export_profile("legacy_real", legacy_package, include_source=False)
        guofeng = profile_package.export_profile("guofeng_ai", guofeng_package, include_source=False)
        assert legacy["ok"] is True
        assert guofeng["ok"] is True
        assert "mouse_leave_back" in guofeng["needsReplacementActions"]
        assert "reading" in guofeng["missingSourceActions"]
        assert "click_head_happy" not in guofeng["missingSourceActions"]

        custom_package = temp / "custom.companion-profile.zip"

        def rename_profile(name: str, payload: bytes):
            if name == profile_package.PACKAGE_MANIFEST_NAME:
                manifest = json.loads(payload)
                manifest["profileId"] = "contract_profile"
                manifest["label"] = "Contract Profile"
                return name, (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
            return name, payload

        rewrite_zip(guofeng_package, custom_package, rename_profile)
        installed = profile_package.install_profile(custom_package, temp / "installed", {"legacy_real", "guofeng_ai"})
        assert installed["profileId"] == "contract_profile"
        assert (temp / "installed" / "contract_profile" / profile_package.PACKAGE_MANIFEST_NAME).is_file()
        profile_package.install_profile(custom_package, temp / "installed", {"legacy_real", "guofeng_ai"})

        assert_rejected(
            lambda: profile_package.install_profile(guofeng_package, temp / "installed", {"legacy_real", "guofeng_ai"}),
            "Built-in profile cannot be overwritten",
        )

        missing_idle_package = temp / "missing-idle.zip"
        with zipfile.ZipFile(guofeng_package) as archive:
            manifest = json.loads(archive.read(profile_package.PACKAGE_MANIFEST_NAME))
            registry = json.loads(archive.read(manifest["entrypoints"]["actionRegistry"]))
            idle_webm = registry["actions"]["idle"]["webmPath"]
        rewrite_zip(guofeng_package, missing_idle_package, lambda name, payload: None if name == idle_webm else (name, payload))
        assert_rejected(lambda: profile_package.validate_archive(missing_idle_package), "Required action asset is missing")

        traversal_package = temp / "traversal.zip"
        with zipfile.ZipFile(traversal_package, "w") as archive:
            archive.writestr("../escape.txt", "nope")
        assert_rejected(lambda: profile_package.validate_archive(traversal_package), "escapes the package root")

        symlink_package = temp / "symlink.zip"
        with zipfile.ZipFile(symlink_package, "w") as archive:
            link = zipfile.ZipInfo("linked-asset")
            link.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(link, "target")
        assert_rejected(lambda: profile_package.validate_archive(symlink_package), "Symbolic links are not allowed")

        executable_package = temp / "executable.zip"
        with zipfile.ZipFile(executable_package, "w") as archive:
            archive.writestr("payload.js", "console.log('nope')")
        assert_rejected(lambda: profile_package.validate_archive(executable_package), "blocked executable suffix")

        malformed_package = temp / "malformed.zip"
        with zipfile.ZipFile(malformed_package, "w") as archive:
            archive.writestr(profile_package.PACKAGE_MANIFEST_NAME, "{")
        assert_rejected(lambda: profile_package.validate_archive(malformed_package), "Invalid JSON package file")

        oversized_package = temp / "oversized.zip"
        original_limit = profile_package.MAX_UNCOMPRESSED_BYTES
        try:
            profile_package.MAX_UNCOMPRESSED_BYTES = 4
            with zipfile.ZipFile(oversized_package, "w") as archive:
                archive.writestr("large.txt", "12345")
            assert_rejected(lambda: profile_package.validate_archive(oversized_package), "uncompressed size limit")
        finally:
            profile_package.MAX_UNCOMPRESSED_BYTES = original_limit

    print("Profile package contract checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
