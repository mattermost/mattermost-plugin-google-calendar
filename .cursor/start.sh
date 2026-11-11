#!/usr/bin/env bash
# Starts Docker for the E2E stack and, like the GitLab plugin's start hook, maps the hostname the
# agent's browser needs: accounts.google.com goes to the fake Google's consent pages on 127.0.0.1:443
# (E2E_FAKE_HTTPS_PORT in .cursor/Dockerfile). trust-fake-google.sh makes the browser trust the
# fake's certificate once the stack is up. The Playwright suite's Chromium does not rely on either:
# it maps the host with --host-resolver-rules (e2e/playwright/lib/browser.ts).
#
# Hardened like the Playbooks and core repos' start hooks: falls back to starting dockerd directly
# when the service script fails, fixes socket access for the current session, prints Docker's logs
# on failure, and logs in to Docker Hub when DOCKERHUB_USERNAME and DOCKERHUB_TOKEN are set as
# Cursor environment secrets (anonymous pulls can hit rate limits).
set -euo pipefail

log() { echo "[cloud-agent-start] $*"; }

if ! command -v docker >/dev/null 2>&1; then
    log "Docker is not installed, so this agent did not boot from .cursor/Dockerfile." >&2
    log "Check the agent's environment: a saved or default environment may have been used instead." >&2
    exit 1
fi

if ! grep -qE '^127\.0\.0\.1[[:space:]]+accounts\.google\.com$' /etc/hosts; then
    echo "127.0.0.1 accounts.google.com" | sudo tee -a /etc/hosts >/dev/null
fi

ensure_socket_access() {
    [[ -S /var/run/docker.sock ]] || return 0
    sudo chgrp docker /var/run/docker.sock 2>/dev/null || true
    sudo chmod g+rw /var/run/docker.sock 2>/dev/null || true
    if command -v setfacl >/dev/null 2>&1; then
        sudo setfacl -m "u:$(id -un):rw" /var/run/docker.sock 2>/dev/null || true
    fi
}

docker_login_if_configured() {
    if [[ -z "${DOCKERHUB_USERNAME:-}" || -z "${DOCKERHUB_TOKEN:-}" ]]; then
        log "Docker Hub credentials not configured; anonymous pulls may hit rate limits."
        return 0
    fi
    if echo "${DOCKERHUB_TOKEN}" | docker login -u "${DOCKERHUB_USERNAME}" --password-stdin >/tmp/docker-login.log 2>&1; then
        log "Logged in to Docker Hub as ${DOCKERHUB_USERNAME}."
    else
        log "Docker Hub login failed; see /tmp/docker-login.log." >&2
    fi
}

ready() {
    docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1
}

ensure_socket_access
if ! ready; then
    sudo sh -c 'service docker start >/tmp/docker-service-start.log 2>&1' ||
        log "service docker start failed; starting dockerd directly."
    if ! pgrep -x dockerd >/dev/null 2>&1; then
        sudo rm -f /var/run/docker.pid
        sudo sh -c 'nohup dockerd --host=unix:///var/run/docker.sock >/tmp/dockerd.log 2>&1 &'
    fi
    for _ in $(seq 1 60); do
        ensure_socket_access
        ready && break
        sleep 1
    done
fi

if ! ready; then
    log "Docker did not become ready within 60 seconds." >&2
    for f in /tmp/docker-service-start.log /var/log/docker.log /tmp/dockerd.log; do
        if [[ -f "$f" ]]; then
            log "$f:" >&2
            sudo tail -n 80 "$f" >&2 || true
        fi
    done
    exit 1
fi

docker_login_if_configured
log "Docker is ready."
