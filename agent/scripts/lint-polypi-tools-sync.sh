#!/usr/bin/env bash
# Verify the Pi-side polypi tool catalog matches the polypi-side route set.
# Fails (exit 1) if either side has a tool the other doesn't.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
POLYPI_REPO="${POLYPI_REPO:-$SCRIPT_DIR/../../../polypi}"
PI_TOOLS_FILE="$SCRIPT_DIR/../src/extensions/up-polypi-tools.ts"

if [[ ! -d "$POLYPI_REPO" ]]; then
    echo "polypi repo not found at $POLYPI_REPO; skipping sync lint"
    exit 0
fi

# Polypi side: extract @router.post route paths from each service's routes.py
cd "$POLYPI_REPO"
polypi_tools=$(
    {
        if [[ -f app/api/account/routes.py ]]; then
            grep -oE '@router\.post\("/[a-z_]+"\)' app/api/account/routes.py \
                | sed 's|.*"/||;s|".*||' \
                | awk '{print "polypi_account_" $0}'
        fi
        if [[ -f app/api/order/routes.py ]]; then
            grep -oE '@router\.post\("/[a-z_]+"\)' app/api/order/routes.py \
                | sed 's|.*"/||;s|".*||' \
                | awk '{print "polypi_order_" $0}'
        fi
    } | sort -u
)

# Pi side: extract tool names from the static catalog
pi_tools=$(grep -oE '"polypi_[a-z_]+"' "$PI_TOOLS_FILE" | tr -d '"' | sort -u)

if [[ "$polypi_tools" == "$pi_tools" ]]; then
    count=$(echo "$pi_tools" | wc -l | tr -d ' ')
    echo "polypi tool catalog in sync ($count tools)"
    exit 0
fi

echo "DRIFT detected:"
echo "polypi-only:" $(comm -23 <(echo "$polypi_tools") <(echo "$pi_tools"))
echo "pi-only:    " $(comm -13 <(echo "$polypi_tools") <(echo "$pi_tools"))
exit 1
