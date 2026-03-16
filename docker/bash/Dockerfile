FROM alpine:3.19

# bash + standard POSIX tools
RUN apk add --no-cache bash coreutils

RUN addgroup -S runner && adduser -S runner -G runner
WORKDIR /sandbox
USER runner
