import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Upload, MapPin, Move, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";

interface Device {
  id: string;
  name: string;
  floor_plan_x?: number | null;
  floor_plan_y?: number | null;
  device_types?: { name: string } | null;
  status: string;
  location_in_building?: string;
}

interface Props {
  buildingId: string;
  floorPlanUrl: string | null;
  devices: Device[];
  onFloorPlanUploaded: (url: string) => void;
  onDevicePositioned: (deviceId: string, x: number, y: number) => void;
  editable?: boolean;
}

export function FloorPlanViewer({ buildingId, floorPlanUrl, devices, onFloorPlanUploaded, onDevicePositioned, editable = true }: Props) {
  const [uploading, setUploading] = useState(false);
  const [placingDevice, setPlacingDevice] = useState<Device | null>(null);
  const [hoveredDevice, setHoveredDevice] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const imageRef = useRef<HTMLDivElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Wybierz plik graficzny (JPG, PNG)");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${buildingId}/floor-plan-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("floor-plans").upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("floor-plans").getPublicUrl(path);
      onFloorPlanUploaded(publicUrl);
      toast.success("Rzut budynku przesłany!");
    } catch (err: any) {
      toast.error("Błąd przesyłania: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!placingDevice || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onDevicePositioned(placingDevice.id, x, y);
    toast.success(`Urządzenie "${placingDevice.name}" umieszczone na rzucie`);
    setPlacingDevice(null);
  }, [placingDevice, onDevicePositioned]);

  const placedDevices = devices.filter(d => d.floor_plan_x != null && d.floor_plan_y != null);
  const unplacedDevices = devices.filter(d => d.floor_plan_x == null || d.floor_plan_y == null);

  if (!floorPlanUrl) {
    return (
      <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-border rounded-lg bg-muted/10">
        <MapPin className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground mb-4">Prześlij rzut budynku aby oznaczyć urządzenia</p>
        {editable && (
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            <Button variant="outline" asChild disabled={uploading}>
              <span><Upload className="mr-2 h-4 w-4" />{uploading ? "Przesyłanie..." : "Prześlij rzut"}</span>
            </Button>
          </label>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{placedDevices.length} oznaczonych</Badge>
          <Badge variant="outline">{unplacedDevices.length} do oznaczenia</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(3, z + 0.25))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          {editable && (
            <label className="cursor-pointer ml-2">
              <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              <Button variant="outline" size="sm" asChild disabled={uploading}>
                <span><Upload className="mr-1.5 h-3.5 w-3.5" />Zmień rzut</span>
              </Button>
            </label>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-4">
        {/* Floor plan image with markers */}
        <div className="lg:col-span-3 border border-border rounded-lg overflow-auto bg-muted/10 max-h-[600px]">
          <div
            ref={imageRef}
            className={`relative inline-block ${placingDevice ? 'cursor-crosshair' : 'cursor-default'}`}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
            onClick={handleImageClick}
          >
            <img src={floorPlanUrl} alt="Rzut budynku" className="max-w-none select-none" draggable={false} />
            
            {/* Device markers */}
            {placedDevices.map(device => (
              <div
                key={device.id}
                className="absolute group"
                style={{
                  left: `${device.floor_plan_x}%`,
                  top: `${device.floor_plan_y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                onMouseEnter={() => setHoveredDevice(device.id)}
                onMouseLeave={() => setHoveredDevice(null)}
              >
                <div className={`
                  flex items-center justify-center w-6 h-6 rounded-full border-2 shadow-lg transition-all
                  ${device.status === 'aktywne' 
                    ? 'bg-primary border-primary-foreground text-primary-foreground' 
                    : 'bg-destructive border-destructive-foreground text-destructive-foreground'}
                  ${hoveredDevice === device.id ? 'scale-150 z-50' : 'z-10'}
                `}>
                  <MapPin className="h-3 w-3" />
                </div>
                
                {/* Tooltip */}
                {hoveredDevice === device.id && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-popover border border-border shadow-lg whitespace-nowrap z-50">
                    <p className="text-xs font-semibold text-popover-foreground">{device.name}</p>
                    <p className="text-[10px] text-muted-foreground">{device.device_types?.name} • {device.location_in_building || "brak"}</p>
                  </div>
                )}
              </div>
            ))}

            {/* Placing mode indicator */}
            {placingDevice && (
              <div className="absolute inset-0 bg-primary/5 border-2 border-dashed border-primary rounded pointer-events-none" />
            )}
          </div>
        </div>

        {/* Device list sidebar */}
        {editable && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Urządzenia</p>
            
            {placingDevice && (
              <div className="p-3 rounded-lg border-2 border-primary bg-primary/5 text-sm">
                <p className="font-semibold text-primary">Umieszczanie:</p>
                <p className="text-xs text-muted-foreground mt-1">{placingDevice.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Kliknij na rzut aby oznaczyć pozycję</p>
                <Button variant="ghost" size="sm" className="mt-2 w-full h-7 text-xs" onClick={() => setPlacingDevice(null)}>Anuluj</Button>
              </div>
            )}

            <div className="max-h-[500px] overflow-y-auto space-y-1">
              {devices.map(device => {
                const isPlaced = device.floor_plan_x != null && device.floor_plan_y != null;
                return (
                  <div
                    key={device.id}
                    className={`flex items-center gap-2 p-2 rounded-md border text-xs cursor-pointer transition-colors
                      ${isPlaced ? 'border-primary/30 bg-primary/5' : 'border-border hover:bg-secondary/50'}
                      ${hoveredDevice === device.id ? 'ring-2 ring-primary' : ''}
                    `}
                    onMouseEnter={() => setHoveredDevice(device.id)}
                    onMouseLeave={() => setHoveredDevice(null)}
                    onClick={() => !placingDevice && setPlacingDevice(device)}
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isPlaced ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{device.name}</p>
                      <p className="text-muted-foreground truncate">{device.device_types?.name}</p>
                    </div>
                    {isPlaced ? (
                      <MapPin className="h-3 w-3 text-primary shrink-0" />
                    ) : (
                      <Move className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
