import { useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface SignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (signatureBase64: string) => void;
  title?: string;
}

export function SignatureDialog({ open, onOpenChange, onConfirm, title = "Złóż podpis elektroniczny" }: SignatureDialogProps) {
  const sigCanvas = useRef<SignatureCanvas>(null);
  
  const handleClear = () => {
    sigCanvas.current?.clear();
  };
  
  const handleConfirm = () => {
    if (sigCanvas.current?.isEmpty()) {
      return;
    }
    const dataUrl = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png');
    if (dataUrl) {
      onConfirm(dataUrl);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Złóż wyraźny podpis palcem lub rysikiem poniżej, aby zatwierdzić dokument wprowadzając jego PDF.
          </DialogDescription>
        </DialogHeader>
        
        <div className="border-2 border-dashed border-slate-300 rounded-md bg-white flex justify-center items-center mt-4">
          <SignatureCanvas 
            ref={sigCanvas} 
            penColor="black"
            canvasProps={{ width: 450, height: 200, className: "signature-canvas" }} 
          />
        </div>
        
        <DialogFooter className="flex justify-between sm:justify-between items-center mt-4">
          <Button type="button" variant="outline" onClick={handleClear}>
            Wyczyść
          </Button>
          <div className="space-x-2 flex">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button type="button" onClick={handleConfirm}>
              Zatwierdź podpis
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
