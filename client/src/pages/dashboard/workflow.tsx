import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, LogOut, Inbox, CheckSquare, Route, User, Calendar, Fingerprint, FileText, CheckCircle } from "lucide-react";
import ReviewModal from "@/components/review-modal";
import DocumentSearch from "@/components/document-search";
import type { DocumentWithDetails } from "@/types";
import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";

export default function WorkflowDashboard() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedDocument, setSelectedDocument] = useState<DocumentWithDetails | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [filteredDocuments, setFilteredDocuments] = useState<DocumentWithDetails[]>([]);

  const { data: pendingDocuments = [], isLoading } = useQuery<DocumentWithDetails[]>({
    queryKey: ["/api/documents/pending"],
  });

  // Memoize the searchable documents array to prevent infinite re-renders
  const searchableDocuments = useMemo(() => {
    return pendingDocuments.map(doc => ({
      id: doc.id,
      title: doc.title,
      description: doc.description || "",
      type: doc.type || 'unknown', // Provide fallback for undefined/null types
      fileName: doc.fileName,
      filePath: doc.filePath,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      hash: doc.hash,
      status: doc.status || 'pending', // Provide fallback for undefined/null status
      userId: doc.userId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));
  }, [pendingDocuments]);

  // Memoize the search callback to prevent infinite re-renders
  const handleSearchChange = useCallback((filteredDocs: any[]) => {
    const filteredIds = new Set(filteredDocs.map(doc => doc.id));
    setFilteredDocuments(pendingDocuments.filter(doc => filteredIds.has(doc.id)));
  }, [pendingDocuments]);

  const { data: stats } = useQuery<{
    pendingReview: number;
    approvedToday: number;
    inWorkflow: number;
  }>({
    queryKey: ["/api/stats/workflow"],
  });

  const handleLogout = async () => {
    await logout();
  };

  const handleReviewDocument = (document: DocumentWithDetails) => {
    setSelectedDocument(document);
    setShowReviewModal(true);
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

  const workflowRoles = ["academic_staff", "department_head", "dean", "vice_chancellor", "assistant_registrar"];
  if (!workflowRoles.includes(user.role)) {
    setLocation("/login");
    return null;
  }

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      academic_staff: "bg-blue-100 text-blue-700",
      department_head: "bg-green-100 text-green-700",
      dean: "bg-purple-100 text-purple-700",
      vice_chancellor: "bg-red-100 text-red-700",
      assistant_registrar: "bg-orange-100 text-orange-700",
    };
    return colors[role] || "bg-gray-100 text-gray-700";
  };

  const formatRoleName = (role: string) => {
    return role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const getWorkflowProgress = (document: DocumentWithDetails) => {
    if (!document.workflow) return { completed: 0, total: 0, current: "" };
    
    const { workflow } = document;
    const completed = workflow.currentStep;
    const total = workflow.totalSteps;
    const current = workflow.stepRoles[workflow.currentStep] || "";
    
    return { completed, total, current };
  };

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
              <Badge className={getRoleBadgeColor(user.role)}>{formatRoleName(user.role)}</Badge>
              <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="button-logout">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Workflow Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Inbox className="text-orange-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Pending Review</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="stat-pending-review">
                    {stats?.pendingReview || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckSquare className="text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Approved Today</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="stat-approved-today">
                    {stats?.approvedToday || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Route className="text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">In Workflow</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="stat-in-workflow">
                    {stats?.inWorkflow || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Document Review Queue */}
        <Card>
          <CardHeader>
            <CardTitle>Documents Awaiting Review</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading documents...</div>
            ) : pendingDocuments.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No documents pending review</div>
            ) : (
              <>
                {/* Search and Filter */}
                <DocumentSearch
                  documents={searchableDocuments}
                  onSearchChange={handleSearchChange}
                  placeholder="Search pending documents..."
                  showTypeFilter={true}
                />
                
                <div className="mt-6 divide-y divide-gray-200">
                  {(filteredDocuments.length > 0 ? filteredDocuments : pendingDocuments).map((document) => {
                    const progress = getWorkflowProgress(document);
                    
                    return (
                      <div key={document.id} className="p-6" data-testid={`document-${document.id}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-4">
                            <div className="flex-shrink-0">
                              <FileText className="text-2xl text-gray-600" />
                            </div>
                            <div className="flex-1">
                              <h4 className="text-lg font-medium text-gray-900" data-testid="text-document-title">
                                {document.title}
                              </h4>
                              <p className="text-sm text-gray-600 mt-1">{document.description}</p>
                              <div className="flex items-center mt-2 space-x-4">
                                <span className="text-sm text-gray-600 flex items-center">
                                  <User className="w-4 h-4 mr-1" />
                                  <span data-testid="text-student-name">{document.user.fullName}</span>
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
                              
                              {/* Workflow Progress */}
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
              </>
            )}
          </CardContent>
        </Card>
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
    </div>
  );
}
