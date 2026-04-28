import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  EnergyCurve,
  FeatureCoverage,
  SetDraft,
  TrackWithFeatures,
  VariantProfile
} from "../../shared/types/domain";
import "./styles.css";

type View = "import" | "library" | "analysis" | "configure" | "draft" | "export";

const initialCoverage: FeatureCoverage = {
  trackCount: 0,
  withBpm: 0,
  withKey: 0,
  withEnergy: 0,
  withDanceability: 0,
  pendingJobs: 0,
  runningJobs: 0
};

function App() {
  const [view, setView] = useState<View>("import");
  const [tracks, setTracks] = useState<TrackWithFeatures[]>([]);
  const [coverage, setCoverage] = useState<FeatureCoverage>(initialCoverage);
  const [query, setQuery] = useState("");
  const [selectedSeeds, setSelectedSeeds] = useState<string[]>([]);
  const [targetMinutes, setTargetMinutes] = useState(60);
  const [toleranceMinutes, setToleranceMinutes] = useState(8);
  const [variantProfile, setVariantProfile] = useState<VariantProfile>("balanced");
  const [energyCurve, setEnergyCurve] = useState<EnergyCurve>("warmup_build_peak_cooldown");
  const [draft, setDraft] = useState<SetDraft | null>(null);
  const [exportText, setExportText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const hasElectronApi = typeof window !== "undefined" && Boolean(window.djSetArchitect);

  async function refresh() {
    const api = getApi();
    const [nextTracks, nextCoverage] = await Promise.all([
      api.tracks.search({ query, limit: 300 }),
      api.analysis.getStatus()
    ]);
    setTracks(nextTracks);
    setCoverage(nextCoverage);
  }

  async function refreshAnalysisStatus() {
    setCoverage(await getApi().analysis.getStatus());
  }

  useEffect(() => {
    if (!hasElectronApi) {
      setMessage("Electron preload API is unavailable. Start the app with npm run dev and use the Electron window, not the Vite browser tab.");
      return;
    }
    void refresh();
  }, []);

  useEffect(() => {
    if (!hasElectronApi) {
      return;
    }
    const shouldPoll = view === "analysis" || coverage.latestFeatureAnalysisJob?.status === "running";
    if (!shouldPoll) {
      return;
    }
    const interval = window.setInterval(() => {
      void refreshAnalysisStatus().catch((error) => {
        setMessage(error instanceof Error ? error.message : "Unable to refresh analysis status");
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [hasElectronApi, view, coverage.latestFeatureAnalysisJob?.status]);

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const selectedSeedTracks = useMemo(
    () => selectedSeeds.map((id) => tracks.find((track) => track.id === id)).filter(Boolean) as TrackWithFeatures[],
    [selectedSeeds, tracks]
  );

  return (
    <main className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Local-first MVP</p>
          <h1>DJ Set Architect</h1>
        </div>
        <nav>
          {(["import", "library", "analysis", "configure", "draft", "export"] as View[]).map((item) => (
            <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>
              {labelForView(item)}
            </button>
          ))}
        </nav>
        <div className="coverage">
          <strong>{coverage.trackCount}</strong>
          <span>tracks</span>
          <strong>{coverage.withEnergy}</strong>
          <span>analyzed</span>
        </div>
      </aside>

      <section className="workspace">
        {message && <div className="notice">{message}</div>}
        {view === "import" && (
          <section className="panel">
            <h2>Library Import</h2>
            <p>Import an Apple Music XML export. Files are selected through Electron, parsed in the main process, and stored in SQLite.</p>
            <button
              disabled={busy || !hasElectronApi}
              onClick={() =>
                runAction(async () => {
                  const result = await getApi().library.importAppleMusicXml();
                  if (result) {
                    setMessage(`Imported ${result.imported} tracks. Skipped ${result.skipped} duplicates.`);
                    await refresh();
                    setView("library");
                  }
                })
              }
            >
              Import Apple Music XML
            </button>
          </section>
        )}

        {view === "library" && (
          <section className="panel grow">
            <header className="sectionHeader">
              <div>
                <h2>Track Library</h2>
                <p>Search imported tracks and inspect normalized feature coverage.</p>
              </div>
              <div className="search">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, artist, album, genre" />
              <button disabled={busy || !hasElectronApi} onClick={() => runAction(refresh)}>
                  Search
                </button>
              </div>
            </header>
            <TrackTable tracks={tracks} selectedSeeds={selectedSeeds} onToggleSeed={toggleSeed} />
          </section>
        )}

        {view === "analysis" && (
          <section className="panel">
            <h2>Feature Analysis Status</h2>
            <div className="stats">
              <Stat label="BPM" value={`${coverage.withBpm}/${coverage.trackCount}`} />
              <Stat label="Key" value={`${coverage.withKey}/${coverage.trackCount}`} />
              <Stat label="Energy" value={`${coverage.withEnergy}/${coverage.trackCount}`} />
              <Stat label="Danceability" value={`${coverage.withDanceability}/${coverage.trackCount}`} />
            </div>
            <AnalysisProgress coverage={coverage} />
            <OpenKeyScanStatus coverage={coverage} />
            <div className="toolbar">
              <button disabled={busy || coverage.trackCount === 0 || !hasElectronApi} onClick={() => runAction(async () => setCoverage(await getApi().analysis.runBatch()))}>
                Run Batch Analysis
              </button>
              <button disabled={busy || !hasElectronApi} onClick={() => runAction(refreshAnalysisStatus)}>
                Refresh Status
              </button>
            </div>
          </section>
        )}

        {view === "configure" && (
          <section className="panel grow">
            <h2>Set Configuration</h2>
            <div className="formGrid">
              <label>
                Target duration minutes
                <input type="number" min="5" value={targetMinutes} onChange={(event) => setTargetMinutes(Number(event.target.value))} />
              </label>
              <label>
                Tolerance minutes
                <input type="number" min="0" value={toleranceMinutes} onChange={(event) => setToleranceMinutes(Number(event.target.value))} />
              </label>
              <label>
                Variant profile
                <select value={variantProfile} onChange={(event) => setVariantProfile(event.target.value as VariantProfile)}>
                  <option value="safe">Safe</option>
                  <option value="balanced">Balanced</option>
                  <option value="exploratory">Exploratory</option>
                </select>
              </label>
              <label>
                Energy curve
                <select value={energyCurve} onChange={(event) => setEnergyCurve(event.target.value as EnergyCurve)}>
                  <option value="warmup_build_peak_cooldown">Warmup, build, peak, cooldown</option>
                  <option value="flat_groove">Flat groove</option>
                  <option value="wave_pattern">Wave pattern</option>
                </select>
              </label>
            </div>
            <h3>Seed Track Selection</h3>
            <SeedList seeds={selectedSeedTracks} onRemove={(id) => setSelectedSeeds((current) => current.filter((seed) => seed !== id))} />
            <TrackTable tracks={tracks} selectedSeeds={selectedSeeds} onToggleSeed={toggleSeed} compact />
            <button
              disabled={busy || selectedSeeds.length === 0}
              onClick={() =>
                runAction(async () => {
                  const nextDraft = await getApi().sets.generate({
                    targetDurationSeconds: targetMinutes * 60,
                    durationToleranceSeconds: toleranceMinutes * 60,
                    seedTrackIds: selectedSeeds,
                    variantProfile,
                    energyCurve
                  });
                  setDraft(nextDraft);
                  setView("draft");
                })
              }
            >
              Generate Set Draft
            </button>
          </section>
        )}

        {view === "draft" && (
          <section className="panel grow">
            <h2>Generated Set Draft</h2>
            {draft ? <DraftView draft={draft} /> : <p>No draft generated yet.</p>}
          </section>
        )}

        {view === "export" && (
          <section className="panel grow">
            <h2>Export</h2>
            <div className="toolbar">
              <button
                disabled={!draft || busy}
                onClick={() => runAction(async () => setExportText(await getApi().exports.toJson(draft!.id)))}
              >
                Export JSON
              </button>
              <button
                disabled={!draft || busy}
                onClick={() => runAction(async () => setExportText(await getApi().exports.toCsv(draft!.id)))}
              >
                Export CSV
              </button>
            </div>
            <textarea value={exportText} readOnly placeholder="Generated export output appears here." />
          </section>
        )}
      </section>
    </main>
  );

  function toggleSeed(id: string) {
    setSelectedSeeds((current) => (current.includes(id) ? current.filter((seed) => seed !== id) : [...current, id]));
  }
}

function getApi() {
  if (!window.djSetArchitect) {
    throw new Error("Electron preload API is unavailable. Start the app with npm run dev and use the Electron window, not the Vite browser tab.");
  }
  return window.djSetArchitect;
}

function AnalysisProgress({ coverage }: { coverage: FeatureCoverage }) {
  const job = coverage.latestFeatureAnalysisJob;
  const progress = job ? Math.round(job.progress * 100) : 0;
  const label = job
    ? `${job.status} · ${progress}%`
    : "No feature analysis job has run yet";

  return (
    <section className="statusBlock">
      <div className="statusHeader">
        <div>
          <h3>Analysis Progress</h3>
          <p>{label}</p>
        </div>
        <strong>{progress}%</strong>
      </div>
      <div className="progressTrack" aria-label="Feature analysis progress">
        <div style={{ width: `${progress}%` }} />
      </div>
      {job?.error && <p className="inlineError">{job.error}</p>}
    </section>
  );
}

function OpenKeyScanStatus({ coverage }: { coverage: FeatureCoverage }) {
  const health = coverage.openKeyScan;
  const available = health?.available === true;
  return (
    <section className="statusBlock">
      <div className="statusHeader">
        <div>
          <h3>OpenKeyScan</h3>
          <p>{health?.url ?? "http://127.0.0.1:58721/health"}</p>
        </div>
        <span className={available ? "pill ok" : "pill warn"}>{available ? "available" : "unavailable"}</span>
      </div>
      <div className="statusMeta">
        <span>Status: {health?.status ?? "-"}</span>
        <span>Success: {health?.success == null ? "-" : String(health.success)}</span>
        <span>Timestamp: {health?.timestamp ?? "-"}</span>
      </div>
      {health?.error && <p className="inlineError">{health.error}</p>}
    </section>
  );
}

function TrackTable({
  tracks,
  selectedSeeds,
  onToggleSeed,
  compact
}: {
  tracks: TrackWithFeatures[];
  selectedSeeds: string[];
  onToggleSeed: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "tableWrap compact" : "tableWrap"}>
      <table>
        <thead>
          <tr>
            <th>Seed</th>
            <th>Title</th>
            <th>Artist</th>
            <th>BPM</th>
            <th>Key</th>
            <th>Energy</th>
            <th>Dance</th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((track) => (
            <tr key={track.id}>
              <td>
                <input type="checkbox" checked={selectedSeeds.includes(track.id)} onChange={() => onToggleSeed(track.id)} />
              </td>
              <td>{track.title}</td>
              <td>{track.artist}</td>
              <td>{track.features?.bpm ?? track.importedBpm ?? "-"}</td>
              <td>{track.features?.camelotKey ?? "-"}</td>
              <td>{formatScore(track.features?.energyScore)}</td>
              <td>{formatScore(track.features?.danceabilityScore)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeedList({ seeds, onRemove }: { seeds: TrackWithFeatures[]; onRemove: (id: string) => void }) {
  if (seeds.length === 0) {
    return <p>No seeds selected. Choose at least one track from the table.</p>;
  }
  return (
    <ol className="seedList">
      {seeds.map((track) => (
        <li key={track.id}>
          <span>{track.title}</span>
          <small>{track.artist}</small>
          <button onClick={() => onRemove(track.id)}>Remove</button>
        </li>
      ))}
    </ol>
  );
}

function DraftView({ draft }: { draft: SetDraft }) {
  return (
    <div>
      <div className="stats">
        <Stat label="Duration" value={formatDuration(draft.totalDurationSeconds)} />
        <Stat label="Deviation" value={formatDuration(Math.abs(draft.durationDeviationSeconds))} />
        <Stat label="Score" value={draft.globalScore.toFixed(3)} />
        <Stat label="Profile" value={draft.variantProfile} />
      </div>
      <ol className="draftList">
        {draft.tracks.map((track, index) => {
          const transition = draft.transitions.find((item) => item.toTrackId === track.trackId);
          return (
            <li key={`${track.trackId}-${track.position}`}>
              <div className="trackLine">
                <strong>{track.position}. {track.title}</strong>
                <span>{track.artist}</span>
                <span>{formatDuration(track.durationSeconds)}</span>
                <span>{track.bpm ?? "-"} BPM</span>
                <span>{track.camelotKey ?? "-"}</span>
              </div>
              {index > 0 && transition && (
                <div className="rationale">
                  <strong>Transition {transition.transitionScore.toFixed(3)}</strong>
                  <span>BPM {transition.bpmScore.toFixed(2)}</span>
                  <span>Key {transition.keyScore.toFixed(2)}</span>
                  <span>Energy {transition.energyScore.toFixed(2)}</span>
                  <p>{transition.rationale.join(" · ")}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function labelForView(view: View): string {
  return {
    import: "Library Import",
    library: "Track Library",
    analysis: "Analysis Status",
    configure: "Set Configuration",
    draft: "Generated Draft",
    export: "Export"
  }[view];
}

function formatScore(value?: number | null): string {
  return value == null ? "-" : value.toFixed(2);
}

function formatDuration(seconds: number): string {
  const abs = Math.abs(seconds);
  const minutes = Math.floor(abs / 60);
  const remainder = abs % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

createRoot(document.getElementById("root")!).render(<App />);
