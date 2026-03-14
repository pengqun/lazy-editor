import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  appendHistory,
  buildBaselineWarnings,
  buildCurrentRunRecord,
  buildStabilityBaseline,
  detectFailureType,
  normalizeCommand,
  parseCommandsTsv,
  renderStabilityBaselineMarkdown,
} from "../../../scripts/test-diagnose-baseline.mjs";

describe("test-diagnose baseline helpers", () => {
  it("parses commands and computes normalized pass rates", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-diagnose-baseline-"));
    const historyFile = path.join(tempDir, "history.json");
    const npmLog = path.join(tempDir, "npm.log");
    const cargoLog = path.join(tempDir, "cargo.log");
    const serialLog = path.join(tempDir, "serial.log");

    fs.writeFileSync(npmLog, "all tests passed\n");
    fs.writeFileSync(cargoLog, "test result: ok. 79 passed; 0 failed\n");
    fs.writeFileSync(serialLog, "all tests passed in serial mode\n");

    const commands = parseCommandsTsv(
      [
        `npm-test\t0\tpassed\t${npmLog}`,
        `npm-test-serial\t0\tpassed\t${serialLog}`,
        `cargo-test-q\t0\tpassed\t${cargoLog}`,
      ].join("\n"),
    );

    const runRecord = buildCurrentRunRecord({
      runDir: path.join(tempDir, "run-1"),
      generatedAt: "2026-03-13T12:00:00+08:00",
      commands,
    });
    const history = appendHistory({ historyFile, runRecord, limit: 20 });
    history.historyFile = historyFile;
    const baseline = buildStabilityBaseline(history, 20);

    expect(baseline.runsIncluded).toBe(1);
    expect(baseline.overall.passRate).toBe(100);
    expect(baseline.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "npm-test",
          label: "npm test",
          passRate: 100,
          passedRuns: 1,
          totalRuns: 1,
        }),
        expect.objectContaining({
          key: "cargo-test-q",
          label: "cargo test -q",
          passRate: 100,
          passedRuns: 1,
          totalRuns: 1,
        }),
        expect.objectContaining({
          key: "npm-test-serial",
          label: "npm test -- --no-file-parallelism --maxWorkers=1",
          passRate: 100,
          passedRuns: 1,
          totalRuns: 1,
        }),
      ]),
    );
    expect(baseline.failureTypes).toEqual([]);

    const markdown = renderStabilityBaselineMarkdown(baseline);
    expect(markdown).toContain("最近 1/20 次已执行诊断");
    expect(markdown).toContain("| npm test | 100.0% | 1/1 |");
    expect(markdown).toContain("| npm test -- --no-file-parallelism --maxWorkers=1 | 100.0% | 1/1 |");
    expect(markdown).toContain("- 无失败记录");
  });

  it("keeps only the most recent history window", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-diagnose-history-"));
    const historyFile = path.join(tempDir, "history.json");

    for (let index = 1; index <= 22; index += 1) {
      const logFile = path.join(tempDir, `run-${index}.log`);
      fs.writeFileSync(logFile, index % 2 === 0 ? "test result: FAILED. 1 failed\n" : "ok\n");

      appendHistory({
        historyFile,
        limit: 20,
        runRecord: buildCurrentRunRecord({
          runDir: path.join(tempDir, `run-${index}`),
          generatedAt: `2026-03-13T12:${String(index).padStart(2, "0")}:00+08:00`,
          commands: [
            {
              command: "cargo-test-q",
              status: index % 2 === 0 ? "failed" : "passed",
              exitCode: index % 2 === 0 ? 101 : 0,
              logFile,
            },
          ],
        }),
      });
    }

    const history = JSON.parse(fs.readFileSync(historyFile, "utf8"));
    expect(history.runs).toHaveLength(20);
    expect(history.runs[0].runDir).toContain("run-3");
    expect(history.runs.at(-1).runDir).toContain("run-22");
  });

  it("normalizes legacy runInBand command name to serial bucket", () => {
    expect(normalizeCommand("npm-test-runInBand")).toEqual({
      key: "npm-test-serial",
      label: "npm test -- --no-file-parallelism --maxWorkers=1",
      pattern: /^npm-test-(?:serial|runInBand)(?:-r\d+)?$/,
    });
  });

  it("buildStabilityBaseline includes warnings field", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-diagnose-warn-"));
    const historyFile = path.join(tempDir, "history.json");
    const logFile = path.join(tempDir, "run.log");
    fs.writeFileSync(logFile, "ok\n");

    // Single run → info warning about insufficient history
    appendHistory({
      historyFile,
      limit: 20,
      runRecord: buildCurrentRunRecord({
        runDir: path.join(tempDir, "run-1"),
        generatedAt: "2026-03-14T10:00:00Z",
        commands: [{ command: "npm-test", status: "passed", exitCode: 0, logFile }],
      }),
    });

    const history = JSON.parse(fs.readFileSync(historyFile, "utf8"));
    history.historyFile = historyFile;
    const baseline = buildStabilityBaseline(history, 20);

    expect(baseline.warnings).toEqual([
      { level: "info", message: expect.stringContaining("Insufficient history") },
    ]);

    const md = renderStabilityBaselineMarkdown(baseline);
    expect(md).toContain("ℹ️");
    expect(md).toContain("Insufficient history");
  });

  it("warns when recent run has failures", () => {
    const makeRun = (idx: number, failed: boolean) => ({
      runDir: `/tmp/run-${idx}`,
      generatedAt: `2026-03-14T1${idx}:00:00Z`,
      totalCommands: 1,
      passedCommands: failed ? 0 : 1,
      failedCommands: failed ? 1 : 0,
      overallPassRate: failed ? 0 : 100,
      commands: [{ command: "npm-test", key: "npm-test", label: "npm test", status: failed ? "failed" : "passed", exitCode: failed ? 1 : 0, logFile: null, failureType: failed ? { key: "test_failure", label: "test failure" } : null }],
      failureTypes: failed ? [{ key: "test_failure", label: "test failure", count: 1 }] : [],
    });

    const warnings = buildBaselineWarnings([makeRun(1, false), makeRun(2, false), makeRun(3, true)]);
    expect(warnings).toEqual(
      expect.arrayContaining([
        { level: "warn", message: expect.stringContaining("Recent run has 1 failure") },
      ]),
    );
  });

  it("warns when failure rate trends up over 3 runs", () => {
    const makeRun = (idx: number, failed: number, total: number) => ({
      runDir: `/tmp/run-${idx}`,
      generatedAt: `2026-03-14T1${idx}:00:00Z`,
      totalCommands: total,
      passedCommands: total - failed,
      failedCommands: failed,
      overallPassRate: ((total - failed) / total) * 100,
      commands: [],
      failureTypes: [],
    });

    const warnings = buildBaselineWarnings([makeRun(1, 0, 4), makeRun(2, 1, 4), makeRun(3, 2, 4)]);
    expect(warnings).toEqual(
      expect.arrayContaining([
        { level: "warn", message: expect.stringContaining("trending up") },
      ]),
    );
  });

  it("classifies known failure types", () => {
    expect(detectFailureType("CACError: Unknown option `--runInBand`", 1)).toEqual({
      key: "unknown_option",
      label: "unknown option",
    });
    expect(detectFailureType("/bin/sh: pnpm: command not found", 127)).toEqual({
      key: "command_missing",
      label: "command missing",
    });
    expect(detectFailureType("FAIL src/example.test.ts\nAssertionError: expected 1 to be 2", 1)).toEqual({
      key: "test_failure",
      label: "test failure",
    });
  });
});
