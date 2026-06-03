import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FallAgentModule } from '../fall-agent/fall-agent.module';
import { EdgeTokenGuard } from '../auth/edge-token.guard';
import { FallIncident, FallIncidentSchema } from './schemas/fall-incident.schema';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FallIncident.name, schema: FallIncidentSchema },
    ]),
    FallAgentModule,
  ],
  controllers: [IncidentsController],
  providers: [IncidentsService, EdgeTokenGuard],
  exports: [IncidentsService],
})
export class IncidentsModule {}
