# API Reference

Complete API documentation for the Bitcoin Metered API.

## Base URL

- Local development: `http://localhost:3000`
- Production: `https://your-domain.com`

## Authentication

No authentication required. Payment is the authentication.

## Common Headers

### Request Headers

- `Content-Type: application/json` - Required for POST requests
- `Idempotency-Key: <unique-key>` - Optional, recommended for paycall to prevent double-charging on retries

### Response Headers

All responses include:
- `Content-Type: application/json`

## Endpoints

### GET /

Get API information and available endpoints.

**Response 200**
```json
{
  "name": "Bitcoin Metered API",
  "version": "1.0.0",
  "description": "Pay-per-request API using Arkade (Bitcoin L2)",
  "endpoints": {
    "quote": "GET /v1/quote?endpoint=<name>&tokens=<n>",
    "paycall": "POST /v1/paycall",
    "health": "GET /health"
  },
  "docs": "https://github.com/your-repo/bitcoin-metered-api",
  "payments_mode": "free"
}
```

---

### GET /health

Health check endpoint.

**Response 200**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-24T00:07:18Z",
  "payments_mode": "free",
  "asp": {
    "url": "https://asp.testnet.arkade.example",
    "healthy": true,
    "latency_ms": 10,
    "last_round": "r_2025-10-24T00:07:00Z"
  }
}
```

---

### GET /v1/quote

Get a price quote for an API call.

**Query Parameters**

- `endpoint` (required, string) - The API endpoint to call
  - Options: `summarize`, `generate_image`, `translate`, `compute`
- Unit parameters (optional, at least one recommended):
  - `tokens` (number) - Number of tokens for text endpoints
  - `images` (number) - Number of images for image generation
  - `characters` (number) - Number of characters for translation
  - `seconds` (number) - Number of seconds for compute
  - `amount` (number) - Generic amount for custom pricing

**Example Request**
```bash
curl "http://localhost:3000/v1/quote?endpoint=summarize&tokens=1000"
```

**Response 200**
```json
{
  "endpoint": "summarize",
  "units": {
    "tokens": 1000
  },
  "price_sats": 50,
  "expires_at": "2025-10-24T00:37:40Z",
  "quote_id": "q_AbCdEfGh12345678",
  "ark": {
    "asp_url": "https://asp.testnet.arkade.example",
    "receiver_pubkey": "ark1q...",
    "round_hint": "r_2025-10-24T00:37:10Z"
  }
}
```

**Response Fields**

- `endpoint` - The requested endpoint
- `units` - Units being charged for
- `price_sats` - Price in satoshis
- `expires_at` - ISO timestamp when quote expires (30 seconds)
- `quote_id` - Unique quote identifier (use in paycall)
- `ark.asp_url` - Arkade ASP URL for payment
- `ark.receiver_pubkey` - Receiver address for payment
- `ark.round_hint` - Suggested Ark round for settlement

**Error Responses**

- **400 Bad Request**: Invalid parameters
```json
{
  "error": "validation_error",
  "details": [...]
}
```

- **500 Internal Server Error**: Server error
```json
{
  "error": "internal_error",
  "message": "error description"
}
```

---

### POST /v1/paycall

Pay for and execute an API call atomically.

**Headers**

- `Content-Type: application/json` (required)
- `Idempotency-Key: <unique-string>` (optional but recommended)

**Request Body**

```json
{
  "quote_id": "q_AbCdEfGh12345678",
  "ark_payment": {
    "vtxo_spend": "base64EncodedVTXOSpend",
    "proof": "base64EncodedProof",
    "sender_pubkey": "ark1q..."
  },
  "request": {
    "endpoint": "summarize",
    "args": {
      "text": "Your text to summarize here..."
    }
  }
}
```

**Request Fields**

- `quote_id` (required) - Quote ID from GET /v1/quote
- `ark_payment` (required) - Arkade payment details
  - `vtxo_spend` - Base64-encoded VTXO spend transaction
  - `proof` - Base64-encoded cryptographic proof
  - `sender_pubkey` - Sender's Arkade public key
- `request` (required) - API call details
  - `endpoint` - Must match quote endpoint
  - `args` - Endpoint-specific arguments (see below)

**Endpoint Arguments**

#### `summarize`
```json
{
  "text": "Long text to summarize..."
}
```

#### `generate_image`
```json
{
  "prompt": "A sunset over mountains",
  "width": 512,
  "height": 512
}
```

#### `translate`
```json
{
  "text": "Hello world",
  "from": "en",
  "to": "es"
}
```

#### `compute`
```json
{
  "operation": "square",
  "value": 42
}
```
Operations: `square`, `sqrt`, `double`

**Example Request**
```bash
curl -X POST http://localhost:3000/v1/paycall \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-request-id-123" \
  -d '{
    "quote_id": "q_AbCdEfGh12345678",
    "ark_payment": {
      "vtxo_spend": "YmFzZTY0ZW5jb2RlZHNwZW5k",
      "proof": "YmFzZTY0ZW5jb2RlZHByb29m",
      "sender_pubkey": "ark1qxyz..."
    },
    "request": {
      "endpoint": "summarize",
      "args": {
        "text": "Bitcoin is a decentralized digital currency..."
      }
    }
  }'
```

**Response 200** (Success)
```json
{
  "status": "ok",
  "result": {
    "summary": "Bitcoin is a decentralized digital currency...",
    "original_length": 150,
    "summary_length": 48,
    "tokens_processed": 25
  },
  "receipt": {
    "settlement_ref": "ark:round:r_2025-10-24T00:37:10Z/tx:abc123def456",
    "paid_sats": 50,
    "job_id": "job_XyZ789AbC123",
    "payment_id": "pay_DeF456GhI789"
  }
}
```

**Response Fields**

- `status` - Always "ok" on success
- `result` - Endpoint-specific result (varies by endpoint)
- `receipt` - Payment receipt
  - `settlement_ref` - Arkade settlement reference
  - `paid_sats` - Actual amount paid
  - `job_id` - Job identifier
  - `payment_id` - Payment record identifier

**Error Responses**

- **400 Bad Request**: Validation error or endpoint mismatch
```json
{
  "error": "endpoint_mismatch",
  "message": "Request endpoint does not match quote"
}
```

- **402 Payment Required**: Invalid or insufficient payment
```json
{
  "error": "payment_invalid",
  "details": "invalid_payment_format"
}
```

- **409 Conflict**: Quote expired or already used
```json
{
  "error": "expired_or_missing_quote",
  "message": "Quote has expired, been used, or does not exist"
}
```

- **500 Internal Server Error**: Job execution failed
```json
{
  "error": "job_execution_failed",
  "message": "text is required"
}
```

---

## Pricing Schedule

| Endpoint | Unit | Rate |
|----------|------|------|
| `summarize` | 100 tokens | 5 sats |
| `generate_image` | 1 image | 50 sats |
| `translate` | 100 characters | 3 sats |
| `compute` | 1 second | 10 sats |
| Default | 1 amount | 10 sats |

Prices are calculated dynamically based on units requested.

## Idempotency

The `Idempotency-Key` header ensures that retrying a paycall request with the same key returns the cached response without executing the job again or charging twice.

- Idempotency keys expire after 2 minutes
- Use a unique key per logical request (e.g., UUID)
- Cached responses include the original result and receipt

**Example**
```bash
# First request
curl -X POST http://localhost:3000/v1/paycall \
  -H "Idempotency-Key: req-abc-123" \
  -d '...'

# Retry with same key - returns cached response, no double charge
curl -X POST http://localhost:3000/v1/paycall \
  -H "Idempotency-Key: req-abc-123" \
  -d '...'
```

## Rate Limiting

Currently no rate limiting is enforced. Payment is the rate limit.

## Versioning

The API uses URL versioning (`/v1/`). Future versions will be at `/v2/`, etc.

## Support

For issues or questions:
- GitHub Issues: https://github.com/your-repo/bitcoin-metered-api/issues
- Documentation: https://github.com/your-repo/bitcoin-metered-api/docs
