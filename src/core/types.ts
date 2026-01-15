export type Workspace = {
  name: string
  userName: string
  userEmail: string
  provider: string
  sshKey: string
  orgs?: string[]
}

export type WorkspaceConfig = {
  workspaces: Record<string, Workspace>
}

export type StateConfig = {
  activeWorkspace: string | null
}

export type GuardContext = {
  workspace: Workspace | null
  isGitRepo: boolean
  cwd: string
  gitRemote?: string
  gitHost?: 'github' | 'bitbucket' | 'gitlab' | 'unknown'
}
