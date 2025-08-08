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
import { FileText, Clock, CheckCircle, XCircle, GraduationCap, LogOut, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DocumentTable from "@/components/document-table";
import { apiRequest } from "@/lib/queryClient";
import type { Document, DocumentTemplate } from "@/types";
import { useLocation } from "wouter";
import { useState } from "react";

export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [documentRequest, setDocumentRequest] = useState({
    documentType: "",
    studentName: "",
    registrationNumber: "",
    email: "",
    level: "",
  });

  const { data: documents = [], isLoading: documentsLoading } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  const { data: stats } = useQuery<{
    totalDocuments: number;
    pendingDocuments: number;
    approvedDocuments: number;
    rejectedDocuments: number;
  }>({
    queryKey: ["/api/stats/user"],
  });

  const { data: documentTypes = [] } = useQuery<DocumentTemplate[]>({
    queryKey: ["/api/templates"],
  });

  const requestDocumentMutation = useMutation({
    mutationFn: async (requestData: typeof documentRequest) => {
      const response = await apiRequest("POST", "/api/documents/request-document", requestData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document Request Submitted",
        description: "Your document request has been submitted for processing",
      });
      setDocumentRequest({
        documentType: "",
        studentName: "",
        registrationNumber: "",
        email: "",
        level: "",
      });
      setIsRequestOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/user"] });
      // Redirect to course unit page after successful submission
      setLocation("/dashboard/course-unit");
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
    
    if (!documentRequest.documentType || !documentRequest.studentName || 
        !documentRequest.registrationNumber || !documentRequest.email || 
        !documentRequest.level) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // Generate title from document type
    const selectedTemplate = documentTypes.find(t => t.type === documentRequest.documentType);
    const title = selectedTemplate ? `${selectedTemplate.name} Request` : "Document Request";

    requestDocumentMutation.mutate({
      ...documentRequest,
      title,
      description: "",
    });
  };

  const handleLogout = async () => {
    await logout();
  };

  if (!user) {
    setLocation("/login");
    return null;
  }

  if (user.role !== "student") {
    setLocation("/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <GraduationCap className="text-white text-sm" />
                </div>
                <span className="ml-3 text-lg font-semibold text-gray-900">University Portal</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600" data-testid="text-username">{user.fullName}</span>
              <Badge variant="secondary">Student</Badge>
              <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="button-logout">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Dashboard Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900" data-testid="text-total-documents">
                    {stats?.totalDocuments || 0}
                  </p>
                  <p className="text-sm text-gray-600">Total Requests</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Clock className="text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900" data-testid="text-pending-documents">
                    {stats?.pendingDocuments || 0}
                  </p>
                  <p className="text-sm text-gray-600">Pending</p>
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
                  <p className="text-2xl font-bold text-gray-900" data-testid="text-approved-documents">
                    {stats?.approvedDocuments || 0}
                  </p>
                  <p className="text-sm text-gray-600">Approved</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-red-100 rounded-lg">
                  <XCircle className="text-red-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900" data-testid="text-rejected-documents">
                    {stats?.rejectedDocuments || 0}
                  </p>
                  <p className="text-sm text-gray-600">Rejected</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Document Request Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <Card>
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
                          value={documentRequest.documentType} 
                          onValueChange={(value) => setDocumentRequest({ ...documentRequest, documentType: value })}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select document type" />
                          </SelectTrigger>
                          <SelectContent>
                            {documentTypes.map((docType) => (
                              <SelectItem key={docType.id} value={docType.type}>
                                {docType.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="studentName">Student Name</Label>
                        <Input
                          id="studentName"
                          data-testid="input-student-name"
                          type="text"
                          required
                          className="mt-1"
                          placeholder="Enter your full name"
                          value={documentRequest.studentName}
                          onChange={(e) => setDocumentRequest({ ...documentRequest, studentName: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="registrationNumber">Registration Number</Label>
                        <Input
                          id="registrationNumber"
                          data-testid="input-registration-number"
                          type="text"
                          required
                          className="mt-1"
                          placeholder="Enter your registration number"
                          value={documentRequest.registrationNumber}
                          onChange={(e) => setDocumentRequest({ ...documentRequest, registrationNumber: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          data-testid="input-email"
                          type="email"
                          required
                          className="mt-1"
                          placeholder="Enter your email address"
                          value={documentRequest.email}
                          onChange={(e) => setDocumentRequest({ ...documentRequest, email: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="level">Level</Label>
                        <Select 
                          value={documentRequest.level} 
                          onValueChange={(value) => setDocumentRequest({ ...documentRequest, level: value })}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select level" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1000">1000</SelectItem>
                            <SelectItem value="2000">2000</SelectItem>
                            <SelectItem value="3000">3000</SelectItem>
                            <SelectItem value="4000">4000</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex justify-end space-x-2">
                        <Button type="button" variant="outline" onClick={() => setIsRequestOpen(false)}>
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={requestDocumentMutation.isPending}
                          data-testid="button-submit-document"
                        >
                          {requestDocumentMutation.isPending ? "Submitting..." : "Submit Request"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>My Document Requests</CardTitle>
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
  );
}