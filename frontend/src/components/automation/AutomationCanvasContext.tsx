import { createContext, useContext } from 'react';

interface AutomationCanvasContextValue {
  deleteNode: (nodeId: string) => void;
  duplicateNode: (nodeId: string) => void;
}

export const AutomationCanvasContext = createContext<AutomationCanvasContextValue>({
  deleteNode: () => {},
  duplicateNode: () => {}
});

export function useAutomationCanvas() {
  return useContext(AutomationCanvasContext);
}
