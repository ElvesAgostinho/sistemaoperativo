import { createContext, useContext } from 'react';

interface AutomationCanvasContextValue {
  deleteNode: (nodeId: string) => void;
}

export const AutomationCanvasContext = createContext<AutomationCanvasContextValue>({
  deleteNode: () => {}
});

export function useAutomationCanvas() {
  return useContext(AutomationCanvasContext);
}
