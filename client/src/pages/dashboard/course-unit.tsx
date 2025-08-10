import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Clock, CheckCircle, GraduationCap, LogOut, Upload, User, Calendar, Settings, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiRequestWithFormData } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useState, useMemo, useCallback, useEffect, memo } from "react";
import ProfileSettings from "@/components/profile-settings";
import DocumentSearch from "@/components/document-search";

// Performance monitoring hook
function usePerformanceMonitor(componentName: string) {
  useEffect(() => {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      if (duration > 100) { // Log if render takes more than 100ms
        console.warn(`${componentName} render took ${duration.toFixed(2)}ms`);
      }
    };
  });
}

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

// Memoized status badge component
const StatusBadge = memo(({ status }: { status: string }) => {
  usePerformanceMonitor('StatusBadge');
  
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
});

// Memoized graduation status component
const GraduationStatus = memo(({ isGraduated }: { isGraduated: boolean }) => {
  usePerformanceMonitor('GraduationStatus');
  
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
});

// Memoized workflow path component
const WorkflowPath = memo(({ workflow }: { workflow?: { stepRoles: string[]; currentStep: number; totalSteps: number } }) => {
  usePerformanceMonitor('WorkflowPath');
  
  if (!workflow) return <span>No workflow defined</span>;
  
  const roleNames: Record<string, string> = {
    academic_staff: "Academic Staff",
    department_head: "Department Head",
    dean: "Dean",
    vice_chancellor: "Vice Chancellor",
    assistant_registrar: "Assistant Registrar",
    course_unit: "Course Unit",
  };
  
  return (
    <>
      {workflow.stepRoles.map((role, index) => {
        const roleName = roleNames[role] || role.replace('_', ' ');
        const isCurrent = index === workflow.currentStep;
        return (
          <span key={index} className={`${isCurrent ? 'font-semibold text-blue-600' : 'text-gray-600'}`}>
            {roleName}
            {index < workflow.stepRoles.length - 1 && <span className="text-gray-400 mx-1">→</span>}
          </span>
        );
      })}
    </>
  );
});

// Memoized request item component
const RequestItem = memo(({ 
  request, 
  onUploadClick 
}: { 
  request: DocumentRequest; 
  onUploadClick: (request: DocumentRequest) => void;
}) => {
  usePerformanceMonitor('RequestItem');
  
  return (
    <div className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <User className="text-blue-600 text-sm" />
          </div>
          <div>
            <h4 className="font-medium text-gray-900">{request.title}</h4>
            <p className="text-sm text-gray-600">{request.student.fullName}</p>
            <p className="text-xs text-gray-500 capitalize">
              {request.type?.replace('_', ' ') || 'Unknown'}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <GraduationStatus isGraduated={request.student.isGraduated} />
          <StatusBadge status={request.status} />
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
          <WorkflowPath workflow={request.workflow} />
        </div>
      </div>

      <div className="flex justify-end space-x-2">
        <Button
          size="sm"
          onClick={() => onUploadClick(request)}
          disabled={!["pending", "in_review"].includes(request.status)}
        >
          <Upload className="w-3 h-3 mr-1" />
          Upload & Forward
        </Button>
      </div>
    </div>
  );
});

function CourseUnitDashboard() {
  usePerformanceMonitor('CourseUnitDashboard');
  
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<DocumentRequest | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [filteredRequests, setFilteredRequests] = useState<DocumentRequest[]>([]);
  const [uploadData, setUploadData] = useState({
    comments: "",
  });

  // Fetch data with proper error handling and retry logic
  const { data: documentRequests = [], isLoading: requestsLoading, error: requestsError } = useQuery<DocumentRequest[]>({
    queryKey: ["/api/course-unit/document-requests"],
    retry: 3,
    retryDelay: 1000,
    staleTime: 30000, // 30 seconds
  });

  const { data: transcriptRequests = [], isLoading: transcriptLoading, error: transcriptError } = useQuery<DocumentRequest[]>({
    queryKey: ["/api/course-unit/transcript-requests"],
    retry: 3,
    retryDelay: 1000,
    staleTime: 30000, // 30 seconds
  });

  const { data: stats, error: statsError } = useQuery<{
    pendingRequests: number;
    processedToday: number;
    totalRequests: number;
  }>({
    queryKey: ["/api/course-unit/stats"],
    retry: 3,
    retryDelay: 1000,
    staleTime: 30000, // 30 seconds
  });

  // Memoize the documents array to prevent infinite re-renders
  const searchableDocuments = useMemo(() => {
    if (!documentRequests || !transcriptRequests) return [];
    
    const allRequests = [...(documentRequests || []), ...(transcriptRequests || [])];
    return allRequests.map(req => ({
      id: req.id,
      title: req.title,
      description: req.student.fullName,
      type: req.type || 'unknown',
      fileName: req.title,
      filePath: "",
      fileSize: 0,
      mimeType: "",
      hash: req.id,
      status: req.status || 'pending',
      userId: req.student.id,
      createdAt: req.createdAt,
      updatedAt: req.createdAt,
    }));
  }, [documentRequests, transcriptRequests]);

  // Memoize the search callback to prevent infinite re-renders
  const handleSearchChange = useCallback((filteredDocs: any[]) => {
    if (!documentRequests || !transcriptRequests) return;
    
    const allRequests = [...(documentRequests || []), ...(transcriptRequests || [])];
    const filteredIds = new Set(filteredDocs.map(doc => doc.id));
    setFilteredRequests(allRequests.filter(req => filteredIds.has(req.id)));
  }, [documentRequests, transcriptRequests]);

  // Memoize the upload click handler
  const handleUploadClick = useCallback((request: DocumentRequest) => {
    setSelectedRequest(request);
    setIsUploadModalOpen(true);
  }, []);

  // Reset filtered requests when data changes
  useEffect(() => {
    if (documentRequests && transcriptRequests) {
      setFilteredRequests([]);
    }
  }, [documentRequests, transcriptRequests]);

  const uploadDocumentMutation = useMutation({
    mutationFn: async (data: { requestId: string; file: File; comments: string; documentType: string }) => {
      try {
        const formData = new FormData();
        formData.append('requestId', data.requestId);
        formData.append('comments', data.comments);

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
      setUploadData({ comments: "" });
      setTranscriptFile(null);
      setIsUploadModalOpen(false);
      setSelectedRequest(null);
      
      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ["/api/course-unit/document-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/course-unit/transcript-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/course-unit/stats"] });
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
    try {
      await logout();
    } catch (error) {
      console.error("Logout error:", error);
      // Force redirect on logout error
      setLocation("/login");
    }
  };

  // Early return for authentication
  if (!user) {
    setLocation("/login");
    return null;
  }

  if (user.role !== "course_unit") {
    setLocation("/login");
    return null;
  }

  // Show error state if there are API errors
  if (requestsError || transcriptError || statsError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-gray-600 mb-4">
            {requestsError?.message || transcriptError?.message || statsError?.message || "Failed to load dashboard data"}
          </p>
          <Button onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Memoize the requests to show
  const requestsToShow = useMemo(() => {
    return filteredRequests.length > 0 
      ? filteredRequests 
      : [...(documentRequests || []), ...(transcriptRequests || [])];
  }, [filteredRequests, documentRequests, transcriptRequests]);

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
              <ProfileSettings
                user={user}
                trigger={
                  <Button variant="ghost" size="sm" title="Profile Settings">
                    <Settings className="h-4 w-4" />
                  </Button>
                }
              />
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Stats Cards */}
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

        {/* Document Requests */}
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
            ) : (!documentRequests?.length && !transcriptRequests?.length) ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No document requests found</p>
                <p className="text-sm text-gray-500 mt-2">
                  Students need to request documents first before you can upload them.
                </p>
              </div>
            ) : (
              <>
                {/* Search and Filter */}
                <DocumentSearch
                  documents={searchableDocuments}
                  onSearchChange={handleSearchChange}
                  placeholder="Search document requests..."
                  showTypeFilter={true}
                />
                
                <div className="mt-6 space-y-3">
                  {requestsToShow.map((request) => (
                    <RequestItem 
                      key={request.id} 
                      request={request} 
                      onUploadClick={handleUploadClick}
                    />
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upload Modal */}
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
                  <p><strong>Document Type:</strong> {selectedRequest.type?.replace('_', ' ') || 'Unknown'}</p>
                  <p><strong>Status:</strong> <GraduationStatus isGraduated={selectedRequest.student.isGraduated} /></p>
                </div>
              </div>

              <form onSubmit={handleUploadDocument} className="space-y-4">
                <div>
                  <Label htmlFor="document-file">{selectedRequest.type?.replace('_', ' ') || 'Document'} File *</Label>
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
                    Upload the {selectedRequest.type?.replace('_', ' ') || 'Document'} file (PDF, DOC, DOCX)
                  </p>
                </div>

                <div>
                  <Label htmlFor="comments">Comments (Optional)</Label>
                  <Textarea
                    id="comments"
                    rows={3}
                    placeholder={`Additional notes about the ${selectedRequest.type?.replace('_', ' ') || 'Document'}...`}
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

export default memo(CourseUnitDashboard); 