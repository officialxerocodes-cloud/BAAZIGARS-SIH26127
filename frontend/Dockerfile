# Build: docker build -t trinetra-frontend .
# Run (dev, same-origin via Vite proxy): npm install && npm run dev
# Served behind compose: vite build output on nginx :80.
FROM docker.io/library/node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# VITE_API_BASE_URL is baked at build time; leave empty for same-origin
# (Vite dev proxy / compose nginx) and set it only for cross-origin builds.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM docker.io/library/nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Template + resolver hook: the dashboard must survive api-container
# recreates (new IP), so nginx resolves `api` at runtime via the container
# runtime's DNS instead of a static upstream block. RESOLVER env overrides.
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template
COPY docker-entrypoint.d/10-resolver.sh /docker-entrypoint.d/10-resolver.sh
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
