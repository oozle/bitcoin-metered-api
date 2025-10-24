import Database from 'better-sqlite3';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

export interface Quote {
  id: string;
  endpoint: string;
  units: string; // JSON string
  price_sats: number;
  expires_at: string; // ISO timestamp
  nonce: string;
  receiver_pubkey: string;
  asp_url: string;
  status: 'active' | 'expired' | 'used';
  created_at: string;
}

export interface Payment {
  id: string;
  quote_id: string;
  sender_pubkey: string;
  paid_sats: number;
  ark_ref: string; // settlement reference
  vtxo_spend: string;
  proof: string;
  status: 'pending' | 'verified' | 'failed';
  created_at: string;
}

export interface Job {
  id: string;
  payment_id: string;
  endpoint: string;
  args_json: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result_json: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  units TEXT NOT NULL,
  price_sats INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  nonce TEXT NOT NULL UNIQUE,
  receiver_pubkey TEXT NOT NULL,
  asp_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quotes_expires ON quotes(expires_at);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_nonce ON quotes(nonce);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  sender_pubkey TEXT NOT NULL,
  paid_sats INTEGER NOT NULL,
  ark_ref TEXT NOT NULL,
  vtxo_spend TEXT NOT NULL,
  proof TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (quote_id) REFERENCES quotes(id)
);

CREATE INDEX IF NOT EXISTS idx_payments_quote ON payments(quote_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  args_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  result_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (payment_id) REFERENCES payments(id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_payment ON jobs(payment_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);
`;

export class DB {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  // Quotes
  createQuote(quote: Omit<Quote, 'created_at'>): Quote {
    const stmt = this.db.prepare(`
      INSERT INTO quotes (id, endpoint, units, price_sats, expires_at, nonce, receiver_pubkey, asp_url, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      quote.id,
      quote.endpoint,
      quote.units,
      quote.price_sats,
      quote.expires_at,
      quote.nonce,
      quote.receiver_pubkey,
      quote.asp_url,
      quote.status
    );
    return this.getQuote(quote.id)!;
  }

  getQuote(id: string): Quote | null {
    const stmt = this.db.prepare('SELECT * FROM quotes WHERE id = ?');
    return stmt.get(id) as Quote | null;
  }

  updateQuoteStatus(id: string, status: Quote['status']): void {
    const stmt = this.db.prepare('UPDATE quotes SET status = ? WHERE id = ?');
    stmt.run(status, id);
  }

  // Payments
  createPayment(payment: Omit<Payment, 'created_at'>): Payment {
    const stmt = this.db.prepare(`
      INSERT INTO payments (id, quote_id, sender_pubkey, paid_sats, ark_ref, vtxo_spend, proof, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      payment.id,
      payment.quote_id,
      payment.sender_pubkey,
      payment.paid_sats,
      payment.ark_ref,
      payment.vtxo_spend,
      payment.proof,
      payment.status
    );
    return this.getPayment(payment.id)!;
  }

  getPayment(id: string): Payment | null {
    const stmt = this.db.prepare('SELECT * FROM payments WHERE id = ?');
    return stmt.get(id) as Payment | null;
  }

  updatePaymentStatus(id: string, status: Payment['status']): void {
    const stmt = this.db.prepare('UPDATE payments SET status = ? WHERE id = ?');
    stmt.run(status, id);
  }

  // Jobs
  createJob(job: Omit<Job, 'created_at' | 'completed_at'>): Job {
    const stmt = this.db.prepare(`
      INSERT INTO jobs (id, payment_id, endpoint, args_json, status, result_json, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      job.id,
      job.payment_id,
      job.endpoint,
      job.args_json,
      job.status,
      job.result_json,
      job.error_message
    );
    return this.getJob(job.id)!;
  }

  getJob(id: string): Job | null {
    const stmt = this.db.prepare('SELECT * FROM jobs WHERE id = ?');
    return stmt.get(id) as Job | null;
  }

  updateJob(id: string, updates: Partial<Pick<Job, 'status' | 'result_json' | 'error_message' | 'completed_at'>>): void {
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.status) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.result_json !== undefined) {
      fields.push('result_json = ?');
      values.push(updates.result_json);
    }
    if (updates.error_message !== undefined) {
      fields.push('error_message = ?');
      values.push(updates.error_message);
    }
    if (updates.completed_at !== undefined) {
      fields.push('completed_at = ?');
      values.push(updates.completed_at);
    }
    
    if (fields.length === 0) return;
    
    values.push(id);
    const stmt = this.db.prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  // Idempotency
  getIdempotencyKey(key: string): { response_json: string } | null {
    const stmt = this.db.prepare('SELECT response_json FROM idempotency_keys WHERE key = ? AND expires_at > datetime(\'now\')');
    return stmt.get(key) as { response_json: string } | null;
  }

  setIdempotencyKey(key: string, responseJson: string, ttlSeconds: number = 120): void {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO idempotency_keys (key, response_json, expires_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(key, responseJson, expiresAt);
  }

  cleanupExpired(): void {
    this.db.exec(`DELETE FROM idempotency_keys WHERE expires_at < datetime('now')`);
    this.db.exec(`UPDATE quotes SET status = 'expired' WHERE status = 'active' AND expires_at < datetime('now')`);
  }

  close(): void {
    this.db.close();
  }
}

export async function initDatabase(dbPath: string): Promise<DB> {
  await mkdir(dirname(dbPath), { recursive: true });
  return new DB(dbPath);
}
