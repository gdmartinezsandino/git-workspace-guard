import chalk from 'chalk'
import prompts from 'prompts'
import { execa } from 'execa'
import path from 'path'
import fs from 'fs-extra'
import os from 'os'

import { config, state } from '../../core/config.js'
import { log } from '../../core/logger.js'
import { ACTIVE_KEY_SYMLINK } from '../../core/constants.js'

// ─── Provider repo listing ────────────────────────────────────────────────────

type RepoInfo = { name: string; sshUrl: string }

async function fetchGitHubRepos(token: string, owner: string): Promise<RepoInfo[]> {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  // Try org endpoint first, fall back to user
  let res = await fetch(`https://api.github.com/orgs/${owner}/repos?per_page=100&type=all`, { headers })
  if (!res.ok) res = await fetch(`https://api.github.com/users/${owner}/repos?per_page=100&type=all`, { headers })
  if (!res.ok) throw new Error(`GitHub API error ${res.status}`)
  const data = await res.json() as any[]
  return data.map(r => ({ name: r.name, sshUrl: r.ssh_url }))
}

async function fetchGitLabRepos(token: string, namespace: string): Promise<RepoInfo[]> {
  const encoded = encodeURIComponent(namespace)
  let res = await fetch(
    `https://gitlab.com/api/v4/groups/${encoded}/projects?per_page=100&include_subgroups=true`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  )
  if (!res.ok) {
    res = await fetch(
      `https://gitlab.com/api/v4/users/${encoded}/projects?per_page=100`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    )
  }
  if (!res.ok) throw new Error(`GitLab API error ${res.status}`)
  const data = await res.json() as any[]
  return data.map(r => ({ name: r.path, sshUrl: r.ssh_url_to_repo }))
}

async function fetchBitbucketRepos(token: string, workspace: string): Promise<RepoInfo[]> {
  const authHeader = token.includes(':')
    ? `Basic ${Buffer.from(token).toString('base64')}`
    : `Bearer ${token}`
  const res = await fetch(
    `https://api.bitbucket.org/2.0/repositories/${workspace}?pagelen=100`,
    { headers: { 'Authorization': authHeader } }
  )
  if (!res.ok) throw new Error(`Bitbucket API error ${res.status}`)
  const data = await res.json() as any
  return (data.values ?? []).map((r: any) => ({
    name: r.slug,
    sshUrl: r.links?.clone?.find((c: any) => c.name === 'ssh')?.href ?? '',
  }))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default async function cloneAll() {
  log.title('📦 Clone All Repos')

  const workspaces = config.get('workspaces')
  const wsNames = Object.keys(workspaces)
  if (wsNames.length === 0) return log.error('No workspaces configured. Run: gw workspace add')

  // Pick workspace
  const { wsName } = await prompts({
    type: 'select',
    name: 'wsName',
    message: 'Workspace to clone from:',
    choices: wsNames.map(n => ({ title: n, value: n })),
    initial: 0,
  }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })

  const ws = workspaces[wsName]
  if (!ws?.token) return log.error(`No API token for workspace "${wsName}". Run: gw workspace edit <name>`)

  const provider: string = ws.provider ?? 'github'
  const defaultOrg: string = ws.orgs?.[0] ?? ''

  // Org / namespace
  const { org } = await prompts({
    type: 'text',
    name: 'org',
    message: `Organization / namespace on ${provider}:`,
    initial: defaultOrg,
    validate: (v: string) => v.trim() ? true : 'Namespace is required',
  }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })

  // Target directory
  const { targetDir } = await prompts({
    type: 'text',
    name: 'targetDir',
    message: 'Clone repos into directory:',
    initial: process.cwd(),
    validate: (v: string) => v.trim() ? true : 'Directory is required',
  }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })

  console.log(chalk.dim(`\n  Fetching repo list from ${provider}...\n`))

  let repos: RepoInfo[]
  try {
    if (provider === 'github')      repos = await fetchGitHubRepos(ws.token, org)
    else if (provider === 'gitlab') repos = await fetchGitLabRepos(ws.token, org)
    else                            repos = await fetchBitbucketRepos(ws.token, org)
  } catch (err: any) {
    return log.error(`Failed to fetch repos: ${err.message}`)
  }

  if (repos.length === 0) {
    log.info('No repositories found for this organization.')
    return
  }

  // Multi-select repos
  const { selected } = await prompts({
    type: 'multiselect',
    name: 'selected',
    message: `Select repos to clone (${repos.length} available):`,
    choices: repos.map(r => ({ title: r.name, value: r.name })),
    hint: '← space to toggle  ↑↓ navigate  enter to confirm',
    min: 1,
  }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })

  if (!selected?.length) return log.warn('No repos selected.')

  const toClone = repos.filter(r => selected.includes(r.name))
  const sshAlias = ws.sshAlias ?? `gw-${wsName}`

  console.log()
  await fs.ensureDir(targetDir)

  let cloned = 0
  for (const r of toClone) {
    const repoDir = path.join(targetDir, r.name)
    if (await fs.pathExists(repoDir)) {
      log.warn(`Skipped "${r.name}" — directory already exists`)
      continue
    }
    // Replace the SSH host with the workspace alias so the right key is used
    const sshUrl = r.sshUrl.replace(/^git@[^:]+:/, `git@${sshAlias}:`)
    console.log(chalk.dim(`  Cloning ${r.name}...`))
    try {
      await execa('git', ['clone', sshUrl, repoDir], { stdio: 'inherit' })
      await execa('git', ['-C', repoDir, 'config', 'user.name', ws.userName])
      await execa('git', ['-C', repoDir, 'config', 'user.email', ws.userEmail])
      cloned++
    } catch {
      log.warn(`Failed to clone "${r.name}"`)
    }
  }

  // Update active workspace state + SSH symlink
  state.set('activeWorkspace', wsName)
  try {
    const realKeyPath = ws.sshKey.replace('~', os.homedir())
    if (
      fs.existsSync(ACTIVE_KEY_SYMLINK) ||
      fs.lstatSync(ACTIVE_KEY_SYMLINK, { throwIfNoEntry: false })?.isSymbolicLink()
    ) {
      fs.removeSync(ACTIVE_KEY_SYMLINK)
    }
    fs.symlinkSync(realKeyPath, ACTIVE_KEY_SYMLINK)
  } catch (err: any) {
    log.warn(`Could not update SSH symlink: ${err.message}`)
  }

  console.log(chalk.green(`\n✅ Cloned ${cloned} of ${toClone.length} repos into ${targetDir}\n`))
}
