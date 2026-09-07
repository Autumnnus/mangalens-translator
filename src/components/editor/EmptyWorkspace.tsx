import { BookPlus, Library } from "lucide-react";
import React from "react";
import { Button, EmptyState } from "../ui";

interface EmptyWorkspaceProps {
  onAddSeries: () => void;
}

const EmptyWorkspace: React.FC<EmptyWorkspaceProps> = ({ onAddSeries }) => (
  <EmptyState
    icon={<Library />}
    title="No series selected"
    description="Pick a series from the list, or create a new one to start translating."
    className="flex-1"
    action={
      <Button variant="primary" icon={<BookPlus />} onClick={onAddSeries}>
        New series
      </Button>
    }
  />
);

export default React.memo(EmptyWorkspace);
