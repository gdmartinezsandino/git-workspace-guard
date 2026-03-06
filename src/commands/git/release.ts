import chalk from 'chalk'
import prompts from 'prompts'
import { execa } from 'execa'
import fs from 'fs-extra'
import path from 'path'

import { log } from '../../core/logger.js'
import { loadContext } from '../../core/context.js'
import { config } from '../../core/config.js'

// ─── Semver helpers ───────────────────────────────────────────────────────────

function bumpVersion(current: string, type: 'patch' | 'minor' | 'major'): string {
  const parts = current.replace(/^v/, '').split('.').map(Number)
  if (type === 'major') return `${parts[0]! + 1}.0.0`
  if (type === 'minor') return `${parts[0]}.${parts[1]! + 1}.0`
  return `${parts[0]}.${parts[1]}.${parts[2]! + 1}`
}

// ─── Parse remote (shared pattern) ───────────────────────────────────────────

function parseRemote(remote: string): { owner: string; repo: string } | null {
  const sshMatch = remote.match(/^git@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (sshMatch) return { owner: sshMatch[1]!, repo: sshMatch[2]! }
  const httpsMatch = remote.match(/^https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (httpsMatch) return { owner: httpsMatch[1]!, repo: httpsMatch[2]! }
  return null
}

// ─── Platform release creators ────────────────────────────────────────────────

async function createGitHubRelease(
  token: string, owner: string, repo: string,
  tag: string, name: string, body: string
): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tag_name: tag, name, body, draft: false, prerelease: false }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new Error(err.message ?? `GitHub API error ${res.status}`)
  }
  const data = await res.json() as any
  return data.html_url as string
}

async function createGitLabRelease(
  token: string, namespace: string, repo: string,
  tag: string, name: string, description: string
): Promise<string> {
  const projectPath = encodeURIComponent(`${namespace}/${repo}`)
  const res = await fetch(`https://gitlab.com/api/v4/projects/${projectPath}/releases`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: tag, name, description }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new Error(err.message ?? `GitLab API error ${res.status}`)
  }
  const data = await res.json() as any
  return (data._links?.self ?? '') as string
}

// ─── Changelog helpers (inline, no file write duplication) ───────────────────

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
  hash: string; type: string; scope: string | null; breaking: boolean; description: string
}

function parseCommit(line: string): ParsedCommit | null {
  const spaceIdx = line.indexOf(' ')
  if (spaceIdx === -1) return null
  const hash = line.slice(0, spaceIdx)
  const subject = line.slice(spaceIdx + 1)
  const match = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/)
  if (!match) return null
  return { hash, type: match[1]!, scope: match[2] ?? null, breaking: match[3] === '!', description: match[4]! }
}

function buildChangelogSection(version: string, commits: ParsedCommit[]): string {
  const date = new Date().toISOString().slice(0, 10)
  const lines: string[] = [`## [${version}] - ${date}`, '']
  const grouped = new Map<string, ParsedCommit[]>()
  const breaking: ParsedCommit[] = []

  for (const c of commits) {
    if (c.breaking) breaking.push(c)
    if (!grouped.has(c.type)) grouped.set(c.type, [])
    grouped.get(c.type)!.push(c)
  }

  if (breaking.length > 0) {
    lines.push('### ⚠️  Breaking Changes', '')
    for (const c of breaking) {
      lines.push(`- ${c.scope ? `**${c.scope}:** ` : ''}${c.description} (\`${c.hash}\`)`)
    }
    lines.push('')
  }

  for (const [type, label] of Object.entries(TYPE_LABELS)) {
    const list = grouped.get(type)
    if (!list?.length) continue
    lines.push(`### ${label}`, '')
    for (const c of list) {
      lines.push(`- ${c.scope ? `**${c.scope}:** ` : ''}${c.description} (\`${c.hash}\`)`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type ReleaseOptions = {
  patch?: boolean
  minor?: boolean
  major?: boolean
  version?: string
  yes?: boolean
  push?: boolean  // false when --no-push is passed
}

export default async function release(options: ReleaseOptions = {}) {
  const { stdout: root } = await execa('git', ['rev-parse', '--show-toplevel']).catch(() => ({ stdout: '' }))
  if (!root) return log.error('Not inside a git repository.')

  log.title('🚀 Release Wizard')

  // 1. Read current version from package.json
  const pkgPath = path.join(root.trim(), 'package.json')
  const hasPkg = await fs.pathExists(pkgPath)
  const pkg = hasPkg ? await fs.readJSON(pkgPath) : null
  const currentVersion: string = pkg?.version ?? '0.0.0'

  console.log(chalk.dim(`  Current version: ${chalk.white(currentVersion)}\n`))

  // 2. Resolve version from flags or prompt
  const patch = bumpVersion(currentVersion, 'patch')
  const minor = bumpVersion(currentVersion, 'minor')
  const major = bumpVersion(currentVersion, 'major')

  let newVersion: string

  if (options.version) {
    if (!/^\d+\.\d+\.\d+/.test(options.version)) return log.error('--version must be valid semver (e.g. 2.1.0)')
    newVersion = options.version
  } else if (options.patch) {
    newVersion = patch
  } else if (options.minor) {
    newVersion = minor
  } else if (options.major) {
    newVersion = major
  } else {
    const { versionChoice } = await prompts({
      type: 'select',
      name: 'versionChoice',
      message: 'Choose new version:',
      choices: [
        { title: `patch  →  ${patch}  (bug fixes)`,        value: patch },
        { title: `minor  →  ${minor}  (new features)`,     value: minor },
        { title: `major  →  ${major}  (breaking changes)`, value: major },
        { title: 'custom  (enter manually)',                value: 'custom' },
      ],
      initial: 0,
    }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })

    if (versionChoice === 'custom') {
      const { custom } = await prompts({
        type: 'text',
        name: 'custom',
        message: 'Enter version (without v prefix):',
        validate: (v: string) => /^\d+\.\d+\.\d+/.test(v) ? true : 'Must be valid semver (e.g. 2.1.0)',
      }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })
      newVersion = custom
    } else {
      newVersion = versionChoice
    }
  }

  const tag = `v${newVersion}`

  // 3. Get commits since last tag for changelog
  const { stdout: lastTag } = await execa('git', ['describe', '--tags', '--abbrev=0']).catch(() => ({ stdout: '' }))
  const since = lastTag.trim()
  const range = since ? `${since}..HEAD` : 'HEAD'

  const { stdout: rawLog } = await execa('git', ['log', range, '--pretty=format:%h %s', '--no-merges'])
  const parsedCommits = rawLog.trim()
    ? rawLog.trim().split('\n').map(parseCommit).filter(Boolean) as ParsedCommit[]
    : []

  const changelogSection = parsedCommits.length > 0
    ? buildChangelogSection(tag, parsedCommits)
    : `## [${tag}] - ${new Date().toISOString().slice(0, 10)}\n\n_No conventional commits found._\n`

  console.log(chalk.dim('\n  Changelog preview:'))
  console.log(chalk.dim('─'.repeat(50)))
  console.log(changelogSection.trimEnd())
  console.log(chalk.dim('─'.repeat(50)) + '\n')

  if (!options.yes) {
    const { confirmed } = await prompts({
      type: 'confirm',
      name: 'confirmed',
      message: `Proceed with release ${chalk.bold(tag)}?`,
      initial: true,
    }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })

    if (!confirmed) return log.warn('Release cancelled.')
  }

  // 4. Update package.json version
  if (hasPkg) {
    pkg.version = newVersion
    await fs.writeJSON(pkgPath, pkg, { spaces: 2 })
    console.log(chalk.green(`  ✔ package.json updated to ${newVersion}`))
  }

  // 5. Update CHANGELOG.md
  const changelogPath = path.join(root.trim(), 'CHANGELOG.md')
  const clExists = await fs.pathExists(changelogPath)

  if (clExists) {
    const current = await fs.readFile(changelogPath, 'utf8')
    const headerEnd = current.startsWith('# ') ? current.indexOf('\n') + 1 : 0
    const after = current.slice(headerEnd).trimStart()
    await fs.writeFile(
      changelogPath,
      current.slice(0, headerEnd) + (headerEnd ? '\n' : '') + changelogSection + '\n' + after
    )
  } else {
    await fs.writeFile(changelogPath, `# Changelog\n\n${changelogSection}\n`)
  }

  console.log(chalk.green(`  ✔ CHANGELOG.md ${clExists ? 'updated' : 'created'}`))

  // 6. Commit + tag
  const filesToStage: string[] = ['CHANGELOG.md']
  if (hasPkg) filesToStage.push('package.json')

  await execa('git', ['add', ...filesToStage])
  await execa('git', ['commit', '-m', `chore: release ${tag}`])
  console.log(chalk.green(`  ✔ Committed release changes`))

  await execa('git', ['tag', '-a', tag, '-m', `Release ${tag}`])
  console.log(chalk.green(`  ✔ Annotated tag ${tag} created`))

  // 7. Push
  let doPush = options.push !== false

  if (options.push !== false) {
    const { pushConfirmed } = await prompts({
      type: 'confirm',
      name: 'pushConfirmed',
      message: 'Push commits and tag to origin?',
      initial: true,
    }, { onCancel: () => { log.warn('Skipping push.'); process.exit(0) } })
    doPush = pushConfirmed
  }

  if (doPush) {
    await execa('git', ['push'], { stdio: 'inherit' })
    await execa('git', ['push', 'origin', tag], { stdio: 'inherit' })
    console.log(chalk.green(`\n  ✔ Pushed ${tag} to origin`))
  }

  // 8. Optionally create a platform release
  const ctx = await loadContext()
  const provider = ctx.gitHost !== 'unknown' ? ctx.gitHost : ctx.workspace?.provider

  if (doPush && ctx.gitRemote && provider && provider !== 'unknown' && provider !== 'bitbucket') {
    const { doRelease } = await prompts({
      type: 'confirm',
      name: 'doRelease',
      message: `Create a ${provider} release for ${tag}?`,
      initial: true,
    })

    if (doRelease) {
      const workspaces = config.get('workspaces')
      const activeName = ctx.workspace?.name
      const ws = activeName ? workspaces[activeName] : null
      const token = ws?.token

      if (!token) {
        log.warn(`No API token for workspace "${activeName}". Skipping platform release.`)
        log.info('Add a token with: gw workspace edit <name>')
      } else {
        const parts = parseRemote(ctx.gitRemote)
        if (parts) {
          try {
            let releaseUrl = ''
            if (provider === 'github') {
              releaseUrl = await createGitHubRelease(token, parts.owner, parts.repo, tag, tag, changelogSection)
            } else if (provider === 'gitlab') {
              releaseUrl = await createGitLabRelease(token, parts.owner, parts.repo, tag, tag, changelogSection)
            }
            console.log(chalk.green(`\n✅ Release created: ${releaseUrl}`))
          } catch (err: any) {
            log.error(`Failed to create platform release: ${err.message}`)
          }
        }
      }
    }
  }

  console.log(chalk.green(`\n✅ Release ${chalk.bold(tag)} complete!\n`))
}
