import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planRounds } from './scheduler.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const guide = JSON.parse(await readFile(join(root, 'src', 'guide', 'guide-spec.json'), 'utf8'));
const state = JSON.parse(await readFile(join(root, 'data', 'profiles', 'account-state.json'), 'utf8'));
const accounts = process.argv.slice(2);
const plan = planRounds({ guide, state, accounts, rounds: Number(process.env.ROUNDS || 3) });
console.log(JSON.stringify(plan, null, 2));
