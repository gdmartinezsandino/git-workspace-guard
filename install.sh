#!/bin/bash

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🛡️  Git Guard — Installer${NC}"
echo "------------------------------------"

# 1. Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js is not installed. Please install it first.${NC}"
    exit 1
fi

# 2. Install Dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm install

# 3. Build the project (if using TypeScript/Build step)
if [ -f "package.json" ] && grep -q "build" "package.json"; then
    echo -e "${BLUE}🛠 Building project...${NC}"
    npm run build
fi

# 4. Link the command globally
echo -e "${BLUE}🔗 Linking 'gw' command...${NC}"
npm link --force

# 5. Run the Core System Initialization
# This runs the 'init()' function we wrote, which:
# - Creates ~/.gw/
# - Creates guard.sh
# - Configures global git hooksPath
# - Adds shell integration to .zshrc
echo -e "${BLUE}⚙️  Initializing system...${NC}"
node ./dist/bin/gw.js init

echo ""
echo -e "${GREEN}✅ Installation complete!${NC}"
echo "------------------------------------"
echo -e "Next steps:"
echo -e "  1. ${YELLOW}source ~/.zshrc${NC} (or restart terminal)"
echo -e "  2. ${YELLOW}gw workspace add${NC} (to create your first workspace)"
echo -e "  3. ${YELLOW}gw workspace use <name>${NC}"
echo ""
