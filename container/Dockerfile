FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       bash \
       ca-certificates \
       coreutils \
       findutils \
       gawk \
       git \
       grep \
       ripgrep \
       sed \
    && rm -rf /var/lib/apt/lists/*

COPY dsh-fs.mjs /usr/local/bin/dsh-fs.mjs
RUN chmod 0755 /usr/local/bin/dsh-fs.mjs

WORKDIR /workspace
USER 1000:1000
CMD ["sleep", "infinity"]
