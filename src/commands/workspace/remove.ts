import prompts from 'prompts'

import { config } from '../../core/config.js'

export default async function remove(name: string) {
  const workspaces = config.get('workspaces');
  const workspaceSelected = workspaces[name]

  // 1. Validate workspace existence
  if (!workspaceSelected) return console.error('Not found')
  
  // 2. Confirm deletion
  const questionsProcessed: prompts.PromptObject[] = [
    {
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to delete "${name}"?`,
      initial: false
    }
  ]

  // 3. Prompt for confirmation
  const { confirm } = await prompts(questionsProcessed, {
    onCancel: () => {
      console.log('\n⚠️  Workspace removal cancelled.\n')
      process.exit(0)
    }
  })

  // 4. Remove workspace if confirmed
  if (confirm) {
    delete workspaces[name];
    config.set('workspaces', workspaces);
    console.log(`🗑️  Workspace "${name}" removed.`);
  }
}
