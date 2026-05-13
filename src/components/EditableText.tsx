import { useEffect, useRef, useState } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EditableTextProps {
  value: string | null | undefined;
  onSave: (newValue: string) => Promise<void> | void;
  placeholder?: string;
  emptyLabel?: string;
  multiline?: boolean;
  canEdit?: boolean;
  maxLength?: number;
  className?: string;
  textClassName?: string;
}

export function EditableText({
  value,
  onSave,
  placeholder = "Wpisz tekst...",
  emptyLabel = "— brak —",
  multiline = false,
  canEdit = true,
  maxLength = multiline ? 2000 : 200,
  className,
  textClassName,
}: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => { setDraft(value ?? ""); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (trimmed === (value ?? "").trim()) { setEditing(false); return; }
    if (trimmed.length > maxLength) return;
    setSaving(true);
    try {
      await onSave(trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => { setDraft(value ?? ""); setEditing(false); };

  if (editing) {
    return (
      <div className={cn("space-y-2", className)}>
        {multiline ? (
          <Textarea
            ref={inputRef as any}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            rows={4}
            disabled={saving}
          />
        ) : (
          <Input
            ref={inputRef as any}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            disabled={saving}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleSave(); }
              if (e.key === "Escape") handleCancel();
            }}
          />
        )}
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
            Zapisz
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={handleCancel} disabled={saving}>
            <X className="h-3.5 w-3.5 mr-1" /> Anuluj
          </Button>
          <span className="ml-auto text-[10px] text-muted-foreground">{draft.length}/{maxLength}</span>
        </div>
      </div>
    );
  }

  const isEmpty = !value || !value.toString().trim();

  return (
    <div className={cn("group flex items-start gap-2", className)}>
      <div className={cn("flex-1 whitespace-pre-wrap", isEmpty && "text-muted-foreground italic", textClassName)}>
        {isEmpty ? emptyLabel : value}
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-secondary text-muted-foreground hover:text-primary"
          title="Edytuj"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
