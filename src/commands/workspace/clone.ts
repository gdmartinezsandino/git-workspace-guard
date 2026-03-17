import path from 'path'
import chalk from 'chalk'
import prompts from 'prompts'
import { execa } from 'execa'

import { config, state } from '../../core/config.js'
import { log } from '../../core/logger.js'
import { ACTIVE_KEY_SYMLINK } from '../../core/constants.js'
import fs from 'fs-extra'
import os from 'os'

type ParsedUrl = {
  namespace: string
  repo: string
}

function parseGitUrl(url: string): ParsedUrl | null {
  // SSH: git@github.com:namespace/repo.git
  const sshMatch = url.match(/^git@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (sshMatch) return { namespace: sshMatch[1]!, repo: sshMatch[2]! }

  // HTTPS: https://github.com/namespace/repo.git
  const httpsMatch = url.match(/^https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (httpsMatch) return { namespace: httpsMatch[1]!, repo: httpsMatch[2]! }

  return null
}

export default async function clone(url: string) {
  log.title(chalk.cyan('\n🔗 Clone with workspace identity\n'))

  const parsed = parseGitUrl(url)
  if (!parsed) {
    return log.error(`Cannot parse URL: ${url}`)
  }

  const { namespace, repo } = parsed
  const workspaces = config.get('workspaces')

  // Auto-detect workspace from namespace
  let workspaceName = Object.keys(workspaces).find(k =>
    workspaces[k].orgs?.some((org: string) =>
      namespace.toLowerCase().includes(org.toLowerCase())
    )
  )

  // If no match, prompt the user to pick one
  if (!workspaceName) {
    const choices = Object.keys(workspaces).map(k => ({ title: k, value: k }))
    if (choices.length === 0) {
      return log.error('No workspaces configured. Run: gw workspace add')
    }

    const { chosen } = await prompts({
      type: 'select',
      name: 'chosen',
      message: `No workspace matched "${namespace}". Select one:`,
      choices,
      initial: 0
    }, {
      onCancel: () => {
        log.warn('Clone cancelled.')
        process.exit(0)
      }
    })

    workspaceName = chosen
  }

  if (!workspaceName) return log.error('No workspace selected.')

  const ws = workspaces[workspaceName]

  // Rewrite URL to use the workspace SSH alias
  const sshAlias = ws.sshAlias ?? `gw-${workspaceName}`
  const cloneUrl = `git@${sshAlias}:${namespace}/${repo}.git`

  log.info(`Workspace : ${workspaceName}`)
  log.info(`Clone URL : ${cloneUrl}`)
  log.info(`Directory : ./${repo}\n`)

  // Run git clone (directly, not via shell eval)
  try {
    await execa('git', ['clone', cloneUrl], { stdio: 'inherit' })
  } catch {
    return log.error('git clone failed.')
  }

  // Set local git identity in the cloned repo
  const repoDir = path.join(process.cwd(), repo)
  await execa('git', ['-C', repoDir, 'config', 'user.name', ws.userName])
  await execa('git', ['-C', repoDir, 'config', 'user.email', ws.userEmail])

  // Update active workspace state + SSH symlink (same as use.ts)
  state.set('activeWorkspace', workspaceName ?? '')

  try {
    const realKeyPath = ws.sshKey.replace('~', os.homedir())
    if (fs.existsSync(ACTIVE_KEY_SYMLINK) || fs.lstatSync(ACTIVE_KEY_SYMLINK, { throwIfNoEntry: false })?.isSymbolicLink()) {
      fs.removeSync(ACTIVE_KEY_SYMLINK)
    }
    fs.symlinkSync(realKeyPath, ACTIVE_KEY_SYMLINK)
  } catch (err: any) {
    log.warn(`Could not update SSH symlink: ${err.message}`)
  }

  // Output shell commands for the parent shell to eval (workspace switch)
  const lines = [
    `export GW_ACTIVE="${workspaceName}"`,
    `git config --global user.name "${ws.userName}"`,
    `git config --global user.email "${ws.userEmail}"`,
    `ssh-add -D > /dev/null 2>&1`,
    `ssh-add "${ws.sshKey.replace('~', '$HOME')}" > /dev/null 2>&1`,
    `echo "✅ Cloned '${repo}' with workspace '${workspaceName}'"`,
    `echo "👤 ${ws.userName} <${ws.userEmail}>"`,
  ]
  console.log(lines.join('\n'))
}
