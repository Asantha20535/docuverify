import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, User, Calendar, Fingerprint } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { DocumentWithDetails } from "@/types";

interface ReviewModalProps {
  document: DocumentWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ReviewModal({ document, isOpen, onClose }: ReviewModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [comment, setComment] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [visibilityRecipients, setVisibilityRecipients] = useState<string[]>([]);

  const reviewMutation = useMutation({
    mutationFn: async (data: { action: string; comment: string; visibility?: string[]; audience?: string }) => {
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
      setComment("");
      setRejectOpen(false);
      
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

  const nextRole = useMemo(() => {
    if (!document?.workflow) return null;
    const nextIndex = document.workflow.currentStep + 1;
    return document.workflow.stepRoles[nextIndex] ?? null;
  }, [document]);

  const currentStepRole = useMemo(() => {
    if (!document?.workflow) return null;
    return document.workflow.stepRoles[document.workflow.currentStep] ?? null;
  }, [document]);

  const canReview = !!user && !!currentStepRole && user.role === currentStepRole;

  const handleApprove = () => {
    reviewMutation.mutate({ action: "approve", comment, visibility: visibilityRecipients as any });
  };

  const handleForward = () => {
    reviewMutation.mutate({ action: "forward", comment, visibility: visibilityRecipients as any });
  };

  const handleReject = () => {
    setRejectOpen(true);
  };

  const formatRoleName = (role: string) => {
    return role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  if (!document) return null;

  // Parse visibility ([vis:...]) or audience ([aud:...]) prefixes from stored comments
  const parseComment = (
    raw?: string | null
  ): { audience: "student" | "next_reviewer" | "both" | "unknown"; targets: string[]; text: string } => {
    if (!raw) return { audience: "unknown", targets: [], text: "" };
    const visMatch = raw.match(/^\[vis:([^\]]+)\]\s*(.*)$/i);
    if (visMatch) {
      const targets = visMatch[1]
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      return { audience: "unknown", targets, text: visMatch[2] ?? "" };
    }
    const audMatch = raw.match(/^\[aud:(student|next_reviewer|both)\]\s*(.*)$/i);
    if (audMatch) {
      return {
        audience: audMatch[1].toLowerCase() as any,
        targets: [],
        text: audMatch[2] ?? "",
      };
    }
    return { audience: "unknown", targets: [], text: raw };
  };

  return (
    <>
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
          {document.workflow && Array.isArray(document.workflow.actions) && document.workflow.actions.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Workflow History</h4>
              <div className="space-y-3">
                {document.workflow!.actions!
                  .map((action) => ({ action, parsed: parseComment(action.comment) }))
                  .filter(({ parsed }) => {
                    if (parsed.targets && parsed.targets.length > 0) {
                      return !!user && parsed.targets.includes(user.role.toLowerCase());
                    }
                    if (parsed.audience === "student") return false;
                    return true;
                  })
                  .map(({ action, parsed }) => (
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
                          {action.action}: {parsed.text || "No comment provided"}
                          {parsed.targets.length > 0 ? (
                            <span className="ml-2 text-xs text-gray-400">[visible to {parsed.targets.join(", ")}]</span>
                          ) : parsed.audience !== "unknown" ? (
                            <span className="ml-2 text-xs text-gray-400">[{parsed.audience === "both" ? "visible to student & next reviewer" : parsed.audience === "student" ? "visible to student" : "visible to next reviewer"}]</span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
          
          {/* Authorization and Next Reviewer */}
          {!canReview && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded-md text-sm">
              You are signed in as <strong>{user?.fullName}</strong> ({user?.role.replace('_', ' ')}), but the current step is assigned to <strong>{currentStepRole ? formatRoleName(currentStepRole) : 'N/A'}</strong>. Actions are disabled.
            </div>
          )}
          <div className="bg-blue-50 p-3 rounded-md text-sm">
            {nextRole ? (
              <span>
                Next reviewer: <strong>{formatRoleName(nextRole)}</strong>
              </span>
            ) : (
              <span>This is the final approval step.</span>
            )}
          </div>

          {/* Review Actions */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="review-comment">Comment</Label>
              <Textarea
                id="review-comment"
                data-testid="textarea-comment"
                rows={3}
                className="mt-2"
                placeholder="Add your comments..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>

            <div>
              <Label>Who can see this comment</Label>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Student */}
                <label className="flex items-center space-x-2 text-sm">
                  <Checkbox
                    checked={visibilityRecipients.includes("student")}
                    onCheckedChange={(checked) => {
                      setVisibilityRecipients((prev) =>
                        checked ? Array.from(new Set([...(prev || []), "student"])) : prev.filter((v) => v !== "student")
                      );
                    }}
                  />
                  <span>Student ({document.user.fullName})</span>
                </label>
                {/* Future roles */}
                {(() => {
                  if (!document.workflow) return null;
                  const futureRoles = Array.from(new Set(document.workflow.stepRoles.slice(document.workflow.currentStep + 1)));
                  return futureRoles.map((role) => (
                    <label key={role} className="flex items-center space-x-2 text-sm">
                      <Checkbox
                        checked={visibilityRecipients.includes(role.toLowerCase())}
                        onCheckedChange={(checked) => {
                          setVisibilityRecipients((prev) => {
                            const key = role.toLowerCase();
                            return checked
                              ? Array.from(new Set([...(prev || []), key]))
                              : prev.filter((v) => v !== key);
                          });
                        }}
                      />
                      <span>{formatRoleName(role)}</span>
                    </label>
                  ));
                })()}
              </div>
              {visibilityRecipients.length === 0 && (
                <p className="mt-1 text-xs text-gray-500">No recipients selected. The comment will remain internal unless you add recipients.</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
                Cancel
              </Button>
              <Button type="button" onClick={handleForward} variant="secondary" disabled={!canReview || reviewMutation.isPending} data-testid="button-forward">
                {reviewMutation.isPending ? "Processing..." : "Forward without Signing"}
              </Button>
              <Button type="button" onClick={handleApprove} disabled={!canReview || reviewMutation.isPending} data-testid="button-approve">
                {reviewMutation.isPending ? "Processing..." : "Approve & Forward"}
              </Button>
              <Button type="button" onClick={handleReject} variant="destructive" disabled={!canReview || reviewMutation.isPending} data-testid="button-reject">
                Reject
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Reject confirmation */}
    <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reject this document?</AlertDialogTitle>
          <AlertDialogDescription>
            This action will mark the workflow as completed and remove the document from the pending review list. You can optionally provide a comment for the requester.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => reviewMutation.mutate({ action: "reject", comment, visibility: visibilityRecipients as any })} data-testid="confirm-reject">
            Confirm Reject
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
