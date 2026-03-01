import { useEffect } from "react";
import { X } from "lucide-react";
import { useAiStore, type AiProvider } from "../../stores/ai";

interface SettingsPanelProps {
  onClose: () => void;
}

const PROVIDERS: { id: AiProvider; label: string }[] = [
  { id: "claude", label: "Claude (Anthropic)" },
  { id: "openai", label: "OpenAI" },
  { id: "ollama", label: "Ollama (Local)" },
];

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const settings = useAiStore((s) => s.settings);
  const setSettings = useAiStore((s) => s.setSettings);
  const saveSettings = useAiStore((s) => s.saveSettings);
  const loadSettings = useAiStore((s) => s.loadSettings);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    await saveSettings();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[15vh] z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[480px] bg-surface-2 border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-medium text-text-primary">AI Settings</span>
          <button onClick={onClose} className="p-1 hover:bg-surface-3 rounded transition-colors">
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
                  key={p.id}
                  onClick={() => setSettings({ provider: p.id })}
                  className={`flex-1 text-xs px-3 py-2 rounded border transition-colors ${
                    settings.provider === p.id
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
          {settings.provider === "claude" && (
            <>
              <Field
                label="API Key"
                type="password"
                value={settings.claudeApiKey}
                onChange={(v) => setSettings({ claudeApiKey: v })}
                placeholder="sk-ant-..."
              />
              <Field
                label="Model"
                value={settings.claudeModel}
                onChange={(v) => setSettings({ claudeModel: v })}
                placeholder="claude-sonnet-4-20250514"
              />
            </>
          )}

          {/* OpenAI Settings */}
          {settings.provider === "openai" && (
            <>
              <Field
                label="API Key"
                type="password"
                value={settings.openaiApiKey}
                onChange={(v) => setSettings({ openaiApiKey: v })}
                placeholder="sk-..."
              />
              <Field
                label="Model"
                value={settings.openaiModel}
                onChange={(v) => setSettings({ openaiModel: v })}
                placeholder="gpt-4o"
              />
            </>
          )}

          {/* Ollama Settings */}
          {settings.provider === "ollama" && (
            <>
              <Field
                label="Endpoint"
                value={settings.ollamaEndpoint}
                onChange={(v) => setSettings({ ollamaEndpoint: v })}
                placeholder="http://localhost:11434"
              />
              <Field
                label="Model"
                value={settings.ollamaModel}
                onChange={(v) => setSettings({ ollamaModel: v })}
                placeholder="llama3.2"
              />
            </>
          )}

          {/* Temperature */}
          <div>
            <label className="text-xs text-text-tertiary uppercase tracking-wider mb-2 block">
              Temperature: {settings.temperature.toFixed(1)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={settings.temperature}
              onChange={(e) => setSettings({ temperature: parseFloat(e.target.value) })}
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
            value={String(settings.maxTokens)}
            onChange={(v) => setSettings({ maxTokens: parseInt(v) || 4096 })}
            placeholder="4096"
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-border text-text-secondary hover:bg-surface-3 transition-colors"
          >
            Cancel
          </button>
          <button
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
