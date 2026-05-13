import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { MongooseModule } from '@nestjs/mongoose';
import { memoryStorage } from 'multer';
import { FallEvent, FallEventSchema } from './schemas/fall-event.schema';
import { EventsService } from './events.service';
import { EventsController, SnapshotsController } from './events.controller';
import { EdgeTokenGuard } from '../auth/edge-token.guard';

@Module({
  imports: [
    MulterModule.register({ storage: memoryStorage() }),
    MongooseModule.forFeature([{ name: FallEvent.name, schema: FallEventSchema }]),
  ],
  controllers: [EventsController, SnapshotsController],
  providers: [EventsService, EdgeTokenGuard],
  exports: [EventsService, MongooseModule],
})
export class EventsModule {}
