import os from 'os'
import fs from 'fs-extra'
import chalk from 'chalk'
import { execa } from 'execa'

import { config } from '../../core/config.js'
import { log } from '../../core/logger.js'
import { DoctorCheck } from '../../core/types.js'

export default async function doctor(name?: string) {
  let targetName = name;
  const workspaces = config.get('workspaces');

  // Auto-detection logic (similar to above)
  if (!targetName) {
    const { stdout: remote } = await execa('git', ['remote', 'get-url', 'origin']).catch(() => ({ stdout: '' }));
    const namespace = remote.replace(/.*[:\/](.*)\/.*$/, '$1').replace(/.*[:\/]/, '').trim();
    targetName = Object.keys(workspaces).find(k => workspaces[k].orgs?.some((org: string) => namespace.includes(org)));
  }

  if (!targetName || !workspaces[targetName]) {
    log.error(`Could not identify workspace. Use: gw workspace doctor <name>`);
    return;
  }

  const ws = workspaces[targetName];
  const checks: DoctorCheck[] = [];

  // Check 1: SSH Key existence
  const keyPath = ws.sshKey.replace('~', os.homedir());
  const keyExists = fs.existsSync(keyPath);
  checks.push({
    id: 'ssh-key-exists',
    label: 'SSH Key File',
    status: keyExists ? 'ok' : 'error',
    message: keyExists ? 'File found' : 'File missing',
    hint: `Path: ${ws.sshKey}`
  });

  // Check 2: Permissions
  if (keyExists) {
    const stats = fs.statSync(keyPath);
    const isCorrectPerms = (stats.mode & 0o777) === 0o600;
    checks.push({
      id: 'ssh-key-perms',
      label: 'Key Permissions',
      status: isCorrectPerms ? 'ok' : 'warn',
      message: isCorrectPerms ? '600 OK' : 'Permissions too open',
      fix: `chmod 600 ${ws.sshKey}`
    });
  }

  // Check 3: Authentication Test
  const host = ws.provider === 'bitbucket' ? 'bitbucket.org' : 'github.com';
  const { stderr, stdout } = await execa('ssh', ['-T', `git@${host}`, '-i', keyPath, '-o', 'BatchMode=yes'], { reject: false });
  const authOk = (stderr + stdout).includes('successfully authenticated') || (stderr + stdout).includes('authenticated via');
  
  checks.push({
    id: 'ssh-auth',
    label: `Auth to ${host}`,
    status: authOk ? 'ok' : 'error',
    message: authOk ? 'Success' : 'Rejected'
  });

  renderChecks(targetName, checks);
}

function renderChecks(title: string, checks: DoctorCheck[]) {
  log.info(chalk.bold(`\n🩺 Doctor: ${title}`));
  log.info('-------------------------------------------');
  
  checks.forEach(c => {
    const icon = c.status === 'ok' ? chalk.green('✔') : c.status === 'warn' ? chalk.yellow('⚠') : chalk.red('✘');
    log.info(`${icon} ${chalk.bold(c.label.padEnd(20))} ${c.message || ''}`);
    if (c.hint) log.info(`   ${chalk.dim('Hint: ' + c.hint)}`);
    if (c.fix) log.info(`   ${chalk.cyan('Fix:  ' + c.fix)}`);
  });
  log.info('');
}
