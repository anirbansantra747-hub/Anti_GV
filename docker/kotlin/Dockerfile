FROM alpine:3.19

# Install OpenJDK 21 and Kotlin from Alpine community repo
RUN apk add --no-cache openjdk21-jdk kotlin

RUN addgroup -S runner && adduser -S runner -G runner
WORKDIR /sandbox
USER runner
