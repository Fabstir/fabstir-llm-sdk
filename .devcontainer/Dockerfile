FROM node:18-bookworm

# Install Chrome for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium chromium-driver \
    build-essential python3 git curl jq \
    vim tmux inotify-tools netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer configuration
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install global packages
RUN npm install -g pnpm typescript ts-node \
    @playwright/test eslint prettier

# Install Rust for WASM bindings
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN cargo install wasm-pack

WORKDIR /workspace

# Copy YOLO scripts
COPY yolo-runner.sh test-watcher.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/*.sh

# Create developer user
RUN useradd -m -s /bin/bash developer && \
    echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

USER developer
WORKDIR /workspace

ENTRYPOINT ["/usr/local/bin/yolo-runner.sh"]