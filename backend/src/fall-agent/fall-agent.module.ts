import { Module } from '@nestjs/common';
import { FallAgentService } from './fall-agent.service';

@Module({
  providers: [FallAgentService],
  exports: [FallAgentService],
})
export class FallAgentModule {}
