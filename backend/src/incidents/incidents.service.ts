import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FallAgentService } from '../fall-agent/fall-agent.service';
import { StorageService } from '../storage/storage.service';
import {
  FallIncident,
  FallIncidentDocument,
  IncidentNotifyType,
  IncidentState,
} from './schemas/fall-incident.schema';

export interface OnMobileFallInput {
  detectedAt: Date;
  confidence: number;
  scopeId: string;
  deviceId?: string;
}

export interface OnCctvFallInput {
  detectedAt: Date;
  confidence: number;
  label: string;
  bbox: { x1: number; y1: number; x2: number; y2: number };
  snapshotFilename: string;
  cameraId: string;
  scopeId: string;
  rawCctvEventId: string;
}

export interface IncidentOutcome {
  id: string;
  state: string;
  notifyType?: string;
}

// TODO(orphan-sweeper): In a future iteration, add a scheduled cron that
// scans for incidents stuck in PENDING_CORRELATION older than
// CORRELATION_WINDOW_MS * 2 (e.g. after a process restart while a timer
// was in-flight) and finalizes them the same way the in-process timers do.
// For MVP we accept that in-process timers are lost on restart.

@Injectable()
export class IncidentsService implements OnModuleDestroy {
  private readonly logger = new Logger(IncidentsService.name);
  private readonly correlationWindowMs: number;
  private readonly cctvWeight: number;
  private readonly agentWeight: number;
  private readonly pendingTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectModel(FallIncident.name)
    private readonly incidentModel: Model<FallIncidentDocument>,
    private readonly config: ConfigService,
    private readonly fallAgent: FallAgentService,
    private readonly storage: StorageService,
  ) {
    this.correlationWindowMs = this.config.get<number>(
      'CORRELATION_WINDOW_MS',
      10_000,
    );
    this.cctvWeight = this.config.get<number>('CCTV_WEIGHT', 0.7);
    this.agentWeight = this.config.get<number>('AGENT_WEIGHT', 0.3);
  }

  onModuleDestroy(): void {
    for (const timer of this.pendingTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();
  }

  resolveScopeId(optional?: string): string {
    return (
      optional?.trim() ||
      this.config.get<string>('INCIDENT_SCOPE_ID', 'default')
    );
  }

  private windowBounds(detectedAt: Date) {
    const t = detectedAt.getTime();
    // Parse the string into number
    const w = parseInt(String(this.correlationWindowMs), 10) || 10000;
    return { start: new Date(t - w), end: new Date(t + w) };
  }

  private minDate(a: Date, b: Date): Date {
    return a.getTime() <= b.getTime() ? a : b;
  }

  async onMobileFall(input: OnMobileFallInput): Promise<IncidentOutcome> {
    if (isNaN(input.detectedAt.getTime())) {
      input.detectedAt = new Date();
    }
    this.logger.log(`onMobileFall input: ${JSON.stringify(input)}`);
    const { start, end } = this.windowBounds(input.detectedAt);
    const pending = await this.incidentModel
      .findOne({
        scopeId: input.scopeId,
        state: IncidentState.PENDING_CORRELATION,
        detectedAt: { $gte: start, $lte: end },
      })
      .sort({ createdAt: -1 })
      .exec();

    if (pending && pending.cctvDetected) {
      // CCTV-first incident is waiting for its agent timer; mobile arrived
      // inside the window → finalize as MOBILE_AND_CCTV, skip Gemini.
      const finalized = await this.incidentModel
        .findOneAndUpdate(
          { _id: pending._id, state: IncidentState.PENDING_CORRELATION },
          {
            $set: {
              mobileDetected: true,
              mobileConfidence: input.confidence,
              deviceId: input.deviceId ?? pending.deviceId,
              detectedAt: this.minDate(pending.detectedAt, input.detectedAt),
              state: IncidentState.FINALIZED,
              notifyType: IncidentNotifyType.MOBILE_AND_CCTV,
              finalizedAt: new Date(),
            },
          },
          { new: true },
        )
        .exec();
      if (!finalized) {
        return this.onMobileFall(input);
      }
      this.clearPendingTimer(String(finalized._id));
      this.logNotify(
        String(finalized._id),
        IncidentNotifyType.MOBILE_AND_CCTV,
        finalized.cctvConfidence ?? finalized.mobileConfidence,
      );
      return this.toOutcome(finalized);
    }

    if (pending) {
      // Mobile-first already pending; another mobile arrival is idempotent.
      const attached = await this.incidentModel
        .findOneAndUpdate(
          { _id: pending._id, state: IncidentState.PENDING_CORRELATION },
          {
            $set: {
              mobileDetected: true,
              mobileConfidence: Math.max(
                pending.mobileConfidence ?? 0,
                input.confidence,
              ),
              deviceId: pending.deviceId ?? input.deviceId,
              detectedAt: this.minDate(pending.detectedAt, input.detectedAt),
            },
          },
          { new: true },
        )
        .exec();
      return this.toOutcome(attached ?? pending);
    }

    const created = await this.incidentModel.create({
      scopeId: input.scopeId,
      state: IncidentState.PENDING_CORRELATION,
      mobileDetected: true,
      cctvDetected: false,
      detectedAt: input.detectedAt,
      mobileConfidence: input.confidence,
      deviceId: input.deviceId,
    });
    const id = String(created._id);
    this.schedulePendingTimer(id, () => this.finalizeMobileOnlyOnTimeout(id));
    return { id, state: IncidentState.PENDING_CORRELATION };
  }

  async onCctvFall(input: OnCctvFallInput): Promise<IncidentOutcome> {
    if (isNaN(input.detectedAt.getTime())) {
      input.detectedAt = new Date();
    }
    this.logger.log(`onCctvFall input: ${JSON.stringify(input)}`);
    const { start, end } = this.windowBounds(input.detectedAt);
    const pending = await this.incidentModel
      .findOne({
        scopeId: input.scopeId,
        state: IncidentState.PENDING_CORRELATION,
        detectedAt: { $gte: start, $lte: end },
      })
      .sort({ createdAt: -1 })
      .exec();

    if (pending && pending.mobileDetected) {
      // Mobile-first incident is waiting for its finalize timer; CCTV arrived
      // inside the window → finalize as MOBILE_AND_CCTV, skip Gemini.
      const finalized = await this.incidentModel
        .findOneAndUpdate(
          { _id: pending._id, state: IncidentState.PENDING_CORRELATION },
          {
            $set: {
              cctvDetected: true,
              cctvConfidence: input.confidence,
              cctvLabel: input.label,
              bbox: input.bbox,
              snapshotFilename: input.snapshotFilename,
              cameraId: input.cameraId,
              rawCctvEventId: input.rawCctvEventId,
              detectedAt: this.minDate(pending.detectedAt, input.detectedAt),
              state: IncidentState.FINALIZED,
              notifyType: IncidentNotifyType.MOBILE_AND_CCTV,
              finalizedAt: new Date(),
            },
          },
          { new: true },
        )
        .exec();
      if (!finalized) {
        return this.onCctvFall(input);
      }
      this.clearPendingTimer(String(finalized._id));
      this.logNotify(
        String(finalized._id),
        IncidentNotifyType.MOBILE_AND_CCTV,
        finalized.cctvConfidence,
      );
      return this.toOutcome(finalized);
    }

    if (pending) {
      // CCTV-first already pending; another CCTV arrival just enriches it.
      const attached = await this.incidentModel
        .findOneAndUpdate(
          { _id: pending._id, state: IncidentState.PENDING_CORRELATION },
          {
            $set: {
              cctvDetected: true,
              cctvConfidence: Math.max(
                pending.cctvConfidence ?? 0,
                input.confidence,
              ),
              cctvLabel: input.label,
              bbox: input.bbox,
              snapshotFilename: input.snapshotFilename,
              cameraId: input.cameraId,
              rawCctvEventId: input.rawCctvEventId,
              detectedAt: this.minDate(pending.detectedAt, input.detectedAt),
            },
          },
          { new: true },
        )
        .exec();
      return this.toOutcome(attached ?? pending);
    }

    const created = await this.incidentModel.create({
      scopeId: input.scopeId,
      state: IncidentState.PENDING_CORRELATION,
      mobileDetected: false,
      cctvDetected: true,
      detectedAt: input.detectedAt,
      cctvConfidence: input.confidence,
      cctvLabel: input.label,
      bbox: input.bbox,
      snapshotFilename: input.snapshotFilename,
      cameraId: input.cameraId,
      rawCctvEventId: input.rawCctvEventId,
    });
    const id = String(created._id);
    this.schedulePendingTimer(id, () => this.runCctvOnlyAgentPath(id));
    return { id, state: IncidentState.PENDING_CORRELATION };
  }

  private schedulePendingTimer(
    id: string,
    fn: () => Promise<void> | void,
  ): void {
    const existing = this.pendingTimers.get(id);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.pendingTimers.delete(id);
      Promise.resolve(fn()).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Pending timer failed for incident ${id}: ${msg}`);
      });
    }, this.correlationWindowMs);
    this.pendingTimers.set(id, timer);
  }

  private clearPendingTimer(id: string): void {
    const timer = this.pendingTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.pendingTimers.delete(id);
    }
  }

  private async finalizeMobileOnlyOnTimeout(id: string): Promise<void> {
    const updated = await this.incidentModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          state: IncidentState.PENDING_CORRELATION,
        },
        {
          $set: {
            state: IncidentState.FINALIZED,
            notifyType: IncidentNotifyType.MOBILE_ONLY,
            finalizedAt: new Date(),
          },
        },
        { new: true },
      )
      .exec();
    if (updated) {
      this.logNotify(
        id,
        IncidentNotifyType.MOBILE_ONLY,
        updated.mobileConfidence,
      );
    }
  }

  private async runCctvOnlyAgentPath(id: string): Promise<void> {
    const doc = await this.incidentModel
      .findById(new Types.ObjectId(id))
      .lean()
      .exec();
    if (!doc || doc.state !== IncidentState.PENDING_CORRELATION) {
      // Already finalized by a paired mobile arrival, or missing. Skip.
      return;
    }
    if (!doc.snapshotFilename) {
      this.logger.warn(
        `CCTV pending incident ${id} has no snapshotFilename; cannot run agent.`,
      );
      return;
    }

    const snapPath = this.storage.getSnapshotAbsolutePath(doc.snapshotFilename);
    const agent = await this.fallAgent.analyze(snapPath);
    const modelName =
      this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.0-flash';
    const rawTrunc =
      agent.raw.length > 500 ? agent.raw.slice(0, 500) : agent.raw;

    if (agent.verdict === 'yes') {
      const weightedScore =
        this.cctvWeight * (doc.cctvConfidence ?? 0) +
        this.agentWeight * agent.confidence;
      const updated = await this.incidentModel
        .findOneAndUpdate(
          {
            _id: new Types.ObjectId(id),
            state: IncidentState.PENDING_CORRELATION,
          },
          {
            $set: {
              state: IncidentState.FINALIZED,
              notifyType: IncidentNotifyType.CCTV_AGENT_WEIGHTED,
              finalizedAt: new Date(),
              agentVerdict: 'yes',
              agentRaw: rawTrunc,
              agentModel: modelName,
              weightedScore,
            },
          },
          { new: true },
        )
        .exec();
      if (updated) {
        this.logNotify(
          id,
          IncidentNotifyType.CCTV_AGENT_WEIGHTED,
          weightedScore,
        );
      }
    } else {
      await this.incidentModel
        .findOneAndUpdate(
          {
            _id: new Types.ObjectId(id),
            state: IncidentState.PENDING_CORRELATION,
          },
          {
            $set: {
              state: IncidentState.REJECTED_BY_AGENT,
              agentVerdict: 'no',
              agentRaw: rawTrunc,
              agentModel: modelName,
              finalizedAt: new Date(),
            },
          },
        )
        .exec();
      // Intentionally no Notify log on REJECTED_BY_AGENT.
    }
  }

  private logNotify(
    incidentId: string,
    type: string,
    conf: number | undefined | null,
  ): void {
    const confStr =
      typeof conf === 'number' && Number.isFinite(conf)
        ? conf.toFixed(3)
        : 'n/a';
    this.logger.log(
      `Notify: incident=${incidentId} type=${type} conf=${confStr}`,
    );
  }

  async findAll(limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.incidentModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.incidentModel.countDocuments().exec(),
    ]);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    return {
      data: items.map((row) => this.serialize(row)),
      meta: { page, limit, total, totalPages },
    };
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Incident not found');
    }
    const doc = await this.incidentModel.findById(id).lean().exec();
    if (!doc) {
      throw new NotFoundException('Incident not found');
    }
    return this.serialize(doc);
  }

  private toOutcome(doc: {
    _id: unknown;
    state: unknown;
    notifyType?: unknown;
  }): IncidentOutcome {
    const id = String(doc._id);
    const state = String(doc.state);
    const notifyType =
      doc.notifyType === undefined || doc.notifyType === null
        ? undefined
        : String(doc.notifyType);
    return { id, state, notifyType };
  }

  private serialize(row: Record<string, unknown>) {
    const { _id, __v, ...rest } = row;
    void __v;
    return { id: String(_id), ...rest };
  }
}
