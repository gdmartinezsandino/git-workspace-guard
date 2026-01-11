#!/bin/bash

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

HOOKS_DIR="$HOME/.git-hooks"
WORKSPACE_FILE="$HOME/.git-workspace"
GUARD_FILE="$HOME/.git-workspace-guard.sh"
ZSHRC="$HOME/.zshrc"

echo ""
echo "🛡️  Git Workspace Guard — Installer"
echo "------------------------------------"

# 1. Create hooks directory
if [ ! -d "$HOOKS_DIR" ]; then
  mkdir -p "$HOOKS_DIR"
  echo -e "${GREEN}✔ Created $HOOKS_DIR${NC}"
else
  echo -e "${YELLOW}ℹ $HOOKS_DIR already exists${NC}"
fi

# 2. Configure git to use it
CURRENT_HOOKS_PATH=$(git config --global --get core.hooksPath || true)

if [ "$CURRENT_HOOKS_PATH" != "$HOOKS_DIR" ]; then
  git config --global core.hooksPath "$HOOKS_DIR"
  echo -e "${GREEN}✔ Git global hooksPath set to $HOOKS_DIR${NC}"
else
  echo -e "${YELLOW}ℹ Git already using $HOOKS_DIR${NC}"
fi

# 3. Backup existing hooks
timestamp=$(date +"%Y%m%d_%H%M%S")

backup_if_exists() {
  FILE="$1"
  if [ -f "$FILE" ]; then
    cp "$FILE" "$FILE.backup.$timestamp"
    echo -e "${YELLOW}⚠ Backed up $(basename "$FILE") → $(basename "$FILE").backup.$timestamp${NC}"
  fi
}

backup_if_exists "$HOOKS_DIR/pre-commit"
backup_if_exists "$HOOKS_DIR/pre-push"

# 4. Install pre-commit
cat << 'EOF' > "$HOOKS_DIR/pre-commit"
#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ACTIVE=$(cat ~/.git-workspace 2>/dev/null)
if [ -z "$ACTIVE" ]; then
  echo "${RED}❌ No active workspace. Run: set_workspace <company>${NC}"
  exit 1
fi

EMAIL=$(git config --global user.email)
echo "${YELLOW}🚀 Pushing as [$ACTIVE] <$EMAIL>${NC}"
echo "👤 Workspace: $ACTIVE"
echo "📧 Email: $EMAIL"

read -p "${YELLOW}Continue push? (y/n): ${NC}" confirm < /dev/tty

if [[ "$confirm" != "y" ]]; then
  echo "${RED}❌ Push cancelled${NC}"
  echo ""
  echo "To set a workspace use: set_workspace [name]"
  echo ""
  exit 1
fi
EOF

chmod +x "$HOOKS_DIR/pre-commit"
echo -e "${GREEN}✔ Installed pre-commit hook${NC}"

# 5. Install pre-push
cat << 'EOF' > "$HOOKS_DIR/pre-push"
#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ACTIVE=$(cat ~/.git-workspace 2>/dev/null)
if [ -z "$ACTIVE" ]; then
  echo "${RED}❌ No active workspace. Run: set_workspace <company>${NC}"
  exit 1
fi

EMAIL=$(git config --global user.email)
echo "${YELLOW}🚀 Pushing as [$ACTIVE] <$EMAIL>${NC}"
echo "👤 Workspace: $ACTIVE"
echo "📧 Email: $EMAIL"

read -p "${YELLOW}Continue push? (y/n): ${NC}" confirm < /dev/tty

if [[ "$confirm" != "y" ]]; then
  echo "${RED}❌ Push cancelled${NC}"
  echo ""
  echo "To set a workspace use: set_workspace [name]"
  echo ""
  exit 1
fi
EOF

chmod +x "$HOOKS_DIR/pre-push"
echo -e "${GREEN}✔ Installed pre-push hook${NC}"

# 6. Create workspace file if missing
if [ ! -f "$WORKSPACE_FILE" ]; then
  touch "$WORKSPACE_FILE"
  echo -e "${GREEN}✔ Created $WORKSPACE_FILE${NC}"
else
  echo -e "${YELLOW}ℹ $WORKSPACE_FILE already exists${NC}"
fi

# -------------------------
# set_workspace installer
# -------------------------

if [ -f "$GUARD_FILE" ]; then
  cp "$GUARD_FILE" "$GUARD_FILE.backup.$timestamp"
  echo -e "${YELLOW}⚠ Backed up existing guard file${NC}"
fi

cat << 'EOF' > "$GUARD_FILE"
# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

set_workspace() {
  PROFILE="$1"

  if [ -z "$PROFILE" ]; then
    echo "${RED}Usage: set_workspace <company>${NC}"
    return 1
  fi

  case "$PROFILE" in
    personal)
      NAME="Gabriel Martinez Sandino"
      EMAIL="gabriel@gmail.com"
      SSH_KEY="$HOME/keys/id_rsa_personal"
      SSH_HOST="personal-github"
      ;;
    
    # OTHER COMPOANIES

    *)
      echo "${YELLOW}Unknown workspace: $PROFILE${NC}"
      return 1
      ;;
  esac

  # Git identity
  git config --global user.name "$NAME"
  git config --global user.email "$EMAIL"

  # Save active profile
  echo "$PROFILE" > ~/.git-workspace

  # Export SSH command globally for this shell
  export GIT_SSH_COMMAND="ssh -i $SSH_KEY -o IdentitiesOnly=yes"

  echo "${GREEN}✅ Workspace set to: $PROFILE${NC}"
  echo "   👤 $NAME <$EMAIL>"
  echo "   🔑 $SSH_KEY"
}
EOF

echo -e "${GREEN}✔ set_workspace installed${NC}"

if ! grep -q "git-workspace-guard.sh" "$ZSHRC"; then
  echo "" >> "$ZSHRC"
  echo "# Git Workspace Guard" >> "$ZSHRC"
  echo "source $GUARD_FILE" >> "$ZSHRC"
  echo -e "${GREEN}✔ Added guard to .zshrc${NC}"
else
  echo -e "${YELLOW}ℹ Guard already sourced in .zshrc${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Installation complete.${NC}"
echo ""
echo "Next steps:"
echo "2. Restart your terminal"
echo "3. Run: set_workspace <company>"
echo ""
