import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FallEvent, FallEventDocument } from './schemas/fall-event.schema';
import { CreateEventDto } from './dto/create-event.dto';
import { QueryEventsDto } from './dto/query-events.dto';
import { PatchEventDto } from './dto/patch-event.dto';

@Injectable()
export class EventsService {
  constructor(
    @InjectModel(FallEvent.name)
    private readonly fallEventModel: Model<FallEventDocument>,
  ) {}

  async create(
    dto: CreateEventDto,
    snapshotFilename: string,
  ): Promise<{ id: string; snapshotUrl: string }> {
    const doc = await this.fallEventModel.create({
      cameraId: dto.cameraId,
      label: dto.label,
      confidence: dto.confidence,
      bbox: dto.bbox,
      detectedAt: new Date(dto.detectedAt),
      snapshotFilename,
      resolved: false,
    });
    const id = String(doc._id);
    return {
      id,
      snapshotUrl: `/api/v1/snapshots/${id}`,
    };
  }

  async findAll(query: QueryEventsDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const filter: Record<string, unknown> = {};

    if (query.cameraId) {
      filter.cameraId = query.cameraId;
    }
    if (query.label) {
      filter.label = query.label;
    }
    if (query.resolved !== undefined) {
      filter.resolved = query.resolved;
    }
    if (query.from || query.to) {
      filter.detectedAt = {} as Record<string, Date>;
      if (query.from) {
        (filter.detectedAt as Record<string, Date>).$gte = new Date(
          query.from,
        );
      }
      if (query.to) {
        (filter.detectedAt as Record<string, Date>).$lte = new Date(query.to);
      }
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.fallEventModel
        .find(filter)
        .sort({ detectedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.fallEventModel.countDocuments(filter).exec(),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      data: items.map((row) => this.serialize(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Event not found');
    }
    const doc = await this.fallEventModel.findById(id).lean().exec();
    if (!doc) {
      throw new NotFoundException('Event not found');
    }
    return this.serialize(doc);
  }

  async patch(id: string, dto: PatchEventDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Event not found');
    }
    const doc = await this.fallEventModel
      .findByIdAndUpdate(
        id,
        { $set: { resolved: dto.resolved } },
        { new: true },
      )
      .lean()
      .exec();
    if (!doc) {
      throw new NotFoundException('Event not found');
    }
    return this.serialize(doc);
  }

  async getSnapshotFilenameOrThrow(id: string): Promise<string> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Snapshot not found');
    }
    const doc = await this.fallEventModel
      .findById(id)
      .select('snapshotFilename')
      .lean()
      .exec();
    if (!doc?.snapshotFilename) {
      throw new NotFoundException('Snapshot not found');
    }
    return doc.snapshotFilename;
  }

  private serialize(row: Record<string, unknown>) {
    const { _id, __v, ...rest } = row;
    return { id: String(_id), ...rest };
  }
}
