
import { Module } from '@nestjs/common';
import { DemoController } from './demo.controller';
import { EventsModule } from '../events/events.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { FallAgentModule } from '../fall-agent/fall-agent.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [EventsModule, IncidentsModule, FallAgentModule, StorageModule],
  controllers: [DemoController],
})
export class DemoModule {}

