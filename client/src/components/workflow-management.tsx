import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiRequestWithFormData } from "@/lib/queryClient";
import "@/lib/pdf";
import { Document, Page } from "react-pdf";
import type { DocumentTemplate, SignaturePlacementMap, User } from "@/types";

interface WorkflowManagementProps {
  users: User[];
}

const roleNameMap: Record<string, string> = {
  academic_staff: "Academic Staff",
  department_head: "Department Head",
  dean: "Dean",
  vice_chancellor: "Vice Chancellor",
  assistant_registrar: "Assistant Registrar",
  course_unit: "Course Unit",
};

const documentTypeOptions = [
  { value: "transcript_request", label: "Transcript Request" },
  { value: "enrollment_verification", label: "Enrollment Verification" },
  { value: "grade_report", label: "Grade Report" },
  { value: "certificate_verification", label: "Certificate Verification" },
  { value: "letter_of_recommendation", label: "Letter of Recommendation" },
  { value: "academic_record", label: "Academic Record" },
  { value: "degree_verification", label: "Degree Verification" },
  { value: "other", label: "Other" },
] as const;

const formatRoleLabel = (role: string) => {
  if (roleNameMap[role]) return roleNameMap[role];
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const filterPlacementsForRoles = (placements: SignaturePlacementMap, roles: string[]) => {
  return roles.reduce((acc, role) => {
    if (placements[role]?.length) {
      acc[role] = placements[role];
    }
    return acc;
  }, {} as SignaturePlacementMap);
};

const getRoleInitials = (role: string) =>
  formatRoleLabel(role)
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase())
    .join("")
    .slice(0, 3);

export default function WorkflowManagement({ users }: WorkflowManagementProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddWorkflowOpen, setIsAddWorkflowOpen] = useState(false);
  const [isEditWorkflowOpen, setIsEditWorkflowOpen] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<DocumentTemplate | null>(null);
  const [newWorkflow, setNewWorkflow] = useState({
    name: "",
    type: "other",
    approvalPath: [] as string[],
  });
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [signaturePlacements, setSignaturePlacements] = useState<SignaturePlacementMap>({});
  const [activePlacementRole, setActivePlacementRole] = useState<string | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<Error | null>(null);
  const templatePreviewUrl = useMemo(() => (templateFile ? URL.createObjectURL(templateFile) : null), [templateFile]);

  useEffect(() => {
    return () => {
      if (templatePreviewUrl) {
        URL.revokeObjectURL(templatePreviewUrl);
      }
    };
  }, [templatePreviewUrl]);

  useEffect(() => {
    if (templatePreviewUrl) {
      console.log("PDF URL in Document:", templatePreviewUrl);
      console.log("Blob size:", templateFile?.size ?? 0);
    }
  }, [templatePreviewUrl, templateFile]);

  const { data: workflows = [], isLoading } = useQuery<DocumentTemplate[]>({
    queryKey: ["/api/admin/templates"],
  });

  const roleOptions = useMemo(() => {
    return users
      .filter(user => user.role !== "student" && user.role !== "admin")
      .map(user => ({
        value: user.role,
        label: `${user.fullName} (${user.role.replace('_', ' ')})`,
      }));
  }, [users]);

  useEffect(() => {
    const definedRoles = newWorkflow.approvalPath.filter(role => role);
    setSignaturePlacements((prev) => {
      const next: SignaturePlacementMap = {};
      definedRoles.forEach((role) => {
        next[role] = prev[role] || [];
      });
      return next;
    });
    setActivePlacementRole((current) => {
      if (current && definedRoles.includes(current)) {
        return current;
      }
      return definedRoles[0] ?? null;
    });
  }, [newWorkflow.approvalPath]);

  const resetWorkflowForm = useCallback(() => {
    setNewWorkflow({
      name: "",
      type: "other",
      approvalPath: [],
    });
    setTemplateFile(null);
    setSignaturePlacements({});
    setActivePlacementRole(null);
    setPdfPageCount(0);
    setPdfLoadError(null);
  }, []);

  const createWorkflowMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiRequestWithFormData("POST", "/api/admin/templates", formData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Workflow Created",
        description: "New workflow configuration has been created successfully",
      });
      resetWorkflowForm();
      setIsAddWorkflowOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/templates"] });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create workflow",
        variant: "destructive",
      });
    },
  });

  const updateWorkflowMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<DocumentTemplate> }) => {
      const response = await apiRequest("PUT", `/api/admin/templates/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Workflow Updated",
        description: "Workflow configuration has been updated successfully",
      });
      setIsEditWorkflowOpen(false);
      setSelectedWorkflow(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/templates"] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update workflow",
        variant: "destructive",
      });
    },
  });

  const deleteWorkflowMutation = useMutation({
    mutationFn: async (workflowId: string) => {
      const response = await apiRequest("DELETE", `/api/admin/templates/${workflowId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Workflow Deleted",
        description: "Workflow configuration has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/templates"] });
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete workflow",
        variant: "destructive",
      });
    },
  });

  const handleCreateWorkflow = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newWorkflow.name.trim();
    const definedRoles = newWorkflow.approvalPath.filter(role => role);

    if (!trimmedName || definedRoles.length === 0) {
      toast({
        title: "Missing details",
        description: "Please provide a document type name and at least one reviewer.",
        variant: "destructive",
      });
      return;
    }

    if (!templateFile) {
      toast({
        title: "Template required",
        description: "Upload a PDF template to continue.",
        variant: "destructive",
      });
      return;
    }

    if (!pdfPageCount) {
      toast({
        title: "Template not ready",
        description: "Please wait for the PDF preview to finish loading before saving.",
        variant: "destructive",
      });
      return;
    }

    const missingPlacements = definedRoles.filter((role) => !signaturePlacements[role] || signaturePlacements[role].length === 0);
    if (missingPlacements.length) {
      toast({
        title: "Place signatures",
        description: `Add signature positions for: ${missingPlacements.map(formatRoleLabel).join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("name", trimmedName);
    formData.append("type", newWorkflow.type);
    formData.append("approvalPath", JSON.stringify(definedRoles));
    formData.append("signaturePlacements", JSON.stringify(filterPlacementsForRoles(signaturePlacements, definedRoles)));
    formData.append("templatePageCount", pdfPageCount.toString());
    formData.append("templateFile", templateFile);

    createWorkflowMutation.mutate(formData);
  };

  const handleUpdateWorkflow = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedWorkflow) return;

    updateWorkflowMutation.mutate({
      id: selectedWorkflow.id,
      data: {
        name: selectedWorkflow.name,
        approvalPath: selectedWorkflow.approvalPath,
      },
    });
  };

  const definedApprovalRoles = useMemo(() => newWorkflow.approvalPath.filter(role => role), [newWorkflow.approvalPath]);

  const handleAddWorkflowDialogChange = useCallback((open: boolean) => {
    setIsAddWorkflowOpen(open);
    if (!open) {
      resetWorkflowForm();
    }
  }, [resetWorkflowForm]);

  const handleEditWorkflow = (workflow: DocumentTemplate) => {
    setSelectedWorkflow(workflow);
    setIsEditWorkflowOpen(true);
  };

  const handleDeleteWorkflow = (workflowId: string, workflowName: string) => {
    if (confirm(`Are you sure you want to delete the workflow "${workflowName}"?`)) {
      deleteWorkflowMutation.mutate(workflowId);
    }
  };

  const handleTemplateFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setTemplateFile(null);
      setPdfLoadError(null);
      setPdfError(null);
      setPdfPageCount(0);
      return;
    }

    if (file.type !== "application/pdf") {
      toast({
        title: "Unsupported file",
        description: "Please upload a PDF document.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Templates must be 10MB or smaller.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    setTemplateFile(file);
    setPdfPageCount(0);
    setPdfLoadError(null);
    setPdfError(null);
  };

  const handlePdfLoadSuccess = ({ numPages }: { numPages: number }) => {
    setPdfPageCount(numPages);
    setPdfLoadError(null);
    setPdfError(null);
  };

  const handlePdfError = (error: Error) => {
    console.error("PDF preview error:", error);
    setPdfError(error);
    setPdfLoadError("Unable to render the PDF template. Please try a different file.");
  };

  const describePdfError = (error: Error | null) => {
    if (!error) return null;
    if (error.name === "InvalidPDFException") {
      return "The selected file is not a valid PDF. Please upload a standard PDF export.";
    }
    if (error.name === "MissingPDFException") {
      return "The PDF file could not be found. Please re-upload and try again.";
    }
    if (error.name === "UnexpectedResponseException") {
      return "Unexpected response while loading the PDF. Please check the template file.";
    }
    return error.message || "Unknown error occurred while loading the PDF.";
  };

  const handlePdfClick = (event: MouseEvent<HTMLDivElement>, pageNumber: number) => {
    if (!activePlacementRole) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    if (x < 0 || x > 1 || y < 0 || y > 1) return;

    setSignaturePlacements((prev) => {
      const nextRolePlacements = prev[activePlacementRole] ? [...prev[activePlacementRole]] : [];
      nextRolePlacements.push({
        page: pageNumber,
        x: Number(x.toFixed(4)),
        y: Number(y.toFixed(4)),
      });
      return {
        ...prev,
        [activePlacementRole]: nextRolePlacements,
      };
    });
  };

  const handleRemovePlacement = (role: string, index: number) => {
    setSignaturePlacements((prev) => {
      const rolePlacements = prev[role] ? [...prev[role]] : [];
      rolePlacements.splice(index, 1);
      return {
        ...prev,
        [role]: rolePlacements,
      };
    });
  };

  const handleClearPlacements = (role: string) => {
    setSignaturePlacements((prev) => ({
      ...prev,
      [role]: [],
    }));
  };

  const addApprovalStep = () => {
    setNewWorkflow({
      ...newWorkflow,
      approvalPath: [...newWorkflow.approvalPath, ""],
    });
  };

  const removeApprovalStep = (index: number) => {
    setNewWorkflow({
      ...newWorkflow,
      approvalPath: newWorkflow.approvalPath.filter((_, i) => i !== index),
    });
  };

  const updateApprovalStep = (index: number, value: string) => {
    const newApprovalPath = [...newWorkflow.approvalPath];
    newApprovalPath[index] = value;
    setNewWorkflow({
      ...newWorkflow,
      approvalPath: newApprovalPath,
    });
  };

  const formatWorkflowPath = (approvalPath: string[]) => {
    return approvalPath.map(role => {
      const roleNames: Record<string, string> = {
        academic_staff: "Academic Staff",
        department_head: "Department Head",
        dean: "Dean",
        vice_chancellor: "Vice Chancellor",
        assistant_registrar: "Assistant Registrar",
        course_unit: "Course Unit",
      };
      return roleNames[role] || role;
    }).join(" → ");
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Workflow Configuration</CardTitle>
          <Dialog open={isAddWorkflowOpen} onOpenChange={handleAddWorkflowDialogChange}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-workflow">
                <Plus className="w-4 h-4 mr-2" />
                Add Workflow
              </Button>
            </DialogTrigger>
              <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Add New Workflow Configuration</DialogTitle>
              </DialogHeader>
                <form onSubmit={handleCreateWorkflow} className="flex flex-col flex-1 min-h-0">
                  <div className="overflow-y-auto flex-1 pr-2 space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="workflow-name">Document Type Name</Label>
                      <Input
                        id="workflow-name"
                        data-testid="input-workflow-name"
                        type="text"
                        required
                        className="mt-1"
                        placeholder="e.g., Transcript Request, Enrollment Verification"
                        value={newWorkflow.name}
                        onChange={(e) => setNewWorkflow({ ...newWorkflow, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="workflow-type">Document Type (System)</Label>
                      <Select
                        value={newWorkflow.type}
                        onValueChange={(value) => setNewWorkflow({ ...newWorkflow, type: value })}
                      >
                        <SelectTrigger id="workflow-type" className="mt-1">
                          <SelectValue placeholder="Select document type" />
                        </SelectTrigger>
                        <SelectContent>
                          {documentTypeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Determines which document requests are routed through this workflow.
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label>Approval Workflow</Label>
                    <div className="mt-3 space-y-3">
                      {newWorkflow.approvalPath.map((step, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Select
                            value={step}
                            onValueChange={(value) => updateApprovalStep(index, value)}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              {roleOptions.map((option) => (
                                <SelectItem key={`${option.value}-${index}`} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeApprovalStep(index)}
                            aria-label="Remove approval step"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addApprovalStep}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Reviewer
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label>Document Template (PDF)</Label>
                    <div className="mt-2 space-y-2">
                      <Input
                        type="file"
                        accept="application/pdf"
                        onChange={handleTemplateFileChange}
                        data-testid="input-workflow-template"
                      />
                      <p className="text-xs text-muted-foreground">
                        Upload the blank document that reviewers will sign. PDF only, up to 10MB.
                      </p>
                      {templateFile && (
                        <p className="text-xs text-gray-600">
                          Selected: <span className="font-medium">{templateFile.name}</span>{" "}
                          ({(templateFile.size / (1024 * 1024)).toFixed(2)} MB)
                          {pdfPageCount ? ` • ${pdfPageCount} pages detected` : ""}
                        </p>
                      )}
                      {pdfLoadError && (
                        <p className="text-xs text-red-600">{pdfLoadError}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
                    <div className="rounded-lg border bg-white">
                      {templatePreviewUrl ? (
                        <div className="space-y-4 p-4">
                          <div className="flex flex-col gap-1 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                            <span>PDF Preview</span>
                            {activePlacementRole ? (
                              <span>
                                Placing for{" "}
                                <span className="font-medium text-gray-900">
                                  {formatRoleLabel(activePlacementRole)}
                                </span>
                              </span>
                            ) : (
                              <span>Select a reviewer to place their signature.</span>
                            )}
                          </div>
                          <div className="max-h-[65vh] overflow-y-auto pr-2">
                            {pdfError && (
                              <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                {describePdfError(pdfError)}
                              </div>
                            )}
                            <Document
                              key={templatePreviewUrl}
                              file={templatePreviewUrl}
                              onLoadSuccess={handlePdfLoadSuccess}
                              onLoadError={handlePdfError}
                              onSourceError={handlePdfError}
                              loading={<div className="py-8 text-center text-sm text-muted-foreground">Loading PDF...</div>}
                              error={
                                <div className="rounded border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                  {describePdfError(pdfError) ?? "Failed to load PDF preview. Please ensure the file is a valid PDF."}
                                </div>
                              }
                            >
                              {Array.from({ length: pdfPageCount || 1 }).map((_, index) => (
                                <div
                                  key={index}
                                  className="relative mb-6 cursor-crosshair rounded-md border bg-white p-2 pb-4 shadow-sm last:mb-0"
                                  onClick={(event) => handlePdfClick(event, index + 1)}
                                >
                                  <div className="overflow-hidden rounded">
                                    <Page
                                      pageNumber={index + 1}
                                      renderTextLayer={false}
                                      renderAnnotationLayer={false}
                                      width={580}
                                    />
                                  </div>
                                  <div className="absolute inset-0">
                                    {Object.entries(signaturePlacements).flatMap(([role, placements]) =>
                                      placements
                                        .filter((placement) => placement.page === index + 1)
                                        .map((placement, placementIndex) => (
                                          <div
                                            key={`${role}-${placementIndex}`}
                                            className={`pointer-events-none absolute z-10 grid h-10 w-10 place-items-center rounded-full border-2 text-[10px] font-semibold shadow-lg ${
                                              role === activePlacementRole
                                                ? "border-blue-500 bg-blue-600 text-white"
                                                : "border-gray-300 bg-white text-gray-800"
                                            }`}
                                            style={{
                                              left: `${placement.x * 100}%`,
                                              top: `${placement.y * 100}%`,
                                              transform: "translate(-50%, -50%)",
                                            }}
                                          >
                                            {getRoleInitials(role)}
                                          </div>
                                        ))
                                    )}
                                  </div>
                                  <div className="mt-2 text-xs text-muted-foreground">Page {index + 1}</div>
                                </div>
                              ))}
                            </Document>
                          </div>
                        </div>
                      ) : (
                        <div className="p-6 text-center text-sm text-muted-foreground">
                          Upload a PDF template to preview it and set signature placements.
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg border bg-white p-4 space-y-5">
                      <div>
                        <Label>Active Reviewer</Label>
                        <Select
                          value={activePlacementRole ?? undefined}
                          onValueChange={setActivePlacementRole}
                          disabled={definedApprovalRoles.length === 0}
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Select a reviewer" />
                          </SelectTrigger>
                          <SelectContent>
                            {definedApprovalRoles.map((role) => (
                              <SelectItem key={role} value={role}>
                                {formatRoleLabel(role)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Choose a reviewer, then click directly on the PDF to drop their signature placeholder.
                        </p>
                      </div>
                      <div>
                        <Label>Signature placements</Label>
                        <div className="mt-3 space-y-3">
                          {definedApprovalRoles.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Add reviewers above to assign signature locations.
                            </p>
                          ) : (
                            definedApprovalRoles.map((role) => {
                              const placements = signaturePlacements[role] || [];
                              return (
                                <div key={role} className="rounded-md border p-3">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-sm font-medium text-gray-900">{formatRoleLabel(role)}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {placements.length
                                          ? `${placements.length} placement${placements.length > 1 ? "s" : ""}`
                                          : "No placements yet"}
                                      </p>
                                    </div>
                                    <Badge variant={placements.length ? "secondary" : "destructive"}>
                                      {placements.length ? "Ready" : "Missing"}
                                    </Badge>
                                  </div>
                                  {placements.length > 0 && (
                                    <ul className="mt-3 space-y-2 text-xs text-gray-600">
                                      {placements.map((placement, index) => (
                                        <li key={`${role}-${index}`} className="flex items-center justify-between">
                                          <span>
                                            #{index + 1} – Pg {placement.page} • X {(placement.x * 100).toFixed(1)}% • Y {(placement.y * 100).toFixed(1)}%
                                          </span>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRemovePlacement(role, index)}
                                            aria-label="Remove placement"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  {placements.length > 0 && (
                                    <Button
                                      type="button"
                                      variant="link"
                                      className="px-0 text-xs"
                                      onClick={() => handleClearPlacements(role)}
                                    >
                                      Clear placements
                                    </Button>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>
                  <div className="flex justify-end space-x-2 pt-4 border-t mt-4">
                    <Button type="button" variant="outline" onClick={() => handleAddWorkflowDialogChange(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createWorkflowMutation.isPending} data-testid="button-create-workflow">
                      {createWorkflowMutation.isPending ? "Creating..." : "Create Workflow"}
                    </Button>
                  </div>
                </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading workflows...</div>
          ) : workflows.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No workflow configurations found. Add your first workflow to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {workflows.map((workflow) => (
                <div key={workflow.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">{workflow.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {workflow.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-600">
                      {formatWorkflowPath(workflow.approvalPath)}
                    </p>
                    {workflow.description && (
                      <p className="text-xs text-gray-500 mt-1">{workflow.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                      {workflow.templateFileName && <span>Template: {workflow.templateFileName}</span>}
                      {workflow.templatePageCount && <span>{workflow.templatePageCount} pages</span>}
                      {workflow.signaturePlacements && (() => {
                        const totalPlacements = Object.values(workflow.signaturePlacements || {}).reduce(
                          (count, placements) => count + placements.length,
                          0,
                        );
                        return (
                          <span>
                            {totalPlacements} signature spot{totalPlacements === 1 ? "" : "s"}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditWorkflow(workflow)}
                      data-testid="button-edit-workflow"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteWorkflow(workflow.id, workflow.name)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Workflow Modal */}
      <Dialog open={isEditWorkflowOpen} onOpenChange={setIsEditWorkflowOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Workflow Configuration</DialogTitle>
          </DialogHeader>
          
          {selectedWorkflow && (
            <form onSubmit={handleUpdateWorkflow} className="space-y-4">
              <div>
                <Label htmlFor="edit-workflow-name">Document Type Name</Label>
                <Input
                  id="edit-workflow-name"
                  type="text"
                  required
                  className="mt-1"
                  value={selectedWorkflow.name}
                  onChange={(e) => setSelectedWorkflow({ ...selectedWorkflow, name: e.target.value })}
                />
              </div>
              
              <div>
                <Label>Approval Workflow</Label>
                <div className="mt-2 space-y-2">
                  {selectedWorkflow.approvalPath.map((step, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <Select
                        value={step}
                        onValueChange={(value) => {
                          const newApprovalPath = [...selectedWorkflow.approvalPath];
                          newApprovalPath[index] = value;
                          setSelectedWorkflow({ ...selectedWorkflow, approvalPath: newApprovalPath });
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newApprovalPath = selectedWorkflow.approvalPath.filter((_, i) => i !== index);
                          setSelectedWorkflow({ ...selectedWorkflow, approvalPath: newApprovalPath });
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedWorkflow({
                        ...selectedWorkflow,
                        approvalPath: [...selectedWorkflow.approvalPath, ""],
                      });
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Step
                  </Button>
                </div>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsEditWorkflowOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateWorkflowMutation.isPending}>
                  {updateWorkflowMutation.isPending ? "Updating..." : "Update Workflow"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
