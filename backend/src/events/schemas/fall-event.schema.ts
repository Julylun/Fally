import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FallEventDocument = HydratedDocument<FallEvent>;

@Schema({ timestamps: true, collection: 'fall_events' })
export class FallEvent {
  @Prop({ required: true, index: true })
  cameraId: string;

  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  confidence: number;

  @Prop({
    type: { x1: Number, y1: Number, x2: Number, y2: Number },
    _id: false,
    required: true,
  })
  bbox: { x1: number; y1: number; x2: number; y2: number };

  @Prop({ required: true, index: true })
  detectedAt: Date;

  @Prop()
  snapshotFilename?: string;

  @Prop({ default: false })
  resolved: boolean;
}

export const FallEventSchema = SchemaFactory.createForClass(FallEvent);
