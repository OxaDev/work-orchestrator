# syntax=docker/dockerfile:1.7
# Frontend image (ADR-0012): build the SPA, serve it with unprivileged nginx under BASE_PATH
# and proxy BASE_PATH/api/ to the backend (ADR-0011).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
ARG BASE_PATH=/work-orchestrator
ENV BASE_PATH=${BASE_PATH}
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime
ARG BASE_PATH=/work-orchestrator
# Read by the nginx template at container start and by the healthcheck.
ENV BASE_PATH=${BASE_PATH}
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
# Files live under the prefix on disk, so URL paths map 1:1 to files.
COPY --from=build /app/dist /usr/share/nginx/html${BASE_PATH}
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
    CMD wget -q --spider "http://127.0.0.1:8080${BASE_PATH}/" || exit 1
