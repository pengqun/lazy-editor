import { AlertCircle, CheckCircle2, ClipboardList, Copy, Loader2, Save, Target, Trash2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  type CitationFieldOptions,
  type CitationTemplateId,
  type ReferenceProfile,
  CITATION_TEMPLATES,
  TEMPLATE_IDS,
  buildReferenceHtml,
  copyReferencesToClipboard,
  deleteCustomProfile,
  getProfileById,
  listProfiles,
  loadCitationSettings,
  saveFieldOptions,
  saveLastTemplate,
  saveCitationSettings,
  saveCustomProfile,
} from "../../lib/citation-notes";
import { goalLabel, goalProgress, readingTimeMinutes } from "../../lib/writing-metrics";
import { type AiPhase, useAiStore } from "../../stores/ai";
import { useEditorStore } from "../../stores/editor";
import { useFilesStore } from "../../stores/files";
import { toast } from "../../stores/toast";
import { useWritingGoalsStore } from "../../stores/writing-goals";
import type { WritingGoal } from "../../stores/writing-goals";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { WritingGoalPopover } from "./WritingGoalPopover";

const PHASE_LABELS: Record<string, string> = {
  searching_kb: "Searching knowledge base...",
  streaming: "Generating content...",
  done: "Completed",
  error: "Failed",
};

const PHASE_PROGRESS: Record<string, number> = {
  searching_kb: 35,
  streaming: 80,
  done: 100,
  error: 100,
};

/** Debounce interval (ms) for word-count display in the status bar. */
const WORD_COUNT_DEBOUNCE_MS = 300;
const PROFILE_SWITCH_FLASH_MS = 1500;

/* ------------------------------------------------------------------ */
/*  WordCountSection — isolated so word-count debounce only triggers  */
/*  re-renders inside this subtree, not the entire StatusBar.         */
/* ------------------------------------------------------------------ */

interface WordCountSectionProps {
  activeFilePath: string;
  goal: WritingGoal | null;
}

const WordCountSection = memo(function WordCountSection({
  activeFilePath,
  goal,
}: WordCountSectionProps) {
  const rawWordCount = useEditorStore((s) => s.wordCount);
  const isDirty = useFilesStore((s) => s.isDirty);
  const wordCount = useDebouncedValue(rawWordCount, WORD_COUNT_DEBOUNCE_MS);

  const [showGoalPopover, setShowGoalPopover] = useState(false);

  const readingTime = useMemo(() => readingTimeMinutes(wordCount), [wordCount]);

  const hasGoal = goal !== null && goal.target > 0;
  const pct = useMemo(
    () => (hasGoal ? goalProgress(wordCount, goal!.target) : 0),
    [hasGoal, wordCount, goal],
  );
  const label = useMemo(
    () => (hasGoal ? goalLabel(wordCount, goal!.target) : null),
    [hasGoal, wordCount, goal],
  );

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowGoalPopover((v) => !v)}
          className="flex items-center gap-1 hover:text-text-primary"
          title={label ?? "Set writing goal"}
        >
          {hasGoal && <Target size={10} className="text-accent" />}
          <span>
            {wordCount} word{wordCount !== 1 ? "s" : ""}
          </span>
        </button>
        {showGoalPopover && (
          <WritingGoalPopover
            filePath={activeFilePath}
            onClose={() => setShowGoalPopover(false)}
          />
        )}
      </div>

      {hasGoal && (
        <div className="flex items-center gap-1.5" title={label!}>
          <div className="w-16 h-1.5 bg-surface-3 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                pct >= 100 ? "bg-emerald-400" : "bg-accent"
              }`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <span className={pct >= 100 ? "text-emerald-400" : ""}>{pct}%</span>
        </div>
      )}

      <span>{readingTime} min read</span>
      <span>{isDirty ? "Unsaved" : "Saved"}</span>
    </>
  );
});

/* ------------------------------------------------------------------ */
/*  CitationControls — memoized to avoid re-renders from word-count   */
/*  or AI phase changes that don't affect citation UI.                */
/* ------------------------------------------------------------------ */

interface CitationControlsProps {
  editor: ReturnType<typeof useEditorStore.getState>["editor"];
  citations: ReturnType<typeof useAiStore.getState>["citations"];
}

const CitationControls = memo(function CitationControls({
  editor,
  citations,
}: CitationControlsProps) {
  // Load initial settings (profile-aware with backward-compat fallback)
  const [initialSettings] = useState(() => loadCitationSettings());
  const [templateId, setTemplateId] = useState<CitationTemplateId>(initialSettings.templateId);
  const [fieldOpts, setFieldOpts] = useState<CitationFieldOptions>(initialSettings.fields);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(initialSettings.activeProfileId);
  const [profiles, setProfiles] = useState<ReferenceProfile[]>(listProfiles);
  const [profileSwitchFlash, setProfileSwitchFlash] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  const refreshProfiles = useCallback(() => setProfiles(listProfiles()), []);

  useEffect(() => {
    if (!profileSwitchFlash) return;
    const timer = window.setTimeout(() => {
      setProfileSwitchFlash(false);
      setLiveAnnouncement("");
    }, PROFILE_SWITCH_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [profileSwitchFlash]);

  const handleProfileChange = useCallback((profileId: string) => {
    if (profileId === "") {
      // "Manual" mode — clear active profile, keep current template/fields
      setActiveProfileId(null);
      saveCitationSettings(templateId, fieldOpts, null);
      return;
    }
    const profile = getProfileById(profileId);
    if (!profile) return;
    setActiveProfileId(profile.id);
    setTemplateId(profile.templateId);
    setFieldOpts({ ...profile.fields });
    saveCitationSettings(profile.templateId, profile.fields, profile.id);
  }, [templateId, fieldOpts]);

  const handleTemplateChange = useCallback((id: CitationTemplateId) => {
    setTemplateId(id);
    saveLastTemplate(id);
    // Switching template manually clears active profile
    setActiveProfileId(null);
    saveCitationSettings(id, fieldOpts, null);
  }, [fieldOpts]);

  const handleFieldToggle = useCallback((key: keyof CitationFieldOptions) => {
    const activeProfile = activeProfileId ? getProfileById(activeProfileId) : null;
    const shouldAutoSwitchToManual = activeProfile?.isBuiltin ?? false;

    setFieldOpts((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveFieldOptions(next);
      if (shouldAutoSwitchToManual) {
        setActiveProfileId(null);
        saveCitationSettings(templateId, next, null);
      } else {
        saveCitationSettings(templateId, next, activeProfileId);
      }
      return next;
    });

    if (shouldAutoSwitchToManual) {
      setProfileSwitchFlash(true);
      setLiveAnnouncement("Switched to manual mode");
    }
  }, [templateId, activeProfileId]);

  const handleSaveProfile = useCallback(() => {
    const name = window.prompt("Profile name:");
    if (!name || !name.trim()) return;
    const profile = saveCustomProfile(name.trim(), templateId, fieldOpts);
    refreshProfiles();
    setActiveProfileId(profile.id);
    saveCitationSettings(templateId, fieldOpts, profile.id);
    toast.success(`Profile "${profile.name}" saved`);
  }, [templateId, fieldOpts, refreshProfiles]);

  const handleDeleteProfile = useCallback(() => {
    if (!activeProfileId) return;
    const profile = getProfileById(activeProfileId);
    if (!profile || profile.isBuiltin) return;
    const deleted = deleteCustomProfile(activeProfileId);
    if (deleted) {
      refreshProfiles();
      setActiveProfileId(null);
      saveCitationSettings(templateId, fieldOpts, null);
      toast.success(`Profile "${profile.name}" deleted`);
    }
  }, [activeProfileId, templateId, fieldOpts, refreshProfiles]);

  const handleInsertReferences = useCallback(() => {
    if (!editor || editor.isDestroyed || citations.length === 0) return;
    const query = useAiStore.getState().lastKbQuery || undefined;
    const html = buildReferenceHtml(citations, templateId, fieldOpts, query);
    if (html) {
      editor.commands.focus("end");
      editor.commands.insertContent(html);
      toast.success("References inserted");
    }
  }, [editor, citations, templateId, fieldOpts]);

  const handleCopyReferences = useCallback(async () => {
    if (citations.length === 0) return;
    const text = await copyReferencesToClipboard(citations, templateId, fieldOpts);
    if (text) toast.success("References copied to clipboard");
  }, [citations, templateId, fieldOpts]);

  const activeProfile = activeProfileId ? getProfileById(activeProfileId) ?? null : null;
  const canDeleteProfile = activeProfile !== null && !activeProfile.isBuiltin;

  return (
    <div
      role="group"
      aria-label="Citation reference controls"
      className="flex items-center gap-1"
    >
      <span id="citation-controls-help" className="sr-only">
        Select a reference profile or style, choose which metadata to include, then insert or copy.
      </span>
      <label
        htmlFor="citation-profile-select"
        className="text-[10px] text-text-tertiary whitespace-nowrap"
      >
        Profile
      </label>
      <select
        id="citation-profile-select"
        value={activeProfileId ?? ""}
        onChange={(e) => handleProfileChange(e.target.value)}
        aria-label="Citation reference profile"
        aria-describedby="citation-controls-help"
        title="Choose reference profile"
        className={`h-5 text-[10px] bg-surface-2 border border-border rounded text-text-secondary px-1 outline-none focus:border-accent transition-colors ${
          profileSwitchFlash ? "bg-accent/20 border-accent" : ""
        }`}
      >
        <option value="">Manual</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}{p.isBuiltin ? "" : " *"}
          </option>
        ))}
      </select>
      <span aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </span>
      <label
        htmlFor="citation-template-select"
        className="text-[10px] text-text-tertiary whitespace-nowrap"
      >
        Style
      </label>
      <select
        id="citation-template-select"
        value={templateId}
        onChange={(e) => handleTemplateChange(e.target.value as CitationTemplateId)}
        aria-label="Citation reference style"
        aria-describedby="citation-controls-help"
        title="Choose reference style"
        className="h-5 text-[10px] bg-surface-2 border border-border rounded text-text-secondary px-1 outline-none focus:border-accent"
      >
        {TEMPLATE_IDS.map((id) => (
          <option key={id} value={id}>
            {CITATION_TEMPLATES[id].label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleSaveProfile}
        aria-label="Save profile"
        aria-describedby="citation-controls-help"
        title="Save current settings as a new profile"
        className="flex items-center gap-0.5 px-1 py-0.5 rounded text-text-secondary hover:text-accent hover:bg-surface-3 transition-colors"
      >
        <Save size={11} />
      </button>
      <button
        type="button"
        onClick={handleDeleteProfile}
        disabled={!canDeleteProfile}
        aria-label="Delete profile"
        aria-describedby="citation-controls-help"
        title={canDeleteProfile ? `Delete profile "${activeProfile?.name}"` : "Select a custom profile to delete"}
        className="flex items-center gap-0.5 px-1 py-0.5 rounded text-text-secondary hover:text-red-400 hover:bg-surface-3 transition-colors disabled:opacity-30 disabled:pointer-events-none"
      >
        <Trash2 size={11} />
      </button>
      <span className="w-px h-3 bg-border mx-0.5" />
      <button
        type="button"
        onClick={() => handleFieldToggle("showChunkLabel")}
        aria-pressed={fieldOpts.showChunkLabel}
        aria-describedby="citation-controls-help"
        title="Show chunk label in references"
        className={`px-1 py-0.5 rounded text-[10px] transition-colors ${fieldOpts.showChunkLabel ? "bg-accent/20 text-accent" : "text-text-tertiary hover:text-text-secondary"}`}
      >
        Chunk
      </button>
      <button
        type="button"
        onClick={() => handleFieldToggle("showRelevance")}
        aria-pressed={fieldOpts.showRelevance}
        aria-describedby="citation-controls-help"
        title="Show relevance percentage in references"
        className={`px-1 py-0.5 rounded text-[10px] transition-colors ${fieldOpts.showRelevance ? "bg-accent/20 text-accent" : "text-text-tertiary hover:text-text-secondary"}`}
      >
        Relevance
      </button>
      <button
        type="button"
        onClick={handleInsertReferences}
        aria-describedby="citation-controls-help"
        title="Insert reference block at end of document"
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-accent hover:bg-surface-3 transition-colors"
      >
        <ClipboardList size={12} />
        <span>Insert refs</span>
      </button>
      <button
        type="button"
        onClick={handleCopyReferences}
        aria-label="Copy references"
        aria-describedby="citation-controls-help"
        title="Copy references to clipboard"
        className="flex items-center gap-0.5 px-1 py-0.5 rounded text-text-secondary hover:text-accent hover:bg-surface-3 transition-colors"
      >
        <Copy size={11} />
      </button>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  AiProgressIndicator — memoized; only re-renders when AI state     */
/*  actually changes, not on word-count / dirty-flag ticks.           */
/* ------------------------------------------------------------------ */

interface AiProgressIndicatorProps {
  aiPhase: AiPhase;
  currentAction: string | null;
  citations: ReturnType<typeof useAiStore.getState>["citations"];
  editor: ReturnType<typeof useEditorStore.getState>["editor"];
}

const AiProgressIndicator = memo(function AiProgressIndicator({
  aiPhase,
  currentAction,
  citations,
  editor,
}: AiProgressIndicatorProps) {
  const phaseLabel = PHASE_LABELS[aiPhase];
  const progress = PHASE_PROGRESS[aiPhase] ?? 0;

  if (!phaseLabel || aiPhase === "idle") return null;

  return (
    <div className="flex items-center gap-2 min-w-[280px]">
      {aiPhase === "error" ? (
        <AlertCircle size={12} className="text-red-400" />
      ) : aiPhase === "done" ? (
        <CheckCircle2 size={12} className="text-emerald-400" />
      ) : (
        <Loader2 size={12} className="text-accent animate-spin" />
      )}

      <span className={aiPhase === "error" ? "text-red-400" : "text-accent"}>
        {currentAction
          ? `${currentAction.charAt(0).toUpperCase() + currentAction.slice(1)}: ${phaseLabel}`
          : phaseLabel}
      </span>

      <div className="w-20 h-1.5 bg-surface-3 rounded-full overflow-hidden">
        <div
          className={
            aiPhase === "error"
              ? "h-full bg-red-400"
              : "h-full bg-accent transition-all duration-500"
          }
          style={{ width: `${progress}%` }}
        />
      </div>

      {aiPhase === "done" && citations.length > 0 && (
        <CitationControls editor={editor} citations={citations} />
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  StatusBar — the root component now subscribes to far fewer        */
/*  high-frequency selectors; word-count is consumed only inside      */
/*  the memoized WordCountSection with debouncing.                    */
/* ------------------------------------------------------------------ */

export function StatusBar() {
  const editor = useEditorStore((s) => s.editor);
  const activeFilePath = useFilesStore((s) => s.activeFilePath);
  const aiPhase = useAiStore((s) => s.aiPhase);
  const currentAction = useAiStore((s) => s.currentAction);
  const citations = useAiStore((s) => s.citations);
  const goal = useWritingGoalsStore((s) =>
    activeFilePath ? s.getGoal(activeFilePath) : null,
  );

  return (
    <div className="h-7 border-t border-border bg-surface-1 flex items-center px-4 text-xs text-text-tertiary gap-4">
      {activeFilePath && (
        <WordCountSection activeFilePath={activeFilePath} goal={goal} />
      )}

      <div className="flex-1" />

      <AiProgressIndicator
        aiPhase={aiPhase}
        currentAction={currentAction}
        citations={citations}
        editor={editor}
      />

      <span className="text-text-tertiary">
        {activeFilePath ? activeFilePath.split("/").pop() : "No file"}
      </span>
    </div>
  );
}
