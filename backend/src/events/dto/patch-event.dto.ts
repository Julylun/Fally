import { IsBoolean } from 'class-validator';

export class PatchEventDto {
  @IsBoolean()
  resolved: boolean;
}
