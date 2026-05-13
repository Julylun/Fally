import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Response } from 'express';
import * as fsp from 'fs/promises';
import { EventsService } from './events.service';
import { EdgeTokenGuard } from '../auth/edge-token.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { QueryEventsDto } from './dto/query-events.dto';
import { PatchEventDto } from './dto/patch-event.dto';
import { StorageService } from '../storage/storage.service';

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly storageService: StorageService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(EdgeTokenGuard)
  @UseInterceptors(FileInterceptor('snapshot'))
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body('payload') payloadRaw: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('snapshot file is required');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadRaw ?? '{}');
    } catch {
      throw new BadRequestException('payload must be valid JSON');
    }
    const dto = plainToInstance(CreateEventDto, parsed);
    const errors = await validate(dto);
    if (errors.length) {
      throw new BadRequestException(errors);
    }
    const filename = await this.storageService.saveSnapshot(file.buffer);
    return this.eventsService.create(dto, filename);
  }

  @Get()
  findAll(@Query() query: QueryEventsDto) {
    return this.eventsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }

  @Patch(':id')
  patch(@Param('id') id: string, @Body() body: PatchEventDto) {
    return this.eventsService.patch(id, body);
  }
}

@Controller('snapshots')
export class SnapshotsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly storageService: StorageService,
  ) {}

  @Get(':eventId')
  async sendSnapshot(
    @Param('eventId') eventId: string,
    @Res() res: Response,
  ): Promise<void> {
    const filename = await this.eventsService.getSnapshotFilenameOrThrow(
      eventId,
    );
    const absPath = this.storageService.getSnapshotAbsolutePath(filename);
    try {
      await fsp.access(absPath);
    } catch {
      throw new NotFoundException('Snapshot file missing');
    }
    res.sendFile(absPath);
  }
}
