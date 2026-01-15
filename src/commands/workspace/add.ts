import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import prompts from 'prompts'
import chalk from 'chalk'

import { GW_SSH_CONFIG } from '../../core/constants.js'
import { config } from '../../core/config.js'

// Map providers to their actual domain names
const PROVIDER_DOMAINS = {
  github: 'github.com',
  gitlab: 'gitlab.com',
  bitbucket: 'bitbucket.org'
}

export default async function add() {
  console.log(chalk.cyan('\n➕ Add new workspace (identity)\n'))

  const questions: prompts.PromptObject[] = [
    {
      type: 'text',
      name: 'name',
      message: 'Workspace name (e.g. personal, work):',
      validate: (v: string) => v ? true : 'Workspace name is required'
    },
    {
      type: 'select',
      name: 'provider',
      message: 'Select Git provider:',
      choices: [
        { title: 'GitHub', value: 'github' },
        { title: 'GitLab', value: 'gitlab' },
        { title: 'Bitbucket', value: 'bitbucket' }
      ]
    },
    {
      type: 'text',
      name: 'userName',
      message: 'Git user.name:',
      initial: 'John Doe',
      validate: (v: string) => v ? true : 'Git user.name is required'
    },
    {
      type: 'text',
      name: 'userEmail',
      message: 'Git user.email:',
      validate: (v: string) => v.includes('@') ? true : 'Valid email is required'
    },
    {
      type: 'text',
      name: 'orgs',
      message: 'Enter organization keywords (comma separated):',
      validate: (v: string) => v ? true : 'At least one organization keyword is required'
    },
    {
      type: 'text',
      name: 'sshKey',
      message: 'Path to SSH key:',
      initial: (prev, values) => `~/.ssh/id_rsa_${values.name}`,
      validate: (v: string) => v ? true : 'SSH key path is required'
    }
  ]

  const response = await prompts(questions, {
    onCancel: () => {
      console.log(chalk.yellow('\n⚠️  Workspace creation cancelled.\n'))
      process.exit(0)
    }
  })

  const workspaces = config.get('workspaces') || {}

  if (workspaces[response.name]) {
    console.log(chalk.red(`\n❌ Workspace "${response.name}" already exists.\n`))
    return
  }

  // 1. Update the actual SSH Config file
  const domain = PROVIDER_DOMAINS[response.provider as keyof typeof PROVIDER_DOMAINS]

  // 2. Save to our JSON config
  const workspace = {
    provider: response.provider,
    userName: response.userName,
    userEmail: response.userEmail,
    sshKey: response.sshKey,
    // We store the alias name so we can reference it later
    sshAlias: `gw-${response.name}`,
    orgs: `gw-${response.orgs}` 
  }

  workspaces[response.name] = workspace
  config.set('workspaces', workspaces)

  console.log(chalk.green('\n✅ Workspace saved and SSH alias created\n'))
  console.log(chalk.dim(`Alias: ${workspace.sshAlias} -> ${domain}\n`))
}
