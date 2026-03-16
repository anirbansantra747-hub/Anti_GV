# Anti_GV Docker Runner Build Script for Windows
# This script builds all the required Docker images for the code execution engine.

Write-Host "Starting Docker runner builds..." -ForegroundColor Cyan

# HashTable of image names and their Dockerfile paths
$images = @{
    "antigv-java-runner"   = "docker/java"
    "antigv-node-runner"   = "docker/node"
    "antigv-python-runner" = "docker/python"
    "antigv-gcc-runner"    = "docker/gcc"
    "antigv-go-runner"     = "docker/go"
    "antigv-rust-runner"   = "docker/rust"
    "antigv-ruby-runner"   = "docker/ruby"
    "antigv-php-runner"    = "docker/php"
    "antigv-dotnet-runner" = "docker/dotnet"
    "antigv-kotlin-runner" = "docker/kotlin"
    "antigv-bash-runner"   = "docker/bash"
}

# Get the root directory (parent of the scripts folder)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

foreach ($img in $images.Keys) {
    $path = $images[$img]
    $FullBuildPath = Join-Path $RootDir $path
    Write-Host "Building $img from $path..." -ForegroundColor Yellow
    docker build -t "$($img):latest" $FullBuildPath
}

Write-Host "All Docker images built successfully!" -ForegroundColor Green
docker images | Select-String "antigv"
