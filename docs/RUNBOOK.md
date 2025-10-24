# Operations Runbook

## Unilateral Exit (Emergency)

If the Arkade ASP becomes unresponsive, users can perform a **unilateral exit** to claim their funds on-chain.

### What is Unilateral Exit?

VTXOs (Virtual Transaction Outputs) in Arkade have pre-signed exit transactions that allow holders to claim funds directly to the Bitcoin mainnet without ASP cooperation.

### When to Use

- ASP is offline for extended period (>24 hours)
- ASP is not honoring legitimate spends
- You want to move funds out of Arkade to mainnet

### How to Exit

1. **Locate your VTXO data**
   - VTXO spend transaction
   - Pre-signed exit transaction
   - Your private key

2. **Broadcast exit transaction**
   ```bash
   # Using Arkade CLI (when available)
   ark-cli exit --vtxo <vtxo_id> --key <private_key>
   
   # Or using Bitcoin Core
   bitcoin-cli sendrawtransaction <presigned_exit_tx>
   ```

3. **Wait for confirmations**
   - Exit transactions require 1 confirmation
   - Funds will be in your Bitcoin address after confirmation

4. **Verify receipt**
   ```bash
   bitcoin-cli getrawtransaction <txid> 1
   ```

### Important Notes

- Exit transactions have timelock constraints
- Exit may take several blocks to confirm
- Small on-chain fees apply
- ASP cannot block legitimate exits

### Resources

- [Ark Protocol Specification](https://ark.dev/spec)
- [Arkade Exit Tutorial](https://docs.arkade.example/exit)
- Bitcoin Core Documentation for broadcasting

## Refunds

### Request a Refund

If a job fails or cost is less than quoted, refunds can be issued.

**POST /v1/refund** (when implemented)
```json
{
  "payment_id": "pay_xyz123",
  "reason": "job_failed"
}
```

Refunds are issued as:
- New VTXO credit (instant)
- On-chain return (requires confirmation)

### Refund Policy

- Failed jobs: Full refund
- Partial execution: Prorated refund
- User error: No refund
- Processing time: Instant (VTXO) or 1-6 confirmations (on-chain)

## Monitoring

### Health Check

```bash
curl http://localhost:3000/health
```

Monitor:
- ASP connectivity (`asp.healthy`)
- ASP latency (`asp.latency_ms`)
- Last round timestamp (`asp.last_round`)

### Key Metrics

```bash
# Database size
du -h ./data/metered-api.db

# Quote volume (last hour)
sqlite3 ./data/metered-api.db "SELECT COUNT(*) FROM quotes WHERE created_at > datetime('now', '-1 hour')"

# Payment success rate
sqlite3 ./data/metered-api.db "SELECT status, COUNT(*) FROM payments GROUP BY status"

# Job completion rate
sqlite3 ./data/metered-api.db "SELECT status, COUNT(*) FROM jobs GROUP BY status"
```

### Alerts

Set up alerts for:
- ASP unhealthy for >5 minutes
- Payment failure rate >10%
- Job failure rate >5%
- Disk space <1GB
- Quote expiration rate >20%

## Troubleshooting

### ASP Connection Issues

**Symptom**: `asp.healthy: false` in /health

**Solutions**:
1. Check network connectivity
   ```bash
   curl https://asp.testnet.arkade.example/health
   ```

2. Verify ASP URL in config
   ```bash
   echo $ARK_ASP_URL
   ```

3. Try alternative ASP (if available)
   ```bash
   ARK_ASP_URL=https://asp2.testnet.arkade.example
   ```

### Payment Verification Failures

**Symptom**: 402 errors on paycall

**Solutions**:
1. Check VTXO format is valid base64
2. Verify proof matches spend
3. Ensure VTXO has sufficient balance
4. Check ASP round status
5. Verify payment mode matches environment

### Quote Expiration Issues

**Symptom**: High rate of 409 errors

**Solutions**:
1. Increase quote TTL (in `src/payments/quotes.ts`)
2. Optimize agent response time
3. Pre-fetch quotes before needed
4. Implement quote caching on agent side

### Database Lock Errors

**Symptom**: SQLITE_BUSY errors

**Solutions**:
1. Enable WAL mode (already default)
   ```bash
   sqlite3 ./data/metered-api.db "PRAGMA journal_mode=WAL;"
   ```

2. Increase timeout
   ```typescript
   new Database(path, { timeout: 10000 });
   ```

3. Check for long-running transactions

## Backup and Recovery

### Database Backup

```bash
# Stop server
npm stop

# Backup database
cp ./data/metered-api.db ./backups/metered-api-$(date +%Y%m%d).db

# Backup WAL files
cp ./data/metered-api.db-wal ./backups/ 2>/dev/null || true
cp ./data/metered-api.db-shm ./backups/ 2>/dev/null || true

# Restart server
npm start
```

### Hot Backup (without stopping)

```bash
sqlite3 ./data/metered-api.db ".backup './backups/metered-api-$(date +%Y%m%d).db'"
```

### Recovery

```bash
# Stop server
npm stop

# Restore from backup
cp ./backups/metered-api-20251024.db ./data/metered-api.db

# Remove WAL files
rm ./data/metered-api.db-wal ./data/metered-api.db-shm 2>/dev/null || true

# Restart server
npm start
```

### Audit Trail

All payments are permanently recorded with:
- Settlement reference (`ark_ref`)
- Payment ID
- Quote ID
- Timestamp

Query audit trail:
```sql
SELECT 
  p.created_at,
  p.sender_pubkey,
  p.paid_sats,
  p.ark_ref,
  j.endpoint,
  j.status
FROM payments p
JOIN jobs j ON j.payment_id = p.id
WHERE p.created_at > datetime('now', '-7 days')
ORDER BY p.created_at DESC;
```

## Performance Tuning

### Database Optimization

```bash
# Vacuum database
sqlite3 ./data/metered-api.db "VACUUM;"

# Analyze query performance
sqlite3 ./data/metered-api.db "PRAGMA optimize;"

# Check index usage
sqlite3 ./data/metered-api.db ".schema"
```

### Cleanup Old Data

```sql
-- Remove expired quotes older than 7 days
DELETE FROM quotes 
WHERE status = 'expired' 
  AND created_at < datetime('now', '-7 days');

-- Remove old idempotency keys
DELETE FROM idempotency_keys 
WHERE expires_at < datetime('now', '-1 day');
```

## Security Best Practices

1. **Never expose private keys** in logs or environment
2. **Use HTTPS** in production
3. **Rate limit** by IP if abuse detected
4. **Monitor** for unusual payment patterns
5. **Backup** ASP receiver keys securely
6. **Rotate** logs regularly
7. **Audit** settlement references periodically
8. **Update** dependencies for security patches

## Support Contacts

- **Arkade ASP Support**: support@arkade.example
- **GitHub Issues**: https://github.com/your-repo/bitcoin-metered-api/issues
- **Community**: [Discord/Telegram link]
