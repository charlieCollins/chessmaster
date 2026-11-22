#!/bin/bash
# Start/stop the local dev servers (FastAPI backend + Vite frontend).
#   ./chess.sh [start|stop|restart]
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.chess.pids"

# Each server runs in its own process group (via setsid), and we record the
# group leader's PID. Stopping kills the whole group, so child processes
# (vite under npm, the log-prefixing sed) go away too.

is_running() {
    [ -n "$1" ] && kill -0 -- "-$1" 2>/dev/null
}

stop() {
    if [ ! -f "$PID_FILE" ]; then
        echo "Not running (no $PID_FILE found)."
        return 0
    fi
    echo "Stopping..."
    for pgid in $(cat "$PID_FILE"); do
        kill -TERM -- "-$pgid" 2>/dev/null || true
    done
    # Give them a moment to exit cleanly, then force.
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        alive=0
        for pgid in $(cat "$PID_FILE"); do is_running "$pgid" && alive=1; done
        [ "$alive" = 0 ] && break
        sleep 0.5
    done
    for pgid in $(cat "$PID_FILE"); do
        kill -KILL -- "-$pgid" 2>/dev/null || true
    done
    rm -f "$PID_FILE"
    echo "Stopped."
}

start() {
    if [ -f "$PID_FILE" ]; then
        live=0
        for pgid in $(cat "$PID_FILE"); do is_running "$pgid" && live=1; done
        if [ "$live" = 1 ]; then
            echo "Already running. Run './chess.sh stop' first."
            exit 1
        fi
        echo "Removing stale $PID_FILE"
        rm -f "$PID_FILE"
    fi

    echo "Starting backend..."
    setsid bash -c "cd '$SCRIPT_DIR' && exec '$SCRIPT_DIR/.venv/bin/uvicorn' backend.main:app 2>&1 | sed -u 's/^/[backend] /'" &
    BACKEND_PGID=$!

    echo "Starting frontend..."
    setsid bash -c "cd '$SCRIPT_DIR/frontend' && npm run dev 2>&1 | sed -u 's/^/[frontend] /'" &
    FRONTEND_PGID=$!

    echo "$BACKEND_PGID $FRONTEND_PGID" > "$PID_FILE"

    # Ctrl+C / termination of this script stops both servers and cleans up.
    trap 'echo; stop; exit 0' INT TERM

    echo ""
    echo "  Backend:  http://localhost:8000"
    echo "  Frontend: http://localhost:5174"
    echo ""
    echo "Press Ctrl+C to stop, or run './chess.sh stop' from another terminal."

    wait
}

case "${1:-start}" in
    start)   start ;;
    stop)    stop  ;;
    restart) stop; sleep 1; start ;;
    *) echo "Usage: $0 [start|stop|restart]" ; exit 1 ;;
esac
