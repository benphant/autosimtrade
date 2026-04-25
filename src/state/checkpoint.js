import { appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function saveCheckpoint(runDir, checkpoint) {
  const data = {
    time: new Date().toISOString(),
    ...checkpoint
  };
  await writeFile(join(runDir, 'checkpoint.json'), JSON.stringify(data, null, 2), 'utf8');
  await appendFile(join(runDir, 'events.jsonl'), `${JSON.stringify({ type: 'checkpoint', ...data })}\n`, 'utf8');
}

export async function appendEvent(runDir, event) {
  const data = {
    time: new Date().toISOString(),
    ...event
  };
  await appendFile(join(runDir, 'events.jsonl'), `${JSON.stringify(data)}\n`, 'utf8');
}
