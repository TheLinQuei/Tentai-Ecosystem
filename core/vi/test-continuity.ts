import fetch from 'node-fetch';
import { randomUUID } from 'crypto';

const sessionId = randomUUID();
const userId = 'test-user-' + randomUUID();

async function chat(message: string) {
  const response = await fetch('http://localhost:3000/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      sessionId,
      context: {},
    }),
  });

  const data = await response.json() as any;
  console.log(`\n→ USER: ${message}`);
  console.log(`← ASST: ${data.output}`);
  return data;
}

(async () => {
  try {
    console.log(`[TEST] Session: ${sessionId}\n`);
    
    // Turn 1
    await chat('My codename is RAVENSTONE');
    
    // Turn 2: Ask for codename to test continuity
    await chat('What is my codename?');
    
  } catch (error) {
    console.error('Error:', error);
  }
  process.exit(0);
})();
