"""Offline regression tests for handoff and command execution semantics."""

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("portable_harness", Path(__file__).with_name("run.py"))
harness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)


class HarnessTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        (self.root / ".harness").mkdir()
        (self.root / "docs/tasks").mkdir(parents=True)
        (self.root / "docs/tasks/TEMPLATE.md").write_text(
            "# {{title}}\n{{task_id}}\n{{branch}}\n{{commit}}\n{{timestamp}}\n{{git_status}}\n",
            encoding="utf-8",
        )
        self.data = {"schema_version": 1, "harness_version": "1.0.0", "commands": {
            "probe": {"argv": ["{python}", "-c", "raise SystemExit(7)"], "cwd": ".", "effect": "test", "evidence": []}
        }}
        self.save()

    def save(self):
        (self.root / ".harness/project.json").write_text(json.dumps(self.data), encoding="utf-8")

    def test_reject_parent_path(self):
        with self.assertRaises(ValueError):
            harness.inside(self.root, "../outside")

    def test_reject_absolute_path(self):
        with self.assertRaises(ValueError):
            harness.inside(self.root, "/outside")

    def test_reject_windows_path(self):
        with self.assertRaises(ValueError):
            harness.inside(self.root, "C:/outside")

    def test_unknown_command_is_error(self):
        with self.assertRaises(ValueError):
            harness.run_command(self.root, "missing")

    def test_command_failure_propagates(self):
        self.assertEqual(harness.run_command(self.root, "probe"), 7)

    def test_dry_run_does_not_execute(self):
        with patch.object(harness.subprocess, "run") as execute:
            self.assertEqual(harness.run_command(self.root, "probe", True), 0)
            execute.assert_not_called()

    def test_arguments_remain_separate_and_no_shell(self):
        self.data["commands"]["probe"]["argv"] = ["{python}", "-c", "pass", "a b; literal"]
        self.save()
        with patch.object(harness.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as execute:
            harness.run_command(self.root, "probe")
            self.assertEqual(execute.call_args.args[0][-1], "a b; literal")
            self.assertNotIn("shell", execute.call_args.kwargs)
            self.assertEqual(execute.call_args.kwargs["cwd"], self.root)

    def test_invalid_task_id_is_rejected(self):
        with self.assertRaises(ValueError):
            harness.handoff(self.root, "../bad", "title")

    def test_reserved_task_id_is_rejected(self):
        with self.assertRaises(ValueError):
            harness.handoff(self.root, "con", "title")

    def test_handoff_captures_state_and_never_overwrites(self):
        with patch.object(harness, "state", return_value={"branch": "feature", "commit": "abc", "changes": " M code.py"}):
            self.assertEqual(harness.handoff(self.root, "task-1", "인계 작업"), 0)
            destination = self.root / "docs/tasks/task-1.md"
            original = destination.read_text(encoding="utf-8")
            self.assertIn("인계 작업", original)
            self.assertIn("feature\nabc", original)
            self.assertIn(" M code.py", original)
            self.assertNotIn("{{", original)
            with self.assertRaises(FileExistsError):
                harness.handoff(self.root, "task-1", "overwrite")
            self.assertEqual(destination.read_text(encoding="utf-8"), original)

    def test_parent_repository_is_rejected(self):
        with patch.object(harness, "git", return_value=str(self.root.parent)):
            with self.assertRaises(ValueError):
                harness.state(self.root)

    def test_missing_file_fails_validation(self):
        with self.assertRaises(ValueError):
            harness.check(self.root)


if __name__ == "__main__":
    unittest.main()
