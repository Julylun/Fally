import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EdgeTokenGuard } from '../auth/edge-token.guard';
import { IncidentsService } from './incidents.service';
import { MobileFallDto } from './dto/mobile-fall.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';

@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Post('mobile-fall')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(EdgeTokenGuard)
  async mobileFall(@Body() body: MobileFallDto) {
    const scopeId = this.incidentsService.resolveScopeId(body.scopeId);
    const outcome = await this.incidentsService.onMobileFall({
      detectedAt: new Date(body.detectedAt),
      confidence: body.confidence,
      scopeId,
      deviceId: body.deviceId,
    });
    return {
      incidentId: outcome.id,
      state: outcome.state,
      notifyType: outcome.notifyType,
    };
  }

  @Get()
  async list(@Query() query: QueryIncidentsDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    return this.incidentsService.findAll(limit, page);
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.incidentsService.findOne(id);
  }
}
