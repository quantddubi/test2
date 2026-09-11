"""Portable repository harness. Python 3.11+; standard library only."""

import argparse
import ast
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION = "1.0.0"
REQUIRED = (
    "AGENTS.md", "CLAUDE.md", ".harness/project.json", ".harness/test_runner.py",
    "docs/ai-harness/WORKFLOW.md", "docs/ai-harness/PROJECT.md",
    "docs/tasks/TEMPLATE.md", "docs/tasks/README.md",
)


def inside(root, relative):
    """Resolve only repository-relative paths, including on Windows."""
    if not isinstance(relative, str) or "\\" in relative:
        raise ValueError("Use a repository-relative POSIX path")
    path = Path(relative)
    if path.is_absolute() or ":" in relative or ".." in path.parts:
        raise ValueError("Path must stay inside the repository")
    resolved = (root / path).resolve()
    if not resolved.is_relative_to(root.resolve()):
        raise ValueError("Path escapes the repository")
    return resolved


def config(root):
    data = json.loads((root / ".harness/project.json").read_text(encoding="utf-8"))
    if data.get("schema_version") != 1 or data.get("harness_version") != VERSION:
        raise ValueError("Unsupported harness schema/version")
    if not isinstance(data.get("commands"), dict):
        raise ValueError("commands must be an object")
    return data


def check(root):
    """Validate harness wiring. This does not run application tests."""
    data = config(root)
    for name in REQUIRED:
        if not inside(root, name).is_file():
            raise ValueError("Missing harness file: " + name)
    for scope in data["instruction_scopes"]:
        agents = inside(root, scope["agents"])
        claude = inside(root, scope["claude"])
        if not agents.is_file() or not claude.is_file():
            raise ValueError("Missing scoped instruction file")
        if "@AGENTS.md" not in claude.read_text(encoding="utf-8").splitlines():
            raise ValueError("CLAUDE.md must import its sibling AGENTS.md")
        if scope.get("context") and not inside(root, scope["context"]).is_file():
            raise ValueError("Missing shared project context")
    for reference in data["read_first"] + data["state_documents"]:
        if not inside(root, reference).is_file():
            raise ValueError("Missing documented reference: " + reference)
    for name, command in data["commands"].items():
        argv = command.get("argv")
        if not isinstance(argv, list) or not argv or not all(
            isinstance(arg, str) and arg and "\x00" not in arg for arg in argv
        ):
            raise ValueError("Invalid command arguments: " + name)
        if not inside(root, command["cwd"]).is_dir():
            raise ValueError("Missing command directory: " + name)
        for evidence in command["evidence"]:
            if not inside(root, evidence).is_file():
                raise ValueError("Missing command evidence: " + evidence)
    for relative in (".harness/run.py", ".harness/test_runner.py"):
        ast.parse(inside(root, relative).read_text(encoding="utf-8"), filename=relative)
    print("HARNESS_OK: instructions, references and command definitions checked.")
    print("Application tests/builds were NOT executed. Use commands, then run <name>.")
    return 0


def git(root, *args):
    executable = shutil.which("git")
    if not executable:
        raise ValueError("Git is required for status and handoff")
    result = subprocess.run(
        [executable, "-c", "core.quotepath=false", *args], cwd=root,
        capture_output=True, text=True, encoding="utf-8", errors="replace", check=False,
    )
    if result.returncode:
        raise ValueError("Git command failed: " + " ".join(args))
    return result.stdout.strip()


def state(root):
    actual_root = Path(git(root, "rev-parse", "--show-toplevel")).resolve()
    if actual_root != root.resolve():
        raise ValueError("Harness must belong to this Git repository root")
    return {
        "branch": git(root, "rev-parse", "--abbrev-ref", "HEAD"),
        "commit": git(root, "rev-parse", "HEAD"),
        "changes": git(root, "status", "--short", "--untracked-files=normal"),
    }


def handoff(root, slug, title):
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", slug):
        raise ValueError("Task ID: 1-80 lowercase letters, numbers or hyphens")
    if slug.upper() in {"CON", "PRN", "AUX", "NUL", *[f"COM{i}" for i in range(1, 10)],
                       *[f"LPT{i}" for i in range(1, 10)]}:
        raise ValueError("Reserved task ID")
    current = state(root)
    destination = inside(root, "docs/tasks/" + slug + ".md")
    template = inside(root, "docs/tasks/TEMPLATE.md").read_text(encoding="utf-8")
    content = template.replace("{{title}}", " ".join(title.splitlines()))
    content = content.replace("{{task_id}}", slug)
    content = content.replace("{{branch}}", current["branch"])
    content = content.replace("{{commit}}", current["commit"])
    content = content.replace("{{timestamp}}", datetime.now(timezone.utc).isoformat())
    content = content.replace("{{git_status}}", current["changes"] or "(clean)")
    with destination.open("x", encoding="utf-8", newline="\n") as output:
        output.write(content)
    print(destination.relative_to(root).as_posix())
    print("Fill the goal, acceptance criteria, validation and next action before handing off.")
    return 0


def run_command(root, name, dry_run=False):
    command = config(root)["commands"].get(name)
    if command is None:
        raise ValueError("No configured command: " + name + ". Use commands to inspect available options.")
    argv = [sys.executable if arg == "{python}" else arg for arg in command["argv"]]
    directory = inside(root, command["cwd"])
    print(json.dumps({"argv": argv, "cwd": command["cwd"], "effect": command["effect"]}, ensure_ascii=False), flush=True)
    if dry_run:
        return 0
    executable = shutil.which(argv[0])
    if not executable:
        raise ValueError("Executable not found: " + argv[0])
    argv[0] = executable
    environment = os.environ.copy()
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    environment["PYTHONUTF8"] = "1"
    return subprocess.run(argv, cwd=directory, env=environment, check=False).returncode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    for action in ("check", "status", "commands", "doctor"):
        sub.add_parser(action)
    execute = sub.add_parser("run")
    execute.add_argument("name")
    execute.add_argument("--dry-run", action="store_true")
    transfer = sub.add_parser("handoff")
    transfer.add_argument("task_id")
    transfer.add_argument("--title", required=True)
    args = parser.parse_args()
    try:
        if args.action == "check":
            return check(ROOT)
        if args.action == "status":
            print(json.dumps(state(ROOT), ensure_ascii=False, indent=2))
        elif args.action == "commands":
            print(json.dumps(config(ROOT)["commands"], ensure_ascii=False, indent=2))
        elif args.action == "doctor":
            print(json.dumps({"python": sys.executable, "version": sys.version.split()[0],
                              "tools": {name: bool(shutil.which(name)) for name in ("git", "uv", "node", "npm", "pnpm", "Rscript")}}, indent=2))
        elif args.action == "run":
            return run_command(ROOT, args.name, args.dry_run)
        elif args.action == "handoff":
            return handoff(ROOT, args.task_id, args.title)
        return 0
    except (OSError, ValueError, KeyError) as exc:
        print("HARNESS_ERROR: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
