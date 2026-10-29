#!/usr/bin/env bash
set -euo pipefail
cd /workspace/DeadlockBuildCreator
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) { throw new Error("Node.js 24 ou supérieur requis") }'
mkdir -p /workspace/.cache/npm
npm ci --cache /workspace/.cache/npm --no-fund
npm run build
npm test
