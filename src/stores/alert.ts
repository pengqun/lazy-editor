import { create } from "zustand";

export interface AlertAction {
  label: string;
  variant?: "primary" | "secondary";
  onClick: () => void;
}

export interface CriticalAlert {
  title: string;
  message: string;
  actions: AlertAction[];
}

interface AlertState {
  alert: CriticalAlert | null;
  showAlert: (alert: CriticalAlert) => void;
  dismissAlert: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  alert: null,
  showAlert: (alert) => set({ alert }),
  dismissAlert: () => set({ alert: null }),
}));

/** Convenience function — call from anywhere without hooks */
export const criticalAlert = {
  show: (alert: CriticalAlert) => useAlertStore.getState().showAlert(alert),
  dismiss: () => useAlertStore.getState().dismissAlert(),
};
