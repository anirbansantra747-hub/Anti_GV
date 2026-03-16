#!/bin/bash

# Anti_GV Docker Runner Build Script
# This script builds all the required Docker images for the code execution engine.

set -e

echo "🚀 Starting Docker runner builds..."

# Array of image names and their Dockerfile paths
declare -A images=(
    ["antigv-java-runner"]="docker/java"
    ["antigv-node-runner"]="docker/node"
    ["antigv-python-runner"]="docker/python"
    ["antigv-gcc-runner"]="docker/gcc"
    ["antigv-go-runner"]="docker/go"
    ["antigv-rust-runner"]="docker/rust"
    ["antigv-ruby-runner"]="docker/ruby"
    ["antigv-php-runner"]="docker/php"
    ["antigv-dotnet-runner"]="docker/dotnet"
    ["antigv-kotlin-runner"]="docker/kotlin"
    ["antigv-bash-runner"]="docker/bash"
)

# Root directory of the project
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for img in "${!images[@]}"; do
    path="${images[$img]}"
    echo "📦 Building $img from $path..."
    docker build -t "$img:latest" "$ROOT_DIR/$path"
done

echo "✅ All Docker images built successfully!"
docker images | grep antigv
