import chalk from 'chalk'
import prompts from 'prompts'
import { execa } from 'execa'

import { log } from '../../core/logger.js'

const PROTECTED = new Set(['main', 'master', 'develop', 'development', 'staging', 'production'])

async function getDefaultBranch(): Promise<string> {
  try {
    const { stdout } = await execa('git', ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'])
    return stdout.trim().replace('origin/', '')
  } catch {
    return 'main'
  }
}

export default async function branchCleanup() {
  const { stdout: root } = await execa('git', ['rev-parse', '--show-toplevel']).catch(() => ({ stdout: '' }))
  if (!root) return log.error('Not inside a git repository.')

  log.title('🧹 Branch Cleanup')

  // Current branch
  const { stdout: currentRaw } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
  const current = currentRaw.trim()

  // Default branch
  const defaultBranch = await getDefaultBranch()
  console.log(chalk.dim(`  Default branch: ${chalk.white(defaultBranch)}\n`))

  // Fetch to get up-to-date remote info
  await execa('git', ['fetch', '--prune']).catch(() => {})

  // Find branches merged into the default branch
  const { stdout: mergedRaw } = await execa('git', ['branch', '--merged', defaultBranch])

  const candidates = mergedRaw
    .split('\n')
    .map(b => b.replace(/^\*?\s+/, '').trim())
    .filter(b => b && !PROTECTED.has(b) && b !== current && b !== defaultBranch)

  if (candidates.length === 0) {
    log.info('No local branches to clean up — all merged branches are already gone.')
    return
  }

  console.log(chalk.cyan(`  Found ${candidates.length} merged branch${candidates.length > 1 ? 'es' : ''} to delete:\n`))
  candidates.forEach(b => console.log(`    ${chalk.yellow('•')} ${b}`))
  console.log()

  const { confirmed } = await prompts({
    type: 'confirm',
    name: 'confirmed',
    message: `Delete ${candidates.length} branch${candidates.length > 1 ? 'es' : ''}?`,
    initial: false,
  }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })

  if (!confirmed) return log.warn('Cleanup cancelled.')

  let deleted = 0
  for (const branch of candidates) {
    try {
      await execa('git', ['branch', '-d', branch])
      console.log(chalk.green(`  ✔ Deleted: ${branch}`))
      deleted++
    } catch (err: any) {
      log.warn(`Could not delete "${branch}": ${err.message}`)
    }
  }

  console.log(chalk.green(`\n✅ Cleaned up ${deleted} branch${deleted !== 1 ? 'es' : ''}.\n`))
}
