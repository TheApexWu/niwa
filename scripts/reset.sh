#!/bin/bash
# NIWA reset: kill processes, clear run data, ready for fresh demo
set -e

echo "NIWA RESET"
echo "=========="

# Kill any running niwa processes
pkill -f "niwa_loop" 2>/dev/null && echo "Killed running loop" || echo "No running loop"

# Clear coordinator memory (iteration logs)
rm -f agents/coordinator/memory/*.json
echo "Cleared memory logs"

# Clear photos from previous run
rm -f photos/*.jpg photos/*.jpeg photos/*.png
echo "Cleared photos"

# Clear previous output
rm -f niwa_evolution.json niwa_evolution.png
echo "Cleared output files"

# Verify API key
if [ -z "$NEBIUS_API_KEY" ]; then
    source .env 2>/dev/null || true
    if [ -z "$NEBIUS_API_KEY" ]; then
        echo "WARNING: NEBIUS_API_KEY not set"
    else
        echo "API key loaded from .env"
    fi
else
    echo "API key present"
fi

echo ""
echo "Ready. Run:"
echo "  python scoring/niwa_loop.py --photo-dir ./photos --iterations 20"
