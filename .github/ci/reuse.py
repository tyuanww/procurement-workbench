#!/usr/bin/env python3
import json
import os
import re
import subprocess
import sys


SHA = re.compile(r"[0-9a-f]{40}")
REPOSITORY = re.compile(r"[A-Za-z0-9-]+/[A-Za-z0-9_.-]+")


def proof_step_name(base: str, tree: str) -> str:
    return f"Verify {tree} from {base}"


def command_output(*args: str) -> str:
    return subprocess.check_output(
        args, encoding="utf-8", stderr=subprocess.DEVNULL, timeout=5,
    ).strip()


def api_records(endpoint: str, key: str) -> list[dict]:
    payload = json.loads(command_output("gh", "api", endpoint))
    records = payload.get(key) if isinstance(payload, dict) else None
    if not isinstance(records, list) or any(not isinstance(row, dict) for row in records):
        raise ValueError("Invalid GitHub Actions response")
    return records


def positive_int(value: object) -> bool:
    return type(value) is int and value > 0


def job_has_proof(job: dict, pr_head: str, proof: str) -> bool:
    if (job.get("name"), job.get("head_sha"), job.get("status"), job.get("conclusion")) != (
        "verify", pr_head, "completed", "success",
    ):
        return False
    steps = job.get("steps")
    return isinstance(steps, list) and any(
        isinstance(step, dict) and step.get("name") == proof and step.get("conclusion") == "success"
        for step in steps
    )


def reusable_attempt(repository: str, base: str, head: str) -> str | None:
    checked_out, parent_line, tree = command_output(
        "git", "--no-replace-objects", "show", "-s", "--no-notes", "--no-show-signature",
        "--format=%H%n%P%n%T", "HEAD",
    ).splitlines()
    parents = parent_line.split()
    if checked_out != head or len(parents) != 2 or parents[0] != base:
        return None
    pr_head = parents[1]
    if not SHA.fullmatch(tree) or not SHA.fullmatch(pr_head):
        return None
    if command_output("git", "--no-replace-objects", "rev-parse", "--verify", f"{pr_head}^{{commit}}") != pr_head:
        return None
    ci_before = command_output("git", "--no-replace-objects", "ls-tree", base, "--", ".github")
    ci_after = command_output("git", "--no-replace-objects", "ls-tree", head, "--", ".github")
    if ci_before != ci_after:
        return None

    actions = f"repos/{repository}/actions"
    runs = api_records(
        f"{actions}/workflows/verify.yml/runs?event=pull_request&head_sha={pr_head}&status=success&per_page=3",
        "workflow_runs",
    )
    proof = proof_step_name(base, tree)
    owner = repository.split("/", 1)[0].casefold()
    for run in runs[:3]:
        run_id, attempt = run.get("id"), run.get("run_attempt")
        head_repository = run.get("head_repository")
        if not positive_int(run_id) or not positive_int(attempt):
            continue
        if (run.get("event"), run.get("head_sha"), run.get("status"), run.get("conclusion")) != (
            "pull_request", pr_head, "completed", "success",
        ):
            continue
        if not isinstance(head_repository, dict) or head_repository.get("full_name") != repository:
            continue
        actor = run.get("actor")
        login = actor.get("login") if isinstance(actor, dict) else None
        if not isinstance(login, str) or login.casefold() != owner:
            continue
        jobs = api_records(f"{actions}/runs/{run_id}/attempts/{attempt}/jobs?per_page=100", "jobs")
        if any(job_has_proof(job, pr_head, proof) for job in jobs):
            return f"{run_id}/attempts/{attempt}"
    return None


def main():
    repository = os.environ.get("GITHUB_REPOSITORY", "")
    commits = sys.argv[1:]
    if not REPOSITORY.fullmatch(repository) or len(commits) != 2 or not all(SHA.fullmatch(sha) for sha in commits):
        return
    try:
        attempt_path = reusable_attempt(repository, *commits)
    except (OSError, subprocess.SubprocessError, ValueError):
        return
    if attempt_path is not None:
        print(attempt_path)


if __name__ == "__main__":
    main()
