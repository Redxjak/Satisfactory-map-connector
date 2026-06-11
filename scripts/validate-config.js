import { generateEncryptionKey } from '../server/config.js';

console.log('Configuration files are present.');
console.log('Generate CREDENTIAL_ENCRYPTION_KEY with:');
console.log(generateEncryptionKey());
