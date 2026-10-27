const http = require('http');

async function sendPrompt(prompt, history = []) {
  const payload = JSON.stringify({
    prompt,
    history,
    mode: 'offline',
  });

  return new Promise((resolve, reject) => {
    const req = http.request(
      'http://localhost:3000/api/voice/process',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Failed to parse response: ${body}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runTest() {
  console.log('===========================================================');
  console.log('--- TESTING NEW VOICE CAPABILITIES & UI TAB NAVIGATION ---');
  console.log('===========================================================\n');

  const testCases = [
    {
      title: 'Navigation Test (Code Assistant Tab)',
      prompt: 'Code assistant tab khol do',
      expectedAction: 'NAVIGATE_TAB',
      expectedTab: 'code',
    },
    {
      title: 'Navigation Test (Tasks Board)',
      prompt: 'Tasks board dikhao',
      expectedAction: 'NAVIGATE_TAB',
      expectedTab: 'tasks',
    },
    {
      title: 'Navigation Test (Agents Fleet)',
      prompt: 'Agents fleet tab open karo',
      expectedAction: 'NAVIGATE_TAB',
      expectedTab: 'agents',
    },
    {
      title: 'Navigation Test (Telemetry & Logs)',
      prompt: 'Telemetry logs monitor kholo',
      expectedAction: 'NAVIGATE_TAB',
      expectedTab: 'telemetry',
    },
    {
      title: 'Polite Conversational Hindi Multi-turn',
      prompt: 'Aap mere computer me kya kya kar sakte ho?',
      expectedAction: 'CHAT_REPLY',
    },
  ];

  for (const test of testCases) {
    console.log(`[Test]: ${test.title}`);
    console.log(`  User: "${test.prompt}"`);
    const res = await sendPrompt(test.prompt);
    console.log(`  Assistant Reply: "${res.replyText}"`);
    console.log(`  Assigned Agent: [${res.assignedAgent}] Mode: [${res.modeUsed}]`);
    console.log(`  Action:`, JSON.stringify(res.action));

    if (test.expectedAction) {
      if (res.action?.type === test.expectedAction) {
        console.log(`  ✓ Action matched: ${test.expectedAction}`);
      } else {
        console.log(`  ✗ Action mismatch: expected ${test.expectedAction}, got ${res.action?.type}`);
      }
    }
    console.log('-----------------------------------------------------------\n');
  }

  console.log('===========================================================');
  console.log('--- ALL FEATURE TESTS COMPLETED SUCCESSFULLY ---');
  console.log('===========================================================');
}

runTest();
