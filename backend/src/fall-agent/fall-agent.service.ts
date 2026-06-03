import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs/promises';

export type FallAgentVerdict = 'yes' | 'no';

export interface FallAgentAnalyzeResult {
  verdict: FallAgentVerdict;
  confidence: number;
  raw: string;
}

const PROMPT = `You are a vision safety assistant. Look at the image and decide if it shows a person who has fallen or is in a clear fall/collapse situation.
Respond with STRICT JSON only, no markdown, no extra keys: { "fall": true|false, "confidence": number between 0 and 1, "reason": "short string" }`;

@Injectable()
export class FallAgentService {
  private readonly logger = new Logger(FallAgentService.name);

  constructor(private readonly config: ConfigService) {}

  async analyze(snapshotPath: string): Promise<FallAgentAnalyzeResult> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY not set; fall agent disabled (verdict=no)',
      );
      return { verdict: 'no', confidence: 0, raw: 'agent_disabled' };
    }

    const modelName =
      this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.0-flash';
    const timeoutMs = this.config.get<number>('GEMINI_TIMEOUT_MS', 100000);

    let imageBuffer: Buffer;
    try {
      imageBuffer = await fs.readFile(snapshotPath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Failed to read snapshot for agent: ${msg}`);
      return {
        verdict: 'no',
        confidence: 0,
        raw: `read_error:${msg.slice(0, 200)}`,
      };
    }

    const base64 = imageBuffer.toString('base64');
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(
        {
          contents: [
            {
              role: 'user',
              parts: [
                { text: PROMPT },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64,
                  },
                },
              ],
            },
          ],
        },
        { signal: abort.signal },
      );
      const text = result.response.text()?.trim() ?? '';
      return this.parseAgentResponse(text, modelName);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Gemini analyze failed: ${msg}`);
      return {
        verdict: 'no',
        confidence: 0,
        raw: `api_error:${msg.slice(0, 200)}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private parseAgentResponse(
    text: string,
    modelName: string,
  ): FallAgentAnalyzeResult {
    const rawTrunc = text.length > 500 ? text.slice(0, 500) : text;
    const jsonSlice = this.extractJsonObject(text);
    try {
      const parsed = JSON.parse(jsonSlice) as {
        fall?: boolean;
        confidence?: number;
        reason?: string;
      };
      const verdict: FallAgentVerdict = parsed.fall === true ? 'yes' : 'no';
      let confidence = Number(parsed.confidence);
      if (!Number.isFinite(confidence)) {
        confidence = verdict === 'yes' ? 0.7 : 0.5;
      }
      confidence = Math.min(1, Math.max(0, confidence));
      const reason = parsed.reason ?? '';
      const raw = JSON.stringify({
        fall: parsed.fall,
        confidence,
        reason,
        model: modelName,
      });
      return {
        verdict,
        confidence,
        raw: raw.length > 500 ? raw.slice(0, 500) : raw,
      };
    } catch {
      return { verdict: 'no', confidence: 0, raw: rawTrunc };
    }
  }

  private extractJsonObject(text: string): string {
    const trimmed = text.trim();
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1]) {
      return fence[1].trim();
    }
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return trimmed.slice(start, end + 1);
    }
    return trimmed;
  }
}
