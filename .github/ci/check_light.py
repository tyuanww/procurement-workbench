#!/usr/bin/env python3
"""Check changed Markdown links and the local Compose contract without dependencies."""

from __future__ import annotations

import collections
import json
import os
import posixpath
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlsplit


COMPOSE = "supply-workbench/docker/compose.yml"
LOCAL_COMPOSE = "supply-workbench/docker/compose.local.yml"
DOC_SUFFIXES = (".md", ".markdown", ".mdx")


def git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args])


def changed_paths(base: str, head: str) -> set[str]:
    # --name-only includes both sides of renames when rename detection is disabled.
    return {
        os.fsdecode(path)
        for path in git("diff", "--no-renames", "--name-only", "-z", base, head, "--").split(b"\0")
        if path
    }


def tree_paths(revision: str) -> set[str]:
    return {os.fsdecode(path) for path in git("ls-tree", "-r", "--name-only", "-z", revision).split(b"\0") if path}


def read_at(revision: str, path: str) -> str:
    return git("show", f"{revision}:{path}").decode("utf-8", errors="replace")


def prose(text: str) -> str:
    """Remove fenced/inline code and comments while preserving source line numbers."""
    lines = []
    fence = None
    for line in text.splitlines(keepends=True):
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})", line)
        if fence:
            if marker and marker[1][0] == fence[0] and len(marker[1]) >= len(fence):
                fence = None
            lines.append("\n" if line.endswith("\n") else "")
        elif marker:
            fence = marker[1]
            lines.append("\n" if line.endswith("\n") else "")
        else:
            lines.append(line)
    text = "".join(lines)
    text = re.sub(r"<!--.*?-->", lambda m: "\n" * m[0].count("\n"), text, flags=re.S)
    return re.sub(r"(`+)(?!`)(.*?)(?<!`)\1(?!`)", lambda m: "\n" * m[0].count("\n"), text, flags=re.S)


def destination(text: str, start: int) -> str | None:
    """Read the destination after '(' or a reference definition's ':'."""
    tail = text[start:].lstrip()
    if tail.startswith("<"):
        match = re.match(r"<((?:\\.|[^>\n])*)>", tail)
        return match[1] if match else None
    result = []
    depth = 0
    i = 0
    while i < len(tail):
        char = tail[i]
        if char == "\\" and i + 1 < len(tail):
            result.extend(tail[i:i + 2])
            i += 2
            continue
        if char == "(":
            depth += 1
        elif char == ")":
            if depth == 0:
                break
            depth -= 1
        elif char.isspace() and depth == 0:
            break
        result.append(char)
        i += 1
    return "".join(result) or None


def markdown_links(text: str):
    text = prose(text)
    definitions = {}
    definition_spans = []
    for match in re.finditer(r"^ {0,3}\[([^]\n]+)\]:[ \t]*(.*)$", text, re.M):
        definitions[" ".join(match[1].split()).casefold()] = destination(match[2], 0)
        definition_spans.append(match.span())
    # Resolve full, collapsed and shortcut reference links, including images.
    for match in re.finditer(r"(?<!\\)\[((?:\\.|[^]\\\n])*)\](?:\[([^]\n]*)\])?", text):
        if any(start <= match.start() < end for start, end in definition_spans):
            continue
        if text[match.end():match.end() + 1] == "(":
            target = destination(text, match.end() + 1)
        else:
            label = match[2] or match[1]
            target = definitions.get(" ".join(label.split()).casefold())
        if target:
            yield text.count("\n", 0, match.start()) + 1, target
    for match in re.finditer(r"<(?:a|img)\b[^>]*?\b(?:href|src)=[\"']([^\"']+)[\"']", text, re.I):
        yield text.count("\n", 0, match.start()) + 1, match[1]


def local_target(document: str, link: str) -> str | None:
    link = re.sub(r"\\([!\"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~ ])", r"\1", link)
    try:
        url = urlsplit(link)
    except ValueError:
        return None
    if url.scheme or url.netloc or not url.path:
        return None
    path = unquote(url.path)
    target = posixpath.normpath(path.lstrip("/") if path.startswith("/") else posixpath.join(posixpath.dirname(document), path))
    if target == ".." or target.startswith("../"):
        return None
    return target


def exists(target: str, paths: set[str]) -> bool:
    return target == "." or target in paths or any(path.startswith(target.rstrip("/") + "/") for path in paths)


def check_markdown(base: str, head: str, changed: set[str], before: set[str], after: set[str]) -> list[str]:
    failures = []
    deleted = before - after
    docs = sorted(path for path in after if path.lower().endswith(DOC_SUFFIXES))
    checked = 0
    for doc in docs:
        # A deleted target can break an unchanged document, so inspect incoming links too.
        if doc not in changed and not deleted:
            continue
        links = [(line, target, raw) for line, raw in markdown_links(read_at(head, doc)) if (target := local_target(doc, raw))]
        relevant = [(line, target, raw) for line, target, raw in links if doc in changed or not exists(target, after)]
        if not relevant:
            continue
        checked += 1
        old_broken = collections.Counter()
        if doc in before:
            for _, raw in markdown_links(read_at(base, doc)):
                target = local_target(doc, raw)
                if target and not exists(target, before):
                    old_broken[target] += 1
        for line, target, raw in relevant:
            if exists(target, after):
                continue
            # Existing debt may remain; deleting a formerly valid target must fail.
            if not exists(target, before) and old_broken[target]:
                old_broken[target] -= 1
                continue
            failures.append(f"{doc}:{line}: missing local link target {raw!r} ({target})")
    print(f"Markdown: checked {checked} relevant documents")
    return failures


def validate_compose(config: dict, port: int) -> None:
    services = config.get("services", {})
    bindings = services.get("app", {}).get("ports", [])
    if len(bindings) != 1:
        raise ValueError(f"app must have exactly one published binding, got {bindings!r}")
    binding = bindings[0]
    if (binding.get("host_ip"), str(binding.get("published")), binding.get("target"), binding.get("protocol", "tcp")) != ("127.0.0.1", str(port), 8080, "tcp"):
        raise ValueError(f"app binding must be 127.0.0.1:{port}:8080/tcp, got {binding!r}")
    if "db" not in services or services["db"].get("ports"):
        raise ValueError("db must exist and must not publish ports")


def check_compose(head: str, changed: set[str], after: set[str]) -> list[str]:
    if not changed.intersection({COMPOSE, LOCAL_COMPOSE}):
        print("Compose: unchanged; skipped")
        return []
    if LOCAL_COMPOSE not in after:
        if LOCAL_COMPOSE in changed:
            return [f"{LOCAL_COMPOSE}: local overlay was deleted"]
        print("Compose: local overlay absent in this revision; skipped")
        return []
    if COMPOSE not in after:
        return [f"{COMPOSE}: required base Compose file is missing"]
    try:
        # Read exactly HEAD, never a developer's uncommitted Compose/environment files.
        with tempfile.TemporaryDirectory(prefix="supply-light-compose-") as directory:
            root = Path(directory)
            for path in (COMPOSE, LOCAL_COMPOSE):
                dest = root / path
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(git("show", f"{head}:{path}"))
            for port in (None, 18080):
                env = os.environ.copy()
                for key in list(env):
                    if key.startswith("COMPOSE_") or key == "SUPPLY_DEV_PORT":
                        env.pop(key)
                if port is not None:
                    env["SUPPLY_DEV_PORT"] = str(port)
                result = subprocess.run(
                    ["docker", "compose", "--project-name", "supply-light-check", "--env-file", os.devnull,
                     "-f", str(root / COMPOSE), "-f", str(root / LOCAL_COMPOSE), "config", "--format", "json"],
                    cwd=root, env=env, capture_output=True, text=True, check=True,
                )
                validate_compose(json.loads(result.stdout), port or 8080)
        print("Compose: real config passed (127.0.0.1:8080 and 127.0.0.1:18080; db unpublished)")
        return []
    except (OSError, subprocess.CalledProcessError, ValueError, KeyError, TypeError) as error:
        detail = error.stderr.strip() if isinstance(error, subprocess.CalledProcessError) else str(error)
        return [f"Compose: {detail}"]


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: python3 .github/ci/check_light.py BASE HEAD | --release SHA", file=sys.stderr)
        return 2
    release = sys.argv[1] == "--release"
    revisions = [sys.argv[2], sys.argv[2]] if release else sys.argv[1:]
    try:
        base, head = (git("rev-parse", "--verify", "--end-of-options", f"{arg}^{{commit}}").decode().strip() for arg in revisions)
        after = tree_paths(head)
        if release:
            # Validate only files present at the release SHA; absence is not deletion.
            failures = check_compose(head, {COMPOSE, LOCAL_COMPOSE} & after, after)
        else:
            changed = changed_paths(base, head)
            failures = check_markdown(base, head, changed, tree_paths(base), after) + check_compose(head, changed, after)
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"Light checks failed: {error}", file=sys.stderr)
        return 1
    for failure in failures:
        print(failure, file=sys.stderr)
    print(f"Light checks: {'FAILED' if failures else 'passed'}")
    return bool(failures)


if __name__ == "__main__":
    sys.exit(main())
