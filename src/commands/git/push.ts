import chalk from 'chalk'
import prompts from 'prompts'
import { execa } from 'execa'

import { log } from '../../core/logger.js'

type PushOptions = {
  pr?: boolean  // false when --no-pr is passed
}

export default async function push(options: PushOptions = {}) {
  // 1. Must be inside a git repo
  const { stdout: root } = await execa('git', ['rev-parse', '--show-toplevel']).catch(() => ({ stdout: '' }))
  if (!root) return log.error('Not inside a git repository.')

  // 2. Get current branch
  const { stdout: branchRaw } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
  const branch = branchRaw.trim()
  if (branch === 'HEAD') return log.error('Detached HEAD state — checkout a branch first.')

  // 3. Check if there is anything to push
  const { stdout: localChanges } = await execa('git', ['status', '--porcelain']).catch(() => ({ stdout: '' }))
  const hasUncommitted = !!localChanges.trim()

  // 4. Check if upstream exists
  const hasUpstream = await execa('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
    .then(() => true)
    .catch(() => false)

  // 5. Get unpushed commits
  const { stdout: unpushedRaw } = await execa(
    'git', ['log', hasUpstream ? '@{u}..HEAD' : 'HEAD', '--oneline', '--no-merges']
  ).catch(() => ({ stdout: '' }))

  console.log(chalk.cyan(`\n🚀 Pushing branch: ${chalk.bold(branch)}\n`))

  if (hasUncommitted) {
    log.warn('You have uncommitted changes — they will NOT be pushed.')
    console.log()
  }

  if (unpushedRaw.trim()) {
    const commits = unpushedRaw.trim().split('\n')
    console.log(chalk.dim(`  Commits to push (${commits.length}):`))
    commits.forEach(c => console.log(chalk.dim('  ' + c)))
    console.log()
  } else if (hasUpstream) {
    log.info('Branch is already up to date with upstream.')
    return
  }

  // 6. Push
  try {
    if (hasUpstream) {
      await execa('git', ['push'], { stdio: 'inherit' })
    } else {
      log.info(`No upstream — setting: origin/${branch}`)
      console.log()
      await execa('git', ['push', '--set-upstream', 'origin', branch], { stdio: 'inherit' })
    }
  } catch {
    return log.error('Push failed. Check the output above.')
  }

  console.log(chalk.green(`\n✔ ${chalk.bold(branch)} pushed successfully!\n`))

  // 7. Offer to create a PR — skip prompt if --no-pr was passed
  if (options.pr !== false) {
    const { openPR } = await prompts({
      type: 'confirm',
      name: 'openPR',
      message: 'Create a pull request now?',
      initial: false,
    })

    if (openPR) {
      const { default: create } = await import('../pr/create.js')
      await create()
    }
  }
}
