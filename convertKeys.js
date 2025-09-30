const fs = require('fs');
const key = fs.readFileSync('./forum-x-auth-firebase-admin-key.json', 'utf8')
const base64 = Buffer.from(key).toString('base64')
