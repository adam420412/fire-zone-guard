import { useState, useMemo } from "react";
import { Users, Plus, Loader2, Search, Calendar, Trash2, Pencil, Eye, MapPin, Clock, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMeetings, useCreateMeeting, useUpdateMeeting, useDeleteMeeting, useCompanies, useBuildings, useProfiles, useEmployees } from "@/hooks/useSupabaseData";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, isPast, isToday, isFuture, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { cn } from "@/lib/utils";

// ─── Create / Edit Meeting Dialog ───────────────────────────────
function MeetingFormDialog({
  open,
  onOpenChange,
  meeting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  meeting?: any;
}) {
  const { data: companies } = useCompanies();
  const { data: buildings } = useBuildings();
  const { mutate: createMeeting, isPending: isCreating } = useCreateMeeting();
  const { mutate: updateMeeting, isPending: isUpdating } = useUpdateMeeting();
  const { user } = useAuth();

  const isEdit = !!meeting;
  const isPending = isCreating || isUpdating;

  const [title, setTitle] = useState(meeting?.title || "");
  const [meetingDate, setMeetingDate] = useState(
    meeting?.meeting_date ? format(parseISO(meeting.meeting_date), "yyyy-MM-dd'T'HH:mm") : ""
  );
  const [companyId, setCompanyId] = useState(meeting?.company_id || "none");
  const [buildingId, setBuildingId] = useState(meeting?.building_id || "none");
  const [attendees, setAttendees] = useState(meeting?.attendees || "");
  const [notes, setNotes] = useState(meeting?.notes || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !meetingDate) {
      toast.error("Wypełnij wymagane pola");
      return;
    }

    const payload: any = {
      title,
      meeting_date: new Date(meetingDate).toISOString(),
      company_id: companyId !== "none" ? companyId : companies?.[0]?.id,
      building_id: buildingId !== "none" ? buildingId : null,
      attendees: attendees || null,
      notes: notes || null,
    };

    if (isEdit) {
      updateMeeting(
        { id: meeting.id, updates: payload },
        {
          onSuccess: () => {
            toast.success("Spotkanie zaktualizowane!");
            onOpenChange(false);
          },
          onError: (err: any) => toast.error("Błąd: " + err.message),
        }
      );
    } else {
      payload.organizer_id = user?.id;
      createMeeting(payload, {
        onSuccess: () => {
          toast.success("Spotkanie zaplanowane!");
          onOpenChange(false);
          setTitle("");
          setMeetingDate("");
          setAttendees("");
          setNotes("");
        },
        onError: (err: any) => toast.error("Błąd: " + err.message),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edytuj spotkanie" : "Nowe spotkanie"}</DialogTitle>
            <DialogDescription>
              {isEdit ? "Zmień szczegóły spotkania." : "Zaplanuj nowe spotkanie lub wizję lokalną."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto px-1">
            <div className="space-y-2">
              <Label>Tytuł spotkania *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="np. Wizja lokalna - budynek A" required />
            </div>
            <div className="space-y-2">
              <Label>Data i godzina *</Label>
              <Input type="datetime-local" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Firma / Klient</Label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Brak (wewnętrzne)</SelectItem>
                    {companies?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Obiekt (opcjonalnie)</Label>
                <Select value={buildingId} onValueChange={setBuildingId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Brak</SelectItem>
                    {buildings?.map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Uczestnicy</Label>
              <Input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="np. Jan Kowalski, Anna Nowak" />
            </div>
            <div className="space-y-2">
              <Label>Notatki</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notatki ze spotkania..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Zapisz zmiany" : "Utwórz spotkanie"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Meeting Detail Dialog ──────────────────────────────────────
function MeetingDetailDialog({
  open,
  onOpenChange,
  meeting,
  onEdit,
  onDelete,
  canManage,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  meeting: any;
  onEdit: () => void;
  onDelete: () => void;
  canManage: boolean;
}) {
  if (!meeting) return null;

  const meetingDate = meeting.meeting_date ? parseISO(meeting.meeting_date) : null;
  const isPastMeeting = meetingDate ? isPast(meetingDate) && !isToday(meetingDate) : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            {meeting.title}
          </DialogTitle>
          <DialogDescription>Szczegóły spotkania</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3">
            <Badge variant={isPastMeeting ? "secondary" : "default"} className="text-xs">
              {isPastMeeting ? "Zakończone" : isToday(meetingDate!) ? "Dziś" : "Nadchodzące"}
            </Badge>
          </div>

          <div className="grid gap-3 text-sm">
            <div className="flex items-start gap-3">
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Data i czas</p>
                <p className="text-muted-foreground">
                  {meetingDate ? format(meetingDate, "EEEE, d MMMM yyyy, HH:mm", { locale: pl }) : "-"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Firma / Obiekt</p>
                <p className="text-muted-foreground">
                  {meeting.companies?.name || "Spotkanie wewnętrzne"}
                  {meeting.buildings?.name && ` → ${meeting.buildings.name}`}
                </p>
              </div>
            </div>

            {meeting.attendees && (
              <div className="flex items-start gap-3">
                <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Uczestnicy</p>
                  <p className="text-muted-foreground">{meeting.attendees}</p>
                </div>
              </div>
            )}

            {meeting.notes && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Notatki</p>
                  <p className="text-muted-foreground whitespace-pre-wrap">{meeting.notes}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {canManage && (
          <DialogFooter className="gap-2">
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Usuń
            </Button>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Edytuj
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Confirm Dialog ──────────────────────────────────────
function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Usunąć spotkanie?</DialogTitle>
          <DialogDescription>Tej operacji nie można cofnąć.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Anuluj</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Usuń
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────
export default function MeetingsPage() {
  const { data: meetings, isLoading } = useMeetings();
  const { mutate: deleteMeeting, isPending: isDeleting } = useDeleteMeeting();
  const { role } = useAuth();

  const canManage = role === "super_admin" || role === "admin";

  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editMeeting, setEditMeeting] = useState<any>(null);
  const [detailMeeting, setDetailMeeting] = useState<any>(null);
  const [deleteMeetingId, setDeleteMeetingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("upcoming");

  const now = new Date();

  const filtered = useMemo(() => {
    if (!meetings) return [];
    let list = meetings.filter((m: any) => {
      const q = searchQuery.toLowerCase();
      if (!q) return true;
      return (
        m.title?.toLowerCase().includes(q) ||
        m.companies?.name?.toLowerCase().includes(q) ||
        m.buildings?.name?.toLowerCase().includes(q) ||
        m.attendees?.toLowerCase().includes(q)
      );
    });

    if (activeTab === "upcoming") {
      list = list.filter((m: any) => !m.meeting_date || !isPast(parseISO(m.meeting_date)) || isToday(parseISO(m.meeting_date)));
    } else if (activeTab === "past") {
      list = list.filter((m: any) => m.meeting_date && isPast(parseISO(m.meeting_date)) && !isToday(parseISO(m.meeting_date)));
    }

    return list;
  }, [meetings, searchQuery, activeTab]);

  const handleDelete = () => {
    if (!deleteMeetingId) return;
    deleteMeeting(deleteMeetingId, {
      onSuccess: () => {
        toast.success("Spotkanie usunięte");
        setDeleteMeetingId(null);
        setDetailMeeting(null);
      },
      onError: (err: any) => toast.error("Błąd: " + err.message),
    });
  };

  const upcomingCount = meetings?.filter((m: any) => !m.meeting_date || !isPast(parseISO(m.meeting_date)) || isToday(parseISO(m.meeting_date))).length ?? 0;
  const pastCount = meetings?.filter((m: any) => m.meeting_date && isPast(parseISO(m.meeting_date)) && !isToday(parseISO(m.meeting_date))).length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Spotkania i Wizje Lokalne</h1>
          <p className="text-muted-foreground">Planowanie, dokumentowanie i zarządzanie spotkaniami.</p>
        </div>
        {canManage && (
          <Button onClick={() => setIsCreateOpen(true)} className="fire-gradient w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Nowe spotkanie
          </Button>
        )}
      </div>

      {/* Search + Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Szukaj spotkania..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
          <TabsList>
            <TabsTrigger value="upcoming">Nadchodzące ({upcomingCount})</TabsTrigger>
            <TabsTrigger value="past">Archiwum ({pastCount})</TabsTrigger>
            <TabsTrigger value="all">Wszystkie</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card">
          <Users className="mx-auto h-10 w-10 text-muted-foreground opacity-20" />
          <h3 className="mt-4 text-lg font-semibold">Brak spotkań</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery ? "Zmień kryteria wyszukiwania." : "Zaplanuj pierwsze spotkanie."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m: any) => {
            const meetingDate = m.meeting_date ? parseISO(m.meeting_date) : null;
            const isPastMeeting = meetingDate ? isPast(meetingDate) && !isToday(meetingDate) : false;
            const isTodayMeeting = meetingDate ? isToday(meetingDate) : false;

            return (
              <Card
                key={m.id}
                className={cn(
                  "relative overflow-hidden group border-border shadow-sm hover:shadow-md transition-all cursor-pointer",
                  isTodayMeeting && "ring-2 ring-primary/50"
                )}
                onClick={() => setDetailMeeting(m)}
              >
                <div className={cn(
                  "absolute top-0 left-0 w-1 h-full",
                  isPastMeeting ? "bg-muted-foreground/30" : isTodayMeeting ? "bg-primary" : "bg-emerald-500"
                )} />
                <CardContent className="p-5 pl-6">
                  <div className="flex justify-between items-start mb-3">
                    <div className="min-w-0 flex-1 pr-2">
                      <h3 className="font-bold text-sm truncate">{m.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {meetingDate ? format(meetingDate, "d MMM yyyy, HH:mm", { locale: pl }) : "-"}
                      </p>
                    </div>
                    <Badge
                      variant={isPastMeeting ? "secondary" : isTodayMeeting ? "default" : "outline"}
                      className="text-[10px] shrink-0"
                    >
                      {isPastMeeting ? "Zakończone" : isTodayMeeting ? "Dziś" : "Planowane"}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3 w-3" />
                      <span className="truncate">{m.companies?.name || "Wewnętrzne"}</span>
                      {m.buildings?.name && <span className="truncate">→ {m.buildings.name}</span>}
                    </div>
                    {m.attendees && (
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3 w-3" />
                        <span className="truncate">{m.attendees}</span>
                      </div>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={(e) => { e.stopPropagation(); setEditMeeting(m); }}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Edytuj
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-2 text-destructive hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteMeetingId(m.id); }}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Usuń
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      {isCreateOpen && (
        <MeetingFormDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      )}
      {editMeeting && (
        <MeetingFormDialog open={!!editMeeting} onOpenChange={(o) => !o && setEditMeeting(null)} meeting={editMeeting} />
      )}
      {detailMeeting && (
        <MeetingDetailDialog
          open={!!detailMeeting}
          onOpenChange={(o) => !o && setDetailMeeting(null)}
          meeting={detailMeeting}
          canManage={canManage}
          onEdit={() => { setEditMeeting(detailMeeting); setDetailMeeting(null); }}
          onDelete={() => { setDeleteMeetingId(detailMeeting.id); }}
        />
      )}
      <DeleteConfirmDialog
        open={!!deleteMeetingId}
        onOpenChange={(o) => !o && setDeleteMeetingId(null)}
        onConfirm={handleDelete}
        isPending={isDeleting}
      />
    </div>
  );
}
