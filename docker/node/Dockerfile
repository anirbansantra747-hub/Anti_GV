FROM node:20-alpine

# Global tools: TypeScript compiler + ESLint 8 + TS ESLint parser plugin
RUN npm install -g \
      typescript \
      eslint@8 \
      @typescript-eslint/parser@6 \
      @typescript-eslint/eslint-plugin@6 \
    && npm cache clean --force

RUN addgroup -S runner && adduser -S runner -G runner
WORKDIR /sandbox
USER runner
