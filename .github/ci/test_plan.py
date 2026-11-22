"""Exercise the public planner CLI against actual Git commits, without dependencies."""

from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


PLANNER = Path(__file__).with_name("plan.py").resolve()
KEYS = {"full", "code", "db", "web", "reports", "light"}


class PlanTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.repo = Path(self.directory.name)
        self.git("init", "--quiet")
        self.git("config", "user.name", "CI tests")
        self.git("config", "user.email", "ci@example.invalid")
        self.git("config", "core.filemode", "true")
        self.base = self.commit({"README.md": "initial\n"})

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.repo, stderr=subprocess.PIPE).decode().strip()

    def commit(self, changes):
        for name, content in changes.items():
            path = self.repo / name
            if content is None:
                path.unlink()
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content)
        self.git("add", "--all")
        self.git("commit", "--quiet", "--allow-empty", "-m", "test change")
        return self.git("rev-parse", "HEAD")

    def assert_plan(self, base, head, expected, *options):
        result = subprocess.run(
            [sys.executable, str(PLANNER), base, head, *options],
            cwd=self.repo, capture_output=True, text=True, check=True,
        )
        entries = dict(line.split("=", 1) for line in result.stdout.splitlines())
        self.assertEqual(set(entries), KEYS)
        self.assertTrue(all(value in {"true", "false"} for value in entries.values()))
        self.assertEqual({key for key, value in entries.items() if value == "true"}, expected)

    def test_scoped_categories(self):
        cases = (
            ("supply-workbench/apps/web/src/page.tsx", {"code", "web"}),
            ("supply-workbench/packages/persistence/src/migrations/009.sql", {"code", "db"}),
            ("supply-workbench/packages/report-renderers/src/browser/index.ts", {"code", "reports"}),
            ("docs/guide.md", {"light"}),
            ("supply-workbench/docker/compose.local.yml", {"light"}),
        )
        for index, (path, expected) in enumerate(cases):
            with self.subTest(path=path):
                head = self.commit({path: f"change {index}\n"})
                self.assert_plan(self.base, head, expected)
                self.base = head

    def test_test_files_select_their_suite(self):
        for directory, suite in (("web", "web"), ("persistence", "db"), ("report-renderers", "reports")):
            with self.subTest(directory=directory):
                head = self.commit({f"supply-workbench/test/{directory}/feature.test.ts": "test\n"})
                self.assert_plan(self.base, head, {"code", suite})
                self.base = head

    def test_unknown_shared_and_config_fall_back_to_full(self):
        for path in (
            "unknown.txt", "supply-workbench/packages/contracts/src/index.ts",
            "supply-workbench/packages/application/src/today.ts",
            "supply-workbench/test/server/today.int.test.ts",
            "supply-workbench/apps/web/package.json", "supply-workbench/apps/web/vite.config.ts",
            "supply-workbench/pnpm-lock.yaml", ".github/workflows/verify.yml",
            ".github/README.md", "supply-workbench/docs/statecharts/view.ts",
            "supply-workbench/docs/images/diagram.svg",
            "supply-workbench/docs/images/generate.py", "supply-workbench/docs/screenshot.png",
        ):
            with self.subTest(path=path):
                head = self.commit({path: "change\n"})
                self.assert_plan(self.base, head, KEYS)
                self.base = head

    def test_design_spec_is_not_light_markdown(self):
        for path in (
            "supply-workbench/DESIGN.md",
            "项目规划/20-生产级工作台方案/04-UI与交互设计.md",
        ):
            with self.subTest(path=path):
                head = self.commit({path: "new design\n"})
                self.assert_plan(self.base, head, {"code", "web"})
                self.base = head

    def test_asserted_document_inputs_run_full(self):
        for name in ("progress", "task-cards"):
            with self.subTest(name=name):
                path = f"supply-workbench/docs/architecture-optimization-{name}-2026-11-10.md"
                head = self.commit({path: "asserted input\n"})
                self.assert_plan(self.base, head, KEYS)
                self.base = head

    def test_plain_documentation_remains_light(self):
        for path in ("README.md", "supply-workbench/RUNBOOK.md", "supply-workbench/docs/PR94.md"):
            with self.subTest(path=path):
                head = self.commit({path: "ordinary documentation\n"})
                self.assert_plan(self.base, head, {"light"})
                self.base = head

    def test_documentation_images_run_light_on_addition_and_deletion(self):
        images = {
            f"supply-workbench/docs/images/guide/preview.{extension}": "image fixture\n"
            for extension in ("png", "jpg", "JPEG", "gif", "webp")
        }
        head = self.commit({"README.md": "documentation with screenshots\n", **images})
        self.assert_plan(self.base, head, {"light"})
        deleted = self.commit(dict.fromkeys(images))
        self.assert_plan(head, deleted, {"light"})

    def test_documentation_images_add_light_to_runtime_verification(self):
        head = self.commit({
            "supply-workbench/docs/images/preview.png": "documentation image\n",
            "supply-workbench/apps/web/src/images/preview.png": "application image\n",
        })
        self.assert_plan(self.base, head, {"code", "web", "light"})

    def test_image_paths_with_non_asset_git_modes_run_full(self):
        image = "supply-workbench/docs/images/preview.png"
        asset = self.commit({image: "non-executable image fixture\n"})
        (self.repo / image).chmod(0o755)
        executable = self.commit({})
        self.assert_plan(asset, executable, KEYS)

        (self.repo / image).unlink()
        (self.repo / image).symlink_to("../../../README.md")
        symlink = self.commit({})
        self.assert_plan(executable, symlink, KEYS)
        self.assert_plan(symlink, asset, KEYS)

    def test_web_report_printing_also_runs_export_tests(self):
        for path in (
            "supply-workbench/apps/web/src/pages/reports/print/index.ts",
            "supply-workbench/apps/web/src/features/reporting/model/print.ts",
        ):
            with self.subTest(path=path):
                head = self.commit({path: "report printing\n"})
                self.assert_plan(self.base, head, {"code", "web", "reports"})
                self.base = head

    def test_mixed_changes_union_suites(self):
        head = self.commit({
            "supply-workbench/apps/web/src/page.tsx": "web\n",
            "supply-workbench/packages/persistence/src/schema.ts": "db\n",
            "supply-workbench/packages/report-renderers/src/xlsx.ts": "reports\n",
            "docs/guide.md": "docs\n",
        })
        self.assert_plan(self.base, head, KEYS - {"full"})
        unknown = self.commit({"unclassified.cfg": "shared\n"})
        self.assert_plan(self.base, unknown, KEYS)

    def test_renames_include_old_and_new_paths_and_deletions(self):
        source = "supply-workbench/apps/web/src/old.tsx"
        base = self.commit({source: "same content\n"})
        target = "supply-workbench/packages/persistence/src/new.ts"
        head = self.commit({source: None, target: "same content\n"})
        self.assert_plan(base, head, {"code", "web", "db"})
        deleted = self.commit({target: None})
        self.assert_plan(head, deleted, {"code", "db"})

    def test_rename_out_of_a_known_scope_runs_full(self):
        source = "supply-workbench/apps/web/src/old.tsx"
        base = self.commit({source: "content\n"})
        head = self.commit({source: None, "unknown.ts": "content\n"})
        self.assert_plan(base, head, KEYS)

    def test_paths_with_whitespace_and_unicode(self):
        head = self.commit({"supply-workbench/apps/web/src/页面 with\nnewline.tsx": "web\n"})
        self.assert_plan(self.base, head, {"code", "web"})

    def test_empty_diff_invalid_revision_and_forced_full(self):
        self.assert_plan(self.base, self.base, KEYS)
        empty = self.commit({})
        self.assert_plan(self.base, empty, KEYS)
        self.assert_plan("missing-revision", empty, KEYS)
        self.assert_plan(self.git("rev-parse", "HEAD^{tree}"), empty, KEYS)
        head = self.commit({"docs/guide.md": "docs\n"})
        self.assert_plan(empty, head, KEYS, "--full")

    def test_diff_uses_passed_commits_not_worktree_or_merge_base(self):
        base = self.commit({"supply-workbench/apps/web/src/page.tsx": "web\n"})
        head = self.commit({"docs/guide.md": "docs\n"})
        self.commit({"unknown.ts": "later unrelated change\n"})
        (self.repo / "another-unknown.ts").write_text("uncommitted\n")
        self.assert_plan(base, head, {"light"})

    def test_divergent_commits_diff_their_endpoints(self):
        left = self.commit({"supply-workbench/apps/web/src/page.tsx": "web\n"})
        self.git("checkout", "--quiet", "--detach", self.base)
        right = self.commit({"docs/guide.md": "docs\n"})
        self.assert_plan(left, right, {"code", "web", "light"})


if __name__ == "__main__":
    unittest.main()
