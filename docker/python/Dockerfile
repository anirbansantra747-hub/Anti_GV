FROM python:3.12-alpine

RUN pip install --no-cache-dir pylint flake8

RUN addgroup -S runner && adduser -S runner -G runner
WORKDIR /sandbox
USER runner
