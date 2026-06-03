import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FallIncidentDocument = HydratedDocument<FallIncident>;

export const IncidentState = {
  OPEN: 'OPEN',
  PENDING_AGENT: 'PENDING_AGENT',
  FINALIZED: 'FINALIZED',
  REJECTED_BY_AGENT: 'REJECTED_BY_AGENT',
  /** Legacy — keep in enum so older Mongo documents still validate on read. */
  PENDING_CORRELATION: 'PENDING_CORRELATION',
} as const;

export type IncidentStateValue =
  (typeof IncidentState)[keyof typeof IncidentState];

export const IncidentNotifyType = {
  MOBILE_ONLY: 'MOBILE_ONLY',
  MOBILE_AND_CCTV: 'MOBILE_AND_CCTV',
  CCTV_AGENT_WEIGHTED: 'CCTV_AGENT_WEIGHTED',
} as const;

export type IncidentNotifyTypeValue =
  (typeof IncidentNotifyType)[keyof typeof IncidentNotifyType];

@Schema({ timestamps: true, collection: 'fall_incidents' })
export class FallIncident {
  @Prop({ required: true, index: true })
  scopeId: string;

  @Prop({
    type: String,
    enum: Object.values(IncidentState),
    required: true,
    default: IncidentState.OPEN,
  })
  state: IncidentStateValue;

  @Prop({ default: false })
  mobileDetected: boolean;

  @Prop({ default: false })
  cctvDetected: boolean;

  @Prop({ required: true, index: true })
  detectedAt: Date;

  @Prop()
  mobileConfidence?: number;

  @Prop()
  cctvConfidence?: number;

  @Prop()
  cctvLabel?: string;

  @Prop()
  snapshotFilename?: string;

  @Prop({
    type: { x1: Number, y1: Number, x2: Number, y2: Number },
    _id: false,
  })
  bbox?: { x1: number; y1: number; x2: number; y2: number };

  @Prop()
  cameraId?: string;

  @Prop()
  deviceId?: string;

  @Prop()
  rawCctvEventId?: string;

  @Prop({ type: String, enum: ['yes', 'no'] })
  agentVerdict?: 'yes' | 'no';

  @Prop()
  agentModel?: string;

  @Prop()
  agentRaw?: string;

  @Prop()
  weightedScore?: number;

  @Prop({
    type: String,
    enum: Object.values(IncidentNotifyType),
  })
  notifyType?: IncidentNotifyTypeValue;

  @Prop()
  finalizedAt?: Date;
}

export const FallIncidentSchema = SchemaFactory.createForClass(FallIncident);

FallIncidentSchema.index({ scopeId: 1, state: 1 });
FallIncidentSchema.index({ scopeId: 1, createdAt: -1 });
FallIncidentSchema.index({ state: 1, createdAt: -1 });
