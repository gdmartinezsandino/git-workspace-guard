export type Workspace = {
  name: string
  userName: string
  userEmail: string
  provider: string
  sshKey: string
  sshAlias?: string
  orgs?: string[]
  // API token per provider (all use Bearer auth):
  //   GitHub:    Personal Access Token (repo scope)    → e.g. ghp_xxxx
  //   GitLab:    Personal Access Token (api scope)     → e.g. glpat-xxxx
  //   Bitbucket: API token (bitbucket.org → Personal settings → API tokens)
  token?: string
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

export type DoctorStatus = 'ok' | 'warn' | 'error'
export type DoctorCheck = {
  id: string
  label: string
  status: DoctorStatus
  message?: string
  hint?: string
  fix?: string
}
