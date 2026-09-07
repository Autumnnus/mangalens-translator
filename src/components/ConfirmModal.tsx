import { AlertCircle, AlertTriangle } from "lucide-react";
import React from "react";
import { Button, Modal } from "./ui";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning";
}

const ConfirmModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  type = "danger",
}) => {
  const danger = type === "danger";

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      layer="confirm"
      size="sm"
      hideClose
      title={title}
      icon={
        danger ? (
          <AlertTriangle className="text-shu" />
        ) : (
          <AlertCircle className="text-warn" />
        )
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} data-dismiss>
            {cancelText}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={handleConfirm}
            data-autofocus
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-2">{message}</p>
    </Modal>
  );
};

export default ConfirmModal;
