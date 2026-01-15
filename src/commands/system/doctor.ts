import { execa } from 'execa'
import os from 'os'
import fs from 'fs-extra'

import { ACTIVE_KEY_SYMLINK } from '../../core/constants.js'
import { loadContext } from '../../core/context.js'
import { log } from '../../core/logger.js'

export default async function doctor() {
  log.title('🩺 Git Workspace Guard — Doctor')
  const ctx = await loadContext()

  if (!ctx.workspace) {
    log.error('No active workspace. Run: gw use <name>')
    return
  }

  log.success(`Active workspace: ${ctx.workspace.name}`)
  
  // 1. Check Symlink Integrity
  try {
    const symlinkTarget = await fs.readlink(ACTIVE_KEY_SYMLINK)
    const expectedTarget = ctx.workspace.sshKey.replace('~', os.homedir())
    if (symlinkTarget === expectedTarget) {
      log.success('SSH Symlink: Correctly points to ' + ctx.workspace.name)
    } else {
      log.error(`SSH Symlink: Mismatch!`)
    }
  } catch (e) {
    log.error('SSH Symlink: Missing or broken.')
  }

  // 2. Check Git Global Config
  const { stdout: gEmail } = await execa('git', ['config', '--global', 'user.email']).catch(() => ({ stdout: '' }))
  if (gEmail.trim() === ctx.workspace.userEmail) {
    log.success(`Git Identity: Match (${gEmail.trim()})`)
  } else {
    log.error(`Git Identity: Mismatch!`)
  }

  // 3. Real Auth Test
  log.info(`Testing connectivity to ${ctx.workspace.provider || 'github'}...`)
  
  const host = ctx.workspace.provider === 'bitbucket' ? 'bitbucket.org' : 'github.com'
  
  const result = await execa('ssh', [
    '-T', `git@${host}`, 
    '-o', 'ConnectTimeout=5', 
    '-o', 'StrictHostKeyChecking=no'
  ], { reject: false })

  const output = result.stderr + result.stdout

  const isBitbucketSuccess = output.includes('authenticated via ssh key');
  const isGithubSuccess = output.includes('Hi ') || output.includes('successfully authenticated');

  if (isGithubSuccess || isBitbucketSuccess) {
    log.success(`Global SSH: OK (Authenticated to ${host})`)
  } else {
    log.error(`Global SSH: Failed. ${host} rejected the key.`)
    log.info('👉 Try running: chmod 600 ' + ctx.workspace.sshKey)
    if (output) log.info('Server response: ' + output.trim())
  }
}
