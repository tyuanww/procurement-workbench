import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


REUSE = Path(__file__).with_name("reuse.py").resolve()
REPOSITORY = "example/workbench"


class ReuseTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        work = Path(directory.name)
        self.repo = work / "repo"
        self.repo.mkdir()
        self.api = work / "responses.json"
        self.calls = work / "requests"
        self.workflow_run = None
        fake_gh = work / "gh"
        fake_gh.write_text('''#!/usr/bin/env python3
import json
import os
from pathlib import Path
import sys

method, endpoint = sys.argv[1:]
assert method == "api"
with Path(os.environ["FAKE_GH_REQUESTS"]).open("a") as requests:
    requests.write(endpoint + "\\n")
responses = json.loads(Path(os.environ["FAKE_GH_RESPONSES"]).read_text())
code, body = responses.get(endpoint, [1, "unexpected endpoint"])
print(body)
if code:
    print("request failed", file=sys.stderr)
sys.exit(code)
''')
        fake_gh.chmod(0o755)
        self.env = os.environ | {
            "PATH": str(work) + os.pathsep + os.environ["PATH"],
            "GITHUB_REPOSITORY": REPOSITORY,
            "GH_TOKEN": "fake-token",
            "FAKE_GH_REQUESTS": str(self.calls),
            "FAKE_GH_RESPONSES": str(self.api),
        }
        self.git("init", "--quiet", "--initial-branch=main")
        self.git("config", "user.name", "CI tests")
        self.git("config", "user.email", "ci@example.invalid")
        self.base = self.commit(".github/workflows/verify.yml", "name: verify\n")

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.repo, text=True).strip()

    def commit(self, name, content):
        path = self.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        self.git("add", "--", name)
        self.git("-c", "commit.gpgSign=false", "commit", "--quiet", "-m", name)
        return self.git("rev-parse", "HEAD")

    def merge(self, name="feature.txt"):
        self.git("checkout", "--quiet", "-b", "feature")
        self.pr_head = self.commit(name, "feature\n")
        self.git("checkout", "--quiet", "main")
        self.git("-c", "commit.gpgSign=false", "merge", "--quiet", "--no-ff", "--no-edit", "feature")
        self.head = self.git("rev-parse", "HEAD")
        self.tree = self.git("rev-parse", "HEAD^{tree}")
        actions = f"repos/{REPOSITORY}/actions"
        self.runs_url = (
            f"{actions}/workflows/verify.yml/runs?event=pull_request"
            f"&head_sha={self.pr_head}&status=success&per_page=3"
        )
        self.jobs_url = f"{actions}/runs/42/attempts/2/jobs?per_page=100"
        self.workflow_run = {
            "id": 42, "run_attempt": 2, "event": "pull_request",
            "head_sha": self.pr_head, "status": "completed", "conclusion": "success",
            "head_repository": {"full_name": REPOSITORY},
            "actor": {"login": "example"},
        }
        self.step = {"name": f"Verify {self.tree} from {self.base}", "conclusion": "success"}
        self.job = {
            "name": "verify", "head_sha": self.pr_head, "status": "completed",
            "conclusion": "success", "steps": [self.step],
        }

    def assert_reuse(self, expected="", *, base=None, head=None, overrides=None):
        responses = {}
        if self.workflow_run is not None:
            responses = {
                self.runs_url: [0, json.dumps({"workflow_runs": [self.workflow_run]})],
                self.jobs_url: [0, json.dumps({"jobs": [self.job]})],
            }
        self.api.write_text(json.dumps(responses | (overrides or {})))
        self.calls.unlink(missing_ok=True)
        result = subprocess.run(
            [sys.executable, str(REUSE), base or self.base, head or self.head],
            cwd=self.repo, env=self.env, capture_output=True, text=True, check=True, timeout=30,
        )
        self.assertEqual(result.stdout, expected)
        self.assertEqual(result.stderr, "")

    def test_exact_successful_attempt_reuses_the_run(self):
        self.merge()
        self.assert_reuse("42/attempts/2\n")

    def test_proof_for_a_different_base_or_tree_is_ignored(self):
        self.merge()
        for proof in (
            f"Verify {self.tree} from {self.pr_head}",
            f"Verify {self.git('rev-parse', self.base + '^{tree}')} from {self.base}",
        ):
            with self.subTest(proof=proof):
                self.step["name"] = proof
                self.assert_reuse()

    def test_ci_changes_do_not_query_proofs(self):
        self.merge(".github/README.md")
        self.assert_reuse()
        self.assertFalse(self.calls.exists())

    def test_direct_push_does_not_query_proofs(self):
        self.head = self.commit("feature.txt", "feature\n")
        self.assert_reuse()
        self.assertFalse(self.calls.exists())

    def test_push_bounds_must_match_the_checkout_and_first_parent(self):
        self.merge()
        self.assert_reuse(base=self.pr_head)
        self.assertFalse(self.calls.exists())
        self.assert_reuse(head=self.pr_head)
        self.assertFalse(self.calls.exists())

    def test_fork_run_does_not_supply_proof(self):
        self.merge()
        self.workflow_run["head_repository"] = {"full_name": "fork/workbench"}
        self.assert_reuse()
        self.assertEqual(self.calls.read_text().splitlines(), [self.runs_url])

    def test_reuse_uses_the_original_actor_to_require_the_repository_owner(self):
        self.merge()
        self.workflow_run["actor"] = {"login": "Example"}
        self.workflow_run["triggering_actor"] = {"login": "contributor"}
        self.assert_reuse("42/attempts/2\n")

        self.workflow_run["actor"] = {"login": "contributor"}
        self.workflow_run["triggering_actor"] = {"login": "example"}
        self.assert_reuse()
        self.assertEqual(self.calls.read_text().splitlines(), [self.runs_url])

    def test_unsuccessful_or_unrelated_records_do_not_supply_proof(self):
        self.merge()
        for record, field, invalid in (
            (self.workflow_run, "conclusion", "failure"),
            (self.workflow_run, "run_attempt", True),
            (self.workflow_run, "id", 0),
            (self.workflow_run, "head_sha", self.head),
            (self.job, "head_sha", self.head),
            (self.job, "conclusion", "failure"),
            (self.step, "conclusion", "skipped"),
        ):
            with self.subTest(field=field, invalid=invalid):
                valid = record[field]
                record[field] = invalid
                self.assert_reuse()
                record[field] = valid

    def test_unavailable_api_data_falls_back_without_diagnostics(self):
        self.merge()
        for endpoint, response in (
            (self.runs_url, [1, "private response body"]),
            (self.runs_url, [0, "invalid JSON"]),
            (self.runs_url, [0, '{"workflow_runs": []}']),
            (self.jobs_url, [0, '{"jobs": null}']),
        ):
            with self.subTest(endpoint=endpoint, response=response):
                self.assert_reuse(overrides={endpoint: response})


if __name__ == "__main__":
    unittest.main()
