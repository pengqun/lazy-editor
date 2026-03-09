import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { type AiProvider, type AiSettings, useAiStore } from "../../stores/ai";
import { toast } from "../../stores/toast";

interface SettingsPanelProps {
  onClose: () => void;
}

const PROVIDERS: { id: AiProvider; label: string }[] = [
  { id: "claude", label: "Claude (Anthropic)" },
  { id: "openai", label: "OpenAI" },
  { id: "ollama", label: "Ollama (Local)" },
];

function validateSettings(settings: AiSettings): string | null {
  if (settings.provider === "claude") {
    if (!settings.claudeApiKey.trim()) return "Claude API key is required.";
    if (!settings.claudeApiKey.startsWith("sk-ant-"))
      return "Claude API key should start with 'sk-ant-'.";
  }
  if (settings.provider === "openai") {
    if (!settings.openaiApiKey.trim()) return "OpenAI API key is required.";
    if (!settings.openaiApiKey.startsWith("sk-")) return "OpenAI API key should start with 'sk-'.";
  }
  if (settings.provider === "ollama") {
    try {
      new URL(settings.ollamaEndpoint);
    } catch {
      return "Ollama endpoint must be a valid URL.";
    }
  }
  if (settings.temperature < 0 || settings.temperature > 1)
    return "Temperature must be between 0 and 1.";
  if (settings.maxTokens < 1 || settings.maxTokens > 200000)
    return "Max tokens must be between 1 and 200,000.";
  return null;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const settings = useAiStore((s) => s.settings);
  const setSettings = useAiStore((s) => s.setSettings);
  const saveSettings = useAiStore((s) => s.saveSettings);
  const loadSettings = useAiStore((s) => s.loadSettings);
  const [draft, setDraft] = useState<AiSettings>(settings);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const updateSettings = (partial: Partial<AiSettings>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
    setValidationError(null);
  };

  const handleSave = async () => {
    const error = validateSettings(draft);
    if (error) {
      setValidationError(error);
      return;
    }
    setSettings(draft);
    await saveSettings();
    toast.success("Settings saved");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[15vh] z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setDraft(settings);
          setValidationError(null);
          onClose();
        }
      }}
    >
      <div className="w-[480px] bg-surface-2 border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-medium text-text-primary">AI Settings</span>
          <button
            type="button"
            onClick={() => {
              setDraft(settings);
              setValidationError(null);
              onClose();
            }}
            className="p-1 hover:bg-surface-3 rounded transition-colors"
          >
            <X size={16} className="text-text-tertiary" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Provider Selection */}
          <div>
            <label className="text-xs text-text-tertiary uppercase tracking-wider mb-2 block">
              Provider
            </label>
            <div className="flex gap-2">
              {PROVIDERS.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => updateSettings({ provider: p.id })}
                  className={`flex-1 text-xs px-3 py-2 rounded border transition-colors ${
                    draft.provider === p.id
                      ? "bg-accent/20 border-accent text-accent"
                      : "bg-surface-3 border-border text-text-secondary hover:border-text-tertiary"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Claude Settings */}
          {draft.provider === "claude" && (
            <>
              <Field
                label="API Key"
                type="password"
                value={draft.claudeApiKey}
                onChange={(v) => updateSettings({ claudeApiKey: v })}
                placeholder="sk-ant-..."
              />
              <Field
                label="Model"
                value={draft.claudeModel}
                onChange={(v) => updateSettings({ claudeModel: v })}
                placeholder="claude-sonnet-4-20250514"
              />
            </>
          )}

          {/* OpenAI Settings */}
          {draft.provider === "openai" && (
            <>
              <Field
                label="API Key"
                type="password"
                value={draft.openaiApiKey}
                onChange={(v) => updateSettings({ openaiApiKey: v })}
                placeholder="sk-..."
              />
              <Field
                label="Model"
                value={draft.openaiModel}
                onChange={(v) => updateSettings({ openaiModel: v })}
                placeholder="gpt-4o"
              />
            </>
          )}

          {/* Ollama Settings */}
          {draft.provider === "ollama" && (
            <>
              <Field
                label="Endpoint"
                value={draft.ollamaEndpoint}
                onChange={(v) => updateSettings({ ollamaEndpoint: v })}
                placeholder="http://localhost:11434"
              />
              <Field
                label="Model"
                value={draft.ollamaModel}
                onChange={(v) => updateSettings({ ollamaModel: v })}
                placeholder="llama3.2"
              />
            </>
          )}

          {/* Temperature */}
          <div>
            <label className="text-xs text-text-tertiary uppercase tracking-wider mb-2 block">
              Temperature: {draft.temperature.toFixed(1)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={draft.temperature}
              onChange={(e) => updateSettings({ temperature: Number.parseFloat(e.target.value) })}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-xs text-text-tertiary mt-1">
              <span>Precise</span>
              <span>Creative</span>
            </div>
          </div>

          {/* Max Tokens */}
          <Field
            label="Max Tokens"
            type="number"
            value={String(draft.maxTokens)}
            onChange={(v) => updateSettings({ maxTokens: Number.parseInt(v) || 4096 })}
            placeholder="4096"
          />

          {/* Validation Error */}
          {validationError && (
            <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
              {validationError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={() => {
              setDraft(settings);
              setValidationError(null);
              onClose();
            }}
            className="text-xs px-3 py-1.5 rounded border border-border text-text-secondary hover:bg-surface-3 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/90 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-xs text-text-tertiary uppercase tracking-wider mb-2 block">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-surface-3 border border-border rounded px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
      />
    </div>
  );
}
