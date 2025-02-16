#!/bin/sh
set -ex  # Add this line for debug
SCRIPT_DIR=$(dirname $0)
echo "Creating env.js file..."
echo "window.env = {}" > $SCRIPT_DIR/public/env.js
# Use environment variables with fallback values
echo "window.env.NEXT_PUBLIC_API_URL = '${NEXT_PUBLIC_API_URL:-http://api:8080/api}'" >> $SCRIPT_DIR/public/env.js
echo "window.env.NEXT_PUBLIC_API_WS_URL = '${NEXT_PUBLIC_API_WS_URL:-ws://api:8080}'" >> $SCRIPT_DIR/public/env.js
echo "window.env.NEXT_PUBLIC_PUBLIC_URL = '${NEXT_PUBLIC_PUBLIC_URL:-http://api:8080}'" >> $SCRIPT_DIR/public/env.js
echo "Starting server..."
HOSTNAME=0.0.0.0 PORT=4000 node $SCRIPT_DIR/server.js
