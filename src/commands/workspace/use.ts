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
      const namespace = remote.replace(/.*[:\/](.*)\/.*$/, '$1').replace(/.*[:\/]/, '').trim();
      name = Object.keys(workspaces).find(k =>
        workspaces[k].orgs?.some((org: string) => namespace.toLowerCase().includes(org.toLowerCase()))
      );
    }
    catch {
      if (auto) return;
      process.stderr.write(`❌ No name provided and no git remote found.\n`)
      return
    }
  }

  // In auto mode, skip if workspace is already active — avoids unnecessary noise on every cd
  if (auto && name && name === process.env.GW_ACTIVE) return;

  const ws = workspaces[name || '']

  if (!ws) {
    if (auto) return;
    process.stderr.write(`❌ Workspace not found: ${name}\n`)
    process.stderr.write(`👉 Run: gw list\n`)
    return
  }

  // 1. Set active workspace in state
  state.set('activeWorkspace', name || '')

  const realKeyPath = ws.sshKey.replace('~', os.homedir())

  // 2. Update SSH symlink (active_key -> actual key file)
  try {
    if (fs.existsSync(ACTIVE_KEY_SYMLINK) || fs.lstatSync(ACTIVE_KEY_SYMLINK, { throwIfNoEntry: false })?.isSymbolicLink()) {
      fs.removeSync(ACTIVE_KEY_SYMLINK)
    }
    fs.symlinkSync(realKeyPath, ACTIVE_KEY_SYMLINK)
  }
  catch (err: any) {
    process.stderr.write(chalk.red(`⚠️  Error updating SSH link: ${err.message}\n`))
  }

  // 3. Apply git identity directly — works with or without shell integration
  await execa('git', ['config', '--global', 'user.name', ws.userName]).catch(() => {})
  await execa('git', ['config', '--global', 'user.email', ws.userEmail]).catch(() => {})

  if (ws.gpgKey) {
    await execa('git', ['config', '--global', 'user.signingkey', ws.gpgKey]).catch(() => {})
    await execa('git', ['config', '--global', 'commit.gpgsign', 'true']).catch(() => {})
    await execa('git', ['config', '--global', 'tag.gpgSign', 'true']).catch(() => {})
  } else {
    await execa('git', ['config', '--global', '--unset', 'user.signingkey'], { reject: false }).catch(() => {})
    await execa('git', ['config', '--global', 'commit.gpgsign', 'false']).catch(() => {})
    await execa('git', ['config', '--global', 'tag.gpgSign', 'false']).catch(() => {})
  }

  // 4. Load SSH key into agent directly — ssh-add communicates via SSH_AUTH_SOCK
  //    which is inherited by child processes, so this works from Node.
  await execa('ssh-add', ['-D'], { reject: false, stdio: 'ignore' })
  const sshResult = await execa('ssh-add', [realKeyPath], { reject: false, stdio: 'ignore' })
  if (sshResult.exitCode !== 0 && !auto) {
    process.stderr.write(chalk.yellow(`⚠️  Could not load SSH key automatically. Run: ssh-add ${ws.sshKey}\n`))
  }

  // 5. Print status to stderr — visible in both shell-integrated and direct-call modes.
  //    (When the shell function does local res=$(command gw ...), stderr still goes to terminal.)
  if (!auto) {
    process.stderr.write(`✅ Workspace '${name}' active\n`)
    process.stderr.write(`👤 ${ws.userName}\n`)
    process.stderr.write(`🔑 ${ws.sshKey}\n`)
    if (ws.gpgKey) process.stderr.write(`🔐 GPG: ${ws.gpgKey}\n`)
  }

  // 6. Output the export command for the shell function to eval.
  //    TTY detection: when stdout is a terminal, no shell function is capturing our output,
  //    so we warn instead of printing a raw export that nobody will eval.
  if (process.stdout.isTTY) {
    if (!auto) {
      process.stderr.write(chalk.yellow(`\n⚠️  Shell integration not active — GW_ACTIVE won't be set in this session.\n`))
      process.stderr.write(chalk.dim(`   Run: gw system init && source ~/.zshrc\n`))
    }
  } else {
    // stdout is piped (shell integration's local res=$(...) is capturing it)
    console.log(`export GW_ACTIVE="${name}"`)
  }
}
