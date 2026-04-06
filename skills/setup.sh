#!/bin/bash
# setup.sh — Configura skills para diferentes herramientas de IA
# Uso: ./skills/setup.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}Setting up AI Agent Skills for MyQuota Backend...${NC}"

# GitHub Copilot: copiar AGENTS.md a .github/copilot-instructions.md
setup_copilot() {
    if [ -f "$REPO_ROOT/AGENTS.md" ]; then
        mkdir -p "$REPO_ROOT/.github"
        cp "$REPO_ROOT/AGENTS.md" "$REPO_ROOT/.github/copilot-instructions.md"
        echo -e "${GREEN}  ✓ AGENTS.md -> .github/copilot-instructions.md${NC}"
    else
        echo -e "${RED}  ✗ AGENTS.md not found at repo root${NC}"
        return 1
    fi
}

# Ejecutar setup
echo ""
echo -e "${BLUE}Configuring GitHub Copilot...${NC}"
setup_copilot

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "Skills are now available. Run './skills/skill-sync/assets/sync.sh' to update Auto-invoke tables."
