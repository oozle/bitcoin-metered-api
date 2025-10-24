# Usage Guide

Practical examples for using the Bitcoin Metered API as an AI agent or developer.

## Quick Example: Summarize Text

### 1. Get a Quote

```bash
curl "http://localhost:3000/v1/quote?endpoint=summarize&tokens=1000"
```

Save the `quote_id` from the response.

### 2. Make Payment and Call API

```bash
curl -X POST http://localhost:3000/v1/paycall \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "quote_id": "q_YOUR_QUOTE_ID",
    "ark_payment": {
      "vtxo_spend": "YmFzZTY0ZW5jb2RlZA==",
      "proof": "YmFzZTY0cHJvb2Y=",
      "sender_pubkey": "ark1q..."
    },
    "request": {
      "endpoint": "summarize",
      "args": {
        "text": "Your long text here..."
      }
    }
  }'
```

## Agent Integration Pattern

### TypeScript/JavaScript Example

```typescript
class BitcoinMeteredClient {
  constructor(
    private baseUrl: string,
    private arkWallet: ArkWallet
  ) {}

  async callAPI(endpoint: string, units: Record<string, number>, args: any) {
    // 1. Get quote
    const params = new URLSearchParams({ endpoint, ...units });
    const quoteRes = await fetch(`${this.baseUrl}/v1/quote?${params}`);
    const quote = await quoteRes.json();

    // 2. Create VTXO spend for payment
    const payment = await this.arkWallet.createSpend({
      receiver: quote.ark.receiver_pubkey,
      amount: quote.price_sats,
      aspUrl: quote.ark.asp_url,
    });

    // 3. Pay and call
    const idempotencyKey = crypto.randomUUID();
    const callRes = await fetch(`${this.baseUrl}/v1/paycall`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        quote_id: quote.quote_id,
        ark_payment: {
          vtxo_spend: payment.vtxoSpend,
          proof: payment.proof,
          sender_pubkey: payment.senderPubkey,
        },
        request: { endpoint, args },
      }),
    });

    return await callRes.json();
  }
}

// Usage
const client = new BitcoinMeteredClient(
  'http://localhost:3000',
  myArkWallet
);

const result = await client.callAPI(
  'summarize',
  { tokens: 1000 },
  { text: 'Long article...' }
);

console.log(result.result.summary);
console.log('Receipt:', result.receipt.settlement_ref);
```

### Python Example

```python
import requests
import uuid
from ark_wallet import ArkWallet  # Hypothetical

class BitcoinMeteredClient:
    def __init__(self, base_url: str, ark_wallet: ArkWallet):
        self.base_url = base_url
        self.ark_wallet = ark_wallet

    def call_api(self, endpoint: str, units: dict, args: dict):
        # 1. Get quote
        params = {'endpoint': endpoint, **units}
        quote_res = requests.get(f'{self.base_url}/v1/quote', params=params)
        quote = quote_res.json()

        # 2. Create payment
        payment = self.ark_wallet.create_spend(
            receiver=quote['ark']['receiver_pubkey'],
            amount=quote['price_sats'],
            asp_url=quote['ark']['asp_url']
        )

        # 3. Pay and call
        idempotency_key = str(uuid.uuid4())
        call_res = requests.post(
            f'{self.base_url}/v1/paycall',
            headers={
                'Content-Type': 'application/json',
                'Idempotency-Key': idempotency_key
            },
            json={
                'quote_id': quote['quote_id'],
                'ark_payment': {
                    'vtxo_spend': payment['vtxo_spend'],
                    'proof': payment['proof'],
                    'sender_pubkey': payment['sender_pubkey']
                },
                'request': {
                    'endpoint': endpoint,
                    'args': args
                }
            }
        )

        return call_res.json()

# Usage
client = BitcoinMeteredClient('http://localhost:3000', my_ark_wallet)

result = client.call_api(
    'summarize',
    {'tokens': 1000},
    {'text': 'Long article...'}
)

print(result['result']['summary'])
print('Receipt:', result['receipt']['settlement_ref'])
```

## Error Handling

### Quote Expiration

Quotes expire after 30 seconds. If you get a 409 error, simply request a new quote:

```typescript
async function callWithRetry(endpoint, units, args) {
  let attempts = 0;
  while (attempts < 3) {
    try {
      return await client.callAPI(endpoint, units, args);
    } catch (error) {
      if (error.status === 409) {
        // Quote expired, retry
        attempts++;
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retry attempts exceeded');
}
```

### Payment Failures

```typescript
const result = await fetch(url, options);
if (result.status === 402) {
  const error = await result.json();
  console.error('Payment failed:', error.details);
  // Check your VTXO balance or ASP connection
}
```

### Idempotency

Always use idempotency keys for safe retries:

```typescript
const idempotencyKey = `${agentId}-${timestamp}-${nonce}`;

// Can safely retry with same key
await callAPI(endpoint, units, args, idempotencyKey);
```

## All Endpoints Examples

### Summarize
```bash
# Quote
curl "http://localhost:3000/v1/quote?endpoint=summarize&tokens=2000"

# Args in paycall
{
  "endpoint": "summarize",
  "args": { "text": "..." }
}
```

### Generate Image
```bash
# Quote
curl "http://localhost:3000/v1/quote?endpoint=generate_image&images=1"

# Args in paycall
{
  "endpoint": "generate_image",
  "args": {
    "prompt": "A futuristic city",
    "width": 512,
    "height": 512
  }
}
```

### Translate
```bash
# Quote
curl "http://localhost:3000/v1/quote?endpoint=translate&characters=100"

# Args in paycall
{
  "endpoint": "translate",
  "args": {
    "text": "Hello world",
    "from": "en",
    "to": "es"
  }
}
```

### Compute
```bash
# Quote
curl "http://localhost:3000/v1/quote?endpoint=compute&seconds=2"

# Args in paycall
{
  "endpoint": "compute",
  "args": {
    "operation": "square",
    "value": 42
  }
}
```

## Cost Estimation

Calculate costs before calling:

```typescript
function estimateCost(endpoint: string, units: Record<string, number>): number {
  const rates = {
    summarize: (u) => Math.ceil((u.tokens || 1000) / 100) * 5,
    generate_image: (u) => (u.images || 1) * 50,
    translate: (u) => Math.ceil((u.characters || 500) / 100) * 3,
    compute: (u) => (u.seconds || 1) * 10,
  };

  return rates[endpoint]?.(units) || units.amount * 10;
}

// Example
const cost = estimateCost('summarize', { tokens: 5000 });
console.log(`Estimated cost: ${cost} sats`);
```

## Best Practices

1. **Always use Idempotency-Key** for paycall requests
2. **Check quote expiration** - quotes are valid for 30 seconds
3. **Handle 409 errors** by fetching a fresh quote
4. **Store receipts** for audit trails
5. **Monitor ASP health** via `/health` endpoint before large operations
6. **Use appropriate units** in quote requests for accurate pricing
7. **Verify settlement references** against your records

## Testing in Free Mode

For development, use `PAYMENTS_MODE=free`:

```bash
# .env
PAYMENTS_MODE=free

# Any payment data will work
{
  "ark_payment": {
    "vtxo_spend": "test",
    "proof": "test",
    "sender_pubkey": "test"
  }
}
```

This allows rapid iteration without actual Bitcoin payments.
