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

type CommitOptions = {
  type?: string
  scope?: string
  message?: string
  body?: string
  all?: boolean
  yes?: boolean
}

export default async function commit(options: CommitOptions = {}) {
  // 1. Must be inside a git repo
  const { stdout: root } = await execa('git', ['rev-parse', '--show-toplevel']).catch(() => ({ stdout: '' }))
  if (!root) return log.error('Not inside a git repository.')

  // 2. Stage all if -a / --all was passed
  if (options.all) {
    await execa('git', ['add', '-A'])
    log.info('All changes staged.\n')
  }

  // 3. Check staged files
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

  // 4. Show staged summary
  const { stdout: finalStaged } = await execa('git', ['diff', '--cached', '--name-status'])
  console.log(chalk.cyan('📦 Staged changes:\n'))
  finalStaged.trim().split('\n').forEach(line => {
    const [status, ...rest] = line.split('\t')
    const file = rest.join('\t')
    const icon = status === 'A' ? chalk.green('+') : status === 'D' ? chalk.red('-') : chalk.yellow('~')
    console.log(`  ${icon} ${chalk.dim(file)}`)
  })
  console.log()

  // 5. Prompts — skip fields provided via flags
  const promptFields: prompts.PromptObject[] = [
    ...(!options.type ? [{
      type: 'select' as const,
      name: 'type',
      message: 'Commit type:',
      choices: COMMIT_TYPES.map(t => ({ title: t.title, value: t.value })),
      initial: 0,
    }] : []),
    ...(!options.scope ? [{
      type: 'text' as const,
      name: 'scope',
      message: 'Scope (optional, e.g. auth, api):',
    }] : []),
    ...(!options.message ? [{
      type: 'text' as const,
      name: 'description',
      message: 'Description:',
      validate: (v: string) => v.trim() ? true : 'Description is required',
    }] : []),
    ...(!options.body ? [{
      type: 'text' as const,
      name: 'body',
      message: 'Body (optional, press Enter to skip):',
    }] : []),
  ]

  const response = promptFields.length > 0
    ? await prompts(promptFields, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })
    : {}

  const type        = options.type    ?? (response as any).type
  const scope       = options.scope   ?? (response as any).scope
  const description = options.message ?? (response as any).description
  const body        = options.body    ?? (response as any).body

  if (!type)        return log.error('Commit type is required.')
  if (!description) return log.error('Commit description is required.')

  // 6. Build conventional commit message
  const scopeTrimmed = scope?.trim()
  const prefix  = scopeTrimmed ? `${type}(${scopeTrimmed})` : type
  const subject = `${prefix}: ${description.trim()}`
  const message = body?.trim() ? `${subject}\n\n${body.trim()}` : subject

  console.log(chalk.dim(`\n  → ${chalk.white(subject)}\n`))

  // 7. Confirm (skip if --yes)
  if (!options.yes) {
    const { confirmed } = await prompts({
      type: 'confirm',
      name: 'confirmed',
      message: 'Commit?',
      initial: true,
    }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })

    if (!confirmed) return log.warn('Commit cancelled.')
  }

  // 8. Commit
  await execa('git', ['commit', '-m', message])
  const { stdout: hash } = await execa('git', ['rev-parse', '--short', 'HEAD'])
  console.log(chalk.green(`\n✔ Committed ${chalk.bold(hash.trim())}: ${subject}\n`))
}
