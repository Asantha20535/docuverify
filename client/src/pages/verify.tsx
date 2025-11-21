import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Fingerprint, QrCode, CheckCircle, XCircle, Info, Phone, ArrowLeft, Upload } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { generateSHA256Hash } from "@/lib/crypto";

interface VerificationResult {
  verified: boolean;
  document?: {
    title: string;
    type: string;
    student: string;
    issueDate: string;
    hash: string;
    finalSignatory?: string;
    status: string;
  };
  message?: string;
}

export default function VerifyPortal() {
  const [hash, setHash] = useState("");
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [fileStatus, setFileStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const { toast } = useToast();

  const verifyMutation = useMutation({
    mutationFn: async (documentHash: string) => {
      const response = await apiRequest("POST", "/api/verify", { hash: documentHash });
      return response.json();
    },
    onSuccess: (result) => {
      setVerificationResult(result);
    },
    onError: (error: any) => {
      toast({
        title: "Verification Error",
        description: error.message || "Failed to verify document",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!hash) {
      toast({
        title: "Error",
        description: "Please enter a document hash",
        variant: "destructive",
      });
      return;
    }

    if (!/^[a-fA-F0-9]{64}$/.test(hash)) {
      toast({
        title: "Invalid Hash",
        description: "Please enter a valid 64-character SHA-256 hash",
        variant: "destructive",
      });
      return;
    }

    verifyMutation.mutate(hash);
  };

  const handleFileVerification = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setFileStatus("pending");
    setFileMessage("Computing hash and verifying...");

    try {
      const hash = await generateSHA256Hash(file);
      const response = await apiRequest("POST", "/api/verify", { hash });
      const result = await response.json();
      setVerificationResult(result);

      if (result.verified) {
        setFileStatus("success");
        setFileMessage("Document Verified");
      } else {
        setFileStatus("error");
        setFileMessage("Document Not Verified");
      }
    } catch (error: any) {
      setFileStatus("error");
      const message = error?.message || "Unable to verify document";
      setFileMessage(message);
      toast({
        title: "Verification failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center">
                <GraduationCap className="text-white text-sm" />
              </div>
              <h1 className="ml-3 text-xl font-semibold text-gray-900">Document Verification Portal</h1>
            </div>
            <Link href="/login" className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Login
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Verify Document Authenticity</h2>
          <p className="text-lg text-gray-600">Enter a document hash or upload the original file to verify its authenticity</p>
        </div>

        {/* Verification Methods */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Hash Input Method */}
          <Card>
            <CardContent className="p-8">
              <div className="text-center mb-6">
                <div className="mx-auto h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <Fingerprint className="text-blue-600 text-xl" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Hash Verification</h3>
                <p className="text-sm text-gray-600 mt-2">Enter the SHA-256 hash of your document</p>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="document-hash">Document Hash</Label>
                  <Input
                    id="document-hash"
                    data-testid="input-hash"
                    type="text"
                    required
                    className="mt-2 font-mono"
                    placeholder="Enter SHA-256 hash (64 characters)"
                    value={hash}
                    onChange={(e) => setHash(e.target.value)}
                    maxLength={64}
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={verifyMutation.isPending}
                  data-testid="button-verify"
                >
                  {verifyMutation.isPending ? "Verifying..." : "Verify Document"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Upload Verification */}
          <Card>
            <CardContent className="p-8">
              <div className="text-center mb-6">
                <div className="mx-auto h-12 w-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <QrCode className="text-green-600 text-xl" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Upload Verification</h3>
                <p className="text-sm text-gray-600 mt-2">Upload the original document to verify automatically</p>
              </div>

              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <div className="w-16 h-16 mx-auto bg-gray-100 rounded-lg flex items-center justify-center mb-4">
                    <Upload className="text-gray-600 text-xl" />
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Select the original PDF or image you received from the University. We will hash it locally and compare it with our records.
                  </p>
                  <div className="flex justify-center">
                    <label className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md cursor-pointer hover:bg-green-700 transition">
                      Choose File
                      <Input
                        type="file"
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                        onChange={handleFileVerification}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {selectedFileName && (
                    <p className="text-xs text-gray-500 mt-4">Selected: {selectedFileName}</p>
                  )}
                  {fileStatus === "pending" && (
                    <p className="text-xs text-blue-600 mt-2">Computing hash and verifying...</p>
                  )}
                  {fileStatus === "success" && (
                    <p className="text-sm text-green-600 mt-2 font-medium">{fileMessage}</p>
                  )}
                  {fileStatus === "error" && (
                    <p className="text-sm text-red-600 mt-2 font-medium">{fileMessage}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Verification Results */}
        {verificationResult && (
          <div className="space-y-6">
            {verificationResult.verified && verificationResult.document ? (
              <Card className="border-green-200">
                <CardContent className="p-8">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                        <CheckCircle className="text-green-600 text-xl" />
                      </div>
                    </div>
                    <div className="ml-6 flex-1">
                      <h3 className="text-xl font-semibold text-gray-900 mb-4" data-testid="text-verified">
                        Document Verified ✓
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Document Information</h4>
                          <div className="space-y-2 text-sm">
                            <p>
                              <span className="text-gray-600">Title:</span>{" "}
                              <span className="font-medium" data-testid="text-document-title">
                                {verificationResult.document.title}
                              </span>
                            </p>
                            <p>
                              <span className="text-gray-600">Type:</span>{" "}
                              <span className="font-medium">{verificationResult.document.type}</span>
                            </p>
                            <p>
                              <span className="text-gray-600">Student:</span>{" "}
                              <span className="font-medium" data-testid="text-student-name">
                                {verificationResult.document.student}
                              </span>
                            </p>
                            <p>
                              <span className="text-gray-600">Issue Date:</span>{" "}
                              <span className="font-medium">
                                {new Date(verificationResult.document.issueDate).toLocaleDateString()}
                              </span>
                            </p>
                          </div>
                        </div>
                        
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Verification Details</h4>
                          <div className="space-y-2 text-sm">
                            <p>
                              <span className="text-gray-600">Status:</span>{" "}
                              <Badge variant="default" className="bg-green-100 text-green-800">
                                Officially Verified
                              </Badge>
                            </p>
                            {verificationResult.document.finalSignatory && (
                              <p>
                                <span className="text-gray-600">Digital Signature:</span>{" "}
                                <span className="font-medium">{verificationResult.document.finalSignatory}</span>
                              </p>
                            )}
                            <p>
                              <span className="text-gray-600">Hash:</span>{" "}
                              <span className="font-mono text-xs">{verificationResult.document.hash}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-6 pt-6 border-t border-gray-200">
                        <p className="text-sm text-gray-600 flex items-start">
                          <Info className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                          This document has been digitally signed and verified by the University. The hash confirms the document's integrity and authenticity.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-red-200">
                <CardContent className="p-8">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                        <XCircle className="text-red-600 text-xl" />
                      </div>
                    </div>
                    <div className="ml-6 flex-1">
                      <h3 className="text-xl font-semibold text-gray-900 mb-4" data-testid="text-not-verified">
                        Document Not Verified ✗
                      </h3>
                      <p className="text-gray-600 mb-6">
                        The provided hash does not match any verified document in our system. This could mean:
                      </p>
                      <ul className="list-disc list-inside space-y-2 text-sm text-gray-600 mb-6">
                        <li>The document was not issued by this institution</li>
                        <li>The document has been modified since issuance</li>
                        <li>The hash was entered incorrectly</li>
                        <li>The document is still pending verification</li>
                      </ul>
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <div className="flex">
                          <XCircle className="text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
                          <div>
                            <h4 className="text-sm font-medium text-yellow-800">Verification Failed</h4>
                            <p className="text-sm text-yellow-700 mt-1">
                              If you believe this is an error, please contact the issuing department directly for assistance.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Help Section */}
        <Card className="bg-blue-50 mt-12">
          <CardContent className="p-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Need Help?</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Finding Your Document Hash</h4>
                <p className="text-gray-600 mb-2">The SHA-256 hash is typically provided:</p>
                <ul className="list-disc list-inside text-gray-600 space-y-1">
                  <li>On the official document footer</li>
                  <li>In your student portal download</li>
                  <li>Via email confirmation</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Upload Tips</h4>
                <p className="text-gray-600 mb-2">For best results:</p>
                <ul className="list-disc list-inside text-gray-600 space-y-1">
                  <li>Use the original PDF when possible</li>
                  <li>Avoid scanning photos of prints</li>
                  <li>Ensure the file hasn’t been modified</li>
                </ul>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-blue-200">
              <p className="text-sm text-gray-600 flex items-center">
                <Phone className="w-4 h-4 mr-2" />
                For technical support, contact Group D </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
