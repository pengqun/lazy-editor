import { useWritingGoalsStore } from "@/stores/writing-goals";
import { beforeEach, describe, expect, it } from "vitest";

function resetStore() {
  localStorage.clear();
  useWritingGoalsStore.setState({ goals: {} });
}

describe("useWritingGoalsStore", () => {
  beforeEach(resetStore);

  it("has empty initial state when localStorage is empty", () => {
    expect(useWritingGoalsStore.getState().goals).toEqual({});
  });

  it("setGoal stores a goal and persists to localStorage", () => {
    useWritingGoalsStore.getState().setGoal("/ws/doc.md", 1000);

    expect(useWritingGoalsStore.getState().goals["/ws/doc.md"]).toEqual({ target: 1000 });
    expect(localStorage.getItem("lazy-editor:writing-goals")).toContain("1000");
  });

  it("getGoal returns null for unknown file", () => {
    expect(useWritingGoalsStore.getState().getGoal("/unknown.md")).toBeNull();
  });

  it("getGoal returns stored goal", () => {
    useWritingGoalsStore.getState().setGoal("/ws/doc.md", 2000);

    const goal = useWritingGoalsStore.getState().getGoal("/ws/doc.md");
    expect(goal).toEqual({ target: 2000 });
  });

  it("setGoal overwrites existing goal", () => {
    useWritingGoalsStore.getState().setGoal("/ws/doc.md", 1000);
    useWritingGoalsStore.getState().setGoal("/ws/doc.md", 3000);

    expect(useWritingGoalsStore.getState().getGoal("/ws/doc.md")).toEqual({ target: 3000 });
  });

  it("clearGoal removes the goal", () => {
    useWritingGoalsStore.getState().setGoal("/ws/doc.md", 1000);
    useWritingGoalsStore.getState().clearGoal("/ws/doc.md");

    expect(useWritingGoalsStore.getState().getGoal("/ws/doc.md")).toBeNull();
  });

  it("clearGoal persists removal to localStorage", () => {
    useWritingGoalsStore.getState().setGoal("/ws/doc.md", 1000);
    useWritingGoalsStore.getState().clearGoal("/ws/doc.md");

    const stored = JSON.parse(localStorage.getItem("lazy-editor:writing-goals") ?? "{}");
    expect(stored["/ws/doc.md"]).toBeUndefined();
  });

  it("supports multiple files independently", () => {
    const store = useWritingGoalsStore.getState();
    store.setGoal("/ws/a.md", 500);
    store.setGoal("/ws/b.md", 1500);

    expect(useWritingGoalsStore.getState().getGoal("/ws/a.md")).toEqual({ target: 500 });
    expect(useWritingGoalsStore.getState().getGoal("/ws/b.md")).toEqual({ target: 1500 });

    useWritingGoalsStore.getState().clearGoal("/ws/a.md");
    expect(useWritingGoalsStore.getState().getGoal("/ws/a.md")).toBeNull();
    expect(useWritingGoalsStore.getState().getGoal("/ws/b.md")).toEqual({ target: 1500 });
  });
});
