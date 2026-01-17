import os from 'os'
import fs from 'fs-extra'
import chalk from 'chalk'

import { ACTIVE_KEY_SYMLINK } from '../../core/constants.js'
import { config, state } from '../../core/config.js'

export default async function use(name: string) {
  const workspaces = config.get('workspaces')
  const ws = workspaces[name]

  // 1. Validate workspace existence
  if (!ws) {
    console.log(`echo "❌ Workspace not found: ${name}"`)
    console.log(`echo "👉 Run: gw list"`)
    return
  }

  // 2. Set active workspace in state
  state.set('activeWorkspace', name)

  try {
    const realKeyPath = ws.sshKey.replace('~', os.homedir());
    
    // 3. Force remove any existing file/link at the symlink path
    if (fs.existsSync(ACTIVE_KEY_SYMLINK) || fs.lstatSync(ACTIVE_KEY_SYMLINK, { throwIfNoEntry: false })?.isSymbolicLink()) {
      fs.removeSync(ACTIVE_KEY_SYMLINK);
    }

    // 4. Create the link: active_key -> /Users/.../keys/SSH_KEY_PATH
    fs.symlinkSync(realKeyPath, ACTIVE_KEY_SYMLINK);
  } 
  catch (err: any) {
    // If this fails, the SSH connection will fail.
    console.log(`echo "${chalk.red('⚠️  Error updating SSH link: ' + err.message)}"`)
  }

  // 5. Output shell commands to set git config and ssh-add
  const lines = [
    `export GW_ACTIVE="${name}"`,
    `git config --global user.name "${ws.userName}"`,
    `git config --global user.email "${ws.userEmail}"`,
    `ssh-add -D > /dev/null 2>&1`,
    `echo "✅ Workspace '${name}' active"`,
    `echo "👤 ${ws.userName}"`,
    `echo "🔑 ${ws.sshKey}"`
  ];

  const output = lines.join('\n');
  console.log(output);
}
