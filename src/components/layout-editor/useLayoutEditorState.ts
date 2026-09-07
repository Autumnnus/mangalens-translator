import { PageLayout } from "@/layout/types";
import { useCallback, useRef, useState } from "react";

const HISTORY_LIMIT = 80;

/** Layout document state with undo/redo and a saved baseline for dirty checks. */
export const useLayoutEditorState = () => {
  const [layout, setLayoutState] = useState<PageLayout | null>(null);
  const [baseline, setBaseline] = useState<PageLayout | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyMeta, setHistoryMeta] = useState({ canUndo: false, canRedo: false });
  const historyRef = useRef<PageLayout[]>([]);
  const futureRef = useRef<PageLayout[]>([]);
  /** Always the latest document, readable from event handlers. */
  const layoutRef = useRef<PageLayout | null>(null);

  const syncMeta = () =>
    setHistoryMeta({
      canUndo: historyRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
    });

  const setCurrent = (next: PageLayout | null) => {
    layoutRef.current = next;
    setLayoutState(next);
  };

  const reset = useCallback((next: PageLayout | null) => {
    historyRef.current = [];
    futureRef.current = [];
    setCurrent(next);
    setBaseline(next);
    setSelectedId(null);
    syncMeta();
  }, []);

  /** Records the previous document so the change can be undone. */
  const apply = useCallback((next: PageLayout) => {
    const current = layoutRef.current;
    if (current && current !== next) {
      historyRef.current = [...historyRef.current.slice(-HISTORY_LIMIT + 1), current];
      futureRef.current = [];
    }
    setCurrent(next);
    syncMeta();
  }, []);

  /** Updates without a history entry (used while dragging). */
  const applyLive = useCallback((next: PageLayout) => {
    setCurrent(next);
  }, []);

  /** Ends a gesture: the document before it becomes the undo point. */
  const recordSnapshot = useCallback((snapshot: PageLayout | null) => {
    const current = layoutRef.current;
    if (!snapshot || !current || snapshot === current) return;
    historyRef.current = [...historyRef.current.slice(-HISTORY_LIMIT + 1), snapshot];
    futureRef.current = [];
    syncMeta();
  }, []);

  const undo = useCallback(() => {
    const previous = historyRef.current.pop();
    const current = layoutRef.current;
    if (!previous || !current) return;
    futureRef.current.push(current);
    setCurrent(previous);
    syncMeta();
  }, []);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    const current = layoutRef.current;
    if (!next || !current) return;
    historyRef.current.push(current);
    setCurrent(next);
    syncMeta();
  }, []);

  const markSaved = useCallback((saved: PageLayout) => {
    setCurrent(saved);
    setBaseline(saved);
  }, []);

  return {
    layout,
    layoutRef,
    selectedId,
    select: setSelectedId,
    reset,
    apply,
    applyLive,
    recordSnapshot,
    undo,
    redo,
    canUndo: historyMeta.canUndo,
    canRedo: historyMeta.canRedo,
    markSaved,
    isDirty: layout !== baseline,
  };
};
