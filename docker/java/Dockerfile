FROM eclipse-temurin:21-jdk-alpine

# Create a non-root user for sandbox safety
RUN addgroup -S runner && adduser -S runner -G runner

# Set up working sandbox directory
WORKDIR /sandbox

# Switch to non-root user
USER runner
