import fs from 'fs-extra'
import os from 'os'
import path from 'path'

export const GW_DIR = path.join(os.homedir(), '.gw')
export const GW_SSH_CONFIG = path.join(GW_DIR, 'ssh_config')
export const SSH_CONFIG_PATH = path.join(os.homedir(), '.ssh/config')
export const ACTIVE_KEY_SYMLINK = path.join(GW_DIR, 'active_key');
