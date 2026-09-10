#!/bin/sh
# Resolve the container runtime's DNS (Podman aardvark-gateway vs Docker
# 127.0.0.11) and bake it into the nginx config template. Runs automatically
# via the nginx:alpine /docker-entrypoint.d hook before nginx starts.
set -e
if [ -z "${RESOLVER}" ]; then
    RESOLVER="$(awk '/^nameserver[[:space:]]+/ { print $2; exit }' /etc/resolv.conf 2>/dev/null || true)"
fi
if [ -z "${RESOLVER}" ]; then
    RESOLVER="127.0.0.11"
fi
export RESOLVER
envsubst '${RESOLVER}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
echo "[entrypoint] nginx resolver -> ${RESOLVER}"
