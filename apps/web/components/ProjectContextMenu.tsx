"use client";

import { type PropsWithChildren, useState } from "react";
import { ExternalLink, FolderOpen, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { Project } from "@/stores/useProjectStore";
import { useDeleteProject } from "@/stores/useProjectStore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface ProjectContextMenuProps extends PropsWithChildren {
  project: Project;
}

const MENU_LABEL = "Actions";
const OPEN_PROJECT_LABEL = "Open project";
const OPEN_NEW_TAB_LABEL = "Open in new tab";
const DELETE_PROJECT_LABEL = "Delete project";
const DELETE_DIALOG_TITLE = "Delete project?";
const DELETE_DIALOG_DESCRIPTION =
  "This action cannot be undone. This will permanently delete this project.";
const DELETE_IN_PROGRESS_LABEL = "Deleting...";
const DELETE_SUCCESS_LABEL = "Project deleted";
const CANCEL_LABEL = "Cancel";

export default function ProjectContextMenu({
  project,
  children,
}: ProjectContextMenuProps) {
  const router = useRouter();
  const { mutateAsync: deleteProject, isPending } = useDeleteProject();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteProject(project.id);
      setIsDeleteDialogOpen(false);
      toast.success(DELETE_SUCCESS_LABEL);
    } catch (error) {
      console.error("Failed to delete project from projects page:", error);
    }
  };

  return (
    <AlertDialog
      open={isDeleteDialogOpen}
      onOpenChange={setIsDeleteDialogOpen}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>{MENU_LABEL}</ContextMenuLabel>
          <ContextMenuItem onSelect={() => router.push(`/projects/${project.id}`)}>
            <FolderOpen className="h-4 w-4" />
            {OPEN_PROJECT_LABEL}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() =>
              window.open(`/projects/${project.id}`, "_blank", "noopener,noreferrer")
            }
          >
            <ExternalLink className="h-4 w-4" />
            {OPEN_NEW_TAB_LABEL}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => setIsDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            {DELETE_PROJECT_LABEL}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{DELETE_DIALOG_TITLE}</AlertDialogTitle>
          <AlertDialogDescription>
            {DELETE_DIALOG_DESCRIPTION}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {CANCEL_LABEL}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              void handleDelete();
            }}
          >
            {isPending ? DELETE_IN_PROGRESS_LABEL : DELETE_PROJECT_LABEL}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
