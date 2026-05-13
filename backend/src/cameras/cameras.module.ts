import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FallEvent, FallEventSchema } from '../events/schemas/fall-event.schema';
import { CamerasService } from './cameras.service';
import { CamerasController } from './cameras.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FallEvent.name, schema: FallEventSchema }]),
  ],
  controllers: [CamerasController],
  providers: [CamerasService],
})
export class CamerasModule {}
