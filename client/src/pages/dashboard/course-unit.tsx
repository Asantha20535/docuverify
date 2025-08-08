import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Clock, CheckCircle, GraduationCap, LogOut, Upload, User, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiRequestWithFormData } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useState } from "react";

interface DocumentRequest {
  id: string;
  title: string;
  type: string;
  student: {
    id: string;
    fullName: string;
    isGraduated: boolean;
  };
  createdAt: string;
  status: string;
  workflow?: {
    stepRoles: string[];
    currentStep: number;
    totalSteps: number;
  };
}

export default function CourseUnitDashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<DocumentRequest | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [uploadData, setUploadData] = useState({
    comments: "",
  });

  const { data: documentRequests = [], isLoading: requestsLoading } = useQuery<DocumentRequest[]>({
    queryKey: ["/api/course-unit/document-requests"],
  });

  const { data: transcriptRequests = [], isLoading: transcriptLoading } = useQuery<DocumentRequest[]>({
    queryKey: ["/api/course-unit/transcript-requests"],
  });

  const { data: stats } = useQuery<{
    pendingRequests: number;
    processedToday: number;
    totalRequests: number;
  }>({
    queryKey: ["/api/course-unit/stats"],
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: async (data: { requestId: string; file: File; comments: string; documentType: string }) => {
      try {
        const formData = new FormData();
        formData.append('requestId', data.requestId);
        formData.append('comments', data.comments);

        // Use the appropriate endpoint and field name based on document type
        const endpoint = data.documentType === 'transcript_request' 
          ? "/api/course-unit/upload-transcript" 
          : "/api/course-unit/upload-document";
        
        const fieldName = data.documentType === 'transcript_request' ? 'transcript' : 'document';
        formData.append(fieldName, data.file);
        
        console.log("Uploading to endpoint:", endpoint);
        const response = await apiRequestWithFormData("POST", endpoint, formData);
        return response.json();
      } catch (error) {
        console.error("Upload mutation error:", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Document Uploaded",
        description: "Document has been uploaded and forwarded to the appropriate authority",
      });
      setUploadData({
        comments: "",
      });
      setTranscriptFile(null);
      setIsUploadModalOpen(false);
      setSelectedRequest(null);
      
      // Invalidate queries to refresh the data
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/course-unit/document-requests"] });
        queryClient.invalidateQueries({ queryKey: ["/api/course-unit/transcript-requests"] });
        queryClient.invalidateQueries({ queryKey: ["/api/course-unit/stats"] });
      } catch (error) {
        console.error("Error invalidating queries:", error);
      }
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
    
    if (!selectedRequest || !transcriptFile) return;

    uploadDocumentMutation.mutate({
      requestId: selectedRequest.id,
      file: transcriptFile,
      comments: uploadData.comments,
      documentType: selectedRequest.type,
    });
  };

  const handleLogout = async () => {
    await logout();
  };

  if (!user) {
    setLocation("/login");
    return null;
  }

  if (user.role !== "course_unit") {
    setLocation("/login");
    return null;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "in_review":
        return <Badge variant="outline">In Review</Badge>;
      case "approved":
        return <Badge variant="default">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getGraduationStatus = (isGraduated: boolean) => {
    return isGraduated ? (
      <Badge variant="default" className="bg-green-100 text-green-800">
        <GraduationCap className="w-3 h-3 mr-1" />
        Graduated
      </Badge>
    ) : (
      <Badge variant="outline" className="text-blue-600">
        Current Student
      </Badge>
    );
  };

  const formatWorkflowPath = (workflow?: { stepRoles: string[]; currentStep: number; totalSteps: number }) => {
    if (!workflow) return "No workflow defined";
    
    const roleNames: Record<string, string> = {
      academic_staff: "Academic Staff",
      department_head: "Department Head",
      dean: "Dean",
      vice_chancellor: "Vice Chancellor",
      assistant_registrar: "Assistant Registrar",
      course_unit: "Course Unit",
    };
    
    return workflow.stepRoles.map((role, index) => {
      const roleName = roleNames[role] || role.replace('_', ' ');
      const isCurrent = index === workflow.currentStep;
      return (
        <span key={index} className={`${isCurrent ? 'font-semibold text-blue-600' : 'text-gray-600'}`}>
          {roleName}
          {index < workflow.stepRoles.length - 1 && <span className="text-gray-400 mx-1">→</span>}
        </span>
      );
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center">
                <FileText className="text-white text-sm" />
              </div>
              <h1 className="ml-3 text-xl font-semibold text-gray-900">Course Unit Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Welcome, {user.fullName}</span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.pendingRequests || 0}</div>
              <p className="text-xs text-muted-foreground">Awaiting processing</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Processed Today</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.processedToday || 0}</div>
              <p className="text-xs text-muted-foreground">Completed today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalRequests || 0}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              Document Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(requestsLoading || transcriptLoading) ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading requests...</p>
              </div>
            ) : (documentRequests.length === 0 && transcriptRequests.length === 0) ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No document requests found</p>
                <p className="text-sm text-gray-500 mt-2">
                  Students need to request documents first before you can upload them.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {(() => {
                  // Combine both document requests and transcript requests
                  const allRequests = [...documentRequests, ...transcriptRequests];
                  
                  return allRequests.map((request) => (
                    <div key={request.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <User className="text-blue-600 text-sm" />
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">{request.title}</h4>
                            <p className="text-sm text-gray-600">{request.student.fullName}</p>
                            <p className="text-xs text-gray-500 capitalize">
                              {request.type.replace('_', ' ')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {getGraduationStatus(request.student.isGraduated)}
                          {getStatusBadge(request.status)}
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                        <div className="flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          {new Date(request.createdAt).toLocaleDateString()}
                        </div>
                      </div>

                      <div className="mb-3">
                        <p className="text-xs text-gray-500 mb-1">Workflow:</p>
                        <div className="text-xs">
                          {formatWorkflowPath(request.workflow)}
                        </div>
                      </div>

                      <div className="flex justify-end space-x-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedRequest(request);
                            setIsUploadModalOpen(true);
                          }}
                          disabled={!["pending", "in_review"].includes(request.status)}
                        >
                          <Upload className="w-3 h-3 mr-1" />
                          Upload & Forward
                        </Button>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload {selectedRequest?.type?.replace('_', ' ') || 'Document'}</DialogTitle>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Request Details</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <p><strong>Student:</strong> {selectedRequest.student.fullName}</p>
                  <p><strong>Document Type:</strong> {selectedRequest.type.replace('_', ' ')}</p>
                  <p><strong>Status:</strong> {getGraduationStatus(selectedRequest.student.isGraduated)}</p>
                </div>
              </div>

              <form onSubmit={handleUploadDocument} className="space-y-4">
                <div>
                  <Label htmlFor="document-file">{selectedRequest.type.replace('_', ' ')} File *</Label>
                  <Input
                    id="document-file"
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="mt-1"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setTranscriptFile(file);
                      }
                    }}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Upload the {selectedRequest.type.replace('_', ' ')} file (PDF, DOC, DOCX)
                  </p>
                </div>

                <div>
                  <Label htmlFor="comments">Comments (Optional)</Label>
                  <Textarea
                    id="comments"
                    rows={3}
                    placeholder={`Additional notes about the ${selectedRequest.type.replace('_', ' ')}...`}
                    value={uploadData.comments}
                    onChange={(e) => setUploadData({ ...uploadData, comments: e.target.value })}
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <Button type="button" variant="outline" onClick={() => setIsUploadModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={uploadDocumentMutation.isPending || !transcriptFile}
                  >
                    {uploadDocumentMutation.isPending ? "Uploading..." : "Upload & Forward"}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
} 