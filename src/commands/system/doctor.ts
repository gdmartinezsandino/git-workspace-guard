import os from 'os'
import fs from 'fs-extra'
import path from 'path'
import chalk from 'chalk'
import { execa } from 'execa'

import { log } from '../../core/logger.js'
import { DoctorCheck } from '../../core/types.js'

export default async function doctor() {
  const checks: DoctorCheck[] = [];

  // 1. Binary checks
  const hasGit = await execa('git', ['--version']).then(() => true).catch(() => false);
  checks.push({ id: 'git-bin', label: 'Git Binary', status: hasGit ? 'ok' : 'error' });

  // 2. SSH Agent
  const hasAgent = !!process.env.SSH_AUTH_SOCK;
  checks.push({ 
    id: 'ssh-agent', 
    label: 'SSH Agent', 
    status: hasAgent ? 'ok' : 'warn',
    message: hasAgent ? 'Running' : 'Not detected in current shell environment'
  });

  // 3. Hooks Path Configuration
  const { stdout: hooksPath } = await execa('git', ['config', '--global', 'core.hooksPath']).catch(() => ({ stdout: '' }));
  const expectedPath = path.join(os.homedir(), '.gw/hooks');
  checks.push({
    id: 'hooks-config',
    label: 'Git Hooks Path',
    status: hooksPath.trim() === expectedPath ? 'ok' : 'error',
    fix: 'gw system init'
  });

  // 4. Guard Script
  const guardExists = fs.existsSync(path.join(os.homedir(), '.gw/guard.sh'));
  checks.push({
    id: 'guard-script',
    label: 'Guard Engine',
    status: guardExists ? 'ok' : 'error',
    message: guardExists ? 'Ready' : 'guard.sh is missing'
  });

  renderChecks('System Environment', checks);
}

function renderChecks(title: string, checks: DoctorCheck[]) {
  log.title(chalk.bold(`\n🩺 Doctor: ${title}`));
  log.title('-------------------------------------------');
  
  checks.forEach(c => {
    const icon = c.status === 'ok' ? chalk.green('✔') : c.status === 'warn' ? chalk.yellow('⚠') : chalk.red('✘');
    log.info(`${icon} ${chalk.bold(c.label.padEnd(20))} ${c.message || ''}`);
    if (c.hint) log.info(`   ${chalk.dim('Hint: ' + c.hint)}`);
    if (c.fix) log.success(`   ${chalk.cyan('Fix:  ' + c.fix)}`);
  });
  log.info('');
}
