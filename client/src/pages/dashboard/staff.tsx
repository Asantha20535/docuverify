import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Clock, CheckCircle, XCircle, Upload, LogOut, Plus, Calendar, Fingerprint, User, Settings, GraduationCap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DocumentTable from "@/components/document-table";
import DocumentSearch from "@/components/document-search";
import ReviewModal from "@/components/review-modal";
import ProfileSettings from "@/components/profile-settings";
import { apiRequest } from "@/lib/queryClient";
import type { Document, DocumentWithDetails } from "@/types";
import { useLocation } from "wouter";
import { useState } from "react";

export default function StaffDashboard() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [uploadData, setUploadData] = useState({
    title: "",
    description: "",
    file: null as File | null,
  });
  const [requestData, setRequestData] = useState({
    documentType: "",
    name: "",
    note: "",
  });

  const { data: documents = [], isLoading: documentsLoading } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  const { data: pendingDocuments = [], isLoading: pendingLoading } = useQuery<DocumentWithDetails[]>({
    queryKey: ["/api/documents/pending"],
  });
  const [selectedDocument, setSelectedDocument] = useState<DocumentWithDetails | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedDocumentForUpload, setSelectedDocumentForUpload] = useState<DocumentWithDetails | null>(null);
  const [isReviewerUploadOpen, setIsReviewerUploadOpen] = useState(false);
  const [reviewerUploadFile, setReviewerUploadFile] = useState<File | null>(null);
  const [reviewerUploadComments, setReviewerUploadComments] = useState("");

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
      setUploadData({ title: "", description: "", file: null });
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

  const requestDocumentMutation = useMutation({
    mutationFn: async (requestData: typeof requestData) => {
      const response = await apiRequest("POST", "/api/documents/request-document-staff", requestData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document Request Submitted",
        description: "Your document request has been submitted for processing",
      });
      setRequestData({ documentType: "", name: "", note: "" });
      setIsRequestOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/workflow"] });
    },
    onError: (error: any) => {
      toast({
        title: "Request Failed",
        description: error.message || "Failed to submit document request",
        variant: "destructive",
      });
    },
  });

  const handleRequestDocument = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!requestData.documentType || !requestData.name) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    requestDocumentMutation.mutate(requestData);
  };

  // Check if document is eligible for upload by first reviewer
  const canUploadAsFirstReviewer = (document: DocumentWithDetails): boolean => {
    if (!document.workflow) return false;
    
    // Must be first step (currentStep === 0)
    if (document.workflow.currentStep !== 0) return false;
    
    // Must not be forwarded (document comes directly from requester)
    if (document.forwardedToUserId || document.forwardedFromUserId) return false;
    
    // Requester must be student, academic_staff, or department_head
    const requesterRole = document.user.role;
    if (!["student", "academic_staff", "department_head"].includes(requesterRole)) return false;
    
    // Check if there's already an upload action in workflow (indicating a reviewer already uploaded)
    // Note: workflow.actions may not be populated, but backend will validate
    if (document.workflow.actions && document.workflow.actions.some(action => action.action === "uploaded")) {
      return false;
    }
    
    // If we reach here, document is eligible
    // Backend will do final validation (check for existing upload actions, file status, etc.)
    return true;
  };

  const reviewerUploadMutation = useMutation({
    mutationFn: async ({ documentId, file, comments }: { documentId: string; file: File; comments: string }) => {
      const formData = new FormData();
      formData.append("document", file);
      if (comments) {
        formData.append("comments", comments);
      }
      
      const response = await fetch(`/api/documents/${documentId}/upload-by-reviewer`, {
        method: "POST",
        body: formData,
        credentials: "include",
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
        description: "Document has been uploaded and forwarded to the next reviewer",
      });
      setReviewerUploadFile(null);
      setReviewerUploadComments("");
      setSelectedDocumentForUpload(null);
      setIsReviewerUploadOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/documents/pending"] });
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

  const handleReviewerUpload = (document: DocumentWithDetails) => {
    setSelectedDocumentForUpload(document);
    setIsReviewerUploadOpen(true);
  };

  const handleReviewerUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedDocumentForUpload || !reviewerUploadFile) {
      toast({
        title: "Error",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    reviewerUploadMutation.mutate({
      documentId: selectedDocumentForUpload.id,
      file: reviewerUploadFile,
      comments: reviewerUploadComments,
    });
  };

  const handleUploadDocument = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!uploadData.title.trim() || !uploadData.file) {
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

  // Format and display request details from metadata
  const getRequestDetails = (document: DocumentWithDetails): string[] => {
    const details: string[] = [];
    
    if (!document.fileMetadata) return details;

    // Student request details
    if (document.fileMetadata.studentName) {
      details.push(`Name: ${document.fileMetadata.studentName}`);
    }
    if (document.fileMetadata.registrationNumber) {
      details.push(`Reg No: ${document.fileMetadata.registrationNumber}`);
    }
    if (document.fileMetadata.email) {
      details.push(`Email: ${document.fileMetadata.email}`);
    }
    if (document.fileMetadata.level) {
      details.push(`Level: ${document.fileMetadata.level}`);
    }

    // Staff request details
    if (document.fileMetadata.name) {
      details.push(`Name: ${document.fileMetadata.name}`);
    }
    if (document.fileMetadata.note) {
      details.push(`Note: ${document.fileMetadata.note}`);
    }

    return details;
  };

  // Wait for auth check to complete before redirecting
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

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
              <ProfileSettings 
                user={user} 
                trigger={
                  <Button variant="ghost" size="sm" title="Profile Settings">
                    <Settings className="h-4 w-4" />
                  </Button>
                }
              />
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
            {/* Request Document - Only for Academic Staff and Department Head */}
            {(user.role === "academic_staff" || user.role === "department_head") && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5" />
                    Request Document
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-4">
                    Submit a request for various academic documents. 
                    Your request will be processed according to the workflow configuration.
                  </p>
                  
                  <Dialog open={isRequestOpen} onOpenChange={setIsRequestOpen}>
                    <DialogTrigger asChild>
                      <Button className="w-full" data-testid="button-request-document">
                        <Plus className="w-4 h-4 mr-2" />
                        Request Document
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Request Document</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleRequestDocument} className="space-y-4">
                        <div>
                          <Label htmlFor="documentType">Document Type</Label>
                          <Select 
                            value={requestData.documentType} 
                            onValueChange={(value) => setRequestData({ ...requestData, documentType: value })}
                          >
                            <SelectTrigger className="mt-1" id="documentType">
                              <SelectValue placeholder="Select document type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="vacation_request">Vacation Request</SelectItem>
                              <SelectItem value="funding_request">Funding Request</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="name">Name</Label>
                          <Input
                            id="name"
                            data-testid="input-request-name"
                            type="text"
                            required
                            className="mt-1"
                            placeholder="Enter your name"
                            value={requestData.name}
                            onChange={(e) => setRequestData({ ...requestData, name: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label htmlFor="note">Note</Label>
                          <Textarea
                            id="note"
                            data-testid="input-request-note"
                            className="mt-1"
                            placeholder="Enter any additional notes..."
                            value={requestData.note}
                            onChange={(e) => setRequestData({ ...requestData, note: e.target.value })}
                          />
                        </div>
                        <div className="flex justify-end space-x-2">
                          <Button type="button" variant="outline" onClick={() => setIsRequestOpen(false)}>
                            Cancel
                          </Button>
                          <Button 
                            type="submit" 
                            disabled={requestDocumentMutation.isPending}
                            data-testid="button-submit-request"
                          >
                            {requestDocumentMutation.isPending ? "Submitting..." : "Submit Request"}
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload Document
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  Upload a document for review and approval. The document will be processed through the appropriate workflow.
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

                                  {getRequestDetails(document).length > 0 && (
                                    <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
                                      <div className="text-xs font-semibold text-gray-700 mb-2">Request Details:</div>
                                      <div className="space-y-1">
                                        {getRequestDetails(document).map((detail, index) => (
                                          <div key={index} className="text-xs text-gray-600">
                                            {detail}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

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
                                {canUploadAsFirstReviewer(document) && (
                                  <Button 
                                    onClick={() => handleReviewerUpload(document)}
                                    variant="default"
                                  >
                                    <Upload className="w-4 h-4 mr-2" />
                                    Upload Document
                                  </Button>
                                )}
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
                  <CardTitle>My Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  {documentsLoading ? (
                    <div className="text-center py-8">Loading...</div>
                  ) : (
                    <>
                      <DocumentSearch
                        documents={documents}
                        onSearchChange={setFilteredDocuments}
                        placeholder="Search your uploaded documents..."
                        showTypeFilter={true}
                      />
                      <div className="mt-6">
                        <DocumentTable 
                          documents={filteredDocuments.length > 0 ? filteredDocuments : documents} 
                          isLoading={documentsLoading} 
                          showDeleteButton={true}
                          isStaffView={true}
                          currentUserId={user.id}
                        />
                      </div>
                    </>
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

    {/* Upload Document by Reviewer Modal */}
    <Dialog open={isReviewerUploadOpen} onOpenChange={setIsReviewerUploadOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>
        
        {selectedDocumentForUpload && (
          <div className="space-y-4">
            <div className="bg-gray-50 p-3 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Request Details</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <p><strong>Requester:</strong> {selectedDocumentForUpload.user.fullName}</p>
                <p><strong>Document Type:</strong> {selectedDocumentForUpload.type?.replace('_', ' ') || 'Unknown'}</p>
                <p><strong>Title:</strong> {selectedDocumentForUpload.title}</p>
              </div>
            </div>

            <form onSubmit={handleReviewerUploadSubmit} className="space-y-4">
              <div>
                <Label htmlFor="reviewer-document-file">Document File *</Label>
                <Input
                  id="reviewer-document-file"
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="mt-1"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setReviewerUploadFile(file);
                    }
                  }}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload the processed document file (PDF, DOC, DOCX)
                </p>
              </div>

              <div>
                <Label htmlFor="reviewer-comments">Comments (Optional)</Label>
                <Textarea
                  id="reviewer-comments"
                  rows={3}
                  placeholder="Additional notes about the document..."
                  value={reviewerUploadComments}
                  onChange={(e) => setReviewerUploadComments(e.target.value)}
                />
              </div>

              <div className="flex justify-end space-x-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setIsReviewerUploadOpen(false);
                    setSelectedDocumentForUpload(null);
                    setReviewerUploadFile(null);
                    setReviewerUploadComments("");
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={reviewerUploadMutation.isPending || !reviewerUploadFile}
                >
                  {reviewerUploadMutation.isPending ? "Uploading..." : "Upload & Forward"}
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}