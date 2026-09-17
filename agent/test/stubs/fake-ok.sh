#!/usr/bin/env bash
# Stands in for the claude CLI: echoes the flags it received, then writes a valid result.json
# into the cwd (which runClaudeTask sets to the scratch dir holding task.json).
echo "ARGS: $*" >> "$ARGLOG"
cat > "$(dirname "$ARGLOG")/prompt.txt"
if [ ! -f task.json ]; then echo "task.json missing in $(pwd)" >&2; exit 3; fi
python3 - <<'PY'
import json
task = json.load(open('task.json'))
items = [
    {
        "index": it["index"],
        "category": "defense",
        "relevance": 80,
        "priority": "push",
        "title_en": "English headline for " + it["title"][:40],
        "title_he": "כותרת בעברית",
        "summary_he": "תקציר.",
        "why_he": "חשוב למנהלת.",
    }
    for it in task["items"]
]
# Wrapped in prose and a code fence on purpose: the bridge must tolerate both.
open('result.json', 'w').write("Here you go:\n```json\n" + json.dumps({"items": items}, ensure_ascii=False) + "\n```\n")
PY
echo "done"
