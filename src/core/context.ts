import { execa } from 'execa'
import { config, state } from './config.js'
import type { GuardContext, Workspace } from './types.js'

export async function loadContext(): Promise<GuardContext> {
  const cwd = process.cwd()

  let isGitRepo = true
  try {
    await execa('git', ['rev-parse', '--is-inside-work-tree'])
  } catch {
    isGitRepo = false
  }

  const activeName = state.get('activeWorkspace')
  const workspaces = config.get('workspaces')

  const workspace: Workspace | null =
    activeName && workspaces[activeName]
      ? { name: activeName, ...workspaces[activeName] }
      : null

  let gitRemote: string | undefined
  let gitHost: GuardContext['gitHost'] = 'unknown'

  if (isGitRepo) {
    try {
      const { stdout } = await execa('git', ['remote', 'get-url', 'origin'])
      gitRemote = stdout.trim()

      if (gitRemote.includes('github.com')) gitHost = 'github'
      else if (gitRemote.includes('bitbucket.org')) gitHost = 'bitbucket'
      else if (gitRemote.includes('gitlab')) gitHost = 'gitlab'
    } catch {}
  }

  return {
    cwd,
    isGitRepo,
    workspace,
    gitRemote,
    gitHost
  }
}
