import type { FeatureCoverage, GenerateSetRequest, ImportResult, SetDraft, TrackWithFeatures } from "./domain.js";

export interface DjSetArchitectApi {
  library: {
    importAppleMusicXml: () => Promise<ImportResult | null>;
  };
  tracks: {
    search: (input?: { query?: string; limit?: number }) => Promise<TrackWithFeatures[]>;
    getById: (id: string) => Promise<TrackWithFeatures | null>;
  };
  analysis: {
    runBatch: () => Promise<FeatureCoverage>;
    getStatus: () => Promise<FeatureCoverage>;
    prune: () => Promise<FeatureCoverage>;
  };
  sets: {
    generate: (request: GenerateSetRequest) => Promise<SetDraft>;
    getDraft: (id: string) => Promise<SetDraft | null>;
  };
  exports: {
    toJson: (setId: string) => Promise<string>;
    toCsv: (setId: string) => Promise<string>;
  };
}

declare global {
  interface Window {
    djSetArchitect: DjSetArchitectApi;
  }
}
