import * as electron from "electron";
import type { AppDatabase } from "../db/database.js";
import { IPC_CHANNELS } from "../../shared/constants/ipc.js";
import {
  exportSetSchema,
  generateSetRequestSchema,
  trackIdSchema,
  trackSearchSchema
} from "../../shared/validation/schemas.js";
import { parseAppleMusicXmlFile } from "../importers/appleMusicXmlImporter.js";
import { generateSetDraft } from "../../domain/set-generation/beamSearch.js";
import { exportSetDraftToCsv, exportSetDraftToJson } from "../../domain/export/exporters.js";
import { EssentiaAudioFeatureProvider } from "../adapters/essentia/EssentiaAudioFeatureProvider.js";
import { OpenKeyScanAdapter, StubKeyDetectionProvider } from "../adapters/openkeyscan/OpenKeyScanAdapter.js";
import { mergeFeatureResults } from "../../domain/features/normalization.js";
import type { FeatureCoverage } from "../../shared/types/domain.js";

const { dialog, ipcMain } = electron;

export function registerIpcHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.libraryImportAppleMusicXml, async () => {
    const selection = await dialog.showOpenDialog({
      title: "Import Apple Music XML Library",
      properties: ["openFile"],
      filters: [{ name: "Apple Music XML", extensions: ["xml"] }]
    });
    if (selection.canceled || selection.filePaths.length === 0) {
      return null;
    }
    const job = db.createJob("library_import");
    try {
      db.updateJob(job.id, { status: "running", progress: 0.1 });
      const parsed = await parseAppleMusicXmlFile(selection.filePaths[0]);
      const result = db.importTracks(parsed.tracks);
      db.updateJob(job.id, { status: "completed", progress: 1 });
      return result;
    } catch (error) {
      db.updateJob(job.id, {
        status: "failed",
        progress: 1,
        error: error instanceof Error ? error.message : "Import failed"
      });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.tracksSearch, (_event, input) => {
    const parsed = trackSearchSchema.parse(input ?? {});
    return db.searchTracks(parsed);
  });

  ipcMain.handle(IPC_CHANNELS.tracksGetById, (_event, input) => {
    const parsed = trackIdSchema.parse({ id: input });
    return db.getTrackById(parsed.id);
  });

  ipcMain.handle(IPC_CHANNELS.analysisGetStatus, () => getAnalysisStatus(db));

  ipcMain.handle(IPC_CHANNELS.analysisPrune, () => {
    db.pruneAnalysisData();
    return getAnalysisStatus(db);
  });

  ipcMain.handle(IPC_CHANNELS.analysisRunBatch, async () => {
    const job = db.createJob("feature_analysis");
    const tracks = db.getTracksNeedingAnalysis();
    const audioProvider = new EssentiaAudioFeatureProvider();
    const openKeyScan = new OpenKeyScanAdapter();
    const keyProvider = (await openKeyScan.isAvailable()) ? openKeyScan : new StubKeyDetectionProvider();

    try {
      db.updateJob(job.id, { status: "running", progress: 0 });
      for (let index = 0; index < tracks.length; index += 1) {
        const track = tracks[index];
        const [audio, key] = await Promise.all([audioProvider.analyze(track), keyProvider.analyze(track)]);
        db.upsertFeature(mergeFeatureResults(track, track.features, audio, key));
        db.updateJob(job.id, { progress: tracks.length === 0 ? 1 : (index + 1) / tracks.length });
      }
      db.updateJob(job.id, { status: "completed", progress: 1 });
      return getAnalysisStatus(db);
    } catch (error) {
      db.updateJob(job.id, {
        status: "failed",
        progress: 1,
        error: error instanceof Error ? error.message : "Feature analysis failed"
      });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.setsGenerate, (_event, input) => {
    const parsed = generateSetRequestSchema.parse(input);
    const draft = generateSetDraft(db.getAllTracksForGeneration(), parsed);
    db.saveSetDraft(draft);
    return draft;
  });

  ipcMain.handle(IPC_CHANNELS.setsGetDraft, (_event, input) => {
    const parsed = exportSetSchema.parse({ setId: input });
    return db.getSetDraft(parsed.setId);
  });

  ipcMain.handle(IPC_CHANNELS.exportsJson, (_event, input) => {
    const parsed = exportSetSchema.parse({ setId: input });
    const draft = db.getSetDraft(parsed.setId);
    if (!draft) {
      throw new Error("Set draft not found");
    }
    return exportSetDraftToJson(draft);
  });

  ipcMain.handle(IPC_CHANNELS.exportsCsv, (_event, input) => {
    const parsed = exportSetSchema.parse({ setId: input });
    const draft = db.getSetDraft(parsed.setId);
    if (!draft) {
      throw new Error("Set draft not found");
    }
    return exportSetDraftToCsv(draft);
  });
}

async function getAnalysisStatus(db: AppDatabase): Promise<FeatureCoverage> {
  const openKeyScan = new OpenKeyScanAdapter();
  return {
    ...db.getCoverage(),
    openKeyScan: await openKeyScan.getHealth()
  };
}
