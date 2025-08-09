import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, User, Calendar, Fingerprint } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { DocumentWithDetails } from "@/types";

interface ReviewModalProps {
  document: DocumentWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ReviewModal({ document, isOpen, onClose }: ReviewModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    action: "",
    comment: "",
  });

  const reviewMutation = useMutation({
    mutationFn: async (data: { action: string; comment: string }) => {
      if (!document?.workflow) throw new Error("No workflow found");
      
      const response = await apiRequest("POST", `/api/workflow/${document.workflow.id}/action`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Review Submitted",
        description: "Your review has been processed successfully",
      });
      
      // Reset form
      setFormData({ action: "", comment: "" });
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/documents/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/workflow"] });
      
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Review Failed",
        description: error.message || "Failed to submit review",
        variant: "destructive",
      });
    },
  });

  const isPdf = useMemo(() => {
    if (!document) return false;
    return document.mimeType === "application/pdf" || document.fileName?.toLowerCase().endsWith(".pdf");
  }, [document]);

  const viewerUrl = useMemo(() => {
    if (!document) return "";
    return `/api/documents/${document.id}/content`;
  }, [document]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.action) {
      toast({
        title: "Error",
        description: "Please select an action",
        variant: "destructive",
      });
      return;
    }

    reviewMutation.mutate(formData);
  };

  const formatRoleName = (role: string) => {
    return role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  if (!document) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="modal-title">Review Document</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Embedded Preview */}
          <div className="bg-gray-50 p-2 rounded-lg">
            <div className="text-sm font-medium mb-2">Document Preview</div>
            {isPdf ? (
              <iframe
                title="Document Preview"
                src={viewerUrl}
                className="w-full h-[480px] border rounded"
              />
            ) : (
              <div className="text-sm text-gray-600">Preview not available. Use the link below to open the file.</div>
            )}
            <div className="mt-2">
              <a href={viewerUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-sm underline">
                Open in new tab
              </a>
            </div>
          </div>

          {/* Document Info */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Document Information</h4>
            <div className="text-sm text-gray-600 space-y-1">
              <p><strong>Title:</strong> <span data-testid="text-document-title">{document.title}</span></p>
              <p><strong>Type:</strong> {document.type}</p>
              <p><strong>Student:</strong> <span data-testid="text-student-name">{document.user.fullName}</span></p>
              <p><strong>Hash:</strong> <span className="font-mono">{document.hash}</span></p>
            </div>
          </div>
          
          {/* Previous Comments */}
          {document.workflow && document.workflow.actions.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Workflow History</h4>
              <div className="space-y-3">
                {document.workflow.actions.map((action) => (
                  <div key={action.id} className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="text-green-600 text-xs" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-900">{action.user.fullName}</span>
                        <Badge variant="secondary" className="text-xs">
                          {formatRoleName(action.user.role)}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {new Date(action.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {action.action}: {action.comment || "No comment provided"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Review Actions */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="review-action">Action *</Label>
              <Select value={formData.action} onValueChange={(value) => setFormData({ ...formData, action: value })}>
                <SelectTrigger className="mt-2" data-testid="select-action">
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approve">Approve & Sign</SelectItem>
                  <SelectItem value="forward">Forward without Signing</SelectItem>
                  <SelectItem value="reject">Reject</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="review-comment">Comment</Label>
              <Textarea
                id="review-comment"
                data-testid="textarea-comment"
                rows={3}
                className="mt-2"
                placeholder="Add your comments..."
                value={formData.comment}
                onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              />
            </div>
            
            <div className="flex justify-end space-x-3">
              <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={reviewMutation.isPending}
                data-testid="button-submit-review"
              >
                {reviewMutation.isPending ? "Submitting..." : "Submit Review"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
