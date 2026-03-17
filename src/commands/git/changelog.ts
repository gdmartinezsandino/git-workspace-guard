import chalk from 'chalk'
import { execa } from 'execa'
import fs from 'fs-extra'
import path from 'path'

import { log } from '../../core/logger.js'

const TYPE_LABELS: Record<string, string> = {
  feat:     '✨ Features',
  fix:      '🐛 Bug Fixes',
  perf:     '⚡ Performance',
  refactor: '♻️  Refactoring',
  docs:     '📚 Documentation',
  test:     '✅ Tests',
  style:    '💄 Style',
  chore:    '🔧 Chores',
}

type ParsedCommit = {
  hash: string
  type: string
  scope: string | null
  breaking: boolean
  description: string
}

function parseCommit(line: string): ParsedCommit | null {
  const spaceIdx = line.indexOf(' ')
  if (spaceIdx === -1) return null
  const hash = line.slice(0, spaceIdx)
  const subject = line.slice(spaceIdx + 1)
  const match = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/)
  if (!match) return null
  return {
    hash,
    type: match[1]!,
    scope: match[2] ?? null,
    breaking: match[3] === '!',
    description: match[4]!,
  }
}

export default async function changelog() {
  // 1. Must be inside a git repo
  const { stdout: root } = await execa('git', ['rev-parse', '--show-toplevel']).catch(() => ({ stdout: '' }))
  if (!root) return log.error('Not inside a git repository.')

  // 2. Find latest tag to know what range to cover
  const { stdout: lastTag } = await execa('git', ['describe', '--tags', '--abbrev=0']).catch(() => ({ stdout: '' }))
  const since = lastTag.trim()
  const range = since ? `${since}..HEAD` : 'HEAD'

  // 3. Get commits
  const { stdout: rawLog } = await execa('git', ['log', range, '--pretty=format:%h %s', '--no-merges'])

  if (!rawLog.trim()) {
    log.info(since ? `No new commits since ${chalk.bold(since)}.` : 'No commits found.')
    return
  }

  const allLines = rawLog.trim().split('\n')
  const parsed = allLines.map(parseCommit).filter(Boolean) as ParsedCommit[]

  if (parsed.length === 0) {
    log.warn(`Found ${allLines.length} commits but none follow conventional format.`)
    log.info('Use `gw commit` to create commits with the right structure.')
    return
  }

  // 4. Get current version from package.json
  const pkgPath = path.join(root.trim(), 'package.json')
  const version = (await fs.pathExists(pkgPath))
    ? `v${(await fs.readJSON(pkgPath)).version}`
    : 'Unreleased'

  // 5. Group by type
  const grouped = new Map<string, ParsedCommit[]>()
  const breaking: ParsedCommit[] = []

  for (const c of parsed) {
    if (c.breaking) breaking.push(c)
    if (!grouped.has(c.type)) grouped.set(c.type, [])
    grouped.get(c.type)!.push(c)
  }

  // 6. Build markdown section
  const date = new Date().toISOString().slice(0, 10)
  const lines: string[] = [`## [${version}] - ${date}`, '']

  if (breaking.length > 0) {
    lines.push('### ⚠️  Breaking Changes', '')
    for (const c of breaking) {
      const scope = c.scope ? `**${c.scope}:** ` : ''
      lines.push(`- ${scope}${c.description} (\`${c.hash}\`)`)
    }
    lines.push('')
  }

  for (const [type, label] of Object.entries(TYPE_LABELS)) {
    const list = grouped.get(type)
    if (!list?.length) continue
    lines.push(`### ${label}`, '')
    for (const c of list) {
      const scope = c.scope ? `**${c.scope}:** ` : ''
      lines.push(`- ${scope}${c.description} (\`${c.hash}\`)`)
    }
    lines.push('')
  }

  const section = lines.join('\n')

  // 7. Write to CHANGELOG.md
  const changelogPath = path.join(root.trim(), 'CHANGELOG.md')
  const exists = await fs.pathExists(changelogPath)

  if (exists) {
    const current = await fs.readFile(changelogPath, 'utf8')
    // Keep the `# Changelog` header if present, insert new section after it
    const headerEnd = current.startsWith('# ') ? current.indexOf('\n') + 1 : 0
    const after = current.slice(headerEnd).trimStart()
    const newContent = current.slice(0, headerEnd) + (headerEnd ? '\n' : '') + section + '\n' + after
    await fs.writeFile(changelogPath, newContent)
  } else {
    await fs.writeFile(changelogPath, `# Changelog\n\n${section}\n`)
  }

  // 8. Summary
  log.title(`📝 Changelog updated`)
  console.log(chalk.dim(`  Range:   ${since ? `${since}..HEAD` : 'all commits'}`))
  console.log(chalk.dim(`  Parsed:  ${parsed.length} / ${allLines.length} commits`))
  console.log(chalk.green(`  ✔ ${exists ? 'Updated' : 'Created'} CHANGELOG.md\n`))
  console.log(chalk.dim('─'.repeat(50)))
  console.log(section.trimEnd())
  console.log(chalk.dim('─'.repeat(50)) + '\n')
}
