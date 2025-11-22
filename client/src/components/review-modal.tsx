import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, User, Calendar, Fingerprint, PenTool } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { DocumentWithDetails } from "@/types";

interface ReviewModalProps {
  document: DocumentWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
}

type WorkflowDetails = NonNullable<DocumentWithDetails["workflow"]>;

export default function ReviewModal({ document, isOpen, onClose }: ReviewModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [comment, setComment] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [visibilityRecipients, setVisibilityRecipients] = useState<string[]>([]);
  const workflowId = document?.workflow?.id;

  const { data: workflowDetails } = useQuery<WorkflowDetails | null>({
    queryKey: ["/api/workflow", workflowId],
    queryFn: async () => {
      if (!workflowId) return null;
      const response = await apiRequest("GET", `/api/workflow/${workflowId}`);
      return response.json();
    },
    enabled: !!workflowId && isOpen,
    staleTime: 10_000,
  });

  const workflowData = workflowDetails ?? document?.workflow ?? null;
  const workflowActions = workflowData?.actions ?? [];

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
      setVisibilityRecipients([]);
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/documents/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/workflow"] });
      if (workflowId) {
        queryClient.invalidateQueries({ queryKey: ["/api/workflow", workflowId] });
      }
      
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

  const applyStoredSignatureMutation = useMutation({
    mutationFn: async () => {
      if (!document) throw new Error("No document selected");
      if (!user?.signature) throw new Error("Save a signature in your profile before adding it here.");
      const response = await apiRequest("POST", `/api/documents/${document.id}/signature`, {
        signature: user.signature,
      });
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Signature Added",
        description: result?.hash
          ? `Document updated (hash ${String(result.hash).substring(0, 10)}...)`
          : "Document updated with your saved signature",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/workflow"] });
    },
    onError: (error: any) => {
      toast({
        title: "Signature Update Failed",
        description: error.message || "Unable to add your saved signature",
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
    if (!workflowData) return null;
    const nextIndex = workflowData.currentStep + 1;
    return workflowData.stepRoles[nextIndex] ?? null;
  }, [workflowData]);

  const currentStepRole = useMemo(() => {
    if (!workflowData) return null;
    return workflowData.stepRoles[workflowData.currentStep] ?? null;
  }, [workflowData]);

  const canReview = !!user && !!currentStepRole && user.role === currentStepRole;

  const buildReviewPayload = (actionType: "approve" | "forward" | "reject") => {
    const uniqueRecipients = Array.from(new Set(visibilityRecipients));
    
    // Only set visibility/audience if recipients are explicitly selected
    // If no recipients selected, comment is not visible to anyone
    if (uniqueRecipients.length === 0) {
      return {
        action: actionType,
        comment,
        visibility: [],
        audience: undefined,
      };
    }

    // Only future reviewers are available as recipients now (no students)
    // All selected recipients are next reviewers
    const audience: "next_reviewer" | undefined = uniqueRecipients.length > 0 ? "next_reviewer" : undefined;

    return {
      action: actionType,
      comment,
      visibility: uniqueRecipients,
      audience,
    };
  };

  const handleApprove = () => {
    reviewMutation.mutate(buildReviewPayload("approve"));
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
    
    let text = raw;
    let targets: string[] = [];
    let audience: "student" | "next_reviewer" | "both" | "unknown" = "unknown";
    
    // Extract visibility tags [vis:role1,role2]
    const visMatch = text.match(/\[vis:([^\]]+)\]/i);
    if (visMatch) {
      targets = visMatch[1]
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      text = text.replace(/\[vis:[^\]]+\]\s*/i, "").trim();
    }
    
    // Extract audience tags [aud:student|next_reviewer|both]
    const audMatch = text.match(/\[aud:(student|next_reviewer|both)\]/i);
    if (audMatch) {
      audience = audMatch[1].toLowerCase() as any;
      text = text.replace(/\[aud:(student|next_reviewer|both)\]\s*/i, "").trim();
    }
    
    return { audience, targets, text };
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
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-sm font-medium">Document Preview</div>
              {user?.signature ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!canReview || !isPdf || applyStoredSignatureMutation.isPending}
                  onClick={() => applyStoredSignatureMutation.mutate()}
                >
                  {applyStoredSignatureMutation.isPending ? "Adding..." : "Add Signature"}
                </Button>
              ) : (
                <span className="text-xs text-gray-500">
                  Save a signature in Profile Settings to enable quick signing.
                </span>
              )}
            </div>
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
          {workflowData && workflowActions.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Workflow Comments</h4>
              <div className="space-y-2 text-sm text-gray-700">
                {workflowActions
                  .filter((action) => action.action !== "uploaded")
                  .map((action) => ({ action, parsed: parseComment(action.comment) }))
                  .filter(({ parsed }) => {
                    const text = parsed.text?.trim();
                    if (!text) {
                      return false;
                    }

                    // If visibility targets are explicitly set, only show to those roles
                    if (parsed.targets && parsed.targets.length > 0) {
                      return !!user && parsed.targets.includes(user.role.toLowerCase());
                    }

                    // Handle audience tags
                    if (parsed.audience === "student") {
                      return user?.role === "student";
                    } else if (parsed.audience === "next_reviewer") {
                      return user?.role && user.role !== "student";
                    } else if (parsed.audience === "both") {
                      return true;
                    }

                    // If no visibility targets and no audience tags, hide the comment
                    // Comments are only visible if recipients were explicitly selected
                    return false;
                  })
                  .map(({ action, parsed }) => (
                    <div
                      key={action.id}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2"
                    >
                      <p className="font-medium text-gray-900">
                        {formatRoleName(action.user.role)}:
                        <span className="ml-1 text-gray-700">
                          {parsed.text?.trim()}
                        </span>
                      </p>
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
                {/* Future roles only */}
                {(() => {
                  if (!workflowData) return null;
                  const futureRoles = Array.from(new Set(workflowData.stepRoles.slice(workflowData.currentStep + 1)));
                  if (futureRoles.length === 0) {
                    return (
                      <p className="text-sm text-gray-500">No future reviewers in the workflow. Comment will remain internal.</p>
                    );
                  }
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
              <Button type="button" onClick={handleApprove} disabled={!canReview || reviewMutation.isPending} data-testid="button-approve">
                {reviewMutation.isPending ? "Processing..." : "Approve & Forward"}
              </Button>
              <Button type="button" onClick={handleReject} variant="destructive" disabled={!canReview || reviewMutation.isPending} data-testid="button-reject">
                {reviewMutation.isPending ? "Processing..." : "Reject"}
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
          <AlertDialogAction onClick={() => reviewMutation.mutate(buildReviewPayload("reject"))} data-testid="confirm-reject">
            Confirm Reject
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
