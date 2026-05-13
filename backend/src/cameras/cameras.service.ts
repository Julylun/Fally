import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FallEvent, FallEventDocument } from '../events/schemas/fall-event.schema';

export type CameraRow = {
  cameraId: string;
  lastSeen: Date | null;
  eventsLast24h: number;
  fallsLast24h: number;
};

@Injectable()
export class CamerasService {
  private static readonly FALL_LABEL = 'Fall Detected';

  constructor(
    @InjectModel(FallEvent.name)
    private readonly fallEventModel: Model<FallEventDocument>,
  ) {}

  async listCameras(): Promise<CameraRow[]> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await this.fallEventModel
      .aggregate<CameraRow>([
        {
          $group: {
            _id: '$cameraId',
            lastSeen: { $max: '$detectedAt' },
            eventsLast24h: {
              $sum: {
                $cond: [{ $gte: ['$detectedAt', since] }, 1, 0],
              },
            },
            fallsLast24h: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ['$detectedAt', since] },
                      { $eq: ['$label', CamerasService.FALL_LABEL] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { lastSeen: -1 } },
        {
          $project: {
            _id: 0,
            cameraId: '$_id',
            lastSeen: 1,
            eventsLast24h: 1,
            fallsLast24h: 1,
          },
        },
      ])
      .exec();
    return rows;
  }
}
