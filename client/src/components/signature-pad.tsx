import { useRef, useEffect, useState, useCallback, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Undo2, RotateCcw, Download } from "lucide-react";

interface SignaturePadProps {
  onSignatureChange: (signatureData: string | null) => void;
  initialSignature?: string | null;
  className?: string;
  extraControls?: ReactNode;
}

export default function SignaturePad({ onSignatureChange, initialSignature, className = "", extraControls }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Set drawing style
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    setContext(ctx);

    // Load initial signature if provided
    if (initialSignature) {
      loadSignature(initialSignature);
    }
  }, [initialSignature]);

  const loadSignature = useCallback((signatureData: string) => {
    const canvas = canvasRef.current;
    if (!canvas || !context) return;

    const img = new Image();
    img.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      setHasSignature(true);
      onSignatureChange(signatureData);
    };
    img.src = signatureData;
  }, [context, onSignatureChange]);

  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!context) return;
    
    setIsDrawing(true);
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e as any).clientX - rect.left;
    const y = (e as any).clientY - rect.top;
    
    context.beginPath();
    context.moveTo(x, y);
  }, [context]);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !context) return;
    
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e as any).clientX - rect.left;
    const y = (e as any).clientY - rect.top;
    
    context.lineTo(x, y);
    context.stroke();
  }, [isDrawing, context]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    
    setIsDrawing(false);
    setHasSignature(true);
    
    // Convert canvas to data URL and notify parent
    const canvas = canvasRef.current;
    if (canvas) {
      const signatureData = canvas.toDataURL("image/png");
      onSignatureChange(signatureData);
    }
  }, [isDrawing, onSignatureChange]);

  const clearSignature = useCallback(() => {
    if (!context || !canvasRef.current) return;
    
    context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasSignature(false);
    onSignatureChange(null);
  }, [context, onSignatureChange]);

  const undoLastStroke = useCallback(() => {
    // This is a simplified undo - in a real implementation you'd track all strokes
    clearSignature();
  }, [clearSignature]);

  const downloadSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;
    
    const link = document.createElement("a");
    link.download = "signature.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [hasSignature]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    startDrawing(e);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    draw(e);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    stopDrawing();
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    stopDrawing();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent("mousedown", {
      clientX: touch.clientX,
      clientY: touch.clientY,
    });
    startDrawing(mouseEvent as any);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent("mousemove", {
      clientX: touch.clientX,
      clientY: touch.clientY,
    });
    draw(mouseEvent as any);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    stopDrawing();
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">Digital Signature</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
          <canvas
            ref={canvasRef}
            className="w-full h-48 border border-gray-200 rounded cursor-crosshair touch-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />
          <p className="text-xs text-gray-500 mt-2 text-center">
            Draw your signature above using mouse or touch
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2 justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={undoLastStroke}
            disabled={!hasSignature}
          >
            <Undo2 className="w-4 h-4 mr-1" />
            Undo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearSignature}
            disabled={!hasSignature}
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            Clear
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadSignature}
            disabled={!hasSignature}
          >
            <Download className="w-4 h-4 mr-1" />
            Download
          </Button>
          {extraControls}
        </div>
        
        {hasSignature && (
          <div className="text-sm text-green-600 text-center">
            ✓ Signature captured successfully
          </div>
        )}
      </CardContent>
    </Card>
  );
}

