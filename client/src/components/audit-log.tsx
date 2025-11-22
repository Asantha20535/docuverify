import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, User, FileText, CheckCircle, XCircle, ArrowRight, Upload } from "lucide-react";
import { format } from "date-fns";

interface AuditLogEntry {
  id: string;
  type: "workflow_action" | "verification" | "document_created";
  timestamp: string;
  action?: string;
  comment?: string;
  step?: number;
  user?: {
    id: string;
    fullName: string;
    role: string;
    username: string;
  };
  document?: {
    id: string;
    title: string;
    type: string;
    hash: string;
  };
  documentHash?: string;
  ipAddress?: string;
  userAgent?: string;
  isVerified?: boolean;
  title?: string;
  documentType?: string;
  status?: string;
}

export default function AuditLog() {
  const { data: logs = [], isLoading } = useQuery<AuditLogEntry[]>({
    queryKey: ["/api/admin/audit-logs"],
  });

  const getActionBadge = (type: string, action?: string, isVerified?: boolean) => {
    if (type === "verification") {
      return isVerified ? (
        <Badge variant="default" className="bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Verified
        </Badge>
      ) : (
        <Badge variant="destructive">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      );
    }

    if (type === "document_created") {
      return (
        <Badge variant="outline" className="bg-blue-100 text-blue-800">
          <Upload className="w-3 h-3 mr-1" />
          Created
        </Badge>
      );
    }

    const actionColors: Record<string, string> = {
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
      forwarded: "bg-blue-100 text-blue-800",
      signed: "bg-purple-100 text-purple-800",
      uploaded: "bg-gray-100 text-gray-800",
      reviewed: "bg-yellow-100 text-yellow-800",
      completed: "bg-indigo-100 text-indigo-800",
    };

    return (
      <Badge variant="outline" className={actionColors[action || ""] || "bg-gray-100 text-gray-800"}>
        {action || "Unknown"}
      </Badge>
    );
  };

  const formatLogDescription = (log: AuditLogEntry) => {
    if (log.type === "verification") {
      return (
        <>
          Document hash <code className="text-xs bg-gray-100 px-1 rounded">{log.documentHash?.substring(0, 16)}...</code> was{" "}
          {log.isVerified ? "verified" : "verification failed"}
          {log.ipAddress && (
            <>
              {" "}from IP <span className="font-mono text-xs">{log.ipAddress}</span>
            </>
          )}
        </>
      );
    }

    if (log.type === "document_created") {
      return (
        <>
          Document <strong>{log.title}</strong> ({log.documentType?.replace("_", " ")}) was created
          {log.status && ` with status: ${log.status}`}
        </>
      );
    }

    if (log.type === "workflow_action") {
      const parts = [];
      if (log.document) {
        parts.push(`Document "${log.document.title}"`);
      }
      if (log.action) {
        parts.push(`was ${log.action}`);
      }
      if (log.step !== undefined) {
        parts.push(`at step ${log.step + 1}`);
      }
      return <>{parts.join(" ")}</>;
    }

    return "Unknown action";
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Audit Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading audit logs...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (logs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Audit Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            No audit logs found
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Log</CardTitle>
        <p className="text-sm text-gray-600 mt-1">
          Showing {logs.length} most recent activities
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {logs.map((log) => (
            <div
              key={log.id}
              className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-3 flex-1">
                  <div className="flex-shrink-0">
                    {log.type === "verification" ? (
                      <CheckCircle className="w-5 h-5 text-gray-400" />
                    ) : log.type === "document_created" ? (
                      <FileText className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ArrowRight className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      {getActionBadge(log.type, log.action, log.isVerified)}
                      <span className="text-xs text-gray-500">
                        {log.type.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">
                      {formatLogDescription(log)}
                    </p>
                    {log.comment && (
                      <p className="text-xs text-gray-600 mt-1 italic">
                        "{log.comment}"
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right ml-4">
                  <div className="flex items-center text-xs text-gray-500 mb-1">
                    <Clock className="w-3 h-3 mr-1" />
                    {format(new Date(log.timestamp), "MMM d, yyyy HH:mm:ss")}
                  </div>
                  {log.user && (
                    <div className="flex items-center text-xs text-gray-600">
                      <User className="w-3 h-3 mr-1" />
                      {log.user.fullName} ({log.user.role})
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

