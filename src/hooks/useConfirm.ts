import { useUIStore } from "../stores/useUIStore";

export const useConfirm = () => {
  const openConfirmModal = useUIStore((state) => state.openConfirmModal);
  const closeConfirmModal = useUIStore((state) => state.closeConfirmModal);

  const confirm = (config: Parameters<typeof openConfirmModal>[0]) => {
    openConfirmModal(config);
  };

  return { confirm, close: closeConfirmModal };
};
