import chalk from 'chalk'
import prompts from 'prompts'
import { execa } from 'execa'

import { log } from '../../core/logger.js'

const BRANCH_TYPES = [
  { value: 'feat',     title: 'feat     — new feature' },
  { value: 'fix',      title: 'fix      — bug fix' },
  { value: 'hotfix',   title: 'hotfix   — critical production fix' },
  { value: 'chore',    title: 'chore    — maintenance / deps' },
  { value: 'docs',     title: 'docs     — documentation' },
  { value: 'test',     title: 'test     — tests' },
  { value: 'refactor', title: 'refactor — code restructure' },
  { value: 'release',  title: 'release  — release branch' },
]

function toKebab(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

type BranchCreateOptions = {
  type?: string
  ticket?: string
  description?: string
  yes?: boolean
}

export default async function branchCreate(options: BranchCreateOptions = {}) {
  const { stdout: root } = await execa('git', ['rev-parse', '--show-toplevel']).catch(() => ({ stdout: '' }))
  if (!root) return log.error('Not inside a git repository.')

  log.title('🌿 Create Branch')

  const promptFields: prompts.PromptObject[] = [
    ...(!options.type ? [{
      type: 'select' as const,
      name: 'type',
      message: 'Branch type:',
      choices: BRANCH_TYPES.map(t => ({ title: t.title, value: t.value })),
      initial: 0,
    }] : []),
    ...(options.ticket === undefined ? [{
      type: 'text' as const,
      name: 'ticket',
      message: 'Ticket / issue ID (optional, e.g. PROJ-123):',
    }] : []),
    ...(!options.description ? [{
      type: 'text' as const,
      name: 'description',
      message: 'Short description:',
      validate: (v: string) => v.trim() ? true : 'Description is required',
    }] : []),
  ]

  const response = promptFields.length > 0
    ? await prompts(promptFields, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })
    : {}

  const type        = options.type        ?? (response as any).type
  const ticket      = options.ticket      ?? (response as any).ticket ?? ''
  const description = options.description ?? (response as any).description

  if (!type)        return log.error('Branch type is required.')
  if (!description) return log.error('Branch description is required.')

  const ticketUpper = ticket.trim().toUpperCase()
  const slug        = toKebab(description)
  const suffix      = [ticketUpper, slug].filter(Boolean).join('-')
  const branchName  = `${type}/${suffix}`

  console.log(chalk.dim(`\n  → ${chalk.white(branchName)}\n`))

  if (!options.yes) {
    const { confirmed } = await prompts({
      type: 'confirm',
      name: 'confirmed',
      message: `Create and checkout "${branchName}"?`,
      initial: true,
    }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })

    if (!confirmed) return log.warn('Cancelled.')
  }

  try {
    await execa('git', ['checkout', '-b', branchName])
    console.log(chalk.green(`\n✔ Switched to new branch "${branchName}"\n`))
  } catch (err: any) {
    log.error(`Failed to create branch: ${err.message}`)
  }
}
