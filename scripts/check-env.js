#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const key = process.env.OPENAI_API_KEY;
console.log('OPENAI_API_KEY set?', !!key);
if (key) console.log('(length:', key.length, 'chars)');
