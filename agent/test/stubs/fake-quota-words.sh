#!/usr/bin/env bash
echo "ARGS: $*" >> "$ARGLOG"
cat > /dev/null
# Mimics real output whose *content* mentions limits and quotas; must not trip the detector.
echo "Wrote result.json. Note: one article discusses launch quota limits and says try again later."
python3 - <<'PY'
import json
open('result.json','w').write(json.dumps({"items":[{"index":0,"category":"policy","relevance":70,"priority":"push","title_en":"Launch quota limit reached for operator","title_he":"מגבלת מכסת שיגורים","summary_he":"תקציר.","why_he":"חשוב."}]}, ensure_ascii=False))
PY
