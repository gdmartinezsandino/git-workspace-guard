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

export default async function branchCreate() {
  const { stdout: root } = await execa('git', ['rev-parse', '--show-toplevel']).catch(() => ({ stdout: '' }))
  if (!root) return log.error('Not inside a git repository.')

  log.title('🌿 Create Branch')

  const response = await prompts(
    [
      {
        type: 'select',
        name: 'type',
        message: 'Branch type:',
        choices: BRANCH_TYPES.map(t => ({ title: t.title, value: t.value })),
        initial: 0,
      },
      {
        type: 'text',
        name: 'ticket',
        message: 'Ticket / issue ID (optional, e.g. PROJ-123):',
      },
      {
        type: 'text',
        name: 'description',
        message: 'Short description:',
        validate: (v: string) => v.trim() ? true : 'Description is required',
      },
    ],
    { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } }
  )

  const ticket = response.ticket?.trim().toUpperCase() || ''
  const slug = toKebab(response.description)
  const suffix = [ticket, slug].filter(Boolean).join('-')
  const branchName = `${response.type}/${suffix}`

  console.log(chalk.dim(`\n  → ${chalk.white(branchName)}\n`))

  const { confirmed } = await prompts({
    type: 'confirm',
    name: 'confirmed',
    message: `Create and checkout "${branchName}"?`,
    initial: true,
  }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })

  if (!confirmed) return log.warn('Cancelled.')

  try {
    await execa('git', ['checkout', '-b', branchName])
    console.log(chalk.green(`\n✔ Switched to new branch "${branchName}"\n`))
  } catch (err: any) {
    log.error(`Failed to create branch: ${err.message}`)
  }
}
