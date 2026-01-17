import os from 'os'
import path from 'path'
import prompts from 'prompts'

export const GW_DIR = path.join(os.homedir(), '.gw')
export const GW_SSH_CONFIG = path.join(GW_DIR, 'ssh_config')
export const SSH_CONFIG_PATH = path.join(os.homedir(), '.ssh/config')
export const ACTIVE_KEY_SYMLINK = path.join(GW_DIR, 'active_key');

export const questions: prompts.PromptObject[] = [
  {
    type: 'text',
    name: 'name',
    message: 'Workspace name (e.g. personal, work):',
    validate: (v: string) => v ? true : 'Workspace name is required', 
  },
  {
    type: 'select',
    name: 'provider',
    message: 'Select Git provider:',
    choices: [
      { title: 'GitHub', value: 'github' },
      { title: 'GitLab', value: 'gitlab' },
      { title: 'Bitbucket', value: 'bitbucket' }
    ],
    initial: 'GitHub', 
    validate: (v: string) => v ? true : 'Git Provider is required',
  },
  {
    type: 'text',
    name: 'userName',
    message: 'Git user.name:',
    initial: 'John Doe', 
    validate: (v: string) => v ? true : 'Git user.name is required', 
  },
  {
    type: 'text',
    name: 'userEmail',
    message: 'Git user.email:',
    initial: 'john.doe@mail.com', 
    validate: (v: string) => v.includes('@') ? true : 'Valid email is required', 
  },
  {
    type: 'text',
    name: 'orgs',
    message: 'Enter organization keywords (comma separated):',
    validate: (v: string) => v ? true : 'At least one organization keyword is required', 
  },
  {
    type: 'text',
    name: 'sshKey',
    message: 'Path to SSH key:',
    initial: '~/keys/id_rsa', 
    validate: (v: string) => v ? true : 'SSH key path is required', 
  }
];
