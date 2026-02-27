#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

BUMP=${1:-patch}  # patch | minor | major

# ─── Validation ───────────────────────────────────────────────────────────────

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo -e "${RED}❌ Usage: ./release.sh [patch|minor|major]${NC}"
  echo -e "   Defaults to 'patch' if omitted."
  exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo -e "${RED}❌ Must be on main branch (current: $BRANCH)${NC}"
  exit 1
fi

if ! command -v gh &> /dev/null; then
  echo -e "${RED}❌ GitHub CLI not installed. Run: brew install gh${NC}"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo -e "${RED}❌ Working tree is dirty. Commit or stash changes first.${NC}"
  exit 1
fi

# ─── Step 1: Bump version in package.json ─────────────────────────────────────

echo -e "\n${BLUE}📦 Bumping version ($BUMP)...${NC}"
npm version "$BUMP" --no-git-tag-version > /dev/null

NEW_VERSION=$(node -e "process.stdout.write(require('./package.json').version)")
TAG="v$NEW_VERSION"

echo -e "   New version: ${YELLOW}$TAG${NC}"

# ─── Step 2: Commit + tag + push ──────────────────────────────────────────────

echo -e "${BLUE}📝 Committing version bump...${NC}"
git add package.json
git commit -m "chore: release $TAG"
git tag "$TAG"

echo -e "${BLUE}🚀 Pushing to GitHub...${NC}"
git push origin main
git push origin "$TAG"

# ─── Step 3: Create GitHub release ────────────────────────────────────────────

echo -e "${BLUE}🎉 Creating GitHub release...${NC}"
gh release create "$TAG" --title "$TAG" --generate-notes

# ─── Step 4: Get sha256 of the tarball ────────────────────────────────────────

TARBALL_URL="https://github.com/gdmartinezsandino/git-workspace-guard/archive/refs/tags/${TAG}.tar.gz"

echo -e "${BLUE}⏳ Waiting for GitHub to generate tarball...${NC}"
sleep 5

echo -e "${BLUE}🔐 Calculating sha256...${NC}"
SHA256=$(curl -sL "$TARBALL_URL" | shasum -a 256 | awk '{print $1}')
echo -e "   sha256: ${YELLOW}$SHA256${NC}"

# ─── Step 5: Update formula ───────────────────────────────────────────────────

echo -e "${BLUE}📋 Updating Formula/git-workspace-guard.rb...${NC}"
FORMULA="Formula/git-workspace-guard.rb"

sed -i '' "s|archive/refs/tags/v[0-9.]*\.tar\.gz|archive/refs/tags/${TAG}.tar.gz|" "$FORMULA"
sed -i '' "s|sha256 \"[^\"]*\"|sha256 \"$SHA256\"|" "$FORMULA"
sed -i '' "s|assert_match \"[0-9.]*\"|assert_match \"$NEW_VERSION\"|" "$FORMULA"

# ─── Step 6: Commit + push formula ────────────────────────────────────────────

git add "$FORMULA"
git commit -m "chore: update formula to $TAG"
git push origin main

# ─── Done ─────────────────────────────────────────────────────────────────────

echo -e "\n${GREEN}✅ Released $TAG successfully!${NC}"
echo -e "   Release : https://github.com/gdmartinezsandino/git-workspace-guard/releases/tag/$TAG"
echo -e "   Tarball : $TARBALL_URL"
echo -e "   sha256  : $SHA256"
echo -e "\n${YELLOW}Users can now run: brew update && brew upgrade git-workspace-guard${NC}\n"
