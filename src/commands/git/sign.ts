import chalk from 'chalk'
import prompts from 'prompts'
import { execa } from 'execa'

import { log } from '../../core/logger.js'
import { config, state } from '../../core/config.js'

// ─── GPG key parsing ──────────────────────────────────────────────────────────

type GpgKey = { keyId: string; uid: string }

function parseGpgKeys(raw: string): GpgKey[] {
  const keys: GpgKey[] = []
  const blocks = raw.split(/\n(?=sec)/)

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    const secLine = lines.find(l => l.startsWith('sec'))
    const uidLine = lines.find(l => l.startsWith('uid'))
    if (!secLine) continue

    // e.g.  sec   rsa4096/AABBCCDD12345678 2024-01-01 [SC]
    const keyMatch = secLine.match(/\/([A-F0-9a-f]{8,})/)
    const uid = uidLine?.replace(/^uid\s+\[.*?\]\s+/, '').trim() ?? 'Unknown'

    if (keyMatch) {
      keys.push({ keyId: keyMatch[1]!.toUpperCase(), uid })
    }
  }

  return keys
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default async function sign() {
  log.title('🔐 Configure GPG Commit Signing')

  // 1. GPG must be installed
  const gpgBin = await execa('which', ['gpg2']).then(r => r.stdout.trim()).catch(() => '')
    || await execa('which', ['gpg']).then(r => r.stdout.trim()).catch(() => '')

  if (!gpgBin) {
    log.error('GPG is not installed or not in PATH.')
    console.log(chalk.dim('  macOS:  brew install gnupg'))
    console.log(chalk.dim('  Ubuntu: sudo apt install gnupg\n'))
    return
  }

  // 2. List secret keys
  const { stdout: rawKeys } = await execa(gpgBin, ['--list-secret-keys', '--keyid-format=long'])
    .catch(() => ({ stdout: '' }))

  if (!rawKeys.trim()) {
    log.warn('No GPG secret keys found.')
    console.log(chalk.dim('\n  Generate a new key: gpg --full-generate-key'))
    console.log(chalk.dim('  Then re-run:        gw commit sign\n'))
    return
  }

  const keys = parseGpgKeys(rawKeys)

  // 3. Resolve key ID
  let selectedKeyId: string

  if (keys.length === 0) {
    log.warn('Could not parse GPG keys automatically.')
    const { manual } = await prompts({
      type: 'text',
      name: 'manual',
      message: 'Enter GPG key ID manually:',
      validate: (v: string) => v.trim() ? true : 'Key ID is required',
    }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })
    selectedKeyId = manual.trim().toUpperCase()
  } else if (keys.length === 1) {
    selectedKeyId = keys[0]!.keyId
    console.log(chalk.dim(`  Found one key: ${keys[0]!.keyId}  ${keys[0]!.uid}\n`))
  } else {
    const { chosen } = await prompts({
      type: 'select',
      name: 'chosen',
      message: 'Select GPG key to use:',
      choices: keys.map(k => ({
        title: `${k.keyId}  ${chalk.dim(k.uid)}`,
        value: k.keyId,
      })),
      initial: 0,
    }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })
    selectedKeyId = chosen
  }

  // 4. Scope
  const { scope } = await prompts({
    type: 'select',
    name: 'scope',
    message: 'Apply signing to:',
    choices: [
      { title: 'Global + save to active workspace  (recommended)', value: 'global' },
      { title: 'Local only  (this repo only, not saved to workspace)', value: 'local' },
    ],
    initial: 0,
  }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })

  if (scope === 'local') {
    const { stdout: root } = await execa('git', ['rev-parse', '--show-toplevel']).catch(() => ({ stdout: '' }))
    if (!root) return log.error('Not inside a git repository — cannot set local git config.')
  }

  // 5. Apply git config
  const configScope = scope === 'global' ? '--global' : '--local'

  await execa('git', ['config', configScope, 'user.signingkey', selectedKeyId])
  await execa('git', ['config', configScope, 'commit.gpgsign', 'true'])
  await execa('git', ['config', configScope, 'tag.gpgSign', 'true'])
  await execa('git', ['config', configScope, 'gpg.program', gpgBin])

  console.log()
  console.log(chalk.green(`  ✔ user.signingkey  →  ${selectedKeyId}`))
  console.log(chalk.green(`  ✔ commit.gpgsign   →  true`))
  console.log(chalk.green(`  ✔ tag.gpgSign      →  true`))
  console.log(chalk.green(`  ✔ gpg.program      →  ${gpgBin}`))

  // 6. Save to active workspace so it's reapplied on `gw workspace use`
  if (scope === 'global') {
    const activeName = state.get('activeWorkspace')
    if (activeName) {
      const workspaces = config.get('workspaces')
      workspaces[activeName] = { ...workspaces[activeName], gpgKey: selectedKeyId }
      config.set('workspaces', workspaces)
      console.log(chalk.green(`  ✔ Saved to workspace "${activeName}"\n`))
    } else {
      log.warn('No active workspace — GPG key not saved.')
      log.info('Run `gw workspace use <name>` then `gw commit sign` again to persist it.')
    }
  } else {
    console.log()
  }

  // 7. Instructions
  console.log(chalk.dim('  Verify a signed commit:'))
  console.log(chalk.dim('    git log --show-signature -1\n'))
  console.log(chalk.dim('  To show "Verified" on GitHub, add your public key at:'))
  console.log(chalk.dim('    github.com → Settings → SSH and GPG keys → New GPG key'))
  console.log(chalk.dim(`    gpg --armor --export ${selectedKeyId}\n`))
}
