#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.chess.pids"

start() {
    if [ -f "$PID_FILE" ]; then
        echo "Already running (found $PID_FILE). Run './chess.sh stop' first."
        exit 1
    fi

    echo "Starting backend..."
    source "$SCRIPT_DIR/.venv/bin/activate"
    uvicorn backend.main:app --app-dir "$SCRIPT_DIR" 2>&1 | sed 's/^/[backend] /' &
    BACKEND_PID=$!

    echo "Starting frontend..."
    cd "$SCRIPT_DIR/frontend" && npm run dev 2>&1 | sed 's/^/[frontend] /' &
    FRONTEND_PID=$!

    echo "$BACKEND_PID $FRONTEND_PID" > "$PID_FILE"

    echo ""
    echo "  Backend:  http://localhost:8000"
    echo "  Frontend: http://localhost:5174"
    echo ""
    echo "Press Ctrl+C to stop, or run './chess.sh stop' from another terminal."

    wait
}

stop() {
    if [ ! -f "$PID_FILE" ]; then
        echo "Not running (no $PID_FILE found)."
        exit 0
    fi

    read BACKEND_PID FRONTEND_PID < "$PID_FILE"
    echo "Stopping..."
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "Stopped."
}

case "${1:-start}" in
    start) start ;;
    stop)  stop  ;;
    *) echo "Usage: $0 [start|stop]" ; exit 1 ;;
esac
