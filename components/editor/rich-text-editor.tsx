"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Quote, Strikethrough, Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TiptapDoc = Record<string, unknown>;

export function RichTextEditor({
  initialContent,
  placeholder,
  onChange,
  className,
  editable = true,
}: {
  initialContent?: TiptapDoc;
  placeholder?: string;
  onChange?: (doc: TiptapDoc) => void;
  className?: string;
  editable?: boolean;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent ?? { type: "doc", content: [{ type: "paragraph" }] },
    editable,
    immediatelyRender: false, // avoid SSR hydration mismatch
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[200px] focus:outline-none px-3 py-2",
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON());
    },
  });

  if (!editor) {
    return (
      <div className="rounded-md border border-input bg-background">
        <div className="h-[240px] animate-pulse" />
      </div>
    );
  }

  return (
    <div className={cn("rounded-md border border-input bg-background", className)}>
      {editable ? (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1 py-1">
          <ToolbarButton
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            ariaLabel="Negrita"
          >
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            ariaLabel="Cursiva"
          >
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            ariaLabel="Tachado"
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </ToolbarButton>
          <span className="mx-1 h-4 w-px bg-border" />
          <ToolbarButton
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            ariaLabel="Lista con viñetas"
          >
            <List className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            ariaLabel="Lista numerada"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            ariaLabel="Cita"
          >
            <Quote className="h-3.5 w-3.5" />
          </ToolbarButton>
          <span className="mx-1 h-4 w-px bg-border" />
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            ariaLabel="Deshacer"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            ariaLabel="Rehacer"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>
      ) : null}
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  ariaLabel,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon"
      className="h-7 w-7"
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </Button>
  );
}
