# syntax=docker/dockerfile:1
FROM oven/bun:1-debian AS base

WORKDIR /app

# Install dependencies for Baileys (WhatsApp) and general utilities
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
    && rm -rf /var/lib/apt/lists/* \
    && sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen \
    && locale-gen

# Set locale environment variables
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

# Install Claude Code globally
RUN npm i -g @anthropic-ai/claude-code

# Setup ZSH with Oh My Zsh and plugins for interactive shell usage
RUN touch ~/.zshrc \
    && export CHSH='no' \
    && export RUNZSH='no' \
    && sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" \
    && git clone https://github.com/zsh-users/zsh-syntax-highlighting.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting \
    && git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions \
    && git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf \
    && ~/.fzf/install --all \
    && curl -s https://gist.githubusercontent.com/ehc-io/52a3549eb17dda934925149b9048f566/raw/ac4ab8a96dd65a50506293c200de29533ff1b1bb/zshrc -o ~/.zshrc

# ─────────────────────────────────────────────────────────────────────────────
# Dependencies stage
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS deps

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# ─────────────────────────────────────────────────────────────────────────────
# Development stage (includes dev dependencies)
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS development

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create directories for persistence
RUN mkdir -p /app/.whatsapp-session /app/workspace

# Default shell for exec
SHELL ["/bin/zsh", "-c"]
ENV SHELL=/bin/zsh

ENTRYPOINT ["bun", "run", "src/index.ts"]

# ─────────────────────────────────────────────────────────────────────────────
# Production build stage
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN bun run build

# ─────────────────────────────────────────────────────────────────────────────
# Production stage
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS production

# Copy built output and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

# Create directories for persistence
RUN mkdir -p /app/.whatsapp-session /app/workspace

# Default shell for exec
SHELL ["/bin/zsh", "-c"]
ENV SHELL=/bin/zsh

ENTRYPOINT ["bun", "run", "dist/cli.js"]
CMD []
