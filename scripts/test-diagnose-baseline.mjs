import fs from "node:fs";
import path from "node:path";

export const HISTORY_LIMIT = 20;

const COMMAND_METADATA = [
  {
    key: "npm-test",
    label: "npm test",
    pattern: /^npm-test(?:-r\d+)?$/,
  },
  {
    key: "npm-test-serial",
    label: "npm test -- --no-file-parallelism --maxWorkers=1",
    pattern: /^npm-test-(?:serial|runInBand)(?:-r\d+)?$/,
  },
  {
    key: "vitest-verbose",
    label: "vitest verbose",
    pattern: /^vitest-verbose(?:-r\d+)?$/,
  },
  {
    key: "cargo-test-q",
    label: "cargo test -q",
    pattern: /^cargo-test-q(?:-r\d+)?$/,
  },
];

const FAILURE_TYPE_RULES = [
  {
    key: "unknown_option",
    label: "unknown option",
    pattern: /unknown option/i,
  },
  {
    key: "command_missing",
    label: "command missing",
    pattern:
      /(command not found|not recognized as an internal or external command|could not determine executable to run|no such file or directory|executable file not found)/i,
  },
  {
    key: "test_failure",
    label: "test failure",
    pattern:
      /(test result:\s*failed|(^|\n)\s*fail(?:\s|$)|(^|\n)\s*failing(?:\s|$)|assertionerror|expected:|received:|\b\d+\s+failed\b)/im,
  },
];

function roundRate(numerator, denominator) {
  if (!denominator) {
    return null;
  }

  return Number(((numerator / denominator) * 100).toFixed(1));
}

export function parseCommandsTsv(content) {
  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [command, exitCodeRaw, status, logFile] = line.split("\t");
      const exitCode = Number(exitCodeRaw);
      return {
        command,
        status,
        exitCode: Number.isNaN(exitCode) ? null : exitCode,
        logFile,
      };
    });
}

export function normalizeCommand(commandName) {
  const matched = COMMAND_METADATA.find(({ pattern }) => pattern.test(commandName));
  return (
    matched ?? {
      key: commandName,
      label: commandName,
    }
  );
}

export function detectFailureType(logContent, exitCode) {
  if (exitCode === 0) {
    return null;
  }

  for (const rule of FAILURE_TYPE_RULES) {
    if (rule.pattern.test(logContent)) {
      return {
        key: rule.key,
        label: rule.label,
      };
    }
  }

  return {
    key: "other",
    label: "other",
  };
}

export function buildCurrentRunRecord({ runDir, generatedAt, commands }) {
  const normalizedCommands = commands.map((command) => {
    const meta = normalizeCommand(command.command);
    let failureType = null;

    if (command.status !== "passed" && command.logFile && fs.existsSync(command.logFile)) {
      failureType = detectFailureType(fs.readFileSync(command.logFile, "utf8"), command.exitCode);
    }

    return {
      ...command,
      key: meta.key,
      label: meta.label,
      failureType,
    };
  });

  const totalCommands = normalizedCommands.length;
  const passedCommands = normalizedCommands.filter((command) => command.status === "passed").length;
  const failedCommands = totalCommands - passedCommands;
  const failureTypes = countFailureTypes(normalizedCommands);

  return {
    runDir,
    generatedAt,
    totalCommands,
    passedCommands,
    failedCommands,
    overallPassRate: roundRate(passedCommands, totalCommands),
    commands: normalizedCommands,
    failureTypes,
  };
}

function countFailureTypes(commands) {
  const counts = new Map();

  for (const command of commands) {
    if (!command.failureType) {
      continue;
    }

    const entry = counts.get(command.failureType.key) ?? {
      key: command.failureType.key,
      label: command.failureType.label,
      count: 0,
    };
    entry.count += 1;
    counts.set(command.failureType.key, entry);
  }

  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function readHistory(historyFile) {
  if (!fs.existsSync(historyFile)) {
    return {
      schemaVersion: 1,
      historyLimit: HISTORY_LIMIT,
      runs: [],
    };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(historyFile, "utf8"));
    return {
      schemaVersion: 1,
      historyLimit: Number(raw.historyLimit) || HISTORY_LIMIT,
      runs: Array.isArray(raw.runs) ? raw.runs : [],
    };
  } catch {
    return {
      schemaVersion: 1,
      historyLimit: HISTORY_LIMIT,
      runs: [],
    };
  }
}

export function appendHistory({ historyFile, runRecord, limit = HISTORY_LIMIT }) {
  const history = readHistory(historyFile);
  const runs = [...history.runs];

  if (runRecord.totalCommands > 0) {
    runs.push(runRecord);
  }

  const trimmedRuns = runs.slice(-limit);
  const nextHistory = {
    schemaVersion: 1,
    historyLimit: limit,
    runs: trimmedRuns,
  };

  fs.mkdirSync(path.dirname(historyFile), { recursive: true });
  fs.writeFileSync(historyFile, `${JSON.stringify(nextHistory, null, 2)}\n`);

  return nextHistory;
}

export function buildStabilityBaseline(history, limit = HISTORY_LIMIT) {
  const recentRuns = history.runs.slice(-limit);
  const allCommands = recentRuns.flatMap((run) => run.commands ?? []);
  const passedCommands = allCommands.filter((command) => command.status === "passed").length;
  const failedCommands = allCommands.length - passedCommands;

  const commandGroups = new Map(
    COMMAND_METADATA.map((command) => [
      command.key,
      {
        key: command.key,
        label: command.label,
        totalRuns: 0,
        passedRuns: 0,
        failedRuns: 0,
        passRate: null,
      },
    ]),
  );
  for (const command of allCommands) {
    const entry = commandGroups.get(command.key) ?? {
      key: command.key,
      label: command.label,
      totalRuns: 0,
      passedRuns: 0,
      failedRuns: 0,
      passRate: null,
    };
    entry.totalRuns += 1;
    if (command.status === "passed") {
      entry.passedRuns += 1;
    } else {
      entry.failedRuns += 1;
    }
    commandGroups.set(command.key, entry);
  }

  const failureTypeCounts = new Map();
  for (const command of allCommands) {
    if (!command.failureType) {
      continue;
    }

    const entry = failureTypeCounts.get(command.failureType.key) ?? {
      key: command.failureType.key,
      label: command.failureType.label,
      count: 0,
    };
    entry.count += 1;
    failureTypeCounts.set(command.failureType.key, entry);
  }

  const commands = [...commandGroups.values()]
    .map((entry) => ({
      ...entry,
      passRate: roundRate(entry.passedRuns, entry.totalRuns),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const failureTypes = [...failureTypeCounts.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );

  const warnings = buildBaselineWarnings(recentRuns);

  return {
    historyLimit: limit,
    runsIncluded: recentRuns.length,
    overall: {
      totalCommands: allCommands.length,
      passedCommands,
      failedCommands,
      passRate: roundRate(passedCommands, allCommands.length),
    },
    commands,
    failureTypes,
    warnings,
    historyFile: history.historyFile,
  };
}

function buildBaselineWarnings(recentRuns) {
  const warnings = [];

  if (recentRuns.length < 3) {
    warnings.push({ level: "info", message: "Insufficient history for trend analysis (need ≥3 runs)" });
    return warnings;
  }

  // Check if the most recent run has any failures
  const latest = recentRuns[recentRuns.length - 1];
  if (latest && latest.failedCommands > 0) {
    warnings.push({ level: "warn", message: `Recent run has ${latest.failedCommands} failure(s)` });
  }

  // Check if failure rate is trending up over last 3 runs
  const last3 = recentRuns.slice(-3);
  const failRates = last3.map((run) =>
    run.totalCommands > 0 ? run.failedCommands / run.totalCommands : 0
  );
  if (failRates.length === 3 && failRates[2] > failRates[1] && failRates[1] > failRates[0]) {
    warnings.push({ level: "warn", message: "Failure rate trending up over last 3 runs" });
  }

  return warnings;
}

export { buildBaselineWarnings };

export function renderStabilityBaselineMarkdown(stabilityBaseline) {
  const lines = [];
  lines.push("## 稳定性基线");

  if (stabilityBaseline.runsIncluded === 0) {
    lines.push("- 暂无历史基线（至少需要 1 次已执行的诊断运行）。");
    return lines.join("\n");
  }

  lines.push(
    `- 历史窗口: 最近 ${stabilityBaseline.runsIncluded}/${stabilityBaseline.historyLimit} 次已执行诊断`,
  );
  lines.push(
    `- overall pass rate: ${formatRate(stabilityBaseline.overall.passRate)} (${stabilityBaseline.overall.passedCommands}/${stabilityBaseline.overall.totalCommands})`,
  );

  if (stabilityBaseline.historyFile) {
    lines.push(`- history_file: ${stabilityBaseline.historyFile}`);
  }

  lines.push("");
  lines.push("### 分命令通过率");
  lines.push("| command | pass_rate | passed / total |");
  lines.push("| --- | --- | --- |");

  if (stabilityBaseline.commands.length === 0) {
    lines.push("| (none) | - | - |");
  } else {
    for (const command of stabilityBaseline.commands) {
      lines.push(
        `| ${command.label} | ${formatRate(command.passRate)} | ${command.passedRuns}/${command.totalRuns} |`,
      );
    }
  }

  // Render warnings (if any)
  if (stabilityBaseline.warnings && stabilityBaseline.warnings.length > 0) {
    lines.push("");
    lines.push("### 告警");
    for (const w of stabilityBaseline.warnings) {
      const icon = w.level === "warn" ? "⚠️" : "ℹ️";
      lines.push(`> ${icon} ${w.message}`);
    }
  }

  lines.push("");
  lines.push("### 常见失败类型");
  if (stabilityBaseline.failureTypes.length === 0) {
    lines.push("- 无失败记录");
  } else {
    for (const failureType of stabilityBaseline.failureTypes) {
      lines.push(`- ${failureType.label}: ${failureType.count}`);
    }
  }

  return lines.join("\n");
}

function formatRate(rate) {
  return rate === null ? "n/a" : `${rate.toFixed(1)}%`;
}
