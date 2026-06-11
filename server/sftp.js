import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import SftpClient from 'ssh2-sftp-client';

function isSaveFile(entry) {
  return entry.type === '-' && entry.name.toLowerCase().endsWith('.sav');
}

function joinRemote(directory, name) {
  return `${directory.replace(/\/$/, '')}/${name}`;
}

export async function downloadNewestSave(connection) {
  const sftp = new SftpClient();
  await sftp.connect({
    host: connection.host,
    port: connection.port,
    username: connection.username,
    password: connection.password,
    readyTimeout: 30000,
  });

  try {
    const entries = await sftp.list(connection.remoteDir);
    const saves = entries.filter(isSaveFile).sort((a, b) => b.modifyTime - a.modifyTime);
    if (!saves.length) {
      throw new Error(`No .sav files found in ${connection.remoteDir}`);
    }

    const newest = saves[0];
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sat-save-'));
    const localPath = path.join(tmpDir, newest.name);
    const remotePath = joinRemote(connection.remoteDir, newest.name);
    await sftp.fastGet(remotePath, localPath);

    return {
      name: newest.name,
      remotePath,
      localPath,
      bytes: newest.size,
      modifiedAt: new Date(newest.modifyTime).toISOString(),
      cleanup: async () => fs.rm(tmpDir, { recursive: true, force: true }),
    };
  } finally {
    await sftp.end();
  }
}
