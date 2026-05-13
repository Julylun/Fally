import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.getSnapshotDir(), { recursive: true });
  }

  getSnapshotDir(): string {
    const dir = this.config.get<string>('SNAPSHOT_DIR', './data/snapshots');
    return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
  }

  async saveSnapshot(buffer: Buffer): Promise<string> {
    const filename = `${randomUUID()}.jpg`;
    const fullPath = path.join(this.getSnapshotDir(), filename);
    await fs.writeFile(fullPath, buffer);
    this.logger.debug(`Saved snapshot ${filename}`);
    return filename;
  }

  getSnapshotAbsolutePath(filename: string): string {
    return path.join(this.getSnapshotDir(), path.basename(filename));
  }
}
