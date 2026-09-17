#!/usr/bin/env bash
echo "ARGS: $*" >> "$ARGLOG"
cat > /dev/null
printf %s '{"items":[{"index":0,"category":"not-a-category","relevance":900,"priority":"push","title_en":"x","title_he":"y","summary_he":"z","why_he":"w"}]}' > result.json
