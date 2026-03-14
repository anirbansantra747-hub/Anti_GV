FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine

# Pre-build a console app project so NuGet packages are restored in the image layer.
# At runtime we just replace Program.cs and run --no-restore (fast).
WORKDIR /template
RUN dotnet new console -n runner --no-update-check --force -f net8.0 \
    && cd runner \
    && dotnet restore \
    && dotnet build -c Release -o /template/runner/bin/Release/net8.0

RUN addgroup -S runner && adduser -S runner -G runner \
    && chmod -R 755 /template

WORKDIR /sandbox
USER runner
