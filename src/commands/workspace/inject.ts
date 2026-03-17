import path from 'path'
import chalk from 'chalk'
import { execa } from 'execa'
import fs from 'fs-extra'

import { log } from '../../core/logger.js'

const GUARD_BLOCK = `
# Git Workspace Guard
if [ -x "$HOME/.gw/guard.sh" ]; then
  "$HOME/.gw/guard.sh" || exit 1
fi
`
const GUARD_MARKER = '# Git Workspace Guard'
const HOOK_NAMES = ['pre-commit', 'pre-push']

export default async function inject() {
  // 1. Must be inside a git repo
  const { stdout: repoRoot } = await execa('git', ['rev-parse', '--show-toplevel']).catch(() => ({ stdout: '' }))
  if (!repoRoot) return log.error('Not inside a git repository.')

  const huskyDir = path.join(repoRoot.trim(), '.husky')
  if (!(await fs.pathExists(huskyDir))) {
    log.warn('No .husky/ directory found in this repo.')
    log.info('  Nothing to inject — gw global hooks are already active here.')
    return
  }

  log.title(chalk.cyan('\n💉 Injecting gw guard into Husky hooks\n'))

  for (const hookName of HOOK_NAMES) {
    const hookPath = path.join(huskyDir, hookName)
    const exists = await fs.pathExists(hookPath)

    if (exists) {
      const content = await fs.readFile(hookPath, 'utf8')

      if (content.includes(GUARD_MARKER)) {
        log.info(`${chalk.dim('–')} ${hookName.padEnd(12)} ${chalk.dim('already injected, skipping')}`)
        continue
      }

      // Insert guard block after the shebang line (first line)
      const lines = content.split('\n')
      const shebangEnd = lines[0]?.startsWith('#!') ? 1 : 0
      lines.splice(shebangEnd, 0, GUARD_BLOCK)
      await fs.writeFile(hookPath, lines.join('\n'), { mode: 0o755 })
    } else {
      // Create the hook from scratch
      await fs.writeFile(hookPath, `#!/bin/sh${GUARD_BLOCK}`, { mode: 0o755 })
    }

    log.info(`${chalk.green('✔')} ${hookName.padEnd(12)} injected`)
  }

  console.log()
  log.info(chalk.dim('The gw guard will now run before every commit/push in this repo,'))
  log.info(chalk.dim('even though Husky controls the hooks path.'))
  console.log()
}
