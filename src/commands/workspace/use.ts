import os from 'os'
import fs from 'fs-extra'
import chalk from 'chalk'
import { execa } from 'execa'

import { ACTIVE_KEY_SYMLINK } from '../../core/constants.js'
import { config, state } from '../../core/config.js'

export default async function use(name: string | undefined, auto = false) {
  const workspaces = config.get('workspaces')

  if (!name) {
    try {
      const { stdout: remote } = await execa('git', ['remote', 'get-url', 'origin']);
      // Extract namespace (logic same as guard.sh)
      const namespace = remote.replace(/.*[:\/](.*)\/.*$/, '$1').replace(/.*[:\/]/, '').trim();
      name = Object.keys(workspaces).find(k =>
        workspaces[k].orgs?.some((org: string) => namespace.toLowerCase().includes(org.toLowerCase()))
      );
    }
    catch {
      // In auto mode (chpwd hook), silently do nothing when not in a git repo
      if (auto) return;
      return console.log(`echo "❌ No name provided and no git remote found."`);
    }
  }

  // In auto mode, skip if workspace is already active — avoids unnecessary noise on every cd
  if (auto && name && name === process.env.GW_ACTIVE) return;

  const ws = workspaces[name || '']

  // 1. Validate workspace existence
  if (!ws) {
    // In auto mode, no match just means this repo isn't mapped — stay silent
    if (auto) return;
    console.log(`echo "❌ Workspace not found: ${name}"`)
    console.log(`echo "👉 Run: gw list"`)
    return
  }

  // 2. Set active workspace in state
  state.set('activeWorkspace', name || '')

  try {
    const realKeyPath = ws.sshKey.replace('~', os.homedir())

    // 3. Force remove any existing file/link at the symlink path
    if (fs.existsSync(ACTIVE_KEY_SYMLINK) || fs.lstatSync(ACTIVE_KEY_SYMLINK, { throwIfNoEntry: false })?.isSymbolicLink()) {
      fs.removeSync(ACTIVE_KEY_SYMLINK)
    }

    // 4. Create the link: active_key -> /Users/.../keys/SSH_KEY_PATH
    fs.symlinkSync(realKeyPath, ACTIVE_KEY_SYMLINK)
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
    `ssh-add "${ws.sshKey.replace('~', '$HOME')}" > /dev/null 2>&1`,
    // Apply GPG signing if a key is configured for this workspace
    ...(ws.gpgKey ? [
      `git config --global user.signingkey "${ws.gpgKey}"`,
      `git config --global commit.gpgsign true`,
      `git config --global tag.gpgSign true`,
    ] : [
      // Clear signing when workspace has no GPG key configured
      `git config --global --unset user.signingkey 2>/dev/null || true`,
      `git config --global commit.gpgsign false`,
      `git config --global tag.gpgSign false`,
    ]),
    `echo "✅ Workspace '${name}' active"`,
    `echo "👤 ${ws.userName}"`,
    `echo "🔑 ${ws.sshKey}"`,
    ...(ws.gpgKey ? [`echo "🔐 GPG: ${ws.gpgKey}"`] : []),
  ]

  const output = lines.join('\n')
  console.log(output)
}
