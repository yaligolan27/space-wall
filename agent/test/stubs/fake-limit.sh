#!/usr/bin/env bash
echo "ARGS: $*" >> "$ARGLOG"
cat > /dev/null
echo "Claude usage limit reached"
echo "You've hit your weekly limit. Your limit will reset at 3pm." >&2
exit 1
