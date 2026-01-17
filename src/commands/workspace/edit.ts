import prompts from 'prompts'
import chalk from 'chalk'

import { config } from '../../core/config.js'
import { questions } from '../../core/constants.js'
import { log } from '../../core/logger.js'

export default async function edit(name: string) {
  const workspaces = config.get('workspaces')
  const workspaceSelected = workspaces[name]

  // 1. Validate workspace existence
  if (!workspaceSelected) return log.error('Not found')

  // 2. Prepare questions with initial values
  const questionsProcessed: prompts.PromptObject[] = questions.map((question: prompts.PromptObject) => {
    let initialValue: any = undefined;

    switch (question.name) {
      case 'name':
        // The name is the 'key' we passed to the function
        initialValue = name; 
        break;

      case 'provider':
        // 'select' type in prompts uses the index of the choice for 'initial'
        // We need to find the index of the current provider
        const providerChoices = ['github', 'gitlab', 'bitbucket'];
        initialValue = providerChoices.indexOf(workspaceSelected.provider);
        break;

      case 'orgs':
        initialValue = workspaceSelected.orgs ? workspaceSelected.orgs.join(', ') : '';
        break;

      default:
        // Access existing properties
        initialValue = workspaceSelected[question.name as keyof typeof workspaceSelected];
    }

    return {
      ...question,
      initial: initialValue,
    };
  });

  // 3. Prompt the user for input, and handle cancellation
  const response = await prompts(questionsProcessed, {
    // onCancel: () => {
    //   log.title(chalk.yellow('\n⚠️  Workspace edition cancelled.\n'))
    //   process.exit(0)
    // }
  })

  const workspaceUpdated = { 
    ...workspaceSelected, 
    ...response, 
    orgs: response.orgs.split(',').map((name: string) => name.trim()) 
  };

  // 4. Save updated workspace
  const newName = response.name;
  const updatedWorkspaces = { ...workspaces };

  // If the name changed, remove the old one
  if (newName !== name) {
    delete updatedWorkspaces[name];
  }

  updatedWorkspaces[newName] = workspaceUpdated;

  config.set('workspaces', updatedWorkspaces);

  log.title(`✅ Workspace "${name}" updated.`);
}
