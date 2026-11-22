#!/usr/bin/env python3
"""Select CI suites from two commits; unclassified changes fail closed to full CI."""

import argparse
import os
from pathlib import PurePosixPath
import subprocess
import sys


OUTPUTS = ("full", "code", "db", "web", "reports", "light")
WORKBENCH = "supply-workbench/"
DESIGN_SPECS = {
    "supply-workbench/DESIGN.md",
    "项目规划/20-生产级工作台方案/04-UI与交互设计.md",
}
TEST_INPUT_DOCS = {
    "supply-workbench/docs/architecture-optimization-progress-2026-11-10.md",
    "supply-workbench/docs/architecture-optimization-task-cards-2026-11-10.md",
}
SCOPED_PREFIXES = (
    ("supply-workbench/apps/web/src/pages/reports/", {"code", "web", "reports"}),
    ("supply-workbench/apps/web/src/features/reporting/", {"code", "web", "reports"}),
    ("supply-workbench/apps/web/src/", {"code", "web"}),
    ("supply-workbench/test/web/", {"code", "web"}),
    ("supply-workbench/packages/persistence/src/", {"code", "db"}),
    ("supply-workbench/test/persistence/", {"code", "db"}),
    ("supply-workbench/packages/report-renderers/src/", {"code", "reports"}),
    ("supply-workbench/test/report-renderers/", {"code", "reports"}),
)


def git(*args):
    return subprocess.run(
        ["git", *args], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    ).stdout


def changed_paths(base, head):
    # Resolve before diffing so revisions can neither inject options nor select trees.
    commits = [
        git("rev-parse", "--verify", "--end-of-options", ref + "^{commit}")
        .decode("ascii")
        .strip()
        for ref in (base, head)
    ]
    raw = git("diff", "--name-only", "--no-renames", "-z", *commits, "--")
    return [os.fsdecode(path) for path in raw.split(b"\0") if path]


def scopes_for(path):
    parts = PurePosixPath(path).parts
    if not parts or path.startswith("/") or ".." in parts:
        return {"full"}
    name = parts[-1]
    # Config, CI, and shared dependencies are intentionally outside narrow rules.
    if path.startswith(".github/") or name in {
        "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "Dockerfile",
    } or name.startswith(("tsconfig", "vite.config.", "vitest.", "eslint.", ".env")):
        return {"full"}
    if path in DESIGN_SPECS:
        return {"code", "web"}
    if path in TEST_INPUT_DOCS:
        return {"full"}
    if path == WORKBENCH + "docker/compose.local.yml":
        return {"light"}
    # Markdown under runtime/test directories may be consumed as fixtures.
    if name.endswith(".md") and not path.startswith((
        WORKBENCH + "apps/", WORKBENCH + "packages/", WORKBENCH + "test/",
        WORKBENCH + "scripts/", WORKBENCH + "e2e/", WORKBENCH + "tools/",
    )):
        return {"light"}
    for prefix, scopes in SCOPED_PREFIXES:
        if path.startswith(prefix):
            return scopes
    return {"full"}


def plan(paths, force_full=False):
    selected = set()
    for path in paths:
        selected.update(scopes_for(path))
    if force_full or not paths or "full" in selected:
        selected = set(OUTPUTS)
    return {key: key in selected for key in OUTPUTS}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base")
    parser.add_argument("head")
    parser.add_argument("--full", action="store_true")
    args = parser.parse_args()
    try:
        selected = plan(changed_paths(args.base, args.head), args.full)
    except (OSError, subprocess.CalledProcessError, UnicodeError) as error:
        print("CI plan: commit diff unavailable; running full CI (" + type(error).__name__ + ")", file=sys.stderr)
        selected = plan([], force_full=True)
    for key, enabled in selected.items():
        print(f"{key}={str(enabled).lower()}")


if __name__ == "__main__":
    main()
