import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { FallAgentService } from '../fall-agent/fall-agent.service';
import { StorageService } from '../storage/storage.service';
import { IncidentsService } from './incidents.service';
import { FallIncident } from './schemas/fall-incident.schema';

const WINDOW_MS = 10_000;

function execOf<T>(value: T): { exec: jest.Mock } {
  return { exec: jest.fn().mockResolvedValue(value) };
}

function sortExecOf<T>(value: T): { sort: jest.Mock } {
  return { sort: jest.fn().mockReturnValue(execOf(value)) };
}

function leanExecOf<T>(value: T): { lean: jest.Mock } {
  return { lean: jest.fn().mockReturnValue(execOf(value)) };
}

describe('IncidentsService', () => {
  let service: IncidentsService;
  let fallAgent: { analyze: jest.Mock };
  let storage: { getSnapshotAbsolutePath: jest.Mock };
  let findOne: jest.Mock;
  let findOneAndUpdate: jest.Mock;
  let create: jest.Mock;
  let findById: jest.Mock;
  let notifyLogs: string[];

  const scopeId = 'default';
  const baseConfig: Record<string, unknown> = {
    CORRELATION_WINDOW_MS: WINDOW_MS,
    CCTV_WEIGHT: 0.7,
    AGENT_WEIGHT: 0.3,
    INCIDENT_SCOPE_ID: scopeId,
    GEMINI_MODEL: 'gemini-2.0-flash',
  };

  beforeEach(async () => {
    jest.useFakeTimers();

    findOne = jest.fn().mockReturnValue(sortExecOf(null));
    findOneAndUpdate = jest.fn().mockReturnValue(execOf(null));
    create = jest.fn();
    findById = jest.fn();

    const mockModel = function MockModel() {
      return mockModel;
    };
    (mockModel as unknown as { findOne: jest.Mock }).findOne = findOne;
    (mockModel as unknown as { findOneAndUpdate: jest.Mock }).findOneAndUpdate =
      findOneAndUpdate;
    (mockModel as unknown as { create: jest.Mock }).create = create;
    (mockModel as unknown as { findById: jest.Mock }).findById = findById;

    fallAgent = { analyze: jest.fn() };
    storage = {
      getSnapshotAbsolutePath: jest.fn().mockReturnValue('/tmp/snap.jpg'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentsService,
        { provide: getModelToken(FallIncident.name), useValue: mockModel },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def?: unknown) => baseConfig[key] ?? def,
          },
        },
        { provide: FallAgentService, useValue: fallAgent },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    service = module.get(IncidentsService);

    // Capture every Nest Logger.log invocation (including the singleton
    // logger inside IncidentsService) so we can assert exactly one
    // Notify line per finalized incident.
    notifyLogs = [];
    jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((message: unknown) => {
        const text = typeof message === 'string' ? message : String(message);
        if (text.startsWith('Notify:')) {
          notifyLogs.push(text);
        }
      });
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('mobile-first, no CCTV: timer finalizes MOBILE_ONLY with single notify', async () => {
    const oid = new Types.ObjectId();

    findOne.mockReturnValueOnce(sortExecOf(null));
    create.mockResolvedValueOnce({ _id: oid });

    const out = await service.onMobileFall({
      detectedAt: new Date('2026-05-14T10:00:00.000Z'),
      confidence: 0.9,
      scopeId,
    });
    expect(out.state).toBe('PENDING_CORRELATION');
    expect(out.notifyType).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);

    findOneAndUpdate.mockReturnValueOnce(
      execOf({
        _id: oid,
        state: 'FINALIZED',
        notifyType: 'MOBILE_ONLY',
        mobileConfidence: 0.9,
      }),
    );

    await jest.advanceTimersByTimeAsync(WINDOW_MS);

    const finalizeCall = findOneAndUpdate.mock.calls.find(
      (call) => call[1]?.$set?.notifyType === 'MOBILE_ONLY',
    );
    expect(finalizeCall).toBeDefined();
    expect(finalizeCall?.[0]).toMatchObject({
      state: 'PENDING_CORRELATION',
    });
    expect(fallAgent.analyze).not.toHaveBeenCalled();

    expect(notifyLogs).toHaveLength(1);
    expect(notifyLogs[0]).toContain(`incident=${oid.toString()}`);
    expect(notifyLogs[0]).toContain('type=MOBILE_ONLY');
  });

  it('mobile then CCTV within window: FINALIZED MOBILE_AND_CCTV immediately, no Gemini, single notify', async () => {
    const oid = new Types.ObjectId();

    findOne.mockReturnValueOnce(sortExecOf(null));
    create.mockResolvedValueOnce({ _id: oid });

    const mobileOut = await service.onMobileFall({
      detectedAt: new Date('2026-05-14T10:00:00.000Z'),
      confidence: 0.9,
      scopeId,
    });
    expect(mobileOut.state).toBe('PENDING_CORRELATION');

    const pendingMobileFirst = {
      _id: oid,
      state: 'PENDING_CORRELATION',
      mobileDetected: true,
      cctvDetected: false,
      mobileConfidence: 0.9,
      detectedAt: new Date('2026-05-14T10:00:00.000Z'),
    };
    findOne.mockReturnValueOnce(sortExecOf(pendingMobileFirst));
    findOneAndUpdate.mockReturnValueOnce(
      execOf({
        ...pendingMobileFirst,
        cctvDetected: true,
        cctvConfidence: 0.8,
        state: 'FINALIZED',
        notifyType: 'MOBILE_AND_CCTV',
      }),
    );

    const cctvOut = await service.onCctvFall({
      detectedAt: new Date('2026-05-14T10:00:03.000Z'),
      confidence: 0.8,
      label: 'fall',
      bbox: { x1: 0, y1: 0, x2: 1, y2: 1 },
      snapshotFilename: 'b.jpg',
      cameraId: 'cam-1',
      scopeId,
      rawCctvEventId: 'evt2',
    });

    expect(cctvOut.state).toBe('FINALIZED');
    expect(cctvOut.notifyType).toBe('MOBILE_AND_CCTV');
    expect(fallAgent.analyze).not.toHaveBeenCalled();

    // Advance past the window: the original mobile-first timer must NOT
    // produce a second notify because the incident is already FINALIZED
    // and the timer was cleared on the CCTV-arrival transition.
    findOneAndUpdate.mockReturnValueOnce(execOf(null));
    await jest.advanceTimersByTimeAsync(WINDOW_MS * 2);

    expect(notifyLogs).toHaveLength(1);
    expect(notifyLogs[0]).toContain(`incident=${oid.toString()}`);
    expect(notifyLogs[0]).toContain('type=MOBILE_AND_CCTV');
  });

  it('cctv-first, no mobile, agent yes: timer finalizes CCTV_AGENT_WEIGHTED with single notify', async () => {
    const oid = new Types.ObjectId();

    findOne.mockReturnValueOnce(sortExecOf(null));
    create.mockResolvedValueOnce({ _id: oid });

    const out = await service.onCctvFall({
      detectedAt: new Date('2026-05-14T10:00:00.000Z'),
      confidence: 0.75,
      label: 'fall',
      bbox: { x1: 0, y1: 0, x2: 1, y2: 1 },
      snapshotFilename: 'a.jpg',
      cameraId: 'cam-1',
      scopeId,
      rawCctvEventId: 'evt1',
    });
    expect(out.state).toBe('PENDING_CORRELATION');

    findById.mockReturnValueOnce(
      leanExecOf({
        _id: oid,
        state: 'PENDING_CORRELATION',
        cctvDetected: true,
        mobileDetected: false,
        cctvConfidence: 0.75,
        snapshotFilename: 'a.jpg',
      }),
    );
    fallAgent.analyze.mockResolvedValueOnce({
      verdict: 'yes',
      confidence: 0.8,
      raw: '{"fall":true}',
    });
    findOneAndUpdate.mockReturnValueOnce(
      execOf({
        _id: oid,
        state: 'FINALIZED',
        notifyType: 'CCTV_AGENT_WEIGHTED',
        weightedScore: 0.7 * 0.75 + 0.3 * 0.8,
      }),
    );

    await jest.advanceTimersByTimeAsync(WINDOW_MS);

    expect(storage.getSnapshotAbsolutePath).toHaveBeenCalledWith('a.jpg');
    expect(fallAgent.analyze).toHaveBeenCalledWith('/tmp/snap.jpg');

    const finalizeCall = findOneAndUpdate.mock.calls.find(
      (call) => call[1]?.$set?.notifyType === 'CCTV_AGENT_WEIGHTED',
    );
    expect(finalizeCall).toBeDefined();
    expect(finalizeCall?.[1].$set.agentVerdict).toBe('yes');
    expect(finalizeCall?.[1].$set.agentModel).toBe('gemini-2.0-flash');
    expect(finalizeCall?.[1].$set.weightedScore).toBeCloseTo(
      0.7 * 0.75 + 0.3 * 0.8,
    );

    expect(notifyLogs).toHaveLength(1);
    expect(notifyLogs[0]).toContain('type=CCTV_AGENT_WEIGHTED');
  });

  it('cctv-first, agent no: REJECTED_BY_AGENT with no notify', async () => {
    const oid = new Types.ObjectId();

    findOne.mockReturnValueOnce(sortExecOf(null));
    create.mockResolvedValueOnce({ _id: oid });

    await service.onCctvFall({
      detectedAt: new Date('2026-05-14T10:00:00.000Z'),
      confidence: 0.5,
      label: 'fall',
      bbox: { x1: 0, y1: 0, x2: 1, y2: 1 },
      snapshotFilename: 'a.jpg',
      cameraId: 'cam-1',
      scopeId,
      rawCctvEventId: 'evt-no',
    });

    findById.mockReturnValueOnce(
      leanExecOf({
        _id: oid,
        state: 'PENDING_CORRELATION',
        cctvDetected: true,
        mobileDetected: false,
        cctvConfidence: 0.5,
        snapshotFilename: 'a.jpg',
      }),
    );
    fallAgent.analyze.mockResolvedValueOnce({
      verdict: 'no',
      confidence: 0.2,
      raw: '{"fall":false}',
    });
    findOneAndUpdate.mockReturnValueOnce(execOf({ _id: oid }));

    await jest.advanceTimersByTimeAsync(WINDOW_MS);

    const rejectCall = findOneAndUpdate.mock.calls.find(
      (call) => call[1]?.$set?.state === 'REJECTED_BY_AGENT',
    );
    expect(rejectCall).toBeDefined();
    expect(rejectCall?.[1].$set.agentVerdict).toBe('no');
    expect(rejectCall?.[1].$set.finalizedAt).toBeInstanceOf(Date);

    expect(notifyLogs).toHaveLength(0);
  });

  it('cctv then mobile within window: FINALIZED MOBILE_AND_CCTV, Gemini never called', async () => {
    const oid = new Types.ObjectId();

    findOne.mockReturnValueOnce(sortExecOf(null));
    create.mockResolvedValueOnce({ _id: oid });

    const cctvOut = await service.onCctvFall({
      detectedAt: new Date('2026-05-14T11:00:00.000Z'),
      confidence: 0.7,
      label: 'fall',
      bbox: { x1: 0, y1: 0, x2: 1, y2: 1 },
      snapshotFilename: 'c.jpg',
      cameraId: 'cam-1',
      scopeId,
      rawCctvEventId: 'evt3',
    });
    expect(cctvOut.state).toBe('PENDING_CORRELATION');

    const pendingCctvFirst = {
      _id: oid,
      state: 'PENDING_CORRELATION',
      mobileDetected: false,
      cctvDetected: true,
      cctvConfidence: 0.7,
      detectedAt: new Date('2026-05-14T11:00:00.000Z'),
    };
    findOne.mockReturnValueOnce(sortExecOf(pendingCctvFirst));
    findOneAndUpdate.mockReturnValueOnce(
      execOf({
        ...pendingCctvFirst,
        mobileDetected: true,
        mobileConfidence: 0.9,
        state: 'FINALIZED',
        notifyType: 'MOBILE_AND_CCTV',
      }),
    );

    const mobileOut = await service.onMobileFall({
      detectedAt: new Date('2026-05-14T11:00:02.000Z'),
      confidence: 0.9,
      scopeId,
    });

    expect(mobileOut.state).toBe('FINALIZED');
    expect(mobileOut.notifyType).toBe('MOBILE_AND_CCTV');

    // Drive the original CCTV timer past expiry; it must NOT run Gemini
    // because the timer was cleared on the mobile-arrival transition.
    await jest.advanceTimersByTimeAsync(WINDOW_MS * 2);

    expect(fallAgent.analyze).not.toHaveBeenCalled();
    expect(findById).not.toHaveBeenCalled();

    expect(notifyLogs).toHaveLength(1);
    expect(notifyLogs[0]).toContain('type=MOBILE_AND_CCTV');
  });

  it('onModuleDestroy clears pending timers (no notify after shutdown)', async () => {
    findOne.mockReturnValueOnce(sortExecOf(null));
    create.mockResolvedValueOnce({ _id: new Types.ObjectId() });

    await service.onMobileFall({
      detectedAt: new Date('2026-05-14T12:00:00.000Z'),
      confidence: 0.6,
      scopeId,
    });

    service.onModuleDestroy();

    await jest.advanceTimersByTimeAsync(WINDOW_MS * 3);

    const finalizeCall = findOneAndUpdate.mock.calls.find(
      (call) => call[1]?.$set?.notifyType === 'MOBILE_ONLY',
    );
    expect(finalizeCall).toBeUndefined();
    expect(notifyLogs).toHaveLength(0);
  });
});
