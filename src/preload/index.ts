import * as electron from "electron";
import { IPC_CHANNELS } from "../shared/constants/ipc.js";
import type { DjSetArchitectApi } from "../shared/types/preload.js";
import type { GenerateSetRequest } from "../shared/types/domain.js";

const { contextBridge, ipcRenderer } = electron;

const api: DjSetArchitectApi = {
  library: {
    importAppleMusicXml: () => ipcRenderer.invoke(IPC_CHANNELS.libraryImportAppleMusicXml)
  },
  tracks: {
    search: (input) => ipcRenderer.invoke(IPC_CHANNELS.tracksSearch, input),
    getById: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.tracksGetById, id)
  },
  analysis: {
    runBatch: () => ipcRenderer.invoke(IPC_CHANNELS.analysisRunBatch),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.analysisGetStatus),
    prune: () => ipcRenderer.invoke(IPC_CHANNELS.analysisPrune)
  },
  sets: {
    generate: (request: GenerateSetRequest) => ipcRenderer.invoke(IPC_CHANNELS.setsGenerate, request),
    getDraft: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.setsGetDraft, id)
  },
  exports: {
    toJson: (setId: string) => ipcRenderer.invoke(IPC_CHANNELS.exportsJson, setId),
    toCsv: (setId: string) => ipcRenderer.invoke(IPC_CHANNELS.exportsCsv, setId)
  }
};

contextBridge.exposeInMainWorld("djSetArchitect", api);
