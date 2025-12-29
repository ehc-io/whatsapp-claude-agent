# syntax=docker/dockerfile:1
FROM oven/bun:1-debian AS base

# Create non-root user with sudo privileges
ARG USERNAME=agent
ARG USER_UID=1000
ARG USER_GID=$USER_UID

WORKDIR /app

# Install dependencies for Baileys (WhatsApp), Playwright, and general utilities
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    git \
    bash \
    zsh \
    unzip \
    autojump \
    nodejs \
    npm \
    sudo \
    vim \
    locales \
    # Playwright/Chromium dependencies
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/* \
    && sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen \
    && locale-gen

# Create non-root user and add to sudo group with passwordless sudo
# Use --force to handle existing GID, and --non-unique to allow reusing UID if needed
RUN groupadd --gid $USER_GID --force $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME -s /bin/zsh --non-unique 2>/dev/null \
    || useradd --gid $USER_GID -m $USERNAME -s /bin/zsh \
    && echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

# Set locale environment variables
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

# Install global packages as root
RUN npm i -g @anthropic-ai/claude-code playwright @playwright/mcp

# Set ownership for /app directory
RUN chown -R $USERNAME:$USERNAME /app

# Switch to non-root user for remaining setup
USER $USERNAME
ENV HOME=/home/$USERNAME
WORKDIR /home/$USERNAME

# Set Playwright environment variables
ENV PLAYWRIGHT_BROWSERS_PATH=/home/agent/.cache/ms-playwright

# Install Playwright MCP browser (uses its own browser installation)
# This installs the specific chromium version that @playwright/mcp expects
RUN npx --package=@playwright/mcp playwright install chromium

# Create stable symlink for Chromium executable (as root, then switch back)
USER root
RUN ln -sf /home/agent/.cache/ms-playwright/chromium-*/chrome-linux/chrome /usr/local/bin/chromium 2>/dev/null || true
USER $USERNAME

# Pre-configure Claude Code with Playwright MCP
RUN mkdir -p /home/agent/.claude && \
    echo '{"mcpServers":{"playwright":{"command":"npx","args":["@playwright/mcp","--browser","chromium"]}}}' > /home/agent/.claude.json

# Setup ZSH with Oh My Zsh and plugins for interactive shell usage
ENV HOME=/home/agent
RUN touch $HOME/.zshrc \
    && export CHSH='no' \
    && export RUNZSH='no' \
    && export HOME=/home/agent \
    && sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" \
    && git clone https://github.com/zsh-users/zsh-syntax-highlighting.git $HOME/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting \
    && git clone https://github.com/zsh-users/zsh-autosuggestions $HOME/.oh-my-zsh/custom/plugins/zsh-autosuggestions \
    && git clone --depth 1 https://github.com/junegunn/fzf.git $HOME/.fzf \
    && $HOME/.fzf/install --all \
    && curl -s https://gist.githubusercontent.com/ehc-io/52a3549eb17dda934925149b9048f566/raw/ac4ab8a96dd65a50506293c200de29533ff1b1bb/zshrc -o $HOME/.zshrc

# Switch back to /app for application
WORKDIR /app

# ─────────────────────────────────────────────────────────────────────────────
# Dependencies stage
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS deps

USER root
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile && chown -R agent:agent /app

USER agent

# ─────────────────────────────────────────────────────────────────────────────
# Development stage (includes dev dependencies)
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS development

USER root
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=agent:agent . .

# Create directories for persistence
RUN mkdir -p /app/.whatsapp-session /workspace \
    && chown -R agent:agent /app/.whatsapp-session /workspace /app

USER agent

# Default shell for exec
SHELL ["/bin/zsh", "-c"]
ENV SHELL=/bin/zsh
ENV HOME=/home/agent

ENTRYPOINT ["bun", "run", "src/index.ts"]

# ─────────────────────────────────────────────────────────────────────────────
# Production build stage
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=agent:agent . .

RUN bun run build

# ─────────────────────────────────────────────────────────────────────────────
# Production stage
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS production

USER root

# Copy built output and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=agent:agent package.json ./

# Create directories for persistence
RUN mkdir -p /app/.whatsapp-session /workspace \
    && chown -R agent:agent /app/.whatsapp-session /workspace /app

USER agent

# Default shell for exec
SHELL ["/bin/zsh", "-c"]
ENV SHELL=/bin/zsh
ENV HOME=/home/agent

ENTRYPOINT ["bun", "run", "dist/cli.js"]
CMD []
