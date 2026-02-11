#!/usr/bin/env node
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/v1/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
};

const body = JSON.stringify({
  message: 'Test message',
});

console.log(`[TEST] Sending POST to ${options.hostname}:${options.port}${options.path}`);

const req = http.request(options, (res) => {
  console.log(`[TEST] Response: ${res.statusCode} ${res.statusMessage}`);
  
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    console.log('[TEST] Body:', data);
    process.exit(res.statusCode === 200 ? 0 : 1);
  });
});

req.on('error', (err) => {
  console.error('[TEST] Error:', err.message);
  process.exit(1);
});

req.write(body);
req.end();

setTimeout(() => {
  console.error('[TEST] Timeout');
  process.exit(1);
}, 5000);
