import crypto from 'node:crypto';

const code = process.argv.slice(2).join(' ').trim();

if (!code) {
  console.error('Usage: node scripts/hash-access-code.js "your access code"');
  process.exit(1);
}

const hash = crypto.createHash('sha256').update(code, 'utf8').digest('hex');

console.log(hash);
