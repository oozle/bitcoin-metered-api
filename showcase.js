#!/usr/bin/env node

// Simple Node.js showcase script to demonstrate the Bitcoin Metered API
// This simulates what an AI agent would do

const baseUrl = 'http://localhost:3000';

async function getQuote(endpoint, units) {
  const params = new URLSearchParams({ endpoint, ...units });
  const response = await fetch(`${baseUrl}/v1/quote?${params}`);
  return response.json();
}

async function payCall(quote, args) {
  const response = await fetch(`${baseUrl}/v1/paycall`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `demo-${Date.now()}`,
    },
    body: JSON.stringify({
      quote_id: quote.quote_id,
      ark_payment: {
        vtxo_spend: 'ZGVtby12dHhvLXNwZW5kLWRhdGE=', // demo VTXO spend
        proof: 'ZGVtby1wcm9vZi1kYXRh', // demo proof
        sender_pubkey: 'ark1qdemo12345678', // demo sender
      },
      request: {
        endpoint: quote.endpoint,
        args,
      },
    }),
  });

  return response.json();
}

async function demo() {
  console.log('🚀 Bitcoin Metered API Demo\n');
  console.log('This demonstrates pay-per-request API calls using Bitcoin L2 (Arkade)\n');

  try {
    // 1. Summarize
    console.log('1️⃣ Testing Text Summarization');
    const summaryQuote = await getQuote('summarize', { tokens: 1000 });
    console.log(`   💰 Quote: ${summaryQuote.price_sats} sats for ${summaryQuote.units.tokens} tokens`);
    
    const summaryResult = await payCall(summaryQuote, {
      text: 'Bitcoin is a decentralized digital currency that enables peer-to-peer transactions without the need for trusted intermediaries like banks. It uses blockchain technology to maintain a public ledger of all transactions.',
    });
    console.log(`   📝 Summary: ${summaryResult.result.summary}`);
    console.log(`   🧾 Receipt: ${summaryResult.receipt.settlement_ref}\n`);

    // 2. Image Generation
    console.log('2️⃣ Testing Image Generation');
    const imageQuote = await getQuote('generate_image', { images: 1 });
    console.log(`   💰 Quote: ${imageQuote.price_sats} sats for ${imageQuote.units.images} image(s)`);
    
    const imageResult = await payCall(imageQuote, {
      prompt: 'Bitcoin logo with futuristic background',
      width: 512,
      height: 512,
    });
    console.log(`   🖼️ Generated: ${imageResult.result.image_url}`);
    console.log(`   🧾 Receipt: ${imageResult.receipt.settlement_ref}\n`);

    // 3. Translation
    console.log('3️⃣ Testing Translation');
    const translateQuote = await getQuote('translate', { characters: 100 });
    console.log(`   💰 Quote: ${translateQuote.price_sats} sats for ${translateQuote.units.characters} characters`);
    
    const translateResult = await payCall(translateQuote, {
      text: 'Hello, Bitcoin world!',
      from: 'en',
      to: 'es',
    });
    console.log(`   🔄 Translation: ${translateResult.result.translated}`);
    console.log(`   🧾 Receipt: ${translateResult.receipt.settlement_ref}\n`);

    // 4. Compute
    console.log('4️⃣ Testing Computation');
    const computeQuote = await getQuote('compute', { seconds: 1 });
    console.log(`   💰 Quote: ${computeQuote.price_sats} sats for ${computeQuote.units.seconds} second(s)`);
    
    const computeResult = await payCall(computeQuote, {
      operation: 'square',
      value: 42,
    });
    console.log(`   🧮 Result: ${computeResult.result.input}² = ${computeResult.result.output}`);
    console.log(`   🧾 Receipt: ${computeResult.receipt.settlement_ref}\n`);

    console.log('✅ All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   • Pay-per-request pricing ✓');
    console.log('   • Instant Bitcoin L2 payments ✓');
    console.log('   • Cryptographic receipts ✓');
    console.log('   • Multiple AI endpoints ✓');
    console.log('   • Agent-friendly API ✓');
    console.log('\n🤖 Ready for autonomous AI agent integration!');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    console.log('💡 Make sure the API server is running: npm run dev');
    process.exit(1);
  }
}

// Check if server is running first
async function checkHealth() {
  try {
    const response = await fetch(`${baseUrl}/health`);
    const health = await response.json();
    console.log(`🏥 API Health: ${health.status} (${health.payments_mode} mode)\n`);
    return true;
  } catch (error) {
    console.log('⚠️  API server not responding. Starting demo with curl examples instead...\n');
    return false;
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  checkHealth().then(healthy => {
    if (healthy) {
      demo();
    } else {
      console.log('📖 To run this demo:');
      console.log('   1. Start the server: npm run dev');
      console.log('   2. Run this script: node showcase.js');
      console.log('   3. Or use curl:');
      console.log('      curl "http://localhost:3000/v1/quote?endpoint=summarize&tokens=1000"');
    }
  });
}