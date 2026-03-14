FROM rust:1.77-alpine

RUN apk add --no-cache musl-dev

RUN addgroup -S runner && adduser -S runner -G runner
WORKDIR /sandbox
USER runner
