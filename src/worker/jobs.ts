import { nanoid } from 'nanoid';
import type { DB, Job } from '../db/database.js';

export interface JobRequest {
  endpoint: string;
  args: Record<string, any>;
  paymentId: string;
}

export interface JobResult {
  status: 'ok' | 'error';
  result?: any;
  error?: string;
}

/**
 * Worker implementations for different endpoints
 */
const WORKERS: Record<string, (args: Record<string, any>) => Promise<any>> = {
  /**
   * Summarize text endpoint
   */
  summarize: async (args) => {
    const text = args.text as string;
    
    if (!text) {
      throw new Error('text is required');
    }

    // Simple summarization: take first N words
    const words = text.split(/\s+/);
    const summaryLength = Math.min(50, Math.floor(words.length / 3));
    const summary = words.slice(0, summaryLength).join(' ') + '...';

    return {
      summary,
      original_length: text.length,
      summary_length: summary.length,
      tokens_processed: words.length,
    };
  },

  /**
   * Generate image endpoint (mock)
   */
  generate_image: async (args) => {
    const prompt = args.prompt as string;
    const width = (args.width as number) || 512;
    const height = (args.height as number) || 512;

    if (!prompt) {
      throw new Error('prompt is required');
    }

    // Mock image generation - return a placeholder URL
    return {
      image_url: `https://via.placeholder.com/${width}x${height}?text=${encodeURIComponent(prompt)}`,
      prompt,
      dimensions: { width, height },
      processing_time_ms: 150,
    };
  },

  /**
   * Translate text endpoint (mock)
   */
  translate: async (args) => {
    const text = args.text as string;
    const from = (args.from as string) || 'en';
    const to = (args.to as string) || 'es';

    if (!text) {
      throw new Error('text is required');
    }

    // Mock translation - just add a prefix
    const translated = `[${from}→${to}] ${text}`;

    return {
      original: text,
      translated,
      from_language: from,
      to_language: to,
      characters_processed: text.length,
    };
  },

  /**
   * Generic compute endpoint
   */
  compute: async (args) => {
    const operation = args.operation as string;
    const value = args.value as number;

    if (!operation) {
      throw new Error('operation is required');
    }

    // Simple math operations
    let result: number;
    switch (operation) {
      case 'square':
        result = value * value;
        break;
      case 'sqrt':
        result = Math.sqrt(value);
        break;
      case 'double':
        result = value * 2;
        break;
      default:
        throw new Error(`unknown operation: ${operation}`);
    }

    return {
      operation,
      input: value,
      output: result,
      computed_at: new Date().toISOString(),
    };
  },
};

export class JobsService {
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  /**
   * Create and enqueue a new job
   */
  async createJob(req: JobRequest): Promise<Job> {
    const jobId = `job_${nanoid(16)}`;

    const job: Omit<Job, 'created_at' | 'completed_at'> = {
      id: jobId,
      payment_id: req.paymentId,
      endpoint: req.endpoint,
      args_json: JSON.stringify(req.args),
      status: 'queued',
      result_json: null,
      error_message: null,
    };

    return this.db.createJob(job);
  }

  /**
   * Execute a job synchronously
   */
  async executeJob(jobId: string): Promise<JobResult> {
    const job = this.db.getJob(jobId);
    
    if (!job) {
      throw new Error('job not found');
    }

    // Update status to processing
    this.db.updateJob(jobId, { status: 'processing' });

    try {
      const args = JSON.parse(job.args_json);
      const worker = WORKERS[job.endpoint];

      if (!worker) {
        throw new Error(`no worker for endpoint: ${job.endpoint}`);
      }

      // Execute the worker
      const result = await worker(args);

      // Update job with result
      this.db.updateJob(jobId, {
        status: 'completed',
        result_json: JSON.stringify(result),
        completed_at: new Date().toISOString(),
      });

      return {
        status: 'ok',
        result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown error';

      // Update job with error
      this.db.updateJob(jobId, {
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      });

      return {
        status: 'error',
        error: errorMessage,
      };
    }
  }

  /**
   * Get job status and result
   */
  getJob(jobId: string): Job | null {
    return this.db.getJob(jobId);
  }

  /**
   * Wait for job completion with timeout
   */
  async awaitJobResult(jobId: string, timeoutMs: number = 30_000): Promise<JobResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const job = this.db.getJob(jobId);
      
      if (!job) {
        throw new Error('job not found');
      }

      if (job.status === 'completed') {
        return {
          status: 'ok',
          result: JSON.parse(job.result_json!),
        };
      }

      if (job.status === 'failed') {
        return {
          status: 'error',
          error: job.error_message || 'job failed',
        };
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error('job execution timeout');
  }
}
