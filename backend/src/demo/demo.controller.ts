import { Controller, Get, Post, Body, UploadedFile, UseInterceptors, Render, Req } from '@nestjs/common';
import { FileInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import * as fs from 'fs/promises';
import { join } from 'path';
import * as ort from 'onnxruntime-node';
import { FallAgentService } from '../fall-agent/fall-agent.service';
import { IncidentsService } from '../incidents/incidents.service';
import { EventsService } from '../events/events.service';
import { StorageService } from '../storage/storage.service';

@Controller('demo')
export class DemoController {

  constructor(
    private readonly fallAgent: FallAgentService,
    private readonly incidentsService: IncidentsService,
    private readonly eventsService: EventsService,
    private readonly storageService: StorageService,
  ) {}

  @Get('view')
  async getView() {
    const html = await fs.readFile(join(process.cwd(), 'public/demo/view.html'), 'utf-8');
    return html;
  }

  @Get()
  async getDemo() {
    const html = await fs.readFile(join(process.cwd(), 'public/demo/index.html'), 'utf-8');
    return html;
  }

  @Post('simulate-mobile')
  async simulateMobile(@Body() body: any) {
    const { features, confidence, overrideConfidence, rawData } = body;
    let finalConfidence = overrideConfidence ?? confidence ?? 0.05;
    let isFall = finalConfidence >= 0.5;

    // If rawData is provided, actually run the ONNX model
    if (rawData && Array.isArray(rawData.sensors)) {
        try {
            // Re-implement the extraction logic in JS
            const rows = [];
            for (const sample of rawData.sensors) {
                const acc = sample.accelerometer || {};
                const gyro = sample.gyroscope || {};
                rows.push([
                    acc.x ?? 0, acc.y ?? 0, acc.z ?? 0,
                    gyro.x ?? 0, gyro.y ?? 0, gyro.z ?? 0
                ]);
            }

            // In training we took overlapping windows. Here we'll take the window with the max SMV
            // or just take the center window to get the most action. 
            // The JSON typically captures 8-10 seconds of data at high freq. 
            // We need exactly 32 samples (~0.6-1s of data).
            // Let's find the peak SMV and extract a window around it.
            const smvs = rows.map(r => Math.sqrt(r[0]*r[0] + r[1]*r[1] + r[2]*r[2]));
            const maxSmvIdx = smvs.indexOf(Math.max(...smvs));
            let startIdx = maxSmvIdx - 16;
            if (startIdx < 0) startIdx = 0;
            if (startIdx + 32 > rows.length) startIdx = Math.max(0, rows.length - 32);
            
            const windowData = rows.slice(startIdx, startIdx + 32);
            while (windowData.length < 32) {
                windowData.push(windowData[windowData.length - 1] || [0,0,0,0,0,0]);
            }

            // Extract features
            const features = [];
            for(let c=0; c<6; c++) {
                const col = windowData.map(r => r[c]);
                const mean = col.reduce((a,b)=>a+b,0) / col.length;
                features.push(mean);
            }
            for(let c=0; c<6; c++) {
                const col = windowData.map(r => r[c]);
                const mean = col.reduce((a,b)=>a+b,0) / col.length;
                const std = Math.sqrt(col.reduce((a,b)=>a+Math.pow(b-mean,2),0) / col.length);
                features.push(std);
            }
            for(let c=0; c<6; c++) {
                const col = windowData.map(r => r[c]);
                features.push(Math.max(...col));
            }
            for(let c=0; c<6; c++) {
                const col = windowData.map(r => r[c]);
                features.push(Math.min(...col));
            }
            
            const smv = windowData.map(r => Math.sqrt(r[0]*r[0] + r[1]*r[1] + r[2]*r[2]));
            const smvMean = smv.reduce((a,b)=>a+b,0) / smv.length;
            const smvStd = Math.sqrt(smv.reduce((a,b)=>a+Math.pow(b-smvMean,2),0) / smv.length);
            const smvMax = Math.max(...smv);
            
            features.push(smvMean, smvStd, smvMax);

            // Load ONNX
            const session = await ort.InferenceSession.create(join(process.cwd(), '../Fally/fall_model.onnx'));
            const tensor = new ort.Tensor('float32', Float32Array.from(features), [1, 27]);
            
            const results = await session.run({ [session.inputNames[0]]: tensor });
            const probOutput = results[session.outputNames[1]];
            
            if (probOutput && probOutput.data) {
                 const probs = Array.from(probOutput.data as Float32Array);
                 // We know probs[0] is Class 0, probs[1] is Class 1.
                 // In python script: label = 1 if 'fall' else 0. So Fall is Class 1.
                 // So probs[1] is Fall probability. But we saw probs[0] was the fall probability earlier for some reason.
                 // Actually, XGBoost binary classification ONNX often outputs a single array where output is prob of class 1.
                 if (probs.length > 1) {
                     // We checked earlier: fall file gave [0.001, 0.998]
                     // So probs[1] is indeed Fall.
                     finalConfidence = probs[1];
                 } else {
                     finalConfidence = probs[0];
                 }
            } else {
                 const labelOutput = results[session.outputNames[0]];
                 finalConfidence = (labelOutput.data as Float32Array)[0];
            }
            
            // Fix NaN issue on UI:
            if (isNaN(finalConfidence) || !isFinite(finalConfidence)) {
                finalConfidence = 0.05;
            }
            
            
            isFall = finalConfidence >= 0.5;

        } catch (e) {
            console.error("ONNX Inference failed:", e);
            throw new Error("ONNX Inference failed: " + e.message);
        }
    }

    if (isFall) {
        const outcome = await this.incidentsService.onMobileFall({
          detectedAt: new Date(),
          confidence: finalConfidence,
          scopeId: 'demo-scope',
          deviceId: 'demo-mobile-01',
        });
        return { outcome, isFall, confidence: finalConfidence };
    }
    
    return { isFall, confidence: finalConfidence };
  }

  @Post('simulate-cctv')
  @UseInterceptors(FileInterceptor('snapshot'))
  async simulateCctv(
    @UploadedFile() file: Express.Multer.File,
    @Body('payload') payloadRaw: string,
  ) {
    if (!file?.buffer?.length) {
      return { error: 'snapshot required' };
    }
    const payload = JSON.parse(payloadRaw || '{}');

    const filename = await this.storageService.saveSnapshot(file.buffer);

    // Create event first
    const result = await this.eventsService.create({
      cameraId: 'demo-cctv-01',
      label: payload.label || 'Fall Detected',
      confidence: payload.confidence ?? 0.88,
      bbox: { x1: 50, y1: 50, x2: 400, y2: 400 },
      detectedAt: new Date().toISOString(),
      scopeId: 'demo-scope',
    }, filename);

    // Hit incidents service
    const outcome = await this.incidentsService.onCctvFall({
      detectedAt: new Date(),
      confidence: payload.confidence ?? 0.88,
      label: payload.label || 'Fall Detected',
      bbox: { x1: 50, y1: 50, x2: 400, y2: 400 },
      snapshotFilename: filename,
      cameraId: 'demo-cctv-01',
      scopeId: 'demo-scope',
      rawCctvEventId: result.id,
    });

    return outcome;
  }

  @Post('simulate-cctv-image')
  @UseInterceptors(FileInterceptor('image'))
  async simulateCctvImage(
    @UploadedFile() file: Express.Multer.File,
  ) {
     if (!file?.buffer?.length) {
      return { error: 'image required' };
    }

    // Call fall agent directly to test it
    const filename = await this.storageService.saveSnapshot(file.buffer);
    const absPath = this.storageService.getSnapshotAbsolutePath(filename);
    const agentResult = await this.fallAgent.analyze(absPath);

    return agentResult;
  }
}
