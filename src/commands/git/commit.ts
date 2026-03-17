import chalk from 'chalk'
import prompts from 'prompts'
import { execa } from 'execa'

import { log } from '../../core/logger.js'

const COMMIT_TYPES = [
  { value: 'feat',     title: 'feat      — new feature' },
  { value: 'fix',      title: 'fix       — bug fix' },
  { value: 'chore',    title: 'chore     — maintenance, deps, config' },
  { value: 'docs',     title: 'docs      — documentation only' },
  { value: 'refactor', title: 'refactor  — neither feature nor fix' },
  { value: 'test',     title: 'test      — add or fix tests' },
  { value: 'style',    title: 'style     — formatting, whitespace' },
  { value: 'perf',     title: 'perf      — performance improvement' },
]

export default async function commit() {
  // 1. Must be inside a git repo
  const { stdout: root } = await execa('git', ['rev-parse', '--show-toplevel']).catch(() => ({ stdout: '' }))
  if (!root) return log.error('Not inside a git repository.')

  // 2. Check staged files
  const { stdout: stagedRaw } = await execa('git', ['diff', '--cached', '--name-status'])

  if (!stagedRaw.trim()) {
    const { stdout: statusRaw } = await execa('git', ['status', '--short'])
    if (!statusRaw.trim()) return log.warn('Nothing to commit — working tree is clean.')

    log.warn('No staged changes.')
    console.log(chalk.dim('\n  Unstaged / untracked files:'))
    statusRaw.trim().split('\n').forEach(l => console.log(chalk.dim('  ' + l)))
    console.log()

    const { stage } = await prompts({
      type: 'confirm',
      name: 'stage',
      message: 'Stage all changes now? (git add -A)',
      initial: false,
    }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })

    if (!stage) {
      log.info('Run `git add <files>` to stage changes, then try again.')
      return
    }

    await execa('git', ['add', '-A'])
    log.info('All changes staged.\n')
  }

  // 3. Show staged summary
  const { stdout: finalStaged } = await execa('git', ['diff', '--cached', '--name-status'])
  console.log(chalk.cyan('📦 Staged changes:\n'))
  finalStaged.trim().split('\n').forEach(line => {
    const [status, ...rest] = line.split('\t')
    const file = rest.join('\t')
    const icon = status === 'A' ? chalk.green('+') : status === 'D' ? chalk.red('-') : chalk.yellow('~')
    console.log(`  ${icon} ${chalk.dim(file)}`)
  })
  console.log()

  // 4. Prompts
  const response = await prompts(
    [
      {
        type: 'select',
        name: 'type',
        message: 'Commit type:',
        choices: COMMIT_TYPES.map(t => ({ title: t.title, value: t.value })),
        initial: 0,
      },
      {
        type: 'text',
        name: 'scope',
        message: 'Scope (optional, e.g. auth, api):',
      },
      {
        type: 'text',
        name: 'description',
        message: 'Description:',
        validate: (v: string) => v.trim() ? true : 'Description is required',
      },
      {
        type: 'text',
        name: 'body',
        message: 'Body (optional, press Enter to skip):',
      },
    ],
    { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } }
  )

  // 5. Build conventional commit message
  const scope = response.scope?.trim()
  const prefix = scope ? `${response.type}(${scope})` : response.type
  const subject = `${prefix}: ${response.description.trim()}`
  const message = response.body?.trim()
    ? `${subject}\n\n${response.body.trim()}`
    : subject

  console.log(chalk.dim(`\n  → ${chalk.white(subject)}\n`))

  const { confirmed } = await prompts({
    type: 'confirm',
    name: 'confirmed',
    message: 'Commit?',
    initial: true,
  }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })

  if (!confirmed) return log.warn('Commit cancelled.')

  // 6. Commit
  await execa('git', ['commit', '-m', message])
  const { stdout: hash } = await execa('git', ['rev-parse', '--short', 'HEAD'])
  console.log(chalk.green(`\n✔ Committed ${chalk.bold(hash.trim())}: ${subject}\n`))
}
