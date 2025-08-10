import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Download, Eye, Trash2 } from "lucide-react";
import type { Document } from "@/types";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface DocumentTableProps {
  documents: Document[];
  isLoading: boolean;
  onlyApprovedActions?: boolean;
  showDeleteButton?: boolean;
}

export default function DocumentTable({ 
  documents, 
  isLoading, 
  onlyApprovedActions = false,
  showDeleteButton = false 
}: DocumentTableProps) {
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Delete failed");
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document Deleted",
        description: "Document has been deleted successfully",
      });
      
      // Refresh documents list
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/user"] });
      setDeleteDoc(null);
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete document",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (document: Document) => {
    setDeleteDoc(document);
  };

  const confirmDelete = () => {
    if (deleteDoc) {
      deleteMutation.mutate(deleteDoc.id);
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading documents...</div>;
  }

  if (documents.length === 0) {
    return <div className="text-center py-8 text-gray-500">No documents found</div>;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-100 text-green-800";
      case "pending":
      case "in_review":
        return "bg-yellow-100 text-yellow-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatStatus = (status: string) => {
    switch (status) {
      case "in_review":
        return "In Review";
      case "approved":
        return "Approved";
      case "pending":
        return "Pending";
      case "rejected":
        return "Rejected";
      default:
        return status;
    }
  };

  const formatDocumentType = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <>
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Document</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((document) => (
            <TableRow key={document.id} className="hover:bg-gray-50" data-testid={`document-row-${document.id}`}>
              <TableCell>
                <div className="flex items-center">
                  <FileText className="h-4 w-4 text-red-500 mr-3" />
                  <div>
                    <div className="text-sm font-medium text-gray-900" data-testid="text-document-title">
                      {document.title}
                    </div>
                    <div className="text-sm text-gray-500 font-mono" data-testid="text-document-hash">
                      SHA-256: {document.hash.substring(0, 12)}...
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-sm text-gray-900">
                {formatDocumentType(document.type)}
              </TableCell>
              <TableCell>
                <Badge className={getStatusColor(document.status)} data-testid="badge-status">
                  {formatStatus(document.status)}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-gray-500">
                {new Date(document.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                {(!onlyApprovedActions || document.status === "approved") ? (
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewDoc(document)}
                      data-testid="button-view"
                      title="View"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <a
                      href={`/api/documents/${document.id}/content?download=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Download"
                    >
                      <Button variant="ghost" size="sm" data-testid="button-download" title="Download">
                        <Download className="h-4 w-4" />
                      </Button>
                    </a>
                    {showDeleteButton && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(document)}
                        data-testid="button-delete"
                        title="Delete"
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-gray-400">Awaiting approval</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>

    {/* Preview dialog */}
    <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
      <DialogContent className="max-w-5xl w-full">
        <DialogHeader>
          <DialogTitle>{previewDoc?.title || "Document Preview"}</DialogTitle>
        </DialogHeader>
        {previewDoc && (
          (() => {
            const viewerSrc = `/api/documents/${previewDoc.id}/content`;
            return (
              <iframe
                title="Document Preview"
                src={viewerSrc}
                className="w-full h-[80vh] border rounded"
              />
            );
          })()
        )}
      </DialogContent>
    </Dialog>

    {/* Delete confirmation dialog */}
    <Dialog open={!!deleteDoc} onOpenChange={() => setDeleteDoc(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you absolutely sure?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete your document.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteDoc(null)}>Cancel</Button>
          <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
