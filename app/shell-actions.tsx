"use client";

import { createContext, useContext } from "react";
import type { ModalKind, Notice } from "./record-modal";

export type ShellActions = {
  canManage: boolean;
  notify: (notice: Notice) => void;
  openCreateModal: (kind: ModalKind) => void;
};

export const ShellActionsContext = createContext<ShellActions | null>(null);

export function useShellActions(): ShellActions {
  const actions = useContext(ShellActionsContext);
  if (!actions) throw new Error("useShellActions must be used inside the dashboard shell.");
  return actions;
}
