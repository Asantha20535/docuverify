import { useState } from "react";
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
import { apiRequest } from "@/lib/queryClient";
import type { DocumentTemplate, User } from "@/types";

interface WorkflowManagementProps {
  users: User[];
}

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

  const { data: workflows = [], isLoading } = useQuery<DocumentTemplate[]>({
    queryKey: ["/api/admin/templates"],
  });

  const createWorkflowMutation = useMutation({
    mutationFn: async (workflowData: any) => {
      const response = await apiRequest("POST", "/api/admin/templates", workflowData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Workflow Created",
        description: "New workflow configuration has been created successfully",
      });
      setNewWorkflow({
        name: "",
        type: "other",
        approvalPath: [],
      });
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
    
    if (!newWorkflow.name || newWorkflow.approvalPath.length === 0) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    createWorkflowMutation.mutate({
      ...newWorkflow,
      description: "",
    });
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

  const handleEditWorkflow = (workflow: DocumentTemplate) => {
    setSelectedWorkflow(workflow);
    setIsEditWorkflowOpen(true);
  };

  const handleDeleteWorkflow = (workflowId: string, workflowName: string) => {
    if (confirm(`Are you sure you want to delete the workflow "${workflowName}"?`)) {
      deleteWorkflowMutation.mutate(workflowId);
    }
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

  const getRoleOptions = () => {
    return users
      .filter(user => user.role !== "student" && user.role !== "admin")
      .map(user => ({
        value: user.role,
        label: `${user.fullName} (${user.role.replace('_', ' ')})`,
      }));
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Workflow Configuration</CardTitle>
          <Dialog open={isAddWorkflowOpen} onOpenChange={setIsAddWorkflowOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-workflow">
                <Plus className="w-4 h-4 mr-2" />
                Add Workflow
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New Workflow Configuration</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateWorkflow} className="space-y-4">
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
                  <Label>Approval Workflow</Label>
                  <div className="mt-2 space-y-2">
                    {newWorkflow.approvalPath.map((step, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <Select
                          value={step}
                          onValueChange={(value) => updateApprovalStep(index, value)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            {getRoleOptions().map((option) => (
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
                          onClick={() => removeApprovalStep(index)}
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
                      Add Step
                    </Button>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsAddWorkflowOpen(false)}>
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
                          {getRoleOptions().map((option) => (
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
