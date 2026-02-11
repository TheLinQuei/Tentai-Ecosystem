#!/usr/bin/env node

/**
 * Simple test script to verify Sovereign is working
 * Run: node test-sovereign.js
 */

const http = require('http');

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: body ? JSON.parse(body) : body,
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            body: body,
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing Sovereign...\n');

  // Test 1: Health check
  console.log('TEST 1: Health Endpoint');
  console.log('------------------------');
  try {
    const result = await makeRequest('GET', '/health');
    console.log(`✅ Status: ${result.statusCode}`);
    console.log(`Response:`, JSON.stringify(result.body, null, 2));
  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
  }

  console.log('\n');

  // Test 2: Chat endpoint with message
  console.log('TEST 2: Chat Endpoint');
  console.log('---------------------');
  try {
    const result = await makeRequest('POST', '/api/chat', { message: 'Hello Vi!' });
    console.log(`✅ Status: ${result.statusCode}`);
    if (result.statusCode === 200) {
      console.log(`Output: ${result.body.output}`);
      console.log(`Record ID: ${result.body.recordId}`);
      console.log(`Session ID: ${result.body.sessionId}`);
    } else {
      console.log(`Response:`, JSON.stringify(result.body, null, 2));
    }
  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
  }

  console.log('\n');

  // Test 3: Invalid request
  console.log('TEST 3: Invalid Request (empty message)');
  console.log('---------------------------------------');
  try {
    const result = await makeRequest('POST', '/api/chat', { message: '' });
    console.log(`✅ Status: ${result.statusCode}`);
    console.log(`Response:`, JSON.stringify(result.body, null, 2));
  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
  }

  console.log('\n🎯 Tests complete!');
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
