#!/usr/bin/env tsx

import { Command } from 'commander';
import { nanoid } from 'nanoid';

interface QuoteResponse {
  endpoint: string;
  units: Record<string, number>;
  price_sats: number;
  expires_at: string;
  quote_id: string;
  ark: {
    asp_url: string;
    receiver_pubkey: string;
    round_hint: string;
  };
}

interface PayCallResponse {
  status: string;
  result: any;
  receipt: {
    settlement_ref: string;
    paid_sats: number;
    job_id: string;
    payment_id: string;
  };
}

class BitcoinMeteredClient {
  constructor(private baseUrl: string) {}

  async getQuote(endpoint: string, units: Record<string, number>): Promise<QuoteResponse> {
    const params = new URLSearchParams({
      endpoint,
      ...Object.fromEntries(Object.entries(units).map(([k, v]) => [k, v.toString()])),
    });

    const response = await fetch(`${this.baseUrl}/v1/quote?${params}`);
    if (!response.ok) {
      throw new Error(`Quote request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async payCall(
    quoteId: string,
    endpoint: string,
    args: Record<string, any>,
    idempotencyKey?: string
  ): Promise<PayCallResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const response = await fetch(`${this.baseUrl}/v1/paycall`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        quote_id: quoteId,
        ark_payment: {
          vtxo_spend: 'ZGVtby12dHhvLXNwZW5kLWRhdGE=', // demo VTXO spend
          proof: 'ZGVtby1wcm9vZi1kYXRh', // demo proof
          sender_pubkey: 'ark1qdemo12345678', // demo sender
        },
        request: {
          endpoint,
          args,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`PayCall failed: ${response.status} ${response.statusText}\n${errorBody}`);
    }

    return response.json();
  }

  async callAPI(
    endpoint: string,
    units: Record<string, number>,
    args: Record<string, any>
  ): Promise<PayCallResponse> {
    // 1. Get quote
    console.log(`📊 Getting quote for ${endpoint}...`);
    const quote = await this.getQuote(endpoint, units);
    console.log(`💰 Price: ${quote.price_sats} sats`);
    console.log(`⏰ Expires: ${quote.expires_at}`);

    // 2. Pay and call
    console.log(`🔄 Executing payment and API call...`);
    const idempotencyKey = `demo-${Date.now()}-${nanoid(8)}`;
    const result = await this.payCall(quote.quote_id, endpoint, args, idempotencyKey);

    console.log(`✅ Success!`);
    console.log(`📄 Receipt: ${result.receipt.settlement_ref}`);
    console.log(`💸 Paid: ${result.receipt.paid_sats} sats`);

    return result;
  }
}

const program = new Command();
program
  .name('bitcoin-metered-cli')
  .description('Demo CLI client for Bitcoin Metered API')
  .option('-u, --url <url>', 'API base URL', 'http://localhost:3000');

program
  .command('summarize')
  .description('Summarize text')
  .argument('<text>', 'Text to summarize')
  .option('-t, --tokens <tokens>', 'Number of tokens', '1000')
  .action(async (text: string, options) => {
    try {
      const client = new BitcoinMeteredClient(program.opts().url);
      const result = await client.callAPI(
        'summarize',
        { tokens: parseInt(options.tokens) },
        { text }
      );

      console.log('\n📝 Summary:');
      console.log(result.result.summary);
      console.log(`\n📊 Stats: ${result.result.tokens_processed} tokens processed`);
    } catch (error) {
      console.error('❌ Error:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('image')
  .description('Generate image')
  .argument('<prompt>', 'Image prompt')
  .option('-w, --width <width>', 'Image width', '512')
  .option('-h, --height <height>', 'Image height', '512')
  .action(async (prompt: string, options) => {
    try {
      const client = new BitcoinMeteredClient(program.opts().url);
      const result = await client.callAPI(
        'generate_image',
        { images: 1 },
        {
          prompt,
          width: parseInt(options.width),
          height: parseInt(options.height),
        }
      );

      console.log('\n🖼️ Generated Image:');
      console.log(`URL: ${result.result.image_url}`);
      console.log(`Dimensions: ${result.result.dimensions.width}x${result.result.dimensions.height}`);
    } catch (error) {
      console.error('❌ Error:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('translate')
  .description('Translate text')
  .argument('<text>', 'Text to translate')
  .option('-f, --from <lang>', 'Source language', 'en')
  .option('-t, --to <lang>', 'Target language', 'es')
  .action(async (text: string, options) => {
    try {
      const client = new BitcoinMeteredClient(program.opts().url);
      const result = await client.callAPI(
        'translate',
        { characters: text.length },
        {
          text,
          from: options.from,
          to: options.to,
        }
      );

      console.log('\n🔄 Translation:');
      console.log(`Original (${options.from}): ${result.result.original}`);
      console.log(`Translated (${options.to}): ${result.result.translated}`);
      console.log(`📊 Characters: ${result.result.characters_processed}`);
    } catch (error) {
      console.error('❌ Error:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('compute')
  .description('Perform computation')
  .argument('<operation>', 'Operation (square, sqrt, double)')
  .argument('<value>', 'Input value')
  .option('-s, --seconds <seconds>', 'Processing seconds', '1')
  .action(async (operation: string, value: string, options) => {
    try {
      const client = new BitcoinMeteredClient(program.opts().url);
      const result = await client.callAPI(
        'compute',
        { seconds: parseInt(options.seconds) },
        {
          operation,
          value: parseFloat(value),
        }
      );

      console.log('\n🧮 Computation Result:');
      console.log(`Operation: ${result.result.operation}`);
      console.log(`Input: ${result.result.input}`);
      console.log(`Output: ${result.result.output}`);
      console.log(`Computed at: ${result.result.computed_at}`);
    } catch (error) {
      console.error('❌ Error:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('health')
  .description('Check API health')
  .action(async () => {
    try {
      const response = await fetch(`${program.opts().url}/health`);
      const health = await response.json();

      console.log('🏥 API Health:');
      console.log(`Status: ${health.status}`);
      console.log(`Payments Mode: ${health.payments_mode}`);
      console.log(`ASP Health: ${health.asp.healthy ? '✅' : '❌'}`);
      console.log(`ASP Latency: ${health.asp.latency_ms}ms`);
      if (health.asp.last_round) {
        console.log(`Last Round: ${health.asp.last_round}`);
      }
    } catch (error) {
      console.error('❌ Error:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('demo')
  .description('Run complete demo of all endpoints')
  .action(async () => {
    const client = new BitcoinMeteredClient(program.opts().url);

    console.log('🚀 Running Bitcoin Metered API Demo\n');

    try {
      // 1. Summarize
      console.log('1️⃣ Testing Summarization...');
      const summaryResult = await client.callAPI(
        'summarize',
        { tokens: 500 },
        {
          text: 'Bitcoin is a decentralized digital currency that enables peer-to-peer transactions without the need for trusted intermediaries like banks. It uses blockchain technology to maintain a public ledger of all transactions.',
        }
      );
      console.log(`   Summary: ${summaryResult.result.summary.substring(0, 100)}...\n`);

      // 2. Image Generation
      console.log('2️⃣ Testing Image Generation...');
      const imageResult = await client.callAPI(
        'generate_image',
        { images: 1 },
        { prompt: 'Bitcoin logo on a futuristic background' }
      );
      console.log(`   Image URL: ${imageResult.result.image_url}\n`);

      // 3. Translation
      console.log('3️⃣ Testing Translation...');
      const translateResult = await client.callAPI(
        'translate',
        { characters: 12 },
        { text: 'Hello world', from: 'en', to: 'es' }
      );
      console.log(`   Translation: ${translateResult.result.translated}\n`);

      // 4. Compute
      console.log('4️⃣ Testing Computation...');
      const computeResult = await client.callAPI(
        'compute',
        { seconds: 1 },
        { operation: 'square', value: 42 }
      );
      console.log(`   Result: ${computeResult.result.input}² = ${computeResult.result.output}\n`);

      console.log('🎉 Demo completed successfully!');
      console.log('\n📊 Summary:');
      console.log('- All endpoints working correctly');
      console.log('- Payments processing in free mode');
      console.log('- Ready for agent integration');
    } catch (error) {
      console.error('❌ Demo failed:', (error as Error).message);
      process.exit(1);
    }
  });

if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}