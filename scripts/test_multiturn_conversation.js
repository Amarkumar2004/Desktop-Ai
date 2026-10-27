async function runMultiTurnConversationTest() {
  console.log('================================================================');
  console.log('🔄 STARTING MULTI-TURN BACK-TO-BACK CONVERSATION STRESS TEST');
  console.log('================================================================\n');

  const conversationSteps = [
    {
      turn: 1,
      input: 'Namaste SUSI, tum kaun ho aur kya kar sakti ho?',
      type: 'Introduction / Greeting',
    },
    {
      turn: 2,
      input: 'Mera naam Rahul hai, yaad rakhna.',
      type: 'Contextual Memory / User Info',
    },
    {
      turn: 3,
      input: 'Mera naam kya bataya tha maine?',
      type: 'Memory Recall Verification',
    },
    {
      turn: 4,
      input: 'Ek naya task banao: Optimize SQL Database Queries',
      type: 'Task Creation Command',
    },
    {
      turn: 5,
      input: 'Next.js mein Server Components aur Client Components mein kya difference hai?',
      type: 'Technical / Coding Query',
    },
    {
      turn: 6,
      input: 'Aapka system status kaisa hai abhi?',
      type: 'Telemetry / Health Check',
    },
    {
      turn: 7,
      input: 'Ek funny programmer joke sunao',
      type: 'Creative / Casual Query',
    },
  ];

  const results = [];

  for (const step of conversationSteps) {
    const startTime = Date.now();
    console.log(`💬 Turn ${step.turn} [${step.type}]`);
    console.log(`👤 User: "${step.input}"`);

    try {
      const res = await fetch('http://localhost:3000/api/voice/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: step.input }),
      });

      const data = await res.json();
      const elapsed = Date.now() - startTime;

      console.log(`🤖 AI: "${data.replyText}"`);
      console.log(`⚡ Mode: ${data.modeUsed} | ⏱️ Time: ${elapsed}ms | 🎯 Agent: ${data.assignedAgent}`);
      if (data.action?.type !== 'CHAT_REPLY') {
        console.log(`⚙️ Action Triggered:`, JSON.stringify(data.action));
      }
      console.log('----------------------------------------------------------------\n');

      results.push({
        turn: step.turn,
        input: step.input,
        reply: data.replyText,
        elapsed,
        mode: data.modeUsed,
        action: data.action,
      });
    } catch (err) {
      console.error(`❌ Turn ${step.turn} Error:`, err);
    }
  }

  console.log('🏁 MULTI-TURN TEST COMPLETED.');
}

runMultiTurnConversationTest();
