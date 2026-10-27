// Multi-turn conversation simulation test for SUSI Hybrid Voice Engine
const http = require('http');

async function sendTurn(prompt, history) {
  const payload = JSON.stringify({
    prompt,
    history,
    mode: 'offline'
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
            reject(new Error(`Failed to parse: ${body}`));
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
  console.log('====================================================');
  console.log('--- STARTING MULTI-TURN CONVERSATION STRESS TEST ---');
  console.log('====================================================\n');

  const history = [];

  const conversationSteps = [
    {
      step: 1,
      prompt: 'Namaste! Mera naam Aman Sharma hai aur main ek software engineer hoon.',
      expectedDesc: 'Introduction & greeting in Hindi',
    },
    {
      step: 2,
      prompt: 'Mera naam kya hai jo maine abhi bataya tha?',
      expectedDesc: 'Multi-turn memory context recall test (Should know user name is Aman)',
    },
    {
      step: 3,
      prompt: 'Ek naya task banao: Optimize Postgres Database Indexing',
      expectedDesc: 'Task creation action extraction without dirty prefixes',
    },
    {
      step: 4,
      prompt: 'System ka CPU and RAM status kya hai?',
      expectedDesc: 'System health & telemetry query',
    },
    {
      step: 5,
      prompt: 'Ek component file create kar do: UserProfileCard.tsx',
      expectedDesc: 'Local workspace file generation action',
    },
  ];

  for (const item of conversationSteps) {
    console.log(`\n[Turn ${item.step}] User: "${item.prompt}"`);
    console.log(`[Expectation]: ${item.expectedDesc}`);

    const startTime = Date.now();
    try {
      const response = await sendTurn(item.prompt, history);
      const elapsed = Date.now() - startTime;

      console.log(`[Turn ${item.step} Reply] (${elapsed}ms) Mode: [${response.modeUsed}] Agent: [${response.assignedAgent}]`);
      console.log(`  Assistant: "${response.replyText}"`);

      if (response.action && response.action.type !== 'CHAT_REPLY') {
        console.log(`  Action Dispatched:`, JSON.stringify(response.action));
      }

      // Append to history for next turns
      history.push({ role: 'user', content: item.prompt });
      history.push({ role: 'assistant', content: response.replyText });
    } catch (err) {
      console.error(`  Error in Turn ${item.step}:`, err.message);
    }
  }

  console.log('\n====================================================');
  console.log('--- MULTI-TURN TEST COMPLETED SUCCESSFULLY ---');
  console.log('====================================================');
}

runTest();
