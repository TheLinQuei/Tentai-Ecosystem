#!/usr/bin/env node

/**
 * Test Vi directly (without Sovereign)
 * Run: node test-vi-direct.js
 */

import http from 'http';

function testChat(message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ message });
    
    const options = {
      hostname: 'localhost',
      port: 3100,
      path: '/v1/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(body),
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            body: body,
            error: e.message,
          });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing Vi Direct API...\n');

  const tests = [
    {
      name: 'Basic Chat',
      message: 'Hello Vi, this is a test',
    },
    {
      name: 'Name Extraction',
      message: 'My nickname is Kaelan',
    },
    {
      name: 'Name Recall',
      message: "What's my nickname?",
    },
    {
      name: 'Self Model Probe',
      message: "What's your deal? Give me your stance.",
    },
    {
      name: 'Relational Probe',
      message: 'Who am I to you?',
    },
    {
      name: 'Banned Phrase Test',
      message: 'Close this out without saying things like "let me know" or "anything else I can help"',
    },
  ];

  for (const test of tests) {
    console.log(`TEST: ${test.name}`);
    console.log('=' .repeat(60));
    console.log(`Prompt: "${test.message}"`);
    
    try {
      const result = await testChat(test.message);
      
      if (result.statusCode === 200) {
        console.log(`✅ Status: ${result.statusCode}`);
        console.log(`\nResponse:\n${result.body.output}\n`);
        console.log(`RecordId: ${result.body.recordId}`);
        console.log(`SessionId: ${result.body.sessionId}`);
        
        // Check for banned phrases
        const bannedPhrases = [
          'let me know',
          'feel free to ask',
          'how can I help',
          "I'm sorry to hear",
          'anything else I can help',
        ];
        
        const violations = bannedPhrases.filter(phrase => 
          result.body.output.toLowerCase().includes(phrase.toLowerCase())
        );
        
        if (violations.length > 0) {
          console.log(`\n⚠️  BANNED PHRASE VIOLATIONS: ${violations.join(', ')}`);
        }
      } else {
        console.log(`❌ Status: ${result.statusCode}`);
        console.log(`Error: ${JSON.stringify(result.body, null, 2)}`);
      }
    } catch (err) {
      console.log(`❌ Request Failed: ${err.message}`);
    }
    
    console.log('\n');
    
    // Wait between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('🎯 Tests complete!');
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
