export const IPC_CHANNELS = {
  libraryImportAppleMusicXml: "library:importAppleMusicXml",
  tracksSearch: "tracks:search",
  tracksGetById: "tracks:getById",
  analysisRunBatch: "analysis:runBatch",
  analysisGetStatus: "analysis:getStatus",
  setsGenerate: "sets:generate",
  setsGetDraft: "sets:getDraft",
  exportsJson: "exports:json",
  exportsCsv: "exports:csv"
} as const;
