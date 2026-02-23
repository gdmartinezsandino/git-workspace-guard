import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { execa } from 'execa'
import chalk from 'chalk'

import { 
  GW_DIR, 
  SSH_CONFIG_PATH, 
  GW_SSH_CONFIG, 
  ACTIVE_KEY_SYMLINK 
} from '../../core/constants.js'
import { ensureStorage } from '../../core/storage.js'
import { config } from '../../core/config.js'

const MIN_NODE_MAJOR = 18

export default async function init() {
  console.log(chalk.cyan('\n🔐 Git Workspace Guard — init\n'))

  const nodeMajor = parseInt(process.version.slice(1))
  if (nodeMajor < MIN_NODE_MAJOR) {
    console.log(chalk.red(`❌ Node.js v${MIN_NODE_MAJOR}+ is required (current: ${process.version})`))
    console.log(chalk.dim(`   Run: nvm install ${MIN_NODE_MAJOR} && nvm alias default ${MIN_NODE_MAJOR}`))
    process.exit(1)
  }

  await ensureStorage()
  await fs.ensureDir(GW_DIR)

  // 1. Create the environment pointer
  await fs.writeFile(
    path.join(GW_DIR, 'env'),
    `CONFIG=${path.join(GW_DIR, 'config.json')}\nSTATE=${path.join(GW_DIR, 'state.json')}\n`
  )

  // 2. Install components
  await installShellIntegration()
  await installHooks()
  await installGuard()
  await installDefaultPrTemplate()
  await setupGit()
  await setupSSHConfig()

  console.log(chalk.green('\n✅ System installed successfully\n'))
  console.log('Next steps:')
  console.log('  gw workspace add')
  console.log('  gw workspace use <name>\n')
}

async function setupSSHConfig() {
  const workspaces = config.get('workspaces');
  const names = Object.keys(workspaces);
  
  // 1. Collect every alias (gw-W_NAME_1, gw-W_NAME_2, etc.)
  const aliases = names.map(n => `gw-${n}`).join(' ');
  const domains = 'github.com bitbucket.org gitlab.com';

  // 2. Map BOTH the real domains AND all aliases to the active symlink
  // This is the key: now gw-W_NAME_1 is a valid "Host" for SSH even in personal mode
  const dynamicConfig = `
# Git Workspace Guard - Unified Hijack
Host ${domains} ${aliases}
    IdentityFile ${ACTIVE_KEY_SYMLINK}
    IdentitiesOnly yes
    User git
`;

  await fs.ensureDir(path.dirname(GW_SSH_CONFIG));
  // Use writeFile to OVERWRITE the file, not append
  await fs.writeFile(GW_SSH_CONFIG, dynamicConfig);

  // 3. Ensure the Include is in the main ~/.ssh/config
  let mainConfig = '';
  if (await fs.pathExists(SSH_CONFIG_PATH)) {
    mainConfig = await fs.readFile(SSH_CONFIG_PATH, 'utf8');
  }

  // 4. Add Include line if missing
  const includeLine = `Include "${GW_SSH_CONFIG}"`;
  if (!mainConfig.includes(GW_SSH_CONFIG)) {
    await fs.writeFile(SSH_CONFIG_PATH, `${includeLine}\n\n${mainConfig}`, { mode: 0o600 });
  }
}

async function setupGit() {
  await execa(
    'git', 
    [
      'config', 
      '--global', 
      'core.hooksPath', 
      path.join(
        os.homedir(), 
        '.gw/hooks'
      )
    ]
  )
}

async function installHooks() {
  const hooksPath = path.join(os.homedir(), '.gw/hooks')

  await fs.ensureDir(hooksPath)

  const hookScript = (hookName: string) => `#!/bin/bash
# GW Guard: validate workspace identity
"$HOME/.gw/guard.sh"

# Delegate to project-level hooks (husky, lefthook, etc.)
GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"

if [ -n "$GIT_ROOT" ]; then
  # 1. Husky v9+ (.husky/<hook>)
  if [ -x "$GIT_ROOT/.husky/${hookName}" ]; then
    "$GIT_ROOT/.husky/${hookName}"
    exit $?
  fi

  # 2. Legacy .git/hooks/<hook> (fallback)
  if [ -x "$GIT_ROOT/.git/hooks/${hookName}" ]; then
    "$GIT_ROOT/.git/hooks/${hookName}"
    exit $?
  fi
fi
`

  await fs.writeFile(
    path.join(hooksPath, 'pre-commit'),
    hookScript('pre-commit'),
    { mode: 0o755 }
  )

  await fs.writeFile(
    path.join(hooksPath, 'pre-push'),
    hookScript('pre-push'),
    { mode: 0o755 }
  )
}

async function installGuard() {
  const guardPath = path.join(GW_DIR, 'guard.sh');

  const scriptContent = `#!/bin/bash
# 1. Get Active Workspace
ACTIVE=\$GW_ACTIVE
if [ -z "\$ACTIVE" ]; then
  ACTIVE=\$(grep -o '"activeWorkspace": "[^"]*' "\$HOME/.gw/state.json" | cut -d'"' -f4)
fi

# 2. Get the Remote Namespace
REMOTE=\$(git remote get-url origin 2>/dev/null)
if [ -n "\$REMOTE" ]; then
  NAMESPACE=\$(echo "\$REMOTE" | sed -E 's/.*[:\\/](.*)\\/.*$/\\1/' | sed 's/.*[:\\/]//')

  # 3. Identify the correct workspace based on the namespace
  CORRECT_WS=\$(node -e "
    const cfg = require('\$HOME/.gw/config.json');
    const ns = '\$NAMESPACE';
    const workspaces = cfg.workspaces;
    
    const owner = Object.keys(workspaces).find(name => {
      const ws = workspaces[name];
      return ws.orgs && ws.orgs.some(org => ns.toLowerCase().includes(org.toLowerCase()));
    });
    
    console.log(owner || '');
  ")

  # 4. Validation Logic
  if [ -n "\$CORRECT_WS" ] && [ "\$ACTIVE" != "\$CORRECT_WS" ]; then
    echo "🛡 Git Workspace Guard"
    echo "❌ Workspace Mismatch!"
    echo "Your current active workspace is: \$ACTIVE"
    echo "This repo is linked to \$NAMESPACE"
    echo ""
    echo "👉 Run: gw use \$CORRECT_WS"
    exit 1
  fi
fi
`;

  await fs.writeFile(guardPath, scriptContent, { mode: 0o755 });
}

async function installDefaultPrTemplate() {
  const templatePath = path.join(GW_DIR, 'pr-template.md');
  // Only create if it doesn't already exist — don't overwrite user customisations
  if (await fs.pathExists(templatePath)) return;

  const defaultTemplate = `## Description
{{branch}} → {{base}}

## Changes
-

## Testing
-
`;
  await fs.writeFile(templatePath, defaultTemplate);
  console.log(chalk.dim('  - Created default PR template at ~/.gw/pr-template.md'));
}

async function installShellIntegration() {
  const zshrcPath = path.join(os.homedir(), '.zshrc');
  if (!(await fs.pathExists(zshrcPath))) return;

  const shellFunction = `
# --- Git Workspace Guard Start ---
autoload -U add-zsh-hook

gw() {
  # If nvm is available and Node is below the minimum required version, fix it silently
  if typeset -f nvm > /dev/null 2>&1; then
    local _gw_node_major
    _gw_node_major=$(node --version 2>/dev/null | sed 's/v\\([0-9]*\\).*/\\1/')
    if [[ -z "$_gw_node_major" || "$_gw_node_major" -lt ${MIN_NODE_MAJOR} ]]; then
      nvm use ${MIN_NODE_MAJOR} --silent 2>/dev/null
    fi
  fi
  if [[ "$1" == "workspace" && "$2" == "use" ]]; then
    local res=$(command gw workspace use "\${@:3}")
    eval "$res"
  elif [[ "$1" == "workspace" && "$2" == "clone" ]]; then
    local res=$(command gw workspace clone "\${@:3}")
    eval "$res"
  elif [[ "$1" == "use" ]]; then
    local res=$(command gw workspace use "\${@:2}")
    eval "$res"
  else
    command gw "$@"
  fi
}

# Auto-switch workspace when entering a directory (cd hook)
_gw_chpwd() {
  # Only proceed if inside a git repo
  git rev-parse --git-dir > /dev/null 2>&1 || return
  local res
  res=$(command gw workspace use --auto 2>/dev/null)
  [[ -n "$res" ]] && eval "$res"
}
add-zsh-hook chpwd _gw_chpwd
# --- Git Workspace Guard End ---
`;

  // Always replace the existing block so re-running init stays idempotent
  let content = await fs.readFile(zshrcPath, 'utf8');
  const blockPattern = /\n?# --- Git Workspace Guard Start ---[\s\S]*?# --- Git Workspace Guard End ---\n?/;
  const existed = blockPattern.test(content);
  content = content.replace(blockPattern, '');
  await fs.writeFile(zshrcPath, content + shellFunction);
  console.log(chalk.dim(existed
    ? '  - Updated shell integration in .zshrc'
    : '  - Added shell integration to .zshrc'
  ));
}
