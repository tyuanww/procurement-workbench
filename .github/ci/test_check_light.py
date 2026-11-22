"""Focused stdlib tests; all Git fixtures live outside the working tree."""

import contextlib
import importlib.util
import io
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("check_light.py")
SPEC = importlib.util.spec_from_file_location("check_light", SCRIPT)
light = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(light)


class MarkdownTests(unittest.TestCase):
    def test_links_fences_references_escapes_and_titles(self):
        text = '''[relative](../with%20space/a\\(b\\).md#section "title")
![image](<image file.png>)
[full][target] [target][] [target]
[target]: ../reference.md "title"
`[inline](absent.md)`
~~~markdown
[fenced](absent.md)
~~~
<!-- [comment](absent.md) -->
<a href="../html.md">html</a>
'''
        targets = [light.local_target("docs/readme.md", target) for _, target in light.markdown_links(text)]
        self.assertEqual(targets, ["with space/a(b).md", "docs/image file.png", "reference.md", "reference.md", "reference.md", "html.md"])

    def test_external_fragment_and_parenthesized_paths(self):
        self.assertIsNone(light.local_target("docs/a.md", "https://example.com/missing"))
        self.assertIsNone(light.local_target("docs/a.md", "//example.com/missing"))
        self.assertIsNone(light.local_target("docs/a.md", "#section"))
        self.assertEqual(list(light.markdown_links("[x](a(b).md)")), [(1, "a(b).md")])


class GitTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="supply-light-test-")
        self.root = Path(self.directory.name)
        self.previous = Path.cwd()
        os.chdir(self.root)
        self.git("init", "-q")
        self.git("config", "user.email", "ci-test@example.invalid")
        self.git("config", "user.name", "CI Test")

    def tearDown(self):
        os.chdir(self.previous)
        self.directory.cleanup()

    def git(self, *args):
        return subprocess.check_output(["git", *args]).decode().strip()

    def write(self, path, content):
        dest = self.root / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content)

    def commit(self):
        self.git("add", "-A")
        self.git("commit", "-qm", "fixture")
        return self.git("rev-parse", "HEAD")

    def check(self, base, head):
        with contextlib.redirect_stdout(io.StringIO()):
            return light.check_markdown(base, head, light.changed_paths(base, head), light.tree_paths(base), light.tree_paths(head))

    def test_historical_broken_link_ignored_but_added_occurrence_fails(self):
        self.write("README.md", "[old](missing.md)\n")
        base = self.commit()
        self.write("README.md", "Unrelated edit\n[old](missing.md)\n")
        self.assertEqual(self.check(base, self.commit()), [])
        self.write("README.md", "[old](missing.md)\n[new](missing.md)\n")
        errors = self.check(base, self.commit())
        self.assertEqual(len(errors), 1)
        self.assertIn("README.md:2:", errors[0])

    def test_deleted_target_breaks_unchanged_document_and_newline_paths(self):
        self.write("docs/README.md", "[target](<../target%0Aname.md>)\n")
        self.write("target\nname.md", "target\n")
        base = self.commit()
        (self.root / "target\nname.md").unlink()
        head = self.commit()
        self.assertEqual(light.changed_paths(base, head), {"target\nname.md"})
        self.assertIn("docs/README.md:1:", self.check(base, head)[0])

    def test_renamed_target_and_renamed_document_resolve_at_head(self):
        self.write("README.md", "[target](old.md)\n")
        self.write("old.md", "target\n")
        base = self.commit()
        self.git("mv", "old.md", "new.md")
        head = self.commit()
        self.assertEqual(light.changed_paths(base, head), {"old.md", "new.md"})
        self.assertEqual(len(self.check(base, head)), 1)
        self.write("README.md", "[target](new.md)\n")
        self.git("mv", "README.md", "README renamed.md")
        self.assertEqual(self.check(base, self.commit()), [])

    def test_actual_head_objects_ignore_uncommitted_document(self):
        self.write("README.md", "base\n")
        base = self.commit()
        self.write("README.md", "[missing](missing.md)\n")
        head = self.commit()
        self.write("README.md", "uncommitted fix\n")
        self.assertEqual(len(self.check(base, head)), 1)

    def release(self, sha):
        return subprocess.run([sys.executable, str(SCRIPT), "--release", sha], capture_output=True, text=True)

    def test_release_without_overlay_or_new_document_diff(self):
        self.write(light.COMPOSE, "services: {}\n")
        self.write("README.md", "[historical debt](missing.md)\n")
        sha = self.commit()
        result = self.release(sha)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("local overlay absent", result.stdout)
        self.assertNotIn("Markdown:", result.stdout)

    @unittest.skipUnless(shutil.which("docker"), "Docker Compose is unavailable")
    def test_real_compose_pr94_overlay_and_negative_contracts(self):
        self.write(light.COMPOSE, '''services:
  app:
    image: example/app
    ports: ["8080:8080"]
  db:
    image: postgres:16
''')
        base = self.commit()
        # main has no overlay; changes to base Compose remain valid for this checker.
        self.assertEqual(light.check_compose(base, {light.COMPOSE}, light.tree_paths(base)), [])
        self.write(light.LOCAL_COMPOSE, '''services:
  app:
    ports: !override
      - "127.0.0.1:${SUPPLY_DEV_PORT:-8080}:8080"
''')
        head = self.commit()
        self.assertEqual(light.check_compose(head, light.changed_paths(base, head), light.tree_paths(head)), [])
        release = self.release(head)
        self.assertEqual(release.returncode, 0, release.stderr)
        self.assertIn("real config passed", release.stdout)
        self.write(light.LOCAL_COMPOSE, '''services:
  app:
    ports: !override
      - "0.0.0.0:${SUPPLY_DEV_PORT:-8080}:8080"
''')
        bad = self.commit()
        self.assertTrue(light.check_compose(bad, {light.LOCAL_COMPOSE}, light.tree_paths(bad)))
        self.assertNotEqual(self.release(bad).returncode, 0)
        self.write(light.LOCAL_COMPOSE, '''services:
  app:
    ports: !override
      - "127.0.0.1:${SUPPLY_DEV_PORT:-8080}:8080"
  db:
    ports: ["5432:5432"]
''')
        bad = self.commit()
        self.assertTrue(light.check_compose(bad, {light.LOCAL_COMPOSE}, light.tree_paths(bad)))
        (self.root / light.LOCAL_COMPOSE).unlink()
        deleted = self.commit()
        self.assertTrue(light.check_compose(deleted, {light.LOCAL_COMPOSE}, light.tree_paths(deleted)))


if __name__ == "__main__":
    unittest.main()
