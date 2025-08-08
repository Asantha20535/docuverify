import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Download, Eye } from "lucide-react";
import type { Document } from "@/types";

interface DocumentTableProps {
  documents: Document[];
  isLoading: boolean;
}

export default function DocumentTable({ documents, isLoading }: DocumentTableProps) {
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
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" data-testid="button-view">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" data-testid="button-download">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
