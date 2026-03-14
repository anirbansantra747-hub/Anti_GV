FROM alpine:3.19

RUN apk add --no-cache gcc g++ musl-dev

RUN addgroup -S runner && adduser -S runner -G runner
WORKDIR /sandbox
USER runner
