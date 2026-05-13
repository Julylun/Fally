import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class EdgeTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('EDGE_SHARED_TOKEN');
    if (!expected) {
      throw new UnauthorizedException('EDGE_SHARED_TOKEN is not configured');
    }
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.header('x-edge-token');
    if (!token || token !== expected) {
      throw new UnauthorizedException('Invalid or missing X-Edge-Token');
    }
    return true;
  }
}
