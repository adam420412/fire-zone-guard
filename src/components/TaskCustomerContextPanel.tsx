import { Link } from "react-router-dom";
import { Building2, MapPin, Phone, Mail, User, Hash, ExternalLink, Briefcase, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TaskWithDetails } from "@/hooks/useSupabaseData";

interface Props {
  task: TaskWithDetails;
}

export default function TaskCustomerContextPanel({ task }: Props) {
  const hasContact = !!(task.contactName || task.contactPhone || task.contactEmail);
  const cleanPhone = (task.contactPhone || "").replace(/\s/g, "");

  return (
    <div className="rounded-md border border-border bg-secondary/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Kontekst klienta
        </h4>
        <div className="flex gap-1.5">
          {task.opportunity_id && (
            <Badge variant="outline" className="text-[9px] uppercase font-bold gap-1">
              <Sparkles className="h-2.5 w-2.5" /> Z szansy
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* FIRMA */}
        <div className="space-y-1.5 p-3 rounded-sm bg-card border border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
              <Briefcase className="h-3 w-3 text-primary" /> Firma
            </span>
            {task.company_id && (
              <Link to={`/companies?id=${task.company_id}`}>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] uppercase font-bold tracking-wider gap-1">
                  Otwórz <ExternalLink className="h-2.5 w-2.5" />
                </Button>
              </Link>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground">{task.companyName || "—"}</p>
          {task.companyNip && (
            <p className="text-xs text-muted-foreground font-mono flex items-center gap-1.5">
              <Hash className="h-3 w-3" /> NIP {task.companyNip}
            </p>
          )}
          {task.companyAddress && (
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <MapPin className="h-3 w-3 mt-0.5 shrink-0" /> {task.companyAddress}
            </p>
          )}
        </div>

        {/* OBIEKT */}
        <div className="space-y-1.5 p-3 rounded-sm bg-card border border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3 w-3 text-primary" /> Obiekt
            </span>
            {task.building_id && (
              <Link to={`/buildings/${task.building_id}`}>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] uppercase font-bold tracking-wider gap-1">
                  Otwórz <ExternalLink className="h-2.5 w-2.5" />
                </Button>
              </Link>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground">{task.buildingName || "—"}</p>
          {task.buildingAddress && (
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <MapPin className="h-3 w-3 mt-0.5 shrink-0" /> {task.buildingAddress}
            </p>
          )}
        </div>

        {/* KONTAKT */}
        {hasContact && (
          <div className="md:col-span-2 space-y-2 p-3 rounded-sm bg-card border border-border">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                <User className="h-3 w-3 text-primary" /> Osoba kontaktowa
              </span>
              {task.contactPosition && (
                <span className="text-[10px] uppercase text-muted-foreground">{task.contactPosition}</span>
              )}
            </div>
            <p className="text-sm font-semibold text-foreground">{task.contactName || "—"}</p>
            <div className="flex flex-wrap gap-2">
              {task.contactPhone && (
                <a
                  href={`tel:${cleanPhone}`}
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-primary hover:underline bg-primary/10 px-2.5 py-1 rounded-sm"
                >
                  <Phone className="h-3 w-3" /> {task.contactPhone}
                </a>
              )}
              {task.contactEmail && (
                <a
                  href={`mailto:${task.contactEmail}`}
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline bg-primary/10 px-2.5 py-1 rounded-sm"
                >
                  <Mail className="h-3 w-3" /> {task.contactEmail}
                </a>
              )}
              {task.contactPhone && (
                <a
                  href={`https://wa.me/${cleanPhone.replace(/^\+?/, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-500 hover:underline bg-emerald-500/10 px-2.5 py-1 rounded-sm"
                >
                  WhatsApp
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
