"""Tasks CLI: list / create / start / set-progress / mark-done / status

Schema per entry:
  status: "pending" | "in_progress" | "completed"
  summary: str
  created_at: ISO timestamp
  updated_at: ISO timestamp | null
  type: "task" | "bug" | "feature" | "research" | "chore" | "reference"
  source: "claudetalk" | "ops-daemon" | "cc" | "manual"
  priority: "low" | "medium" | "high" | "critical"
  progress: str | null   (free-text progress notes)
  actions: [{"text": str, "value": str}] | null
"""

import argparse, json, sys
from datetime import datetime, timezone
from pathlib import Path

INDEX = Path(__file__).resolve().parent / "index.json"

TASK_TYPES = ("task", "bug", "feature", "research", "chore", "reference")
TASK_SOURCES = ("claudetalk", "ops-daemon", "cc", "manual")
TASK_PRIORITIES = ("low", "medium", "high", "critical")

def _load():
    return json.loads(INDEX.read_text("utf-8"))

def _save(data):
    INDEX.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", "utf-8")

STATUS_ICON = {"pending": "◌", "in_progress": "▶", "completed": "✓", "task-pending": "◌"}


def cmd_list(args):
    data = _load()
    active_statuses = ("pending", "task-pending", "in_progress")
    for k, v in sorted(data.items()):
        if v.get("status") not in active_statuses:
            continue
        if dt := (args.type or next(t for t in TASK_TYPES if t == v.get("type", "task"))):
            if args.type and v.get("type", "task") != args.type:
                continue
        s = v.get("source", "manual")
        priority = v.get("priority", "")
        pbar = v.get("progress", "")
        t = v.get("type", "task")
        icon = STATUS_ICON.get(v.get("status", ""), "·")
        extra = f" [pri={priority}]" if priority else ""
        extra += f" [{pbar[:30]}]" if pbar else ""
        print(f"  {icon} {k}  [{t}/{s}]{extra}")
        print(f"    {v.get('summary', '')}")
        print(f"    created: {v.get('created_at', '')}")
    pending = [v for v in data.values() if v.get("status") in ("pending", "task-pending")]
    doing = [v for v in data.values() if v.get("status") == "in_progress"]
    print(f"\n--- {len(pending)} pending, {len(doing)} in progress ---")


def cmd_create(args):
    if not args.summary:
        print("error: summary is required", file=sys.stderr)
        sys.exit(1)
    data = _load()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    import re
    slug = re.sub(r"[^一-龥a-zA-Z0-9]", "-", args.summary)[:40].strip("-") or "task"
    seq = 1
    prefix = f"{today}/"
    for task_id in data:
        if task_id.startswith(prefix):
            parts = task_id[len(prefix):].split("-", 1)
            if parts and parts[0].isdigit():
                seq = max(seq, int(parts[0]) + 1)
    task_id = f"{today}/{str(seq).zfill(3)}-{slug}"
    now = datetime.now(timezone.utc).isoformat()
    entry = {
        "status": "pending",
        "summary": args.summary[:80],
        "created_at": now,
        "updated_at": None,
        "type": args.type,
        "source": args.source,
        "priority": args.priority,
    }
    if args.actions:
        entry["actions"] = [{"text": a, "value": a} for a in args.actions]
    data[task_id] = entry
    _save(data)
    print(f"created: {task_id}")
    return task_id


def _find_task(data, query):
    if query in data:
        return query
    matches = [k for k in data if query in k or query in data[k].get("summary", "")]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        print(f"multiple matches for '{query}':", file=sys.stderr)
        for m in matches:
            print(f"  {m}", file=sys.stderr)
        sys.exit(1)
    return None


def cmd_mark_done(args):
    if not args.query:
        print("error: task-id-or-keyword is required", file=sys.stderr)
        sys.exit(1)
    data = _load()
    task_id = _find_task(data, args.query)
    if not task_id:
        print(f"task not found: {args.query}", file=sys.stderr)
        sys.exit(1)
    data[task_id]["status"] = "completed"
    data[task_id]["updated_at"] = datetime.now(timezone.utc).isoformat()
    _save(data)
    print(f"marked done: {task_id}")


def cmd_start(args):
    """Mark a task as in_progress."""
    if not args.query:
        print("error: task-id-or-keyword is required", file=sys.stderr)
        sys.exit(1)
    data = _load()
    task_id = _find_task(data, args.query)
    if not task_id:
        print(f"task not found: {args.query}", file=sys.stderr)
        sys.exit(1)
    data[task_id]["status"] = "in_progress"
    data[task_id]["updated_at"] = datetime.now(timezone.utc).isoformat()
    _save(data)
    print(f"started: {task_id}")


def cmd_set_progress(args):
    """Set progress notes on a task."""
    if not args.query:
        print("error: task-id-or-keyword is required", file=sys.stderr)
        sys.exit(1)
    data = _load()
    task_id = _find_task(data, args.query)
    if not task_id:
        print(f"task not found: {args.query}", file=sys.stderr)
        sys.exit(1)
    data[task_id]["progress"] = args.notes or ""
    data[task_id]["updated_at"] = datetime.now(timezone.utc).isoformat()
    _save(data)
    print(f"progress updated: {task_id}")


def cmd_set_priority(args):
    """Set priority on a task."""
    if not args.query:
        print("error: task-id-or-keyword is required", file=sys.stderr)
        sys.exit(1)
    data = _load()
    task_id = _find_task(data, args.query)
    if not task_id:
        print(f"task not found: {args.query}", file=sys.stderr)
        sys.exit(1)
    if args.priority not in TASK_PRIORITIES:
        print(f"error: priority must be one of {TASK_PRIORITIES}", file=sys.stderr)
        sys.exit(1)
    data[task_id]["priority"] = args.priority
    data[task_id]["updated_at"] = datetime.now(timezone.utc).isoformat()
    _save(data)
    print(f"priority set: {task_id} → {args.priority}")


def cmd_status(args):
    data = _load()
    pending = sum(1 for v in data.values() if v.get("status") in ("pending", "task-pending"))
    doing = sum(1 for v in data.values() if v.get("status") == "in_progress")
    completed = sum(1 for v in data.values() if v.get("status") == "completed")
    print(f"tasks:  {len(data)} total")
    print(f"        {pending} pending")
    print(f"        {doing} in progress")
    print(f"        {completed} completed")

    if args.type:
        by_type = sum(1 for v in data.values() if v.get("type", "task") == args.type)
        print(f"        {by_type} type={args.type}")


def _build_parser():
    p = argparse.ArgumentParser(prog="tasks")
    sub = p.add_subparsers(dest="cmd")

    lp = sub.add_parser("list", help="List pending/in_progress tasks")
    lp.add_argument("--type", choices=TASK_TYPES, default="", help="Filter by task type")

    cp = sub.add_parser("create", help="Create a new pending task")
    cp.add_argument("summary", help="Task summary (max 80 chars)")
    cp.add_argument("--type", choices=TASK_TYPES, default="task", help="Task type (default: task)")
    cp.add_argument("--source", choices=TASK_SOURCES, default="manual", help="Source (default: manual)")
    cp.add_argument("--priority", choices=TASK_PRIORITIES, default="medium", help="Priority (default: medium)")
    cp.add_argument("--action", dest="actions", action="append", help="Suggested action (repeatable)")

    sp = sub.add_parser("start", help="Mark task as in_progress")
    sp.add_argument("query", help="Task ID or keyword to match")

    pp = sub.add_parser("set-progress", help="Set progress notes on a task")
    pp.add_argument("query", help="Task ID or keyword to match")
    pp.add_argument("notes", help="Progress description (free text)")

    pyp = sub.add_parser("set-priority", help="Set task priority")
    pyp.add_argument("query", help="Task ID or keyword to match")
    pyp.add_argument("priority", choices=TASK_PRIORITIES, help="Priority level")

    mp = sub.add_parser("mark-done", help="Mark a task as completed")
    mp.add_argument("query", help="Task ID or keyword to match")

    stp = sub.add_parser("status", help="Show summary counts")
    stp.add_argument("--type", choices=TASK_TYPES, default="", help="Filter by type")

    return p


if __name__ == "__main__":
    parser = _build_parser()
    args = parser.parse_args()
    if not args.cmd:
        parser.print_usage()
        sys.exit(1)
    cmds = {"list": cmd_list, "create": cmd_create, "start": cmd_start, "set-progress": cmd_set_progress,
            "set-priority": cmd_set_priority, "mark-done": cmd_mark_done, "status": cmd_status}
    cmds[args.cmd](args)
