import os from 'os'
import fs from 'fs-extra'
import path from 'path'
import chalk from 'chalk'
import { execa } from 'execa'
import { createRequire } from 'module'

import { log } from '../../core/logger.js'
import { config, state } from '../../core/config.js'
import { DoctorCheck } from '../../core/types.js'

const require = createRequire(import.meta.url)
const { version: currentVersion } = require('../../../package.json') as { version: string }

// ─── Token validity ───────────────────────────────────────────────────────────

async function checkTokenValidity(provider: string, token: string): Promise<boolean> {
  try {
    if (provider === 'github') {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
      return res.ok
    }
    if (provider === 'gitlab') {
      const res = await fetch('https://gitlab.com/api/v4/user', {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      return res.ok
    }
    if (provider === 'bitbucket') {
      const authHeader = token.includes(':')
        ? `Basic ${Buffer.from(token).toString('base64')}`
        : `Bearer ${token}`
      const res = await fetch('https://api.bitbucket.org/2.0/user', {
        headers: { 'Authorization': authHeader },
      })
      return res.ok
    }
    return false
  } catch {
    return false
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderChecks(title: string, checks: DoctorCheck[]) {
  log.title(chalk.bold(`\n🩺 Doctor: ${title}`))
  log.title('-------------------------------------------')

  checks.forEach(c => {
    const icon = c.status === 'ok'
      ? chalk.green('✔')
      : c.status === 'warn' ? chalk.yellow('⚠') : chalk.red('✘')
    log.info(`${icon} ${chalk.bold(c.label.padEnd(22))} ${c.message ?? ''}`)
    if (c.hint) log.info(`   ${chalk.dim('Hint: ' + c.hint)}`)
    if (c.fix)  log.info(`   ${chalk.cyan('Fix:  ' + c.fix)}`)
  })
  log.info('')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default async function doctor() {

  // ── Section 1: System environment ─────────────────────────────────────────
  const systemChecks: DoctorCheck[] = []

  // 1a. Version check
  try {
    const res = await fetch(
      'https://api.github.com/repos/gdmartinezsandino/git-workspace-guard/releases/latest',
      { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'git-workspace-guard' } }
    )
    if (res.ok) {
      const data = await res.json() as { tag_name: string }
      const latestVersion = data.tag_name.replace(/^v/, '')
      const isUpToDate = currentVersion === latestVersion
      systemChecks.push({
        id: 'version',
        label: 'Version',
        status: isUpToDate ? 'ok' : 'warn',
        message: isUpToDate
          ? `Up to date (v${currentVersion})`
          : `v${currentVersion} installed — v${latestVersion} available`,
        fix: isUpToDate ? undefined : 'brew upgrade git-workspace-guard',
      })
    } else {
      systemChecks.push({ id: 'version', label: 'Version', status: 'ok', message: `v${currentVersion} (could not reach GitHub)` })
    }
  } catch {
    systemChecks.push({ id: 'version', label: 'Version', status: 'ok', message: `v${currentVersion} (offline)` })
  }

  // 1b. Git binary
  const hasGit = await execa('git', ['--version']).then(() => true).catch(() => false)
  systemChecks.push({ id: 'git-bin', label: 'Git Binary', status: hasGit ? 'ok' : 'error' })

  // 1c. SSH agent
  const hasAgent = !!process.env.SSH_AUTH_SOCK
  systemChecks.push({
    id: 'ssh-agent',
    label: 'SSH Agent',
    status: hasAgent ? 'ok' : 'warn',
    message: hasAgent ? 'Running' : 'Not detected in current shell',
  })

  // 1d. Hooks path config
  const { stdout: hooksPath } = await execa('git', ['config', '--global', 'core.hooksPath']).catch(() => ({ stdout: '' }))
  const expectedHooksPath = path.join(os.homedir(), '.gw/hooks')
  systemChecks.push({
    id: 'hooks-config',
    label: 'Git Hooks Path',
    status: hooksPath.trim() === expectedHooksPath ? 'ok' : 'error',
    message: hooksPath.trim() === expectedHooksPath ? expectedHooksPath : (hooksPath.trim() || 'not set'),
    fix: hooksPath.trim() !== expectedHooksPath ? 'gw system init' : undefined,
  })

  // 1e. Guard script
  const guardExists = fs.existsSync(path.join(os.homedir(), '.gw/guard.sh'))
  systemChecks.push({
    id: 'guard-script',
    label: 'Guard Engine',
    status: guardExists ? 'ok' : 'error',
    message: guardExists ? 'guard.sh present' : 'guard.sh is missing',
    fix: !guardExists ? 'gw system init' : undefined,
  })

  // 1f. Hook files: pre-commit and pre-push must exist and be executable
  const hooksDir = path.join(os.homedir(), '.gw', 'hooks')
  for (const hookName of ['pre-commit', 'pre-push'] as const) {
    const hookFile = path.join(hooksDir, hookName)
    const hookExists = fs.existsSync(hookFile)
    let isExec = false
    if (hookExists) {
      isExec = !!(fs.statSync(hookFile).mode & 0o111)
    }
    systemChecks.push({
      id: `hook-${hookName}`,
      label: `Hook: ${hookName}`,
      status: hookExists && isExec ? 'ok' : 'error',
      message: !hookExists ? 'File missing' : !isExec ? 'Not executable' : 'Installed',
      fix: (!hookExists || !isExec) ? 'gw system init' : undefined,
    })
  }

  renderChecks('System Environment', systemChecks)

  // ── Section 2: Active workspace ────────────────────────────────────────────
  const activeName = state.get('activeWorkspace')
  const workspaces = config.get('workspaces')
  const activeWs = activeName ? workspaces[activeName] : null

  if (!activeWs) {
    log.warn('No active workspace — skipping workspace checks.')
    log.info('Run `gw workspace use <name>` to activate one.\n')
    return
  }

  const wsChecks: DoctorCheck[] = []

  // 2a. API token validity
  if (activeWs.token) {
    console.log(chalk.dim('  Checking API token...\n'))
    const tokenValid = await checkTokenValidity(activeWs.provider, activeWs.token)
    wsChecks.push({
      id: 'token-valid',
      label: 'API Token',
      status: tokenValid ? 'ok' : 'error',
      message: tokenValid ? `Valid (${activeWs.provider})` : 'Invalid or expired',
      fix: !tokenValid ? `gw workspace edit ${activeName}` : undefined,
    })
  } else {
    wsChecks.push({
      id: 'token-valid',
      label: 'API Token',
      status: 'warn',
      message: 'Not configured — PR/issue commands unavailable',
      hint: `gw workspace edit ${activeName}`,
    })
  }

  // 2b. SSH key file
  const keyPath = activeWs.sshKey.replace('~', os.homedir())
  const keyExists = fs.existsSync(keyPath)
  wsChecks.push({
    id: 'ws-ssh-key',
    label: 'SSH Key File',
    status: keyExists ? 'ok' : 'error',
    message: keyExists ? activeWs.sshKey : 'File not found',
    fix: !keyExists ? `gw workspace edit ${activeName}` : undefined,
  })

  if (keyExists) {
    // 2c. SSH key permissions
    const stat = fs.statSync(keyPath)
    const isCorrectPerms = (stat.mode & 0o777) === 0o600
    wsChecks.push({
      id: 'ws-ssh-perms',
      label: 'SSH Key Perms',
      status: isCorrectPerms ? 'ok' : 'warn',
      message: isCorrectPerms ? '600 OK' : 'Too open — git may reject it',
      fix: !isCorrectPerms ? `chmod 600 ${activeWs.sshKey}` : undefined,
    })

    // 2d. SSH connectivity — try alias first, fall back to provider host
    const sshAlias = activeWs.sshAlias ?? `gw-${activeName}`
    const providerHost =
      activeWs.provider === 'bitbucket' ? 'bitbucket.org'
      : activeWs.provider === 'gitlab'  ? 'gitlab.com'
      : 'github.com'

    let authOk = false
    let testedHost = sshAlias

    console.log(chalk.dim(`  Testing SSH connectivity (${sshAlias})...\n`))

    try {
      const r = await execa(
        'ssh', ['-T', `git@${sshAlias}`, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no'],
        { reject: false, timeout: 8000 }
      )
      const combined = (r.stderr ?? '') + (r.stdout ?? '')
      authOk = combined.toLowerCase().includes('authenticated')
    } catch {}

    if (!authOk) {
      testedHost = providerHost
      try {
        const r = await execa(
          'ssh', ['-T', `git@${providerHost}`, '-i', keyPath, '-o', 'BatchMode=yes'],
          { reject: false, timeout: 8000 }
        )
        const combined = (r.stderr ?? '') + (r.stdout ?? '')
        authOk = combined.toLowerCase().includes('authenticated')
      } catch {}
    }

    wsChecks.push({
      id: 'ws-ssh-auth',
      label: 'SSH Auth',
      status: authOk ? 'ok' : 'error',
      message: authOk ? `Verified (${testedHost})` : `Failed (${testedHost})`,
      hint: !authOk ? `Test manually: ssh -T git@${sshAlias}` : undefined,
    })
  }

  // 2e. GPG signing
  const gpgKey: string | undefined = activeWs.gpgKey
  if (gpgKey) {
    const { stdout: signingKey } = await execa('git', ['config', '--global', 'user.signingkey']).catch(() => ({ stdout: '' }))
    const { stdout: gpgSign } = await execa('git', ['config', '--global', 'commit.gpgsign']).catch(() => ({ stdout: '' }))
    const configured = signingKey.trim() === gpgKey && gpgSign.trim() === 'true'
    wsChecks.push({
      id: 'ws-gpg',
      label: 'GPG Signing',
      status: configured ? 'ok' : 'warn',
      message: configured ? `Active (${gpgKey})` : `Key saved but git config not applied`,
      fix: !configured ? 'gw commit sign' : undefined,
    })
  } else {
    wsChecks.push({
      id: 'ws-gpg',
      label: 'GPG Signing',
      status: 'warn',
      message: 'Not configured',
      hint: 'Run `gw commit sign` to enable verified commits',
    })
  }

  renderChecks(`Workspace: ${activeName}`, wsChecks)
}
