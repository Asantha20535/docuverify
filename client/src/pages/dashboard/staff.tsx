import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText, Clock, CheckCircle, XCircle, Upload, LogOut, Plus, Calendar, Fingerprint, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DocumentTable from "@/components/document-table";
import ReviewModal from "@/components/review-modal";
import { apiRequest } from "@/lib/queryClient";
import type { Document, DocumentTemplate, DocumentWithDetails } from "@/types";
import { useLocation } from "wouter";
import { useState } from "react";

export default function StaffDashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadData, setUploadData] = useState({
    title: "",
    description: "",
    templateId: "",
    file: null as File | null,
  });

  const { data: documents = [], isLoading: documentsLoading } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  const { data: pendingDocuments = [], isLoading: pendingLoading } = useQuery<DocumentWithDetails[]>({
    queryKey: ["/api/documents/pending"],
  });
  const [selectedDocument, setSelectedDocument] = useState<DocumentWithDetails | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const handleReviewDocument = (document: DocumentWithDetails) => {
    setSelectedDocument(document);
    setShowReviewModal(true);
  };

  const getWorkflowProgress = (document: DocumentWithDetails) => {
    if (!document.workflow) return { completed: 0, total: 0, current: "" };
    const { workflow } = document;
    const completed = workflow.currentStep;
    const total = workflow.totalSteps;
    const current = workflow.stepRoles[workflow.currentStep] || "";
    return { completed, total, current };
  };

  const { data: templates = [] } = useQuery<DocumentTemplate[]>({
    queryKey: ["/api/templates"],
  });

  const { data: stats } = useQuery<{
    pendingReview: number;
    approvedToday: number;
    inWorkflow: number;
  }>({
    queryKey: ["/api/stats/workflow"],
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document Uploaded",
        description: "Your document has been uploaded and entered the approval workflow",
      });
      setUploadData({ title: "", description: "", templateId: "", file: null });
      setIsUploadOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/workflow"] });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
    },
  });

  const handleUploadDocument = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!uploadData.title.trim() || !uploadData.templateId || !uploadData.file) {
      toast({
        title: "Error",
        description: "Please fill in all required fields and select a file",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("title", uploadData.title);
    formData.append("description", uploadData.description);
    formData.append("templateId", uploadData.templateId);
    formData.append("file", uploadData.file);

    uploadDocumentMutation.mutate(formData);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setUploadData({ ...uploadData, file });
  };

  const handleLogout = async () => {
    await logout();
  };

  const formatRoleName = (role: string) => {
    return role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  if (!user) {
    setLocation("/login");
    return null;
  }

  const staffRoles = ["academic_staff", "department_head", "dean", "vice_chancellor", "assistant_registrar"];
  if (!staffRoles.includes(user.role)) {
    setLocation("/login");
    return null;
  }

  return (
    <>
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <FileText className="text-white text-sm" />
                </div>
                <span className="ml-3 text-lg font-semibold text-gray-900">University Portal</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600" data-testid="text-username">{user.fullName}</span>
              <Badge variant="secondary">{formatRoleName(user.role)}</Badge>
              <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="button-logout">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Dashboard Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Clock className="text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900" data-testid="text-pending-review">
                    {stats?.pendingReview || 0}
                  </p>
                  <p className="text-sm text-gray-600">Pending My Review</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900" data-testid="text-approved-today">
                    {stats?.approvedToday || 0}
                  </p>
                  <p className="text-sm text-gray-600">Approved Today</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900" data-testid="text-in-workflow">
                    {stats?.inWorkflow || 0}
                  </p>
                  <p className="text-sm text-gray-600">In Workflow</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Document Upload and Review Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload Document
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  Upload a document using predefined templates. Each template has a specific approval workflow.
                </p>
                
                <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full" data-testid="button-upload-document">
                      <Plus className="w-4 h-4 mr-2" />
                      Upload Document
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Upload Document</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleUploadDocument} className="space-y-4">
                      <div>
                        <Label htmlFor="template">Document Template</Label>
                        <Select 
                          value={uploadData.templateId} 
                          onValueChange={(value) => setUploadData({ ...uploadData, templateId: value })}
                        >
                          <SelectTrigger className="mt-1" data-testid="select-template">
                            <SelectValue placeholder="Select document template" />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="title">Document Title</Label>
                        <Input
                          id="title"
                          data-testid="input-document-title"
                          type="text"
                          required
                          className="mt-1"
                          placeholder="Enter document title"
                          value={uploadData.title}
                          onChange={(e) => setUploadData({ ...uploadData, title: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="description">Description (Optional)</Label>
                        <Textarea
                          id="description"
                          data-testid="input-document-description"
                          className="mt-1"
                          placeholder="Enter document description..."
                          value={uploadData.description}
                          onChange={(e) => setUploadData({ ...uploadData, description: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="file">File</Label>
                        <Input
                          id="file"
                          data-testid="input-document-file"
                          type="file"
                          required
                          className="mt-1"
                          accept=".pdf,.docx"
                          onChange={handleFileChange}
                        />
                        <p className="text-xs text-gray-500 mt-1">Only PDF and DOCX files allowed (Max: 10MB)</p>
                      </div>
                      <div className="flex justify-end space-x-2">
                        <Button type="button" variant="outline" onClick={() => setIsUploadOpen(false)}>
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={uploadDocumentMutation.isPending}
                          data-testid="button-submit-upload"
                        >
                          {uploadDocumentMutation.isPending ? "Uploading..." : "Upload Document"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>

            {/* Document Templates Info */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Available Templates</CardTitle>
              </CardHeader>
              <CardContent>
                {templates.length === 0 ? (
                  <p className="text-sm text-gray-500">No templates available for your role</p>
                ) : (
                  <div className="space-y-2">
                    {templates.map((template) => (
                      <div key={template.id} className="p-2 border rounded-md">
                        <h4 className="font-medium text-sm">{template.name}</h4>
                        <p className="text-xs text-gray-600">{template.description}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Approval: {template.approvalPath.map(role => formatRoleName(role)).join(" → ")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <div className="space-y-6">
              {/* Pending Review */}
              <Card>
                <CardHeader>
                  <CardTitle>Documents Pending My Review</CardTitle>
                </CardHeader>
                <CardContent>
                  {pendingLoading ? (
                    <div className="text-center py-8">Loading...</div>
                  ) : pendingDocuments.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No documents pending your review</div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {pendingDocuments.map((document) => {
                        const progress = getWorkflowProgress(document);
                        return (
                          <div key={document.id} className="p-6">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start space-x-4">
                                <div className="flex-shrink-0">
                                  <FileText className="text-2xl text-gray-600" />
                                </div>
                                <div className="flex-1">
                                  <h4 className="text-lg font-medium text-gray-900">{document.title}</h4>
                                  <p className="text-sm text-gray-600 mt-1">{document.description}</p>
                                  <div className="flex items-center mt-2 space-x-4">
                                    <span className="text-sm text-gray-600 flex items-center">
                                      <User className="w-4 h-4 mr-1" />
                                      <span>{document.user.fullName}</span>
                                    </span>
                                    <span className="text-sm text-gray-600 flex items-center">
                                      <Calendar className="w-4 h-4 mr-1" />
                                      <span>{new Date(document.createdAt).toLocaleDateString()}</span>
                                    </span>
                                    <span className="text-sm text-gray-600 flex items-center">
                                      <Fingerprint className="w-4 h-4 mr-1" />
                                      <span className="font-mono">{document.hash.substring(0, 8)}...</span>
                                    </span>
                                  </div>

                                  {document.workflow && (
                                    <div className="mt-4">
                                      <div className="flex items-center space-x-2">
                                        {document.workflow.stepRoles.map((role, index) => {
                                          const isCompleted = index < document.workflow!.currentStep;
                                          const isCurrent = index === document.workflow!.currentStep;
                                          return (
                                            <div key={role} className="flex items-center space-x-1">
                                              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                                isCompleted ? 'bg-green-500' : isCurrent ? 'bg-blue-600' : 'bg-gray-300'
                                              }`}>
                                                <CheckCircle className={`w-3 h-3 ${
                                                  isCompleted || isCurrent ? 'text-white' : 'text-gray-500'
                                                }`} />
                                              </div>
                                              <span className={`text-xs font-medium ${
                                                isCompleted ? 'text-green-600' : isCurrent ? 'text-blue-600' : 'text-gray-500'
                                              }`}>
                                                {formatRoleName(role)}
                                              </span>
                                              {index < document.workflow!.stepRoles.length - 1 && (
                                                <div className={`w-8 h-0.5 ${isCompleted ? 'bg-green-500' : 'bg-gray-300'}`} />
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                      <div className="text-xs text-gray-600 mt-2">
                                        Next: {document.workflow.stepRoles[document.workflow.currentStep + 1] ? (
                                          <span className="font-medium">{formatRoleName(document.workflow.stepRoles[document.workflow.currentStep + 1])}</span>
                                        ) : (
                                          <span className="font-medium">Final approval</span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col space-y-2">
                                <Button onClick={() => handleReviewDocument(document)}>
                                  Review Document
                                </Button>
                                <Button asChild variant="outline" size="sm">
                                  <a
                                    href={`/api/documents/${document.id}/content?download=1`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Download
                                  </a>
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* My Documents */}
              <Card>
                <CardHeader>
                  <CardTitle>My Uploaded Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  {documentsLoading ? (
                    <div className="text-center py-8">Loading...</div>
                  ) : (
                    <DocumentTable documents={documents} isLoading={documentsLoading} />
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
    {/* Review Modal */}
    <ReviewModal
      document={selectedDocument}
      isOpen={showReviewModal}
      onClose={() => {
        setShowReviewModal(false);
        setSelectedDocument(null);
      }}
    />
    </>
  );
}