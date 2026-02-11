const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Response Status:', res.statusCode);
    console.log('Response Body:', data);
    process.exit(0);
  });
});

req.on('error', (error) => {
  console.error('Request error:', error.message);
  process.exit(1);
});

const body = JSON.stringify({ message: 'Who made you?' });
req.write(body);
req.end();

setTimeout(() => {
  console.error('Request timeout');
  process.exit(1);
}, 5000);
