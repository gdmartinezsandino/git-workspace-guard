import chalk from 'chalk'
import prompts from 'prompts'
import { execa } from 'execa'
import path from 'path'
import fs from 'fs-extra'

import { config, state } from '../../core/config.js'
import { log } from '../../core/logger.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getDefaultBranch(repoDir: string): Promise<string> {
  try {
    const { stdout } = await execa('git', ['-C', repoDir, 'symbolic-ref', 'refs/remotes/origin/HEAD', '--short'])
    return stdout.trim().replace('origin/', '')
  } catch {
    return 'main'
  }
}

/** Scan one level of rootDir for git repos whose origin remote matches any of orgKeywords. */
async function findMatchingRepos(rootDir: string, orgKeywords: string[]): Promise<string[]> {
  const found: string[] = []
  const entries = await fs.readdir(rootDir).catch(() => [] as string[])

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry)
    const stat = await fs.lstat(entryPath).catch(() => null)
    if (!stat?.isDirectory()) continue

    const gitDir = path.join(entryPath, '.git')
    if (!(await fs.pathExists(gitDir))) continue

    if (orgKeywords.length === 0) {
      found.push(entryPath)
      continue
    }

    try {
      const { stdout } = await execa('git', ['-C', entryPath, 'remote', 'get-url', 'origin'])
      const remote = stdout.trim()
      if (orgKeywords.some(k => remote.toLowerCase().includes(k.toLowerCase()))) {
        found.push(entryPath)
      }
    } catch {}
  }

  return found
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default async function sync() {
  log.title('🔄 Workspace Sync')

  const activeName = state.get('activeWorkspace')
  if (!activeName) return log.error('No active workspace. Run: gw workspace use <name>')

  const workspaces = config.get('workspaces')
  const ws = workspaces[activeName]
  if (!ws) return log.error(`Workspace "${activeName}" not found.`)

  const orgKeywords: string[] = ws.orgs ?? []

  // Ask for root dir to scan
  const { rootDir } = await prompts({
    type: 'text',
    name: 'rootDir',
    message: 'Root directory to scan for repos:',
    initial: process.cwd(),
    validate: (v: string) => v.trim() ? true : 'Directory is required',
  }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })

  console.log(chalk.dim(`\n  Scanning ${rootDir} for repos matching workspace "${activeName}"...\n`))

  const repos = await findMatchingRepos(rootDir, orgKeywords)

  if (repos.length === 0) {
    log.info('No matching repositories found. Make sure your workspace orgs[] keywords match the remote URL.')
    return
  }

  console.log(chalk.cyan(`  Found ${repos.length} repo${repos.length !== 1 ? 's' : ''}:\n`))
  repos.forEach(r => console.log(`    ${chalk.dim('•')} ${path.relative(rootDir, r) || r}`))
  console.log()

  const { confirmed } = await prompts({
    type: 'confirm',
    name: 'confirmed',
    message: `Pull latest (--ff-only) on default branch for ${repos.length} repo${repos.length !== 1 ? 's' : ''}?`,
    initial: true,
  }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })

  if (!confirmed) return log.warn('Sync cancelled.')

  console.log()

  let ok = 0
  let skipped = 0
  let errors = 0

  for (const repoDir of repos) {
    const name = path.relative(rootDir, repoDir) || repoDir
    const defaultBranch = await getDefaultBranch(repoDir)

    const { stdout: currentBranchRaw } = await execa('git', ['-C', repoDir, 'rev-parse', '--abbrev-ref', 'HEAD'])
      .catch(() => ({ stdout: '' }))
    const currentBranch = currentBranchRaw.trim()

    if (currentBranch && currentBranch !== defaultBranch) {
      console.log(`  ${chalk.yellow('⏭')} ${name}  ${chalk.dim(`on "${currentBranch}", skipped`)}`)
      skipped++
      continue
    }

    try {
      await execa('git', ['-C', repoDir, 'pull', '--ff-only'], { stderr: 'pipe' })
      console.log(`  ${chalk.green('✔')} ${name}`)
      ok++
    } catch (err: any) {
      const detail = (err.stderr as string | undefined)?.trim() ?? err.message ?? 'unknown error'
      console.log(`  ${chalk.red('✘')} ${name}  ${chalk.dim(detail.split('\n')[0])}`)
      errors++
    }
  }

  console.log()
  console.log(
    chalk.green(`  ✔ Updated: ${ok}`) +
    chalk.dim(`   Skipped: ${skipped}   Errors: ${errors}\n`)
  )
}
