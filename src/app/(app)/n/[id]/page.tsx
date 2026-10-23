import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoteView } from "@/components/NoteView";
import { TrashedNotice } from "@/components/TrashedNotice";
import { getViewer, requirePageViewer } from "@/lib/auth";
import { isUuid } from "@/lib/http";
import { trackPageView } from "@/lib/logs";
import { getNote } from "@/lib/notes";
import { loadWorkspace } from "@/lib/workspace";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer.canView || !isUuid(id)) return {};
  const note = await getNote(await loadWorkspace(), id);
  return note ? { title: note.title } : {};
}

export default async function NotePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { edit } = await searchParams;
  const viewer = await requirePageViewer(`/n/${id}`);
  if (!isUuid(id)) notFound();
  const note = await getNote(await loadWorkspace(), id);
  if (!note) notFound();
  await trackPageView(`/n/${id}`, viewer);
  if (note.deletedAt) return <TrashedNotice note={note} canEdit={note.canEdit} />;
  return <NoteView key={note.id} initialNote={note} startEditing={edit === "1"} />;
}
